// storage-migration 纯模型演练测试：迁移管道、有界恢复报告与宿主同源契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {runStorageMigration, KEY_ORDER, HANDLED_KEYS, INSPECTED_KEYS, META_KEYS, STORAGE_SCHEMA_VERSION, DEFAULT_LIMITS, describeShape} = require('../src/storage-migration.js');

const QUICK_ACTION_DEFAULTS_VERSION = require('../src/quick-actions.js').QUICK_ACTION_DEFAULTS_VERSION;
const {normalizeThumbCache} = require('../src/util.js');

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
        'sw_schema_version': STORAGE_SCHEMA_VERSION,
        'sw_rss_read': {version: 1, seen: {}},
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
    assert.equal(result.report.totals.kept, HANDLED_KEYS.length + META_KEYS.length);
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
        // sw_thumb_cache 于 D-392 从 inspect 毕业为实处理，必须**进入** data——
        // 这是「毕业真的发生了」的证据，而不是只把它从 INSPECTED_KEYS 里删掉。
        'sw_thumb_cache': {['20240101120000-abcdefg']: {title: 't', html: '<div></div>', ts: 1}},
    });
    for (const key of INSPECTED_KEYS) {
        const entry = result.report.keys.find((item) => item.key === key);
        assert.equal(entry.status, 'inspect');
        assert.match(entry.note, /shape=object/);
        assert.equal(key in result.data, false, 'inspected keys must not leak into migrated data');
    }
    assert.equal(INSPECTED_KEYS.includes('sw_thumb_cache'), false, 'thumb cache must have graduated out of inspect-only');
    assert.equal(HANDLED_KEYS.includes('sw_thumb_cache'), true, 'thumb cache must be a handled key');
    assert.equal('sw_thumb_cache' in result.data, true, 'a graduated key must be emitted into migrated data');
    assert.deepEqual(result.data['sw_thumb_cache'], {['20240101120000-abcdefg']: {title: 't', html: '<div></div>', ts: 1}});
});

test('key classification cannot drift: totals stay 15 with no duplicate or unfiled key', () => {
    // 总数是**字面量**断言：report.keys.length === KEY_ORDER.length 是自指恒真式，
    // 无法发现「同一 key 同时出现在两个分类集里」导致的重复。14 与
    // agent-capabilities 的只读快照上限同源（buildAgentStorageHealth 钳制到 15）。
    assert.equal(KEY_ORDER.length, 15, 'storage key total is the contract other modules clamp against');
    assert.equal(new Set(KEY_ORDER).size, KEY_ORDER.length, 'KEY_ORDER must not contain duplicates');
    assert.equal(KEY_ORDER.length, HANDLED_KEYS.length + INSPECTED_KEYS.length + META_KEYS.length,
        'every key is filed in exactly one classification set');
    assert.equal(HANDLED_KEYS.length + INSPECTED_KEYS.length + META_KEYS.length, new Set([...HANDLED_KEYS, ...INSPECTED_KEYS, ...META_KEYS]).size,
        'no key may be filed in both sets (would silently report the same key twice)');
    for (const key of [...HANDLED_KEYS, ...INSPECTED_KEYS, ...META_KEYS]) {
        assert.ok(KEY_ORDER.includes(key), `classification sets must be the source of KEY_ORDER: ${key}`);
    }
    // 报告必须对每个 key 恰好给出一条记录，且分类与 status 一致
    const result = runStorageMigration({});
    assert.deepEqual(result.report.keys.map((entry) => entry.key), [...KEY_ORDER], 'report order mirrors KEY_ORDER');
});

test('inspected keys disclose their shape without echoing payload content', () => {
    const primitive = runStorageMigration({'sw_settings': 'not-an-object'});
    const entry = primitive.report.keys.find((item) => item.key === 'sw_settings');
    assert.equal(entry.status, 'inspect');
    assert.match(entry.note, /shape=string/);
    assert.doesNotMatch(entry.note, /not-an-object/, 'note must classify, never echo payload text');
});

