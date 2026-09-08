const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

test("memory boundary: large provider candidate lists are capped at 64", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "large", name: "Large", actions: Array.from({length: 500}, (_, i) => ({value: `v${i}`}))});
    assert.equal(registry.list(64).length, 64);
});

test("memory boundary: repeated snapshots remain stable without accumulating entries", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]});
    const first = JSON.stringify(registry.list());
    for (let i = 0; i < 100; i += 1) assert.equal(JSON.stringify(registry.list()), first);
    assert.equal(registry.snapshot().length, 1);
});

test("memory boundary: unregister releases provider snapshot and handler", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]}, () => "ok");
    const candidate = registry.list()[0];
    assert.equal(registry.unregister("p"), true);
    assert.deepEqual(registry.snapshot(), []);
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});
