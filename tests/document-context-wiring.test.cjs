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
    assert.match(source, /outlineStatus: !request\.includeOutline/);
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

test("document-context forwards bounded metadata fields", () => {
    assert.match(source, /notebookName: tabNotebookName/);
    assert.match(source, /pathSource: "tab"/);
});

test("document-context keeps closed fallback metadata explicit", () => {
    assert.match(source, /kernelNotebookName = notebookMap\.get/);
    assert.match(source, /pathSource: "none"/);
});

test("document-context does not widen SQL projection for path diagnostics", () => {
    assert.doesNotMatch(source, /SELECT id, content, box, path/);
});

test("document-context outline empty state is based on array length", () => {
    assert.match(source, /outlineJson\.data\.length > 0/);
});

test("document-context does not expose metadata missing input", () => {
    assert.doesNotMatch(source, /metadataMissing:/);
});

test("document-context outline request keeps preview disabled", () => {
    assert.match(source, /getDocOutline", \{id, preview: false\}/);
});

test("document-context keeps stable unavailable error", () => {
    assert.match(source, /document context unavailable/);
});

test("document-context computes cache notebook source", () => {
    assert.match(source, /tabNotebookNameSource = cachedNotebookName/);
    assert.match(source, /notebookNameSource: tabNotebookNameSource/);
});

test("document-context computes kernel notebook source", () => {
    assert.match(source, /kernelNotebookName/);
    assert.match(source, /notebookNameSource: kernelNotebookName \? "cache" : "none"/);
});

test("document-context gives cache names precedence over aliases", () => {
    assert.match(source, /cachedNotebookName\n\s*\|\|/);
});

test("document-context keeps notebook source read-only", () => {
    assert.doesNotMatch(source, /notebookNameSource\s*=\s*request/);
});

test("document-context keeps notebook source bounded by builder", () => {
    assert.match(source, /buildDocumentContext\(/);
});

test("document-context kernel fallback remains pathless", () => {
    assert.match(source, /path: "", pathSource: "none"/);
});

test("document-context cache lookup remains in-memory", () => {
    assert.match(source, /this\.notebookListCache \|\| \[\]/);
});

test("document-context does not add notebook network calls", () => {
    assert.doesNotMatch(source, /fetchKernelJson\("\/api\/notebook/);
});

test("document-context normalizes includeOutline input", () => {
    assert.match(source, /normalizeDocumentContextRequest\(args \|\| \{\}\)/);
});

test("document-context skips outline request when disabled", () => {
    assert.match(source, /if \(request\.includeOutline\)/);
});

test("document-context marks skipped outline as not-requested", () => {
    assert.match(source, /!request\.includeOutline \? "not-requested"/);
});

test("document-context keeps headings empty when outline is skipped", () => {
    assert.match(source, /headings: outlineAvailable \? outlineJson\.data : \[\]/);
});

test("document-context preserves outline failure distinction", () => {
    assert.match(source, /: "unavailable"\),/);
});

test("document-context keeps outline endpoint preview disabled", () => {
    assert.match(source, /preview: false/);
});

test("document-context remains metadata-first for skip mode", () => {
    assert.match(source, /let record: Record<string, unknown>/);
});

test("document-context skip mode still builds structured output", () => {
    assert.match(source, /structuredContent: content/);
});

test("document-context returns a structured bounded result", () => {
    assert.match(source, /structuredContent: content, result: JSON\.stringify\(content\)/);
});

test("document-context failure text is stable and does not echo exceptions", () => {
    assert.match(source, /return \{error: "document context unavailable"\}/);
    assert.match(source, /logger\.warn\("Agent document context unavailable", error\)/);
});
