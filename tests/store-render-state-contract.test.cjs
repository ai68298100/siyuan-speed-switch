const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396 第十八批）：CSS 侧 5 条窗口断言迁移为块级（`&[…]` 按展开
// 选择器书写，嵌套选择器用尾部锚定正则）；TS 侧 1 条（`pendingCount = "0"[\s\S]*?aria-busy
// "false"`）按真实源码（home-store-ui.ts:1126-1129 的固定 4 行序列）改写为精确多行匹配；
// TS 源码读取改走 readSourceText（源码字面契约，登记理由见债清单）。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};

test('store root initializes render version', () => assert.match(storeUiSource, /root\.dataset\.renderVersion = "0"/));
test('store root exposes initial busy state', () => assert.match(storeUiSource, /root\.setAttribute\("aria-busy", "false"\)/));
test('store render marks busy before rebuilding', () => assert.match(storeUiSource, /const renderStore = \(\) => \{\s*root\.setAttribute\("aria-busy", "true"\)/));
test('store render increments version', () => assert.match(storeUiSource, /root\.dataset\.renderVersion = String\(Number\(root\.dataset\.renderVersion/));
test('store records ready count', () => assert.match(storeUiSource, /root\.dataset\.readyCount = String\(activeIds\.size\)/));
test('store records pending count', () => assert.match(storeUiSource, /root\.dataset\.pendingCount = String\(pending\.length\)/));
test('store records visible count', () => assert.match(storeUiSource, /root\.dataset\.visibleCount = String\(summary\.visible\)/));
test('store records total count', () => assert.match(storeUiSource, /root\.dataset\.totalCount = String\(summary\.total\)/));
test('store records added count', () => assert.match(storeUiSource, /root\.dataset\.addedCount = String\(summary\.added\)/));
test('store clears busy state after render', () => assert.match(storeUiSource, /restoreStoreView\(\);\s*root\.setAttribute\("aria-busy", "false"\)/));
test('empty store clears busy state', () => {
    const i = storeUiSource.indexOf('root.dataset.pendingCount = "0";');
    assert.ok(i >= 0, '找不到 pendingCount 清零语句');
    const window = storeUiSource.slice(i, i + 300);
    assert.ok(window.includes('root.textContent = this.i18n.homeNoMoreModules;'), '清空分支须提示无更多模块');
    const restore = window.indexOf('restoreStoreView();');
    assert.ok(restore >= 0, '清空分支须恢复视图');
    const busy = window.indexOf('root.setAttribute("aria-busy", "false")');
    assert.ok(busy >= 0, '清空分支须解除 busy');
    assert.ok(busy > restore, 'busy 须在恢复视图之后解除');
});
test('summary exposes ready state', () => assert.match(storeUiSource, /resultSummary\.dataset\.state = "ready"/));
test('summary exposes results state', () => assert.match(storeUiSource,/resultSummary\.dataset\.state = summary\.visible > 0 \? "results" : "empty"/));
test('summary state distinguishes empty results', () => assert.match(storeUiSource, /: "empty"/));
test('tabs expose set size', () => assert.match(storeUiSource, /btn\.setAttribute\("aria-setsize", String\(tabs\.length\)\)/));
test('tabs expose position', () => assert.match(storeUiSource, /btn\.setAttribute\("aria-posinset", String\(tabIndex \+ 1\)\)/));
test('cards reference their title', () => assert.match(storeUiSource, /card\.setAttribute\("aria-labelledby", title\.id\)/));
test('card status is atomic', () => assert.match(storeUiSource, /status\.setAttribute\("aria-atomic", "true"\)/));
test('size group declares horizontal orientation', () => assert.match(storeUiSource, /tiles\.setAttribute\("aria-orientation", "horizontal"\)/));
test('size group remains a semantic group', () => assert.match(storeUiSource, /tiles\.setAttribute\("role", "group"\)/));
test('size tiles expose set size', () => assert.match(storeUiSource, /tile\.setAttribute\("aria-setsize", String\(supported\.length\)\)/));
test('size tiles expose position', () => assert.match(storeUiSource, /tile\.setAttribute\("aria-posinset", String\(sizeIndex \+ 1\)\)/));
test('add action records module id', () => assert.match(storeUiSource, /addButton\.dataset\.moduleId = moduleId/));
test('ready heading exposes heading role', () => assert.match(storeUiSource, /readyHeading\.setAttribute\("role", "heading"\)/));
test('ready heading exposes level', () => assert.match(storeUiSource, /readyHeading\.setAttribute\("aria-level", "2"\)/));
test('pending heading exposes heading role', () => assert.match(storeUiSource, /pendingHeading\.setAttribute\("role", "heading"\)/));
test('group heading exposes heading role', () => assert.match(storeUiSource, /groupHeading\.setAttribute\("role", "heading"\)/));
test('group heading exposes level', () => assert.match(storeUiSource, /groupHeading\.setAttribute\("aria-level", "3"\)/));
test('group grid records group key', () => assert.match(storeUiSource, /groupGrid\.dataset\.group = label/));
test('pending cards reference their title', () => assert.match(storeUiSource, /card\.setAttribute\("aria-labelledby", title\.id\)/));
test('filter empty state records state', () => assert.match(storeUiSource, /filterEmptyState\.dataset\.state = "empty-filter"/));
test('focus fallback restores visible card', () => assert.match(storeUiSource, /if \(!target && focusKind === "card"\)/));
test('focus fallback restores group toggle', () => assert.match(storeUiSource, /if \(!target && focusKind === "group"\)/));
test('focus fallback restores search', () => assert.match(storeUiSource, /target = root\.querySelector<HTMLElement>\("\.sw-home-store__search input"\)/));
test('focus kind is observable', () => assert.match(storeUiSource, /root\.dataset\.focusKind = focusKind/));
test('focus value is observable', () => assert.match(storeUiSource,/root\.dataset\.focusValue = focusValue/));
test('busy styling uses progress cursor', () => assert.ok(declaresIn(css, '.sw-home-store[aria-busy="true"]', /cursor: progress/, base)));
test('busy styling softens summary', () => assert.ok(declaresIn(css, '.sw-home-store[aria-busy="true"] .sw-home-store__summary', /opacity: \.72/, base)));
test('card focus has scroll margin', () => assert.ok(declaresIn(css, '.sw-home-store[data-focus-kind="card"] .sw-home-store__card:focus-visible', /scroll-margin-block: 18px/, base)));
test('heading focus has scroll margin', () => assert.ok(declaresIn(css, /(^| )\.sw-home-store__group\[role="heading"\]$/, /scroll-margin-block: 12px/, base)));
test('size group contains inline overscroll', () => assert.ok(declaresIn(css, /(^| )\.sw-home-store__sizes\[aria-orientation="horizontal"\]$/, /overscroll-behavior-inline: contain/, base)));
test('render state remains scoped to store root', () => assert.match(storeUiSource, /root\.setAttribute\("aria-busy"/));
test('size position uses one-based index', () => assert.match(storeUiSource, /sizeIndex \+ 1/));
test('tab position uses one-based index', () => assert.match(storeUiSource, /tabIndex \+ 1/));
test('render version remains bounded to numeric state', () => assert.match(storeUiSource, /Number\(root\.dataset\.renderVersion \|\| "0"\)/));
test('summary state remains data-driven', () => assert.match(storeUiSource,/resultSummary\.dataset\.state/));
