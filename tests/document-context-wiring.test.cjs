const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");

test("document-context module is imported by the plugin entry", () => {
    assert.match(source, /from "\.\/agent-document-context"/);
});

test("document-context capability is registered through the read-only list", () => {
    assert.match(source, /spec: DOCUMENT_CONTEXT_SPEC/);
    assert.match(source, /readOnlyDefinitions\.push|const readOnlyDefinitions/);
});

test("document-context defaults to the active root when id is omitted", () => {
    assert.match(source, /const id = request\.id \|\| activeRoot/);
});

test("document-context validates the resolved id before querying", () => {
    assert.match(source, /if \(!id \|\| !BLOCK_ID_RE\.test\(id\)\)/);
});

test("document-context uses the bounded SQL fallback for closed documents", () => {
    assert.match(source, /SELECT id, content, box FROM blocks WHERE id='/);
    assert.match(source, /LIMIT 1/);
});

test("document-context reuses the existing outline endpoint", () => {
    assert.match(source, /fetchKernelJson\("\/api\/outline\/getDocOutline", \{id, preview: false\}\)/);
});

test("document-context uses tab metadata before the SQL fallback", () => {
    assert.match(source, /const tab = opened\.find\(\(candidate\) =>/);
});

test("document-context marks active state by stable root id", () => {
    assert.match(source, /const isActiveDocument = Boolean\(activeRoot && activeRoot === id\)/);
    assert.match(source, /active: isActiveDocument/);
});

test("document-context reports active/opened/kernel provenance", () => {
    assert.match(source, /const contextSource = isActiveDocument \? "active" : \(tab \? "opened" : "kernel"\)/);
    assert.match(source, /source: contextSource/);
});

test("document-context separates metadata and outline failures", () => {
    assert.match(source, /Agent document context metadata unavailable/);
    assert.match(source, /Agent document context outline unavailable/);
    assert.match(source, /outlineAvailable = false/);
});

test("document-context exposes bounded outline availability", () => {
    assert.match(source, /outlineAvailable = Boolean\(outlineJson && outlineJson\.code === 0 && Array\.isArray\(outlineJson\.data\)\)/);
    assert.match(source, /outlineAvailable,/);
});

test("document-context marks tab metadata path provenance", () => {
    assert.match(source, /pathSource: "tab"/);
    assert.match(source, /pathSource: "none"/);
});

test("document-context reports outline empty versus unavailable", () => {
    assert.match(source, /outlineStatus: outlineAvailable/);
    assert.match(source, /\? "available"/);
    assert.match(source, /: "unavailable"/);
});

test("document-context keeps notebook lookup cache-only", () => {
    assert.match(source, /new Map\(\(this\.notebookListCache \|\| \[\]\)\.map/);
    assert.doesNotMatch(source, /fetchKernelJson\("\/api\/notebook/);
});

test("document-context falls back to tab notebookName aliases", () => {
    assert.match(source, /tabNotebookName = tab/);
    assert.match(source, /\.notebookName/);
    assert.match(source, /\.boxName/);
});

test("document-context keeps SQL fallback query bounded", () => {
    assert.match(source, /SELECT id, content, box FROM blocks WHERE id='/);
    assert.match(source, /LIMIT 1/);
});

test("document-context does not claim a kernel path for SQL rows", () => {
    assert.match(source, /path: "", pathSource: "none"/);
});

test("document-context computes outline status from bounded response data", () => {
    assert.match(source, /Array\.isArray\(outlineJson\?\.data\)/);
    assert.match(source, /outlineJson\.data\.length > 0/);
});

test("document-context still emits outline availability boolean", () => {
    assert.match(source, /outlineAvailable,/);
});

test("document-context continues to return structured content", () => {
    assert.match(source, /structuredContent: content/);
});

test("document-context returns a structured bounded result", () => {
    assert.match(source, /structuredContent: content, result: JSON\.stringify\(content\)/);
});

test("document-context failure text is stable and does not echo exceptions", () => {
    assert.match(source, /return \{error: "document context unavailable"\}/);
    assert.match(source, /logger\.warn\("Agent document context unavailable", error\)/);
});
