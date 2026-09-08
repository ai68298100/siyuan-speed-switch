const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

test("race reclaim: unregister removes candidates before a later refresh snapshot", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop", "mobile"], actions: [{value: "open"}]});
    registry.unregister("p");
    assert.deepEqual(registry.list(), []);
    assert.deepEqual(registry.snapshot(), []);
});

test("race reclaim: duplicate registration is deterministic and keeps one provider", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: [{value: "open"}]};
    registry.register(provider, () => "a");
    registry.register(provider, () => "b");
    assert.equal(registry.list().length, 1);
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: true, result: "b"});
});

test("race reclaim: stale candidate cannot execute after provider replacement", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "Old", actions: [{value: "old"}]}, () => "old");
    const stale = registry.list()[0];
    registry.register({id: "p", name: "New", actions: [{value: "new"}]}, () => "new");
    assert.deepEqual(registry.invoke(stale), {ok: true, result: "new"});
    assert.equal(registry.list()[0].value, "new");
});
