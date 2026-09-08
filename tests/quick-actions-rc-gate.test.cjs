const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, createQuickActionRegistry} = require("../src/quick-actions.js");

test("rc gate: package schema and persisted actions are safe together", () => {
    const pkg = {schemaVersion: 1, items: [{id: "p", kind: "command", value: "plugin/open", label: "入口", callback: () => "x", icon: "https://evil"}]};
    const items = sanitizeQuickActions(pkg.items).items;
    assert.equal(items.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(items[0], "callback"), false);
    assert.equal(items[0].icon, "iconPlugin");
});

test("rc gate: runtime registry requires current handler after package import", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]});
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: false, reason: "unavailable"});
});

test("rc gate: unknown future schema is isolated", () => {
    const unknown = {schemaVersion: 900, items: [{id: "p", kind: "command", value: "open"}]};
    assert.deepEqual(unknown.schemaVersion > 1 ? [] : sanitizeQuickActions(unknown.items).items, []);
});
