const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeClockLocale, buildLocalTimeSnapshot, normalizeWorldClockConfig, buildWorldClockSnapshot, millisecondsToNextMinute, WORLD_CLOCK_MAX_CITIES, CITY_TIME_ZONES} = require("../src/local-time-model.js");

test("clock locale keeps a supported BCP 47 tag", () => assert.equal(normalizeClockLocale("en-US"), "en-US"));
test("clock locale converts underscores used by SiYuan", () => assert.equal(normalizeClockLocale("zh_CN"), "zh-CN"));
test("clock locale trims surrounding whitespace", () => assert.equal(normalizeClockLocale("  en-US  "), "en-US"));
test("clock locale rejects malformed tags", () => assert.equal(normalizeClockLocale("bad_locale_tag", "en-US"), "en-US"));
test("clock locale rejects non-string values", () => assert.equal(normalizeClockLocale(null, "en-US"), "en-US"));

test("clock snapshot uses a fixed two-digit time", () => {
    const snapshot = buildLocalTimeSnapshot(new Date(2026, 8, 14, 7, 5), "en-US", {localTime: "Local"});
    assert.equal(snapshot.stat.value, "07:05");
});
test("clock snapshot includes localized date", () => {
    const snapshot = buildLocalTimeSnapshot(new Date(2026, 8, 14, 7, 5), "en-US");
    assert.match(snapshot.items[0].label, /September 14, 2026/);
});
test("clock snapshot includes localized weekday", () => {
    const snapshot = buildLocalTimeSnapshot(new Date(2026, 8, 14, 7, 5), "en-US");
    assert.match(snapshot.items[0].label, /Monday/);
});
test("clock snapshot keeps bounded local-time label", () => assert.equal(buildLocalTimeSnapshot(new Date(0), "en-US", {localTime: "x".repeat(80)}).stat.label.length, 32));
test("clock snapshot exposes no click target", () => assert.equal(buildLocalTimeSnapshot(new Date(0), "en-US").items[0].value, ""));
test("clock snapshot safely handles invalid Date", () => assert.doesNotThrow(() => buildLocalTimeSnapshot(new Date("bad"), "en-US")));

test("minute delay aligns an exact minute to the next minute", () => assert.equal(millisecondsToNextMinute(120000), 60025));
test("minute delay aligns the final millisecond with a small guard", () => assert.equal(millisecondsToNextMinute(179999), 26));
test("minute delay never falls below its guard", () => assert.ok(millisecondsToNextMinute(Number.MAX_SAFE_INTEGER) >= 25));
test("minute delay handles malformed input", () => assert.equal(millisecondsToNextMinute(Number.NaN), 60025));

// 世界时钟：完全离线的多城市时间，配置归一化 + Intl timeZone 渲染。
test("world clock config keeps only valid IANA zones", () => {
    const config = normalizeWorldClockConfig({cities: "Asia/Shanghai, Bad/Zone,  ,America/New_York;Europe/London，Asia/Shanghai"});
    assert.deepEqual(config.cities, ["Asia/Shanghai", "America/New_York", "Europe/London"]);
});
test("world clock config bounds the city list", () => {
    const many = Array.from({length: 20}, (_, index) => `Etc/GMT+${index}`).join(",");
    assert.equal(normalizeWorldClockConfig({cities: many}).cities.length, WORLD_CLOCK_MAX_CITIES);
});
test("world clock config rejects non-string input", () => assert.deepEqual(normalizeWorldClockConfig({cities: 42}).cities, []));
test("world clock falls back to local and UTC when unconfigured", () => {
    const snapshot = buildWorldClockSnapshot(new Date(2026, 8, 14, 7, 5), {}, {worldClock: "世界时钟", local: "本地"});
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "本地");
    assert.equal(snapshot.items[1].label, "UTC");
    assert.match(snapshot.items[0].value, /^\d{2}:\d{2}/);
});
test("world clock renders configured zones with UTC appended", () => {
    const snapshot = buildWorldClockSnapshot(new Date(2026, 8, 14, 7, 5), {cities: "Asia/Shanghai"}, {});
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "Shanghai");
    assert.match(snapshot.items[0].value, /^\d{2}:\d{2}/);
    assert.equal(snapshot.items[1].label, "UTC");
});
test("world clock keeps the same instant across zones", () => {
    const instant = new Date("2026-09-14T00:00:00.000Z");
    const snapshot = buildWorldClockSnapshot(instant, {cities: "Asia/Shanghai,Pacific/Honolulu"}, {});
    const hour = (row) => Number(row.value.match(/^(\d{2}):/)[1]);
    assert.equal((hour(snapshot.items[0]) - hour(snapshot.items[1]) + 24) % 24, 18);
});
test("world clock stat mirrors the first row", () => {
    const snapshot = buildWorldClockSnapshot(new Date(2026, 8, 14, 7, 5), {}, {worldClock: "世界时钟"});
    assert.equal(snapshot.stat.label, "世界时钟");
    assert.equal(snapshot.stat.value, snapshot.items[0].value);
});
test("world clock safely handles invalid Date", () => assert.doesNotThrow(() => buildWorldClockSnapshot(new Date("bad"), {cities: "Asia/Shanghai"})));

test('world clock cities accept offline Chinese city names via the built-in table (T-6690)', () => {
    // 中文名 → IANA 自动解析；合法 IANA 直通；未知名称沿用丢弃语义
    const normalized = normalizeWorldClockConfig({cities: '上海, 东京，纽约，Europe/London，亚特兰蒂斯'});
    assert.deepEqual(normalized.cities, ['Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London']);
    // 重复（中文与 IANA 混写指向同一时区）去重
    const deduped = normalizeWorldClockConfig({cities: '上海,Asia/Shanghai'});
    assert.deepEqual(deduped.cities, ['Asia/Shanghai']);
    // 表为纯静态：非城市名不误映射
    assert.equal(CITY_TIME_ZONES['亚特兰蒂斯'], undefined);
    assert.ok(CITY_TIME_ZONES['北京']);
});
