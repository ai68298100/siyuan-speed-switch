// T-7339 Action Palette 键盘导航状态机契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/action-palette-navigation.js；
//   - 覆盖画板唤出、关闭、上下循环导航、查询更新与回车执行；
//   - 负向探针在文件末尾独立执行：空动作越界防线、非打开状态不拦截、空动作按回车无副作用等。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PALETTE_KEY_ACTIONS,
    createPaletteNavigationState,
    updatePaletteQuery,
    movePaletteSelection,
    dispatchPaletteKey,
} = require("../src/action-palette-navigation.js");

const MOCK_ACTIONS = [
    {id: "open-right", label: "在右侧分栏打开", shortcut: "⌘↵"},
    {id: "copy-id", label: "复制 ID", shortcut: "⌥C"},
    {id: "close-tab", label: "关闭页签", shortcut: "⌘W"},
];

test("T-7339: createPaletteNavigationState initializes safe bounds", () => {
    const state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: false});
    assert.equal(state.isOpen, false);
    assert.equal(state.query, "");
    assert.equal(state.allActions.length, 3);
    assert.equal(state.filteredActions.length, 3);
    assert.equal(state.selectedIndex, 0, "有动作项时初始光标必须为 0");

    // 空动作列表
    const empty = createPaletteNavigationState([]);
    assert.equal(empty.selectedIndex, -1, "无动作项时光标必须为 -1");
    assert.equal(empty.filteredActions.length, 0);
});

test("T-7339: updatePaletteQuery filters actions and resets cursor", () => {
    let state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    state = movePaletteSelection(state, 2); // 移动到最后一项
    assert.equal(state.selectedIndex, 2);

    // 更新查询为 "复制"
    state = updatePaletteQuery(state, "复制");
    assert.equal(state.query, "复制");
    assert.equal(state.filteredActions.length, 1);
    assert.equal(state.filteredActions[0].id, "copy-id");
    assert.equal(state.selectedIndex, 0, "更新查询后光标必须重置为 0");

    // 查询无结果
    state = updatePaletteQuery(state, "完全不匹配的字符");
    assert.equal(state.filteredActions.length, 0);
    assert.equal(state.selectedIndex, -1, "过滤为空时光标必须回退到 -1");
});

test("T-7339: movePaletteSelection wraps around both forward and backward", () => {
    let state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    assert.equal(state.selectedIndex, 0);

    // 向下移动：0 -> 1 -> 2 -> 0 (循环包裹)
    state = movePaletteSelection(state, 1);
    assert.equal(state.selectedIndex, 1);
    state = movePaletteSelection(state, 1);
    assert.equal(state.selectedIndex, 2);
    state = movePaletteSelection(state, 1);
    assert.equal(state.selectedIndex, 0, "末项向下移动必须循环回到第一项");

    // 向上移动：0 -> 2 (反向循环包裹)
    state = movePaletteSelection(state, -1);
    assert.equal(state.selectedIndex, 2, "首项向上移动必须循环回到末项");
});

test("T-7339: dispatchPaletteKey toggles palette with Tab and Cmd+K", () => {
    let state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: false});

    // 1. Tab 键唤出画板
    let res = dispatchPaletteKey(state, {key: "Tab", shiftKey: false});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.TOGGLE);
    assert.equal(res.state.isOpen, true);
    state = res.state;

    // 2. ⌘+K 收起画板
    res = dispatchPaletteKey(state, {key: "k", metaKey: true});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.TOGGLE);
    assert.equal(res.state.isOpen, false);
    state = res.state;

    // 3. ⌃+K 再次唤出画板
    res = dispatchPaletteKey(state, {key: "k", ctrlKey: true});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.TOGGLE);
    assert.equal(res.state.isOpen, true);
});

test("T-7339: dispatchPaletteKey navigates, executes, and closes", () => {
    let state = createPaletteNavigationState(MOCK_ACTIONS, {
        isOpen: true,
        targetContext: {kind: "tab", rootId: "doc-123"},
    });

    // 1. ArrowDown 移动光标
    let res = dispatchPaletteKey(state, {key: "ArrowDown"});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.NAVIGATE);
    assert.equal(res.state.selectedIndex, 1);
    state = res.state;

    // 2. Ctrl+P 向上移动光标
    res = dispatchPaletteKey(state, {key: "p", ctrlKey: true});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.NAVIGATE);
    assert.equal(res.state.selectedIndex, 0);
    state = res.state;

    // 3. Enter 执行当前选中项
    res = dispatchPaletteKey(state, {key: "Enter"});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.EXECUTE);
    assert.equal(res.payload.action.id, "open-right");
    assert.equal(res.payload.targetContext.rootId, "doc-123");
    assert.equal(res.state.isOpen, false, "执行后画板应关闭");

    // 4. Escape 关闭画板
    state = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: true});
    res = dispatchPaletteKey(state, {key: "Escape"});
    assert.equal(res.intent, PALETTE_KEY_ACTIONS.CLOSE);
    assert.equal(res.state.isOpen, false);
});

// ==================== 负向探针（门禁自查 §核心原则） ====================
test("T-7339 negative probes: navigation bounds and state isolation", () => {
    // 探针 1：画板未打开时，ArrowDown 不得拦截并返回 noop
    const closedState = createPaletteNavigationState(MOCK_ACTIONS, {isOpen: false});
    const ignored = dispatchPaletteKey(closedState, {key: "ArrowDown"});
    assert.equal(ignored.intent, PALETTE_KEY_ACTIONS.NOOP,
        "负向探针 1 失败：未打开状态拦截了方向键");

    // 探针 2：空动作列表按下回车不得触发 EXECUTE
    const emptyState = createPaletteNavigationState([], {isOpen: true});
    const enterRes = dispatchPaletteKey(emptyState, {key: "Enter"});
    assert.equal(enterRes.intent, PALETTE_KEY_ACTIONS.NOOP,
        "负向探针 2 失败：空动作列表触发了动作执行");

    // 探针 3：空过滤列表的索引始终保底为 -1
    const noMatchState = updatePaletteQuery(createPaletteNavigationState(MOCK_ACTIONS), "xyz999");
    assert.equal(noMatchState.selectedIndex, -1,
        "负向探针 3 失败：无匹配项时光标未保持为 -1");

    // 探针 4：移动空状态光标不得产生 NaN 或越界数字
    const movedEmpty = movePaletteSelection(noMatchState, 1);
    assert.equal(movedEmpty.selectedIndex, -1,
        "负向探针 4 失败：空状态移动光标产生了越界值");

    // 探针 5：非法 event 必须安全返回 noop
    const invalidEvent = dispatchPaletteKey(closedState, null);
    assert.equal(invalidEvent.intent, PALETTE_KEY_ACTIONS.NOOP);
});
