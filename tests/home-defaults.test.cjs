const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {readSourceFile} = require('./source-scan.cjs');
const {normalizeHomeState, migrateHomeState, DEFAULT_MODULES, resolveHomeTileDefaultSize,
    prepareHomeDefaultState, resolveHomeStarterSize, HOME_DEFAULT_MODULE_IDS} = require('../src/home-model.js');

const expectedIds = ['recent-documents', 'favorites', 'today-journal', 'today-tasks',
    'external-local-time', 'year-progress', 'note-stats'];
const available = new Set(DEFAULT_MODULES.map((item) => item.moduleId));
function oldDefaults() {
    return normalizeHomeState({schemaVersion: 1,
        instances: expectedIds.slice(0, 4).map((id) => ({instanceId: id, moduleId: id, enabled: true, config: {}})),
        layouts: {desktop: [
            {instanceId: 'recent-documents', x: 0, y: 0, w: 8, h: 3, size: 'wide'},
            {instanceId: 'favorites', x: 8, y: 0, w: 4, h: 3, size: 'small'},
            {instanceId: 'today-journal', x: 0, y: 3, w: 4, h: 3, size: 'small'},
            {instanceId: 'today-tasks', x: 4, y: 3, w: 4, h: 3, size: 'small'},
        ]}});
}
const prepare = (state, device = 'desktop') => prepareHomeDefaultState(state, device, available);

test('new home shows seven usable local components in three compact rows', () => {
    const initial = normalizeHomeState(undefined);
    const {state, changed} = prepare(initial);
    assert.equal(changed, true);
    assert.equal(initial.instances.length, 0, 'preparation must not mutate its input');
    assert.deepEqual(state.instances.map((item) => item.moduleId), expectedIds);
    assert.equal(state.defaultsVersion, 2);
    assert.deepEqual(state.layouts.desktop.map(({x, y, w, h}) => [x, y, w, h]), [
        [0, 0, 8, 3], [8, 0, 4, 3], [0, 3, 4, 3], [4, 3, 4, 3], [8, 3, 4, 3], [0, 6, 4, 3], [4, 6, 8, 3],
    ]);
    assert.deepEqual(state.instances[4].config, {showSeconds: '否'});
    for (const instance of state.instances) {
        const definition = DEFAULT_MODULES.find((item) => item.moduleId === instance.moduleId);
        assert.ok(definition, instance.moduleId);
        assert.notEqual(definition.availability, 'external', 'starter must not need an external service');
        assert.ok(definition.sizes.includes(state.layouts.desktop.find((entry) => entry.instanceId === instance.instanceId).size));
    }
});

test('original complete four cards gain three additions without moving existing cards', () => {
    const original = oldDefaults();
    const before = JSON.stringify(original);
    const {state} = prepare(original);
    assert.deepEqual(state.instances.map((item) => item.moduleId), expectedIds);
    assert.deepEqual(state.instances.slice(0, 4), original.instances);
    assert.deepEqual(state.layouts.desktop.slice(0, 4), original.layouts.desktop);
    assert.deepEqual(state.layouts.desktop.slice(4).map(({x, y, w, h}) => [x, y, w, h]), [[8, 3, 4, 3], [0, 6, 4, 3], [4, 6, 8, 3]]);
    assert.equal(JSON.stringify(original), before);
});

test('edited, disabled, configured, reordered and cross-device layouts stay intact', () => {
    const mutations = [
        (state) => { state.instances[0].config.limit = 3; },
        (state) => { state.instances[0].enabled = false; },
        (state) => { state.instances.reverse(); },
        (state) => { state.layouts.desktop.reverse(); },
        (state) => { state.layouts.desktop[0].x = 1; },
        (state) => { state.layouts.desktop[0].w = 4; state.layouts.desktop[0].size = 'small'; },
        (state) => { state.layouts.desktop[0].collapsed = true; },
        (state) => { state.layouts.sidebar = [{...state.layouts.desktop[0]}]; },
        (state) => { state.layouts.desktop = []; },
    ];
    mutations.forEach((mutate, index) => {
        const original = oldDefaults();
        mutate(original);
        const next = prepare(original).state;
        assert.deepEqual(next.instances, original.instances, `case ${index}: instances`);
        assert.deepEqual(next.layouts, original.layouts, `case ${index}: layouts`);
        assert.equal(next.defaultsVersion, 2, 'a skipped layout is marked processed once');
    });
});

test('removed cards and explicitly saved empty workbenches never reappear automatically', () => {
    const original = oldDefaults();
    original.instances.pop();
    original.layouts.desktop.pop();
    assert.equal(prepare(original).state.instances.length, 3);
    const empty = prepare(normalizeHomeState({instances: [], layouts: {desktop: []}})).state;
    assert.equal(empty.instances.length, 0);
    assert.deepEqual(empty.layouts.desktop, []);
    assert.equal(prepare(normalizeHomeState(empty)).changed, false);
});

