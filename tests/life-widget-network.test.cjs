const test = require("node:test");
const assert = require("node:assert/strict");
const network = require("../src/life-widget-network.js");

const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=Beijing&count=1";
const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2";
const holidayUrl = "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/2026.json";
const bangumiUrl = "https://api.bgm.tv/calendar";
const dailyHotUrl = "https://hot.example/api/weibo";
const newsNowUrl = "https://news.example/api/s?id=zhihu";
const activityWatchUrl = "http://127.0.0.1:5600/api/0/query/";
const activityRequest = {url: activityWatchUrl, cacheKey: "local:24:6", body: {timeperiods: ["2026-09-13T00:00:00.000Z/2026-09-14T00:00:00.000Z"], query: ["RETURN = {};"]}};
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
    assert.equal(network.FEED_TTL_MS, 30 * 60 * 1000);
    assert.equal(network.ACTIVITYWATCH_TTL_MS, 5 * 60 * 1000);
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
test("feed allowlist accepts DailyHot API routes", () => assert.equal(network.allowedConfiguredFeedUrl(dailyHotUrl), true));
test("feed allowlist accepts DailyHot root routes", () => assert.equal(network.allowedConfiguredFeedUrl("https://hot.example/weibo"), true));
test("feed allowlist accepts NewsNow source routes", () => assert.equal(network.allowedConfiguredFeedUrl(newsNowUrl), true));
test("feed allowlist permits HTTP only on localhost", () => assert.equal(network.allowedConfiguredFeedUrl("http://localhost:4444/api/s?id=zhihu"), true));
test("feed allowlist blocks remote HTTP", () => assert.equal(network.allowedConfiguredFeedUrl("http://news.example/api/s?id=zhihu"), false));
test("feed allowlist blocks DailyHot queries", () => assert.equal(network.allowedConfiguredFeedUrl(`${dailyHotUrl}?x=1`), false));
test("feed allowlist blocks NewsNow extra queries", () => assert.equal(network.allowedConfiguredFeedUrl(`${newsNowUrl}&x=1`), false));
test("feed allowlist blocks unknown paths", () => assert.equal(network.allowedConfiguredFeedUrl("https://hot.example/private"), false));
test("bounded fetch requires explicit configured-feed permission", async () => assert.rejects(network.fetchBoundedLifeJson(dailyHotUrl, {fetchImpl: async () => response("{}")} ), /blocked_endpoint/));
test("bounded fetch accepts an allowed configured feed explicitly", async () => assert.deepEqual(await network.fetchBoundedLifeJson(dailyHotUrl, {allowConfiguredFeed: true, fetchImpl: async () => response('{"ok":true}')}), {ok: true}));
test("bounded fetch refuses redirect following", async () => {
    let requestOptions = null;
    await network.fetchBoundedLifeJson(dailyHotUrl, {allowConfiguredFeed: true, fetchImpl: async (_url, options) => { requestOptions = options; return response("{}"); }});
    assert.equal(requestOptions.redirect, "error");
});
test("configured feed loader returns fresh data", async () => assert.equal((await network.loadConfiguredFeed(dailyHotUrl, {fetchImpl: async () => response('{"data":[]}'), now: 100})).status, "fresh"));
test("configured feed loader reuses fresh cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"data":[]}'); };
    await network.loadConfiguredFeed(dailyHotUrl, {fetchImpl, now: 100});
    const cached = await network.loadConfiguredFeed(dailyHotUrl, {fetchImpl, now: 200});
    assert.equal(cached.status, "cached");
    assert.equal(calls, 1);
});
test("configured feed loader exposes stale cache after failure", async () => {
    await network.loadConfiguredFeed(newsNowUrl, {fetchImpl: async () => response('{"items":[{"title":"old"}]}'), now: 100});
    const stale = await network.loadConfiguredFeed(newsNowUrl, {fetchImpl: async () => { throw new Error("offline"); }, now: 100 + network.FEED_TTL_MS});
    assert.equal(stale.status, "stale");
    assert.equal(stale.payload.items[0].title, "old");
});
test("configured feed loader fails without a stale cache", async () => assert.rejects(network.loadConfiguredFeed(dailyHotUrl, {fetchImpl: async () => { throw new Error("offline"); }}), /offline/));
test("configured feed loader force refresh bypasses a fresh cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response(`{"n":${calls}}`); };
    await network.loadConfiguredFeed(dailyHotUrl, {fetchImpl, now: 100});
    const fresh = await network.loadConfiguredFeed(dailyHotUrl, {fetchImpl, now: 200, force: true});
    assert.equal(fresh.payload.n, 2);
});
test("ActivityWatch allowlist accepts the exact loopback query route", () => assert.equal(network.allowedActivityWatchUrl(activityWatchUrl), true));
test("ActivityWatch allowlist accepts localhost HTTPS", () => assert.equal(network.allowedActivityWatchUrl("https://localhost:5600/api/0/query/"), true));
test("ActivityWatch allowlist rejects remote services", () => assert.equal(network.allowedActivityWatchUrl("https://example.com/api/0/query/"), false));
test("ActivityWatch allowlist rejects raw events routes", () => assert.equal(network.allowedActivityWatchUrl("http://127.0.0.1:5600/api/0/buckets/x/events"), false));
test("ActivityWatch allowlist rejects query parameters", () => assert.equal(network.allowedActivityWatchUrl(`${activityWatchUrl}?x=1`), false));
test("ActivityWatch fetch uses POST JSON and blocks redirects", async () => {
    let options;
    await network.fetchActivityWatchQuery(activityWatchUrl, activityRequest.body, {fetchImpl: async (_url, init) => { options = init; return response("[{}]"); }});
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["Content-Type"], "application/json");
});
test("ActivityWatch fetch blocks oversized requests", async () => assert.rejects(network.fetchActivityWatchQuery(activityWatchUrl, {query: ["x".repeat(9000)]}), /request_too_large/));
test("ActivityWatch fetch blocks oversized responses", async () => assert.rejects(network.fetchActivityWatchQuery(activityWatchUrl, {}, {fetchImpl: async () => response("x", {length: network.MAX_RESPONSE_BYTES + 1})}), /response_too_large/));
test("ActivityWatch loader returns fresh data", async () => assert.equal((await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response("[{}]"), now: 100})).status, "fresh"));
test("ActivityWatch loader reuses its five-minute cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[{}]"); };
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl, now: 100});
    assert.equal((await network.loadActivityWatchSummary(activityRequest, {fetchImpl, now: 200})).status, "cached");
    assert.equal(calls, 1);
});
test("ActivityWatch loader returns stale data after a failure", async () => {
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => response('[{"duration":1,"app_events":[]}]'), now: 100});
    const stale = await network.loadActivityWatchSummary(activityRequest, {fetchImpl: async () => { throw new Error("offline"); }, now: 100 + network.ACTIVITYWATCH_TTL_MS});
    assert.equal(stale.status, "stale");
});
test("ActivityWatch force refresh bypasses fresh cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[{}]"); };
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl, now: 100});
    await network.loadActivityWatchSummary(activityRequest, {fetchImpl, now: 200, force: true});
    assert.equal(calls, 2);
});

