const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {readSourceText}=require('./source-scan.cjs');
const {declaresIn}=require('./css-block-scan.cjs');

// 2026-09-16（T-6280 / D-396 第二十批）：7 条窗口断言迁移为块级；TS 源码读取改走 readSourceText。
const source = readSourceText('src/index.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');
const css = readSourceText('src/index.scss');
const base={topLevel: true};

test('store size controls use a labelled group', () => assert.match(storeUiSource, /tiles\.setAttribute\("role", "group"\)/));
test('store size controls keep their module id', () => assert.match(storeUiSource, /tiles\.dataset\.moduleId = moduleId/));
test('store size controls expose selected size via the module preset (T-6969 slice 2)', () => assert.match(storeUiSource, /tiles.dataset.selectedSize = added?.size || preferredSize/));
test('store size label has a stable id', () => assert.match(storeUiSource, /sizeLabel\.id = `sw-home-store-size-label-\$\{moduleId\}\$\{idSuffix\}`/));
test('store size group references its label', () => assert.match(storeUiSource, /tiles\.setAttribute\("aria-labelledby", sizeLabel\.id\)/));
test('store size buttons declare button type', () => assert.match(storeUiSource, /const tile = document\.createElement\("button"\);\s*tile\.type = "button"/));
test('store size buttons expose selected state data', () => assert.match(storeUiSource, /tile\.dataset\.selected = String\(sizeKey ===/));
test('store size buttons expose tooltips', () => assert.match(storeUiSource, /tile\.title = tile\.getAttribute\("aria-label"\)/));
test('store size buttons control the main action', () => assert.match(storeUiSource, /tile\.setAttribute\("aria-controls", actionId\)/));
test('store size selection updates group state', () => assert.match(storeUiSource, /tiles\.dataset\.selectedSize = sizeKey/));
test('store size selection updates action state', () => assert.match(storeUiSource,/addButton\.dataset\.selectedSize = sizeKey/));
test('store add action is created as a button', () => assert.match(source, /const addButton = document\.createElement\("button"\)/));
test('store add action declares button type', () => assert.match(storeUiSource, /addButton\.type = "button"/));
test('store add action has a stable id', () => assert.match(storeUiSource, /addButton\.id = actionId/));
test('store primary action records operation', () => assert.match(storeUiSource, /addButton\.dataset\.action = guideOnly \? "guide" : added \? "apply-size" : "add"/));
test('store add action records selected size', () => assert.match(storeUiSource, /addButton\.dataset\.selectedSize = selectedTile\?\.dataset\.size/));
test('store action describes the selected size or external prerequisites', () => {
    assert.match(storeUiSource, /const descriptionIds = guideOnly[\s\S]*?: sizeLabel\.id;/);
    assert.match(storeUiSource, /if \(descriptionIds\) addButton\.setAttribute\("aria-describedby", descriptionIds\)/);
});
test('store action accessible label matches its operation and selected size', () => {
    assert.match(storeUiSource, /const actionLabel = guideOnly[\s\S]*?addButton\.setAttribute\("aria-label", `\$\{actionLabel\}/);
});
test('store add action has a tooltip', () => assert.match(storeUiSource, /addButton\.title = addButton\.getAttribute\("aria-label"\)/));
function assertExternalStoreActionContract(source) {
    assert.match(source, /const guideOnly = !added && card\.dataset\.primaryAction === "guide";/,
        '外部来源必须从主动作事实选择说明动作');
    assert.match(source, /addButton\.dataset\.action = guideOnly \? "guide" : added \? "apply-size" : "add";/,
        '按钮的 action 元数据必须与可见的主动作一致');
    assert.match(source, /if \(!added && !guideOnly && !canHomeStoreInstall\(card\.dataset, \{installability\}\)\)/,
        '安装能力只应禁用添加动作，不能禁用说明入口');
    assert.match(source, /if \(guideOnly\) \{\s*this\.openHomeWidgetGuide\(\);\s*return;\s*\}/,
        '外部来源说明动作必须打开说明并退出添加写入路径');
    assert.match(source, /const actionLabel = guideOnly[\s\S]*?addButton\.setAttribute\("aria-label", `\$\{actionLabel\}/,
        '可见主动作、无障碍名称与提示必须使用同一动作文案');
    assert.match(source, /const descriptionIds = guideOnly\s*\? \[card\.querySelector<HTMLElement>\("\.sw-home-store__availability"\)\?\.id, desc\.id\][\s\S]*?: sizeLabel\.id;/,
        '说明按钮应关联组件前置条件，尺寸提交按钮才关联尺寸选择');
    assert.match(source, /const sizeActionLabel = guideOnly[\s\S]*?addButton\.title = accessibleLabel;/,
        '切换预览尺寸后仍须保持说明按钮名称和提示一致');
}
test('external store primary action is available, accurately labelled and opens its guide', () => {
    assertExternalStoreActionContract(storeUiSource);
});
test('external guide action contract rejects a disabled or misrouted guide action', () => {
    const withoutGuideRoute = storeUiSource.replace('this.openHomeWidgetGuide();\n                        return;', 'return;');
    assert.throws(() => assertExternalStoreActionContract(withoutGuideRoute), /说明动作必须打开说明/);
    const disabledGuide = storeUiSource.replace('!added && !guideOnly && !canHomeStoreInstall', '!added && !canHomeStoreInstall');
    assert.throws(() => assertExternalStoreActionContract(disabledGuide), /不能禁用说明入口/);
    const staleSizeLabel = storeUiSource.replace('const sizeActionLabel = guideOnly', 'const sizeActionLabel = false');
    assert.throws(() => assertExternalStoreActionContract(staleSizeLabel), /切换预览尺寸后仍须保持说明按钮名称和提示一致/);
});
test('store source metadata is a note', () => assert.match(storeUiSource, /sourceMeta\.setAttribute\("role", "note"\)/));
test('store source metadata has an accessible label', () => assert.match(storeUiSource, /sourceMeta\.setAttribute\("aria-label", this\.i18n\.homeStoreGuideHint\)/));
test('store source chips expose their kind', () => assert.match(storeUiSource, /chip\.dataset\.kind = kind/));
test('store source chips have accessible labels', () => assert.match(storeUiSource, /chip\.setAttribute\("aria-label", label\)/));
test('store card records supported sizes', () => assert.match(storeUiSource, /card\.dataset\.supportedSizes = supported\.join\(","\)/));
test('store card records current size', () => assert.match(storeUiSource, /card\.dataset\.currentSize = added\?\.size \|\| ""/));
test('store card status has stable id', () => assert.match(storeUiSource, /status\.id = `sw-home-store-status-\$\{moduleId\}\$\{idSuffix\}`/));
test('store card status records state', () => assert.match(storeUiSource, /status\.dataset\.state = added \? "added" : "available"/));
test('store card status is live', () => assert.match(storeUiSource, /status\.setAttribute\("aria-live", "polite"\)/));
test('store card references status description', () => assert.match(storeUiSource, /card\.setAttribute\("aria-describedby", status\.id\)/));
test('store preview records module id', () => assert.match(storeUiSource, /preview\.dataset\.moduleId = moduleId/));
test('store detail preview is mounted inline', () => assert.match(storeUiSource, /detailPane\.appendChild\(inlinePreview\.section\)/));
test('store detail preview has a labelled live region', () => assert.match(storeUiSource, /container\.setAttribute\("role", "region"\)/));
test('store detail does not expose a duplicate preview action', () => assert.doesNotMatch(storeUiSource, /previewButton\.dataset\.action = "preview"/));
test('store configure action records operation', () => assert.match(storeUiSource, /configButton\.dataset\.action = "configure"/));
test('store configure action announces dialog', () => assert.match(storeUiSource, /configButton\.setAttribute\("aria-haspopup", "dialog"\)/));
test('store remove action records operation', () => assert.match(storeUiSource, /removeButton\.dataset\.action = "remove"/));
test('store remove action keeps tooltip', () => assert.match(storeUiSource,/removeButton\.title = removeButton\.getAttribute\("aria-label"\)/));
test('store size row cannot shrink below content', () => assert.ok(declaresIn(css, '.sw-home-store__sizes', /min-width: 0/, base)));
test('store add action has a minimum width', () => assert.ok(declaresIn(css, '.sw-home-store__add', /min-width: 88px/, base)));
test('store add action has stronger emphasis', () => assert.ok(declaresIn(css, '.sw-home-store__add', /font-weight: 600/, base)));
test('store selected size has a data-state ring', () => assert.ok(declaresIn(css, /(^| )\.sw-home-store__size\[data-selected="true"]$/, /box-shadow/, base)));
test('store add action focus keeps a visible ring', () => assert.ok(declaresIn(css, '.sw-home-store__add:focus-visible', /box-shadow: var\(--sw-focus-ring/, base)));
test('store configure action preserves labels', () => assert.ok(declaresIn(css, '.sw-home-store__configure', /white-space: nowrap/, base)));
test('store remove action preserves labels', () => assert.ok(declaresIn(css, '.sw-home-store__remove', /white-space: nowrap/, base)));
