// T-7080：把真实文档搜索编排函数接入同一条可控内核链路，覆盖
// opened 探测、全库聚合、筛选、分页、缓存、取消和迟到响应。
// 生产函数从 doc-search-ui.ts AST 提取；网络仅由本文件的可控 fetch 提供。
const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {readSourceFile} = require("./source-scan.cjs");
const {createSearchSession, beginSearch, cacheSearchResult} = require("../src/search-session.js");
const {
    aggregateSearchResults,
    buildFullTextSearchRequest,
    buildOpenedDocumentSearchRequests,
    buildSearchCacheKey,
    canUseTitleSearch,
    extractSearchRecords,
    filterSearchDocuments,
    normalizeSearchResult,
    planDocResultsPage,
    resolveSearchNotebookId,
} = require("../src/search-model.js");

const uiSource = readSourceFile("src/doc-search-ui.ts");
const sourceFile = ts.createSourceFile("doc-search-ui.ts", uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functionNames = [
    "runDocSearchFetch",
    "runOpenedDocumentContentSearch",
    "runFullTextSearchFallback",
];
const compiledFunctions = functionNames.map((name) => {
    const declaration = sourceFile.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration, `${name} must exist in src/doc-search-ui.ts`);
    return ts.transpileModule(declaration.getText(sourceFile).replace(/^export\s+/, ""), {
        compilerOptions: {target: ts.ScriptTarget.ES2020},
    }).outputText;
}).join("\n");

function makeRunner(overrides = {}) {
    return new Function(
        "getDocSearchSession", "renderDocResults", "updateDocSearchHealth", "disposeDocSearchSession",
        "filterDocSearchResults", "canUseTitleSearch", "buildSearchCacheKey", "cacheSearchResult",
        "DOC_SEARCH_FETCH_LIMIT", "logger", "fetch", "buildOpenedDocumentSearchRequests",
        "extractSearchRecords", "normalizeSearchResult", "buildFullTextSearchRequest",
        "aggregateSearchResults", "resolveSearchNotebookId",
        `${compiledFunctions}\nreturn {runDocSearchFetch, runOpenedDocumentContentSearch, runFullTextSearchFallback};`,
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
            this.rendered.push({docs, mode: mode || "results", retry: arguments[5]});
        },
        overrides.updateDocSearchHealth || function (scrollElement, options) {
            this.healthReports.push(options);
        },
        overrides.disposeDocSearchSession || function () {
            this.disposed += 1;
        },
        overrides.filterDocSearchResults || ((docs, filters) => filterSearchDocuments(docs, filters)),
        overrides.canUseTitleSearch || canUseTitleSearch,
        overrides.buildSearchCacheKey || buildSearchCacheKey,
        overrides.cacheSearchResult || cacheSearchResult,
        overrides.DOC_SEARCH_FETCH_LIMIT || 33,
        overrides.logger || {warn() {}},
        overrides.fetch || (async () => ({ok: true, status: 200, json: async () => ({data: []})})),
        overrides.buildOpenedDocumentSearchRequests || buildOpenedDocumentSearchRequests,
        overrides.extractSearchRecords || extractSearchRecords,
        overrides.normalizeSearchResult || normalizeSearchResult,
        overrides.buildFullTextSearchRequest || buildFullTextSearchRequest,
        overrides.aggregateSearchResults || aggregateSearchResults,
        overrides.resolveSearchNotebookId || resolveSearchNotebookId,
    );
}

function getDocSession(host, scrollElement) {
    let session = host.docSearchState.sessions.get(scrollElement);
    if (!session) {
        session = createSearchSession(8);
        host.docSearchState.sessions.set(scrollElement, session);
    }
    return session;
}

function makeHost(tabs = []) {
    return {
        isMobile: true,
        docSearchState: {sessions: new WeakMap()},
        rendered: [],
        healthReports: [],
        disposed: 0,
        filterCardsCalls: 0,
        openedRoots: new Set(),
        retryCalls: 0,
        getMobileTabs() {
            return tabs;
        },
        isSemanticSearchAvailable() {
            return false;
        },
        filterCards(scrollElement, keyword, contentRoots) {
            this.filterCardsCalls += 1;
            this.openedRoots = new Set(contentRoots);
            return contentRoots.size;
        },
        applySearch() {
            this.retryCalls += 1;
        },
    };
}