test('reopening or deleting all newly seeded cards does not seed twice', () => {
    const first = prepare(normalizeHomeState()).state;
    assert.equal(prepare(normalizeHomeState(first)).changed, false);
    const emptied = normalizeHomeState({...first, instances: [], layouts: {desktop: []}});
    const second = prepare(emptied);
    assert.equal(second.changed, false);
    assert.equal(second.state.instances.length, 0);
});

test('a missing catalog waits without consuming first-open initialization', () => {
    const initial = normalizeHomeState();
    const waiting = prepareHomeDefaultState(initial, 'desktop', new Set());
    assert.equal(waiting.changed, false);
    assert.equal(waiting.state.defaultsVersion, 0);
    assert.equal(prepare(waiting.state).state.instances.length, 7);
});

test('mobile initializes separately and existing desktop widgets do not populate an empty mobile layout', () => {
    const fresh = prepare(normalizeHomeState(), 'mobile').state;
    assert.equal(fresh.instances.length, 7);
    assert.deepEqual(fresh.layouts.desktop, []);
    assert.ok(fresh.layouts.mobile.every((entry) => entry.x === 0 && entry.w === 12));
    const original = oldDefaults();
    const mobile = prepare(original, 'mobile').state;
    assert.deepEqual(mobile.instances, original.instances);
    assert.deepEqual(mobile.layouts, original.layouts);
});

test('opening mobile first does not consume a pending desktop upgrade', () => {
    const mobile = prepare(oldDefaults(), 'mobile');
    assert.equal(mobile.changed, false);
    assert.equal(mobile.state.defaultsVersion, 1);
    assert.equal(prepare(normalizeHomeState(mobile.state)).state.instances.length, 7);
    const customizedMobile = {...mobile.state, layouts: {...mobile.state.layouts,
        mobile: [{...mobile.state.layouts.desktop[0], x: 0, w: 12}]}};
    assert.equal(prepare(normalizeHomeState(customizedMobile)).state.instances.length, 4,
        'a subsequently customized device layout still blocks automatic upgrade');
});

test('initialization version survives normalization and legacy migration', () => {
    const first = prepare(normalizeHomeState()).state;
    assert.equal(normalizeHomeState(first).defaultsVersion, 2);
    assert.equal(migrateHomeState(first).defaultsVersion, 2);
    assert.equal(normalizeHomeState({defaultsVersion: 99}).defaultsVersion, 99, 'future versions are not downgraded');
    assert.equal(normalizeHomeState({defaultsVersion: -1}).defaultsVersion, 1);
});

