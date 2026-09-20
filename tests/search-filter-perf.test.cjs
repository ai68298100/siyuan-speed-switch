/**
 * 第一层本地页签过滤性能基准（ROADMAP 3.5 性能预算；v0.27 升格为硬门禁）
 *
 * 预算口径：超大页签集单次过滤以 50 ms 为告警线。2026-09-14 优化后
 * （见 D-217），匹配由轻量规范化门禁把关，图元安全的重型规范化只在
 * 命中条目产出时执行——成本随"命中数"扩展，不再随页签总数线性放大。
 * 本基准用 300 条合成页签分别压两条路径：关键词门禁路径预算收紧到
 * 告警线的 30%，空查询全量产出路径放宽到告警线的 90%；均值断言
 * 15ms/48ms，保留 50ms 告警线的最小余量和明显回归检测能力。
 *
 * 硬门禁升格（T-6711，ROADMAP §8.0.6 v0.27.x 首项；准入=基准连续三版
 * 稳定 v0.24/v0.25/v0.26）：度量改 CPU 时间（T-6706 实录：满载套件内
 * 墙钟膨胀 1.6~2.7 倍、cpuUsage 只免调度等待不免降频，CPU 均值对负载
 * 稳定）+ best-of-3 取最优轮；均值断言本地与 CI 一律无条件执行，不再
 * 豁免。p95 尾部由 GC 支配，降为趋势诊断；病理性回退（O(n²) 化）会让
 * 均值以数倍穿线，任何环境下都拦截。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {filterOpenTabs, filterSearchDocuments} = require('../src/search-model.js');

const TAB_COUNT = 300;
const ITERATIONS = 400;

function buildSyntheticTabs() {
    const notebooks = ['20250910120000-abc1234', '20250910120005-def5678'];
    const segments = ['项目', 'Projects', '会议记录', 'Journal', 'archive', '读书笔记', 'inbox', 'Daily'];
    const titles = ['周会纪要', 'Roadmap review', '腾讯会议记录', 'reading list', '日报', 'standup notes', '设计稿评审', 'retrospective'];
    const tabs = [];
    for (let i = 0; i < TAB_COUNT; i += 1) {
        const title = `${titles[i % titles.length]}-${i}`;
        const path = `/${notebooks[i % notebooks.length]}/${segments[i % segments.length]}/${segments[(i + 3) % segments.length]}/${title}`;
        tabs.push({
            id: `tab-${i}`,
            rootId: `20260914090000-${(i % 10).toString(16)}${i.toString(16).padStart(4, '0')}`,
            title,
            hPath: path,
            notebookId: notebooks[i % notebooks.length],
            updated: Date.now() - i * 60000,
            pinned: i % 17 === 0,
        });
    }
    return tabs;
}

// CPU 时间单样本：cpuUsage 为微秒，换算毫秒。免调度等待；降频/缓存竞争
// 的残余膨胀由 best-of-3 与预算余量吸收（T-6706 口径）。
function measureOnce(tabs, queries, filtersByCall) {
    const samples = [];
    let seen = 0;
    for (let i = 0; i < ITERATIONS; i += 1) {
        const query = queries[i % queries.length];
        const started = process.cpuUsage();
        const result = filterOpenTabs(tabs, query, filtersByCall(query));
        const used = process.cpuUsage(started);
        samples.push((used.user + used.system) / 1e3);
        seen += result.length;
    }
    assert.ok(seen >= 0);
    samples.sort((a, b) => a - b);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
    return {average, p95};
}

function bestOfRounds(tabs, queries, filtersByCall, rounds = 3) {
    // best-of-3 取各指标最小值——负载尖峰只污染部分轮次；
    // 真回归让全部轮次一起抬升，最小值照样超限（T-6467 口径）。
    let bestAverage = Number.POSITIVE_INFINITY;
    let bestP95 = Number.POSITIVE_INFINITY;
    for (let round = 0; round < rounds; round += 1) {
        const {average, p95} = measureOnce(tabs, queries, filtersByCall);
        bestAverage = Math.min(bestAverage, average);
        bestP95 = Math.min(bestP95, p95);
    }
    return {bestAverage, bestP95};
}

test('keyword-gated filtering stays near-constant as matches stay bounded', (t) => {
    const tabs = buildSyntheticTabs();
    const queries = ['roadmap', '会议', 'standup', 'zzz-no-hit'];
    const {bestAverage, bestP95} = bestOfRounds(tabs, queries, () => ({}));
    t.diagnostic(`keyword path (${TAB_COUNT} tabs x ${ITERATIONS}), best of 3: cpu avg ${bestAverage.toFixed(4)}ms, cpu p95 ${bestP95.toFixed(4)}ms (hard gate 15ms avg)`);
    assert.ok(bestAverage < 15, `keyword path cpu avg ${bestAverage.toFixed(3)}ms exceeds 15ms; loose-gate regression`);
});

test('empty-query full-emission path stays within the 50ms alert line', (t) => {
    const tabs = buildSyntheticTabs();
    const {bestAverage, bestP95} = bestOfRounds(tabs, [''], () => ({}));
    t.diagnostic(`empty-query path (${TAB_COUNT} tabs x ${ITERATIONS}), best of 3: cpu avg ${bestAverage.toFixed(4)}ms, cpu p95 ${bestP95.toFixed(4)}ms (hard gate 48ms avg)`);
    assert.ok(bestAverage < 48, `empty-query cpu avg ${bestAverage.toFixed(3)}ms exceeds 48ms (50ms alert line headroom)`);
});

test('document scope predicate stays bounded for 300 remote cards', (t) => {
    const docs = buildSyntheticTabs().map((tab) => ({
        path: tab.hPath,
        hPath: tab.hPath,
        notebookId: tab.notebookId,
        rootId: tab.rootId,
    }));
    const filters = {notebook: docs[0].notebookId, paths: [`${docs[0].notebookId}/项目` ]};
    for (let i = 0; i < 20; i += 1) filterSearchDocuments(docs, filters);
    let bestAverage = Number.POSITIVE_INFINITY;
    let bestP95 = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round += 1) {
        const samples = [];
        for (let i = 0; i < 100; i += 1) {
            const started = process.cpuUsage();
            const result = filterSearchDocuments(docs, filters);
            const used = process.cpuUsage(started);
            samples.push((used.user + used.system) / 1e3);
            assert.ok(Array.isArray(result));
        }
        samples.sort((a, b) => a - b);
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const p95 = samples[Math.floor(samples.length * 0.95)];
        bestAverage = Math.min(bestAverage, average);
        bestP95 = Math.min(bestP95, p95);
    }
    t.diagnostic(`document path filtering (300 cards x 100), best of 3: cpu avg ${bestAverage.toFixed(4)}ms, cpu p95 ${bestP95.toFixed(4)}ms (hard gate 20ms avg)`);
    assert.ok(bestAverage < 20, `document path cpu avg ${bestAverage.toFixed(3)}ms exceeds 20ms`);
});
