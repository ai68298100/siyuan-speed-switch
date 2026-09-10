const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeJournalDocumentId, ensureTodayJournal} = require('../src/journal-actions.js');

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
