const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396）：1 条窗口断言迁移为块级；TS 源码读取改走 readSourceText。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};

test('store captures the opener element', () => assert.match(storeUiSource, /const opener = document\.activeElement instanceof HTMLElement/));
test('clear search has a tooltip', () => assert.match(storeUiSource, /clearSearchButton\.title = this\.i18n\.homeStoreClearSearch/));
test('sort control has a tooltip', () => assert.match(storeUiSource, /sortSelect\.title = this\.i18n\.homeStoreSortLabel/));
test('store tablist keeps tab semantics', () => assert.match(storeUiSource, /tabBar\.setAttribute\("role", "tablist"\)/));
test('store tablist has an accessible label', () => assert.match(storeUiSource, /tabBar\.setAttribute\("aria-label", this\.i18n\.homeStoreTitle\)/));
test('result summary has a stable id', () => assert.match(storeUiSource, /resultSummary\.id = "sw-home-store-result-summary"/));
test('result summary remains a status region', () => assert.match(storeUiSource, /resultSummary\.setAttribute\("role", "status"\)/));
test('result summary remains live', () => assert.match(storeUiSource, /resultSummary\.setAttribute\("aria-live", "polite"\)/));
test('ready section has a stable id', () => assert.match(storeUiSource, /readyHeading\.id = "sw-home-store-section-ready"/));
test('group headings have stable ids', () => assert.match(storeUiSource, /groupHeading\.id = `sw-home-store-group-heading-/));
test('group grids expose group role', () => assert.match(storeUiSource, /groupGrid\.setAttribute\("role", "group"\)/));
test('group grids reference their heading', () => assert.match(storeUiSource, /groupGrid\.setAttribute\("aria-labelledby", groupHeading\.id\)/));
test('pending section has a stable id', () => assert.match(storeUiSource, /pendingHeading\.id = "sw-home-store-section-pending"/));
test('pending grid has a stable id', () => assert.match(storeUiSource, /pendingGrid\.id = "sw-home-store-pending-grid"/));
test('pending grid exposes group role', () => assert.match(storeUiSource, /pendingGrid\.setAttribute\("role", "group"\)/));
test('pending grid references its heading', () => assert.match(storeUiSource, /pendingGrid\.setAttribute\("aria-labelledby", pendingHeading\.id\)/));
test('clear filters uses a scoped class', () => assert.match(storeUiSource, /clearFilters\.className = "b3-button b3-button--text sw-home-store__clear-filters"/));
test('clear filters has an accessible label', () => assert.match(storeUiSource, /clearFilters\.setAttribute\("aria-label", this\.i18n\.homeStoreClearFilters\)/));
test('clear filters has a tooltip', () => assert.match(storeUiSource, /clearFilters\.title = this\.i18n\.homeStoreClearFilters/));
test('clear filters clears the query model', () => assert.match(storeUiSource, /storeQuery = ""/));
test('clear filters hides the search clear action', () => assert.match(storeUiSource, /clearSearchButton\.hidden = true/));
test('clear filters resets the selected tab key', () => assert.match(storeUiSource, /storeTab = "all"/));
test('clear filters selects the all tab by key', () => assert.match(storeUiSource, /const active = button\.dataset\.tabKey === "all"/));
test('clear filters restores roving tabindex', () => assert.match(storeUiSource, /button\.setAttribute\("tabindex", active \? "0" : "-1"\)/));
test('clear filters restores search focus', () => assert.match(storeUiSource, /applyFilter\(\);\s*searchInput\.focus\(\);/));
test('store destroy restores opener focus', () => assert.match(storeUiSource, /if \(opener\?\.isConnected\) opener\.focus\(\)/));
test('filter empty state remains a status region', () => assert.match(storeUiSource,/filterEmptyState\.setAttribute\("role", "status"\)/));
test('clear filters cannot be accidentally selected', () => assert.ok(declaresIn(css, '.sw-home-store__clear-filters', /user-select: none/, base)));
test('forced colors cover clear filters', () => assert.match(css, /\.sw-home-store__clear-filters/));
test('clear filters remains scoped to the store', () => assert.match(css, /sw-home-store__clear-filters/));
