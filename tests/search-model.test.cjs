const test = require("node:test");
const assert = require("node:assert/strict");
const {
    DEFAULT_SEARCH_LIMITS,
    normalizeSearchQuery,
    normalizeSearchFilters,
    buildSearchCacheKey,
    normalizeSearchResult,
    aggregateSearchResults,
    groupSearchResults,
    filterOpenTabs,
    mergeSearchLayers,
    shouldSearchRemote,
    buildFullTextSearchRequest,
} = require("../src/search-model.js");

const ROOT_A = "20260906120000-aaaaaaa";
const ROOT_B = "20260906120001-bbbbbbb";
const ROOT_C = "20260906120002-ccccccc";

test("search model: query normalization is whitespace-stable", () => {
    assert.equal(normalizeSearchQuery("  alpha\n\t beta  "), "alpha beta");
    assert.equal(normalizeSearchQuery(null), "");
    assert.equal(shouldSearchRemote(" \n "), false);
    assert.equal(shouldSearchRemote(" alpha "), true);
});

test("search model: filter normalization and cache keys are deterministic", () => {
    const first = {path: " /work ", notebooks: ["b", "a", "a"], sort: "relevance"};
    const second = {sort: "relevance", notebooks: ["a", "b"], path: "/work"};
    assert.deepEqual(normalizeSearchFilters(first), normalizeSearchFilters(second));
    assert.equal(buildSearchCacheKey({query: "  alpha ", scope: "global", filters: first}),
        buildSearchCacheKey({query: "alpha", scope: "global", filters: second}));
    assert.notEqual(buildSearchCacheKey({query: "alpha", scope: "global", filters: first}),
        buildSearchCacheKey({query: "alpha", scope: "opened", filters: first}));
    assert.notEqual(buildSearchCacheKey({query: "alpha", scope: "global", filters: first}),
        buildSearchCacheKey({query: "beta", scope: "global", filters: first}));
});

test("search model: normalizes common SiYuan block result fields", () => {
    const result = normalizeSearchResult({
        root_id: ROOT_A,
        id: "20260906120003-hit0001",
        name: "项目文档",
        hPath: "工作/项目文档",
        content: "命中片段",
        updated: "20260906123000",
        notebook_id: "notebook-a",
        score: 0.8,
    }, "global");
    assert.deepEqual(result, {
        rootId: ROOT_A,
        blockId: "20260906120003-hit0001",
        title: "项目文档",
        path: "工作/项目文档",
        snippet: "命中片段",
        updated: "20260906123000",
        notebookId: "notebook-a",
        type: "",
        subType: "",
        score: 0.8,
        source: "global",
    });
});

test("search model: rejects malformed results without a stable root", () => {
    assert.equal(normalizeSearchResult(null), null);
    assert.equal(normalizeSearchResult({title: "no id"}), null);
    assert.equal(normalizeSearchResult({path: "工作/not-a-block-id.sy"}), null);
});

test("search model: groups duplicate block hits into bounded document cards", () => {
    const cards = groupSearchResults([
        {rootId: ROOT_A, blockId: "20260906120003-hit0001", title: "项目文档", path: "工作/项目文档", snippet: "第一片段"},
        {rootId: ROOT_A, blockId: "20260906120004-hit0002", title: "项目文档", path: "工作/项目文档", snippet: "第二片段"},
        {rootId: ROOT_A, blockId: "20260906120005-hit0003", title: "项目文档", snippet: "第三片段"},
        {rootId: ROOT_A, blockId: "20260906120006-hit0004", snippet: "第一片段"},
        {rootId: ROOT_B, title: "第二文档", snippet: "另一片段"},
    ], {documents: 12, snippets: 2, source: "global"});

    assert.equal(cards.length, 2);
    assert.equal(cards[0].rootId, ROOT_A);
    assert.equal(cards[0].hitCount, 4);
    assert.deepEqual(cards[0].blockIds, [
        "20260906120003-hit0001",
        "20260906120004-hit0002",
        "20260906120005-hit0003",
        "20260906120006-hit0004",
    ]);
    assert.deepEqual(cards[0].snippets, [
        {text: "第一片段", blockId: "20260906120003-hit0001"},
        {text: "第二片段", blockId: "20260906120004-hit0002"},
    ]);
    assert.equal(cards[0].truncated, true);
});

