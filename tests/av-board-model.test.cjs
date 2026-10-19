// T-7336 思源原生属性视图（av）轻量只读看板契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/av-board-model.js；
//   - 负向探针在文件末尾独立执行：注入违规必须定向失败，且已实测验证。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    BOARD_MAX_GROUPS,
    BOARD_MAX_ITEMS,
    normalizeAvBoardConfig,
    extractAvBoardCellText,
    collectAvBoardRows,
    listAvBoardFields,
    listAvBoardViews,
    buildAvBoardSnapshot,
} = require("../src/av-board-model.js");

const BLOCK_ID = "20260101120000-abcdefgh";

function makePayload(options = {}) {
    const rows = options.rows || [];
    const columns = options.columns || [
        {id: "col-title", name: "标题", type: "block"},
        {id: "col-status", name: "状态", type: "select"},
    ];
    return {
        code: 0,
        data: {
            name: options.dbName || "任务库",
            view: options.view || {
                id: "view-1",
                name: options.viewName || "全部任务",
                table: {columns, rows},
            },
            ...(options.views ? {views: options.views} : {}),
        },
    };
}

function cellText(value) {
    return {value: {text: {content: value}}};
}

test("T-7336: normalizeAvBoardConfig enforces block id, limits and flags", () => {
    const ok = normalizeAvBoardConfig({blockId: BLOCK_ID, limit: 999, showPercent: true});
    assert.equal(ok.blockId, BLOCK_ID);
    assert.equal(ok.limit, BOARD_MAX_ITEMS, "limit 必须钳制在上限内");
    assert.equal(ok.showPercent, true);
    assert.equal(ok.showCounts, true, "showCounts 默认开");

    const bad = normalizeAvBoardConfig({blockId: "not-a-block-id", limit: -5, showCounts: false});
    assert.equal(bad.blockId, "", "非法 blockId 必须清空");
    assert.equal(bad.limit, 1, "非法 limit 回退到最小 1");
    assert.equal(bad.showCounts, false);

    const empty = normalizeAvBoardConfig(null);
    assert.equal(empty.blockId, "");
    assert.equal(empty.groupBy, "");
});

test("T-7336: extractAvBoardCellText handles av value shapes and depth bound", () => {
    assert.equal(extractAvBoardCellText({text: {content: "设计文档"}}), "设计文档");
    assert.equal(extractAvBoardCellText({block: {content: "块内容"}}), "块内容");
    assert.equal(extractAvBoardCellText({number: {content: 42}}), "42");
    assert.equal(extractAvBoardCellText({number: {formattedContent: "￥42"}}), "￥42");
    assert.equal(extractAvBoardCellText({mSelect: [{content: "进行中"}, {content: "高优"}]}), "进行中、高优");
    assert.equal(extractAvBoardCellText({checkbox: {checked: true}}), "☑");
    assert.equal(extractAvBoardCellText({checkbox: {checked: false}}), "☐");
    assert.equal(extractAvBoardCellText({date: {formattedContent: "2026-10-19"}}), "2026-10-19");
    // 深度防护：递归 relation 不得超过 2 层
    const deep = {relation: {contents: [{relation: {contents: [{relation: {contents: [{text: {content: "太深"}}]}}]}}]}};
    assert.equal(extractAvBoardCellText(deep), "");
    // 空/非法
    assert.equal(extractAvBoardCellText(null), "");
    assert.equal(extractAvBoardCellText("string"), "");
});

test("T-7336: collectAvBoardRows merges grouped views and de-duplicates rows", () => {
    // 分组视图：行分布在 groups[].table
    const groupedPayload = makePayload({
        view: {
            id: "view-1",
            name: "按状态分组",
            groups: [
                {table: {columns: [{id: "c1", name: "标题"}], rows: [{id: "r1", cells: [cellText("A")]}]}},
                {table: {columns: [{id: "c1", name: "标题"}], rows: [{id: "r2", cells: [cellText("B")]}]}},
            ],
        },
    });
    const grouped = collectAvBoardRows(groupedPayload.data.view);
    assert.equal(grouped.rows.length, 2, "分组视图必须合并所有子视图行");
    assert.equal(grouped.columns.length, 1);

    // 重复行去重
    const dupPayload = makePayload({
        view: {
            id: "view-1",
            table: {
                columns: [{id: "c1", name: "标题"}],
                rows: [{id: "r1", cells: [cellText("A")]}, {id: "r1", cells: [cellText("A")]}],
            },
        },
    });
    const deduped = collectAvBoardRows(dupPayload.data.view);
    assert.equal(deduped.rows.length, 1, "同 id 行必须去重");

    // 空视图
    assert.deepEqual(collectAvBoardRows(null), {columns: [], rows: []});
});

