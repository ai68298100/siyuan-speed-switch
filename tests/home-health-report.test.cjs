// T-7288：诊断只输出编译内置模块 ID、有界版本/枚举、状态、时间和缓存。
const test = require('node:test');
const assert = require('node:assert/strict');
const {classifyHomeHealthReason, buildHomeHealthReport, formatHealthTime, buildHomeDiagnosticSummary} = require('../src/home-controller.js');
const {DEFAULT_MODULES} = require('../src/home-model.js');

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

test('diagnostic summary excludes raw titles instance IDs and error text', () => {
    const labels = {head: '组件诊断', instance: '实例', status: '状态', cached: '缓存', cachedShown: '旧内容可见',
        noCache: '无', lastAttempt: '最近尝试', lastOk: '最近成功', unknown: '未知', failed: '失败', loading: '加载中', ok: '正常'};
    const summary = buildHomeDiagnosticSummary(row({
        reason: 'token=secret<script>', title: '私人笔记 https://example.test/?token=secret',
        instanceId: 'D:/private/note/path',
    }), labels);
    assert.equal(summary.split('\n')[0], '组件诊断: external-weather-open-meteo');
    assert.ok(summary.includes('(failed)'));
    assert.ok(summary.includes('2026-09-28 10:00'));
    assert.ok(!summary.includes('secret'), '凭据片段不得进入摘要');
    assert.ok(!summary.includes('<script>'), '异常原文不得进入摘要');
    assert.ok(!summary.includes('http'), 'URL 不得进入摘要');
    assert.ok(!summary.includes('私人笔记'));
    assert.ok(!summary.includes('D:/private'));
});

test('diagnostic summary revalidates reasonClass before export', () => {
    const summary = buildHomeDiagnosticSummary(row({reasonClass: 'https://example.test/?token=secret'}));
    assert.ok(summary.split('\n').includes('状态: 失败 (failed)'));
    assert.ok(!summary.includes('secret'));
    assert.ok(!summary.includes('https://'));
    assert.ok(buildHomeDiagnosticSummary(row({reasonClass: ' TIMEOUT '})).split('\n').includes('状态: 失败 (timeout)'));
});

test('diagnostic summary distinguishes stale loading ok and unknown states', () => {
    const status = (overrides) => buildHomeDiagnosticSummary(row(overrides), {stale: '旧内容'}).split('\n').find((line) => line.startsWith('状态:'));
    assert.equal(status({health: 'stale', reason: ''}), '状态: 旧内容 (stale)');
    assert.equal(status({health: 'stale', reason: 'timeout'}), '状态: 旧内容 (timeout)');
    assert.equal(status({health: 'loading', reasonClass: 'timeout'}), '状态: 加载中');
    assert.equal(status({health: 'ok', reasonClass: 'failed'}), '状态: 正常');
    assert.equal(status({health: 'https://example.test/?token=secret', reasonClass: 'failed'}), '状态: 加载中');
});

test('stale report rows retain safe failure reasons through diagnostic export', () => {
    for (const [reason, expected] of [['timeout', 'timeout'], ['offline', 'offline'], ['', 'stale'], [undefined, 'stale'], ['https://example.test/?token=secret', 'failed']]) {
        const report = buildHomeHealthReport([row({health: 'stale', reason})]);
        assert.equal(report.stale.length, 1);
        assert.equal(report.stale[0].reasonClass, expected);
        const summary = buildHomeDiagnosticSummary(report.stale[0], {stale: '旧内容'});
        assert.ok(summary.split('\n').includes(`状态: 旧内容 (${expected})`));
        assert.ok(!summary.includes('secret'));
    }
});

test('diagnostic module IDs come only from compiled builtins', () => {
    assert.ok(DEFAULT_MODULES.length >= 58, 'the production catalog must be nonempty');
    for (const module of DEFAULT_MODULES) {
        assert.equal(buildHomeDiagnosticSummary(row({moduleId: module.moduleId})).split('\n')[0], `组件诊断: ${module.moduleId}`);
    }
    for (const moduleId of ['thirdparty-widget', 'secret-token-value', 'external-weather-open-meteo?token=secret', 'D:/private/path', 'https://example.test/?token=secret', 'external-holiday-cn']) {
        const summary = buildHomeDiagnosticSummary(row({moduleId}));
        assert.equal(summary.split('\n')[0], '组件诊断: external-widget');
        assert.ok(!summary.includes(moduleId), 'unknown provider IDs must never escape');
    }
    for (const moduleId of ['', null, undefined, {toString: () => 'secret'}]) {
        assert.equal(buildHomeDiagnosticSummary(row({moduleId})).split('\n')[0], '组件诊断: unknown');
    }
});

test('diagnostic metadata accepts only bounded complete versions and device surface enums', () => {
    for (const version of ['0.47.2', '3.8.8-alpha.1', '3.8.4-beta.2', '3.9.0-rc1', '3.9.0-rc.12', '3.9.0-alpha']) {
        const summary = buildHomeDiagnosticSummary(row(), {}, {pluginVersion: version, hostVersion: version, device: 'mobile', surface: 'workbench'});
        assert.ok(summary.split('\n').includes(`Plugin: ${version}`));
        assert.ok(summary.split('\n').includes(`SiYuan: ${version}`));
        assert.ok(summary.split('\n').includes('Device: mobile'));
        assert.ok(summary.split('\n').includes('Surface: workbench'));
    }
    for (const version of ['', ' 0.47.2', '0.47.2\n', '0.47.2\nsecret', 'https://example.test/0.47.2?token=secret', '0.47.2-token-secret', '0.47.2+secret', 'secret', '1.2', '01.2.3', '1'.repeat(10000), null, 47, {toString: () => '1.2.3'}]) {
        const summary = buildHomeDiagnosticSummary(row(), {unknown: 'unknown'}, {pluginVersion: version, hostVersion: version, device: 'mobile?token=secret', surface: 'workbench?token=secret'});
        assert.ok(summary.split('\n').includes('Plugin: unknown'));
        assert.ok(summary.split('\n').includes('SiYuan: unknown'));
        assert.ok(summary.split('\n').includes('Device: unknown'));
        assert.ok(summary.split('\n').includes('Surface: unknown'));
        assert.ok(!summary.includes('secret'));
        assert.ok(summary.length < 500, 'invalid metadata must not enlarge the summary');
    }
    for (const device of ['desktop', 'sidebar']) {
        assert.ok(buildHomeDiagnosticSummary(row(), {}, {device, surface: 'workbench'}).split('\n').includes(`Device: ${device}`));
    }
    const missing = buildHomeDiagnosticSummary(row());
    assert.ok(missing.split('\n').includes('Plugin: 未知'));
    assert.ok(missing.split('\n').includes('SiYuan: 未知'));
    assert.ok(missing.split('\n').includes('Device: 未知'));
    assert.ok(missing.split('\n').includes('Surface: 未知'));
});

test('diagnostic timestamps reject finite values outside the Date range', () => {
    for (const invalid of [Number.MAX_VALUE, 8640000000000001, Infinity, -Infinity, -1, 0, '1770000000000', NaN]) {
        assert.equal(formatHealthTime(invalid, 'unknown'), 'unknown');
        const summary = buildHomeDiagnosticSummary(row({lastAttemptAt: invalid, lastOkAt: invalid}), {unknown: 'unknown'});
        assert.ok(summary.split('\n').includes('最近尝试: unknown'));
        assert.ok(summary.split('\n').includes('最近成功: unknown'));
        assert.ok(!summary.includes('NaN'));
    }
});
