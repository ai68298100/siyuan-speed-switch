/**
 * 渲染准备管线性能基准（T-6847，ROADMAP §3.5 性能预算门禁化 + §8.0.19 支柱一）
 *
 * 既有门禁（search-filter-perf）覆盖第一层本地过滤 filterOpenTabs；本基准补齐
 * 它下游喂给 renderList 的纯模型管线：sortItems 排序 × 4 模式 + groupTabsByMode
 * 分组 × 3 模式。300 条合成页签（与过滤基准同夹具形态）压测，度量口径与
 * T-6711 一致：CPU 时间（process.cpuUsage，免调度等待）+ best-of-3 取最优轮，
 * 均值断言无条件执行。
 *
 * 预算推导：实测基线（本机，CPU 时间 best-of-3）排序 0.075ms / 分组 0.075ms /
 * 管线 0.15ms。阈值按"容忍抖动、拦病理性退化"校准：约 20 倍余量——300 条规模
 * 下 O(n)→O(n²) 退化约 36 倍（~5ms）必穿线，2~5 倍的普通回归由既有过滤门禁
 * 与代码评审兜底。口径与 T-6711 一致（CPU 时间免调度等待 + best-of-3 抗满载
 * 假红）；CI 降频残余由 20 倍余量吸收。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {sortItems, sortGroupItems, groupTabsByMode, compareText} = require('../src/util.js');

const TAB_COUNT = 300;
const ITERATIONS = 200;

function buildSyntheticTabs() {
    const notebooks = ['20250910120000-abc1234', '20250910120005-def5678', '20250910120010-ghi9012'];
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
            updated: `20260925${String(900000 + i).slice(-6)}`,
            pinned: i % 17 === 0,
        });
    }
    return tabs;
}

function buildGroupCtx(tabs) {
    const notebookOrder = ['20250910120000-abc1234', '20250910120005-def5678', '20250910120010-ghi9012'];
    const notebookNames = Object.fromEntries(notebookOrder.map((id, i) => [id, `笔记本${i + 1}`]));
    const favorites = new Set(tabs.filter((tab) => tab.pinned).map((tab) => tab.rootId));
    return {
        pathOf: (tab) => tab.hPath,
        notebookIdOf: (tab) => tab.notebookId,
        notebookNameOf: (id) => notebookNames[id] || '',
        notebookOrder,
        pinKeyOf: (tab) => tab.rootId,
        isFavorite: (key) => favorites.has(key),
        favoriteGroupOf: () => '',
        favoriteGroupOrder: [],
        labels: {rootPath: '根目录', unknownNotebook: '未知笔记本', unfavorited: '未收藏'},
    };
}

function measureBestOfThree(runOnce) {
    const rounds = [];
    for (let round = 0; round < 3; round += 1) {
        const samples = [];
        let sink = 0;
        for (let i = 0; i < ITERATIONS; i += 1) {
            const started = process.cpuUsage();
            sink += runOnce(i);
            const used = process.cpuUsage(started);
            samples.push((used.user + used.system) / 1e3);
        }
        assert.ok(sink >= 0);
        rounds.push(samples.reduce((sum, value) => sum + value, 0) / samples.length);
    }
    return Math.min(...rounds);
}

test('render prep pipeline: sort + group stay within frame budget at 300 tabs (T-6847)', () => {
    const tabs = buildSyntheticTabs();
    const ctx = buildGroupCtx(tabs);
    const mru = tabs.map((tab) => tab.rootId).reverse();
    const updatedMap = Object.fromEntries(tabs.map((tab) => [tab.rootId, tab.updated]));
    const accessors = {
        titleOf: (tab) => tab.title,
        rootIdOf: (tab) => tab.rootId,
        pinKeyOf: (tab) => tab.rootId,
    };

    // 单项：排序（4 模式轮转）；实测基线 0.075ms，阈值 ≈20 倍余量
    const sortMean = measureBestOfThree((i) => {
        const modes = ['updatedDesc', 'titleAsc', 'mru', 'layoutDesc'];
        const ordered = sortItems(tabs, modes[i % modes.length], mru, {...accessors, updatedMap});
        return ordered.length;
    });
    assert.ok(sortMean < 1.5, `sortItems 均值 ${sortMean.toFixed(2)}ms 超出 1.5ms 预算（基线 0.075ms，疑病理性退化）`);

    // 单项：分组（3 模式轮转，含组内 sortGroupItems 二次排序）；实测基线 0.075ms
    const groupMean = measureBestOfThree((i) => {
        const modes = ['path', 'notebook', 'favorites'];
        const groups = groupTabsByMode(tabs, modes[i % modes.length], ctx);
        let count = 0;
        for (const group of groups) {
            count += sortGroupItems(group.items, 'updatedDesc', mru, new Set(tabs.filter((tab) => tab.pinned).map((tab) => tab.rootId)), updatedMap, accessors).length;
        }
        return count;
    });
    assert.ok(groupMean < 2, `groupTabsByMode 均值 ${groupMean.toFixed(2)}ms 超出 2ms 预算（基线 0.075ms，疑病理性退化）`);

    // 合计预算：过滤（独立门禁 ≤15ms）+ 排序 + 分组应留在 50ms 告警线内；
    // 本断言钉住"排序+分组 ≤ 3.5ms"的管线余量，O(n²) 退化（~5ms）必穿线。
    const pipelineMean = sortMean + groupMean;
    assert.ok(pipelineMean < 3.5, `排序+分组管线 ${pipelineMean.toFixed(2)}ms 超出 3.5ms 预算（基线 0.15ms）`);
});
