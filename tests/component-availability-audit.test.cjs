const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const home = require("../src/home-model.js");
const catalog = require("../src/widget-catalog.js");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
const registeredIds = [
    ...[...source.matchAll(/register\("([A-Za-z0-9._:-]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/registerExternalFeed\("([A-Za-z0-9._:-]+)"/g)].map((match) => match[1]),
];

test("every built-in widget has exactly one runtime adapter", () => {
    const definitions = home.registerModules([]);
    const builtins = definitions.filter((item) => item.category === "siyuan").map((item) => item.moduleId);
    assert.equal(builtins.length, 40);
    assert.equal(new Set(builtins).size, builtins.length);
    for (const moduleId of builtins) {
        assert.equal(registeredIds.filter((id) => id === moduleId).length, 1, `${moduleId} adapter registration`);
    }
});

test("third-party catalog entries are intentionally provider-backed and not local adapters", () => {
    assert.deepEqual(catalog.WIDGET_CATALOG.map((entry) => entry.moduleId), ["checkin-summary"]);
    for (const entry of catalog.WIDGET_CATALOG) {
        assert.match(entry.providerPlugin, /^[A-Za-z0-9._-]+$/);
        assert.ok(entry.providerName && entry.description);
        assert.equal(registeredIds.includes(entry.moduleId), false);
    }
});

test("SQL-backed widget adapters use the whitelisted stmt payload", () => {
    const sqlModules = [
        "today-tasks", "journal-monthly", "note-stats", "recent-edits",
        "flashcard-due", "random-review", "clipped-unread", "on-this-day", "today-writing",
        "writing-streak", "journal-calendar", "recent-writing-activity", "recent-daily-notes",
        "document-relations-summary", "today-reservations",
    ];
    for (const moduleId of sqlModules) {
        const start = source.indexOf(`register("${moduleId}"`);
        assert.ok(start >= 0, `${moduleId} source registration`);
        const end = source.indexOf("register(\"", start + 10);
        const section = source.slice(start, end < 0 ? source.length : end);
        assert.match(section, /fetchKernelJson\("\/api\/query\/sql"/);
        assert.match(section, /\bstmt:/);
        assert.doesNotMatch(section, /fetchKernelJson\("\/api\/query\/sql",\s*\{\s*query:/);
    }
});

test("availability audit keeps normal empty states distinct from missing registrations", () => {
    const definitions = home.registerModules([]);
    const ids = new Set(definitions.map((item) => item.moduleId));
    assert.equal(ids.has("checkin-summary"), true);
    assert.equal(registeredIds.includes("checkin-summary"), false);
    assert.match(source, /需安装插件后可用|homeStorePending/);
});

test("availability levels are explicit and bounded for store cards", () => {
    const definitions = home.registerModules([]);
    for (const definition of definitions) assert.ok(home.AVAILABILITY_LEVELS.includes(definition.availability));
    assert.equal(definitions.filter((item) => item.availability === "conditional").length >= 10, true);
    assert.equal(definitions.find((item) => item.moduleId === "checkin-summary").availability, "external");
});

test("widget store functional groups cover every built-in exactly once", () => {
    const start = source.indexOf("const BUILTIN_GROUPS:");
    const end = source.indexOf("const groupDescriptionOf", start);
    assert.ok(start >= 0 && end > start, "store group declaration");
    const groupedIds = [...source.slice(start, end).matchAll(/"([a-z][a-z0-9-]+)"/g)]
        .map((match) => match[1]);
    const builtins = home.registerModules([])
        .filter((item) => item.category === "siyuan")
        .map((item) => item.moduleId)
        .sort();
    assert.equal(new Set(groupedIds).size, groupedIds.length, "grouped module ids must be unique");
    assert.deepEqual(groupedIds.sort(), builtins);
});

test("new configurable widgets open setup after the explicit add action", () => {
    assert.match(source, /let createdInstance:/);
    assert.match(source, /if \(createdInstance && Array\.isArray\(def\.configSchema\)/);
    assert.match(source, /this\.openHomeConfigForm\(createdInstance, def\.configSchema/);
});
