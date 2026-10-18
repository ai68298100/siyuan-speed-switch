const test = require("node:test");
const assert = require("node:assert/strict");
const {readSourceText} = require("./source-scan.cjs");

const source = readSourceText("src/index.ts");

test("outline consumers request the heading tree from SiYuan", () => {
    const endpoint = "/api/outline/getDocOutline";
    const calls = source.match(new RegExp(`fetchKernelJson\\(\\\"${endpoint}\\\"`, "g")) || [];
    assert.equal(calls.length, 3, "home widget, Agent outline, and document context must all use the shared endpoint");
    assert.equal((source.match(/getDocOutline\", \{(?:id: rootId|id), preview: true\}/g) || []).length, 3,
        "all outline consumers must enable preview so SiYuan returns the heading tree");
    assert.doesNotMatch(source, /getDocOutline\", \{(?:id: rootId|id), preview: false\}/,
        "preview=false returns no heading data on current SiYuan hosts");
});

test("outline adapter resolves the current tab even when the host window is unfocused", () => {
    assert.match(source, /return getActiveTab\(\) \|\| getActiveTab\(false\) \|\| undefined/,
        "background/headless WebViews must not fall back to the no-document empty state");
});
