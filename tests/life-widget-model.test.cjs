const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/life-widget-model.js");

const location = {latitude: 39.9042, longitude: 116.4074, label: "北京 · 北京市 · 中国"};
const rawLocation = {latitude: 39.9042, longitude: 116.4074, name: "北京", admin1: "北京市", country: "中国"};
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
        {id: 101, name: "Alpha", name_cn: "阿尔法", images: {large: "https://lain.bgm.tv/pic/cover/l/test.jpg"}, rating: {score: 8.26}, rank: 12},
        {id: 102, name: "Beta", name_cn: "", images: {common: "https://lain.bgm.tv/pic/cover/c/test.jpg"}},
    ]},
    {weekday: {id: 2, cn: "星期二"}, items: [{id: 201, name: "Tuesday", rating: {score: 7}}]},
    {weekday: {id: 7, cn: "星期日"}, items: [{id: 701, name: "Sunday"}]},
];

test("weather config strips controls from city", () => assert.equal(model.normalizeWeatherConfig({city: " 北\n京 "}).city, "北 京"));
test("weather config bounds city", () => assert.equal(model.normalizeWeatherConfig({city: "x".repeat(90)}).city.length, 64));
test("weather config defaults Celsius", () => assert.equal(model.normalizeWeatherConfig({temperatureUnit: "K"}).temperatureUnit, "°C"));
test("weather config preserves Fahrenheit", () => assert.equal(model.normalizeWeatherConfig({temperatureUnit: "°F"}).temperatureUnit, "°F"));
test("weather config clamps low forecast days", () => assert.equal(model.normalizeWeatherConfig({forecastDays: 1}).forecastDays, 2));
test("weather config clamps high forecast days", () => assert.equal(model.normalizeWeatherConfig({forecastDays: 20}).forecastDays, 5));
test("weather locale converts underscores", () => assert.equal(model.normalizeWeatherLocale("zh_CN"), "zh-CN"));
test("weather locale rejects malformed values", () => assert.equal(model.normalizeWeatherLocale("bad locale"), "zh-CN"));
test("geocoding requires at least two city characters", () => assert.equal(model.buildWeatherGeocodingUrl({city: "北"}), ""));
test("geocoding URL encodes city", () => assert.match(model.buildWeatherGeocodingUrl({city: "北京, 中国"}), /name=%E5%8C%97%E4%BA%AC%2C%20%E4%B8%AD%E5%9B%BD/));
test("geocoding URL sends a bounded language", () => assert.match(model.buildWeatherGeocodingUrl({city: "Paris"}, "fr-FR"), /language=fr/));
test("location normalizer accepts coordinates", () => assert.deepEqual(model.normalizeWeatherLocation({results: [rawLocation]}), location));
test("location normalizer rejects missing results", () => assert.equal(model.normalizeWeatherLocation({results: []}), null));
test("location normalizer rejects latitude overflow", () => assert.equal(model.normalizeWeatherLocation({results: [{latitude: 91, longitude: 0}]}), null));
test("location normalizer deduplicates labels", () => assert.equal(model.normalizeWeatherLocation({results: [{latitude: 1, longitude: 2, name: "A", admin1: "A", country: "B"}]}).label, "A · B"));
test("forecast URL includes fixed current fields", () => assert.match(model.buildWeatherForecastUrl(location, {}), /current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m/));
test("forecast URL includes fixed daily fields", () => assert.match(model.buildWeatherForecastUrl(location, {}), /daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max/));
test("forecast URL rounds coordinates", () => assert.match(model.buildWeatherForecastUrl(location, {}), /latitude=39\.9042&longitude=116\.4074/));
test("forecast URL enables Fahrenheit explicitly", () => assert.match(model.buildWeatherForecastUrl(location, {temperatureUnit: "°F"}), /temperature_unit=fahrenheit/));
test("forecast URL rejects invalid coordinates", () => assert.equal(model.buildWeatherForecastUrl({latitude: 0, longitude: 999}, {}), ""));
test("weather codes map clear", () => assert.equal(model.weatherCondition(0), "clear"));
test("weather codes map fog", () => assert.equal(model.weatherCondition(45), "fog"));
test("weather codes map rain", () => assert.equal(model.weatherCondition(61), "rain"));
test("weather codes map snow", () => assert.equal(model.weatherCondition(75), "snow"));
test("weather codes map storm", () => assert.equal(model.weatherCondition(99), "storm"));
test("unknown weather codes degrade cloudy", () => assert.equal(model.weatherCondition("bad"), "cloudy"));
test("clear weather distinguishes day and night", () => assert.notEqual(model.weatherIcon("clear", true), model.weatherIcon("clear", false)));
test("weather payload normalizes current values", () => assert.equal(model.normalizeWeatherPayload(forecast).temperature, 21.4));
test("weather payload bounds daily rows", () => assert.equal(model.normalizeWeatherPayload(forecast, 2).days.length, 2));
test("weather payload rejects missing current temperature", () => assert.equal(model.normalizeWeatherPayload({daily: forecast.daily}), null));
test("weather snapshot exposes location context", () => assert.equal(model.buildWeatherSnapshot(location, forecast, {}, {}).title, location.label));
test("weather snapshot exposes rounded temperature", () => assert.equal(model.buildWeatherSnapshot(location, forecast, {}, {}).stat.value, "21°"));
test("weather snapshot includes attribution link", () => assert.equal(model.buildWeatherSnapshot(location, forecast, {}, {}).items.at(-1).href, "https://open-meteo.com/"));
test("weather snapshot keeps configured day count", () => assert.equal(model.buildWeatherSnapshot(location, forecast, {forecastDays: 2}, {}).items.length, 3));
test("weather snapshot uses the supplied clock for today", () => assert.match(model.buildWeatherSnapshot(location, forecast, {}, {today: "Today", locale: "en-US"}, Date.parse("2026-09-14T08:00:00Z")).items[0].label, /^Today /));
test("weather snapshot rejects malformed forecast", () => assert.equal(model.buildWeatherSnapshot(location, {}, {}, {}), null));
test("holiday payload accepts canonical day", () => assert.deepEqual(model.normalizeHolidayPayload({year: 2026, days: [{name: "国庆节", date: "2026-10-01", isOffDay: true}]}, 2026), [{name: "国庆节", date: "2026-10-01", isOffDay: true}]));
test("holiday payload rejects wrong year", () => assert.deepEqual(model.normalizeHolidayPayload({year: 2025, days: []}, 2026), []));
test("holiday payload rejects malformed dates", () => assert.deepEqual(model.normalizeHolidayPayload({year: 2026, days: [{name: "X", date: "bad", isOffDay: true}]}, 2026), []));
test("holiday merge lets later announcements win", () => {
    const merged = model.mergeHolidayPayloads([{year: 2026, days: [{name: "旧", date: "2026-12-31", isOffDay: true}]}, {year: 2027, days: [{name: "新", date: "2026-12-31", isOffDay: false}]}]);
    assert.equal(merged.get("2026-12-31").name, "新");
});
test("holiday presentation separates off and work", () => {
    assert.equal(model.holidayPresentation({name: "春节", isOffDay: true}).kind, "off");
    assert.deepEqual(model.holidayPresentation({name: "春节", isOffDay: false}, {work: "班"}), {kind: "work", label: "春节 · 班"});
});
test("holiday presentation rejects malformed entries", () => assert.equal(model.holidayPresentation({name: "春节"}), null));
test("Bangumi config defaults to today", () => assert.equal(model.normalizeBangumiConfig({}).dayRange, "今天"));
test("Bangumi config keeps tomorrow", () => assert.equal(model.normalizeBangumiConfig({dayRange: "明天"}).dayRange, "明天"));
test("Bangumi config keeps week", () => assert.equal(model.normalizeBangumiConfig({dayRange: "本周"}).dayRange, "本周"));
test("Bangumi config rejects unknown ranges", () => assert.equal(model.normalizeBangumiConfig({dayRange: "全部"}).dayRange, "今天"));
test("Bangumi config clamps low limits", () => assert.equal(model.normalizeBangumiConfig({limit: 0}).limit, 2));
test("Bangumi config clamps high limits", () => assert.equal(model.normalizeBangumiConfig({limit: 99}).limit, 12));
test("Bangumi config defaults to six entries", () => assert.equal(model.normalizeBangumiConfig({}).limit, 6));
test("Bangumi config can hide covers", () => assert.equal(model.normalizeBangumiConfig({showCovers: "否"}).showCovers, false));
test("Bangumi config shows covers by default", () => assert.equal(model.normalizeBangumiConfig({}).showCovers, true));
test("Bangumi weekday uses ISO Monday", () => assert.equal(model.bangumiWeekdayId(new Date(2026, 8, 14, 12)), 1));
test("Bangumi weekday maps Sunday to seven", () => assert.equal(model.bangumiWeekdayId(new Date(2026, 8, 20, 12)), 7));
test("Bangumi weekday rejects invalid dates safely", () => assert.equal(model.bangumiWeekdayId("bad"), 1));
test("Bangumi cover accepts the official HTTPS cover host", () => assert.equal(model.normalizeBangumiCover("https://lain.bgm.tv/pic/cover/l/a.jpg"), "https://lain.bgm.tv/pic/cover/l/a.jpg"));
test("Bangumi cover rejects HTTP", () => assert.equal(model.normalizeBangumiCover("http://lain.bgm.tv/pic/cover/l/a.jpg"), ""));
test("Bangumi cover rejects lookalike hosts", () => assert.equal(model.normalizeBangumiCover("https://lain.bgm.tv.example.com/pic/cover/l/a.jpg"), ""));
test("Bangumi cover rejects non-cover paths", () => assert.equal(model.normalizeBangumiCover("https://lain.bgm.tv/avatar/a.jpg"), ""));
test("Bangumi calendar rejects non-arrays", () => assert.deepEqual(model.normalizeBangumiCalendar({}), []));
test("Bangumi calendar normalizes weekdays", () => assert.deepEqual(model.normalizeBangumiCalendar(bangumiCalendar).map((day) => day.weekday), [1, 2, 7]));
test("Bangumi calendar prefers Chinese titles", () => assert.equal(model.normalizeBangumiCalendar(bangumiCalendar)[0].items[0].title, "阿尔法"));
test("Bangumi calendar falls back to original titles", () => assert.equal(model.normalizeBangumiCalendar(bangumiCalendar)[0].items[1].title, "Beta"));
test("Bangumi calendar rounds scores to one decimal", () => assert.equal(model.normalizeBangumiCalendar(bangumiCalendar)[0].items[0].score, 8.3));
test("Bangumi calendar drops duplicate subjects within a day", () => {
    const payload = [{weekday: {id: 1}, items: [{id: 1, name: "A"}, {id: 1, name: "B"}]}];
    assert.equal(model.normalizeBangumiCalendar(payload)[0].items.length, 1);
});
test("Bangumi calendar drops malformed weekday ids", () => assert.deepEqual(model.normalizeBangumiCalendar([{weekday: {id: 0}, items: []}]), []));
test("Bangumi snapshot selects the local weekday", () => {
    const snapshot = model.buildBangumiSnapshot(bangumiCalendar, {}, {}, new Date(2026, 8, 14, 12));
    assert.deepEqual(snapshot.items.slice(0, -1).map((item) => item.label), ["阿尔法", "Beta"]);
});
test("Bangumi snapshot selects tomorrow independently of server order", () => {
    const snapshot = model.buildBangumiSnapshot([...bangumiCalendar].reverse(), {dayRange: "明天"}, {}, new Date(2026, 8, 14, 12));
    assert.equal(snapshot.items[0].label, "Tuesday");
});
test("Bangumi snapshot wraps Sunday tomorrow to Monday", () => {
    const snapshot = model.buildBangumiSnapshot(bangumiCalendar, {dayRange: "明天"}, {}, new Date(2026, 8, 20, 12));
    assert.equal(snapshot.items[0].label, "阿尔法");
});
test("Bangumi week snapshot starts from the local weekday", () => {
    const snapshot = model.buildBangumiSnapshot(bangumiCalendar, {dayRange: "本周", limit: 12}, {}, new Date(2026, 8, 15, 12));
    assert.match(snapshot.items[0].secondary, /^周二/);
});
test("Bangumi snapshot keeps a bounded number of titles", () => {
    const many = [{weekday: {id: 1}, items: Array.from({length: 30}, (_, id) => ({id: id + 1, name: `A${id}`}))}];
    assert.equal(model.buildBangumiSnapshot(many, {limit: 4}, {}, new Date(2026, 8, 14, 12)).items.length, 5);
});
test("Bangumi snapshot exposes safe subject links", () => assert.equal(model.buildBangumiSnapshot(bangumiCalendar, {}, {}, new Date(2026, 8, 14, 12)).items[0].href, "https://bgm.tv/subject/101"));
test("Bangumi snapshot includes source attribution", () => assert.equal(model.buildBangumiSnapshot(bangumiCalendar, {}, {}, new Date(2026, 8, 14, 12)).items.at(-1).href, "https://bgm.tv/calendar"));
test("Bangumi snapshot omits covers when configured", () => assert.equal(model.buildBangumiSnapshot(bangumiCalendar, {showCovers: "否"}, {}, new Date(2026, 8, 14, 12)).items[0].image, undefined));
test("Bangumi snapshot uses localized range labels", () => assert.match(model.buildBangumiSnapshot(bangumiCalendar, {}, {today: "Airing"}, new Date(2026, 8, 14, 12)).title, /^Airing/));
test("Bangumi snapshot rejects malformed payloads", () => assert.equal(model.buildBangumiSnapshot({}, {}, {}), null));

