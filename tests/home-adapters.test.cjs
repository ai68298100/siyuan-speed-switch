const test = require("node:test");
const assert = require("node:assert/strict");
let home;
let adapters;
try { home = require("../src/home-model.js"); } catch { home = null; }
try { adapters = require("../src/home-adapters.js"); } catch { adapters = null; }

function guarded(name, fn) {
    return home ? test(name, fn) : test(name, {skip: "home-model is supplied by the main integration branch"}, fn);
}

test("home adapter regression matrix remains discoverable", () => {
    assert.equal(typeof adapters?.planHomeRefresh, "function");
    assert.equal(typeof adapters?.planHomeLifecycleRefresh, "function");
    assert.equal(typeof adapters?.getHomeAdapterDiagnostics, "function");
    assert.equal(typeof adapters?.consumeHomeAdapterDiagnostics, "function");
    assert.equal(typeof adapters?.coalesceHomeRefreshEvents, "function");
});

test("home adapter API normalizes invalid device and refresh arguments", () => {
    assert.deepEqual(adapters.planHomeRefresh({device: "tablet", stale: true}), {shouldRefresh: true, reason: "stale", device: "desktop", delayMs: 0});
    assert.deepEqual(adapters.planHomeLifecycleRefresh(null, {visible: true, stale: false}), {shouldRefresh: false, reason: "fresh", device: "desktop", delayMs: 0});
    assert.deepEqual(adapters.coalesceHomeRefreshEvents("bad", {visible: true, stale: false}), {shouldRefresh: false, reason: "fresh", device: "desktop", delayMs: 0});
});

test("home adapter snapshots keep fields consistent across devices", () => {
    const snapshot = adapters.normalizeSnapshot({title: "T", items: [{label: "L", value: "V", href: "/x"}], updatedAt: 1});
    for (const key of ["title", "items", "updatedAt", "empty"]) assert.equal(Object.prototype.hasOwnProperty.call(snapshot, key), true);
    assert.equal(snapshot.empty, false);
});

test("home adapter bridge deduplicates concurrent reads by device and config", async () => {
    adapters.clearHomeSnapshotCache();
    let reads = 0;
    const map = adapters.registerHomeAdapters([{moduleId: "bridge", supportedDevices: ["desktop"], read: async () => { reads += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return {items: [{label: "ok"}]}; }}]);
    const results = await Promise.all(Array.from({length: 5}, () => adapters.readHomeModule(map, "bridge", "desktop", {a: true}, {cacheTtlMs: 0})));
    assert.equal(reads, 1);
    assert.equal(results.every((item) => item.ok), true);
});

test("home adapter bridge supports cancellation without poisoning cache", async () => {
    adapters.clearHomeSnapshotCache();
    const controller = new AbortController();
    const map = adapters.registerHomeAdapters([{moduleId: "cancel", supportedDevices: ["desktop"], read: () => new Promise((resolve) => setTimeout(() => resolve({title: "late"}), 20))}]);
    const pending = adapters.readHomeModule(map, "cancel", "desktop", {}, {signal: controller.signal, timeoutMs: 50});
    controller.abort();
    const result = await pending;
    assert.equal(result.reason, "aborted");
});

test("home adapter agent sources remain read-only and device isolated", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "agent", supportedDevices: ["desktop", "mobile"], read: (_, device) => ({title: device, items: []})}]);
    const desktop = await adapters.readHomeModule(map, "agent", "desktop", {notebook: "safe"}, {cacheTtlMs: 0});
    const mobile = await adapters.readHomeModule(map, "agent", "mobile", {notebook: "safe"}, {cacheTtlMs: 0});
    assert.equal(desktop.snapshot.empty, true);
    assert.equal(mobile.snapshot.title, "mobile");
});

test("home adapter agent source missing API and timeout degrade safely", async () => {
    const missing = adapters.registerHomeAdapters([{moduleId: "agent-missing", supportedDevices: ["desktop"]}]);
    assert.equal(missing.size, 0);
    const slow = adapters.registerHomeAdapters([{moduleId: "agent-slow", supportedDevices: ["mobile"], read: () => new Promise(() => {})}]);
    const result = await adapters.readHomeModule(slow, "agent-slow", "mobile", {}, {timeoutMs: 5});
    assert.equal(result.reason, "timeout");
    assert.equal(result.snapshot.empty, true);
});

