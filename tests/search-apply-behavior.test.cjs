const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {readSourceFile} = require("./source-scan.cjs");
const {createSearchSession, beginSearch} = require("../src/search-session.js");
const {parseSearchQuery, formatCleanQuery, buildSearchCacheKey, buildSearchHealthSnapshot} = require("../src/search-model.js");

const source = readSourceFile("src/index.ts");
const file = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const klass = file.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "SpeedSwitchPlugin");
const methods = klass.members.filter((node) => ts.isMethodDeclaration(node) && node.name?.getText(file) === "applySearch");
assert.equal(methods.length, 1, "the production search entry must be present");
const compiled = ts.transpileModule(`class Host {${methods[0].getText(file)}}`, {
    compilerOptions: {target: ts.ScriptTarget.ES2020},
}).outputText;

function fixture() {
    const sessions = new Map();
    const requests = [];
    const commands = [];
    const health = new Map();
    const deps = {
        getDocSearchSession(scroll) {
            if (!sessions.has(scroll)) sessions.set(scroll, createSearchSession(8));
            return sessions.get(scroll);
        },
        beginSearch, parseSearchQuery, formatCleanQuery, buildSearchCacheKey,
        updateDocSearchHealth(scroll, options) {
            health.set(scroll, buildSearchHealthSnapshot({...options, query: scroll.dataset.swDocSearchQuery}));
        },
        renderDocResults() {},
        mountDocPreviewPane() {},
        runDocSearchFetch(scroll, searchInput, keyword, version) {
            requests.push({scroll, keyword, version});
        },
        window: globalThis,
        SEARCH_DEBOUNCE_MS: 0,
    };
    const Host = new Function(...Object.keys(deps), `${compiled}; return Host;`)(...Object.values(deps));
    const host = Object.assign(new Host(), {
        docSearchState: {filters: new Map(), parsedQueries: new Map()},
        filterCards: () => 2,
        renderCommandList(scroll, query) { commands.push({scroll, query}); },
        renderUnifiedSections() {}, renderSnippetSearchSection() {}, renderWorkbench() {}, applySearchChips() {},
    });
    const surface = () => ({dataset: {}, querySelector: () => null});
    const scroll = surface();
    const otherScroll = surface();
    const session = deps.getDocSearchSession(scroll);
    const otherSession = deps.getDocSearchSession(otherScroll);
    const close = () => {};
    const cleanup = () => { for (const item of sessions.values()) beginSearch(item); };
    return {host, scroll, otherScroll, session, otherSession, requests, commands, health, close, cleanup};
}

test("command mode aborts prior search and debounce without cancelling another surface", async () => {
    const f = fixture();
    const controller = new AbortController();
    const otherController = new AbortController();
    let pendingRan = false;
    f.session.controller = controller;
    f.otherSession.controller = otherController;
    f.session.timer = setTimeout(() => { pendingRan = true; }, 5);
    try {
        f.host.applySearch(f.scroll, {value: "> diary", dataset: {}}, f.close);
        assert.equal(controller.signal.aborted, true, "entering command mode must abort in-flight document search");
        assert.equal(f.session.controller, null);
        assert.equal(f.session.timer, null);
        assert.equal(f.session.version, 1);
        assert.equal(otherController.signal.aborted, false);
        assert.equal(f.otherSession.version, 0);
        assert.deepEqual(f.commands, [{scroll: f.scroll, query: "diary"}]);
        assert.equal(f.health.get(f.scroll).remote, false);
        assert.equal(f.health.get(f.scroll).state, "idle");
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(pendingRan, false, "the previous debounce must never fire");
        assert.equal(f.requests.length, 0, "command mode must not start document requests");
    } finally {
        f.cleanup();
    }
});

test("leaving command mode resumes document search with a fresh session version", async () => {
    const f = fixture();
    try {
        f.host.applySearch(f.scroll, {value: "> diary", dataset: {}}, f.close);
        f.host.applySearch(f.scroll, {value: "alpha", dataset: {}}, f.close);
        const version = f.session.version;
        assert.equal(f.health.get(f.scroll).remote, true);
        assert.equal(f.health.get(f.scroll).state, "loading");
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(f.requests, [{scroll: f.scroll, keyword: "alpha", version}]);
        assert.equal(f.session.timer, null);
        f.host.applySearch(f.scroll, {value: "", dataset: {}}, f.close);
        assert.equal(f.session.version, version + 1);
        assert.equal(f.health.get(f.scroll).remote, false);
        assert.equal(f.health.get(f.scroll).state, "idle");
    } finally {
        f.cleanup();
    }
});
