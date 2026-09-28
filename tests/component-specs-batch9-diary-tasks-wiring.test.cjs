// T-6982 / T-6971 批次⑨ B 组：日记与任务组件照卡施工契约。
// 规格来源：docs/design/component-specs-09-longtail.html
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const home = require('../src/home-model.js');
const kernel = require('../src/kernel-widget-model.js');

const root = path.join(__dirname, '..');
const indexSource = readSourceText(path.join(root, 'src', 'index.ts'));
const secondPanelSource = readSourceText(path.join(root, 'src', 'second-panel-ui.ts'));

const DIARY_TASK_DEFAULTS = {
    'today-journal': 'small',
    'journal-monthly': 'medium',
    'recent-daily-notes': 'wide',
    'on-this-day': 'small',
    'today-tasks': 'small',
    'today-reservations': 'small',
    'flashcard-due': 'small',
};

const SCHEMA_LIMITS = {
    'recent-daily-notes': 5,
    'on-this-day': 3,
    'today-tasks': 5,
    'today-reservations': 4,
};

const NOW = new Date(2026, 8, 28, 12).getTime();

test('diary and task components declare batch-9 defaults and bounded schema', () => {
    const definitions = new Map(home.registerModules([]).map((item) => [item.moduleId, item]));
    for (const [moduleId, expectedSize] of Object.entries(DIARY_TASK_DEFAULTS)) {
        const definition = definitions.get(moduleId);
        assert.ok(definition, `${moduleId} 目录条目存在`);
        assert.equal(home.HOME_TILE_DEFAULT_SIZES[moduleId], expectedSize, `${moduleId} 默认档与规格卡一致`);
        assert.equal(home.resolveHomeTileMaterial(moduleId), 'plain', `${moduleId} 默认材质回退 plain`);
        assert.ok(definition.sizes.includes(expectedSize), `${moduleId} 支持默认档 ${expectedSize}`);
        const limit = SCHEMA_LIMITS[moduleId];
        if (limit) {
            const field = definition.configSchema.find((item) => item.key === 'limit');
            assert.equal(field.max, limit, `${moduleId} schema 上限`);
            assert.equal(field.defaults, limit, `${moduleId} schema 默认值`);
        }
    }
});

test('diary and task projections stay within the card row budgets', () => {
    assert.equal(kernel.normalizeRecentDailyNotesConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeOnThisDayConfig({limit: 99}).limit, 3);
    assert.equal(kernel.normalizeTodayTasksConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeTodayReservationsConfig({limit: 99, overdueDays: 14}).limit, 4);
    assert.equal(kernel.normalizeTodayReservationsConfig({overdueDays: 14}).overdueDays, 0);

    const daily = kernel.buildRecentDailyNotesSnapshot([
        {id: '20260928120000-daily001', root_id: '20260928120000-daily001', content: '2026-09-28', characters: 321},
        {id: '20260929120000-daily002', root_id: '20260929120000-daily002', content: '2026-09-29', characters: 999},
    ], {limit: 99}, {}, NOW);
    assert.deepEqual(daily.items.map((item) => item.label), ['2026-09-28']);
    assert.match(daily.items[0].secondary, /321 字/);

    const memory = kernel.buildOnThisDaySnapshot(Array.from({length: 5}, (_, index) => ({
        id: `2026092812000${index}-memory${index}`,
        content: `${2025 - index}-09-28 · 记录${index}`,
    })), {limit: 99}, {}, NOW);
    assert.equal(memory.items.length, 3);
    assert.deepEqual(memory.items.map((item) => item.label), [
        '2025-09-28 · 记录0', '2024-09-28 · 记录1', '2023-09-28 · 记录2',
    ]);

    const tasks = kernel.buildTodayTasksSnapshot({data: Array.from({length: 7}, (_, index) => ({
        id: `2026092813000${index}-task${index}`,
        content: `待办${index}`,
        markdown: '* [ ] 待办',
        updated: `2026092812000${index}`,
    }))}, {limit: 99}, {});
    assert.equal(tasks.items.length, 5);
    assert.equal(tasks.items.every((item) => item.done === false), true);

    const reservations = kernel.buildTodayReservationsSnapshot([
        {id: '20260928140000-reserv01', content: '过期', date: '20260927'},
        {id: '20260928140001-reserv02', content: '今天', date: '20260928'},
        {id: '20260928140002-reserv03', content: '明天', date: '20260929'},
    ], {limit: 99, overdueDays: 14}, {}, NOW);
    assert.deepEqual(reservations.items.map((item) => item.label), ['今天', '明天']);

    const journal = kernel.buildTodayJournalSnapshot({data: [{
        id: '20260928150000-journal1', content: '2026-09-28 · 星期一', characters: 888,
    }]}, {notebook: '20260928100000-box0001'}, {open: '打开', characters: '字'}, NOW);
    assert.equal(journal.items[0].label, '2026-09-28');
    assert.match(journal.items[0].secondary, /888 字/);
    assert.equal(journal.items[0].value, '20260928150000-journal1');
    const missing = kernel.buildTodayJournalSnapshot({data: []}, {}, {create: '创建今日日记'}, NOW);
    assert.deepEqual(missing.items, [{label: '创建今日日记', value: 'action:journal'}]);

    const monthly = kernel.buildJournalMonthlySnapshot([
        {id: '20260928160000-month001', content: '2026-09-28', characters: 42},
        {id: '20260927160000-month002', content: '2026-09-27', characters: 58},
    ], {monthOffset: 0}, {}, NOW);
    assert.deepEqual(monthly.monthStats, {count: 2, characters: 100, streak: 2});

    const cards = kernel.buildFlashcardDueSnapshot({mode: 'notebooks', total: 4, data: [{id: 'box', label: '知识库', count: 4}]}, {}, {reviewAction: '进入复习'});
    assert.equal(cards.items[0].value, 'action:riffCard');
    const disabled = kernel.buildFlashcardDueSnapshot({mode: 'notebooks', total: 0, data: []}, {}, {reviewAction: '进入复习', emptyNotebooks: '空态'});
    assert.equal(disabled.items.length, 0);
    assert.equal(disabled.emptyHint, '空态');
});

