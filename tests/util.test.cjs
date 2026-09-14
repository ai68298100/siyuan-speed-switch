// 单元测试：用 Node 22 内置 node:test 运行 util.js（plain JS）零依赖
// 后续如需测试 TS 源码，可以走 src/index.ts 的 plain JS 单元 + DOM 抽测（tests/mobile-card-smoke.cjs）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clampNum, stableSortBy, normalizeSortBy, sortItems, sortGroupItems, resolveQuickActionSurfaceState, groupFavoritesByGroup, resolveIconFallback, resolveIconReference, normalizeQuickActionText, buildTabGroupsByParent, resolveTabRootId, resolveFavoriteRootId, planGroupOpenFavorites, sanitizeDocIds, normalizeCapacityLimit, buildCapacitySummary, buildStorageCapacitySnapshot, normalizeStorageCapacitySnapshot, serializeStorageCapacitySnapshot, parseStorageCapacitySnapshot, mergeStorageCapacitySnapshots, diffStorageCapacitySnapshots, summarizeStorageCapacityDiff, classifyStorageCapacityRisk, buildStorageCapacityHealth, normalizeStorageCapacityHealth, serializeStorageCapacityHealth, parseStorageCapacityHealth, diffStorageCapacityHealth, assessStorageCapacityTrend, normalizeStorageCapacityTrend, serializeStorageCapacityTrend, parseStorageCapacityTrend, buildStorageCapacityReport, normalizeStorageCapacityReport, serializeStorageCapacityReport, parseStorageCapacityReport, summarizeStorageCapacityReports, trimStorageCapacityReportHistory, selectStorageCapacityReportWindow, summarizeStorageCapacityReportWindow, normalizeStorageCapacityReportWindow, serializeStorageCapacityReportWindow, parseStorageCapacityReportWindow, validateStorageCapacityReportWindow, validateStorageCapacityReport, capMru, sanitizeStringList, sanitizeFavorites, sanitizeOpenHistory, isSuccessfulMobileTabsResult } = require('../src/util.js');

test('normalizeCapacityLimit accepts finite positive values and floors them', () => {
    assert.equal(normalizeCapacityLimit(4.9), 4);
    assert.equal(normalizeCapacityLimit('8'), 8);
});

test('normalizeCapacityLimit rejects non-positive, non-finite, and missing values', () => {
    for (const value of [0, -1, NaN, Infinity, null, undefined, 'bad']) {
        assert.equal(normalizeCapacityLimit(value), 0);
    }
});

test('buildCapacitySummary reports bounded usage and truncation', () => {
    assert.deepEqual(buildCapacitySummary([1, 2, 3], 2), {used: 3, max: 2, truncated: true});
    assert.deepEqual(buildCapacitySummary([1], 2), {used: 1, max: 2, truncated: false});
});

test('buildCapacitySummary treats malformed values as empty usage', () => {
    assert.deepEqual(buildCapacitySummary('corrupt', 5), {used: 0, max: 5, truncated: false});
    assert.deepEqual(buildCapacitySummary(null, 'bad'), {used: 0, max: 0, truncated: false});
});

test('buildStorageCapacitySnapshot reports independent list status', () => {
    const snapshot = buildStorageCapacitySnapshot({favorites: Array(9).fill(0), pinned: Array(64).fill(0), favoriteGroups: ['a']}, {favorites: 10, pinned: 64, favoriteGroups: 4});
    assert.equal(snapshot.favorites.status, 'near');
    assert.equal(snapshot.pinned.status, 'near');
    assert.equal(snapshot.favoriteGroups.status, 'ok');
});

test('buildStorageCapacitySnapshot marks over-capacity lists and bounds malformed input', () => {
    const snapshot = buildStorageCapacitySnapshot({favorites: Array(2000000).fill(0)}, {favorites: 512, pinned: 64, favoriteGroups: 64});
    assert.equal(snapshot.favorites.status, 'over');
    assert.equal(snapshot.favorites.truncated, true);
    assert.equal(snapshot.favorites.used, 1000000);
    assert.equal(snapshot.pinned.used, 0);
});

test('normalizeStorageCapacitySnapshot recomputes status from trusted numeric fields', () => {
    const result = normalizeStorageCapacitySnapshot({favorites: {used: 9, max: 10, status: 'ok', truncated: false}});
    assert.equal(result.favorites.status, 'near');
    assert.equal(result.favorites.truncated, false);
});

test('normalizeStorageCapacitySnapshot drops unknown fields and fixes malformed values', () => {
    const result = normalizeStorageCapacitySnapshot({favorites: {used: 'bad', max: -2, extra: 'drop'}, unknown: {used: 4}});
    assert.deepEqual(Object.keys(result), ['favorites', 'pinned', 'favoriteGroups']);
    assert.deepEqual(result.favorites, {used: 0, max: 0, truncated: false, status: 'ok'});
});

test('normalizeStorageCapacitySnapshot caps huge usage and derives over state', () => {
    const result = normalizeStorageCapacitySnapshot({pinned: {used: 9000000, max: 64, truncated: false}});
    assert.equal(result.pinned.used, 1000000);
    assert.equal(result.pinned.status, 'over');
    assert.equal(result.pinned.truncated, true);
});

test('serializeStorageCapacitySnapshot is deterministic and schema-shaped', () => {
    const serialized = serializeStorageCapacitySnapshot({pinned: {used: 2, max: 10}, favorites: {used: 9, max: 10}});
    assert.equal(serialized, '{"favorites":{"used":9,"max":10,"truncated":false,"status":"near"},"pinned":{"used":2,"max":10,"truncated":false,"status":"ok"},"favoriteGroups":{"used":0,"max":0,"truncated":false,"status":"ok"}}');
});

test('serializeStorageCapacitySnapshot tolerates malformed input without throwing', () => {
    assert.doesNotThrow(() => serializeStorageCapacitySnapshot(null));
    assert.deepEqual(JSON.parse(serializeStorageCapacitySnapshot('bad')), normalizeStorageCapacitySnapshot({}));
});

