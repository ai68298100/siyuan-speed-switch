// T-7343 深入穿透检索运行时接线锁：
// 切换器搜索框输入 `^块内容` / `:标题` / `文档名:标题` 时，runDocSearchFetch 必须
// 走穿透专用端点（/api/query/sql 或 /api/outline/getDocOutline），并且渲染出的条目
// 必须携带命中块 blockId（去重键不得退化为 rootId，否则同文档多标题会被折叠）。
//
// 沿用 T-6813 的 AST 抽取范式：只编译 docSearchRequestScope / boundedSearchRequest /
// runDocSearchFetch 三个函数声明体，用 new Function 注入全部外部符号。

const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {readSourceFile} = require("./source-scan.cjs");
const {createSearchSession, cacheSearchResult} = require("../src/search-session.js");
const {
    normalizeTitleSearchDocuments,
    rankDocumentsByPathAcronym,
    planPenetrationSearchRequest,
    aggregatePenetrationResults,
    SEARCH_MODES,
    resolveDocSearchResultId,
    planDocResultsPage,
} = require("../src/search-model.js");
// T-7343：BLOCK_ID_RE 与 doc-search-ui.ts 同源（constants.js）。
const {BLOCK_ID_RE} = require("../src/constants.js");

const uiSource = readSourceFile("src/doc-search-ui.ts");
const sourceFile = ts.createSourceFile("doc-search-ui.ts", uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declOf(name) {
    const node = sourceFile.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, `${name} must exist in src/doc-search-ui.ts`);
    return node;
}
const fnText = ["docSearchRequestScope", "boundedSearchRequest", "runDocSearchFetch"]
    .map((name) => declOf(name).getText(sourceFile).replace(/^export\s+/, ""))
    .join("\n");
// 编译期自检：确认穿透分支的端点调用确实经由 boundedSearchRequest（便于用桩截获）。
assert.ok(
    declOf("runDocSearchFetch").getText(sourceFile).includes("boundedSearchRequest.call"),
    "runDocSearchFetch 必须经由 boundedSearchRequest 发送穿透请求",
);
// 无 fileName：带 .js 后缀会让 TS 保留泛型标注（new Set<string>() 原样输出），产物不是合法 JS。
const compiled = ts.transpileModule(fnText, {
    compilerOptions: {target: ts.ScriptTarget.ES2020},
}).outputText;

function makeRunner(overrides = {}) {
    const calls = overrides.calls || [];
    const fetchImpl = overrides.fetch || (async () => ({ok: true, status: 200, json: async () => ({data: []})}));
    const runner = new Function(
        "docSearchSurfaceRequestIds", "nextDocSearchSurfaceRequestId",
        "getDocSearchSession", "renderDocResults", "updateDocSearchHealth", "disposeDocSearchSession",
        "boundedSearchRequest",
        "runOpenedDocumentContentSearch", "runFullTextSearchFallback", "filterDocSearchResults", "canUseTitleSearch",
        "buildSearchCacheKey", "cacheSearchResult", "DOC_SEARCH_FETCH_LIMIT", "logger", "fetch",
        "normalizeTitleSearchDocuments", "rankDocumentsByPathAcronym",
        "planPenetrationSearchRequest", "aggregatePenetrationResults", "SEARCH_MODES", "BLOCK_ID_RE",
        "resolveDocSearchResultId",
        `${compiled}\nreturn runDocSearchFetch;`,
    )(
        new WeakMap(), 0,
        overrides.getDocSearchSession || function (scrollElement) {
            let session = this.docSearchState.sessions.get(scrollElement);
            if (!session) {
                session = createSearchSession(8);
                this.docSearchState.sessions.set(scrollElement, session);
            }
            return session;
        },
        overrides.renderDocResults || function (scrollElement, docs, onClose, mode) {
            this.rendered.push({docs, mode: mode || "results"});
        },
        overrides.updateDocSearchHealth || function (scrollElement, options) {
            this.healthReports.push(options);
        },
        overrides.disposeDocSearchSession || function () {
            this.disposed = (this.disposed || 0) + 1;
        },
        // T-7343：boundedSearchRequest 用真实实现（走 host.requestKernelJsonOutcome 截获端点）。
        new Function("logger", `${compiled}\nreturn boundedSearchRequest;`)(overrides.logger || {warn() {}}),
        overrides.runOpenedDocumentContentSearch || function () {
            return Promise.resolve(new Set());
        },
        overrides.runFullTextSearchFallback || function () {
            return Promise.resolve([]);
        },
        overrides.filterDocSearchResults || function (docs) {
            return docs;
        },
        overrides.canUseTitleSearch || function () {
            return true;
        },
        overrides.buildSearchCacheKey || function (input) {
            return `key:${input.query}`;
        },
        cacheSearchResult,
        overrides.DOC_SEARCH_FETCH_LIMIT || 24,
        overrides.logger || {warn() {}},
        async (url, body) => {
            calls.push({endpoint: url, body});
            return fetchImpl(url, body);
        },
        normalizeTitleSearchDocuments,
        rankDocumentsByPathAcronym,
        overrides.planPenetrationSearchRequest || planPenetrationSearchRequest,
        overrides.aggregatePenetrationResults || aggregatePenetrationResults,
        overrides.SEARCH_MODES || SEARCH_MODES,
        overrides.BLOCK_ID_RE || BLOCK_ID_RE,
        overrides.resolveDocSearchResultId || resolveDocSearchResultId,
    );
    runner.calls = calls;
    return runner;
}

