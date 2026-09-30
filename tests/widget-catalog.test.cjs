const {test} = require('node:test');
const assert = require('node:assert/strict');
const {WIDGET_CATALOG, WIDGET_CATALOG_STATES, resolveWidgetCatalogState} = require('../src/widget-catalog.js');
const catalog = require('../src/widget-catalog.js');
const home = require('../src/home-model.js');

test("widget catalog entries are unique, sized, and provider-tagged", () => {
    const ids = WIDGET_CATALOG.map((entry) => entry.moduleId);
    assert.equal(new Set(ids).size, ids.length, "catalog moduleIds must be unique");
    const validSizes = new Set(["xs", "small", "medium", "tall", "wide", "large", "full"]);
    WIDGET_CATALOG.forEach((entry) => {
        assert.ok(entry.providerPlugin.length > 0, "provider plugin required");
        assert.ok(entry.title.length > 0, "title required");
        assert.ok(entry.description.length > 0, "description required");
        assert.ok(entry.icon.startsWith("icon"), "icon should be a SiYuan icon id");
        entry.sizes.forEach((size) => assert.ok(validSizes.has(size), `unknown size ${size}`));
    });
});

test("widget catalog entries normalize as valid module definitions", () => {
    WIDGET_CATALOG.forEach((entry) => {
        const def = home.normalizeModuleDefinition({
            moduleId: entry.moduleId, title: entry.title, icon: entry.icon,
            category: "plugin", sizes: entry.sizes, description: entry.description,
        });
        assert.equal(def.moduleId, entry.moduleId);
        assert.ok(def.sizes.length > 0);
    });
});

test("widget catalog distinguishes ready, unavailable, and missing providers", () => {
    assert.deepEqual(WIDGET_CATALOG_STATES, ["ready", "unavailable", "missing"]);
    assert.equal(resolveWidgetCatalogState(new Set(["checkin-summary"]), [])[0].status, "ready");
    assert.equal(resolveWidgetCatalogState([], new Set(["checkin-summary"]))[0].status, "unavailable");
    assert.equal(resolveWidgetCatalogState([], [])[0].status, "missing");
    assert.equal(resolveWidgetCatalogState(null, 42)[0].status, "missing");
});

// T-7071：目录未登记的孤儿实例（提供方卸载，ADR 0103 保留语义）必须进入
// "当前不可用+显式清理"分区——否则如 calendar-recent-periodic 卸载后成为
// 不可见孤儿，widget-protocol.md 承诺的清理入口落空。
test("widget catalog: orphan configured moduleIds render as unavailable with cleanup (T-7071)", () => {
    const orphan = {entry: {moduleId: "calendar-recent-periodic"}, status: "unavailable", orphan: true};
    // 目录外已配置 + 非活跃 → 动态 unavailable 条目
    const state = catalog.resolveWidgetCatalogState([], new Set(["calendar-recent-periodic"]), ["calendar-recent-periodic"]);
    assert.equal(state.length, catalog.WIDGET_CATALOG.length + 1, "孤儿条目必须追加在目录条目之后");
    const extra = state[state.length - 1];
    assert.equal(extra.status, "unavailable");
    assert.equal(extra.entry.moduleId, "calendar-recent-periodic");
    assert.equal(extra.orphan, true, "动态条目必须带 orphan 标记（文案走专用键）");
    // 活跃（已注册）时不得出现孤儿条目
    const activeState = catalog.resolveWidgetCatalogState(new Set(["calendar-recent-periodic"]), new Set(["calendar-recent-periodic"]), ["calendar-recent-periodic"]);
    assert.ok(!activeState.some((item) => item.entry.moduleId === "calendar-recent-periodic"), "提供方已注册时孤儿条目必须消失");
    // 目录内登记的 moduleId 不重复生成
    const dupState = catalog.resolveWidgetCatalogState([], new Set(["checkin-summary"]), ["checkin-summary"]);
    assert.equal(dupState.filter((item) => item.entry.moduleId === "checkin-summary").length, 1, "目录登记项不得被孤儿逻辑重复生成");
});
