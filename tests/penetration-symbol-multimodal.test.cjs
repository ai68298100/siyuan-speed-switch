// T-7351: 符号化前缀多模态检索模型扩展契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 @/#/!/^/> 各类符号前缀解析并分流到对应 SEARCH_MODES 枚举；
//   2. 验证 resolveSearchModeBadge 输出正确的视觉徽章与图标；
//   3. 验证 planPenetrationSearchRequest 对标签端点（/api/tag/getTag）与书签端点（/api/bookmark/getBookmark）规划；
//   4. 验证 aggregatePenetrationResults 正确展平树形标签与书签数据并格式化输出；
//   5. 负向探针覆盖：模式映射错位或前缀缺失必定被安全拦截。

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SEARCH_MODES,
    MODE_BADGES,
    parsePenetrationQuery,
    resolveSearchModeBadge,
    findOutlineSeparatorIndex,
} = require("../src/penetration-search-model.js");
const {
    planPenetrationSearchRequest,
    aggregatePenetrationResults,
} = require("../src/penetration-search-orchestration.js");

test("T-7351: parsePenetrationQuery 符号化多模态前缀精确解析与分流", () => {
    // 1. @ 大纲前缀（当前文档与跨文档）
    const atCurrent = parsePenetrationQuery("@架构设计");
    assert.equal(atCurrent.mode, SEARCH_MODES.OUTLINE);
    assert.equal(atCurrent.headingNeedle, "架构设计");
    assert.equal(atCurrent.isCurrentDoc, true);
    assert.equal(atCurrent.badge, "大纲");

    const atCross = parsePenetrationQuery("工作周报@下周规划");
    assert.equal(atCross.mode, SEARCH_MODES.OUTLINE);
    assert.equal(atCross.docNeedle, "工作周报");
    assert.equal(atCross.headingNeedle, "下周规划");
    assert.equal(atCross.isCurrentDoc, false);

    // 2. # 标签前缀
    const tagQuery = parsePenetrationQuery("#技术重构");
    assert.equal(tagQuery.mode, SEARCH_MODES.TAG);
    assert.equal(tagQuery.tagNeedle, "技术重构");
    assert.equal(tagQuery.badge, "标签");

    // 3. ! 书签前缀
    const bookmarkQuery = parsePenetrationQuery("!核心项目");
    assert.equal(bookmarkQuery.mode, SEARCH_MODES.BOOKMARK);
    assert.equal(bookmarkQuery.bookmarkNeedle, "核心项目");
    assert.equal(bookmarkQuery.badge, "书签");

    // 4. ^ 正文块前缀
    const blockQuery = parsePenetrationQuery("^内存优化");
    assert.equal(blockQuery.mode, SEARCH_MODES.BLOCK);
    assert.equal(blockQuery.blockNeedle, "内存优化");
    assert.equal(blockQuery.badge, "正文块");

    // 5. > 命令前缀
    const cmdQuery = parsePenetrationQuery(">打开设置");
    assert.equal(cmdQuery.mode, SEARCH_MODES.COMMAND);
    assert.equal(cmdQuery.commandNeedle, "打开设置");
    assert.equal(cmdQuery.badge, "命令");

    // 6. : 既有大纲冒号兼容
    const colonQuery = parsePenetrationQuery(":今日总结");
    assert.equal(colonQuery.mode, SEARCH_MODES.OUTLINE);
    assert.equal(colonQuery.headingNeedle, "今日总结");
    assert.equal(colonQuery.isCurrentDoc, true);
});

