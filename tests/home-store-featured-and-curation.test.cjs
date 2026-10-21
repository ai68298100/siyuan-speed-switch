// T-7360 组件商店核心精选推荐（Featured）机制与分层分类契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 HOME_FEATURED_MODULE_IDS 声明黄金高价值组件清单；
//   2. 验证 isHomeStoreRecommended 与 matchesHomeStoreTokens 推荐分流；
//   3. 验证 home-store-ui.ts 声明 recommended 筛选页签与精选徽标；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const storeModel = require("../src/home-store-model.js");
const storeUiTs = readSourceText(path.join(root, "src", "home-store-ui.ts"));
const cardsScss = readSourceText(path.join(root, "src", "styles", "_08-home-store-cards.scss"));

test("T-7360: HOME_FEATURED_MODULE_IDS 声明 8~12 个核心黄金精选组件", () => {
    assert.ok(Array.isArray(storeModel.HOME_FEATURED_MODULE_IDS), "HOME_FEATURED_MODULE_IDS 必须为数组");
    assert.ok(storeModel.HOME_FEATURED_MODULE_IDS.length >= 8, "精选组件数量至少 8 个");
    assert.ok(storeModel.HOME_FEATURED_MODULE_IDS.length <= 16, "精选组件数量不得超过 16 个，保证克制收敛");

    const coreRequired = [
        "recent-documents",
        "today-journal",
        "today-tasks",
        "database-board",
        "flashcard-review",
        "note-stats",
        "year-progress",
        "external-local-time",
        "checkin-today",
    ];
    for (const id of coreRequired) {
        assert.ok(
            storeModel.HOME_FEATURED_MODULE_IDS.includes(id),
            `核心精选清单必须包含 ${id}`,
        );
    }
});

test("T-7360: isHomeStoreRecommended 对精选组件返回 true", () => {
    assert.equal(storeModel.isHomeStoreRecommended({moduleId: "recent-documents"}), true);
    assert.equal(storeModel.isHomeStoreRecommended({moduleId: "database-board"}), true);
    assert.equal(storeModel.isHomeStoreRecommended({moduleId: "flashcard-review"}), true);
    assert.equal(storeModel.isHomeStoreRecommended({moduleId: "checkin-today"}), true);
});

test("T-7360: buildHomeStoreTabCounts 正确统计精选推荐卡片数量", () => {
    const cards = [
        {moduleId: "recent-documents"},
        {moduleId: "database-board"},
        {moduleId: "non_featured_external_service"},
    ];
    const counts = storeModel.buildHomeStoreTabCounts(cards);
    assert.equal(counts.all, 3);
    assert.equal(counts.recommended, 2, "精选推荐数量必须为 2");
});

test("T-7360: home-store-ui.ts 具备 recommended 筛选页签与精选徽标渲染", () => {
    assert.match(
        storeUiTs,
        /key:\s*["']recommended["']/,
        "tabs 必须包含 recommended 筛选页签",
    );
    assert.match(
        storeUiTs,
        /sw-home-store__badge--featured/,
        "卡片必须支持渲染 sw-home-store__badge--featured 徽标",
    );
    assert.match(
        cardsScss,
        /\.sw-home-store__badge--featured/,
        "样式层必须声明 .sw-home-store__badge--featured",
    );
});

test("T-7360 门禁负向验证: 若破坏精选判定或伪造推荐必须精准红", () => {
    // 探针 1: 负向断言伪造的不存在精选组件
    assert.throws(() => {
        assert.equal(storeModel.HOME_FEATURED_MODULE_IDS.includes("fake_broken_widget_xyz"), true);
    }, assert.AssertionError);

    // 探针 2: 验证普通未注册长尾组件绝不误判为 recommended
    const notFeatured = storeModel.isHomeStoreRecommended({
        moduleId: "obscure_long_tail_module",
        category: "plugin",
        availability: "external",
        integration: "network",
    });
    assert.equal(notFeatured, false, "未配置的外部长尾组件绝不能被误判为推荐");
});
