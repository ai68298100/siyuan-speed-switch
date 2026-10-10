// 片段实验室 mount 级回归测试（v0.43.1 事故防线）。
// 事故：T-6987 预览回执接线时 renderPreview 调用了 analyzeCssCoverage 但未加入
// require 解构——chunk 首渲染即抛 ReferenceError，第三面板无法进入。既有 studio
// 测试全部是源码正则扫描（不执行 UI），tsc 对 JS 不查未定义变量，双重盲区。
// 本文件真实执行 mountSnippetStudio（jsdom + siyuan stub），任何构造期/首渲染
// 错误都会在这里精确失败。
const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

// ---- 共享 harness：jsdom 全局 + siyuan 模块 stub + studio 挂载 ----
function createHarness(t) {
    const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {url: "https://localhost"});
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    global.navigator = dom.window.navigator;
    global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    const Module = require('node:module');
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'siyuan') {
            return {
                Dialog: class { constructor() { this.element = dom.window.document.createElement('div'); } destroy() {} },
                showMessage: () => {},
                getAllTabs: () => [],
                openTab: () => {},
            };
        }
        return origLoad.apply(this, arguments);
    };
    t.after(() => {
        Module._load = origLoad;
        delete global.window;
        delete global.document;
        delete global.HTMLElement;
        delete global.navigator;
        delete global.requestAnimationFrame;
        dom.window.close();
    });
    // 每次挂载用独立 require 缓存，避免跨用例的模块状态
    delete require.cache[require.resolve('../src/snippet-studio-ui.js')];
    const {mountSnippetStudio} = require('../src/snippet-studio-ui.js');
    const i18n = require('../src/i18n/zh-CN.json');
    const fakeStore = {
        list: async () => ({snippets: [], css: [], js: []}),
        get: async () => null,
        mutate: async () => ({}),
        dispose: () => {},
    };
    return {dom, document: dom.window.document, mountSnippetStudio, i18n, fakeStore};
}

test('studio mount: the lab mounts, renders the first preview and the capability receipt (v0.43.1 regression)', (t) => {
    const {document, mountSnippetStudio, i18n, fakeStore} = createHarness(t);
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n, getConfig: () => ({}), store: fakeStore, platform: null, onBack: () => {},
    });
    assert.ok(controller && typeof controller.canClose === 'function', '挂载必须返回控制器');
    const receipt = document.querySelector('.sw-studio__preview-receipt');
    assert.ok(receipt, '能力回执行必须存在');
    assert.ok(receipt.textContent.includes('场景'), '回执必须渲染场景段');
    assert.ok(receipt.textContent.includes('脚本：禁用'), '回执必须渲染脚本边界');
    assert.ok(receipt.textContent.includes('主题 token：内置快照'), '回执必须渲染 token 来源');
    assert.ok(document.querySelector('.sw-studio__preview-canvas iframe'), '首渲染必须产出预览 iframe');
});

test('studio AI sends only selected context and copies the candidate instead of the draft', async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    let requested = null;
    let resolveRequest;
    const ai = {cancel: () => {}, dispose: () => {}, generate: (options) => {
        requested = options;
        return new Promise((resolve) => {resolveRequest = resolve;});
    }};
    const controller = mountSnippetStudio(document.getElementById('root'), {i18n, ai,
        store: {read: async () => [], dispose: () => {}}});
    await controller.ready;
    const editor = document.querySelector('.sw-studio__editor');
    editor.value = '.private{}';
    editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    const prompt = document.querySelector('.sw-studio__prompt');
    prompt.value = 'Create another rule';
    prompt.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    const consent = document.querySelector('.sw-studio__ai > .sw-studio__consent input');
    consent.checked = true;
    consent.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent === i18n.snippetAISend);
    button.click();
    assert.equal(requested.content, '');
    assert.deepEqual(requested.history, []);
    resolveRequest({type: 'css', content: '.candidate{}'});
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(editor.value, '.private{}');
    let copied = '';
    document.execCommand = () => {copied = document.body.lastElementChild.value; return true;};
    Array.from(document.querySelectorAll('button')).find((element) => element.textContent === i18n.snippetAICopyCandidate).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(copied, '.candidate{}');
    editor.value = '.changed{}';
    editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    assert.equal(document.querySelector('.sw-studio__ai-stale').hidden, false);
    const mode = document.querySelector(`[aria-label="${i18n.snippetAIMode}"]`);
    mode.value = 'optimize';
    mode.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    assert.equal(button.disabled, true);
    const code = document.querySelector(`[aria-label="${i18n.snippetAIIncludeCode}"]`);
    code.checked = true;
    code.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    assert.equal(button.disabled, false);
    button.click();
    assert.equal(requested.content, '.changed{}');
    Array.from(document.querySelectorAll('.sw-studio__ai button')).find((element) => element.textContent === i18n.snippetAICancel).click();
    assert.equal(button.disabled, false);
    assert.equal(editor.value, '.changed{}');
    controller.dispose();
});

