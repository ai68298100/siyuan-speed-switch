const test = require("node:test");
const assert = require("node:assert/strict");
const example = require("../docs/widget-example/siyuan-checkin-home-modules.js");

const READY_AFTER = [0, 1, 2, 3, 4];
const HANDLE_SHAPES = ["function", "object", "partial", "noop", "throw"];
const VISIBILITY = ["full", "missing", "unavailable", "late"];
const LIFECYCLE = ["keep", "stop"];
const SCENARIO_COUNT = READY_AFTER.length * HANDLE_SHAPES.length * VISIBILITY.length * LIFECYCLE.length;

function createClock() {
    const timers = [];
    return {
        setTimeout(callback, delay) {
            const timer = {callback, delay, cancelled: false};
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cancelled = true;
        },
        drain() {
            while (timers.some((timer) => !timer.cancelled)) {
                const timer = timers.find((candidate) => !candidate.cancelled);
                timer.cancelled = true;
                timer.callback();
            }
        },
        pending() {
            return timers.filter((timer) => !timer.cancelled).length;
        },
        delays() {
            return timers.map((timer) => timer.delay);
        },
    };
}

function makeScenario(readyAfter, handleShape, visibility, lifecycle) {
    const clock = createClock();
    const registered = new Set();
    const removed = [];
    let pluginProbes = 1;
    let registrationAttempts = 0;
    let readyNotifications = 0;
    let giveUps = 0;
    const moduleIds = ["checkin-today", "checkin-streak", "checkin-year-heatmap", "checkin-weekly", "checkin-occasions", "checkin-monthly"];
    const switcher = {
        registerHomeModule(definition) {
            registrationAttempts += 1;
            if (handleShape === "throw") throw new Error("registration unavailable");
            if (handleShape !== "noop" && handleShape !== "throw" && handleShape !== "partial" || handleShape === "partial" && definition.moduleId !== "checkin-monthly") {
                moduleIds.includes(definition.moduleId) && registered.add(definition.moduleId);
            }
            const remove = () => {
                removed.push(definition.moduleId);
                registered.delete(definition.moduleId);
            };
            if (handleShape === "function" || handleShape === "partial") return remove;
            if (handleShape === "object") return {unregister: remove};
            return () => undefined;
        },
        getHomeModules() {
            if (visibility === "unavailable") return undefined;
            if (visibility === "missing") return [...registered].filter((moduleId) => moduleId !== "checkin-monthly").map((moduleId) => ({moduleId}));
            if (visibility === "late" && registrationAttempts < 2) return [];
            if (visibility === "late" && handleShape === "noop") return [];
            return [...registered].map((moduleId) => ({moduleId}));
        },
    };
    const app = {plugins: readyAfter === 0 ? [switcher] : []};
    const schedule = (callback, delay) => clock.setTimeout(() => {
        pluginProbes += 1;
        if (pluginProbes > readyAfter) app.plugins = [switcher];
        callback();
    }, delay);
    const stop = example.whenSwitcherReady(app, (found) => {
        const handles = [];
        try {
            for (const moduleId of moduleIds) {
                const handle = found.registerHomeModule({moduleId});
                handles.push(example.normalizeUnregisterHandle(handle));
            }
            if (typeof found.getHomeModules === "function") {
                const listed = found.getHomeModules("desktop");
                if (Array.isArray(listed) && !moduleIds.every((moduleId) => listed.some((item) => item.moduleId === moduleId))) {
                    handles.forEach((handle) => handle());
                    return null;
                }
            }
        } catch (_error) {
            handles.forEach((handle) => handle());
            return null;
        }
        readyNotifications += 1;
        return () => handles.forEach((handle) => handle());
    }, {
        retryDelays: [1, 2, 3, 4, 5],
        setTimeout: schedule,
        clearTimeout: clock.clearTimeout,
        onGiveUp: () => { giveUps += 1; },
    });
    if (lifecycle === "stop") {
        clock.drain();
        stop();
    } else {
        clock.drain();
    }
    return {clock, registered, removed, pluginProbes, registrationAttempts, readyNotifications, giveUps, stop, lifecycle, readyAfter, handleShape, visibility};
}

test("provider lifecycle matrix covers at least 200 registration-order combinations", () => {
    assert.equal(SCENARIO_COUNT, 200);
});

for (const readyAfter of READY_AFTER) {
    for (const handleShape of HANDLE_SHAPES) {
        for (const visibility of VISIBILITY) {
            for (const lifecycle of LIFECYCLE) {
                test(`provider lifecycle matrix: ready-${readyAfter}/${handleShape}/${visibility}/${lifecycle}`, () => {
                    const scenario = makeScenario(readyAfter, handleShape, visibility, lifecycle);
                    const accepted = ["function", "object"].includes(handleShape);
                    const visibleWithoutVerification = visibility === "unavailable";
                    const lateCanRecover = visibility === "late";
                    const shouldRegister = visibleWithoutVerification
                        ? handleShape !== "throw"
                        : accepted && (visibility === "full" || lateCanRecover);
                    const registeredCount = handleShape === "partial" ? moduleIdsForTest().length - 1 : handleShape === "noop" || handleShape === "throw" ? 0 : moduleIdsForTest().length;
                    assert.equal(scenario.readyNotifications, shouldRegister ? 1 : 0, "only fully verified providers may publish ready");
                    assert.equal(scenario.clock.pending(), 0, "successful or exhausted registration must leave no timer");
                    assert.ok(scenario.pluginProbes <= example.CHECKIN_SWITCHER_MAX_TRIES);
                    if (shouldRegister) {
                        assert.equal(scenario.giveUps, 0);
                        if (scenario.lifecycle === "stop") assert.equal(scenario.registered.size, 0, "unload must unregister every accepted handle shape");
                        else assert.equal(scenario.registered.size, registeredCount);
                    } else {
                        assert.equal(scenario.giveUps, 1);
                        assert.equal(scenario.registered.size, 0, "failed or partial registration must be cleaned up");
                    }
                });
            }
        }
    }
}

function moduleIdsForTest() {
    return ["checkin-today", "checkin-streak", "checkin-year-heatmap", "checkin-weekly", "checkin-occasions", "checkin-monthly"];
}

test("provider lifecycle: retry delays are bounded and ordered", () => {
    assert.deepEqual(example.CHECKIN_SWITCHER_RETRY_DELAYS, [250, 750, 1500, 3000, 6000]);
    assert.equal(example.CHECKIN_SWITCHER_MAX_TRIES, 6);
});

test("provider lifecycle: an absent registration handle is a safe no-op", () => {
    const stop = example.normalizeUnregisterHandle(undefined);
    assert.doesNotThrow(() => stop());
    assert.doesNotThrow(() => stop());
});

test("provider lifecycle: stop cancels an outstanding retry without invoking the provider", () => {
    const clock = createClock();
    let calls = 0;
    const stop = example.whenSwitcherReady({plugins: []}, () => { calls += 1; return () => undefined; }, {
        retryDelays: [1, 2, 3],
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
    });
    stop();
    clock.drain();
    assert.equal(calls, 0);
    assert.equal(clock.pending(), 0);
});
