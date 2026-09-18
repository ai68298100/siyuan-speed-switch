const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const home = require("../src/home-model.js");
const store = require("../src/home-store-model.js");
const clock = require("../src/local-time-model.js");
const kernel = require("../src/kernel-widget-model.js");

const COUNTDOWN_LABELS = {
    hint: "请在配置中填写目标日期",
    untitled: "倒数日",
    remaining: "剩余 {n} 天",
    today: "就是今天",
    passed: "已过 {n} 天",
    yearly: "每年",
};

test("year progress projects calendar days with leap-year exact totals", () => {
    const labels = {elapsed: "今年已过 {x} 天", remaining: "今年还剩 {x} 天"};
    const leap = clock.buildYearProgressSnapshot(new Date(2024, 1, 29), {}, labels);
    assert.equal(leap.stat.arc.max, 366);
    assert.equal(leap.stat.arc.value, 60); // 1 月 31 天 + 2 月 29 天
    assert.equal(leap.stat.progress, Math.round(60 / 366 * 100));
    const plain = clock.buildYearProgressSnapshot(new Date(2025, 0, 1), {}, labels);
    assert.equal(plain.stat.arc.max, 365);
    assert.equal(plain.stat.arc.value, 1);
    assert.equal(plain.stat.value, "0%"); // 元旦 1/365 → 0%
    const end = clock.buildYearProgressSnapshot(new Date(2025, 11, 31), {}, labels);
    assert.equal(end.stat.value, "100%");
    assert.equal(end.stat.arc.value, 365);
});

test("year progress detail rows obey display toggles", () => {
    const labels = {elapsed: "已过 {x}", remaining: "剩 {x}"};
    const at = new Date(2025, 5, 30); // 2025-06-30 = 第 181 天
    const both = clock.buildYearProgressSnapshot(at, {}, labels);
    assert.deepEqual(both.items.map((item) => item.label), ["已过 181", "剩 184"]);
    const noElapsed = clock.buildYearProgressSnapshot(at, {showElapsed: "否"}, labels);
    assert.deepEqual(noElapsed.items.map((item) => item.label), ["剩 184"]);
    const none = clock.buildYearProgressSnapshot(at, {showElapsed: "否", showRemaining: "否"}, labels);
    assert.deepEqual(none.items, []);
    assert.equal(none.stat.value, Math.round(181 / 365 * 100) + "%");
});

test("countdown projects remaining, today and passed states", () => {
    const future = clock.buildCountdownSnapshot(
        new Date(2026, 0, 1, 8, 30),
        {targetDate: "2027-01-01", title: "DDL"},
        COUNTDOWN_LABELS,
    );
    assert.equal(future.stat.value, "365");
    assert.equal(future.stat.label, "剩余 365 天");
    assert.equal(future.items[0].label, "DDL · 2027-01-01");
    const today = clock.buildCountdownSnapshot(new Date(2027, 0, 1, 23, 0), {targetDate: "2027-01-01", title: "DDL"}, COUNTDOWN_LABELS);
    assert.equal(today.stat.value, "0");
    assert.equal(today.stat.label, "就是今天");
    const passed = clock.buildCountdownSnapshot(new Date(2028, 0, 1), {targetDate: "2027-01-01", title: "DDL"}, COUNTDOWN_LABELS);
    assert.equal(passed.stat.value, "365");
    assert.equal(passed.stat.label, "已过 365 天");
    const untitled = clock.buildCountdownSnapshot(new Date(2026, 0, 1), {targetDate: "2027-01-01"}, COUNTDOWN_LABELS);
    assert.equal(untitled.items[0].label, "倒数日 · 2027-01-01");
});

