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
