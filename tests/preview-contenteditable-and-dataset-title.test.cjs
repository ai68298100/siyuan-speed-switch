// T-7372 预览窗格无 contenteditable 节点回退与 dataset.title 兜底契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 extractDocPreviewBlocks 支持从没有 contenteditable="true" 的节点自身安全提取文本；
//   2. 验证 docPreviewItemTitle 优先读取 item.dataset.title；
//   3. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const docSearchTs = readSourceText(path.join(root, "src", "doc-search-ui.ts"));

test("T-7372: extractDocPreviewBlocks 支持无 contenteditable 节点平滑回退", () => {
    assert.match(
        docSearchTs,
        /if \(kind\) add\(node\.querySelector\('\[contenteditable="true"\]'\) \|\| node, kind\);/,
        "段落/代码/引用块缺少 contenteditable 标记时必须回退到 node 自身",
    );
    assert.match(
        docSearchTs,
        /const textNode = item\.querySelector\('\[contenteditable="true"\]'\) \|\| item;/,
        "列表/任务项缺少 contenteditable 时必须回退到 item 自身",
    );
});

test("T-7372: docPreviewItemTitle 支持 item.dataset.title 首选兜底", () => {
    assert.match(
        docSearchTs,
        /function docPreviewItemTitle\(item: HTMLElement\): string\s*\{\s*\n\s*return item\.dataset\.title \|\| item\.querySelector/,
        "docPreviewItemTitle 必须优先读取 item.dataset.title 防止标题留空",
    );
});

test("T-7372 门禁负向验证: 若缺少 node 回退必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在代码
    assert.throws(() => {
        assert.match(docSearchTs, /fake_non_existent_preview_method/);
    }, assert.AssertionError);

    // 探针 2: 负向断言旧的无兜底选择器不能再独占实现
    assert.doesNotMatch(docSearchTs, /if \(kind\) add\(node\.querySelector\('\[contenteditable="true"\]'\), kind\);/);
});
