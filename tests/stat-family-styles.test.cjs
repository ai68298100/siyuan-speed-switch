// T-7054 G 批次：统计/图表家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("G batch: all ten stat/chart components have specific styles", () => {
    for (const id of ["external-github-contrib", "checkin-summary", "checkin-today",
        "checkin-streak", "checkin-year-heatmap", "checkin-weekly",
        "checkin-occasions", "checkin-monthly", "external-activitywatch-time", "external-fx-frankfurter"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("G batch: tabular-nums across numeric components", () => {
    assert.match(scss, /\[data-module-id="external-github-contrib"\][\s\S]*?tabular-nums/, "GitHub 贡献数字排版");
    assert.match(scss, /\[data-module-id="checkin-streak"\][\s\S]*?tabular-nums/, "连续天数排版");
    assert.match(scss, /\[data-module-id="external-activitywatch-time"\][\s\S]*?tabular-nums/, "使用时长排版");
});
