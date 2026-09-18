const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const home = require("../src/home-model.js");
const store = require("../src/home-store-model.js");
const clock = require("../src/local-time-model.js");
const model = require("../src/life-widget-model.js");
const air = require("../src/air-quality-model.js");

const location = {latitude: 39.9042, longitude: 116.4074, label: "北京 · 北京市 · 中国"};
const forecast = {
    current: {temperature_2m: 21.4, apparent_temperature: 20.2, is_day: 1, weather_code: 1, wind_speed_10m: 9},
    daily: {
        time: ["2026-09-14", "2026-09-15", "2026-09-16"],
        weather_code: [1, 61, 71], temperature_2m_max: [27, 24, 5], temperature_2m_min: [18, 16, -2],
        precipitation_probability_max: [10, 80, 40],
    },
};
const bangumiCalendar = [
    {weekday: {id: 1, cn: "星期一"}, items: [
        {id: 101, name: "Alpha", name_cn: "阿尔法", rating: {score: 8.26}, rank: 12},
        {id: 102, name: "Beta", name_cn: ""},
    ]},
    {weekday: {id: 2, cn: "星期二"}, items: [{id: 201, name: "Tuesday", rating: {score: 7}}]},
    {weekday: {id: 7, cn: "星期日"}, items: [{id: 701, name: "Sunday"}]},
];
// 与生产不同的独立机制（toLocaleDateString/sv-SE）交叉核对相对日，防同源假绿
const dayKey = (instant, timeZone) => instant.toLocaleDateString("sv-SE", timeZone ? {timeZone} : {});
const toUtc = (key) => Date.UTC(...key.split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0)));

test("world clock hour format switch renders 12-hour rows", () => {
    const at = new Date(2026, 8, 14, 15, 5);
    const plain = clock.buildWorldClockSnapshot(at, {}, {locale: "en-US", worldClock: "世界时钟"});
    assert.match(plain.items[0].value, /^15:05/);
    const twelve = clock.buildWorldClockSnapshot(at, {hourFormat: "12 小时制"}, {locale: "en-US", worldClock: "世界时钟"});
    assert.match(twelve.items[0].value, /^03:05\s?(PM|p\.m\.)/i);
    assert.equal(clock.normalizeWorldClockConfig({hourFormat: "12 小时制"}).hour12, true);
    assert.equal(clock.normalizeWorldClockConfig({}).hour12, false);
});

test("world clock marks cross-day zones with bounded relative-day words", () => {
    const labels = {
        locale: "zh-CN",
        worldClock: "世界时钟",
        dayOffsets: ["前天", "昨天", "今天", "明天", "后天"],
    };
    const at = new Date("2026-09-14T12:00:00.000Z");
    const snapshot = clock.buildWorldClockSnapshot(at, {cities: "Pacific/Kiritimati,Pacific/Midway"}, labels);
    const localDeltaFor = (zone) => Math.round((toUtc(dayKey(at, zone)) - toUtc(dayKey(at))) / 86400000);
    let exercised = 0;
    for (const row of snapshot.items) {
        const zone = row.label.startsWith("Kiritimati") ? "Pacific/Kiritimati"
            : row.label.startsWith("Midway") ? "Pacific/Midway" : "local";
        const delta = zone === "local" ? 0 : localDeltaFor(zone);
        const expected = delta === 0 ? row.label : `${row.label.split(" · ")[0]} · ${labels.dayOffsets[delta + 2]}`;
        assert.equal(row.label, expected, `${zone} 相对日标记必须与独立机制一致`);
        if (delta !== 0) exercised += 1;
    }
    // 极端时区（+14/−11）相对本机时区是否跨日取决于本机所在时区，但至少一个应跨日
    assert.ok(exercised >= 1, `at least one extreme zone should cross a day boundary (exercised=${exercised})`);
});

test("world clock offset suffix tracks daylight saving time", () => {
    const summer = clock.buildWorldClockSnapshot(new Date("2026-07-15T12:00:00.000Z"), {cities: "America/New_York"}, {locale: "zh-CN"});
    const winter = clock.buildWorldClockSnapshot(new Date("2026-01-15T12:00:00.000Z"), {cities: "America/New_York"}, {locale: "zh-CN"});
    const row = (snapshot) => snapshot.items.find((item) => item.label === "New York");
    assert.match(row(summer).value, /GMT-4/);
    assert.match(row(winter).value, /GMT-5/);
});

test("weather stat toggles keep apparent default and wind opt-in", () => {
    const standard = model.buildWeatherSnapshot(location, forecast, {}, {feelsLike: "体感", wind: "风速"});
    assert.match(standard.stat.label, /体感 20°/);
    assert.doesNotMatch(standard.stat.label, /风速/);
    const windy = model.buildWeatherSnapshot(location, forecast, {showWind: "是"}, {feelsLike: "体感", wind: "风速"});
    assert.match(windy.stat.label, /体感 20° · 风速 9 km\/h/);
    const minimal = model.buildWeatherSnapshot(location, forecast, {showApparent: "否", showWind: "是"}, {wind: "风"});
    assert.match(minimal.stat.label, /风 9 km\/h/);
    assert.doesNotMatch(minimal.stat.label, /体感/);
    assert.equal(model.normalizeWeatherConfig({}).showApparent, true);
    assert.equal(model.normalizeWeatherConfig({}).showWind, false);
});

