// T-6961：配置包差异与分组选择纯模型——组粒度 新增/替换/保持、子集勾选补丁、
// 并发签名比较。畸形包先经 normalizeConfigPackImport 拒绝（在导入契约内）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {diffConfigPackGroups, mergeConfigPackSelection, configPackBaselineSignature, normalizeConfigPackImport} = require('../src/config-pack-model.js');

const pack = (over = {}) => ({app: 'siyuan-speed-switch', schemaVersion: 1, generatedAt: 100, settings: {}, documentSets: null, ...over});

test('diff labels settings keys as add/replace/keep with row details', () => {
    const normalized = normalizeConfigPackImport(pack({settings: {skin: 'apple', pinyinMatch: true, density: 0}}));
    const current = {settings: {skin: 'fusion', density: 0}};
    const groups = diffConfigPackGroups(normalized, current);
    const settings = groups.find((g) => g.id === 'settings');
    assert.equal(settings.action, 'replace', '存在差异 → 整组动作为替换');
    const skin = settings.rows.find((r) => r.key === 'skin');
    assert.equal(skin.kind, 'replace');
    assert.equal(settings.rows.find((r) => r.key === 'pinyinMatch').kind, 'add');
    assert.equal(settings.rows.find((r) => r.key === 'density').kind, 'keep');
});

test('diff covers the documentSets group with add/replace/keep semantics', () => {
    const sets = {schemaVersion: 1, sets: [{setId: 's1', name: '工作', entries: []}]};
    const withSets = normalizeConfigPackImport(pack({documentSets: sets}));
    const noSets = normalizeConfigPackImport(pack({documentSets: null}));
    const empty = normalizeConfigPackImport(pack({}));
    assert.equal(diffConfigPackGroups(withSets, {}).find((g) => g.id === 'documentSets').action, 'add');
    assert.equal(diffConfigPackGroups(withSets, {documentSets: sets}).find((g) => g.id === 'documentSets').action, 'keep');
    assert.equal(diffConfigPackGroups(noSets, {}).find((g) => g.id === 'documentSets'), undefined, 'null=不迁移，不产生组');
    assert.equal(diffConfigPackGroups(empty, {settings: {}}).find((g) => g.id === 'settings'), undefined, '空包无设置组');
});

test('merge selection produces a patch for selected groups only; unknown ids ignored', () => {
    const normalized = normalizeConfigPackImport(pack({settings: {skin: 'apple'}, documentSets: {schemaVersion: 1, sets: []}}));
    const both = mergeConfigPackSelection(normalized, ['settings', 'documentSets']);
    assert.deepEqual(both.settings, {skin: 'apple'});
    assert.deepEqual(both.documentSets, {schemaVersion: 1, sets: []});
    const settingsOnly = mergeConfigPackSelection(normalized, ['settings']);
    assert.equal(settingsOnly.documentSets, undefined, '未勾选组不出现在补丁里');
    const none = mergeConfigPackSelection(normalized, []);
    assert.deepEqual(none, {});
    const junk = mergeConfigPackSelection(normalized, ['settings', 'credentials']);
    assert.ok(!('credentials' in junk), '白名单外组 id 忽略');
});

test('baseline signature detects concurrent state change between preview and confirm', () => {
    const before = {settings: {skin: 'fusion'}, documentSets: null};
    const signature = configPackBaselineSignature(before);
    assert.equal(configPackBaselineSignature(before), signature, '状态未变签名一致');
    assert.notEqual(configPackBaselineSignature({settings: {skin: 'apple'}, documentSets: null}), signature, '状态已变必须刷新差异');
});

test('malformed packs are rejected by the existing import contract before diffing', () => {
    assert.equal(normalizeConfigPackImport({app: 'other'}).ok, false, '外来包拒绝');
    assert.equal(normalizeConfigPackImport({app: 'siyuan-speed-switch', schemaVersion: 99, settings: {}}).ok, false, '不支持的版本拒绝');
});
