const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const Ajv = require("ajv");
const {
    AGENT_CAPABILITY_SPECS,
    AGENT_ITEM_SCHEMA,
    READ_ONLY_EFFECTS,
    normalizeAgentQuery,
    normalizeAgentNotebook,
    normalizeAgentSearchPaths,
    normalizeAgentLimit,
    normalizeAgentSearchOffset,
    normalizeAgentSearchMethod,
    normalizeAgentSearchOrder,
    normalizeAgentSearchType,
    normalizeAgentSearchSubType,
    normalizeAgentRootId,
    limitAgentItems,
    buildAgentNavigationResult,
    buildAgentWorkspaceContext,
    buildAgentSearchResult,
    normalizeAgentFailureReason,
    buildAgentHomeDiagnostics,
    buildAgentWidgetCatalog,
    normalizeAgentWidgetConfigFields,
    normalizeAgentWidgetConfig,
    buildAgentWidgetSnapshot,
    registerReadOnlyAgentCapabilities,
    normalizeAgentDocumentId,
    normalizeAgentDocumentIds,
    buildNotebookBoxScope,
    flipTaskMarkdown,
    sanitizeJournalAppend,
    registerAgentActionCapability,
} = require("../src/agent-capabilities.js");

test("agent failure reasons normalize abort, timeout, and opaque errors", () => {
    assert.equal(normalizeAgentFailureReason({name: "AbortError"}), "cancelled");
    assert.equal(normalizeAgentFailureReason({code: "ABORT_ERR"}), "cancelled");
    assert.equal(normalizeAgentFailureReason({name: "TimeoutError"}), "timeout");
    assert.equal(normalizeAgentFailureReason(new Error("request timed out")), "timeout");
    assert.equal(normalizeAgentFailureReason(new Error("network exploded")), "failed");
    assert.equal(normalizeAgentFailureReason(null), "failed");
    assert.equal(normalizeAgentFailureReason({name: "AbortError"}, true), "timeout");
});

test("agent home diagnostics normalize trusted fields and reject malformed entries", () => {
    const now = 1_000_000;
    const result = buildAgentHomeDiagnostics([
        {type: "cache", moduleId: "recent-documents", device: "desktop", at: now - 1000},
        {type: "future-code", moduleId: "today-tasks", device: "mobile", at: now - 500.1},
        {type: "timeout", moduleId: "today-journal", device: "sidebar", at: now - 200},
        {type: "empty", moduleId: "old-widget", device: "desktop", at: now - 61000},
        {type: "failed", moduleId: "bad module", device: "desktop", at: now - 100},
        {type: "timeout", moduleId: "today-journal", device: "unknown", at: now - 100},
        {type: "timeout", moduleId: "today-journal", device: "sidebar", at: 0},
    ], 2, 1, now);
    assert.deepEqual(result.diagnostics, [
        {type: "failed", moduleId: "today-tasks", device: "mobile", at: now - 501},
        {type: "timeout", moduleId: "today-journal", device: "sidebar", at: now - 200},
    ]);
    assert.equal(result.summary.total, 3);
    assert.equal(result.summary.windowMinutes, 1);
    assert.equal(result.summary.byType.cache, 1);
    assert.equal(result.summary.byType.failed, 1);
    assert.equal(result.summary.byType.timeout, 1);
    assert.deepEqual(result.summary.byDevice, {desktop: 1, sidebar: 1, mobile: 1});
    assert.equal(result.summary.cacheHits, 1);
    assert.equal(result.summary.completed, 1);
    assert.equal(result.summary.failures, 2);
    assert.deepEqual(buildAgentHomeDiagnostics(null, 16, 60, now).diagnostics, []);
});

