/**
 * 存储容量边界契约（ROADMAP v0.20，2026-09-14）
 *
 * 对每个已声明容量上限的持久化 key,用超限输入断言"上限真实生效"
 * （裁剪到声明值、去重保持、顺序保留），防止未来重构静默丢失边界。
 * 收藏/置顶/分组容量由 constants.ts 明确声明，加载和写入均需遵守；
 * 无 max 参数的纯函数调用仍保持向后兼容的无限制语义。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {capMru, sanitizeOpenHistory, sanitizeFavorites, sanitizeStringList, buildStorageCapacitySnapshot, normalizeStorageCapacitySnapshot, serializeStorageCapacitySnapshot, parseStorageCapacitySnapshot, mergeStorageCapacitySnapshots, diffStorageCapacitySnapshots, summarizeStorageCapacityDiff, classifyStorageCapacityRisk, buildStorageCapacityHealth, normalizeStorageCapacityHealth, serializeStorageCapacityHealth, parseStorageCapacityHealth, diffStorageCapacityHealth, assessStorageCapacityTrend, normalizeStorageCapacityTrend, serializeStorageCapacityTrend, parseStorageCapacityTrend, buildStorageCapacityReport, normalizeStorageCapacityReport, serializeStorageCapacityReport, parseStorageCapacityReport, summarizeStorageCapacityReports, trimStorageCapacityReportHistory, selectStorageCapacityReportWindow, summarizeStorageCapacityReportWindow, normalizeStorageCapacityReportWindow, serializeStorageCapacityReportWindow, parseStorageCapacityReportWindow, validateStorageCapacityReportWindow, validateStorageCapacityReport, reconcileStorageCapacityReport, buildStorageCapacityReportEvents, normalizeStorageCapacityReportEvents, serializeStorageCapacityReportEvents, parseStorageCapacityReportEvents, createStorageCapacityReportEventQueue, replayStorageCapacityReportEvents, recoverStorageCapacityReportEventQueue} = require('../src/util.js');
const {normalizeDocumentSets, DOCUMENT_SET_MAX} = require('../src/document-sets.js');
const {normalizeHomeState} = require('../src/home-model.js');
const constants = require('../src/constants.ts');

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

test('capacity: thumbnail cache and user-list constants stay bounded', () => {
    assert.equal(constants.THUMB_CACHE_MAX, 40);
    assert.equal(constants.THUMB_CACHE_MAX_MOBILE, 30);
    assert.equal(constants.MRU_MAX, 200);
    assert.equal(constants.QUICK_ACTIONS_MAX, 12);
    assert.equal(constants.FAVORITES_MAX, 512);
    assert.equal(constants.PINNED_MAX, 64);
    assert.equal(constants.FAVORITE_GROUPS_MAX, 64);
});

test('capacity: favorites clamp to the declared 512-entry limit', () => {
    const favorites = Array.from({length: 1200}, (_, i) => ({key: `k${i}`, title: `t${i}`, rootId: makeBlockId(i)}));
    const result = sanitizeFavorites(favorites, constants.FAVORITES_MAX);
    assert.equal(result.items.length, constants.FAVORITES_MAX);
    assert.equal(result.items[0].key, 'k0');
    assert.equal(result.changed, true);
});

test('capacity: pinned and group string lists clamp independently', () => {
    const strings = Array.from({length: 800}, (_, i) => `group-${i}`);
    assert.equal(sanitizeStringList(strings, constants.PINNED_MAX).items.length, constants.PINNED_MAX);
    assert.equal(sanitizeStringList(strings, constants.FAVORITE_GROUPS_MAX).items.length, constants.FAVORITE_GROUPS_MAX);
    assert.equal(sanitizeStringList(strings).items.length, 800, 'omitting max preserves pure-function compatibility');
});

test('capacity: clean runtime reads remain unchanged after defensive sanitization', () => {
    const favorites = Array.from({length: 3}, (_, index) => ({key: `k${index}`, title: `T${index}`, rootId: null, group: ''}));
    assert.equal(sanitizeFavorites(favorites, constants.FAVORITES_MAX).changed, false);
    assert.equal(sanitizeStringList(['p1', 'p2'], constants.PINNED_MAX).changed, false);
    assert.equal(sanitizeStringList(['g1', 'g2'], constants.FAVORITE_GROUPS_MAX).changed, false);
});

test('capacity: malformed runtime reads self-heal and report changed', () => {
    assert.equal(sanitizeFavorites([{key: 'ok'}, null, {key: 'ok'}], constants.FAVORITES_MAX).changed, true);
    assert.equal(sanitizeStringList(['ok', '', 'ok', 3], constants.PINNED_MAX).changed, true);
    assert.equal(sanitizeStringList(['group', null], constants.FAVORITE_GROUPS_MAX).changed, true);
});

test('capacity: snapshot exposes all user-list buckets independently', () => {
    const snapshot = buildStorageCapacitySnapshot({favorites: Array(512).fill(0), pinned: [], favoriteGroups: Array(64).fill('g')}, {favorites: 512, pinned: 64, favoriteGroups: 64});
    assert.deepEqual(Object.keys(snapshot), ['favorites', 'pinned', 'favoriteGroups']);
    assert.equal(snapshot.favorites.status, 'near');
    assert.equal(snapshot.favoriteGroups.status, 'near');
});

test('capacity: normalized snapshots remain schema-shaped and deterministic', () => {
    const normalized = normalizeStorageCapacitySnapshot({favoriteGroups: {used: 58, max: 64, status: 'ok'}});
    assert.deepEqual(Object.keys(normalized), ['favorites', 'pinned', 'favoriteGroups']);
    assert.equal(normalized.favoriteGroups.status, 'near');
    assert.equal(normalized.favorites.used, 0);
});

test('capacity: serialized snapshot preserves fixed bucket order', () => {
    const serialized = serializeStorageCapacitySnapshot({favoriteGroups: {used: 1, max: 64}});
    assert.ok(serialized.indexOf('"favorites"') < serialized.indexOf('"pinned"'));
    assert.ok(serialized.indexOf('"pinned"') < serialized.indexOf('"favoriteGroups"'));
});

test('capacity: parse/serialize round trip keeps all buckets bounded', () => {
    const source = {favorites: {used: 512, max: 512}, pinned: {used: 64, max: 64}, favoriteGroups: {used: 64, max: 64}};
    const parsed = parseStorageCapacitySnapshot(serializeStorageCapacitySnapshot(source));
    assert.equal(parsed.favorites.status, 'near');
    assert.equal(parsed.pinned.status, 'near');
    assert.equal(parsed.favoriteGroups.status, 'near');
});

test('capacity: merged snapshots preserve all three bounded buckets', () => {
    const merged = mergeStorageCapacitySnapshots(
        {favorites: {used: 200, max: 512}},
        {pinned: {used: 64, max: 64}},
        {favoriteGroups: {used: 60, max: 64}},
    );
    assert.deepEqual(Object.keys(merged), ['favorites', 'pinned', 'favoriteGroups']);
    assert.equal(merged.pinned.status, 'near');
    assert.equal(merged.favoriteGroups.status, 'near');
});

test('capacity: diff keeps fixed bucket order and stable boolean flags', () => {
    const diff = diffStorageCapacitySnapshots({favorites: {used: 0, max: 512}}, {favorites: {used: 512, max: 512}});
    assert.deepEqual(Object.keys(diff), ['favorites', 'pinned', 'favoriteGroups']);
    assert.equal(diff.favorites.statusChanged, true);
    assert.equal(diff.favorites.truncatedChanged, false);
});

test('capacity: diff summary remains bounded to the three declared buckets', () => {
    const summary = summarizeStorageCapacityDiff({favorites: {used: 1, max: 2}}, {favorites: {used: 2, max: 2}, pinned: {used: 1, max: 2}});
    assert.equal(summary.changedCount, 2);
    assert.deepEqual(summary.changedBuckets, ['favorites', 'pinned']);
    assert.equal(summary.increased, 2);
});

test('capacity: aggregate risk classification is stable across all buckets', () => {
    assert.equal(classifyStorageCapacityRisk({favoriteGroups: {used: 58, max: 64}}), 'warning');
    assert.equal(classifyStorageCapacityRisk({favorites: {used: 513, max: 512}, pinned: {used: 1, max: 64}}), 'critical');
});

test('capacity: health summary keeps a fixed bounded shape', () => {
    const health = buildStorageCapacityHealth({});
    assert.deepEqual(Object.keys(health), ['risk', 'used', 'max', 'over', 'near', 'recommendation']);
    assert.equal(health.recommendation, 'none');
});

test('capacity: health normalizer keeps over and near buckets disjoint', () => {
    const health = normalizeStorageCapacityHealth({over: ['favorites'], near: ['favorites', 'pinned']});
    assert.deepEqual(health.over, ['favorites']);
    assert.deepEqual(health.near, ['pinned']);
    assert.equal(health.risk, 'critical');
});

test('capacity: health serialization rejects oversized payloads', () => {
    assert.equal(parseStorageCapacityHealth('x'.repeat(128001)).risk, 'normal');
    assert.equal(JSON.parse(serializeStorageCapacityHealth({risk: 'critical'})).recommendation, 'none');
});

test('capacity: trend action follows normalized current recommendation', () => {
    const trend = assessStorageCapacityTrend({over: ['favorites'], used: 20, max: 20}, {near: ['favorites'], used: 18, max: 20});
    assert.equal(trend.action, 'monitor');
    assert.equal(trend.trend, 'improving');
});

test('capacity: normalized trend keeps a fixed four-field shape', () => {
    assert.deepEqual(Object.keys(normalizeStorageCapacityTrend({})), ['trend', 'riskDelta', 'pressureDelta', 'action']);
    assert.equal(parseStorageCapacityTrend('bad').trend, 'stable');
    assert.equal(JSON.parse(serializeStorageCapacityTrend({trend: 'improving'})).action, 'none');
});

test('capacity: report keeps fixed top-level sections and version', () => {
    const report = buildStorageCapacityReport({}, {});
    assert.deepEqual(Object.keys(report), ['version', 'health', 'trend', 'summary']);
    assert.equal(normalizeStorageCapacityReport(report).version, 1);
    assert.equal(parseStorageCapacityReport('bad').version, 1);
    assert.equal(JSON.parse(serializeStorageCapacityReport(report)).version, 1);
});

test('capacity: report history summary exposes fixed counters', () => {
    const summary = summarizeStorageCapacityReports([]);
    assert.deepEqual(Object.keys(summary), ['samples', 'latestRisk', 'latestTrend', 'riskCounts', 'trendCounts', 'criticalSamples', 'degradingSamples', 'improvingSamples']);
    assert.equal(summary.samples, 0);
});

test('capacity: report history trimming preserves deterministic order', () => {
    const result = trimStorageCapacityReportHistory([{}, {}, {}], 2);
    assert.equal(result.reports.length, 1, 'identical normalized reports deduplicate');
    assert.equal(result.reports[0].version, 1);
});

test('capacity: report window keeps latest bounded history and fixed metadata', () => {
    const result = selectStorageCapacityReportWindow([{}, {}, {}], 2);
    assert.deepEqual(Object.keys(result), ['reports', 'start', 'end', 'total', 'truncated']);
    assert.equal(result.reports.length, 1, 'normalized duplicate reports collapse');
});

test('capacity: window summary output keys remain fixed', () => {
    assert.deepEqual(Object.keys(summarizeStorageCapacityReportWindow({})), ['start', 'end', 'total', 'truncated', 'samples', 'latestRisk', 'latestTrend', 'criticalSamples', 'degradingSamples', 'improvingSamples']);
});

test('capacity: serialized report window preserves fixed metadata shape', () => {
    const parsed = parseStorageCapacityReportWindow(serializeStorageCapacityReportWindow({reports: [{health: {used: 1, max: 2}}]}));
    assert.deepEqual(Object.keys(parsed), ['reports', 'start', 'end', 'total', 'truncated']);
    assert.equal(parsed.reports.length, 1);
});

test('capacity: report window validator enforces monotonic bounded metadata', () => {
    assert.equal(validateStorageCapacityReportWindow({reports: [], start: 0, end: 1, total: 1, truncated: false}).valid, true);
    assert.equal(validateStorageCapacityReportWindow({reports: [], start: 65, end: 65, total: 65, truncated: false}).reason, 'invalid_bounds');
});

test('capacity: report validator keeps envelope checks deterministic', () => {
    assert.equal(validateStorageCapacityReport({version: 1, health: {}, trend: {}, summary: {changedBuckets: ['bad', 'x', 'y', 'z']}}).reason, 'invalid_summary');
});

test('capacity: report reconciliation preserves fixed sections', () => {
    const report = reconcileStorageCapacityReport({version: 99});
    assert.equal(report.health.risk, 'normal');
    assert.equal(report.trend.action, 'none');
    assert.equal(report.summary.changed, false);
});

test('capacity: report events normalize to allowed types and bounded buckets', () => {
    const events = normalizeStorageCapacityReportEvents([{type: 'risk_changed', from: 'critical', to: 'warning'}, {type: 'usage_trend', direction: 'down'}]);
    assert.deepEqual(events, [{type: 'risk_changed', from: 'critical', to: 'warning'}, {type: 'usage_trend', direction: 'down'}]);
});

test('capacity: serialized report events stay bounded and deterministic', () => {
    const parsed = parseStorageCapacityReportEvents(serializeStorageCapacityReportEvents([{type: 'risk_changed', from: 'normal', to: 'warning'}]));
    assert.deepEqual(parsed, [{type: 'risk_changed', from: 'normal', to: 'warning'}]);
});

test('capacity: event queue snapshot exposes fixed lifecycle fields', () => {
    const queue = createStorageCapacityReportEventQueue(3);
    assert.deepEqual(Object.keys(queue.snapshot()), ['cursor', 'size', 'capacity', 'disposed']);
    queue.enqueue([{type: 'usage_trend', direction: 'up'}]);
    assert.equal(queue.read(0).events.length, 1);
});

test('capacity: event replay facade keeps cancellation and timeout non-destructive', () => {
    const queue = createStorageCapacityReportEventQueue();
    queue.enqueue([{type: 'usage_trend', direction: 'up'}]);
    assert.equal(replayStorageCapacityReportEvents(queue, {signal: {aborted: true}}).reason, 'cancelled');
    assert.equal(queue.snapshot().size, 1);
});

test('capacity: queue recovery returns stable modes and bounded snapshot', () => {
    const queue = createStorageCapacityReportEventQueue(1);
    queue.enqueue([{type: 'usage_trend', direction: 'up'}, {type: 'usage_trend', direction: 'down'}]);
    const result = recoverStorageCapacityReportEventQueue(queue, {pinned: {used: 2, max: 4}});
    assert.equal(result.mode, 'snapshot');
    assert.equal(result.snapshot.version, 1);
});

test('capacity: health diff keeps transition lists within the declared buckets', () => {
    const diff = diffStorageCapacityHealth({over: ['favorites', 'bad']}, {near: ['pinned', 'favoriteGroups']});
    assert.deepEqual(diff.removedOver, ['favorites']);
    assert.deepEqual(diff.addedNear, ['pinned', 'favoriteGroups']);
    assert.equal(diff.direction, 'stable');
});
