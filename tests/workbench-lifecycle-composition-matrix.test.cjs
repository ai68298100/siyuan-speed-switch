// T-7081：把 home runtime、面板控制器和关联内容 SWR 的生命周期放进同一组
// 可控事务场景，验证 provider 替换/注销/销毁不会让旧读取提交到新面板。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {createHomeRuntime} = require("../src/home-runtime.js");
const {createHomeModuleController} = require("../src/home-controller.js");
const {
    normalizeRelatedSwrStore,
    beginRelatedContentRequest,
    finishRelatedContentRequest,
    RELATED_SWR_MAX_AGE_MS,
} = require("../src/related-content-model.js");

const DEVICES = ["desktop", "mobile"];
const LIFECYCLES = ["steady", "replace", "unregister", "dispose"];
const READ_MODES = ["fresh", "error", "cached", "late"];
const SWR_MODES = ["empty", "cached", "newer", "stale"];
const PANEL_MODES = ["single", "rebuild"];

function rootId(seed) {
    return `20261003000000-${String(seed).padStart(7, "0")}`;
}

function snapshot(title) {
    return {title, items: [{label: title, value: title}], updatedAt: 1};
}

function relatedEntry(root, title, at) {
    return {
        rootId: root,
        at,
        projection: {
            items: [{id: rootId(9000000), source: "backlink", title, hPath: `/项目/${title}`}],
            counts: {backlinks: 1, mentions: 0, shown: 1},
            truncated: false,
        },
    };
}

function waitFor(predicate) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            if (predicate()) return resolve();
            attempts += 1;
            if (attempts > 20) return reject(new Error("timed out waiting for provider read"));
            setImmediate(check);
        };
        check();
    });
}

function createSurface() {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    return {dom, container: dom.window.document.querySelector("#mount")};
}

function makeRelatedScenario(mode, seed) {
    const now = 1_800_000_000_000;
    const root = rootId(seed);
    const requestMap = new Map();
    const first = beginRelatedContentRequest(requestMap, root);
    const second = mode === "newer" ? beginRelatedContentRequest(requestMap, root) : first;
    if (mode === "newer") {
        assert.equal(finishRelatedContentRequest(requestMap, root, first), false);
        assert.equal(finishRelatedContentRequest(requestMap, root, second), true);
    } else {
        assert.equal(finishRelatedContentRequest(requestMap, root, first), true);
    }
    const entries = mode === "empty"
        ? []
        : mode === "cached"
            ? [relatedEntry(root, "缓存内容", now - 1000)]
            : mode === "newer"
                ? [relatedEntry(root, "旧内容", now - 5000), relatedEntry(root, "新内容", now - 1000)]
                : [relatedEntry(root, "过期内容", now - RELATED_SWR_MAX_AGE_MS - 1)];
    return normalizeRelatedSwrStore({version: 1, entries}, {nowMs: now});
}

