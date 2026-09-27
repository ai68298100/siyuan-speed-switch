const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {JSDOM} = require("jsdom");
const {readSourceFile} = require("./source-scan.cjs");
const {buildNativeSearchTabConfig, buildSearchHealthSnapshot} = require("../src/search-model.js");
const {createPlatformStatus} = require("../src/platform-dom.js");

const source = readSourceFile("src/doc-search-ui.ts");
const ast = ts.createSourceFile("doc-search-state.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = new Set([
    "appendDocStatusCopy",
    "appendDocSearchHealthBadge",
    "updateDocSearchHealth",
    "ensureDocResultsBox",
    "appendDocResultsEmpty",
    "appendDocResultsViewAll",
    "appendDocSearchStatus",
]);
const pieces = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(pieces.length, names.size, "document search state helpers must remain extractable");
const compiled = ts.transpileModule(
    pieces.map((node) => node.getText(ast).replace(/^export\s+/, "")).join("\n"),
    {compilerOptions: {target: ts.ScriptTarget.ES2020}},
).outputText;

function fixture() {
    const dom = new JSDOM("<div id=scroll></div>");
    const document = dom.window.document;
    const opened = [];
    const api = new Function(
        "document", "buildNativeSearchTabConfig", "openTab", "logger", "showMessage", "createPlatformStatus",
        "buildSearchHealthSnapshot", "cancelDocPreview",
        `${compiled}\nreturn {appendDocResultsEmpty, appendDocSearchStatus, appendDocSearchHealthBadge, updateDocSearchHealth, ensureDocResultsBox};`,
    )(
        document,
        buildNativeSearchTabConfig,
        async (config) => opened.push(config),
        {warn() {}},
        () => undefined,
        createPlatformStatus,
        buildSearchHealthSnapshot,
        () => undefined,
    );
    const scroll = document.getElementById("scroll");
    scroll.dataset.swDocSearchQuery = "alpha";
    const host = {
        app: {},
        isSemanticSearchAvailable: () => true,
        docSearchState: {filters: new Map([[scroll, {}]]), health: new Map()},
        i18n: {
            noDocResults: "No matching documents found",
            docSearchResults: "Workspace documents",
            docSearchEmptyHint: "Try another keyword",
            docSearchLoading: "Searching workspace documents…",
            docSearchLoadingHint: "Opened tabs remain available",
            docSearchHealthLoading: "Workspace layer loading",
            docSearchFailed: "Search failed",
            docSearchErrorHint: "Opened-tab results are preserved",
            docSearchRetry: "Retry workspace search",
            docSearchHealthUnavailable: "Workspace layer unavailable",
            docSearchViewAll: "View all in SiYuan Search",
        },
    };
    return {dom, document, scroll, host, api, opened};
}

test("document search empty state gives guidance and a native search exit", async () => {
    const f = fixture();
    try {
        let closed = 0;
        const box = f.document.createElement("div");
        f.api.appendDocResultsEmpty.call(f.host, box, f.scroll, () => {closed += 1;});
        assert.equal(box.querySelector(".sw__doc-status")?.getAttribute("role"), "status");
        assert.equal(box.querySelector(".sw__doc-status-title")?.textContent, f.host.i18n.noDocResults);
        assert.equal(box.querySelector(".sw__doc-status-hint")?.textContent, f.host.i18n.docSearchEmptyHint);
        const action = box.querySelector(".sw__doc-view-all");
        assert.ok(action, "empty state must expose the native search exit");
        action.click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(closed, 1);
        assert.equal(f.opened.length, 1);
        assert.equal(f.opened[0].search.query, "alpha");
    } finally {
        f.dom.window.close();
    }
});

test("document search loading state exposes a reduced-motion-friendly skeleton", () => {
    const f = fixture();
    try {
        const box = f.document.createElement("div");
        f.api.appendDocSearchStatus.call(f.host, box, "loading", f.scroll, () => {});
        assert.equal(box.querySelectorAll(".sw__doc-status-skeleton-line").length, 3);
        assert.equal(box.querySelector(".sw__doc-status-hint")?.textContent, f.host.i18n.docSearchLoadingHint);
        assert.equal(box.querySelector(".sw__doc-retry"), null);
    } finally {
        f.dom.window.close();
    }
});

