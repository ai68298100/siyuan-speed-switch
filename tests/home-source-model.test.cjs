const {test} = require('node:test');
const assert = require('node:assert/strict');
const source = require('../src/home-source-model.js');
const home = require('../src/home-model.js');

const checkinDef = (moduleId, order) => home.normalizeModuleDefinition({
    moduleId,
    title: moduleId,
    category: 'siyuan',
    availability: 'external',
    sizes: ['medium'],
    source: {pluginId: 'siyuan-checkin', name: '小驴打卡', icon: 'iconCheck', order},
});

test('source resolution prefers structured plugin identity over author text', () => {
    const resolved = source.resolveHomeModuleSource(checkinDef('checkin-today', 1));
    assert.equal(resolved.kind, 'plugin');
    assert.equal(resolved.key, 'plugin:siyuan-checkin');
    assert.equal(resolved.label, '小驴打卡');
    assert.equal(resolved.icon, 'iconCheck');
    assert.equal(resolved.order, 1);
});

test('built-in widgets without a source stay on functional grouping', () => {
    const def = home.normalizeModuleDefinition({moduleId: 'recent-documents', title: '近期文档', category: 'siyuan'});
    const resolved = source.resolveHomeModuleSource(def);
    assert.equal(resolved.kind, 'builtin');
    assert.equal(resolved.key, source.BUILTIN_SOURCE_KEY);
});

test('legacy plugin widgets still group by author', () => {
    const def = home.normalizeModuleDefinition({moduleId: 'legacy', title: 'Legacy', category: 'plugin', author: '某作者'});
    const resolved = source.resolveHomeModuleSource(def);
    assert.equal(resolved.kind, 'plugin');
    assert.equal(resolved.label, '某作者');
});

test('defensive source resolution never throws', () => {
    assert.equal(source.resolveHomeModuleSource(null).kind, 'builtin');
    assert.equal(source.resolveHomeModuleSource(42).kind, 'builtin');
});

test('one plugin with many widgets collapses into a single source group', () => {
    const groups = source.buildHomeStoreSourceGroups([
        {moduleId: 'checkin-today', def: checkinDef('checkin-today', 1), added: true},
        {moduleId: 'checkin-streak', def: checkinDef('checkin-streak', 2), added: false},
        {moduleId: 'checkin-year-heatmap', def: checkinDef('checkin-year-heatmap', 3), added: true},
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, '小驴打卡');
    assert.equal(groups[0].count, 3);
    assert.equal(groups[0].addedCount, 2);
    assert.deepEqual(groups[0].moduleIds, ['checkin-today', 'checkin-streak', 'checkin-year-heatmap']);
});

test('source groups ignore built-ins so functional grouping still applies', () => {
    const groups = source.buildHomeStoreSourceGroups([
        {moduleId: 'recent-documents', def: home.normalizeModuleDefinition({moduleId: 'recent-documents', title: 'D', category: 'siyuan'}), added: false},
    ]);
    assert.deepEqual(groups, []);
});

test('group ordering is deterministic regardless of input order', () => {
    const defs = (pluginId, name) => home.normalizeModuleDefinition({moduleId: `w-${pluginId}`, title: name, category: 'siyuan', source: {pluginId, name}});
    const entries = [
        {moduleId: 'w-b', def: defs('b', 'B 插件'), added: false},
        {moduleId: 'w-a', def: defs('a', 'A 插件'), added: false},
    ];
    const first = source.buildHomeStoreSourceGroups(entries).map((group) => group.key);
    const second = source.buildHomeStoreSourceGroups([...entries].reverse()).map((group) => group.key);
    assert.deepEqual(first, second);
    assert.equal(source.buildHomeStoreSourceGroups(entries).length, 2);
});

test('larger sources surface before smaller ones', () => {
    const defs = (pluginId, name) => home.normalizeModuleDefinition({moduleId: `w-${pluginId}-`, title: name, category: 'siyuan', source: {pluginId, name}});
    const small = defs('small', '小插件');
    const big = defs('big', '大插件');
    const groups = source.buildHomeStoreSourceGroups([
        {moduleId: 'x1', def: small, added: false},
        {moduleId: 'x2', def: big, added: false},
        {moduleId: 'x3', def: big, added: false},
    ]);
    assert.equal(groups[0].pluginId, 'big');
    assert.equal(groups[0].count, 2);
    assert.equal(groups[1].count, 1);
});

test('search text carries the provider name so one query finds the whole suite', () => {
    const text = source.buildHomeStoreSourceSearchText(checkinDef('checkin-today', 1));
    assert.match(text, /小驴打卡/);
    assert.match(text, /siyuan-checkin/);
    assert.equal(text, text.toLowerCase());
});

test('pending catalog states aggregate per provider plugin', () => {
    const states = [
        {entry: {moduleId: 'a', providerPlugin: 'siyuan-checkin', providerName: '小驴打卡', icon: 'iconCheck'}, status: 'missing'},
        {entry: {moduleId: 'b', providerPlugin: 'siyuan-checkin', providerName: '小驴打卡', icon: 'iconCheck'}, status: 'missing'},
        {entry: {moduleId: 'c', providerPlugin: 'other-plugin', providerName: '别的插件', icon: 'iconPlugin'}, status: 'missing'},
    ];
    const groups = source.buildHomeStoreProviderGroups(states);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].providerPlugin, 'siyuan-checkin');
    assert.equal(groups[0].count, 2);
    assert.equal(groups[0].providerName, '小驴打卡');
    assert.equal(groups[1].count, 1);
});

test('provider grouping tolerates junk input', () => {
    assert.deepEqual(source.buildHomeStoreProviderGroups(null), []);
    assert.deepEqual(source.buildHomeStoreProviderGroups([{entry: null}, {}, {entry: {moduleId: 'x'}}]), []);
});

test('source grouping tolerates junk input', () => {
    assert.deepEqual(source.buildHomeStoreSourceGroups(null), []);
    assert.deepEqual(source.buildHomeStoreSourceGroups([null, {}, {moduleId: 'x'}]), []);
});

test('ordering helper keeps built-in groups first', () => {
    const ordered = source.orderHomeStoreSourceGroups([
        {key: 'plugin:b', kind: 'plugin', count: 1},
        {key: 'builtin', kind: 'builtin', count: 9},
    ]);
    assert.equal(ordered[0].key, 'builtin');
});
