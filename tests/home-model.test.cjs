const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../src/home-model.js");

test("mobile home size is unified", () => {
    assert.equal(home.resolveMobileHomeSize(["small", "medium"]), "medium");
    assert.equal(home.resolveMobileHomeSize(["large", "full"]), "large");
    assert.equal(home.resolveMobileHomeSize([]), "medium");
});

test("mobile persisted layouts canonicalize to full-width rows", () => {
    assert.deepEqual(home.normalizeMobileLayout({x: 9, w: 2, y: 4}), {x: 0, y: 4, w: 12, h: 1, collapsed: false, size: ""});
    const state = home.normalizeHomeState({instances: [{moduleId: "today-tasks", instanceId: "task"}], layouts: {mobile: [{instanceId: "task", x: 8, w: 2, y: 3}]}});
    assert.deepEqual(state.layouts.mobile[0].x, 0);
    assert.deepEqual(state.layouts.mobile[0].w, 12);
});

test("home model registers bounded default modules", () => {
    const modules = home.registerModules([{moduleId: "recent-documents", title: "override", supportedDevices: ["mobile"]}]);
    assert.equal(modules.length, 58);
    assert.equal(modules.find((item) => item.moduleId === "recent-documents").title, "override");
});

test("home model filters modules by device", () => {
    assert.equal(home.modulesForDevice([{moduleId: "desktop-only", title: "D", supportedDevices: ["desktop"]}], "mobile").some((item) => item.moduleId === "desktop-only"), false);
    assert.equal(home.modulesForDevice([], "mobile").length, 56);
});

test("journal-calendar viewType and monthOffset config", () => {
    const modules = home.registerModules([]);
    const cal = modules.find((item) => item.moduleId === "journal-calendar");
    assert.ok(cal, "journal-calendar registered");
    assert.equal(cal.viewType, "calendar");
    assert.deepEqual(cal.sizes, ["large", "full"]);
    assert.ok(Array.isArray(cal.configSchema) && cal.configSchema.length > 0, "has config");
    assert.deepEqual(cal.configSchema[0], {key: "monthOffset", label: "月份偏移", type: "number", min: -24, max: 24, defaults: 0});
    assert.deepEqual(cal.configSchema.map((field) => field.key), ["monthOffset", "weekStart", "showAdjacent", "showLunar", "showHolidays", "notebook"]);
    assert.deepEqual(cal.configSchema[1], {key: "weekStart", label: "每周起始日", type: "select", options: ["周一", "周日"], defaults: "周一"});
    assert.deepEqual(cal.configSchema[2], {key: "showAdjacent", label: "显示相邻月份日期", type: "select", options: ["是", "否"], defaults: "是"});
});
test("weather module exposes opt-in location config and iPad-friendly sizes", () => {
    const weather = home.registerModules([]).find((item) => item.moduleId === "external-weather-open-meteo");
    assert.ok(weather);
    assert.equal(weather.availability, "external");
    assert.deepEqual(weather.supportedDevices, ["desktop", "sidebar", "mobile"]);
    assert.deepEqual(weather.sizes, ["small", "medium", "wide", "large"]);
    assert.deepEqual(weather.configSchema.map((field) => field.key), ["city", "temperatureUnit", "forecastDays", "showApparent", "showWind"]);
});