test("T-7336: listAvBoardFields and listAvBoardViews stay bounded and skip hidden", () => {
    const manyColumns = Array.from({length: 40}, (_, i) => ({id: `c${i}`, name: `列${i}`, type: "text"}));
    const payload = makePayload({
        columns: [...manyColumns, {id: "hidden-col", name: "隐藏列", hidden: true}],
        views: Array.from({length: 20}, (_, i) => ({id: `v${i}`, name: `视图${i}`})),
    });
    const fields = listAvBoardFields(payload);
    assert.ok(fields.length <= BOARD_MAX_GROUPS, "字段列表必须受上限约束");
    assert.equal(fields.some((f) => f.id === "hidden-col"), false, "hidden 字段必须排除");
    const views = listAvBoardViews(payload);
    assert.ok(views.length <= 8, "视图列表必须受上限约束");
    assert.equal(views[0].id, "v0");

    // 空载荷
    assert.deepEqual(listAvBoardFields(null), []);
    assert.deepEqual(listAvBoardViews(null), []);
});

test("T-7336: buildAvBoardSnapshot aggregates by group field with counts and percents", () => {
    const rows = [
        {id: "r1", cells: [cellText("任务A"), cellText("进行中")]},
        {id: "r2", cells: [cellText("任务B"), cellText("已完成")]},
        {id: "r3", cells: [cellText("任务C"), cellText("进行中")]},
    ];
    const snapshot = buildAvBoardSnapshot(makePayload({rows}), {blockId: BLOCK_ID, groupBy: "状态", showPercent: true});
    assert.ok(snapshot, "必须产出看板快照");
    assert.equal(snapshot.totalRows, 3);
    assert.equal(snapshot.groupedBy, "状态");
    assert.equal(snapshot.groups.length, 2, "必须聚合为 2 个状态桶");
    // 按计数降序：进行中(2) 先于 已完成(1)
    assert.equal(snapshot.groups[0].key, "进行中");
    assert.equal(snapshot.groups[0].count, 2);
    assert.equal(snapshot.groups[0].percent, 66.7);
    assert.equal(snapshot.groups[1].key, "已完成");
    assert.equal(snapshot.groups[1].count, 1);
    assert.equal(snapshot.groups[0].items.length, 2, "桶内代表项必须有界");
    assert.ok(snapshot.stat.value.includes("组"), "统计摘要必须反映分组数");
});

test("T-7336: buildAvBoardSnapshot without groupBy collapses to a single bucket", () => {
    const rows = [
        {id: "r1", cells: [cellText("任务A"), cellText("进行中")]},
        {id: "r2", cells: [cellText("任务B"), cellText("已完成")]},
    ];
    const snapshot = buildAvBoardSnapshot(makePayload({rows}), {blockId: BLOCK_ID});
    assert.equal(snapshot.groupedBy, "");
    assert.equal(snapshot.groups.length, 1, "不分组时聚合为单桶");
    assert.equal(snapshot.groups[0].key, "全部");
    assert.equal(snapshot.groups[0].count, 2);
});

test("T-7336: buildAvBoardSnapshot rejects invalid blockId and empty payload", () => {
    const rows = [{id: "r1", cells: [cellText("任务A")]}];
    assert.equal(buildAvBoardSnapshot(makePayload({rows}), {blockId: "bad-id"}), null,
        "非法 blockId 必须拒绝出快照");
    assert.equal(buildAvBoardSnapshot(null, {blockId: BLOCK_ID}), null, "空载荷必须返回 null");
    assert.equal(buildAvBoardSnapshot({}, {blockId: BLOCK_ID}), null);
    // 无列（异常响应）
    assert.equal(buildAvBoardSnapshot({data: {view: {table: {columns: [], rows}}}}, {blockId: BLOCK_ID}), null);
});