test("countdown yearly repeat rolls to the next occurrence", () => {
    const rolled = clock.buildCountdownSnapshot(
        new Date(2026, 5, 15),
        {targetDate: "2020-01-01", repeat: "每年", title: "元旦"},
        COUNTDOWN_LABELS,
    );
    assert.equal(rolled.stat.value, "200");
    assert.equal(rolled.stat.label, "剩余 200 天");
    assert.equal(rolled.items[0].label, "元旦 · 每年 · 01-01");
    const upcoming = clock.buildCountdownSnapshot(
        new Date(2026, 0, 1),
        {targetDate: "1999-12-31", repeat: "每年"},
        COUNTDOWN_LABELS,
    );
    assert.equal(upcoming.stat.value, "364");
    assert.equal(upcoming.items[0].label, "倒数日 · 每年 · 12-31");
    // 平年无 2 月 29 日：按“当月最后一天”钳制到 2 月 28 日，不漂移到别的月份
    const feb29 = clock.buildCountdownSnapshot(
        new Date(2026, 0, 1),
        {targetDate: "2024-02-29", repeat: "每年"},
        COUNTDOWN_LABELS,
    );
    assert.equal(feb29.stat.value, "58");
    assert.equal(feb29.items[0].label, "倒数日 · 每年 · 02-28");
});

test("countdown hides the target date and falls back to the hint on invalid input", () => {
    const hidden = clock.buildCountdownSnapshot(
        new Date(2026, 0, 1),
        {targetDate: "2027-01-01", title: "A", showTargetDate: "否"},
        COUNTDOWN_LABELS,
    );
    assert.equal(hidden.items[0].label, "A");
    const missing = clock.buildCountdownSnapshot(new Date(2026, 0, 1), {}, COUNTDOWN_LABELS);
    assert.equal(missing.items[0].label, COUNTDOWN_LABELS.hint);
    const loose = clock.buildCountdownSnapshot(new Date(2026, 0, 1), {targetDate: "2027-1-1"}, COUNTDOWN_LABELS);
    assert.equal(loose.items[0].label, COUNTDOWN_LABELS.hint);
    // 一次性目标日期里不可能存在的日历日（2 月 30 日）同样回退提示，不静默溢出
    const impossible = clock.buildCountdownSnapshot(new Date(2026, 0, 1), {targetDate: "2026-02-30"}, COUNTDOWN_LABELS);
    assert.equal(impossible.items[0].label, COUNTDOWN_LABELS.hint);
});

test("local time snapshot honors format, seconds and date toggles", () => {
    const at = new Date(2026, 0, 1, 15, 5, 9);
    const standard = clock.buildLocalTimeSnapshot(at, "en-US", {localTime: "本地"});
    assert.equal(standard.stat.value, "15:05");
    assert.equal(standard.items.length, 1);
    const seconds = clock.buildLocalTimeSnapshot(at, "en-US", {}, {showSeconds: "是"});
    assert.equal(seconds.stat.value, "15:05:09");
    const twelve = clock.buildLocalTimeSnapshot(at, "en-US", {}, {hourFormat: "12 小时制"});
    assert.match(twelve.stat.value, /PM$/);
    const noDate = clock.buildLocalTimeSnapshot(at, "en-US", {}, {showDate: "否"});
    assert.deepEqual(noDate.items, []);
    assert.equal(clock.millisecondsToNextSecond(120000), 1025);
    assert.equal(clock.millisecondsToNextSecond(120999), 26);
});

test("data health projects bounded distinct totals with search and sorting", () => {
    const assets = [];
    for (let i = 0; i < 20; i += 1) {
        assets.push({name: `asset-${String(i).padStart(2, "0")}.png`, path: `/assets/asset-${i}.png`});
    }
    const labels = {title: "数据健康", stat: "缺失资源", statMany: "缺失资源（较多）"};
    const snapshot = kernel.buildDataHealthSnapshot({data: assets}, {limit: 8}, labels);
    assert.equal(snapshot.stat.value, "8/20");
    assert.equal(snapshot.stat.label, "缺失资源（较多）"); // 总数 ≥10 → 严重标签
    assert.equal(snapshot.items.length, 8);
    assert.equal(snapshot.items[0].label, "asset-00.png");
    const few = kernel.buildDataHealthSnapshot({data: assets.slice(0, 3)}, {}, labels);
    assert.equal(few.stat.value, "3");
    assert.equal(few.stat.label, "缺失资源");
    const filtered = kernel.buildDataHealthSnapshot({data: assets}, {query: "ASSET-19"}, labels);
    assert.equal(filtered.stat.value, "1");
    assert.equal(filtered.items[0].label, "asset-19.png");
    const sorted = kernel.buildDataHealthSnapshot(
        {data: [{name: "b.png"}, {name: "A.png"}]},
        {sortBy: "名称"},
        labels,
    );
    assert.deepEqual(sorted.items.map((item) => item.label), ["A.png", "b.png"]);
    assert.equal(kernel.buildDataHealthSnapshot({data: assets}, {}, labels).items[0].rank, undefined);
    assert.equal(kernel.buildDataHealthSnapshot({data: assets}, {showRank: "是"}, labels).items[0].rank, 1);
    assert.equal(kernel.buildDataHealthSnapshot({data: assets}, {showPath: "否"}, labels).items[0].secondary, "");
});

