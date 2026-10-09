// T-7040：排序/分组浮层生命周期契约——浮层挂 document.body 且监听注册在
// document/window，bindSortTriggerMenu 必须返回 disposer 并被桌面释放链与
// 侧栏释放通道消费；关闭时焦点回归触发按钮。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const src = readSourceFile('src/index.ts');

test('sort menu lifecycle: bindSortTriggerMenu returns an owner disposer', () => {
    assert.match(src, /applyGroupChange: \(nextGroup: TabGroupMode\) => void,\s*\n\s*\): \(\) => void \{/,
        'bindSortTriggerMenu 必须声明返回 disposer');
    assert.match(src, /const disposeSortMenu = \(\) => \{ closePanel\(\); \};/,
        '必须提供 owner disposer（幂等关面板 + 摘全局监听）');
    assert.match(src, /resizeHandler = positionPanel;\s*\n\s*window\.addEventListener\("resize", resizeHandler\);/,
        '排序浮层必须在挂载后注册窗口尺寸监听');
    assert.match(src, /return disposeSortMenu;\s*\n\s*\}/,
        '函数必须返回 disposer');
});

test('sort menu lifecycle: closing the panel returns focus to the trigger', () => {
    assert.match(src, /const focusInside = panel\.contains\(document\.activeElement\);/,
        '关闭前必须检测焦点是否在浮层内');
    assert.match(src, /if \(focusInside\) \{ try \{ trigger\.focus\(\{preventScroll: true\}\); \} catch \(_\) \{ trigger\.focus\(\); \} \}/,
        '浮层内焦点必须回归触发按钮');
});

test('sort menu lifecycle: desktop dialog release chain disposes the sort menu', () => {
    assert.match(src, /disposeSortMenu = this\.bindSwitcherToolbarActions\(dialog, searchInput, sortSelect, listOpts, closeOverlay, updatedMap, returnTo, context\);/,
        '桌面工具栏装配必须接住 disposer');
    assert.match(src, /disposeHistoryDropdown\(\);\s*\n\s*disposeSortMenu\(\);\s*\n\s*disposeDocSearchSession/,
        '切换器释放链必须调用排序浮层 disposer');
    assert.match(src, /return this\.bindSortTriggerMenu\(dialog\.element, applySortChange, applyGroupChange\);/,
        'bindSwitcherToolbarActions 必须返回排序浮层 disposer');
});

test('sort menu lifecycle: sidebar toolbar composes the sort menu into its dispose channel', () => {
    assert.match(src, /return \(\) => \{\s*\n\s*disposeHistoryDropdown\(\);\s*\n\s*disposeSortMenu\(\);\s*\n\s*\};/,
        '侧栏工具栏必须把排序浮层并入返回的释放通道');
});
