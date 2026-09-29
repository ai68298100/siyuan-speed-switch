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