// Hacker News：字面量端点白名单 + 30 分钟缓存 + 陈旧缓存回退。
test("network allowlist accepts the exact Hacker News front page endpoint", () =>
    assert.equal(network.allowedLifeWidgetUrl(network.HACKER_NEWS_FRONT_PAGE_URL), true));
test("network allowlist rejects Hacker News parameter injection", () => {
    assert.equal(network.allowedLifeWidgetUrl(`${network.HACKER_NEWS_FRONT_PAGE_URL}&x=1`), false);
    assert.equal(network.allowedLifeWidgetUrl("https://hn.algolia.com/api/v1/search?tags=front_page"), false);
    assert.equal(network.allowedLifeWidgetUrl("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=999"), false);
    assert.equal(network.allowedLifeWidgetUrl("https://evil.example/api/v1/search?tags=front_page&hitsPerPage=12"), false);
});
test("Hacker News loader returns fresh data", async () =>
    assert.equal((await network.loadHackerNewsFrontPage({fetchImpl: async () => response('{"hits":[]}'), now: 100})).status, "fresh"));
test("Hacker News loader reuses its thirty-minute cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"hits":[]}'); };
    await network.loadHackerNewsFrontPage({fetchImpl, now: 100});
    assert.equal((await network.loadHackerNewsFrontPage({fetchImpl, now: 200})).status, "cached");
    assert.equal(calls, 1);
});
test("Hacker News loader expires after thirty minutes", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"hits":[]}'); };
    await network.loadHackerNewsFrontPage({fetchImpl, now: 100});
    await network.loadHackerNewsFrontPage({fetchImpl, now: 100 + network.HACKER_NEWS_TTL_MS});
    assert.equal(calls, 2);
});
test("Hacker News loader exposes stale cache after failure", async () => {
    await network.loadHackerNewsFrontPage({fetchImpl: async () => response('{"hits":[{"title":"old"}]}'), now: 100});
    const stale = await network.loadHackerNewsFrontPage({fetchImpl: async () => { throw new Error("offline"); }, now: 100 + network.HACKER_NEWS_TTL_MS});
    assert.equal(stale.status, "stale");
    assert.equal(stale.payload.hits[0].title, "old");
});
test("Hacker News loader fails without a stale cache", async () =>
    assert.rejects(network.loadHackerNewsFrontPage({fetchImpl: async () => { throw new Error("offline"); }}), /offline/));

