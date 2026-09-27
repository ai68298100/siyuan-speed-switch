// T-6956：脏稿三选一待执行意图协调器——同步阻止、保存成功才导航一次、
// 失败/冲突/异常停在草稿、连续点击不重复写入、放弃零写入、取消清空。
const test = require('node:test');
const assert = require('node:assert/strict');
const {createLeaveIntentCoordinator} = require('../src/snippet-studio-model.js');

const runs = () => {
    const calls = [];
    return {run: (tag = "nav") => calls.push(tag), calls};
};

test('clean leave runs immediately; dirty leave is held for confirmation; busy is rejected', () => {
    const leave = createLeaveIntentCoordinator();
    const a = runs();
    assert.deepEqual(leave.requestLeave(false, false, a.run), {action: "run"});
    assert.deepEqual(a.calls, ["nav"], "干净路径立即放行");
    const b = runs();
    const held = leave.requestLeave(true, false, b.run);
    assert.equal(held.action, "confirm");
    assert.deepEqual(b.calls, [], "脏稿必须同步阻止，不立即导航");
    assert.equal(leave.hasPending(), true);
    const c = runs();
    assert.equal(leave.requestLeave(false, true, c.run).action, "reject", "busy 一律拒绝");
});

test('confirmSave navigates exactly once on save success', async () => {
    const leave = createLeaveIntentCoordinator();
    const a = runs();
    leave.requestLeave(true, false, a.run);
    let saveCalls = 0;
    const result = await leave.confirmSave(async () => {
        saveCalls += 1;
        return true;
    });
    assert.deepEqual(result, {saved: true, navigated: true});
    assert.deepEqual(a.calls, ["nav"]);
    assert.equal(saveCalls, 1, "保存恰好执行一次");
    assert.equal(leave.hasPending(), false, "意图已消费，不得执行第二个导航");
});

test('confirmSave with rejection/conflict/exception stays on the draft without navigating', async () => {
    for (const behaviour of [async () => false, async () => { throw new Error("boom"); }, async () => "not-true"]) {
        const leave = createLeaveIntentCoordinator();
        const a = runs();
        leave.requestLeave(true, false, a.run);
        const result = await leave.confirmSave(behaviour);
        assert.deepEqual(result, {saved: false, navigated: false});
        assert.deepEqual(a.calls, [], "保存未成功不得继续导航");
        assert.equal(leave.hasPending(), false, "失败的意图不再保留");
        assert.equal(leave.isSaving(), false, "saving 标志必须复位");
    }
});

test('in-flight save rejects concurrent confirmation (double-click guard)', async () => {
    const leave = createLeaveIntentCoordinator();
    const a = runs();
    leave.requestLeave(true, false, a.run);
    let releaseSave;
    const inflight = leave.confirmSave(() => new Promise((resolve) => { releaseSave = resolve; }));
    const second = await leave.confirmSave(async () => true);
    assert.deepEqual(second, {saved: false, navigated: false}, "saving 期间拒绝重复确认");
    releaseSave(true);
    const first = await inflight;
    assert.deepEqual(first, {saved: true, navigated: true});
    assert.deepEqual(a.calls, ["nav"], "最终只执行一个导航");
});

test('confirmDiscard runs without writing; cancel clears the pending intent', () => {
    const leave = createLeaveIntentCoordinator();
    const a = runs();
    leave.requestLeave(true, false, a.run);
    assert.deepEqual(leave.confirmDiscard(), {navigated: true}, "放弃直接放行待执行意图（零写入）");
    assert.deepEqual(a.calls, ["nav"]);

    const b = runs();
    leave.requestLeave(true, false, b.run);
    assert.deepEqual(leave.cancel(), {pending: false});
    assert.equal(leave.hasPending(), false);
    assert.deepEqual(leave.confirmDiscard(), {navigated: false}, "取消后放弃不得导航");
    assert.deepEqual(b.calls, []);
});