test('studio mount: editing drives the diagnostics panel with verdicts and error positions (v0.43.1 regression)', (t) => {
    const {dom, document, mountSnippetStudio, i18n, fakeStore} = createHarness(t);
    mountSnippetStudio(document.getElementById('root'), {
        i18n, getConfig: () => ({}), store: fakeStore, platform: null, onBack: () => {},
    });
    const editor = document.querySelector('.sw-studio__editor');
    assert.ok(editor, '编辑器必须存在');
    editor.value = '.b3-callout { color: red; }\n.protyle-custom { color: blue; }\n.broken {';
    editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    return new Promise((resolve) => {
        setTimeout(() => {
            const rows = Array.from(document.querySelectorAll('.sw-studio__diagnostics-row'))
                .map((row) => row.textContent.trim());
            assert.ok(rows.some((row) => row.includes('.b3-callout') && row.includes('命中')), '命中行必须渲染');
            assert.ok(rows.some((row) => row.includes('.protyle-custom') && row.includes('可能未命中')), '可能未命中行必须渲染');
            assert.ok(rows.some((row) => row.includes('.broken') && row.includes('未知')), '未知行必须渲染');
            assert.ok(rows.some((row) => row.includes('缺少右花括号')), '括号错误必须渲染');
            assert.ok(document.querySelector('.sw-studio__preview-receipt').textContent.includes('探针：命中 1 项'),
                '探针计数必须来自共享纯模型');
            resolve();
        }, 400);
    });
});

test('studio mount: oversized draft clears stale preview and diagnostics (AB-1302)', (t) => {
    const {dom, document, mountSnippetStudio, i18n, fakeStore} = createHarness(t);
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n, getConfig: () => ({}), store: fakeStore, platform: null, onBack: () => {},
    });
    const editor = document.querySelector('.sw-studio__editor');
    editor.value = '.b3-callout { color: red; }';
    editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    return new Promise((resolve) => setTimeout(resolve, 320)).then(() => {
        assert.ok(document.querySelector('.sw-studio__preview-pane--draft iframe'), '有效草稿应先渲染预览');
        assert.equal(document.querySelector('.sw-studio__diagnostics').hidden, false, '有效 CSS 应显示诊断');
        editor.value = 'x'.repeat(65537);
        editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
        return new Promise((resolve) => setTimeout(resolve, 320));
    }).then(() => {
        assert.equal(document.querySelector('.sw-studio__preview-pane--draft iframe'), null, '超限草稿不得保留旧 iframe');
        assert.equal(document.querySelector('.sw-studio__diagnostics').hidden, true, '超限草稿不得保留旧诊断');
        assert.equal(document.querySelector('.sw-studio__preview').dataset.state, 'error', '超限草稿必须进入错误态');
        assert.equal(document.querySelector('.sw-studio__status').dataset.state, 'error', '超限草稿必须给出错误回执');
        assert.ok(document.querySelector('.sw-studio__preview-receipt').textContent.includes(i18n.snippetTooLarge), '预览回执必须说明大小限制');
        controller.dispose();
    });
});

