// T-7342 深入穿透检索运行时编排模型契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/penetration-search-orchestration.js；
//   - 覆盖 SQL 防注入转义、端点请求规划、大纲树平铺展平与结果聚合归一化；
//   - 负向探针在文件末尾独立执行：SQL 注入字符剔除、无活动文档保护、空块关键词保护等。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    MAX_BLOCK_LIMIT,
    escapeSqlLiteral,
    buildBlockSearchSql,
    planPenetrationSearchRequest,
    flattenOutlineTree,
    aggregatePenetrationResults,
} = require("../src/penetration-search-orchestration.js");

const ACTIVE_DOC_ID = "20260101120000-abcdefgh";

test("T-7342: escapeSqlLiteral escapes quotes and strips dangerous tokens", () => {
    // 1. 单引号双写
    assert.equal(escapeSqlLiteral("O'Reilly"), "O''Reilly");

    // 2. 剔除分号与注释符
    assert.equal(escapeSqlLiteral("test; DROP TABLE blocks; --"), "test  DROP TABLE blocks");

    // 3. 换行与制表符清洗
    assert.equal(escapeSqlLiteral("line1\nline2\tline3"), "line1 line2 line3");

    // 4. 空/非法
    assert.equal(escapeSqlLiteral(""), "");
    assert.equal(escapeSqlLiteral(null), "");
});

test("T-7342: buildBlockSearchSql builds safe read-only query with limit and filters", () => {
    const sql = buildBlockSearchSql("架构重构", {limit: 15, notebookId: "box-main"});
    assert.ok(sql.startsWith("SELECT id, root_id, content, type, sub_type, updated FROM blocks"));
    assert.ok(sql.includes("content LIKE '%架构重构%'"));
    assert.ok(sql.includes("type NOT IN ('d')"), "必须排除根文档块");
    assert.ok(sql.includes("box = 'box-main'"));
    assert.ok(sql.includes("LIMIT 15"));

    // 超限 limit 钳制
    const clampedSql = buildBlockSearchSql("test", {limit: 999});
    assert.ok(clampedSql.includes(`LIMIT ${MAX_BLOCK_LIMIT}`));
});

test("T-7342: planPenetrationSearchRequest routes doc, block, and outline queries", () => {
    // 1. 普通文档搜索
    const docPlan = planPenetrationSearchRequest("项目周报");
    assert.equal(docPlan.mode, "doc");
    assert.equal(docPlan.isPenetration, false);
    assert.equal(docPlan.endpoint, "/api/filetree/searchDocs");
    assert.equal(docPlan.body.k, "项目周报");

    // 2. 块级深入检索 (^关键词)
    const blockPlan = planPenetrationSearchRequest("^架构设计");
    assert.equal(blockPlan.mode, "block");
    assert.equal(blockPlan.isPenetration, true);
    assert.equal(blockPlan.endpoint, "/api/query/sql");
    assert.ok(blockPlan.body.stmt.includes("架构设计"));

    // 3. 当前活动文档大纲穿透 (:标题)
    const currentOutlinePlan = planPenetrationSearchRequest(":下周规划", {
        activeDocId: ACTIVE_DOC_ID,
        activeDocTitle: "我的周报",
    });
    assert.equal(currentOutlinePlan.mode, "outline");
    assert.equal(currentOutlinePlan.isCurrentDoc, true);
    assert.equal(currentOutlinePlan.endpoint, "/api/outline/getDocOutline");
    assert.equal(currentOutlinePlan.body.id, ACTIVE_DOC_ID);
    assert.equal(currentOutlinePlan.headingNeedle, "下周规划");

    // 4. 跨文档大纲穿透 (文档:标题)
    const crossDocPlan = planPenetrationSearchRequest("周报:下周规划");
    assert.equal(crossDocPlan.mode, "outline");
    assert.equal(crossDocPlan.isCurrentDoc, false);
    assert.equal(crossDocPlan.endpoint, "/api/filetree/searchDocs");
    assert.equal(crossDocPlan.body.k, "周报");
    assert.equal(crossDocPlan.headingNeedle, "下周规划");
});