test('serializeStorageCapacitySnapshot does not mutate source objects', () => {
    const source = {favorites: {used: 3, max: 5, status: 'over'}};
    const before = JSON.stringify(source);
    serializeStorageCapacitySnapshot(source);
    assert.equal(JSON.stringify(source), before);
});

test('parseStorageCapacitySnapshot restores valid serialized snapshots', () => {
    const input = {favorites: {used: 9, max: 10, status: 'ok'}};
    assert.deepEqual(parseStorageCapacitySnapshot(serializeStorageCapacitySnapshot(input)), normalizeStorageCapacitySnapshot(input));
});

test('parseStorageCapacitySnapshot safely handles invalid JSON and non-strings', () => {
    const empty = normalizeStorageCapacitySnapshot({});
    assert.deepEqual(parseStorageCapacitySnapshot('{bad'), empty);
    assert.deepEqual(parseStorageCapacitySnapshot(null), empty);
});

test('parseStorageCapacitySnapshot rejects oversized payloads before parsing', () => {
    assert.deepEqual(parseStorageCapacitySnapshot('x'.repeat(256001)), normalizeStorageCapacitySnapshot({}));
});

test('mergeStorageCapacitySnapshots takes per-bucket maxima and recomputes status', () => {
    const merged = mergeStorageCapacitySnapshots(
        {favorites: {used: 5, max: 10}, pinned: {used: 2, max: 4}},
        {favorites: {used: 9, max: 8}, favoriteGroups: {used: 3, max: 4}},
    );
    assert.equal(merged.favorites.used, 9);
    assert.equal(merged.favorites.max, 10);
    assert.equal(merged.favorites.status, 'near');
    assert.equal(merged.pinned.used, 2);
    assert.equal(merged.favoriteGroups.used, 3);
});

test('mergeStorageCapacitySnapshots ignores malformed sources and is deterministic', () => {
    const first = mergeStorageCapacitySnapshots(null, {pinned: {used: 1, max: 2}});
    const second = mergeStorageCapacitySnapshots({pinned: {used: 1, max: 2}}, null);
    assert.deepEqual(first, second);
});

test('diffStorageCapacitySnapshots reports bounded per-bucket deltas', () => {
    const diff = diffStorageCapacitySnapshots(
        {favorites: {used: 1, max: 10}, pinned: {used: 6, max: 10}},
        {favorites: {used: 9, max: 10}, pinned: {used: 10, max: 10}},
    );
    assert.deepEqual(diff.favorites, {usedDelta: 8, maxDelta: 0, statusChanged: true, truncatedChanged: false});
    assert.deepEqual(diff.pinned, {usedDelta: 4, maxDelta: 0, statusChanged: true, truncatedChanged: false});
});

test('diffStorageCapacitySnapshots normalizes malformed snapshots before diffing', () => {
    const diff = diffStorageCapacitySnapshots(null, {favoriteGroups: {used: 'bad', max: 4}});
    assert.deepEqual(diff.favoriteGroups, {usedDelta: 0, maxDelta: 4, statusChanged: false, truncatedChanged: false});
});

test('summarizeStorageCapacityDiff reports changed buckets and direction counts', () => {
    const summary = summarizeStorageCapacityDiff(
        {favorites: {used: 1, max: 10}, pinned: {used: 8, max: 10}},
        {favorites: {used: 9, max: 10}, pinned: {used: 2, max: 10}},
    );
    assert.deepEqual(summary, {changedBuckets: ['favorites', 'pinned'], changedCount: 2, increased: 1, decreased: 1, statusChanges: 1, changed: true});
});

test('summarizeStorageCapacityDiff returns a stable empty summary', () => {
    assert.deepEqual(summarizeStorageCapacityDiff({}, {}), {changedBuckets: [], changedCount: 0, increased: 0, decreased: 0, statusChanges: 0, changed: false});
});

test('classifyStorageCapacityRisk escalates over to critical and near to warning', () => {
    assert.equal(classifyStorageCapacityRisk({favorites: {used: 2, max: 2}}), 'warning');
    assert.equal(classifyStorageCapacityRisk({pinned: {used: 9, max: 2}}), 'critical');
    assert.equal(classifyStorageCapacityRisk({favorites: {used: 1, max: 10}}), 'normal');
});

test('classifyStorageCapacityRisk ignores untrusted status fields', () => {
    assert.equal(classifyStorageCapacityRisk({favorites: {used: 1, max: 10, status: 'critical'}}), 'normal');
});

test('buildStorageCapacityHealth aggregates usage and recommendations', () => {
    const health = buildStorageCapacityHealth({favorites: {used: 512, max: 512}, pinned: {used: 1, max: 64}});
    assert.deepEqual(health, {risk: 'warning', used: 513, max: 576, over: [], near: ['favorites'], recommendation: 'monitor'});
});

test('buildStorageCapacityHealth marks over buckets for trimming', () => {
    const health = buildStorageCapacityHealth({favoriteGroups: {used: 65, max: 64}});
    assert.equal(health.risk, 'critical');
    assert.deepEqual(health.over, ['favoriteGroups']);
    assert.equal(health.recommendation, 'trim');
});

test('normalizeStorageCapacityHealth filters buckets and recomputes risk', () => {
    const result = normalizeStorageCapacityHealth({risk: 'normal', used: '9', max: 10, over: ['pinned', 'pinned', 'bad'], near: ['pinned', 'favorites'], recommendation: 'none'});
    assert.deepEqual(result, {risk: 'critical', used: 9, max: 10, over: ['pinned'], near: ['favorites'], recommendation: 'trim'});
});

test('normalizeStorageCapacityHealth clamps counters and handles malformed input', () => {
    assert.deepEqual(normalizeStorageCapacityHealth({used: 9000000, max: -1, over: 'bad'}), {risk: 'normal', used: 3000000, max: 0, over: [], near: [], recommendation: 'none'});
});

