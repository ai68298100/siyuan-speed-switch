// T-6957：统一草稿历史——50 步上限 + 512 KiB 总字节预算（快照策略）、重做分支
// 清除、同态去重、输入不可变。IME 合并/键盘协调属 UI 接线，另有契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DRAFT_HISTORY_MAX_STEPS, DRAFT_HISTORY_MAX_BYTES,
    createDraftHistory, pushDraftHistory,
    undoDraftHistory, redoDraftHistory,
    canUndoDraftHistory, canRedoDraftHistory,
} = require('../src/snippet-studio-model.js');

const state = (tag, content) => ({name: `n-${tag}`, type: 'css', content: content || `body { /* ${tag} */ }`});

test('draft history pushes, de-duplicates identical states and clears redo on new commits', () => {
    let history = createDraftHistory(state('a'));
    assert.equal(canUndoDraftHistory(history), false);
    history = pushDraftHistory(history, state('a'));
    assert.equal(history.stack.length, 1, '同态去重');
    history = pushDraftHistory(history, state('b', 'p { color: red }'));
    history = pushDraftHistory(history, state('c', 'p { color: blue }'));
    assert.equal(canUndoDraftHistory(history), true);
    const undone = undoDraftHistory(history);
    history = undone.history;
    assert.equal(canRedoDraftHistory(history), true);
    history = pushDraftHistory(history, state('d', 'p { color: green }'));
    assert.equal(canRedoDraftHistory(history), false, '新提交清除重做分支');
    assert.equal(history.stack[history.index].state.content, 'p { color: green }');
});

test('draft history caps at 50 steps and the byte budget by dropping the oldest', () => {
    let history = createDraftHistory(state('base'));
    for (let i = 0; i < DRAFT_HISTORY_MAX_STEPS + 20; i++) {
        history = pushDraftHistory(history, state(`s${i}`, `x`.repeat(64)));
    }
    assert.ok(history.stack.length <= DRAFT_HISTORY_MAX_STEPS, '步数上限 50');
    assert.equal(history.index, history.stack.length - 1);
    const bigContent = 'y'.repeat(DRAFT_HISTORY_MAX_BYTES);
    let tiny = createDraftHistory(state('tiny'));
    tiny = pushDraftHistory(tiny, {name: 'n', type: 'css', content: bigContent});
    tiny = pushDraftHistory(tiny, state('tiny2', 'kept'));
    assert.ok(tiny.stack.length >= 1, '预算淘汰至少保留当前态');
    assert.equal(tiny.stack[tiny.index].state.content, 'kept', '当前态始终在栈顶');
});

test('draft undo/redo return deep copies so later edits never mutate the stack', () => {
    let history = createDraftHistory(state('a'));
    history = pushDraftHistory(history, state('b', 'v1'));
    const undone = undoDraftHistory(history);
    assert.equal(undone.state.content, 'body { /* a */ }');
    undone.state.content = 'MUTATED';
    assert.equal(history.stack[0].state.content, 'body { /* a */ }', '栈内快照不受返回副本编辑影响');
    const redone = redoDraftHistory(undone.history);
    assert.equal(redone.state.content, 'v1');
    assert.equal(canRedoDraftHistory(undone.history), true);
});

test('byte estimates keep name and content inside the budget accounting', () => {
    const big = {name: 'n'.repeat(100), type: 'css', content: 'c'.repeat(1000)};
    const history = createDraftHistory(state('a'));
    const pushed = pushDraftHistory(history, big);
    assert.ok(pushed.stack[pushed.index].bytes > 1000, '名称+正文均计入字节预算');
});
