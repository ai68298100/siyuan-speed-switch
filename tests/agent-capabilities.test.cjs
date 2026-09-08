const test = require("node:test");
const assert = require("node:assert/strict");
const Ajv = require("ajv");
const {
    AGENT_CAPABILITY_SPECS,
    AGENT_ITEM_SCHEMA,
    READ_ONLY_EFFECTS,
    normalizeAgentQuery,
    normalizeAgentNotebook,
    normalizeAgentLimit,
    normalizeAgentRootId,
    limitAgentItems,
    buildAgentNavigationResult,
    buildAgentSearchResult,
    registerReadOnlyAgentCapabilities,
} = require("../src/agent-capabilities.js");

const ROOT = "20260906120000-aaaaaaa";

test("agent capability specs are read-only and bounded", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.name, "navigation-state");
    assert.equal(AGENT_CAPABILITY_SPECS.search.name, "search-documents");
    assert.equal(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.limit.maximum, 32);
    assert.match(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.notebook.pattern, /A-Za-z0-9/);
    assert.equal(AGENT_CAPABILITY_SPECS.search.outputSchema.properties.items.items.type, "object");
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.properties.tabs.type, "array");
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.properties.tabs.maxItems, 32);
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.additionalProperties, false);
    assert.equal(AGENT_CAPABILITY_SPECS.search.outputSchema.properties.count.maximum, 32);
    assert.equal(AGENT_ITEM_SCHEMA.additionalProperties, false);
    assert.equal(AGENT_ITEM_SCHEMA.properties.snippets.maxItems, 2);
});

test("agent capability outputs satisfy their declared JSON schemas", () => {
    const ajv = new Ajv({strict: true});
    const validateNavigation = ajv.compile(AGENT_CAPABILITY_SPECS.navigation.outputSchema);
    const validateSearch = ajv.compile(AGENT_CAPABILITY_SPECS.search.outputSchema);
    const navigation = buildAgentNavigationResult({
        activeId: ROOT,
        mobile: false,
        tabs: [{id: "tab-a", rootId: ROOT, title: "当前", source: "tabs", active: true}],
        recent: [],
        favorites: [],
    });
    const search = buildAgentSearchResult("query", [
        {id: ROOT, rootId: ROOT, title: "文档", source: "global", snippets: ["片段"]},
    ], {source: "global"});
    assert.equal(validateNavigation(navigation), true, JSON.stringify(validateNavigation.errors));
    assert.equal(validateSearch(search), true, JSON.stringify(validateSearch.errors));
    assert.equal(validateNavigation({...navigation, unexpected: true}), false);
    assert.equal(validateSearch({...search, items: [{rootId: "invalid"}]}), false);
});

test("agent input normalization rejects unsafe notebook and ids", () => {
    assert.equal(normalizeAgentQuery("  alpha\n beta  "), "alpha beta");
    assert.equal(normalizeAgentNotebook("box_1"), "box_1");
    assert.equal(normalizeAgentNotebook("box/../../other"), "");
    assert.equal(normalizeAgentRootId(ROOT), ROOT);
    assert.equal(normalizeAgentRootId("not-a-block"), "");
    assert.equal(normalizeAgentLimit("999"), 32);
    assert.equal(normalizeAgentLimit("bad", 7), 7);
});

test("agent item output is deduplicated and bounded", () => {
    const result = limitAgentItems([
        {rootId: ROOT, title: "first", blockIds: [ROOT]},
        {rootId: ROOT, title: "duplicate"},
        {id: "second", title: "second", source: "global"},
        {title: "missing id"},
    ], 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].rootId, ROOT);
    assert.deepEqual(result[0].blockIds, [ROOT]);
});

test("agent item block ids are normalized to strings", () => {
    const result = limitAgentItems([{id: "one", title: "one", blockIds: [ROOT, 12345]}], 2);
    assert.deepEqual(result[0].blockIds, [ROOT]);
});

test("agent navigation result keeps separate sources and active state", () => {
    const result = buildAgentNavigationResult({
        activeId: ROOT,
        mobile: true,
        tabs: [{rootId: ROOT, title: "当前"}],
        recent: [{rootId: ROOT, title: "最近"}],
        favorites: [{rootId: ROOT, title: "收藏", group: "工作"}],
        limit: 8,
    });
    assert.equal(result.activeId, ROOT);
    assert.equal(result.mobile, true);
    assert.equal(result.tabs[0].title, "当前");
    assert.equal(result.favorites[0].group, "工作");
});

test("agent search result reports truncation without leaking unbounded data", () => {
    const items = Array.from({length: 40}, (_, index) => ({id: `id-${index}`, title: `文档 ${index}`}));
    const result = buildAgentSearchResult("  query ", items, {source: "global", limit: 3});
    assert.equal(result.query, "query");
    assert.equal(result.count, 3);
    assert.equal(result.items.length, 3);
    assert.equal(result.truncated, true);
    assert.equal(result.source, "global");
});

test("agent text boundaries preserve complete Unicode code points", () => {
    const title = "😀".repeat(300);
    const result = limitAgentItems([{id: "emoji", title}], 1);
    assert.equal(Array.from(result[0].title).length, 256);
    assert.equal(result[0].title.endsWith("😀"), true);
    const combining = limitAgentItems([{id: "combining", title: "e\u0301".repeat(300)}], 1)[0].title;
    assert.equal(Array.from(combining).length <= 256, true);
    assert.equal(combining.endsWith("e\u0301"), true);
});

test("agent search result preserves upstream truncation metadata", () => {
    const result = buildAgentSearchResult("query", [{id: "one", title: "one"}], {
        source: "global",
        limit: 12,
        truncated: true,
    });
    assert.equal(result.truncated, true);
});

test("agent capability registration is read-only and tolerates old hosts", () => {
    assert.deepEqual(registerReadOnlyAgentCapabilities({}, []), []);
    const calls = [];
    const errors = [];
    const host = {
        addAgentCapability(options) {
            calls.push(options);
            if (options.name === "navigation-state") throw new Error("partial host");
            return `registered:${options.name}`;
        },
    };
    const handler = async () => ({structuredContent: {}});
    const registered = registerReadOnlyAgentCapabilities(host, [
        {spec: AGENT_CAPABILITY_SPECS.navigation, handler},
        {spec: AGENT_CAPABILITY_SPECS.search, handler},
    ], (error, spec) => errors.push([error.message, spec.name]));
    assert.deepEqual(registered, ["registered:search-documents"]);
    assert.deepEqual(errors, [["partial host", "navigation-state"]]);
    assert.deepEqual(calls[1].effects, READ_ONLY_EFFECTS);
    assert.equal(calls[1].handler, handler);
});