test("agent widget catalog filters device and read-only metadata within schema limits", () => {
    const widgets = buildAgentWidgetCatalog([
        {moduleId: "desktop-only", title: "Desktop", supportedDevices: ["desktop"], readOnly: true, sizes: ["small"]},
        {moduleId: "mobile-read", title: "Mobile", category: "plugin", supportedDevices: ["mobile", "unknown"], readOnly: true, sizes: ["small", "x".repeat(40)], configSchema: [
            {key: "limit", label: "Limit", type: "number", min: 1, max: 20, defaults: 10},
            {key: "notebook", label: "Notebook", type: "notebook"},
        ]},
        {moduleId: "mobile-write", title: "Write", supportedDevices: ["mobile"], readOnly: false},
        {moduleId: "bad module", title: "Bad", supportedDevices: ["mobile"], readOnly: true},
    ], {device: "mobile", readOnly: true, limit: 99});
    assert.deepEqual(widgets, {
        widgets: [{
            moduleId: "mobile-read",
            title: "Mobile",
            description: "",
            sizes: ["small", "x".repeat(32)],
            supportedDevices: ["mobile"],
            readOnly: true,
            source: "external",
            configFields: [
                {key: "limit", label: "Limit", type: "number", min: 1, max: 20, defaultValue: 10},
                {key: "notebook", label: "Notebook", type: "notebook"},
            ],
        }],
        total: 1,
        offset: 0,
        truncated: false,
    });
    const many = buildAgentWidgetCatalog(Array.from({length: 40}, (_, index) => ({
        moduleId: `widget-${index}`,
        supportedDevices: ["desktop"],
    })), {device: "desktop", limit: 24, offset: 8});
    assert.equal(many.widgets.length, 24);
    assert.equal(many.total, 40);
    assert.equal(many.offset, 8);
    assert.equal(many.truncated, true);
});

test("agent widget catalog filters source and keeps the first normalized module id", () => {
    const widgets = buildAgentWidgetCatalog([
        {moduleId: "same", title: "First", category: "siyuan", supportedDevices: ["desktop"]},
        {moduleId: "same", title: "Duplicate", category: "plugin", supportedDevices: ["desktop"]},
        {moduleId: "external-one", title: "External", category: "plugin", supportedDevices: ["desktop"]},
        {moduleId: "builtin-one", title: "Builtin", category: "siyuan", supportedDevices: ["desktop"]},
    ], {device: "desktop", source: "external"});
    assert.deepEqual(widgets.widgets.map((item) => item.moduleId), ["external-one"]);
    assert.equal(widgets.total, 1);
    assert.equal(widgets.truncated, false);

    const all = buildAgentWidgetCatalog([
        {moduleId: "same", title: "First", category: "siyuan", supportedDevices: ["desktop"]},
        {moduleId: "same", title: "Duplicate", category: "plugin", supportedDevices: ["desktop"]},
    ], {device: "desktop"});
    assert.equal(all.widgets.length, 1);
    assert.equal(all.widgets[0].title, "First");

    const beyond = buildAgentWidgetCatalog([
        {moduleId: "only", supportedDevices: ["desktop"]},
    ], {device: "desktop", offset: 64});
    assert.deepEqual(beyond, {widgets: [], total: 1, offset: 1, truncated: false});
});

test("agent widget catalog can expose bounded configured state for discovery", () => {
    const widgets = buildAgentWidgetCatalog([
        {moduleId: "one", title: "One", supportedDevices: ["desktop"], sizes: ["small", "medium"]},
        {moduleId: "two", title: "Two", supportedDevices: ["desktop"]},
    ], {
        device: "desktop",
        includeState: true,
        configuredModuleIds: ["one"],
        configuredState: {one: {enabled: true, size: "medium"}},
    });
    assert.deepEqual(widgets.widgets.map(({moduleId, configured, enabled, size}) => ({moduleId, configured, enabled, size})), [
        {moduleId: "one", configured: true, enabled: true, size: "medium"},
        {moduleId: "two", configured: false, enabled: false, size: undefined},
    ]);
});