test("data health scan stays bounded and rejects malformed payloads", () => {
    const many = [];
    for (let i = 0; i < 600; i += 1) many.push({name: `x-${i}`});
    const bounded = kernel.buildDataHealthSnapshot({data: many}, {limit: 12}, {stat: "缺失资源"});
    assert.equal(bounded.stat.value, `12/${kernel.DATA_HEALTH_SCAN_BOUND}`);
    const duplicated = kernel.buildDataHealthSnapshot(
        {data: [{name: "same.png"}, {name: "same.png", path: "/other"}, {name: "other.png"}]},
        {},
        {stat: "缺失资源"},
    );
    assert.equal(duplicated.stat.value, "2");
    assert.equal(duplicated.items[0].secondary, "");
    assert.equal(kernel.buildDataHealthSnapshot({}, {}), null);
    assert.equal(kernel.buildDataHealthSnapshot(null, {}), null);
});

test("deep config fields for the four basic widgets stay semantic and bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("year-progress").configSchema.map((f) => f.key), ["period", "showElapsed", "showRemaining"]);
    assert.deepEqual(byId.get("external-local-time").configSchema.map((f) => f.key), ["hourFormat", "showSeconds", "showDate", "emphasis"]);
    assert.deepEqual(byId.get("countdown").configSchema.map((f) => f.key), ["title", "targetDate", "mode", "repeat", "showTargetDate", "emphasis"]);
    assert.deepEqual(byId.get("data-health").configSchema.map((f) => f.key), ["limit", "query", "sortBy", "showPath", "showRank"]);
    for (const id of ["year-progress", "external-local-time", "countdown", "data-health"]) {
        assert.equal(byId.get(id).protocolVersion, 2, `${id} declares protocol v2`);
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
    assert.equal(store.resolveHomeConfigSection("countdown", "repeat"), "range");
    assert.equal(store.resolveHomeConfigSection("external-local-time", "hourFormat"), "display");
    assert.equal(store.resolveHomeConfigSection("data-health", "query"), "source");
    assert.equal(store.resolveHomeConfigSection("year-progress", "showElapsed"), "display");
    assert.equal(store.resolveHomeConfigSection("countdown", "showTargetDate"), "display");
});

test("basic widget adapters wire the deep models and bounded policies", () => {
    const indexTs = readSourceText(path.join(__dirname, "..", "src", "index.ts"));
    assert.match(indexTs, /buildYearProgressSnapshot\(new Date\(\), config/);
    assert.match(indexTs, /context && context\.size === "xs"/);
    assert.match(indexTs, /buildCountdownSnapshot\(new Date\(\), config/);
    assert.match(indexTs, /statMany: this\.i18n\.homeDataHealthStatMany/);
    const dataHealthBlock = indexTs.slice(
        indexTs.indexOf('register("data-health"'),
        indexTs.indexOf('register("database-list"'),
    );
    assert.ok(
        dataHealthBlock.includes("{timeoutMs: 1200, cacheTtlMs: 1000}"),
        "data-health adapter must declare a bounded timeout and one-second cache",
    );
    const external = readSourceText(path.join(__dirname, "..", "src", "home-external-adapters.ts"));
    assert.match(external, /buildLocalTimeSnapshot\(new Date\(\), locale, \{localTime: this\.i18n\.homeLocalTimeZone\}, config\)/);
    const panel = readSourceText(path.join(__dirname, "..", "src", "second-panel-ui.ts"));
    assert.match(panel, /clockSeconds: inst\.moduleId === "external-local-time"/);
    assert.match(panel, /millisecondsToNextSecond\(\)/);
    assert.match(panel, /secondsClockEntries\.length === 0/);
    assert.match(panel, /homeSecondsTimer = 0/);
});
