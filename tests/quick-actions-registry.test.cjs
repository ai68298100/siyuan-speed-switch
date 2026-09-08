const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, normalizeProvider} = require("../src/quick-actions.js");

test("quick action registry: normalizes provider metadata and filters targets", () => {
    const provider = normalizeProvider({id: " plugin:checkin ", name: "打卡\n入口", targets: ["desktop", "mobile", "tv"], actions: [{value: "open"}]});
    assert.equal(provider.id, "plugin:checkin");
    assert.equal(provider.name, "打卡 入口");
    assert.deepEqual(provider.targets, ["desktop", "mobile"]);
    assert.equal(provider.actions[0].providerId, "plugin:checkin");
});

test("quick action registry: unregister makes callbacks safely unavailable", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "checkin", name: "打卡", actions: [{value: "open"}]}, () => "opened");
    const action = registry.list()[0];
    assert.deepEqual(registry.invoke(action), {ok: true, result: "opened"});
    registry.unregister("checkin");
    assert.deepEqual(registry.invoke(action), {ok: false, reason: "unavailable"});
});

test("quick action registry: handler failures are contained", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "bad", name: "Bad", actions: [{value: "open"}]}, () => { throw new Error("boom"); });
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: false, reason: "failed"});
});

test("quick action registry: candidates expose serializable provider capability metadata", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "checkin", name: "打卡", supportedSurfaces: ["desktop", "mobile"], actions: [{value: "open"}]});
    const candidate = registry.list()[0];
    assert.deepEqual(candidate.declaredTargets, ["desktop", "mobile"]);
    assert.equal(typeof candidate.providerId, "string");
    assert.equal(typeof candidate.value, "string");
    assert.doesNotThrow(() => JSON.stringify(candidate));
});

test("quick action registry: unregister removes all provider candidates", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "a", name: "A", actions: [{value: "one"}, {value: "two"}]});
    assert.equal(registry.list().length, 2);
    registry.unregister("a");
    assert.deepEqual(registry.list(), []);
});

test("quick action registry: repeated identical registration is idempotent", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "a", name: "A", targets: ["desktop"], actions: [{value: "one"}]};
    assert.equal(registry.register(provider).registered, true);
    const second = registry.register(provider);
    assert.equal(second.unchanged, true);
    assert.equal(registry.list().length, 1);
});

test("quick action registry: legacy surface fields migrate to declared targets", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "legacy", name: "Legacy", supportedDevices: ["sidebar", "mobile"], actions: [{value: "open"}]});
    assert.deepEqual(registry.list()[0].declaredTargets, ["sidebar", "mobile"]);
});

test("quick action registry: later registration replaces provider metadata atomically", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "Old", actions: [{value: "old"}]});
    registry.register({id: "p", name: "New", targets: ["mobile"], actions: [{value: "new"}]});
    assert.deepEqual(registry.list().map((item) => item.value), ["new"]);
    assert.equal(registry.snapshot()[0].name, "New");
});

test("quick action registry: snapshot is detached and unregister clears it", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]});
    const snapshot = registry.snapshot();
    snapshot[0].actions[0].value = "mutated";
    assert.equal(registry.list()[0].value, "open");
    registry.unregister("p");
    assert.deepEqual(registry.snapshot(), []);
});

test("quick action registry: candidate snapshot is bounded", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: Array.from({length: 5}, (_, i) => ({value: `a${i}`}))});
    assert.equal(registry.list(3).length, 3);
});
