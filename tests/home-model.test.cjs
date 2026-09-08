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
