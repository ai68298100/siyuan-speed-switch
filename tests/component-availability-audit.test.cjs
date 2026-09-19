const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const home = require("../src/home-model.js");
const catalog = require("../src/widget-catalog.js");

// R2 重构（D-375）：外部组件的注册定义在 src/home-external-adapters.ts，
// 思源原生组件的注册定义仍在 index.ts——两处合并扫描保证"恰好一个适配器"。
const source = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
const storeUiSource = readSourceText(path.join(__dirname, "..", "src", "home-store-ui.ts"));
const externalAdapters = readSourceText(path.join(__dirname, "..", "src", "home-external-adapters.ts"));
const registeredIds = [source, externalAdapters].flatMap((text) => [
    ...[...text.matchAll(/register\("([A-Za-z0-9._:-]+)"/g)].map((match) => match[1]),
    ...[...text.matchAll(/registerExternalFeed\("([A-Za-z0-9._:-]+)"/g)].map((match) => match[1]),
    // ADR 0057：小驴打卡桥接组件经 registerCheckinBridge 助手登记，内部仍是一次 register。
    ...[...text.matchAll(/registerCheckinBridge\("([A-Za-z0-9._:-]+)"/g)].map((match) => match[1]),
]);

test("every built-in widget has exactly one runtime adapter", () => {
    const definitions = home.registerModules([]);
    const builtins = definitions.filter((item) => item.category === "siyuan").map((item) => item.moduleId);
    assert.equal(builtins.length, 57);
    assert.equal(new Set(builtins).size, builtins.length);
    for (const moduleId of builtins) {
        assert.equal(registeredIds.filter((id) => id === moduleId).length, 1, `${moduleId} adapter registration`);
    }
});

test("third-party catalog entries are provider-backed and natively bridged", () => {
    assert.deepEqual(catalog.WIDGET_CATALOG.map((entry) => entry.moduleId), ["checkin-summary"]);
    for (const entry of catalog.WIDGET_CATALOG) {
        assert.match(entry.providerPlugin, /^[A-Za-z0-9._-]+$/);
        assert.ok(entry.providerName && entry.description);
        assert.equal(registeredIds.includes(entry.moduleId), true);
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
    assert.equal(registeredIds.includes("checkin-summary"), true);
    assert.match(storeUiSource,/需安装插件后可用|homeStorePending/);
});

test("availability levels are explicit and bounded for store cards", () => {
    const definitions = home.registerModules([]);
    for (const definition of definitions) assert.ok(home.AVAILABILITY_LEVELS.includes(definition.availability));
    assert.equal(definitions.filter((item) => item.availability === "conditional").length >= 10, true);
    assert.equal(definitions.find((item) => item.moduleId === "checkin-summary").availability, "external");
});

test("widget store functional groups cover every built-in exactly once", () => {
    const start = storeUiSource.indexOf("const BUILTIN_GROUPS:");
    const end = storeUiSource.indexOf("const groupDescriptionOf", start);
    assert.ok(start >= 0 && end > start, "store group declaration");
    const groupedIds = [...storeUiSource.slice(start, end).matchAll(/"([a-z][a-z0-9-]+)"/g)]
        .map((match) => match[1]);
    const builtins = home.registerModules([])
        .filter((item) => item.category === "siyuan")
        .map((item) => item.moduleId)
        .sort();
    assert.equal(new Set(groupedIds).size, groupedIds.length, "grouped module ids must be unique");
    assert.deepEqual(groupedIds.sort(), builtins);
});

test("new configurable widgets open setup after the explicit add action", () => {
    assert.match(storeUiSource, /let createdInstance:/);
    assert.match(storeUiSource, /if \(createdInstance && Array\.isArray\(def\.configSchema\)/);
    assert.match(storeUiSource,/openHomeConfigForm\.call\(this, createdInstance, def\.configSchema/);
});

// ---------- B4 三态一致性/信封门禁（T-6693） ----------
test("network-backed widget adapters keep the bounded timeout and cache envelope", () => {
    // 逐 adapter 切片：凡在读取路径发起内核或网络请求的 adapter，必须携带
    // 统一的超时/缓存信封（第七批纪律的全量推广）；纯前端组件（countdown、
    // year-progress 等）不发起请求，不在断言范围。
    const files = [
        {name: "src/index.ts", text: source},
        {name: "src/home-external-adapters.ts", text: externalAdapters},
    ];
    let checked = 0;
    for (const {name, text} of files) {
        const marks = [...text.matchAll(/register\("([A-Za-z0-9._:-]+)"/g)].map((match) => match.index);
        for (let index = 0; index < marks.length; index += 1) {
            const sliceEnd = index + 1 < marks.length ? marks[index + 1] : text.length;
            const slice = text.slice(marks[index], sliceEnd);
            const networked = /fetchKernelJson\(|load[A-Z]/.test(slice);
            if (!networked) continue;
            checked += 1;
            assert.match(slice, /timeoutMs: \d+/, `${name} adapter #${index + 1} keeps timeoutMs`);
            assert.match(slice, /cacheTtlMs: \d+/, `${name} adapter #${index + 1} keeps cacheTtlMs`);
        }
    }
    assert.ok(checked >= 20, `expected the envelope gate to cover the networked adapters, found ${checked}`);
});

test("the shared external-feed factory keeps the same bounded envelope (T-6693)", () => {
    assert.match(externalAdapters, /cacheTtlMs: 30 \* 60 \* 1000/, "feed factory keeps the 30-minute cache envelope");
    assert.match(externalAdapters, /timeoutMs: 8500/, "feed factory keeps the bounded timeout");
});