test("home adapter agent snapshots strip sensitive fields and bound text", () => {
    const snapshot = adapters.normalizeSnapshot({title: "x".repeat(200), secret: "token", items: [{label: "l".repeat(500), value: "v", href: "/safe", token: "hidden"}]});
    assert.equal(snapshot.title.length, 64);
    assert.equal(snapshot.items[0].label.length, 256);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot.items[0], "token"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "secret"), false);
});

test("home adapter bridge isolates cancellation and force refresh across devices", async () => {
    adapters.clearHomeSnapshotCache();
    const controller = new AbortController();
    let calls = 0;
    const map = adapters.registerHomeAdapters([{moduleId: "cross", supportedDevices: ["desktop", "mobile"], read: (_, device) => new Promise((resolve) => setTimeout(() => resolve({title: `${device}-${++calls}`}), 10))}]);
    const cancelled = adapters.readHomeModule(map, "cross", "desktop", {}, {signal: controller.signal, timeoutMs: 50});
    const mobile = adapters.readHomeModule(map, "cross", "mobile", {}, {force: true, timeoutMs: 50});
    controller.abort();
    const [first, second] = await Promise.all([cancelled, mobile]);
    assert.equal(first.reason, "aborted");
    assert.equal(second.ok, true);
    const desktopAgain = await adapters.readHomeModule(map, "cross", "desktop", {}, {force: true, timeoutMs: 50});
    assert.equal(desktopAgain.ok, true);
});

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
    assert.equal(adapters.getHomeAdapterDiagnostics().some((item) => item.device === "mobile"), false);
    adapters.consumeHomeAdapterDiagnostics();
});

guarded("home adapters: consuming one device preserves other diagnostics", async () => {
    adapters.clearHomeSnapshotCache();
    adapters.consumeHomeAdapterDiagnostics();
    const map = adapters.registerHomeAdapters([{moduleId: "multi", supportedDevices: ["desktop", "mobile"], read: () => ({})}]);
    await adapters.readHomeModule(map, "multi", "desktop", {}, {cacheTtlMs: 0});
    await adapters.readHomeModule(map, "multi", "mobile", {}, {cacheTtlMs: 0});
    const mobile = adapters.consumeHomeAdapterDiagnostics("mobile");
    assert.equal(mobile.length, 1);
    assert.equal(adapters.getHomeAdapterDiagnostics().length, 1);
    assert.equal(adapters.getHomeAdapterDiagnostics()[0].device, "desktop");
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

guarded("home adapters: interleaved registration and unregister remains idempotent", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "race", supportedDevices: ["desktop"], read: () => ({title: "old"})}]);
    await adapters.readHomeModule(map, "race", "desktop", {}, {cacheTtlMs: 1000});
    adapters.unregisterHomeAdapter(map, "race");
    adapters.registerHomeAdapters([{moduleId: "race", supportedDevices: ["mobile"], read: () => ({title: "new"})}]).forEach((value, key) => map.set(key, value));
    adapters.unregisterHomeAdapter(map, "race");
    adapters.unregisterHomeAdapter(map, "race");
    assert.equal(map.has("race"), false);
    assert.equal(adapters.getHomeAdapterDiagnostics().some((item) => item.moduleId === "race"), false);
});

guarded("home adapters: device changes do not reuse another device cache", async () => {
    adapters.clearHomeSnapshotCache();
    let reads = 0;
    const map = adapters.registerHomeAdapters([{moduleId: "switch", supportedDevices: ["desktop", "mobile"], read: (_, device) => ({title: `${device}-${++reads}`})}]);
    const desktop = await adapters.readHomeModule(map, "switch", "desktop", {}, {cacheTtlMs: 1000});
    const mobile = await adapters.readHomeModule(map, "switch", "mobile", {}, {cacheTtlMs: 1000});
    assert.equal(desktop.snapshot.title, "desktop-1");
    assert.equal(mobile.snapshot.title, "mobile-2");
});

guarded("home adapters: concurrent forced refreshes remain bounded", async () => {
    adapters.clearHomeSnapshotCache();
    let reads = 0;
    const map = adapters.registerHomeAdapters([{moduleId: "stress", supportedDevices: ["desktop"], read: async () => ({title: String(++reads)})}]);
    const results = await Promise.all(Array.from({length: 12}, () => adapters.readHomeModule(map, "stress", "desktop", {}, {force: true, cacheTtlMs: 0})));
    assert.equal(results.length, 12);
    assert.equal(results.every((item) => item.ok), true);
    assert.equal(adapters.getHomeAdapterDiagnostics().length <= adapters.MAX_DIAGNOSTICS, true);
});

