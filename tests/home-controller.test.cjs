const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures, summarizeHomeRefreshFailures, selectHomeRefreshRetryEntries} = require("../src/home-controller.js");

test("home controller mounts loading state, refreshes content, and disposes cleanly", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let reads = 0;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "tasks", title: "Tasks"},
        read: async () => ({ok: true, snapshot: {items: [{label: `item-${++reads}`} ]}}),
    });
    assert.ok(controller);
    controller.mount();
    assert.equal(container.querySelector("[data-status='loading']") !== null, true);
    const result = await controller.refresh();
    assert.equal(result.ok, true);
    assert.equal(container.querySelector(".sw__home-module-item-action").textContent, "item-1");
    controller.dispose();
    assert.equal(container.childElementCount, 0);
    assert.equal((await controller.refresh()).reason, "disposed");
});

test("home controller falls back to a stale snapshot instead of an error page", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let failNext = false;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "digest", title: "Digest"},
        read: async () => {
            if (failNext) return {ok: false, reason: "timeout", snapshot: {items: [{label: "stale-item"}]}};
            return {ok: true, snapshot: {items: [{label: "fresh-item"}]}};
        },
    });
    await controller.refresh();
    assert.equal(container.querySelector(".sw__home-module-item-action").textContent, "fresh-item");
    failNext = true;
    const result = await controller.refresh();
    assert.equal(result.ok, true);
    assert.equal(result.reason, "timeout");
    // 失败但有过期好数据：展示旧数据 + 缓存标记，而非错误页
    assert.equal(container.querySelector("[data-status='error']") === null, true);
    assert.equal(container.querySelector(".sw__home-module-item-action").textContent, "stale-item");
    assert.equal(container.textContent.includes("缓存"), true);
    controller.dispose();
});
test("home controller keeps ready content during a refresh", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let resolveRefresh;
    let reads = 0;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "stable", title: "Stable"},
        read: () => {
            reads += 1;
            if (reads === 1) return Promise.resolve({ok: true, snapshot: {items: [{label: "old"}]}});
            return new Promise((resolve) => { resolveRefresh = resolve; });
        },
    });
    await controller.refresh();
    const original = container.firstElementChild;
    const pending = controller.refresh();
    assert.equal(container.firstElementChild, original);
    assert.equal(container.querySelector(".sw__home-module-item-action").textContent, "old");
    assert.equal(container.firstElementChild.getAttribute("aria-busy"), "true");
    assert.equal(container.querySelector(".sw__home-module-refreshing").textContent, "更新中…");
    resolveRefresh({ok: true, snapshot: {items: [{label: "new"}]}});
    await pending;
    assert.equal(container.querySelector(".sw__home-module-item-action").textContent, "new");
    assert.equal(container.querySelector(".sw__home-module-refreshing"), null);
    controller.dispose();
});

test("home clock refresh patches values in place and preserves focus and listeners", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let reads = 0;
    let resolveRefresh;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "external-world-clock", title: "World clock"},
        read: () => {
            reads += 1;
            if (reads === 1) return Promise.resolve({ok: true, snapshot: {
                stat: {value: "09:00", label: "World clock"},
                items: [{label: "Shanghai", value: "09:00 CST"}, {label: "UTC", value: "01:00 UTC"}],
            }});
            return new Promise((resolve) => { resolveRefresh = resolve; });
        },
    });
    await controller.refresh();
    const root = container.firstElementChild;
    const row = container.querySelector("[data-sw-row='0']");
    const button = row.querySelector(".sw__home-module-item-action");
    const value = row.querySelector("[data-sw-row-value]");
    let clicks = 0;
    button.addEventListener("click", () => { clicks += 1; });
    button.focus();

    const pending = controller.refresh();
    resolveRefresh({ok: true, snapshot: {
        stat: {value: "09:01", label: "World clock"},
        items: [{label: "Shanghai", value: "09:01 CST"}, {label: "UTC", value: "01:01 UTC"}],
    }});
    await pending;

    assert.equal(container.firstElementChild, root, "clock heartbeat should retain the module node");
    assert.equal(container.querySelector("[data-sw-row='0']"), row, "clock heartbeat should retain the row node");
    assert.equal(row.querySelector(".sw__home-module-item-action"), button, "clock heartbeat should retain the action node");
    assert.equal(value.textContent, "09:01 CST", "clock heartbeat should update the visible value node");
    assert.equal(container.querySelector(".sw__home-stat-value").textContent, "09:01");
    assert.equal(dom.window.document.activeElement, button, "focus should remain on the retained row");
    button.click();
    assert.equal(clicks, 1, "listeners attached to a clock row should survive the patch");
    controller.dispose();
});

