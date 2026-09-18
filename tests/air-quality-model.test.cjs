// T-6308 空气质量组件契约：配置钳制、URL 白名单（字面 current 字段集）、
// 响应归一（缺测丢弃）、欧洲 AQI 六档分档、快照形状与目录接线。
const test = require('node:test');
const assert = require('node:assert/strict');
const air = require('../src/air-quality-model.js');
const network = require('../src/life-widget-network.js');
const model = require('../src/life-widget-model.js');
const home = require('../src/home-model.js');

const {normalizeAirQualityConfig, buildAirQualityUrl, normalizeAirQualityPayload, europeanAqiBand, AQI_BANDS_COUNT} = air;
const {allowedAirQualityUrl, loadAirQuality, AIR_QUALITY_TTL_MS} = network;
const {buildAirQualitySnapshot} = model;

const LOCATION = {latitude: 31.2304, longitude: 121.4737, name: "上海"};

// ---------- 配置与 URL ----------
test('air config bounds the city text', () => {
    assert.equal(normalizeAirQualityConfig({city: "  上海  "}).city, "上海");
    assert.equal(normalizeAirQualityConfig({city: `${"城".repeat(100)}`}).city.length, 64);
    assert.equal(normalizeAirQualityConfig({}).city, "");
    assert.equal(normalizeAirQualityConfig(null).city, "");
});

test('air url is built with clamped coordinates and a literal field set', () => {
    const url = buildAirQualityUrl(LOCATION, {city: "上海"});
    assert.equal(url, "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=31.2304&longitude=121.4737&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide&timezone=auto");
    assert.equal(buildAirQualityUrl({latitude: 999, longitude: 0}, {city: "x"}), "", "越界坐标必须拒绝");
    assert.equal(buildAirQualityUrl(LOCATION, {}), "", "空配置必须拒绝");
});

