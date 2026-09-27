// T-6970（真机反馈）：缩略图空框防护——前导空白块裁剪与视觉空白判定的纯函数行为。
// 背景：日记等文档克隆内容以空段落开头，缩放后整框只剩空白；真机截图出现"有图区的空卡片"。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {
    isBlankThumbNode,
    trimLeadingBlankThumbNodes,
    hasVisibleThumbContent,
} = require("../src/util.js");

function withDom(fn) {
    const dom = new JSDOM("<!doctype html><body></body>");
    fn(dom.window.document, dom.window);
    dom.window.close();
}

test("thumb blank guard: empty leading paragraphs are trimmed, real content kept", () => {
    withDom((doc) => {
        const root = doc.createElement("div");
        root.innerHTML = "<p><br></p><p>  </p><p>正文开始</p><p>第二段</p>";
        const removed = trimLeadingBlankThumbNodes(root);
        assert.equal(removed, 2, "前导两个空段落应被裁掉");
        assert.equal(root.firstChild.textContent, "正文开始");
        assert.equal(root.children.length, 2);
    });
});

test("thumb blank guard: media-bearing nodes are never treated as blank", () => {
    withDom((doc) => {
        const root = doc.createElement("div");
        root.innerHTML = "<div><img src='x.png'></div><p>文字</p>";
        assert.equal(trimLeadingBlankThumbNodes(root), 0, "含 img 的首块不得裁剪");
        assert.ok(isBlankThumbNode(root.firstChild) === false);
        // 纯媒体文档：无文本但有图，不算空白
        const mediaOnly = doc.createElement("div");
        mediaOnly.innerHTML = "<p><br></p><figure><img src='x.png'></figure>";
        trimLeadingBlankThumbNodes(mediaOnly);
        assert.ok(hasVisibleThumbContent(mediaOnly), "裁掉空段后仅剩图片也应判为有内容");
    });
});

test("thumb blank guard: fully blank content is detected for placeholder fallback", () => {
    withDom((doc) => {
        const blank = doc.createElement("div");
        blank.innerHTML = "<p><br></p><p></p><span> </span>";
        assert.equal(trimLeadingBlankThumbNodes(blank), 3);
        assert.equal(hasVisibleThumbContent(blank), false, "全空白内容必须报告 false，调用方回退标题占位");
        // 病态超长空块：裁剪数有上限，不得死循环
        const many = doc.createElement("div");
        for (let i = 0; i < 100; i++) many.appendChild(doc.createElement("p"));
        assert.equal(trimLeadingBlankThumbNodes(many), 32, "默认上限 32，防病态结构");
    });
});

test("thumb blank guard: text nodes and code/svg/table are handled", () => {
    withDom((doc) => {
        const root = doc.createElement("div");
        root.appendChild(doc.createTextNode("   "));
        const code = doc.createElement("pre");
        code.textContent = "console.log(1)";
        root.appendChild(code);
        assert.equal(trimLeadingBlankThumbNodes(root), 1, "前导空白文本节点裁掉");
        assert.ok(hasVisibleThumbContent(root), "代码块文本算可见内容");
        // 代码块里看似空但含行号空格——textContent 全空且无媒体才算空白
        const svgRoot = doc.createElement("div");
        svgRoot.innerHTML = "<p></p><svg></svg>";
        trimLeadingBlankThumbNodes(svgRoot);
        assert.ok(hasVisibleThumbContent(svgRoot), "svg 判为可见内容");
    });
});
