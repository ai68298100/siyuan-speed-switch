const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, getDefaultQuickActions, graphemeLength} = require("../src/quick-actions.js");

test("quick actions: missing storage returns safe defaults", () => {
    const result = sanitizeQuickActions(undefined);
    assert.equal(result.changed, false);
    assert.equal(result.items.length, 4);
    assert.equal(result.items[0].value, "switcher");
});

test("quick actions: invalid entries and duplicate ids are removed", () => {
    const result = sanitizeQuickActions([
        {id: "a", kind: "builtin", value: "journal", label: "日记", targets: ["desktop"], order: 10, enabled: true},
        {id: "a", kind: "builtin", value: "settings"},
        {id: "bad", kind: "builtin", value: "runAnything"},
        null,
    ]);
    assert.equal(result.changed, true);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, "a");
});

test("quick actions: labels are capped by grapheme, icons are constrained", () => {
    const result = sanitizeQuickActions([{id: "x", kind: "dock", value: "outline", label: "一二三四五", icon: "not-safe"}]);
    assert.equal(result.items[0].label, "一二三四");
    assert.equal(result.items[0].icon, "iconDock");
    assert.equal(graphemeLength("👨‍👩‍👧‍👦"), 1);
});

test("quick actions: composed emoji labels are not split", () => {
    const result = sanitizeQuickActions([{id: "emoji", kind: "dock", value: "outline", label: "👨‍👩‍👧‍👦入口"}]);
    assert.equal(result.items[0].label, "👨‍👩‍👧‍👦入口");
});

test("quick actions: defaults are cloned", () => {
    const a = getDefaultQuickActions();
    a[0].label = "改";
    assert.equal(getDefaultQuickActions()[0].label, "切换");
});

test("quick actions: adapter actions keep only serializable routing data", () => {
    const result = sanitizeQuickActions([{id: "plugin-x", kind: "adapter", value: "plugin-x/open", label: "插件", targets: ["desktop", "unknown"], order: 3, enabled: true}]);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0].targets, ["desktop"]);
    assert.equal(result.items[0].value, "plugin-x/open");
});

test("quick actions: external plugin commands are retained", () => {
    const result = sanitizeQuickActions([{id: "command-clock-open", kind: "command", value: "siyuan-clock::open", label: "打卡", targets: ["desktop", "mobile"], order: 5, enabled: true}]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].kind, "command");
    assert.equal(result.items[0].value, "siyuan-clock::open");
});

test("quick actions: an explicit empty list stays empty", () => {
    const result = sanitizeQuickActions([]);
    assert.equal(result.changed, false);
    assert.deepEqual(result.items, []);
});