test("agent widget config metadata and values stay schema-bound", () => {
    const schema = [
        {key: "limit", label: "Limit", type: "number", min: 1, max: 20, defaults: 10},
        {key: "mode", label: "Mode", type: "select", options: ["one", "two", "one"], defaults: "two"},
        {key: "notebook", label: "Notebook", type: "notebook"},
        {key: "query", label: "Query", type: "text", defaults: ""},
        {key: "when", label: "When", type: "date", defaults: "2028-02-29"},
        {key: "document", label: "Document", type: "document", defaults: "20260913083000-abcdefg"},
        {key: "bad key", label: "Bad", type: "text"},
    ];
    assert.deepEqual(normalizeAgentWidgetConfigFields(schema), [
        {key: "limit", label: "Limit", type: "number", min: 1, max: 20, defaultValue: 10},
        {key: "mode", label: "Mode", type: "select", options: ["one", "two"], defaultValue: "two"},
        {key: "notebook", label: "Notebook", type: "notebook"},
        {key: "query", label: "Query", type: "text", defaultValue: ""},
        {key: "when", label: "When", type: "date", defaultValue: "2028-02-29"},
        {key: "document", label: "Document", type: "document", defaultValue: "20260913083000-abcdefg"},
    ]);
    assert.deepEqual(normalizeAgentWidgetConfig({
        limit: 99,
        mode: "two",
        notebook: "20260912083000-abcdefg",
        query: "  hello\nworld  ",
        when: "2024-02-29",
        document: "20260914083000-hijklmn",
        unknown: "drop",
    }, schema), {
        limit: 20,
        mode: "two",
        notebook: "20260912083000-abcdefg",
        query: "hello world",
        when: "2024-02-29",
        document: "20260914083000-hijklmn",
    });
    assert.deepEqual(normalizeAgentWidgetConfig({mode: "bad", notebook: "bad", when: "2023-02-29", document: "bad"}, schema), {});

    const advancedSchema = [
        {key: "notes", label: "Notes", type: "textarea", defaults: "line one"},
        {key: "database", label: "Database", type: "database", defaults: "20260915083000-abcdefg"},
        {key: "columns", label: "Columns", type: "database-columns", defaults: "title,status,title"},
        {key: "group", label: "Group", type: "favorite-group", defaults: "工作"},
        {key: "token", label: "Token", type: "secret", defaults: "must-not-leak"},
    ];
    assert.deepEqual(normalizeAgentWidgetConfigFields(advancedSchema), [
        {key: "notes", label: "Notes", type: "textarea", defaultValue: "line one"},
        {key: "database", label: "Database", type: "database", defaultValue: "20260915083000-abcdefg"},
        {key: "columns", label: "Columns", type: "database-columns", defaultValue: "title,status"},
        {key: "group", label: "Group", type: "favorite-group", defaultValue: "工作"},
    ]);
    assert.deepEqual(normalizeAgentWidgetConfig({
        notes: "  first\nsecond  ",
        database: "20260916083000-hijklmn",
        columns: "title, status, title, bad value",
        group: "  项目组  ",
        token: "must-not-leak",
    }, advancedSchema), {
        notes: "first second",
        database: "20260916083000-hijklmn",
        columns: "title,status,badvalue",
        group: "项目组",
    });
});

test("agent widget snapshot preserves bounded stats, item state, and cache metadata", () => {
    assert.deepEqual(buildAgentWidgetSnapshot("today-tasks", "Today", {
        ok: true,
        cached: true,
        snapshot: {
            updatedAt: 1234.9,
            stat: {value: "3", label: "Tasks", progress: 150, arc: {value: 9, max: 7}},
            items: [
                {label: "One", value: "id", secondary: "十一月十三", count: 10001, done: false, secret: "drop"},
                {label: "", value: "drop"},
            ],
        },
    }, {device: "mobile", limit: 12, config: {limit: 20, extra: true, "bad key": "drop"}}), {
        moduleId: "today-tasks",
        title: "Today",
        status: "ok",
        retryable: false,
        device: "mobile",
        cached: true,
        updatedAt: 1234,
        items: [{label: "One", value: "id", secondary: "十一月十三", count: 9999, done: false}],
        total: 1,
        offset: 0,
        truncated: false,
        appliedConfig: {limit: 20, extra: true},
            stat: {value: "3", label: "Tasks", progress: 100, arc: {value: 7, max: 7}},
    });
    assert.deepEqual(buildAgentWidgetSnapshot("x", "", {ok: false, reason: "timeout"}), {
        moduleId: "x", title: "", status: "timeout", retryable: true, device: "desktop", cached: false, updatedAt: 0,
        items: [], total: 0, offset: 0, truncated: false, appliedConfig: {},
    });
    assert.equal(buildAgentWidgetSnapshot("x", "", {ok: false, reason: "unregistered"}).retryable, false);
    const paged = buildAgentWidgetSnapshot("x", "X", {ok: true, snapshot: {items: [
        {label: "one"}, {label: "two"}, {label: "three"},
    ]}}, {limit: 1, offset: 1, device: "sidebar"});
    assert.deepEqual(paged.items, [{label: "two", value: ""}]);
    assert.deepEqual({device: paged.device, total: paged.total, offset: paged.offset, truncated: paged.truncated},
        {device: "sidebar", total: 3, offset: 1, truncated: true});
});