// T-7064：复制草稿全文——按钮真实点击，验证空草稿警示与 Clipboard/回退双通路。
test('studio mount: copy button reports empty draft and copies content via execCommand fallback (T-7064)', (t) => {
    const {dom, document, mountSnippetStudio, i18n, fakeStore} = createHarness(t);
    mountSnippetStudio(document.getElementById('root'), {
        i18n, getConfig: () => ({}), store: fakeStore, platform: null, onBack: () => {},
    });
    const copyButton = Array.from(document.querySelectorAll('.sw-studio__button'))
        .find((button) => button.textContent === i18n.snippetCopy);
    assert.ok(copyButton, '复制按钮必须出现在编辑区工具条');
    const status = document.querySelector('.sw-studio__status');
    // 空草稿：不触发布局板，直接警示
    copyButton.click();
    assert.equal(status.dataset.state, 'warn', '空草稿复制必须给出 warn 状态');
    assert.ok(status.textContent.includes('草稿为空'), '空草稿复制必须提示无可复制内容');
    // 写入内容后走 execCommand 回退（jsdom 无 navigator.clipboard）
    let copied = '';
    document.execCommand = function (command) {
        if (command === 'copy') { const scratch = document.body.lastElementChild; copied = scratch?.tagName === 'TEXTAREA' ? scratch.value : ''; return true; }
        return false;
    };
    const editor = document.querySelector('.sw-studio__editor');
    editor.value = '.t7064 { color: hotpink; }';
    editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    copyButton.click();
    return Promise.resolve().then(() => new Promise((resolve) => setTimeout(resolve, 50))).then(() => {
        assert.equal(copied, '.t7064 { color: hotpink; }', '回退通路必须把草稿全文写入剪贴板暂存区');
        assert.equal(status.dataset.state, 'ready', '复制成功必须是 ready 状态');
        assert.ok(status.textContent.includes('已复制'), '复制成功必须有回执文案');
    });
});

test('studio mount: preserves publish-disable metadata and controls native master switches (T-6991)', async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {
        id: '20260925120000-publish', name: 'Publish safe', type: 'css', content: '.publish-safe { color: red; }',
        enabled: true, disabledInPublish: true,
    };
    let current = [native];
    const flags = {enabledCSS: true, enabledJS: false};
    let mutation = null;
    const store = {
        read: async () => current.map((item) => ({...item})),
        readSettings: () => ({...flags}),
        setMaster: async (type, enabled) => {
            flags[type === 'css' ? 'enabledCSS' : 'enabledJS'] = enabled;
            return {...flags};
        },
        mutate: async (_baseline, _action, draft) => {
            mutation = {...draft};
            current = [{...draft}];
            return current.map((item) => ({...item}));
        },
        dispose: () => {},
    };
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n,
        getConfig: () => ({snippet: flags}),
        store,
        session: {draft: {...native}, baseline: {...native}},
        platform: null,
        onBack: () => {},
    });
    await controller.ready;
    const publishInput = document.querySelector('.sw-studio__check-field input');
    assert.ok(publishInput?.checked, '已保存的 disabledInPublish 必须回填到编辑控件');
    assert.match(document.querySelector('.sw-studio__order-meta').textContent, /1\/1/, '原生顺序必须可见');
    publishInput.checked = false;
    publishInput.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
    const saveButton = Array.from(document.querySelectorAll('.sw-studio__button')).find((button) => button.textContent === i18n.snippetSave);
    assert.ok(saveButton, '已保存片段必须显示保存按钮');
    saveButton.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(mutation.disabledInPublish, false, '保存必须把 disabledInPublish 写回原生草稿');
    const cssMaster = document.querySelector('.sw-studio__master-toggle[data-master-type="css"]');
    assert.ok(cssMaster && !cssMaster.disabled, 'CSS 总开关应可直接操作');
    cssMaster.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(flags.enabledCSS, false, 'CSS 总开关应调用原生设置写入');
    assert.equal(cssMaster.getAttribute('aria-pressed'), 'false', '总开关按钮应回显关闭状态');
    controller.dispose();
});

