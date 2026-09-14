const test = require("node:test");
const assert = require("node:assert/strict");
const network = require("../src/life-widget-network.js");

const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=Beijing&count=1";
const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2";
const holidayUrl = "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/2026.json";
const bangumiUrl = "https://api.bgm.tv/calendar";
const response = (body, options = {}) => ({
    ok: options.ok !== false,
    headers: {get: (name) => name === "content-length" ? String(options.length ?? String(body).length) : null},
    text: async () => String(body),
});

test.beforeEach(() => network.clearLifeWidgetCaches());

test("network constants keep bounded payloads and TTLs", () => {
    assert.equal(network.MAX_RESPONSE_BYTES, 128 * 1024);
    assert.equal(network.WEATHER_TTL_MS, 15 * 60 * 1000);
    assert.equal(network.HOLIDAY_TTL_MS, 24 * 60 * 60 * 1000);
    assert.equal(network.BANGUMI_TTL_MS, 30 * 60 * 1000);
});
test("network allowlist accepts geocoding", () => assert.equal(network.allowedLifeWidgetUrl(geoUrl), true));
test("network allowlist accepts forecast", () => assert.equal(network.allowedLifeWidgetUrl(weatherUrl), true));
test("network allowlist accepts the bounded holiday path", () => assert.equal(network.allowedLifeWidgetUrl(holidayUrl), true));
test("network allowlist accepts only the exact Bangumi calendar", () => assert.equal(network.allowedLifeWidgetUrl(bangumiUrl), true));
test("network allowlist rejects Bangumi query injection", () => assert.equal(network.allowedLifeWidgetUrl(`${bangumiUrl}?x=1`), false));
test("network allowlist rejects other Bangumi API routes", () => assert.equal(network.allowedLifeWidgetUrl("https://api.bgm.tv/v0/subjects/1"), false));
test("network allowlist rejects arbitrary HTTPS", () => assert.equal(network.allowedLifeWidgetUrl("https://example.com/x"), false));
test("network allowlist rejects holiday path traversal", () => assert.equal(network.allowedLifeWidgetUrl("https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/../x.json"), false));
test("bounded fetch parses JSON", async () => assert.deepEqual(await network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => response('{"ok":true}')}), {ok: true}));
test("bounded fetch rejects blocked endpoints before fetch", async () => {
    let calls = 0;
    await assert.rejects(network.fetchBoundedLifeJson("https://example.com", {fetchImpl: async () => { calls += 1; }}), /blocked_endpoint/);
    assert.equal(calls, 0);
});
test("bounded fetch rejects HTTP failures without body text", async () => assert.rejects(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => response("secret", {ok: false})}), /http_error/));
test("bounded fetch rejects declared oversized bodies", async () => assert.rejects(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => response("{}", {length: network.MAX_RESPONSE_BYTES + 1})}), /response_too_large/));
test("bounded fetch rejects actual oversized bodies", async () => assert.rejects(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => response("x".repeat(network.MAX_RESPONSE_BYTES + 1), {length: 0})}), /response_too_large/));
test("bounded fetch rejects malformed JSON", async () => assert.rejects(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => response("nope")}), /invalid_json/));
test("bounded fetch honors pre-aborted signals", async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(network.fetchBoundedLifeJson(geoUrl, {signal: controller.signal, fetchImpl: async () => response("{}")} ), /aborted/);
});
test("bounded fetch returns a stable timeout for a stalled request", async () => {
    await assert.rejects(network.fetchBoundedLifeJson(geoUrl, {timeoutMs: 500, fetchImpl: async () => new Promise(() => {})}), /timeout/);
});
test("location loader reuses a 24-hour cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"results":[]}'); };
    await network.loadWeatherLocation(geoUrl, {fetchImpl, now: 100});
    await network.loadWeatherLocation(geoUrl, {fetchImpl, now: 200});
    assert.equal(calls, 1);
});
test("weather loader expires after 15 minutes", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response(`{"n":${calls}}`); };
    await network.loadWeatherForecast(weatherUrl, {fetchImpl, now: 100});
    await network.loadWeatherForecast(weatherUrl, {fetchImpl, now: 100 + network.WEATHER_TTL_MS});
    assert.equal(calls, 2);
});
test("holiday loader clamps and caches the requested year", async () => {
    let calledUrl = "";
    const fetchImpl = async (url) => { calledUrl = url; return response('{"year":2100,"days":[]}'); };
    await network.loadHolidayYear(9999, {fetchImpl, now: 1});
    assert.match(calledUrl, /\/2100\.json$/);
    assert.equal(network.lifeWidgetCacheSize(), 1);
});
test("cache clear removes external data", async () => {
    await network.loadWeatherForecast(weatherUrl, {fetchImpl: async () => response("{}"), now: 1});
    network.clearLifeWidgetCaches();
    assert.equal(network.lifeWidgetCacheSize(), 0);
});
test("Bangumi loader caches the weekly calendar", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[]"); };
    await network.loadBangumiCalendar({fetchImpl, now: 100});
    await network.loadBangumiCalendar({fetchImpl, now: 200});
    assert.equal(calls, 1);
});
test("Bangumi loader expires after thirty minutes", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[]"); };
    await network.loadBangumiCalendar({fetchImpl, now: 100});
    await network.loadBangumiCalendar({fetchImpl, now: 100 + network.BANGUMI_TTL_MS});
    assert.equal(calls, 2);
});
test("Bangumi loader shares the bounded fetch policy", async () => {
    await assert.rejects(network.loadBangumiCalendar({fetchImpl: async () => response("x".repeat(network.MAX_RESPONSE_BYTES + 1), {length: 0})}), /response_too_large/);
});
