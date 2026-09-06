const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, getDefaultQuickActions, getBuiltinQuickActions, graphemeLength} = require("../src/quick-actions.js");

test("quick actions: missing storage returns safe defaults", () => {
    const result = sanitizeQuickActions(undefined);
    assert.equal(result.changed, false);
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items.map((item) => item.value), ["journal", "settings"]);
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
    assert.equal(getDefaultQuickActions()[0].label, "日记");
});

test("quick actions: empty labels receive an accessible fallback", () => {
    const result = sanitizeQuickActions([{id: "empty-label", kind: "command", value: "checkin::open", label: ""}]);
    assert.equal(result.items[0].label, "chec");
});

test("quick actions: optional built-ins remain available without becoming defaults", () => {
    assert.deepEqual(getDefaultQuickActions().map((item) => item.value), ["journal", "settings"]);
    assert.deepEqual(getBuiltinQuickActions().map((item) => item.value), ["switcher", "search", "journal", "settings"]);
});

test("quick actions: an explicit empty target list stays empty", () => {
    const result = sanitizeQuickActions([
        {id: "parked", kind: "builtin", value: "journal", label: "日记", icon: "iconCalendar", targets: [], order: 10, enabled: true},
    ]);
    assert.deepEqual(result.items[0].targets, []);
});

test("quick actions: legacy switcher and search entries are retained", () => {
    const result = sanitizeQuickActions([
        {id: "switcher", kind: "builtin", value: "switcher", label: "切换", targets: ["desktop"], order: 10, enabled: true},
        {id: "search", kind: "builtin", value: "search", label: "搜索", targets: ["mobile"], order: 20, enabled: true},
    ]);
    assert.deepEqual(result.items.map((item) => item.value), ["switcher", "search"]);
});

test("quick actions: adapter actions keep only serializable routing data", () => {
    const result = sanitizeQuickActions([{id: "plugin-x", kind: "adapter", value: "plugin-x/open", label: "插件", targets: ["desktop", "unknown"], order: 3, enabled: true}]);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0].targets, ["desktop"]);
    assert.equal(result.items[0].value, "plugin-x/open");
    assert.equal(result.items[0].icon, "iconPlugin");
});

test("quick actions: removed iconCommand fallback migrates to a real plugin icon", () => {
    const result = sanitizeQuickActions([{id: "legacy-command", kind: "command", value: "plugin::open", label: "打开", icon: "iconCommand"}]);
    assert.equal(result.items[0].icon, "iconPlugin");
    assert.equal(result.changed, true);
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
