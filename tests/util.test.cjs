// 单元测试：用 Node 22 内置 node:test 运行 util.js（plain JS）零依赖
// 后续如需测试 TS 源码，可以走 src/index.ts 的 plain JS 单元 + DOM 抽测（tests/mobile-card-smoke.cjs）
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clampNum, stableSortBy, normalizeSortBy, groupFavoritesByGroup, resolveIconFallback, buildTabGroupsByParent, sanitizeDocIds, capMru } = require('../src/util.js');

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

test('resolveIconFallback: invalid multi-char string falls back to iconFile', () => {
    assert.deepEqual(resolveIconFallback('not-an-icon'), {type: 'svg', value: 'iconFile'});
    assert.deepEqual(resolveIconFallback('icon'), {type: 'svg', value: 'iconFile'}); // 只有前缀没有名字
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
