const {test} = require('node:test');
const assert = require('node:assert/strict');
const {isDocumentOpenSuccess} = require('../src/document-actions.js');

test('document open result compatibility accepts legacy and current success values', () => {
    assert.equal(isDocumentOpenSuccess(undefined), true);
    assert.equal(isDocumentOpenSuccess(true), true);
    assert.equal(isDocumentOpenSuccess('success'), true);
    assert.equal(isDocumentOpenSuccess(false), false);
    assert.equal(isDocumentOpenSuccess('cancelled'), false);
});