const dailyHotPayload = {
    title: "微博热搜", updateTime: "2026-09-14T12:00:00Z", fromCache: false,
    data: [
        {id: "a", title: "事件 A", url: "https://example.com/a", hot: 12345},
        {id: "b", title: "事件 B", mobileUrl: "https://example.com/b", hot: "热"},
    ],
};
const newsNowPayload = {id: "zhihu", items: [{id: "n1", title: "资讯一", url: "https://example.com/n1"}]};

test("feed config defaults to eight items", () => assert.equal(model.normalizeFeedConfig({}).limit, 8));
test("feed config clamps low limits", () => assert.equal(model.normalizeFeedConfig({limit: 1}).limit, 3));
test("feed config clamps high limits", () => assert.equal(model.normalizeFeedConfig({limit: 99}).limit, 12));
test("feed config hides heat explicitly", () => assert.equal(model.normalizeFeedConfig({showHot: "否"}).showHot, false));
test("feed config bounds endpoint text", () => assert.equal(model.normalizeFeedConfig({endpoint: "x".repeat(600)}).endpoint.length, 512));
test("configured DailyHot accepts a known API route", () => assert.equal(model.normalizeConfiguredFeedUrl("https://hot.example/api/weibo", "dailyhot"), "https://hot.example/api/weibo"));
test("configured DailyHot accepts a legacy root route", () => assert.equal(model.normalizeConfiguredFeedUrl("https://hot.example/zhihu", "dailyhot"), "https://hot.example/zhihu"));
test("configured DailyHot rejects unknown routes", () => assert.equal(model.normalizeConfiguredFeedUrl("https://hot.example/admin", "dailyhot"), ""));
test("configured DailyHot rejects query parameters", () => assert.equal(model.normalizeConfiguredFeedUrl("https://hot.example/weibo?token=x", "dailyhot"), ""));
test("configured NewsNow accepts one source id", () => assert.equal(model.normalizeConfiguredFeedUrl("https://news.example/api/s?id=zhihu", "newsnow"), "https://news.example/api/s?id=zhihu"));
test("configured NewsNow rejects missing source ids", () => assert.equal(model.normalizeConfiguredFeedUrl("https://news.example/api/s", "newsnow"), ""));
test("configured NewsNow rejects extra query parameters", () => assert.equal(model.normalizeConfiguredFeedUrl("https://news.example/api/s?id=zhihu&x=1", "newsnow"), ""));
test("configured feeds require HTTPS for remote hosts", () => assert.equal(model.normalizeConfiguredFeedUrl("http://news.example/api/s?id=zhihu", "newsnow"), ""));
test("configured feeds allow local HTTP development", () => assert.equal(model.normalizeConfiguredFeedUrl("http://127.0.0.1:4444/api/s?id=zhihu", "newsnow"), "http://127.0.0.1:4444/api/s?id=zhihu"));
test("configured feeds reject embedded credentials", () => assert.equal(model.normalizeConfiguredFeedUrl("https://u:p@news.example/api/s?id=zhihu", "newsnow"), ""));
test("configured feeds reject fragments", () => assert.equal(model.normalizeConfiguredFeedUrl("https://news.example/api/s?id=zhihu#x", "newsnow"), ""));
test("external item href accepts web links", () => assert.equal(model.normalizeExternalItemHref("https://example.com/a"), "https://example.com/a"));
test("external item href rejects executable links", () => assert.equal(model.normalizeExternalItemHref("javascript:alert(1)"), ""));
test("feed timestamp accepts seconds", () => assert.equal(model.normalizeFeedTimestamp(1700000000), 1700000000000));
test("feed timestamp accepts ISO dates", () => assert.equal(model.normalizeFeedTimestamp("2026-09-14T12:00:00Z"), Date.parse("2026-09-14T12:00:00Z")));
test("DailyHot payload reads data arrays", () => assert.equal(model.normalizeExternalFeedPayload(dailyHotPayload, "dailyhot", 8).items.length, 2));
test("NewsNow payload reads item arrays", () => assert.equal(model.normalizeExternalFeedPayload(newsNowPayload, "newsnow", 8).items[0].title, "资讯一"));
test("feed payload removes duplicate links", () => {
    const payload = {data: [{title: "A", url: "https://example.com/a"}, {title: "B", url: "https://example.com/a"}]};
    assert.equal(model.normalizeExternalFeedPayload(payload, "dailyhot", 8).items.length, 1);
});
test("feed payload rejects unknown providers", () => assert.equal(model.normalizeExternalFeedPayload(dailyHotPayload, "other", 8), null));
test("feed snapshot includes bounded rank", () => assert.equal(model.buildExternalFeedSnapshot({payload: dailyHotPayload, status: "fresh"}, {}, "dailyhot").items[0].rank, 1));
test("feed snapshot exposes heat when enabled", () => assert.match(model.buildExternalFeedSnapshot({payload: dailyHotPayload}, {}, "dailyhot", {hot: "热度"}).items[0].secondary, /12345/));
test("feed snapshot hides heat when configured", () => assert.equal(model.buildExternalFeedSnapshot({payload: dailyHotPayload}, {showHot: "否"}, "dailyhot").items[0].secondary, ""));
test("feed snapshot preserves stale health", () => assert.equal(model.buildExternalFeedSnapshot({payload: dailyHotPayload, status: "stale"}, {}, "dailyhot").sourceHealth, "stale"));
test("feed snapshot reflects upstream cache", () => assert.equal(model.buildExternalFeedSnapshot({payload: {...dailyHotPayload, fromCache: true}, status: "fresh"}, {}, "dailyhot").sourceHealth, "cached"));
test("feed snapshot includes official attribution", () => assert.equal(model.buildExternalFeedSnapshot({payload: newsNowPayload}, {}, "newsnow").items.at(-1).href, "https://github.com/ourongxing/newsnow"));

