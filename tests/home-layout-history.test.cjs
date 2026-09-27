// T-6953：工作台布局撤销/重做纯模块——30 步上限、内存上限、重做分支清除、
// 配置不回滚的快照调和、空态/边界保护。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    LAYOUT_HISTORY_MAX_STEPS, LAYOUT_HISTORY_MAX_BYTES,
    layoutSnapshotOf, createLayoutHistory, pushLayoutHistory,
    canUndoLayoutHistory, canRedoLayoutHistory,
    undoLayoutHistory, redoLayoutHistory,
    peekUndoLabel, peekRedoLabel, reconcileLayoutSnapshot,
} = require('../src/home-layout-history.js');

const state = (tag, extra) => ({schemaVersion: 1, instances: [{instanceId: `i-${tag}`, moduleId: 'clock', enabled: true, config: extra || {}}], layouts: {desktop: [{instanceId: `i-${tag}`, w: 4, h: 4}]}});

test('history pushes commits, clears the redo branch and de-duplicates identical states', () => {
    let history = createLayoutHistory(layoutSnapshotOf(state('a')), {label: '初始'});
    assert.equal(canUndoLayoutHistory(history), false);
    assert.equal(canRedoLayoutHistory(history), false);
    history = pushLayoutHistory(history, layoutSnapshotOf(state('a')), '移动组件');
    assert.equal(history.stack.length, 1, '与栈顶相同的状态不重复入栈');
    history = pushLayoutHistory(history, layoutSnapshotOf(state('b')), '移动组件');
    history = pushLayoutHistory(history, layoutSnapshotOf(state('c')), '调整尺寸');
    assert.equal(history.index, 2);
    // 撤销后再提交新操作：重做分支必须被清除
    const undone = undoLayoutHistory(history);
    history = undone.history;
    assert.equal(canRedoLayoutHistory(history), true);
    history = pushLayoutHistory(history, layoutSnapshotOf(state('d')), '移除组件');
    assert.equal(canRedoLayoutHistory(history), false, '新提交后旧重做分支清除');
});

test('history respects the 30-step cap and the byte budget by dropping the oldest', () => {
    let history = createLayoutHistory(layoutSnapshotOf(state('base')));
    for (let i = 0; i < LAYOUT_HISTORY_MAX_STEPS + 12; i++) {
        history = pushLayoutHistory(history, layoutSnapshotOf(state(`s${i}`)), `op-${i}`);
    }
    assert.ok(history.stack.length <= LAYOUT_HISTORY_MAX_STEPS, `步数上限 ${LAYOUT_HISTORY_MAX_STEPS}`);
    assert.equal(history.index, history.stack.length - 1, '指针始终指向当前态');
    // 字节预算：超大快照把旧端丢弃，但至少保留当前态
    const big = {state: {pad: 'x'.repeat(LAYOUT_HISTORY_MAX_BYTES), instances: []}, bytes: LAYOUT_HISTORY_MAX_BYTES};
    let tiny = createLayoutHistory(layoutSnapshotOf(state('tiny')));
    tiny = pushLayoutHistory(tiny, big, '巨大快照');
    tiny = pushLayoutHistory(tiny, layoutSnapshotOf(state('tiny2')), '小提交');
    assert.ok(tiny.stack.length >= 1, '预算淘汰至少保留当前态，不清空历史');
    assert.equal(tiny.stack[tiny.index].snapshot.instances[0].instanceId, 'i-tiny2', '当前态始终在栈顶');
});

test('undo/redo walk the stack with readable operation labels', () => {
    let history = createLayoutHistory(layoutSnapshotOf(state('a')), {label: '初始'});
    history = pushLayoutHistory(history, layoutSnapshotOf(state('b')), '移动组件');
    history = pushLayoutHistory(history, layoutSnapshotOf(state('c')), '调整尺寸');
    assert.equal(peekUndoLabel(history), '调整尺寸');
    assert.equal(peekRedoLabel(history), '');
    const undone = undoLayoutHistory(history);
    assert.equal(undone.snapshot.instances[0].instanceId, 'i-b');
    assert.equal(undone.label, '调整尺寸', '撤销读出被撤销操作名');
    assert.equal(peekRedoLabel(undone.history), '调整尺寸');
    const redone = redoLayoutHistory(undone.history);
    assert.equal(redone.snapshot.instances[0].instanceId, 'i-c');
    assert.equal(redone.label, '调整尺寸');
    let cursor = redoLayoutHistory(undone.history).history;
    const step1 = undoLayoutHistory(cursor);
    assert.equal(step1.snapshot.instances[0].instanceId, 'i-b');
    const step2 = undoLayoutHistory(step1.history);
    assert.equal(step2.snapshot.instances[0].instanceId, 'i-a', '回到会话初始态');
    const step3 = undoLayoutHistory(step2.history);
    assert.equal(step3.snapshot, null, '栈底再撤销为空');
});

test('reconcile keeps live configs, restores deleted instances and reverts structure', () => {
    const snapshot = {
        instances: [
            {instanceId: 'i-a', moduleId: 'clock', enabled: true, config: {old: true}},
            {instanceId: 'i-del', moduleId: 'rss', enabled: true, config: {url: 'https://kept'}},
        ],
        layouts: {desktop: [{instanceId: 'i-a', w: 6, h: 2}, {instanceId: 'i-del', w: 4, h: 4}]},
    };
    const current = {
        schemaVersion: 2,
        instances: [
            {instanceId: 'i-a', moduleId: 'clock', enabled: true, config: {edited: 'not-undone'}},
            {instanceId: 'i-added', moduleId: 'weather', enabled: true, config: {}},
        ],
        layouts: {desktop: [{instanceId: 'i-a', w: 12, h: 4}, {instanceId: 'i-added', w: 4, h: 4}]},
    };
    const next = reconcileLayoutSnapshot(snapshot, current);
    assert.deepEqual(next.instances.map((i) => i.instanceId), ['i-a', 'i-del'], '快照后加的实例被移除、被删实例恢复');
    assert.equal(next.instances[0].config.edited, 'not-undone', '存活实例配置不回滚');
    assert.deepEqual(next.instances[1].config, {url: 'https://kept'}, '恢复实例带既有配置快照');
    assert.equal(next.layouts.desktop.length, 2, '布局表按快照恢复');
    assert.equal(next.schemaVersion, 2, 'schemaVersion 以当前为准');
});
