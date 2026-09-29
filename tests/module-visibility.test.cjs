// T-7026（ADR 0099）：模块可见性契约——「启用=可见且可进入」单一语义；切换器为
// 平台根不设开关（防锁死保底）；路由层唯一校验点诚实回执；顶栏收敛为单一入口；
// 悬浮球模块门控；模块级快捷动作过滤。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');
const {
    normalizeModuleVisibility,
    isSurfaceModuleEnabled,
    filterSurfacesByVisibility,
    MODULE_TOGGLE_KEYS,
} = require('../src/platform-surface-model.js');

const indexSource = readSourceFile('src/index.ts');
const sectionsSource = readSourceFile('src/settings-sections.ts');
const settingsModel = readSourceFile('src/settings-model.js');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('module visibility model: defaults all-on, per-key boolean normalization, switcher always enabled', () => {
    assert.deepEqual(normalizeModuleVisibility(undefined), {workbench: true, studio: true, floatingBall: true}, '缺省必须全开（旧配置零迁移）');
    assert.deepEqual(normalizeModuleVisibility({studio: false, workbench: "x", floatingBall: null}),
        {workbench: true, studio: false, floatingBall: true}, '非法值逐键回落布尔归一');
    assert.deepEqual(normalizeModuleVisibility("junk"), {workbench: true, studio: true, floatingBall: true}, '非对象整体回落默认');
    assert.deepEqual(MODULE_TOGGLE_KEYS, ['workbench', 'studio', 'floatingBall'], '可开关模块冻结清单');
    assert.equal(isSurfaceModuleEnabled('switcher', {workbench: false, studio: false, floatingBall: false}), true, '切换器平台根恒启用');
    assert.equal(isSurfaceModuleEnabled('studio', {studio: false}), false);
    assert.deepEqual(filterSurfacesByVisibility(['switcher', 'workbench', 'studio'], {workbench: false}),
        ['switcher', 'studio'], '过滤保序');
});

test('module visibility wiring: single route guard, availability filter, honest receipt', () => {
    assert.match(indexSource, /if \(!this\.getAvailablePlatformSurfaces\(\)\.includes\(surface\)\) \{\s*\n\s*showMessage\(this\.i18n\.moduleDisabledReceipt/,
        '路由层唯一校验点必须诚实回执拒绝');
    assert.match(indexSource, /return filterSurfacesByVisibility\(base, this\.getSettings\(\)\.moduleVisibility\);/,
        '可用表面清单必须按模块开关过滤（SurfaceNav/悬浮球/预览自动继承）');
    assert.match(settingsModel, /moduleVisibility: normalizeModuleVisibility\(source\.moduleVisibility\),/,
        '设置归一必须走纯模型');
    for (const key of ['moduleDisabledReceipt', 'moduleWorkbench', 'moduleStudio', 'moduleFloatingBall', 'moduleVisibilityHint', 'settingsGroupModules']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});

test('module visibility wiring: single unified topbar entry (T-7026 D3)', () => {
    assert.doesNotMatch(indexSource, /secondPanelTopBar/, '第二面板顶栏入口必须移除（收敛为单一平台入口）');
    const addTopBarCalls = [...indexSource.matchAll(/this\.addTopBar\(/g)].length;
    assert.equal(addTopBarCalls, 1, `顶栏注册必须恰好一处，实测 ${addTopBarCalls} 处`);
    assert.match(indexSource, /for \(const surface of this\.getAvailablePlatformSurfaces\(\)\) \{\s*\n\s*if \(surface === "switcher"\) continue;/,
        '统一入口菜单必须动态列出已启用表面（过滤切换器本体）');
    assert.match(indexSource, /private platformSurfaceDisplayName\(surface: PlatformSurface\): string/,
        '回执与菜单必须共用同一显示名源');
});

test('module visibility wiring: floating-ball gate and quick-action filter (T-7026 D6/D7)', () => {
    assert.match(indexSource, /if \(settings\.moduleVisibility\?\.floatingBall === false\) \{[\s\S]{0,200}?forEach\(\(surface\) => this\.destroyFloatingBallSurface\(surface\)\);/,
        '悬浮球模块关闭必须全端销毁挂载');
    assert.match(indexSource, /\.filter\(\(action\) => this\.moduleActionEnabled\(action\.value\)\)/,
        '快捷动作渲染必须按模块过滤');
    assert.match(indexSource, /if \(value === "home"\) return visibility\.workbench !== false;/, '工作台动作必须随模块开关');
    assert.match(indexSource, /if \(value === "snippet-studio"\) return visibility\.studio !== false;/, '实验室动作必须随模块开关');
    assert.match(sectionsSource, /checkbox\.dataset\.moduleKey = key;/, '设置开关必须带稳定模块标识');
    assert.match(sectionsSource, /if \(key === "floatingBall"\) this\.updateFloatingBallVisibility\?\.\(\);/,
        '悬浮球开关变化必须触发重算挂载');
});