const activityPayload = [{
    app_events: [
        {duration: 5400, data: {app: "Code.exe"}},
        {duration: 1800, data: {app: "Browser"}},
        {duration: 1, data: {app: ""}},
    ],
    duration: 7200,
}];
test("ActivityWatch defaults to the standard loopback endpoint", () => assert.equal(model.normalizeActivityWatchConfig({}).endpoint, "http://127.0.0.1:5600"));
test("ActivityWatch accepts localhost custom ports", () => assert.equal(model.normalizeActivityWatchEndpoint("http://localhost:5601/"), "http://localhost:5601"));
test("ActivityWatch accepts IPv6 loopback", () => assert.equal(model.normalizeActivityWatchEndpoint("http://[::1]:5600"), "http://[::1]:5600"));
test("ActivityWatch rejects remote hosts", () => assert.equal(model.normalizeActivityWatchEndpoint("https://example.com"), ""));
test("ActivityWatch rejects credentials", () => assert.equal(model.normalizeActivityWatchEndpoint("http://u:p@localhost:5600"), ""));
test("ActivityWatch rejects paths", () => assert.equal(model.normalizeActivityWatchEndpoint("http://localhost:5600/api"), ""));
test("ActivityWatch rejects query and fragments", () => assert.equal(model.normalizeActivityWatchEndpoint("http://localhost:5600/?x=1#x"), ""));
test("ActivityWatch clamps range and app limit", () => assert.deepEqual(model.normalizeActivityWatchConfig({hours: 999, limit: 1}).hours, 168));
test("ActivityWatch request targets only query API", () => assert.equal(model.buildActivityWatchRequest({}).url, "http://127.0.0.1:5600/api/0/query/"));
test("ActivityWatch request carries one bounded time period", () => assert.equal(model.buildActivityWatchRequest({hours: 24}, Date.parse("2026-09-14T12:00:00Z")).body.timeperiods[0], "2026-09-13T12:00:00.000Z/2026-09-14T12:00:00.000Z"));
test("ActivityWatch query aggregates only by app", () => {
    const query = model.buildActivityWatchRequest({}).body.query.join("\n");
    assert.match(query, /merge_events_by_keys\(events, \["app"\]\)/);
    assert.doesNotMatch(query, /title/);
});
test("ActivityWatch query limits server-side results", () => assert.match(model.buildActivityWatchRequest({limit: 4}).body.query.join("\n"), /limit_events\(app_events, 4\)/));
test("ActivityWatch payload reads app durations", () => assert.equal(model.normalizeActivityWatchPayload(activityPayload).apps[0].seconds, 5400));
test("ActivityWatch payload filters nameless apps", () => assert.equal(model.normalizeActivityWatchPayload(activityPayload).apps.length, 2));
test("ActivityWatch payload rejects raw event arrays", () => assert.equal(model.normalizeActivityWatchPayload([{duration: 2, data: {app: "x"}}]), null));
test("ActivityWatch duration formats minutes", () => assert.equal(model.formatActivityDuration(1500), "25m"));
test("ActivityWatch duration formats hours", () => assert.equal(model.formatActivityDuration(7500), "2h 5m"));
test("ActivityWatch snapshot exposes total foreground time", () => assert.equal(model.buildActivityWatchSnapshot({payload: activityPayload}, {}).stat.value, "2h"));
test("ActivityWatch snapshot exposes ranked app rows", () => assert.equal(model.buildActivityWatchSnapshot({payload: activityPayload}, {}).items[1].rank, 2));
test("ActivityWatch snapshot preserves stale health", () => assert.equal(model.buildActivityWatchSnapshot({payload: activityPayload, status: "stale"}, {}).sourceHealth, "stale"));
test("ActivityWatch snapshot never exposes window titles", () => assert.doesNotMatch(JSON.stringify(model.buildActivityWatchSnapshot({payload: activityPayload}, {})), /title.*window/i));

