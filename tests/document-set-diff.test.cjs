// T-6955：文档集历史版本差异纯模型——按稳定 rootId 比较，分组=恢复/移除/变更；
// 标题改名与文档身份分离；畸形/重复/旧 schema 条目经 normalize 防御。
const test = require('node:test');
const assert = require('node:assert/strict');
const {diffDocumentSetVersion} = require('../src/document-sets.js');

const entry = (rootId, title, index, active) => ({rootId, title, index, ...(active ? {active: true} : {})});

test('diff groups restore/remove by stable rootId', () => {
    const current = [entry('20260101000000-aaaa', '当前保留', 0), entry('20260101000000-bbbb', '将被移除', 1)];
    const version = [entry('20260101000000-aaaa', '当前保留', 0), entry('20260101000000-cccc', '将被恢复', 1)];
    const diff = diffDocumentSetVersion(current, version);
    assert.deepEqual(diff.restore.map((e) => e.rootId), ['20260101000000-cccc']);
    assert.deepEqual(diff.remove.map((e) => e.rootId), ['20260101000000-bbbb']);
    assert.equal(diff.changed.length, 0);
    assert.equal(diff.unchangedCount, 1);
});

test('diff separates title change from identity and flags reorder and active change', () => {
    const current = [
        entry('20260101000000-aaaa', '新标题', 0, true),
        entry('20260101000000-bbbb', '文档B', 1),
    ];
    const version = [
        entry('20260101000000-aaaa', '旧标题', 1),
        entry('20260101000000-bbbb', '文档B', 0),
    ];
    const diff = diffDocumentSetVersion(current, version);
    assert.equal(diff.changed.length, 2);
    const renamed = diff.changed.find((c) => c.rootId === '20260101000000-aaaa');
    assert.equal(renamed.titleChanged, true, '同 ID 标题变更按稳定 ID 识别');
    assert.equal(renamed.currentTitle, '新标题');
    assert.equal(renamed.versionTitle, '旧标题');
    assert.equal(renamed.activeChanged, true);
    const reordered = diff.changed.find((c) => c.rootId === '20260101000000-bbbb');
    assert.equal(reordered.orderChanged, true);
    assert.equal(reordered.titleChanged, false);
});

test('diff tolerates malformed, duplicate and old-schema entries defensively', () => {
    const current = [
        {title: '无 rootId 的条目应被丢弃'},
        {rootId: '20260101000000-aaaa', title: '正常', index: 0},
        {rootId: '20260101000000-aaaa', title: '重复条目去重'},
        {rootId: '20260101000000-bbbb', title: ''}, // 空标题回落 rootId
    ];
    const version = [
        {rootId: '20260101000000-aaaa', title: '正常', index: 0},
        {rootId: '20260101000000-cccc', title: '旧条目', layout: {index: 2}}, // 旧 schema：index 在 layout 内
    ];
    const diff = diffDocumentSetVersion(current, version);
    assert.equal(diff.remove.length, 1, '重复 rootId 去重后只剩一条');
    assert.equal(diff.changed.length, 0);
    assert.equal(diff.restore[0].rootId, '20260101000000-cccc');
    assert.equal(diff.restore[0].index, 2, '旧 schema 的 layout.index 被正确归一');
    assert.equal(diff.unchangedCount, 1);
});

test('diff is read-only: inputs are never mutated', () => {
    const current = [entry('20260101000000-aaaa', '标题', 0)];
    const version = [entry('20260101000000-bbbb', '其他', 0)];
    const currentCopy = JSON.stringify(current);
    const versionCopy = JSON.stringify(version);
    diffDocumentSetVersion(current, version);
    assert.equal(JSON.stringify(current), currentCopy);
    assert.equal(JSON.stringify(version), versionCopy);
});
