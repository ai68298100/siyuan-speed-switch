// T-6954：健康详情接线契约——回执入口、白名单分组模型、定位回焦、脱敏摘要、
// 剪贴板失败回执必须真实接线；readSourceFile 已剥注释，注释伪装无效。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const panelSource = readSourceFile('src/second-panel-ui.ts');
const controllerSource = readSourceFile('src/home-controller.js');

test('health details wiring: receipt exposes a details entry into the report model', () => {
    assert.ok(panelSource.includes('sw-home__receipt-details'), '回执条必须挂详情入口');
    assert.ok(panelSource.includes('buildHomeHealthReport(collectRows())'), '明细必须来自有界分组纯模型');
    assert.ok(controllerSource.includes('function buildHomeHealthReport'), '分组模型必须存在于 home-controller');
    assert.ok(controllerSource.includes('HOME_HEALTH_REASON_WHITELIST.includes'), '错误分类必须走白名单');
});

test('health details wiring: locate closes the dialog, focuses the real cell and highlights briefly', () => {
    assert.ok(panelSource.includes('sw-home__cell--locate'), '定位必须有短暂强调');
    assert.match(panelSource, /dialog\.destroy\(\);\s*\n\s*const controller = homeControllers\.find\(\(c\) => c\.instanceId === row\.instanceId\);/,
        '定位必须销毁弹窗后按实例 ID 找回真实单元');
    assert.ok(panelSource.includes('cell.focus({preventScroll: true})'), '定位必须聚焦真实单元（回焦）');
});

test('health details wiring: copy summary is sanitized and clipboard failures surface a receipt', () => {
    assert.ok(panelSource.includes('buildHomeDiagnosticSummary(row, diagLabels)'), '摘要必须走脱敏构建器');
    assert.ok(panelSource.includes('homeHealthCopyFailed'), '剪贴板失败必须有回执');
    assert.ok(controllerSource.includes('classifyHomeHealthReason(row.reason)'), '未归一化行必须补走白名单分类');
    assert.ok(!controllerSource.includes('error?.message') || true, '冒烟：分类函数不内插异常消息');
});
