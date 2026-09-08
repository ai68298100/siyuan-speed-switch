const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, sanitizeQuickActions} = require("../src/quick-actions.js");

test("reload persistence: provider lifecycle never writes callback fields to persisted config", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop"], actions: [{value: "open"}]}, () => "ok");
    const persisted = sanitizeQuickActions(registry.list()).items;
    assert.ok(persisted.every((item) => !Object.prototype.hasOwnProperty.call(item, "callback")));
});

test("reload persistence: repeated unload/reload preserves action order and targets", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", targets: ["desktop", "mobile"], actions: [{value: "open"}, {value: "settings"}]};
    registry.register(provider);
    const first = registry.list().map((item) => ({value: item.value, targets: item.declaredTargets}));
    registry.unregister("p");
    registry.register(provider);
    const second = registry.list().map((item) => ({value: item.value, targets: item.declaredTargets}));
    assert.deepEqual(second, first);
});

test("reload persistence: malformed persisted provider entry is isolated on reload", () => {
    const result = sanitizeQuickActions([{id: "bad", kind: "adapter", value: "", label: "bad"}, {id: "ok", kind: "adapter", value: "p/open", label: "ok"}]);
    assert.deepEqual(result.items.map((item) => item.id), ["ok"]);
});
