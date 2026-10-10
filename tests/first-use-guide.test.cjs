// T-7236：首次使用引导契约（共享帮助入口 + 第一面板空态 CTA）。
// 这些断言直接读取生产源码，防止入口只存在于设计文案而没有实际点击路径。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceText} = require('./source-scan.cjs');

const indexSource = readSourceText('src/index.ts');
const secondPanelSource = readSourceText('src/second-panel-ui.ts');

function emptyStateSource() {
    const start = indexSource.indexOf('private buildEmptyState(');
    assert.ok(start >= 0, '第一面板必须保留空态构建入口');
    const end = indexSource.indexOf('\n    private handleTogglePin(', start);
    assert.ok(end > start, '第一面板空态入口必须有可审计的结束边界');
    return indexSource.slice(start, end);
}

function hasDataAction(source, action) {
    const quoted = action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`addAction\\(\\s*["']${quoted}["']\\s*,`).test(source);
}

function assertHelpButtonMarkup(source) {
    assert.ok(/sw-platform-header__help(?![\w-])/.test(source),
        '帮助按钮必须使用共享顶栏样式钩子');
    assert.ok(/iconHelp/.test(source),
        '帮助按钮必须使用帮助图标');
    assert.ok(/setAttribute\("aria-label",\s*helpLabel\)/.test(source),
        '帮助按钮必须暴露可访问名称');
    assert.ok(/title\s*=\s*helpLabel/.test(source),
        '帮助按钮必须提供悬停说明');
    assert.ok(/addEventListener\("click",\s*\(\)\s*=>\s*options\.onHelp\?\.\(\)\)/.test(source),
        '帮助按钮点击必须调用传入回调');
}

function assertPlatformHelpContract(source) {
    assert.ok(/onHelp\?:\s*\(\)\s*=>\s*void;/.test(source),
        '共享顶栏选项必须接受帮助回调');
    assert.ok(/helpLabel\?:\s*string;/.test(source),
        '共享顶栏选项必须接受帮助按钮的可访问名称');
    assertHelpButtonMarkup(source);
}

function assertEmptyActions(source) {
    for (const action of ['focus-search', 'open-workbench', 'open-studio', 'open-guide']) {
        assert.equal(hasDataAction(source, action), true,
            `第一面板空态必须提供 ${action} CTA`);
    }
    assert.ok(/button\.dataset\.action\s*=\s*action;/.test(source),
        'CTA 必须暴露稳定 data-action 标识');
    assert.ok(/button\.setAttribute\("aria-label",\s*label\);/.test(source),
        'CTA 必须提供屏幕阅读器可读名称');
    assert.ok(/addEventListener\("click"/.test(source),
        '第一面板空态 CTA 必须有点击处理');
    assert.ok(/addAction\("focus-search"[\s\S]*?\.sw__search["']\)\?\.focus/.test(source),
        '聚焦搜索 CTA 必须把焦点送回搜索框');
    assert.ok(/addAction\("open-workbench"[\s\S]*?openPlatformSurface\("workbench"/.test(source),
        '工作台 CTA 必须调用现有工作台入口');
    assert.ok(/addAction\("open-studio"[\s\S]*?openPlatformSurface\("studio"/.test(source),
        '片段实验室 CTA 必须调用现有片段入口');
    assert.ok(/addAction\("open-guide"[\s\S]*?openPlatformGuide\(/.test(source),
        '帮助 CTA 必须调用本地功能介绍入口');
}

test('shared platform chrome exposes an always-available help action (T-7236)', () => {
    const start = indexSource.indexOf('export function mountPlatformChrome');
    const end = indexSource.indexOf('\ndeclare module "./snippet-studio-ui"', start);
    assert.ok(start >= 0 && end > start, '共享顶栏实现必须有可审计边界');
    const chrome = indexSource.slice(start, end);
    const options = indexSource.slice(0, start);
    assertPlatformHelpContract(options + chrome);
});

test('switcher and workbench wire the shared help action to the local guide (T-7236)', () => {
    assert.match(indexSource, /surface:\s*"switcher"[\s\S]*?onHelp:\s*\(\)\s*=>\s*this\.openPlatformGuide\(/,
        '第一面板必须把帮助入口接到本地功能介绍');
    assert.match(secondPanelSource, /surface:\s*"workbench"[\s\S]*?onHelp:\s*\(\)\s*=>\s*this\.openPlatformGuide\?\.\(/,
        '第二面板必须把帮助入口接到本地功能介绍');
});

test('empty switcher state offers a concrete first action for each surface (T-7236)', () => {
    const empty = emptyStateSource();
    assertEmptyActions(empty);
});

test('guide contracts fail when production source loses a help affordance or CTA (negative verification)', () => {
    const start = indexSource.indexOf('export function mountPlatformChrome');
    const end = indexSource.indexOf('\ndeclare module "./snippet-studio-ui"', start);
    const chrome = indexSource.slice(start, end);
    const withoutHelp = chrome.replace(/sw-platform-header__help/g, 'sw-platform-header__help-removed');
    assert.throws(() => assertHelpButtonMarkup(withoutHelp), /帮助按钮必须使用共享顶栏样式钩子/,
        '删除真实帮助入口后，帮助契约必须以目标断言失败');
    assertPlatformHelpContract(indexSource.slice(0, start) + chrome);

    const empty = emptyStateSource();
    const withoutWorkbench = empty.replace(/open-workbench/g, 'removed-workbench-action');
    assert.throws(() => assertEmptyActions(withoutWorkbench), /第一面板空态必须提供 open-workbench CTA/,
        '删除真实工作台 CTA 后，空态契约必须以目标断言失败');
    assertEmptyActions(empty);
});