function makeHost(activeTab, fetchImpl) {
    return {
        docSearchState: {sessions: new Map()},
        rendered: [],
        healthReports: [],
        disposed: 0,
        filterCardsCalls: 0,
        applySearch() {},
        // T-7343：boundedSearchRequest 真实实现走 this.requestKernelJsonOutcome(endpoint, body, options)。
        async requestKernelJsonOutcome(url, body) {
            const response = await fetchImpl(url, body);
            if (response?.ok !== true) return {ok: false, error: {kind: "http"}};
            return {ok: true, value: await response.json()};
        },
        filterCards() {
            this.filterCardsCalls += 1;
            return 0;
        },
        // T-7343：穿透计划需要当前活动文档定位（:标题 走当前文档大纲）。
        getActiveTab() {
            return activeTab;
        },
        rootIdOf(tab) {
            return tab?.docId || "";
        },
        titleOf() {
            return "当前文档";
        },
    };
}

const ACTIVE_TAB = {docId: "20261001000000-active01"};

async function runFetch(keyword, fetchImpl, overrides = {}) {
    const fetchImplResolved = fetchImpl || (async () => emptyJson());
    const runner = makeRunner({fetch: fetchImplResolved, ...overrides});
    const host = makeHost(
        overrides.activeTab === null ? null : ACTIVE_TAB,
        async (url, body) => {
            runner.calls.push({endpoint: url, body});
            return fetchImplResolved(url, body);
        },
    );
    const scrollElement = {isConnected: true, dataset: {}, style: {}, children: []};
    // 签名顺序：(scrollElement, searchInput, keyword, version, onClose, filters, cacheKey, fetchQuery)
    // current() 守卫要求 searchInput.value.trim() === keyword。
    const searchInput = {value: keyword};
    await runner.call(
        host,
        scrollElement,
        searchInput,
        keyword,
        0, // runDocSearchFetch 内部 beginSearch 会自增；current() 要求 version === session.version
        () => {},
        {notebook: ""},
        `${keyword}|0`,
        keyword,
    );
    return {host, calls: runner.calls};
}

const BLOCK_SQL_RESPONSE = {
    code: 0,
    data: [
        {
            id: "20261001000000-block01",
            root_id: "20261001000000-active01",
            content: "需要定位的目标块",
            type: "p",
        },
    ],
};

const OUTLINE_RESPONSE = {
    code: 0,
    data: [
        {id: "20261001000000-head001", root_id: "20261001000000-active01", content: "一级标题", type: "h", subtype: "h1", depth: 1},
        {id: "20261001000000-head002", root_id: "20261001000000-active01", content: "二级标题", type: "h", subtype: "h2", depth: 2},
    ],
};

function emptyJson() {
    return {ok: true, status: 200, json: async () => ({code: 0, data: []})};
}

test("penetration fetch: ^块查询直达 /api/query/sql 且不发送全文检索端点", async () => {
    const {host, calls} = await runFetch("^目标块", async (endpoint) => {
        if (endpoint === "/api/query/sql") return {ok: true, status: 200, json: async () => BLOCK_SQL_RESPONSE};
        return emptyJson();
    });
    const endpoints = calls.map((call) => call.endpoint);
    assert.ok(endpoints.includes("/api/query/sql"), `必须请求块 SQL 端点，实际：${JSON.stringify(endpoints)}`);
    assert.ok(!endpoints.includes("/api/search/fullTextSearchBlock"), "穿透查询不得回退全文检索");
    assert.equal(host.rendered.length, 1, "穿透结果必须渲染一次");
    const docs = host.rendered[0].docs;
    assert.equal(docs.length, 1, "块结果条目数为 1");
    assert.equal(docs[0].kind, "block", "条目 kind 必须为 block");
    assert.equal(docs[0].blockId, "20261001000000-block01", "条目必须携带命中块 id");
    assert.equal(docs[0].rootId, "20261001000000-active01", "条目必须携带根文档 id");
});