function surface() {
    return {isConnected: true, dataset: {}};
}

function input(value) {
    return {value};
}

function response(data) {
    return {ok: true, status: 200, json: async () => ({code: 0, data})};
}

function root(index) {
    return `20261003000000-${index.toString(16).padStart(8, "0")}`;
}

function tab(rootId, notebook, path) {
    return {rootId, notebookId: notebook, path: `${notebook}/${path}.sy`, title: path};
}

function hit(rootId, notebook, path, suffix = "0") {
    return {
        rootId,
        blockId: `${rootId}-hit-${suffix}`,
        title: `文档 ${rootId}`,
        path: `${notebook}/${path}.sy`,
        notebookId: notebook,
        snippet: `命中片段 ${suffix}`,
    };
}

test("composition: opened scope, native fallback, path filtering, paging, and cache reuse stay aligned", async () => {
    const openedRoot = root(1);
    const tabs = [
        tab(openedRoot, "box-a", "work/opened"),
        tab(root(2), "box-a", "other/outside"),
        tab(root(3), "box-b", "work/other-notebook"),
    ];
    const globalHits = [];
    for (let index = 1; index <= 14; index += 1) {
        globalHits.push(hit(root(index), "box-a", `work/doc-${index}`, String(index)));
    }
    globalHits.push(hit(root(90), "box-a", "other/outside", "out-of-path"));
    globalHits.push(hit(root(91), "box-b", "work/other-notebook", "out-of-notebook"));
    const calls = [];
    const runner = makeRunner({
        fetch: async (endpoint, init = {}) => {
            const body = JSON.parse(init.body || "{}");
            calls.push({endpoint, body});
            if (body.groupBy === 0) return response([hit(openedRoot, "box-a", "work/opened", "opened")]);
            return response(globalHits);
        },
    });
    const host = makeHost(tabs);
    const scrollElement = surface();
    const searchInput = input("项目");
    const filters = {notebook: "box-a", paths: ["box-a/work"], method: "regexp"};
    const cacheKey = buildSearchCacheKey({scope: "global", query: "项目", filters});
    const session = getDocSession(host, scrollElement);

    await runner.runDocSearchFetch.call(host, scrollElement, searchInput, "项目", beginSearch(session), () => {}, filters, cacheKey, "项目");

    const firstRender = host.rendered.at(-1);
    assert.equal(firstRender.mode, "results");
    assert.equal(firstRender.docs.length, 14, "the native fallback must keep only the requested notebook/path");
    assert.equal(host.openedRoots.has(openedRoot), true, "opened content must report the matching root to the local layer");
    const page = planDocResultsPage(firstRender.docs, host.openedRoots, 12);
    assert.equal(page.items.length, 12, "the first page must remain bounded");
    assert.equal(page.totalVisible, 13, "the opened root must be removed before pagination");
    assert.equal(page.hasMore, true, "the merged result set must retain an expansion signal");
    assert.equal(calls.filter((call) => call.body.groupBy === 0).length, 1, "path filtering must bound opened fan-out");
    assert.equal(calls.filter((call) => call.body.groupBy === 1).length, 1, "global fallback must run once");
    assert.equal(session.cache.size, 1);

    await runner.runDocSearchFetch.call(host, scrollElement, searchInput, "项目", beginSearch(session), () => {}, filters, cacheKey, "项目");

    assert.equal(calls.filter((call) => call.body.groupBy === 1).length, 1, "the same filter key must reuse the global cache");
    assert.equal(calls.filter((call) => call.body.groupBy === 0).length, 2, "cache hits still refresh open-tab content");
    assert.equal(host.filterCardsCalls, 2, "cache refresh must keep the local layer current");
    assert.equal(host.healthReports.some((report) => report.fallbackUsed === true), true);
});

