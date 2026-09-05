// 常量自洽性测试。确保 MIN < MAX、范围合理、与 settings 默认值兼容。
// 用法: node tests/constants.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const constantsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'constants.ts'), 'utf8');
const compiled = ts.transpileModule(constantsSource, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017},
}).outputText;
const constantsModule = {exports: {}};
new Function('module', 'exports', compiled)(constantsModule, constantsModule.exports);
const constants = constantsModule.exports;

// 在内存中编译真实 constants.ts，确保测试断言不会与源码常量漂移；不生成临时文件。

const ranges = [
    // [min, max, label]
    [constants.DIALOG_WIDTH_MIN_PX, constants.DIALOG_WIDTH_MAX_PX, "DIALOG_WIDTH"],
    [constants.DIALOG_HEIGHT_MIN_PX, constants.DIALOG_HEIGHT_MAX_PX, "DIALOG_HEIGHT"],
    [constants.THUMB_HEIGHT_MIN_PX, constants.THUMB_HEIGHT_MAX_PX, "THUMB_HEIGHT"],
    [constants.MOBILE_THUMB_HEIGHT_MIN_PX, constants.MOBILE_THUMB_HEIGHT_MAX_PX, "MOBILE_THUMB_HEIGHT"],
    [constants.COLUMNS_MIN, constants.COLUMNS_MAX, "COLUMNS"],
    [constants.MOBILE_COLUMNS_MIN, constants.MOBILE_COLUMNS_MAX, "MOBILE_COLUMNS"],
];

test("range constants: MIN < MAX for all pairs", () => {
    for (const [min, max, label] of ranges) {
        assert.ok(min < max, `${label}: MIN (${min}) should be < MAX (${max})`);
        assert.ok(min >= 0, `${label}: MIN (${min}) should be >= 0`);
        assert.ok(max <= 8192, `${label}: MAX (${max}) should be <= 8192 (reasonable px upper bound)`);
    }
});

test("debounce/timing constants are positive integers", () => {
    const timing = [
        constants.SEARCH_DEBOUNCE_MS,
        constants.SAVE_DEBOUNCE_MS,
        constants.FAB_HIDE_DELAY_MS,
        constants.BACK_TOP_THRESHOLD_PX,
        constants.MESSAGE_DEFAULT_MS,
        constants.UPDATED_CACHE_MS,
        constants.TAB_SETTLE_MS,
        constants.TAB_VERIFY_TIMEOUT_MS,
    ];
    for (const v of timing) {
        assert.ok(Number.isInteger(v) && v > 0, `timing value ${v} should be positive integer`);
    }
});

test("document search constants are reasonable", () => {
    // DOC_RESULT_LIMIT (12) < DOC_SEARCH_CACHE_LIMIT (50) — 渲染上限小于缓存上限才有意义
    const {DOC_RESULT_LIMIT, DOC_SEARCH_CACHE_LIMIT} = constants;
    assert.ok(DOC_RESULT_LIMIT < DOC_SEARCH_CACHE_LIMIT,
        `DOC_RESULT_LIMIT (${DOC_RESULT_LIMIT}) should be < DOC_SEARCH_CACHE_LIMIT (${DOC_SEARCH_CACHE_LIMIT})`);
    assert.ok(DOC_RESULT_LIMIT >= 1, "DOC_RESULT_LIMIT should be >= 1");
    assert.ok(DOC_SEARCH_CACHE_LIMIT >= DOC_RESULT_LIMIT, "DOC_SEARCH_CACHE_LIMIT should be >= DOC_RESULT_LIMIT");
});

test("mru constants are reasonable", () => {
    // MRU_MAX (200)：最近使用页签列表上限，必须有界防止插件数据无限膨胀
    const {MRU_MAX} = constants;
    assert.ok(Number.isInteger(MRU_MAX) && MRU_MAX > 0, "MRU_MAX should be a positive integer");
    assert.ok(MRU_MAX >= 50 && MRU_MAX <= 2000, "MRU_MAX should be within a reasonable range (50-2000)");
});

// BLOCK_ID_RE：区分思源块 ID 与一次性 tab.id（UUID）。
// 收藏跳转只信任块 ID，此正则误判会导致有效条目被拒或 UUID 条目被放行
const {BLOCK_ID_RE} = constants;

test("BLOCK_ID_RE accepts siyuan block ids", () => {
    assert.ok(BLOCK_ID_RE.test("20260721173719-zlynli0"), "14-digit ts + lowercase suffix should match");
    assert.ok(BLOCK_ID_RE.test("20260721173719-ZLYNLI0"), "suffix case-insensitive should match");
    assert.ok(BLOCK_ID_RE.test("20260101000000-0123456"), "digit-only suffix should match");
});

test("BLOCK_ID_RE rejects uuid tab ids and malformed input", () => {
    assert.ok(!BLOCK_ID_RE.test("00bf168c-ec61-4722-abb8-757a1a296c6a"), "uuid tab.id must not match");
    assert.ok(!BLOCK_ID_RE.test(""), "empty string must not match");
    assert.ok(!BLOCK_ID_RE.test("20260721173719"), "missing suffix must not match");
    assert.ok(!BLOCK_ID_RE.test("1234-abc"), "short timestamp must not match");
    assert.ok(!BLOCK_ID_RE.test("20260721173719-"), "empty suffix must not match");
    assert.ok(!BLOCK_ID_RE.test("abc20260721173719-zlynli0"), "leading garbage must not match");
});
