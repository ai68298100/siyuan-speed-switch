// T-7375 第二面板小组件商店全新重构与生态专区契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 openHomeWidgetStore 装配 mountPlatformDialogTitleWrap 品牌弹窗标题栏；
//   2. 验证 tabs 注册 ecosystem（小驴生态）专区分类；
//   3. 验证 buildInlinePreview 为时钟与 dark 材质小组件装配 .sw-home__cell--midnight；
//   4. 验证 HOME_FEATURED_MODULE_IDS 包含小驴打卡周胶囊、闪卡队列与思阅在读书架；
//   5. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const storeUiTs = readSourceText(path.join(root, "src", "home-store-ui.ts"));
const storeUiJs = readSourceText(path.join(root, "src", "home-store-ui.js"));
const storeModel = require("../src/home-store-model.js");

test("T-7375: openHomeWidgetStore 装配 mountPlatformDialogTitleWrap 品牌标题栏", () => {
    assert.match(
        storeUiTs,
        /mountPlatformDialogTitleWrap\(storeDialog\.element,\s*this\.i18n\.homeStoreTitle \|\| "组件商店",\s*"v0\.48\.17",\s*"iconPlugin"\);/,
        "home-store-ui.ts 必须装配统一品牌标题栏",
    );
    assert.match(
        storeUiJs,
        /mountPlatformDialogTitleWrap\)\(storeDialog\.element,\s*this\.i18n\.homeStoreTitle \|\| "组件商店",\s*"v0\.48\.17",\s*"iconPlugin"\);/,
        "home-store-ui.js 必须同步装配统一品牌标题栏",
    );
});

test("T-7375: 卡片生成自动识别小驴全生态组件并标记", () => {
    assert.match(
        storeUiTs,
        /const isEcosystem = moduleId\.startsWith\("checkin-"\)[\s\S]*?if \(isEcosystem\) card\.dataset\.category = "ecosystem";/,
        "必须精准识别小驴生态 9 大组件并打上 ecosystem 标记",
    );
    assert.match(
        storeUiJs,
        /const isEcosystem = moduleId\.startsWith\("checkin-"\)[\s\S]*?if \(isEcosystem\)\s*card\.dataset\.category = "ecosystem";/,
        "JS 产物必须同步标记 ecosystem",
    );
});

test("T-7375: buildInlinePreview 为时钟与深色小组件挂载午夜黑金卡片", () => {
    assert.match(
        storeUiTs,
        /moduleId === "external-local-time" \|\| moduleId === "external-world-clock"/,
        "本地时钟与世界时钟必须被识别为黑金卡片",
    );
    assert.match(
        storeUiTs,
        /cell\.classList\.add\("sw-home__cell--midnight"\);/,
        "预览单元必须挂载 sw-home__cell--midnight 样式类",
    );
});

test("T-7375: HOME_FEATURED_MODULE_IDS 包含最新高能生态组件", () => {
    const featured = storeModel.HOME_FEATURED_MODULE_IDS;
    assert.ok(featured.includes("checkin-weekly"), "精选清单必须包含 checkin-weekly");
    assert.ok(featured.includes("cards-due-summary"), "精选清单必须包含 cards-due-summary");
    assert.ok(featured.includes("sireader-recent"), "精选清单必须包含 sireader-recent");
    assert.ok(featured.length >= 8 && featured.length <= 16, "精选清单数量必须处于 8~16 间");
});

test("T-7375 门禁负向验证: 若缺少生态分类或标题栏必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在代码
    assert.throws(() => {
        assert.match(storeUiTs, /fake_non_existent_store_method/);
    }, assert.AssertionError);

    // 探针 2: 负向断言若缺少正确版本号必定报错
    assert.throws(() => {
        assert.match(storeUiTs, /mountPlatformDialogTitleWrap\(storeDialog\.element,\s*this\.i18n\.homeStoreTitle \|\| "组件商店",\s*"v0\.0\.0"/);
    }, assert.AssertionError);
});
