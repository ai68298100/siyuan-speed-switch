// T-7003：设置保存回执 / 最近变更撤销 / 分组恢复默认 / 外部变更现场重建 契约。
// - 落盘结果三态可感知（pending/ok/failed），失败不再只进日志（不误报成功）；
// - 撤销栈记录「逆向补丁」（lastSettingsTab 除外），撤销应用抑制再入栈；
// - 分组恢复默认只允许 DEFAULT_SETTINGS 已知字段，经 updateSettings 应用；
// - 外部变更带现场重建（焦点在弹窗内时跳过，不打断本页输入）。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {readSourceFile} = require('./source-scan.cjs');

const indexSource = readSourceFile('src/index.ts');
const sections = readSourceFile('src/settings-sections.ts');

function loadLocale(locale) {
    return JSON.parse(fs.readFileSync(`src/i18n/${locale}.json`, 'utf8'));
}

test('save outcome is tracked per key and surfaced for the settings key (T-7003)', () => {
    assert.match(indexSource, /this\.lastSaveOutcome\[key\] = "pending";/, '排队即置 pending（防抖期不误报已保存）');
    assert.match(indexSource, /this\.lastSaveOutcome\[key\] = "ok";/, '落盘成功才置 ok');
    assert.match(indexSource, /this\.lastSaveOutcome\[key\] = "failed";/, '落盘失败必须置 failed（不再只进日志）');
    assert.match(indexSource, /document\.dispatchEvent\(new Event\("sw-settings-save-state"\)\);/,
        '设置 key 的结果变化必须广播给设置页回执');
    assert.match(indexSource, /retrySettingsSave\(\) \{[\s\S]{0,200}queueSave\(SETTINGS_KEY, this\.data\[SETTINGS_KEY\]\)/,
        '失败重试必须用当前内存值重新排队（同一串行链）');
});

test('updateSettings records the inverse patch for undo, excluding nav memory (T-7003)', () => {
    assert.match(indexSource, /const patchKeys = Object\.keys\(patch\)\.filter\(\(key\) => key !== "lastSettingsTab"\);/,
        'lastSettingsTab 是导航记忆，不入撤销栈');
    assert.match(indexSource, /const inverse: Record<string, unknown> = \{\};[\s\S]{0,120}for \(const key of patchKeys\) inverse\[key\] = previousRecord\[key\];/,
        '逆向补丁必须记录变更前值');
    assert.match(indexSource, /if \(patchKeys\.length > 0 && this\.settingsUndoRecorder && !this\.settingsUndoSuppress\) \{/,
        '撤销应用期间必须抑制再入栈');
    assert.match(indexSource, /document\.dispatchEvent\(new Event\("sw-settings-updated"\)\);/,
        '设置变更必须广播（外部重建的数据源）');
});

test('group reset only accepts known default fields and reuses updateSettings (T-7003)', () => {
    assert.match(indexSource, /if \(!Object\.prototype\.hasOwnProperty\.call\(defaults, key\)\) return false;/,
        '未知 key 必须拒绝（防任意字段注入）');
    assert.match(indexSource, /this\.updateSettings\(patch as Partial<ISwSettings>\);/,
        '恢复默认必须经 updateSettings（入撤销栈 + 派生刷新）');
    assert.match(indexSource, /this\.settingsSceneReloader\?\.\(\);/, '恢复默认后必须触发现场重渲染');
    // 注册表的每个 key 都必须是 DEFAULT_SETTINGS 已知字段
    const defaultsSlice = indexSource.slice(
        indexSource.indexOf('const DEFAULT_SETTINGS: ISwSettings = {'),
        indexSource.indexOf('const DEFAULT_SETTINGS: ISwSettings = {') + 3200);
    const registryMatch = sections.match(/const SETTING_GROUP_DEFAULT_KEYS: Record<string, ReadonlyArray<string>> = \{[\s\S]*?\n\};/);
    assert.ok(registryMatch, '分组默认值注册表必须存在');
    const keys = Array.from(registryMatch[0].matchAll(/"([a-zA-Z]+)"/g)).map((m) => m[1])
        .filter((name) => name !== 'Record' && name !== 'string');
    assert.ok(keys.length >= 15, `注册表应覆盖主要可视组（当前 ${keys.length} 个 key）`);
    for (const key of keys) {
        assert.ok(defaultsSlice.includes(`    ${key}:`), `注册表 key ${key} 必须是 DEFAULT_SETTINGS 已知字段`);
    }
});

test('reset buttons render only for registered groups via the shared helper (T-7003)', () => {
    assert.match(sections, /function appendGroupResetButton\(this: SettingsSectionsHost, title: HTMLElement, groupTitleKey: string\): HTMLElement \{[\s\S]{0,200}if \(!keys \|\| keys\.length === 0\) return title;/,
        '未注册组不得渲染重置按钮');
    assert.match(sections, /this\.resetSettingsToDefaults\(\[\.\.\.keys\]\)/, '按钮必须走宿主校验通道');
    // 七个已登记组标题接线（保留既有 settingGroupTitle 调用形态）
    for (const groupKey of ['settingsGroupTheme', 'settingsGroupThumbnails', 'settingsGroupSortDensity',
        'settingsGroupSearchOpen', 'settingsGroupPanelWindows', 'settingsGroupWorkbenchWindow', 'settingsGroupMobileLayout']) {
        assert.match(sections, new RegExp(`appendGroupResetButton\\.call\\(this, this\\.settingGroupTitle\\(this\\.i18n\\.${groupKey}\\), "${groupKey}"\\)`),
            `${groupKey} 组必须接恢复默认按钮`);
    }
});

test('settings dialog wires statusbar, undo stack and external rebuild with cleanup (T-7003)', () => {
    assert.match(indexSource, /saveState\.setAttribute\("role", "status"\);\s*\n\s*saveState\.setAttribute\("aria-live", "polite"\);/,
        '保存回执必须 live 播报');
    assert.match(indexSource, /saveRetry\.hidden = outcome !== "failed";/, '重试按钮仅在失败时出现');
    assert.match(indexSource, /if \(undoStack\.length > 20\) undoStack\.shift\(\);/, '撤销栈有界（20 步）');
    assert.match(indexSource, /this\.settingsUndoSuppress = true;\s*\n\s*try \{\s*\n\s*this\.updateSettings\(inverse as Partial<ISwSettings>\);/,
        '撤销应用必须抑制再入栈');
    assert.match(indexSource, /panelEl\.replaceChildren\(builders\[key\]\(\)\);[\s\S]{0,800}this\.settingsSceneReloader = rebuildActivePanelPreservingScene;/,
        '现场重建钩子必须装配到宿主（replaceChildren 后复位滚动/焦点）');
    // 外部重建：焦点在弹窗内跳过（不打断本页输入）+ 防抖 + 监听释放
    assert.match(indexSource, /if \(active instanceof HTMLElement && root\.contains\(active\)\) return;/,
        '本页交互中的变更不得触发重建');
    assert.match(indexSource, /document\.removeEventListener\("sw-settings-save-state", syncSaveState\);\s*\n\s*document\.removeEventListener\("sw-settings-updated", onSettingsUpdatedExternal\);/,
        '两个 document 监听必须在弹窗销毁时移除');
    assert.match(indexSource, /this\.settingsUndoRecorder = null;\s*\n\s*this\.settingsSceneReloader = null;/,
        '弹窗销毁必须摘除宿主钩子');
    // builders 必须读实时设置（撤销/重置/外部重建后面板重渲染才能反映真值）
    assert.match(indexSource, /appearance: \(\) => buildSettingsAppearance\.call\(this, this\.getSettings\(\)\)/);
    assert.doesNotMatch(indexSource, /buildSettingsAppearance\.call\(this, s\)/, '不得再闭包持有打开时的设置快照');
});

test('save/undo/reset i18n keys exist in both locales (T-7003)', () => {
    for (const locale of ['zh-CN', 'en']) {
        const data = loadLocale(locale);
        for (const key of ['settingsSavePending', 'settingsSaveOk', 'settingsSaveFailed', 'settingsSaveRetry',
            'settingsUndo', 'settingsUndoDone', 'settingGroupReset', 'settingGroupResetDone']) {
            assert.ok(typeof data[key] === 'string' && data[key].length > 0, `${locale} must carry ${key}`);
        }
    }
});
