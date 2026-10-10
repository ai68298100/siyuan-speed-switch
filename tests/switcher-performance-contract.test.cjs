const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");
const {declaresIn} = require("./css-block-scan.cjs");

// T-7237：第一面板/桌面侧栏的卡片仍完整挂载，只有布局与绘制按可视区惰性化。
// 规则必须钉在桌面选择器，避免把手机端旧 WebView 的触控/焦点语义一起改变。
const css = readSourceFile("src/index.scss");
const desktopCard = ".speed-switch:not(.sw__mobile) .sw__card";
const indexSource = readSourceFile("src/index.ts");

test("desktop switcher cards skip offscreen layout and paint", () => {
    assert.equal(declaresIn(css, desktopCard, /content-visibility:\s*auto/, {topLevel: true}), true);
    assert.equal(declaresIn(css, desktopCard, /contain-intrinsic-size:\s*220px\s+176px/, {topLevel: true}), true);
});

test("switcher intrinsic size stays bounded and CSS-only", () => {
    const rule = /contain-intrinsic-size:\s*220px\s+176px/;
    assert.match(css, rule);
    assert.doesNotMatch(css.match(rule)?.[0] || "", /url\(|javascript|=>/i);
});

test("mobile switcher cards keep the legacy rendering path", () => {
    assert.equal(declaresIn(css, ".speed-switch.sw__mobile .sw__card", /content-visibility:\s*auto/), false);
    assert.equal(declaresIn(css, ".speed-switch.sw__mobile .sw__card", /contain-intrinsic-size:/), false);
});

test("performance contract fails when either desktop declaration is removed", () => {
    const withoutVisibility = css.replace(/\n\s*content-visibility:\s*auto;/, "");
    const withoutIntrinsic = css.replace(/\n\s*contain-intrinsic-size:\s*220px\s+176px;/, "");
    assert.equal(declaresIn(withoutVisibility, desktopCard, /content-visibility:\s*auto/, {topLevel: true}), false);
    assert.equal(declaresIn(withoutIntrinsic, desktopCard, /contain-intrinsic-size:\s*220px\s+176px/, {topLevel: true}), false);
});

test("updated metadata requests are skipped when no consumer is enabled", () => {
    assert.match(indexSource, /if \(settings\.sortBy === "updatedDesc" \|\| settings\.showCardUpdatedBadge === true\) \{/,
        "desktop and mobile first paint should gate the blocks.updated request");
    assert.match(indexSource, /const sidebarSettings = this\.getSettings\(\);[\s\S]*?if \(sidebarSettings\.sortBy === "updatedDesc" \|\| sidebarSettings\.showCardUpdatedBadge === true\) \{/,
        "sidebar first paint should gate the blocks.updated request");
});
