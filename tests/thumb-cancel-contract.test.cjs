// T-7172：缩略图回源取消/超时/闸门离队契约（源码扫描 + 检测器自检负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const index = readSourceFile('src/index.ts');
const constants = readSourceFile('src/constants.ts');

test('constants carry the thumbnail timeout tier', () => {
    assert.match(constants, /export const THUMB_API_TIMEOUT_MS = 8000;/, '超时常量必须定义');
    assert.match(index, /THUMB_API_TIMEOUT_MS,/, '宿主必须消费超时常量');
});

test('fillThumbByApi aborts on timeout and carries the signal (T-7172)', () => {
    const fnStart = index.indexOf('private async fillThumbByApi');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    assert.match(body, /new AbortController\(\)/, '必须创建取消控制器（能力检测包裹）');
    assert.match(body, /THUMB_API_TIMEOUT_MS/, '必须设置超时（慢内核下旧请求不占闸门）');
    assert.match(body, /signal: controller\.signal/, 'fetch 必须携带 signal');
    assert.match(body, /window\.clearTimeout\(timer\)/, '成功后必须清超时定时器');
});

test('the gate dequeues disconnected waiters after acquiring a slot (T-7172)', () => {
    const fnStart = index.indexOf('private async fillThumbByApi');
    const body = index.slice(fnStart, index.indexOf('\n    }\n', fnStart) + 6);
    const acquireAt = body.indexOf('await this.acquireThumbApi();');
    const afterAcquire = body.slice(acquireAt, acquireAt + 300);
    assert.match(afterAcquire, /if \(!thumb\.isConnected\)/, '拿到槽位后必须先验失连');
    assert.match(afterAcquire, /this\.releaseThumbApi\(\);\s*\n\s*return;/, '失连必须立即离队（历史：占槽发请求）');
});

test('switcher close batches thumbnail cancellation (T-7172)', () => {
    assert.match(index, /cancelThumbFetches\(\) \{/, '批量取消方法必须存在');
    const destroy = index.indexOf('if (this.platformSwitcherDialog === holder.dialog) this.platformSwitcherDialog = null;');
    const block = index.slice(destroy, index.indexOf('}', destroy) + 1);
    assert.match(block, /this\.cancelThumbFetches\(\)/, '切换器 destroyCallback 必须接线批量取消');
    assert.match(index, /thumbApiControllers\.forEach\(\(controller\) =>/, '批量取消必须遍历 abort');
});

test('detector self-check: bare fetch without signal/timeout is caught (negative verification)', () => {
    const legacy = 'const response = await fetch("/api/filetree/getDoc", {method: "POST", body: "{}"});';
    assert.doesNotMatch(legacy, /signal/, '历史裸 fetch 形态必须可被识别（无 signal）');
    const fixed = '...(controller ? {signal: controller.signal} : {}),';
    assert.match(fixed, /signal: controller\.signal/, '修复形态必须携带 signal');
});
