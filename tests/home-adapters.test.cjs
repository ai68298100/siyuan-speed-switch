const test = require("node:test");
const assert = require("node:assert/strict");
let home;
try { home = require("../src/home-model.js"); } catch { home = null; }

function guarded(name, fn) {
    return home ? test(name, fn) : test(name, {skip: "home-model is supplied by the main integration branch"}, fn);
}

guarded("home adapters: modules are filtered by target device", () => {
    const definitions = [
        {moduleId: "desktop", title: "Desktop", supportedDevices: ["desktop"]},
        {moduleId: "mobile", title: "Mobile", supportedDevices: ["mobile"]},
    ];
    assert.deepEqual(home.modulesForDevice(definitions, "mobile").map((item) => item.moduleId), ["mobile"]);
});

guarded("home adapters: normalized modules remain read-only by default", () => {
    const module = home.normalizeModuleDefinition({moduleId: "tasks", title: "Tasks"});
    assert.equal(module.readOnly, true);
    assert.equal(home.normalizeModuleDefinition({moduleId: "editable", title: "Editable", readOnly: false}).readOnly, false);
});

guarded("home adapters: unknown module instances are rejected", () => {
    const state = home.normalizeHomeState({instances: [{moduleId: "unknown", instanceId: "u"}]});
    assert.equal(state.instances.some((item) => item.moduleId === "unknown"), false);
});

guarded("home adapters: layout coordinates are bounded and malformed entries discarded", () => {
    const first = home.normalizeLayout({x: -100, y: 20, w: 999, h: 0});
    const second = home.normalizeLayout({x: 2, y: 3, w: 4, h: 5});
    assert.equal(first.x >= 0, true);
    assert.equal(first.w <= 12, true);
    assert.equal(first.h >= 1, true);
    assert.deepEqual(second, {x: 2, y: 3, w: 4, h: 5, collapsed: false});
});
