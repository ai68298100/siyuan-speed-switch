const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396 第二十批）：CSS 侧 5 条窗口断言迁移为块级（clear-search
// 规则嵌套在 search 内，按展开选择器书写）；TS 侧 2 条（`clearSearchButton[…]*?applyFilter/
// focus`）改"锚定 click 处理器 + 有界窗口 + 顺序检查"；TS 源码读取改走 readSourceText。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};
// 清空按钮的 click 处理器（锚定 + 有界窗口，供顺序断言使用）。
const handlerStart=storeUiSource.indexOf('clearSearchButton.addEventListener("click"');
const handler=storeUiSource.slice(handlerStart, handlerStart + 400);
const zh = JSON.parse(fs.readFileSync(path.join(root, 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'src', 'i18n', 'en.json'), 'utf8'));

test('clear search button is created', () => assert.match(storeUiSource, /const clearSearchButton = document\.createElement\("button"\)/));
test('clear search button uses button type', () => assert.match(storeUiSource, /clearSearchButton\.type = "button"/));
test('clear search button has stable class', () => assert.match(storeUiSource, /sw-home-store__clear-search/));
test('clear search button has localized aria label', () => assert.match(storeUiSource, /homeStoreClearSearch/));
test('clear search button starts hidden when empty', () => assert.match(storeUiSource, /clearSearchButton\.hidden = !storeQuery/));
test('clear search button clears store query', () => assert.match(storeUiSource,/storeQuery = ""/));
test('clear search button clears input', () => assert.match(storeUiSource, /searchInput\.value = ""/));
test('clear search button reapplies filter', () => assert.ok(handler.includes('applyFilter();'), '清空动作须重新应用筛选'));
test('clear search button restores focus', () => { const f=handler.indexOf('applyFilter();'); const focus=handler.indexOf('searchInput.focus();'); assert.ok(f>=0 && focus>f, '清空后先应用筛选再恢复焦点'); });
test('input updates clear button visibility', () => assert.match(storeUiSource, /clearSearchButton\.hidden = !normalizeHomeStoreQuery\(storeQuery\)/));
test('search input handles keydown', () => assert.match(storeUiSource,/searchInput\.addEventListener\("keydown"/));
test('Escape key is recognized', () => assert.match(source, /event\.key !== "Escape"/));
test('Escape prevents browser default', () => assert.match(storeUiSource, /event\.preventDefault\(\)/));
test('Escape triggers clear action', () => assert.match(storeUiSource, /clearSearchButton\.click\(\)/));
test('empty search Escape is ignored', () => assert.match(storeUiSource, /!searchInput\.value/));
test('clear search button is appended to search bar', () => assert.match(storeUiSource,/searchBar\.appendChild\(clearSearchButton\)/));
test('clear search button has circular width', () => assert.ok(declaresIn(css, '.sw-home-store__search .sw-home-store__clear-search', /width: 32px/, base)));
test('clear search button has compact height', () => assert.ok(declaresIn(css, '.sw-home-store__search .sw-home-store__clear-search', /(\n|^)height: 32px/, base)));
test('clear search button has compact minimum height', () => assert.ok(declaresIn(css, '.sw-home-store__search .sw-home-store__clear-search', /min-height: 32px/, base)));
test('clear search button has circular radius', () => assert.ok(declaresIn(css, '.sw-home-store__search .sw-home-store__clear-search', /border-radius: 50%/, base)));
test('clear search button has readable glyph size', () => assert.ok(declaresIn(css, '.sw-home-store__search .sw-home-store__clear-search', /font-size: 20px/, base)));
test('mobile clear button overlaps input edge', () => assert.match(css, /\.sw-home-store__clear-search \{ margin-left: -40px/));
test('mobile clear button stays above input', () => assert.match(css, /z-index: 1/));
test('Chinese clear search label exists', () => assert.equal(zh.homeStoreClearSearch, '清空搜索'));
test('English clear search label exists', () => assert.equal(en.homeStoreClearSearch, 'Clear search'));
test('clear search label is non-empty', () => assert.ok(zh.homeStoreClearSearch.length > 0 && en.homeStoreClearSearch.length > 0));
test('search state remains bounded by normalizer', () => assert.match(storeUiSource,/normalizeHomeStoreQuery\(storeQuery\)/));
test('clear action preserves sort controls', () => assert.match(storeUiSource, /sortSelect/));
test('clear action preserves tab state', () => assert.match(storeUiSource, /storeTab/));
test('clear action does not remove card DOM contract', () => assert.match(storeUiSource, /filterEmptyState/));
test('clear button is independent of filter reset', () => assert.match(storeUiSource,/homeStoreClearFilters/));
