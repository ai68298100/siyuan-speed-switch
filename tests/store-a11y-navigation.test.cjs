const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');

// 2026-09-16（T-6280 / D-396）：1 条窗口断言改"锚定激活函数 + 有界窗口"（applyFilter 是
// activateStoreTab 的最后一步）；TS 源码读取改走 readSourceText。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const activateBody = storeUiSource.slice(storeUiSource.indexOf('const activateStoreTab = (button: HTMLElement) => {'), storeUiSource.indexOf('const activateStoreTab = (button: HTMLElement) => {') + 800);

test('store tablist has activation helper', () => assert.match(storeUiSource, /const activateStoreTab =/));
test('store tabs use roving tabindex', () => assert.match(storeUiSource, /setAttribute\("tabindex", active \? "0" : "-1"\)/));
test('initial active tab is focusable', () => assert.match(storeUiSource, /btn\.setAttribute\("tabindex", tab\.key === storeTab \? "0" : "-1"\)/));
test('store tabs click uses activation helper', () => assert.match(storeUiSource,/btn\.addEventListener\("click", \(\) => activateStoreTab\(btn\)\)/));
test('store tabs handle ArrowRight', () => assert.match(source, /event\.key === "ArrowRight"/));
test('store tabs handle ArrowLeft', () => assert.match(source, /event\.key === "ArrowLeft"/));
test('store tabs handle ArrowDown', () => assert.match(source, /event\.key === "ArrowDown"/));
test('store tabs handle ArrowUp', () => assert.match(source, /event\.key === "ArrowUp"/));
test('store tabs handle Home', () => assert.match(source, /event\.key === "Home"/));
test('store tabs handle End', () => assert.match(source, /event\.key === "End"/));
test('store tab navigation prevents default', () => assert.match(storeUiSource, /event\.preventDefault\(\)/));
test('store tab navigation moves focus', () => assert.match(storeUiSource, /buttons\[next\]\.focus\(\)/));
test('store tab selection updates aria-selected', () => assert.match(storeUiSource, /candidate\.setAttribute\("aria-selected", String\(active\)\)/));
test('store summary is a live region', () => assert.match(storeUiSource, /resultSummary\.setAttribute\("aria-live", "polite"\)/));
test('store groups have stable ids', () => assert.match(storeUiSource, /const groupId = `sw-home-store-group-/));
test('store groups expose ids on grids', () => assert.match(storeUiSource, /groupGrid\.id = groupId/));
test('group toggles reference controlled grids', () => assert.match(storeUiSource,/groupToggle\.setAttribute\("aria-controls", groupId\)/));
test('add action has an accessible label', () => assert.match(storeUiSource, /addButton\.setAttribute\("aria-label"/));
test('preview action has an accessible label', () => assert.match(storeUiSource, /previewButton\.setAttribute\("aria-label"/));
test('tab activation stores selected key', () => assert.match(storeUiSource, /storeTab = button\.dataset\.tabKey/));
test('tab activation reapplies filter', () => assert.ok(activateBody.includes('applyFilter();'), '激活 tab 须重新应用筛选'));
test('tab focus order uses only visible tab controls', () => assert.match(storeUiSource, /querySelectorAll<HTMLElement>\("\.sw-home-store__tab"\)/));
test('keyboard navigation wraps forward', () => assert.match(storeUiSource, /\(index \+ 1\) % buttons\.length/));
test('keyboard navigation wraps backward', () => assert.match(storeUiSource, /\(index - 1 \+ buttons\.length\) % buttons\.length/));
test('home key selects first tab', () => assert.match(storeUiSource, /if \(event\.key === "Home"\) next = 0/));
test('end key selects last tab', () => assert.match(storeUiSource, /if \(event\.key === "End"\) next = buttons\.length - 1/));
test('group toggle remains a button', () => assert.match(storeUiSource, /groupToggle\.type = "button"/));
test('add action remains a button', () => assert.match(storeUiSource, /tiles\.insertAdjacentHTML\("beforeend", `<button/));
test('preview action remains a button', () => assert.match(storeUiSource, /previewButton\.className = "sw-home-store__size sw-home-store__preview-btn"/));
test('store tabs remain tab role', () => assert.match(storeUiSource, /btn\.setAttribute\("role", "tab"\)/));
test('store tablist remains tablist role', () => assert.match(storeUiSource, /tabBar\.setAttribute\("role", "tablist"\)/));
test('aria controls value is deterministic', () => assert.match(storeUiSource,/orderedGroups\.indexOf\(label\)/));
