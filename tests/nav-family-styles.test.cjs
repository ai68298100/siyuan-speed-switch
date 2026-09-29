// T-7054 H 批次：导航/文档家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("H batch: all twelve navigation/document components have specific styles", () => {
    for (const id of ["recent-documents", "pinned-docs", "favorites", "document-sets",
        "tags", "bookmarks", "fixed-document", "current-document-outline",
        "document-relations-summary", "recent-edits", "recent-updates", "data-health"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("H batch: typography hierarchy present for key components", () => {
    assert.match(scss, /\[data-module-id="pinned-docs"\][\s\S]*?font-weight: 600/, "置顶文档加重");
    assert.match(scss, /\[data-module-id="document-sets"\][\s\S]*?font-weight: 600/, "文档集加重");
    assert.match(scss, /\[data-module-id="data-health"\][\s\S]*?tabular-nums/, "数据健康数字排版");
});
