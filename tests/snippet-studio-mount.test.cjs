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