// Uptime Kuma：用户端点 + 已知路由白名单 + 5 分钟缓存 + 陈旧缓存回退。
const uptimeOrigin = "https://status.example.com";
const uptimeSlug = "main";
test("network allowlist accepts exact Uptime Kuma status and heartbeat routes", () => {
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/${uptimeSlug}`, uptimeSlug), true);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/heartbeat/${uptimeSlug}`, uptimeSlug, true), true);
});
test("network allowlist rejects Uptime Kuma path drift and injection", () => {
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/other`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/${uptimeSlug}extra`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/heartbeat/${uptimeSlug}`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/${uptimeSlug}?x=1`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/${uptimeSlug}#f`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`https://user:pass@status.example.com/api/status-page/${uptimeSlug}`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/${uptimeSlug}`, "Main"), false);
    assert.equal(network.allowedUptimeKumaUrl(`${uptimeOrigin}/api/status-page/${uptimeSlug}`, "a"), false);
    assert.equal(network.allowedUptimeKumaUrl(`http://status.example.com/api/status-page/${uptimeSlug}`, uptimeSlug), false);
    assert.equal(network.allowedUptimeKumaUrl(`http://127.0.0.1:3001/api/status-page/${uptimeSlug}`, uptimeSlug), true);
});
test("Uptime Kuma loader returns fresh data", async () =>
    assert.equal((await network.loadUptimeKumaPage(`${uptimeOrigin}/api/status-page/${uptimeSlug}`, uptimeSlug, false, {fetchImpl: async () => response('{"publicGroupList":[]}'), now: 100})).status, "fresh"));
test("Uptime Kuma loader reuses its five-minute cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"publicGroupList":[]}'); };
    const url = `${uptimeOrigin}/api/status-page/heartbeat/${uptimeSlug}`;
    await network.loadUptimeKumaPage(url, uptimeSlug, true, {fetchImpl, now: 100});
    assert.equal((await network.loadUptimeKumaPage(url, uptimeSlug, true, {fetchImpl, now: 200})).status, "cached");
    assert.equal(calls, 1);
});
test("Uptime Kuma loader expires after five minutes", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"publicGroupList":[]}'); };
    const url = `${uptimeOrigin}/api/status-page/${uptimeSlug}`;
    await network.loadUptimeKumaPage(url, uptimeSlug, false, {fetchImpl, now: 100});
    await network.loadUptimeKumaPage(url, uptimeSlug, false, {fetchImpl, now: 100 + network.UPTIME_KUMA_TTL_MS});
    assert.equal(calls, 2);
});
test("Uptime Kuma loader exposes stale cache after failure", async () => {
    const url = `${uptimeOrigin}/api/status-page/${uptimeSlug}`;
    await network.loadUptimeKumaPage(url, uptimeSlug, false, {fetchImpl: async () => response('{"publicGroupList":[]}'), now: 100});
    const stale = await network.loadUptimeKumaPage(url, uptimeSlug, false, {fetchImpl: async () => { throw new Error("offline"); }, now: 100 + network.UPTIME_KUMA_TTL_MS});
    assert.equal(stale.status, "stale");
});
test("Uptime Kuma loader blocks drifted endpoints", async () =>
    assert.rejects(network.loadUptimeKumaPage(`${uptimeOrigin}/admin`, uptimeSlug, false, {fetchImpl: async () => response("{}")}), /blocked_endpoint/));

// Frankfurter：固定主机/路径 + ECB 货币白名单 + 12 小时缓存。
const frankfurterUrl = "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD,EUR";
test("network allowlist accepts the exact Frankfurter v2 rates endpoint", () =>
    assert.equal(network.allowedFrankfurterUrl(frankfurterUrl), true));
test("network allowlist rejects Frankfurter host, path and parameter drift", () => {
    assert.equal(network.allowedFrankfurterUrl("http://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://evil.example/v2/rates?base=CNY&quotes=USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.app/v2/rates?base=CNY&quotes=USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v1/rates?base=CNY&quotes=USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=CNY"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD&x=1"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=XXX&quotes=USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=CNY,USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD,USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD,EUR,JPY,GBP,HKD,SGD,AUD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://user:pass@api.frankfurter.dev/v2/rates?base=CNY&quotes=USD"), false);
    assert.equal(network.allowedFrankfurterUrl("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD#f"), false);
});
test("Frankfurter loader returns fresh data", async () =>
    assert.equal((await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl: async () => response("[]"), now: 100})).status, "fresh"));