test("Bangumi schedule module exposes media presentation and bounded config", () => {
    const bangumi = home.registerModules([]).find((item) => item.moduleId === "external-anime-bangumi");
    assert.ok(bangumi);
    assert.equal(bangumi.availability, "external");
    assert.equal(bangumi.viewType, "media");
    assert.deepEqual(bangumi.supportedDevices, ["desktop", "sidebar", "mobile"]);
    assert.deepEqual(bangumi.sizes, ["medium", "wide", "large", "full"]);
    assert.deepEqual(bangumi.configSchema.map((field) => field.key), ["dayRange", "limit", "showCovers", "showDates", "showScore"]);
});
test("user-endpoint feeds expose bounded opt-in configuration", () => {
    const modules = home.registerModules([]);
    for (const moduleId of ["external-hot-news-dailyhot", "external-news-newsnow"]) {
        const feed = modules.find((item) => item.moduleId === moduleId);
        assert.ok(feed);
        assert.equal(feed.availability, "external");
        assert.equal(feed.readOnly, true);
        assert.deepEqual(feed.supportedDevices, ["desktop", "sidebar", "mobile"]);
        assert.deepEqual(feed.configSchema.map((field) => field.key), ["endpoint", "limit", "showHot", "showTime", "showRank"]);
        assert.deepEqual(feed.sizes, ["medium", "wide", "large", "full"]);
    }
});
test("ActivityWatch module is desktop local-service only", () => {
    const item = home.registerModules([]).find((entry) => entry.moduleId === "external-activitywatch-time");
    assert.ok(item);
    assert.deepEqual(item.supportedDevices, ["desktop", "sidebar"]);
    assert.deepEqual(item.configSchema.map((field) => field.key), ["endpoint", "hours", "limit"]);
    assert.equal(item.configSchema[0].defaults, "http://127.0.0.1:5600");
});
test("home modules expose bounded availability levels", () => {
    const modules = home.registerModules([]);
    assert.equal(modules.find((item) => item.moduleId === "year-progress").availability, "ready");
    assert.equal(modules.find((item) => item.moduleId === "journal-calendar").availability, "conditional");
    assert.equal(modules.find((item) => item.moduleId === "checkin-summary").availability, "external");
    assert.deepEqual(home.AVAILABILITY_LEVELS, ["ready", "conditional", "external"]);
});
test("flashcard-due module exposes bounded notebook and projection controls", () => {
    const modules = home.registerModules([]);
    const flashcard = modules.find((item) => item.moduleId === "flashcard-due");
    assert.ok(flashcard, "flashcard-due module registered");
    assert.equal(flashcard.readOnly, true);
    assert.deepEqual(flashcard.configSchema.map((field) => field.key), ["notebook", "limit", "sortBy", "showNotebook", "showPath", "showRank"]);
    assert.deepEqual(flashcard.configSchema[1], {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 8});
    assert.ok(flashcard.sizes.includes("small") && flashcard.sizes.includes("tall"));
});

test("random-review module clamps stale-days window", () => {
    const modules = home.registerModules([]);
    const random = modules.find((item) => item.moduleId === "random-review");
    assert.ok(random, "random-review module registered");
    assert.equal(random.readOnly, true);
    assert.deepEqual(random.configSchema, [
        {key: "days", label: "多久未看（天）", type: "number", min: 7, max: 3650, defaults: 90},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
        {key: "parentDocument", label: "限定父文档（随机选择其子文档）", type: "document", defaults: ""},
        {key: "limit", label: "每批篇数", type: "number", min: 1, max: 6, defaults: 3},
        {key: "showPath", label: "显示文档路径", type: "select", options: ["是", "否"], defaults: "是"},
    ]);
});

test("home model normalizes layout and rejects invalid instances", () => {
    assert.deepEqual(home.normalizeLayout({x: -1, w: 0, h: 20, collapsed: true}), {x: 0, y: 0, w: 1, h: 12, collapsed: true, size: ""});
    assert.equal(home.normalizeLayout({w: 4, h: 4, size: "medium"}).size, "medium");
    assert.equal(home.normalizeLayout({w: 4, h: 4, size: "bogus"}).size, "");
    assert.deepEqual(home.normalizeInstances([{moduleId: "recent-documents"}, {moduleId: "bad"}, {moduleId: "recent-documents"}]), [{instanceId: "recent-documents", moduleId: "recent-documents", enabled: true, config: {}}]);
});

test("home model migrates the duplicate host recent widget to recent documents", () => {
    assert.deepEqual(home.normalizeInstances([
        {moduleId: "host-recent-docs", instanceId: "legacy-recent", config: {limit: 6}},
    ]), [{instanceId: "legacy-recent", moduleId: "recent-documents", enabled: true, config: {limit: 6}}]);
    assert.equal(home.registerModules([]).some((item) => item.moduleId === "host-recent-docs"), false);
    assert.deepEqual(home.registerModules([]).find((item) => item.moduleId === "recent-documents").configSchema,
        [
            {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 8},
            {key: "showPath", label: "显示文档路径", type: "select", options: ["是", "否"], defaults: "是"},
            {key: "showRank", label: "显示最近序号", type: "select", options: ["否", "是"], defaults: "否"},
        ]);
});

test("home model keeps credential fields secret in UI schemas", () => {
    const modules = home.registerModules([]);
    for (const moduleId of ["external-rss-miniflux", "external-github-contrib"]) {
        const token = modules.find((item) => item.moduleId === moduleId).configSchema.find((field) => field.key === "token");
        assert.equal(token.type, "secret", `${moduleId} token must not use a plain text input`);
    }
});

