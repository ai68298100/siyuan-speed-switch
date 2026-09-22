const test = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const ts = require("typescript");
const quick = require("../src/quick-actions.js");
const model = require("../src/floating-ball-model.js");
const {executeFloatingBallAction} = require("../src/floating-ball-actions.js");
const {normalizeQuickActionText} = require("../src/util.js");
const i18n = require("../src/i18n/zh-CN.json");

const providerName = "siyuan-plugin-task-horizon";
const commandKey = "openTaskHorizon";
const value = `${providerName}::${commandKey}`;
function provider(targets = ["desktop", "sidebar", "mobile"]) {
    return {
        name: providerName, displayName: "Task Horizon",
        getQuickActionCapabilities() { return {version: 1, commands: {[commandKey]: targets}}; },
        commands: [{langKey: commandKey, langText: "打开任务管理器", icon: "iconTaskHorizon", callback() { return this.name === providerName; }}],
    };
}
const plugin = provider();
const action = {id: "saved-task", kind: "command", value, enabled: true, targets: ["mobile"]};

function loadModule(file, target, replacement) {
    const filename = require.resolve(file);
    const source = readFileSync(filename, "utf8");
    assert.equal(source.split(target).length - 1, 1, `unique production mutation: ${target}`);
    const module = {exports: {}};
    new Function("require", "module", "exports", source.replace(target, replacement))(createRequire(filename), module, module.exports);
    return module.exports;
}

function assertDeclaredTargets(read = quick.getQuickActionCommandTargets) {
    assert.deepEqual(read([plugin], value), ["desktop", "sidebar", "mobile"], "live command capability must be discovered");
    const copy = read([plugin], value);
    copy.length = 0;
    assert.equal(read([plugin], value).length, 3);
    const future = {...plugin, getQuickActionCapabilities: () => ({version: 2, commands: {[commandKey]: ["mobile"]}})};
    assert.equal(read([future], value), undefined, "unknown metadata version must remain unknown");
}
test("command capabilities read live versioned metadata without retaining mutable arrays", () => { assertDeclaredTargets(); });

test("missing, malformed, inherited and throwing declarations stay unknown", () => {
    const read = quick.getQuickActionCommandTargets;
    for (const metadata of [null, {}, {version: 1}, {version: 1, commands: {[commandKey]: "mobile"}},
        {version: 1, commands: Object.create({[commandKey]: ["mobile"]})}]) {
        assert.equal(read([{...plugin, getQuickActionCapabilities: () => metadata}], value), undefined);
    }
    assert.equal(read([{...plugin, getQuickActionCapabilities() { throw new Error("provider unavailable"); }}], value), undefined);
    assert.equal(read([{...plugin, getQuickActionCapabilities: undefined}], value), undefined);
    assert.equal(read([], value), undefined);
    assert.equal(read([plugin], "invalid"), undefined);
    assert.deepEqual(read([provider(["mobile", "invalid", "mobile"])], value), ["mobile"]);
    assert.deepEqual(read([provider([])], value), []);
});

function assertPlacementIsNotCapability(resolve = model.resolveFloatingActionAvailability) {
    assert.equal(resolve(action, "mobile").status, "unknown", "saved mobile placement must not imply mobile capability");
    assert.equal(resolve({...action, mobileOverride: true}, "mobile").status, "supported");
    assert.equal(resolve({...action, declaredTargets: ["desktop"], mobileOverride: true}, "mobile").status, "unsupported");
    assert.equal(resolve({...action, declaredTargets: ["mobile"]}, "mobile").status, "supported");
}
test("mobile placement and manual opt-in stay separate from provider capability", () => { assertPlacementIsNotCapability(); });