test('studio find keeps focus while typing and commits IME queries once (T-7127)', async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n, store: {read: async () => [], dispose: () => {}},
        session: {draft: {name: '', type: 'css', content: '中文x 中文x', enabled: false}},
    });
    t.after(() => controller.dispose());
    await controller.ready;
    Array.from(document.querySelectorAll('.sw-studio__button')).find((button) => button.textContent === i18n.snippetFindBar).click();
    const editor = document.querySelector('.sw-studio__editor');
    const bar = document.querySelector('.sw-studio__find');
    const query = bar.querySelector('.sw-studio__find-query');
    const count = bar.querySelector('.sw-studio__find-count');
    let selections = 0;
    const setSelectionRange = editor.setSelectionRange.bind(editor);
    editor.setSelectionRange = (...args) => {selections++; setSelectionRange(...args);};
    query.value = '中';
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    assert.equal(document.activeElement, query, '普通查找输入也不能把焦点抢到编辑器');
    assert.equal(count.textContent, '1/2');
    const beforeComposition = selections;
    let hostKeys = 0;
    bar.parentElement.addEventListener('keydown', () => {hostKeys++;});
    query.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {bubbles: true}));
    query.value = 'zhongw';
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true, isComposing: true}));
    assert.equal(selections, beforeComposition, '预编辑不重设编辑器选区');
    assert.equal(count.textContent, '1/2', '预编辑不改变命中');
    for (const key of ['Enter', 'Escape', 'ArrowDown', 'ArrowUp']) {
        const event = new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
        query.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, `${key} 不拦截输入法`);
        assert.equal(bar.hidden, false);
        assert.equal(count.textContent, '1/2');
        assert.equal(document.activeElement, query);
        assert.equal(selections, beforeComposition);
    }
    assert.equal(hostKeys, 0, '组合按键不冒泡到宿主导航或关闭');
    query.value = '中文';
    query.dispatchEvent(new dom.window.CompositionEvent('compositionend', {bubbles: true}));
    assert.equal(selections, beforeComposition + 1, '提交后定位最终查询一次');
    assert.equal(editor.selectionEnd - editor.selectionStart, 2);
    assert.equal(document.activeElement, query, '提交查询保留查找框焦点');
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    assert.equal(selections, beforeComposition + 1, '最终 input 不重复定位');
    for (const properties of [{isComposing: true}, {keyCode: 229}]) {
        query.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, ...properties}));
        assert.equal(bar.hidden, false);
    }
    query.value = '中文x';
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    assert.equal(document.activeElement, query, '提交后连续普通字符仍留在查找框');
    assert.equal(editor.selectionEnd - editor.selectionStart, 3);
    query.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    assert.equal(count.textContent, '2/2');
    assert.equal(document.activeElement, editor, '显式导航才聚焦编辑器');
    query.focus();
    query.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert.equal(bar.hidden, true, '非组合 Esc 正常关闭查找');
});

test('studio replace waits for IME commit before its two-step transaction (T-7127)', async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n, store: {read: async () => [], dispose: () => {}},
        session: {draft: {name: '', type: 'css', content: '中文 中文', enabled: false}},
    });
    t.after(() => controller.dispose());
    await controller.ready;
    const button = (label) => Array.from(document.querySelectorAll('.sw-studio__button')).find((element) => element.textContent === label);
    button(i18n.snippetFindBar).click();
    const editor = document.querySelector('.sw-studio__editor');
    const bar = document.querySelector('.sw-studio__find');
    const query = bar.querySelector('.sw-studio__find-query');
    const replacement = bar.querySelector('.sw-studio__find-replace');
    const replaceAll = Array.from(bar.querySelectorAll('button')).find((element) => element.textContent === i18n.snippetFindReplaceAll);
    query.value = '中文';
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    replaceAll.click();
    assert.notEqual(replaceAll.textContent, i18n.snippetFindReplaceAll, '先建立替换确认');
    replacement.focus();
    let hostKeys = 0;
    bar.parentElement.addEventListener('keydown', () => {hostKeys++;});
    replacement.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {bubbles: true}));
    replacement.value = '替换';
    replacement.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true, isComposing: true}));
    replaceAll.click();
    replaceAll.click();
    assert.equal(editor.value, '中文 中文', '已确认的替换也不得使用组合中的替换词');
    replacement.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, isComposing: true}));
    assert.equal(bar.hidden, false);
    assert.equal(hostKeys, 0, '替换词的组合按键也不冒泡到宿主关闭');
    replacement.dispatchEvent(new dom.window.CompositionEvent('compositionend', {bubbles: true}));
    replacement.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    assert.equal(replaceAll.textContent, i18n.snippetFindReplaceAll, '提交替换词后重新要求确认');
    replaceAll.click();
    assert.equal(editor.value, '中文 中文', '第一步仍只确认');
    replaceAll.click();
    assert.equal(editor.value, '替换 替换', '提交后正常完成字面替换');
    button(i18n.snippetUndo).click();
    assert.equal(editor.value, '中文 中文', '替换仍是单次可撤销事务');
});

