const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeJournalDocumentId, ensureTodayJournal, findTodayJournal} = require('../src/journal-actions.js');

test('journal action id normalization accepts document ids and rejects unsafe values', () => {
    assert.equal(normalizeJournalDocumentId(' 20260906120006-ggggggg '), '20260906120006-ggggggg');
    assert.equal(normalizeJournalDocumentId('tab-uuid'), '');
    assert.equal(normalizeJournalDocumentId('20260906120006-unsafe!'), '');
    assert.equal(normalizeJournalDocumentId(null), '');
});

test('journal action rejects a successful response with an unsafe document id', async () => {
    const result = await ensureTodayJournal({
        notebook: 'box-a',
        fetchImpl: async () => ({ok: true, json: async () => ({code: 0, data: {id: 'tab-uuid'}})}),
    });
    assert.equal(result, null);
});

test('journal lookup returns an existing today journal without using the create endpoint', async () => {
    const calls = [];
    const result = await findTodayJournal({
        notebook: '20260906120000-aaaaaaa',
        now: new Date('2026-10-04T12:00:00'),
        fetchImpl: async (endpoint, options) => {
            calls.push({endpoint, options});
            return {ok: true, json: async () => ({code: 0, data: [{id: '20261004120000-bbbbbbb'}]})};
        },
    });
    assert.equal(result, '20261004120000-bbbbbbb');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].endpoint, '/api/query/sql');
    const statement = JSON.parse(calls[0].options.body).stmt;
    assert.match(statement, /custom-dailynote-20261004/);
    assert.match(statement, /2026-10-04/);
    assert.match(statement, /box='20260906120000-aaaaaaa'/);
    assert.doesNotMatch(statement, /createDailyNote/);
});

test('journal lookup returns null for no result, unsafe ids, invalid notebooks, and query failures', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return {ok: true, json: async () => ({code: 0, data: [{id: 'unsafe-id'}]})};
    };
    assert.equal(await findTodayJournal({notebook: '20260906120000-aaaaaaa', fetchImpl}), null);
    assert.equal(await findTodayJournal({notebook: 'notebook\' OR 1=1 --', fetchImpl}), null);
    assert.equal(calls, 1, 'invalid notebook input must not reach the kernel');
    assert.equal(await findTodayJournal({notebook: '20260906120000-aaaaaaa', fetchImpl: async () => ({ok: true, json: async () => ({code: 0, data: []})})}), null);
    assert.equal(await findTodayJournal({notebook: '20260906120000-aaaaaaa', fetchImpl: async () => { throw new Error('offline'); }}), null);
});