test("Frankfurter loader reuses its twelve-hour cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[]"); };
    await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl, now: 100});
    assert.equal((await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl, now: 200})).status, "cached");
    assert.equal(calls, 1);
});
test("Frankfurter loader expires after twelve hours", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[]"); };
    await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl, now: 100});
    await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl, now: 100 + network.FRANKFURTER_TTL_MS});
    assert.equal(calls, 2);
});
test("Frankfurter loader exposes stale cache after failure", async () => {
    await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl: async () => response('[{"date":"2026-09-15","base":"CNY","quote":"USD","rate":0.14}]'), now: 100});
    const stale = await network.loadFrankfurterRates(frankfurterUrl, {fetchImpl: async () => { throw new Error("offline"); }, now: 100 + network.FRANKFURTER_TTL_MS});
    assert.equal(stale.status, "stale");
    assert.equal(stale.payload[0].rate, 0.14);
});
test("Frankfurter loader blocks drifted endpoints", async () =>
    assert.rejects(network.loadFrankfurterRates("https://api.frankfurter.dev/v2/latest?base=CNY", {fetchImpl: async () => response("[]")}), /blocked_endpoint/));

// Miniflux：用户实例 + 已知路由白名单 + X-Auth-Token 请求头（凭据不进 URL/缓存 key）。
const minifluxUrl = "https://rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=desc";
test("network allowlist accepts the exact Miniflux unread route", () =>
    assert.equal(network.allowedMinifluxUrl(minifluxUrl), true));
test("network allowlist rejects Miniflux route drift and injection", () => {
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=read&limit=20&order=published_at&direction=desc"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread&limit=51&order=published_at&direction=desc"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread&limit=20&order=id&direction=desc"), false, "order 漂移必须拒绝");
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=both"), false, "direction 漂移必须拒绝");
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread&limit=20&order=published_at"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread&limit=20&x=1"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/me?status=unread&limit=20&order=published_at&direction=desc"), false);
    assert.equal(network.allowedMinifluxUrl("http://rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=desc"), false);
    assert.equal(network.allowedMinifluxUrl("https://user:pass@rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=desc"), false);
    assert.equal(network.allowedMinifluxUrl("https://rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=desc#f"), false);
    assert.equal(network.allowedMinifluxUrl("http://127.0.0.1:8080/v1/entries?status=unread&limit=5&order=published_at&direction=desc"), true);
});
test("Miniflux loader sends the token via the X-Auth-Token header", async () => {
    let seen = null;
    const fetchImpl = async (url, init) => { seen = init; return response('{"total":0,"entries":[]}'); };
    await network.loadMinifluxEntries(minifluxUrl, "secret-token", {fetchImpl, now: 100});
    assert.equal(seen.headers["X-Auth-Token"], "secret-token");
});
test("Miniflux loader rejects malformed tokens before any request", async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return response("{}"); };
    await assert.rejects(network.loadMinifluxEntries(minifluxUrl, "bad\ntoken", {fetchImpl}), /invalid_token/);
    await assert.rejects(network.loadMinifluxEntries(minifluxUrl, "", {fetchImpl}), /invalid_token/);
    await assert.rejects(network.loadMinifluxEntries(minifluxUrl, "x".repeat(129), {fetchImpl}), /invalid_token/);
    assert.equal(called, false, "no network request with a malformed token");
});
test("Miniflux loader caches by URL so the token never enters the cache key", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"total":1,"entries":[]}'); };
    await network.loadMinifluxEntries(minifluxUrl, "token-a", {fetchImpl, now: 100});
    const second = await network.loadMinifluxEntries(minifluxUrl, "token-b", {fetchImpl, now: 200});
    assert.equal(second.status, "cached");
    assert.equal(calls, 1);
});
test("Miniflux loader returns fresh data and expires after fifteen minutes", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response('{"total":0,"entries":[]}'); };
    await network.loadMinifluxEntries(minifluxUrl, "t", {fetchImpl, now: 100});
    await network.loadMinifluxEntries(minifluxUrl, "t", {fetchImpl, now: 100 + network.MINIFLUX_TTL_MS});
    assert.equal(calls, 2);
});
test("Miniflux loader exposes stale cache after failure", async () => {
    await network.loadMinifluxEntries(minifluxUrl, "t", {fetchImpl: async () => response('{"total":3,"entries":[]}'), now: 100});
    const stale = await network.loadMinifluxEntries(minifluxUrl, "t", {fetchImpl: async () => { throw new Error("offline"); }, now: 100 + network.MINIFLUX_TTL_MS});
    assert.equal(stale.status, "stale");
    assert.equal(stale.payload.total, 3);
});
test("Miniflux loader blocks drifted endpoints", async () =>
    assert.rejects(network.loadMinifluxEntries("https://rss.example.com/v1/me", "t", {fetchImpl: async () => response("{}")}), /blocked_endpoint/));

