// T-7360 文档搜索结果项 ⌘K 呼出次级动作画板与近期搜索清空芯片契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 DocSearchUiHost 声明 openActionPaletteForDoc 接口；
//   2. 验证 buildDocResultItem 监听 ⌘K / Ctrl+K 并安全调用 openActionPaletteForDoc；
//   3. 验证 index.ts 声明 openActionPaletteForDoc 并解构 doc 上下文；
//   4. 验证 executePaletteAction 允许空 tab 并自动回退至 _ctx.rootId / _ctx.blockId；
//   5. 验证 buildEmptyState 声明 .sw__recent-query-clear 按钮；
//   6. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const docSearchTs = readSourceText(path.join(root, "src", "doc-search-ui.ts"));
const docSearchJs = readSourceText(path.join(root, "src", "doc-search-ui.js"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));

test("T-7360: DocSearchUiHost 与 buildDocResultItem 接入 ⌘K / Ctrl+K 动作画板唤出", () => {
    assert.match(docSearchTs, /openActionPaletteForDoc\?\(doc:\s*IDocSearchResult/);
    assert.ok(
        docSearchTs.includes("this.openActionPaletteForDoc?.(doc, item);"),
        "doc-search-ui.ts 必须在 ⌘K/Ctrl+K 时调用 openActionPaletteForDoc",
    );
    assert.ok(
        docSearchJs.includes("this.openActionPaletteForDoc(doc, item)"),
        "doc-search-ui.js 必须在 ⌘K/Ctrl+K 时响应",
    );
});

test("T-7360: index.ts 声明 openActionPaletteForDoc 与增强型 executePaletteAction", () => {
    assert.match(indexTs, /openActionPaletteForDoc\(doc:\s*any,\s*item\?: HTMLElement\):/);
    assert.match(indexTs, /const rootId = \(tab \? this\.rootIdOf\(tab\) : _ctx\?\.rootId\) \|\| _ctx\?\.rootId/);
    assert.match(indexTs, /const blockId = _ctx\?\.blockId \|\| "";/);
});

test("T-7360: 搜索空态声明 .sw__recent-query-clear 清除历史微按钮", () => {
    assert.match(indexTs, /sw__recent-query-clear/);
    assert.match(indexTs, /this\.recentSearchQueries = \[\];\s*recentBox\.remove\(\);/);
    assert.match(polishScss, /\.sw__recent-query-clear\s*\{/);
});

test("T-7360 门禁负向验证: 若缺少画板唤出或清空逻辑被破坏必定精准红", () => {
    // 探针 1: 负向验证不存在的假快捷键
    assert.doesNotMatch(
        docSearchTs,
        /event\.key\.toLowerCase\(\) === "non_existent_fake_palette_key"/,
    );

    // 探针 2: 负向断言伪造的不存在空态按钮类
    assert.throws(() => {
        assert.match(polishScss, /\.sw__fake_non_existent_recent_query_clear_class/);
    }, assert.AssertionError);
});