test('serializeStorageCapacityHealth and parseStorageCapacityHealth round trip safely', () => {
    const source = {over: ['favorites'], used: 10, max: 20};
    assert.deepEqual(parseStorageCapacityHealth(serializeStorageCapacityHealth(source)), normalizeStorageCapacityHealth(source));
    assert.deepEqual(parseStorageCapacityHealth('{bad'), normalizeStorageCapacityHealth({}));
});

test('diffStorageCapacityHealth reports risk, direction, and bucket transitions', () => {
    const diff = diffStorageCapacityHealth(
        {risk: 'warning', used: 20, max: 30, near: ['favorites']},
        {risk: 'critical', used: 25, max: 32, over: ['pinned'], near: ['favorites']},
    );
    assert.equal(diff.riskChanged, true);
    assert.equal(diff.fromRisk, 'warning');
    assert.equal(diff.toRisk, 'critical');
    assert.equal(diff.direction, 'up');
    assert.equal(diff.usedDelta, 5);
    assert.deepEqual(diff.addedOver, ['pinned']);
});

test('diffStorageCapacityHealth returns stable zero diff for equal inputs', () => {
    const diff = diffStorageCapacityHealth({}, {});
    assert.equal(diff.riskChanged, false);
    assert.equal(diff.direction, 'stable');
    assert.deepEqual(diff.addedNear, []);
});

test('assessStorageCapacityTrend detects degrading and improving pressure', () => {
    assert.deepEqual(assessStorageCapacityTrend({used: 1, max: 10}, {used: 8, max: 10, near: ['favorites']}), {trend: 'degrading', riskDelta: 1, pressureDelta: 0.7, action: 'monitor'});
    assert.equal(assessStorageCapacityTrend({used: 9, max: 10, near: ['favorites']}, {used: 1, max: 10}).trend, 'improving');
});

test('assessStorageCapacityTrend remains stable for small pressure changes', () => {
    const result = assessStorageCapacityTrend({used: 4, max: 10}, {used: 4.4, max: 10});
    assert.equal(result.trend, 'stable');
    assert.equal(result.riskDelta, 0);
});

test('normalizeStorageCapacityTrend fixes enums and bounds numbers', () => {
    assert.deepEqual(normalizeStorageCapacityTrend({trend: 'bad', riskDelta: 9, pressureDelta: 2, action: 'bad'}), {trend: 'stable', riskDelta: 2, pressureDelta: 1, action: 'none'});
});

test('serializeStorageCapacityTrend and parseStorageCapacityTrend are deterministic', () => {
    const value = {trend: 'degrading', riskDelta: 1, pressureDelta: 0.123456, action: 'trim'};
    assert.deepEqual(parseStorageCapacityTrend(serializeStorageCapacityTrend(value)), normalizeStorageCapacityTrend(value));
});

test('buildStorageCapacityReport composes health, trend, and summary', () => {
    const report = buildStorageCapacityReport({favorites: {used: 1, max: 10}}, {favorites: {used: 9, max: 10}});
    assert.equal(report.version, 1);
    assert.equal(report.health.risk, 'warning');
    assert.equal(report.trend.trend, 'degrading');
    assert.equal(report.summary.changed, true);
});

test('normalizeStorageCapacityReport fixes summary counts and buckets', () => {
    const report = normalizeStorageCapacityReport({version: 9, summary: {changedBuckets: ['favorites', 'bad', 'favorites'], increased: 9, decreased: -1, statusChanges: 8}});
    assert.deepEqual(report.summary, {changedBuckets: ['favorites'], changedCount: 1, increased: 3, decreased: 0, statusChanges: 3, changed: true});
});

test('serializeStorageCapacityReport and parseStorageCapacityReport round trip', () => {
    const report = buildStorageCapacityReport({}, {used: 1, max: 10});
    assert.deepEqual(parseStorageCapacityReport(serializeStorageCapacityReport(report)), normalizeStorageCapacityReport(report));
});

test('summarizeStorageCapacityReports aggregates bounded risk and trend counts', () => {
    const reports = [
        buildStorageCapacityReport({}, {favorites: {used: 1, max: 10}}),
        buildStorageCapacityReport({}, {favorites: {used: 9, max: 10}}),
    ];
    const summary = summarizeStorageCapacityReports(reports);
    assert.equal(summary.samples, 2);
    assert.equal(summary.latestRisk, 'warning');
    assert.equal(summary.riskCounts.warning, 1);
    assert.equal(summary.trendCounts.degrading, 2);
});

test('summarizeStorageCapacityReports caps history and handles malformed input', () => {
    const summary = summarizeStorageCapacityReports(Array(100).fill(null));
    assert.equal(summary.samples, 64);
    assert.equal(summary.riskCounts.normal, 64);
    assert.equal(summarizeStorageCapacityReports(null).samples, 0);
});

test('trimStorageCapacityReportHistory keeps newest unique reports within cap', () => {
    const first = buildStorageCapacityReport({}, {favorites: {used: 1, max: 10}});
    const second = buildStorageCapacityReport({}, {favorites: {used: 9, max: 10}});
    const result = trimStorageCapacityReportHistory([first, second, first], 2);
    assert.equal(result.reports.length, 2);
    assert.deepEqual(result.reports, [second, first]);
    assert.equal(result.changed, true);
});

test('trimStorageCapacityReportHistory safely handles non-array and invalid caps', () => {
    assert.deepEqual(trimStorageCapacityReportHistory(null), {reports: [], changed: false});
    const result = trimStorageCapacityReportHistory([{}], 0);
    assert.equal(result.reports.length, 1);
});

test('selectStorageCapacityReportWindow returns recent reports with metadata', () => {
    const reports = Array.from({length: 20}, (_, index) => ({health: {used: index, max: 100}}));
    const result = selectStorageCapacityReportWindow(reports, 5);
    assert.equal(result.reports.length, 5);
    assert.equal(result.start, 15);
    assert.equal(result.total, 20);
    assert.equal(result.truncated, true);
});

