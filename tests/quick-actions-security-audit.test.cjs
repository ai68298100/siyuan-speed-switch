const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions, createQuickActionRegistry} = require("../src/quick-actions.js");

test("security audit: persisted actions exclude callbacks and non-serializable values", () => {
    const action = {id: "p", kind: "command", value: "p/open", label: "入口", callback: () => "bad", secret: "token"};
    const output = sanitizeQuickActions([action]).items[0];
    assert.equal(Object.prototype.hasOwnProperty.call(output, "callback"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(output, "secret"), false);
    assert.doesNotThrow(() => JSON.stringify(output));
});

test("security audit: registry handler errors do not expose exception objects", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "p", name: "P", actions: [{value: "open"}]}, () => { throw new Error("sensitive"); });
    const result = registry.invoke(registry.list()[0]);
    assert.deepEqual(result, {ok: false, reason: "failed"});
    assert.equal(Object.prototype.hasOwnProperty.call(result, "error"), false);
});

test("security audit: malformed provider metadata cannot expand registry surface", () => {
    const registry = createQuickActionRegistry();
    const result = registry.register({id: "bad id;", name: "Bad", targets: ["desktop", "mobile", "*"], actions: [{value: ""}, null]});
    assert.equal(result.registered, true);
    assert.deepEqual(registry.list(), []);
});
