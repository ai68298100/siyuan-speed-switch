// T-6952：保存的搜索编辑——不可变更新、保 ID、空查询拒绝、长度归一、notebook 清除。
const test = require('node:test');
const assert = require('node:assert/strict');
const {SAVED_SEARCH_NAME_MAX, SAVED_SEARCH_QUERY_MAX, SAVED_SEARCH_NOTEBOOK_MAX, updateSavedSearchEntry} = require('../src/search-model.js');

const LIST = [
    {id: 'sw-a', name: '工作搜索', query: '项目 -周报'},
    {id: 'sw-b', name: '日记', query: '日记', notebook: '20260101120000-xyz'},
    {id: 'sw-c', name: '临时', query: '临时'},
];

test('edit updates in place, keeps the original id and preserves entry order', () => {
    const result = updateSavedSearchEntry(LIST, 'sw-b', {name: '每日日记', query: '日记 已归档', notebook: ''});
    assert.equal(result.ok, true);
    assert.equal(result.list.length, 3, '条目数量不变');
    assert.deepEqual(result.list.map((item) => item.id), ['sw-a', 'sw-b', 'sw-c'], '原 ID 恒不变且顺序稳定');
    assert.equal(result.list[1].name, '每日日记');
    assert.equal(result.list[1].query, '日记 已归档');
    assert.equal(result.list[1].notebook, undefined, 'notebook 空串 = 清除约束');
    assert.equal(result.list[1].id, 'sw-b');
    // 原列表不被就地修改（不可变更新）
    assert.equal(LIST[1].name, '日记');
    assert.equal(LIST[1].notebook, '20260101120000-xyz');
});

test('edit rejects empty queries and unknown ids without touching the list', () => {
    for (const patch of [{query: '   '}, {query: ''}]) {
        const result = updateSavedSearchEntry(LIST, 'sw-a', patch);
        assert.equal(result.ok, false, JSON.stringify(patch));
        assert.equal(result.reason, 'empty-query');
        assert.equal(result.list, LIST, '拒绝时原列表原样返回（取消零写入）');
    }
    // 不带 query 的补丁沿用原查询，属合法编辑（仅改名称/笔记本）
    assert.equal(updateSavedSearchEntry(LIST, 'sw-a', {}).ok, true);
    const missing = updateSavedSearchEntry(LIST, 'sw-missing', {query: 'x'});
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'not-found');
    const broken = updateSavedSearchEntry(null, 'sw-a', {query: 'x'});
    assert.equal(broken.ok, false);
});

test('edit trims and truncates to the same limits as save (name 40 / query 120 / notebook 64)', () => {
    const longQuery = `${'q'.repeat(130)}`.replace(/^/, '');
    const result = updateSavedSearchEntry(LIST, 'sw-c', {
        name: `n${'a'.repeat(60)}`,
        query: `  ${'q'.repeat(130)}  `,
        notebook: `nb${'k'.repeat(70)}`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.entry.query, 'q'.repeat(SAVED_SEARCH_QUERY_MAX));
    assert.equal(result.entry.query.length, SAVED_SEARCH_QUERY_MAX);
    assert.equal(result.entry.name.length, SAVED_SEARCH_NAME_MAX);
    assert.equal(result.entry.notebook.length, SAVED_SEARCH_NOTEBOOK_MAX);
    assert.ok(longQuery.length > SAVED_SEARCH_QUERY_MAX);
    assert.equal(SAVED_SEARCH_NAME_MAX, 40);
    assert.equal(SAVED_SEARCH_QUERY_MAX, 120);
    assert.equal(SAVED_SEARCH_NOTEBOOK_MAX, 64);
});

test('edit falls back the name to the query and keeps a notebook when not patched', () => {
    const result = updateSavedSearchEntry(LIST, 'sw-b', {query: '新查询'});
    assert.equal(result.ok, true);
    assert.equal(result.entry.name, '日记', '未提供名称沿用原名');
    assert.equal(result.entry.notebook, '20260101120000-xyz', '未提供 notebook 沿用原约束');
    const cleared = updateSavedSearchEntry(LIST, 'sw-b', {query: '新查询', notebook: ''});
    assert.equal(cleared.entry.notebook, undefined);
    // 名称裁剪后为空 → 回落查询文本（与保存路径同名默认语义）
    const blankName = updateSavedSearchEntry(LIST, 'sw-c', {name: '   ', query: '临时查询'});
    assert.equal(blankName.entry.name, '临时查询');
});
