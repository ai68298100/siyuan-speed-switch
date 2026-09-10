const {test} = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/home-model.js');

test('protocol v2 fields normalize with bounded defaults', () => {
    const def = home.normalizeModuleDefinition({
        moduleId: 'x-test', title: 'T',
        protocolVersion: 2,
        author: 'someone',
        homepage: 'https://example.com/x',
        clickCommand: 'my-plugin::open-today',
        configSchema: [
            {key: 'limit', label: 'Limit', type: 'number', min: 1, max: 9, defaults: 4},
            {key: 'bad key!', label: 'x'},
            {key: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'], defaults: 'b'},
            {key: 'empty', label: 'No options', type: 'select', options: []},
        ],
        refreshOn: ['switch-protyle', 'bogus-event'],
    });
    assert.equal(def.protocolVersion, 2);
    assert.equal(def.author, 'someone');
    assert.equal(def.homepage, 'https://example.com/x');
    assert.equal(def.clickCommand, 'my-plugin::open-today');
    assert.deepEqual(def.refreshOn, ['switch-protyle']);
    assert.equal(def.configSchema.length, 3); // bad key 与空 select 字段被剔除
    assert.deepEqual(def.configSchema[0], {key: 'limit', label: 'Limit', type: 'number', min: 1, max: 9, defaults: 4});
    assert.deepEqual(def.configSchema[2], {key: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'], defaults: 'b'});
});

test('protocol v2 defaults: unknown version/command/event degrade safely', () => {
    const def = home.normalizeModuleDefinition({moduleId: 'x', title: 'T', protocolVersion: 99, clickCommand: 'not-a-command', refreshOn: 'bad'});
    assert.equal(def.protocolVersion, 1);
    assert.equal(def.clickCommand, '');
    assert.deepEqual(def.refreshOn, []);
    assert.deepEqual(def.configSchema, []);
});

test('built-in modules declare size subsets and config schemas', () => {
    const modules = home.registerModules([]);
    const recent = modules.find((item) => item.moduleId === 'recent-documents');
    assert.deepEqual(recent.sizes, ['small', 'medium', 'wide', 'large', 'full']);
    const fixed = modules.find((item) => item.moduleId === 'fixed-document');
    assert.equal(fixed.protocolVersion, 2);
    assert.deepEqual(fixed.configSchema.map((field) => field.key), ['docId', 'title']);
    const tasks = modules.find((item) => item.moduleId === 'today-tasks');
    assert.deepEqual(tasks.configSchema.map((field) => field.key), ['limit', 'allDocuments']);
});
