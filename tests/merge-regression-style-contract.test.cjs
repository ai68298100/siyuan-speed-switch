// 合并回归样式契约：生产 DOM 仍创建这些类名时，基础可发现性和状态语义
// 必须由对应 SCSS 块提供。每条断言都做一次同条件删除探针，防止文件级共现假绿。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceText} = require('./source-scan.cjs');
const {declaresIn} = require('./css-block-scan.cjs');

function removeFromRule(source, marker, declaration) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `测试夹具必须找到规则 ${marker}`);
    const open = source.indexOf('{', start);
    const end = source.indexOf('}', open);
    assert.ok(open > start && end > open, `测试夹具必须找到规则边界 ${marker}`);
    const block = source.slice(start, end);
    assert.match(block, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `测试夹具必须找到要删除的声明 ${declaration}`);
    return source.slice(0, start) + block.replace(declaration, '') + source.slice(end);
}

test('platform chrome restores settings, Escape hint and dialog close affordances', () => {
    const source = readSourceText('src/styles/_platform-shell.scss');
    const topLevel = {topLevel: true};
    assert.equal(declaresIn(source, '.sw-platform-header__icon-action', /cursor:\s*pointer/, topLevel), true);
    assert.equal(declaresIn(source, '.sw-platform-header__close-hint', /display:\s*inline-flex/, topLevel), true);
    assert.equal(declaresIn(source, '.sw-platform-dialog__close-button', /min-width:\s*36px/, topLevel), true);
    assert.equal(declaresIn(source, '.sw-platform-header__icon-action', /min-width:\s*44px/, {atRule: /pointer:\s*coarse/}), true);
    assert.equal(declaresIn(source, '.sw-platform-dialog__close-button', /min-width:\s*44px/, {atRule: /pointer:\s*coarse/}), true);

    const missingIcon = removeFromRule(source, '.sw-platform-header__icon-action {', 'cursor: pointer;');
    assert.equal(declaresIn(missingIcon, '.sw-platform-header__icon-action', /cursor:\s*pointer/, topLevel), false,
        '删除设置按钮 cursor 后门禁必须失败');
    // 锚定真正的提示联合规则；更早的侧栏隐藏规则也包含同名选择器，不能误删其块。
    const missingHint = removeFromRule(source, '.sw-platform-header__close-hint,\n.sw-platform-dialog__close-hint {', 'display: inline-flex;');
    assert.equal(declaresIn(missingHint, '.sw-platform-header__close-hint', /display:\s*inline-flex/, topLevel), false,
        '删除 Esc 提示 display 后门禁必须失败');
});

test('switcher scope and result source labels retain secondary metadata styling', () => {
    const source = readSourceText('src/styles/_03-switcher-mobile.scss');
    const scope = /\.speed-switch \.sw__window-label \.sw__doc-scope-summary/;
    const sourceChip = /\.speed-switch \.sw__(?:tab-preview|doc-results|unified-section) \.sw__doc-item \.sw__search-match-source/;
    assert.equal(declaresIn(source, scope, /text-overflow:\s*ellipsis/), true);
    assert.equal(declaresIn(source, sourceChip, /border-radius:\s*999px/), true);

    const missingScope = removeFromRule(source, '.sw__doc-scope-summary {', 'text-overflow: ellipsis;');
    assert.equal(declaresIn(missingScope, scope, /text-overflow:\s*ellipsis/), false,
        '删除文档范围摘要的省略规则后门禁必须失败');
    const missingChip = removeFromRule(source, '.sw__search-match-source {', 'border-radius: 999px;');
    assert.equal(declaresIn(missingChip, sourceChip, /border-radius:\s*999px/), false,
        '删除来源标签胶囊规则后门禁必须失败');
});

test('workbench stale cells expose a persistent warning affordance', () => {
    const source = readSourceText('src/styles/_05-settings-widgets.scss');
    const selector = '.sw-home__cell[data-sw-health="stale"]';
    assert.equal(declaresIn(source, selector, /border-color:\s*color-mix\(in srgb, var\(--sw-platform-warning/, {topLevel: true}), true);
    assert.equal(declaresIn(source, `${selector}::after`, /content:\s*attr\(data-sw-health-text\)/), true);
    assert.equal(declaresIn(source, '.sw-home__cell[data-sw-health="stale"] .sw__home-module-status', /opacity:\s*1/), true);

    const missingBorder = removeFromRule(source, `${selector} {`, 'position: relative;');
    assert.equal(declaresIn(missingBorder, selector, /position:\s*relative/, {topLevel: true}), false,
        '删除 stale 卡片定位块后门禁必须失败');
});

test('snippet store and Gist previews keep a visible canvas and bounded rows', () => {
    const source = readSourceText('src/styles/_snippet-studio.scss');
    assert.equal(declaresIn(source, '.sw-studio__store-canvas', /height:\s*220px/), true);
    assert.equal(declaresIn(source, '.sw-studio__store-canvas iframe', /height:\s*100%/), true);
    assert.equal(declaresIn(source, '.sw-studio__gist-preview', /max-height:\s*180px/), true);
    assert.equal(declaresIn(source, '.sw-studio__gist-row', /min-width:\s*0/), true);

    const missingCanvasHeight = removeFromRule(source, '.sw-studio__store-canvas {', 'height: 220px;');
    assert.equal(declaresIn(missingCanvasHeight, '.sw-studio__store-canvas', /height:\s*220px/), false,
        '删除商店预览 canvas 高度后门禁必须失败');
    const missingGistBound = removeFromRule(source, '.sw-studio__gist-preview {', 'max-height: 180px;');
    assert.equal(declaresIn(missingGistBound, '.sw-studio__gist-preview', /max-height:\s*180px/), false,
        '删除 Gist 列表高度上限后门禁必须失败');
});

test('mobile bottom sheets keep visible Escape hint and 44px close hit area', () => {
    const source = readSourceText('src/styles/_05-settings-widgets.scss');
    assert.equal(declaresIn(source, '.sw__mobile-sheet-close-hint', /display:\s*inline-flex/), true);
    const closeButton = '.sw__mobile-sheet .sw__mobile-sheet-title .sw__mobile-sheet-close';
    assert.equal(declaresIn(source, closeButton, /min-width:\s*44px/), true);
    assert.equal(declaresIn(source, closeButton, /transform:\s*translateY\(-50%\)/), true);

    const missingHitArea = removeFromRule(source, '.sw__mobile-sheet-close {', 'min-width: 44px;');
    assert.equal(declaresIn(missingHitArea, closeButton, /min-width:\s*44px/), false,
        '删除移动 sheet 关闭按钮命中区后门禁必须失败');
    const missingHint = removeFromRule(source, '.sw__mobile-sheet-close-hint {', 'display: inline-flex;');
    assert.equal(declaresIn(missingHint, '.sw__mobile-sheet-close-hint', /display:\s*inline-flex/), false,
        '删除移动 sheet Esc 提示布局后门禁必须失败');
});
