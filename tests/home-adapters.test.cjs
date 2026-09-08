const test = require("node:test");
const assert = require("node:assert/strict");
let home;
let adapters;
try { home = require("../src/home-model.js"); } catch { home = null; }
try { adapters = require("../src/home-adapters.js"); } catch { adapters = null; }

function guarded(name, fn) {
    return home ? test(name, fn) : test(name, {skip: "home-model is supplied by the main integration branch"}, fn);
}

guarded("home adapters: modules are filtered by target device", () => {
    const definitions = [
        {moduleId: "desktop", title: "Desktop", supportedDevices: ["desktop"]},
        {moduleId: "mobile", title: "Mobile", supportedDevices: ["mobile"]},
    ];
    const ids = home.modulesForDevice(definitions, "mobile").map((item) => item.moduleId);
    assert.equal(ids.includes("mobile"), true);
    assert.equal(ids.includes("desktop"), false);
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

guarded("home adapters: third-party readers are device-scoped and bounded", async () => {
    assert.ok(adapters);
    const map = adapters.registerHomeAdapters([{moduleId: "checkin", supportedDevices: ["desktop"], read: async () => ({title: "x", items: Array.from({length: 40}, (_, i) => ({label: `i${i}`}))})}]);
    assert.equal(adapters.canReadAdapter(map.get("checkin"), "mobile"), false);
    const denied = await adapters.readHomeModule(map, "checkin", "mobile");
    assert.equal(denied.reason, "unsupported");
    const allowed = await adapters.readHomeModule(map, "checkin", "desktop");
    assert.equal(allowed.ok, true);
    assert.equal(allowed.snapshot.items.length, adapters.MAX_SNAPSHOT_ITEMS);
});

guarded("home adapters: failed readers return an empty safe snapshot", async () => {
    const map = adapters.registerHomeAdapters([{moduleId: "broken", supportedDevices: ["mobile"], read: () => { throw new Error("no host"); }}]);
    const result = await adapters.readHomeModule(map, "broken", "mobile", {token: "secret"});
    assert.equal(result.ok, false);
    assert.equal(result.reason, "failed");
    assert.deepEqual(result.snapshot.items, []);
});
