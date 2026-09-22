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
test("component panel uses the shared builtin executor and preserves unavailable failures", async () => {
    const {executeFloatingBallAction} = require("../src/floating-ball-actions.js");
    const events = [];
    const action = {kind: "builtin", value: "home"};
    assert.deepEqual(await executeFloatingBallAction(action, {close: () => events.push("close"), onHome: () => { events.push("home"); }}), {ok: true});
    assert.deepEqual(events, ["close", "home"]);
    assert.deepEqual(await executeFloatingBallAction(action), {ok: false, reason: "unavailable"});
});

test("floating action executor dispatches host commands through the bridge", async () => {
    const calls = [];
    const result = await executeFloatingBallAction({kind: "global", value: "riffCard"}, {
        close: () => calls.push("close"),
        onGlobalCommand: (action) => { calls.push(`global:${action.command}`); },
    });
    assert.deepEqual(result, {ok: true});
    assert.deepEqual(calls, ["close", "global:riffCard"]);
});

test("floating action executor reports unavailable when the host bridge is missing", async () => {
    const calls = [];
    const missing = await executeFloatingBallAction({kind: "global", value: "outline"}, {});
    assert.deepEqual(missing, {ok: false, reason: "unavailable"}, "no bridge callback means unavailable");
    const declined = await executeFloatingBallAction({kind: "global", value: "outline"}, {
        onGlobalCommand: () => ({ok: false, reason: "unavailable"}),
    });
    assert.deepEqual(declined, {ok: false, reason: "unavailable"},
        "pre-3.8.3 hosts decline through the callback and surface as unavailable");
    const result = await executeFloatingBallAction({kind: "global", value: "outline"}, {
        onGlobalCommand: () => { calls.push("ran"); },
    });
    assert.deepEqual(result, {ok: true});
    assert.deepEqual(calls, ["ran"]);
});

test("floating action executor dispatches sync-now and reports unavailable without the host hook", async () => {
    const calls = [];
    const ok = await executeFloatingBallAction({kind: "builtin", value: "sync-now"}, {
        close: () => calls.push("close"),
        onSyncNow: async () => { calls.push("sync"); },
    });
    assert.deepEqual(ok, {ok: true});
    const missing = await executeFloatingBallAction({kind: "builtin", value: "sync-now"}, {});
    assert.deepEqual(missing, {ok: false, reason: "unavailable"});
    assert.deepEqual(calls, ["close", "sync"]);
});

test("floating action executor dispatches insert-template to the host picker", async () => {
    const calls = [];
    const ok = await executeFloatingBallAction({kind: "builtin", value: "insert-template"}, {
        close: () => calls.push("close"),
        onInsertTemplate: async () => { calls.push("picker"); },
    });
    assert.deepEqual(ok, {ok: true});
    const missing = await executeFloatingBallAction({kind: "builtin", value: "insert-template"}, {});
    assert.deepEqual(missing, {ok: false, reason: "unavailable"});
    assert.deepEqual(calls, ["close", "picker"]);
});

test("floating action executor dispatches document set cycling to the host", async () => {
    const calls = [];
    const ok = await executeFloatingBallAction({kind: "builtin", value: "cycle-doc-set"}, {
        close: () => calls.push("close"),
        onCycleDocSet: async () => { calls.push("cycle"); },
    });
    assert.deepEqual(ok, {ok: true});
    const missing = await executeFloatingBallAction({kind: "builtin", value: "cycle-doc-set"}, {});
    assert.deepEqual(missing, {ok: false, reason: "unavailable"});
    assert.deepEqual(calls, ["close", "cycle"]);
});

test("floating action executor dispatches window-throw and keyboard-dismiss to the host", async () => {
    const calls = [];
    const okThrow = await executeFloatingBallAction({kind: "builtin", value: "throw-window"}, {
        close: () => calls.push("close:throw"),
        onThrowToWindow: () => { calls.push("throw"); },
    });
    assert.deepEqual(okThrow, {ok: true});
    const okHide = await executeFloatingBallAction({kind: "builtin", value: "hide-keyboard"}, {
        close: () => calls.push("close:hide"),
        onHideKeyboard: () => { calls.push("hide"); },
    });
    assert.deepEqual(okHide, {ok: true});
    assert.deepEqual(calls, ["close:throw", "throw", "close:hide", "hide"]);
    const missing = await executeFloatingBallAction({kind: "builtin", value: "throw-window"}, {});
    assert.deepEqual(missing, {ok: false, reason: "unavailable"});
});

test("floating action executor dispatches jump back/forward to the host", async () => {
    const calls = [];
    const okBack = await executeFloatingBallAction({kind: "builtin", value: "jump-back"}, {
        onJumpBack: () => { calls.push("back"); },
    });
    assert.deepEqual(okBack, {ok: true});
    const okForward = await executeFloatingBallAction({kind: "builtin", value: "jump-forward"}, {
        onJumpForward: () => { calls.push("forward"); },
    });
    assert.deepEqual(okForward, {ok: true});
    const noBack = await executeFloatingBallAction({kind: "builtin", value: "jump-back"}, {
        onJumpBack: () => ({ok: false, reason: "unavailable"}),
    });
    assert.deepEqual(noBack, {ok: true, result: {ok: false, reason: "unavailable"}},
        "the host answers the empty-stack case; the executor forwards its verdict");
    assert.deepEqual(calls, ["back", "forward"]);
});
