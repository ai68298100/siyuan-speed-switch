const test = require("node:test");
const assert = require("node:assert/strict");
const {getDefaultQuickActionTargets, resolveQuickActionSupport, createQuickActionRegistry} = require("../src/quick-actions.js");

test("capability hints: ordinary commands default to desktop/sidebar", () => {
    assert.deepEqual(getDefaultQuickActionTargets("command", "plugin/open"), ["desktop", "sidebar"]);
});

test("capability hints: unsupported dock and unknown mobile command are distinct", () => {
    assert.equal(resolveQuickActionSupport("dock", "panel", "mobile"), "unsupported");
    assert.equal(resolveQuickActionSupport("command", "plugin/open", "mobile"), "unknown");
});

test("capability hints: unavailable execution degrades without throwing", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]});
    const candidate = registry.list()[0];
    registry.unregister("p");
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});
