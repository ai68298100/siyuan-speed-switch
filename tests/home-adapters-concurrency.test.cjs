// T-7164：组件适配器并发/缓存提交/取消隔离/退避守卫——三症状负向用例固化。
const test = require('node:test');
const assert = require('node:assert/strict');
const {registerHomeAdapters, readHomeModule, clearHomeSnapshotCache} = require('../src/home-adapters.js');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let adaptersMap = null;
function freshAdapter(read, cacheTtlMs = 0) {
    clearHomeSnapshotCache();
    adaptersMap = registerHomeAdapters([{
        moduleId: 'probe', title: 'Probe', category: 'plugin',
        supportedDevices: ['desktop'], sizes: ['small'], readOnly: true,
        cacheTtlMs, timeoutMs: 5000, read,
    }]);
}

test('concurrent same-key reads share the底层 read and commit cache for the next caller', async () => {
    let reads = 0;
    freshAdapter(async () => { reads += 1; await delay(50); return {items: []}; }, 3000);
    const [a, b] = await Promise.all([
        readHomeModule(adaptersMap, 'probe', 'desktop', {}, {}),
        readHomeModule(adaptersMap, 'probe', 'desktop', {}, {}),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(reads, 1, '并发同键只读一次底层');
    await delay(20);
    const third = await readHomeModule(adaptersMap, 'probe', 'desktop', {}, {});
    assert.equal(third.ok, true);
    assert.equal(third.cached, true, '共享读完成后下一次必须命中缓存（历史：B 递增 generation 破坏 A 提交）');
    assert.equal(reads, 1, '第三次不得重读底层');
});

test('first caller abort does not poison the shared waiter', async () => {
    let reads = 0;
    freshAdapter(async () => { reads += 1; await delay(60); return {items: []}; });
    const ac = new AbortController();
    const pA = readHomeModule(adaptersMap, 'probe', 'desktop', {}, {signal: ac.signal});
    const pB = readHomeModule(adaptersMap, 'probe', 'desktop', {}, {});
    await delay(10);
    ac.abort();
    const a = await pA;
    const b = await pB;
    assert.equal(a.reason, 'aborted', 'A 自身取消照常');
    assert.equal(b.ok, true, '无 signal 的等待者不得被误伤（历史：共享 Promise 连坐 aborted）');
    assert.equal(reads, 2, '不同取消语境各自开读');
});

test('stale success must not clear a newer failure backoff', async () => {
    let calls = 0;
    freshAdapter(async () => {
        calls += 1;
        if (calls === 1) { await delay(120); return {items: []}; } // A：慢成功（旧代）
        throw new Error('failed'); // B+：立即失败（新代，设退避）
    });
    const pA = readHomeModule(adaptersMap, 'probe', 'desktop', {}, {});
    await delay(20);
    // dedupe:false 让 B 独立开读（force 只绕 backoff/TTL，不绕 dedupe）
    const b = await readHomeModule(adaptersMap, 'probe', 'desktop', {}, {force: true, dedupe: false});
    assert.equal(b.reason, 'failed', 'B 失败并设置退避');
    const a = await pA;
    assert.equal(a.ok, true, 'A 慢成功晚到');
    const next = await readHomeModule(adaptersMap, 'probe', 'desktop', {}, {});
    assert.equal(next.reason, 'backoff', '旧代成功不得清除新代失败退避（历史：无守卫 delete）');
});