test("search model: document and raw-result limits keep output bounded", () => {
    const cards = groupSearchResults([
        {rootId: ROOT_A, title: "A"},
        {rootId: ROOT_B, title: "B"},
        {rootId: ROOT_C, title: "C"},
    ], {documents: 2, snippets: 0});
    assert.deepEqual(cards.map((card) => card.rootId), [ROOT_A, ROOT_B]);
    assert.deepEqual(cards.map((card) => card.snippets), [[], []]);
    assert.deepEqual(DEFAULT_SEARCH_LIMITS, {documents: 12, snippets: 2, blockIds: 50});
});

test("search model: local tabs match title/path and preserve original tab references", () => {
    const tabA = {id: "tab-a", rootId: ROOT_A, title: "项目文档", hPath: "工作/项目文档"};
    const tabB = {id: "tab-b", rootId: ROOT_B, title: "会议记录", hPath: "工作/会议记录"};
    const result = filterOpenTabs([tabA, tabB, null], "  项目 ");
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, "tab");
    assert.equal(result[0].rootId, ROOT_A);
    assert.equal(result[0].tab, tabA);
    assert.equal(filterOpenTabs([tabA, tabB], "" ).length, 2);
});

test("search model: three layers prioritize tabs, then opened hits, then global cards", () => {
    const tabs = [
        {id: "tab-a", rootId: ROOT_A, title: "项目文档", path: "工作/项目文档"},
        {id: "tab-b", rootId: ROOT_B, title: "会议记录", path: "工作/会议记录"},
    ];
    const merged = mergeSearchLayers({
        query: "项目",
        tabs,
        opened: [
            {rootId: ROOT_A, blockId: "20260906120003-hit0001", title: "项目文档", snippet: "已在页签中"},
            {rootId: ROOT_C, blockId: "20260906120004-hit0002", title: "项目计划", snippet: "打开文档命中"},
        ],
        global: [
            {rootId: ROOT_C, title: "项目计划", snippet: "全库重复"},
            {rootId: "20260906120006-ddddddd", title: "项目归档", snippet: "全库结果"},
        ],
        limits: {documents: 2, snippets: 2},
    });
    assert.equal(merged.remote, true);
    assert.deepEqual(merged.tabs.map((item) => item.rootId), [ROOT_A]);
    assert.deepEqual(merged.opened.map((item) => item.rootId), [ROOT_C]);
    assert.deepEqual(merged.global.map((item) => item.title), ["项目归档"]);
    assert.deepEqual(merged.cards.map((item) => item.kind || item.source), ["tab", "opened", "global"]);
});

test("search model: de-duplicates before applying layer limits so later results fill slots", () => {
    const merged = mergeSearchLayers({
        query: "项目",
        tabs: [{rootId: ROOT_A, title: "项目已打开"}],
        opened: [
            {rootId: ROOT_A, title: "重复"},
            {rootId: ROOT_B, title: "项目打开"},
        ],
        global: [
            {rootId: ROOT_B, title: "重复打开"},
            {rootId: ROOT_C, title: "项目全库"},
        ],
        limits: {documents: 1},
    });
    assert.deepEqual(merged.opened.map((card) => card.rootId), [ROOT_B]);
    assert.deepEqual(merged.global, []);
});

test("search model: nested root id wins over ordinary block id", () => {
    const result = normalizeSearchResult({
        block: {id: "20260906120003-hit0001", content: "命中"},
        root: {id: ROOT_A, name: "根文档"},
    }, "global");
    assert.equal(result.rootId, ROOT_A);
    assert.equal(result.blockId, "20260906120003-hit0001");
    assert.equal(normalizeSearchResult({id: "20260906120003-hit0001", content: "普通块"}, "global"), null);
});

test("search model: aggregation uses set-backed ids and reports truncation", () => {
    const hits = Array.from({length: 6}, (_, index) => ({
        rootId: ROOT_A,
        blockId: `2026090612${String(index).padStart(4, "0")}-aaaaaaa`,
        snippet: `片段 ${index}`,
    }));
    const aggregate = aggregateSearchResults(hits, {blockIds: 2, snippets: 2, maxRawResults: 4});
    assert.equal(aggregate.totalDocuments, 1);
    assert.equal(aggregate.rawTruncated, true);
    assert.equal(aggregate.cards[0].blockIds.length, 2);
    assert.equal(aggregate.cards[0].blockIdsTruncated, true);
});

