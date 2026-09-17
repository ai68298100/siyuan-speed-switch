const {test} = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/home-model.js');
const {readSourceText} = require('./source-scan.cjs');
const model = require('../src/home-store-model.js');

const indexSource = readSourceText('src/index.ts');
const adapterSource = readSourceText('src/home-external-adapters.ts');
const storeUiSource = readSourceText('src/home-store-ui.ts');

test('protocol v2.4 whitelists a structured source field', () => {
    const def = home.normalizeModuleDefinition({
        moduleId: 'demo-widget',
        title: '演示组件',
        source: {pluginId: 'demo-plugin', name: '演示插件', icon: 'iconPlugin', version: '1.2.3', collection: '打卡', order: 2},
    });
    assert.deepEqual(def.source, {
        pluginId: 'demo-plugin',
        name: '演示插件',
        icon: 'iconPlugin',
        version: '1.2.3',
        homepage: '',
        collection: '打卡',
        order: 2,
    });
});

test('source is dropped when it carries no identity', () => {
    assert.equal(home.normalizeModuleDefinition({moduleId: 'a', title: 'A', source: {}}).source, null);
    assert.equal(home.normalizeModuleDefinition({moduleId: 'b', title: 'B'}).source, null);
});

test('source name alone still yields a usable identity', () => {
    const def = home.normalizeModuleDefinition({moduleId: 'c', title: 'C', source: {name: '只有名字'}});
    assert.equal(def.source.pluginId, '只有名字');
    assert.equal(def.source.name, '只有名字');
});

test('source plugin id is sanitized and order is bounded', () => {
    const def = home.normalizeModuleDefinition({moduleId: 'd', title: 'D', source: {pluginId: 'bad id!$', order: 9999}});
    assert.equal(def.source.pluginId, 'badid');
    assert.equal(def.source.order, 999);
});

test('non-object source is rejected', () => {
    assert.equal(home.normalizeModuleDefinition({moduleId: 'e', title: 'E', source: 'nope'}).source, null);
});

test('public registration boundary accepts source metadata', () => {
    assert.match(indexSource, /source\?: \{pluginId\?: string; name\?: string; icon\?: string; version\?: string; homepage\?: string; collection\?: string; order\?: number\}/);
});

test('builtin adapter registration forwards source to the runtime', () => {
    assert.match(indexSource, /\.\.\.\(source \? \{source\} : \{\}\),/);
});

test('external adapter register signature carries the source slot', () => {
    assert.match(adapterSource, /source\?: \{pluginId\?: string; name\?: string; icon\?: string; version\?: string; homepage\?: string; collection\?: string; order\?: number\},\s*\n\s*\) => void;/);
});

test('store grouping prefers source over functional groups', () => {
    assert.match(storeUiSource, /if \(source\.kind === "plugin"\) return source\.label;/);
});

test('store group heading reports added progress', () => {
    assert.match(storeUiSource, /homeStoreGroupAdded/);
});

test('store group heading offers whole-group selection', () => {
    assert.match(storeUiSource, /homeStoreSelectGroup/);
    assert.match(storeUiSource, /homeStoreClearGroup/);
});

test('pending section aggregates by provider plugin', () => {
    assert.match(storeUiSource, /buildHomeStoreProviderGroups\(pending\)/);
    assert.match(storeUiSource, /homeStoreProviderGroup/);
});

test('all six checkin bridge widgets declare the same source', () => {
    const defs = home.registerModules([]).filter((item) => item.moduleId.startsWith('checkin-') && item.moduleId !== 'checkin-summary');
    assert.equal(defs.length, 6);
    defs.forEach((def) => {
        assert.equal(def.source.pluginId, 'siyuan-checkin', `${def.moduleId} 来源插件须一致`);
        assert.equal(def.source.name, '小驴打卡');
        assert.equal(def.availability, 'external');
    });
});

test('checkin bridge widgets keep a stable in-suite order', () => {
    const defs = home.registerModules([]).filter((item) => item.moduleId.startsWith('checkin-') && item.moduleId !== 'checkin-summary');
    assert.deepEqual(defs.map((def) => def.source.order), [1, 2, 3, 4, 5, 6]);
});

test('checkin bridge widgets are dependency-tagged in the store', () => {
    home.registerModules([])
        .filter((item) => item.moduleId.startsWith('checkin-') && item.moduleId !== 'checkin-summary')
        .forEach((def) => {
            const info = model.resolveHomeStoreDependencyInfo(def.moduleId);
            assert.equal(info.kind, 'plugin', `${def.moduleId} 依赖须为插件类`);
            assert.equal(info.required, true);
            assert.match(info.setup, /协议/);
        });
});

test('checkin bridge widgets report a local bridge integration', () => {
    home.registerModules([])
        .filter((item) => item.moduleId.startsWith('checkin-') && item.moduleId !== 'checkin-summary')
        .forEach((def) => {
            const info = model.resolveHomeStoreSourceInfo(def.moduleId);
            assert.equal(info.providerName, '小驴打卡');
            assert.equal(info.integration, 'local-bridge');
            assert.equal(info.privacy, 'local-only');
        });
});

test('heatmap bridge widget reuses the renderer view type', () => {
    const def = home.registerModules([]).find((item) => item.moduleId === 'checkin-year-heatmap');
    assert.equal(def.viewType, 'heatmap');
});