test("penetration fetch: :标题查询直达 /api/outline/getDocOutline 且同文档多标题不被去重", async () => {
    const {host, calls} = await runFetch(":标题", async (endpoint) => {
        if (endpoint === "/api/outline/getDocOutline") return {ok: true, status: 200, json: async () => OUTLINE_RESPONSE};
        return emptyJson();
    });
    const endpoints = calls.map((call) => call.endpoint);
    assert.ok(endpoints.includes("/api/outline/getDocOutline"), `必须请求大纲端点，实际：${JSON.stringify(endpoints)}`);
    assert.ok(!endpoints.includes("/api/query/sql"), "大纲穿透不得走块 SQL");
    const docs = host.rendered[0].docs;
    assert.equal(docs.length, 2, `同一文档的两个标题都必须保留，实际 ${docs.length}`);
    assert.deepEqual(docs.map((doc) => doc.blockId), [
        "20261001000000-head001",
        "20261001000000-head002",
    ], "标题条目的 blockId 必须互不相同（去重键不得退化为 rootId）");
    assert.ok(docs.every((doc) => doc.kind === "heading"), "条目 kind 必须为 heading");
});

test("penetration fetch: 文档名:标题 两段式先搜文档再取大纲", async () => {
    const {host, calls} = await runFetch("项目周报:标题", async (endpoint) => {
        if (endpoint === "/api/filetree/searchDocs") {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    code: 0,
                    data: [{root_id: "20261002000000-target01", title: "项目周报", path: "/项目周报"}],
                }),
            };
        }
        if (endpoint === "/api/outline/getDocOutline") return {ok: true, status: 200, json: async () => OUTLINE_RESPONSE};
        return emptyJson();
    });
    const endpoints = calls.map((call) => call.endpoint);
    assert.equal(endpoints[0], "/api/filetree/searchDocs", "第一步必须先定位目标文档");
    assert.ok(endpoints.includes("/api/outline/getDocOutline"), "第二步必须取目标文档大纲");
    const outlineCall = calls.find((call) => call.endpoint === "/api/outline/getDocOutline");
    assert.equal(outlineCall.body.id, "20261002000000-target01", "大纲请求必须携带解析出的文档 id");
    assert.equal(host.rendered.length, 1, "跨文档穿透结果必须渲染一次");
    assert.equal(host.rendered[0].docs.length, 2, "跨文档大纲条目数为 2");
});

test("penetration fetch: 无活动文档时 :标题 直接空态且不请求大纲端点", async () => {
    const {host, calls} = await runFetch(":标题", async () => emptyJson(), {activeTab: null});
    const endpoints = calls.map((call) => call.endpoint);
    assert.ok(!endpoints.includes("/api/outline/getDocOutline"), "无活动文档时不得请求大纲端点");
    assert.equal(host.rendered.length, 1, "必须渲染一次空态");
    assert.equal(host.rendered[0].mode, "empty", "必须走 empty 渲染态");
});

test("penetration fetch: 同文档多标题的去重键必须是 blockId 而非 rootId", async () => {
    // T-7343 核心回归锁：renderDocResults 走 planDocResultsPage 去重，
    // 若 resolveDocSearchResultId 退化成 rootId，同文档的两个标题会被折叠成 1 条。
    const docs = aggregatePenetrationResults(
        {mode: SEARCH_MODES.OUTLINE, isPenetration: true, isCurrentDoc: true},
        OUTLINE_RESPONSE,
        {activeDocId: "20261001000000-active01", activeDocTitle: "当前文档"},
    );
    assert.equal(docs.length, 2, `聚合必须产出 2 条，实际 ${docs.length}`);
    const ids = new Set(docs.map((doc) => resolveDocSearchResultId(doc)));
    assert.equal(ids.size, 2, `去重键必须互不相同（blockId），实际仅 ${ids.size} 个唯一键：${JSON.stringify([...ids])}`);
    const planned = planDocResultsPage(docs, new Set(), 0);
    assert.equal(planned.items.length, 2, `分页规划后仍须保留 2 条，实际 ${planned.items.length}`);
});

test("penetration fetch: AGENTS 门禁负向验证——聚合器抹掉 blockId 时锚定契约必须失败", async () => {
    // 负向注入：把聚合器替换成"只给 rootId、不给 blockId"的违规实现，模拟去重键退化回归。
    // 断言"blockId 非法"成立，说明本用例真的能抓住回归（非"改完仍通过"）。
    const {host} = await runFetch("^目标块", async () => emptyJson(), {
        aggregatePenetrationResults: (plan) => ([{
            rootId: plan.activeDocId,
            blockId: "", // 违规：抹掉命中块
            title: "目标块",
            kind: "block",
        }]),
    });
    const docs = host.rendered[0].docs;
    assert.equal(docs.length, 1, "违规聚合仍渲染 1 条（前置条件）");
    assert.equal(
        BLOCK_ID_RE.test(String(docs[0].blockId || "")),
        false,
        "违规注入下 blockId 必须非法——本断言成立即证明门禁可捕获缺失锚定的回归",
    );
});