test('selectStorageCapacityReportWindow handles empty and invalid limits safely', () => {
    assert.deepEqual(selectStorageCapacityReportWindow(null), {reports: [], start: 0, end: 0, total: 0, truncated: false});
    assert.equal(selectStorageCapacityReportWindow([{}], 0).reports.length, 1);
});

test('summarizeStorageCapacityReportWindow retains metadata and latest status', () => {
    const window = selectStorageCapacityReportWindow([{health: {used: 9, max: 10, near: ['favorites']}}], 4);
    const summary = summarizeStorageCapacityReportWindow(window);
    assert.equal(summary.samples, 1);
    assert.equal(summary.latestRisk, 'warning');
    assert.equal(summary.total, 1);
});

test('summarizeStorageCapacityReportWindow clamps malformed metadata', () => {
    const summary = summarizeStorageCapacityReportWindow({reports: [], start: -5, end: -1, total: 999, truncated: 'yes'});
    assert.deepEqual(summary, {start: 0, end: 0, total: 64, truncated: false, samples: 0, latestRisk: 'normal', latestTrend: 'stable', criticalSamples: 0, degradingSamples: 0, improvingSamples: 0});
});

test('normalizeStorageCapacityReportWindow fixes metadata and caps reports', () => {
    const result = normalizeStorageCapacityReportWindow({reports: Array.from({length: 20}, (_, i) => ({health: {used: i, max: 100}})), start: 2, total: 20});
    assert.equal(result.reports.length, 16);
    assert.equal(result.start, 2);
    assert.equal(result.end, 18);
    assert.equal(result.total, 20);
});

test('serializeStorageCapacityReportWindow and parseStorageCapacityReportWindow round trip safely', () => {
    const value = normalizeStorageCapacityReportWindow({reports: [{}]});
    assert.deepEqual(parseStorageCapacityReportWindow(serializeStorageCapacityReportWindow(value)), value);
    assert.equal(parseStorageCapacityReportWindow('{bad').reports.length, 0);
});

test('validateStorageCapacityReportWindow accepts bounded shape', () => {
    assert.deepEqual(validateStorageCapacityReportWindow({reports: [], start: 0, end: 0, total: 0, truncated: false}), {valid: true, reason: 'ok', size: 0});
});

test('validateStorageCapacityReportWindow returns stable reasons for malformed shape', () => {
    assert.equal(validateStorageCapacityReportWindow(null).reason, 'invalid_input');
    assert.equal(validateStorageCapacityReportWindow({reports: Array(17).fill({}), start: 0, end: 17, total: 17, truncated: true}).reason, 'reports_overflow');
    assert.equal(validateStorageCapacityReportWindow({reports: [], start: 3, end: 1, total: 1, truncated: false}).reason, 'bounds_order');
});

test('validateStorageCapacityReport accepts a complete versioned envelope', () => {
    const report = buildStorageCapacityReport({}, {});
    assert.deepEqual(validateStorageCapacityReport(report), {valid: true, reason: 'ok'});
});

test('validateStorageCapacityReport returns stable section reasons', () => {
    assert.equal(validateStorageCapacityReport(null).reason, 'invalid_input');
    assert.equal(validateStorageCapacityReport({version: 9}).reason, 'invalid_version');
    assert.equal(validateStorageCapacityReport({version: 1}).reason, 'health_missing');
    assert.equal(validateStorageCapacityReport({version: 1, health: {}}).reason, 'trend_missing');
    assert.equal(validateStorageCapacityReport({version: 1, health: {}, trend: {}}).reason, 'summary_missing');
});

// ── clampNum ──
test('clampNum: numbers within range pass through', () => {
    assert.equal(clampNum(5, 0, 10, 0), 5);
    assert.equal(clampNum(0, 0, 10, 99), 0);
    assert.equal(clampNum(10, 0, 10, 99), 10);
});

test('clampNum: out-of-range clamps to min/max', () => {
    assert.equal(clampNum(-5, 0, 10, 99), 0);
    assert.equal(clampNum(15, 0, 10, 99), 10);
});

test('clampNum: NaN / non-numeric string fallback', () => {
    assert.equal(clampNum('abc', 0, 10, 7), 7);
    assert.equal(clampNum(NaN, 0, 10, 7), 7);
    assert.equal(clampNum(undefined, 0, 10, 7), 7);
    assert.equal(clampNum(null, 0, 10, 7), 7);
});

test('clampNum: numeric string parses correctly', () => {
    assert.equal(clampNum('5', 0, 10, 0), 5);
    assert.equal(clampNum('-5', 0, 10, 99), 0); // 夹到 min
});

// ── stableSortBy ──
test('stableSortBy: ascending by key', () => {
    const arr = [{k: 'b'}, {k: 'a'}, {k: 'c'}];
    const result = stableSortBy(arr, (x) => x.k);
    assert.deepEqual(result.map(x => x.k), ['a', 'b', 'c']);
});

test('stableSortBy: stable when keys equal', () => {
    const arr = [{k: 'a', i: 1}, {k: 'a', i: 2}, {k: 'a', i: 3}];
    const result = stableSortBy(arr, (x) => x.k);
    assert.deepEqual(result.map(x => x.i), [1, 2, 3]);
});

test('stableSortBy: empty array passes through', () => {
    assert.deepEqual(stableSortBy([], (x) => x), []);
});

test('stableSortBy: numeric key', () => {
    const arr = [{v: 3}, {v: 1}, {v: 2}];
    const result = stableSortBy(arr, (x) => x.v);
    assert.deepEqual(result.map(x => x.v), [1, 2, 3]);
});

// ── normalizeSortBy ──
test('normalizeSortBy: known value passes through', () => {
    const allowed = ['mru', 'layout', 'titleAsc'];
    assert.equal(normalizeSortBy('mru', allowed, 'mru'), 'mru');
    assert.equal(normalizeSortBy('titleAsc', allowed, 'mru'), 'titleAsc');
});

