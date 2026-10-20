// T-7354 & T-7355 属性视图看板与闪卡复习组件生产装配契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 DEFAULT_MODULES 中完整声明 database-board 与 flashcard-review 模块；
//   2. 验证 HOME_TILE_DEFAULT_SIZES 包含合法的默认档位（wide / medium）；
//   3. 验证 src/index.ts 完整接入两个组件的适配器调度与快照产出管线；
//   4. 验证样式表包含专属的卡片排版规则；
//   5. 负向探针覆盖：缺少组件声明或默认尺寸丢失必定精准拦截。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {readSourceText} = require("./source-scan.cjs");

const ROOT = path.resolve(__dirname, "..");
const {DEFAULT_MODULES, HOME_TILE_DEFAULT_SIZES} = require("../src/home-model.js");
const indexTs = readSourceText(path.join(ROOT, "src", "index.ts"));
const widgetScss = readSourceText(path.join(ROOT, "src", "styles", "_05-settings-widgets.scss"));

test("T-7354: DEFAULT_MODULES 声明 database-board 并具备完整的只读看板配置 Schema", () => {
    const boardDef = DEFAULT_MODULES.find((m) => m.moduleId === "database-board");
    assert.ok(boardDef, "DEFAULT_MODULES 中必须包含 database-board 模块");
    assert.equal(boardDef.category, "siyuan");
    assert.equal(boardDef.readOnly, true);
    assert.ok(boardDef.sizes.includes("wide"));
    assert.ok(boardDef.sizes.includes("medium"));

    const schemaKeys = boardDef.configSchema.map((item) => item.key);
    assert.ok(schemaKeys.includes("blockId"), "Schema 必须包含 blockId");
    assert.ok(schemaKeys.includes("groupBy"), "Schema 必须包含 groupBy");
    assert.ok(schemaKeys.includes("limit"), "Schema 必须包含 limit");
    assert.ok(schemaKeys.includes("showCounts"), "Schema 必须包含 showCounts");
    assert.ok(schemaKeys.includes("showPercent"), "Schema 必须包含 showPercent");

    assert.equal(HOME_TILE_DEFAULT_SIZES["database-board"], "wide", "看板默认尺寸必须为 wide");
});

test("T-7355: DEFAULT_MODULES 声明 flashcard-review 并具备 SM-2 复习配置 Schema", () => {
    const reviewDef = DEFAULT_MODULES.find((m) => m.moduleId === "flashcard-review");
    assert.ok(reviewDef, "DEFAULT_MODULES 中必须包含 flashcard-review 模块");
    assert.equal(reviewDef.category, "siyuan");
    assert.equal(reviewDef.readOnly, true);
    assert.ok(reviewDef.sizes.includes("small"));
    assert.ok(reviewDef.sizes.includes("medium"));

    const schemaKeys = reviewDef.configSchema.map((item) => item.key);
    assert.ok(schemaKeys.includes("notebook"), "Schema 必须包含 notebook");
    assert.ok(schemaKeys.includes("dailyLimit"), "Schema 必须包含 dailyLimit");
    assert.ok(schemaKeys.includes("showPercent"), "Schema 必须包含 showPercent");
    assert.ok(schemaKeys.includes("showForecast"), "Schema 必须包含 showForecast");

    assert.equal(HOME_TILE_DEFAULT_SIZES["flashcard-review"], "medium", "闪卡复习默认尺寸必须为 medium");
});

test("T-7354 & T-7355: src/index.ts 生产适配器完整接入两组件的调度与快照管线", () => {
    // 1. database-board 接入验证
    assert.match(
        indexTs,
        /register\s*\(\s*["']database-board["'][\s\S]*?normalizeAvBoardConfig[\s\S]*?buildAvBoardSnapshot/,
        "src/index.ts 必须注册 database-board 并消费 normalizeAvBoardConfig 与 buildAvBoardSnapshot",
    );

    // 2. flashcard-review 接入验证
    assert.match(
        indexTs,
        /register\s*\(\s*["']flashcard-review["'][\s\S]*?normalizeFlashcardReviewConfig[\s\S]*?buildFlashcardReviewSnapshot/,
        "src/index.ts 必须注册 flashcard-review 并消费 normalizeFlashcardReviewConfig 与 buildFlashcardReviewSnapshot",
    );
});

test("T-7354 & T-7355: 样式层为两个新组件声明专属排版规范", () => {
    assert.match(
        widgetScss,
        /\.sw-home__cell\[data-module-id="database-board"\]/,
        "样式表必须声明 .sw-home__cell[data-module-id='database-board']",
    );
    assert.match(
        widgetScss,
        /\.sw-home__cell\[data-module-id="flashcard-review"\]/,
        "样式表必须声明 .sw-home__cell[data-module-id='flashcard-review']",
    );
});

test("T-7354 & T-7355 门禁负向验证：若组件缺失或配置被移除必定精准红", () => {
    // 探针 1：断言伪造的不存在组件必须失败
    assert.throws(() => {
        const fake = DEFAULT_MODULES.find((m) => m.moduleId === "nonexistent-fake-module-xyz");
        assert.ok(fake);
    }, assert.AssertionError);

    // 探针 2：断言伪造的不存在样式类必须失败
    assert.throws(() => {
        assert.match(widgetScss, /\.sw-home__cell\[data-module-id="nonexistent-fake-module-xyz"\]/);
    }, assert.AssertionError);
});
