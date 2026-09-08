const test = require("node:test");
const assert = require("node:assert/strict");
const {appendQuickAction, sanitizeQuickActions, getDefaultQuickActionTargets} = require("../src/quick-actions.js");

test("surface publish contract: add entry has conservative defaults by surface", () => {
    assert.deepEqual(getDefaultQuickActionTargets("command", "plugin/open"), ["desktop", "sidebar"]);
    assert.deepEqual(getDefaultQuickActionTargets("adapter", "plugin/open", ["desktop", "mobile"]), ["desktop", "mobile"]);
});

test("surface publish contract: mobile-safe adapter remains after save migration", () => {
    const added = appendQuickAction([], {id: "p", kind: "adapter", value: "p/open", label: "入口", declaredTargets: ["mobile"]});
    const saved = sanitizeQuickActions(added.items).items[0];
    assert.deepEqual(saved.targets, ["mobile"]);
});

test("surface publish contract: icon mode and collapsed mode preserve action identity", () => {
    const action = appendQuickAction([], {id: "p", kind: "command", value: "p/open", label: "入口"}).items[0];
    const iconMode = {mode: "icon", actionId: action.id, expanded: false};
    assert.equal(iconMode.actionId, action.id);
    assert.equal(iconMode.expanded, false);
});

test("surface publish contract: saved configuration can refresh all surfaces deterministically", () => {
    const saved = sanitizeQuickActions([
        {id: "a", kind: "builtin", value: "journal", label: "日记", targets: ["desktop", "mobile"]},
        {id: "b", kind: "builtin", value: "settings", label: "设置", targets: ["desktop", "sidebar", "mobile"]},
    ]).items;
    assert.deepEqual(saved.map((item) => item.id), ["a", "b"]);
    assert.deepEqual(saved[1].targets, ["desktop", "sidebar", "mobile"]);
});
