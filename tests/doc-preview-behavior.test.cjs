const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const {readSourceFile} = require('./source-scan.cjs');
const {buildDocPreviewSnapshot} = require('../src/search-model.js');
const {createPlatformStatus} = require('../src/platform-dom.js');
const source = readSourceFile('src/doc-search-ui.ts');
const ast = ts.createSourceFile('preview.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['mountDocPreviewPane', 'previewTabOrDoc', 'previewBodyOf', 'extractDocPreviewBlocks', 'setDocPreviewHint', 'setDocPreviewStatus', 'cancelDocPreview', 'scheduleDocPreview', 'loadDocPreview', 'ensureDocResultsBox', 'disposeDocSearchSession']);
const pieces = ast.statements.filter(n => ts.isFunctionDeclaration(n) ? names.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => /^(docPreview|DOC_PREVIEW)/.test(d.name.getText(ast))));
assert.equal(pieces.filter(ts.isFunctionDeclaration).length, names.size);
const compiled = ts.transpileModule(pieces.map(n => n.getText(ast).replace(/^export\s+/, '')).join('\n'), {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
function fixture(fetchKernelJson) {
    const dom = new JSDOM('<div id="scroll"><div id="box" class="sw__doc-results"><button class="sw__doc-item" data-sw-doc-key="20260926000000-aaaaaaa"><span class="sw__doc-title">Preview document</span></button></div></div>');
    const document = dom.window.document;
    const timers = new Map();
    let id = 0;
    const window = {setTimeout: fn => (timers.set(++id, fn), id), clearTimeout: id => timers.delete(id)};
    const api = new Function('document', 'window', 'BLOCK_ID_RE', 'buildDocPreviewSnapshot', 'createPlatformStatus', 'disposeSearchSession', compiled + '\nreturn {mountDocPreviewPane, previewTabOrDoc, scheduleDocPreview, ensureDocResultsBox, disposeDocSearchSession};')(document, window, /^\d{14}-[0-9a-z]+$/, buildDocPreviewSnapshot, createPlatformStatus, () => {});
    const host = {isMobile: false, fetchKernelJson, i18n: {docSearchPreview: 'Preview', docSearchPreviewContent: 'Excerpt', docSearchPreviewOutline: 'Outline', docSearchPreviewEmpty: 'Select', docSearchPreviewLoading: 'Loading', docSearchPreviewStatusLoading: 'Loading', docSearchPreviewStatusReady: 'Ready', docSearchPreviewFailed: 'Failed', docSearchPreviewNoContent: 'Empty', docSearchPreviewUnavailable: 'Documents only'}, docSearchState: {health: new Map(), sessions: new Map(), filters: new Map(), notebookNames: new Map()}};
    const scroll = document.getElementById('scroll');
    Object.defineProperty(scroll, 'clientWidth', {value: 900});
    const box = document.getElementById('box');
    api.mountDocPreviewPane.call(host, box, scroll);
    const item = box.querySelector('button');
    const schedule = () => api.scheduleDocPreview.call(host, scroll, item);
    const flush = async () => {const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve));};
    return {api, host, scroll, box, item, schedule, flush, timers, dom};
}
const docResponse = (...paragraphs) => ({code: 0, data: {content: paragraphs.map((text, index) =>
    `<div data-type="NodeParagraph" data-node-index="${index}"><div contenteditable="true">${text}</div></div>`).join('')}});
