const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, sanitizeQuickActions} = require("../src/quick-actions.js");

test("long run: repeated normalize/import cycles converge without growth", () => {
    const input = [{id: "p", kind: "command", value: "p/open", label: "入口", targets: ["desktop", "mobile"]}];
    let state = input;
    for (let i = 0; i < 100; i += 1) state = sanitizeQuickActions(state).items;
    assert.equal(state.length, 1);
    assert.deepEqual(state[0].targets, ["desktop", "mobile"]);
});

test("long run: provider reload cycles keep one bounded candidate set", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: Array.from({length: 100}, (_, i) => ({value: `v${i}`}))};
    for (let i = 0; i < 50; i += 1) {
        registry.register(provider, () => "ok");
        registry.unregister("p");
    }
    registry.register(provider);
    assert.equal(registry.list(64).length, 64);
    assert.equal(registry.snapshot().length, 1);
});

test("long run: malformed imports do not grow persisted state", () => {
    const bad = Array.from({length: 500}, () => null);
    const output = sanitizeQuickActions(bad);
    assert.deepEqual(output.items, []);
    assert.equal(output.changed, true);
});
