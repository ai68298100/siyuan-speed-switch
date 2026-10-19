// T-7338 Obsidian 风格深入穿透检索模型契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/penetration-search-model.js；
//   - 覆盖文档模式、块搜索前缀、大纲冒号穿透、当前文档穿透与引号转义；
//   - 负向探针在文件末尾独立执行：非法 blockId 拒绝、引号冒号不误判、URL 协议不误判等必须定向失败。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SEARCH_MODES,
    MAX_OUTLINE_RESULTS,
    parsePenetrationQuery,
    findOutlineColonIndex,
    filterOutlineHeadings,
    normalizePenetrationBlockResult,
} = require("../src/penetration-search-model.js");

const BLOCK_ID = "20260101120000-abcdefgh";

test("T-7338: parsePenetrationQuery parses normal doc query", () => {
    const q = parsePenetrationQuery("项目周报");
    assert.equal(q.mode, SEARCH_MODES.DOC);
    assert.equal(q.docNeedle, "项目周报");
    assert.equal(q.headingNeedle, "");
    assert.equal(q.blockNeedle, "");
    assert.equal(q.cleanKernelQuery, "项目周报");
    assert.equal(q.isCurrentDoc, false);

    // 空/非法输入
    const empty = parsePenetrationQuery("");
    assert.equal(empty.mode, SEARCH_MODES.DOC);
    assert.equal(empty.raw, "");
});

test("T-7338: parsePenetrationQuery parses block prefix syntax (^)", () => {
    const q = parsePenetrationQuery("^重构架构设计");
    assert.equal(q.mode, SEARCH_MODES.BLOCK);
    assert.equal(q.blockNeedle, "重构架构设计");
    assert.equal(q.cleanKernelQuery, "重构架构设计", "内核查询必须剔除 ^ 前缀");
    assert.equal(q.docNeedle, "");
    assert.equal(q.headingNeedle, "");
});

test("T-7338: parsePenetrationQuery parses outline penetration syntax (:)", () => {
    // 跨文档指定穿透：文档名:标题
    const cross = parsePenetrationQuery("周报:下周计划");
    assert.equal(cross.mode, SEARCH_MODES.OUTLINE);
    assert.equal(cross.docNeedle, "周报");
    assert.equal(cross.headingNeedle, "下周计划");
    assert.equal(cross.cleanKernelQuery, "周报", "内核文档查询只传文档名");
    assert.equal(cross.isCurrentDoc, false);

    // 当前活动文档穿透：:标题
    const current = parsePenetrationQuery(":今日总结");
    assert.equal(current.mode, SEARCH_MODES.OUTLINE);
    assert.equal(current.docNeedle, "");
    assert.equal(current.headingNeedle, "今日总结");
    assert.equal(current.isCurrentDoc, true);
    assert.equal(current.cleanKernelQuery, "");
});

test("T-7338: parsePenetrationQuery protects quoted colons and URL protocols", () => {
    // 引号内的冒号不触发大纲穿透
    const quoted = parsePenetrationQuery('"key:value"');
    assert.equal(quoted.mode, SEARCH_MODES.DOC, "引号内的冒号不得触发大纲穿透");
    assert.equal(quoted.docNeedle, '"key:value"');

    // URL 协议头不触发大纲穿透
    const url = parsePenetrationQuery("https://siyuan-note.com");
    assert.equal(url.mode, SEARCH_MODES.DOC, "https: 不得触发大纲穿透");
});

test("T-7338: filterOutlineHeadings filters and applies depth bonus", () => {
    const headings = [
        {id: "h1-1", content: "架构概览", depth: 1},
        {id: "h2-1", content: "架构细节", depth: 2},
        {id: "h3-1", content: "架构配置", depth: 3},
        {id: "h1-2", content: "业务规划", depth: 1},
    ];

    // 匹配"架构"：H1(架构概览) 优先于 H2(架构细节) 优先于 H3(架构配置)
    const filtered = filterOutlineHeadings(headings, "架构");
    assert.equal(filtered.length, 3);
    assert.equal(filtered[0].id, "h1-1", "H1 应享有更高的层级加权");
    assert.equal(filtered[1].id, "h2-1");
    assert.equal(filtered[2].id, "h3-1");

    // 空查询返回截断列表
    assert.equal(filterOutlineHeadings(headings, "").length, 4);
    assert.deepEqual(filterOutlineHeadings(null, "test"), []);
});

test("T-7338: normalizePenetrationBlockResult validates blockId and cleans markup", () => {
    const raw = {
        id: BLOCK_ID,
        content: "这是一段带有 **加粗** 和 <em>斜体</em> 的内容",
        subType: "p",
        rootId: "20260101000000-root1234",
    };
    const normalized = normalizePenetrationBlockResult(raw, {title: "父文档"});
    assert.ok(normalized);
    assert.equal(normalized.blockId, BLOCK_ID);
    assert.equal(normalized.rootId, "20260101000000-root1234");
    assert.equal(normalized.content, "这是一段带有 加粗 和 斜体 的内容", "必须清洗 markdown 与 HTML 标签");
    assert.equal(normalized.docTitle, "父文档");
});

// ==================== 负向探针（门禁自查 §核心原则） ====================
test("T-7338 negative probes: syntax boundary and integrity guards", () => {
    // 探针 1：非法 blockId 必须被拒
    assert.equal(normalizePenetrationBlockResult({id: "not-a-valid-id"}), null,
        "负向探针 1 失败：非法 blockId 未被拒绝");

    // 探针 2：中间包含 ^（非首字符）不得误判为块模式
    const midCaret = parsePenetrationQuery("x^2");
    assert.equal(midCaret.mode, SEARCH_MODES.DOC,
        "负向探针 2 失败：非首字符的 ^ 误判为块搜索模式");

    // 探针 3：引号内冒号不触发大纲穿透
    assert.equal(findOutlineColonIndex('"a:b"'), -1,
        "负向探针 3 失败：引号内的冒号被当作大纲穿透符");

    // 探针 4：URL 协议头不触发大纲穿透
    assert.equal(findOutlineColonIndex("http://localhost"), -1,
        "负向探针 4 失败：http: 协议被当作大纲穿透符");

    // 探针 5：大纲结果必须受上限约束
    const manyHeadings = Array.from({length: 50}, (_, i) => ({
        id: `h-${i}`,
        content: `标题项 ${i}`,
        depth: 2,
    }));
    const res = filterOutlineHeadings(manyHeadings, "标题项");
    assert.ok(res.length <= MAX_OUTLINE_RESULTS,
        "负向探针 5 失败：大纲过滤超过了最大上限");
});
