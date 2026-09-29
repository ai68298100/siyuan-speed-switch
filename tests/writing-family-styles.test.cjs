// T-7054 E 批次：写作家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("E batch: all four writing components have specific styles", () => {
    for (const id of ["today-writing", "recent-writing-activity", "writing-streak", "note-stats"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("E batch: numeric emphasis present across writing family", () => {
    assert.match(scss, /\[data-module-id="today-writing"\][\s\S]*?font-size: 1\.8em/, "今日写字数大号突出");
    assert.match(scss, /\[data-module-id="writing-streak"\][\s\S]*?font-size: 1\.6em/, "连续天数突出");
});
