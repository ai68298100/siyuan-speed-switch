const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

test("registration order: action can be registered before handler and becomes executable after handler install", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: [{value: "open"}]};
    registry.register(provider);
    const candidate = registry.list()[0];
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
    registry.register(provider, () => "ready");
    assert.deepEqual(registry.invoke(candidate), {ok: true, result: "ready"});
});

test("registration order: repeated provider registration does not duplicate candidates", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: [{value: "open"}]};
    registry.register(provider);
    registry.register(provider, () => "ready");
    assert.equal(registry.list().length, 1);
});

test("registration order: unregister before module registration leaves both surfaces empty", () => {
    const registry = createQuickActionRegistry();
    assert.equal(registry.unregister("missing"), false);
    assert.deepEqual(registry.list(), []);
});