test('diary and task adapters keep bounded SQL and controlled interaction wiring', () => {
    const slice = (start, end) => indexSource.slice(indexSource.indexOf(`register("${start}"`), end ? indexSource.indexOf(`register("${end}"`) : indexSource.length);
    const todayJournal = slice('today-journal', 'document-sets');
    assert.match(todayJournal, /buildTodayJournalSnapshot\(/);
    assert.match(todayJournal, /COALESCE\(\(SELECT SUM\(CASE WHEN c\.type<>'d'/);
    assert.match(todayJournal, /LIMIT 4/);
    assert.doesNotMatch(todayJournal, /createDailyNote/);

    const monthly = slice('journal-monthly', 'note-stats');
    assert.match(monthly, /COUNT\(\*\) OVER\(\)/);
    assert.match(monthly, /AS characters/);
    assert.match(monthly, /LIMIT 48/);

    const daily = slice('recent-daily-notes', 'document-relations-summary');
    assert.match(daily, /content < '\$\{today\}~'/);
    assert.match(daily, /AS characters/);
    assert.match(daily, /LIMIT 48/);

    const memory = slice('on-this-day', 'today-writing');
    assert.match(memory, /ORDER BY content DESC LIMIT 64/);
    assert.match(memory, /buildOnThisDaySnapshot\(/);

    const reservations = slice('today-reservations', 'quick-capture');
    assert.match(reservations, /A\.value >= strftime\('%Y%m%d', datetime\('now','localtime'\)\)/);
    assert.doesNotMatch(reservations, /-\$\{normalized\.overdueDays\} days/);
    assert.match(reservations, /buildTodayReservationsSnapshot\(/);

    const tasks = slice('today-tasks', 'tags');
    assert.match(tasks, /buildTodayTasksSnapshot\(/);
    assert.match(indexSource, /flipTaskMarkdown\(/);
    assert.match(indexSource, /fetchKernelJson\("\/api\/block\/updateBlock"/);
    assert.match(secondPanelSource, /if \(!ok\) showMessage\(this\.i18n\.homeTaskToggleFailed\)/);

    const flashcards = slice('flashcard-due', 'random-review');
    assert.match(flashcards, /\/api\/riff\/getNotebookRiffDueCards/);
    assert.match(flashcards, /reviewAction:/);
    assert.match(indexSource, /value === "action:riffCard"/);
});
