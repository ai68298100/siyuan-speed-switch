const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceText} = require("./source-scan.cjs");

const source = readSourceText("src/home-store-ui.ts");

function guardBlock(marker) {
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing guard marker: ${marker}`);
    const open = source.indexOf("{", start);
    const lineStart = source.lastIndexOf("\n", start) + 1;
    const indent = source.slice(lineStart, start);
    const endMarker = `\n${indent}    return;\n${indent}}`;
    const end = source.indexOf(endMarker, open);
    assert.ok(open > start && end > open, `missing guard body: ${marker}`);
    return source.slice(start, end + endMarker.length);
}

test("store preview tears down a malformed preview dialog and restores focus", () => {
    const block = guardBlock("if (!container) {");
    assert.match(block, /dialog\.destroy\(\)/);
    assert.match(block, /if \(opener\?\.isConnected\) opener\.focus\(\)/);

    const injected = block.replace("dialog.destroy();", "");
    assert.doesNotMatch(injected, /dialog\.destroy\(\)/,
        "removing preview cleanup must make the contract fail");
});

test("store surface tears down malformed catalog/detail shells", () => {
    assert.match(source, /if \(!root\) storeDialog\.destroy\(\);/);
    assert.match(source, /if \(!root && opener\?\.isConnected\) opener\.focus\(\);/);
    const paneBlock = guardBlock("if (!catalogPane || !detailPane) {");
    assert.match(paneBlock, /storeDialog\.destroy\(\)/);
    assert.match(paneBlock, /if \(opener\?\.isConnected\) opener\.focus\(\)/);

    const injected = paneBlock.replace("storeDialog.destroy();", "");
    assert.doesNotMatch(injected, /storeDialog\.destroy\(\)/,
        "removing store cleanup must make the contract fail");

    const injectedRoot = source.replace("if (!root) storeDialog.destroy();", "");
    assert.doesNotMatch(injectedRoot, /if \(!root\) storeDialog\.destroy\(\);/,
        "removing malformed root cleanup must make the contract fail");
});