test("local clock stat-only refresh patches without requiring rows", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let reads = 0;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "external-local-time", title: "Local time"},
        read: async () => ({ok: true, snapshot: {
            stat: {value: reads++ === 0 ? "09:00:00" : "09:00:01", label: "Local"},
            items: [],
        }}),
    });
    await controller.refresh();
    const root = container.firstElementChild;
    await controller.refresh();
    assert.equal(container.firstElementChild, root, "stat-only local clock updates should retain the module node");
    assert.equal(container.querySelector(".sw__home-stat-value").textContent, "09:00:01");
    controller.dispose();
});

test("home clock refresh rebuilds when labels or row count change", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let phase = 0;
    const snapshots = [
        {stat: {value: "09:00", label: "World clock"}, items: [{label: "Shanghai", value: "09:00 CST"}]},
        {stat: {value: "09:01", label: "World clock"}, items: [{label: "Tokyo", value: "10:01 JST"}]},
        {stat: {value: "09:02", label: "World clock"}, items: [{label: "Tokyo", value: "10:02 JST"}, {label: "UTC", value: "01:02 UTC"}]},
    ];
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "external-world-clock", title: "World clock"},
        read: async () => ({ok: true, snapshot: snapshots[phase]}),
    });
    await controller.refresh();
    const firstRoot = container.firstElementChild;
    phase = 1;
    await controller.refresh();
    const secondRoot = container.firstElementChild;
    assert.notEqual(secondRoot, firstRoot, "a label change must fall back to a full render");
    phase = 2;
    await controller.refresh();
    assert.notEqual(container.firstElementChild, secondRoot, "a row-count change must fall back to a full render");
    controller.dispose();
});

test("home controller keeps the newest request when an older read resolves later", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const pending = [];
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "recent", title: "Recent"},
        read: () => new Promise((resolve) => pending.push(resolve)),
    });
    const first = controller.refresh();
    const second = controller.refresh();
    pending[0]({ok: true, snapshot: {items: [{label: "old"}]}});
    pending[1]({ok: true, snapshot: {items: [{label: "new"}]}});
    assert.equal((await first).reason, "stale");
    assert.equal((await second).view.items[0].label, "new");
    assert.equal(container.querySelector(".sw__home-module-item-action").textContent, "new");
});

test("home controller restores focused module controls after loading replacement", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "focus", title: "Focus"},
        read: async () => ({ok: true, snapshot: {items: [{label: "Keep focus", value: "keep"}]}}),
    });
    controller.mount();
    await controller.refresh();
    const item = container.querySelector(".sw__home-module-item-action");
    item.focus();
    await controller.refresh();
    assert.equal(dom.window.document.activeElement?.dataset.focusKey, "keep");
    controller.dispose();
});

test("home controller distinguishes duplicate item focus keys", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "duplicates", title: "Duplicates"},
        read: async () => ({ok: true, snapshot: {items: [
            {label: "Same", value: "same"},
            {label: "Same", value: "same"},
        ]}}),
    });
    await controller.refresh();
    const items = container.querySelectorAll(".sw__home-module-item-action");
    assert.equal(items[0].dataset.focusKey, "same");
    assert.equal(items[1].dataset.focusKey, "same-1");
    items[1].focus();
    await controller.refresh();
    assert.equal(dom.window.document.activeElement?.dataset.focusKey, "same-1");
    controller.dispose();
});

test("home controller drops focus key when the focused item disappears", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let includeItem = true;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "removed", title: "Removed"},
        read: async () => ({ok: true, snapshot: {items: includeItem ? [{label: "Gone", value: "gone"}] : []}}),
    });
    await controller.refresh();
    container.querySelector(".sw__home-module-item-action").focus();
    includeItem = false;
    await controller.refresh();
    assert.equal(container.querySelector("[data-focus-key='gone']"), null);
    includeItem = true;
    await controller.refresh();
    assert.notEqual(dom.window.document.activeElement?.dataset.focusKey, "gone");
    controller.dispose();
});

