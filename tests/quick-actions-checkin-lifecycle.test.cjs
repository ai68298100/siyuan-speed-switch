const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

test("check-in lifecycle: connection drop makes invocation unavailable", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]}, () => "ok");
    const candidate = registry.list()[0];
    registry.unregister("siyuan-checkin");
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});

test("check-in lifecycle: reconnect installs fresh callback without stale state", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]};
    registry.register(provider, () => "old");
    const oldCandidate = registry.list()[0];
    registry.unregister("siyuan-checkin");
    registry.register(provider, () => "fresh");
    assert.deepEqual(registry.invoke(oldCandidate), {ok: true, result: "fresh"});
});

test("check-in lifecycle: failed reconnect leaves registry empty and safe", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]});
    registry.unregister("siyuan-checkin");
    assert.deepEqual(registry.snapshot(), []);
    assert.deepEqual(registry.list(), []);
});
