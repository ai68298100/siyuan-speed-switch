const {readSourceText} = require("./source-scan.cjs");
// T-6257（D-384）文档搜索分页契约：面板内「加载更多」增量展开 + 尽头回落原生出口。
// 渲染切片决策在 search-model.planDocResultsPage（单元测试见 search-model.test.cjs），
// 本文件锁定 DOM 层接线形态与取数上限，防止分页语义在后续重构中漂移。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const docSearchUi = readSourceText(path.join(root, "src", "doc-search-ui.ts"));
const searchModel = readSourceText(path.join(root, "src", "search-model.js"));
// 下面 "pagination cursors never enter search cache keys" 刻意断言 JSDoc 里声明的不
// 变量（"The expansion * cursor never enters search cache keys"）——那是一条文档契约，
// 注释就是被断言的客体，因此该条断言必须读**原始文本**，不能被剥注释（D-395）。
const searchModelRaw = fs.readFileSync(path.join(root, "src", "search-model.js"), "utf8");
const constants = readSourceText(path.join(root, "src", "constants.ts"));
const index = readSourceText(path.join(root, "src", "index.ts"));
const zh = JSON.parse(fs.readFileSync(path.join(root, "src", "i18n", "zh-CN.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "src", "i18n", "en.json"), "utf8"));

test("render layer consumes the pure pagination planner", () => {
    assert.match(docSearchUi, /const plan = planDocResultsPage\(docs, openRootIds, expandedCount\)/,
        "渲染切片必须由纯模型决策");
    assert.match(docSearchUi, /plan\.items\.forEach\(\(\{doc, id\}\) => \{/,
        "卡片装配必须消费 plan.items");
    assert.match(searchModel, /function planDocResultsPage\(docs, openRootIds, expandedCount\) \{/,
        "纯模型必须存在于 search-model");
});

test("load-more button expands incrementally with focus continuity", () => {
    assert.match(docSearchUi, /if \(plan\.hasMore\) \{\s*appendDocResultsLoadMore/,
        "有余量时必须提供「加载更多」");
    assert.match(docSearchUi, /className = "sw__doc-load-more sw__doc-view-all b3-button b3-button--text"/,
        "加载更多按钮复用原生出口样式并携带独立标识类");
    assert.match(docSearchUi, /renderDocResults\.call\(this, scrollElement, docs, onClose, "results", expandedCount \+ DOC_RESULT_LIMIT\)/,
        "点击加载更多按 DOC_RESULT_LIMIT 递进展开");
    assert.match(docSearchUi, /scrollElement\.querySelector<HTMLElement>\("\.sw__doc-load-more"\)\s*\|\|\s*scrollElement\.querySelector<HTMLElement>\("\.sw__doc-view-all"\)/,
        "重渲染后焦点恢复到新按钮（或尽头时的原生出口）");
    assert.match(docSearchUi, /next\?\.focus\(\{preventScroll: true\}\)/,
        "焦点恢复必须 preventScroll");
});

test("expanded-exhausted results fall back to the native search exit", () => {
    assert.match(docSearchUi, /else if \(docs\.length > DOC_RESULT_LIMIT\) \{\s*appendDocResultsViewAll/,
        "全部展开后且原结果超限时回落到思源原生搜索");
});

test("UI fetch requests the audited fetch limit", () => {
    const callUses = [...docSearchUi.matchAll(/DOC_SEARCH_FETCH_LIMIT\)/g)].length;
    assert.ok(callUses >= 2, `两处 UI 取数调用必须传 DOC_SEARCH_FETCH_LIMIT，实测 ${callUses} 处`);
    assert.match(docSearchUi, /Math\.min\(DOC_SEARCH_FETCH_LIMIT, Math\.max\(1, Math\.floor\(Number\(documents\)/,
        "回退取数天花板必须引用共享常量");
    assert.match(constants, /export const DOC_SEARCH_FETCH_LIMIT = 33;/,
        "取数上限必须集中管理在 constants");
    assert.match(index, /Math\.min\(DOC_SEARCH_FETCH_LIMIT, offset \+ limit \+ 1\)/,
        "Agent 路径的 33 天花板引用同一常量");
    assert.doesNotMatch(docSearchUi, /DOC_RESULT_LIMIT \+ 1\)/,
        "旧的 11 条取数形态必须清除");
});

test("pagination cursors never enter search cache keys", () => {
    assert.match(searchModelRaw, /The expansion\s*\* cursor never enters search cache keys/,
        "纯模型必须声明游标不进缓存 key");
    assert.doesNotMatch(searchModel, /planDocResultsPage[\s\S]{0,800}buildSearchCacheKey/,
        "分页规划不得读写缓存 key");
});

test("load-more label ships in both locales", () => {
    assert.equal(typeof zh.docSearchLoadMore, "string");
    assert.equal(typeof en.docSearchLoadMore, "string");
    assert.ok(zh.docSearchLoadMore.length > 0 && en.docSearchLoadMore.length > 0);
});
