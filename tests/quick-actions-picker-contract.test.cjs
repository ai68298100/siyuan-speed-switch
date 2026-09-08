const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, resolveQuickActionSupport} = require("../src/quick-actions.js");

function filterCandidates(candidates, keyword = "") {
    const key = keyword.trim().toLowerCase();
    return candidates.filter((item) => !key || `${item.label} ${item.secondary || ""}`.toLowerCase().includes(key));
}

test("picker contract: core icon ids survive while unknown plugin icons use fallback", () => {
    const items = sanitizeQuickActions([
        {id: "core", kind: "builtin", value: "journal", label: "日记", icon: "iconCalendar"},
        {id: "plugin", kind: "command", value: "plugin/open", label: "插件", icon: "missing"},
    ]).items;
    assert.equal(items[0].icon, "iconCalendar");
    assert.equal(items[1].icon, "iconPlugin");
});

test("picker contract: candidate filtering is stable and case-insensitive", () => {
    const candidates = [{label: "思播", secondary: "media"}, {label: "思阅", secondary: "reader"}];
    assert.deepEqual(filterCandidates(candidates, "READ"), [candidates[1]]);
});

test("picker contract: capability hint distinguishes unknown mobile command", () => {
    assert.equal(resolveQuickActionSupport("command", "plugin/open", "mobile"), "unknown");
    assert.equal(resolveQuickActionSupport("dock", "panel", "mobile"), "unsupported");
});
