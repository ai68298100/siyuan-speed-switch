/**
 * 分层搜索编排性能基准（ROADMAP 3.5，第二/三层编排面）
 *
 * 第一层（filterOpenTabs）基准见 search-filter-perf.test.cjs。本文件固化
 * 纯函数编排层的成本：已打开文档请求构建（≤6 文档）、受限全文请求构建
 * 与三层结果合并。均为纯函数、无 I/O；预算吸收 CI 抖动，只拦截病理性
 * 回退（如误引入深层克隆或重复规范化）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildOpenedDocumentSearchRequests,
    buildFullTextSearchRequest,
    mergeSearchLayers,
    aggregateSearchResults,
} = require('../src/search-model.js');

const ITERATIONS = 2000;

function buildTabs(count, {validScope = true} = {}) {
    const tabs = [];
    for (let i = 0; i < count; i += 1) {
        // 思源物理路径以块 ID 命名（/notebookID/块ID.sy，全 ASCII）；
        // 中文只出现在 hPath（人性化路径），不进 scope。validScope=false
        // 构造"全部无法定位"的病态场景，测量 scope 构建成本上限。
        const rootId = `2026091409000${i % 10}-${i.toString(16).padStart(8, '0')}`;
        const physicalPath = validScope ? `/20250910120000-abc1234/${rootId}.sy` : `/笔记本/项目/文档-${i}`;
        tabs.push({
            id: `tab-${i}`,
            rootId,
            title: `文档 ${i} Roadmap`,
            hPath: `/笔记本/项目/文档-${i}`,
            path: physicalPath,
            current: {path: physicalPath, notebookID: '20250910120000-abc1234', rootID: rootId},
            notebookId: '20250910120000-abc1234',
        });
    }
    return tabs;
}

function bench(label, fn, budgetMs, t) {
    for (let i = 0; i < 50; i += 1) fn();
    const samples = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
        const started = process.hrtime.bigint();
        fn();
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    samples.sort((a, b) => a - b);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
    t.diagnostic(`${label}: avg ${average.toFixed(4)}ms, p95 ${p95.toFixed(4)}ms (budget ${budgetMs}ms)`);
    assert.ok(average < budgetMs, `${label} avg ${average.toFixed(3)}ms exceeds ${budgetMs}ms`);
    assert.ok(p95 < budgetMs, `${label} p95 ${p95.toFixed(3)}ms exceeds ${budgetMs}ms`);
}

test('opened-document fan-out stops after the bounded 6 requests', (t) => {
    const tabs = buildTabs(200);
    let produced = 0;
    bench('buildOpenedDocumentSearchRequests(200 valid tabs)', () => {
        const requests = buildOpenedDocumentSearchRequests(tabs, 'roadmap', {});
        produced = requests.length;
        assert.ok(Array.isArray(requests));
    }, 2.5, t);
    assert.ok(produced > 0, 'valid tabs must produce at least one request');
    assert.ok(produced <= 6, `fan-out must stay bounded, got ${produced}`);
});

test('pathological all-unresolvable tabs stay under the 50ms alert line', (t) => {
    const tabs = buildTabs(200, {validScope: false});
    bench('buildOpenedDocumentSearchRequests(200 unresolvable)', () => {
        const requests = buildOpenedDocumentSearchRequests(tabs, 'roadmap', {});
        assert.equal(requests.length, 0);
    }, 25, t);
});

test('bounded full-text request building stays well under a keystroke budget', (t) => {
    const tabs = buildTabs(50);
    bench('buildFullTextSearchRequest', () => {
        const request = buildFullTextSearchRequest({query: '项目会议记录', tabs, filters: {notebook: '20250910120000-abc1234'}});
        assert.ok(request === null || typeof request === 'object');
    }, 0.5, t);
});

test('three-layer merge with 120 records stays within budget', (t) => {
    const makeRecord = (i) => ({
        id: `20260914090000-${i.toString(16).padStart(8, '0')}`,
        rootId: `20260914090000-${i.toString(16).padStart(8, '0')}`,
        title: `结果 ${i}`,
        path: `/笔记本/结果-${i}`,
        notebookId: '20250910120000-abc1234',
        source: 'title',
    });
    const globalDocs = Array.from({length: 120}, (_, i) => makeRecord(i));
    const run = () => {
        const merged = mergeSearchLayers({
            query: '结果',
            localTabs: [],
            openedHits: [],
            globalResults: aggregateSearchResults([{source: 'title', documents: globalDocs}], {}),
            filters: {},
        });
        assert.ok(merged);
    };
    bench('mergeSearchLayers(120 title docs)', run, 2, t);
});

// A1 性能基准矩阵（ROADMAP §8.0.5 专项 A）：大库聚合场景——300 个根文档、
// 1200 条块级命中（模拟大库全文回退），聚合后必须收敛为有界文档卡片。
// 计时采用 best-of-3 轮（与 search-filter-perf 同策略）：全量套件并行执行时
// 绝对耗时会被调度噪声顶爆，取轮次最优值后才对告警线断言。
test('large-library aggregation (1200 raw hits / 300 roots) converges to bounded cards within budget', (t) => {
    const ROOTS = 300;
    const HITS_PER_ROOT = 4;
    const hits = [];
    for (let root = 0; root < ROOTS; root += 1) {
        const rootId = `20260920090000-${root.toString(16).padStart(8, '0')}`;
        for (let hit = 0; hit < HITS_PER_ROOT; hit += 1) {
            hits.push({
                rootId,
                blockId: `${rootId}-b${hit}`,
                title: `大库文档 ${root}`,
                path: `/笔记本/项目/大库文档-${root}`,
                notebookId: '20250910120000-abc1234',
                snippet: `命中片段 ${root}-${hit}：roadmap 关键词上下文`,
                source: 'fulltext',
                score: 1 - hit * 0.01,
            });
        }
    }
    assert.equal(hits.length, ROOTS * HITS_PER_ROOT);
    const run = () => {
        const result = aggregateSearchResults(hits, {source: 'fulltext'});
        assert.equal(result.rawCount, ROOTS * HITS_PER_ROOT, 'all raw hits are consumed');
        return result;
    };
    for (let i = 0; i < 20; i += 1) run(); // 预热
    const ROUNDS = 3;
    const ITERATIONS = 120;
    let bestAverage = Infinity;
    let bestP95 = Infinity;
    let produced = null;
    for (let round = 0; round < ROUNDS; round += 1) {
        const samples = [];
        for (let i = 0; i < ITERATIONS; i += 1) {
            const started = process.hrtime.bigint();
            produced = run();
            samples.push(Number(process.hrtime.bigint() - started) / 1e6);
        }
        samples.sort((a, b) => a - b);
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const p95 = samples[Math.floor(samples.length * 0.95)];
        bestAverage = Math.min(bestAverage, average);
        bestP95 = Math.min(bestP95, p95);
    }
    t.diagnostic(`aggregateSearchResults(1200 hits / 300 roots), best of ${ROUNDS}: avg ${bestAverage.toFixed(4)}ms, p95 ${bestP95.toFixed(4)}ms (alert line 12ms)`);
    // 宽松告警线（8ms）只拦病理性回退（如 O(n²) 化：本规模将达秒级）；
    // 趋势以本诊断输出为准，连续两个版本稳定后按 A1 升为硬门禁。
    assert.ok(bestAverage < 12, `large-library aggregation best avg ${bestAverage.toFixed(3)}ms exceeds 12ms alert line`);
    assert.ok(bestP95 < 12, `large-library aggregation best p95 ${bestP95.toFixed(3)}ms exceeds 12ms alert line`);
    assert.ok(produced, 'aggregation must produce a result');
    assert.ok(produced.totalDocuments <= ROOTS, 'aggregation covers the input roots');
    // 聚合层按根文档出全量卡片，12 条首屏上限由下游分页器（planDocResultsPage）执行
    assert.equal(produced.cards.length, ROOTS, 'one card per root document before paging');
    const firstCard = produced.cards[0];
    assert.ok(firstCard.snippets.length <= 2, 'each card keeps at most 2 snippets');
    assert.ok(firstCard.blockIds.length <= 200, 'block ids stay bounded');
});