// --- GitHub 贡献（T-6289）：端点白名单、分页、token 头与缓存语义 ---
test("GitHub endpoint allowlist accepts only the official events route", () => {
    assert.equal(network.allowedGithubEventsUrl("https://api.github.com/users/torvalds/events/public?per_page=100&page=1"), true);
    assert.equal(network.allowedGithubEventsUrl("http://api.github.com/users/torvalds/events/public"), false);
    assert.equal(network.allowedGithubEventsUrl("https://evil.example/users/torvalds/events/public"), false);
    assert.equal(network.allowedGithubEventsUrl("https://api.github.com/users/torvalds/events/public?per_page=100&x=1"), false);
    assert.equal(network.allowedGithubEventsUrl("https://api.github.com/users/torvalds/followers"), false);
});

test("GitHub loader rejects malformed usernames and tokens before any request", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response("[]"); };
    await assert.rejects(network.loadGithubEvents({username: "bad_name"}, {fetchImpl}), /blocked_endpoint/);
    await assert.rejects(network.loadGithubEvents({username: "torvalds", token: "bad\ntoken"}, {fetchImpl}), /invalid_token/);
    assert.equal(calls, 0, "no network request with malformed input");
});

test("GitHub loader fetches pages until a short page and stops", async () => {
    const requested = [];
    let calls = 0;
    const fullPage = Array.from({length: 100}, () => ({type: "CreateEvent", created_at: "2026-09-10T00:00:00Z"}));
    const fetchImpl = async (url) => { const first = calls++ === 0; requested.push(url); return response(JSON.stringify(first ? fullPage : [])); };
    const result = await network.loadGithubEvents({username: "torvalds", pages: 3}, {fetchImpl, now: 1000});
    assert.equal(result.status, "fresh");
    assert.equal(requested.length, 2, "full page continues, short page stops");
    assert.ok(requested[1].includes("page=2"));
});

test("GitHub loader caches by username so the token never enters the cache key", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return response(JSON.stringify([{type: "CreateEvent", created_at: "2026-09-10T00:00:00Z"}])); };
    await network.loadGithubEvents({username: "torvalds", token: "token-a"}, {fetchImpl, now: 1000});
    const second = await network.loadGithubEvents({username: "torvalds", token: "token-b"}, {fetchImpl, now: 2000});
    assert.equal(second.status, "cached");
    assert.equal(calls, 1);
});

test("GitHub loader sends the token via the Authorization header", async () => {
    const seen = [];
    const fetchImpl = async (url, init) => { seen.push(init && init.headers ? init.headers.Authorization : ""); return response("[]"); };
    await network.loadGithubEvents({username: "torvalds", token: "ghp_ok"}, {fetchImpl, now: 5000});
    assert.equal(seen[0], "Bearer ghp_ok");
});

test("GitHub loader falls back to stale cache on failure", async () => {
    let ok = true;
    const fetchImpl = async () => ok ? response(JSON.stringify([{type: "CreateEvent", created_at: "2026-09-10T00:00:00Z"}])) : Promise.reject(new Error("network down"));
    await network.loadGithubEvents({username: "torvalds"}, {fetchImpl, now: 1000});
    ok = false;
    const second = await network.loadGithubEvents({username: "torvalds"}, {fetchImpl, now: 1000 + network.GITHUB_TTL_MS + 1});
    assert.equal(second.status, "stale");
});

test("the text fetch variant returns raw text instead of parsing JSON (D-397 regression)", async () => {
    // 回归门禁：iCal 文本抓取曾因 responseKind 被忽略而恒抛 invalid_json。
    const fetchImpl = async () => response("BEGIN:VCALENDAR\r\nEND:VCALENDAR");
    const result = await network.loadIcalText("https://calendar.example.com/feed.ics", {fetchImpl, now: 1000});
    assert.equal(typeof result.text, "string");
    assert.match(result.text, /BEGIN:VCALENDAR/);
});