test('normalizeSortBy: unknown / null / undefined fallback', () => {
    const allowed = ['mru', 'layout'];
    assert.equal(normalizeSortBy('unknown', allowed, 'mru'), 'mru');
    assert.equal(normalizeSortBy(null, allowed, 'mru'), 'mru');
    assert.equal(normalizeSortBy(undefined, allowed, 'mru'), 'mru');
});

// ── groupFavoritesByGroup ──
test('groupFavoritesByGroup: groups by fav.group, preserves registry order', () => {
    const favs = [
        {key: 'a', group: '工作'},
        {key: 'b', group: '生活'},
        {key: 'c', group: '工作'},
        {key: 'd', group: ''},          // 未命名 → "" 组
    ];
    const groups = groupFavoritesByGroup(favs, ['工作', '生活']);
    assert.deepEqual(
        Array.from(groups.keys()),
        ['工作', '生活', ''],
        '注册表顺序优先，未注册组（""）追加在尾部'
    );
    assert.equal(groups.get('工作').length, 2);
    assert.equal(groups.get('生活').length, 1);
    assert.equal(groups.get('').length, 1);
    assert.equal(groups.get('工作')[0].key, 'a');
    assert.equal(groups.get('生活')[0].key, 'b');
});

test('groupFavoritesByGroup: keeps empty groups from registry (先建组再添加)', () => {
    const favs = [];
    const groups = groupFavoritesByGroup(favs, ['工作', '生活', '学习']);
    assert.equal(groups.size, 3);
    assert.deepEqual(Array.from(groups.keys()), ['工作', '生活', '学习']);
    groups.forEach((items) => assert.equal(items.length, 0));
});

test('groupFavoritesByGroup: registers new groups not in registry (defensive)', () => {
    // 已存在的收藏项 group='意外' 但注册表没有（理论上不会发生，但聚合要防御性兜住）
    const favs = [{key: 'x', group: '意外'}];
    const groups = groupFavoritesByGroup(favs, ['工作']);
    assert.equal(groups.size, 2);
    assert.equal(groups.get('意外').length, 1);
});

test('groupFavoritesByGroup: all favorites ungrouped when registry empty', () => {
    const favs = [
        {key: 'a', group: ''},
        {key: 'b', group: undefined},     // 视为未命名
    ];
    const groups = groupFavoritesByGroup(favs, []);
    assert.equal(groups.size, 1);
    assert.equal(groups.get('').length, 2);
});

// ── resolveIconFallback ──
test('resolveIconFallback: empty / whitespace fallback to iconFile', () => {
    assert.deepEqual(resolveIconFallback(''), {type: 'svg', value: 'iconFile'});
    assert.deepEqual(resolveIconFallback('   '), {type: 'svg', value: 'iconFile'});
});

test('resolveIconFallback: svg icon names pass through', () => {
    assert.deepEqual(resolveIconFallback('iconFile'), {type: 'svg', value: 'iconFile'});
    assert.deepEqual(resolveIconFallback('iconPDF'), {type: 'svg', value: 'iconPDF'});
    assert.deepEqual(resolveIconFallback('iconMarkdown'), {type: 'svg', value: 'iconMarkdown'});
});

test('resolveIconFallback: single characters treated as emoji', () => {
    assert.deepEqual(resolveIconFallback('📄'), {type: 'emoji', value: '📄'});
    assert.deepEqual(resolveIconFallback('⭐'), {type: 'emoji', value: '⭐'});
});

test('resolveIconFallback: hex codepoints converted to emoji', () => {
    assert.deepEqual(resolveIconFallback('1f4c4'), {type: 'emoji', value: '📄'});
    assert.deepEqual(resolveIconFallback('1F4C4'), {type: 'emoji', value: '📄'});
    assert.deepEqual(resolveIconFallback('2b50'), {type: 'emoji', value: '⭐'});
});

test('resolveIconFallback: ZWJ family emoji counts as single grapheme', () => {
    assert.deepEqual(resolveIconFallback('👨‍👩‍👧'), {type: 'emoji', value: '👨‍👩‍👧'});
});

test('resolveIconFallback: skin-tone emoji counts as single grapheme', () => {
    assert.deepEqual(resolveIconFallback('👍🏽'), {type: 'emoji', value: '👍🏽'});
});

test('resolveIconFallback: regular two-char strings still fall back to iconFile', () => {
    assert.deepEqual(resolveIconFallback('ab'), {type: 'svg', value: 'iconFile'});
});

test('resolveIconFallback: invalid multi-char string falls back to iconFile', () => {
    assert.deepEqual(resolveIconFallback('not-an-icon'), {type: 'svg', value: 'iconFile'});
    assert.deepEqual(resolveIconFallback('icon'), {type: 'svg', value: 'iconFile'}); // 只有前缀没有名字
});

test('resolveIconReference: accepts custom plugin symbols only when registered', () => {
    const available = new Set(['iconFile', 'iconPlugin', 'siyuan-media-player-icon', 'lucide-book-search']);
    assert.deepEqual(resolveIconReference('siyuan-media-player-icon', available), {
        type: 'svg', value: 'siyuan-media-player-icon',
    });
    assert.deepEqual(resolveIconReference('lucide-book-search', available), {
        type: 'svg', value: 'lucide-book-search',
    });
    assert.deepEqual(resolveIconReference('missing-plugin-icon', available, ['iconPlugin', 'iconFile']), {
        type: 'svg', value: 'iconPlugin',
    });
});

test('resolveIconReference: never treats arbitrary element ids as icons', () => {
    const available = new Set(['iconFile', 'plugin-panel']);
    assert.deepEqual(resolveIconReference('plugin-panel', new Set(['iconFile']), ['iconPlugin', 'iconFile']), {
        type: 'svg', value: 'iconFile',
    });
});

