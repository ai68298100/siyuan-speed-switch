const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396 第十九批）：5 条窗口断言迁移为块级；嵌套/媒体分支的
// 选择器按展开形态或 `{atRule}` 书写；TS 源码读取改走 readSourceText（源码字面契约）。
const css = readSourceText('src/index.scss');
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const base={topLevel: true};
const narrow={atRule: /max-width:\s*560px/};

test('store search row has sort control class', () => assert.match(css, /\.sw-home-store__sort/));
test('sort control has bounded minimum width', () => assert.match(css, /min-width: 106px/));
test('sort control has bounded maximum width', () => assert.match(css, /max-width: 132px/));
test('sort control has compact height', () => assert.match(css, /height: 32px/));
test('sort control has rounded corners', () => assert.match(css, /border-radius: 8px/));
// 断言绑定动效令牌而非具体字面量：既守住"卡片边框有过渡"，又不会在调整
// 档位/曲线时误报。令牌定义见 src/index.scss 顶部（D-362）。
test('store cards animate border changes', () => assert.match(css, /transition: border-color \$sw-dur-\w+ \$sw-ease/));
test('store cards lift on desktop hover', () => assert.match(css, /transform: translateY\(-1px\)/));
test('store cards expose focus-within state', () => assert.match(css, /&:focus-within/));
test('store cards use primary focus border', () => assert.match(css, /border-color: var\(--b3-theme-primary\)/));
test('store tabs have minimum touch height', () => assert.match(css, /min-height: 40px/));
test('store tabs preserve no-wrap labels', () => assert.match(css, /white-space: nowrap/));
test('store tabs use manipulation touch action', () => assert.match(css, /touch-action: manipulation/));
test('store tabs hover has surface feedback', () => assert.match(css, /background: color-mix\(in srgb, var\(--b3-theme-primary\) 6%/));
test('store tabs have visible focus ring', () => assert.match(css, /outline: 2px solid var\(--b3-theme-primary\)/));
test('group heading has minimum height', () => assert.ok(declaresIn(css, '.sw-home-store__group', /min-height: 32px/, base)));
test('group toggle supports touch action', () => assert.ok(declaresIn(css, '.sw-home-store__group-toggle', /touch-action: manipulation/, base)));
test('summary reserves stable height', () => assert.ok(declaresIn(css, '.sw-home-store__summary', /min-height: 18px/, base)));
test('mobile search row wraps', () => assert.ok(declaresIn(css, '.sw-home-store__search', /flex-wrap: wrap/, narrow)));
test('mobile search input gets full row', () => assert.ok(declaresIn(css, '.sw-home-store__search input', /flex: 1 1 100%/, narrow)));
test('mobile sort control expands', () => assert.match(css, /\.sw-home-store__sort \{ flex: 1 1 46%; max-width: none; \}/));
test('mobile guide button expands', () => assert.match(css, /\.sw-home-store__guide \{ flex: 1 1 46%; min-height: 32px; \}/));
test('mobile cards disable hover lift', () => assert.match(css, /\.sw-home-store__card:hover \{ transform: none; \}/));
test('mobile tabs preserve horizontal overscroll', () => assert.match(css, /overscroll-behavior-x: contain/));
test('sort state is stored in store dialog', () => assert.match(storeUiSource, /let storeSort = persistedStoreState\.sort \|\| "relevance"/));
test('sort select uses localized label', () => assert.match(storeUiSource, /homeStoreSortLabel/));
test('sort select normalizes values', () => assert.match(storeUiSource, /normalizeHomeStoreSort\(sortSelect\.value\)/));
test('store render uses sort model', () => assert.match(storeUiSource, /sortHomeStoreCards\(/));
test('store search uses token model', () => assert.match(storeUiSource, /matchesHomeStoreTokens\(/));
test('store render computes tab counts', () => assert.match(storeUiSource, /buildHomeStoreTabCounts\(/));
test('store cards expose module id dataset', () => assert.match(storeUiSource, /card\.dataset\.moduleId = moduleId/));
test('store tabs preserve source labels', () => assert.match(storeUiSource,/btn\.dataset\.tabLabel = tab\.label/));
