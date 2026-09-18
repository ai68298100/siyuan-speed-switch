// T-6330 数据库表格组件契约（ADR 0058 有界列表投影）。
// 针对内核 v3.8.4 av 契约（AVTable{Columns,Rows} / AVBaseValue）的宽容投影，
// 形状不符一律归一空态，绝不透传原始 JSON。
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeAvTableConfig, extractAvCellText, buildAvTableSnapshot} = require('../src/kernel-widget-model.js');

const NOW = 1725696000000;

const avResponseOf = (columns, rows, extra = {}) => ({
    code: 0,
    data: {
        name: "阅读清单",
        id: "20260917130000-avavava",
        viewID: "20260917130001-viewvw",
        ...extra,
        view: {name: "全部", type: "table", table: {columns, rows}},
    },
});

const column = (id, name) => ({id, name});
const cell = (columnId, value) => ({id: columnId, value});

// ---------- 配置 ----------
test('av config validates the block id and clamps the limit', () => {
    assert.equal(normalizeAvTableConfig({blockId: "20260917130000-avavava"}).blockId, "20260917130000-avavava");
    assert.equal(normalizeAvTableConfig({blockId: "paste-the-whole-url"}).blockId, "");
    assert.equal(normalizeAvTableConfig({}).blockId, "");
    assert.equal(normalizeAvTableConfig({limit: 0}).limit, 1);
    assert.equal(normalizeAvTableConfig({limit: 99}).limit, 12);
    assert.deepEqual(normalizeAvTableConfig({columns: "col3,col1,col3"}).columns, ["col3", "col1"]);
    assert.deepEqual(normalizeAvTableConfig({columns: "a,b,c,d"}).columns, ["a", "b", "c"]);
    assert.equal(normalizeAvTableConfig({}).showColumnNames, true);
    assert.equal(normalizeAvTableConfig({showColumnNames: "否"}).showColumnNames, false);
    assert.equal(normalizeAvTableConfig({showRank: "是"}).showRank, true);
});

test('av snapshot applies the configured column order and selection', () => {
    const rows = [{id: "20260917130100-block1", cells: [
        cell("col1", {text: {content: "道德经"}}),
        cell("col2", {text: {content: "在读"}}),
        cell("col3", {number: {content: 5}}),
    ]}];
    const snapshot = buildAvTableSnapshot(avResponseOf(COLUMNS, rows), {
        blockId: "20260917130000-avavava", columns: "col1,col3",
    }, {title: "数据库"}, NOW);
    assert.equal(snapshot.items[0].label, "道德经");
    assert.equal(snapshot.items[0].secondary, "评分：5");
});

// ---------- 单元格宽容抽取 ----------
test('av cell text extraction covers text, block, number, select, date families', () => {
    assert.equal(extractAvCellText({text: {content: "纯文本"}}), "纯文本");
    assert.equal(extractAvCellText({block: {content: "块引用文本"}}), "块引用文本");
    assert.equal(extractAvCellText({number: {content: 42}}), "42");
    assert.equal(extractAvCellText({mSelect: [{content: "哲学"}, {content: "小说"}]}), "哲学、小说");
    assert.equal(extractAvCellText({date: {content: "2026-09-18"}}), "2026-09-18");
    assert.equal(extractAvCellText({number: {content: 42, formattedContent: "42.00"}}), "42.00");
    assert.equal(extractAvCellText({url: {content: "https://example.com"}}), "https://example.com");
    assert.equal(extractAvCellText({checkbox: {checked: false}}), "☐");
    assert.equal(extractAvCellText({checkbox: {checked: true}}), "☑");
    assert.equal(extractAvCellText({created: {formattedContent: "2026-09-18 12:00"}}), "2026-09-18 12:00");
    assert.equal(extractAvCellText({mAsset: [{name: "封面.png", content: "assets/cover.png"}]}), "封面.png");
    assert.equal(extractAvCellText({relation: {contents: [{text: {content: "关联 A"}}, {text: {content: "关联 B"}}]}}), "关联 A、关联 B");
    assert.equal(extractAvCellText({renderedContent: "模板后的内容", text: {content: "原值"}}), "模板后的内容");
    assert.equal(extractAvCellText({}), "");
    assert.equal(extractAvCellText(null), "");
});

// ---------- 快照投影 ----------
const COLUMNS = [column("col1", "书名"), column("col2", "状态"), column("col3", "评分")];

test('av snapshot uses the primary column as label and next two as secondary', () => {
    const rows = [
        {id: "20260917130100-block1", cells: [cell("col1", {text: {content: "道德经"}}), cell("col2", {mSelect: [{content: "在读"}]}), cell("col3", {number: {content: 5}})]},
        {id: "20260917130101-block2", cells: [cell("col1", {text: {content: "论语"}}), cell("col2", {mSelect: [{content: "读完"}]}), cell("col3", {number: {content: 4.5}})]},
    ];
    const snapshot = buildAvTableSnapshot(avResponseOf(COLUMNS, rows), {blockId: "20260917130000-avavava"}, {title: "数据库"}, NOW, "fresh");
    assert.ok(snapshot);
    assert.equal(snapshot.title, "数据库 · 全部", "标题携带当前视图名");
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "道德经");
    assert.equal(snapshot.items[0].value, "20260917130100-block1", "value=行块 ID，点击打开");
    assert.equal(snapshot.items[0].secondary, "状态：在读 · 评分：5");
    assert.equal(snapshot.items[1].secondary, "状态：读完 · 评分：4.5");
    assert.deepEqual(snapshot.stat, {value: "2", label: "显示/总行"});
    assert.equal(Object.hasOwn(snapshot.items[0], "rank"), false, "行号默认隐藏，窄卡片保留正文宽度");
});

