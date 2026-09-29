// T-6995：预览组件 mount 级 DOM 测试（jsdom）——createSnippetPreview 是自包含
// 组件（iframe + 容器 + 消息监听），挂载/渲染/交互/销毁全部可断言：
// - 安全属性：sandbox（css 空/js 受限）、CSP meta、referrerPolicy；
// - 宽度交互：容器容不下档位即回退单视图（无内联宽度）；
// - 主题交互：dark 渲染快照 token、baseline 关探针；
// - 生命周期：dispose 后渲染为 no-op、帧已移除。
const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {createSnippetPreview} = require('../src/snippet-studio-preview.js');

function mount(doc, clientWidth) {
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    if (clientWidth !== undefined) {
        Object.defineProperty(container, "clientWidth", {value: clientWidth, configurable: true});
    }
    return container;
}

test('mount: css preview carries sandbox/CSP/referrer invariants (T-6995)', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const container = mount(dom.window.document, 1200);
    const preview = createSnippetPreview(container, {title: "预览"});
    preview.render({type: "css", content: ".h3 { color: red; }", dark: false, scene: "reading", width: "auto"});
    const frame = container.querySelector("iframe");
    assert.ok(frame, "渲染后容器必须挂 iframe");
    assert.equal(frame.getAttribute("sandbox"), "", "css 预览 sandbox 必须为空串（禁脚本）");
    // jsdom 不反射 iframe 的 referrerPolicy 属性，断言 IDL 值（生产代码 setAttribute 同步）
    assert.equal(frame.referrerPolicy, "no-referrer");
    assert.ok(frame.title.includes("预览"));
    const srcdoc = frame.srcdoc || frame.getAttribute("srcdoc");
    // srcdoc 属性值内的引号被 HTML 转义（' → &#39;）
    assert.match(srcdoc, /Content-Security-Policy[^>]*connect-src &#39;none&#39;/, "CSP 必须禁网络");
    assert.match(srcdoc, /script-src &#39;none&#39;/, "css 预览脚本必须 none");
    assert.doesNotMatch(srcdoc.replace(/&#39;/g, "'"), /<script/, "css 预览文档零脚本元素");
    preview.dispose();
});

test('mount: width tier applies when the container fits and falls back to single view (T-6995)', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const container = mount(dom.window.document, 1200);
    const preview = createSnippetPreview(container, {});
    preview.render({type: "css", content: "", dark: false, scene: "reading", width: "narrow"});
    let frame = container.querySelector("iframe");
    assert.equal(frame.style.width, "420px", "容器 1200 容得下 420 档 → 定宽居中");
    // 容器收窄到 300：同一档位回退单视图（无内联宽度）
    Object.defineProperty(container, "clientWidth", {value: 300, configurable: true});
    preview.render({type: "css", content: "", dark: false, scene: "reading", width: "narrow"});
    frame = container.querySelector("iframe");
    assert.equal(frame.style.width, "", "容器不足必须回退单视图（无内联宽度）");
    preview.dispose();
});

test('mount: dark theme renders snapshot tokens and baseline keeps probes off (T-6995)', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const container = mount(dom.window.document, 1200);
    const preview = createSnippetPreview(container, {});
    preview.render({type: "css", content: ".h3 { color: red; }", dark: true, scene: "reading", width: "auto"});
    let srcdoc = container.querySelector("iframe").srcdoc || container.querySelector("iframe").getAttribute("srcdoc");
    assert.match(srcdoc, /color-scheme:dark/, "暗色渲染必须声明 dark 配色");
    assert.match(srcdoc, /--b3-theme-background:#20242c/, "暗色 token 必须出自内置快照");
    // 探针命中：.h3 是基础特征，不追加探针区块；用探针特征（callout）验证
    preview.render({type: "css", content: ".b3-callout { color: red; }", dark: false, scene: "reading", width: "auto"});
    srcdoc = container.querySelector("iframe").srcdoc || container.querySelector("iframe").getAttribute("srcdoc");
    assert.match(srcdoc, /b3-callout/, "探针命中的 Callout 夹具必须出现在文档中");
    // 基线对照：同一片段不追加探针
    preview.render({type: "css", content: ".b3-callout { color: red; }", dark: false, baseline: true, scene: "reading", width: "auto"});
    srcdoc = container.querySelector("iframe").srcdoc || container.querySelector("iframe").getAttribute("srcdoc");
    assert.doesNotMatch(srcdoc, /按当前 CSS 追加的探针内容|以下元素由你的片段选择器命中/, "基线对照必须关闭探针区块");
    preview.dispose();
});

test('mount: dispose removes the frame and renders become no-ops (T-6995)', () => {
    const dom = new JSDOM('<!doctype html><body></body>');
    const container = mount(dom.window.document, 1200);
    const preview = createSnippetPreview(container, {});
    preview.render({type: "css", content: "", dark: false, scene: "reading", width: "auto"});
    assert.ok(container.querySelector("iframe"));
    preview.dispose();
    assert.equal(container.querySelector("iframe"), null, "dispose 必须移除帧");
    preview.render({type: "css", content: "", dark: false, scene: "reading", width: "auto"});
    assert.equal(container.querySelector("iframe"), null, "dispose 后渲染必须是 no-op");
});
