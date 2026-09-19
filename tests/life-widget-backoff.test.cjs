const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("../src/life-widget-network.js");

// T-6489：失败抑制窗。借鉴 siyuan-lumina 的"失败即终结"纪律，但保留强制刷新，
// 目的是让不可达的源不再在每个刷新周期重复付出整段超时（最长 10s）。
const URL_OK = net.HACKER_NEWS_FRONT_PAGE_URL;   // 固定白名单端点
const now0 = 1770000000000;

function failingFetch() {
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); throw new Error("fetch failed"); };
    return {calls, fetchImpl};
}

test("a failed endpoint is suppressed within the window without paying the timeout again", async () => {
    net.resetLifeFetchBackoff();
    const {calls, fetchImpl} = failingFetch();
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK,
        {fetchImpl, now: now0, timeoutMs: 500}), /fetch failed/);
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK,
        {fetchImpl, now: now0 + 1000, timeoutMs: 500}), /backoff/);
    assert.deepEqual(calls, [URL_OK], "窗内不得再次出网");
});

test("explicit force bypasses the suppression window", async () => {
    net.resetLifeFetchBackoff();
    const {calls, fetchImpl} = failingFetch();
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK, {fetchImpl, now: now0}));
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK, {fetchImpl, now: now0 + 500, force: true}));
    assert.equal(calls.length, 2, "手动刷新必须真的重取");
});

test("the window expires after FAILURE_BACKOFF_MS", async () => {
    net.resetLifeFetchBackoff();
    const {calls, fetchImpl} = failingFetch();
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK, {fetchImpl, now: now0}));
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK,
        {fetchImpl, now: now0 + net.FAILURE_BACKOFF_MS, timeoutMs: 500}));
    assert.equal(calls.length, 2, "窗满后应恢复尝试");
});

test("a successful fetch invalidates the window opened by an earlier failure", async () => {
    net.resetLifeFetchBackoff();
    const {calls, fetchImpl} = failingFetch();
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK, {fetchImpl, now: now0}));
    let ok = 0;
    const healthy = async () => {
        ok += 1;
        return {ok: true, headers: {get: (name) => (name === "content-length" ? "2" : null)},
            text: async () => "{}"};
    };
    // 手动刷新成功之后，普通的周期刷新不该仍被旧失败记录抑制。
    await net.fetchBoundedLifeJson(URL_OK, {fetchImpl: healthy, now: now0 + 200, force: true});
    await net.fetchBoundedLifeJson(URL_OK, {fetchImpl: healthy, now: now0 + 300, timeoutMs: 500});
    assert.equal(ok, 2, "恢复后端点必须立即可用");
    assert.equal(calls.length, 1, "除造失败的那一次外，失败实现不得再被调用");
});

test("clearing the widget caches also lifts the suppression window", async () => {
    net.resetLifeFetchBackoff();
    const {calls, fetchImpl} = failingFetch();
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK, {fetchImpl, now: now0}));
    net.clearLifeWidgetCaches();
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK,
        {fetchImpl, now: now0 + 10, timeoutMs: 500}), /fetch failed/);
    assert.equal(calls.length, 2, "清缓存后必须重新真实尝试，而不是回抛 backoff");
});

test("gate rejections are not endpoint health signals", async () => {
    net.resetLifeFetchBackoff();
    const {calls, fetchImpl} = failingFetch();
    const hostile = "https://not-whitelisted.example.com/x";
    await assert.rejects(() => net.fetchBoundedLifeJson(hostile, {fetchImpl, now: now0}), /blocked_endpoint/);
    await assert.rejects(() => net.fetchBoundedLifeJson(hostile, {fetchImpl, now: now0 + 1, timeoutMs: 500}),
        /blocked_endpoint/);
    assert.deepEqual(calls, [], "门禁拒绝不得进入抑制窗，也不得触网");
});

test("a cancelled request does not open a window", async () => {
    net.resetLifeFetchBackoff();
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); throw new Error("AbortError: aborted"); };
    const signal = {aborted: true};
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK, {fetchImpl, signal, now: now0}));
    assert.deepEqual(calls, [], "取消的请求不应触网");
    await assert.rejects(() => net.fetchBoundedLifeJson(URL_OK,
        {fetchImpl, signal: {aborted: false}, now: now0 + 1, timeoutMs: 500}));
    assert.equal(calls.length, 1, "调用方取消不应抑制后续真实请求");
});
