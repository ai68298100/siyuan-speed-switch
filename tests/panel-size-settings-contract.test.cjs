// T-6986 + T-6999：三面板尺寸设置统一契约。
// - 片段实验室尺寸模式（fullscreen/adaptive/custom，默认全屏，D1 决断）；
// - 三面板窗口组统一收进「面板」设置标签（切换器/工作台/实验室），带默认值
//   提示与预览入口；外观页不再重复承载切换器窗口组。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {readSourceFile} = require('./source-scan.cjs');

const settingsSections = readSourceFile('src/settings-sections.ts');
const indexSource = readSourceFile('src/index.ts');
const settingsModel = readSourceFile('src/settings-model.js');

// 按构建函数切片：相邻两个 builder 之间的源码段（剥注释后仍按函数名锚定）。
function builderSlice(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `builder slice not found: ${startMarker}`);
    return source.slice(start, end);
}

function loadLocale(locale) {
    return JSON.parse(fs.readFileSync(`src/i18n/${locale}.json`, 'utf8'));
}

test('studio size mode: whitelist normalization falls back to fullscreen (T-6986, D1)', () => {
    assert.match(settingsModel, /studioSizeMode: source\.studioSizeMode === "adaptive" \|\| source\.studioSizeMode === "custom"/,
        '模式白名单必须收全 adaptive/custom/fullscreen');
    assert.match(settingsModel, /defaults\.studioSizeMode \|\| "fullscreen"/, '非法值必须回落全屏（ADR 0080 不回退）');
    assert.match(settingsModel, /studioWidth: clamp\(source\.studioWidth, \.\.\.range\("studioWidth"\), defaults\.studioWidth \|\| 1120\)/);
    assert.match(settingsModel, /studioHeight: clamp\(source\.studioHeight, \.\.\.range\("studioHeight"\), defaults\.studioHeight \|\| 800\)/);
});

test('panel windows group lives in the panels tab with preview entries (T-6999)', () => {
    const panelsSlice = builderSlice(settingsSections, 'export function buildSettingsPanels', 'export function buildSettingsDockToggles');
    const appearanceSlice = builderSlice(settingsSections, 'export function buildSettingsAppearance', 'export function buildSettingsBehavior');
    // 切换器窗口组：分段控件 + 比例/固定宽高条件行 + 默认提示 + 预览入口。
    assert.match(panelsSlice, /settingSegmented\(this\.i18n\.panelSizeMode, this\.i18n\.panelSizeModeTip/,
        '切换器尺寸模式必须仍以分段控件呈现（迁入面板页）');
    assert.match(panelsSlice, /s\.panelSizeMode === "adaptive"/, '自适应比例行须条件渲染');
    assert.match(panelsSlice, /s\.panelSizeMode === "custom"/, '固定宽高行须条件渲染');
    assert.match(panelsSlice, /buildPanelPreviewButton\.call\(this, "switcher"/, '切换器组必须带预览入口');
    // 实验室窗口组：桌面专属（isMobile 门控），custom 才显示宽高。
    assert.match(panelsSlice, /if \(!this\.isMobile\) \{[\s\S]*?setStudioSizeMode/, '实验室组必须桌面专属');
    assert.match(panelsSlice, /s\.studioSizeMode === "custom"/, '实验室固定宽高须条件渲染');
    assert.match(panelsSlice, /buildPanelPreviewButton\.call\(this, "studio"/, '实验室组必须带预览入口');
    // 默认值提示：三组共用同一文案键，且明确「设置页自身不受面板尺寸影响」。
    assert.match(panelsSlice, /panelSizeDefaultHint/);
    // 外观页不再承载窗口组（panelSizeMode 设置行不得回流）。
    assert.doesNotMatch(appearanceSlice, /panelSizeMode/, '外观页不得再出现面板尺寸设置行');
    assert.doesNotMatch(appearanceSlice, /settingsGroupWindow/, '外观页不得再挂窗口分组标题');
});

test('workbench window group carries the default hint and preview entry (T-6999)', () => {
    const homePanelSlice = builderSlice(settingsSections, 'export function buildSettingsHomePanel', 'export function buildSettingsMobile');
    assert.match(homePanelSlice, /panelSizeDefaultHint/);
    assert.match(homePanelSlice, /buildPanelPreviewButton\.call\(this, "workbench"/, '工作台组必须带预览入口');
});

test('preview routing: host openPanelPreview reuses the platform surface pipeline (T-6999)', () => {
    assert.match(indexSource, /openPanelPreview\(surface: "switcher" \| "workbench" \| "studio"\)/,
        '宿主必须提供 openPanelPreview');
    assert.match(indexSource, /if \(surface === "studio" && this\.isMobile\) return;/,
        '移动端不得从设置打开桌面专属实验室');
    assert.match(indexSource, /this\.openPlatformSurface\(surface, "switcher"\);/,
        '预览必须走平台表面统一管线（单例守卫 + FAB 串行释放）');
    // 宿主接口声明：builder 只能经此入口打开面板。
    assert.match(settingsSections, /openPanelPreview\(surface: "switcher" \| "workbench" \| "studio"\): void;/);
});

test('panel window i18n keys exist in both locales (T-6986/T-6999)', () => {
    for (const locale of ['zh-CN', 'en']) {
        const data = loadLocale(locale);
        for (const key of ['setStudioSizeMode', 'setStudioSizeModeTip', 'setStudioWidth', 'setStudioWidthTip',
            'setStudioHeight', 'setStudioHeightTip', 'settingsGroupPanelWindows', 'panelSizeDefaultHint',
            'panelSizePreview', 'panelSizePreviewTip']) {
            assert.ok(typeof data[key] === 'string' && data[key].length > 0, `${locale} must carry ${key}`);
        }
    }
    assert.deepEqual(Object.keys(loadLocale('zh-CN')).sort(), Object.keys(loadLocale('en')).sort(),
        '双语 key 集合必须一致');
});
