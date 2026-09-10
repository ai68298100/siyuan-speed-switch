const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, createQuickActionRegistry, resolveQuickActionSupport} = require("../src/quick-actions.js");

test("release suite: normalized persistence and runtime registry remain separate", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop", "mobile"], actions: [{value: "open", callback: () => "bad"}]}, () => "ok");
    const persisted = sanitizeQuickActions(registry.list()).items;
    assert.equal(Object.prototype.hasOwnProperty.call(persisted[0], "callback"), false);
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: true, result: "ok"});
});

test("release suite: all safety boundaries compose without expanding surfaces", () => {
    const items = sanitizeQuickActions(Array.from({length: 30}, (_, i) => ({id: `p${i}`, kind: "command", value: `p${i}`, label: "入口", icon: "bad", targets: ["desktop", "mobile"]})), 12).items;
    assert.equal(items.length, 12);
    assert.ok(items.every((item) => item.icon === "iconPlugin"));
    assert.equal(resolveQuickActionSupport("command", "p0", "mobile"), "unknown");
});

test("release suite: malformed migration is isolated and valid defaults remain recoverable", () => {
    const result = sanitizeQuickActions([null, {id: "bad", kind: "builtin", value: "invalid"}]);
    assert.deepEqual(result.items, []);
    const defaults = sanitizeQuickActions(undefined).items;
    assert.deepEqual(defaults.map((item) => item.value), ["search", "journal", "settings"]);
});