test("document search health badge exposes loading and unavailable remote states", () => {
    const f = fixture();
    try {
        const loadingLabel = f.document.createElement("div");
        f.host.docSearchState.health.set(f.scroll, {remote: true, state: "loading"});
        f.api.appendDocSearchHealthBadge.call(f.host, loadingLabel, f.scroll);
        assert.equal(loadingLabel.querySelector(".sw-platform-status")?.dataset.state, "loading");
        assert.equal(loadingLabel.textContent, f.host.i18n.docSearchHealthLoading);

        const errorLabel = f.document.createElement("div");
        f.host.docSearchState.health.set(f.scroll, {remote: true, state: "error"});
        f.api.appendDocSearchHealthBadge.call(f.host, errorLabel, f.scroll);
        assert.equal(errorLabel.querySelector(".sw-platform-status")?.dataset.state, "error");
        assert.equal(errorLabel.textContent, f.host.i18n.docSearchHealthUnavailable);

        const localLabel = f.document.createElement("div");
        f.host.docSearchState.health.set(f.scroll, {remote: false, state: "error"});
        f.api.appendDocSearchHealthBadge.call(f.host, localLabel, f.scroll);
        assert.equal(localLabel.childElementCount, 0, "local-only health must not claim a remote outage");
    } finally {
        f.dom.window.close();
    }
});

test("document search error state preserves a retry action and native fallback", async () => {
    const f = fixture();
    try {
        let retries = 0;
        const box = f.document.createElement("div");
        f.api.appendDocSearchStatus.call(f.host, box, "error", f.scroll, () => {}, () => {retries += 1;});
        assert.equal(box.querySelector(".sw__doc-status")?.getAttribute("role"), "alert");
        assert.equal(box.querySelector(".sw__doc-status-hint")?.textContent, f.host.i18n.docSearchErrorHint);
        box.querySelector(".sw__doc-retry").click();
        assert.equal(retries, 1);
        assert.ok(box.querySelector(".sw__doc-view-all"));
    } finally {
        f.dom.window.close();
    }
});

test("cached empty results clear loading health without rebuilding the result actions", () => {
    const f = fixture();
    try {
        f.api.updateDocSearchHealth.call(f.host, f.scroll, {remote: true, state: "loading"}, true);
        const box = f.api.ensureDocResultsBox.call(f.host, f.scroll, []);
        f.api.appendDocResultsEmpty.call(f.host, box, f.scroll, () => {});
        const action = box.querySelector(".sw__doc-view-all");
        action.focus();
        assert.equal(box.querySelector(".sw__doc-health-status")?.dataset.state, "loading");

        f.api.updateDocSearchHealth.call(f.host, f.scroll, {
            state: "ready", cacheHit: true, sources: {global: {status: "empty"}},
        });
        assert.equal(box.querySelector(".sw__doc-health-status"), null,
            "a settled cached empty result must not keep its loading badge");
        assert.equal(box.querySelector(".sw__doc-view-all"), action);
        assert.equal(f.document.activeElement, action, "health updates must preserve keyboard focus");
        assert.equal(box.querySelector(".sw__window-label").textContent, f.host.i18n.docSearchResults);
    } finally {
        f.dom.window.close();
    }
});

test("health updates replace stale badges and stay scoped to their search surface", () => {
    const f = fixture();
    try {
        const box = f.api.ensureDocResultsBox.call(f.host, f.scroll, []);
        const label = box.querySelector(".sw__window-label");
        label.textContent = `${f.host.i18n.docSearchResults} · 2`;
        const otherScroll = f.document.createElement("div");
        otherScroll.dataset.swDocSearchQuery = "beta";
        f.document.body.appendChild(otherScroll);
        f.api.updateDocSearchHealth.call(f.host, otherScroll, {remote: true, state: "loading"}, true);
        const otherBox = f.api.ensureDocResultsBox.call(f.host, otherScroll, []);
        const otherBadge = otherBox.querySelector(".sw__doc-health-status");

        f.api.updateDocSearchHealth.call(f.host, f.scroll, {remote: true, state: "loading"}, true);
        f.api.updateDocSearchHealth.call(f.host, f.scroll, {counts: {tabs: 2}});
        assert.equal(label.querySelectorAll(".sw__doc-health-status").length, 1,
            "parallel source updates must not duplicate the badge");
        f.api.updateDocSearchHealth.call(f.host, f.scroll, {state: "error"});
        assert.equal(label.querySelectorAll(".sw__doc-health-status").length, 1);
        assert.equal(label.querySelector(".sw__doc-health-status").dataset.state, "error");
        f.api.updateDocSearchHealth.call(f.host, f.scroll, {remote: false, state: "idle"}, true);
        assert.equal(label.textContent, `${f.host.i18n.docSearchResults} · 2`);
        assert.equal(label.querySelector(".sw__doc-health-status"), null);
        assert.equal(otherBox.querySelector(".sw__doc-health-status"), otherBadge);
        assert.equal(otherBadge.dataset.state, "loading");
    } finally {
        f.dom.window.close();
    }
});
