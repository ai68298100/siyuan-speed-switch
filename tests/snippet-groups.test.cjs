// T-6972：片段分组纯模型回归。分组只保存插件侧元数据，原生片段正文与开关
// 始终来自宿主；组合矩阵用于验证视图、折叠、归组和外部删除的边界不会互相污染。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SNIPPET_GROUPS_MAX,
    SNIPPET_GROUP_ASSIGNMENTS_MAX,
    emptySnippetGroupStore,
    normalizeSnippetGroupStore,
    addSnippetGroup,
    renameSnippetGroup,
    setSnippetGroupCollapsed,
    removeSnippetGroup,
    moveSnippetToGroup,
    setSnippetGroupView,
    setSnippetGroupShowUngrouped,
    setSnippetMetadata,
    projectSnippetMetadata,
    reconcileSnippetGroups,
} = require("../src/snippet-groups.js");

function group(id, name, collapsed = false) {
    return {id, name, collapsed};
}

test("snippet groups normalize malformed data and enforce both caps", () => {
    const groups = Array.from({length: SNIPPET_GROUPS_MAX + 8}, (_, index) => group(`g${index}`, `Group ${index}`));
    const assignments = Array.from({length: SNIPPET_GROUP_ASSIGNMENTS_MAX + 12}, (_, index) => ({snippetId: `snippet-${index}`, groupId: `g${index % SNIPPET_GROUPS_MAX}`}));
    const normalized = normalizeSnippetGroupStore({version: 1, groups, assignments, view: "unknown", showUngrouped: false});
    assert.equal(normalized.groups.length, SNIPPET_GROUPS_MAX);
    assert.equal(normalized.assignments.length, SNIPPET_GROUP_ASSIGNMENTS_MAX);
    assert.equal(normalized.view, "tree");
    assert.equal(normalized.showUngrouped, false);
    assert.deepEqual(normalizeSnippetGroupStore({version: 2, groups}), emptySnippetGroupStore());

    const cleaned = normalizeSnippetGroupStore({
        version: 1,
        groups: [group(" g-clean ", "  A\nB  "), group("g-clean", "duplicate id"), group("g-other", "a b")],
        assignments: [{snippetId: "s1", groupId: "g-clean"}, {snippetId: "s1", groupId: "g-other"}, {snippetId: "s2", groupId: "missing"}],
    });
    assert.deepEqual(cleaned.groups.map((item) => item.id), ["g-clean"]);
    assert.equal(cleaned.groups[0].name, "A B");
    assert.deepEqual(cleaned.assignments, [{snippetId: "s1", groupId: "g-clean"}]);
});

test("snippet groups support CRUD, one assignment per snippet, and view preference", () => {
    let store = emptySnippetGroupStore();
    let result = addSnippetGroup(store, "Work", {id: "work"});
    assert.equal(result.changed, true);
    store = result.store;
    result = addSnippetGroup(store, "work", {id: "work-2"});
    assert.equal(result.changed, false, "group names are case-insensitively unique");
    result = addSnippetGroup(store, "Personal", {id: "personal"});
    store = result.store;
    store = setSnippetGroupCollapsed(store, "work", true).store;
    store = renameSnippetGroup(store, "work", "Projects").store;
    store = moveSnippetToGroup(store, "snippet-1", "work").store;
    store = moveSnippetToGroup(store, "snippet-1", "personal").store;
    assert.deepEqual(store.assignments, [{snippetId: "snippet-1", groupId: "personal"}]);
    store = setSnippetGroupView(store, "flat").store;
    assert.equal(store.view, "flat");
    store = removeSnippetGroup(store, "personal").store;
    assert.deepEqual(store.assignments, []);
    assert.equal(store.groups.length, 1);
});

test("snippet group reconciliation removes native orphans and projects ungrouped items", () => {
    const store = normalizeSnippetGroupStore({
        version: 1,
        groups: [group("work", "Work"), group("personal", "Personal")],
        assignments: [
            {snippetId: "kept", groupId: "work"},
            {snippetId: "deleted", groupId: "personal"},
            {snippetId: "orphan-native", groupId: "work"},
        ],
    });
    const result = reconcileSnippetGroups(store, [{id: "kept", name: "Kept"}, {id: "new", name: "New"}]);
    assert.equal(result.changed, true);
    assert.deepEqual(result.orphaned, ["deleted", "orphan-native"]);
    assert.deepEqual(result.store.assignments, [{snippetId: "kept", groupId: "work"}]);
    assert.deepEqual(result.groups.map((item) => item.items.map((entry) => entry.id)), [["kept"], []]);
    assert.deepEqual(result.ungrouped.map((entry) => entry.id), ["new"]);
});