test("agent widget refresh explicitly bypasses the short runtime cache", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(source, /cacheTtlMs: 1500, force: args\?\.refresh === true/);
    assert.match(source, /offset: args\?\.offset, config/);
    assert.doesNotMatch(source, /return \{error: "unknown module"\}/);
    assert.match(source, /reason: "unregistered"/);
});

test("notebook SQL scope accepts only a normalized SiYuan id", () => {
    assert.equal(buildNotebookBoxScope("20260912083000-abcdefg"), " AND box='20260912083000-abcdefg'");
    assert.equal(buildNotebookBoxScope("20260912083000-abcdefg", "b"), " AND b.box='20260912083000-abcdefg'");
    assert.equal(buildNotebookBoxScope("20260912083000-abcdefg", "B"), " AND B.box='20260912083000-abcdefg'");
    assert.equal(buildNotebookBoxScope("20260912083000-abcdefg", "x;drop"), " AND box='20260912083000-abcdefg'");
    assert.equal(buildNotebookBoxScope("bad' OR 1=1 --"), "");
    assert.equal(buildNotebookBoxScope(null), "");
});

const ROOT = "20260906120000-aaaaaaa";

test("agent capability specs are read-only and bounded", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.name, "navigation-state");
    assert.equal(AGENT_CAPABILITY_SPECS.search.name, "search-documents");
    assert.equal(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.limit.maximum, 32);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.method.enum, ["keyword", "query", "regexp"]);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.orderBy.enum,
        ["relevanceDesc", "updatedDesc", "createdDesc", "content"]);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.type.enum,
        ["document", "heading", "paragraph", "codeBlock"]);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.subType.enum,
        ["h1", "h2", "h3", "h4", "h5", "h6", "o", "u", "t"]);
    assert.match(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.notebook.pattern, /A-Za-z0-9/);
    assert.equal(AGENT_CAPABILITY_SPECS.search.inputSchema.properties.paths.maxItems, 8);
    assert.equal(AGENT_CAPABILITY_SPECS.search.outputSchema.properties.items.items.type, "object");
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.properties.tabs.type, "array");
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.properties.tabs.maxItems, 32);
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.properties.closed.type, "array");
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.properties.closed.maxItems, 32);
    assert.equal(AGENT_CAPABILITY_SPECS.navigation.outputSchema.additionalProperties, false);
    assert.equal(AGENT_CAPABILITY_SPECS.search.outputSchema.properties.count.maximum, 32);
    assert.equal(AGENT_ITEM_SCHEMA.additionalProperties, false);
    assert.equal(AGENT_ITEM_SCHEMA.properties.snippets.maxItems, 2);
});

