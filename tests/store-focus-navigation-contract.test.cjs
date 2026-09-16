const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396 第十一批）：CSS 侧 10 条窗口断言迁移为块级；TS 侧按源码
// 契约保留原始文本读取（见 SOURCE_SCAN_DEBT 的 `home-store-contract` 组说明——这些断言
// 检查的是 TS 源码的字面结构，非注释客体）。`touch-action` 侧侦察发现真实缺口：
// `.sw-home-store__size` 从未声明过 manipulation（旧断言靠 `__size` 前缀匹配 `__sizes`
// 的文本假绿），已在 src/index.scss 补上（店内其余 8 个交互控件都有这条）。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
// R5b 重构（D-383）：文档搜索方法群外迁至 doc-search-ui，commitFilters 的搜索框聚焦随之迁移。
const docSearchUiSource = readSourceText('src/doc-search-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};

test('filter records the active tab', () => assert.match(storeUiSource, /root\.dataset\.activeFilter = filter\.tab/));
test('filter records the current sort', () => assert.match(storeUiSource, /root\.dataset\.sort = storeSort/));
test('filter remembers the focused element', () => assert.match(storeUiSource, /const focusedBeforeFilter = document\.activeElement instanceof HTMLElement/));
test('filter records match state on cards', () => assert.match(storeUiSource, /card\.dataset\.filterMatch = String\(visible\)/));
test('filter detects a focused card', () => assert.match(storeUiSource, /const focusedCard = focusedBeforeFilter\?\.closest<HTMLElement>\("\.sw-home-store__card"\)/));
test('filter restores focus to the next visible card', () => assert.match(storeUiSource, /const nextCard = root\.querySelector<HTMLElement>\("\.sw-home-store__card:not\(\.fn__none\)"\)/));
test('filter focuses search when no card remains', () => assert.match(storeUiSource, /else searchInput\.focus\(\{preventScroll: true\}\)/));
test('tab activation records aria current', () => assert.match(storeUiSource, /candidate\.setAttribute\("aria-current", active \? "page" : "false"\)/));
test('tabs initialize aria current', () => assert.match(storeUiSource, /btn\.setAttribute\("aria-current", tab\.key === storeTab \? "page" : "false"\)/));
test('clear filters resets aria current', () => assert.match(storeUiSource, /button\.setAttribute\("aria-current", active \? "page" : "false"\)/));
test('size tiles support horizontal arrows', () => assert.match(storeUiSource, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/));
test('size tiles compute a focused index', () => assert.match(storeUiSource, /const tilesForCard = Array\.from\(tiles\.querySelectorAll/));
test('size tiles support Home', () => assert.match(storeUiSource, /event\.key === "Home" \? 0/));
test('size tiles support End', () => assert.match(storeUiSource, /event\.key === "End" \? tilesForCard\.length - 1/));
test('size tiles wrap forward', () => assert.match(storeUiSource, /event\.key === "ArrowLeft" \? -1 : 1\) \+ tilesForCard\.length/));
test('size tiles focus the next tile', () => assert.match(storeUiSource, /tilesForCard\[nextIndex\]\?\.focus\(\)/));
test('store root records active filter in source', () => assert.match(storeUiSource, /dataset\.activeFilter/));
test('store root records sort in source', () => assert.match(storeUiSource, /dataset\.sort = storeSort/));
test('store cards keep filter match metadata', () => assert.match(storeUiSource, /card\.dataset\.filterMatch = String\(visible\)/));
test('store cards preserve focus preventScroll', () => assert.match(storeUiSource,/nextCard\.focus\(\{preventScroll: true\}\)/));
test('store search focus preserves preventScroll', () => assert.match(docSearchUiSource, /searchInput\.focus\(\{preventScroll: true\}\)/));
test('store tabs expose page current state', () => assert.match(source, /aria-current/));
test('store size controls keep touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__size', /touch-action: manipulation/, base)));
test('store add action keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__add', /touch-action: manipulation/, base)));
test('store configure action keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__configure', /touch-action: manipulation/, base)));
test('store remove action keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__remove', /touch-action: manipulation/, base)));
test('store group toggle keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__group-toggle', /touch-action: manipulation/, base)));
test('store search clear keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__clear-search', /touch-action: manipulation/, base)));
test('store filter clear keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__clear-filters', /touch-action: manipulation/, base)));
test('store guide keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__guide', /touch-action: manipulation/, base)));
test('store unavailable removal keeps touch semantics', () => assert.ok(declaresIn(css, '.sw-home-store__remove-unavailable', /touch-action: manipulation/, base)));
test('store tabs preserve numeric count typography', () => assert.ok(declaresIn(css, /(^| )\.sw-home-store__tab\[aria-current="page"\]$/, /font-variant-numeric: tabular-nums/, base)));
test('store hidden card CSS stays scoped', () => assert.match(css, /\.sw-home-store__card\[aria-hidden="true"\]/));
test('store card hidden state remains content-visibility bounded', () => assert.match(css, /content-visibility: hidden/));
test('store focus navigation stays in store scope', () => assert.match(storeUiSource, /\.sw-home-store__card:not\(\.fn__none\)/));
test('store tile navigation prevents native scrolling', () => assert.match(storeUiSource, /event\.preventDefault\(\);\s*const nextIndex/));
test('store tile navigation ignores unrelated keys', () => assert.match(storeUiSource, /if \(index < 0 \|\| !\["ArrowLeft"/));
test('store filter focus handling only moves from cards', () => assert.match(storeUiSource, /if \(focusedCard && focusedCard\.classList\.contains\("fn__none"\)\)/));
test('store filter keeps search focus when visible', () => assert.match(storeUiSource, /focusedBeforeFilter\?\.closest<HTMLElement>/));
test('store keyboard controls use button focus', () => assert.match(storeUiSource,/tilesForCard\[nextIndex\]\?\.focus/));
test('store touch controls avoid gesture delay', () => assert.match(css, /touch-action: manipulation/));
