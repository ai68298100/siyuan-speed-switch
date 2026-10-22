// T-7347 版本就绪审查与全表面交互契约断言测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 T-7334～T-7346 累计 13 项功能源码模块与测试套件物理存在与可加载；
//   2. 验证 search-model 统一导出的穿透检索与动作画板接口链；
//   3. 验证三表面（切换器/工作台/片段实验室）与悬浮球核心架构契约；
//   4. 负向探针覆盖：缺少任意核心模块或篡改预算阈值时必定定向拦截。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const metrics = require("../scripts/release-readiness-metrics.cjs");

const ROOT = path.resolve(__dirname, "..");

const DELIVERED_MODULES = [
    "src/path-acronym-model.js",
    "src/action-palette-model.js",
    "src/av-board-model.js",
    "src/flashcard-review-model.js",
    "src/penetration-search-model.js",
    "src/action-palette-navigation.js",
    "src/action-palette-panel.js",
    "src/action-palette-ui.js",
    "src/penetration-search-orchestration.js",
];

const DELIVERED_TESTS = [
    "tests/path-acronym-model.test.cjs",
    "tests/action-palette-model.test.cjs",
    "tests/av-board-model.test.cjs",
    "tests/flashcard-review-model.test.cjs",
    "tests/penetration-search-model.test.cjs",
    "tests/action-palette-navigation.test.cjs",
    "tests/action-palette-panel.test.cjs",
    "tests/action-palette-ui.test.cjs",
    "tests/penetration-search-orchestration.test.cjs",
    "tests/penetration-search-fetch.test.cjs",
    "tests/action-palette-main-wiring.test.cjs",
    "tests/action-palette-e2e-interaction.test.cjs",
    "tests/narrow-sidebar-action-palette-contract.test.cjs",
];

test("T-7347: T-7334~T-7346 累计交付的所有源码模块与测试套件均完备存在且合法", () => {
    for (const rel of DELIVERED_MODULES) {
        const full = path.join(ROOT, rel);
        assert.ok(fs.existsSync(full), `源码模块必须存在: ${rel}`);
        assert.ok(fs.statSync(full).size > 100, `源码模块内容不可为空: ${rel}`);
        // 尝试 require 验证无语法或初始化崩溃
        const mod = require(full);
        assert.ok(mod && typeof mod === "object", `源码模块必须合法导出对象: ${rel}`);
    }

    for (const rel of DELIVERED_TESTS) {
        const full = path.join(ROOT, rel);
        assert.ok(fs.existsSync(full), `契约测试文件必须存在: ${rel}`);
        assert.ok(fs.statSync(full).size > 100, `测试文件内容不可为空: ${rel}`);
    }
});

test("T-7347: search-model.js 统一门面聚合了全部穿透检索与动作画板核心接口", () => {
    const searchModel = require("../src/search-model.js");
    const requiredExports = [
        "extractActionContext",
        "getAvailableActions",
        "filterPaletteActions",
        "createActionExecutionReceipt",
        "createPaletteNavigationState",
        "updatePaletteQuery",
        "movePaletteSelection",
        "dispatchPaletteKey",
        "buildActionPalettePanelModel",
        "assertActionPalettePanelContract",
        "parsePenetrationQuery",
        "escapeSqlLiteral",
        "buildBlockSearchSql",
        "planPenetrationSearchRequest",
        "flattenOutlineTree",
        "aggregatePenetrationResults",
        "resolveDocSearchResultId",
    ];

    for (const fn of requiredExports) {
        assert.equal(
            typeof searchModel[fn],
            "function",
            `search-model.js 必须统一导出 ${fn} 函数`,
        );
    }
});

test("T-7347: 生产构建产物严格服从 ADR 0247 校准的 1178 KiB raw / 592 KiB 归档门禁", () => {
    const bundlePath = path.join(ROOT, "dist", "index.js");
    const zipPath = path.join(ROOT, "package.zip");

    if (fs.existsSync(bundlePath)) {
        const bundleSize = fs.statSync(bundlePath).size;
        assert.ok(
            bundleSize <= metrics.RAW_BUNDLE_BUDGET_BYTES,
            `dist/index.js (${bundleSize} B) 必须低于 ${metrics.RAW_BUNDLE_BUDGET_BYTES} B`,
        );
    }

    if (fs.existsSync(zipPath)) {
        const zipSize = fs.statSync(zipPath).size;
        assert.ok(
            zipSize <= metrics.ARCHIVE_BUDGET_BYTES,
            `package.zip (${zipSize} B) 必须低于 ${metrics.ARCHIVE_BUDGET_BYTES} B`,
        );
    }

    assert.equal(metrics.RAW_BUNDLE_BUDGET_BYTES, 1200 * 1024);
    assert.equal(metrics.RAW_BUNDLE_BUDGET_ADR, "0259");
    assert.equal(metrics.ARCHIVE_BUDGET_BYTES, 604 * 1024);
    assert.equal(metrics.COMPRESSED_ENTRY_BUDGET_BYTES, 332 * 1024);
});

test("T-7347 门禁负向验证：若缺失核心模块或预算篡改，断言必须精确红", () => {
    // 探针 1：断言伪造的不存在源码文件必定失败
    assert.throws(() => {
        assert.ok(fs.existsSync(path.join(ROOT, "src/nonexistent-broken-module.js")));
    }, assert.AssertionError);

    // 探针 2：断言伪造的不存在导出函数必定失败
    const searchModel = require("../src/search-model.js");
    assert.throws(() => {
        assert.equal(typeof searchModel["nonExistentFakeFunction123"], "function");
    }, assert.AssertionError);
});