test('resolveIconReference: preserves emoji values', () => {
    assert.deepEqual(resolveIconReference('⭐', new Set(['iconFile'])), {type: 'emoji', value: '⭐'});
});

// ── tab ordering ──
test('sortItems: supports title, updated, MRU and reverse layout without mutating input', () => {
    const items = [{id: 'a', title: 'Doc 10', root: 'a'}, {id: 'b', title: 'Doc 2', root: 'b'}, {id: 'c', title: 'Doc 1', root: 'c'}];
    const options = {titleOf: x => x.title, rootIdOf: x => x.root, pinKeyOf: x => x.root, updatedMap: {a: '2024-01-01', b: '2024-03-01', c: '2024-02-01'}};
    assert.deepEqual(sortItems(items, 'titleAsc', [], options).map(x => x.id), ['c', 'b', 'a']);
    assert.deepEqual(sortItems(items, 'updatedDesc', [], options).map(x => x.id), ['b', 'c', 'a']);
    assert.deepEqual(sortItems(items, 'mru', ['c', 'a'], options).map(x => x.id), ['c', 'a', 'b']);
    assert.deepEqual(sortItems(items, 'layoutDesc', [], options).map(x => x.id), ['c', 'b', 'a']);
    assert.deepEqual(items.map(x => x.id), ['a', 'b', 'c']);
});

test('sortGroupItems: pinned entries stay first while the rest follow selected ordering', () => {
    const items = [{id: 'a', title: 'Z', key: 'a'}, {id: 'b', title: 'A', key: 'b'}, {id: 'c', title: 'B', key: 'c'}];
    const result = sortGroupItems(items, 'titleAsc', [], new Set(['a']), {}, {titleOf: x => x.title, pinKeyOf: x => x.key});
    assert.deepEqual(result.map(x => x.id), ['a', 'b', 'c']);
    assert.notEqual(result, items);
});

test('resolveQuickActionSurfaceState: normalizes display and collapse per surface', () => {
    const settings = {
        quickActionsDisplayDesktop: 'icons', quickActionsDisplaySidebar: 'hidden', quickActionsDisplayMobile: 'full',
        quickActionsCollapsedDesktopRight: true, quickActionsCollapsedDesktopBottom: false,
        quickActionsCollapsedSidebar: true, quickActionsCollapsedMobile: false,
    };
    assert.deepEqual(resolveQuickActionSurfaceState('desktop', settings, '.sw__quick-rail'), {
        surface: 'desktop', display: 'icons', isRightRail: true, collapsed: true,
    });
    assert.deepEqual(resolveQuickActionSurfaceState('sidebar', settings), {
        surface: 'sidebar', display: 'hidden', isRightRail: false, collapsed: true,
    });
    assert.deepEqual(resolveQuickActionSurfaceState('unknown', {}), {
        surface: 'desktop', display: 'full', isRightRail: false, collapsed: false,
    });
});

test('normalizeQuickActionText: collapses controls and bounds metadata', () => {
    assert.equal(normalizeQuickActionText('  思播\n\u0000播放器  ', 80), '思播 播放器');
    assert.equal(normalizeQuickActionText('abcdefgh', 4), 'abcd');
    assert.equal(normalizeQuickActionText(null), '');
});

// ── buildTabGroupsByParent ──
// 在 jsdom 下构造 HTMLElement 作 key，避免 node:test 无 DOM 的环境失败
function makeEl() {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    return dom.window.document.body;
}

test('buildTabGroupsByParent: groups by parent.element', () => {
    const fallback = makeEl();
    const w1 = makeEl();
    const w2 = makeEl();
    const tabs = [
        {id: 'a', parent: {element: w1, headersElement: w1}},
        {id: 'b', parent: {element: w2, headersElement: w2}},
        {id: 'c', parent: {element: w1, headersElement: w1}},
    ];
    const groups = buildTabGroupsByParent(tabs, fallback);
    assert.equal(groups.size, 2, 'two windows → two groups');
    assert.equal(groups.get(w1).length, 2);
    assert.equal(groups.get(w2).length, 1);
    assert.equal(groups.get(w1)[0].tab.id, 'a');
    assert.equal(groups.get(w1)[1].tab.id, 'c');
});

test('buildTabGroupsByParent: falls back to headersElement when element missing', () => {
    const fallback = makeEl();
    const h = makeEl();
    const tabs = [{id: 'x', parent: {headersElement: h}}];
    const groups = buildTabGroupsByParent(tabs, fallback);
    assert.equal(groups.size, 1);
    assert.equal(groups.get(h).length, 1);
});

test('buildTabGroupsByParent: missing parent uses fallback key (mobile pseudo tabs)', () => {
    const fallback = makeEl();
    const tabs = [
        {id: 'a'},                       // 无 parent
        {id: 'b', parent: {}},
    ];
    const groups = buildTabGroupsByParent(tabs, fallback);
    assert.equal(groups.size, 1);
    assert.equal(groups.get(fallback).length, 2);
});

test('buildTabGroupsByParent: empty tabs returns empty map', () => {
    const fallback = makeEl();
    const groups = buildTabGroupsByParent([], fallback);
    assert.equal(groups.size, 0);
});

// ── resolveTabRootId ──
test('resolveTabRootId: current loaded model wins over stale init data', () => {
    const tab = {
        model: {editor: {block: {rootID: '20240101120001-current'}}},
        headElement: {getAttribute: () => JSON.stringify({instance: 'Editor', rootId: '20240101120000-stale'})},
    };
    assert.equal(resolveTabRootId(tab), '20240101120001-current');
    tab.model.editor.block.rootID = '20240101120002-nextdoc';
    assert.equal(resolveTabRootId(tab), '20240101120002-nextdoc');
});

test('resolveTabRootId: supports nested protyle model and lazy init data', () => {
    assert.equal(resolveTabRootId({model: {editor: {protyle: {block: {rootID: '20240101120000-nested1'}}}}}),
        '20240101120000-nested1');
    assert.equal(resolveTabRootId({
        headElement: {getAttribute: () => JSON.stringify({instance: 'Editor', blockId: '20240101120000-lazy001'})},
    }), '20240101120000-lazy001');
});

