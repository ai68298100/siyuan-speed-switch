const {test} = require('node:test');
const assert = require('node:assert/strict');
const {removeFavoriteEntry, setFavoriteEntryGroup, migrateFavoriteEntry} = require('../src/favorite-actions.js');

test('favorite actions remove entries idempotently', () => {
    const entries = [{key: 'a', group: ''}, {key: 'b', group: 'work'}];
    const removed = removeFavoriteEntry(entries, 'a');
    assert.deepEqual(removed.items, [{key: 'b', group: 'work'}]);
    assert.equal(removed.changed, true);
    assert.equal(removeFavoriteEntry(removed.items, 'missing').changed, false);
    assert.deepEqual(entries, [{key: 'a', group: ''}, {key: 'b', group: 'work'}]);
});

test('favorite actions set group trims and preserves identity', () => {
    const entries = [{key: 'a', group: ''}, {key: 'b', group: 'work'}];
    const changed = setFavoriteEntryGroup(entries, 'a', '  personal  ');
    assert.deepEqual(changed.items, [{key: 'a', group: 'personal'}, {key: 'b', group: 'work'}]);
    assert.equal(setFavoriteEntryGroup(changed.items, 'a', 'personal').changed, false);
});

test('favorite actions migrate legacy tab key and remove duplicate root safely', () => {
    const migrated = migrateFavoriteEntry([{key: 'tab-1', title: 'Doc'}], 'tab-1', '20240101010101-abcdefg');
    assert.deepEqual(migrated.items[0], {key: '20240101010101-abcdefg', title: 'Doc', rootId: '20240101010101-abcdefg'});
    const duplicate = migrateFavoriteEntry([
        {key: 'tab-1'}, {key: '20240101010101-abcdefg'},
    ], 'tab-1', '20240101010101-abcdefg');
    assert.deepEqual(duplicate.items, [{key: '20240101010101-abcdefg'}]);
    assert.equal(duplicate.duplicate, true);
});
