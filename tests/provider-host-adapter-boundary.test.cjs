const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

async function consume(result) {
    const value = result?.result?.then ? await result.result : result?.result;
    return result?.ok ? {ok: true, value} : {ok: false, reason: result?.reason || "failed"};
}

test("host adapter boundary: sync and async provider results share one consumer shape", async () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "sync", name: "Sync", actions: [{value: "open"}]}, () => "sync");
    registry.register({id: "async", name: "Async", actions: [{value: "open"}]}, () => Promise.resolve("async"));
    assert.deepEqual(await consume(registry.invoke(registry.list()[0])), {ok: true, value: "sync"});
    assert.deepEqual(await consume(registry.invoke(registry.list()[1])), {ok: true, value: "async"});
});

test("host adapter boundary: unavailable and failed results expose stable reasons", async () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "bad", name: "Bad", actions: [{value: "open"}]}, () => { throw new Error("x"); });
    const bad = registry.list()[0];
    assert.deepEqual(await consume(registry.invoke(bad)), {ok: false, reason: "failed"});
    registry.unregister("bad");
    assert.deepEqual(await consume(registry.invoke(bad)), {ok: false, reason: "unavailable"});
});
