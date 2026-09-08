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

test("home model migrates legacy widgets and emits schema version", () => {
    const state = home.migrateHomeState({widgets: [{moduleId: "today-tasks"}], layout: [{instanceId: "today-tasks", x: 2}]});
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.instances[0].moduleId, "today-tasks");
    assert.equal(state.layouts.desktop[0].x, 2);
    assert.deepEqual(state.layouts.mobile, []);
});
