const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

function resolveCommand(commands, aliases) {
    return aliases.find((alias) => typeof commands[alias] === "function") || null;
}

test("check-in mapping: resolves first available command alias", () => {
    assert.equal(resolveCommand({"checkin/open": () => "ok"}, ["checkin/open", "open"]), "checkin/open");
    assert.equal(resolveCommand({open: () => "ok"}, ["checkin/open", "open"]), "open");
});

test("check-in mapping: missing command remains unavailable without throwing", () => {
    const registry = createQuickActionRegistry();
    registry.register({id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "checkin/open"}]});
    const candidate = registry.list()[0];
    assert.deepEqual(registry.invoke(candidate), {ok: false, reason: "unavailable"});
});

test("check-in mapping: plugin version replacement removes stale command handler", () => {
    const registry = createQuickActionRegistry();
    const provider = {id: "siyuan-checkin", name: "小驴打卡", actions: [{value: "open"}]};
    registry.register(provider, () => "v1");
    const old = registry.list()[0];
    registry.unregister("siyuan-checkin");
    registry.register(provider, () => "v2");
    assert.deepEqual(registry.invoke(old), {ok: true, result: "v2"});
});
