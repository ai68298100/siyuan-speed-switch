// T-7340 Action Palette 面板 DOM 模型层契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/action-palette-panel.js；
//   - 覆盖桌面/侧栏/移动三端、a11y 契约、分区分组、空态与选中态；
//   - 负向探针在文件末尾独立执行。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PANEL_SECTION_ORDER,
    PANEL_CLASSNAMES,
    buildActionPalettePanelModel,
    assertActionPalettePanelContract,
} = require("../src/action-palette-panel.js");
const {createPaletteNavigationState} = require("../src/action-palette-navigation.js");

const MOCK_ACTIONS = [
    {id: "open-right", section: "open", label: "右侧分栏打开", icon: "iconLayoutRight", shortcut: "⌘↵"},
    {id: "open-bottom", section: "open", label: "底部分栏打开", icon: "iconLayoutBottom", shortcut: "⌥↵"},
    {id: "copy-id", section: "copy", label: "复制 ID", icon: "iconCopy", shortcut: "⌥C"},
    {id: "close-tab", section: "manage", label: "关闭页签", icon: "iconClose", shortcut: "⌘W", isDestructive: true},
];

test("T-7340: buildActionPalettePanelModel groups by section in canonical order", () => {
    const state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    const model = buildActionPalettePanelModel(state, {platform: "desktop", idSuffix: "test"});

    // 1. 根属性：role=dialog + aria-modal
    assert.equal(model.attrs.root.role, "dialog");
    assert.equal(model.attrs.root["aria-modal"], "true");
    assert.equal(model.attrs.root.className, "sw__palette sw__palette--desktop");
    assert.equal(model.attrs.root.id, "sw-palette-test-root");
    assert.equal(model.attrs.root.tabindex, "-1");

    // 2. sections 按 open/copy/manage 顺序排列
    assert.equal(model.sections.length, 3);
    assert.deepEqual(model.sections.map((s) => s.key), ["open", "copy", "manage"]);
    assert.equal(model.sections[0].items.length, 2);
    assert.equal(model.sections[1].items.length, 1);
    assert.equal(model.sections[2].items.length, 1);

    // 3. section 自身的 a11y 契约
    assert.equal(model.sections[0].attrs.role, "group");
    assert.equal(model.sections[0].attrs["aria-label"], "打开类动作");
    assert.equal(model.sections[1].attrs["aria-label"], "复制类动作");
    assert.equal(model.sections[2].attrs["aria-label"], "管理类动作");
});

test("T-7340: buildActionPalettePanelModel marks selected item with aria-selected", () => {
    let state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    // 初始光标 = 0，对应 open-right
    let model = buildActionPalettePanelModel(state, {platform: "desktop", idSuffix: "x"});
    const firstSelected = model.sections[0].items.find((item) => item.attrs["aria-selected"] === "true");
    assert.ok(firstSelected, "必须存在 aria-selected=true 的项");
    assert.equal(firstSelected.attrs["data-action-id"], "open-right");
    assert.equal(firstSelected.attrs.className.includes("is-selected"), true);

    // 移动光标到第 2 项（copy-id）
    state = {...state, selectedIndex: 2};
    model = buildActionPalettePanelModel(state, {platform: "desktop", idSuffix: "x"});
    const secondSelected = model.sections[1].items.find((item) => item.attrs["aria-selected"] === "true");
    assert.ok(secondSelected, "光标移动后必须有新的选中项");
    assert.equal(secondSelected.attrs["data-action-id"], "copy-id");
    assert.equal(model.attrs.search["aria-activedescendant"], "sw-palette-x-item-2");
});

test("T-7340: buildActionPalettePanelModel tags destructive actions", () => {
    const state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    const model = buildActionPalettePanelModel(state, {platform: "desktop", idSuffix: "x"});
    const closeTabItem = model.sections[2].items.find((item) => item.attrs["data-action-id"] === "close-tab");
    assert.equal(closeTabItem.attrs["data-is-destructive"], "true");
    assert.equal(closeTabItem.attrs.className.includes("is-destructive"), true);
});

test("T-7340: buildActionPalettePanelModel handles empty action list and platform variations", () => {
    const state = createPaletteNavigationState([], {isOpen: true});
    const model = buildActionPalettePanelModel(state, {platform: "mobile", idSuffix: "m"});
    assert.equal(model.empty, true);
    assert.equal(model.emptyHint, "无可用动作");
    assert.equal(model.sections.length, 0);
    // 移动端不应启用 aria-modal（与平台模态/非模态约定一致）
    assert.equal(model.attrs.root["aria-modal"], "false");

    // 三个端侧 className 都必须存在且与 PANEL_CLASSNAMES 字典一致
    for (const platform of Object.keys(PANEL_CLASSNAMES)) {
        const m = buildActionPalettePanelModel(state, {platform, idSuffix: platform});
        assert.equal(m.attrs.root.className, PANEL_CLASSNAMES[platform]);
    }
});

test("T-7340: assertActionPalettePanelContract validates minimum panel contract", () => {
    const state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    const ok = buildActionPalettePanelModel(state, {platform: "desktop", idSuffix: "ok"});
    assert.equal(assertActionPalettePanelContract(ok), true);

    // 缺失关键属性必须拒绝
    const broken = JSON.parse(JSON.stringify(ok));
    delete broken.attrs.root.role;
    assert.equal(assertActionPalettePanelContract(broken), false, "缺失 role=dialog 必须被拒");
});

// ==================== 负向探针 ====================
test("T-7340 negative probes: panel contract integrity", () => {
    // 探针 1：缺失状态对象必须抛错
    let thrown = false;
    try {
        buildActionPalettePanelModel(null, {platform: "desktop"});
    } catch (_) { thrown = true; }
    assert.equal(thrown, true, "缺失状态必须抛错");

    // 探针 2：不支持的端侧必须抛错
    let platformError = false;
    try {
        buildActionPalettePanelModel(createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true}), {platform: "vr-headset"});
    } catch (_) { platformError = true; }
    assert.equal(platformError, true, "非法端侧必须抛错");

    // 探针 3：text/icon/shortcut 必须受 boundedText 钳制（空字符串与过长文本）
    const dirtyAction = [{
        id: "a", section: "open", label: "x".repeat(5000), icon: "x".repeat(5000), shortcut: "x".repeat(5000),
    }];
    const model = buildActionPalettePanelModel(
        createPaletteNavigationState(dirtyAction, {isOpen: true}),
        {platform: "desktop", idSuffix: "c"}
    );
    assert.ok(model.sections[0].items[0].text.length <= 96, "label 必须被钳制");
    assert.ok(model.sections[0].items[0].icon.length <= 32, "icon 必须被钳制");
    assert.ok(model.sections[0].items[0].shortcut.length <= 32, "shortcut 必须被钳制");

    // 探针 4：不在 PANEL_SECTION_ORDER 内的 section 必须被剔除
    const oddAction = [{id: "x", section: "weird", label: "异常"}];
    const m = buildActionPalettePanelModel(
        createPaletteNavigationState(oddAction, {isOpen: true}),
        {platform: "desktop", idSuffix: "o"}
    );
    assert.equal(m.sections.length, 0, "未知 section 必须被剔除");
});
