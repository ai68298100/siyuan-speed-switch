const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396 第十七批）：CSS 侧 7 条窗口断言迁移为块级；TS 侧 1 条
// （`addMeta(…homeStoreSource[\s\S]*?"source")`）按真实原文（home-store-ui.ts:112）改写为
// 精确调用断言；TS 源码读取改走 readSourceText（源码字面契约，登记理由见债清单）。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};

test('preview disclosure resolves source metadata', () => assert.match(storeUiSource, /const sourceInfo = resolveHomeStoreSourceInfo\(moduleId\)/));
test('preview disclosure has a scoped meta wrapper', () => assert.match(storeUiSource, /meta\.className = "sw-store-preview__meta"/));
test('preview disclosure is a note region', () => assert.match(storeUiSource, /meta\.setAttribute\("role", "note"\)/));
test('preview disclosure uses a bounded chip helper', () => assert.match(storeUiSource, /const addMeta = \(label: string, tone: string\)/));
test('preview disclosure chips have a scoped class', () => assert.match(storeUiSource, /chip\.className = `sw-store-preview__meta-chip is-\$\{tone\}`/));
test('preview disclosure chips expose tooltips', () => assert.match(storeUiSource, /chip\.title = label/));
test('preview disclosure marks remote integration', () => assert.match(storeUiSource, /sourceInfo\?\.integration === "http"/));
test('preview disclosure marks local integration', () => assert.match(storeUiSource, /sourceInfo\?\.integration === "local-bridge"/));
test('preview disclosure falls back to offline', () => assert.match(storeUiSource, /this\.i18n\.homeStoreNetworkOffline/));
test('preview disclosure explains location privacy', () => assert.match(storeUiSource, /this\.i18n\.homeStorePrivacyLocation/));
test('preview disclosure explains local privacy', () => assert.match(storeUiSource, /this\.i18n\.homeStorePrivacyLocal/));
test('preview disclosure explains endpoint privacy', () => assert.match(storeUiSource, /this\.i18n\.homeStorePrivacyEndpoint/));
test('preview disclosure explains no-content privacy', () => assert.match(storeUiSource, /this\.i18n\.homeStorePrivacyNone/));
test('preview disclosure renders source text', () => assert.match(storeUiSource, /this\.i18n\.homeStoreSource\.replace\("\{source\}"/));
test('preview disclosure has a provider fallback', () => assert.match(storeUiSource, /sourceInfo\?\.providerName \|\| "SiYuan"/));
test('preview disclosure adds source tone', () => assert.match(storeUiSource, /addMeta\(this\.i18n\.homeStoreSource\.replace\("\{source\}", sourceInfo\?\.providerName \|\| "SiYuan"\), "source"\)/));
test('preview disclosure adds network tone', () => assert.match(storeUiSource, /sourceInfo\?\.integration === "http" \? "network"/));
test('preview disclosure adds local tone', () => assert.match(storeUiSource, /sourceInfo\?\.integration === "local-bridge" \? "local"/));
test('preview disclosure adds offline tone', () => assert.match(storeUiSource, /: "offline"\);/));
test('preview disclosure adds privacy tone', () => assert.match(storeUiSource, /addMeta\(privacy, "privacy"\)/));
test('preview disclosure is mounted before preview body', () => assert.match(storeUiSource,/container\.appendChild\(meta\);\s*const body = document\.createElement\("div"\)/));
test('preview meta uses flex layout', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /display: flex/, base)));
test('preview meta wraps on narrow surfaces', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /flex-wrap: wrap/, base)));
test('preview meta keeps bounded gaps', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /gap: 5px/, base)));
test('preview chips have visible borders', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip', /border: 1px solid/, base)));
test('preview chips allow long source names', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip', /overflow-wrap: anywhere/, base)));
test('preview chips keep legacy word-break fallback', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip', /word-break: break-word/, base)));
test('preview chips remain selectable', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip', /user-select: text/, base)));
test('preview network tone is scoped', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip.is-network', /border-color/, base)));
test('preview privacy tone is scoped', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip.is-privacy', /opacity/, base)));
test('preview disclosure styles remain store-preview scoped', () => assert.match(css, /\.sw-store-preview/));
