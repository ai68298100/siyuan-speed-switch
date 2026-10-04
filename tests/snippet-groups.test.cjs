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
