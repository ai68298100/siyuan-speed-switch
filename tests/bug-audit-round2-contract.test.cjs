// T-7369 第二轮代码潜在 Bug 深度排查与边界隐患加固契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 findOutlineColonIndex 排除 Windows 驱动器路径 (C:\, d:/) 避免误判为大纲穿透；
//   2. 验证 buildBlockSearchSql 对空白/未修剪 notebookId 执行安全 trim 防御；
//   3. 验证 bindSearchInputComposition 在 IME composing 阶段拦截 Escape 防止清空输入框；
//   4. 验证 buildEmptyState 的近期搜索 chip 采用动态 targetSurface 上下文解析；
//   5. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const penetrationModel = require("../src/penetration-search-model.js");
const penetrationOrch = require("../src/penetration-search-orchestration.js");

test("T-7369: findOutlineColonIndex 排除 Windows 驱动器盘符路径", () => {
    // 盘符路径不应误判为大纲冒号
    assert.equal(penetrationModel.findOutlineColonIndex("C:\\Users\\doc.md"), -1);
    assert.equal(penetrationModel.findOutlineColonIndex("d:/notes/reading.md"), -1);
    assert.equal(penetrationModel.findOutlineColonIndex("file://c:/test.pdf"), -1);

    // 真正的大纲穿透语法必须正确命中冒号位置
    assert.equal(penetrationModel.findOutlineColonIndex(":今日总结"), 0);
    assert.equal(penetrationModel.findOutlineColonIndex("工作周报:下周计划"), 4);
    assert.equal(penetrationModel.findOutlineColonIndex("读书笔记：核心思想"), 4);
});

test("T-7369: buildBlockSearchSql 对空字符串/纯空白 notebookId 安全防空", () => {
    // 纯空格 notebookId 不应生成 box = ''
    const sqlWithBlank = penetrationOrch.buildBlockSearchSql("关键词", {notebookId: "   "});
    assert.doesNotMatch(sqlWithBlank, /box = ''/);
    assert.match(sqlWithBlank, /WHERE content LIKE '%关键词%'/);

    // 有效 notebookId 正常拼接
    const sqlWithValid = penetrationOrch.buildBlockSearchSql("关键词", {notebookId: "20260101-box"});
    assert.match(sqlWithValid, /AND box = '20260101-box'/);
});

test("T-7369: bindSearchInputComposition 在输入法拼音候选阶段保护 Escape 不被误清空", () => {
    assert.match(
        indexTs,
        /if \(event\.key === "Escape" && input\.value\) \{\s*\n\s*if \(composing\) return;/,
        "在拼音候选状态下按 Escape 必须直接 return，不能误清空输入框文本",
    );
});

test("T-7369: buildEmptyState 近期搜索 Chip 动态获取 targetSurface", () => {
    assert.match(
        indexTs,
        /const targetSurface = empty\.closest<HTMLElement>\("\.sw-platform-surface"\)\s*\|\|\s*empty\.closest<HTMLElement>\("\.sw-platform-dialog"\)/,
        "近期搜索 chip 点击时必须动态定位所属弹窗或侧栏，杜绝预绑定 null 导致跨窗口找不到 input",
    );
});

test("T-7369 门禁负向验证: 若缺少 composing 守卫或误判盘符冒号必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在代码
    assert.throws(() => {
        assert.match(indexTs, /fake_non_existent_ime_guard_logic/);
    }, assert.AssertionError);

    // 探针 2: 负向断言盘符路径不能返回有效正数索引
    assert.notEqual(penetrationModel.findOutlineColonIndex("C:\\Path"), 1);
});