test("home controller preserves transient scroll position across async replacement", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "scroll", title: "Scroll"},
        read: async () => ({ok: true, snapshot: {items: [{label: "Item", value: "item"}]}}),
    });
    await controller.refresh();
    container.scrollTop = 144;
    await controller.refresh();
    assert.equal(container.scrollTop, 144);
    controller.dispose();
});

test("home controller keeps focus keys unique when values overlap with generated suffixes", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "overlap", title: "Overlap"},
        read: async () => ({ok: true, snapshot: {items: [
            {label: "Same", value: "same"},
            {label: "Same", value: "same"},
            {label: "Suffix", value: "same-1"},
        ]}}),
    });
    await controller.refresh();
    const keys = [...container.querySelectorAll(".sw__home-module-item-action")].map((item) => item.dataset.focusKey);
    assert.deepEqual(keys, ["same", "same-1", "same-1-1"]);
    assert.equal(new Set(keys).size, keys.length);
    controller.dispose();
});

test("home controller forwards external cancellation and cleans its listener", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const listeners = new Set();
    const signal = {
        aborted: false,
        addEventListener(type, listener) { if (type === "abort") listeners.add(listener); },
        removeEventListener(type, listener) { if (type === "abort") listeners.delete(listener); },
    };
    let receivedSignal;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "cancelable", title: "Cancelable"},
        read: (_config, options) => {
            receivedSignal = options.signal;
            return new Promise((resolve, reject) => {
                if (options.signal?.aborted) reject(new Error("aborted"));
                else options.signal?.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
                setTimeout(() => resolve({ok: true, snapshot: {items: []}}), 20);
            });
        },
    });
    const refresh = controller.refresh({}, {signal});
    assert.equal(listeners.size, 1);
    listeners.values().next().value();
    const result = await refresh;
    assert.equal(result.reason, "aborted");
    assert.ok(receivedSignal);
    assert.equal(listeners.size, 0);
    controller.dispose();
});

test("home controller skips reads for an already-aborted external signal", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const signal = {aborted: true};
    let reads = 0;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "already-cancelled", title: "Already cancelled"},
        read: () => { reads += 1; return {ok: true, snapshot: {items: []}}; },
    });
    const result = await controller.refresh({}, {signal});
    assert.equal(result.reason, "aborted");
    assert.equal(reads, 0);
    assert.equal(container.querySelector("[data-status='loading']"), null);
    controller.dispose();
});

test("home controller exposes a bounded error state for panel-level failures", () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "error-state", title: "Error state"},
        read: () => ({ok: true, snapshot: {items: []}}),
    });
    controller.mount();
    const view = controller.showError("bad config");
    assert.equal(view.status, "error");
    assert.equal(container.querySelector("[data-status='error']") !== null, true);
    assert.equal(container.querySelector('[role="alert"]').textContent, "暂时无法加载 · bad config");
    controller.dispose();
});

test("home controller skips focus probing for minimal host containers", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let child = null;
    const container = {
        firstChild: null,
        appendChild(value) { child = value; this.firstChild = value; return value; },
        removeChild() { child = null; this.firstChild = null; },
    };
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "minimal-container", title: "Minimal"},
        read: async () => ({ok: true, snapshot: {items: []}}),
    });
    assert.doesNotThrow(() => controller.mount());
    await controller.refresh();
    assert.ok(child);
    controller.dispose();
});

test("home controller owns collapse state and exposes toggle", () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const toggles = [];
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "toggle", title: "Toggle"},
        collapsed: true,
        read: () => ({ok: true, snapshot: {items: [{label: "Item"}]}}),
        onToggle: (view) => toggles.push(view.collapsed),
    });
    controller.mount();
    assert.equal(controller.getView().collapsed, true);
    assert.equal(container.querySelector(".sw__home-module-body").hidden, true);
    controller.toggle();
    assert.equal(controller.getView().collapsed, false);
    assert.equal(container.querySelector(".sw__home-module-body").hidden, false);
    assert.deepEqual(toggles, [false]);
    controller.toggle();
    assert.equal(controller.getView().collapsed, true);
    controller.dispose();
});

