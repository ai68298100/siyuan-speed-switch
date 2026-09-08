const test = require("node:test");
const assert = require("node:assert/strict");
const {shouldRenderQuickAction, resolveQuickActionSupport, createQuickActionRegistry} = require("../src/quick-actions.js");

function visible(action, surface, mode = "full") {
    if (mode === "hidden") return false;
    return shouldRenderQuickAction(action, surface);
}

test("render consistency: full/icon/hidden modes share the same capability filter", () => {
    const action = {kind: "builtin", value: "journal", targets: ["desktop", "mobile"], enabled: true};
    assert.equal(visible(action, "desktop", "full"), true);
    assert.equal(visible(action, "mobile", "icon"), true);
    assert.equal(visible(action, "sidebar", "full"), false);
    assert.equal(visible(action, "desktop", "hidden"), false);
});

test("render consistency: disabled and unknown mobile actions never become executable", () => {
    const disabled = {kind: "command", value: "plugin/open", targets: ["desktop", "mobile"], enabled: false};
    assert.equal(visible(disabled, "desktop"), false);
    assert.equal(resolveQuickActionSupport("command", disabled.value, "mobile"), "unknown");
});

test("render consistency: collapsed presentation hides text but preserves icon eligibility", () => {
    const action = {kind: "adapter", value: "open", targets: ["desktop"], enabled: true};
    assert.equal(visible(action, "desktop", "icon"), true);
    assert.equal(visible(action, "mobile", "icon"), false);
});

test("render consistency: unavailable provider handler is filtered at execution", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", targets: ["desktop"], actions: [{value: "open"}]}, () => "ok");
    const candidate = registry.list()[0];
    registry.unregister("p");
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});
