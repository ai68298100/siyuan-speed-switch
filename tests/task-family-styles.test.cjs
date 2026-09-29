// T-7054 D 批次：任务/闪卡家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("D batch: all three task/flashcard components have specific styles", () => {
    for (const id of ["today-tasks", "flashcard-due", "quick-capture"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("D batch: numeric emphasis present for tasks and flashcards", () => {
    assert.match(scss, /\[data-module-id="today-tasks"\][\s\S]*?font-size: 1\.5em/, "待办数大号突出");
    assert.match(scss, /\[data-module-id="flashcard-due"\][\s\S]*?font-size: 1\.6em/, "复习数突出");
});