test('current AV shape matches cells by keyID and opens the bound block', () => {
    const columns = [column("key-title", "标题"), column("key-done", "完成")];
    const response = {code: 0, data: {name: "项目", view: {
        name: "进行中", type: "table", columns, rowCount: 6,
        rows: [{id: "20260917130100-itemrow", cells: [
            {id: "20260917130200-valueaa", value: {keyID: "key-title", block: {id: "20260917130300-boundaa", content: "发布"}}},
            {id: "20260917130201-valuebb", value: {keyID: "key-done", checkbox: {checked: false}}},
        ]}],
    }}};
    const snapshot = buildAvTableSnapshot(response, {
        blockId: "20260917130000-avavava", showColumnNames: "否", showRank: "是",
    }, {title: "数据库", stat: "已显示/总数"}, NOW);
    assert.equal(snapshot.items[0].label, "发布");
    assert.equal(snapshot.items[0].secondary, "☐");
    assert.equal(snapshot.items[0].value, "20260917130300-boundaa", "点击应打开绑定块而非 AV item ID");
    assert.equal(snapshot.items[0].rank, 1);
    assert.deepEqual(snapshot.stat, {value: "1/6", label: "已显示/总数"});
});

test('grouped AV rows are projected and deduplicated across groups', () => {
    const grouped = avResponseOf(COLUMNS, []);
    grouped.data.view = {
        name: "按状态分组", type: "table", table: {columns: COLUMNS, rows: []}, groups: [
            {table: {columns: COLUMNS, rowCount: 1, rows: [{id: "20260917130100-block1", cells: [cell("col1", {text: {content: "A"}})]}]}},
            {table: {columns: COLUMNS, rowCount: 2, rows: [
                {id: "20260917130100-block1", cells: [cell("col1", {text: {content: "A"}})]},
                {id: "20260917130101-block2", cells: [cell("col1", {text: {content: "B"}})]},
            ]}},
        ],
    };
    const snapshot = buildAvTableSnapshot(grouped, {blockId: "20260917130000-avavava"}, {title: "数据库"}, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["A", "B"]);
    assert.equal(snapshot.stat.value, "2/3");
});

test('av snapshot respects the row cap and hidden columns', () => {
    const hiddenColumns = [{id: "col0", name: "隐藏列", hidden: true}, ...COLUMNS];
    const rows = Array.from({length: 10}, (_, index) => ({
        id: `20260917130${String(10 + index)}-block${index}`,
        cells: [
            cell("col0", {text: {content: "隐藏内容不该出现"}}),
            cell("col1", {text: {content: `书${index}`}}),
            cell("col2", {text: {content: "在读"}}),
            cell("col3", {number: {content: index}}),
        ],
    }));
    const snapshot = buildAvTableSnapshot(avResponseOf(hiddenColumns, rows), {blockId: "20260917130000-avavava", limit: 3}, {title: "T"}, NOW);
    assert.equal(snapshot.items.length, 3);
    assert.equal(snapshot.items[0].label, "书0");
    assert.equal(snapshot.items.every((item) => !item.label.includes("隐藏")), true, "hidden 列不参与投影");
    assert.deepEqual(snapshot.stat, {value: "3/10", label: "显示/总行"});
});

test('rows without a usable primary cell are skipped', () => {
    const rows = [
        {id: "20260917130100-block1", cells: [cell("col1", {text: {content: ""}})]},
        {id: "20260917130101-block2", cells: []},
        {id: "20260917130102-block3", cells: [cell("col1", {text: {content: "有效行"}})]},
    ];
    const snapshot = buildAvTableSnapshot(avResponseOf(COLUMNS, rows), {blockId: "20260917130000-avavava"}, {title: "T"}, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["有效行"]);
});

test('shape mismatches resolve to null for a determined empty state', () => {
    const emptyOk = {blockId: "20260917130000-avavava"};
    assert.equal(buildAvTableSnapshot(null, emptyOk, {}), null, "无响应");
    assert.equal(buildAvTableSnapshot({code: -1, msg: "spec too new"}, emptyOk, {}), null, "内核错误");
    assert.equal(buildAvTableSnapshot({code: 0, data: {}}, emptyOk, {}), null, "缺 view");
    assert.equal(buildAvTableSnapshot(avResponseOf("not-columns", []), emptyOk, {}), null, "列形状不符");
    assert.equal(buildAvTableSnapshot(avResponseOf(COLUMNS, []), {}, {}), null, "未配置块 ID");
    const empty = buildAvTableSnapshot(avResponseOf(COLUMNS, []), emptyOk, {title: "T"}, NOW);
    assert.equal(empty.items.length, 0);
    assert.equal(empty.emptyHint, "数据库当前视图暂无数据行");
});
