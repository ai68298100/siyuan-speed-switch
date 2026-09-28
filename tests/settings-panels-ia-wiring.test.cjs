// T-6998：设置页信息架构合同——遗留 homePanel 构建内容必须并入“面板”标签
// （ADR 0097：保留 10 标签 IA），不得以不可达死键存在；组件面板字段进入
// “面板”页后由设置搜索（T-6951 生产 DOM 索引）与 lastSettingsTab 自动覆盖。
// T-7016：历史下拉分区合同——分区标题带计数、每区默认前 8 条、超出展开全部
// （P7 用户反馈"历史下拉被日记条目淹没"的落地行为，防回退）。
// 注意：readSourceFile 已剥注释，"把调用写进注释"无法骗过本契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {readSourceFile} = require('./source-scan.cjs');

const indexSource = readSourceFile('src/index.ts');
const sectionsSource = readSourceFile('src/settings-sections.ts');

test('settings IA: home panel fields live inside the panels tab (T-6998)', () => {
    const panelsFn = sectionsSource.slice(
        sectionsSource.indexOf('export function buildSettingsPanels('),
        sectionsSource.indexOf('export function buildSettingsDockToggles('),
    );
    assert.ok(panelsFn.includes('buildSettingsHomePanel.call(this, s)'),
        '“面板”标签必须渲染遗留 homePanel 内容（组件面板分组并入 ADR 0097 定案）');
    assert.doesNotMatch(indexSource, /homePanel:\s*\(\)\s*=>/,
        'builders 不得保留不可达的 homePanel 死键');
    // 组件面板分组的两个既有控制面（调色/尺寸档）由 buildSettingsHomePanel 提供：
    assert.ok(sectionsSource.includes('setHomeSizeMode'), '工作台尺寸分段控件必须保留');
    assert.ok(sectionsSource.includes('setHomePalette'), '组件面板调色分段控件必须保留');
});

test('history dropdown: sections show counts, cap at 8 and expand the rest (T-7016)', () => {
    const renderFn = indexSource.slice(
        indexSource.indexOf('private renderOpenHistoryPanel('),
        indexSource.indexOf('private bindHistoryItemActions('),
    );
    assert.ok(renderFn.includes('(${visible.length})'),
        '分区标题必须带条目计数（计数可见，不靠颜色）');
    assert.ok(renderFn.includes('Math.min(visible.length, 8)'),
        '每区默认最多 8 条（首屏两个分区均可达）');
    assert.ok(renderFn.includes('sw__history-expand'), '超出上限必须有展开按钮');
    assert.ok(renderFn.includes('expand.remove()'), '展开后按钮必须移除自身再渲染剩余条目');
    assert.ok(renderFn.includes('historyOpenSection') && renderFn.includes('historyClosedSection'),
        '仍打开/已关闭两个分区标题键必须都在');
    for (const localeFile of ['src/i18n/zh-CN.json', 'src/i18n/en.json']) {
        const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '..', localeFile), 'utf8'));
        for (const key of ['historyExpand', 'historyOpenSection', 'historyClosedSection']) {
            assert.ok(typeof locale[key] === 'string' && locale[key].length > 0,
                `${localeFile} 必须提供 ${key} 双语文案`);
        }
    }
});
