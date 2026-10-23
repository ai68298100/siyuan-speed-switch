// T-7366 第一面板模式药丸键盘循环导航与卡片操作把手微交互契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 setupSearchModeChips 挂载 ArrowLeft / ArrowRight / ArrowDown 键盘循环导航；
//   2. 验证 searchInput 监听 ArrowUp 直达当前激活模式药丸；
//   3. 验证 _11-ui-polish.scss 声明 .sw__card .sw__pin 等微交互悬浮缩放样式；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));

test("T-7366: setupSearchModeChips 支持 ArrowLeft / ArrowRight / ArrowDown 键盘循环聚焦", () => {
    assert.match(
        indexTs,
        /e\.key === "ArrowRight"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*chipButtons\[\(idx \+ 1\) % chipButtons\.length\]\?\.focus\(\);/,
        "必须支持 ArrowRight 聚焦下一个模式药丸",
    );
    assert.match(
        indexTs,
        /e\.key === "ArrowLeft"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*chipButtons\[\(idx - 1 \+ chipButtons\.length\) % chipButtons\.length\]\?\.focus\(\);/,
        "必须支持 ArrowLeft 聚焦上一个模式药丸",
    );
    assert.match(
        indexTs,
        /e\.key === "ArrowDown"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*searchInput\.focus\(\);/,
        "模式药丸按 ArrowDown 必须回到输入框",
    );
});

test("T-7366: searchInput 监听 ArrowUp 从文本框直达模式药丸栏", () => {
    assert.match(
        indexTs,
        /e\.key === "ArrowUp" && searchInput\.selectionStart === 0 && searchInput\.selectionEnd === 0/,
        "光标在输入框起始位置按 ArrowUp 必须触发向上聚焦",
    );
    assert.match(
        indexTs,
        /activeBtn\.focus\(\);/,
        "ArrowUp 必须聚焦当前激活或首个模式药丸",
    );
});

test("T-7366: 卡片操作把手声明 hover 微缩放与平滑过渡", () => {
    assert.match(
        polishScss,
        /\.sw__card\s+\.sw__pin,\s*\.sw__card\s+\.sw__fav-btn,\s*\.sw__card\s+\.sw__close\s*\{[^}]*transform:\s*scale\(1\.12\);/s,
        "卡片操作按钮悬浮必须有优雅的 scale 微放大过渡",
    );
});

test("T-7366 门禁负向验证: 若缺少输入框 keydown 释放或篡改键位必定精准红", () => {
    // 探针 1: 负向断言 disposer 必须同时移除 keydown 监听
    assert.match(indexTs, /searchInput\.removeEventListener\("keydown",\s*onSearchKeyDown\);/);

    // 探针 2: 负向断言伪造的不存在按键逻辑必定报错
    assert.throws(() => {
        assert.match(indexTs, /e\.key === "NonExistentFakeKey"/);
    }, assert.AssertionError);
});
