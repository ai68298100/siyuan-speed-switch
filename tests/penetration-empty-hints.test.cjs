// T-7360: 搜索空态智能符号穿透建议与交互契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 appendDocResultsEmpty 在无结果且为普通查询时生成 sw__search-empty-hints；
//   2. 验证智能穿透包含正文块 (^)、标题大纲 (@)、标签 (#) 快捷按钮；
//   3. 验证已有符号前缀 (@ / ^ / #) 或空查询时静默省略，不重复冗余提示；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");

// 垫片 siyuan 模块（类型包无 CJS 运行时实现）
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "siyuan") return "siyuan";
    return originalResolve.call(this, request, parent, isMain, options);
};
require.cache["siyuan"] = {
    id: "siyuan",
    filename: "siyuan",
    loaded: true,
    exports: {openTab: () => {}, showMessage: () => {}},
};

const {JSDOM} = require("jsdom");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const docSearchTs = readSourceText(path.join(root, "src", "doc-search-ui.ts"));
const docSearchJs = readSourceText(path.join(root, "src", "doc-search-ui.js"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));
const {appendDocResultsEmpty} = require("../src/doc-search-ui.js");

test("T-7360: 源码声明 sw__search-empty-hints 与快捷穿透按钮", () => {
    assert.match(docSearchTs, /sw__search-empty-hints/);
    assert.match(docSearchTs, /sw__search-empty-chip/);
    assert.match(docSearchJs, /sw__search-empty-hints/);
    assert.match(polishScss, /\.sw__search-empty-hints\s*\{/);
    assert.match(polishScss, /\.sw__search-empty-chip\s*\{/);
});

test("T-7360: appendDocResultsEmpty 运行时在普通查询下装配深度穿透建议", () => {
    const dom = new JSDOM("<!doctype html><html><body><div class='speed-switch'><input class='sw__search' value='meeting'><div class='sw__scroll' data-sw-doc-search-query='meeting'><div id='box'></div></div></div></body></html>");
    global.document = dom.window.document;
    const doc = dom.window.document;
    const box = doc.getElementById("box");
    const scrollElement = doc.querySelector(".sw__scroll");

    const host = {
        i18n: {
            noDocResults: "未找到相关文档",
            docSearchEmptyHint: "当前范围没有匹配",
            docSearchViewAll: "全局搜索",
            searchTryPenetration: "尝试深度穿透：",
            searchModeBlock: "正文块",
            searchModeHeading: "标题大纲",
            searchModeTag: "标签",
        },
        docSearchState: {filters: new Map()},
        isSemanticSearchAvailable: () => false,
    };

    appendDocResultsEmpty.call(host, box, scrollElement, () => {});

    const hints = box.querySelector(".sw__search-empty-hints");
    assert.ok(hints, "普通查询空态时必须渲染深度穿透建议条");
    const chips = box.querySelectorAll(".sw__search-empty-chip");
    assert.equal(chips.length, 3, "必须提供正文块、大纲、标签 3 个模式按钮");
    assert.ok(chips[0].textContent.includes("^meeting"), "必须包含正文块快捷前缀");
    assert.ok(chips[1].textContent.includes("@meeting"), "必须包含大纲快捷前缀");
    assert.ok(chips[2].textContent.includes("#meeting"), "必须包含标签快捷前缀");

    // 点击测试：点击正文块按钮应自动填入带前缀的输入框
    chips[0].click();
    const searchInput = doc.querySelector(".sw__search");
    assert.equal(searchInput.value, "^meeting");
});

test("T-7360 门禁负向验证: 若已有前缀或空查询绝不产生冗余提示条", () => {
    const dom = new JSDOM("<!doctype html><html><body><div class='speed-switch'><div class='sw__scroll' data-sw-doc-search-query='^already_penetrated'><div id='box'></div></div></div></body></html>");
    global.document = dom.window.document;
    const doc = dom.window.document;
    const box = doc.getElementById("box");
    const scrollElement = doc.querySelector(".sw__scroll");

    const host = {
        i18n: {
            noDocResults: "未找到相关文档",
            docSearchEmptyHint: "当前范围没有匹配",
            docSearchViewAll: "全局搜索",
            searchTryPenetration: "尝试深度穿透：",
            searchModeBlock: "正文块",
            searchModeHeading: "标题大纲",
            searchModeTag: "标签",
        },
        docSearchState: {filters: new Map()},
        isSemanticSearchAvailable: () => false,
    };

    // 已有 ^ 前缀时
    appendDocResultsEmpty.call(host, box, scrollElement, () => {});
    assert.equal(box.querySelector(".sw__search-empty-hints"), null, "已有穿透前缀时不得重复提示穿透");

    // 空查询时
    box.innerHTML = "";
    scrollElement.dataset.swDocSearchQuery = "";
    appendDocResultsEmpty.call(host, box, scrollElement, () => {});
    assert.equal(box.querySelector(".sw__search-empty-hints"), null, "空查询时不得显示穿透建议");
});
