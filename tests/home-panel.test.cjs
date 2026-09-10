const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {createHomePanelController} = require("../src/home-panel.js");

test("home panel mounts bounded modules and refreshes them with per-module config", async () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const seen = [];
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        title: "Dashboard",
        modules: [{moduleId: "one", title: "One"}, {moduleId: "two", title: "Two"}],
        read: async (module, config) => { seen.push([module.moduleId, config]); return {ok: true, snapshot: {items: [{label: module.moduleId}]}}; },
    });
    assert.ok(panel);
    panel.mount();
    assert.equal(container.querySelectorAll(".sw__home-panel-module").length, 2);
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), null);
    const result = await panel.refresh({one: {limit: 1}, two: {limit: 2}});
    assert.equal(result.ok, true);
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "false");
    assert.deepEqual(seen.sort(), [["one", {limit: 1}], ["two", {limit: 2}]]);
    assert.deepEqual(panel.getViews().map((item) => item.view.status), ["ready", "ready"]);
    panel.dispose();
    assert.equal(container.childElementCount, 0);
});

test("home panel exposes busy state across concurrent module reads", async () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        modules: [{moduleId: "one", title: "One"}],
        read: async () => { await pending; return {ok: true, snapshot: {items: []}}; },
    });
    panel.mount();
    const refresh = panel.refresh();
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "true");
    release();
    await refresh;
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "false");
    panel.dispose();
});

test("home panel keeps busy state for the newest overlapping refresh", async () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const releases = [];
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        modules: [{moduleId: "one", title: "One"}],
        read: async (_module, config) => new Promise((resolve) => releases.push(() => resolve({ok: true, snapshot: {items: [{label: String(config.run)}]}}))),
    });
    panel.mount();
    const first = panel.refresh({run: 1});
    const second = panel.refresh({run: 2});
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "true");
    releases[0]();
    await first;
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "true");
    releases[1]();
    await second;
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "false");
    panel.dispose();
});

test("home panel contains per-module config failures in its result contract", async () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        modules: [{moduleId: "one", title: "One"}, {moduleId: "two", title: "Two"}],
        read: async (module) => ({ok: true, snapshot: {items: [{label: module.moduleId}]}}),
    });
    const result = await panel.refresh((moduleId) => {
        if (moduleId === "one") throw new Error("bad config");
        return {limit: 1};
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "failed");
    assert.equal(result.results[0].reason, "failed");
    assert.equal(result.results[1].ok, true);
    assert.equal(container.querySelector("[data-module-id='one'] [data-status='error']") !== null, true);
    assert.equal(container.querySelector(".sw__home-panel").getAttribute("aria-busy"), "false");
    panel.dispose();
});

test("home panel preserves cancellation reason when module reads are aborted", async () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const listeners = new Set();
    const signal = {
        aborted: false,
        addEventListener(type, listener) { if (type === "abort") listeners.add(listener); },
        removeEventListener(type, listener) { if (type === "abort") listeners.delete(listener); },
    };
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        modules: [{moduleId: "cancel-one", title: "Cancel one"}, {moduleId: "cancel-two", title: "Cancel two"}],
        read: async (_module, _config, options) => new Promise((resolve, reject) => {
            if (options.signal?.aborted) reject(new Error("aborted"));
            else options.signal?.addEventListener("abort", () => reject(new Error("aborted")), {once: true});
            setTimeout(() => resolve({ok: true, snapshot: {items: []}}), 30);
        }),
    });
    const pending = panel.refresh({}, {signal});
    signal.aborted = true;
    listeners.forEach((listener) => listener());
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.reason, "aborted");
    assert.equal(result.results.every((item) => item.reason === "aborted"), true);
    panel.dispose();
});

test("home panel caps module count and rejects invalid setup", () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    assert.equal(createHomePanelController({document: dom.window.document, container, modules: [], read: null}), null);
    const panel = createHomePanelController({document: dom.window.document, container, modules: Array.from({length: 20}, (_, i) => ({moduleId: `m${i}`, title: `M${i}`})), read: () => ({snapshot: {items: []}})});
    assert.equal(panel.listModules().length, 8);
});

test("home panel trims and de-duplicates module ids before mounting", () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        modules: [{moduleId: " one ", title: "First"}, {moduleId: "one", title: "Duplicate"}, {moduleId: "two", title: "Second"}],
        read: () => ({snapshot: {items: []}}),
    });
    assert.deepEqual(panel.listModules().map((module) => module.moduleId), ["one", "two"]);
    panel.mount();
    assert.equal(container.querySelectorAll(".sw__home-panel-module").length, 2);
    panel.dispose();
});

test("home panel toggles a named module without rebuilding other modules", () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        modules: [{moduleId: "one", title: "One"}, {moduleId: "two", title: "Two"}],
        read: () => ({ok: true, snapshot: {items: [{label: "Item"}]}}),
    });
    panel.mount();
    const secondHost = container.querySelector("[data-module-id='two']");
    const view = panel.toggle("one");
    assert.equal(view.collapsed, true);
    assert.equal(container.querySelector("[data-module-id='one'] .sw__home-module-body").hidden, true);
    assert.strictEqual(container.querySelector("[data-module-id='two']"), secondHost);
    assert.equal(panel.toggle("missing"), null);
    panel.dispose();
});

test("home panel renders an accessible empty state when no modules are available", () => {
    const dom = new JSDOM("<!doctype html><body><main id='mount'></main></body>");
    const container = dom.window.document.querySelector("#mount");
    const panel = createHomePanelController({
        document: dom.window.document,
        container,
        title: "Empty panel",
        labels: {emptyPanel: "No modules"},
        modules: [],
        read: () => ({snapshot: {items: []}}),
    });
    panel.mount();
    const empty = container.querySelector(".sw__home-panel-empty");
    assert.ok(empty);
    assert.equal(empty.textContent, "No modules");
    assert.equal(empty.getAttribute("role"), "status");
    assert.equal(empty.getAttribute("aria-live"), "polite");
    panel.dispose();
});
