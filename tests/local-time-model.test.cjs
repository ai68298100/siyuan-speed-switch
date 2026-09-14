const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeClockLocale, buildLocalTimeSnapshot, millisecondsToNextMinute} = require("../src/local-time-model.js");

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
