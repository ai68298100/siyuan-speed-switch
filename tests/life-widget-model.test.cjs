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
