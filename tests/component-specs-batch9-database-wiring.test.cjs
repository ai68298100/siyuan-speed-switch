// T-6981 / T-6971 批次⑨ A 组：数据库与检索组件照卡施工契约。
// 规格来源：docs/design/component-specs-09-longtail.html
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {readSourceText} = require('./source-scan.cjs');
const home = require('../src/home-model.js');
const kernel = require('../src/kernel-widget-model.js');

const root = path.join(__dirname, '..');
const indexSource = readSourceText(path.join(root, 'src', 'index.ts'));

const DATABASE_DEFAULTS = {
    'database-list': 'medium',
    'database-table': 'wide',
    'saved-searches': 'medium',
    'data-health': 'small',
    'recent-updates': 'wide',
    'recent-edits': 'wide',
    'random-review': 'small',
    'plugin-commands': 'small',
};

const SCHEMA_LIMITS = {
    'database-list': 5,
    'database-table': 8,
    'saved-searches': 5,
    'recent-updates': 5,
    'recent-edits': 5,
    'random-review': 6,
    'plugin-commands': 5,
};

const SCHEMA_DEFAULTS = {
    'random-review': 3,
};

test('database and retrieval components declare batch-9 defaults and plain fallback', () => {
    for (const [moduleId, expected] of Object.entries(DATABASE_DEFAULTS)) {
        assert.equal(home.HOME_TILE_DEFAULT_SIZES[moduleId], expected, `${moduleId} 默认档必须与终批规格卡一致`);
        assert.equal(home.resolveHomeTileMaterial(moduleId), 'plain', `${moduleId} 终批默认材质必须为 plain`);
        const definition = home.registerModules([]).find((item) => item.moduleId === moduleId);
        assert.ok(definition, `${moduleId} 目录条目存在`);
        assert.ok(definition.sizes.includes(expected), `${moduleId} 支持声明的默认档`);
        if (SCHEMA_LIMITS[moduleId]) {
            const limit = definition.configSchema.find((item) => item.key === 'limit');
            assert.equal(limit.max, SCHEMA_LIMITS[moduleId], `${moduleId} schema 上限与规格卡一致`);
            assert.equal(limit.defaults, SCHEMA_DEFAULTS[moduleId] || SCHEMA_LIMITS[moduleId], `${moduleId} schema 默认值与规格卡一致`);
        }
    }
});

test('database and retrieval row caps stay within the batch-9 cards', () => {
    assert.equal(kernel.normalizeDatabaseListConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeAvTableConfig({limit: 99}).limit, 8);
    assert.equal(kernel.normalizeSavedSearchesConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeRecentUpdatesConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeRecentEditsConfig({limit: 99}).limit, 5);
    assert.equal(kernel.normalizeRandomReviewConfig({limit: 99}).limit, 6);
    assert.equal(home.normalizePluginCommandsConfig({limit: 99}).limit, 5);
});

test('database adapters keep native bounded queries and AV fallback wiring', () => {
    const database = indexSource.slice(indexSource.indexOf('register("database-list"'), indexSource.indexOf('register("saved-searches"'));
    assert.match(database, /\/api\/query\/sql/);
    assert.match(database, /LIMIT \$\{normalized\.limit\}/);
    assert.match(database, /\/api\/av\/renderAttributeView/);
    assert.match(database, /\/api\/av\/getAttributeView/);
    const table = indexSource.slice(indexSource.indexOf('register("database-table"'));
    assert.match(table, /pageSize: 100/);
    assert.match(table, /buildAvTableSnapshot/);
});

test('saved searches, recent updates, and recent edits preserve their source semantics', () => {
    const saved = kernel.buildSavedSearchesSnapshot({data: [{name: '项目', k: 'alpha', method: 0, hPath: '工作'}]}, {limit: 5}, {methods: ['文本']});
    assert.equal(saved.items[0].label, '项目');
    assert.match(saved.items[0].secondary, /alpha/);
    const updated = kernel.buildRecentUpdatesSnapshot({data: [{rootID: '20260918120000-rootaaa', fcontent: '块更新', updated: '20260918130000'}]}, {limit: 5}, {});
    assert.equal(updated.items[0].value, '20260918120000-rootaaa');
    const edited = kernel.buildRecentEditsSnapshot([{id: '20260918120001-rootbbb', content: '文档编辑', updated: '20260918140000'}], {limit: 5}, {});
    assert.equal(edited.items[0].value, '20260918120001-rootbbb');
});

test('random review stays bounded and plugin commands use the controlled command prefix', () => {
    const rows = Array.from({length: 8}, (_, index) => ({id: `2026091812000${index}-doc${index}`, content: `文档${index}`}));
    const review = kernel.buildRandomReviewSnapshot({data: rows}, {limit: 99}, {});
    assert.equal(review.items.length, 6);
    const commands = home.buildPluginCommandsSnapshot(Array.from({length: 8}, (_, index) => ({
        value: `plugin.command.${index}`, label: `命令${index}`, pluginTitle: '提供方',
    })), {limit: 99}, {});
    assert.equal(commands.items.length, 5);
    assert.ok(commands.items.every((item) => item.value.startsWith('cmd:')));
});

test('batch-9 adapters keep source endpoints and controlled plugin command input', () => {
    assert.match(indexSource, /\/api\/storage\/getCriteria/);
    assert.match(indexSource, /buildSavedSearchesSnapshot/);
    assert.match(indexSource, /buildPluginCommandsSnapshot\(this\.getPluginCommands\(\)/);
    assert.match(indexSource, /value\.startsWith\("cmd:"\)/);
});
