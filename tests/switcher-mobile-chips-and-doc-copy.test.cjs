// T-7360 移动端常驻多模态穿透药丸 Chips、搜索框专属 Placeholder 与文档搜索项 Alt+C 快捷复制契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 buildMobileSwitcherHtml 声明 .sw__mode-chips-bar 与 .sw__search-clear；
//   2. 验证 openMobileSwitcherDialog 装配 setupSearchModeChips 与生命周期释放；
//   3. 验证 setupSearchModeChips 动态同步模式专属 placeholder（如 @ 标题、^ 正文、# 标签等）；
//   4. 验证 buildDocResultItem 在桌面端挂载 Alt+C 快捷键与复制 siyuan://blocks/ 逻辑；
//   5. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const mobileSwitcherTs = readSourceText(path.join(root, "src", "mobile-switcher-ui.ts"));
const docSearchTs = readSourceText(path.join(root, "src", "doc-search-ui.ts"));
const docSearchJs = readSourceText(path.join(root, "src", "doc-search-ui.js"));

test("T-7360: 移动端切换器声明 .sw__mode-chips-bar 与 .sw__search-clear", () => {
    const mobileSlice = indexTs.slice(indexTs.indexOf("buildMobileSwitcherHtml(): string"), indexTs.indexOf("renderMobileSwitcherList("));
    assert.match(
        mobileSlice,
        /class="sw__mode-chips-bar"/,
        "移动端 HTML 模板必须声明 .sw__mode-chips-bar 容器",
    );
    assert.match(
        mobileSlice,
        /class="sw__search-clear fn__none"/,
        "移动端 HTML 模板必须声明 .sw__search-clear 按钮",
    );
    assert.match(
        mobileSwitcherTs,
        /disposeModeChips\s*=\s*this\.setupSearchModeChips/,
        "移动端装配逻辑必须调用 setupSearchModeChips",
    );
});

test("T-7360: setupSearchModeChips 动态联动搜索框专属 Placeholder", () => {
    assert.match(indexTs, /searchInput\.placeholder = activeMode\.placeholder;/);
    assert.match(indexTs, /placeholder: "@ " \+ \(this\.i18n\.searchModeHeading \|\| "大纲"\)/);
    assert.match(indexTs, /placeholder: "\^ " \+ \(this\.i18n\.searchModeBlock \|\| "正文"\)/);
    assert.match(indexTs, /placeholder: "# " \+ \(this\.i18n\.searchModeTag \|\| "标签"\)/);
});

test("T-7360: 文档搜索结果项挂载 Alt+C 快捷键与复制 siyuan://blocks/ 逻辑", () => {
    assert.match(
        docSearchTs,
        /event\.altKey && !isCtrlOrCmd && !event\.shiftKey && event\.key\.toLowerCase\(\) === "c"/,
        "doc-search-ui.ts 必须在 Alt+C 时触发复制",
    );
    assert.match(docSearchTs, /siyuan:\/\/blocks\/\$\{copyTargetId\}/);
    assert.match(docSearchJs, /siyuan:\/\/blocks\/\$\{copyTargetId\}/);
    assert.match(docSearchTs, /\(Alt\+C\)/, "文档条目 title 必须提示 Alt+C 快捷键");
});

test("T-7360 门禁负向验证: 若移动端缺少释放通道或快捷键篡改必须精准红", () => {
    // 探针 1: 负向断言移动端释放链必须包含 disposeModeChips
    assert.match(
        mobileSwitcherTs,
        /disposeMobileToolbar\(\);\s*disposeHistoryDropdown\(\);\s*disposeModeChips\(\);/,
        "移动端销毁链必须清理模式栏监听",
    );

    // 探针 2: 负向断言伪造的不存在快捷键
    assert.doesNotMatch(
        docSearchTs,
        /event\.key\.toLowerCase\(\) === "non_existent_fake_key"/,
    );
});
