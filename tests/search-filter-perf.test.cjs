/**
 * 第一层本地页签过滤性能基准（ROADMAP 3.5 性能预算）
 *
 * 预算口径：超大页签集单次过滤以 50 ms 为告警线。2026-09-14 优化后
 * （见 D-217），匹配由轻量规范化门禁把关，图元安全的重型规范化只在
 * 命中条目产出时执行——成本随"命中数"扩展，不再随页签总数线性放大。
 * 本基准用 300 条合成页签分别压两条路径：关键词门禁路径预算收紧到
 * 告警线的 30%，空查询全量产出路径放宽到告警线的 80% 以吸收 CI 抖动；
 * 两条路径仍分别低于 15ms/40ms，保留明显回归检测能力。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {filterOpenTabs} = require('../src/search-model.js');

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

function measure(tabs, queries, filtersByCall) {
    // 预热，避免首次 JIT/IC 建立成本污染均值
    for (const query of queries) filterOpenTabs(tabs, query, filtersByCall(query));
    const samples = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
        const query = queries[i % queries.length];
        const started = process.hrtime.bigint();
        const result = filterOpenTabs(tabs, query, filtersByCall(query));
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
        assert.ok(Array.isArray(result));
    }
    samples.sort((a, b) => a - b);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
    return {average, p95};
}

test('keyword-gated filtering stays near-constant as matches stay bounded', (t) => {
    const tabs = buildSyntheticTabs();
    const queries = ['roadmap', '会议', 'standup', 'zzz-no-hit'];
    const {average, p95} = measure(tabs, queries, () => ({}));
    t.diagnostic(`keyword path (${TAB_COUNT} tabs x ${ITERATIONS}): avg ${average.toFixed(4)}ms, p95 ${p95.toFixed(4)}ms`);
    assert.ok(average < 15, `keyword path avg ${average.toFixed(3)}ms exceeds 15ms; loose-gate regression`);
    assert.ok(p95 < 15, `keyword path p95 ${p95.toFixed(3)}ms exceeds 15ms; loose-gate regression`);
});

test('empty-query full-emission path stays within the 50ms alert line', (t) => {
    const tabs = buildSyntheticTabs();
    const {average, p95} = measure(tabs, [''], () => ({}));
    t.diagnostic(`empty-query path (${TAB_COUNT} tabs x ${ITERATIONS}): avg ${average.toFixed(4)}ms, p95 ${p95.toFixed(4)}ms`);
    assert.ok(average < 40, `empty-query avg ${average.toFixed(3)}ms exceeds 40ms (50ms alert line headroom)`);
    assert.ok(p95 < 40, `empty-query p95 ${p95.toFixed(3)}ms exceeds 40ms (50ms alert line headroom)`);
});