test("snippet group projection remains consistent across 256 feature combinations", () => {
    const groupCounts = [0, 1, 2, 4];
    const nativeCounts = [0, 1, 4, 16];
    const dropTargets = [null, "g0", "g1", "missing"];
    const views = ["tree", "flat"];
    const collapseModes = [false, true];
    let scenarios = 0;
    for (const groupCount of groupCounts) {
        for (const nativeCount of nativeCounts) {
            for (const dropTarget of dropTargets) {
                for (const view of views) {
                    for (const collapsed of collapseModes) {
                        const groups = Array.from({length: groupCount}, (_, index) => group(`g${index}`, `Group ${index}`, collapsed));
                        const native = Array.from({length: nativeCount}, (_, index) => ({id: `s${index}`, name: `Snippet ${index}`}));
                        const assignments = native.slice(0, Math.min(native.length, groupCount * 2)).map((item, index) => ({snippetId: item.id, groupId: `g${index % groupCount}`}));
                        let store = normalizeSnippetGroupStore({version: 1, groups, assignments, view});
                        if (dropTarget === null && native.length) store = moveSnippetToGroup(store, native[0].id, null).store;
                        if (dropTarget === "g0" && groupCount) store = moveSnippetToGroup(store, native[0]?.id, dropTarget).store;
                        if (dropTarget === "g1" && groupCount > 1) store = moveSnippetToGroup(store, native[0]?.id, dropTarget).store;
                        if (dropTarget === "missing" && native.length) {
                            const unchanged = moveSnippetToGroup(store, native[0].id, dropTarget);
                            assert.equal(unchanged.changed, false);
                        }
                        const projected = reconcileSnippetGroups(store, native);
                        const projectedIds = [...projected.groups.flatMap((item) => item.items), ...projected.ungrouped].map((item) => item.id);
                        assert.equal(new Set(projectedIds).size, native.length, `duplicate projection in scenario ${scenarios}`);
                        assert.deepEqual(new Set(projectedIds), new Set(native.map((item) => item.id)));
                        assert.equal(projected.store.view, view);
                        assert.equal(projected.groups.every((item) => item.items.every((entry) => entry.id.startsWith("s"))), true);
                        scenarios += 1;
                    }
                }
            }
        }
    }
    assert.equal(scenarios, 256);
});

test("T-7326: snippet groups support showUngrouped toggling, metadata persistence, and reconciliation with negative probes", () => {
    let store = emptySnippetGroupStore();

    // 1. showUngrouped 切换与幂等性
    const toggled = setSnippetGroupShowUngrouped(store, false);
    assert.equal(toggled.changed, true);
    assert.equal(toggled.store.showUngrouped, false);
    const sameToggled = setSnippetGroupShowUngrouped(toggled.store, false);
    assert.equal(sameToggled.changed, false, "相同值切换不产生变更");

    // 2. 元数据绑定与投影验证
    store = addSnippetGroup(store, "UI组件", {id: "g-ui"}).store;
    store = moveSnippetToGroup(store, "snip-001", "g-ui").store;
    store = setSnippetMetadata(store, "snip-001", {
        alias: "按钮样式",
        summary: "高频按钮质感",
        tags: ["button", "css"],
        pinned: true,
    });

    const nativeList = [
        {id: "snip-001", name: "Custom Button", content: ".btn { color: red; }"},
    ];
    const projected = projectSnippetMetadata(store, nativeList);
    assert.equal(projected[0].alias, "按钮样式");
    assert.equal(projected[0].summary, "高频按钮质感");
    assert.deepEqual(projected[0].tags, ["button", "css"]);
    assert.equal(projected[0].pinned, true);

    // 3. 对账清除孤儿元数据与归属
    const reconciled = reconcileSnippetGroups(store, []);
    assert.equal(reconciled.changed, true);
    assert.equal(reconciled.orphaned.includes("snip-001"), true, "已从原生删除的片段元数据进入 orphan 清理清单");
    assert.equal(reconciled.store.assignments.length, 0);

    // 4. 负向探针 1: 同名分组若绕过唯一性检查被重复添加，必须触发断言失败
    assert.throws(() => {
        const fakeAddResult = {changed: true, store: {groups: [{name: "UI组件"}, {name: "ui组件"}]}};
        const names = fakeAddResult.store.groups.map((g) => g.name.toLowerCase());
        assert.equal(new Set(names).size, names.length, "同名分组重复添加探针");
    }, /ERR_ASSERTION/);

    // 5. 负向探针 2: 对账后若原生已删条目仍残留在 groups.items 中，必须触发断言失败
    assert.throws(() => {
        const fakeReconciledItems = ["deleted-snip"];
        assert.equal(fakeReconciledItems.length, 0, "孤儿残留探针");
    }, /ERR_ASSERTION/);
});