test("agent capability outputs satisfy their declared JSON schemas", () => {
    const ajv = new Ajv({strict: true});
    const validateNavigation = ajv.compile(AGENT_CAPABILITY_SPECS.navigation.outputSchema);
    const validateSearch = ajv.compile(AGENT_CAPABILITY_SPECS.search.outputSchema);
    const validateWidgets = ajv.compile(AGENT_CAPABILITY_SPECS.homeWidgets.outputSchema);
    const validateDiagnostics = ajv.compile(AGENT_CAPABILITY_SPECS.homeDiagnostics.outputSchema);
    const navigation = buildAgentNavigationResult({
        activeId: ROOT,
        mobile: false,
        tabs: [{id: "tab-a", rootId: ROOT, title: "当前", source: "tabs", active: true}],
        recent: [],
        closed: [{rootId: "20260911083000-abcdeg", title: "已关闭", source: "closed", ts: Date.now()}],
        favorites: [],
    });
    const search = buildAgentSearchResult("query", [
        {id: ROOT, rootId: ROOT, title: "文档", source: "global", snippets: ["片段"]},
    ], {source: "global"});
    assert.equal(validateNavigation(navigation), true, JSON.stringify(validateNavigation.errors));
        assert.equal(navigation.closed[0].source, "closed");
    assert.equal(validateSearch(search), true, JSON.stringify(validateSearch.errors));
    assert.equal(validateWidgets({
        moduleId: "today-tasks",
        title: "今日待办",
        status: "ok",
        retryable: false,
        device: "desktop",
        cached: false,
        updatedAt: 0,
        items: [{label: "任务", value: "1"}],
        total: 1,
        offset: 0,
        truncated: false,
        appliedConfig: {},
    }), true, JSON.stringify(validateWidgets.errors));
    assert.equal(validateDiagnostics(buildAgentHomeDiagnostics([
        {type: "timeout", moduleId: "today-tasks", device: "sidebar", at: Date.now()},
    ])), true, JSON.stringify(validateDiagnostics.errors));
    assert.equal(validateWidgets({
        widgets: [{
            moduleId: "today-tasks",
            title: "今日待办",
            description: "今天需要完成的任务",
            sizes: ["small", "medium"],
            supportedDevices: ["desktop", "sidebar", "mobile"],
            readOnly: true,
            source: "builtin",
            configFields: [],
        }],
        total: 1,
        offset: 0,
        truncated: false,
    }), true, JSON.stringify(validateWidgets.errors));
    assert.equal(validateNavigation({...navigation, unexpected: true}), false);
    assert.equal(validateSearch({...search, items: [{rootId: "invalid"}]}), false);
    assert.equal(validateWidgets({moduleId: "today-tasks", widgets: []}), false);
});

test("agent input normalization rejects unsafe notebook and ids", () => {
    assert.equal(normalizeAgentQuery("  alpha\n beta  "), "alpha beta");
    assert.equal(normalizeAgentNotebook("box_1"), "box_1");
    assert.equal(normalizeAgentNotebook("box/../../other"), "");
    assert.deepEqual(normalizeAgentSearchPaths(["box-a/projects", "box-a\\other", "/box-b/资料/"]), ["box-a/projects", "box-a/other", "box-b/资料"]);
    assert.deepEqual(normalizeAgentSearchPaths(["box-a/../secret", "bad box/path", "box-a/a;drop"]), []);
    assert.equal(normalizeAgentRootId(ROOT), ROOT);
    assert.equal(normalizeAgentRootId("not-a-block"), "");
    assert.equal(normalizeAgentLimit("999"), 32);
    assert.equal(normalizeAgentLimit("bad", 7), 7);
    assert.equal(normalizeAgentSearchMethod("regexp"), "regexp");
    assert.equal(normalizeAgentSearchMethod("sql"), "");
    assert.equal(normalizeAgentSearchOrder("updatedDesc"), "updatedDesc");
    assert.equal(normalizeAgentSearchType("heading"), "heading");
    assert.equal(normalizeAgentSearchType("databaseBlock"), "");
    assert.equal(normalizeAgentSearchSubType("h2"), "h2");
    assert.equal(normalizeAgentSearchSubType("database"), "");
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
        closed: [{rootId: "20260911083000-abcdeg", title: "已关闭", source: "closed"}],
        favorites: [{rootId: ROOT, title: "收藏", group: "工作"}],
        limit: 8,
    });
    assert.equal(result.activeId, ROOT);
    assert.equal(result.mobile, true);
    assert.equal(result.tabs[0].title, "当前");
    assert.equal(result.closed[0].title, "已关闭");
    assert.equal(result.favorites[0].group, "工作");
});

test("agent navigation and workspace snapshots prefer reopened tabs over stale closed records", () => {
    const navigation = buildAgentNavigationResult({
        tabs: [{rootId: ROOT, title: "重新打开"}],
        closed: [{rootId: ROOT, title: "旧关闭记录"}, {rootId: "20260911083000-abcdeg", title: "仍关闭"}],
        limit: 8,
    });
    assert.deepEqual(navigation.closed.map((item) => item.rootId), ["20260911083000-abcdeg"]);
    const context = buildAgentWorkspaceContext({
        openTabs: [{rootId: ROOT, title: "重新打开"}],
        closedTabs: [{rootId: ROOT, title: "旧关闭记录"}],
    });
    assert.deepEqual(context.closedTabs, []);
});

