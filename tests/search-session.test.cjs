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