test('resolveTabRootId: rejects malformed and non-editor init data', () => {
    assert.equal(resolveTabRootId({headElement: {getAttribute: () => '{broken'}}), null);
    assert.equal(resolveTabRootId({headElement: {getAttribute: () => JSON.stringify({instance: 'Asset', rootId: 'x'})}}), null);
    assert.equal(resolveTabRootId({headElement: {getAttribute: () => JSON.stringify({instance: 'Editor', rootId: 123})}}), null);
    assert.equal(resolveTabRootId({}), null);
});

// ── planGroupOpenFavorites ──
test('planGroupOpenFavorites: dedupes roots and excludes opened legacy/root keys', () => {
    const favorites = [
        {key: 'legacy-open', rootId: 'root-a'},
        {key: 'root-b', rootId: 'root-b'},
        {key: 'new-1', rootId: 'root-c'},
        {key: 'new-duplicate', rootId: 'root-c'},
    ];
    const result = planGroupOpenFavorites(favorites, new Set(['legacy-open', 'root-b']), (favorite) => favorite.rootId);
    assert.deepEqual(result, {targets: [{favorite: favorites[2], rootId: 'root-c'}], invalid: 0});
    assert.equal(resolveFavoriteRootId({rootId: 'root-a', key: 'tab-uuid'}), '');
    assert.equal(resolveFavoriteRootId({rootId: '20260906120000-aaaaaaa', key: 'tab-uuid'}), '20260906120000-aaaaaaa');
    assert.equal(resolveFavoriteRootId({rootId: 'tab-uuid', key: '20260906120001-bbbbbbb'}), '20260906120001-bbbbbbb');
});

test('planGroupOpenFavorites: reports invalid entries without counting duplicates as failures', () => {
    const favorites = [
        {key: 'invalid-1', rootId: ''},
        {key: 'valid-1', rootId: 'root-a'},
        {key: 'valid-2', rootId: 'root-a'},
        {key: 'invalid-2', rootId: ''},
    ];
    const result = planGroupOpenFavorites(favorites, new Set(), (favorite) => favorite.rootId);
    assert.deepEqual(result.targets, [{favorite: favorites[1], rootId: 'root-a'}]);
    assert.equal(result.invalid, 2);
});

// ── sanitizeDocIds ──
test('sanitizeDocIds: standard siyuan doc ids pass through', () => {
    assert.deepEqual(sanitizeDocIds(['20240101120000-abcdefg']), ['20240101120000-abcdefg']);
});

test('sanitizeDocIds: filters non-id strings (injection chars)', () => {
    const out = sanitizeDocIds(["x'--", "20240101120000-abcdefg')", '2024010112000-abcdefg', '20240101120000-ABCDEFG', 'DROP TABLE']);
    assert.deepEqual(out, []);
});

test('sanitizeDocIds: dedupes while keeping first-seen order', () => {
    const out = sanitizeDocIds(['20240101120000-abcdefg', '20240101120001-hijklmn', '20240101120000-abcdefg']);
    assert.deepEqual(out, ['20240101120000-abcdefg', '20240101120001-hijklmn']);
});

test('sanitizeDocIds: skips null / undefined / non-string entries', () => {
    const out = sanitizeDocIds([null, undefined, 123, {}, '20240101120000-abcdefg']);
    assert.deepEqual(out, ['20240101120000-abcdefg']);
});

test('sanitizeDocIds: empty or null input returns empty array', () => {
    assert.deepEqual(sanitizeDocIds([]), []);
    assert.deepEqual(sanitizeDocIds(null), []);
    assert.deepEqual(sanitizeDocIds(undefined), []);
});

// ── capMru ──
test('capMru: filters non-string / empty entries and dedupes keeping first-seen order', () => {
    const out = capMru(['b', 'a', null, undefined, 123, '', 'b', 'a', 'c'], 100);
    assert.deepEqual(out, ['b', 'a', 'c']);
});

test('capMru: truncates from the tail beyond max (newest first)', () => {
    const out = capMru(['n3', 'n2', 'n1', 'n0'], 3);
    assert.deepEqual(out, ['n3', 'n2', 'n1']);
});

test('capMru: non-positive / non-number max disables truncation', () => {
    assert.deepEqual(capMru(['a', 'b'], 0), ['a', 'b']);
    assert.deepEqual(capMru(['a', 'b'], -1), ['a', 'b']);
    assert.deepEqual(capMru(['a', 'b'], NaN), ['a', 'b']);
    assert.deepEqual(capMru(['a', 'b'], undefined), ['a', 'b']);
});

test('capMru: empty or null input returns empty array', () => {
    assert.deepEqual(capMru([], 200), []);
    assert.deepEqual(capMru(null, 200), []);
    assert.deepEqual(capMru(undefined, 200), []);
});

// ── sanitizeStringList ──
test('sanitizeStringList: filters non-string / empty entries and dedupes keeping order', () => {
    const out = sanitizeStringList(['b', 'a', null, undefined, 123, '', 'b', 'a', 'c']);
    assert.deepEqual(out, {items: ['b', 'a', 'c'], changed: true});
});

test('sanitizeStringList: clean list passes through unchanged', () => {
    assert.deepEqual(sanitizeStringList(['a', 'b', 'c']), {items: ['a', 'b', 'c'], changed: false});
});

test('sanitizeStringList: empty array unchanged', () => {
    assert.deepEqual(sanitizeStringList([]), {items: [], changed: false});
});

test('sanitizeStringList: non-array returns empty list without changed (first run, avoid write-back)', () => {
    assert.deepEqual(sanitizeStringList(undefined), {items: [], changed: false});
    assert.deepEqual(sanitizeStringList(null), {items: [], changed: false});
    assert.deepEqual(sanitizeStringList('x'), {items: [], changed: false});
    assert.deepEqual(sanitizeStringList({}), {items: [], changed: false});
});

