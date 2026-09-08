const test = require("node:test");
const assert = require("node:assert/strict");
const adapters = require("../src/home-adapters.js");

test("external provider release gate exposes bounded lifecycle contract", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "release-gate", supportedDevices: ["desktop", "mobile"], read: (_, device) => ({title: device, items: [{label: "ok"}]})}]);
    const desktop = await adapters.readHomeModule(map, "release-gate", "desktop", {}, {cacheTtlMs: 1000});
    const mobile = await adapters.readHomeModule(map, "release-gate", "mobile", {}, {cacheTtlMs: 1000});
    assert.equal(desktop.ok, true);
    assert.equal(mobile.ok, true);
    assert.equal(adapters.getHomeAdapterDiagnostics().length <= adapters.MAX_DIAGNOSTICS, true);
    adapters.unregisterHomeAdapter(map, "release-gate");
    assert.equal(map.size, 0);
});
