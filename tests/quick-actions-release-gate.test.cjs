const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, sanitizeQuickActions, resolveQuickActionSupport} = require("../src/quick-actions.js");

test("release gate: declared mobile provider remains explicitly mobile-capable", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop", "mobile"], actions: [{value: "open"}]});
    const candidate = registry.list()[0];
    assert.equal(resolveQuickActionSupport("adapter", candidate.value, "mobile", candidate.declaredTargets), "supported");
});

test("release gate: candidate data is serializable and bounded", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: Array.from({length: 80}, (_, i) => ({value: `a${i}`, callback: () => i}))});
    assert.equal(registry.list(64).length, 64);
    assert.doesNotThrow(() => JSON.stringify(registry.list(64)));
});

test("release gate: icon fallback and surface filtering compose safely", () => {
    const actions = sanitizeQuickActions([{id: "p", kind: "command", value: "p/open", label: "入口", icon: "missing", targets: ["desktop", "mobile"]}]).items;
    assert.equal(actions[0].icon, "iconPlugin");
    assert.equal(resolveQuickActionSupport("command", actions[0].value, "mobile"), "unknown");
});

test("release gate: unregister and re-register isolates stale callbacks", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: [{value: "open"}]};
    registry.register(provider, () => "old");
    const candidate = registry.list()[0];
    registry.unregister("p");
    assert.equal(registry.invoke(candidate).ok, false);
    registry.register(provider, () => "new");
    assert.deepEqual(registry.invoke(candidate), {ok: true, result: "new"});
});