// Hacker News 热门：Algolia hits → 有界排序列表快照。
const hackerNewsEnvelope = {status: "fresh", fetchedAt: 1000, payload: {hits: [
    {objectID: "1", title: "First story", url: "https://example.com/a", points: 120, num_comments: 45, created_at_i: 1757800000},
    {objectID: "2", title: "Second story", url: "", points: 10, num_comments: 2, created_at_i: 1757800100},
    {objectID: "3", title: "First story", url: "https://example.com/dup", points: 5, num_comments: 0, created_at_i: 1757800200},
    {objectID: "4", title: "", url: "https://example.com/empty", points: 1, num_comments: 0},
    {objectID: "javascript:alert(1)", title: "Malicious", url: "javascript:alert(1)", points: 1, num_comments: 0},
]}};
test("Hacker News config clamps the story limit", () => {
    assert.equal(model.normalizeHackerNewsConfig({limit: 999}).limit, 12);
    assert.equal(model.normalizeHackerNewsConfig({limit: 0}).limit, 3);
    assert.equal(model.normalizeHackerNewsConfig({}).limit, 8);
    assert.equal(model.normalizeHackerNewsConfig({showMeta: "否"}).showMeta, false);
});
test("Hacker News snapshot builds a ranked list with meta", () => {
    const snapshot = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {}, {points: "分", comments: "评"});
    assert.equal(snapshot.title, "Hacker News");
    assert.equal(snapshot.items.length, 3);
    assert.equal(snapshot.items[0].rank, 1);
    assert.equal(snapshot.items[0].label, "First story");
    assert.equal(snapshot.items[0].href, "https://example.com/a");
    assert.match(snapshot.items[0].secondary, /分 120 · 评 45/);
});
test("Hacker News snapshot falls back to the discussion link", () => {
    const snapshot = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {}, {});
    assert.equal(snapshot.items[1].href, "https://news.ycombinator.com/item?id=2");
});
test("Hacker News snapshot drops duplicates and unsafe links", () => {
    const snapshot = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {}, {});
    const labels = snapshot.items.map((item) => item.label);
    assert.equal(labels.filter((label) => label === "First story").length, 1);
    assert.equal(labels.includes("Malicious"), false);
});
test("Hacker News snapshot hides meta when configured", () =>
    assert.equal(model.buildHackerNewsSnapshot(hackerNewsEnvelope, {showMeta: "否"}, {}).items[0].secondary, ""));
