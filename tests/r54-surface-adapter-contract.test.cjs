const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");
const {declaresIn} = require("./css-block-scan.cjs");

const styles = readSourceFile("src/styles/_12-r54-surface-adapter.scss");

function assertAdapter(source) {
    const base = {topLevel: true};
    assert.equal(declaresIn(source, ".speed-switch .sw__toolbar", /min-height:\s*64px/, base), true);
    assert.equal(declaresIn(source, ".speed-switch .sw__scroll", /background:\s*var\(--sw-r54-canvas\)/, base), true);
    assert.equal(declaresIn(source, ".sw-home__cell", /border:\s*1px solid var\(--sw-r54-line\)/, base), true);
    assert.equal(declaresIn(source, ".sw-home-store__card", /box-shadow:\s*none/, base), true);
    assert.equal(declaresIn(source, ".sw-studio__header", /min-height:\s*64px/, base), true);
    assert.equal(declaresIn(source, ".sw-studio__button", /min-height:\s*40px/, base), true);
    assert.equal(declaresIn(source, ".sw-platform-surface", /container-type:\s*inline-size/, base), true);
    assert.equal(declaresIn(source, ".sw-home__cell", /grid-column:\s*1 \/ -1/, {atRule: /max-width:\s*560px/}), true);
}

test("T-7242 R54 surface adapter keeps the three surfaces on one visual contract", () => {
    assertAdapter(styles);
});

test("T-7242 adapter contract has a discriminating negative probe", () => {
    const injected = styles.replace(
        ".sw-home {\n    padding: var(--sw-r54-space-4) var(--sw-r54-space-5) 0;",
        ".sw-home {\n    padding: var(--sw-r54-space-4) var(--sw-r54-space-5) 0;",
    ).replace(
        "    &__cell {\n        border: 1px solid var(--sw-r54-line);",
        "    &__cell {\n        border: 0;",
    );
    assert.throws(() => assertAdapter(injected), /true|strict equal/i,
        "removing the workbench card border must fail the adapter contract");
});