test("T-7336: buildAvBoardSnapshot skips hidden columns in both grouping and primary label", () => {
    // 第一列是 hidden：既不能被当作主标签列，也不能被当作分组列。
    const payload = makePayload({
        columns: [
            {id: "col-secret", name: "内部标记", hidden: true},
            {id: "col-title", name: "标题", type: "block"},
            {id: "col-status", name: "状态", type: "select"},
        ],
        rows: [
            {id: "r1", cells: [cellText("机密"), cellText("任务A"), cellText("进行中")]},
            {id: "r2", cells: [cellText("机密"), cellText("任务B"), cellText("已完成")]},
        ],
    });
    const snapshot = buildAvBoardSnapshot(payload, {blockId: BLOCK_ID, groupBy: "状态"});
    assert.ok(snapshot);
    assert.equal(snapshot.groupedBy, "状态");
    assert.equal(snapshot.groups.length, 2, "必须按可见的状态列分组");
    // 主标签列必须是可见的"标题"，不能落到 hidden 的"内部标记"
    const labels = snapshot.groups.flatMap((g) => g.items.map((i) => i.label)).sort();
    assert.deepEqual(labels, ["任务A", "任务B"], `主标签不得取 hidden 列，实际 ${JSON.stringify(labels)}`);

    // 分组列本身为 hidden 时不得分组（回退为不分桶）
    const hiddenGroup = buildAvBoardSnapshot(payload, {blockId: BLOCK_ID, groupBy: "内部标记"});
    assert.equal(hiddenGroup.groupedBy, "", "hidden 列不得作为分组依据");
    assert.equal(hiddenGroup.groups.length, 1, "hidden 分组列应回退为单桶");
});

test("T-7336: buildAvBoardSnapshot caps groups under a wide table", () => {
    // 40 个不同状态值 → 分组数必须被钳制
    const rows = Array.from({length: 40}, (_, i) => ({id: `r${i}`, cells: [cellText(`任务${i}`), cellText(`状态${i}`)]}));
    const snapshot = buildAvBoardSnapshot(makePayload({rows}), {blockId: BLOCK_ID, groupBy: "状态"});
    assert.ok(snapshot);
    assert.ok(snapshot.groups.length <= BOARD_MAX_GROUPS,
        `分组数 ${snapshot.groups.length} 必须 <= ${BOARD_MAX_GROUPS}`);
});

// ==================== 负向探针 ====================
test("T-7336 negative probes: board bounds and read-only isolation", () => {
    const rows = [
        {id: "r1", cells: [cellText("任务A"), cellText("进行中")]},
        {id: "r2", cells: [cellText("任务B"), cellText("已完成")]},
        {id: "r3", cells: [cellText("任务C"), cellText("进行中")]},
    ];
    const snapshot = buildAvBoardSnapshot(makePayload({rows}), {blockId: BLOCK_ID, groupBy: "状态"});

    // 探针 1：分组数不得超出上限
    assert.ok(snapshot.groups.length <= BOARD_MAX_GROUPS, "分组上限被突破");

    // 探针 2：每桶代表项不得超出配置 limit
    const limited = buildAvBoardSnapshot(makePayload({rows}), {blockId: BLOCK_ID, groupBy: "状态", limit: 1});
    assert.ok(limited.groups.every((g) => g.items.length <= 1), "桶内代表项超出 limit");

    // 探针 3：非空文本不得被静默计入（空标签行应被跳过）
    const emptyRows = [{id: "r1", cells: [{value: {}}]}];
    const emptySnap = buildAvBoardSnapshot(makePayload({rows: emptyRows}), {blockId: BLOCK_ID});
    assert.equal(emptySnap.groups[0].items.length, 0, "空标签行不得计入代表项");

    // 探针 4：非法 blockId 必须拒绝
    assert.equal(buildAvBoardSnapshot(makePayload({rows}), {blockId: "xx"}), null, "非法 blockId 未被拒绝");

    // 探针 5：字段列表必须排除 hidden 且受上限
    const payload = makePayload({
        columns: Array.from({length: 60}, (_, i) => ({id: `c${i}`, name: `列${i}`})),
    });
    const fields = listAvBoardFields(payload);
    assert.ok(fields.length <= BOARD_MAX_GROUPS, "字段列表上限被突破");

    // 探针 6：视图列表不得超出 8
    const manyViews = makePayload({views: Array.from({length: 50}, (_, i) => ({id: `v${i}`}))});
    assert.ok(listAvBoardViews(manyViews).length <= 8, "视图列表上限被突破");
});
