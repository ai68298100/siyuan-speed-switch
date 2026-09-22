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

test("open document on desktop forwards split position to openTab (T-6810)", async () => {
    const {openDocumentOnDesktop} = require("../src/document-actions.js");
    const seen = [];
    const openTab = async (options) => { seen.push(options); };
    await openDocumentOnDesktop({rootId: "20260923120000-aaaaaaa", app: {}, openTab, position: "right"});
    assert.equal(seen[0].position, "right");
    await openDocumentOnDesktop({rootId: "20260923120000-aaaaaaa", app: {}, openTab});
    assert.equal(seen[1].position, undefined, "default open carries no split position");
    await openDocumentOnDesktop({rootId: "20260923120000-aaaaaaa", app: {}, openTab, position: "left"});
    assert.equal(seen[2].position, undefined, "unsupported positions are dropped");
});
