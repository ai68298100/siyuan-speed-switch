// T-7033：空工作台引导契约
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const panelSource = readSourceFile('src/second-panel-ui.ts');
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'zh-CN.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'en.json'), 'utf8'));

test('empty workbench: layered states, recommendations and default-restore (T-7033)', () => {
    // 分层：无组件源 vs 有源未添加
    assert.match(panelSource, /const hasSources = defs\.size > 0;/, '空态必须分层判定');
    assert.match(panelSource, /hasSources \? this\.i18n\.homeEmpty : this\.i18n\.homeEmptyNoSource/, '无源态必须有独立文案');
    // 三推荐：精选默认清单、排除已添加、走商店同管线（默认档解析）
    assert.match(panelSource, /const EMPTY_WORKBENCH_DEFAULT_IDS = \["recent-documents", "today-journal", "today-tasks"\]/, '推荐必须来自精选默认清单');
    assert.match(panelSource, /const candidates = EMPTY_WORKBENCH_DEFAULT_IDS\s+\.filter\(\(moduleId\) => defs\.has\(moduleId\) && !existingModules\.has\(moduleId\)\)/, '推荐必须排除已添加及目录外模块');
    assert.match(panelSource, /resolveHomeTileDefaultSize\(moduleId, supported, "medium"\)/, '推荐添加必须走默认档解析器');
    assert.match(panelSource, /layoutOpLabel = this\.i18n\.homeHistoryUpdate;/, '推荐/恢复必须入布局历史记账');
    assert.match(panelSource, /homeEmptyRecommendedConfirm[\s\S]*?if \(!confirm\(impact\)\) return;/, '推荐添加前必须明确确认影响');
    // 恢复默认：仅重建默认模块、已存在实例不重复创建
    assert.match(panelSource, /restore\.textContent = this\.i18n\.homeEmptyRestoreDefault;/, '恢复默认按钮必须存在');
    assert.match(panelSource, /const layoutList: Array<any> = \[\.\.\.\(\(next\.layouts\[device\] \|\| \[\]\) as Array<any>\)\]/, '恢复默认必须保留已有设备布局');
    assert.match(panelSource, /if \(!candidateDef\) return;[\s\S]*?if \(isLaidOut\(targetInstanceId\)\) return;/, '恢复默认不得重复创建已存在实例');
    assert.match(panelSource, /homeEmptyRestoreConfirm[\s\S]*?if \(!confirm\(impact\)\) return;/, '恢复默认前必须明确确认影响');
    assert.match(panelSource, /homeEmptyRestoreNothing/, '无缺失默认组件时必须给出明确回执');
    assert.match(panelSource, /commitLayoutMutation\(next\)/, '查看态推荐/恢复必须进入可撤销历史');
    assert.match(panelSource, /sw-home__history--view/, '查看态必须提供撤销/重做入口');
    // 说明行：材质/档位指针
    assert.match(panelSource, /tierHint\.textContent = this\.i18n\.homeEmptyTierHint;/, '必须给材质/档位说明行');
    // T-7134：推荐项必须把目录 availability 转成可见、可读的状态标签。
    assert.match(panelSource, /add\.dataset\.availability = availability;/, '推荐项必须保留可筛选的 availability 数据属性');
    assert.match(panelSource, /state\.textContent = availabilityLabel;/, '推荐项必须显示 availability 文案');
    assert.match(panelSource, /homeStoreAvailabilityReady/, '推荐项必须覆盖本地可用状态');
    for (const key of ['homeEmptyNoSource', 'homeEmptyRecommended', 'homeEmptyRestoreDefault', 'homeEmptyTierHint', 'homeEmptyRecommendedConfirm', 'homeEmptyRestoreConfirm', 'homeEmptyRestoreNothing', 'homeStoreAvailabilityReady', 'homeStoreAvailabilityConditional', 'homeStoreAvailabilityExternal']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});
