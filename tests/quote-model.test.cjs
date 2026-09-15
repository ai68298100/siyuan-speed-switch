const test = require("node:test");
const assert = require("node:assert/strict");
const quote = require("../src/quote-model.js");

test("quote library is bounded, sourced and duplicate-free", () => {
    assert.ok(quote.QUOTE_LIBRARY.length >= 40, "library size");
    assert.ok(quote.QUOTE_LIBRARY.length <= 64, "library cap");
    const seen = new Set();
    for (const entry of quote.QUOTE_LIBRARY) {
        assert.ok(entry.text && entry.text.length <= 120, `text bounded: ${entry.text}`);
        assert.ok(entry.source && entry.source.length <= 64, `source present: ${entry.source}`);
        assert.equal(seen.has(entry.text), false, `duplicate: ${entry.text}`);
        seen.add(entry.text);
    }
});
test("quote config parses three separator styles and drops empties and duplicates", () => {
    const custom = quote.normalizeDailyQuoteConfig({quotes: "甲 —— 出处一\n乙|出处二\n丙\n\n甲 —— 出处一\n"});
    assert.deepEqual(custom.custom, [
        {text: "甲", source: "出处一"},
        {text: "乙", source: "出处二"},
        {text: "丙", source: ""},
    ]);
});
test("quote config bounds line count and length", () => {
    const lines = Array.from({length: 60}, (_, index) => `语录${index}${"字".repeat(200)}`);
    const custom = quote.normalizeDailyQuoteConfig({quotes: lines.join("\n")}).custom;
    assert.equal(custom.length, 50);
    for (const entry of custom) {
        assert.ok(entry.text.length <= 160, "per-line cap");
    }
});
test("quote config rejects non-string input", () =>
    assert.deepEqual(quote.normalizeDailyQuoteConfig(null), {custom: []}));
test("quote date key uses local date components", () => {
    // 用本地时间分量构造（时区无关）：零点与 23:59 同键，次日键值不同。
    assert.equal(quote.dailyQuoteDateKey(new Date(2026, 0, 5)), "2026-01-05");
    assert.equal(quote.dailyQuoteDateKey(new Date(2026, 8, 6, 3, 4)), "2026-09-06");
    const morning = quote.dailyQuoteDateKey(new Date(2026, 8, 16, 0, 0, 0));
    const night = quote.dailyQuoteDateKey(new Date(2026, 8, 16, 23, 59, 59));
    assert.equal(morning, night);
    assert.notEqual(morning, quote.dailyQuoteDateKey(new Date(2026, 8, 17, 0, 0, 0)));
});
test("quote hash is deterministic for the same key", () =>
    assert.equal(quote.quoteDateHash("2026-09-16"), quote.quoteDateHash("2026-09-16")));
test("quote selection is stable within a day and varies across days", () => {
    const morning = quote.buildDailyQuoteSnapshot(new Date("2026-09-16T08:00:00"), {}, {});
    const evening = quote.buildDailyQuoteSnapshot(new Date("2026-09-16T23:30:00"), {}, {});
    assert.equal(morning.items[0].label, evening.items[0].label);
    assert.equal(morning.dateKey, evening.dateKey);
    // 48 条语录在确定性哈希下两天必不同（哈希均匀性足以覆盖相邻键）。
    const nextDay = quote.buildDailyQuoteSnapshot(new Date("2026-09-17T08:00:00"), {}, {});
    assert.notEqual(morning.items[0].label, nextDay.items[0].label);
});
test("quote snapshot carries text and source", () => {
    const snapshot = quote.buildDailyQuoteSnapshot(new Date("2026-09-16T08:00:00"), {}, {});
    const hit = quote.pickDailyQuote(quote.QUOTE_LIBRARY, snapshot.dateKey);
    assert.equal(snapshot.items[0].label, hit.text);
    assert.equal(snapshot.items[0].value, hit.source);
    assert.ok(snapshot.items.length === 1, "no source row for built-in library");
});
test("custom quotes replace the built-in library and append the source row", () => {
    const snapshot = quote.buildDailyQuoteSnapshot(new Date("2026-09-16T08:00:00"), {quotes: "自定义一 —— 某处"}, {source: "来源", customSource: "自定义语录"});
    assert.match(snapshot.items[0].label, /^自定义一$/);
    assert.equal(snapshot.items[0].value, "某处");
    assert.match(snapshot.items[1].label, /来源：自定义语录/);
});
test("custom quotes with an empty line list fall back to the built-in library", () => {
    const snapshot = quote.buildDailyQuoteSnapshot(new Date("2026-09-16T08:00:00"), {quotes: "\n\n"}, {});
    const expected = quote.buildDailyQuoteSnapshot(new Date("2026-09-16T08:00:00"), {}, {});
    assert.equal(snapshot.items[0].label, expected.items[0].label);
    assert.equal(snapshot.items.length, 1);
});
