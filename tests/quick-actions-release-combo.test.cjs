const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, resolveQuickActionSupport, shouldRenderQuickAction, createQuickActionRegistry} = require("../src/quick-actions.js");

test("release combo: builtin, dock, adapter and command resolve surface capabilities", () => {
    assert.equal(resolveQuickActionSupport("builtin", "journal", "mobile"), "supported");
    assert.equal(resolveQuickActionSupport("dock", "outline", "mobile"), "unsupported");
    assert.equal(resolveQuickActionSupport("adapter", "checkin/open", "mobile", ["desktop", "mobile"]), "supported");
    assert.equal(resolveQuickActionSupport("command", "plugin/open", "mobile"), "unknown");
});

test("release combo: rendering respects enabled state and configured targets", () => {
    const action = {kind: "adapter", value: "open", targets: ["desktop"], enabled: true};
    assert.equal(shouldRenderQuickAction(action, "desktop"), true);
    assert.equal(shouldRenderQuickAction(action, "mobile"), false);
    assert.equal(shouldRenderQuickAction({...action, enabled: false}, "desktop"), false);
});

test("release combo: persisted entries cap at twelve and downgrade unsafe icons", () => {
    const result = sanitizeQuickActions(Array.from({length: 20}, (_, i) => ({id: `x${i}`, kind: "command", value: `x${i}`, label: "入口", icon: "unsafe"})));
    assert.equal(result.items.length, 12);
    assert.ok(result.items.every((item) => item.icon === "iconPlugin"));
});

test("release combo: unload and handler failure both return safe execution errors", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "bad", name: "Bad", actions: [{value: "open"}]}, () => { throw new Error("fail"); });
    const bad = registry.list()[0];
    assert.deepEqual(registry.invoke(bad), {ok: false, reason: "failed"});
    registry.unregister("bad");
    assert.deepEqual(registry.invoke(bad), {ok: false, reason: "unavailable"});
});
