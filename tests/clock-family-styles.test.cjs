// T-7054 A 批次：时钟/时间家族视觉增强契约——SVG 环形样式、时间排版、
// 组件专属选择器。
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("clock family: SVG arc ring styled with track and progress colors", () => {
    assert.match(scss, /\.sw__home-stat-arc \{/, "arc container must exist");
    // 块级作用域断言：track 块内必须有 stroke（防跨块匹配假绿）
    const arcBlock = scss.slice(
        scss.indexOf(".sw__home-stat-arc-track {"),
        scss.indexOf("}", scss.indexOf(".sw__home-stat-arc-track {"))
    );
    assert.ok(arcBlock.includes("stroke:"), "track block must contain stroke declaration");
    assert.match(scss, /\.sw__home-stat-arc-progress \{[\s\S]*?stroke: var\(--b3-theme-primary\)/, "progress must use primary color");
    assert.match(scss, /stroke-linecap: round/, "progress must have rounded cap");
    assert.match(scss, /transform: rotate\(-90deg\)/, "progress must start from top");
});

test("clock family: component-specific typography and layout enhancements", () => {
    assert.match(scss, /\[data-module-id="external-local-time"\]/, "local-time must have specific styles");
    assert.match(scss, /\[data-module-id="external-world-clock"\]/, "world-clock must have specific styles");
    assert.match(scss, /\[data-module-id="countdown"\]/, "countdown must have specific styles");
    assert.match(scss, /font-variant-numeric: tabular-nums/, "tabular-nums must be present (T-6971 continuity)");
});
