const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../src/home-model.js");

test("home model registers bounded default modules", () => {
    const modules = home.registerModules([{moduleId: "recent-documents", title: "override", supportedDevices: ["mobile"]}]);
    assert.equal(modules.length, 5);
    assert.equal(modules.find((item) => item.moduleId === "recent-documents").title, "override");
});

test("home model filters modules by device", () => {
    assert.equal(home.modulesForDevice([{moduleId: "desktop-only", title: "D", supportedDevices: ["desktop"]}], "mobile").some((item) => item.moduleId === "desktop-only"), false);
    assert.equal(home.modulesForDevice([], "mobile").length, 5);
});

test("home model normalizes layout and rejects invalid instances", () => {
    assert.deepEqual(home.normalizeLayout({x: -1, w: 0, h: 20, collapsed: true}), {x: 0, y: 0, w: 1, h: 12, collapsed: true});
    assert.deepEqual(home.normalizeInstances([{moduleId: "recent-documents"}, {moduleId: "bad"}, {moduleId: "recent-documents"}]), [{instanceId: "recent-documents", moduleId: "recent-documents", enabled: true, config: {}}]);
});

test("home model bounds third-party config and instance ids", () => {
    const state = home.normalizeInstances([
        {moduleId: "recent-documents", instanceId: "shared", config: {safe: "ok", "bad key": "drop", nested: {deep: {value: "kept"}}}},
        {moduleId: "today-tasks", instanceId: "shared"},
    ]);
    assert.equal(state.length, 1);
    assert.deepEqual(state[0].config, {safe: "ok", nested: {deep: {value: "kept"}}});
});

test("home model migrates legacy widgets and emits schema version", () => {
    const state = home.migrateHomeState({widgets: [{moduleId: "today-tasks"}], layout: [{instanceId: "today-tasks", x: 2}]});
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.instances[0].moduleId, "today-tasks");
    assert.equal(state.layouts.desktop[0].x, 2);
    assert.deepEqual(state.layouts.mobile, []);
});

test("home model migration keeps device layouts isolated and bounded", () => {
    const state = home.migrateHomeState({widgets: [{moduleId: "today-tasks", instanceId: "task"}], layouts: {
        desktop: [{instanceId: "task", x: 1}], sidebar: [{instanceId: "task", x: 2}], mobile: [{instanceId: "other", x: 3}],
    }});
    assert.deepEqual(state.layouts.desktop.map((item) => item.x), [1]);
    assert.deepEqual(state.layouts.sidebar.map((item) => item.x), [2]);
    assert.deepEqual(state.layouts.mobile, []);
});

test("home model keeps module order deterministic and unknown modules isolated", () => {
    const modules = home.registerModules([
        {moduleId: "custom-b", title: "B", supportedDevices: ["desktop"]},
        {moduleId: "custom-a", title: "A", supportedDevices: ["desktop"]},
        {moduleId: "custom-b", title: "B2", supportedDevices: ["mobile"]},
    ]);
    assert.equal(modules.find((item) => item.moduleId === "custom-b").title, "B2");
    assert.deepEqual(home.modulesForDevice(modules, "mobile").map((item) => item.moduleId).filter((id) => id.startsWith("custom")), ["custom-b"]);
    assert.deepEqual(home.normalizeInstances([{moduleId: "unknown", instanceId: "u"}]), []);
});

test("home model clamps layout dimensions and preserves collapse state", () => {
    const layout = home.normalizeLayout({x: 999, y: 9999, w: 999, h: -2, collapsed: true});
    assert.deepEqual(layout, {x: 99, y: 999, w: 12, h: 1, collapsed: true});
});

test("home model migration is stable across repeated persistence cycles", () => {
    const legacy = {widgets: [{moduleId: "today-journal", instanceId: "journal"}], layout: [{instanceId: "journal", x: 4, y: 2, w: 3, h: 2, collapsed: true}, {instanceId: "ghost", x: 1}]};
    const first = home.migrateHomeState(legacy);
    const second = home.migrateHomeState(first);
    assert.deepEqual(second, first);
    assert.equal(second.layouts.desktop.length, 1);
    assert.equal(second.layouts.desktop[0].collapsed, true);
});

test("home model bounds large persisted layouts for rendering", () => {
    const instances = Array.from({length: 80}, (_, index) => ({moduleId: "today-tasks", instanceId: `task-${index}`}));
    const layouts = Array.from({length: 100}, (_, index) => ({instanceId: `task-${index}`, x: index, y: index, w: 2, h: 2}));
    const state = home.normalizeHomeState({instances, layouts: {desktop: layouts}});
    assert.equal(state.instances.length, 1);
    assert.equal(state.layouts.desktop.length, 1);
    assert.equal(state.layouts.desktop.every((entry) => entry.x <= 99 && entry.y <= 999), true);
});

test("home model mobile layouts stay single-column and touch-safe", () => {
    const model = home.resolveLayoutConflicts({mobile: [
        {instanceId: "a", x: 8, y: 0, w: 12, h: 1},
        {instanceId: "b", x: 99, y: 1, w: 12, h: 12},
    ]}, [{instanceId: "a"}, {instanceId: "b"}]);
    assert.equal(model.mobile.every((entry) => entry.x >= 0 && entry.x <= 99), true);
    assert.equal(model.mobile.every((entry) => entry.w >= 1 && entry.w <= 12), true);
    assert.equal(model.mobile.every((entry) => entry.y >= 0), true);
});
