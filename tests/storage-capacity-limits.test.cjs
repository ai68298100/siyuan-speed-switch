/**
 * 存储容量边界契约（ROADMAP v0.20，2026-09-14）
 *
 * 对每个已声明容量上限的持久化 key,用超限输入断言"上限真实生效"
 * （裁剪到声明值、去重保持、顺序保留），防止未来重构静默丢失边界。
 * 已知无上限项（favorites/sanitizeStringList 系列）单独记录为事实,
 * 上限值属维护者决策,见 TODO 候选。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {capMru, sanitizeOpenHistory, sanitizeFavorites, sanitizeStringList} = require('../src/util.js');
const {normalizeDocumentSets, DOCUMENT_SET_MAX} = require('../src/document-sets.js');
const {normalizeHomeState} = require('../src/home-model.js');

const makeBlockId = (i) => `20260914090000-${i.toString(16).padStart(8, '0')}`;

test('capacity: MRU cap keeps the newest N entries and de-duplicates', () => {
    const values = Array.from({length: 500}, (_, i) => makeBlockId(i));
    const capped = capMru(values, 200);
    assert.equal(capped.length, 200);
    assert.equal(capped[0], makeBlockId(0), 'most recent (first) entry survives');
    // 重复值不产生重复条目
    assert.equal(capMru([makeBlockId(1), makeBlockId(1), makeBlockId(2)], 200).length, 2);
    // 损坏/非法输入安全降级（非数组的 truthy 值此前会抛 TypeError）
    assert.deepEqual(capMru(null, 200), []);
    assert.deepEqual(capMru("corrupted-string", 200), []);
    assert.deepEqual(capMru({length: 3}, 200), []);
    assert.deepEqual(capMru(undefined, 200), []);
});

test('capacity: open history clamps to the declared 50-entry limit', () => {
    const values = Array.from({length: 300}, (_, i) => ({key: `k${i}`, rootId: makeBlockId(i), title: `t${i}`}));
    const result = sanitizeOpenHistory(values, 50);
    assert.equal(result.items.length, 50);
    assert.equal(result.changed, true);
    assert.equal(result.items[0].rootId, makeBlockId(0), 'newest-first order preserved');
    assert.equal(sanitizeOpenHistory(values).items.length, 50, 'default limit is 50');
});

test('capacity: document sets clamp to DOCUMENT_SET_MAX with duplicates dropped', () => {
    assert.ok(DOCUMENT_SET_MAX === 24, 'declared set limit is 24');
    const sets = Array.from({length: 60}, (_, i) => ({
        setId: `set-${i}`,
        name: `集合${i}`,
        entries: [{rootId: makeBlockId(i)}],
    }));
    const result = normalizeDocumentSets(sets);
    assert.ok(Array.isArray(result.sets), 'normalizeDocumentSets returns a versioned envelope');
    assert.ok(result.sets.length <= DOCUMENT_SET_MAX, `expected <= ${DOCUMENT_SET_MAX}, got ${result.sets.length}`);
    assert.equal(result.changed, true, 'clamping is reported for migration visibility');
    assert.equal(normalizeDocumentSets(sets.slice(0, 10)).sets.length, 10);
});

test('capacity: home state layouts clamp to 64 entries per device and drop unknown instances', () => {
    const instances = Array.from({length: 4}, (_, i) => ({moduleId: 'favorites', instanceId: `inst-${i}`}));
    const layoutEntries = Array.from({length: 200}, (_, i) => ({
        instanceId: i < 100 ? 'inst-0' : `ghost-${i}`,
        x: i % 12, y: Math.floor(i / 12), w: 4, h: 3,
    }));
    const state = normalizeHomeState({instances, layouts: {desktop: layoutEntries}});
    assert.ok(state.layouts.desktop.length <= 64, 'per-device layout entries clamp to 64');
    assert.equal(state.layouts.desktop.length, 1, 'unknown-instance and duplicate entries are dropped');
    assert.equal(state.layouts.desktop[0].instanceId, 'inst-0');
});

test('capacity: thumbnail cache constants stay bounded and distinct per device', () => {
    const constants = require('../src/constants.ts');
    assert.equal(constants.THUMB_CACHE_MAX, 40);
    assert.equal(constants.THUMB_CACHE_MAX_MOBILE, 30);
    assert.equal(constants.MRU_MAX, 200);
    assert.equal(constants.QUICK_ACTIONS_MAX, 12);
});

test('capacity: favorites and string lists are known unbounded (documented fact)', (t) => {
    // 维护者决策项（TODO 候选）：收藏/置顶/分组为用户主动行为,当前实现
    // 只做类型清洗与去重,不做数量裁剪。本测试固化该事实,防止有人误以为
    // 存在隐式上限;未来引入上限时必须同步更新此断言与 TODO。
    const favorites = Array.from({length: 1200}, (_, i) => ({key: `k${i}`, title: `t${i}`, rootId: makeBlockId(i)}));
    assert.equal(sanitizeFavorites(favorites).items.length, 1200,
        'sanitizeFavorites currently does not clamp; update this contract when a limit is decided');
    const strings = Array.from({length: 800}, (_, i) => `group-${i}`);
    assert.equal(sanitizeStringList(strings).items.length, 800,
        'sanitizeStringList currently does not clamp; update this contract when a limit is decided');
});
