const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const {JSDOM} = require('jsdom');
const {readSourceFile} = require('./source-scan.cjs');
const {buildDocPreviewSnapshot} = require('../src/search-model.js');
const {createPlatformStatus} = require('../src/platform-dom.js');
const source = readSourceFile('src/doc-search-ui.ts');
const ast = ts.createSourceFile('preview.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['mountDocPreviewPane', 'previewTabOrDoc', 'previewBodyOf', 'extractDocPreviewBlocks', 'setDocPreviewHint', 'setDocPreviewStatus', 'cancelDocPreview', 'scheduleDocPreview', 'loadDocPreview', 'ensureDocResultsBox', 'disposeDocSearchSession', 'docPreviewItemTitle', 'docPreviewPinButtonOf', 'syncDocPreviewPin', 'toggleDocPreviewPin', 'appendDocSearchHealthBadge', 'createDocPreviewBody', 'buildDocPreviewFindBar', 'docPreviewFindToggleOf', 'setDocPreviewFindOpen', 'runDocPreviewFind', 'moveDocPreviewHit', 'updateDocPreviewFindCount', 'focusDocPreviewHit', 'resetDocPreviewFind']);
const findModule = require('../src/doc-preview-find.js');
const pieces = ast.statements.filter(n => ts.isFunctionDeclaration(n) ? names.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => /^(docPreview|DOC_PREVIEW)/.test(d.name.getText(ast))));
assert.equal(pieces.filter(ts.isFunctionDeclaration).length, names.size);
const compiled = ts.transpileModule(pieces.map(n => n.getText(ast).replace(/^export\s+/, '')).join('\n'), {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
function fixture(fetchKernelJson) {
    const dom = new JSDOM('<div id="scroll"><div id="box" class="sw__doc-results"><button class="sw__doc-item" data-sw-doc-key="20260926000000-aaaaaaa"><span class="sw__doc-title">Preview document</span></button></div></div>');
    const document = dom.window.document;
    const timers = new Map();
    let id = 0;
    const window = {setTimeout: fn => (timers.set(++id, fn), id), clearTimeout: id => timers.delete(id)};
    const api = new Function('document', 'window', 'BLOCK_ID_RE', 'buildDocPreviewSnapshot', 'createPlatformStatus', 'disposeSearchSession', 'applyPreviewFind', 'clampScrollTop', 'clearPreviewFind', 'HIT_CLASS', 'nextHitIndex', compiled + '\nreturn {mountDocPreviewPane, previewTabOrDoc, scheduleDocPreview, ensureDocResultsBox, disposeDocSearchSession};')(document, window, /^\d{14}-[0-9a-z]+$/, buildDocPreviewSnapshot, createPlatformStatus, () => {}, findModule.applyPreviewFind, findModule.clampScrollTop, findModule.clearPreviewFind, findModule.HIT_CLASS, findModule.nextHitIndex);
    const host = {isMobile: false, fetchKernelJson, i18n: {docSearchPreview: 'Preview', docSearchPreviewContent: 'Excerpt', docSearchPreviewOutline: 'Outline', docSearchPreviewEmpty: 'Select', docSearchPreviewLoading: 'Loading', docSearchPreviewStatusLoading: 'Loading', docSearchPreviewStatusReady: 'Ready', docSearchPreviewFailed: 'Failed', docSearchPreviewNoContent: 'Empty', docSearchPreviewUnavailable: 'Documents only', docSearchPreviewPin: 'Pin', docSearchPreviewUnpin: 'Unpin', docSearchPreviewPinned: 'Pinned · {x}', docSearchPreviewFind: 'Find', docSearchPreviewFindScope: 'this preview only', docSearchPreviewFindNext: 'Next match', docSearchPreviewFindPrevious: 'Previous match', docSearchPreviewFindClose: 'Close find', docSearchPreviewFindNoResults: 'No matches'}, docSearchState: {health: new Map(), sessions: new Map(), filters: new Map(), notebookNames: new Map()}};
    const scroll = document.getElementById('scroll');
    Object.defineProperty(scroll, 'clientWidth', {value: 900});
    const box = document.getElementById('box');
    api.mountDocPreviewPane.call(host, box, scroll);
    const item = box.querySelector('button');
    // T-6949 起固定状态在 previewTabOrDoc 入口登记，测试必须走生产入口而非绕过的 scheduleDocPreview
    const schedule = () => api.previewTabOrDoc.call(host, scroll, item);
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
test('preview renders task lists with inert checked states and preserves ordinary bullets (T-6979)', async () => {
    const html = '<div data-type="NodeList" data-subtype="t">'
        + '<div data-type="NodeListItem" data-subtype="t" data-task=" "><div contenteditable="true">[ ] Pending task</div></div>'
        + '<div data-type="NodeTaskListItem" data-task="X"><input type="checkbox" checked><div contenteditable="true">[x] Done task</div></div>'
        + '<div data-type="NodeListItem" data-done="true"><div contenteditable="true">Another done task</div></div></div>'
        + '<div data-type="NodeList"><div data-type="NodeListItem"><div contenteditable="true">Ordinary bullet</div></div></div>';
    const f = fixture(url => Promise.resolve(url.includes('Outline') ? {code: 0, data: []} : {code: 0, data: {content: html}}));
    try {
        f.schedule(); await f.flush();
        const tasks = [...f.box.querySelectorAll('.sw__doc-preview-task')];
        assert.deepEqual(tasks.map(li => li.textContent), ['Pending task', 'Done task', 'Another done task']);
        assert.deepEqual(tasks.map(li => li.querySelector('input').checked), [false, true, true]);
        assert.ok(tasks.every(li => li.querySelector('input').disabled));
        assert.equal(tasks[1].querySelector('.sw__doc-preview-task--done').textContent, 'Done task');
        const ordinary = [...f.box.querySelectorAll('.sw__doc-preview-content-list li')].find(li => li.textContent === 'Ordinary bullet');
        assert.ok(ordinary && !ordinary.querySelector('input'));
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
// T-6949：会话级固定预览——固定后悬停/非文档目标/列表重建均不覆盖正文；解除后回随最后目标。
test('preview pin freezes the pane against hover and non-document targets, unpin resumes following', async () => {
    let calls = 0;
    const f = fixture(url => { calls++; return Promise.resolve(url.includes('Outline') ? {code: 0, data: []} : docResponse('PINNED CONTENT')); });
    try {
        f.schedule(); await f.flush();
        const pane = f.box.querySelector('.sw__doc-preview');
        const pin = pane.querySelector('.sw__doc-preview-pin');
        assert.equal(pin.disabled, false);
        assert.equal(pin.getAttribute('aria-pressed'), 'false');
        pin.click();
        assert.equal(pin.getAttribute('aria-pressed'), 'true');
        assert.ok(pane.querySelector('.sw__doc-preview-header-label').textContent.includes('Pinned · Preview document'),
            '固定状态必须带文档名');
        const callsAtPin = calls;
        // 悬停另一个文档：固定中不得发起新取数、不得覆盖正文
        f.item.dataset.swDocKey = '20260926000000-bbbbbbb';
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        await f.flush();
        assert.equal(calls, callsAtPin, '固定中悬停其他文档不应取数');
        assert.ok(f.box.textContent.includes('PINNED CONTENT'));
        // 非文档对象：固定中不得改写为 blocked 回执
        delete f.item.dataset.swDocKey;
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        assert.ok(!f.box.textContent.includes('Documents only'), '固定中非文档目标不得覆盖正文');
        assert.ok(f.box.textContent.includes('PINNED CONTENT'));
        // 解除固定：回随最后目标（此刻是非文档行且仍连接）→ 恢复跟随语义（blocked 回执）
        pin.click();
        assert.equal(pin.getAttribute('aria-pressed'), 'false');
        assert.ok(f.box.textContent.includes('Documents only'), '解除后应回随最后悬停对象');
        assert.ok(!f.box.textContent.includes('Pinned ·'));
        // 结果区重建（查询变化）下固定：重新固定有效对象后重建，固定保留、不重取数
        f.item.dataset.swDocKey = '20260926000000-bbbbbbb';
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        await f.flush();
        const callsBeforeRebuild = calls;
        pin.click();
        f.api.ensureDocResultsBox.call(f.host, f.scroll, []);
        f.api.mountDocPreviewPane.call(f.host, f.box, f.scroll);
        assert.ok(f.box.querySelector('.sw__doc-preview').isConnected);
        assert.ok(f.box.querySelector('.sw__doc-preview-header-label').textContent.includes('Pinned'));
        assert.ok(f.box.textContent.includes('PINNED CONTENT'));
        assert.equal(calls, callsBeforeRebuild, '重建后固定对象不应重新取数');
    } finally {f.dom.window.close();}
});
test('preview pin button disables without a current object and session dispose releases the pin', async () => {
    const f = fixture(() => Promise.resolve({code: 0, data: []}));
    try {
        const pane = f.box.querySelector('.sw__doc-preview');
        const pin = pane.querySelector('.sw__doc-preview-pin');
        assert.equal(pin.disabled, true, '无当前预览对象时固定按钮应禁用');
        f.item.remove();
        delete f.item.dataset.swDocKey;
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        assert.equal(pin.disabled, true, '非文档目标不算可固定对象');
        // 解除固定且最后目标已断开：回空态提示，不留状态徽标
        f.item.dataset.swDocKey = '20260926000000-ccccccc';
        f.box.appendChild(f.item);
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        await f.flush();
        pin.click();
        f.item.remove();
        pin.click();
        assert.ok(f.box.textContent.includes('Select'), '解除固定且无有效目标时回空态提示');
        assert.equal(pane.querySelector('.sw-platform-status'), null, '空态不留陈旧状态徽标');
        // 会话销毁释放固定：重新挂载后按钮禁用、标签复原
        pin.click();
        assert.equal(pin.getAttribute('aria-pressed'), 'true');
        f.api.disposeDocSearchSession.call(f.host, f.scroll);
        f.api.mountDocPreviewPane.call(f.host, f.box, f.scroll);
        const pinAfter = f.box.querySelector('.sw__doc-preview-pin');
        assert.equal(pinAfter.getAttribute('aria-pressed'), 'false', '会话销毁必须释放固定');
        assert.equal(pinAfter.disabled, true);
        assert.equal(f.box.querySelector('.sw__doc-preview-header-label').textContent, 'Preview');
    } finally {f.dom.window.close();}
});
// T-6950：预览内查找——计数、循环导航、无结果/空词、清除复原、目标切换重跑、Esc/Ctrl+F。
test('preview find counts and navigates matches, restores structure on close, re-applies across target switch', async () => {
    const f = fixture(url => Promise.resolve(url.includes('Outline')
        ? {code: 0, data: []}
        : docResponse('First paragraph alpha', 'Second paragraph beta')));
    try {
        f.schedule(); await f.flush();
        const pane = f.box.querySelector('.sw__doc-preview');
        const toggle = pane.querySelector('.sw__doc-preview-find-toggle');
        const bar = pane.querySelector('.sw__doc-preview-find');
        const input = bar.querySelector('.sw__doc-preview-find-input');
        const count = bar.querySelector('.sw__doc-preview-find-count');
        assert.equal(bar.hidden, true, '查找条默认隐藏');
        toggle.click();
        assert.equal(bar.hidden, false);
        assert.equal(toggle.getAttribute('aria-expanded'), 'true');
        input.value = 'paragraph';
        input.dispatchEvent(new f.dom.window.Event('input', {bubbles: true}));
        assert.equal(count.textContent, '1/2');
        let marks = pane.querySelectorAll('mark.sw__doc-preview-hit');
        assert.equal(marks.length, 2);
        assert.ok(marks[0].classList.contains('is-current'), '当前命中带加深标记');
        bar.querySelector('.sw__doc-preview-find-next').click();
        assert.equal(count.textContent, '2/2');
        bar.querySelector('.sw__doc-preview-find-next').click();
        assert.equal(count.textContent, '1/2', '下一处越界回绕');
        bar.querySelector('.sw__doc-preview-find-prev').click();
        assert.equal(count.textContent, '2/2', '上一处反向回绕');
        input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
        assert.equal(count.textContent, '1/2', 'Enter 循环到下一处');
        input.value = '不存在的词';
        input.dispatchEvent(new f.dom.window.Event('input', {bubbles: true}));
        assert.equal(count.textContent, 'No matches');
        assert.equal(pane.querySelectorAll('mark.sw__doc-preview-hit').length, 0);
        input.value = '';
        input.dispatchEvent(new f.dom.window.Event('input', {bubbles: true}));
        assert.equal(count.textContent, '', '空查询计数清空');
        input.value = 'paragraph';
        input.dispatchEvent(new f.dom.window.Event('input', {bubbles: true}));
        assert.equal(count.textContent, '1/2');
        // 目标切换：查找条保持展开，按原查询对新内容重跑
        f.item.dataset.swDocKey = '20260926000000-bbbbbbb';
        f.api.previewTabOrDoc.call(f.host, f.scroll, f.item);
        await f.flush();
        assert.equal(count.textContent, '1/2', '目标切换后按原查询重跑');
        assert.equal(pane.querySelectorAll('mark.sw__doc-preview-hit').length, 2);
        // Esc 关闭：标记清除、展开态复位（计数条已隐藏，其内容无意义）
        input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        assert.equal(bar.hidden, true);
        assert.equal(pane.querySelectorAll('mark.sw__doc-preview-hit').length, 0);
        assert.equal(toggle.getAttribute('aria-expanded'), 'false');
        // Ctrl+F 仅在窗格内接管，重新展开并按原查询重新计数
        pane.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', {key: 'f', ctrlKey: true, bubbles: true}));
        assert.equal(bar.hidden, false);
        assert.equal(pane.querySelector('.sw__doc-preview-find-input').value, 'paragraph', '重开恢复原查询');
        assert.equal(count.textContent, '1/2', '重开后对新内容重新计数');
    } finally {f.dom.window.close();}
});

test('preview find preserves IME input and applies the committed query once (T-7127)', async () => {
    const f = fixture(url => Promise.resolve(url.includes('Outline')
        ? {code: 0, data: []} : docResponse('alpha 中文x alpha 中文')));
    try {
        f.schedule(); await f.flush();
        const pane = f.box.querySelector('.sw__doc-preview');
        pane.querySelector('.sw__doc-preview-find-toggle').click();
        const bar = pane.querySelector('.sw__doc-preview-find');
        const input = bar.querySelector('input');
        const count = bar.querySelector('.sw__doc-preview-find-count');
        input.value = 'alpha';
        input.dispatchEvent(new f.dom.window.InputEvent('input', {bubbles: true}));
        const originalMark = pane.querySelector('mark');
        let hostKeys = 0;
        f.scroll.addEventListener('keydown', () => {hostKeys++;});
        input.dispatchEvent(new f.dom.window.CompositionEvent('compositionstart', {bubbles: true}));
        input.value = 'zhongw';
        input.dispatchEvent(new f.dom.window.InputEvent('input', {bubbles: true, isComposing: true}));
        assert.equal(count.textContent, '1/2', '预编辑不得更改查找结果');
        assert.equal(pane.querySelector('mark'), originalMark, '预编辑不得重复重建高亮');
        for (const key of ['Enter', 'Escape', 'ArrowDown', 'ArrowUp']) {
            const event = new f.dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
            input.dispatchEvent(event);
            assert.equal(event.defaultPrevented, false, `${key} 保留输入法默认处理`);
            assert.equal(bar.hidden, false, `${key} 不关闭查找`);
            assert.equal(count.textContent, '1/2', `${key} 不移动命中`);
            assert.equal(f.dom.window.document.activeElement, input, `${key} 不改变焦点`);
        }
        assert.equal(hostKeys, 0, '组合按键不冒泡到宿主导航或关闭');
        input.value = '中文';
        input.dispatchEvent(new f.dom.window.CompositionEvent('compositionend', {bubbles: true}));
        assert.equal(count.textContent, '1/2');
        const committedMark = pane.querySelector('mark');
        assert.equal(committedMark.textContent, '中文', '最终查询来自真实控件');
        input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
        assert.equal(count.textContent, '2/2', '提交后正常 Enter 继续导航');
        input.dispatchEvent(new f.dom.window.InputEvent('input', {bubbles: true}));
        assert.equal(pane.querySelector('mark'), committedMark, 'compositionend 后同值 input 不再重建高亮');
        assert.equal(count.textContent, '2/2', '同值 input 不重置当前命中');
        for (const properties of [{isComposing: true}, {keyCode: 229}]) {
            const event = new f.dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true, ...properties});
            input.dispatchEvent(event);
            assert.equal(event.defaultPrevented, false);
            assert.equal(bar.hidden, false, '事件组合标志及 229 兼容输入法');
        }
        input.value = '中文x';
        input.dispatchEvent(new f.dom.window.InputEvent('input', {bubbles: true}));
        assert.equal(count.textContent, '1/1', '后续普通输入立即生效');
        input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        assert.equal(bar.hidden, true, '非组合 Esc 仍关闭查找');
    } finally {f.dom.window.close();}
});
