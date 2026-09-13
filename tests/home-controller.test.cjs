const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures, summarizeHomeRefreshFailures} = require("../src/home-controller.js");

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
