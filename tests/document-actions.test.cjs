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

test("open document on desktop threads openTab background and preview options (T-6826)", async () => {
    const {openDocumentOnDesktop} = require("../src/document-actions.js");
    const seen = [];
    const openTab = async (options) => { seen.push(options); };
    // keepCursor：恢复链批量打开不抢焦点（思源 3.8.5 官方选项）
    await openDocumentOnDesktop({rootId: "20260923120000-bbbbbbbb", app: {}, openTab, keepCursor: true});
    assert.equal(seen[0].keepCursor, true);
    assert.equal(seen[0].doc.id, "20260923120000-bbbbbbbb");
    // 默认不携带（普通打开仍跳转焦点）
    await openDocumentOnDesktop({rootId: "20260923120000-bbbbbbbb", app: {}, openTab});
    assert.equal(seen[1].keepCursor, undefined);
    // 预览模式进入 doc 选项；removeCurrentTab 与 afterOpen 原样透传
    await openDocumentOnDesktop({rootId: "20260923120000-bbbbbbbb", app: {}, openTab, mode: "preview", removeCurrentTab: true});
    assert.equal(seen[2].doc.mode, "preview");
    assert.equal(seen[2].removeCurrentTab, true);
    assert.equal("afterOpen" in seen[2], false, "未提供 afterOpen 不得携带该字段");
    let called = 0;
    await openDocumentOnDesktop({rootId: "20260923120000-bbbbbbbb", app: {}, openTab, afterOpen: () => { called += 1; }});
    assert.equal(typeof seen[3].afterOpen, "function");
    seen[3].afterOpen();
    assert.equal(called, 1);
    // 命中块失败回退根文档时，新选项继续生效
    const seenFallback = [];
    const failingOpenTab = async (options) => {
        seenFallback.push(options);
        if (options.doc.id === "20260923120000-cccccccc") throw new Error("stale hit");
    };
    const opened = await openDocumentOnDesktop({
        rootId: "20260923120000-dddddddd", hitId: "20260923120000-cccccccc", app: {}, openTab: failingOpenTab, keepCursor: true,
    });
    assert.equal(opened, true, "回退后仍应成功");
    assert.equal(seenFallback[1].doc.id, "20260923120000-dddddddd");
    assert.equal(seenFallback[1].keepCursor, true);
});