test("home model bounds third-party config and instance ids", () => {
    const state = home.normalizeInstances([
        {moduleId: "recent-documents", instanceId: "shared", config: {safe: "ok", "bad key": "drop", nested: {deep: {value: "kept"}}}},
        {moduleId: "today-tasks", instanceId: "shared"},
    ]);
    assert.equal(state.length, 1);
    assert.deepEqual(state[0].config, {safe: "ok", nested: {deep: {value: "kept"}}});
});

test("home model migrates legacy widgets and emits schema version", () => {
    const state = home.migrateHomeState({widgets: [{moduleId: "today-tasks"}], layout: [{instanceId: "today-tasks", x: 2}]});
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.instances[0].moduleId, "today-tasks");
    assert.equal(state.layouts.desktop[0].x, 2);
    assert.deepEqual(state.layouts.mobile, []);
});

test("home model migration keeps device layouts isolated and bounded", () => {
    const state = home.migrateHomeState({widgets: [{moduleId: "today-tasks", instanceId: "task"}], layouts: {
        desktop: [{instanceId: "task", x: 1}], sidebar: [{instanceId: "task", x: 2}], mobile: [{instanceId: "other", x: 3}],
    }});
    assert.deepEqual(state.layouts.desktop.map((item) => item.x), [1]);
    assert.deepEqual(state.layouts.sidebar.map((item) => item.x), [2]);
    assert.deepEqual(state.layouts.mobile, []);
});

test("home model keeps module order deterministic and unknown modules isolated", () => {
    const modules = home.registerModules([
        {moduleId: "custom-b", title: "B", supportedDevices: ["desktop"]},
        {moduleId: "custom-a", title: "A", supportedDevices: ["desktop"]},
        {moduleId: "custom-b", title: "B2", supportedDevices: ["mobile"]},
    ]);
    assert.equal(modules.find((item) => item.moduleId === "custom-b").title, "B2");
    assert.deepEqual(home.modulesForDevice(modules, "mobile").map((item) => item.moduleId).filter((id) => id.startsWith("custom")), ["custom-b"]);
    assert.deepEqual(home.normalizeInstances([{moduleId: "unknown", instanceId: "u"}]), []);
});

test("home model clamps layout dimensions and preserves collapse state", () => {
    const layout = home.normalizeLayout({x: 999, y: 9999, w: 999, h: -2, collapsed: true});
    assert.deepEqual(layout, {x: 99, y: 999, w: 12, h: 1, collapsed: true, size: ""});
});

test("home model migration is stable across repeated persistence cycles", () => {
    const legacy = {widgets: [{moduleId: "today-journal", instanceId: "journal"}], layout: [{instanceId: "journal", x: 4, y: 2, w: 3, h: 2, collapsed: true}, {instanceId: "ghost", x: 1}]};
    const first = home.migrateHomeState(legacy);
    const second = home.migrateHomeState(first);
    assert.deepEqual(second, first);
    assert.equal(second.layouts.desktop.length, 1);
    assert.equal(second.layouts.desktop[0].collapsed, true);
});

test("home model bounds large persisted layouts for rendering", () => {
    const instances = Array.from({length: 80}, (_, index) => ({moduleId: "today-tasks", instanceId: `task-${index}`}));
    const layouts = Array.from({length: 100}, (_, index) => ({instanceId: `task-${index}`, x: index, y: index, w: 2, h: 2}));
    const state = home.normalizeHomeState({instances, layouts: {desktop: layouts}});
    assert.equal(state.instances.length, 1);
    assert.equal(state.layouts.desktop.length, 1);
    assert.equal(state.layouts.desktop.every((entry) => entry.x <= 99 && entry.y <= 999), true);
});

test("home model mobile layouts stay single-column and touch-safe", () => {
    const model = home.resolveLayoutConflicts({mobile: [
        {instanceId: "a", x: 8, y: 0, w: 12, h: 1},
        {instanceId: "b", x: 99, y: 1, w: 12, h: 12},
    ]}, [{instanceId: "a"}, {instanceId: "b"}]);
    assert.equal(model.mobile.every((entry) => entry.x >= 0 && entry.x <= 99), true);
    assert.equal(model.mobile.every((entry) => entry.w >= 1 && entry.w <= 12), true);
    assert.equal(model.mobile.every((entry) => entry.y >= 0), true);
});

