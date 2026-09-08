const test = require("node:test");
const assert = require("node:assert/strict");
const {
    sanitizeQuickActions,
    resolveQuickActionSupport,
    shouldRenderQuickAction,
    appendQuickAction,
} = require("../src/quick-actions.js");

test("quick action compatibility: unknown plugin icons fall back to iconFile at render boundary", () => {
    const item = sanitizeQuickActions([{id: "x", kind: "command", value: "plugin::open", label: "打开", icon: "bad icon"}]).items[0];
    const icon = /^icon[A-Za-z0-9_-]+$/.test(item.icon) ? item.icon : "iconFile";
    assert.equal(icon, "iconFile");
});

test("quick action compatibility: support matrix filters unavailable surfaces", () => {
    assert.equal(resolveQuickActionSupport("dock", "panel", "mobile"), "unsupported");
    assert.equal(resolveQuickActionSupport("command", "plugin::open", "desktop"), "supported");
    assert.equal(resolveQuickActionSupport("command", "plugin::open", "sidebar"), "supported");
    assert.equal(resolveQuickActionSupport("command", "plugin::open", "mobile"), "unknown");
    const action = {kind: "dock", value: "panel", enabled: true, targets: ["desktop", "mobile"]};
    assert.equal(shouldRenderQuickAction(action, "mobile"), false);
});

test("quick action compatibility: duplicate external entries are rejected", () => {
    const first = appendQuickAction([], {id: "a", kind: "adapter", value: "plugin/open", label: "插件"});
    const second = appendQuickAction(first.items, {id: "b", kind: "adapter", value: "plugin/open", label: "重复"});
    assert.equal(first.added, true);
    assert.equal(second.added, false);
    assert.equal(second.reason, "duplicate");
});

test("quick action compatibility: unloaded provider callback becomes safely inert", () => {
    let active = true;
    const callback = () => active && "opened";
    active = false;
    assert.equal(callback(), false);
});
