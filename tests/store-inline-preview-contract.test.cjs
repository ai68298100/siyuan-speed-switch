const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {declaresIn} = require("./css-block-scan.cjs");

const root = path.resolve(__dirname, "..");
const source = readSourceText(path.join(root, "src", "home-store-ui.ts"));
const css = readSourceText(path.join(root, "src", "index.scss"));

test("desktop store opts into the fullscreen host container", () => {
    assert.match(source, /if \(!this\.isMobile\) \{[\s\S]*?sw-dialog--fullscreen[\s\S]*?sw-home-store-dialog/);
});

test("mobile store keeps the sheet path", () => {
    assert.match(source, /width: this\.isMobile \? "min\(680px, 94vw\)"/);
    assert.doesNotMatch(source, /if \(this\.isMobile\)[\s\S]{0,100}sw-dialog--fullscreen/);
});

test("selected module mounts an inline live preview", () => {
    assert.match(source, /const inlinePreview = buildInlinePreview\(storeSelectedModule, detailDef, previewSize\)/);
    assert.match(source, /detailPane\.appendChild\(inlinePreview\.section\)/);
});

test("inline preview uses the stored size or shared default", () => {
    assert.match(source, /const previewSize = selectedLayout\?\.size \|\| resolveHomeTileDefaultSize\(storeSelectedModule, supportedSizes, "medium"\)/);
});

test("directory rerenders dispose the previous inline controller", () => {
    assert.match(source, /const renderStore = \(\) => \{\s*disposeInlinePreview\(\);/);
    assert.match(source, /disposeStore = \(\) => \{[\s\S]*?disposeInlinePreview\(\);/);
});

test("size selection refreshes the existing preview", () => {
    assert.match(source, /onSizeChange\(sizeKey\);\s*void controller\?\.refresh\(\{\}, \{force: true\}\)/);
    assert.match(source, /buildReadyCard\(storeSelectedModule, detailDef, "detail", inlinePreview\.mount\.setSize\)/);
});

test("the old duplicate preview action is absent", () => {
    assert.doesNotMatch(source, /previewButton\.dataset\.action = "preview"/);
    assert.doesNotMatch(source, /openStoreWidgetPreview\.call\(this, moduleId, def, device, selectedTile/);
});

test("fullscreen and inline preview styles are scoped", () => {
    assert.ok(declaresIn(css, ".b3-dialog__container.sw-home-store-dialog.sw-dialog--fullscreen", /width: 100vw/));
    assert.ok(declaresIn(css, ".sw-home-store__live-preview", /border:/));
    assert.ok(declaresIn(css, ".sw-home-store__inline-preview", /min-height:/));
});
