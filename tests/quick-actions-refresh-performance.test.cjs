const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, createQuickActionRegistry} = require("../src/quick-actions.js");

test("refresh performance: normalized snapshot remains bounded for multi-surface publish", () => {
    const input = Array.from({length: 100}, (_, i) => ({id: `p${i}`, kind: "command", value: `p${i}`, label: "入口", targets: ["desktop", "sidebar", "mobile"]}));
    const start = Date.now();
    const items = sanitizeQuickActions(input, 12).items;
    const elapsed = Date.now() - start;
    assert.equal(items.length, 12);
    assert.ok(elapsed < 1000);
});

test("refresh performance: rollback preserves prior snapshot after invalid migration", () => {
    const previous = sanitizeQuickActions([{id: "ok", kind: "builtin", value: "journal", label: "日记"}]).items;
    const imported = sanitizeQuickActions([null, {bad: true}]);
    const effective = imported.items.length === 0 ? previous : imported.items;
    assert.deepEqual(effective, previous);
});

test("refresh performance: registry snapshot scales with bounded candidate count", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: Array.from({length: 100}, (_, i) => ({value: `v${i}`}))});
    assert.equal(registry.list(64).length, 64);
});