guarded("home adapters: unload during pending read remains safe", async () => {
    adapters.clearHomeSnapshotCache();
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const map = adapters.registerHomeAdapters([{moduleId: "pending", supportedDevices: ["mobile"], read: () => pending}]);
    const read = adapters.readHomeModule(map, "pending", "mobile", {}, {timeoutMs: 50});
    adapters.unregisterHomeAdapter(map, "pending");
    resolve({items: [{label: "late"}]});
    const result = await read;
    assert.equal(result.ok, true);
    assert.equal(map.has("pending"), false);
});

guarded("home adapters: refresh planner is device-aware and never refreshes hidden modules", () => {
    assert.deepEqual(adapters.planHomeRefresh({visible: false, stale: true}), {shouldRefresh: false, reason: "hidden", device: "desktop", delayMs: 0});
    assert.equal(adapters.planHomeRefresh({visible: true, stale: true, device: "mobile"}).delayMs, 500);
    assert.equal(adapters.planHomeRefresh({visible: true, stale: true, failure: true, device: "mobile"}).shouldRefresh, false);
    assert.equal(adapters.planHomeRefresh({force: true, visible: false}).shouldRefresh, true);
});

guarded("home adapters: lifecycle events produce consistent refresh plans", () => {
    assert.equal(adapters.planHomeLifecycleRefresh({type: "panel-hidden"}, {visible: true, stale: true}).reason, "hidden");
    assert.equal(adapters.planHomeLifecycleRefresh({type: "panel-visible"}, {visible: false, stale: true}).shouldRefresh, true);
    assert.equal(adapters.planHomeLifecycleRefresh({type: "tab-changed"}, {visible: true, stale: false}).reason, "stale");
    assert.equal(adapters.planHomeLifecycleRefresh({type: "device-changed"}, {visible: true, stale: false, device: "mobile"}).delayMs, 500);
    assert.equal(adapters.planHomeLifecycleRefresh({type: "force-refresh"}, {visible: false}).shouldRefresh, true);
    assert.equal(adapters.planHomeLifecycleRefresh({type: "recovered"}, {visible: true, failure: true}).reason, "stale");
});

guarded("home adapters: high frequency lifecycle events are coalesced with a bounded tail", () => {
    const events = Array.from({length: 40}, () => ({type: "tab-changed"}));
    const plan = adapters.coalesceHomeRefreshEvents(events, {visible: true, device: "mobile"}, 4);
    assert.equal(plan.shouldRefresh, true);
    assert.equal(plan.delayMs, 500);
    assert.equal(adapters.coalesceHomeRefreshEvents([], {visible: false}).reason, "hidden");
});

guarded("home adapters: refresh coalescing preserves force priority and ignores malformed events", () => {
    const forced = adapters.coalesceHomeRefreshEvents([{type: "panel-hidden"}, {type: "force-refresh"}], {visible: true, device: "desktop"});
    assert.equal(forced.shouldRefresh, true);
    assert.equal(forced.reason, "force");
    const hidden = adapters.coalesceHomeRefreshEvents([{type: "tab-changed"}, {type: "panel-hidden"}], {visible: true, stale: false});
    assert.equal(hidden.reason, "hidden");
    const malformed = adapters.coalesceHomeRefreshEvents([null, {}, {type: "unknown"}], {visible: true, stale: false});
    assert.equal(malformed.reason, "fresh");
});

guarded("home adapters: coalescing truncates long sequences without changing the final plan", () => {
    const events = [{type: "tab-changed"}, ...Array.from({length: 200}, () => ({type: "unknown"})), {type: "force-refresh"}];
    const plan = adapters.coalesceHomeRefreshEvents(events, {visible: true, device: "mobile"}, 3);
    assert.deepEqual(plan, {shouldRefresh: true, reason: "force", device: "mobile", delayMs: 0});
});

guarded("home adapters: diagnostic capacity stays bounded under repeated empty reads", async () => {
    adapters.clearHomeSnapshotCache();
    const map = adapters.registerHomeAdapters([{moduleId: "empty-stress", supportedDevices: ["mobile"], read: () => ({items: []})}]);
    await Promise.all(Array.from({length: 80}, () => adapters.readHomeModule(map, "empty-stress", "mobile", {}, {cacheTtlMs: 0, force: true})));
    assert.equal(adapters.getHomeAdapterDiagnostics().length <= adapters.MAX_DIAGNOSTICS, true);
    assert.equal(adapters.consumeHomeAdapterDiagnostics("desktop").length, 0);
    adapters.consumeHomeAdapterDiagnostics("mobile");
});
