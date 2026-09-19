const test = require("node:test");
const assert = require("node:assert/strict");
const network = require("../src/life-widget-network.js");

const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=Beijing";
const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2";
const feedUrl = "https://hot.example/api/weibo";
const newsUrl = "https://news.example/api/s?id=zhihu";
const activityUrl = "http://127.0.0.1:5600/api/0/query/";
const activityRequest = {url: activityUrl, cacheKey: "resilience:activity", body: {query: ["RETURN = {};"], timeperiods: []}};
const response = (body, options = {}) => ({
    ok: options.ok !== false,
    headers: {get: (name) => name === "content-length" ? String(options.length ?? String(body).length) : null},
    text: async () => String(body),
});

test.beforeEach(() => network.clearLifeWidgetCaches());

test("life URL allowlist rejects null", () => assert.equal(network.allowedLifeWidgetUrl(null), false));
test("life URL allowlist rejects arrays", () => assert.equal(network.allowedLifeWidgetUrl([]), false));
test("life URL allowlist rejects overlong values", () => assert.equal(network.allowedLifeWidgetUrl("https://api.open-meteo.com/v1/forecast?x=" + "a".repeat(1100)), false));
test("life URL allowlist keeps geocoding query prefix exact", () => assert.equal(network.allowedLifeWidgetUrl("https://geocoding-api.open-meteo.com/v1/searchx?name=x"), false));
test("life URL allowlist keeps forecast query prefix exact", () => assert.equal(network.allowedLifeWidgetUrl("https://api.open-meteo.com/v1/forecastx?x=1"), false));
test("feed allowlist rejects null", () => assert.equal(network.allowedConfiguredFeedUrl(null), false));
test("feed allowlist rejects overlong endpoint", () => assert.equal(network.allowedConfiguredFeedUrl("https://example.com/" + "a".repeat(600)), false));
test("feed allowlist rejects username", () => assert.equal(network.allowedConfiguredFeedUrl("https://user@example.com/api/weibo"), false));
test("feed allowlist rejects hash fragments", () => assert.equal(network.allowedConfiguredFeedUrl("https://example.com/api/weibo#top"), false));
test("feed allowlist requires a single lowercase source id", () => assert.equal(network.allowedConfiguredFeedUrl("https://example.com/api/s?id=ZH"), false));
test("activity allowlist rejects non-string values", () => assert.equal(network.allowedActivityWatchUrl({}), false));
test("activity allowlist rejects overlong values", () => assert.equal(network.allowedActivityWatchUrl("http://localhost:5600/api/0/query/" + "a".repeat(400)), false));
test("activity allowlist rejects credentials", () => assert.equal(network.allowedActivityWatchUrl("http://user:pass@127.0.0.1:5600/api/0/query/"), false));
test("activity allowlist rejects fragments", () => assert.equal(network.allowedActivityWatchUrl("http://127.0.0.1:5600/api/0/query/#x"), false));

