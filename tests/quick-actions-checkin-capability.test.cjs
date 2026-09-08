const test = require("node:test");
const assert = require("node:assert/strict");
const {resolveQuickActionSupport, createQuickActionRegistry} = require("../src/quick-actions.js");

test("check-in capability: declared mobile adapter is supported", () => {
    assert.equal(resolveQuickActionSupport("adapter", "checkin/open", "mobile", ["desktop", "mobile"]), "supported");
});

test("check-in capability: undeclared mobile command remains unknown", () => {
    assert.equal(resolveQuickActionSupport("command", "checkin/open", "mobile"), "unknown");
});

test("check-in capability: unavailable command degrades safely on any surface", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "siyuan-checkin", name: "小驴打卡", targets: ["desktop", "sidebar", "mobile"], actions: [{value: "open"}]});
    const candidate = registry.list()[0];
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});
