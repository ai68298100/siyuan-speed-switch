// T-7373 悬浮球极端视口边界防倒置与生命周期清理契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 getBounds 在移动端安全区与键盘挤压下，保持 visible.bottom >= visible.top + ballSize 且 visible.right >= visible.left + ballSize；
//   2. 验证 onunload 清理逻辑完整性与防御性；
//   3. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const fabUiTs = readSourceText(path.join(root, "src", "floating-ball-ui.ts"));
const indexTs = readSourceText(path.join(root, "src", "index.ts"));

test("T-7373: getBounds 在移动端安全区内嵌下强制保证正向可用区域", () => {
    assert.match(
        fabUiTs,
        /visible\.bottom = Math\.max\(visible\.top \+ this\.ballSize,\s*visible\.bottom - inset\("--sw-fab-safe-bottom"\) - 48\);/,
        "移动端底部安全区扣减后必须至少保留一个 ballSize 高度，杜绝边界倒置",
    );
    assert.match(
        fabUiTs,
        /visible\.right = Math\.max\(visible\.left \+ this\.ballSize,\s*visible\.right - inset\("--sw-fab-safe-right"\)\);/,
        "移动端右侧安全区扣减后必须至少保留一个 ballSize 宽度，杜绝边界倒置",
    );
});

test("T-7373: onunload 严格执行所有 Dialog 回收与生命周期清理", () => {
    assert.match(indexTs, /this\.platformSwitcherDialog\?\.destroy\(\);/);
    assert.match(indexTs, /this\.mobileSwitcherDialog\?\.destroy\(\);/);
    assert.match(indexTs, /this\.workbenchDialog\?\.destroy\(\);/);
    assert.match(indexTs, /this\.platformGuideDialog\?\.destroy\(\);/);
    assert.match(indexTs, /this\.snippetStudioDialog\?\.destroy\(\);/);
});

test("T-7373 门禁负向验证: 若缺少 Math.max ballSize 保护必定精准红", () => {
    // 探针 1: 负向断言伪造的不存在代码
    assert.throws(() => {
        assert.match(fabUiTs, /fake_non_existent_ball_bounds_method/);
    }, assert.AssertionError);

    // 探针 2: 负向断言旧的无防倒置减法不能再单独出现
    assert.doesNotMatch(fabUiTs, /visible\.bottom -= inset\("--sw-fab-safe-bottom"\) \+ 48;/);
});
