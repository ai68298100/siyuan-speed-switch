const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    createSearchSession,
    beginSearch,
    cacheSearchResult,
    disposeSearchSession,
} = require('../src/search-session.js');

test('search sessions keep request state isolated between containers', () => {
    const first = createSearchSession(2);
    const second = createSearchSession(2);
    let firstAborted = false;
    let secondAborted = false;
    first.controller = {abort: () => { firstAborted = true; }};
    second.controller = {abort: () => { secondAborted = true; }};

    assert.equal(beginSearch(first), 1);
    assert.equal(firstAborted, true);
    assert.equal(secondAborted, false);
    assert.equal(second.version, 0);
});

test('independent sessions keep both debounce timers alive', () => {
    const first = createSearchSession(2);
    const second = createSearchSession(2);
    const fired = [];
    first.timer = setTimeout(() => fired.push('first'), 5);
    second.timer = setTimeout(() => fired.push('second'), 5);

    return new Promise((resolve) => setTimeout(() => {
        assert.deepEqual(fired.sort(), ['first', 'second']);
        resolve();
    }, 20));
});

test('beginSearch cancels a pending timer and clears the controller', () => {
    const session = createSearchSession(2);
    let timerRan = false;
    let aborted = false;
    session.timer = setTimeout(() => { timerRan = true; }, 20);
    session.controller = {abort: () => { aborted = true; }};

    beginSearch(session);

    assert.equal(session.timer, null);
    assert.equal(session.controller, null);
    assert.equal(aborted, true);
    return new Promise((resolve) => setTimeout(() => {
        assert.equal(timerRan, false);
        resolve();
    }, 30));
});

test('cacheSearchResult enforces the configured cache limit', () => {
    const session = createSearchSession(2);
    cacheSearchResult(session, 'a', [1]);
    cacheSearchResult(session, 'b', [2]);
    cacheSearchResult(session, 'c', [3]);

    assert.deepEqual([...session.cache.entries()], [['c', [3]]]);
});

test('search session normalizes invalid cache limits and keys', () => {
    const session = createSearchSession(0);
    assert.equal(session.cacheLimit, 20);
    cacheSearchResult(session, 42, 'value');
    assert.equal(session.cache.get('42'), 'value');
    cacheSearchResult(session, '', 'ignored');
    assert.equal(session.cache.size, 1);
    const fallback = createSearchSession(Number.NaN);
    assert.equal(fallback.cacheLimit, 20);
});

test('search session lifecycle tolerates missing state', () => {
    assert.equal(beginSearch(null), 0);
    assert.doesNotThrow(() => disposeSearchSession(null));
    const session = {version: 'bad', timer: null, controller: null, cache: new Map()};
    assert.equal(beginSearch(session), 1);
    disposeSearchSession(session);
    assert.equal(session.cache.size, 0);
});

test('versions increase monotonically so callers can reject stale results', () => {
    const session = createSearchSession(2);
    const staleVersion = beginSearch(session);
    const currentVersion = beginSearch(session);

    assert.equal(staleVersion, 1);
    assert.equal(currentVersion, 2);
    assert.notEqual(staleVersion, session.version);
    assert.equal(currentVersion, session.version);
});

test('disposeSearchSession aborts work and clears cached results', () => {
    const session = createSearchSession(2);
    let aborted = false;
    session.controller = {abort: () => { aborted = true; }};
    session.cache.set('query', ['result']);

    disposeSearchSession(session);

    assert.equal(aborted, true);
    assert.equal(session.cache.size, 0);
    assert.equal(session.version, 1);
});

test('concurrent sessions never share cache entries or debounce timers', () => {
    const desktop = createSearchSession(3);
    const sidebar = createSearchSession(3);

    cacheSearchResult(desktop, '腾讯会议', ['desktop-result']);
    cacheSearchResult(sidebar, '腾讯会议', ['sidebar-result']);

    // 同 key 在两个会话中各自命中各自的缓存
    assert.deepEqual(desktop.cache.get('腾讯会议'), ['desktop-result']);
    assert.deepEqual(sidebar.cache.get('腾讯会议'), ['sidebar-result']);

    // 各自的防抖计时器互不影响
    const desktopTimer = setTimeout(() => {}, 50);
    const sidebarTimer = setTimeout(() => {}, 50);
    desktop.timer = desktopTimer;
    sidebar.timer = sidebarTimer;
    beginSearch(desktop, '会议');
    assert.equal(sidebar.timer, sidebarTimer, 'sidebar timer untouched by desktop begin');
    clearTimeout(sidebarTimer);

    disposeSearchSession(desktop);
    disposeSearchSession(sidebar);
    assert.equal(desktop.cache.size, 0);
    assert.equal(sidebar.cache.size, 0);
});

test('cache hit/miss cost stays negligible for repeated keystrokes', () => {
    const session = createSearchSession(64);
    for (let i = 0; i < 64; i += 1) cacheSearchResult(session, `query-${i}`, Array.from({length: 12}, (_, j) => ({id: j})));
    // T-6467：best-of-3 取最小样本——最小值受宿主负载/GC 抖动污染最小；
    // 真回归会让全部样本一起抬升，最小值照样超限，门禁不因 best-of-N 失真。
    let best = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round += 1) {
        const started = process.hrtime.bigint();
        for (let i = 0; i < 10000; i += 1) {
            const key = `query-${i % 64}`;
            if (!session.cache.has(key)) throw new Error('expected hit');
        }
        const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
        best = Math.min(best, elapsed);
    }
    assert.ok(best < 50, `10k cache lookups best-of-3 took ${best.toFixed(2)}ms; Map lookup path regressed`);
});
