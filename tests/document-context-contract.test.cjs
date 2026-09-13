const test = require("node:test");
const assert = require("node:assert/strict");
const {
    MAX_HEADINGS, MAX_PATH_LENGTH, MAX_TITLE_LENGTH, DOCUMENT_CONTEXT_SPEC,
    normalizeDocumentContextRequest, normalizeDocumentContextPath,
    extractDocumentContextRecord, buildDocumentContext,
} = require("../src/agent-document-context.js");

const validId = "20260914083000-abcdef";
const validNotebook = "20260914083001-boxbox";

test("document context constants keep bounded limits", () => {
    assert.equal(MAX_HEADINGS, 24);
    assert.equal(MAX_PATH_LENGTH, 256);
    assert.equal(MAX_TITLE_LENGTH, 256);
    assert.equal(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.headings.maxItems, 24);
});

test("request normalization accepts a valid id and integer limit", () => {
    assert.deepEqual(normalizeDocumentContextRequest({id: validId, limit: 7}), {id: validId, limit: 7});
});

test("request normalization rejects malformed ids without throwing", () => {
    assert.deepEqual(normalizeDocumentContextRequest({id: "https://evil", limit: 4}), {id: "", limit: 4});
    assert.deepEqual(normalizeDocumentContextRequest(null), {id: "", limit: 24});
});

test("request normalization clamps lower and upper limits", () => {
    assert.equal(normalizeDocumentContextRequest({limit: -9}).limit, 1);
    assert.equal(normalizeDocumentContextRequest({limit: 999}).limit, 24);
    assert.equal(normalizeDocumentContextRequest({limit: 2.9}).limit, 2);
});

test("request normalization uses the default for non-finite limits", () => {
    assert.equal(normalizeDocumentContextRequest({limit: "nope"}).limit, 24);
    assert.equal(normalizeDocumentContextRequest({limit: Infinity}).limit, 24);
});

test("path normalization converts separators and trims edges", () => {
    assert.equal(normalizeDocumentContextPath(" \\项目\\路线/ "), "/项目/路线");
});

test("path normalization strips control characters", () => {
    assert.equal(normalizeDocumentContextPath("a\n\tb\u0000"), "a b");
});

test("path normalization caps oversized paths", () => {
    assert.equal(normalizeDocumentContextPath("x".repeat(999)).length, MAX_PATH_LENGTH);
});

test("record extraction unwraps a kernel data envelope", () => {
    assert.deepEqual(extractDocumentContextRecord({data: {id: validId, content: "标题", box: validNotebook, hPath: "/a"}}), {
        id: validId, title: "标题", notebookId: validNotebook, path: "/a",
    });
});

test("record extraction supports root_id and hpath aliases", () => {
    assert.deepEqual(extractDocumentContextRecord({root_id: validId, name: "N", notebookID: validNotebook, hpath: "p"}), {
        id: validId, title: "N", notebookId: validNotebook, path: "p",
    });
});

test("record extraction ignores primitive and unknown values", () => {
    assert.deepEqual(extractDocumentContextRecord("secret"), {id: undefined, title: undefined, notebookId: undefined, path: undefined});
    assert.deepEqual(extractDocumentContextRecord({data: "secret"}), {id: undefined, title: undefined, notebookId: undefined, path: undefined});
});

test("context builder normalizes the complete safe envelope", () => {
    assert.deepEqual(buildDocumentContext({
        data: {id: validId, content: " 当前\n文档 ", box: validNotebook, hPath: "\\项目\\路线"},
        active: true,
        headings: [{id: "20260914083002-aaaaaaa", name: "第一章", depth: 0}],
    }, {limit: 1}), {
        id: validId, title: "当前 文档", notebookId: validNotebook, path: "/项目/路线", active: true,
        headings: [{id: "20260914083002-aaaaaaa", title: "第一章", depth: 0}],
    });
});

test("context builder excludes markdown and unknown fields", () => {
    const result = buildDocumentContext({id: validId, title: "T", markdown: "secret", extra: "drop"});
    assert.equal(Object.hasOwn(result, "markdown"), false);
    assert.equal(Object.hasOwn(result, "extra"), false);
});

test("context builder marks only an explicit true active flag", () => {
    assert.equal(buildDocumentContext({id: validId, active: 1}).active, false);
    assert.equal(buildDocumentContext({id: validId, active: true}).active, true);
});

test("context builder drops malformed document and notebook ids", () => {
    const result = buildDocumentContext({id: "bad", notebookId: "../../etc", title: "T"});
    assert.equal(result.id, "");
    assert.equal(result.notebookId, "");
});

test("context builder bounds and flattens headings", () => {
    const headings = Array.from({length: 40}, (_, i) => ({id: `202609140830${String(i).padStart(2, "0")}-aaaaaaa`, name: `H${i}`, depth: i}));
    const result = buildDocumentContext({id: validId, headings}, {limit: 3});
    assert.equal(result.headings.length, 3);
    assert.equal(result.headings[2].depth, 2);
});

test("context builder skips malformed headings", () => {
    const result = buildDocumentContext({id: validId, headings: [{name: "missing"}, null, {id: "bad", name: "bad"}, {id: "20260914083002-aaaaaaa", name: "ok"}]});
    assert.deepEqual(result.headings.map((item) => item.title), ["bad", "ok"]);
});

test("context builder handles an absent headings array", () => {
    assert.deepEqual(buildDocumentContext({id: validId}).headings, []);
});

test("context builder keeps output keys stable for empty input", () => {
    assert.deepEqual(Object.keys(buildDocumentContext({})), ["id", "title", "notebookId", "path", "active", "headings"]);
});

test("context builder caps title length", () => {
    assert.equal(buildDocumentContext({title: "x".repeat(999)}).title.length, MAX_TITLE_LENGTH);
});

test("context builder cleans control characters from title", () => {
    assert.equal(buildDocumentContext({title: "a\r\nb\u0000"}).title, "a b");
});

test("context builder does not echo input object references", () => {
    const headings = [{id: "20260914083002-aaaaaaa", name: "H"}];
    const result = buildDocumentContext({id: validId, headings});
    assert.notStrictEqual(result.headings, headings);
    headings[0].name = "mutated";
    assert.equal(result.headings[0].title, "H");
});

test("context builder accepts data envelope plus top-level active and headings", () => {
    const result = buildDocumentContext({data: {id: validId, title: "T"}, active: true, headings: []});
    assert.equal(result.id, validId);
    assert.equal(result.active, true);
});
