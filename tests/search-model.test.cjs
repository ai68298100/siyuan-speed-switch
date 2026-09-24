const test = require("node:test");
const assert = require("node:assert/strict");
const {
    DEFAULT_SEARCH_LIMITS,
    normalizeSearchQuery,
    normalizeSearchFilters,
    buildSearchCacheKey,
    canUseTitleSearch,
    normalizeSearchResult,
    buildSearchScoreBreakdown,
    buildSearchHealthSnapshot,
    pickDocViewportAnchor,
    planDocViewportRestore,
    buildKeywordHighlightSegments,
    stripSnippetMarkup,
    buildDocPreviewSnapshot,
    searchResultNotebookId,
    normalizeTitleSearchDocuments,
    filterSearchDocuments,
    matchesSearchDocumentFilters,
    normalizeSearchDocumentFilters,
    aggregateSearchResults,
    groupSearchResults,
    filterOpenTabs,
    isSemanticEmbeddingConfigured,
    mergeSearchLayers,
    shouldSearchRemote,
    buildFullTextSearchRequest,
    buildNativeSearchTabConfig,
    extractSearchRecords,
    buildOpenedDocumentScope,
    resolveSearchNotebookId,
    buildOpenedDocumentSearchRequest,
    buildOpenedDocumentSearchRequests,
    planDocResultsPage,
    buildUnifiedSections,
    normalizeUnifiedQuery,
    scoreUnifiedTitle,
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

test("search model: local tab metadata cache invalidates when display fields change", () => {
    const tab = {id: "tab-cache", rootId: ROOT_A, title: "旧标题", path: "工作/旧标题"};
    assert.equal(filterOpenTabs([tab], "旧标题").length, 1);
    tab.title = "新标题";
    tab.path = "工作/新标题";
    assert.equal(filterOpenTabs([tab], "旧标题").length, 0);
    assert.equal(filterOpenTabs([tab], "新标题").length, 1);
});

test("search model: loose keyword gate stays consistent with emitted heavy fields", () => {
    // 无标题/路径时按 rootId 兜底匹配：轻量门禁与重型产出必须一致
    const bare = {id: "tab-bare", rootId: ROOT_A};
    assert.equal(filterOpenTabs([bare], "20260906120000").length, 1);
    // id 兜底：无 rootId、无路径时仍可按 tab.id 命中
    const idOnly = {id: "20260101120000-xyzabc"};
    assert.equal(filterOpenTabs([idOnly], "xyzabc").length, 1);
    // 超长路径关键词不再被产出截断半径误伤（门禁与产出同源匹配）
    const longPath = `/${"深".repeat(600)}/needle-target`;
    const longTab = {id: "tab-long", rootId: ROOT_B, title: "长路径", hPath: longPath};
    assert.equal(filterOpenTabs([longTab], "needle-target").length, 1);
    // 控制字符统一折叠为空格后仍可命中
    const noisy = {id: "tab-noisy", rootId: ROOT_A, title: "项目\u0001文档"};
    assert.equal(filterOpenTabs([noisy], "项目 文档").length, 1);
    // 命中条目的产出字段仍走重型规范化（有界、图形安全），保持原引用
    const emitted = filterOpenTabs([bare], "20260906120000")[0];
    assert.equal(emitted.tab, bare);
    assert.equal(emitted.rootId, ROOT_A);
});

test("search model: notebook filters apply to local tabs before remote layers", () => {
    const tabA = {id: "tab-a", rootId: ROOT_A, title: "项目", notebookId: "box-a", path: "box-a/work/a.sy"};
    const tabB = {id: "tab-b", rootId: ROOT_B, title: "项目", notebookId: "box-b", path: "box-b/work/b.sy"};
    const filtered = filterOpenTabs([tabA, tabB], "项目", {notebook: "box-a"});
    assert.deepEqual(filtered.map((item) => item.rootId), [ROOT_A]);
    assert.equal(filtered[0].notebookId, "box-a");
    const merged = mergeSearchLayers({
        query: "项目",
        filters: {notebook: "box-b"},
        tabs: [tabA, tabB],
        global: [{rootId: ROOT_C, title: "项目全库"}],
    });
    assert.deepEqual(merged.tabs.map((item) => item.rootId), [ROOT_B]);
});

test("search model: path filters apply to local tabs with notebook-qualified prefixes", () => {
    const tabs = [
        {id: "tab-a", rootId: ROOT_A, title: "项目 A", notebookId: "box-a", path: "box-a/work/project.sy"},
        {id: "tab-b", rootId: ROOT_B, title: "项目 B", notebookId: "box-a", path: "box-a/archive/project.sy"},
        {id: "tab-c", rootId: ROOT_C, title: "项目 C", notebookId: "box-b", path: "box-b/work/project.sy"},
    ];
    const filtered = filterOpenTabs(tabs, "项目", {paths: ["box-a/work"]});
    assert.deepEqual(filtered.map((item) => item.rootId), [ROOT_A]);
    const merged = mergeSearchLayers({
        query: "项目",
        tabs,
        filters: {paths: ["box-a/work"]},
        global: [{rootId: "20260906120003-ddddddd", title: "项目全库", path: "box-a/work/other.sy", notebookId: "box-a"}],
    });
    assert.deepEqual(merged.tabs.map((item) => item.rootId), [ROOT_A]);
});

test("search model: shared document filter predicate matches batch filtering semantics", () => {
    const inScope = {path: "box-a/work/project.sy", notebookId: "box-a"};
    const outPath = {path: "box-a/archive/project.sy", notebookId: "box-a"};
    const outNotebook = {path: "box-b/work/project.sy", notebookId: "box-b"};
    const normalized = {notebook: "box-a", paths: ["box-a/work"]};
    assert.equal(matchesSearchDocumentFilters(inScope, normalized), true);
    assert.equal(matchesSearchDocumentFilters(outPath, normalized), false);
    assert.equal(matchesSearchDocumentFilters(outNotebook, normalized), false);
    assert.equal(matchesSearchDocumentFilters({path: "box-a/work/project.sy"}, {paths: ["box-a/work"]}), true);
    assert.equal(matchesSearchDocumentFilters({path: "", notebookId: "box-a"}, normalized), false);
    assert.equal(matchesSearchDocumentFilters(null, {}), false);
});

test("search model: document filter scope normalization is bounded and reusable", () => {
    const scope = normalizeSearchDocumentFilters({
        notebook: " box-a ",
        paths: ["box-a/work", "box-a/work", "../unsafe", "box-a/notes"],
    });
    assert.deepEqual(scope, {notebook: "box-a", paths: ["box-a/work", "box-a/notes"]});
    assert.deepEqual(normalizeSearchDocumentFilters(null), {notebook: "", paths: []});
});

test("search model: local and remote path scopes agree on relative paths", () => {
    const tab = {id: "tab-relative", rootId: ROOT_A, title: "项目", notebookId: "box-a", path: "work/project.sy"};
    const remote = {rootId: ROOT_A, title: "项目", notebookId: "box-a", path: "work/project.sy"};
    const filters = {paths: ["box-a/work"]};
    assert.equal(filterOpenTabs([tab], "项目", filters).length, 1);
    assert.deepEqual(filterSearchDocuments([remote], filters), [remote]);
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

test("search model: extracts compatible native result wrappers", () => {
    const blocks = [{rootId: "20260906120001-aaaaaaa", content: "命中"}];
    assert.strictEqual(extractSearchRecords({data: [], blocks}), blocks);
    assert.strictEqual(extractSearchRecords({data: {items: blocks}}), blocks);
    assert.deepEqual(extractSearchRecords({data: []}), []);
    assert.deepEqual(extractSearchRecords(null), []);
});

test("search model: extracts title-document wrappers used by older hosts", () => {
    const files = [{path: "box/doc.sy", hPath: "doc", box: "box"}];
    const matrix = [
        ["data.files", {data: {files}}],
        ["result.documents", {result: {documents: files}}],
        ["data.docs", {data: {docs: files}}],
        ["result.data.documents", {result: {data: {documents: files}}}],
        ["data.result.records", {data: {result: {records: files}}}],
        ["result.results.items", {result: {results: {items: files}}}],
    ];
    matrix.forEach(([name, payload]) => {
        assert.strictEqual(extractSearchRecords(payload), files, name);
    });
    const preferred = [{path: "box/preferred.sy", hPath: "preferred", box: "box"}];
    assert.strictEqual(extractSearchRecords({data: preferred, result: {documents: files}}), preferred);
});

test("search model: compatible wrapper traversal stays bounded and ignores unknown fields", () => {
    const files = [{id: "20260912120000-abcdefg", name: "bounded"}];
    const cyclic = {};
    cyclic.data = cyclic;
    cyclic.result = {documents: files};
    assert.strictEqual(extractSearchRecords(cyclic), files);
    assert.deepEqual(extractSearchRecords({private: {documents: files}}), []);
    assert.deepEqual(extractSearchRecords({data: {result: {data: {documents: files}}}}), []);
});

test("search model: scopes opened-document search to one safe notebook path", () => {
    const scope = buildOpenedDocumentScope({rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"});
    assert.deepEqual(scope, {rootId: ROOT_A, notebook: "box-a", path: "box-a/docs/root.sy"});
    const request = buildOpenedDocumentSearchRequest({
        query: "正文", tab: {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"}, pageSize: 12,
    });
    assert.equal(request.endpoint, "/api/search/fullTextSearchBlock");
    assert.equal(request.body.groupBy, 0);
    assert.equal(request.body.searchHPath, false);
    assert.deepEqual(request.body.paths, ["box-a/docs/root.sy"]);
    assert.equal(request.scope.rootId, ROOT_A);
});

test("search model: rejects stale or unsafe opened-document scopes", () => {
    assert.equal(buildOpenedDocumentScope({rootId: "tab-1", notebookId: "box-a", path: "box-a/root.sy"}), null);
    assert.equal(buildOpenedDocumentScope({rootId: ROOT_A, notebookId: "box-a", path: "box-a/hidden';--.sy"}), null);
    assert.equal(buildOpenedDocumentSearchRequest({query: "x", tab: {rootId: ROOT_A}}), null);
});

test("search model: external scope reuse produces identical requests to inline building", () => {
    const tab = {id: "tab-x", rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/a.sy"};
    const inline = buildOpenedDocumentSearchRequest({query: "正文", tab});
    const scope = buildOpenedDocumentScope(tab);
    const reused = buildOpenedDocumentSearchRequest({query: "正文", tab, scope});
    assert.ok(inline && reused);
    assert.deepEqual(reused, inline);
    assert.equal(reused.scope.rootId, ROOT_A);
    assert.deepEqual(reused.body.paths, ["box-a/docs/a.sy"]);
    // 显式 null scope 回退内联构建，不会直接失败
    const fallback = buildOpenedDocumentSearchRequest({query: "正文", tab, scope: null});
    assert.deepEqual(fallback, inline);
});

test("search model: native view-all config preserves safe filters", () => {
    const search = buildNativeSearchTabConfig({query: "项目", filters: {
        method: "regexp", orderBy: "updatedDesc", paths: ["box-a/work"],
        types: {document: true, paragraph: false}, subTypes: {h1: true},
    }});
    assert.equal(search.instance, "Search");
    assert.deepEqual(search.config, {
        query: "项目", k: "项目", group: 1, method: 3, sort: 4,
        types: {document: true, paragraph: false}, subTypes: {h1: true}, idPath: ["box-a/work"],
    });
    assert.equal(buildNativeSearchTabConfig({query: "x", method: 2}).config.method, 0);
    assert.equal(buildNativeSearchTabConfig({query: "   "}), null);
});

test("search model: notebook-only filters produce a native path scope", () => {
    const request = buildFullTextSearchRequest({query: "项目", filters: {notebook: "box-a"}});
    assert.deepEqual(request.body.paths, ["box-a"]);
    assert.equal(request.body.notebook, "box-a");
});

test("search model: title fast path only accepts locally enforceable scopes", () => {
    assert.equal(canUseTitleSearch({}), true);
    assert.equal(canUseTitleSearch({notebook: "box-a", paths: ["box-a/work"]}), true);
    assert.equal(canUseTitleSearch({method: "keyword"}), true);
    assert.equal(canUseTitleSearch({method: "query"}), false);
    assert.equal(canUseTitleSearch({types: {heading: true}}), false);
    assert.equal(canUseTitleSearch({subTypes: {h2: true}}), false);
    assert.equal(canUseTitleSearch({orderBy: "updatedDesc"}), false);
});

test("search model: advanced filters reach bounded full-text requests exactly", () => {
    const request = buildFullTextSearchRequest({
        query: "项目",
        filters: {
            notebook: "box-a",
            method: "regexp",
            orderBy: "createdDesc",
            types: {heading: true},
            subTypes: {h2: true},
        },
        groupBy: "document",
    });
    assert.equal(request.body.method, 3);
    assert.equal(request.body.orderBy, 2);
    assert.deepEqual(request.body.types, {heading: true});
    assert.deepEqual(request.body.subTypes, {h2: true});
    assert.deepEqual(request.body.paths, ["box-a"]);
    assert.equal(request.body.groupBy, 1);
});

test("search model: opened-document requests inherit advanced filters", () => {
    const request = buildOpenedDocumentSearchRequest({
        query: "^项目",
        tab: {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"},
        filters: {
            method: "regexp",
            orderBy: "updatedDesc",
            types: {paragraph: true},
        },
    });
    assert.equal(request.body.method, 3);
    assert.equal(request.body.orderBy, 4);
    assert.deepEqual(request.body.types, {paragraph: true});
    assert.deepEqual(request.body.paths, ["box-a/docs/root.sy"]);
});

test("search model: opened-document probing downgrades unsupported content order", () => {
    const request = buildOpenedDocumentSearchRequest({
        query: "项目",
        orderBy: "content",
        tab: {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"},
    });
    assert.equal(request.body.groupBy, 0);
    assert.equal(request.body.orderBy, 7);
});

test("search model: semantic capability mirrors the kernel embedding gate", () => {
    assert.equal(isSemanticEmbeddingConfigured(null), false);
    assert.equal(isSemanticEmbeddingConfigured({}), false);
    assert.equal(isSemanticEmbeddingConfigured({ai: {}}), false);
    assert.equal(isSemanticEmbeddingConfigured({ai: {embedding: {enabled: true}}}), false);
    assert.equal(isSemanticEmbeddingConfigured({ai: {embedding: {enabled: true, apiKey: ""}}}), false);
    assert.equal(isSemanticEmbeddingConfigured({ai: {embedding: {enabled: false, apiKey: "sk-test"}}}), false);
    assert.equal(isSemanticEmbeddingConfigured({ai: {embedding: {enabled: true, apiKey: "sk-test"}}}), true);
});

test("search model: semantic method routes to the semantic endpoint only with capability", () => {
    const capable = buildOpenedDocumentSearchRequest({
        query: "相关内容",
        method: "semantic",
        capabilities: {semanticSearch: true},
        tab: {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"},
    });
    assert.equal(capable.endpoint, "/api/search/semanticSearchBlock");
    assert.equal(capable.body.method, 4);
    const degraded = buildOpenedDocumentSearchRequest({
        query: "相关内容",
        method: "semantic",
        tab: {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"},
    });
    assert.equal(degraded.endpoint, "/api/search/fullTextSearchBlock");
    assert.equal(degraded.body.method, 0);
});

test("search model: opened-document fan-out threads the semantic capability", () => {
    const tabs = [{rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/root.sy"}];
    const capable = buildOpenedDocumentSearchRequests(tabs, "相关内容", {method: "semantic", capabilities: {semanticSearch: true}});
    assert.equal(capable.length, 1);
    assert.equal(capable[0].endpoint, "/api/search/semanticSearchBlock");
    assert.equal(capable[0].body.method, 4);
    const degraded = buildOpenedDocumentSearchRequests(tabs, "相关内容", {method: "semantic"});
    assert.equal(degraded.length, 1);
    assert.equal(degraded[0].endpoint, "/api/search/fullTextSearchBlock");
    assert.equal(degraded[0].body.method, 0);
});

test("search model: native search tab config follows the semantic capability", () => {
    const capable = buildNativeSearchTabConfig({query: "相关内容", method: "semantic", capabilities: {semanticSearch: true}});
    assert.equal(capable.config.method, 4);
    const degraded = buildNativeSearchTabConfig({query: "相关内容", method: "semantic"});
    assert.equal(degraded.config.method, 0);
});

test("search model: advanced filter values isolate cache entries", () => {
    const base = {scope: "global", query: "项目"};
    const keyword = buildSearchCacheKey({...base, filters: {notebook: "box-a"}});
    const regexp = buildSearchCacheKey({...base, filters: {notebook: "box-a", method: "regexp"}});
    const heading = buildSearchCacheKey({...base, filters: {notebook: "box-a", types: {heading: true}}});
    assert.notEqual(keyword, regexp);
    assert.notEqual(keyword, heading);
    assert.notEqual(regexp, heading);
});

test("search model: accepts native searchDocs box metadata", () => {
    const native = {
        box: "box-a",
        path: `/${ROOT_A}.sy`,
        hPath: "/工作/项目文档",
    };
    assert.equal(searchResultNotebookId(native), "box-a");
    assert.equal(normalizeSearchResult(native, "global").notebookId, "box-a");
    assert.deepEqual(normalizeTitleSearchDocuments([native]).map((item) => ({
        id: item.id,
        rootId: item.rootId,
        title: item.title,
        notebookId: item.notebookId,
        source: item.source,
    })), [{
        id: ROOT_A,
        rootId: ROOT_A,
        title: "项目文档",
        notebookId: "box-a",
        source: "title",
    }]);
    assert.deepEqual(filterSearchDocuments([native], {notebook: "box-a"}), [native]);
    assert.deepEqual(filterSearchDocuments([native], {notebook: "box-b"}), []);
    assert.deepEqual(filterSearchDocuments([{...native, box: undefined}], {notebook: "box-a"}), []);
});

test("search model: filters native document paths inside an explicit notebook", () => {
    const docs = [
        {id: ROOT_A, box: "box-a", path: "/work/a.sy"},
        {id: ROOT_B, box: "box-a", path: "/other/b.sy"},
        {id: ROOT_C, box: "box-b", path: "/work/c.sy"},
    ];
    assert.deepEqual(filterSearchDocuments(docs, {paths: ["box-a/work"]}), [docs[0]]);
    assert.deepEqual(filterSearchDocuments(docs, {notebook: "box-a", paths: ["box-a/work"]}), [docs[0]]);
});

test("search model: preserves paths that already include the notebook prefix", () => {
    const document = {id: ROOT_A, box: "box-a", path: "box-a/work/a.sy"};
    assert.deepEqual(filterSearchDocuments([document], {paths: ["box-a/work"]}), [document]);
    assert.deepEqual(filterSearchDocuments([document], {notebook: "box-a", paths: ["box-a/work"]}), [document]);
});

test("search model: cache keys isolate notebook and path filters", () => {
    const base = buildSearchCacheKey({query: "项目", scope: "global", filters: {}});
    const notebook = buildSearchCacheKey({query: "项目", scope: "global", filters: {notebook: "box-a"}});
    const path = buildSearchCacheKey({query: "项目", scope: "global", filters: {paths: ["box-a/work"]}});
    assert.notEqual(base, notebook);
    assert.notEqual(notebook, path);
    assert.equal(
        buildSearchCacheKey({query: "项目", scope: "global", filters: {paths: ["box-a/work"], notebook: "box-a"}}),
        buildSearchCacheKey({query: " 项目 ", scope: "global", filters: {notebook: "box-a", paths: ["box-a/work"]}}),
    );
});

test("search model: duplicate snippets are removed before snippet limit", () => {
    const aggregate = aggregateSearchResults([
        {rootId: ROOT_A, blockId: "20260906120003-hit0001", snippet: "相同片段"},
        {rootId: ROOT_A, blockId: "20260906120004-hit0002", snippet: "相同片段"},
        {rootId: ROOT_A, blockId: "20260906120005-hit0003", snippet: "第二片段"},
    ], {snippets: 2});
    assert.deepEqual(aggregate.cards[0].snippets.map((item) => item.text), ["相同片段", "第二片段"]);
    assert.equal(aggregate.cards[0].hitCount, 3);
});

test("search model: accepts desktop and MobileTabs metadata aliases", () => {
    assert.equal(resolveSearchNotebookId({path: "box-path/docs/a.sy"}), "box-path");
    const mobile = buildOpenedDocumentScope({
        current: {rootID: ROOT_B, notebookID: "box-a", path: "box-a/docs/b.sy"},
    });
    assert.deepEqual(mobile, {rootId: ROOT_B, notebook: "box-a", path: "box-a/docs/b.sy"});
    const desktop = buildOpenedDocumentScope({
        rootId: ROOT_A,
        headElement: {getAttribute: (name) => name === "data-initdata"
            ? JSON.stringify({notebookId: "box-a", path: "box-a/docs/a.sy"}) : null},
    });
    assert.deepEqual(desktop, {rootId: ROOT_A, notebook: "box-a", path: "box-a/docs/a.sy"});
});

test("search model: plans bounded opened-document requests without duplicates", () => {
    const tabs = [
        {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/a.sy"},
        {rootId: ROOT_A, notebookId: "box-a", path: "box-a/docs/a.sy"},
        {rootId: ROOT_B, notebookId: "box-a", path: "box-a/docs/b.sy"},
        {rootId: "tab-not-a-root", notebookId: "box-a", path: "box-a/docs/no.sy"},
    ];
    const requests = buildOpenedDocumentSearchRequests(tabs, "正文", {maxDocuments: 1});
    assert.equal(requests.length, 1);
    assert.equal(requests[0].scope.rootId, ROOT_A);
    assert.deepEqual(requests[0].body.paths, ["box-a/docs/a.sy"]);
    assert.equal(buildOpenedDocumentSearchRequests(tabs, " ").length, 0);
});

test("fulltext fallback declares default types because 3.8.x treats empty types as none", () => {
    const request = buildFullTextSearchRequest({query: "会议"});
    assert.ok(request, "request built");
    assert.equal(request.endpoint, "/api/search/fullTextSearchBlock");
    assert.deepEqual(request.body.types, {document: true, heading: true, paragraph: true, codeBlock: true});
    const scoped = buildFullTextSearchRequest({query: "会议", filters: {types: {codeBlock: true}}});
    assert.deepEqual(scoped.body.types, {codeBlock: true});
});

test("normalizeText short-circuit keeps grapheme output identical for short input", () => {
    // A grapheme never spans fewer than one UTF-16 code unit, so text already
    // within the limit must be returned untouched instead of re-segmented.
    const short = "e\u0301 文档 \u{1F468}\u200D\u{1F469}\u200D\u{1F467} 笔记";
    const [document] = normalizeTitleSearchDocuments([{id: ROOT_A, rootId: ROOT_A, title: short, path: "box-a/a.sy"}]);
    assert.equal(document.title, short);
});

test("normalizeText still truncates by grapheme when input exceeds the limit", () => {
    // 300 thumbs-up graphemes: 600 code units, so the over-limit branch runs
    // and the grapheme cap (not the code-unit cap) decides the output.
    const long = "\u{1F44D}".repeat(300);
    assert.ok(long.length > 256, "fixture must exceed the title limit in code units");
    const [document] = normalizeTitleSearchDocuments([{id: ROOT_A, rootId: ROOT_A, title: long, path: "box-a/a.sy"}]);
    const graphemes = [...new Intl.Segmenter().segment(document.title)].length;
    assert.equal(graphemes, 256, "over-long titles are cut at the grapheme boundary");
});

test("search model: planDocResultsPage slices the first page and reports more", () => {
    const docs = Array.from({length: 20}, (_, i) => ({rootId: `20260101120000-aaa${String(i).padStart(4, "0")}`, title: `doc ${i}`}));
    const first = planDocResultsPage(docs, new Set(), 12);
    assert.equal(first.items.length, 12);
    assert.equal(first.totalVisible, 20);
    assert.equal(first.hasMore, true);
    assert.equal(first.items[0].id, docs[0].rootId);
    const expanded = planDocResultsPage(docs, new Set(), 24);
    assert.equal(expanded.items.length, 20);
    assert.equal(expanded.totalVisible, 20);
    assert.equal(expanded.hasMore, false);
});

test("search model: planDocResultsPage excludes opened roots and dedupes ids", () => {
    const idA = "20260101120000-bbb0001";
    const idB = "20260101120000-bbb0002";
    const docs = [
        {rootId: idA, title: "opened"},
        {rootId: idB, title: "keep"},
        {rootId: idB, title: "duplicate rootId"},
        {id: idB, path: `box-x/${idB}.sy`, title: "duplicate via path basename"},
        {path: "notebook/no-valid-id.sy", title: "no id"},
        {rootId: idA, title: "opened again"},
    ];
    const plan = planDocResultsPage(docs, new Set([idA]), 12);
    assert.equal(plan.totalVisible, 1);
    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0].id, idB);
    assert.equal(plan.hasMore, false);
});

test("search model: planDocResultsPage derives the id from path basename", () => {
    const id = "20260101120000-ccc0009";
    const plan = planDocResultsPage([{path: `box-y/${id}.sy`}], new Set(), 12);
    assert.equal(plan.items[0].id, id);
});

test("search model: planDocResultsPage treats non-finite expandedCount as render-all", () => {
    const docs = Array.from({length: 5}, (_, i) => ({rootId: `20260101120000-ddd${String(i).padStart(4, "0")}`}));
    const plan = planDocResultsPage(docs, new Set(), Number.NaN);
    assert.equal(plan.items.length, 5);
    assert.equal(plan.hasMore, false);
    assert.deepEqual(Object.keys(plan).sort(), ["hasMore", "items", "totalVisible"]);
});

test('local tab filter supports query terms: AND, exclusion, phrases (T-6700)', () => {
    const {parseSearchTerms, filterOpenTabs} = require('../src/search-model.js');
    // 词法：包含词 + 排除词 + 短语
    assert.deepEqual(parseSearchTerms('hello world -gone'), {includes: ['hello', 'world'], excludes: ['gone']});
    assert.deepEqual(parseSearchTerms('"two words" -x'), {includes: ['two words'], excludes: ['x']});
    assert.deepEqual(parseSearchTerms(''), {includes: [], excludes: []});
    // 大小写归一
    assert.deepEqual(parseSearchTerms('HeLLo').includes, ['hello']);
    // 过滤语义：AND / 排除 / 空查询
    const tabs = [
        {id: '1', title: 'Roadmap 规划', hPath: '/n/roadmap'},
        {id: '2', title: '周报', hPath: '/n/weekly'},
        {id: '3', title: 'Roadmap 周报', hPath: '/n/mix'},
    ];
    const keep = (q) => filterOpenTabs(tabs, q, {}).map((item) => item.tab.id);
    assert.deepEqual(keep('roadmap 周报'), ['3'], 'two terms behave as AND');
    assert.deepEqual(keep('roadmap -周报'), ['1'], 'excluded term drops matching tabs');
    assert.deepEqual(keep('"map 规"'), ['1'], 'phrase matches the substring of tab 1 title');
    assert.deepEqual(keep('"p 规划"'), ['1'], 'phrase matches partial words');
    assert.deepEqual(keep(''), ['1', '2', '3'], 'empty query keeps all tabs');
    // 超过 16 个词法项被钳制（防退化长查询）
    const flood = parseSearchTerms(Array.from({length: 40}, (_, i) => `t${i}`).join(' '));
    assert.equal(flood.includes.length + flood.excludes.length, 16, 'terms clamp at 16');
});

test('merge layers drop exclusion-matching cards across opened and global (T-6700)', () => {
    const result = mergeSearchLayers({
        query: 'roadmap -weekly',
        tabs: [],
        opened: [{rootId: '20260101000000-aaaaaaa', title: 'Roadmap Weekly', path: '/n/rw', source: 'global'}],
        global: [
            {rootId: '20260101000000-bbbbbbb', title: 'Roadmap 计划', path: '/n/plan', source: 'global'},
            {rootId: '20260101000000-ccccccc', title: 'Roadmap Weekly 复盘', path: '/n/rw2', source: 'global'},
        ],
        filters: {},
    });
    assert.equal(result.opened.length, 0, 'opened card matching the exclusion is dropped');
    assert.deepEqual(result.global.map((card) => card.title), ['Roadmap 计划'], 'only non-excluded global cards remain');
});

test("unified index: scoring ranks prefix over inclusion over token spread", () => {
    assert.equal(scoreUnifiedTitle("月度报告", "月度"), 3);
    assert.equal(scoreUnifiedTitle("四月度计划", "月度"), 2);
    assert.equal(scoreUnifiedTitle("季度计划与月度回顾", "季度 回顾"), 1, "multi-token all-hit scores lowest");
    assert.equal(scoreUnifiedTitle("日记", "月度"), 0);
    assert.equal(scoreUnifiedTitle("日记", ""), 0);
    assert.equal(scoreUnifiedTitle(undefined, "月度"), 0);
    assert.equal(normalizeUnifiedQuery("  月度 \n"), "月度");
});

test("unified index: empty query yields no sections", () => {
    assert.deepEqual(buildUnifiedSections({query: "  ", favorites: [{title: "x"}]}), []);
});

test("unified index: matching favorites and closed docs rank and exclude opened roots", () => {
    const sections = buildUnifiedSections({
        query: "产品",
        favorites: [
            {key: "f1", rootId: "root-open", title: "产品需求文档", group: "工作"},
            {key: "f2", rootId: "root-kept", title: "产品路线图", group: "工作"},
            {key: "f3", rootId: "root-other", title: "日记本", group: ""},
        ],
        closed: [
            {rootId: "root-c1", title: "产品评审纪要", closedAt: 1700000000000},
            {rootId: "root-open", title: "产品需求文档（关闭副本）", closedAt: 1700000001000},
        ],
        excludeRootIds: new Set(["root-open"]),
        limitPerSection: 4,
    });
    assert.deepEqual(sections.map((section) => section.key), ["favorites", "closed"]);
    assert.equal(sections[0].items.length, 1, "opened roots are excluded");
    assert.equal(sections[0].items[0].kind, "favorite");
    assert.equal(sections[0].items[0].rootId, "root-kept");
    assert.equal(sections[1].items[0].rootId, "root-c1");
});

test("unified index: doc sets match by name and carry entry counts", () => {
    const sections = buildUnifiedSections({
        query: "论文",
        documentSets: [
            {setId: "set1", name: "论文写作", entries: [{rootId: "a"}, {rootId: "b"}]},
            {setId: "set2", name: "日记", entries: []},
        ],
    });
    assert.deepEqual(sections.map((section) => section.key), ["doc-sets"]);
    assert.equal(sections[0].items[0].setId, "set1");
    assert.equal(sections[0].items[0].entryCount, 2);
});

test("unified index: per-section limit keeps the switcher bounded", () => {
    const many = Array.from({length: 9}, (_, index) => ({rootId: `c${index}`, title: `产品文档 ${index}`, closedAt: index}));
    const sections = buildUnifiedSections({query: "产品", closed: many, limitPerSection: 4});
    assert.equal(sections[0].items.length, 4);
});

test("unified index: non-matching sources produce no empty sections", () => {
    const sections = buildUnifiedSections({
        query: "zzz",
        favorites: [{key: "f1", title: "产品"}],
        closed: [{rootId: "c1", title: "产品"}],
        documentSets: [{setId: "s1", name: "论文"}],
    });
    assert.deepEqual(sections, []);
});

test("search syntax: operators parse into phrases, excludes and AND terms", () => {
    const {parseSearchQuery, formatCleanQuery, matchesParsedQuery} = require("../src/search-model.js");
    const parsed = parseSearchQuery('产品 "路线 图" -日记 -随手');
    assert.deepEqual(parsed.phrases, ["路线 图"]);
    assert.deepEqual(parsed.excludes, ["日记", "随手"]);
    assert.deepEqual(parsed.terms, ["产品"]);
    assert.equal(formatCleanQuery(parsed), '"路线 图" 产品');
    assert.equal(formatCleanQuery(parseSearchQuery("")), "");
    assert.equal(matchesParsedQuery("2026 产品路线 图规划", parsed), true);
    assert.equal(matchesParsedQuery("产品 日记", parsed), false, "excluded term vetoes the match");
    assert.equal(matchesParsedQuery("产品 规划", parsed), false, "missing phrase fails the match");
    const bare = parseSearchQuery("-x");
    assert.equal(matchesParsedQuery("anything", bare), true, "exclude-only query keeps titles without the term");
    assert.equal(matchesParsedQuery("x file", bare), false, "a title containing the excluded term is vetoed");
});

test("search model: pinyin initials and full pinyin match ASCII queries (T-6805)", () => {
    const tab = {id: "tab-py", rootId: ROOT_A, title: "产品路线图", path: "工作/产品"};
    // L1 首字母：cp → 产品
    assert.equal(filterOpenTabs([tab], "cp", {}, {pinyinMatch: true}).length, 1);
    // L2 全拼：chanpin → 产品
    assert.equal(filterOpenTabs([tab], "chanpin", {}, {pinyinMatch: true}).length, 1);
    // 混合：cpin → 产品（首字母 c + 全拼 pin 同串连续命中）
    assert.equal(filterOpenTabs([tab], "cpin", {}, {pinyinMatch: true}).length, 1);
    // 关闭开关后纯拼音不命中（汉字子串仍命中）
    assert.equal(filterOpenTabs([tab], "cp", {}, {pinyinMatch: false}).length, 0);
    assert.equal(filterOpenTabs([tab], "产品", {}).length, 1, "hanzi substring keeps matching regardless");
    // 无关词不误配
    assert.equal(filterOpenTabs([tab], "xz", {}, {pinyinMatch: true}).length, 0);
    // 非文档行/空标题不抛错
    assert.equal(filterOpenTabs([{title: ""}], "cp", {}, {pinyinMatch: true}).length, 0);
});

test("unified index: pinyin fallback covers collections when toggle is on (T-6805 phase 2)", () => {
    const sections = buildUnifiedSections({
        query: "cp",
        favorites: [{key: "f1", rootId: "r1", title: "产品需求文档", group: "工作"}],
        closed: [{rootId: "c1", title: "产品评审纪要", closedAt: 1700000000000}],
        documentSets: [{setId: "s1", name: "产品集", entries: [{rootId: "a"}]}],
        pinyinMatch: true,
    });
    assert.deepEqual(sections.map((s) => s.key), ["favorites", "closed", "doc-sets"],
        "pinyin initials match collections without any hanzi substring");
    const off = buildUnifiedSections({
        query: "cp",
        favorites: [{key: "f1", rootId: "r1", title: "产品需求文档", group: "工作"}],
        pinyinMatch: false,
    });
    assert.deepEqual(off, [], "pinyin off restores substring-only semantics");
});

test("search diagnostics: score breakdown exposes explainable matches without changing cards", () => {
    const breakdown = buildSearchScoreBreakdown({
        source: "opened",
        title: "产品路线图",
        path: "工作/产品路线图",
        updated: "1700000000000",
    }, {
        query: "cp",
        pinyinMatch: true,
        nowMs: 1700000000000,
        filters: {paths: ["工作"]},
    });
    assert.equal(breakdown.source, "opened");
    assert.equal(breakdown.sourceWeight, 3);
    assert.equal(breakdown.titleMatch, false);
    assert.equal(breakdown.pathMatch, false);
    assert.equal(breakdown.pinyinMatch, true);
    assert.equal(breakdown.filterMatch, true);
    assert.deepEqual(breakdown.matchedFields, ["pinyin"]);
    assert.equal(Number.isFinite(breakdown.total), true);
});

test("search diagnostics: health snapshot reports bounded counts and degradation reasons", () => {
    const snapshot = buildSearchHealthSnapshot({
        query: "产品",
        layers: {
            counts: {tabs: 2, opened: 1, global: 0},
            truncated: true,
        },
        sources: {
            tabs: {latencyMs: 3},
            opened: {status: "ready", latencyMs: 80},
            global: {status: "pending", latencyMs: 1200},
        },
        remote: true,
        state: "loading",
        totalLatencyMs: 1200,
        slowThresholdMs: 800,
    });
    assert.equal(snapshot.state, "degraded");
    assert.deepEqual(snapshot.counts, {tabs: 2, opened: 1, global: 0});
    assert.equal(snapshot.sources.find((source) => source.key === "global").status, "pending");
    assert.equal(snapshot.slow, true);
    assert.equal(snapshot.truncated, true);
    assert.equal(snapshot.degraded, true);
    assert.deepEqual(snapshot.reasons, ["remote-pending", "truncated", "slow-request"]);
});

test("search diagnostics: empty and unavailable sources remain safe and serializable", () => {
    const snapshot = buildSearchHealthSnapshot({
        query: "",
        sources: {global: {unavailable: true}},
        counts: {tabs: "bad", opened: -5, global: 4},
        error: true,
    });
    assert.equal(snapshot.state, "error");
    assert.equal(snapshot.remote, false);
    assert.deepEqual(snapshot.counts, {tabs: 0, opened: 0, global: 4});
    assert.deepEqual(snapshot.reasons, ["empty-query", "source-unavailable", "remote-error"]);
    assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("viewport anchor: pins the first doc item intersecting the viewport (T-6825)", () => {
    const entries = [
        {key: "a", top: -300},
        {key: "b", top: -20},
        {key: "c", top: 40},
        {key: "d", top: 900},
    ];
    assert.deepEqual(pickDocViewportAnchor(entries, 600), {key: "c", offset: 40});
    // 文档区不在视口内（全部在下方）→ 无锚点，不做任何钉定
    assert.equal(pickDocViewportAnchor([{key: "z", top: 1200}], 600), null);
    assert.equal(pickDocViewportAnchor([], 600), null);
    assert.equal(pickDocViewportAnchor(entries, 0), null);
    assert.equal(pickDocViewportAnchor("bad", 600), null);
    assert.equal(pickDocViewportAnchor([{key: "", top: 10}], 600), null);
});

test("viewport restore: same item returns to its recorded viewport offset", () => {
    // 用户视口停在 key=c 顶部 40px 处，scrollTop=1200；重渲染后 c 的 top 变为 96
    const anchor = {key: "c", offset: 40};
    const rebuilt = [{key: "a", top: -260}, {key: "c", top: 96}, {key: "d", top: 400}];
    assert.equal(planDocViewportRestore(anchor, rebuilt, 1200), 1256);
    // 结果集变化：锚点条目消失 → 保持现状不猜位置
    assert.equal(planDocViewportRestore(anchor, [{key: "d", top: 30}], 1200), null);
    assert.equal(planDocViewportRestore(null, rebuilt, 1200), null);
    assert.equal(planDocViewportRestore(anchor, "bad", 1200), null);
    assert.equal(planDocViewportRestore({key: "c", offset: Number.NaN}, rebuilt, 1200), null);
    // 不允许负滚动位置
    assert.equal(planDocViewportRestore({key: "c", offset: 500}, [{key: "c", top: 10}], 0), 0);
});

test("viewport anchor roundtrip: refresh keeps the reading position stable", () => {
    const before = [
        {key: "k1", top: -800},
        {key: "k2", top: -140},
        {key: "k3", top: 12},
        {key: "k4", top: 260},
    ];
    const anchor = pickDocViewportAnchor(before, 600);
    assert.ok(anchor);
    // loading 清空导致 scrollTop 被钳制回 0，重渲染后条目整体上移
    const after = before.map((entry) => ({key: entry.key, top: entry.top + 1052}));
    const restored = planDocViewportRestore(anchor, after, 0);
    assert.equal(restored, 1052);
    // 恢复后 k3 的视口偏移与锚定前一致（12）
    const top = after.find((entry) => entry.key === anchor.key).top;
    assert.equal(top - (restored - 0), 12);
});

test("keyword highlight: single term splits title into hit/plain segments (T-6834)", () => {
    assert.deepEqual(buildKeywordHighlightSegments("工作日志", "工作"), [
        {text: "工作", hit: true},
        {text: "日志", hit: false},
    ]);
    // 尾部命中
    assert.deepEqual(buildKeywordHighlightSegments("每日工作", "工作"), [
        {text: "每日", hit: false},
        {text: "工作", hit: true},
    ]);
});

test("keyword highlight: case-insensitive and preserves original casing", () => {
    assert.deepEqual(buildKeywordHighlightSegments("API Design", "api"), [
        {text: "API", hit: true},
        {text: " Design", hit: false},
    ]);
});

test("keyword highlight: multiple terms merge overlapping ranges in order", () => {
    // "思源" 与 "笔记" 相邻 → 合并为一段（视觉等价、DOM 更少）
    const segments = buildKeywordHighlightSegments("思源笔记与笔记", "思源 笔记");
    assert.deepEqual(segments, [
        {text: "思源笔记", hit: true},
        {text: "与", hit: false},
        {text: "笔记", hit: true},
    ]);
    // 重叠：查询 "源笔记" 与 "笔记" 共享区间 → 合并为一段
    assert.deepEqual(buildKeywordHighlightSegments("思源笔记", "源笔记 笔记"), [
        {text: "思", hit: false},
        {text: "源笔记", hit: true},
    ]);
});

test("keyword highlight: excludes and unmatched terms produce no marks", () => {
    assert.deepEqual(buildKeywordHighlightSegments("工作日志", "-工作"), [{text: "工作日志", hit: false}]);
    assert.deepEqual(buildKeywordHighlightSegments("工作日志", "项目"), [{text: "工作日志", hit: false}]);
});

test("keyword highlight: quoted phrases still hit", () => {
    assert.deepEqual(buildKeywordHighlightSegments("工作日志", "\"工作\""), [
        {text: "工作", hit: true},
        {text: "日志", hit: false},
    ]);
});

test("keyword highlight: empty text or query stays a single plain segment", () => {
    assert.deepEqual(buildKeywordHighlightSegments("", "工作"), [{text: "", hit: false}]);
    assert.deepEqual(buildKeywordHighlightSegments("工作日志", ""), [{text: "工作日志", hit: false}]);
    assert.deepEqual(buildKeywordHighlightSegments(null, "工作"), [{text: "", hit: false}]);
    assert.deepEqual(buildKeywordHighlightSegments("工作日志", "   "), [{text: "工作日志", hit: false}]);
});

test("keyword highlight: segment join always reconstructs the original title", () => {
    const samples = [
        ["工作日志/设计/工作台", "工作 设计"],
        ["aAbB", "ab"],
        ["重复重复重复", "重复"],
    ];
    for (const [text, query] of samples) {
        const segments = buildKeywordHighlightSegments(text, query);
        assert.equal(segments.map((segment) => segment.text).join(""), text);
        for (const segment of segments) {
            assert.equal(typeof segment.hit, "boolean");
            assert.ok(segment.text.length > 0);
        }
    }
});

test("keyword highlight: hit ranges are bounded to avoid pathological titles", () => {
    const text = "ab".repeat(100); // 200 字符，"a" 命中 100 处 > 64 上限
    const segments = buildKeywordHighlightSegments(text, "a");
    const hits = segments.filter((segment) => segment.hit);
    assert.equal(hits.length, 64);
    assert.equal(segments.map((segment) => segment.text).join(""), text);
});

test("snippet markup: strips kernel hit wrappers of any casing or attributes", () => {
    assert.equal(stripSnippetMarkup("前<mark>命中</mark>后"), "前命中后");
    assert.equal(stripSnippetMarkup("<MARK class='x'>词</MARK>"), "词");
    assert.equal(stripSnippetMarkup("a<mark>b"), "ab"); // 截断残留的开标签
});

test("snippet markup: plain text and literal angle-bracket prose stay intact (T-6835)", () => {
    assert.equal(stripSnippetMarkup("普通片段文本"), "普通片段文本");
    // 负向：宽泛的 <[^>]+> 会误食这段字面比较文本，已知标签剥离不许碰它
    assert.equal(stripSnippetMarkup("if a < b and c > d then"), "if a < b and c > d then");
    assert.equal(stripSnippetMarkup(""), "");
    assert.equal(stripSnippetMarkup(null), "");
});

test("doc preview snapshot: outline bounded to 12 with heading level projection (T-6839)", () => {
    const outline = Array.from({length: 16}, (_, i) => ({name: `标题${i + 1}`, type: "h2"}));
    const snapshot = buildDocPreviewSnapshot(outline, []);
    assert.equal(snapshot.outline.length, 12);
    assert.equal(snapshot.outline[0].name, "标题1");
    // 空白名跳过，不占用配额
    const withBlank = buildDocPreviewSnapshot([{name: "  ", type: "h1"}, {name: "正文", subType: "h3"}], []);
    assert.deepEqual(withBlank.outline, [{name: "正文", level: 3}]);
    // 非标题层级标注（如 NodeHeading）解析不出按 1
    const fallback = buildDocPreviewSnapshot([{name: "其他", type: "NodeHeading"}], []);
    assert.deepEqual(fallback.outline, [{name: "其他", level: 1}]);
});

test("doc preview snapshot: excerpt bounded to 600 chars across paragraphs (T-6839)", () => {
    const long = "字".repeat(500);
    const snapshot = buildDocPreviewSnapshot([], [{content: long}, {content: "第二段"}, {content: "   "}]);
    assert.equal(snapshot.excerpt.length, 504); // 500 + 空格 + 3；段落耗尽不补齐
    assert.ok(snapshot.excerpt.startsWith("字"));
    // 越界合并即截断（trim 去尾空格），不再吸收后续段
    const bounded = buildDocPreviewSnapshot([], [{content: "ab"}, {content: "cd"}, {content: "ef"}], {excerptMax: 5});
    assert.equal(bounded.excerpt, "ab cd");
    assert.equal(snapshot.empty, false);
});

test("doc preview snapshot: empty outline and blocks yields empty flag (T-6839)", () => {
    assert.deepEqual(buildDocPreviewSnapshot(null, null), {outline: [], excerpt: "", empty: true});
    const blank = buildDocPreviewSnapshot([], [{content: "   "}]);
    assert.equal(blank.empty, true);
});
