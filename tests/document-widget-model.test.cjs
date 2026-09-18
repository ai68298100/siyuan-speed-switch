const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/document-widget-model.js');

const DOC_A = '20260918120000-aaaaaaa';
const DOC_B = '20260918120001-bbbbbbb';

test('favorites widget filters groups and reports paths, session-only, and unavailable entries', () => {
    const favorites = [
        {key: DOC_A, rootId: DOC_A, title: '项目', group: '工作'},
        {key: 'tab-plugin', rootId: null, title: '插件页签', group: '工作'},
        {key: DOC_B, rootId: DOC_B, title: '已删除', group: '工作'},
        {key: 'other', rootId: null, title: '其他', group: ''},
    ];
    const snapshot = model.buildFavoritesWidgetSnapshot(favorites, [
        {id: DOC_A, content: '项目新标题', hpath: '/工作/项目'},
    ], new Set(['tab-plugin']), {group: '工作', limit: 8}, {
        unavailable: '不可用', sessionOnly: '仅会话', ungrouped: '未分组', stat: '收藏',
    });
    assert.deepEqual(snapshot.items.map((item) => [item.label, item.secondary]), [
        ['项目', '工作 · /工作/项目'],
        ['插件页签', '仅会话 · 工作'],
        ['已删除', '不可用 · 工作'],
    ]);
    assert.deepEqual(snapshot.stat, {value: '3', label: '收藏'});
});

test('favorites widget supports ungrouped scope, limit bounds, and hiding unavailable entries', () => {
    const favorites = [
        {key: DOC_A, rootId: DOC_A, title: '失效', group: ''},
        {key: 'open-tab', rootId: null, title: '打开页签', group: ''},
    ];
    assert.deepEqual(model.favoriteDocumentIdsForProbe(favorites, {group: '__ungrouped__'}), [DOC_A]);
    const snapshot = model.buildFavoritesWidgetSnapshot(favorites, [], new Set(['open-tab']), {
        group: '__ungrouped__', limit: 99, showUnavailable: '否', showGroup: '否', showPath: '否',
    });
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].label, '打开页签');
    assert.equal(model.normalizeFavoritesWidgetConfig({limit: 0}).limit, 1);
});

test('document sets widget sorts by recent use, name, and document count with bounded details', () => {
    const sets = [
        {setId: 'b', name: 'Beta', entries: [{}, {}, {}], updatedAt: Date.UTC(2026, 8, 17)},
        {setId: 'a', name: 'Alpha', entries: [{}], updatedAt: Date.UTC(2026, 8, 18)},
    ];
    const recent = model.buildDocumentSetsWidgetSnapshot(sets, {}, {documents: '篇', stat: '集'});
    assert.deepEqual(recent.items.map((item) => item.label), ['Alpha', 'Beta']);
    assert.equal(recent.items[0].secondary, '1 篇 · 2026-09-18');
    const count = model.buildDocumentSetsWidgetSnapshot(sets, {sortBy: '文档数', showUpdated: '否'}, {documents: '篇'});
    assert.deepEqual(count.items.map((item) => item.label), ['Beta', 'Alpha']);
    const name = model.buildDocumentSetsWidgetSnapshot(sets, {sortBy: '名称', showCount: '否'}, {});
    assert.deepEqual(name.items.map((item) => item.label), ['Alpha', 'Beta']);
});

test('fixed document validates ids, follows metadata, and keeps a custom title override', () => {
    assert.equal(model.normalizeFixedDocumentConfig({docId: 'bad'}).docId, '');
    const configured = model.buildFixedDocumentSnapshot([], {}, {configure: '请选择'});
    assert.equal(configured.emptyHint, '请选择');
    const missing = model.buildFixedDocumentSnapshot([], {docId: DOC_A}, {unavailable: '已失效'});
    assert.equal(missing.emptyHint, '已失效');
    const snapshot = model.buildFixedDocumentSnapshot([
        {id: DOC_A, content: '最新标题', hpath: '/知识/最新标题'},
    ], {docId: DOC_A, title: '我的入口'}, {});
    assert.deepEqual(snapshot.items, [{label: '我的入口', value: DOC_A, secondary: '/知识/最新标题'}]);
    const noPath = model.buildFixedDocumentSnapshot([{id: DOC_A, content: '最新标题', hpath: '/知识'}], {docId: DOC_A, showPath: '否'}, {});
    assert.equal(noPath.items[0].secondary, undefined);
});
