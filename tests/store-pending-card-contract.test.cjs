const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396）：2 条窗口断言改"锚定创建块 + 有界窗口"（ready 卡与 pending 卡
// 各自的 bind → moduleId 赋值序列）；TS 源码读取改走 readSourceText。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const readyCardBlock = storeUiSource.slice(storeUiSource.indexOf('bindStoreCardKeyboard(card);'), storeUiSource.indexOf('bindStoreCardKeyboard(card);') + 200);
const pendingBlock = storeUiSource.slice(storeUiSource.indexOf('sw-home-store__card--pending'), storeUiSource.indexOf('sw-home-store__card--pending') + 300);

test('store card keyboard helper is declared', () => assert.match(storeUiSource, /const bindStoreCardKeyboard = \(card: HTMLElement\)/));
test('ready cards use shared keyboard helper', () => assert.ok(readyCardBlock.includes('card.dataset.moduleId = moduleId'), 'ready card binds keyboard helper and records moduleId'));
test('pending cards use shared keyboard helper', () => assert.ok(pendingBlock.includes('bindStoreCardKeyboard(card);'), 'pending card binds keyboard helper'));
test('shared card helper keeps negative tabindex', () => assert.match(storeUiSource, /card\.tabIndex = -1/));
test('shared card helper keeps group role', () => assert.match(storeUiSource, /card\.setAttribute\("role", "group"\)/));
test('pending cards participate in visible navigation', () => assert.match(storeUiSource,/root\.querySelectorAll<HTMLElement>\("\.sw-home-store__card:not\(\.fn__none\)"\)/));
test('pending navigation handles ArrowRight', () => assert.match(source, /event\.key === "ArrowRight"/));
test('pending navigation handles ArrowLeft', () => assert.match(source, /event\.key === "ArrowLeft"/));
test('pending navigation handles ArrowDown', () => assert.match(source, /event\.key === "ArrowDown"/));
test('pending navigation handles ArrowUp', () => assert.match(storeUiSource, /event\.key === "ArrowUp"/));
test('pending navigation handles Home', () => assert.match(storeUiSource, /if \(event\.key === "Home"\) next = 0/));
test('pending navigation handles End', () => assert.match(storeUiSource,/if \(event\.key === "End"\) next = cards\.length - 1/));
test('pending navigation prevents browser scrolling', () => assert.match(storeUiSource, /event\.preventDefault\(\)/));
test('pending navigation moves focus', () => assert.match(storeUiSource, /cards\[next\]\.focus\(\)/));
test('pending card exposes module id', () => assert.match(storeUiSource, /card\.dataset\.moduleId = entry\.moduleId/));
test('pending card is classified as plugin', () => assert.match(storeUiSource, /card\.dataset\.category = "plugin"/));
test('pending card is classified as external', () => assert.match(storeUiSource, /card\.dataset\.availability = "external"/));
test('pending card has an explicit integration state', () => assert.match(storeUiSource, /card\.dataset\.integration = "unknown"/));
test('pending card preserves added state', () => assert.match(storeUiSource, /card\.dataset\.added = unavailable \? "true" : "false"/));
test('pending card exposes a status tone', () => assert.match(storeUiSource, /card\.dataset\.statusTone = unavailable \? "warning" : "info"/));
test('pending card exposes an accessible label', () => assert.match(storeUiSource, /card\.setAttribute\("aria-label", `\$\{entry\.title\}/));
test('pending label distinguishes unavailable provider', () => assert.match(storeUiSource, /this\.i18n\.homeStoreProviderUnavailable/));
test('pending label distinguishes required provider', () => assert.match(storeUiSource, /this\.i18n\.homeStoreRequires/));
test('pending title receives a stable id', () => assert.match(storeUiSource, /title\.id = `sw-home-store-title-\$\{entry\.moduleId\}`/));
test('unavailable removal control remains a button', () => assert.match(storeUiSource, /removeButton\.type = "button"/));
test('unavailable removal control keeps dedicated class', () => assert.match(storeUiSource, /sw-home-store__remove-unavailable/));
test('unavailable removal control has an accessible label', () => assert.match(storeUiSource, /removeButton\.setAttribute\("aria-label", `\$\{this\.i18n\.homeStoreRemoveUnavailable\}/));
test('unavailable removal control has a tooltip', () => assert.match(storeUiSource, /removeButton\.title = removeButton\.getAttribute\("aria-label"\)/));
test('pending cards retain pending styling hook', () => assert.match(storeUiSource, /sw-home-store__card sw-home-store__card--pending/));
test('pending cards retain unavailable styling hook', () => assert.match(storeUiSource, /sw-home-store__card--unavailable/));
test('pending cards remain filterable by search dataset', () => assert.match(storeUiSource,/card\.dataset\.search = `\$\{entry\.title\} \$\{entry\.description\} \$\{entry\.providerName\}`/));
test('pending card styles remain scoped', () => assert.match(css, /\.sw-home-store__card--pending/));