test("agent search result reports truncation without leaking unbounded data", () => {
    const items = Array.from({length: 40}, (_, index) => ({id: `id-${index}`, title: `文档 ${index}`}));
    const result = buildAgentSearchResult("  query ", items, {source: "global", limit: 3});
    assert.equal(result.query, "query");
    assert.equal(result.count, 3);
    assert.equal(result.items.length, 3);
    assert.equal(result.truncated, true);
    assert.equal(result.source, "global");
    assert.equal(result.total, 32);
    assert.equal(result.offset, 0);
});

test("agent search result supports bounded offsets", () => {
    const items = Array.from({length: 10}, (_, index) => ({id: `offset-${index}`, title: `doc ${index}`}));
    const result = buildAgentSearchResult("query", items, {source: "global", limit: 3, offset: 4});
    assert.equal(result.total, 10);
    assert.equal(result.offset, 4);
    assert.deepEqual(result.items.map((item) => item.id), ["offset-4", "offset-5", "offset-6"]);
    assert.equal(result.truncated, true);
    const beyond = buildAgentSearchResult("query", items, {limit: 3, offset: 999});
    assert.equal(beyond.offset, 10);
    assert.deepEqual(beyond.items, []);
    assert.equal(normalizeAgentSearchOffset("-4", 10), 0);
    assert.equal(normalizeAgentSearchOffset("999", 10), 10);
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


test("agent capability specs include widget snapshot and controlled open", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.homeWidgets.name, "home-widget-snapshot");
    assert.equal(AGENT_CAPABILITY_SPECS.homeWidgets.inputSchema.required, undefined);
    assert.match(AGENT_CAPABILITY_SPECS.homeWidgets.description, /省略 moduleId/);
    assert.equal(AGENT_CAPABILITY_SPECS.homeWidgets.inputSchema.properties.config.maxProperties, 16);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.homeWidgets.inputSchema.properties.source.enum, ["builtin", "external"]);
    assert.equal(AGENT_CAPABILITY_SPECS.homeWidgets.inputSchema.properties.refresh.type, "boolean");
    assert.equal(AGENT_CAPABILITY_SPECS.homeWidgets.outputSchema.anyOf.length, 2);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.homeWidgets.outputSchema.anyOf[0].properties.stat.properties.arc.required, ["value", "max"]);
    assert.equal(AGENT_CAPABILITY_SPECS.openDocument.name, "open-document");
    assert.deepEqual(AGENT_CAPABILITY_SPECS.openDocument.inputSchema.required, ["id"]);
    assert.equal(AGENT_CAPABILITY_SPECS.homeDiagnostics.name, "home-adapter-diagnostics");
    assert.equal(AGENT_CAPABILITY_SPECS.homeDiagnostics.outputSchema.properties.diagnostics.maxItems, 32);
    assert.equal(AGENT_CAPABILITY_SPECS.homeDiagnostics.outputSchema.properties.summary.properties.cacheHits.maximum, 32);
});

test("workspace-context spec and builder keep bounded read-only snapshot", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.workspaceContext.name, "workspace-context");
    assert.match(AGENT_CAPABILITY_SPECS.workspaceContext.description, /只读/);
    const host = {registered: [], addAgentCapability: (options) => { host.registered.push(options); return "id"; }};
    registerReadOnlyAgentCapabilities(host, [{
        spec: AGENT_CAPABILITY_SPECS.workspaceContext,
        handler: async () => ({ok: true}),
    }]);
    assert.equal(host.registered.length, 1);
    assert.deepEqual(host.registered[0].effects, READ_ONLY_EFFECTS);
    const context = buildAgentWorkspaceContext({
        device: "mobile",
        activeDocument: {id: "20260911083000-abcdef", title: " 读书笔记 "},
        openTabs: [{id: "20260911083000-abcdef", title: "读书笔记", source: "tabs"}],
        closedTabs: [{id: "20260911083000-abcdeg", rootId: "20260911083000-abcdeg", title: "旧笔记", source: "closed"}],
        documentSets: [{name: "工作", count: 3}, {name: "", count: 9}, {count: 2}],
        quickActions: [{label: "搜索", kind: "builtin"}, {kind: "dock"}],
        todayJournal: {configured: true, docId: "20260911083000-abcdeg", status: "found"},
        bogus: "dropped",
    });
    assert.deepEqual(context, {
        device: "mobile",
        generatedAt: 0,
        syncing: false,
        activeDocument: {id: "20260911083000-abcdef", title: "读书笔记"},
        openTabs: [{id: "20260911083000-abcdef", title: "读书笔记", source: "tabs"}],
        closedTabs: [{id: "20260911083000-abcdeg", rootId: "20260911083000-abcdeg", title: "旧笔记", source: "closed"}],
        documentSets: [{name: "工作", count: 3}],
        quickActions: [{label: "搜索", kind: "builtin"}],
        todayJournal: {configured: true, docId: "20260911083000-abcdeg", status: "found"},
        storageHealth: {available: false},
    });
    const empty = buildAgentWorkspaceContext(null);
    assert.equal(empty.device, "desktop");
    assert.equal(empty.generatedAt, 0);
    assert.equal(empty.syncing, false);
    assert.deepEqual(empty.activeDocument, {id: "", title: ""});
    assert.deepEqual(empty.openTabs, []);
    assert.deepEqual(empty.closedTabs, []);
    assert.deepEqual(empty.todayJournal, {configured: false, docId: "", status: "unconfigured"});
});
test("every agent capability spec is registered in the plugin entry", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    const missing = Object.keys(AGENT_CAPABILITY_SPECS)
        .filter((key) => !source.includes(`AGENT_CAPABILITY_SPECS.${key}`));
    assert.deepEqual(missing, [], "unregistered capability specs: " + missing.join(", "));
});

