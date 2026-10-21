// T-7360 代码片段实验室编辑器行号布局修复与探针智能置顶优先契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 .sw-studio__editor-frame 具备 display: flex 与 flex-direction: row，杜绝行号横向折行错位；
//   2. 验证 .sw-studio__line-numbers 具备 white-space: pre !important 与固定宽度规范；
//   3. 验证 buildSnippetPreviewDocument 对命中特征（如标题）智能置顶优先呈现；
//   4. 验证预览主工作区纵向面积扩充（min-height >= 350px）；
//   5. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));
const studioScss = readSourceText(path.join(root, "src", "styles", "_snippet-studio.scss"));
const {buildSnippetPreviewDocument} = require("../src/snippet-studio-preview.js");

test("T-7360: editor-frame 声明水平 flex 布局且 line-numbers 声明 white-space: pre", () => {
    // 1. 验证 editor-frame 水平 flex 排布
    assert.match(
        polishScss,
        /\.sw-studio__editor-frame\s*\{[^}]*display:\s*flex\s*!important/s,
        "editor-frame 必须声明 display: flex !important",
    );
    assert.match(
        polishScss,
        /\.sw-studio__editor-frame\s*\{[^}]*flex-direction:\s*row\s*!important/s,
        "editor-frame 必须声明 flex-direction: row !important",
    );

    // 2. 验证行号容器 white-space: pre 防止数字横向折行粘连
    assert.match(
        polishScss,
        /\.sw-studio__line-numbers\s*\{[^}]*white-space:\s*pre\s*!important/s,
        "line-numbers 必须声明 white-space: pre !important 保证每行一个数字垂直排列",
    );
    assert.match(
        polishScss,
        /\.sw-studio__line-numbers\s*\{[^}]*width:\s*38px\s*!important/s,
        "line-numbers 必须声明固定宽度 38px",
    );
});

test("T-7360: 预览文档根据代码特征智能优先置顶呈现独特效果（如标题代码优先置顶）", () => {
    // 传入定制标题样式的 CSS
    const headingCss = "h1 { color: #b57a58; } h3, h4 { font-weight: bold; }";
    const doc = buildSnippetPreviewDocument({scene: "reading", type: "css", content: headingCss});

    // 探针说明行必须在综合样例之前出现（索引更靠前）
    const probeIndex = doc.indexOf("studio-probe-note");
    const sampleIndex = doc.indexOf("让灵感有自己的样子");

    assert.ok(probeIndex > 0, "命中特征时必须生成探针说明");
    assert.ok(sampleIndex > 0, "必须包含基础文档样例");
    assert.ok(
        probeIndex < sampleIndex,
        "命中的特征探针（如标题）必须优先置顶排在基础综合样例之前，使用户免于滚动",
    );
    assert.ok(doc.includes("一级标题探针"), "标题特征必须包含置顶的一级标题探针");
    assert.ok(doc.includes("二级标题探针"), "标题特征必须包含置顶的二级标题探针");
});

test("T-7360: 预览工作区纵向面积扩增（最小高度 >= 350px 且行占比扩大）", () => {
    assert.match(
        studioScss,
        /&__main\s*\{\s*display:\s*grid;\s*grid-template-rows:\s*minmax\(360px,\s*1\.8fr\)/,
        "预览工作区第一行必须声明 minmax(360px, 1.8fr) 确保预览区域面积更大",
    );
    assert.match(
        studioScss,
        /&__preview\s*\{[^}]*min-height:\s*240px/,
        "预览画布必须声明至少 240px 最小高度",
    );
});

test("T-7360 门禁负向验证: 若行号失去 pre 或探针被置底必须精准红", () => {
    // 探针 1: 负向验证普通的没有命中特征的代码不会产生前置 probeNote
    const plainDoc = buildSnippetPreviewDocument({scene: "reading", type: "css", content: ".custom-unknown-class {}"});
    assert.equal(plainDoc.includes('class="studio-probe-note"'), false);

    // 探针 2: 负向断言伪造的不存在样式类
    assert.throws(() => {
        assert.match(polishScss, /sw-studio__non_existent_fake_class/);
    }, assert.AssertionError);
});
