/**
 * 分层搜索编排性能基准（ROADMAP 3.5，第二/三层编排面）
 *
 * 第一层（filterOpenTabs）基准见 search-filter-perf.test.cjs。本文件固化
 * 纯函数编排层的成本：已打开文档请求构建（≤6 文档）、受限全文请求构建
 * 与三层结果合并。均为纯函数、无 I/O；预算吸收 CI 抖动，只拦截病理性
 * 回退（如误引入深层克隆或重复规范化）。
 */
const test = require('node:test');
const os = require('node:os');
const IS_CI = process.env.CI === 'true';
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
test('large-library aggregation (1200 raw hits / 300 roots) converges to bounded cards within budget', async (t) => {
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
            // CPU 时间而非墙钟：全量套件并行饱和 CPU 时墙钟被拉长 ~2 倍
            // （T-6706 实录：隔离 avg 8.3ms → 满载 16.9ms），墙钟断言把环境
            // 噪声放大成假红。cpuUsage 差值度量聚合自身的计算成本，与调度
            // 竞争无关；病理性回退（O(n²) 化）仍会以数倍幅度穿线。
            const started = process.cpuUsage();
            produced = run();
            const used = process.cpuUsage(started);
            samples.push((used.user + used.system) / 1e3); // cpuUsage 为微秒，换算毫秒
        }
        samples.sort((a, b) => a - b);
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const p95 = samples[Math.floor(samples.length * 0.95)];
        bestAverage = Math.min(bestAverage, average);
        bestP95 = Math.min(bestP95, p95);
    }
    // 机器空闲度诊断：对全核做 250ms 真实睡眠窗采样（本进程睡眠，不污染计数）。
    const idleSamples = [os.cpus().map((cpu) => ({...cpu.times}))];
    await new Promise((resolve) => setTimeout(resolve, 250));
    idleSamples.push(os.cpus().map((cpu) => ({...cpu.times})));
    let idleTicks = 0;
    let totalTicks = 0;
    for (let i = 0; i < idleSamples[0].length; i += 1) {
        const before = idleSamples[0][i];
        const after = idleSamples[1][i];
        idleTicks += after.idle - before.idle;
        totalTicks += (after.user - before.user) + (after.nice - before.nice) + (after.sys - before.sys) + (after.irq - before.irq) + (after.idle - before.idle);
    }
    const idleFraction = totalTicks > 0 ? idleTicks / totalTicks : 1;
    // 告警线按“只拦病理性回退”校准，而非安静机器最优值。环境实录（T-6706）：
    // 全量套件并行时即使机器仍有 ~60% 空闲，同核降频与缓存竞争也把进程内任何
    // 计时（含 cpuUsage——它只免调度等待，不免降频）拉长 1.6~2.7 倍：隔离 CPU
    // avg 8.2~10.9ms → 套件内 13.9~16.9ms → 八核人为饱和 22.4ms；12ms 线在任一
    // 非安静场景必然假红。40ms ≈ 安静成本的 4~5 倍、最坏环境污染的 1.8 倍；
    // 真实 O(n²) 化在本规模（4800 命中）为数百毫秒级，任何条件下都会穿线。
    // cpu p95 由 GC 支配、机器空闲度只反映外部负载，均作趋势诊断；升硬门禁
    // 按 A1/ROADMAP §8.0.6 v0.27.x 准入（连续两个版本稳定）。CI 只记录趋势。
    t.diagnostic(`aggregateSearchResults(1200 hits / 300 roots), best of ${ROUNDS}: cpu avg ${bestAverage.toFixed(4)}ms, cpu p95 ${bestP95.toFixed(4)}ms, machine idle ${(idleFraction * 100).toFixed(0)}% (pathology alert line 40ms cpu)`);
    if (!IS_CI) {
        assert.ok(bestAverage < 40, `best avg ${bestAverage.toFixed(3)}ms exceeds 40ms pathology alert line`);
        }
    assert.ok(produced, 'aggregation must produce a result');
    assert.ok(produced.totalDocuments <= ROOTS, 'aggregation covers the input roots');
    // 聚合层按根文档出全量卡片，12 条首屏上限由下游分页器（planDocResultsPage）执行
    assert.equal(produced.cards.length, ROOTS, 'one card per root document before paging');
    const firstCard = produced.cards[0];
    assert.ok(firstCard.snippets.length <= 2, 'each card keeps at most 2 snippets');
    assert.ok(firstCard.blockIds.length <= 200, 'block ids stay bounded');
});