test("composition: a late native response cannot render or populate a newer search session", async () => {
    const calls = [];
    let releaseGlobal;
    const pendingGlobal = new Promise((resolve) => {
        releaseGlobal = resolve;
    });
    const runner = makeRunner({
        fetch: async (endpoint, init = {}) => {
            const body = JSON.parse(init.body || "{}");
            calls.push({endpoint, body, signal: init.signal});
            return pendingGlobal;
        },
    });
    const host = makeHost([]);
    const scrollElement = surface();
    const searchInput = input("旧查询");
    const filters = {method: "regexp"};
    const session = getDocSession(host, scrollElement);
    const pending = runner.runDocSearchFetch.call(host, scrollElement, searchInput, "旧查询", beginSearch(session), () => {}, filters, "old-key", "旧查询");
    for (let index = 0; index < 10 && calls.length === 0; index += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1, "the real fallback chain must reach the native endpoint");

    const reportsBeforeNextGeneration = host.healthReports.length;
    beginSearch(session);
    assert.equal(calls[0].signal.aborted, true, "a newer generation must abort the old native request");
    releaseGlobal(response([hit(root(200), "box-a", "work/late", "late")]));
    await pending;

    assert.deepEqual(host.rendered, [], "a response from the old generation must not render");
    assert.equal(session.cache.size, 0, "a response from the old generation must not enter cache");
    assert.equal(host.healthReports.length, reportsBeforeNextGeneration, "a stale response must not publish new health state");
});

function buildHits(rootCount) {
    const hits = [];
    for (let index = 0; index < rootCount; index += 1) {
        const rootId = root(index + 500);
        for (let hitIndex = 0; hitIndex < 4; hitIndex += 1) {
            hits.push(hit(rootId, "box-a", `work/doc-${index}`, String(hitIndex)));
        }
    }
    return hits;
}

async function measureCompositionCpu(runner, records, iterations = 36) {
    for (let index = 0; index < 8; index += 1) {
        const host = makeHost([]);
        const scrollElement = surface();
        const session = getDocSession(host, scrollElement);
        await runner.runDocSearchFetch.call(host, scrollElement, input("大型查询"), "大型查询", beginSearch(session), () => {}, {method: "regexp"}, `bench-${records.length}-${index}`, "大型查询");
    }
    const samples = [];
    for (let index = 0; index < iterations; index += 1) {
        const host = makeHost([]);
        const scrollElement = surface();
        const session = getDocSession(host, scrollElement);
        const started = process.cpuUsage();
        await runner.runDocSearchFetch.call(host, scrollElement, input("大型查询"), "大型查询", beginSearch(session), () => {}, {method: "regexp"}, `bench-${records.length}-${index + 100}`, "大型查询");
        const used = process.cpuUsage(started);
        samples.push((used.user + used.system) / 1e3);
    }
    samples.sort((left, right) => left - right);
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const p95 = samples[Math.floor(samples.length * 0.95)];
    return {average, p95};
}

test("composition: real fallback aggregation keeps the 40ms pathology line and 3x growth gate", async (t) => {
    const smallRecords = buildHits(150); // 600 raw hits
    const largeRecords = buildHits(300); // 1200 raw hits
    const makeBenchRunner = (records) => makeRunner({
        fetch: async () => response(records),
    });
    const small = await measureCompositionCpu(makeBenchRunner(smallRecords), smallRecords);
    const large = await measureCompositionCpu(makeBenchRunner(largeRecords), largeRecords);
    t.diagnostic(`real fallback composition: 600-hit avg ${small.average.toFixed(4)}ms, 1200-hit avg ${large.average.toFixed(4)}ms, p95 ${large.p95.toFixed(4)}ms (40ms pathology line, 3x growth gate)`);
    assert.ok(large.average < 40, `1200-hit real composition avg ${large.average.toFixed(3)}ms exceeds 40ms pathology line`);
    assert.ok(large.average < small.average * 3, `600→1200 real composition grew ${ (large.average / Math.max(small.average, 0.0001)).toFixed(2)}x`);
});