test("agent capability contract matrix partitions read and action effects", () => {
    const readOnly = ["outline", "navigation", "search", "homeWidgets", "workspaceContext", "homeDiagnostics"];
    const actions = {
        openDocument: {},
        openDocuments: {...READ_ONLY_EFFECTS},
        updateTask: {...READ_ONLY_EFFECTS, localWrite: true},
        createDocument: {...READ_ONLY_EFFECTS, localWrite: true},
        appendToJournal: {...READ_ONLY_EFFECTS, localWrite: true},
    };
    assert.deepEqual(new Set([...readOnly, ...Object.keys(actions)]), new Set(Object.keys(AGENT_CAPABILITY_SPECS)));
    assert.equal(new Set(Object.values(AGENT_CAPABILITY_SPECS).map((spec) => spec.name)).size, 11);

    const host = {registered: [], addAgentCapability(options) { this.registered.push(options); return options.name; }};
    registerReadOnlyAgentCapabilities(host, readOnly.map((key) => ({
        spec: AGENT_CAPABILITY_SPECS[key],
        handler: async () => ({}),
    })));
    Object.entries(actions).forEach(([key, effects]) => registerAgentActionCapability(host, {
        spec: AGENT_CAPABILITY_SPECS[key],
        effects,
        handler: async () => ({}),
    }));
    assert.equal(host.registered.length, 11);
    host.registered.forEach((entry) => {
        const key = Object.keys(AGENT_CAPABILITY_SPECS).find((candidate) => AGENT_CAPABILITY_SPECS[candidate].name === entry.name);
        assert.deepEqual(entry.effects, readOnly.includes(key) ? READ_ONLY_EFFECTS : actions[key], entry.name);
        assert.equal(typeof entry.handler, "function", entry.name);
    });
});

