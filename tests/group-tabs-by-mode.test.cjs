const {test} = require('node:test');
const assert = require('node:assert/strict');
const {groupTabsByMode} = require('../src/util.js');

const tab = (id, notebookId, rootId) => ({id, notebookId, rootId});

const baseCtx = () => ({
    pinKeyOf: (t) => t.rootId || t.id,
    isFavorite: (key) => ['r-1'].includes(key),
    favoriteGroupOf: (key) => (key === 'r-1' ? '工作流' : ''),
    favoriteGroupOrder: ['工作流'],
    notebookIdOf: (t) => t.notebookId || '',
    notebookNameOf: (id) => ({nbA: '笔记本A', nbB: '笔记本B'}[id] || ''),
    notebookOrder: ['nbA', 'nbB'],
    createdOf: (key) => ({'r-1': '20260905120000', 'r-2': '20260910103000', 'r-3': '20260831120000'}[key] || ''),
    labels: {unknownNotebook: '未知笔记本', ungroupedFavorite: '未分组', unfavorited: '未收藏', unknownMonth: '更早'},
});

test('groupTabsByMode groups by notebook in notebook order with fallback label', () => {
    const tabs = [tab('t2', 'nbB', 'r-2'), tab('t3', '', 'r-3'), tab('t1', 'nbA', 'r-1'), tab('t4', 'nbA', 'r-4')];
    const defs = groupTabsByMode(tabs, 'notebook', baseCtx());
    assert.deepEqual(defs.map((def) => def.label), ['笔记本A', '笔记本B', '未知笔记本']);
    assert.deepEqual(defs[0].items.map((item) => item.id), ['t1', 't4']);
    assert.equal(defs[0].key, 'nb:nbA');
});

test('groupTabsByMode groups favorites first and unfavored last', () => {
    const tabs = [tab('t1', 'nbA', 'r-1'), tab('t2', 'nbA', 'r-2')];
    const defs = groupTabsByMode(tabs, 'favorites', baseCtx());
    assert.deepEqual(defs.map((def) => def.label), ['工作流', '未收藏']);
    assert.equal(defs[0].icon, 'iconStar');
    assert.deepEqual(defs[0].items.map((item) => item.id), ['t1']);
});

test('groupTabsByMode groups by created month descending with unknown last', () => {
    const tabs = [tab('t1', 'nbA', 'r-1'), tab('t2', 'nbA', 'r-2'), tab('t3', 'nbA', 'r-3'), tab('t4', 'nbA', 'r-9')];
    const defs = groupTabsByMode(tabs, 'createdMonth', baseCtx());
    assert.deepEqual(defs.map((def) => def.label), ['2026-09', '2026-08', '更早']);
    assert.deepEqual(defs[0].items.map((item) => item.id), ['t1', 't2']);
    assert.deepEqual(defs[2].items.map((item) => item.id), ['t4']);
});

test('groupTabsByMode returns a single unlabelled group for none mode', () => {
    const defs = groupTabsByMode([tab('t1', 'nbA', 'r-1')], 'none', baseCtx());
    assert.equal(defs.length, 1);
    assert.equal(defs[0].label, '');
    assert.equal(defs[0].items.length, 1);
});