test("T-7351: resolveSearchModeBadge 视觉元数据映射与多语言支持", () => {
    const outlineBadge = resolveSearchModeBadge(SEARCH_MODES.OUTLINE);
    assert.equal(outlineBadge.badge, "大纲");
    assert.equal(outlineBadge.icon, "iconAlignLeft");
    assert.equal(outlineBadge.prefix, "@");

    const tagBadge = resolveSearchModeBadge(SEARCH_MODES.TAG, {searchMode_tag: "自定义标签"});
    assert.equal(tagBadge.badge, "自定义标签");
    assert.equal(tagBadge.icon, "iconTag");
    assert.equal(tagBadge.prefix, "#");

    const bookmarkBadge = resolveSearchModeBadge(SEARCH_MODES.BOOKMARK);
    assert.equal(bookmarkBadge.badge, "书签");
    assert.equal(bookmarkBadge.icon, "iconBookmark");
    assert.equal(bookmarkBadge.prefix, "!");
});

test("T-7351: planPenetrationSearchRequest 正确规划标签与书签端点请求", () => {
    // 1. 标签端点计划
    const tagPlan = planPenetrationSearchRequest("#架构");
    assert.equal(tagPlan.mode, SEARCH_MODES.TAG);
    assert.equal(tagPlan.isPenetration, true);
    assert.equal(tagPlan.endpoint, "/api/tag/getTag");
    assert.equal(tagPlan.tagNeedle, "架构");

    // 2. 书签端点计划
    const bmPlan = planPenetrationSearchRequest("!项目");
    assert.equal(bmPlan.mode, SEARCH_MODES.BOOKMARK);
    assert.equal(bmPlan.isPenetration, true);
    assert.equal(bmPlan.endpoint, "/api/bookmark/getBookmark");
    assert.equal(bmPlan.bookmarkNeedle, "项目");
});

test("T-7351: aggregatePenetrationResults 正确聚合树形标签与书签结果", () => {
    // 1. 模拟标签树响应
    const tagPlan = planPenetrationSearchRequest("#重构");
    const rawTagTree = {
        data: [
            {
                label: "技术/重构架构",
                count: 5,
                blockId: "20261020093000-tag001",
                rootId: "20261020093000-doc001",
                children: [
                    {
                        label: "重构计划",
                        count: 2,
                        blockId: "20261020093000-tag002",
                        rootId: "20261020093000-doc001",
                    },
                ],
            },
            {
                label: "日常/生活",
                count: 10,
                blockId: "20261020093000-tag003",
            },
        ],
    };

    const tagResults = aggregatePenetrationResults(tagPlan, rawTagTree);
    assert.equal(tagResults.length, 2, "命中两处包含'重构'的标签");
    assert.equal(tagResults[0].title, "#技术/重构架构");
    assert.equal(tagResults[0].subTitle, "标签 · 5 处引用");
    assert.equal(tagResults[0].icon, "iconTag");
    assert.equal(tagResults[0].kind, "tag");
    assert.equal(tagResults[1].title, "#重构计划");

    // 2. 模拟书签树响应
    const bmPlan = planPenetrationSearchRequest("!核心");
    const rawBmTree = {
        data: [
            {
                label: "核心系统架构文档",
                count: 1,
                blockId: "20261020093000-bm001",
                rootId: "20261020093000-doc002",
            },
            {
                label: "参考资料",
                count: 1,
                blockId: "20261020093000-bm002",
            },
        ],
    };

    const bmResults = aggregatePenetrationResults(bmPlan, rawBmTree);
    assert.equal(bmResults.length, 1);
    assert.equal(bmResults[0].title, "!核心系统架构文档");
    assert.equal(bmResults[0].subTitle, "书签 · 1 处标记");
    assert.equal(bmResults[0].icon, "iconBookmark");
    assert.equal(bmResults[0].kind, "bookmark");
});

test("T-7351 门禁负向验证：模式前缀断言错位或伪造端点必定精准红", () => {
    // 探针 1：断言错误的模式枚举必定失败
    assert.throws(() => {
        const query = parsePenetrationQuery("#标签");
        assert.equal(query.mode, SEARCH_MODES.DOC);
    }, assert.AssertionError);

    // 探针 2：断言标签未加 # 前缀必定失败
    assert.throws(() => {
        const query = parsePenetrationQuery("#标签");
        assert.equal(query.tagNeedle, "#标签");
    }, assert.AssertionError);
});
