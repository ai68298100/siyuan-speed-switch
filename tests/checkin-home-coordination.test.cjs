const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

function createHomeRegistry() {
    const modules = new Map();
    return {
        register(id, module) { modules.set(id, module); },
        unregister(id) { modules.delete(id); },
        list() { return [...modules.values()]; },
    };
}

test("coordination: check-in quick entry and home module can load together", () => {
    const quick = createQuickActionRegistry();
    const home = createHomeRegistry();
    quick.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]});
    home.register("checkin-summary", {providerId: "siyuan-checkin", readOnly: true});
    assert.equal(quick.list().length, 1);
    assert.equal(home.list().length, 1);
});

test("coordination: unloading provider clears both surfaces independently", () => {
    const quick = createQuickActionRegistry();
    const home = createHomeRegistry();
    quick.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]});
    home.register("checkin-summary", {providerId: "siyuan-checkin", readOnly: true});
    quick.unregister("siyuan-checkin");
    home.unregister("checkin-summary");
    assert.deepEqual(quick.list(), []);
    assert.deepEqual(home.list(), []);
});

test("coordination: quick provider failure does not mutate home module state", () => {
    const quick = createQuickActionRegistry();
    const home = createHomeRegistry();
    quick.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]}, () => { throw new Error("offline"); });
    home.register("checkin-summary", {providerId: "siyuan-checkin", readOnly: true});
    assert.equal(quick.invoke(quick.list()[0]).ok, false);
    assert.deepEqual(home.list()[0], {providerId: "siyuan-checkin", readOnly: true});
});