test("Hacker News snapshot honors the story limit", () =>
    // limit 1 被钳制为最小 3；样本中仅 2 条有效故事，加来源行为 3 项。
    assert.equal(model.buildHackerNewsSnapshot(hackerNewsEnvelope, {limit: 1}, {}).items.length, 3));
test("Hacker News snapshot keeps stale health and newest timestamp", () => {
    const snapshot = model.buildHackerNewsSnapshot({...hackerNewsEnvelope, status: "stale"}, {}, {});
    assert.equal(snapshot.sourceHealth, "stale");
    assert.equal(snapshot.updatedAt, 1757800100000);
});
test("Hacker News snapshot appends the source row", () => {
    const snapshot = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {}, {source: "数据来源"});
    const last = snapshot.items[snapshot.items.length - 1];
    assert.match(last.label, /数据来源：Hacker News/);
    assert.equal(last.href, "https://news.ycombinator.com/");
});
test("Hacker News snapshot rejects an empty hit list", () =>
    assert.equal(model.buildHackerNewsSnapshot({status: "fresh", payload: {hits: []}}, {}, {}), null));

// Uptime Kuma：配置规范化 → 状态页/心跳解析 → 快照组装。
test("Uptime Kuma config normalizes origin and slug", () => {
    assert.deepEqual(model.normalizeUptimeKumaConfig({endpoint: "https://status.example.com/", slug: "Main"}), {origin: "https://status.example.com", slug: "main", showPing: true, showUptime: true});
});
test("Uptime Kuma config rejects remote http and malformed input", () => {
    assert.equal(model.normalizeUptimeKumaConfig({endpoint: "http://status.example.com", slug: "main"}).origin, "");
    assert.equal(model.normalizeUptimeKumaConfig({endpoint: "https://status.example.com/admin", slug: "main"}).origin, "");
    assert.equal(model.normalizeUptimeKumaConfig({endpoint: "https://user:pass@status.example.com", slug: "main"}).origin, "");
    assert.equal(model.normalizeUptimeKumaConfig({endpoint: "https://status.example.com", slug: "Bad_Slug"}).slug, "");
    assert.deepEqual(model.normalizeUptimeKumaConfig(null), {origin: "", slug: "", showPing: true, showUptime: true});
});
test("Uptime Kuma page URL builds status and heartbeat routes", () => {
    const config = {endpoint: "https://status.example.com", slug: "main"};
    assert.equal(model.buildUptimeKumaPageUrl(config), "https://status.example.com/api/status-page/main");
    assert.equal(model.buildUptimeKumaPageUrl(config, true), "https://status.example.com/api/status-page/heartbeat/main");
    assert.equal(model.buildUptimeKumaPageUrl({endpoint: "", slug: "main"}), "");
});
test("Uptime Kuma status parse keeps bounded monitors and incident", () => {
    const status = model.normalizeUptimeKumaStatus({
        config: {title: "服务面板"},
        incident: {title: "计划维护"},
        publicGroupList: [{monitorList: [{id: 1, name: "官网"}, {id: "bad", name: ""}, {id: 2, name: "API"}]}],
    });
    assert.equal(status.title, "服务面板");
    assert.equal(status.incident, "计划维护");
    assert.deepEqual(status.monitors, [{id: 1, name: "官网"}, {id: 2, name: "API"}]);
    assert.equal(model.normalizeUptimeKumaStatus(null), null);
});
test("Uptime Kuma heartbeat parse keeps latest beat and 24h uptime", () => {
    const heartbeat = model.normalizeUptimeKumaHeartbeat({
        heartbeatList: {"1": [{status: 0, ping: 10}, {status: 1, ping: 42}]},
        uptimeList: {"1_24": 0.995, "2_24": 2},
    });
    assert.deepEqual(heartbeat.latest["1"], {up: true, maintenance: false, ping: 42});
    assert.equal(heartbeat.uptime["1_24"], 0.995);
    assert.equal(heartbeat.uptime["2_24"], undefined);
});
const uptimeStatusEnvelope = {status: "fresh", fetchedAt: 1000, payload: {
    config: {title: "服务面板"},
    incident: {title: "计划维护"},
    publicGroupList: [{monitorList: [{id: 1, name: "官网"}, {id: 2, name: "API"}]}],
}};
const uptimeHeartbeatEnvelope = {status: "cached", fetchedAt: 2000, payload: {
    heartbeatList: {"1": [{status: 1, ping: 42}], "2": [{status: 0, ping: -1}]},
    uptimeList: {"1_24": 0.995, "2_24": 0.87},
}};
test("Uptime Kuma snapshot counts availability and pins the incident", () => {
    const snapshot = model.buildUptimeKumaSnapshot(uptimeStatusEnvelope, uptimeHeartbeatEnvelope, {}, {title: "服务状态", stat: "在线服务", up: "正常", down: "异常", incident: "事件", source: "数据来源"});
    assert.equal(snapshot.title, "服务面板");
    assert.deepEqual(snapshot.stat, {value: "1/2", label: "在线服务"});
    assert.match(snapshot.items[0].label, /事件：计划维护/);
    assert.equal(snapshot.items[1].label, "官网");
    assert.equal(snapshot.items[1].value, "正常 · 42ms · 99.50%");
    assert.equal(snapshot.items[2].value, "异常 · 87.00%");
    assert.match(snapshot.items[3].label, /数据来源：Uptime Kuma/);
    assert.equal(snapshot.sourceHealth, "cached");
    assert.equal(snapshot.updatedAt, 2000);
});
test("Uptime Kuma snapshot trusts the worse envelope health", () => {
    const snapshot = model.buildUptimeKumaSnapshot({...uptimeStatusEnvelope, status: "stale"}, uptimeHeartbeatEnvelope, {}, {});
    assert.equal(snapshot.sourceHealth, "stale");
});
test("Uptime Kuma snapshot requires at least one monitor", () =>
    assert.equal(model.buildUptimeKumaSnapshot({status: "fresh", payload: {publicGroupList: []}}, uptimeHeartbeatEnvelope, {}, {}), null));

