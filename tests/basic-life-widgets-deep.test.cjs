const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../src/home-model.js");
const store = require("../src/home-store-model.js");
const model = require("../src/life-widget-model.js");
const battery = require("../src/battery-model.js");
const quote = require("../src/quote-model.js");

// ---------- T-6450 Frankfurter ----------
const fxEnvelope = {status: "fresh", fetchedAt: 1000, payload: [
    {quote: "USD", rate: 0.1402, date: "2026-09-18"},
    {quote: "JPY", rate: 20.7300, date: "2026-09-18"},
]};

test("frankfurter inverse rates are pure reciprocals gated behind opt-in", () => {
    const standard = model.buildFrankfurterSnapshot(fxEnvelope, {base: "CNY", quotes: ["USD", "JPY"]}, {source: "来源"});
    assert.deepEqual(standard.items.slice(0, 2).map((item) => item.label), ["CNY → USD", "CNY → JPY"]);
    assert.equal(standard.items.filter((item) => item.label === "USD → CNY").length, 0, "反向汇率默认关闭");
    const inverse = model.buildFrankfurterSnapshot(fxEnvelope, {base: "CNY", quotes: ["USD", "JPY"], showInverse: "是"}, {source: "来源"});
    assert.equal(inverse.items[2].label, "USD → CNY");
    assert.equal(inverse.items[2].value, "7.1327"); // 1 / 0.1402
    assert.equal(inverse.items[3].label, "JPY → CNY");
    assert.equal(inverse.items[3].value, "0.0482"); // 1 / 20.73
    assert.ok(inverse.items[0].rank < inverse.items[2].rank, "反向行排在正向行之后");
    const sourceLine = inverse.items.at(-1).label;
    assert.match(sourceLine, /2026-09-18$/, "默认显示牌价日期");
    const noDate = model.buildFrankfurterSnapshot(fxEnvelope, {base: "CNY", quotes: ["USD"], showDate: "否"}, {source: "来源"});
    assert.doesNotMatch(noDate.items.at(-1).label, /2026-09-18/, "关闭日期后来源行不再携带牌价日期");
});

// ---------- T-6451 ActivityWatch ----------
const awEnvelope = {status: "fresh", fetchedAt: 1000, payload: [{
    app_events: [
        {data: {app: "Code"}, duration: 3600},
        {data: {app: "Chrome"}, duration: 1800},
    ],
    duration: 5400,
}]};

test("activitywatch exposes duration share and rank toggles", () => {
    const standard = model.buildActivityWatchSnapshot(awEnvelope, {}, {});
    assert.equal(standard.items[0].secondary, "1h");
    assert.equal(standard.items[0].rank, 1, "时长排名默认显示");
    assert.doesNotMatch(standard.items[0].secondary, /%/, "占比默认关闭");
    const percent = model.buildActivityWatchSnapshot(awEnvelope, {showPercent: "是"}, {});
    assert.equal(percent.items[0].secondary, "1h · 67%");
    assert.equal(percent.items[1].secondary, "30m · 33%");
    const noRank = model.buildActivityWatchSnapshot(awEnvelope, {showRank: "否"}, {});
    assert.equal(noRank.items[0].rank, undefined);
    assert.equal(model.normalizeActivityWatchConfig({}).showPercent, false);
    assert.equal(model.normalizeActivityWatchConfig({}).showRank, true);
});

// ---------- T-6452 Battery ----------
test("battery snapshot gates the time estimate and source row", () => {
    const labels = {title: "设备电量", charging: "充电中", discharging: "使用电池", hours: "小时", minutes: "分钟", source: "来源"};
    const reading = {level: 0.85, charging: true, chargingTime: 5400, dischargingTime: Infinity};
    const standard = battery.buildBatterySnapshot(reading, labels, {});
    assert.match(standard.items[0].value, / · 1 小时 30 分钟$/, "预计时间默认显示");
    assert.equal(standard.items.length, 2, "来源行默认显示");
    const noEstimate = battery.buildBatterySnapshot(reading, labels, {showEstimate: "否"});
    assert.equal(noEstimate.items[0].value, "85%");
    const minimal = battery.buildBatterySnapshot(reading, labels, {showEstimate: "否", showSource: "否"});
    assert.equal(minimal.items.length, 1);
    const flags = battery.normalizeBatteryConfig({});
    assert.deepEqual(flags, {showEstimate: true, showSource: true});
    assert.equal(battery.buildBatterySnapshot({level: 0, charging: true}, {}, {}), null);
});

// ---------- T-6453 Daily quote ----------
test("daily quote source attribution can be hidden", () => {
    const now = new Date(2026, 8, 14, 12);
    const standard = quote.buildDailyQuoteSnapshot(now, {}, {title: "每日引言"});
    assert.ok(standard.items[0].value.length > 0, "内置语录默认显示出处");
    const noSource = quote.buildDailyQuoteSnapshot(now, {showSource: "否"}, {title: "每日引言"});
    assert.equal(noSource.items[0].value, "");
    assert.equal(noSource.items[0].label, standard.items[0].label, "出处开关不影响轮换选中的语录");
    const custom = quote.buildDailyQuoteSnapshot(now, {quotes: "自定义语录 —— 我的笔记", showSource: "是"}, {title: "每日引言", source: "来源", customSource: "自定义语录"});
    assert.equal(custom.items[0].value, "我的笔记");
    assert.equal(quote.normalizeDailyQuoteConfig({}).showSource, true);
});

// ---------- schema/section contracts ----------
test("basic life widget schemas stay semantic and bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("external-fx-frankfurter").configSchema.map((f) => f.key), ["base", "quotes", "showDate", "showInverse"]);
    assert.deepEqual(byId.get("external-activitywatch-time").configSchema.map((f) => f.key), ["endpoint", "hours", "limit", "showPercent", "showRank", "bucketId"]);
    assert.deepEqual(byId.get("external-device-battery").configSchema.map((f) => f.key), ["showEstimate", "showSource"]);
    assert.deepEqual(byId.get("external-quote-daily").configSchema.map((f) => f.key), ["quotes", "showSource", "emphasis"]);
    assert.equal(byId.get("external-device-battery").protocolVersion, 2, "battery declares protocol v2 with its first schema");
    for (const id of ["external-fx-frankfurter", "external-activitywatch-time", "external-device-battery", "external-quote-daily"]) {
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
    assert.equal(store.resolveHomeConfigSection("external-fx-frankfurter", "showInverse"), "display");
    assert.equal(store.resolveHomeConfigSection("external-activitywatch-time", "showPercent"), "display");
    assert.equal(store.resolveHomeConfigSection("external-device-battery", "showEstimate"), "display");
    assert.equal(store.resolveHomeConfigSection("external-quote-daily", "showSource"), "display");
});
