const test = require("node:test");
const assert = require("node:assert/strict");
const adapters = require("../src/home-adapters.js");

test("external provider release matrix covers checkin, assets and light-talk", async () => {
    adapters.clearHomeSnapshotCache();
    const ids = ["checkin", "data-assets", "light-talk"];
    const map = adapters.registerHomeAdapters(ids.map((moduleId) => ({moduleId, supportedDevices: ["desktop", "mobile"], read: () => ({title: moduleId, items: [{label: "ok"}]})})));
    for (const id of ids) {
        const desktop = await adapters.readHomeModule(map, id, "desktop", {}, {cacheTtlMs: 1000});
        const mobile = await adapters.readHomeModule(map, id, "mobile", {}, {cacheTtlMs: 1000});
        assert.equal(desktop.ok, true);
        assert.equal(mobile.ok, true);
    }
    assert.equal(adapters.getHomeAdapterDiagnostics().length <= adapters.MAX_DIAGNOSTICS, true);
    ids.forEach((id) => adapters.unregisterHomeAdapter(map, id));
    assert.equal(map.size, 0);
});