test("bounded fetch sends JSON accept header", async () => {
    let init;
    await network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async (_url, options) => { init = options; return response("{}"); }});
    assert.equal(init.headers.Accept, "application/json");
});
test("bounded fetch refuses redirects", async () => {
    let init;
    await network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async (_url, options) => { init = options; return response("{}"); }});
    assert.equal(init.redirect, "error");
});
test("bounded fetch supplies an abort signal", async () => {
    let init;
    await network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async (_url, options) => { init = options; return response("{}"); }});
    assert.equal(typeof init.signal?.aborted, "boolean");
});
test("bounded fetch normalizes non Error rejection", async () => {
    await assert.rejects(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => { throw "opaque"; }}), /failed/);
});
test("bounded fetch tolerates missing content length", async () => {
    await assert.doesNotReject(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => ({ok: true, headers: {}, text: async () => "{}"})}));
});
test("bounded fetch checks HTTP status before parsing body", async () => {
    let textCalls = 0;
    await assert.rejects(network.fetchBoundedLifeJson(geoUrl, {fetchImpl: async () => ({ok: false, headers: {}, text: async () => { textCalls += 1; return "secret"; }})}), /http_error/);
    assert.equal(textCalls, 0);
});
test("bounded fetch removes the external abort listener", async () => {
    let removed = 0;
    const signal = {aborted: false, addEventListener() {}, removeEventListener() { removed += 1; }};
    await network.fetchBoundedLifeJson(geoUrl, {signal, fetchImpl: async () => response("{}")});
    assert.equal(removed, 1);
});
test("activity fetch sends JSON content type", async () => {
    let init;
    await network.fetchActivityWatchQuery(activityUrl, activityRequest.body, {fetchImpl: async (_url, options) => { init = options; return response("{}"); }});
    assert.equal(init.headers["Content-Type"], "application/json");
});
test("activity fetch serializes request body", async () => {
    let init;
    await network.fetchActivityWatchQuery(activityUrl, {value: 1}, {fetchImpl: async (_url, options) => { init = options; return response("{}"); }});
    assert.equal(init.body, '{"value":1}');
});
test("activity fetch serializes array bodies without throwing", async () => assert.doesNotReject(network.fetchActivityWatchQuery(activityUrl, [], {fetchImpl: async () => response("{}")} )));
test("activity fetch rejects null bodies", async () => assert.rejects(network.fetchActivityWatchQuery(activityUrl, null, {fetchImpl: async () => response("{}")} ), /blocked_endpoint/));
test("activity fetch normalizes non Error rejection", async () => await assert.rejects(network.fetchActivityWatchQuery(activityUrl, {}, {fetchImpl: async () => { throw "opaque"; }}), /failed/));
test("activity fetch rejects malformed JSON", async () => assert.rejects(network.fetchActivityWatchQuery(activityUrl, {}, {fetchImpl: async () => response("nope")}), /invalid_json/));

