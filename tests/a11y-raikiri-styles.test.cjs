const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readStyleSource } = require("./source-scan.cjs");

const css = readStyleSource();

test("小驴雷切 · 无障碍与高对比度样式规范 (Epoch 5)", async (t) => {
    await t.test("声明完整的 forced-colors: active 系统颜色与变量映射", () => {
        assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
        assert.match(css, /--sw-page-bg:\s*Canvas;/);
        assert.match(css, /--sw-control-bg:\s*Canvas;/);
        assert.match(css, /--sw-r54-canvas:\s*Canvas;/);
        assert.match(css, /--sw-r54-surface:\s*Canvas;/);
        assert.match(css, /--sw-r54-line:\s*CanvasText;/);
        assert.match(css, /--b3-theme-background:\s*Canvas;/);
        assert.match(css, /--b3-theme-primary:\s*Highlight;/);
        assert.match(css, /--b3-theme-on-primary:\s*HighlightText;/);
        assert.match(css, /--b3-border-color:\s*CanvasText;/);
        assert.match(css, /--sw-r54-shadow-card:\s*none;/);
        assert.match(css, /--sw-sheet-shadow:\s*none;/);
    });

    await t.test("forced-colors 模式下核心工作面与控件具备 1px CanvasText 边框", () => {
        assert.match(css, /border:\s*1px\s+solid\s+CanvasText;/);
        assert.match(css, /\.sw__dock/);
        assert.match(css, /\.sw__toolbar/);
        assert.match(css, /\.sw-home__cell/);
        assert.match(css, /\.sw-studio__preview-section/);
        assert.match(css, /\.b3-button/);
        assert.match(css, /\.b3-text-field/);
        assert.match(css, /\.b3-select/);
    });

    await t.test("forced-colors 模式下弹窗容器强化为 2px CanvasText 边框并重置背景", () => {
        assert.match(css, /\.b3-dialog__container[\s\S]*border:\s*2px\s+solid\s+CanvasText;\s*background:\s*Canvas;/);
    });

    await t.test("forced-colors 模式下主操作按钮与激活项采用 Highlight 填充与 HighlightText 前景", () => {
        assert.match(css, /background:\s*Highlight\s*!important;\s*color:\s*HighlightText\s*!important;\s*border:\s*1px\s+solid\s+Highlight\s*!important;/);
        assert.match(css, /\.sw__dock-item\.active/);
        assert.match(css, /\.sw-platform-surface-nav__item\.is-active/);
    });

    await t.test("forced-colors 模式下保留关键状态指示器 forced-color-adjust: none", () => {
        assert.match(css, /forced-color-adjust:\s*none;/);
        assert.match(css, /\.sw__dot/);
        assert.match(css, /\.sw-badge/);
        assert.match(css, /\.sw__home-source-health/);
        assert.match(css, /\.sw__home-module-item-check/);
        assert.match(css, /input\[type="checkbox"\]\.b3-switch/);
    });

    await t.test("键盘焦点环 focus-visible 具备明确的 Highlight 与 outline-color", () => {
        assert.match(css, /:where\(button,\s*a,\s*input,\s*select,\s*textarea,\s*\[tabindex="0"\]\):focus-visible/);
        assert.match(css, /outline:\s*2px\s+solid\s+Highlight\s*!important;/);
        assert.match(css, /outline-color:\s*Highlight\s*!important;/);
        assert.match(css, /outline-offset:\s*2px;/);
    });

    await t.test("声明 prefers-contrast: more 强化聚焦边界与粗体区分", () => {
        assert.match(css, /@media\s*\(prefers-contrast:\s*more\)/);
        assert.match(css, /border:\s*1px\s+solid\s+var\(--b3-theme-on-background\);/);
        assert.match(css, /outline:\s*2px\s+solid\s+var\(--b3-theme-primary\);/);
        assert.match(css, /outline:\s*3px\s+solid\s+var\(--b3-theme-primary\);/);
        assert.match(css, /outline-offset:\s*2px;/);
        assert.match(css, /font-weight:\s*700;/);
    });
});
