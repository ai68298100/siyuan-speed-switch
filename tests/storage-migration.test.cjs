// storage-migration 纯模型演练测试：迁移管道、有界恢复报告与宿主同源契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {runStorageMigration, KEY_ORDER, HANDLED_KEYS, INSPECTED_KEYS, STORAGE_SCHEMA_VERSION, DEFAULT_LIMITS, describeShape} = require('../src/storage-migration.js');

const QUICK_ACTION_DEFAULTS_VERSION = require('../src/quick-actions.js').QUICK_ACTION_DEFAULTS_VERSION;

const VALID_ROOT = '20240101120000-abcdefg';

function makeFavorite(key, overrides = {}) {
    return {key, title: `文档 ${key}`, rootId: VALID_ROOT, group: '', ...overrides};
}

test('runStorageMigration is a pure drill: empty payloads yield no data and a bounded missing report', () => {
    const result = runStorageMigration({});
    assert.deepEqual(result.data, {}, 'missing keys must not produce data entries');
    assert.equal(result.fromVersion, 0);
    assert.equal(result.toVersion, STORAGE_SCHEMA_VERSION);
    assert.equal(result.report.keys.length, KEY_ORDER.length);
    assert.ok(result.report.keys.every((entry) => entry.status === 'missing'), 'every absent key is reported missing');
    assert.equal(result.report.totals.missing, KEY_ORDER.length);
    // 纯函数：同输入两次运行结果完全一致（无时间戳、无随机序）
    const again = runStorageMigration({});
    assert.deepEqual(again, result);
});

test('healthy payloads pass through as kept without changes', () => {
    const payloads = {
        'sw_mru': [VALID_ROOT, '20240102120000-abcdefg'],
        'sw_pinned': [VALID_ROOT],
        'sw_favorites': [makeFavorite('k1'), makeFavorite('k2')],
        'sw_fav_groups': ['研究', '写作'],
        'sw_fav_collapsed': ['研究'],
        'sw_open_history': [{key: VALID_ROOT, rootId: VALID_ROOT, title: 't', ts: 1}],
        'sw_closed_history': [{rootId: VALID_ROOT, title: 't', closedAt: 123}],
        'sw_quick_actions': [{id: 'switcher', label: '切换', icon: 'iconLayout', kind: 'builtin', value: 'switcher', targets: ['desktop', 'sidebar', 'mobile'], order: 10, enabled: true}],
        'sw_quick_actions_defaults': QUICK_ACTION_DEFAULTS_VERSION,
        'sw_document_sets': {schemaVersion: 1, sets: []},
        'sw_settings': {sortMode: 'mru'},
        'sw_home_state': {widgets: []},
        'sw_thumb_cache': {},
    };
    const result = runStorageMigration(payloads);
    for (const entry of result.report.keys) {
        if (INSPECTED_KEYS.includes(entry.key)) {
            assert.equal(entry.status, 'inspect', `${entry.key} is inspected only`);
        } else {
            assert.equal(entry.status, 'kept', `${entry.key} should be kept, got ${entry.status}: ${entry.note}`);
        }
        assert.equal(entry.removed, 0);
    }
    assert.equal(result.report.totals.kept, HANDLED_KEYS.length);
    assert.equal(result.data['sw_mru'].length, 2);
    assert.equal(result.data['sw_quick_actions_defaults'], QUICK_ACTION_DEFAULTS_VERSION);
    assert.deepEqual(result.data['sw_document_sets'], {schemaVersion: 1, sets: []});
});

test('dirty lists are cleaned with kept/removed accounting and bounded notes', () => {
    const junkFavorite = {key: '', title: 'orphan'};
    const result = runStorageMigration({
        'sw_favorites': [makeFavorite('k1'), junkFavorite, {notAnObject: true}, makeFavorite('k1')],
        'sw_pinned': [VALID_ROOT, '', null, 'not-a-root-id', VALID_ROOT],
        'sw_mru': [VALID_ROOT, VALID_ROOT, 'bad id'],
    });
    const favorites = result.report.keys.find((entry) => entry.key === 'sw_favorites');
    assert.equal(favorites.status, 'cleaned');
    assert.equal(favorites.kept, 1, 'duplicate and invalid favorites are dropped');
    assert.ok(favorites.removed >= 3);
    const pinned = result.report.keys.find((entry) => entry.key === 'sw_pinned');
    assert.equal(pinned.status, 'cleaned');
    // 宿主 sanitizeStringList 只滤非字符串/空值/重复，不校验 rootId 格式——
    // 演练必须与宿主同源，因此 'not-a-root-id' 保留（格式校验属 rootId 读取侧）。
    assert.deepEqual(result.data['sw_pinned'], [VALID_ROOT, 'not-a-root-id']);
    const mru = result.report.keys.find((entry) => entry.key === 'sw_mru');
    assert.equal(mru.status, 'cleaned');
    // capMru 只滤非字符串/空值/重复（rootId 格式校验属读取侧），与宿主同源：
    // [V, V, 'bad id'] → [V, 'bad id']，仅去重。
    assert.deepEqual(result.data['sw_mru'], [VALID_ROOT, 'bad id']);
    for (const entry of result.report.keys) {
        assert.ok(entry.note.length <= 80, 'notes stay bounded');
    }
});

