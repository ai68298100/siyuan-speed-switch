// T-7054 B 批次：日历/日记家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("B batch: all six journal/calendar components have specific styles", () => {
    for (const id of ["today-journal", "journal-monthly", "recent-daily-notes", "on-this-day", "today-reservations"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("B batch: typography hierarchy enhancements are present", () => {
    assert.match(scss, /\[data-module-id="today-journal"\][\s\S]*?font-weight: 600/, "今日日记首条加重");
    assert.match(scss, /\[data-module-id="journal-monthly"\][\s\S]*?font-variant-numeric: tabular-nums/, "本月日记数字排版");
    assert.match(scss, /\[data-module-id="on-this-day"\][\s\S]*?color: var\(--b3-theme-primary\)/, "往年今日年份主色突出");
});
