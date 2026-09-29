// T-7054 I 批次：工具家族 SCSS 视觉增强契约（最终批）
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("I batch: all six tool components have specific styles", () => {
    for (const id of ["database-list", "database-table", "saved-searches", "plugin-commands", "inbox-shorthands", "random-review"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});
