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
    const def = home.normalizeModuleDefinition({moduleId: 'x', title: 'T', protocolVersion: 99, homepage: 'javascript:alert(1)', clickCommand: 'not-a-command', refreshOn: 'bad'});
    assert.equal(def.protocolVersion, 1);
    assert.equal(def.clickCommand, '');
    assert.equal(def.homepage, '');
    assert.deepEqual(def.refreshOn, []);
    assert.deepEqual(def.configSchema, []);
});

test('protocol v2 config fields clamp invalid ranges and defaults', () => {
    const def = home.normalizeModuleDefinition({
        moduleId: 'bounded', title: 'Bounded', configSchema: [
            {key: 'count', label: 'Count', type: 'number', min: 10, max: 2, defaults: 99},
            {key: 'mode', label: 'Mode', type: 'select', options: ['a', 'a', 'b'], defaults: 'missing'},
        ],
    });
    assert.deepEqual(def.configSchema[0], {key: 'count', label: 'Count', type: 'number', min: 2, max: 10, defaults: 10});
    assert.deepEqual(def.configSchema[1], {key: 'mode', label: 'Mode', type: 'select', options: ['a', 'b'], defaults: 'a'});
});

test('protocol v2 exposes at most twelve configuration fields', () => {
    const def = home.normalizeModuleDefinition({
        moduleId: 'twelve-fields', title: 'Twelve',
        configSchema: Array.from({length: 13}, (_, index) => ({key: `field${index}`, label: `Field ${index}`, type: 'text'})),
    });
    assert.equal(def.configSchema.length, 12);
    assert.equal(def.configSchema.at(-1).key, 'field11');
});

test('protocol config supports validated date and document fields', () => {
    const def = home.normalizeModuleDefinition({
        moduleId: 'richer-fields', title: 'Richer', configSchema: [
            {key: 'when', label: 'When', type: 'date', defaults: '2028-02-29'},
            {key: 'badDate', label: 'Bad date', type: 'date', defaults: '2027-02-29'},
            {key: 'document', label: 'Document', type: 'document', defaults: '20260913083000-abcdef'},
            {key: 'badDocument', label: 'Bad document', type: 'document', defaults: 'not-an-id'},
        ],
    });
    assert.deepEqual(def.configSchema, [
        {key: 'when', label: 'When', type: 'date', defaults: '2028-02-29'},
        {key: 'badDate', label: 'Bad date', type: 'date', defaults: ''},
        {key: 'document', label: 'Document', type: 'document', defaults: '20260913083000-abcdef'},
        {key: 'badDocument', label: 'Bad document', type: 'document', defaults: ''},
    ]);
    assert.equal(home.normalizeIsoDate('2024-02-29'), '2024-02-29');
    assert.equal(home.normalizeIsoDate('2023-02-29'), '');
});

test('built-in modules declare size subsets and config schemas', () => {
    const modules = home.registerModules([]);
    const recent = modules.find((item) => item.moduleId === 'recent-documents');
    assert.deepEqual(recent.sizes, ['small', 'medium', 'wide', 'large', 'full']);
    const fixed = modules.find((item) => item.moduleId === 'fixed-document');
    assert.equal(fixed.protocolVersion, 2);
    assert.deepEqual(fixed.configSchema.map((field) => field.key), ['docId', 'title', 'showPath']);
    assert.equal(fixed.configSchema[0].type, 'document');
    assert.equal(modules.find((item) => item.moduleId === 'countdown').configSchema[1].type, 'date');
    const tasks = modules.find((item) => item.moduleId === 'today-tasks');
    assert.deepEqual(tasks.configSchema.map((field) => field.key), [
        'limit', 'allDocuments', 'notebook', 'showCompleted', 'days',
        'query', 'sortBy', 'showDocument', 'showPath', 'showRank',
    ]);
});
