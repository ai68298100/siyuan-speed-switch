const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

const root = path.resolve(__dirname, '..');
// 2026-09-16（T-6280 / D-396 第十三批）：CSS 侧 9 条窗口断言迁移为块级；TS 侧 1 条
// （`addMeta(…[\s\S]*?"context")`）改写为**精确调用断言**（实查 src/home-store-ui.ts:116
// 的真实原文后按单行书写，不再有自由跨度）；TS 源码读取改走 readSourceText（源码字面
// 契约，登记理由见债清单）；i18n JSON 读取保持原样（JSON 不属裸读登记范围）。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const en = fs.readFileSync(path.join(root, 'src', 'i18n', 'en.json'), 'utf8');
const zh = fs.readFileSync(path.join(root, 'src', 'i18n', 'zh-CN.json'), 'utf8');
const base={topLevel: true};

test('preview context creates a stable scoped id', () => assert.match(storeUiSource, /const previewId = `sw-store-preview-\$\{moduleId\.replace/));
test('preview source integration is exposed on the container', () => assert.match(storeUiSource, /container\.dataset\.integration = sourceInfo\?\.integration \|\| "direct"/));
test('preview source privacy is exposed on the container', () => assert.match(storeUiSource, /container\.dataset\.privacy = sourceInfo\?\.privacy \|\| "none"/));
test('preview metadata retains the module id', () => assert.match(storeUiSource, /meta\.dataset\.moduleId = moduleId/));
test('preview metadata has an accessible label', () => assert.match(storeUiSource, /meta\.setAttribute\("aria-label", this\.i18n\.homeStoreGuideHint\)/));
test('preview chip exposes its tone', () => assert.match(storeUiSource, /chip\.dataset\.tone = tone/));
test('preview chip has an accessible label', () => assert.match(storeUiSource, /chip\.setAttribute\("aria-label", label\)/));
test('preview context exposes the selected surface', () => assert.match(storeUiSource, /homeStorePreviewSurface\.replace\("\{surface\}"/));
test('preview context exposes the selected size', () => assert.match(storeUiSource, /homeStorePreviewSize\.replace\("\{size\}"/));
test('preview context localizes desktop surface', () => assert.match(storeUiSource, /desktop: this\.i18n\.homeStoreDeviceDesktop/));
test('preview context localizes sidebar surface', () => assert.match(storeUiSource, /sidebar: this\.i18n\.homeStoreDeviceSidebar/));
test('preview context localizes mobile surface', () => assert.match(storeUiSource, /mobile: this\.i18n\.homeStoreDeviceMobile/));
test('preview body retains module id', () => assert.match(storeUiSource, /body\.dataset\.moduleId = moduleId/));
test('preview body retains device', () => assert.match(storeUiSource, /body\.dataset\.device = device/));
test('preview body retains size', () => assert.match(storeUiSource, /body\.dataset\.size = sizeKey/));
test('preview body is atomic', () => assert.match(storeUiSource, /body\.setAttribute\("aria-atomic", "true"\)/));
test('preview body starts busy', () => assert.match(storeUiSource, /body\.setAttribute\("aria-busy", "true"\)/));
test('preview body clears busy with the container', () => assert.match(storeUiSource, /body\.setAttribute\("aria-busy", "false"\)/));
test('preview body references metadata', () => assert.match(storeUiSource, /body\.setAttribute\("aria-describedby", meta\.id\)/));
test('preview body is keyboard focusable', () => assert.match(storeUiSource, /body\.tabIndex = 0/));
// 旧断言 `/addMeta\(this\.i18n\.homeStorePreviewSize[\s\S]*?"context"\)/` 允许两实参之间
// 跨任意代码；现按真实调用原文（home-store-ui.ts:116）精确匹配整条语句。
test('preview uses a context chip tone', () => assert.match(storeUiSource, /addMeta\(this\.i18n\.homeStorePreviewSize\.replace\("\{size\}", sizeKey\), "context"\)/));
test('preview metadata is sticky', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /position: sticky/, base)));
test('preview metadata stays above scrolling content', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /z-index: 2/, base)));
test('preview metadata keeps a top inset', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /top: 0/, base)));
test('preview metadata has a separating border', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /border-bottom: 1px solid/, base)));
test('preview metadata uses a translucent surface', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /background: color-mix/, base)));
test('preview metadata supports backdrop blur', () => assert.ok(declaresIn(css, '.sw-store-preview__meta', /backdrop-filter: blur/, base)));
test('preview context chips use dashed borders', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip.is-context', /border-style: dashed/, base)));
test('preview body allows long content to wrap', () => assert.ok(declaresIn(css, '.sw-store-preview__body', /overflow-wrap: anywhere/, base)));
test('preview body remains shrinkable in flex layouts', () => assert.ok(declaresIn(css, '.sw-store-preview__body', /min-width: 0/, base)));
// 窄屏分支里的 chip 缩小必须钉在 560px 分支上（T-6283：深度≠身份）。
test('preview has mobile chip sizing', () => assert.ok(declaresIn(css, '.sw-store-preview__meta-chip', /padding:\s*3px 6px/, {atRule: /max-width:\s*560px/})));
test('preview has forced-colors fallback', () => assert.ok(css.includes('@media (forced-colors: active)')));
test('English preview surface label exists', () => assert.match(en, /"homeStorePreviewSurface":/));
test('English preview size label exists', () => assert.match(en, /"homeStorePreviewSize":/));
test('Chinese preview surface label exists', () => assert.match(zh, /"homeStorePreviewSurface":/));
test('Chinese preview size label exists', () => assert.match(zh, /"homeStorePreviewSize":/));