test("air quality exposes extra pollutants only when configured", () => {
    const payload = {current: {european_aqi: 55, pm2_5: 12.3, pm10: 20, ozone: 88.56, nitrogen_dioxide: 7.84}};
    const labels = {bands: ["优", "良", "中等", "较差", "差", "严重"], source: "来源"};
    const minimal = model.buildAirQualitySnapshot(location, payload, {}, labels, 1725696000000);
    assert.deepEqual(minimal.items.map((item) => item.label), ["欧洲 AQI", "PM2.5", "PM10", "来源：Open-Meteo Air Quality"]);
    const full = model.buildAirQualitySnapshot(location, payload, {showPollutants: "是"}, labels, 1725696000000);
    assert.deepEqual(full.items.map((item) => item.label), ["欧洲 AQI", "PM2.5", "PM10", "O₃", "NO₂", "来源：Open-Meteo Air Quality"]);
    assert.equal(full.items[3].value, "88.6 µg/m³");
    assert.equal(full.items[4].value, "7.8 µg/m³");
    assert.equal(full.items[5].rank, undefined, "来源行不带序号");
    // 缺测的 SO₂ 整条省略，不显示占位
    assert.equal(full.items.filter((item) => item.label === "SO₂").length, 0);
    // 请求 URL 字段集必须包含新污染物（字面集合，缓存 key 随之区分）
    assert.match(air.buildAirQualityUrl(location, {city: "北京"}), /current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide/);
});

test("bangumi show dates and score toggles rework the secondary line", () => {
    const monday = new Date(2026, 8, 14, 12); // 2026-09-14 周一
    const standard = model.buildBangumiSnapshot(bangumiCalendar, {}, {}, monday);
    assert.equal(standard.items[0].secondary, "★ 8.3");
    const dated = model.buildBangumiSnapshot(bangumiCalendar, {showDates: "是", dayRange: "本周"}, {}, monday);
    assert.equal(dated.items[0].secondary, "周一 09/14 · ★ 8.3");
    assert.equal(dated.items.at(-2).secondary, "周日 09/20", "本周最后一行落在七天后");
    const tomorrow = model.buildBangumiSnapshot(bangumiCalendar, {showDates: "是", dayRange: "明天"}, {}, new Date(2026, 8, 14, 12));
    assert.equal(tomorrow.items[0].secondary, "周二 09/15 · ★ 7.0");
    const noScore = model.buildBangumiSnapshot(bangumiCalendar, {showScore: "否", showDates: "是"}, {}, monday);
    assert.equal(noScore.items[0].secondary, "周一 09/14");
    assert.equal(model.normalizeBangumiConfig({}).showDates, false);
    assert.equal(model.normalizeBangumiConfig({}).showScore, true);
});

test("deep config fields for the four external widgets stay semantic and bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("external-world-clock").configSchema.map((f) => f.key), ["cities", "hourFormat"]);
    assert.deepEqual(byId.get("external-weather-open-meteo").configSchema.map((f) => f.key), ["city", "temperatureUnit", "forecastDays", "showApparent", "showWind"]);
    assert.deepEqual(byId.get("external-air-quality").configSchema.map((f) => f.key), ["city", "showPollutants"]);
    assert.deepEqual(byId.get("external-anime-bangumi").configSchema.map((f) => f.key), ["dayRange", "limit", "showCovers", "showDates", "showScore"]);
    for (const id of ["external-world-clock", "external-weather-open-meteo", "external-air-quality", "external-anime-bangumi"]) {
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
    assert.equal(store.resolveHomeConfigSection("external-weather-open-meteo", "forecastDays"), "range");
    assert.equal(store.resolveHomeConfigSection("external-world-clock", "hourFormat"), "display");
    assert.equal(store.resolveHomeConfigSection("external-weather-open-meteo", "showWind"), "display");
    assert.equal(store.resolveHomeConfigSection("external-anime-bangumi", "showDates"), "display");
});

test("external widget adapters wire the new labels and keep URL gates in sync", () => {
    const external = readSourceText(path.join(__dirname, "..", "src", "home-external-adapters.ts"));
    for (const key of ["homeWorldClockTwoDaysAgo", "homeWorldClockYesterday", "homeWorldClockToday", "homeWorldClockTomorrow", "homeWorldClockInTwoDays"]) {
        assert.ok(external.includes(`this.i18n.${key}`), `world clock adapter must wire ${key}`);
    }
    assert.match(external, /wind: this\.i18n\.homeWeatherWind/);
    // 双登记一致性：模型层 CURRENT_FIELDS 与网络层白名单字面量必须逐字相同
    const airModel = readSourceText(path.join(__dirname, "..", "src", "air-quality-model.js"));
    const network = readSourceText(path.join(__dirname, "..", "src", "life-widget-network.js"));
    const declared = airModel.match(/const CURRENT_FIELDS = "([^"]+)"/)?.[1];
    const allowed = network.match(/params\.current !== "([^"]+)"/)?.[1];
    assert.ok(declared, "air model must declare CURRENT_FIELDS");
    assert.ok(allowed, "network gate must pin the field set literal");
    assert.equal(declared, allowed, "CURRENT_FIELDS and the network allowlist literal must stay identical");
});

test("i18n defines every new runtime label in both languages", () => {
    const zh = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "zh-CN.json"), "utf8"));
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "en.json"), "utf8"));
    for (const key of ["homeWorldClockTwoDaysAgo", "homeWorldClockYesterday", "homeWorldClockToday", "homeWorldClockTomorrow", "homeWorldClockInTwoDays", "homeWeatherWind"]) {
        assert.equal(typeof zh[key], "string", `zh-CN missing ${key}`);
        assert.equal(typeof en[key], "string", `en missing ${key}`);
    }
});