test('studio picker filters committed IME queries once and keeps normal navigation (T-7127)', async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const snippets = [
        {id: '20261006000000-aaaaaaa', name: '中文一', type: 'css', content: '.one{}', enabled: false},
        {id: '20261006000000-bbbbbbb', name: '中文二', type: 'css', content: '.two{}', enabled: false},
    ];
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n, store: {read: async () => snippets, dispose: () => {}},
    });
    t.after(() => controller.dispose());
    await controller.ready;
    Array.from(document.querySelectorAll('.sw-studio__button')).find((button) => button.textContent === i18n.snippetChoose).click();
    const picker = document.querySelector('.sw-studio__picker');
    const query = picker.querySelector('.sw-studio__filters input');
    const list = picker.querySelector('.sw-studio__catalog');
    const originalFirst = list.querySelector('.sw-studio__catalog-item');
    assert.ok(originalFirst, '测试须从非空生产目录开始');
    let hostEscapes = 0;
    document.addEventListener('keydown', (event) => {if (event.key === 'Escape') hostEscapes++;});
    query.dispatchEvent(new dom.window.CompositionEvent('compositionstart', {bubbles: true}));
    query.value = 'zhongw';
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true, isComposing: true}));
    assert.equal(list.querySelector('.sw-studio__catalog-item'), originalFirst, '预编辑不重绘目录');
    for (const key of ['Enter', 'Escape', 'ArrowDown', 'ArrowUp']) {
        const event = new dom.window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
        query.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, `${key} 不拦截输入法`);
        assert.equal(picker.isConnected, true, `${key} 不关闭目录`);
        assert.equal(document.activeElement, query);
    }
    assert.equal(hostEscapes, 0, '本地组合态不能把 Esc 冒泡给宿主关闭');
    const source = picker.querySelector(`[aria-label="${i18n.snippetSource}"]`);
    source.value = 'native';
    source.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    assert.equal(list.querySelectorAll('.sw-studio__catalog-item').length, 2, '其他筛选即时更新但只使用已提交查询');
    query.value = '中文';
    query.dispatchEvent(new dom.window.CompositionEvent('compositionend', {bubbles: true}));
    const committedFirst = list.querySelector('.sw-studio__catalog-item');
    assert.ok(committedFirst?.textContent.includes('中文'));
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    assert.equal(list.querySelector('.sw-studio__catalog-item'), committedFirst, '最终 input 不重复重绘目录');
    for (const properties of [{isComposing: true}, {keyCode: 229}]) {
        query.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, ...properties}));
        assert.equal(picker.isConnected, true);
        committedFirst.focus();
        committedFirst.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, ...properties}));
        assert.equal(document.activeElement, committedFirst, '事件组合标志及 229 不触发目录导航');
    }
    committedFirst.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true}));
    assert.notEqual(document.activeElement, committedFirst, '非组合方向仍导航目录');
    query.focus();
    query.value = '中文一';
    query.dispatchEvent(new dom.window.InputEvent('input', {bubbles: true}));
    assert.equal(list.querySelectorAll('.sw-studio__catalog-item').length, 1, '后续普通输入立即筛选');
    query.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    assert.equal(picker.isConnected, false, '非组合 Esc 仍关闭当前目录');
});

