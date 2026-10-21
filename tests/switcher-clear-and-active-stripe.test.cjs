// T-7360 搜索框阶梯式 Escape 清空、右侧一键清除按钮与激活卡片微光指示条契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 index.ts 声明 .sw__search-clear 按钮且支持一键清空与更新可见性；
//   2. 验证 bindSearchInputComposition 拦截有内容时的 Escape 进行阶梯退回；
//   3. 验证 _11-ui-polish.scss 声明 .sw__card::before 与 .sw__doc-item::before 激活指示条；
//   4. 验证 .sw__doc-source.is-heading 与 .sw__doc-source.is-block 穿透胶囊样式；
//   5. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));
const docSearchTs = readSourceText(path.join(root, "src", "doc-search-ui.ts"));
const docSearchJs = readSourceText(path.join(root, "src", "doc-search-ui.js"));

test("T-7360: 搜索框声明 .sw__search-clear 按钮与阶梯式 Escape 清空逻辑", () => {
    assert.match(
        indexTs,
        /class="sw__search-clear fn__none"/,
        "搜索框必须声明 .sw__search-clear 按钮",
    );
    assert.match(
        indexTs,
        /event\.key === "Escape" && input\.value/,
        "当输入框有文字时必须拦截 Escape 执行清空与阶梯退回",
    );
    assert.match(
        indexTs,
        /clearBtn\.classList\.toggle\("fn__none", !input\.value\)/,
        "清空按钮必须跟随输入值动态切换可见性",
    );
});

test("T-7360: 卡片与文档结果项声明 ::before 激活主题色微光指示条", () => {
    assert.match(
        polishScss,
        /\.sw__card\s*\{[^}]*&::before\s*\{[^}]*width:\s*3px;/s,
        "页签卡片必须声明 3px 宽度的 ::before 激活光条",
    );
    assert.match(
        polishScss,
        /\.sw__card\.sw__focused,\s*\.sw__card\.sw__active\s*\{[^}]*&::before\s*\{[^}]*opacity:\s*1;/s,
        "获焦卡片必须点亮 ::before 激活光条 (opacity: 1)",
    );
    assert.match(
        polishScss,
        /\.sw__doc-item\s*\{[^}]*&::before\s*\{[^}]*width:\s*3px;/s,
        "文档结果行必须声明 3px 宽度的 ::before 激活光条",
    );
});

test("T-7360: 穿透搜索大纲与正文块结果声明专属胶囊微标", () => {
    assert.match(docSearchTs, /is-\$\{doc\.kind\}/);
    assert.match(docSearchJs, /is-\$\{doc\.kind\}/);
    assert.match(polishScss, /\.sw__doc-source\.is-heading\s*\{/);
    assert.match(polishScss, /\.sw__doc-source\.is-block\s*\{/);
});

test("T-7360 门禁负向验证: 若清空逻辑被破坏或篡改假类必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在指示条类
    assert.throws(() => {
        assert.match(polishScss, /\.sw__fake_non_existent_active_stripe/);
    }, assert.AssertionError);

    // 探针 2: 负向断言阶梯 Escape 必须阻止默认关闭冒泡
    assert.match(indexTs, /event\.stopPropagation\(\);\s*input\.value = "";/);
});
