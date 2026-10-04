// T-7073 / ADR 0104：片段备份恢复模型矩阵。
// 每个矩阵项都调用生产模型，再断言签名、差异和选择性恢复结果；不复制生产算法。
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    SNIPPET_BACKUP_SCHEMA_VERSION,
    SNIPPET_BACKUP_MAX_SNIPPETS,
    buildSnippetBackup,
    normalizeSnippetBackup,
    diffSnippetBackup,
    buildSnippetRestorePlan,
    snippetSnapshotSignature,
} = require('../src/snippet-studio-model.js');

const row = (id, overrides = {}) => ({
    id,
    name: `Snippet ${id}`,
    type: 'css',
    content: `.${id} { color: red; }`,
    enabled: false,
    disabledInPublish: false,
    ...overrides,
});

const settings = [
    {enabledCSS: false, enabledJS: false},
    {enabledCSS: false, enabledJS: true},
    {enabledCSS: true, enabledJS: false},
    {enabledCSS: true, enabledJS: true},
    {enabledCSS: true, enabledJS: true},
    {enabledCSS: false, enabledJS: false},
];

function buildVariant(index, current) {
    switch (index) {
    case 0:
        return current.map((snippet) => ({...snippet}));
    case 1:
        return [...current, row('d')];
    case 2:
        return current.map((snippet) => snippet.id === 'b' ? {...snippet, content: '.b { color: blue; }'} : {...snippet});
    case 3:
        return current.filter((snippet) => snippet.id !== 'c');
    case 4:
        return [row('d'), {...current[1], enabled: true}, {...current[0], disabledInPublish: true}];
    default:
        return [current[2], current[0], current[1]].map((snippet) => ({...snippet}));
    }
}

const selectors = [
    () => null,
    (ids) => ids.slice(0, 1),
    (ids) => ids.slice(-1),
    (ids) => ids.filter((_, index) => index % 2 === 0),
    (ids) => ids.filter((_, index) => index % 2 === 1),
    (ids) => ids.concat('__unknown__'),
];

const currentRows = [row('a'), row('b'), row('c')];
let matrixCount = 0;
for (let variant = 0; variant < 6; variant += 1) {
    for (let settingIndex = 0; settingIndex < settings.length; settingIndex += 1) {
        for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
            const caseNumber = ++matrixCount;
            test(`backup restore matrix ${caseNumber}: variant ${variant}, settings ${settingIndex}, selector ${selectorIndex}`, () => {
                const backup = buildSnippetBackup({
                    snippets: buildVariant(variant, currentRows),
                    settings: settings[settingIndex],
                }, {now: 1790899200000});
                const current = {snippets: currentRows, settings: {enabledCSS: true, enabledJS: false}};
                const diff = diffSnippetBackup(current, backup);
                const ids = diff.changed.map((entry) => entry.id);
                const selected = selectors[selectorIndex](ids) || ids;
                const plan = buildSnippetRestorePlan(current, backup, {
                    ids: selected,
                    includeDeletes: selectorIndex !== 4,
                    restoreSettings: selectorIndex !== 5,
                });
                assert.equal(plan.signature, snippetSnapshotSignature(plan.snapshot));
                assert.equal(new Set(plan.snapshot.snippets.map((entry) => entry.id)).size, plan.snapshot.snippets.length);
                assert.ok(plan.snapshot.snippets.length <= SNIPPET_BACKUP_MAX_SNIPPETS);
                assert.deepEqual(plan.selected, selected.filter((id) => ids.includes(id)));
                if (selectorIndex === 5) assert.deepEqual(plan.snapshot.settings, current.settings);
                else assert.deepEqual(plan.snapshot.settings, backup.settings);
            });
        }
    }
}

test('backup model emits a versioned, bounded native-only payload', () => {
    const backup = buildSnippetBackup({snippets: [row('a', {future: {ignored: true}})], settings: settings[2]}, {now: 1790899200000});
    assert.equal(backup.kind, 'siyuan-snippet-backup');
    assert.equal(backup.version, SNIPPET_BACKUP_SCHEMA_VERSION);
    assert.equal(backup.createdAt, 1790899200000);
    assert.equal(backup.source, 'native');
    assert.deepEqual(backup.snippets[0], {
        id: 'a', name: 'Snippet a', type: 'css', content: '.a { color: red; }',
        enabled: false, disabledInPublish: false,
    });
    assert.ok(backup.bytes > 0);
});

test('backup normalization rejects malformed, future and over-capacity payloads', () => {
    const valid = buildSnippetBackup({snippets: [row('a')], settings: settings[0]}, {now: 1790899200000});
    assert.deepEqual(normalizeSnippetBackup(valid).snippets, valid.snippets);
    assert.equal(normalizeSnippetBackup({...valid, version: 99}), null);
    assert.equal(normalizeSnippetBackup({...valid, kind: 'other'}), null);
    assert.equal(normalizeSnippetBackup({...valid, settings: {enabledCSS: true}}), null);
    assert.equal(normalizeSnippetBackup({...valid, snippets: [row('a'), row('a')]}), null);
    assert.equal(normalizeSnippetBackup({...valid, createdAt: 0}), null);
    assert.equal(normalizeSnippetBackup({...valid, source: 'remote'}), null);
});

test('backup model rejects duplicate IDs and more than the production cap', () => {
    assert.throws(() => buildSnippetBackup({snippets: [row('same'), row('same')], settings: settings[0]}), /snippet-duplicate-id/);
    const tooMany = Array.from({length: SNIPPET_BACKUP_MAX_SNIPPETS + 1}, (_, index) => row(`x${index}`));
    assert.throws(() => buildSnippetBackup({snippets: tooMany, settings: settings[0]}), /snippet-backup-too-many/);
});

test('restore diff reports settings changes independently from snippet rows', () => {
    const current = {snippets: [row('a')], settings: {enabledCSS: true, enabledJS: false}};
    const backup = buildSnippetBackup({snippets: [row('a')], settings: {enabledCSS: false, enabledJS: true}});
    const diff = diffSnippetBackup(current, backup);
    assert.equal(diff.summary.changed, 0);
    assert.equal(diff.summary.settingsChanged, true);
    assert.equal(diff.rows[0].action, 'keep');
});

assert.equal(matrixCount, 216, 'matrix must keep the promised 216 production-model cases');