test('limits are honored: oversized lists clamp to the configured maxima', () => {
    const many = Array.from({length: 300}, (unused, index) => `20240101${String(index).padStart(6, '0')}-abcdefg`.slice(0, 21));
    const result = runStorageMigration({'sw_mru': many}, {limits: {mru: 10}});
    assert.equal(result.data['sw_mru'].length, 10, 'mru clamps to the override limit');
    assert.equal(result.report.keys.find((entry) => entry.key === 'sw_mru').removed, 290);
    // 默认上限与 constants.ts 同界（契约锁定见下）：MRU_MAX=200
    const byDefault = runStorageMigration({'sw_mru': many});
    assert.equal(byDefault.data['sw_mru'].length, 200);
});

test('non-array garbage resets lists and quick actions fall back to defaults', () => {
    const result = runStorageMigration({
        'sw_pinned': 'garbage',
        'sw_favorites': 42,
        'sw_quick_actions': {oops: true},
    });
    assert.equal(result.report.keys.find((entry) => entry.key === 'sw_pinned').status, 'reset');
    assert.deepEqual(result.data['sw_pinned'], []);
    assert.equal(result.report.keys.find((entry) => entry.key === 'sw_favorites').status, 'reset');
    assert.deepEqual(result.data['sw_favorites'], []);
    const quickActions = result.report.keys.find((entry) => entry.key === 'sw_quick_actions');
    assert.equal(quickActions.status, 'reset');
    assert.ok(quickActions.kept >= 1, 'defaults provide at least one action');
    assert.ok(/defaults/.test(quickActions.note));
});

test('quick action defaults marker drives one-time migration semantics', () => {
    // 标记 key 整体缺失 → missing（宿主读到 undefined 同样触发一次性迁移，行为一致）
    const missing = runStorageMigration({'sw_quick_actions': []});
    const missingEntry = missing.report.keys.find((entry) => entry.key === 'sw_quick_actions_defaults');
    assert.equal(missingEntry.status, 'missing');
    // 当前版本标记 → kept
    const current = runStorageMigration({'sw_quick_actions_defaults': QUICK_ACTION_DEFAULTS_VERSION});
    assert.equal(current.report.keys.find((entry) => entry.key === 'sw_quick_actions_defaults').status, 'kept');
    // 旧版本标记 → reset（标记过期，宿主将重跑一次性迁移）
    const stale = runStorageMigration({'sw_quick_actions_defaults': QUICK_ACTION_DEFAULTS_VERSION - 1});
    const staleEntry = stale.report.keys.find((entry) => entry.key === 'sw_quick_actions_defaults');
    assert.equal(staleEntry.status, 'reset');
    assert.ok(/migration will run/.test(staleEntry.note));
});

test('document sets migrate legacy shapes and stale schema versions', () => {
    const legacyArray = runStorageMigration({'sw_document_sets': [{setId: 's1', name: '工作区'}]});
    const legacyEntry = legacyArray.report.keys.find((entry) => entry.key === 'sw_document_sets');
    assert.equal(legacyEntry.status, 'migrated');
    assert.equal(legacyArray.data['sw_document_sets'].schemaVersion, 1);
    const stale = runStorageMigration({'sw_document_sets': {schemaVersion: 0, sets: []}});
    assert.equal(stale.report.keys.find((entry) => entry.key === 'sw_document_sets').status, 'migrated');
    assert.equal(stale.data['sw_document_sets'].schemaVersion, 1);
});

