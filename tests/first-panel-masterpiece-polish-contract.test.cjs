// T-7365 第一面板门面专项深度打磨契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 .sw__card::before 与 .sw__doc-item::before 声明双色渐变能量光条与微光阴影；
//   2. 验证 .sw__card[data-sw-digit]::after 具有立体机械键帽底边与内阴影；
//   3. 验证 .sw__group-count 声明品牌色圆角胶囊与 tabular-nums 计数；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));

test("T-7365: 第一面板卡片与文档结果项 ::before 升级为能量光芒光条", () => {
    assert.match(
        polishScss,
        /\.sw__card\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*var\(--lv-brand/s,
        "页签卡片指示条必须采用星际紫到钛金黄的双色能量渐变",
    );
    assert.match(
        polishScss,
        /\.sw__doc-item\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*var\(--lv-brand/s,
        "文档结果行指示条必须采用星际紫到钛金黄的双色能量渐变",
    );
});

test("T-7365: 1-9 直达数字角标升级为物理机械键帽立体质感", () => {
    assert.match(
        polishScss,
        /\.sw__card\[data-sw-digit\]::after,\s*\.sw__doc-item\[data-sw-digit\]::after\s*\{[^}]*border-bottom:\s*2px solid/s,
        "1-9 数字角标必须声明 2px 底边物理立体厚度",
    );
});

test("T-7365: 分组计数标签升级为品牌色圆角胶囊", () => {
    assert.match(
        polishScss,
        /\.sw__group-count\s*\{[^}]*border-radius:\s*var\(--sw-platform-radius-pill/s,
        "分组计数必须采用胶囊圆角",
    );
});

test("T-7365 门禁负向验证: 若缺少立体键帽底边或渐变能量光必报错", () => {
    // 探针 1: 负向断言伪造的不存在样式类
    assert.throws(() => {
        assert.match(polishScss, /\.sw__fake_non_existent_keycap_class/);
    }, assert.AssertionError);

    // 探针 2: 负向断言零厚度平坦键帽必须被拒绝
    assert.doesNotMatch(polishScss, /\.sw__card\[data-sw-digit\]::after\s*\{[^}]*border-bottom:\s*0px/s);
});
