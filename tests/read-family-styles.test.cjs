// T-7054 F 批次：阅读/订阅家族 SCSS 视觉增强契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readStyleSource} = require("./source-scan.cjs");

const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("F batch: non-RSS components have specific styles", () => {
    for (const id of ["external-anime-bangumi", "external-ical-events", "external-quote-daily", "clipped-unread"]) {
        assert.match(scss, new RegExp(`\\[data-module-id="${id}"\\]`), `${id} 必须有专属样式`);
    }
});

test("F batch: RSS list-flow styles already in place (T-6971 batch 6)", () => {
    // RSS 五组件的行流样式（hairline 分隔+meta 排版）已在批次⑥交付，
    // 本批次不重复添加，但验证其仍存在。
    assert.match(scss, /external-rss-subscription.*external-rss-miniflux/s, "RSS 行流选择器仍覆盖订阅+未读");
});
