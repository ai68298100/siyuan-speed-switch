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