test('thumb cache drill cleans oversized and malformed entries with kept/removed accounting', () => {
    const htmlMax = DEFAULT_LIMITS.thumbHtml;
    const good = {title: '正文', html: '<div>x</div>', ts: 2000};
    const oversized = {title: '超长', html: 'x'.repeat(htmlMax + 1), ts: 3000};
    const result = runStorageMigration({
        'sw_thumb_cache': {
            'root-good': good,
            'root-oversized': oversized,
            'root-html-not-string': {title: 't', html: 42, ts: 4000},
            'root-array-entry': [],
            'root-string-entry': 'oops',
            'root-null-entry': null,
        },
    });
    const entry = result.report.keys.find((item) => item.key === 'sw_thumb_cache');
    assert.equal(entry.status, 'cleaned');
    assert.equal(entry.kept, 1);
    assert.equal(entry.removed, 5, 'every malformed or oversized entry is accounted as removed');
    assert.match(entry.note, /evicted or repaired/);
    assert.deepEqual(result.data['sw_thumb_cache'], {'root-good': good},
        'only the healthy entry survives, byte-identical');
});

test('thumb cache drill repairs field types instead of discarding the entry', () => {
    const result = runStorageMigration({
        'sw_thumb_cache': {'root-1': {html: '<div>x</div>', title: 7, ts: 'later'}},
    });
    const entry = result.report.keys.find((item) => item.key === 'sw_thumb_cache');
    assert.equal(entry.status, 'cleaned', 'a repaired entry must be reported, not silently kept');
    assert.equal(entry.kept, 1);
    assert.equal(entry.removed, 0, 'repair is not removal');
    assert.deepEqual(result.data['sw_thumb_cache'], {'root-1': {title: '', html: '<div>x</div>', ts: 0}});
});

test('thumb cache drill evicts oldest by ts with a deterministic tie-break', () => {
    const payload = {'sw_thumb_cache': {}};
    for (let index = 0; index < 5; index += 1) {
        payload['sw_thumb_cache'][`root-${index}`] = {title: `t${index}`, html: '<div></div>', ts: index === 0 ? 0 : 100 - index};
    }
    const run = (limits) => runStorageMigration(payload, limits ? {limits} : undefined);
    const trimmed = run({thumbCache: 3, thumbHtml: DEFAULT_LIMITS.thumbHtml});
    const entry = trimmed.report.keys.find((item) => item.key === 'sw_thumb_cache');
    assert.equal(entry.status, 'cleaned');
    assert.equal(entry.kept, 3);
    assert.equal(entry.removed, 2);
    // ts: index 0 强制为 0（最旧），其余为 99/98/97/96 → 淘汰 root-0 与 root-4
    assert.deepEqual(Object.keys(trimmed.data['sw_thumb_cache']), ['root-1', 'root-2', 'root-3'],
        'survivors keep their original key order, not the sort order');
    // 同输入两次结果一致（无随机序、无时间戳）
    assert.deepEqual(run({thumbCache: 3, thumbHtml: DEFAULT_LIMITS.thumbHtml}), trimmed);
    // 上限内不改动：同一份 payload 在默认上限下必须保持原样
    const untouched = run();
    assert.equal(untouched.report.keys.find((item) => item.key === 'sw_thumb_cache').status, 'kept');
});

test('thumb cache drill resets non-object payloads and keeps empty objects as kept', () => {
    for (const bad of [[], 'cache', 7, true, null]) {
        const result = runStorageMigration({'sw_thumb_cache': bad});
        const entry = result.report.keys.find((item) => item.key === 'sw_thumb_cache');
        assert.equal(entry.status, 'reset', `${JSON.stringify(bad)} must reset to an empty cache`);
        assert.equal(entry.kept, 0);
        assert.deepEqual(result.data['sw_thumb_cache'], {});
        // note 必须是固定文本：既证明不回显载荷，也锁住有界性
        assert.equal(entry.note, 'non-object thumb cache reset to empty');
    }
    const empty = runStorageMigration({'sw_thumb_cache': {}});
    const emptyEntry = empty.report.keys.find((item) => item.key === 'sw_thumb_cache');
    assert.equal(emptyEntry.status, 'kept', 'an empty-but-valid cache is healthy, not a reset');
    assert.deepEqual(empty.data['sw_thumb_cache'], {});
});