test("home model restores mobile collapse state without persisting scroll offsets", () => {
    const state = home.normalizeHomeState({instances: [{moduleId: "today-tasks", instanceId: "tasks"}], layouts: {
        mobile: [{instanceId: "tasks", collapsed: true, scrollTop: 9999}],
    }});
    assert.equal(state.layouts.mobile[0].collapsed, true);
    assert.equal(Object.prototype.hasOwnProperty.call(state.layouts.mobile[0], "scrollTop"), false);
    assert.deepEqual(home.normalizeHomeState(state), state);
});

test("home model migrates mobile legacy fields without leaking UI-only state", () => {
    const state = home.migrateHomeState({widgets: [{moduleId: "today-tasks", instanceId: "tasks"}], layouts: {
        mobile: [{instanceId: "tasks", x: 1, y: 2, collapsed: true, viewportWidth: 360, scrollTop: 88}],
    }});
    const entry = state.layouts.mobile[0];
    assert.equal(entry.collapsed, true);
    assert.equal(Object.prototype.hasOwnProperty.call(entry, "viewportWidth"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(entry, "scrollTop"), false);
    assert.deepEqual(home.migrateHomeState(state), state);
});

test("home model ignores unknown mobile render fields at narrow widths", () => {
    const state = home.normalizeHomeState({instances: [{moduleId: "today-journal", instanceId: "j"}], layouts: {
        mobile: [{instanceId: "j", x: -10, y: -1, w: 0, h: 99, collapsed: false, gridColumns: 99, dragHandle: "bad"}],
    }});
    const entry = state.layouts.mobile[0];
    assert.deepEqual(entry, {instanceId: "j", x: 0, y: 0, w: 12, h: 12, collapsed: false, size: ""});
    assert.deepEqual(home.normalizeHomeState(state), state);
});

test("home model preserves mobile module order and collapse across orientation", () => {
    const input = {instances: [{moduleId: "today-journal", instanceId: "j"}, {moduleId: "today-tasks", instanceId: "t"}], layouts: {
        mobile: [{instanceId: "j", x: 0, y: 0, collapsed: true}, {instanceId: "t", x: 0, y: 1, collapsed: false}],
    }};
    const portrait = home.normalizeHomeState(input);
    const landscape = home.normalizeHomeState({...portrait, layouts: {mobile: portrait.layouts.mobile.map((entry) => ({...entry, x: 0, w: 1}))}});
    assert.deepEqual(landscape.layouts.mobile.map((entry) => entry.instanceId), ["j", "t"]);
    assert.equal(landscape.layouts.mobile[0].collapsed, true);
});

test("home model treats scroll position as transient while collapse is durable", () => {
    const state = home.normalizeHomeState({instances: [{moduleId: "today-journal", instanceId: "j"}], layouts: {
        mobile: [{instanceId: "j", y: 4, collapsed: true, scrollTop: 420, scrollY: 12}],
    }});
    assert.equal(state.layouts.mobile[0].collapsed, true);
    assert.equal("scrollTop" in state.layouts.mobile[0], false);
    assert.equal("scrollY" in state.layouts.mobile[0], false);
});

test("home model mobile recovery remains stable over repeated rotations", () => {
    let state = {instances: [{moduleId: "today-tasks", instanceId: "tasks"}], layouts: {mobile: [{instanceId: "tasks", y: 2, collapsed: true}]}};
    const baseline = home.normalizeHomeState(state);
    for (let index = 0; index < 20; index += 1) {
        state = home.normalizeHomeState({...baseline, layouts: {mobile: baseline.layouts.mobile.map((entry) => ({...entry, viewport: index, scrollTop: index * 10}))}});
    }
    assert.deepEqual(state, baseline);
});

test("default modules include an offline three-surface local clock", () => {
    const clock = home.DEFAULT_MODULES.find((item) => item.moduleId === "external-local-time");
    assert.ok(clock);
    assert.deepEqual(clock.supportedDevices, ["desktop", "sidebar", "mobile"]);
    assert.deepEqual(clock.sizes, ["xs", "small", "medium"]);
    assert.equal(home.normalizeModuleDefinition(clock).availability, "ready");
});


test("GitHub contribution module is declared as a heatmap view", () => {
    const github = home.registerModules([]).find((item) => item.moduleId === "external-github-contrib");
    assert.ok(github, "external-github-contrib registered");
    assert.equal(github.viewType, "heatmap", "rendered by the heatmap renderer");
});
