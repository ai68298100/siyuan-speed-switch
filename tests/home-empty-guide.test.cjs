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
    // 推荐与恢复共享开箱清单、排除已添加、走商店同管线（默认档解析）。
    assert.match(panelSource, /const EMPTY_WORKBENCH_DEFAULT_IDS: readonly string\[\] = HOME_DEFAULT_MODULE_IDS;/, '推荐必须来自同一精选默认清单');
    assert.match(panelSource, /const candidates = EMPTY_WORKBENCH_DEFAULT_IDS\s+\.filter\(\(moduleId\) => defs\.has\(moduleId\) && !existingModules\.has\(moduleId\)\)/, '推荐必须排除已添加及目录外模块');
    assert.match(panelSource, /resolveHomeTileDefaultSize\(moduleId, supported, "medium"\)/, '推荐添加必须走默认档解析器');
    assert.match(panelSource, /layoutOpLabel = this\.i18n\.homeHistoryUpdate;/, '推荐/恢复必须入布局历史记账');
    assert.match(panelSource, /homeEmptyRecommendedConfirm[\s\S]*?if \(!confirm\(impact\)\) return;/, '推荐添加前必须明确确认影响');
    // 恢复默认：同一动作供空态与非空编辑态复用，只补缺项且保留现状。
    assert.ok(panelSource.includes('const getDefaultRestorePlan = (homeState = this.getHomeState()) => {'), '恢复计划必须从当前状态计算');
    assert.ok(panelSource.includes('const layoutList: Array<any> = [...((homeState.layouts[device] || []) as Array<any>)]'), '恢复必须保留已有设备布局');
    assert.ok(panelSource.includes('return !existing || !isLaidOut(existing.instanceId);'), '已布局的精选默认组件不得重复添加');
    assert.ok(panelSource.includes('const restoreDefaultComponents = () => {'), '空态与编辑态必须共用恢复动作');
    assert.ok(panelSource.includes('if (!confirm(impact)) return;'), '恢复默认前必须明确确认影响');
    assert.ok(panelSource.includes('restore.disabled = restorePlan.missing.length === 0;'), '没有缺项时入口必须禁用');
    assert.equal((panelSource.match(/createRestoreButton\("b3-button b3-button--(?:text sw-home__restore-default|outline sw-home__empty-restore)"\)/g) || []).length, 2,
        '空态和编辑工具栏都必须复用同一恢复按钮构造');
    assert.equal((panelSource.match(/restore\.addEventListener\("click", restoreDefaultComponents\);/g) || []).length, 1,
        '共享恢复按钮必须连接到同一恢复动作');
    assert.ok(panelSource.includes('homeEmptyRestoreNothing'), '无缺失默认组件时必须给出明确回执');
    assert.match(panelSource, /commitLayoutMutation\(next\)/, '查看态推荐/恢复必须进入可撤销历史');
    assert.match(panelSource, /sw-home__history--view/, '查看态必须提供撤销/重做入口');
    // 说明行：材质/档位指针
    assert.match(panelSource, /tierHint\.textContent = this\.i18n\.homeEmptyTierHint;/, '必须给材质/档位说明行');
    // T-7134：推荐项必须把目录 availability 转成可见、可读的状态标签。
    assert.match(panelSource, /add\.dataset\.availability = availability;/, '推荐项必须保留可筛选的 availability 数据属性');
    assert.match(panelSource, /state\.textContent = availabilityLabel;/, '推荐项必须显示 availability 文案');
    assert.match(panelSource, /homeStoreAvailabilityReady/, '推荐项必须覆盖本地可用状态');
    for (const key of ['homeEmptyNoSource', 'homeEmptyRecommended', 'homeEmptyRestoreDefault', 'homeRestoreDefaultHint', 'homeEmptyTierHint', 'homeEmptyRecommendedConfirm', 'homeEmptyRestoreConfirm', 'homeEmptyRestoreNothing', 'homeStoreAvailabilityReady', 'homeStoreAvailabilityConditional', 'homeStoreAvailabilityExternal']) {
        assert.ok(zh[key] && en[key], `i18n 键 ${key} 必须双语齐备`);
    }
});
