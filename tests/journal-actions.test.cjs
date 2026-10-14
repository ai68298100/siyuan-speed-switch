const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeJournalDocumentId, ensureTodayJournal, ensureTodayJournalOutcome, findTodayJournal, findTodayJournalOutcome} = require('../src/journal-actions.js');

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

test('journal create has a deadline, never retries a write, and reports an uncertain result', async () => {
    let calls = 0;
    let wasAborted = false;
    const result = await ensureTodayJournalOutcome({
        notebook: '20260906120000-aaaaaaa', timeoutMs: 5,
        fetchImpl: (_endpoint, options) => {
            calls += 1;
            options.signal.addEventListener('abort', () => { wasAborted = true; });
            return new Promise(() => {});
        },
    });
    assert.deepEqual({kind: result.error?.kind, outcome: result.outcome, attempts: result.attempts}, {kind: 'timeout', outcome: 'unknown', attempts: 1});
    assert.equal(calls, 1, 'write timeout must not be automatically retried');
    assert.equal(wasAborted, true, 'deadline must cancel the underlying fetch');
});

test('concurrent identical journal creates share one in-flight write', async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {ok: true, json: async () => ({code: 0, data: {id: '20261004120000-bbbbbbb'}})};
    };
    const [first, second] = await Promise.all([
        ensureTodayJournalOutcome({notebook: '20260906120000-aaaaaaa', fetchImpl}),
        ensureTodayJournalOutcome({notebook: '20260906120000-aaaaaaa', fetchImpl}),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
    assert.equal(first.id, '20261004120000-bbbbbbb');
});

test('journal create distinguishes explicit authorization failure from unknown transport outcome', async () => {
    const result = await ensureTodayJournalOutcome({
        notebook: '20260906120000-aaaaaaa',
        fetchImpl: async () => ({ok: false, status: 401}),
    });
    assert.deepEqual({kind: result.error?.kind, outcome: result.outcome}, {kind: 'unauthorized', outcome: 'failed'});
});

test('journal actions use the injected shared request transport when available', async () => {
    const calls = [];
    const requestJson = async (endpoint, body, options) => {
        calls.push({endpoint, body, options});
        return {ok: true, value: endpoint.includes('createDailyNote')
            ? {code: 0, data: {id: '20261004120000-bbbbbbb'}}
            : {code: 0, data: []}, attempts: 1, outcome: 'success'};
    };
    assert.equal((await ensureTodayJournalOutcome({notebook: '20260906120000-aaaaaaa', requestJson})).id, '20261004120000-bbbbbbb');
    const found = await findTodayJournalOutcome({notebook: '20260906120000-aaaaaaa', now: new Date('2026-10-04T12:00:00'), requestJson});
    assert.deepEqual({ok: found.ok, id: found.id, empty: found.empty}, {ok: true, id: null, empty: true});
    assert.equal(calls.length, 2);
    assert.equal(calls[0].endpoint, '/api/filetree/createDailyNote');
    assert.equal(calls[0].options.dedupe, true);
    assert.equal(calls[1].endpoint, '/api/query/sql');
    assert.equal(calls[1].options.latestKey, 'journal:20260906120000-aaaaaaa:2026-10-04');
});
