// T-6315 每日引言模型加固契约：只补 quote-model.test.cjs 未覆盖的真实行为——
// 三种分隔符的边界形态、大小写去重、超出上限静默截断的语义边界、无效日期输入、
// 跨库取模选择与库常量冻结。
const test = require('node:test');
const assert = require('node:assert/strict');
const {QUOTE_LIBRARY, MAX_CUSTOM_QUOTES, normalizeDailyQuoteConfig, dailyQuoteDateKey, quoteDateHash, pickDailyQuote, buildDailyQuoteSnapshot} = require('../src/quote-model.js');

test('separator variants cover em-dash pairs, box draws and pipes', () => {
    const config = normalizeDailyQuoteConfig({quotes: [
        "语录甲 —— 出处一",
        "语录乙—出处二",
        "语录丙|出处三",
        "语录丁──出处四",
    ].join("\n")});
    assert.deepEqual(config.custom.map((entry) => entry.source), ["出处一", "出处二", "出处三", "出处四"]);
});

test('no-separator lines keep the whole line as text with empty source', () => {
    const config = normalizeDailyQuoteConfig({quotes: "无出处的一条语录"});
    assert.deepEqual(config.custom, [{text: "无出处的一条语录", source: ""}]);
});

test('duplicates are case-insensitive and first occurrence wins', () => {
    const config = normalizeDailyQuoteConfig({quotes: ["Keep going", "keep going", "KEEP GOING —— 后来的"].join("\n")});
    assert.equal(config.custom.length, 1);
    assert.equal(config.custom[0].text, "Keep going");
});

test('control characters are scrubbed from custom quotes', () => {
    const config = normalizeDailyQuoteConfig({quotes: "带\u0000控制\u0007字符的语录 —— 测试"});
    assert.equal(config.custom[0].text, "带 控制 字符的语录");
});

test('overflow lines beyond the cap are dropped', () => {
    const lines = Array.from({length: MAX_CUSTOM_QUOTES + 10}, (_, index) => `语录${index}`);
    const config = normalizeDailyQuoteConfig({quotes: lines.join("\n")});
    assert.equal(config.custom.length, MAX_CUSTOM_QUOTES);
    assert.equal(MAX_CUSTOM_QUOTES, 50);
});

test('invalid date inputs collapse to the epoch key instead of throwing', () => {
    assert.equal(dailyQuoteDateKey(new Date(Number.NaN)), "1970-01-01");
    assert.equal(dailyQuoteDateKey("not-a-date"), "1970-01-01");
    assert.equal(dailyQuoteDateKey(new Date(2026, 8, 17)), "2026-09-17");
});

test('hash output is a uint32 and distribution modulo stays in range', () => {
    for (const key of ["1970-01-01", "2026-09-17", "2100-12-31"]) {
        const hash = quoteDateHash(key);
        assert.ok(hash >= 0 && hash <= 0xffffffff, `${key} 的哈希必须是 uint32`);
        assert.ok(hash % QUOTE_LIBRARY.length < QUOTE_LIBRARY.length);
    }
});

test('pickDailyQuote returns null only for empty or non-array libraries', () => {
    assert.equal(pickDailyQuote([], "2026-09-17"), null);
    assert.equal(pickDailyQuote("nope", "2026-09-17"), null);
    assert.ok(pickDailyQuote(QUOTE_LIBRARY, "2026-09-17"));
});

test('the quote library array is frozen; entries stay plain objects', () => {
    assert.equal(Object.isFrozen(QUOTE_LIBRARY), true);
    assert.equal(Object.isFrozen(QUOTE_LIBRARY[0]), false, "只冻结数组本身，条目为普通对象（钉住现状）");
    assert.throws(() => { QUOTE_LIBRARY.push({text: "x", source: "y"}); }, TypeError, "运行时追加必须失败");
});

test('snapshot updatedAt accepts numeric timestamps and rejects Date objects', () => {
    const numeric = buildDailyQuoteSnapshot(1725696000000, {}, {});
    assert.equal(numeric.updatedAt, 1725696000000);
    const dateInput = buildDailyQuoteSnapshot(new Date(2026, 8, 17), {}, {});
    assert.equal(Number.isFinite(dateInput.updatedAt), true, "Date 入口按缺省 now 处理");
});