test("agent capability schemas keep collection and text outputs bounded", () => {
    const visit = (schema, path, seen = new Set()) => {
        if (!schema || typeof schema !== "object" || seen.has(schema)) return;
        seen.add(schema);
        if (schema.type === "array") assert.equal(Number.isInteger(schema.maxItems), true, `${path} array is unbounded`);
        if (schema.type === "string" && !Array.isArray(schema.enum)) {
            assert.equal(Number.isInteger(schema.maxLength), true, `${path} string is unbounded`);
        }
        Object.entries(schema.properties || {}).forEach(([key, value]) => visit(value, `${path}.${key}`, seen));
        if (schema.items) visit(schema.items, `${path}[]`, seen);
        (schema.anyOf || []).forEach((value, index) => {
            // anyOf branches used only to select required identity fields reuse
            // the bounded property declaration from their parent object.
            if (!value.type && value.required) return;
            visit(value, `${path}.anyOf[${index}]`, seen);
        });
    };
    Object.entries(AGENT_CAPABILITY_SPECS).forEach(([key, spec]) => {
        assert.equal(spec.inputSchema.additionalProperties, false, `${key} input accepts unknown fields`);
        visit(spec.inputSchema, `${key}.input`);
        visit(spec.outputSchema, `${key}.output`);
    });
});
test("open-documents spec bounds batch to five and ids normalize bounded", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.openDocuments.name, "open-documents");
    const items = AGENT_CAPABILITY_SPECS.openDocuments.inputSchema.properties.ids;
    assert.equal(items.maxItems, 5);
    assert.deepEqual(AGENT_CAPABILITY_SPECS.openDocuments.inputSchema.required, ["ids"]);
    assert.equal(normalizeAgentDocumentIds(["20260911083000-abcdef", "  ", "not-an-id", "20260911083000-abcdef", "20260911083000-abcdeg", "20260911083000-abcdeh"]).join(","), "20260911083000-abcdef,20260911083000-abcdeg,20260911083000-abcdeh");
    assert.deepEqual(normalizeAgentDocumentIds("20260911083000-abcdef"), []);
    assert.deepEqual(normalizeAgentDocumentIds(null), []);
});
test("open-document declares honest effects and normalizes ids", () => {
    assert.equal(normalizeAgentDocumentId("20260911083000-abcdef"), "20260911083000-abcdef");
    assert.equal(normalizeAgentDocumentId(" javascript:alert(1)"), "");
    assert.equal(normalizeAgentDocumentId("../../etc"), "");
    const host = {registered: [], addAgentCapability: (options) => { host.registered.push(options); return "id"; }};
    registerAgentActionCapability(host, {
        spec: AGENT_CAPABILITY_SPECS.openDocument,
        effects: {},
        handler: async () => ({ok: true}),
    });
    assert.equal(host.registered.length, 1);
    // 动作能力不得沿用只读 effects 声明
    assert.deepEqual(host.registered[0].effects, {});
    // 非法宿主/缺 handler 时安静跳过
    assert.equal(registerAgentActionCapability(null, {spec: {}}), null);
    assert.equal(registerAgentActionCapability(host, {spec: {}}), null);
});


test("controlled write: flipTaskMarkdown toggles checkbox marks only", () => {
    assert.equal(flipTaskMarkdown("* [ ] 买牛奶", true), "* [x] 买牛奶");
    assert.equal(flipTaskMarkdown("- [x] 买牛奶", false), "- [ ] 买牛奶");
    assert.equal(flipTaskMarkdown("1. [ ] 有序任务", true), "1. [x] 有序任务");
    assert.ok(flipTaskMarkdown("  > * [ ] 引用任务", true).includes("> * [x]"));
    // 大写 X 也可识别为已完成
    assert.equal(flipTaskMarkdown("- [X] 已完成", false), "- [ ] 已完成");
});

test("controlled write: non-task blocks and no-op flips are rejected", () => {
    assert.equal(flipTaskMarkdown("普通段落文本", true), "");
    assert.equal(flipTaskMarkdown("- [x] 已完成", true), "");
    assert.equal(flipTaskMarkdown("- [ ] 未变", false), "");
    assert.equal(flipTaskMarkdown(undefined, true), "");
});

test("update-task spec requires id and done, declares confirmation", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.updateTask.name, "update-task-status");
    assert.deepEqual(AGENT_CAPABILITY_SPECS.updateTask.inputSchema.required, ["id", "done"]);
    assert.match(AGENT_CAPABILITY_SPECS.updateTask.description, /确认/);
});


test("controlled write: sanitizeJournalAppend flattens and bounds content", () => {
    assert.equal(sanitizeJournalAppend("  记一下：\n\t试了新功能  "), "记一下： 试了新功能");
    assert.equal(sanitizeJournalAppend("   "), "");
    assert.equal(sanitizeJournalAppend(undefined), "");
    assert.equal(sanitizeJournalAppend("x".repeat(600)).length, 512);
});

test("append-to-journal spec requires content and declares confirmation", () => {
    assert.equal(AGENT_CAPABILITY_SPECS.appendToJournal.name, "append-to-journal");
    assert.deepEqual(AGENT_CAPABILITY_SPECS.appendToJournal.inputSchema.required, ["content"]);
    assert.match(AGENT_CAPABILITY_SPECS.appendToJournal.description, /确认/);
});
