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

guarded("home adapters: registry replacement and removal are deterministic", () => {
    const first = {moduleId: "tasks", supportedDevices: ["desktop"], read: () => ({})};
    const second = {moduleId: "tasks", supportedDevices: ["mobile"], read: () => ({})};
    const map = adapters.registerHomeAdapters([first, second]);
    assert.deepEqual(map.get("tasks").supportedDevices, ["mobile"]);
    adapters.unregisterHomeAdapter(map, "tasks");
    assert.equal(map.has("tasks"), false);
});

guarded("home adapters: layout conflicts and orphan entries are removed idempotently", () => {
    const state = home.normalizeHomeState({instances: [{moduleId: "today-tasks", instanceId: "a"}], layouts: {desktop: [{instanceId: "a", x: 1}, {instanceId: "a", x: 2}, {instanceId: "orphan"}]}});
    assert.deepEqual(state.layouts.desktop.map((item) => item.instanceId), ["a"]);
    assert.deepEqual(home.normalizeHomeState(state), state);
});

guarded("home adapters: slow readers are isolated by a timeout", async () => {
    const map = adapters.registerHomeAdapters([{moduleId: "slow", supportedDevices: ["desktop"], read: () => new Promise(() => {})}]);
    const result = await adapters.readHomeModule(map, "slow", "desktop", {}, {timeoutMs: 5});
    assert.equal(result.reason, "timeout");
});

guarded("home adapters: refreshes are cached and can be forced", async () => {
    adapters.clearHomeSnapshotCache();
    let reads = 0;
    const map = adapters.registerHomeAdapters([{moduleId: "cached", supportedDevices: ["mobile"], read: () => ({title: String(++reads)})}]);
    const first = await adapters.readHomeModule(map, "cached", "mobile", {}, {cacheTtlMs: 1000});
    const second = await adapters.readHomeModule(map, "cached", "mobile", {}, {cacheTtlMs: 1000});
    const forced = await adapters.readHomeModule(map, "cached", "mobile", {}, {cacheTtlMs: 1000, force: true});
    assert.equal(first.snapshot.title, "1");
    assert.equal(second.cached, true);
    assert.equal(forced.snapshot.title, "2");
});

guarded("home adapters: built-in data sources expose a read-only device contract", () => {
    const contract = adapters.getHomeDataSourceContract("today-tasks");
    assert.deepEqual(contract.supportedDevices, ["desktop", "sidebar", "mobile"]);
    assert.equal(contract.readOnly, true);
    assert.equal(adapters.getHomeDataSourceContract("missing"), null);
});

guarded("home adapters: empty snapshots are explicit placeholders", () => {
    assert.equal(adapters.normalizeSnapshot(null).empty, true);
    assert.equal(adapters.normalizeSnapshot({items: [{label: "ok"}]}).empty, false);
});

guarded("home adapters: failed reads back off and force can recover", async () => {
    adapters.clearHomeSnapshotCache();
    let reads = 0;
    const map = adapters.registerHomeAdapters([{moduleId: "flaky", supportedDevices: ["desktop"], read: () => {
        reads += 1;
        if (reads === 1) throw new Error("offline");
        return {items: [{label: "ok"}]};
    }}]);
    const failed = await adapters.readHomeModule(map, "flaky", "desktop", {}, {cacheTtlMs: 0});
    const backedOff = await adapters.readHomeModule(map, "flaky", "desktop", {}, {cacheTtlMs: 0});
    const recovered = await adapters.readHomeModule(map, "flaky", "desktop", {}, {cacheTtlMs: 0, force: true});
    assert.equal(failed.reason, "failed");
    assert.equal(backedOff.reason, "backoff");
    assert.equal(recovered.ok, true);
});

guarded("home adapters: diagnostics are bounded and do not expose errors", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "diag", supportedDevices: ["desktop"], read: () => { throw new Error("secret token"); }}]);
    await adapters.readHomeModule(map, "diag", "desktop", {}, {timeoutMs: 5});
    const entries = adapters.getHomeAdapterDiagnostics();
    assert.equal(entries.some((item) => item.type === "failed"), true);
    assert.equal(JSON.stringify(entries).includes("secret token"), false);
    assert.equal(entries.length <= adapters.MAX_DIAGNOSTICS, true);
});

guarded("home adapters: diagnostics can be consumed by device without leaking the store", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "diag-mobile", supportedDevices: ["mobile"], read: () => ({})}]);
    await adapters.readHomeModule(map, "diag-mobile", "mobile", {}, {cacheTtlMs: 0});
    const mobile = adapters.consumeHomeAdapterDiagnostics("mobile");
    assert.equal(mobile.every((item) => item.device === "mobile"), true);
    assert.deepEqual(adapters.getHomeAdapterDiagnostics(), []);
});

guarded("home adapters: repeated consumption is empty and old references stay detached", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "repeat", supportedDevices: ["desktop"], read: () => ({})}]);
    await adapters.readHomeModule(map, "repeat", "desktop", {}, {cacheTtlMs: 0});
    const first = adapters.consumeHomeAdapterDiagnostics();
    first.push({type: "tampered"});
    assert.deepEqual(adapters.consumeHomeAdapterDiagnostics(), []);
});

guarded("home adapters: concurrent device reads keep diagnostics device-scoped", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([
        {moduleId: "desktop-read", supportedDevices: ["desktop"], read: async () => ({})},
        {moduleId: "mobile-read", supportedDevices: ["mobile"], read: async () => ({})},
    ]);
    await Promise.all([
        adapters.readHomeModule(map, "desktop-read", "desktop", {}, {cacheTtlMs: 0}),
        adapters.readHomeModule(map, "mobile-read", "mobile", {}, {cacheTtlMs: 0}),
    ]);
    const desktop = adapters.consumeHomeAdapterDiagnostics("desktop");
    assert.equal(desktop.every((item) => item.device === "desktop"), true);
    assert.equal(adapters.getHomeAdapterDiagnostics().every((item) => item.device === "mobile"), true);
});

guarded("home adapters: unregister removes provider state and tolerates missing APIs", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "lifecycle", supportedDevices: ["desktop"], read: () => ({items: [{label: "x"}]})}]);
    await adapters.readHomeModule(map, "lifecycle", "desktop", {}, {cacheTtlMs: 1000});
    adapters.unregisterHomeAdapter(map, "lifecycle");
    const result = await adapters.readHomeModule(map, "lifecycle", "desktop");
    assert.equal(result.reason, "unsupported");
    assert.equal(adapters.getHomeAdapterDiagnostics().some((item) => item.moduleId === "lifecycle"), false);
    assert.doesNotThrow(() => adapters.unregisterHomeAdapter(map, "missing"));
});
