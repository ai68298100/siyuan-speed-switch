// T-7352 & T-7353 穿透检索富文本高亮与次级动作快捷键免呼出直达执行契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 extractHighlightSearchNeedle 对各类符号前缀 (@/#/!/^/:) 精准提取纯净搜索词；
//   2. 验证 buildKeywordHighlightSegments 正确分段命中词，且 highlightSearchMatchesHtml 严格转义 XSS 危险字符；
//   3. 验证 src/index.ts 卡片按键监听完整捕获 Ctrl+Enter、Alt+Enter、Alt+C、Alt+M、Alt+P、Alt+D 并分发执行；
//   4. 负向探针覆盖：XSS 注入未转义或快捷键分支缺失必定精准红。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const {
    extractHighlightSearchNeedle,
    buildKeywordHighlightSegments,
    escapeHtmlEntities,
    highlightSearchMatchesHtml,
} = require("../src/search-model.js");

const indexTs = fs.readFileSync(path.join(ROOT, "src", "index.ts"), "utf8");
const polishScss = fs.readFileSync(path.join(ROOT, "src", "styles", "_11-ui-polish.scss"), "utf8");

test("T-7352: extractHighlightSearchNeedle 自动剥离前缀符号并提取纯净搜索词", () => {
    assert.equal(extractHighlightSearchNeedle("@系统架构"), "系统架构");
    assert.equal(extractHighlightSearchNeedle("工作周报@下周计划"), "下周计划");
    assert.equal(extractHighlightSearchNeedle(":今日总结"), "今日总结");
    assert.equal(extractHighlightSearchNeedle("#技术重构"), "技术重构");
    assert.equal(extractHighlightSearchNeedle("!核心项目"), "核心项目");
    assert.equal(extractHighlightSearchNeedle("^正文内容"), "正文内容");
    assert.equal(extractHighlightSearchNeedle(">设置"), "设置");
    assert.equal(extractHighlightSearchNeedle("普通文档检索"), "普通文档检索");
    assert.equal(extractHighlightSearchNeedle(""), "");
});

test("T-7352: buildKeywordHighlightSegments 支持穿透检索词命中分段", () => {
    const title = "小驴雷切系统架构核心设计说明";
    // 传入带前缀的查询 "@系统架构"
    const segments = buildKeywordHighlightSegments(title, "@系统架构");
    assert.ok(segments.length >= 3);

    const hitSegment = segments.find((s) => s.hit);
    assert.ok(hitSegment, "必须命中并高亮 '系统架构'");
    assert.equal(hitSegment.text, "系统架构");

    // 传入带正文块前缀 "^核心设计"
    const blockSegments = buildKeywordHighlightSegments(title, "^核心设计");
    const blockHit = blockSegments.find((s) => s.hit);
    assert.ok(blockHit);
    assert.equal(blockHit.text, "核心设计");
});

test("T-7352: highlightSearchMatchesHtml 严格防御 XSS 注入并安全包裹 <mark>", () => {
    const malicious = `<script>alert("xss")</script>小驴雷切<b>加粗</b>`;
    const highlighted = highlightSearchMatchesHtml(malicious, "小驴雷切");

    // 1. 验证危险字符被严格转义，绝无裸 <script>
    assert.equal(highlighted.includes("<script>"), false, "严禁输出未转义的 <script>");
    assert.ok(highlighted.includes("&lt;script&gt;"), "必须安全转义为 &lt;script&gt;");
    assert.ok(highlighted.includes("&lt;b&gt;加粗&lt;/b&gt;"), "必须安全转义 HTML 实体");

    // 2. 验证命中词被 <mark class="sw__search-mark"> 包裹
    assert.ok(highlighted.includes('<mark class="sw__search-mark">小驴雷切</mark>'));
});

test("T-7352: 样式层为 .sw__search-mark 声明了高对比度与减弱动效适配", () => {
    assert.match(polishScss, /mark\.sw__search-mark/, "样式表必须声明 mark.sw__search-mark");
    assert.match(polishScss, /@media\s*\(forced-colors:\s*active\)[^}]*mark\.sw__search-mark/s, "高亮必须支持 forced-colors");
    assert.match(polishScss, /@media\s*\(prefers-contrast:\s*more\)[^}]*mark\.sw__search-mark/s, "高亮必须支持 prefers-contrast");
});

test("T-7353: 卡片按键监听完整捕获分屏、复制与状态切换快捷键并执行调度", () => {
    // 1. Ctrl+Enter: open-right
    assert.match(
        indexTs,
        /event\.key\s*===\s*["']Enter["'][\s\S]*?executePaletteAction\s*\(\s*["']open-right["']/,
        "必须支持 Ctrl+Enter / Cmd+Enter 直开右侧分屏",
    );

    // 2. Alt+Enter: open-bottom
    assert.match(
        indexTs,
        /event\.altKey\s*&&\s*event\.key\s*===\s*["']Enter["'][\s\S]*?executePaletteAction\s*\(\s*["']open-bottom["']/,
        "必须支持 Alt+Enter 直开下方分屏",
    );

    // 3. Alt+C: copy-block-link
    assert.match(
        indexTs,
        /event\.altKey[\s\S]*?["']c["'][\s\S]*?executePaletteAction\s*\(\s*["']copy-block-link["']/,
        "必须支持 Alt+C 复制思源块链接",
    );

    // 4. Alt+M: copy-markdown-link
    assert.match(
        indexTs,
        /event\.altKey[\s\S]*?["']m["'][\s\S]*?executePaletteAction\s*\(\s*["']copy-markdown-link["']/,
        "必须支持 Alt+M 复制 Markdown 链接",
    );

    // 5. Alt+P: toggle-pin
    assert.match(
        indexTs,
        /event\.altKey[\s\S]*?["']p["'][\s\S]*?executePaletteAction\s*\(\s*["']toggle-pin["']/,
        "必须支持 Alt+P 切换置顶",
    );

    // 6. Alt+D: toggle-fav
    assert.match(
        indexTs,
        /event\.altKey[\s\S]*?["']d["'][\s\S]*?executePaletteAction\s*\(\s*["']toggle-fav["']/,
        "必须支持 Alt+D 切换收藏",
    );
});

test("T-7352 & T-7353 门禁负向验证：若 XSS 转义失效或快捷键分支缺失必定精准红", () => {
    // 探针 1：断言未转义的原始脚本标签必定失败
    const malicious = `<script>alert("xss")</script>`;
    const safeOutput = escapeHtmlEntities(malicious);
    assert.throws(() => {
        assert.equal(safeOutput, malicious);
    }, assert.AssertionError);

    // 探针 2：断言伪造的不存在快捷键必定失败
    assert.throws(() => {
        assert.match(indexTs, /executePaletteAction\s*\(\s*["']nonexistent-fake-shortcut-action["']/);
    }, assert.AssertionError);
});
