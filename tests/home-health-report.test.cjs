// T-6954：健康详情与脱敏诊断纯模型——白名单分类（恶意 reason 折叠）、分组、
// 未知时间、摘要只含白名单字段（异常文本/URL/密钥不得泄露）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {classifyHomeHealthReason, buildHomeHealthReport, formatHealthTime, buildHomeDiagnosticSummary} = require('../src/home-controller.js');

const row = (over = {}) => ({
    instanceId: 'inst-1', moduleId: 'external-weather-open-meteo', title: '近期天气',
    health: 'failed', cached: true, reason: 'timeout',
    lastAttemptAt: new Date(2026, 8, 28, 10, 0).getTime(), lastOkAt: null, ...over,
});

test('health reasons are folded into a safe whitelist classification', () => {
    assert.equal(classifyHomeHealthReason('timeout'), 'timeout');
    assert.equal(classifyHomeHealthReason(' FAILED '), 'failed');
    assert.equal(classifyHomeHealthReason('https://evil/?token=secret'), 'failed', 'URL/注入文本必须折叠为 failed');
    assert.equal(classifyHealthish('password=123'), 'failed');
    assert.equal(classifyHomeHealthReason(undefined), 'failed');
    function classifyHealthish(value) { return classifyHomeHealthReason(value); }
});

test('report groups failed/loading/ok and marks cached rows', () => {
    const report = buildHomeHealthReport([
        row(),
        row({instanceId: 'inst-2', health: 'loading', cached: false}),
        row({instanceId: 'inst-3', health: 'ok', cached: false, lastOkAt: 1000}),
        row({instanceId: ''}), // 非法条目丢弃
        row({instanceId: 'inst-4', health: 'bogus'}), // 未知健康值归入加载中
    ]);
    assert.equal(report.failed.length, 1);
    assert.equal(report.loading.length, 2, '非法健康值归入加载中');
    assert.equal(report.ok.length, 1);
    assert.equal(report.failed[0].reasonClass, 'timeout');
    assert.equal(report.failed[0].cached, true, '旧内容可见仍计失败但标注缓存');
});

test('unknown times render as the unknown label, never fabricated', () => {
    assert.equal(formatHealthTime(NaN, '未知'), '未知');
    assert.equal(formatHealthTime(undefined, '未知'), '未知');
    assert.equal(formatHealthTime(0, '未知'), '未知');
    assert.equal(formatHealthTime(new Date(2026, 8, 28, 10, 5).getTime(), '未知'), '2026-09-28 10:05');
    const labels = {unknown: 'unknown'};
    assert.ok(buildHomeDiagnosticSummary(row({lastAttemptAt: null, lastOkAt: null}), labels).includes('unknown'));
});

test('diagnostic summary contains only whitelisted fields', () => {
    const labels = {head: '组件诊断', instance: '实例', status: '状态', cached: '缓存', cachedShown: '旧内容可见',
        noCache: '无', lastAttempt: '最近尝试', lastOk: '最近成功', unknown: '未知', failed: '失败', loading: '加载中', ok: '正常'};
    const summary = buildHomeDiagnosticSummary(row({reason: 'token=secret<script>'}), labels);
    assert.ok(summary.includes('近期天气'));
    assert.ok(summary.includes('(external-weather-open-meteo)'));
    assert.ok(summary.includes('(failed)'));
    assert.ok(summary.includes('2026-09-28 10:00'));
    assert.ok(!summary.includes('secret'), '凭据片段不得进入摘要');
    assert.ok(!summary.includes('<script>'), '异常原文不得进入摘要');
    assert.ok(!summary.includes('http'), 'URL 不得进入摘要');
});