test('studio picker restores focus to the entry that opened it', async (t) => {
    const {document, mountSnippetStudio, i18n} = createHarness(t);
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n, store: {read: async () => [], dispose: () => {}},
    });
    t.after(() => controller.dispose());
    await controller.ready;

    const storeButton = Array.from(document.querySelectorAll('.sw-studio__button'))
        .find((button) => button.textContent === i18n.snippetStore);
    assert.ok(storeButton, '组件商店入口必须存在');
    storeButton.focus();
    storeButton.click();
    const picker = document.querySelector('.sw-studio__picker');
    assert.ok(picker, '组件商店选择器必须打开');
    const close = Array.from(picker.querySelectorAll('button'))
        .find((button) => button.textContent === i18n.snippetClose);
    assert.ok(close, '选择器必须提供关闭入口');
    close.click();
    assert.equal(document.activeElement, storeButton, '关闭选择器后焦点应回到实际打开入口');
});

test('studio picker exposes an in-place enable/disable action for native snippets (T-7229)', async (t) => {
    const {document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {id: '20261006000000-toggle01', name: 'Toggle me', type: 'css', content: '.toggle{}', enabled: false};
    let writes = 0;
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n,
        session: {draft: {...native}, baseline: {...native}},
        store: {
            read: async () => [{...native}],
            mutate: async (baseline, action, draft) => {
                assert.equal(action, 'toggle');
                assert.equal(baseline.id, native.id);
                writes += 1;
                return [{...draft, enabled: true}];
            },
            dispose: () => {},
        },
    });
    t.after(() => controller.dispose());
    await controller.ready;
    Array.from(document.querySelectorAll('.sw-studio__button')).find((button) => button.textContent === i18n.snippetChoose).click();
    const picker = document.querySelector('.sw-studio__picker');
    const row = picker.querySelector(`.sw-studio__catalog-item[data-snippet-id="${native.id}"]`).parentElement;
    const toggle = row.querySelector('.sw-studio__catalog-toggle');
    assert.ok(toggle, '原生片段目录项必须提供就地启停按钮');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.getAttribute('aria-label'), `${i18n.snippetEnable}: ${native.name}`);
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(writes, 1);
    assert.equal(document.querySelector('.sw-studio__catalog-toggle')?.getAttribute('aria-pressed'), 'true');
});

test('studio picker quick toggle refuses to bypass an unsaved draft (T-7229)', async (t) => {
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {id: '20261006000000-toggle02', name: 'Toggle guard', type: 'css', content: '.guard{}', enabled: false};
    let writes = 0;
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n,
        session: {draft: {...native}, baseline: {...native}},
        store: {read: async () => [{...native}], mutate: async () => { writes += 1; }, dispose: () => {}},
    });
    t.after(() => controller.dispose());
    await controller.ready;
    const editor = document.querySelector('.sw-studio__editor');
    editor.value = '.unsaved{}';
    editor.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    Array.from(document.querySelectorAll('.sw-studio__button')).find((button) => button.textContent === i18n.snippetChoose).click();
    document.querySelector(`.sw-studio__catalog-item[data-snippet-id="${native.id}"]`).parentElement.querySelector('.sw-studio__catalog-toggle').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(writes, 0, '未保存草稿存在时，目录快捷启停不得绕过离开守卫');
    assert.equal(document.querySelector('.sw-studio__status').dataset.state, 'blocked');
});

test('studio persistent snippet selector exposes the same in-place toggle (T-7229)', async (t) => {
    const {document, mountSnippetStudio, i18n} = createHarness(t);
    const native = {id: '20261006000000-library-toggle', name: 'Library toggle', type: 'css', content: '.library-toggle{}', enabled: false};
    let writes = 0;
    const controller = mountSnippetStudio(document.getElementById('root'), {
        i18n,
        store: {
            read: async () => [{...native}],
            mutate: async (_baseline, action, draft) => {
                assert.equal(action, 'toggle');
                writes += 1;
                return [{...draft, enabled: true}];
            },
            dispose: () => {},
        },
    });
    t.after(() => controller.dispose());
    await controller.ready;
    const row = document.querySelector(`.sw-studio__library-item[data-library-snippet-id="${native.id}"]`).parentElement;
    const toggle = row.querySelector('.sw-studio__library-toggle');
    assert.ok(toggle, '常驻片段选择器必须提供就地启停按钮');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(writes, 1);
    assert.equal(document.querySelector('.sw-studio__library-toggle')?.getAttribute('aria-pressed'), 'true');
});