// Frankfurter：货币白名单规范化 → 请求 URL → 快照组装。
test("Frankfurter config defaults to CNY base and filters quotes", () => {
    assert.deepEqual(model.normalizeFrankfurterConfig({base: "usd", quotes: " eur, jpy；EUR，XXX, usd, CNY, a, GBP"}), {base: "USD", quotes: ["EUR", "JPY", "CNY", "GBP"]});
    assert.deepEqual(model.normalizeFrankfurterConfig({base: "XXX", quotes: "USD"}), {base: "CNY", quotes: ["USD"]});
    assert.deepEqual(model.normalizeFrankfurterConfig(null), {base: "CNY", quotes: []});
    assert.deepEqual(model.normalizeFrankfurterConfig({quotes: "USD,EUR,JPY,GBP,HKD,SGD,AUD"}), {base: "CNY", quotes: ["USD", "EUR", "JPY", "GBP", "HKD", "SGD"]});
});
test("Frankfurter request URL is exact and allowlist-compatible", () => {
    assert.equal(model.buildFrankfurterRequestUrl({base: "CNY", quotes: ["USD", "EUR"]}), "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD,EUR");
    assert.equal(model.buildFrankfurterRequestUrl({base: "CNY", quotes: []}), "");
});
const frankfurterEnvelope = {status: "fresh", fetchedAt: 5000, payload: [
    {date: "2026-09-15", base: "CNY", quote: "USD", rate: 0.1402},
    {date: "2026-09-15", base: "CNY", quote: "EUR", rate: 0.1203},
    {date: "2026-09-15", base: "CNY", quote: "XXX", rate: -1},
]};
test("Frankfurter snapshot lists validated rates and keeps the date", () => {
    const snapshot = model.buildFrankfurterSnapshot(frankfurterEnvelope, {base: "CNY", quotes: ["USD", "EUR"]}, {title: "参考汇率", source: "数据来源", empty: "未取到"});
    assert.equal(snapshot.title, "参考汇率 · CNY");
    assert.deepEqual(snapshot.stat, {value: "0.1402", label: "CNY → USD"});
    assert.equal(snapshot.items[1].label, "CNY → EUR");
    assert.equal(snapshot.items[1].value, "0.1203");
    assert.match(snapshot.items[2].label, /数据来源：Frankfurter（ECB） · 2026-09-15/);
    assert.equal(snapshot.emptyHint, "");
    assert.equal(snapshot.sourceHealth, "fresh");
    assert.equal(snapshot.updatedAt, 5000);
});
test("Frankfurter snapshot returns null without rows or matching quotes", () => {
    assert.equal(model.buildFrankfurterSnapshot({status: "fresh", payload: []}, {}, {}), null);
    assert.equal(model.buildFrankfurterSnapshot(frankfurterEnvelope, {base: "CNY", quotes: ["JPY"]}, {}), null);
});
test("Frankfurter snapshot always appends the source row after rates", () => {
    const snapshot = model.buildFrankfurterSnapshot(frankfurterEnvelope, {base: "CNY", quotes: ["USD"]}, {empty: "未取到"});
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "CNY → USD");
    assert.match(snapshot.items[1].label, /数据来源：Frankfurter（ECB）/);
    assert.equal(snapshot.emptyHint, "");
});

