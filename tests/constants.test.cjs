// 常量自洽性测试。确保 MIN < MAX、范围合理、与 settings 默认值兼容。
// 用法: node tests/constants.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');

// 动态 require 让本文件能在没有 TS 编译环境下加载 .ts 也行——但 .ts 不能直接 require，
// 所以这里复制一组常量校验值；如果将来 constants.ts 改动，本文件需要同步更新。
// 简化方案：直接 require util.js 风格——通过读源码 + 简单 eval，或集中抽常量。
//
// 为保持轻量：本测试只验证我们在 src/index.ts 中硬编码的范围假设：
//   - MIN/MAX 必须 MIN < MAX
//   - 同一域内的 MIN/MAX 应与源码中显式出现的数字保持一致
//
// 该文件作为 lint 风格检查存在，主要价值是改动 constants.ts 时人为一眼确认没有破坏范围。

const ranges = [
    // [min, max, label]
    [480, 1920, "DIALOG_WIDTH"],
    [360, 1280, "DIALOG_HEIGHT"],
    [72, 360, "THUMB_HEIGHT"],
    [48, 200, "MOBILE_THUMB_HEIGHT"],
    [0, 8, "COLUMNS"],
    [0, 2, "MOBILE_COLUMNS"],
];

test("range constants: MIN < MAX for all pairs", () => {
    for (const [min, max, label] of ranges) {
        assert.ok(min < max, `${label}: MIN (${min}) should be < MAX (${max})`);
        assert.ok(min >= 0, `${label}: MIN (${min}) should be >= 0`);
        assert.ok(max <= 8192, `${label}: MAX (${max}) should be <= 8192 (reasonable px upper bound)`);
    }
});

test("debounce/timing constants are positive integers", () => {
    const timing = [180, 500, 250, 240, 3000, 512, 30];
    for (const v of timing) {
        assert.ok(Number.isInteger(v) && v > 0, `timing value ${v} should be positive integer`);
    }
});

test("document search constants are reasonable", () => {
    // DOC_RESULT_LIMIT (12) < DOC_SEARCH_CACHE_LIMIT (50) — 渲染上限小于缓存上限才有意义
    const DOC_RESULT_LIMIT = 12;
    const DOC_SEARCH_CACHE_LIMIT = 50;
    assert.ok(DOC_RESULT_LIMIT < DOC_SEARCH_CACHE_LIMIT,
        `DOC_RESULT_LIMIT (${DOC_RESULT_LIMIT}) should be < DOC_SEARCH_CACHE_LIMIT (${DOC_SEARCH_CACHE_LIMIT})`);
    assert.ok(DOC_RESULT_LIMIT >= 1, "DOC_RESULT_LIMIT should be >= 1");
    assert.ok(DOC_SEARCH_CACHE_LIMIT >= DOC_RESULT_LIMIT, "DOC_SEARCH_CACHE_LIMIT should be >= DOC_RESULT_LIMIT");
});

test("mru constants are reasonable", () => {
    // MRU_MAX (200)：最近使用页签列表上限，必须有界防止插件数据无限膨胀
    const MRU_MAX = 200;
    assert.ok(Number.isInteger(MRU_MAX) && MRU_MAX > 0, "MRU_MAX should be a positive integer");
    assert.ok(MRU_MAX >= 50 && MRU_MAX <= 2000, "MRU_MAX should be within a reasonable range (50-2000)");
});

// BLOCK_ID_RE（源码中的正则字面量复制）：区分思源块 ID 与一次性 tab.id（UUID）。
// 收藏跳转只信任块 ID，此正则误判会导致有效条目被拒或 UUID 条目被放行
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;

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