let matrixIndex = 0;
for (const device of DEVICES) {
    for (const lifecycle of LIFECYCLES) {
        for (const readMode of READ_MODES) {
            for (const swrMode of SWR_MODES) {
                for (const panelMode of PANEL_MODES) {
                const caseId = ++matrixIndex;
                test(`workbench lifecycle matrix ${caseId}: ${device}/${lifecycle}/${readMode}/${swrMode}/${panelMode}`, async () => {
                    const {dom, container} = createSurface();
                    const runtime = createHomeRuntime();
                    const moduleId = `lifecycle-${caseId}`;
                    let phase = "old";
                    let reads = 0;
                    let releaseOld = null;
                    const oldRead = () => {
                        reads += 1;
                        if (readMode === "late" && phase === "old") {
                            return new Promise((resolve) => {
                                releaseOld = () => resolve(snapshot("old"));
                            });
                        }
                        if (readMode === "error" && phase === "old") throw new Error("provider failure");
                        return snapshot(`${phase}-${readMode}`);
                    };
                    const register = (read) => runtime.registerAdapter({
                        moduleId,
                        title: moduleId,
                        supportedDevices: [device],
                        read,
                    });
                    register(oldRead);
                    const module = runtime.listModules(device).find((item) => item.moduleId === moduleId);
                    let controller = createHomeModuleController({
                        document: dom.window.document,
                        container,
                        module,
                        read: (config, options) => runtime.read(moduleId, device, config, options),
                    });
                    controller.mount();
                    const firstPending = controller.refresh();
                    if (readMode === "late") await waitFor(() => typeof releaseOld === "function");

                    let firstResult;
                    if (lifecycle === "replace") {
                        phase = "new";
                        register(() => {
                            reads += 1;
                            return snapshot("new-provider");
                        });
                        if (releaseOld) releaseOld();
                        firstResult = await firstPending;
                        if (readMode === "late") {
                            assert.equal(firstResult.reason, "stale", "replacement must close the old runtime generation");
                        } else if (readMode === "error") {
                            assert.equal(firstResult.reason, "failed");
                        }
                        const replacement = await controller.refresh();
                        assert.equal(replacement.ok, true);
                        assert.match(container.textContent, /new-provider/);
                    } else if (lifecycle === "unregister") {
                        if (readMode !== "late") firstResult = await firstPending;
                        runtime.unregister(moduleId);
                        if (releaseOld) releaseOld();
                        if (!firstResult) firstResult = await firstPending;
                        if (readMode === "late") assert.equal(firstResult.reason, "stale");
                        assert.equal(runtime.listModules(device).some((item) => item.moduleId === moduleId), false);
                    } else if (lifecycle === "dispose") {
                        runtime.dispose();
                        controller.dispose();
                        if (releaseOld) releaseOld();
                        firstResult = await firstPending;
                        assert.equal(container.childElementCount, 0);
                        assert.equal(runtime.listModules(device).some((item) => item.moduleId === moduleId), false);
                    } else {
                        if (releaseOld) releaseOld();
                        firstResult = await firstPending;
                        if (readMode === "error") {
                            assert.equal(firstResult.ok, false);
                            const backoff = await controller.refresh();
                            assert.equal(backoff.reason, "backoff", "failure must enter bounded retry backoff");
                            const forced = await controller.refresh({}, {force: true});
                            assert.notEqual(forced.reason, "backoff", "force refresh must bypass backoff");
                        } else if (readMode === "cached") {
                            const cached = await controller.refresh();
                            assert.equal(cached.ok, true);
                            assert.equal(reads, 1, "a successful provider read must be reused by the controller");
                        }
                    }

                    const related = makeRelatedScenario(swrMode, 100000 + caseId);
                    if (swrMode === "empty" || swrMode === "stale") {
                        assert.equal(related.entries.length, 0);
                    } else {
                        assert.equal(related.entries.length, 1);
                        assert.equal(related.entries[0].projection.items[0].title, swrMode === "newer" ? "新内容" : "缓存内容");
                    }
                    if (panelMode === "rebuild" && lifecycle !== "dispose" && lifecycle !== "unregister") {
                        controller.dispose();
                        controller = createHomeModuleController({
                            document: dom.window.document,
                            container,
                            module,
                            read: (config, options) => runtime.read(moduleId, device, config, options),
                        });
                        await controller.refresh();
                        assert.equal(container.childElementCount > 0, true, "a rebuilt panel must own a fresh DOM node");
                    }
                    controller.dispose();
                    runtime.dispose();
                    dom.window.close();
                });
            }
        }
}
    }
}

test("workbench lifecycle matrix generated the required 256 composition scenarios", () => {
    assert.equal(matrixIndex, 256);
});

test("panel rebuild retains runtime cache while old DOM ownership is disposed", async () => {
    const {dom, container} = createSurface();
    const runtime = createHomeRuntime();
    let reads = 0;
    const moduleId = "rebuild-cache";
    runtime.registerAdapter({moduleId, title: "Rebuild", supportedDevices: ["desktop"], read: () => snapshot(`value-${++reads}`)});
    const module = runtime.listModules("desktop").find((item) => item.moduleId === moduleId);
    const makeController = () => createHomeModuleController({
        document: dom.window.document,
        container,
        module,
        read: (config, options) => runtime.read(moduleId, "desktop", config, options),
    });
    const first = makeController();
    await first.refresh();
    assert.match(container.textContent, /value-1/);
    first.dispose();
    const second = makeController();
    await second.refresh();
    assert.match(container.textContent, /value-1/);
    assert.equal(reads, 1, "rebuilding the panel must reuse the runtime snapshot cache");
    await second.refresh({}, {force: true});
    assert.match(container.textContent, /value-2/);
    second.dispose();
    runtime.dispose();
    dom.window.close();
});

test("disposing one runtime does not clear another runtime cache", async () => {
    const firstRuntime = createHomeRuntime();
    const secondRuntime = createHomeRuntime();
    let secondReads = 0;
    const firstId = "dispose-scope-first";
    const secondId = "dispose-scope-second";
    firstRuntime.registerAdapter({moduleId: firstId, title: "First", supportedDevices: ["desktop"], read: () => snapshot("first")});
    secondRuntime.registerAdapter({moduleId: secondId, title: "Second", supportedDevices: ["desktop"], read: () => snapshot(`second-${++secondReads}`)});
    await firstRuntime.read(firstId, "desktop", {}, {cacheTtlMs: 1000});
    await secondRuntime.read(secondId, "desktop", {}, {cacheTtlMs: 1000});
    firstRuntime.dispose();
    const retained = await secondRuntime.read(secondId, "desktop", {}, {cacheTtlMs: 1000});
    assert.equal(retained.cached, true);
    assert.equal(secondReads, 1);
    secondRuntime.dispose();
});