test("search model: ordered filters and deep/long values remain distinct in cache keys", () => {
    const orderedA = {paths: ["a", "b"], range: ["start", "end"]};
    const orderedB = {paths: ["a", "b"], range: ["end", "start"]};
    assert.notEqual(buildSearchCacheKey({query: "x", filters: orderedA}),
        buildSearchCacheKey({query: "x", filters: orderedB}));
    const deepA = {a: {b: {c: {d: {e: "one"}}}}};
    const deepB = {a: {b: {c: {d: {e: "two"}}}}};
    assert.notEqual(buildSearchCacheKey({query: "x", filters: deepA}),
        buildSearchCacheKey({query: "x", filters: deepB}));
    assert.notEqual(buildSearchCacheKey({query: "x".repeat(300)}),
        buildSearchCacheKey({query: "y" + "x".repeat(299)}));
});

test("search model: accepts explicit result aliases and open-root exclusions", () => {
    const merged = mergeSearchLayers({
        query: "项目",
        tabs: [],
        openRootIds: [ROOT_A],
        openedResults: [{rootId: ROOT_B, title: "项目打开文档", snippet: "打开命中"}],
        globalResults: [
            {rootId: ROOT_A, title: "项目已打开", snippet: "应排除"},
            {rootId: ROOT_C, title: "项目全库", snippet: "应保留"},
        ],
    });
    assert.deepEqual(merged.opened.map((card) => card.rootId), [ROOT_B]);
    assert.deepEqual(merged.global.map((card) => card.rootId), [ROOT_C]);
});

test("search model: empty query never consumes remote layers", () => {
    const merged = mergeSearchLayers({
        query: "   ",
        tabs: [{id: "tab-a", rootId: ROOT_A, title: "项目文档"}],
        opened: [{rootId: ROOT_B, title: "打开命中"}],
        global: [{rootId: ROOT_C, title: "全库命中"}],
    });
    assert.equal(merged.remote, false);
    assert.equal(merged.opened.length, 0);
    assert.equal(merged.global.length, 0);
    assert.equal(merged.cards.length, 1);
});

test("search model: malformed layer input is safe and does not throw", () => {
    const merged = mergeSearchLayers({query: "x", tabs: null, opened: {}, global: [null, 3]});
    assert.deepEqual(merged.tabs, []);
    assert.deepEqual(merged.opened, []);
    assert.deepEqual(merged.global, []);
    assert.deepEqual(merged.counts, {tabs: 0, opened: 0, global: 0});
});

test("search model: builds a bounded native full-text request", () => {
    const request = buildFullTextSearchRequest({
        query: "  项目  ",
        method: "updatedDesc",
        filters: {
            paths: ["box-a/work", "box-a/work", ""],
            types: {document: true, paragraph: false, ignored: "yes"},
            subtypes: {h1: true},
        },
        group: "document",
        sort: "relevanceDesc",
        page: 2,
        pageSize: 64,
        notebook: "box-a",
    });
    assert.equal(request.endpoint, "/api/search/fullTextSearchBlock");
    assert.deepEqual(request.body, {
        query: "项目",
        method: 0,
        types: {document: true, paragraph: false},
        subTypes: {h1: true},
        paths: ["box-a/work"],
        groupBy: 1,
        orderBy: 7,
        page: 2,
        pageSize: 64,
        searchHPath: true,
        notebook: "box-a",
    });
});

test("search model: SQL mode is never emitted", () => {
    const safe = buildFullTextSearchRequest({query: "title", method: 2});
    assert.equal(safe.body.method, 0);
    assert.equal(safe.endpoint, "/api/search/fullTextSearchBlock");
    const ignoredOptIn = buildFullTextSearchRequest({query: "SELECT", method: 2, allowSql: true});
    assert.equal(ignoredOptIn.body.method, 0);
    assert.equal(ignoredOptIn.endpoint, "/api/search/fullTextSearchBlock");
});

test("search model: semantic method uses the native semantic endpoint", () => {
    const fallback = buildFullTextSearchRequest({query: "相关内容", method: 4});
    assert.equal(fallback.endpoint, "/api/search/fullTextSearchBlock");
    assert.equal(fallback.body.method, 0);
    const request = buildFullTextSearchRequest({query: "相关内容", method: 4, pageSize: 0, semanticAvailable: true});
    assert.equal(request.endpoint, "/api/search/semanticSearchBlock");
    assert.equal(request.body.method, 4);
    assert.equal(request.body.pageSize, 1);
});

test("search model: empty native requests are skipped", () => {
    assert.equal(buildFullTextSearchRequest({query: "   ", method: 0}), null);
    assert.equal(buildFullTextSearchRequest(null), null);
});
