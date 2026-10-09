const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const {readSourceText} = require("./source-scan.cjs");

const studio = readSourceText(path.join(__dirname, "..", "src", "snippet-studio-ui.js"));
const styles = readSourceText(path.join(__dirname, "..", "src", "styles", "_snippet-studio.scss"));

function assertQuickToggleContract(source) {
    assert.match(source, /const\s+catalogToggleBusy\s*=\s*new Set\(\)/,
        "catalog toggles must serialize one row at a time");
    assert.match(source, /store\.mutate\(latest,\s*["']toggle["'],\s*\{\.\.\.latest,\s*enabled:\s*!latest\.enabled\}\)/,
        "quick enable/disable must use the native mutation path");
    assert.match(source, /toggle\.dataset\.snippetToggleId\s*=\s*item\.id/,
        "quick toggle needs a stable row identity for feedback and automation");
    assert.match(source, /wrapper\.append\(button,\s*toggle\)/,
        "selection and quick toggle must be sibling controls");
    assert.doesNotMatch(source, /button\.append\([^\n]*toggle/,
        "quick toggle must never be nested inside the selection button");
}

test("snippet picker exposes a sibling quick enable/disable control", () => {
    assertQuickToggleContract(studio);
    assert.match(studio, /toggle\.dataset\.librarySnippetToggleId\s*=\s*item\.id/,
        "the persistent left snippet selector must expose the same quick action");
    assert.match(styles, /&__catalog-item-wrap\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/,
        "catalog rows reserve a dedicated action column");
    assert.match(styles, /&__library-item-wrap\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/,
        "the persistent selector reserves a dedicated action column");
    assert.match(styles, /&__catalog-toggle\s*\{[\s\S]*cursor:\s*pointer/,
        "quick toggle is visibly actionable");
});

test("quick toggle contract fails when the control is nested", () => {
    const injected = studio.replace("wrapper.append(button, toggle);", "button.append(toggle);");
    assert.throws(() => assertQuickToggleContract(injected), /sibling controls/);
});
