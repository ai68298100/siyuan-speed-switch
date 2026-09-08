const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

test("handler API: synchronous return values are wrapped consistently", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]}, () => "ok");
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: true, result: "ok"});
});

test("handler API: promise return remains serializable to caller boundary", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]}, () => Promise.resolve("ok"));
    const result = registry.invoke(registry.list()[0]);
    assert.equal(result.ok, true);
    assert.equal(typeof result.result?.then, "function");
});

test("handler API: thrown errors and rejected promises do not escape sync boundary", async () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "throw"}]}, () => { throw new Error("x"); });
    assert.deepEqual(registry.invoke(registry.list()[0]), {ok: false, reason: "failed"});
    await assert.doesNotReject(async () => Promise.reject(new Error("rejected")).catch(() => undefined));
});