// Miniflux：配置规范化 → 请求 URL → 条目解析 → 快照组装。
test("Miniflux config normalizes origin, token and limit", () => {
    assert.deepEqual(model.normalizeMinifluxConfig({endpoint: "https://rss.example.com/", token: " abc123 ", limit: "35"}), {origin: "https://rss.example.com", token: "abc123", limit: 35, sortBy: "newest", showFeed: true, showDate: true, showRank: false});
    assert.deepEqual(model.normalizeMinifluxConfig(null), {origin: "", token: "", limit: 20, sortBy: "newest", showFeed: true, showDate: true, showRank: false});
});
test("Miniflux config rejects remote http, userinfo and drift", () => {
    assert.equal(model.normalizeMinifluxConfig({endpoint: "http://rss.example.com", token: "t"}).origin, "");
    assert.equal(model.normalizeMinifluxConfig({endpoint: "https://user:pass@rss.example.com", token: "t"}).origin, "");
    assert.equal(model.normalizeMinifluxConfig({endpoint: "https://rss.example.com/v1/entries", token: "t"}).origin, "");
    assert.equal(model.normalizeMinifluxConfig({endpoint: "https://rss.example.com", token: "a\nb"}).token, "");
    assert.equal(model.normalizeMinifluxConfig({endpoint: "https://rss.example.com", token: "x".repeat(129)}).token, "");
});
test("Miniflux request URL builds the exact unread route", () => {
    // T-6446 起显式服务端排序（order/direction），与网络层白名单有结构化一致性门禁
    assert.equal(model.buildMinifluxRequestUrl({endpoint: "https://rss.example.com", token: "t", limit: 20}), "https://rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=desc");
    assert.equal(model.buildMinifluxRequestUrl({endpoint: "https://rss.example.com", token: "t", limit: 20, sortBy: "最旧优先"}), "https://rss.example.com/v1/entries?status=unread&limit=20&order=published_at&direction=asc");
    assert.equal(model.buildMinifluxRequestUrl({token: "t"}), "");
});
test("Miniflux entries parse keeps bounded fields and drops unsafe rows", () => {
    const parsed = model.normalizeMinifluxEntries({
        total: 42,
        entries: [
            {id: 1, title: "文章一", url: "https://a.example/x", feed: {title: "源A"}, published_at: "2026-09-16T01:02:03Z"},
            {id: 2, title: "js 注入", url: "javascript:alert(1)"},
            {id: 3, title: "http 源", url: "http://b.example/y"},
            {title: "缺 id", url: "https://a.example/y"},
            {id: 4},
        ],
    });
    assert.equal(parsed.total, 42);
    assert.equal(parsed.entries.length, 3);
    assert.equal(parsed.entries[0].published, "2026-09-16");
    assert.equal(parsed.entries[1].url, "");
    assert.equal(parsed.entries[2].url, "http://b.example/y");
    assert.equal(model.normalizeMinifluxEntries({entries: "bad"}), null);
    assert.equal(model.normalizeMinifluxEntries(null), null);
});
const minifluxEnvelope = {status: "fresh", fetchedAt: 7000, payload: {total: 42, entries: [
    {id: 1, title: "文章一", url: "https://a.example/x", feed: {title: "源A"}, published_at: "2026-09-16T01:02:03Z"},
    {id: 2, title: "文章二", url: "http://b.example/y", feed: {title: "源B"}, published_at: "2026-09-15T00:00:00Z"},
]}};
test("Miniflux snapshot lists unread with feed meta and the source row", () => {
    const snapshot = model.buildMinifluxSnapshot(minifluxEnvelope, {endpoint: "https://rss.example.com", token: "t"}, {title: "未读文章", unread: "未读", source: "数据来源"});
    assert.equal(snapshot.title, "未读文章");
    assert.deepEqual(snapshot.stat, {value: "42", label: "未读"});
    assert.equal(snapshot.items[0].label, "文章一");
    assert.equal(snapshot.items[0].value, "源A · 2026-09-16");
    assert.equal(snapshot.items[0].href, "https://a.example/x");
    assert.equal(snapshot.items[1].href, "http://b.example/y");
    assert.match(snapshot.items[2].label, /数据来源：Miniflux/);
    assert.equal(snapshot.sourceHealth, "fresh");
    assert.equal(snapshot.updatedAt, 7000);
});
test("Miniflux snapshot trusts stale health and rejects empty lists", () => {
    assert.equal(model.buildMinifluxSnapshot({...minifluxEnvelope, status: "stale"}, {}, {}).sourceHealth, "stale");
    assert.equal(model.buildMinifluxSnapshot({status: "fresh", payload: {total: 0, entries: []}}, {}, {}), null);
});

