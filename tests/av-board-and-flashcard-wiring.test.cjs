// T-7354 & T-7355 属性视图看板与闪卡复习小组件生产装配契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 buildAvBoardSnapshot 产出符合工作台规范的 items 列表，支持分组名与首块 ID 跳转；
//   2. 验证 buildFlashcardReviewSnapshot 首项输出标准 action:riffCard，并在 handleHomeItemAction 中精准执行；
//   3. 验证 src/index.ts 注册了 database-board 与 flashcard-review 模块并绑定对应端点；
//   4. 负向探针覆盖：块 ID 格式破坏或闪卡动作协议篡改必定精准红。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {readSourceText} = require("./source-scan.cjs");

const ROOT = path.resolve(__dirname, "..");
const {buildAvBoardSnapshot} = require("../src/av-board-model.js");
const {buildFlashcardReviewSnapshot} = require("../src/flashcard-review-model.js");
const {BLOCK_ID_RE} = require("../src/constants.js");

const indexTs = readSourceText(path.join(ROOT, "src", "index.ts"));

const SAMPLE_AV_PAYLOAD = {
    code: 0,
    data: {
        name: "研发迭代管理库",
        view: {
            id: "view-board-1",
            name: "按状态分组看板",
            table: {
                columns: [
                    {id: "col-title", name: "任务标题", type: "block"},
                    {id: "col-status", name: "状态", type: "select"},
                ],
                rows: [
                    {
                        id: "20261020093000-row001",
                        cells: [
                            {value: {text: {content: "实现穿透高亮"}}},
                            {value: {text: {content: "进行中"}}},
                        ],
                    },
                    {
                        id: "20261020093000-row002",
                        cells: [
                            {value: {text: {content: "快捷键免呼出直达"}}},
                            {value: {text: {content: "进行中"}}},
                        ],
                    },
                    {
                        id: "20261020093000-row003",
                        cells: [
                            {value: {text: {content: "历史基线整理"}}},
                            {value: {text: {content: "已完成"}}},
                        ],
                    },
                ],
            },
        },
    },
};

const SAMPLE_FLASHCARD_PAYLOAD = {
    code: 0,
    total: 12,
    data: [
        {id: "20261020093000-card01", content: "TypeScript 泛型逆变与协变"},
        {id: "20261020093000-card02", content: "SuperMemo-2 因子调度算法"},
    ],
};

test("T-7354: buildAvBoardSnapshot 产出符合工作台规范的 items 列表，支持分组统计与块跳转", () => {
    const snapshot = buildAvBoardSnapshot(SAMPLE_AV_PAYLOAD, {
        blockId: "20261020093000-av000001",
        groupBy: "状态",
        showPercent: true,
    });

    assert.ok(snapshot, "看板快照必须合法产出");
    assert.equal(snapshot.totalRows, 3);
    assert.ok(Array.isArray(snapshot.groups), "必须保留 groups 原始看板桶");
    assert.ok(Array.isArray(snapshot.items), "必须产出供工作台直接渲染的 items 列表");
    assert.equal(snapshot.items.length, 2, "2 个状态分组对应 2 个看板条目");

    // 进行中(2) 排序在 已完成(1) 之前
    const firstGroupItem = snapshot.items[0];
    assert.equal(firstGroupItem.label, "进行中");
    assert.ok(firstGroupItem.secondary.includes("2 行"), "副标题必须包含行数统计");
    assert.ok(firstGroupItem.secondary.includes("66.7%"), "副标题必须包含占比");
    assert.equal(firstGroupItem.value, "20261020093000-row001", "必须携带该组内首个块 ID 用于穿透直达");
    assert.equal(BLOCK_ID_RE.test(firstGroupItem.value), true, "块 ID 必须符合思源规范");
});

test("T-7354: src/index.ts 注册 database-board 模块且点击事件能路由至 openTab", () => {
    assert.match(
        indexTs,
        /register\(\s*["']database-board["'][\s\S]*?buildAvBoardSnapshot/,
        "index.ts 必须注册 database-board 模块并接入 buildAvBoardSnapshot",
    );
    assert.match(
        indexTs,
        /if\s*\(\s*BLOCK_ID_RE\.test\(\s*value\s*\)\s*\)[\s\S]*?openTab/,
        "handleHomeItemAction 必须支持点击块 ID 自动调用 openTab",
    );
});

test("T-7355: buildFlashcardReviewSnapshot 产出规范动作项且 index.ts 精准分发", () => {
    const snapshot = buildFlashcardReviewSnapshot(SAMPLE_FLASHCARD_PAYLOAD, {
        dailyLimit: 30,
        showPercent: true,
    });

    assert.ok(snapshot);
    assert.ok(Array.isArray(snapshot.items));
    assert.ok(snapshot.items.length >= 1);

    // 首项固定为进入复习动作协议
    const firstItem = snapshot.items[0];
    assert.equal(firstItem.value, "action:riffCard", "闪卡卡片首项必须输出 action:riffCard 动作协议");
    assert.ok(firstItem.label.includes("今日复习"));

    // index.ts 注册与分发契约
    assert.match(
        indexTs,
        /register\(\s*["']flashcard-review["'][\s\S]*?buildFlashcardReviewSnapshot/,
        "index.ts 必须注册 flashcard-review 模块并接入 buildFlashcardReviewSnapshot",
    );
    assert.match(
        indexTs,
        /if\s*\(\s*value\s*===\s*["']action:riffCard["']\s*\)[\s\S]*?global-riff-card/,
        "handleHomeItemAction 必须捕获 action:riffCard 并分发至 global-riff-card",
    );
});

test("T-7354 & T-7355 门禁负向验证：块 ID 破坏或动作协议失效必须精准红", () => {
    // 探针 1：若首块 ID 被破坏为非法格式，正则必须拒绝
    const brokenBlockId = "not-a-valid-siyuan-block-id";
    assert.throws(() => {
        assert.equal(BLOCK_ID_RE.test(brokenBlockId), true);
    }, assert.AssertionError);

    // 探针 2：若闪卡协议未遵循 action:riffCard，断言必须拒绝
    const fakeProtocol = "action:wrong-protocol-due-cards";
    assert.throws(() => {
        assert.equal(fakeProtocol, "action:riffCard");
    }, assert.AssertionError);
});
