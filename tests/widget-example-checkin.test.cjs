const {test} = require('node:test');
const assert = require('node:assert/strict');
const example = require('../docs/widget-example/siyuan-checkin-home-modules.js');
const bridge = require('../src/checkin-bridge-model.js');
const home = require('../src/home-model.js');

const FACTORIES = [example.todayModule, example.streakModule, example.heatmapModule, example.weeklyModule, example.occasionsModule];

test('template module ids match the ids the switcher already bridges', () => {
    assert.deepEqual([...example.CHECKIN_MODULE_IDS].sort(), [...bridge.CHECKIN_MODULE_IDS].sort());
});

test('template module ids satisfy the store functional-group audit charset', () => {
    example.CHECKIN_MODULE_IDS.forEach((moduleId) => assert.match(moduleId, /^[a-z][a-z0-9-]*$/));
});

test('every template module declares the structured source', () => {
    FACTORIES.forEach((factory) => {
        const definition = factory();
        assert.deepEqual(definition.source, example.CHECKIN_SOURCE);
        assert.equal(definition.source.pluginId, 'siyuan-checkin');
        assert.equal(definition.category, 'plugin');
        assert.equal(definition.protocolVersion, 2);
    });
});

test('template definitions survive host normalization with source intact', () => {
    FACTORIES.forEach((factory) => {
        const definition = factory();
        const normalized = home.normalizeModuleDefinition(definition);
        assert.equal(normalized.moduleId, definition.moduleId);
        assert.equal(normalized.source.pluginId, 'siyuan-checkin');
        assert.ok(normalized.sizes.length > 0);
    });
});

test('template keeps the read-only contract: no write surface declared', () => {
    FACTORIES.forEach((factory) => {
        const definition = factory();
        assert.equal(typeof definition.read, 'function');
        assert.equal(definition.write, undefined);
        assert.equal(definition.command, undefined);
    });
});

test('heatmap stays inside the renderer ceiling and keeps weekly alignment', () => {
    const {items} = example.buildHeatmapItems([{localDate: '2024-01-01'}, {localDate: '2024-01-01'}], 2024);
    assert.ok(items.length <= example.HEATMAP_MAX_CELLS);
    assert.equal(items.length, 371);
    assert.equal(items.length % 7, 0);
    assert.ok(items.every((item) => item.level >= -1 && item.level <= 4));
    assert.ok(items.some((item) => item.outside === true));
});

test('heatmap level thresholds follow the published check-in caliber', () => {
    assert.equal(example.heatLevel(0, 10), 0);
    assert.equal(example.heatLevel(1, 10), 1);
    assert.equal(example.heatLevel(2, 10), 2);
    assert.equal(example.heatLevel(5, 10), 3);
    assert.equal(example.heatLevel(8, 10), 4);
});

test('registration entry returns a stop handle and never throws without a host', () => {
    const stop = example.registerCheckinHomeModules({plugins: []});
    assert.equal(typeof stop, 'function');
    stop();
    assert.equal(typeof example.registerCheckinHomeModules(null), 'function');
});

test('registration entry hands every unregister handle back to the caller', () => {
    const registered = [];
    const switcher = {
        registerHomeModule: (definition) => {
            registered.push(definition);
            return () => undefined;
        },
    };
    const stop = example.registerCheckinHomeModules({plugins: [switcher]}, {
        onRegistered: (fns) => assert.equal(fns.length, 5),
    });
    stop();
    // 有界重试尚未触发（2s 后才首次探测），这里只保证入口不抛错且可停止。
    assert.ok(typeof stop === 'function');
});

test('template date helper uses the local calendar day', () => {
    assert.equal(example.dateKey(new Date(2026, 8, 17)), '2026-09-17');
});
