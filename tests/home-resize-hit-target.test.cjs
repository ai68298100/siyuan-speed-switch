const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceFile} = require("./source-scan.cjs");
const {declaresIn} = require("./css-block-scan.cjs");

const panelSource = readSourceFile("src/second-panel-ui.ts");
const styleSource = readSourceFile("src/styles/_12-r54-surface-adapter.scss");

function assertResizeWiring(source) {
    assert.match(source, /const activeResizeCleanups = new Set<\(\) => void>\(\);/,
        "resize cleanup must live at panel scope");
    assert.match(source, /const clearResizeInteractions = \(\) => \{\s*\n\s*\[\.\.\.activeResizeCleanups\]\.forEach\(\(cleanup\) => cleanup\(\)\);/,
        "panel cleanup must release every active resize gesture");
    assert.match(source, /clearResizeInteractions\(\);\s*\n\s*root\.innerHTML = "";/,
        "rerender must cancel resize before replacing the handles");
    assert.match(source, /const onEnd = \(commit: boolean\) => \{\s*\n\s*if \(ended\) return;/,
        "resize finish must be idempotent");
    assert.match(source, /window\.addEventListener\("pointerup", onPointerUp\);\s*\n\s*window\.addEventListener\("pointercancel", onPointerCancel\);\s*\n\s*window\.addEventListener\("keydown", onKeydown, true\);/,
        "resize must listen for pointerup, pointercancel, and Escape");
    assert.match(source, /const onPointerUp = \(\) => onEnd\(true\);\s*\n\s*const onPointerCancel = \(\) => onEnd\(false\);/,
        "pointercancel must cancel instead of committing the resize");
    assert.match(source, /if \(key\.key !== "Escape"\) return;\s*\n\s*key\.preventDefault\(\);\s*\n\s*key\.stopPropagation\(\);\s*\n\s*onEnd\(false\);/,
        "Escape must cancel the resize");
    assert.match(source, /window\.removeEventListener\("pointerup", onPointerUp\);\s*\n\s*window\.removeEventListener\("pointercancel", onPointerCancel\);\s*\n\s*window\.removeEventListener\("keydown", onKeydown, true\);/,
        "resize finish must remove every global listener");
    assert.match(source, /activeResizeCleanups\.add\(cleanup\);\s*\n\s*resizeCleanup = cleanup;/,
        "each resize gesture must register its release callback");
    assert.match(source, /disposeSizeMenu\(\);\s*\n\s*clearResizeInteractions\(\);\s*\n\s*clearDeferredRefreshes\(\);/,
        "releasePanel must cancel an active resize before disposing the panel");
}

test("workbench resize cancels on pointercancel/Escape and cleans up on rerender/destroy", () => {
    assertResizeWiring(panelSource);
});

test("resize contract rejects a pointercancel regression", () => {
    const regressed = panelSource.replace(
        'window.addEventListener("pointercancel", onPointerCancel);',
        'window.addEventListener("pointerup", onPointerCancel);',
    );
    assert.throws(() => assertResizeWiring(regressed), /pointerup, pointercancel, and Escape/);
});

test("resize contract rejects a destroy cleanup regression", () => {
    const regressed = panelSource.replace(
        'clearResizeInteractions();\n            clearDeferredRefreshes();',
        'clearDeferredRefreshes();',
    );
    assert.throws(() => assertResizeWiring(regressed), /releasePanel must cancel/);
});

test("mobile and coarse-pointer task checkboxes keep a 14px visual core with a 44px hit target", () => {
    const coarseSelector = ".sw-home .sw__home-module-list .sw__home-module-item-check";
    const mobileSelector = ".sw-home.sw-home--mobile .sw__home-module-list .sw__home-module-item-check";
    assert.ok(declaresIn(styleSource, coarseSelector, /width:\s*14px/, {atRule: /pointer:\s*coarse/}));
    assert.ok(declaresIn(styleSource, coarseSelector, /height:\s*14px/, {atRule: /pointer:\s*coarse/}));
    assert.ok(declaresIn(styleSource, coarseSelector, /touch-action:\s*manipulation/, {atRule: /pointer:\s*coarse/}));
    assert.ok(declaresIn(styleSource, `${coarseSelector}::before`, /width:\s*44px/, {atRule: /pointer:\s*coarse/}));
    assert.ok(declaresIn(styleSource, `${coarseSelector}::before`, /height:\s*44px/, {atRule: /pointer:\s*coarse/}));
    assert.ok(declaresIn(styleSource, mobileSelector, /width:\s*14px/, {topLevel: true}));
    assert.ok(declaresIn(styleSource, mobileSelector, /height:\s*14px/, {topLevel: true}));
    assert.ok(declaresIn(styleSource, mobileSelector, /touch-action:\s*manipulation/, {topLevel: true}));
    assert.ok(declaresIn(styleSource, `${mobileSelector}::before`, /width:\s*44px/, {topLevel: true}));
    assert.ok(declaresIn(styleSource, `${mobileSelector}::before`, /height:\s*44px/, {topLevel: true}));
});

test("hit-target contract rejects a visual-only checkbox regression", () => {
    const regressed = styleSource.replace(/width:\s*44px;\s*\n\s*height:\s*44px;/g, "width: 14px;\n        height: 14px;");
    assert.notEqual(regressed, styleSource, "negative probe must mutate both hit-target rules");
    assert.equal(declaresIn(regressed, ".sw-home .sw__home-module-list .sw__home-module-item-check::before", /width:\s*44px/, {atRule: /pointer:\s*coarse/}), false);
});