test("T-7342: flattenOutlineTree recursively extracts all nodes with depths", () => {
    const tree = [
        {
            id: "h1",
            content: "第一章",
            depth: 1,
            children: [
                {id: "h2", content: "第一节", depth: 2},
                {id: "h3", content: "第二节", depth: 2},
            ],
        },
        {id: "h4", content: "第二章", depth: 1},
    ];

    const flat = flattenOutlineTree(tree);
    assert.equal(flat.length, 4);
    assert.equal(flat[0].id, "h1");
    assert.equal(flat[0].depth, 1);
    assert.equal(flat[1].id, "h2");
    assert.equal(flat[1].depth, 2);
    assert.equal(flat[3].id, "h4");

    // 空/非法输入
    assert.deepEqual(flattenOutlineTree([]), []);
    assert.deepEqual(flattenOutlineTree(null), []);
});

test("T-7342: aggregatePenetrationResults aggregates outline and block responses", () => {
    // 1. 大纲响应聚合
    const outlinePlan = planPenetrationSearchRequest(":节", {
        activeDocId: ACTIVE_DOC_ID,
        activeDocTitle: "设计规范",
    });
    const outlineResponse = {
        data: [
            {
                id: "20260101000000-head0001",
                content: "概述",
                depth: 1,
                children: [
                    {id: "20260101000000-head0002", content: "核心章节", depth: 2},
                ],
            },
        ],
    };
    const outlineResults = aggregatePenetrationResults(outlinePlan, outlineResponse);
    assert.equal(outlineResults.length, 1);
    assert.equal(outlineResults[0].id, "20260101000000-head0002");
    assert.equal(outlineResults[0].title, "核心章节");
    assert.equal(outlineResults[0].kind, "heading");
    assert.ok(outlineResults[0].subTitle.includes("H2 标题"));

    // 2. 块响应聚合
    const blockPlan = planPenetrationSearchRequest("^测试");
    const blockResponse = {
        data: [
            {
                id: "20260101000000-blk00001",
                root_id: ACTIVE_DOC_ID,
                content: "这是一条测试内容",
                type: "p",
            },
        ],
    };
    const blockResults = aggregatePenetrationResults(blockPlan, blockResponse, {
        activeDocTitle: "测试文档",
    });
    assert.equal(blockResults.length, 1);
    assert.equal(blockResults[0].id, "20260101000000-blk00001");
    assert.equal(blockResults[0].title, "这是一条测试内容");
    assert.equal(blockResults[0].kind, "block");
});

// ==================== 负向探针（门禁自查 §核心原则） ====================
test("T-7342 negative probes: security injection and boundary guards", () => {
    // 探针 1：SQL 注入危险 token 必须被剔除
    const injected = escapeSqlLiteral("' OR 1=1; --");
    assert.equal(injected.includes(";"), false, "负向探针 1 失败：分号未被剔除");
    assert.equal(injected.includes("--"), false, "负向探针 1 失败：注释符未被剔除");

    // 探针 2：当前文档大纲在无 activeDocId 时必须返回明确错误，不得发起盲目请求
    const noDocPlan = planPenetrationSearchRequest(":测试", {activeDocId: ""});
    assert.equal(noDocPlan.error, "no_active_doc",
        "负向探针 2 失败：无活动文档未返回 no_active_doc 错误");

    // 探针 3：空块关键词不生成有效 SQL 语句
    const emptyBlockPlan = planPenetrationSearchRequest("^");
    assert.equal(emptyBlockPlan.empty, true,
        "负向探针 3 失败：空块前缀未标记为 empty");
    assert.equal("endpoint" in emptyBlockPlan, false);

    // 探针 4：非渗透计划传入 aggregatePenetrationResults 必须安全返回空数组
    const normalDocPlan = planPenetrationSearchRequest("普通搜索");
    assert.deepEqual(aggregatePenetrationResults(normalDocPlan, {data: [{id: "1"}]}), [],
        "负向探针 4 失败：非渗透计划未返回空数组");

    // 探针 5：LIMIT 永远不得超过 MAX_BLOCK_LIMIT
    const sql = buildBlockSearchSql("test", {limit: 10000});
    assert.ok(sql.includes(`LIMIT ${MAX_BLOCK_LIMIT}`),
        "负向探针 5 失败：SQL LIMIT 超过了系统上限");
});
