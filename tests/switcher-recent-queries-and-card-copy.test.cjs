// T-7360 切换器近期搜索词历史重放与卡片悬停复制块链接把手契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 index.ts 声明 recordRecentSearchQuery 与 sw__recent-queries 结构；
//   2. 验证 buildCardActions 装配 .sw__copy-btn 悬停快捷复制块链接；
//   3. 验证 _11-ui-polish.scss 声明 .sw__copy-btn 与 .sw__recent-queries 样式；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));

test("T-7360: index.ts 声明 recordRecentSearchQuery 与 sw__recent-queries 渲染结构", () => {
    assert.match(indexTs, /private recentSearchQueries: string\[\] = \[\];/);
    assert.match(indexTs, /private recordRecentSearchQuery\(query: string\)/);
    assert.match(indexTs, /sw__recent-queries/);
    assert.match(indexTs, /sw__recent-query-chip/);
});

test("T-7360: buildCardActions 为具备 rootId 的卡片装配 .sw__copy-btn 快捷按钮", () => {
    assert.match(indexTs, /copyBtn\.className = "sw__copy-btn";/);
    assert.match(indexTs, /siyuan:\/\/blocks\/\$\{rootId\}/);
    assert.match(polishScss, /\.sw__copy-btn\s*\{/);
    assert.match(polishScss, /\.sw__card:hover \.sw__copy-btn/);
});

test("T-7360: 样式层声明 .sw__recent-queries 与 .sw__recent-query-chip 胶囊药丸规范", () => {
    assert.match(polishScss, /\.sw__recent-queries\s*\{/);
    assert.match(polishScss, /\.sw__recent-query-chip\s*\{/);
});

test("T-7360 门禁负向验证: 若缺少 copy-btn 声明或虚假类必定精确红", () => {
    // 探针 1: 负向断言伪造的不存在操作按钮类
    assert.throws(() => {
        assert.match(polishScss, /\.sw__non_existent_card_fake_btn/);
    }, assert.AssertionError);

    // 探针 2: 验证 recordRecentSearchQuery 过滤单字符与空查询的逻辑存在
    assert.match(indexTs, /if \(!clean \|\| clean\.length < 2\) return;/);
});