test('preview invalidates old responses as soon as a new target is scheduled', async () => {
    const pending = [];
    const f = fixture(() => new Promise(resolve => pending.push(resolve)));
    try {
        f.schedule(); await f.flush();
        f.item.dataset.swDocKey = '20260926000000-bbbbbbb';
        f.schedule();
        pending[0]({code: 0, data: []}); pending[1](docResponse('OLD CONTENT'));
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(!f.box.textContent.includes('OLD CONTENT'));
        await f.flush();
        pending[2]({code: 0, data: []}); pending[3](docResponse('NEW CONTENT'));
        await new Promise(resolve => setImmediate(resolve));
        assert.ok(f.box.textContent.includes('NEW CONTENT'));
    } finally {f.dom.window.close();}
});
test('preview presents the selected title, separate paragraphs and an outline', async () => {
    const f = fixture(url => Promise.resolve({code: 0, data: url.includes('Outline')
        ? [{name: 'Preview document', type: 'outline', blocks: [{content: 'First section', subType: 'h2'}]}]
        : docResponse('First paragraph', 'Second paragraph').data}));
    try {
        f.schedule(); await f.flush();
        const pane = f.box.querySelector('.sw__doc-preview');
        assert.equal(pane.querySelector('.sw__doc-preview-title').textContent, 'Preview document');
        assert.deepEqual([...pane.querySelectorAll('.sw__doc-preview-excerpt')].map(el => el.textContent),
            ['First paragraph', 'Second paragraph']);
        assert.deepEqual([...pane.querySelectorAll('.sw__doc-preview-heading')].map(el => el.textContent),
            ['First section']);
        assert.equal(pane.querySelector('.sw__doc-preview-outline').tagName, 'UL');
    } finally {f.dom.window.close();}
});
test('preview projects rich host blocks as inert text in document order', async () => {
    const html = '<div data-type="NodeHeading"><div contenteditable="true">A &amp; B</div></div>'
        + '<div data-type="NodeParagraph"><div contenteditable="true">First paragraph<img src="x" onerror="throw Error(1)"></div></div>'
        + '<div data-type="NodeList"><div data-type="NodeListItem"><div contenteditable="true">List item</div></div></div>'
        + '<div data-type="NodeBlockquote"><div contenteditable="true">Quoted text</div></div>'
        + '<div data-type="NodeCodeBlock"><div contenteditable="true">const answer = 42;</div></div>'
        + '<div data-type="NodeParagraph"><div contenteditable="true">Last paragraph</div></div>';
    const f = fixture(url => Promise.resolve(url.includes('Outline') ? {code: 0, data: []} : {code: 0, data: {content: html}}));
    try {
        f.schedule(); await f.flush();
        const section = f.box.querySelector('.sw__doc-preview-section');
        assert.deepEqual([...section.querySelectorAll('.sw__doc-preview-block, .sw__doc-preview-content-list li')]
            .map(el => el.textContent), ['A & B', 'First paragraph', 'List item', 'Quoted text', 'const answer = 42;', 'Last paragraph']);
        assert.equal(section.querySelector('.sw__doc-preview-block--code').tagName, 'PRE');
        assert.equal(section.querySelector('img'), null);
        assert.equal(section.querySelector('script'), null);
    } finally {f.dom.window.close();}
});
test('preview distinguishes empty success, partial failure, malformed and rejected responses', async () => {
    for (const mode of ['empty', 'partial', 'malformed', 'deleted', 'rejected']) {
        const f = fixture(url => {
            if (mode === 'rejected') return Promise.reject(new Error('offline'));
            if (mode === 'malformed') return Promise.resolve({code: 0, data: {}});
            if (mode === 'deleted') return Promise.resolve({code: -1, msg: 'block not found'});
            if (mode === 'partial') return Promise.resolve(url.includes('Outline') ? null : docResponse('Available excerpt'));
            return Promise.resolve(url.includes('Outline') ? {code: 0, data: []} : docResponse());
        });
        try {
            f.schedule(); await f.flush();
            assert.ok(f.box.textContent.includes(mode === 'empty' ? 'Ready' : 'Failed'), mode);
            assert.ok(!f.box.textContent.includes('Select'), mode);
            if (mode === 'empty') assert.ok(f.box.textContent.includes('Empty'));
            if (mode === 'partial') assert.ok(f.box.textContent.includes('Available excerpt'));
        } finally {f.dom.window.close();}
    }
});
test('preview cleanup cancels pending fetch on result removal and session disposal', async () => {
    for (const action of ['ensureDocResultsBox', 'disposeDocSearchSession']) {
        let calls = 0;
        const f = fixture(async () => {calls++; return {code: 0, data: []};});
        try {
            f.schedule();
            f.api[action].call(f.host, f.scroll, null);
            assert.equal(f.timers.size, 0, action);
            await f.flush();
            assert.equal(calls, 0, action);
        } finally {f.dom.window.close();}
    }
});
test('one preview pane follows opened tabs and search results, and non-document tabs report blocked', async () => {
    const requests = [];
    const f = fixture((url, body) => { requests.push({url, body}); return Promise.resolve(url.includes('Outline') ? {code: 0, data: []} : docResponse()); });
    try {
        const layout = f.dom.window.document.createElement('div');
        layout.className = 'sw__tab-preview';
        const content = f.dom.window.document.createElement('div');
        content.className = 'sw__tab-content';
        const card = f.dom.window.document.createElement('div');
        card.className = 'sw__card';
        card.dataset.rootId = '20260926000000-bbbbbbb';
        content.appendChild(card); layout.appendChild(content); f.scroll.prepend(layout);
        f.api.previewTabOrDoc.call(f.host, f.scroll, card);
        assert.equal(layout.querySelectorAll('.sw__doc-preview').length, 1);
        await f.flush();
        assert.equal(requests[0].body.id, card.dataset.rootId);
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        assert.equal(layout.querySelectorAll('.sw__doc-preview').length, 0);
        assert.equal(f.box.querySelectorAll('.sw__doc-preview').length, 1);
        assert.equal(f.scroll.querySelectorAll('.sw__doc-preview').length, 1);
        delete card.dataset.rootId;
        f.api.previewTabOrDoc.call(f.host, f.scroll, card);
        assert.equal(layout.querySelectorAll('.sw__doc-preview').length, 1);
        assert.ok(layout.textContent.includes('Documents only'));
        await f.flush();
        assert.equal(requests.length, 2);
    } finally {f.dom.window.close();}
});