test("weather location cache separates URLs", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("{}"); };
    await network.loadWeatherLocation(geoUrl, {fetchImpl, now: 1});
    await network.loadWeatherLocation(`${geoUrl}&language=en`, {fetchImpl, now: 2});
    assert.equal(calls, 2);
});
test("weather forecast cache keeps the exact TTL boundary fresh only before expiry", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response(`{"call":${calls}}`); };
    await network.loadWeatherForecast(weatherUrl, {fetchImpl, now: 1});
    await network.loadWeatherForecast(weatherUrl, {fetchImpl, now: 1 + network.WEATHER_TTL_MS - 1});
    assert.equal(calls, 1);
});
test("holiday years clamp below the supported range", async () => {
    let called = "";
    await network.loadHolidayYear(-1, {fetchImpl: async (url) => { called = url; return response("{}"); }, now: 1});
    assert.match(called, /\/2000\.json$/);
});
test("holiday years truncate fractional values", async () => {
    let called = "";
    await network.loadHolidayYear(2026.9, {fetchImpl: async (url) => { called = url; return response("{}"); }, now: 1});
    assert.match(called, /\/2026\.json$/);
});
test("holiday cache separates normalized years", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("{}"); };
    await network.loadHolidayYear(2026, {fetchImpl, now: 1});
    await network.loadHolidayYear(2027, {fetchImpl, now: 2});
    assert.equal(calls, 2);
});
test("Bangumi loader forwards caller signal", async () => {
    const controller = new AbortController();
    let received;
    await network.loadBangumiCalendar({signal: controller.signal, fetchImpl: async (_url, init) => { received = init.signal; return response("[]"); }, now: 1});
    assert.equal(received.aborted, false);
});
test("configured feed fresh result carries request timestamp", async () => {
    const result = await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response("{}"), now: 123});
    assert.equal(result.fetchedAt, 123);
});
test("configured feed cached result keeps original timestamp", async () => {
    await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response("{}"), now: 123});
    const result = await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response("{}"), now: 456});
    assert.deepEqual(result, {payload: {}, status: "cached", fetchedAt: 123});
});
test("configured feed stale result keeps original timestamp", async () => {
    await network.loadConfiguredFeed(newsUrl, {fetchImpl: async () => response('{"old":true}'), now: 123});
    const result = await network.loadConfiguredFeed(newsUrl, {fetchImpl: async () => { throw new Error("offline"); }, now: 123 + network.FEED_TTL_MS});
    assert.deepEqual(result, {payload: {old: true}, status: "stale", fetchedAt: 123});
});
test("configured feed HTTP failure can fall back to stale data", async () => {
    await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response('{"old":true}'), now: 10});
    const result = await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response("secret", {ok: false}), now: 10 + network.FEED_TTL_MS});
    assert.equal(result.status, "stale");
});
test("configured feed force refresh reports fresh status", async () => {
    await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response('{"n":1}'), now: 10});
    const result = await network.loadConfiguredFeed(feedUrl, {fetchImpl: async () => response('{"n":2}'), now: 20, force: true});
    assert.deepEqual(result, {payload: {n: 2}, status: "fresh", fetchedAt: 20});
});
test("configured feed cache keys keep providers separate", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("{}"); };
    await network.loadConfiguredFeed(feedUrl, {fetchImpl, now: 1});
    await network.loadConfiguredFeed(newsUrl, {fetchImpl, now: 2});
    assert.equal(calls, 2);
});
test("activity fresh result carries request timestamp", async () => {
    const result = await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response("{}"), now: 123});
    assert.deepEqual(result, {payload: {}, status: "fresh", fetchedAt: 123});
});
test("activity cached result keeps original timestamp", async () => {
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response("{}"), now: 123});
    const result = await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response("{}"), now: 456});
    assert.deepEqual(result, {payload: {}, status: "cached", fetchedAt: 123});
});
test("activity stale result keeps cached payload", async () => {
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response('{"old":true}'), now: 123});
    const result = await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => { throw new Error("offline"); }, now: 123 + network.ACTIVITYWATCH_TTL_MS});
    assert.deepEqual(result, {payload: {old: true}, status: "stale", fetchedAt: 123});
});
test("activity force refresh reports fresh status", async () => {
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response('{"n":1}'), now: 10});
    const result = await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response('{"n":2}'), now: 20, force: true});
    assert.deepEqual(result, {payload: {n: 2}, status: "fresh", fetchedAt: 20});
});
test("activity cache keys can be explicitly isolated", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response(`{"n":${calls}}`); };
    await network.loadActivityWatchSummary({...activityRequest, cacheKey: "one"}, {fetchImpl, now: 1});
    await network.loadActivityWatchSummary({...activityRequest, cacheKey: "two"}, {fetchImpl, now: 2});
    assert.equal(calls, 2);
});
test("activity loader rejects a missing request", async () => assert.rejects(network.loadActivityWatchSummary(null, {fetchImpl: async () => response("{}")} ), /blocked_endpoint/));
test("activity loader rejects an unapproved endpoint", async () => assert.rejects(network.loadActivityWatchSummary({url: "https://example.com", body: {}}, {fetchImpl: async () => response("{}")} ), /blocked_endpoint/));
test("cache remains bounded to sixteen entries", async () => {
    for (let i = 0; i < 20; i += 1) await network.loadWeatherForecast(`${weatherUrl}&slot=${i}`, {fetchImpl: async () => response("{}"), now: i + 1});
    assert.equal(network.lifeWidgetCacheSize(), 16);
});
test("cache clear is idempotent", () => { network.clearLifeWidgetCaches(); network.clearLifeWidgetCaches(); assert.equal(network.lifeWidgetCacheSize(), 0); });
test("cache size is zero before any request", () => assert.equal(network.lifeWidgetCacheSize(), 0));
