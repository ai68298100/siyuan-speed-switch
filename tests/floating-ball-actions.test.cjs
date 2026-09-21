const test = require("node:test");
const assert = require("node:assert/strict");
const {createQuickActionRegistry} = require("../src/quick-actions.js");
const {executeFloatingBallAction, createFloatingBallActionExecutor} = require("../src/floating-ball-actions.js");

test("floating action adapter executes builtins and keeps search open", async () => {
    const calls = [];
    const result = await executeFloatingBallAction({kind: "builtin", value: "search"}, {
        close: () => calls.push("close"),
        onSearch: () => { calls.push("search"); },
    });
    assert.deepEqual(result, {ok: true});
    assert.deepEqual(calls, ["search"]);
});

test("floating action adapter closes before switcher/journal/settings", async () => {
    const calls = [];
    for (const value of ["switcher", "journal", "settings"]) {
        const result = await executeFloatingBallAction({kind: "builtin", value}, {
            close: () => calls.push(`close:${value}`),
            onSwitcher: () => calls.push(value),
            onJournal: () => calls.push(value),
            onSettings: () => calls.push(value),
        });
        assert.equal(result.ok, true);
    }
    assert.deepEqual(calls, ["close:switcher", "switcher", "close:journal", "journal", "close:settings", "settings"]);
});

test("floating action adapter invokes local and registry adapters", async () => {
    const calls = [];
    const registry = createQuickActionRegistry();
    registry.register({id: "remote", name: "Remote", actions: [{value: "open"}]}, (action, context) => {
        calls.push([action.value, context.surface]);
        return "registry";
    });
    const local = await executeFloatingBallAction({kind: "adapter", value: "local/open"}, {
        adapters: {local: (payload) => `local:${payload}`},
        close: () => calls.push("close-local"),
    });
    const remote = await executeFloatingBallAction({kind: "adapter", value: "remote/open"}, {
        registry, context: {surface: "floating-ball"}, close: () => calls.push("close-remote"),
    });
    assert.deepEqual(local, {ok: true, result: "local:open"});
    assert.deepEqual(remote, {ok: true, result: "registry"});
    assert.deepEqual(calls, ["close-local", ["remote/open", "floating-ball"], "close-remote"]);
});

test("floating action adapter handles docks and plugin commands safely", async () => {
    let toggled = 0;
    const plugin = {name: "demo", commands: [{langKey: "open", callback() { return "command"; }}]};
    const dock = await executeFloatingBallAction({kind: "dock", value: "outline"}, {
        getDockByType: () => ({toggleModel(type, visible) { assert.equal(type, "outline"); assert.equal(visible, true); toggled++; }}),
    });
    const command = await executeFloatingBallAction({kind: "command", value: "demo::open"}, {plugins: [plugin]});
    assert.deepEqual(dock, {ok: true});
    assert.deepEqual(command, {ok: true, result: "command"});
    assert.equal(toggled, 1);
});

test("floating action adapter never throws on unavailable or failing providers", async () => {
    assert.deepEqual(await executeFloatingBallAction({kind: "builtin", value: "settings"}), {ok: false, reason: "unavailable"});
    assert.deepEqual(await executeFloatingBallAction({kind: "adapter", value: "missing/open"}, {adapters: {}}), {ok: false, reason: "unavailable"});
    assert.deepEqual(await executeFloatingBallAction({kind: "command", value: "demo::open"}, {plugins: [{name: "demo", commands: [{langKey: "open", callback() { throw new Error("boom"); }}]}]}), {ok: false, reason: "failed"});
    const execute = createFloatingBallActionExecutor({onSwitcher: () => "ok"});
    assert.deepEqual(await execute({kind: "builtin", value: "switcher"}), {ok: true, result: "ok"});
    const registry = createQuickActionRegistry();
    registry.register({id: "async", name: "Async", actions: [{value: "run"}]}, () => Promise.reject(new Error("boom")));
    assert.deepEqual(await executeFloatingBallAction({kind: "adapter", value: "async/run"}, {registry}), {ok: false, reason: "failed"});
});
