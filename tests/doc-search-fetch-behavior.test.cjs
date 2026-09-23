// T-6813 runDocSearchFetch 行为锁：签名重排后（keyword, version, …, cacheKey, fetchQuery）
// ①当前版本必须真正打到内核端点（回归防护：调用方把 keyword 当 version 传入会让远程搜索静默退出）；
// ②过期版本不请求、不渲染、不落缓存；③全文回退挂起期间出现新输入，旧结果必须整链丢弃；
// ④缓存命中仍刷新页签层且不发远程请求。
// 提取方式沿用 floating-ball-host.test.cjs：AST 抽出真实函数体，依赖以参数注入。
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {readSourceFile} = require("./source-scan.cjs");
const {createSearchSession, beginSearch, cacheSearchResult} = require("../src/search-session.js");

const uiSource = readSourceFile("src/doc-search-ui.ts");
const sourceFile = ts.createSourceFile("doc-search-ui.ts", uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const fnDecl = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "runDocSearchFetch");
assert.ok(fnDecl, "runDocSearchFetch must exist in src/doc-search-ui.ts");
const fnText = fnDecl.getText(sourceFile).replace(/^export\s+/, "");
const compiled = ts.transpileModule(fnText, {
    // 无 fileName：带 .js 后缀会让 TS 保留泛型标注（new Set<string>() 原样输出），
    // 产物不是合法 JS。
    compilerOptions: {target: ts.ScriptTarget.ES2020},
}).outputText;

function makeRunner(overrides = {}) {
    return new Function(
        "getDocSearchSession", "renderDocResults", "updateDocSearchHealth", "disposeDocSearchSession",
        "runOpenedDocumentContentSearch", "runFullTextSearchFallback", "filterDocSearchResults", "canUseTitleSearch",
        "buildSearchCacheKey", "cacheSearchResult", "DOC_SEARCH_FETCH_LIMIT", "logger", "fetch",
        `${compiled}\nreturn runDocSearchFetch;`,
    )(
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
        overrides.cacheSearchResult || cacheSearchResult,
        overrides.DOC_SEARCH_FETCH_LIMIT || 24,
        overrides.logger || {warn() {}},
        overrides.fetch || (async () => ({ok: true, json: async () => ({data: []})})),
    );
}

function makeHost() {
    return {
        docSearchState: {sessions: new WeakMap()},
        filterCardsCalls: 0,
        rendered: [],
        healthReports: [],
        disposed: 0,
        filterCards() {
            this.filterCardsCalls += 1;
            return 2;
        },
    };
}

function surface() {
    return {isConnected: true, dataset: {}};
}

function input(value) {
    return {value};
}

function titleResponse(docs) {
    return {ok: true, json: async () => ({data: docs})};
}

test("fetch: current version from the reordered signature reaches the kernel endpoint", async () => {
    const calls = [];
    const runner = makeRunner({
        fetch: async (endpoint) => {
            calls.push(endpoint);
            return titleResponse([{id: "20260901000000-abcdefab", path: "/a/b", content: "b"}]);
        },
    });
    const host = makeHost();
    const scrollElement = surface();
    const version = beginSearch(getDocSession(host, scrollElement));
    await runner.call(host, scrollElement, input("foo"), "foo", version, () => {}, {}, "key:foo", "foo");
    assert.deepEqual(calls, ["/api/filetree/searchDocs"], "当前版本必须发起标题搜索请求");
    assert.equal(host.rendered.length, 1, "结果必须渲染一次");
    assert.equal(host.rendered[0].docs.length, 1);
});

test("fetch: stale version neither fetches, renders, nor caches", async () => {
    const calls = [];
    const runner = makeRunner({
        fetch: async (endpoint) => {
            calls.push(endpoint);
            return titleResponse([]);
        },
    });
    const host = makeHost();
    const scrollElement = surface();
    beginSearch(getDocSession(host, scrollElement));
    // 旧调用顺序会把 keyword 当 version 传进来——这里就是当时静默退出的形态。
    await runner.call(host, scrollElement, input("foo"), "foo", "foo", () => {}, {}, "key:foo", "foo");
    assert.deepEqual(calls, [], "过期版本不得发起请求");
    assert.deepEqual(host.rendered, [], "过期版本不得渲染");
    const offline = surface();
    offline.isConnected = false;
    await runner.call(host, offline, input("foo"), "foo", 1, () => {}, {}, "key:foo", "foo");
    assert.equal(host.disposed, 1, "断连容器必须触发会话清理");
});

test("fetch: results arriving after a newer input are discarded post fallback", async () => {
    const host = makeHost();
    const scrollElement = surface();
    const session = getDocSession(host, scrollElement);
    let releaseFallback;
    const runner = makeRunner({
        canUseTitleSearch: () => false,
        runFullTextSearchFallback: () => new Promise((resolve) => {
            releaseFallback = () => resolve([{id: "20260901000000-abcdefab", path: "/slow"}]);
        }),
    });
    const version = beginSearch(session);
    const pending = runner.call(host, scrollElement, input("slow"), "slow", version, () => {}, {}, "key:slow", "slow");
    await Promise.resolve();
    beginSearch(session); // 用户继续输入：上一轮整体作废
    releaseFallback();
    await pending;
    assert.deepEqual(host.rendered, [], "回退结果过期后不得渲染");
    assert.equal(session.cache.size, 0, "回退结果过期后不得写入缓存");
});

test("fetch: cache hit refreshes open-tab counts without a remote request", async () => {
    const calls = [];
    const runner = makeRunner({
        fetch: async (endpoint) => {
            calls.push(endpoint);
            return titleResponse([]);
        },
    });
    const host = makeHost();
    const scrollElement = surface();
    const session = getDocSession(host, scrollElement);
    const cached = [{id: "20260901000000-cachedca", path: "/c"}];
    cacheSearchResult(session, "key:foo", cached);
    const version = beginSearch(session);
    await runner.call(host, scrollElement, input("foo"), "foo", version, () => {}, {}, "key:foo", "foo");
    assert.deepEqual(calls, [], "缓存命中不得再发远程请求");
    // 缓存命中时渲染由 applySearch 负责；本函数只刷新页签层与健康快照。
    assert.deepEqual(host.rendered, [], "缓存命中路径不得重复渲染");
    assert.equal(host.filterCardsCalls, 1, "缓存命中仍要刷新页签层");
    assert.equal(host.healthReports.some((report) => report.cacheHit === true), true, "健康快照必须标注 cacheHit");
});

function getDocSession(host, scrollElement) {
    let session = host.docSearchState.sessions.get(scrollElement);
    if (!session) {
        session = createSearchSession(8);
        host.docSearchState.sessions.set(scrollElement, session);
    }
    return session;
}
