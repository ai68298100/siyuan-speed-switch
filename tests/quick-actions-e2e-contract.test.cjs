const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, sanitizeQuickActions, resolveQuickActionSupport} = require("../src/quick-actions.js");

test("provider e2e contract: candidates expose execution-safe fields", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop"], actions: [{value: "open", label: "打开", icon: "missing"}]}, () => "ok");
    const candidate = registry.list()[0];
    assert.deepEqual(Object.keys(candidate).sort(), ["declaredTargets", "icon", "kind", "label", "providerId", "value"].sort());
    assert.deepEqual(registry.invoke(candidate), {ok: true, result: "ok"});
});

test("provider e2e contract: old handler cannot run after unregister/re-register", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "p", name: "P", actions: [{value: "open"}]};
    let calls = 0;
    registry.register(provider, () => { calls += 1; return "old"; });
    const candidate = registry.list()[0];
    registry.unregister("p");
    registry.register(provider, () => { calls += 10; return "new"; });
    assert.deepEqual(registry.invoke(candidate), {ok: true, result: "new"});
    assert.equal(calls, 10);
});

test("provider e2e contract: unknown mobile commands stay visibly unknown", () => {
    assert.equal(resolveQuickActionSupport("command", "plugin/open", "mobile"), "unknown");
});

test("provider e2e contract: icon fallback and candidate upper bound hold together", () => {
    const actions = sanitizeQuickActions(Array.from({length: 20}, (_, i) => ({id: `p${i}`, kind: "command", value: `p${i}`, label: "入口", icon: "bad"})), 12).items;
    assert.equal(actions.length, 12);
    assert.ok(actions.every((item) => item.icon === "iconPlugin"));
});

test("provider e2e contract: handler exceptions are isolated from subsequent execution", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "bad", name: "Bad", actions: [{value: "open"}]}, () => { throw new Error("boom"); });
    registry.register({id: "good", name: "Good", actions: [{value: "open"}]}, () => "ok");
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: false, reason: "failed"});
    assert.deepEqual(registry.invoke(registry.list()[1]), {ok: true, result: "ok"});
});
