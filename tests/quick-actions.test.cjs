const test = require("node:test");
const assert = require("node:assert/strict");
const {
    sanitizeQuickActions,
    getDefaultQuickActions,
    getBuiltinQuickActions,
    getDefaultQuickActionTargets,
    resolveQuickActionSupport,
    shouldRenderQuickAction,
    appendQuickAction,
    graphemeLength,
} = require("../src/quick-actions.js");

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

test("quick actions: plugin-registered symbol ids survive sanitization", () => {
    const result = sanitizeQuickActions([
        {id: "media", kind: "dock", value: "SiyuanMediaSidebar", label: "思播", icon: "siyuan-media-player-icon"},
        {id: "reader", kind: "adapter", value: "reader/open", label: "思阅", icon: "lucide-book-search"},
    ]);
    assert.equal(result.items[0].icon, "siyuan-media-player-icon");
    assert.equal(result.items[1].icon, "lucide-book-search");
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

test("quick actions: invalid and duplicate entries do not consume the cap", () => {
    const journal = {id: "journal", kind: "builtin", value: "journal", label: "日记", targets: ["desktop"]};
    const settings = {id: "settings", kind: "builtin", value: "settings", label: "设置", targets: ["desktop"]};
    const result = sanitizeQuickActions([
        null,
        {id: "invalid", kind: "builtin", value: "invalid"},
        journal,
        {...journal},
        settings,
        {id: "search", kind: "builtin", value: "search", label: "搜索", targets: ["desktop"]},
    ], 2);
    assert.deepEqual(result.items.map((item) => item.value), ["journal", "settings"]);
    assert.equal(result.changed, true);
});

test("quick actions: truncating valid entries reports a change", () => {
    const result = sanitizeQuickActions(getBuiltinQuickActions(), 2);
    assert.deepEqual(result.items.map((item) => item.value), ["switcher", "search"]);
    assert.equal(result.changed, true);
});

test("quick actions: support matrix keeps unknown mobile commands explicit", () => {
    assert.equal(resolveQuickActionSupport("dock", "outline", "desktop"), "supported");
    assert.equal(resolveQuickActionSupport("dock", "outline", "sidebar"), "supported");
    assert.equal(resolveQuickActionSupport("dock", "outline", "mobile"), "unsupported");
    assert.equal(resolveQuickActionSupport("command", "clock::open", "mobile"), "unknown");
    assert.equal(resolveQuickActionSupport("adapter", "checkin/open", "mobile", ["desktop", "mobile"]), "supported");
    assert.equal(resolveQuickActionSupport("adapter", "checkin/open", "sidebar", ["desktop", "mobile"]), "unsupported");
});

test("quick actions: third-party defaults are conservative and cloned", () => {
    const commandTargets = getDefaultQuickActionTargets("command", "clock::open");
    assert.deepEqual(commandTargets, ["desktop", "sidebar"]);
    commandTargets.push("mobile");
    assert.deepEqual(getDefaultQuickActionTargets("command", "clock::open"), ["desktop", "sidebar"]);
    assert.deepEqual(getDefaultQuickActionTargets("adapter", "checkin/open", ["desktop", "mobile"]), ["desktop", "mobile"]);
});

test("quick actions: redundant switch/search are suppressed only in switcher surfaces", () => {
    const switcher = {kind: "builtin", value: "switcher", targets: ["desktop", "sidebar", "mobile"], enabled: true};
    const search = {kind: "builtin", value: "search", targets: ["desktop", "sidebar", "mobile"], enabled: true};
    const journal = {kind: "builtin", value: "journal", targets: ["desktop", "mobile"], enabled: true};
    assert.equal(shouldRenderQuickAction(switcher, "desktop", "switcher"), false);
    assert.equal(shouldRenderQuickAction(search, "mobile", "switcher"), false);
    assert.equal(shouldRenderQuickAction(search, "sidebar", "switcher"), true);
    assert.equal(shouldRenderQuickAction(journal, "mobile", "switcher"), true);
});

test("quick actions: append rejects duplicates and does not default commands to mobile", () => {
    const original = getDefaultQuickActions();
    const candidate = {id: "command-clock-open", kind: "command", value: "clock::open", label: "打卡", icon: "iconPlugin"};
    const added = appendQuickAction(original, candidate, 12);
    assert.equal(added.added, true);
    assert.deepEqual(added.items.at(-1).targets, ["desktop", "sidebar"]);
    assert.equal(added.items.at(-1).order, 30);
    assert.equal(original.length, 2);
    const duplicate = appendQuickAction(added.items, candidate, 12);
    assert.equal(duplicate.added, false);
    assert.equal(duplicate.reason, "duplicate");
});

test("quick actions: append normalizes external labels and icons", () => {
    const result = appendQuickAction([], {
        id: "plugin-task",
        kind: "command",
        value: "plugin::open\nTask",
        label: "  新建\n任务  ",
        icon: "iconCommand",
    });
    assert.equal(result.added, true);
    assert.equal(result.items[0].label, "新建 任");
    assert.equal(result.items[0].icon, "iconPlugin");
    assert.deepEqual(result.items[0].targets, ["desktop", "sidebar"]);
});