test('drill limits are endpoint-specific: mobile cache caps grade differently than desktop', () => {
    // 手机端上限更保守（30 条 / 80 KiB）。若演练恒用桌面上限，手机端宿主已清洗的
    // 缓存会在报告里显示 kept，"演练与宿主同源"就不成立。此测试锁定端型上限
    // 真的会改变判级——即调用方传 limits 不是装饰。
    const payload = {'sw_thumb_cache': {}};
    for (let index = 0; index < 35; index += 1) {
        payload['sw_thumb_cache'][`root-${index}`] = {title: `t${index}`, html: '<div></div>', ts: index + 1};
    }
    const desktop = runStorageMigration(payload, {limits: {thumbCache: 40, thumbHtml: 200 * 1024}});
    const mobile = runStorageMigration(payload, {limits: {thumbCache: 30, thumbHtml: 80 * 1024}});
    assert.equal(desktop.report.keys.find((item) => item.key === 'sw_thumb_cache').status, 'kept');
    const mobileEntry = mobile.report.keys.find((item) => item.key === 'sw_thumb_cache');
    assert.equal(mobileEntry.status, 'cleaned');
    assert.equal(mobileEntry.kept, 30);
    assert.equal(mobileEntry.removed, 5);
    // 超长 html 在手机端被丢弃、桌面端保留——同一个字节数在两端的判级必须不同
    const big = {'sw_thumb_cache': {'root-1': {title: 't', html: 'x'.repeat(100 * 1024), ts: 1}}};
    assert.equal(runStorageMigration(big, {limits: {thumbCache: 40, thumbHtml: 200 * 1024}})
        .report.keys.find((item) => item.key === 'sw_thumb_cache').status, 'kept');
    assert.equal(runStorageMigration(big, {limits: {thumbCache: 30, thumbHtml: 80 * 1024}})
        .report.keys.find((item) => item.key === 'sw_thumb_cache').status, 'cleaned');
});

test('drill is a fixpoint on host-sanitized data: sanitize then drill must report kept', () => {
    // 同源性最强的可测形式：宿主先按共享纯函数归一化，之后演练必须全 kept。
    // 若两边的规则或上限分叉（例如演练用了桌面上限而宿主用了手机上限），
    // 演练就会在"刚被宿主清洗过"的数据上再次报 cleaned —— 假阳性，报告随即
    // 失去"宿主清洗缺口发现机制"的意义。这里用共享函数 + 两端各自的上限组合
    // 证明它是幂等的不动点。
    const dirty = {};
    for (let index = 0; index < 32; index += 1) {
        dirty[`root-${index}`] = {title: `t${index}`, html: 'x'.repeat(index === 31 ? 90 * 1024 : 8), ts: index + 1};
    }
    dirty['root-broken'] = {title: 5, ts: 'nope'};
    dirty['root-array'] = [];
    for (const [label, limits] of [
        ['desktop', {thumbCache: 40, htmlMax: 200 * 1024}],
        ['mobile', {thumbCache: 30, htmlMax: 80 * 1024}],
    ]) {
        const normalized = normalizeThumbCache(dirty, {max: limits.thumbCache, htmlMax: limits.htmlMax});
        assert.equal(normalized.changed, true, `${label}: the dirty payload must actually need cleaning`);
        const drill = runStorageMigration({'sw_thumb_cache': normalized.cache},
            {limits: {thumbCache: limits.thumbCache, thumbHtml: limits.htmlMax}});
        const entry = drill.report.keys.find((item) => item.key === 'sw_thumb_cache');
        assert.equal(entry.status, 'kept', `${label}: a drill over host-sanitized data must not report a gap`);
        assert.equal(entry.removed, 0);
        assert.deepEqual(drill.data['sw_thumb_cache'], normalized.cache, `${label}: drill must not shrink clean data`);
    }
});

// 字符串感知的注释剥离（见 tests/source-scan.cjs）：源码扫描类断言必须只看
// **代码**。否则把调用注释掉、或在注释里写下同样的调用文本，就能让"宿主仍在
// 委托"的断言通过——这是假绿的常见来源。辅助函数自带 tests/source-scan.test.cjs。
const {stripComments} = require('./source-scan.cjs');