test('sanitizeStringList: optional max keeps newest-first order', () => {
    assert.deepEqual(sanitizeStringList(['a', 'b', 'c'], 2), {items: ['a', 'b'], changed: true});
    assert.deepEqual(sanitizeStringList(['a', 'b'], 2), {items: ['a', 'b'], changed: false});
});

test('sanitizeStringList: invalid max does not unexpectedly drop entries', () => {
    assert.equal(sanitizeStringList(['a', 'b'], 0).items.length, 2);
    assert.equal(sanitizeStringList(['a', 'b'], 'bad').items.length, 2);
});

// ── sanitizeFavorites ──
test('sanitizeFavorites: valid entries pass through unchanged', () => {
    const input = [
        {key: '20240101120000-abcdefg', title: '文档 A', rootId: '20240101120000-abcdefg', group: '工作'},
        {key: 'tab-1', title: '页签 B', rootId: null, group: ''},
    ];
    assert.deepEqual(sanitizeFavorites(input), {items: input, changed: false});
});

test('sanitizeFavorites: drops non-object entries and entries with empty/non-string key', () => {
    const out = sanitizeFavorites([
        null,
        42,
        'str',
        {title: 'no key'},
        {key: '', title: 'empty key'},
        {key: 'ok', title: 'kept'},
    ]);
    assert.deepEqual(out.items, [{key: 'ok', title: 'kept', rootId: null, group: ''}]);
    assert.equal(out.changed, true);
});

test('sanitizeFavorites: dedupes by key keeping first occurrence', () => {
    const out = sanitizeFavorites([
        {key: 'k1', title: 'first', rootId: 'r1', group: 'g'},
        {key: 'k1', title: 'second', rootId: 'r2', group: ''},
    ]);
    assert.deepEqual(out.items, [{key: 'k1', title: 'first', rootId: 'r1', group: 'g'}]);
    assert.equal(out.changed, true);
});

test('sanitizeFavorites: normalizes missing / malformed fields', () => {
    const out = sanitizeFavorites([
        {key: 'k1'},                                   // title/rootId/group 全缺
        {key: 'k2', title: 123, rootId: '', group: 0}, // 类型错误
    ]);
    assert.deepEqual(out.items, [
        {key: 'k1', title: '', rootId: null, group: ''},
        {key: 'k2', title: '', rootId: null, group: ''},
    ]);
    assert.equal(out.changed, true);
});

test('sanitizeFavorites: empty rootId string normalizes to null, rootId null stays null', () => {
    const out = sanitizeFavorites([
        {key: 'k1', title: 't', rootId: '', group: 'g'},
        {key: 'k2', title: 't', rootId: null, group: 'g'},
    ]);
    assert.deepEqual(out.items, [
        {key: 'k1', title: 't', rootId: null, group: 'g'},
        {key: 'k2', title: 't', rootId: null, group: 'g'},
    ]);
    assert.equal(out.changed, true); // 第一条 rootId 被归一
});

test('sanitizeFavorites: non-array returns empty list without changed (first run, avoid write-back)', () => {
    assert.deepEqual(sanitizeFavorites(undefined), {items: [], changed: false});
    assert.deepEqual(sanitizeFavorites(null), {items: [], changed: false});
    assert.deepEqual(sanitizeFavorites({}), {items: [], changed: false});
});

test('sanitizeFavorites: optional max preserves first valid entries', () => {
    const out = sanitizeFavorites([
        {key: 'k1', title: 'one'}, {key: 'k2', title: 'two'}, {key: 'k3', title: 'three'},
    ], 2);
    assert.deepEqual(out.items.map((item) => item.key), ['k1', 'k2']);
    assert.equal(out.changed, true);
});

test('sanitizeFavorites: duplicate removal happens before capacity truncation', () => {
    const out = sanitizeFavorites([
        {key: 'k1'}, {key: 'k1'}, {key: 'k2'}, {key: 'k3'},
    ], 2);
    assert.deepEqual(out.items.map((item) => item.key), ['k1', 'k2']);
});

test('sanitizeFavorites: invalid max keeps backwards-compatible unbounded behavior', () => {
    const input = [{key: 'k1'}, {key: 'k2'}];
    assert.equal(sanitizeFavorites(input, 0).items.length, 2);
    assert.equal(sanitizeFavorites(input, 'bad').items.length, 2);
});

test('sanitizeOpenHistory: migrates root keys and removes duplicate document entries', () => {
    const root = '20240101120000-abcdefg';
    const out = sanitizeOpenHistory([
        {key: 'tab-1', rootId: root, title: '文档', ts: 3},
        {key: root, rootId: root, title: '重复', ts: 2},
        {key: 'tab-2', title: '插件页签', ts: 1},
    ], 50);
    assert.deepEqual(out.items, [
        {key: root, rootId: root, title: '文档', ts: 3},
        {key: 'tab-2', rootId: null, title: '插件页签', ts: 1},
    ]);
    assert.equal(out.changed, true);
});

test('sanitizeOpenHistory: caps entries and preserves first-seen order', () => {
    const out = sanitizeOpenHistory([
        {key: 'a', title: 'A'}, {key: 'b', title: 'B'}, {key: 'c', title: 'C'},
    ], 2);
    assert.deepEqual(out.items.map((item) => item.key), ['a', 'b']);
    assert.equal(out.changed, true);
});

// ── isSuccessfulMobileTabsResult ──
test('isSuccessfulMobileTabsResult: supports old undefined and new success results', () => {
    assert.equal(isSuccessfulMobileTabsResult(undefined), true);
    assert.equal(isSuccessfulMobileTabsResult('success'), true);
});

test('isSuccessfulMobileTabsResult: rejects explicit MobileTabs failures', () => {
    for (const result of ['cancelled', 'invalid', 'failed', null, 'unexpected']) {
        assert.equal(isSuccessfulMobileTabsResult(result), false);
    }
});