test('air url gate allows only the exact endpoint shape', () => {
    assert.equal(allowedAirQualityUrl(buildAirQualityUrl(LOCATION, {city: "x"})), true);
    const FIELDS = "current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide";
    assert.equal(allowedAirQualityUrl(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.0000&longitude=2.0000&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide&timezone=auto`), false, "字段集必须字面等值");
    assert.equal(allowedAirQualityUrl(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.0000&longitude=2.0000&${FIELDS}`), false, "缺 timezone 必须拒绝");
    assert.equal(allowedAirQualityUrl(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1&longitude=2&${FIELDS}&timezone=auto`), false, "整数坐标必须拒绝");
    assert.equal(allowedAirQualityUrl(`https://api.open-meteo.com/v1/air-quality?latitude=1.0&longitude=2.0&${FIELDS}&timezone=auto`), false, "换主机必须拒绝");
    assert.equal(allowedAirQualityUrl(`http://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.0&longitude=2.0&${FIELDS}&timezone=auto`), false);
});

// ---------- 加载器 ----------
test('air loader caches and falls back to stale', async () => {
    network.clearLifeWidgetCaches();
    const url = buildAirQualityUrl(LOCATION, {city: "上海"});
    let calls = 0;
    const good = () => {
        calls += 1;
        return Promise.resolve({ok: true, headers: {get: () => null}, text: () => Promise.resolve(JSON.stringify({current: {european_aqi: 42, pm2_5: 12.3, pm10: 20.1}}))});
    };
    const first = await loadAirQuality(url, {fetchImpl: good, now: 1000});
    const second = await loadAirQuality(url, {fetchImpl: good, now: 1000 + AIR_QUALITY_TTL_MS - 1});
    assert.equal(first.status, "fresh");
    assert.equal(second.status, "cached");
    assert.equal(calls, 1);
    const stale = await loadAirQuality(url, {fetchImpl: () => Promise.reject(new Error("timeout")), now: 99999999});
    assert.equal(stale.status, "stale");
    network.clearLifeWidgetCaches();
    await assert.rejects(loadAirQuality(url, {fetchImpl: () => Promise.reject(new Error("timeout"))}), /timeout/);
});

// ---------- 响应归一与分档 ----------
test('air payload normalization drops missing measurements', () => {
    assert.deepEqual(normalizeAirQualityPayload({current: {european_aqi: 42.4, pm2_5: 12.34, pm10: 20.56}}), {aqi: 42, pm25: 12.3, pm10: 20.6, ozone: null, no2: null, so2: null});
    assert.deepEqual(normalizeAirQualityPayload({current: {european_aqi: 42, pm2_5: null, pm10: 20}}), {aqi: 42, pm25: null, pm10: 20, ozone: null, no2: null, so2: null}, "缺测逐字段丢弃");
    assert.deepEqual(
        normalizeAirQualityPayload({current: {european_aqi: 42, ozone: 88.56, nitrogen_dioxide: 7.84, sulphur_dioxide: null}}),
        {aqi: 42, pm25: null, pm10: null, ozone: 88.6, no2: 7.8, so2: null},
        "T-6439 新增污染物走同一缺测语义",
    );
    assert.equal(normalizeAirQualityPayload({current: {pm2_5: 12}}), null, "AQI 缺失整体无效");
    assert.equal(normalizeAirQualityPayload({current: {european_aqi: 9999}}), null, "越界 AQI 整体无效");
    assert.equal(normalizeAirQualityPayload(null), null);
    assert.equal(normalizeAirQualityPayload({}), null);
});

test('european aqi bands follow the official six-tier thresholds', () => {
    assert.deepEqual([0, 20, 21, 40, 41, 60, 61, 80, 81, 100, 101].map(europeanAqiBand), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    assert.equal(europeanAqiBand(-5), 0, "越界钳到最低档");
    assert.equal(europeanAqiBand(100000), 5, "越界钳到最高档");
    assert.equal(AQI_BANDS_COUNT, 6);
});

// ---------- 快照 ----------
test('air snapshot lists aqi band and available pollutants with a source line', () => {
    const snapshot = buildAirQualitySnapshot(
        LOCATION,
        {current: {european_aqi: 55, pm2_5: 12.3, pm10: null}},
        {city: "上海"},
        {bands: ["优", "良", "中等", "较差", "差", "严重"], source: "来源"},
        1725696000000,
        "cached",
    );
    assert.ok(snapshot);
    assert.equal(snapshot.title, "上海");
    assert.equal(snapshot.items.length, 3, "AQI + PM2.5 + 来源行，缺测 PM10 省略");
    assert.equal(snapshot.items[0].label, "欧洲 AQI");
    assert.equal(snapshot.items[0].value, "55 · 中等");
    assert.equal(snapshot.items[1].value, "12.3 µg/m³");
    assert.equal(snapshot.items[2].label, "来源：Open-Meteo Air Quality");
    assert.equal(snapshot.sourceHealth, "cached");
    assert.equal(snapshot.band, 2);
    assert.equal(buildAirQualitySnapshot(LOCATION, {current: {}}, {}, {}), null, "无效载荷必须返回 null");
});

test('air snapshot falls back to config city and default band words', () => {
    const snapshot = buildAirQualitySnapshot(
        {latitude: 1, longitude: 2},
        {current: {european_aqi: 150, pm2_5: 1, pm10: 2}},
        {city: "自定城市"},
        {},
        0,
        "fresh",
    );
    assert.equal(snapshot.title, "自定城市");
    assert.equal(snapshot.items[0].value, "150", "缺档词时只显示数值");
});

// ---------- 目录与接线 ----------
test('air widget is registered in the catalog with a bounded schema', () => {
    const def = home.registerModules([]).find((item) => item.moduleId === "external-air-quality");
    assert.ok(def, "空气质量目录条目存在");
    assert.equal(def.readOnly, true);
    assert.deepEqual(def.configSchema.map((field) => field.key), ["city", "showPollutants"]);
    assert.deepEqual(def.sizes, ["small", "medium", "wide"]);
});