test('inspected object keys are classified but never emitted into data', () => {
    const result = runStorageMigration({
        'sw_settings': {sortMode: 'mru'},
        'sw_home_state': {widgets: []},
        'sw_thumb_cache': {['20240101120000-abcdefg']: '<div></div>'},
    });
    for (const key of INSPECTED_KEYS) {
        const entry = result.report.keys.find((item) => item.key === key);
        assert.equal(entry.status, 'inspect');
        assert.match(entry.note, /shape=object/);
        assert.equal(key in result.data, false, 'inspected keys must not leak into migrated data');
    }
});

test('inspected keys disclose their shape without echoing payload content', () => {
    const primitive = runStorageMigration({'sw_settings': 'not-an-object'});
    const entry = primitive.report.keys.find((item) => item.key === 'sw_settings');
    assert.equal(entry.status, 'inspect');
    assert.match(entry.note, /shape=string/);
    assert.doesNotMatch(entry.note, /not-an-object/, 'note must classify, never echo payload text');
});

test('defaults mirror constants.ts and host wiring stays homogenous (contract)', () => {
    const constants = fs.readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
    assert.match(constants, /export const MRU_MAX = 200;/);
    assert.match(constants, /export const HISTORY_MAX = 50;/);
    assert.match(constants, /export const FAVORITES_MAX = 512;/);
    assert.match(constants, /export const PINNED_MAX = 64;/);
    assert.match(constants, /export const FAVORITE_GROUPS_MAX = 64;/);
    assert.match(constants, /export const QUICK_ACTIONS_MAX = 12;/);
    assert.equal(DEFAULT_LIMITS.mru, 200);
    assert.equal(DEFAULT_LIMITS.history, 50);
    assert.equal(DEFAULT_LIMITS.closedHistory, 50);
    assert.equal(DEFAULT_LIMITS.pinned, 64);
    assert.equal(DEFAULT_LIMITS.favorites, 512);
    assert.equal(DEFAULT_LIMITS.favGroups, 64);
    assert.equal(DEFAULT_LIMITS.quickActions, 12);

    // 演练与宿主必须同源：sanitizePersistentData 的每个 key 清洗都委托同一批函数，
    // 本模型只是同一批函数的编排层。宿主若绕开这批函数自写清洗，此契约失败。
    const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
    for (const marker of [
        'sanitizeFavorites(this.data[FAV_KEY]',
        'sanitizeStringList(this.data[PINNED_KEY]',
        'sanitizeStringList(this.data[FAV_GROUPS_KEY]',
        'sanitizeOpenHistory(this.data[HISTORY_KEY]',
        'normalizeClosedEntries(this.data[CLOSED_HISTORY_KEY]',
        'sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY]',
        'normalizeDocumentSets(this.data[DOCUMENT_SETS_KEY]',
        'migrateQuickActionDefaults(this.data[QUICK_ACTIONS_KEY]',
    ]) {
        assert.ok(index.includes(marker), `host must keep delegating to the shared sanitizer: ${marker}`);
    }
});

test('describeShape classifies payload kinds without throwing on exotic values', () => {
    assert.equal(describeShape(undefined), 'missing');
    assert.equal(describeShape(null), 'missing');
    assert.equal(describeShape([]), 'array');
    assert.equal(describeShape({}), 'object');
    assert.equal(describeShape('text'), 'string');
    assert.equal(describeShape(7), 'primitive');
    assert.equal(describeShape(true), 'primitive');
});

test('non-object payloads argument is rejected safely (drill cannot corrupt state)', () => {
    for (const bad of [null, undefined, 42, 'payloads', []]) {
        const result = runStorageMigration(bad);
        assert.equal(result.report.keys.length, KEY_ORDER.length);
        assert.deepEqual(result.data, {});
    }
});

test('report totals always reconcile with per-key statuses', () => {
    const result = runStorageMigration({
        'sw_mru': [VALID_ROOT],
        'sw_pinned': 'garbage',
        'sw_favorites': [makeFavorite('k1'), {bad: 1}],
        'sw_settings': {},
    });
    const sum = result.report.keys.reduce((acc, entry) => acc + (result.report.totals[entry.status] !== undefined ? 1 : 0), 0);
    assert.equal(sum, KEY_ORDER.length, 'every key status is represented in totals');
    assert.equal(result.report.totals.cleaned + result.report.totals.kept + result.report.totals.reset + result.report.totals.migrated + result.report.totals.inspect + result.report.totals.missing, KEY_ORDER.length);
});