test("home refresh-all scheduler bounds concurrency and isolates failures", async () => {
    let active = 0;
    let peak = 0;
    const releases = [];
    const entries = Array.from({length: 5}, (_, index) => ({
        refresh: async (_config, options) => {
            assert.equal(options.force, true);
            active += 1;
            peak = Math.max(peak, active);
            await new Promise((resolve) => releases.push(resolve));
            active -= 1;
            if (index === 2) throw new Error("opaque");
            return {ok: true, index};
        },
    }));
    const pending = refreshHomeModules(entries, {concurrency: 2});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(active, 2);
    while (releases.length > 0 || active > 0) {
        releases.shift()?.();
        await new Promise((resolve) => setImmediate(resolve));
    }
    const results = await pending;
    assert.equal(peak, 2);
    assert.equal(results.length, 5);
    assert.deepEqual(results[2], {ok: false, reason: "failed"});
});

test("home refresh summary counts only bounded stable failures", () => {
    assert.equal(countHomeRefreshFailures([{ok: true}, {ok: false}, null, {ok: false, detail: "hidden"}, {ok: false, reason: "aborted"}]), 2);
    assert.equal(countHomeRefreshFailures(Array.from({length: 100}, () => ({ok: false}))), 64);
    assert.equal(countHomeRefreshFailures(null), 0);
});

test("home refresh summary groups stable failure reasons", () => {
    assert.deepEqual(summarizeHomeRefreshFailures([
        {ok: false, reason: "timeout"},
        {ok: false, reason: "failed"},
        {ok: false, reason: "unsupported"},
        {ok: false, reason: "aborted"},
        {ok: true},
    ]), {timeout: 1, failed: 1, other: 1});
    assert.deepEqual(summarizeHomeRefreshFailures(null), {timeout: 0, failed: 0, other: 0});
});

test("home refresh retry selection excludes cancelled and successful entries", () => {
    const entries = [{id: "a"}, {id: "b"}, {id: "c"}, {id: "d"}];
    const results = [{ok: false, reason: "timeout"}, {ok: true}, {ok: false, reason: "aborted"}, {ok: false, reason: "failed"}];
    assert.deepEqual(selectHomeRefreshRetryEntries(entries, results).map((entry) => entry.id), ["a", "d"]);
});

test("home refresh-all scheduler stops queued work after cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    let release;
    const entries = Array.from({length: 4}, () => ({refresh: (_config, options) => {
        calls += 1;
        assert.equal(options.signal, controller.signal);
        return new Promise((resolve) => { release = resolve; });
    }}));
    const pending = refreshHomeModules(entries, {concurrency: 1, signal: controller.signal});
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    release({ok: false, reason: "aborted"});
    const results = await pending;
    assert.equal(calls, 1);
    assert.equal(results.filter((result) => result?.reason === "aborted").length, 4);
});

test("home controller mounts a provided snapshot instantly and skips the loading flash", async () => {
    const dom = new JSDOM("<!doctype html><body><div id='mount'></div></body>");
    const container = dom.window.document.querySelector("#mount");
    let reads = 0;
    const controller = createHomeModuleController({
        document: dom.window.document,
        container,
        module: {moduleId: "digest", title: "Digest"},
        // 秒开（D-382）：宿主传入上一次的好快照，首帧直出"缓存"态内容
        initialSnapshot: {items: [{label: "cached-item"}]},
        read: async () => {
            reads += 1;
            return {ok: true, snapshot: {items: [{label: "fresh-item"}]}};
        },
    });
    controller.mount();
    assert.equal(container.querySelector("[data-status='ready']") !== null, true, "首帧即 ready 内容");
    assert.equal(container.textContent.includes("cached-item"), true, "首帧展示快照条目");
    assert.equal(container.querySelector(".sw__home-loading-skeleton"), null, "无 loading 骨架闪帧");
    const result = await controller.refresh();
    assert.equal(result.ok, true);
    assert.equal(reads, 1, "refresh 恰好读取一次");
    assert.equal(container.textContent.includes("fresh-item"), true, "静默更新为最新内容");
    controller.dispose();
});