// --- GitHub 贡献快照（T-6289）：周汇总口径与失败归一 ---
test("GitHub contribution snapshot summarizes weeks and appends the profile link", () => {
    const text = JSON.stringify([
        {type: "PushEvent", created_at: "2026-09-15T08:00:00Z", payload: {size: 4}},
        {type: "WatchEvent", created_at: "2026-09-15T09:00:00Z"},
        {type: "CreateEvent", created_at: "2026-09-10T08:00:00Z"},
    ]);
    const snapshot = model.buildGithubContribSnapshot(text, {username: "torvalds"}, {title: "GitHub 贡献", empty: "无数据"}, Date.parse("2026-09-16T12:00:00Z"), "cached");
    assert.equal(snapshot.title, "GitHub 贡献");
    assert.equal(snapshot.sourceHealth, "cached");
    assert.equal(snapshot.items[0].label, "9/13–9/16");
    assert.equal(snapshot.items[0].value, "4", "star must not count toward the week");
    assert.equal(snapshot.items[1].value, "1");
    assert.equal(snapshot.items[snapshot.items.length - 1].href, "https://github.com/torvalds");
});

test("GitHub contribution snapshot rejects unusable payloads and configs", () => {
    assert.equal(model.buildGithubContribSnapshot("not json", {username: "torvalds"}), null);
    assert.equal(model.buildGithubContribSnapshot("[]", {username: "torvalds"}), null);
    assert.equal(model.buildGithubContribSnapshot("[]", {username: "bad_name"}), null);
});


// --- GitHub 贡献热力图格点（P3-1）：layout=grid 布局 ---
test("GitHub heatmap layout emits week-aligned bounded cells", () => {
    const text = JSON.stringify([
        {type: "PushEvent", created_at: "2026-09-15T08:00:00Z", payload: {size: 4}},
        {type: "WatchEvent", created_at: "2026-09-15T09:00:00Z"},
        {type: "CreateEvent", created_at: "2026-09-10T08:00:00Z"},
    ]);
    const snapshot = model.buildGithubContribSnapshot(text, {username: "torvalds", layout: "grid"}, {title: "GitHub 贡献", stat: "窗口内贡献总数"}, Date.parse("2026-09-16T12:00:00Z"), "cached");
    assert.equal(snapshot.items.length % 7, 0, "cells must be week-aligned");
    assert.ok(snapshot.items.length >= 84 && snapshot.items.length <= 371, `bounded cell count: ${snapshot.items.length}`);
    const active = snapshot.items.filter((cell) => cell.count > 0);
    assert.equal(active.length, 2, "star must not count as a contribution");
    assert.equal(active.find((cell) => cell.label === "2026-09-15").count, 4);
    assert.equal(active.find((cell) => cell.label === "2026-09-10").level, 1);
    assert.equal(snapshot.stat.value, "5");
    // T-6448：今日计数用与格点一致的 UTC 日期口径（2026-09-16 当日无事件 → 0）
    assert.equal(snapshot.stat.label, "窗口内贡献总数 · 今日 0");
    assert.ok(snapshot.title.includes("torvalds"), "title carries the username for the module header");
    assert.equal(snapshot.sourceHealth, "cached");
});

test("GitHub heatmap grid stays bounded at the longest window", () => {
    const events = [{type: "PushEvent", created_at: "2026-09-15T08:00:00Z", payload: {size: 3}}];
    const snapshot = model.buildGithubContribSnapshot(JSON.stringify(events), {username: "torvalds", windowDays: 366, layout: "grid"}, {}, Date.parse("2026-09-16T12:00:00Z"));
    assert.ok(snapshot.items.length <= 371, `371-cell cap: ${snapshot.items.length}`);
    assert.ok(snapshot.items.some((cell) => cell.outside === true), "padding cells are flagged outside the window");
});
