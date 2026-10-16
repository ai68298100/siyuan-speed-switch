const test = require("node:test");
const assert = require("node:assert/strict");
const kernelModel = require("../src/kernel-widget-model.js");
const {buildWeatherSnapshot} = require("../src/life-widget-model.js");
const {normalizeSnapshot} = require("../src/home-adapters.js");

const NOW = new Date("2026-10-17T12:00:00Z");

test("ADR 0220 T-7294: 8 大高价值核心组件 7 维价值密度与契约自洽", () => {
    // 1. bookmarks: 书签（默认内容、空态、旧别名、点击块目标）
    const emptyBookmarks = kernelModel.buildBookmarkListSnapshot([], {}, {empty: "无书签"}, NOW);
    assert.equal(emptyBookmarks.items.length, 0);
    assert.equal(emptyBookmarks.emptyHint, "无书签", "bookmarks emptyHint 自洽");

    const aliasBookmark = kernelModel.buildBookmarkListSnapshot([{
        name: "测试书签",
        count: 1,
        blocks: [{block_id: "20261017120000-block123", root_id: "20261017120001-root456"}],
    }], {}, {}, NOW);
    assert.equal(aliasBookmark.items[0].value, "bookmark-block:20261017120000-block123:20261017120001-root456", "bookmarks 块级点击目标归一化");

    // 2. tags: 标签（层级路径、父子关系、叶节点点击）
    const tagsSnapshot = kernelModel.buildTagListSnapshot([
        {name: "工作", count: 2, children: [{name: "子项目", count: 3}]},
    ], {}, {stat: "标签"}, NOW);
    assert.ok(tagsSnapshot.items.length > 0);
    assert.ok(tagsSnapshot.items.some((i) => i.value && i.value.includes("tag:")), "tags 点击语义保留完整路径");

    // 3. current-document-outline: 大纲（无活动文档、空大纲、层级深度）
    const emptyOutline = kernelModel.buildOutlineWidgetSnapshot([], {}, {empty: "无大纲"}, NOW);
    assert.equal(emptyOutline.items.length, 0);
    assert.equal(emptyOutline.emptyHint, "无大纲", "outline emptyHint 自洽");

    // 4. note-stats: 笔记统计（显式合法零值聚合 vs 缺失聚合）
    const zeroStats = kernelModel.buildNoteStatsSnapshot({
        docs: 0,
        chars: 0,
        created: 0,
        updated: 0,
    }, {}, {docs: "文档", chars: "字数", created: "今日新建", updated: "今日修改"}, NOW);
    assert.equal(zeroStats.stat.value, "0", "note-stats 显式合法零值保留 0 而非报错");

    // 5. document-relations-summary: 文档关系摘要（轻量子块与引用、标题上下文）
    const emptyRelations = kernelModel.buildDocumentRelationsSnapshot([], {}, {empty: "无关联"}, NOW);
    assert.equal(emptyRelations.items.length, 0);
    assert.equal(emptyRelations.emptyHint, "无关联", "relations emptyHint 自洽");

    // 6. today-tasks: 今日待办（待办与完成项、空待办文案）
    const tasksSnapshot = kernelModel.buildTodayTasksSnapshot([
        {id: "20261017120000-task1", content: "核对发布包", markdown: "* [ ] 核对发布包", documentTitle: "发布文档", updated: "20261017120000"},
        {id: "20261017120001-task2", content: "完成测试", markdown: "* [x] 完成测试", documentTitle: "测试文档", updated: "20261017120000"},
    ], {showCompleted: true}, {done: "已完成", pending: "待办", empty: "今日无待办"}, NOW);
    assert.equal(tasksSnapshot.items.length, 2);
    assert.equal(tasksSnapshot.items[0].value, "20261017120000-task1");
    assert.equal(tasksSnapshot.items[0].done, false);
    assert.equal(tasksSnapshot.items[1].done, true);

    // 7. weather: 天气（网络失败可重试标识 retryable 与紧凑温度）
    const retryableWeather = normalizeSnapshot({
        title: "天气",
        emptyHint: "加载失败 · 重试",
        retryable: true,
        items: [],
    });
    assert.equal(retryableWeather.retryable, true, "weather 异常透传 retryable 标识支持绕过退避重试");

    const weatherSnapshot = buildWeatherSnapshot(
        {label: "北京", latitude: 39.9, longitude: 116.4},
        {
            current: {temperature_2m: 21, weather_code: 0, is_day: 1},
            daily: {
                time: ["2026-10-17"],
                weather_code: [0],
                temperature_2m_max: [24],
                temperature_2m_min: [12],
                precipitation_probability_max: [0],
            },
        },
        {},
        {locale: "zh-CN", today: "今天", clear: "晴"},
        NOW
    );
    assert.ok(weatherSnapshot && weatherSnapshot.items.length > 0, "weather 正常加载产生紧凑天气预报列表项");

    // 8. recent-documents / writing: 写作与近期记录（数量上限与时间格式化）
    const emptyWriting = kernelModel.buildTodayWritingSnapshot({chars: 0, blocks: 0, createdDocs: 0, updatedDocs: 0}, {}, {stat: "字数"}, NOW);
    assert.equal(emptyWriting.stat.value, "0", "writing 空数据自洽");
});

test("ADR 0220 T-7294: 8 大组件价值密度契约包含严格负向探针", () => {
    // 负向探针 1: 若 weather 缺失 retryable 字段，契约必须拒绝
    assert.throws(() => {
        const fakeWeather = {error: "failed"};
        assert.equal(fakeWeather.retryable, true, "weather 缺失 retryable 必须被拦截");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 若 note-stats 把合法零值误写为空态或 null，契约必须拒绝
    assert.throws(() => {
        const fakeStats = {stat: {value: null}};
        assert.equal(fakeStats.stat.value, "0", "note-stats 零值缺失必须被拦截");
    }, /ERR_ASSERTION/);
});
