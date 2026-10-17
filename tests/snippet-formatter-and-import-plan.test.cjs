const test = require("node:test");
const assert = require("node:assert/strict");
const {formatCss, formatWithCursor, normalizeDeclaration} = require("../src/snippet-formatter.js");
const {planSnippetImport, isValidSnippetEntry} = require("../src/snippet-import-plan.js");

// ===========================================================================
// 一、零依赖 CSS 格式化器 (Lightweight Formatter) 测试
// ===========================================================================

test("normalizeDeclaration formats single CSS declaration with spaces and trailing semicolon", () => {
    assert.equal(normalizeDeclaration("color:red"), "color: red;");
    assert.equal(normalizeDeclaration("font-size:   14px;"), "font-size: 14px;");
    assert.equal(normalizeDeclaration("margin:0 10px"), "margin: 0 10px;");
});

test("formatCss indents rules, normalizes spaces and preserves block comments", () => {
    const raw = `
/* Theme focus ring */
.protyle:focus-visible{outline:none;box-shadow:0 0 0 2px #5946d2;}
@media (max-width: 560px){
.protyle{font-size:14px;}
}
`;
    const formatted = formatCss(raw);

    // 格式化验证
    assert.ok(formatted.includes("/* Theme focus ring */"));
    assert.ok(formatted.includes(".protyle:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px #5946d2;\n}"));
    assert.ok(formatted.includes("@media (max-width: 560px) {\n  .protyle {\n    font-size: 14px;\n  }\n}"));
});

test("formatWithCursor projects cursor position across whitespace normalization", () => {
    const raw = ".test { color:red; }";
    // 光标位于 "red" 之后 (offset 17)
    const cursorOffset = raw.indexOf("red") + 3;
    const {formatted, cursorOffset: nextOffset} = formatWithCursor(raw, cursorOffset, "css");

    // 验证格式化结果
    assert.ok(formatted.includes("color: red;"));
    // 验证新光标落在格式化后文本的 "red" 之后
    const formattedRedIndex = formatted.indexOf("red") + 3;
    assert.equal(nextOffset, formattedRedIndex);
});

// ===========================================================================
// 二、代码片段导入规划引擎 (Snippet Import Plan) 测试
// ===========================================================================

test("isValidSnippetEntry validates structural integrity", () => {
    assert.equal(isValidSnippetEntry({name: "Valid CSS", content: "body {}", type: "css"}), true);
    assert.equal(isValidSnippetEntry({name: "Valid JS", content: "console.log(1)", type: "js"}), true);
    assert.equal(isValidSnippetEntry({name: "", content: "body {}", type: "css"}), false);
    assert.equal(isValidSnippetEntry({name: "Invalid type", content: "body {}", type: "html"}), false);
    assert.equal(isValidSnippetEntry(null), false);
});

test("planSnippetImport merge mode updates matching ID, preserves enabled state, and appends new", () => {
    const local = [
        {id: "s1", name: "Old Focus", content: "old code", type: "css", enabled: true},
        {id: "s2", name: "Local Only", content: "local code", type: "css", enabled: false}
    ];
    const incoming = [
        {id: "s1", name: "New Focus", content: "updated code", type: "css", enabled: false}, // 远端 enabled 为 false
        {id: "s3", name: "Brand New", content: "new code", type: "css", enabled: true}
    ];

    const plan = planSnippetImport(local, incoming, {mode: "merge"});

    assert.equal(plan.updatedCount, 1);
    assert.equal(plan.addedCount, 1);
    assert.equal(plan.list.length, 3);

    // 关键契约：本地同 ID 的 enabled 属性必须被严格保留，绝不可被远端静默覆盖！
    const s1 = plan.list.find(s => s.id === "s1");
    assert.equal(s1.name, "New Focus");
    assert.equal(s1.content, "updated code");
    assert.equal(s1.enabled, true, "Local enabled state must be preserved during merge");

    // 本地独有的 s2 必须保留
    const s2 = plan.list.find(s => s.id === "s2");
    assert.equal(s2.name, "Local Only");

    // 新增的 s3 正常导入
    const s3 = plan.list.find(s => s.id === "s3");
    assert.equal(s3.name, "Brand New");
});

test("planSnippetImport fork mode generates fresh IDs and imports as disabled copies", () => {
    let mockIdCounter = 100;
    const mockIdGen = () => `mock-${mockIdCounter++}`;

    const local = [
        {id: "s1", name: "Existing Snippet", content: "original code", type: "css", enabled: true}
    ];
    const incoming = [
        {id: "s1", name: "Incoming Copy", content: "improved code", type: "css", enabled: true}
    ];

    const plan = planSnippetImport(local, incoming, {mode: "fork", idGenerator: mockIdGen});

    assert.equal(plan.addedCount, 1);
    assert.equal(plan.updatedCount, 0);
    assert.equal(plan.list.length, 2);

    // 关键契约：fork 模式必须重新分配 ID，且新克隆副本默认安全未启用
    const forked = plan.list[0];
    assert.equal(forked.id, "mock-100");
    assert.equal(forked.name, "Incoming Copy");
    assert.equal(forked.enabled, false);

    // 原始 local 必须毫发无伤
    const original = plan.list[1];
    assert.equal(original.id, "s1");
    assert.equal(original.enabled, true);
});

test("planSnippetImport overwrite mode completely mirrors incoming valid items", () => {
    const local = [
        {id: "s1", name: "To Be Replaced", content: "old", type: "css", enabled: true}
    ];
    const incoming = [
        {id: "m1", name: "Mirror 1", content: "m1", type: "css", enabled: true},
        {name: "Invalid"} // 无效项，应被跳过
    ];

    const plan = planSnippetImport(local, incoming, {mode: "overwrite"});

    assert.equal(plan.addedCount, 1);
    assert.equal(plan.skippedCount, 1);
    assert.equal(plan.list.length, 1);
    assert.equal(plan.list[0].id, "m1");
});
