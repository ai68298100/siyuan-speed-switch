// T-6958：冲突副本纯模型——禁用态、唯一命名、原件不动、清单不可得时拒绝。
const test = require('node:test');
const assert = require('node:assert/strict');
const {CONFLICT_COPY_NAME_MAX, nextConflictCopyName, buildConflictCopyEntry} = require('../src/snippet-studio-model.js');

const latest = [
    {id: 'native-1', name: '近期天气样式', type: 'css', content: '.a {}', enabled: true},
    {id: 'native-2', name: '表格美化', type: 'css', content: '.b {}', enabled: false},
];

test('conflict copy is a new disabled entry; the conflicting original stays untouched', () => {
    const draft = {name: '近期天气样式', type: 'css', content: '.a { color: red }'};
    const entry = buildConflictCopyEntry(latest, draft, '20260928000000-copy001');
    assert.equal(entry.id, '20260928000000-copy001', '副本取得全新 id');
    assert.equal(entry.enabled, false, '副本必须禁用');
    assert.equal(entry.content, draft.content, '副本携带本地草稿内容');
    assert.equal(entry.name, '近期天气样式 (冲突副本)');
    // 原清单不变
    assert.equal(latest.length, 2);
    assert.equal(latest[0].content, '.a {}');
});

test('conflict copy name dedupes against the latest list and caps length', () => {
    const names = ['样式 (冲突副本)', '样式 (冲突副本 2)', '样式 (冲突副本 3)'];
    assert.equal(nextConflictCopyName(names, '样式'), '样式 (冲突副本 4)');
    assert.ok(nextConflictCopyName([], 'x'.repeat(80)).length <= CONFLICT_COPY_NAME_MAX);
    assert.equal(nextConflictCopyName([], ''), 'snippet (冲突副本)', '空白名称回落');
});

test('conflict copy refuses without a readable latest list or an empty draft', () => {
    assert.equal(buildConflictCopyEntry(null, {name: 'x', type: 'css', content: 'a{}'}, 'id1'), null, '清单不可得必须拒绝');
    assert.equal(buildConflictCopyEntry(latest, {name: 'x', type: 'css', content: '   '}, 'id1'), null, '空草稿不得生成副本');
    assert.equal(buildConflictCopyEntry(latest, null, 'id1'), null);
});