test('defaults mirror constants.ts and host wiring stays homogenous (contract)', () => {
    const constants = fs.readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
    assert.match(constants, /export const MRU_MAX = 200;/);
    assert.match(constants, /export const HISTORY_MAX = 50;/);
    assert.match(constants, /export const FAVORITES_MAX = 512;/);
    assert.match(constants, /export const PINNED_MAX = 64;/);
    assert.match(constants, /export const FAVORITE_GROUPS_MAX = 64;/);
    assert.match(constants, /export const QUICK_ACTIONS_MAX = 12;/);
    assert.match(constants, /export const THUMB_CACHE_MAX = 40;/);
    assert.match(constants, /export const THUMB_CACHE_MAX_MOBILE = 30;/);
    assert.match(constants, /export const THUMB_HTML_MAX = 200 \* 1024;/);
    assert.match(constants, /export const THUMB_HTML_MAX_MOBILE = 80 \* 1024;/);
    assert.equal(DEFAULT_LIMITS.mru, 200);
    assert.equal(DEFAULT_LIMITS.history, 50);
    assert.equal(DEFAULT_LIMITS.closedHistory, 50);
    assert.equal(DEFAULT_LIMITS.pinned, 64);
    assert.equal(DEFAULT_LIMITS.favorites, 512);
    assert.equal(DEFAULT_LIMITS.favGroups, 64);
    assert.equal(DEFAULT_LIMITS.quickActions, 12);
    assert.equal(DEFAULT_LIMITS.thumbCache, 40, 'drill default mirrors THUMB_CACHE_MAX');
    assert.equal(DEFAULT_LIMITS.thumbHtml, 200 * 1024, 'drill default mirrors THUMB_HTML_MAX');

    // 演练与宿主必须同源：sanitizePersistentData 的每个 key 清洗都委托同一批函数，
    // 本模型只是同一批函数的编排层。宿主若绕开这批函数自写清洗，此契约失败。
    const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
    // 注释剥离后再扫：否则把调用注释掉、或在注释里写下同样的调用文本，都能让
    // "宿主仍在委托" 的断言通过 —— 这正是假绿的常见来源。
    const indexCode = stripComments(index);
    assert.ok(indexCode.length < index.length, 'comment stripping must actually remove something');
    assert.equal(indexCode.includes('与 normalizeThumbCache 的容器判据一致'), false,
        'comments must be gone from the scanned text');
    assert.ok(index.includes('与 normalizeThumbCache 的容器判据一致'), true,
        'the stripped comment must really exist in the raw source, otherwise this check proves nothing');
    assert.ok(indexCode.includes('private sanitizePersistentData'), 'code must survive comment stripping');
    for (const marker of [
        'sanitizeFavorites(this.data[FAV_KEY]',
        'sanitizeStringList(this.data[PINNED_KEY]',
        'sanitizeStringList(this.data[FAV_GROUPS_KEY]',
        'sanitizeOpenHistory(this.data[HISTORY_KEY]',
        'normalizeClosedEntries(this.data[CLOSED_HISTORY_KEY]',
        'sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY]',
        'normalizeDocumentSets(this.data[DOCUMENT_SETS_KEY]',
        'migrateQuickActionDefaults(this.data[QUICK_ACTIONS_KEY]',
        'normalizeThumbCache(this.data[THUMB_CACHE_KEY]',
    ]) {
        assert.ok(indexCode.includes(marker), `host must keep delegating to the shared sanitizer: ${marker}`);
    }
    // 宿主侧（sanitizePersistentData）、写入侧（setThumbCache）与演练侧
    // （captureStorageMigrationSnapshot）必须用同一批端型常量选择上限，否则两端
    // 判级分叉。"演练与宿主同源"是 D-386 的核心主张，这里把它落成可失败的
    // 断言：三个选择点全部在场才算过（少一个 → 某条路径静默用错上限）。
    // 断言的是**常量选择表达式**本身，不绑定选项键名（三处的键名按各自 API
    // 语境不同：max/htmlMax vs thumbCache/thumbHtml），避免把命名差异误判为漂移。
    const capSites = indexCode.match(/this\.isMobile \? THUMB_CACHE_MAX_MOBILE : THUMB_CACHE_MAX/g) || [];
    const htmlSites = indexCode.match(/this\.isMobile \? THUMB_HTML_MAX_MOBILE : THUMB_HTML_MAX/g) || [];
    assert.equal(capSites.length, 3, 'write path, load path and drill must all pick the cache cap by endpoint');
    assert.equal(htmlSites.length, 3, 'write path, load path and drill must all pick the html cap by endpoint');

    // 运行期读取（getThumbCache）必须与归一化用同一容器判据：数组同样是 object，
    // 旧判据会把数组当缓存返回，后续 cache[rootId] = {...} 会往数组上挂具名属性。
    const getterStart = indexCode.indexOf('private getThumbCache');
    assert.ok(getterStart > 0, 'getThumbCache must exist');
    const getterEnd = indexCode.indexOf('\n    }', getterStart);
    assert.ok(getterEnd > getterStart, 'the getter slice must be bounded');
    const getter = indexCode.slice(getterStart, getterEnd);
    assert.match(getter, /!Array\.isArray\(data\)/, 'runtime cache reads must reject arrays exactly like normalizeThumbCache');
    assert.match(getter, /THUMB_CACHE_KEY/, 'the bounded slice must really be the getter body');
    // 归一化本身也必须拒绝数组，否则两端判据仍会分叉。切片必须**有界**到函数体
    // 结束（列 0 的 `}`），否则窗口滑到文件尾部，命中别的函数里的 Array.isArray
    // 就是伪锚点——断言通过却与 normalizeThumbCache 无关。util.js 是 CRLF，
    // 必须先归一化换行，否则 `\n}\n` 这个锚点根本不匹配（切片变成空串）。
    const util = fs.readFileSync(path.join(root, 'src', 'util.js'), 'utf8').replace(/\r\n/g, '\n');
    const normalizerStart = util.indexOf('function normalizeThumbCache');
    assert.ok(normalizerStart > 0, 'normalizeThumbCache must exist in util.js');
    const normalizerEnd = util.indexOf('\n}\n', normalizerStart);
    assert.ok(normalizerEnd > normalizerStart, 'the normalizer slice must be bounded');
    const normalizer = util.slice(normalizerStart, normalizerEnd);
    assert.match(normalizer, /Array\.isArray\(values\)/, 'normalizeThumbCache must reject arrays as containers');
    assert.ok(normalizer.includes('htmlMax') && normalizer.includes('ts'),
        'the bounded slice must really be the normalizer body, not an empty or adjacent region');
});