// Compile actual host members using AST boundaries; this checks the wiring from
// live plugins through picker/catalog/support, not an imitation of the host.
function host(transform = (text) => text) {
    const source = readFileSync(require.resolve("../src/index.ts"), "utf8");
    const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const klass = file.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "SpeedSwitchPlugin");
    const names = ["getPluginCommands", "getQuickActionDeclaredTargets", "getQuickActionSupport", "getQuickActionPickerCandidates", "getFloatingBallActions", "hostCommandsAvailable"];
    const methods = names.map((name) => {
        const members = klass.members.filter((node) => ts.isMethodDeclaration(node) && node.name?.getText(file) === name);
        assert.equal(members.length, 1);
        return members[0].getText(file);
    }).join("\n");
    const compiled = ts.transpileModule(transform(`class Host {${methods}}`), {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
    const deps = {...quick, normalizeQuickActionText};
    const Host = new Function(...Object.keys(deps), `${compiled}; return Host;`)(...Object.values(deps));
    return Object.assign(new Host(), {
        name: "siyuan-speed-switch", app: {plugins: [plugin]}, i18n,
        quickActionRegistry: quick.createQuickActionRegistry(), quickActionProviders: new Map(),
        quickActionAdapters: new Map(), quickActionAdapterTargets: new Map(),
        getDockPanels: () => [], getDockByType: () => null, getQuickActions: () => [],
    });
}

function assertHostWiring(transform) {
    const instance = host(transform);
    const candidate = instance.getQuickActionPickerCandidates([]).find((item) => item.action.value === value);
    assert.ok(candidate, "registered command must be discoverable");
    assert.ok(candidate.action.targets.includes("mobile"), "picker must offer the declared mobile target");
    assert.ok(candidate.secondary.includes(i18n.quickMobile));
    assert.ok(!candidate.secondary.includes(i18n.quickMobileUnknown));
    const saved = {...candidate.action, id: action.id, targets: ["desktop"], label: "我的任务", icon: "✅"};
    instance.getQuickActions = () => [saved];
    const config = {actions: {mobile: [{actionId: saved.id, enabled: true, firstLayer: true}]}};
    const catalog = instance.getFloatingBallActions();
    assert.equal(catalog.filter((item) => item.value === value).length, 1, "existing saved commands must not be duplicated");
    assert.equal(catalog.find((item) => item.value === value).label, "我的任务");
    assert.equal(model.selectFloatingBallFirstLayer(config, "mobile", catalog)[0].id, saved.id,
        "catalog must carry live capability to the floating ball");
    assert.equal(instance.getQuickActionSupport(saved, "mobile"), "supported");
    instance.app.plugins = [];
    assert.equal(instance.getFloatingBallActions().find((item) => item.id === saved.id).available, false);
    assert.equal(model.selectFloatingBallFirstLayer(config, "mobile", instance.getFloatingBallActions())[0].id, "switcher");
    instance.app.plugins = [provider(["desktop"])];
    assert.equal(instance.getQuickActionSupport(saved, "mobile"), "unsupported", "replacement provider capability must be rediscovered");
    instance.app.plugins = [{...plugin, getQuickActionCapabilities: undefined}];
    assert.equal(instance.getQuickActionSupport(saved, "mobile"), "unknown");
}
test("real host wires capabilities into the picker, saved catalog and mobile first layer", () => { assertHostWiring(); });

test("executor rechecks the live provider, preserves receiver and respects mobile opt-in", async () => {
    const app = {plugins: [plugin]};
    const options = {app, context: {surface: "floating-ball:mobile"}};
    assert.equal((await executeFloatingBallAction(action, options)).ok, true);
    app.plugins = [];
    assert.deepEqual(await executeFloatingBallAction(action, options), {ok: false, reason: "unavailable"});
    let called = 0;
    const replacement = provider(["desktop"]);
    replacement.commands[0].callback = () => { called += 1; return true; };
    app.plugins = [replacement];
    assert.equal((await executeFloatingBallAction({...action, mobileOverride: true}, options)).ok, false);
    assert.equal(called, 0, "unsupported cannot be opted into");
    delete replacement.getQuickActionCapabilities;
    assert.equal((await executeFloatingBallAction(action, options)).ok, false);
    assert.equal((await executeFloatingBallAction({...action, mobileOverride: true}, options)).ok, true);
    assert.equal(called, 1);
});

async function assertFailureResults(execute = executeFloatingBallAction) {
    for (const callback of [() => false, async () => ({ok: false}), async () => { throw new Error("failed"); }]) {
        const failing = provider();
        failing.commands[0].callback = callback;
        assert.deepEqual(await execute(action, {plugins: [failing], context: {surface: "mobile"}}),
            {ok: false, reason: "failed"}, "provider failure must not be reported as success");
    }
}
test("executor reports provider false, negative result and rejection as failure", async () => { await assertFailureResults(); });

test("a stuck command times out and a late rejection stays handled", async () => {
    const stalled = provider();
    let reject;
    stalled.commands[0].callback = () => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; });
    assert.deepEqual(await executeFloatingBallAction(action, {plugins: [stalled], commandTimeoutMs: 5}), {ok: false, reason: "failed"});
    reject(new Error("late rejection"));
    await new Promise(setImmediate);
});

test("negative mutations fail capability version, saved placement and host wiring contracts", () => {
    const badVersion = loadModule("../src/quick-actions.js", 'metadata?.version !== 1', 'false');
    assert.throws(() => assertDeclaredTargets(badVersion.getQuickActionCommandTargets),
        (error) => error instanceof assert.AssertionError && error.message.includes("unknown metadata version must remain unknown"));
    const badPlacement = loadModule("../src/floating-ball-model.js", 'action.kind === "command" ? action.declaredTargets', 'action.kind === "command" ? action.targets');
    assert.throws(() => assertPlacementIsNotCapability(badPlacement.resolveFloatingActionAvailability),
        (error) => error instanceof assert.AssertionError && error.message.includes("saved mobile placement must not imply mobile capability"));
    const target = 'return getQuickActionCommandTargets(plugins, action.value) as QuickActionTarget[] | undefined;';
    assert.throws(() => assertHostWiring((source) => {
        assert.equal(source.split(target).length - 1, 1);
        return source.replace(target, 'return undefined;');
    }), (error) => error instanceof assert.AssertionError && error.message.includes("picker must offer the declared mobile target"));
});

test("negative mutation catches swallowed command failure", async () => {
    const mutant = loadModule("../src/floating-ball-actions.js", 'if (result === false || result?.ok === false) return failed();', '');
    await assert.rejects(() => assertFailureResults(mutant.executeFloatingBallAction),
        (error) => error instanceof assert.AssertionError && error.message.includes("provider failure must not be reported as success"));
});
