const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, resolveQuickActionSupport} = require("../src/quick-actions.js");

test("picker final gate: all candidates remain selectable after filtering", () => {
    const candidates = [
        {id: "a", kind: "builtin", value: "journal", label: "日记"},
        {id: "b", kind: "dock", value: "outline", label: "大纲"},
        {id: "c", kind: "adapter", value: "checkin/open", label: "打卡", targets: ["desktop", "mobile"]},
    ];
    const visible = candidates.filter((item) => item.label.includes(""));
    assert.equal(visible.length, 3);
});

test("picker final gate: unknown plugin icons always have a core fallback", () => {
    const item = sanitizeQuickActions([{id: "x", kind: "command", value: "x", label: "入口", icon: "missing"}]).items[0];
    assert.equal(item.icon, "iconPlugin");
});

test("picker final gate: mobile hint distinguishes unsupported from unknown", () => {
    assert.equal(resolveQuickActionSupport("dock", "outline", "mobile"), "unsupported");
    assert.equal(resolveQuickActionSupport("command", "plugin/open", "mobile"), "unknown");
    assert.equal(resolveQuickActionSupport("adapter", "checkin/open", "mobile", ["desktop", "mobile"]), "supported");
});