test('host wiring keeps the drill read-only: snapshot captured after sanitize, never persisted (contract)', () => {
    const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
    // onload 必须在静默修复链之后运行演练快照（同源性的运行时验证）
    const initStart = index.indexOf('private async initPersistentData');
    const sanitizeStart = index.indexOf('private sanitizePersistentData');
    assert.ok(initStart > 0 && sanitizeStart > initStart, 'initPersistentData precedes sanitizePersistentData');
    const initSection = index.slice(initStart, sanitizeStart);
    const sanitizeCall = initSection.indexOf('this.sanitizePersistentData()');
    const drillCall = initSection.indexOf('this.captureStorageMigrationSnapshot()');
    assert.ok(drillCall > -1, 'initPersistentData must call the storage migration snapshot');
    assert.ok(sanitizeCall > -1 && drillCall > sanitizeCall,
        'the drill must run after the host sanitize chain at runtime');
    // 快照方法体必须只读：报告存实例内存，禁止任何回写
    const methodStart = index.indexOf('private captureStorageMigrationSnapshot');
    assert.ok(methodStart > 0, 'captureStorageMigrationSnapshot must exist');
    const methodEnd = index.indexOf('\n    }', methodStart);
    const methodBody = index.slice(methodStart, methodEnd);
    assert.doesNotMatch(methodBody, /saveDataDebounced|saveData\(/, 'the snapshot must never persist anything');
    assert.match(methodBody, /this\.storageMigrationReport = /, 'the report is held in instance memory');
    // 锚点放宽到「调用共享演练并传入 payloads」这一不变式，不绑定单行调用形态：
    // 演练需要按端型传 limits（D-392 同源要求），单行匹配会误报。
    assert.match(methodBody, /runStorageMigration\(\s*payloads\s*[,)]/, 'the snapshot must run the shared drill');
    assert.match(methodBody, /const payloads: Record<string, unknown> = \{\};/, 'the drill consumes the live data snapshot');
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
