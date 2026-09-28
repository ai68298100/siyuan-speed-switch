// T-6971 批次⑦：写作统计类契约——今日写作 / 近期写作活跃度 / 写作打卡 / 笔记统计。
// 声明层按规格总表（材质×默认档×支持档），行为钉验收要点（如实零值、0 字不算打卡、
// 12 个月回看与逐年分页、千分位、有界聚合、失败保留旧值）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const homeModel = require('../src/home-model.js');
const model = require('../src/kernel-widget-model.js');
const hostAdapters = readSourceFile('src/index.ts');
const framework = readSourceFile('src/home-adapters.js');

test('declaration: writing family matches the spec table (material × default × supported)', () => {
    const modules = homeModel.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    const expected = {
        'today-writing': {sizes: ['small', 'medium'], material: 'accent', fallback: 'small'},
        'writing-streak': {sizes: ['small', 'medium'], material: 'accent', fallback: 'small'},
        'recent-writing-activity': {sizes: ['medium', 'wide', 'large'], material: 'plain', fallback: 'wide'},
        'note-stats': {sizes: ['medium', 'wide'], material: 'plain', fallback: 'medium'},
    };
    for (const [id, want] of Object.entries(expected)) {
        const definition = byId.get(id);
        assert.deepEqual(definition.sizes, want.sizes, `${id} 声明档位按规格卡`);
        assert.equal(homeModel.resolveHomeTileMaterial(id), want.material, `${id} 材质按规格卡`);
        assert.equal(homeModel.resolveHomeTileDefaultSize(id, definition.sizes, 'medium'), want.fallback, `${id} 商店默认档按规格卡`);
    }
});

test('today-writing: honest zero, clamped goal progress, local midnight-anchored SQL', () => {
    const normalized = model.normalizeTodayWritingConfig({goal: 2000});
    assert.equal(normalized.goal, 2000);
    const zero = model.buildTodayWritingSnapshot({chars: 0, blocks: 0, createdDocs: 0, updatedDocs: 0}, {goal: 2000, showBlocks: '否', showNewDocs: '否', showEditedDocs: '否'}, {
        zero: '今天还没有新增内容', active: '今天已经开始写作', characters: '新增字符',
    }, 1000, 'fresh');
    assert.equal(zero.stat.value, '0', '无写作如实显示 0（不编造不隐藏）');
    assert.ok(zero.items.some((item) => item.label.includes('今天还没有新增内容')), '明细全关时零值给状态文案');
    const over = model.buildTodayWritingSnapshot({chars: 3000, blocks: 2, createdDocs: 1, updatedDocs: 1}, {goal: 2000}, {
        characters: '新增字符',
    }, 1000, 'fresh');
    assert.equal(over.stat.progress, 100, '目标进度钳制 ≤100');
    assert.deepEqual(over.stat.arc, {value: 2000, max: 2000}, '弧线投影钳制到目标值');
    // 跨日重置：SQL 起点必须是当日 000000（本地零点），不是调用时刻
    assert.match(hostAdapters, /String\(now\.getDate\(\)\)\.padStart\(2, "0"\)\}000000/, '今日写作 SQL 起点锚定本地零点');
});

test('writing-streak: a zero-word day never counts as check-in; pending label when today unwritten', () => {
    const normalized = model.normalizeWritingStreakConfig({});
    assert.ok(normalized.dailyGoal >= 1, 'dailyGoal 下限 1 —— 当日 0 字不可能达标（0 字不算打卡）');
    assert.ok(model.normalizeWritingStreakConfig({dailyGoal: 0}).dailyGoal >= 1, '显式请求 0 目标必须被钳回 ≥1（0 字永远不算打卡）');
    // 昨日达标、今日未写 + 宽限开启 → 连击保留且 stat 标注「今日待完成」
    const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() - offset);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };
    const rows = [{day: day(1), blocks: 5, chars: 900}];
    const snapshot = model.buildWritingStreakSnapshot(rows, {dailyGoal: 500, todayGrace: true}, {
        streak: '天连续', pending: '天连续 · 今日待完成', gap: '已中断 {value} 天', weekdays: '一二三四五六日',
    }, Date.now(), 'fresh');
    assert.equal(snapshot.stat.value, '1', '今日未写不断签（宽限沿昨日续连击）');
    assert.match(snapshot.stat.label, /今日待完成/, '今日待写必须显式标注');
    // 中断如实重算：窗口内无任何达标日 → 连击 0 且给中断文案
    const broken = model.buildWritingStreakSnapshot([{day: day(9), blocks: 5, chars: 900}], {dailyGoal: 500}, {
        streak: '天连续', pending: '天连续 · 今日待完成', gap: '已中断 {value} 天', weekdays: '一二三四五六日',
    }, Date.now(), 'fresh');
    assert.equal(broken.stat.value, '0', '中断后连击如实归零');
    assert.match(broken.stat.label, /已中断/, '中断文案不粉饰');
});

test('recent-writing-activity: 12-month lookback cap, year paging, empty-as-copy', () => {
    const normalized = model.normalizeRecentWritingActivityConfig({days: 999, yearOffset: -9});
    assert.equal(normalized.days, 366, '回看上限 366 天 = 12 个月（T-6459/T-6461 口径）');
    assert.equal(normalized.yearOffset, -3, '年历逐年分页下限 -3');
    const empty = model.buildRecentWritingActivitySnapshot([], {days: 14, showZero: '否'}, {
        empty: '统计范围内没有写作活动', characters: '字符', blocks: '内容块',
    }, 1725696000000, 'fresh');
    assert.ok(empty.emptyHint, '空数据 = 状态区文案（不渲染空图）');
    assert.equal(empty.items.length, 0, '空态不产出空条形');
});

test('note-stats: thousands separators and single bounded aggregate statement', () => {
    const snapshot = model.buildNoteStatsSnapshot({docs: 1204, chars: 12847, created: 3, updated: 5}, {}, {
        documents: '文档数', characters: '估算字数', created: '新建文档', updated: '修订文档',
    }, 1000, 'fresh');
    assert.equal(snapshot.stat.value, '1,204', '主数值千分位格式化（默认主指标=文档数）');
    const byChars = model.buildNoteStatsSnapshot({docs: 1204, chars: 12847, created: 3, updated: 5}, {primaryMetric: '估算字数'}, {
        documents: '文档数', characters: '估算字数', created: '新建文档', updated: '修订文档',
    }, 1000, 'fresh');
    assert.equal(byChars.stat.value, '12,847', '切换主指标后同样千分位');
    // 笔记统计主聚合 = 单语句单行（有界 by construction）；每日强度查询有外层 LIMIT
    const statsSection = hostAdapters.slice(hostAdapters.indexOf('register("note-stats"'), hostAdapters.indexOf('register("year-progress"'));
    const statements = statsSection.match(/fetchKernelJson\("\/api\/query\/sql"/g) || [];
    assert.equal(statements.length, 2, '主聚合 + 可选每日强度（opt-in）共至多两条有界语句');
    assert.match(statsSection, /LIMIT \$\{normalized\.days \* 2\}/, '每日强度查询必须带外层 LIMIT（T-6478 纪律）');
});

test('framework: failed refresh retains the previous snapshot (family-wide keep-old semantics)', () => {
    assert.match(framework, /return \{ok: false, reason, snapshot: cached\?\.snapshot \|\| normalizeSnapshot\(null\)\};/,
        '刷新失败必须回退陈旧快照——列表/图表不被清空');
});
