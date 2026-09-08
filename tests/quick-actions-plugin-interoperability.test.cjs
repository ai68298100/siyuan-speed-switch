const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry, resolveQuickActionSupport} = require("../src/quick-actions.js");

test("plugin interoperability: check-in adapter advertises desktop/sidebar/mobile when declared", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "siyuan-checkin", name: "小驴打卡", targets: ["desktop", "sidebar", "mobile"], actions: [{value: "open", label: "打卡"}]});
    const candidate = registry.list()[0];
    assert.deepEqual(candidate.declaredTargets, ["desktop", "sidebar", "mobile"]);
    assert.equal(resolveQuickActionSupport("adapter", candidate.value, "mobile", candidate.declaredTargets), "supported");
});

test("plugin interoperability: missing plugin degrades to unavailable without blocking UI", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "missing", name: "缺失插件", actions: [{value: "open"}]});
    const candidate = registry.list()[0];
    registry.unregister("missing");
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});

test("plugin interoperability: unload clears all candidates for external plugin", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}, {value: "today"}]});
    assert.equal(registry.list().length, 2);
    registry.unregister("siyuan-checkin");
    assert.deepEqual(registry.list(), []);
});