// 执行真实宿主读/写/删除方法，验证布局历史丢失元数据时也保留初始化意图。
const indexSource = ts.createSourceFile('index.ts', readSourceFile('src/index.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const pluginClass = indexSource.statements.find(ts.isClassDeclaration);
const methodNames = ['getHomeState', 'saveHomeState', 'removeHomeInstance'];
const methods = methodNames.map((name) => {
    const method = pluginClass.members.find((member) => member.name?.getText(indexSource) === name);
    assert.ok(method, `actual host method ${name}`);
    return method.getText(indexSource);
});
const Host = new Function('HOME_STATE_KEY', 'normalizeHomeState', ts.transpileModule(`class Host {${methods.join('\n')}} return Host;`,
    {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText)('sw_home_state', normalizeHomeState);

const panelAst = ts.createSourceFile('second-panel-ui.ts', readSourceFile('src/second-panel-ui.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function findDeclaration(ast, name) {
    let found;
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node;
        else ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(found, `actual declaration ${name}`);
    return found;
}
const constantsAst = ts.createSourceFile('constants.ts', readSourceFile('src/constants.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const widgetSizes = new Function(`return (${findDeclaration(constantsAst, 'HOME_WIDGET_SIZES').initializer.getText(constantsAst)});`)();
const restoreFactory = new Function('defs', 'device', 'EMPTY_WORKBENCH_DEFAULT_IDS', 'resolveHomeTileDefaultSize',
    'resolveHomeStarterSize', 'HOME_WIDGET_SIZES', 'showMessage', 'confirm', 'prepareLayoutMutation', 'commitLayoutMutation', 'renderPanel',
    ts.transpileModule(`return function () {let layoutOpLabel = '';
        const getDefaultRestorePlan = ${findDeclaration(panelAst, 'getDefaultRestorePlan').initializer.getText(panelAst)};
        const restoreDefaultComponents = ${findDeclaration(panelAst, 'restoreDefaultComponents').initializer.getText(panelAst)};
        return restoreDefaultComponents;};`, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText);

function restoreHost(state, confirmed = true) {
    const host = new Host();
    const calls = {save: 0, history: 0, render: 0, messages: []};
    host.data = {sw_home_state: state};
    host.homeThirdPartyIds = new Set();
    host.i18n = {homeEmptyRestoreNothing: 'nothing', homeEmptyRestoreConfirm: '{count}/{existing}', homeHistoryUpdate: 'restore'};
    host.saveDataDebounced = () => { calls.save += 1; };
    const action = restoreFactory(new Map(DEFAULT_MODULES.map((item) => [item.moduleId, item])), 'desktop', HOME_DEFAULT_MODULE_IDS,
        resolveHomeTileDefaultSize, resolveHomeStarterSize, widgetSizes, (message) => calls.messages.push(message),
        () => confirmed, () => {}, () => { calls.history += 1; }, () => { calls.render += 1; }).call(host);
    return {host, calls, action};
}

test('explicit restore executes the real panel action and matches all seven starter sizes', () => {
    const {host, calls, action} = restoreHost(normalizeHomeState({defaultsVersion: 2, instances: [], layouts: {}}));
    action();
    const restored = host.getHomeState();
    const initial = prepare(normalizeHomeState()).state;
    assert.deepEqual(restored.instances.map((item) => item.moduleId), expectedIds);
    assert.deepEqual(restored.layouts.desktop.map(({size, w, h}) => [size, w, h]),
        initial.layouts.desktop.map(({size, w, h}) => [size, w, h]));
    assert.equal(calls.save, 1);
    assert.equal(calls.history, 1);
    assert.equal(calls.render, 1);
    action();
    assert.equal(calls.save, 1, 'already restored cards are not duplicated');
    assert.deepEqual(calls.messages, ['nothing']);
});

test('explicit restore preserves existing custom cards and reuses configured instances on missing layouts', () => {
    const initial = normalizeHomeState({defaultsVersion: 2, instances: [
        {moduleId: 'external-local-time', instanceId: 'my-clock', enabled: true, config: {showSeconds: '是'}},
        {moduleId: 'note-stats', instanceId: 'my-stats', enabled: false, config: {days: 30, primaryMetric: '估算字数'}},
    ], layouts: {desktop: [{instanceId: 'my-clock', x: 2, y: 5, w: 4, h: 4, size: 'medium', collapsed: true}],
        sidebar: [{instanceId: 'my-stats', x: 1, y: 4, w: 4, h: 4, size: 'medium'}]}});
    const {host, action} = restoreHost(initial);
    action();
    const restored = host.getHomeState();
    assert.deepEqual(restored.instances.slice(0, 2), initial.instances);
    assert.deepEqual(restored.layouts.desktop[0], initial.layouts.desktop[0]);
    assert.deepEqual(restored.layouts.sidebar, initial.layouts.sidebar);
    assert.equal(restored.instances.length, 7, 'configured stats instance must be reused');
    assert.deepEqual(restored.layouts.desktop.find((entry) => entry.instanceId === 'my-stats'),
        {instanceId: 'my-stats', x: 0, y: 0, w: 8, h: 3, size: 'wide', collapsed: false});
});

test('cancelling explicit restore leaves saved layout and history untouched', () => {
    const initial = oldDefaults();
    const {host, calls, action} = restoreHost(initial, false);
    action();
    assert.deepEqual(host.data.sw_home_state, initial);
    assert.equal(calls.save, 0);
    assert.equal(calls.history, 0);
    assert.equal(calls.render, 0);
});

test('host save and removal retain initialization through deletion and metadata-free history', () => {
    const host = new Host();
    host.data = {};
    host.homeThirdPartyIds = new Set();
    host.saveDataDebounced = () => {};
    host.saveHomeState(prepare(host.getHomeState()).state);
    for (const id of expectedIds) host.removeHomeInstance(id);
    assert.equal(host.getHomeState().instances.length, 0);
    assert.equal(host.getHomeState().defaultsVersion, 2);
    host.saveHomeState({schemaVersion: 1, instances: [], layouts: {desktop: []}});
    assert.equal(host.getHomeState().defaultsVersion, 2);
    assert.equal(prepare(host.getHomeState()).changed, false);
    host.data.sw_home_state.defaultsVersion = 'invalid';
    host.saveHomeState({...host.getHomeState(), defaultsVersion: 2});
    assert.equal(host.getHomeState().defaultsVersion, 2, 'invalid stored markers cannot poison the saved version');
});

test('workbench prepares persisted defaults before building component cells', () => {
    const source = readSourceFile('src/second-panel-ui.ts');
    assert.ok(source.includes('const defaults = prepareHomeDefaultState(this.getHomeState(), device, catalogIds);'));
    assert.ok(source.includes('if (defaults.changed) this.saveHomeState(defaults.state);'));
    assert.ok(source.includes('const state = defaults.state;'));
    assert.equal(source.includes('state.instances.length === 0 && !editing'), false, 'empty saved state must not trigger the removed seed path');
});
