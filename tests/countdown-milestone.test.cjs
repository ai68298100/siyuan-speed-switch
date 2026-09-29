// T-7054 A 批次：倒数日里程碑徽标契约
const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile, readStyleSource} = require("./source-scan.cjs");

const modelSource = readSourceFile("src/local-time-model.js");
const viewSource = readSourceFile("src/home-view.js");
const scss = readStyleSource("src/styles/_05-settings-widgets.scss");

test("countdown milestone: model computes tiered category", () => {
    assert.match(modelSource, /const milestone = days >= 0 && absDays <= 7 \? "imminent"/, "7 天内=imminent");
    assert.match(modelSource, /absDays <= 30 \? "month"/, "30 天内=month");
    assert.match(modelSource, /absDays <= 100 \? "hundred"/, "100 天内=hundred");
    assert.match(modelSource, /\.\.\.\(milestone \? \{milestone\} : \{\}\)/, "milestone 条件透传（无里程碑不污染载荷）");
});

test("countdown milestone: view renders badge with i18n and SCSS tiers", () => {
    assert.match(viewSource, /sw__home-stat-milestone is-\$\{view\.milestone\}/, "徽标必须按里程碑档位渲染");
    assert.match(viewSource, /milestoneImminent/, "imminent 标签必须透传");
    assert.match(scss, /\.sw__home-stat-milestone\.is-imminent/, "imminent 徽标必须有专属样式");
    assert.match(scss, /\.sw__home-stat-milestone\.is-month/, "month 徽标必须有专属样式");
});
