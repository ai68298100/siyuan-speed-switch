const test = require("node:test");
const assert = require("node:assert/strict");
const {
    DEFAULT_NAVIGATION_LIMITS,
    NAVIGATION_GROUP_ORDER,
    buildNavigationResultModel,
} = require("../src/search-model.js");

test("navigation model orders groups and preserves provenance", () => {
    const model = buildNavigationResultModel({
        query: "  roadmap ",
        tabs: [{id: "tab-1", title: "当前页签"}],
        unifiedSections: [{key: "favorites", items: [{key: "fav-1", title: "收藏文档"}]}],
        opened: [{rootId: "root-1", title: "已打开文档"}],
        global: [{rootId: "root-2", title: "全库结果"}],
        actions: [{id: "open-settings", label: "打开设置"}],
    });

    assert.deepEqual(model.groups.map((group) => group.key), NAVIGATION_GROUP_ORDER);
    assert.equal(model.query, "roadmap");
    assert.equal(model.total, 5);
    assert.equal(model.groups[1].sections[0].items[0].navigationGroup, "unified");
    assert.equal(model.groups[1].sections[0].items[0].navigationSection, "favorites");
    assert.equal(model.groups[4].items[0].source, "actions");
    assert.equal(model.counts.unified.visible, 1);
});

test("navigation model bounds each group and the whole result", () => {
    const model = buildNavigationResultModel({
        tabs: Array.from({length: 5}, (_, index) => ({id: `tab-${index}`, title: `tab ${index}`})),
        unifiedSections: [{key: "favorites", items: Array.from({length: 5}, (_, index) => ({key: `fav-${index}`, title: `fav ${index}`}))}],
        maxItemsPerGroup: 2,
        maxTotalItems: 3,
    });

    assert.equal(model.groups[0].items.length, 2);
    assert.equal(model.groups[0].hidden, 3);
    assert.equal(model.total, 3);
    assert.equal(model.hiddenTotal, 7);
    assert.equal(model.limits.maxItemsPerGroup, 2);
    assert.equal(DEFAULT_NAVIGATION_LIMITS.maxTotalItems > model.total, true);
});

test("navigation model ignores malformed groups without throwing", () => {
    const model = buildNavigationResultModel({
        tabs: null,
        unifiedSections: [null, {}, {key: "", items: [{title: "discarded section"}]}],
        opened: "not-an-array",
        actions: [null, {label: "可执行动作"}],
    });

    assert.deepEqual(model.groups.map((group) => group.key), ["actions"]);
    assert.equal(model.groups[0].items[0].title, "可执行动作");
    assert.equal(model.groups[0].items[0].label, "可执行动作");
    assert.equal(model.groups[0].items[0].navigationKey, "actions:actions-1");
});
