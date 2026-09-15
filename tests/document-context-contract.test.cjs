const test = require("node:test");
const assert = require("node:assert/strict");
const {
    MAX_HEADINGS, MAX_PATH_LENGTH, MAX_TITLE_LENGTH, DOCUMENT_CONTEXT_SOURCES, DOCUMENT_CONTEXT_METADATA_STATES, DOCUMENT_CONTEXT_PATH_SOURCES, DOCUMENT_CONTEXT_OUTLINE_STATES, DOCUMENT_CONTEXT_SPEC,
    normalizeDocumentContextRequest, normalizeDocumentContextPath,
    extractDocumentContextRecord, buildDocumentContext, normalizeDocumentContextSource,
    deriveDocumentContextMetadataStatus, deriveDocumentContextMissingFields, deriveDocumentContextPathSource, deriveDocumentContextPathReason, deriveDocumentContextOutlineStatus,
} = require("../src/agent-document-context.js");

const validId = "20260914083000-abcdef";
const validNotebook = "20260914083001-boxbox";

test("document context constants keep bounded limits", () => {
    assert.equal(MAX_HEADINGS, 24);
    assert.equal(MAX_PATH_LENGTH, 256);
    assert.equal(MAX_TITLE_LENGTH, 256);
    assert.equal(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.headings.maxItems, 24);
    assert.deepEqual(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.source.enum, [...DOCUMENT_CONTEXT_SOURCES]);
    assert.deepEqual(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.metadataStatus.enum, [...DOCUMENT_CONTEXT_METADATA_STATES]);
    assert.deepEqual(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.pathSource.enum, [...DOCUMENT_CONTEXT_PATH_SOURCES]);
    assert.deepEqual(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.outlineStatus.enum, [...DOCUMENT_CONTEXT_OUTLINE_STATES]);
    assert.equal(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.outlineAvailable.type, "boolean");
    assert.equal(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.pathAvailable.type, "boolean");
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
    assert.deepEqual(Object.fromEntries(Object.entries(buildDocumentContext({
        data: {id: validId, content: " 当前\n文档 ", box: validNotebook, hPath: "\\项目\\路线"},
        active: true,
        headings: [{id: "20260914083002-aaaaaaa", name: "第一章", depth: 0}],
    }, {limit: 1})).filter(([key]) => !["source", "outlineAvailable", "outlineStatus", "metadataStatus", "metadataMissing", "pathSource", "pathReason", "notebookName", "pathAvailable"].includes(key))), {
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
    assert.deepEqual(Object.keys(buildDocumentContext({})), ["id", "title", "notebookId", "notebookName", "path", "pathAvailable", "pathSource", "pathReason", "metadataStatus", "metadataMissing", "active", "source", "outlineAvailable", "outlineStatus", "headings"]);
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

test("context builder preserves explicit opened provenance", () => {
    const context = buildDocumentContext({id: validId, active: false, source: "opened", outlineAvailable: true});
    assert.equal(context.source, "opened");
    assert.equal(context.active, false);
});

test("context builder preserves kernel provenance for closed fallback", () => {
    const context = buildDocumentContext({id: validId, source: "kernel", outlineAvailable: false});
    assert.equal(context.source, "kernel");
    assert.equal(context.outlineAvailable, false);
    assert.deepEqual(context.headings, []);
});

test("context builder rejects unknown provenance safely", () => {
    assert.equal(buildDocumentContext({active: false, source: "remote"}).source, "kernel");
    assert.equal(buildDocumentContext({active: true, source: "remote"}).source, "active");
});

test("context builder defaults outline availability to true for legacy inputs", () => {
    assert.equal(buildDocumentContext({id: validId}).outlineAvailable, true);
});

test("context builder keeps outline failure as an empty bounded list", () => {
    const context = buildDocumentContext({id: validId, outlineAvailable: false, headings: [{id: validId, name: "drop"}]});
    assert.equal(context.outlineAvailable, false);
    assert.equal(context.headings.length, 1);
});

test("context builder extracts notebook name aliases", () => {
    assert.equal(buildDocumentContext({id: validId, notebookName: " 工作 "}).notebookName, "工作");
    assert.equal(buildDocumentContext({id: validId, notebook: "阅读"}).notebookName, "阅读");
});

test("context builder bounds notebook name text", () => {
    assert.equal(buildDocumentContext({notebookName: "x".repeat(999)}).notebookName.length, 128);
});

test("context builder strips notebook name controls", () => {
    assert.equal(buildDocumentContext({notebookName: "a\n\tb"}).notebookName, "a b");
});

test("context builder derives path availability", () => {
    assert.equal(buildDocumentContext({path: "/docs"}).pathAvailable, true);
    assert.equal(buildDocumentContext({path: "   "}).pathAvailable, false);
});

test("context builder keeps path availability aligned after normalization", () => {
    const context = buildDocumentContext({path: "\\docs\\路线"});
    assert.equal(context.path, "/docs/路线");
    assert.equal(context.pathAvailable, true);
});

test("context builder keeps notebook and path fields bounded together", () => {
    const context = buildDocumentContext({notebookName: "n".repeat(500), path: "p".repeat(500)});
    assert.equal(context.notebookName.length, 128);
    assert.equal(context.path.length, 256);
    assert.equal(context.pathAvailable, true);
});

test("context builder preserves empty notebook name for missing cache", () => {
    assert.equal(buildDocumentContext({id: validId}).notebookName, "");
});

test("context builder reports complete metadata when core fields exist", () => {
    assert.equal(buildDocumentContext({id: validId, title: "T", notebookId: validNotebook}).metadataStatus, "complete");
});

test("context builder reports partial metadata for a missing notebook", () => {
    assert.equal(buildDocumentContext({id: validId, title: "T"}).metadataStatus, "partial");
});

test("context builder reports unavailable metadata for an empty record", () => {
    assert.equal(buildDocumentContext({}).metadataStatus, "unavailable");
});

test("metadata status is derived after id normalization", () => {
    assert.equal(buildDocumentContext({id: "bad", title: "T", notebookId: validNotebook}).metadataStatus, "partial");
});

test("metadata status does not expose unknown input values", () => {
    const context = buildDocumentContext({metadataStatus: "complete", secret: "x"});
    assert.equal(context.metadataStatus, "unavailable");
    assert.equal(Object.hasOwn(context, "secret"), false);
});

test("tab paths are attributed to tab source", () => {
    const context = buildDocumentContext({id: validId, path: "/docs", source: "opened"});
    assert.equal(context.pathSource, "tab");
});

test("kernel paths are attributed to kernel source", () => {
    const context = buildDocumentContext({id: validId, path: "/docs", source: "kernel"});
    assert.equal(context.pathSource, "kernel");
});

test("missing paths use the none source", () => {
    assert.equal(buildDocumentContext({id: validId, source: "opened"}).pathSource, "none");
});

test("explicit path source is bounded to the known enum", () => {
    assert.equal(buildDocumentContext({path: "/docs", pathSource: "remote", source: "opened"}).pathSource, "tab");
});

test("path source none wins when an explicit none value is supplied", () => {
    assert.equal(buildDocumentContext({path: "/docs", pathSource: "none"}).pathSource, "none");
});

test("path source does not change normalized path availability", () => {
    const context = buildDocumentContext({path: " \\\\docs\\\\", pathSource: "none"});
    assert.equal(context.pathAvailable, true);
    assert.equal(context.path, "/docs");
});

test("outline status is available for bounded headings", () => {
    const context = buildDocumentContext({id: validId, headings: [{id: validId, name: "H"}]});
    assert.equal(context.outlineStatus, "available");
});

test("outline status is empty for a successful empty response", () => {
    const context = buildDocumentContext({id: validId, outlineAvailable: true, headings: []});
    assert.equal(context.outlineStatus, "empty");
});

test("outline status is unavailable after a failed response", () => {
    const context = buildDocumentContext({id: validId, outlineAvailable: false, headings: []});
    assert.equal(context.outlineStatus, "unavailable");
});

test("outline status rejects unknown values", () => {
    const context = buildDocumentContext({id: validId, outlineStatus: "secret", headings: []});
    assert.equal(context.outlineStatus, "empty");
});

test("explicit outline status remains stable when valid", () => {
    const context = buildDocumentContext({id: validId, outlineStatus: "available", headings: []});
    assert.equal(context.outlineStatus, "available");
});

test("outline availability and status stay independently readable", () => {
    const context = buildDocumentContext({id: validId, outlineAvailable: false, outlineStatus: "unavailable"});
    assert.equal(context.outlineAvailable, false);
    assert.equal(context.outlineStatus, "unavailable");
});

test("new metadata fields are primitive and bounded", () => {
    const context = buildDocumentContext({id: validId, title: "T", notebookId: validNotebook, path: "/x"});
    assert.equal(typeof context.metadataStatus, "string");
    assert.equal(typeof context.pathSource, "string");
    assert.equal(typeof context.outlineStatus, "string");
});

test("context output remains detached after status derivation", () => {
    const input = {id: validId, title: "T", notebookId: validNotebook, headings: []};
    const output = buildDocumentContext(input);
    input.headings.push({id: validId, name: "mutated"});
    assert.equal(output.outlineStatus, "empty");
});

test("missing fields list reports all absent core metadata", () => {
    assert.deepEqual(deriveDocumentContextMissingFields("", "", ""), ["id", "title", "notebookId"]);
});

test("missing fields list reports only absent title", () => {
    assert.deepEqual(deriveDocumentContextMissingFields(validId, "", validNotebook), ["title"]);
});

test("missing fields list is empty for complete metadata", () => {
    assert.deepEqual(deriveDocumentContextMissingFields(validId, "T", validNotebook), []);
});

test("missing fields list rejects truthy non-string values", () => {
    assert.deepEqual(deriveDocumentContextMissingFields(validId, 1, validNotebook), ["title"]);
});

test("missing fields list preserves canonical field order", () => {
    assert.deepEqual(deriveDocumentContextMissingFields("", "T", ""), ["id", "notebookId"]);
});

test("path reason reports available paths", () => {
    assert.equal(deriveDocumentContextPathReason(true), "available");
});

test("path reason reports missing paths", () => {
    assert.equal(deriveDocumentContextPathReason(false), "not-provided");
});

test("path reason is boolean-strict", () => {
    assert.equal(deriveDocumentContextPathReason(1), "not-provided");
});

test("context exposes missing fields for partial metadata", () => {
    const context = buildDocumentContext({id: validId, title: "T"});
    assert.deepEqual(context.metadataMissing, ["notebookId"]);
});

test("context exposes an empty missing list for complete metadata", () => {
    const context = buildDocumentContext({id: validId, title: "T", notebookId: validNotebook});
    assert.deepEqual(context.metadataMissing, []);
});

test("context exposes all missing fields for empty metadata", () => {
    assert.deepEqual(buildDocumentContext({}).metadataMissing, ["id", "title", "notebookId"]);
});

test("context path reason follows normalized path", () => {
    assert.equal(buildDocumentContext({path: "  /docs  "}).pathReason, "available");
});

test("context path reason is not-provided for whitespace path", () => {
    assert.equal(buildDocumentContext({path: " \t "}).pathReason, "not-provided");
});

test("context path reason ignores caller override", () => {
    assert.equal(buildDocumentContext({path: "/docs", pathReason: "not-provided"}).pathReason, "available");
});

test("context metadata missing does not echo unknown keys", () => {
    const context = buildDocumentContext({id: validId, title: "T", notebookId: validNotebook, metadataMissing: ["secret"]});
    assert.deepEqual(context.metadataMissing, []);
});

test("context metadata missing remains bounded", () => {
    assert.ok(buildDocumentContext({}).metadataMissing.length <= 3);
});

test("source normalizer preserves active source", () => {
    assert.equal(normalizeDocumentContextSource("active", false), "active");
});

test("source normalizer preserves opened source", () => {
    assert.equal(normalizeDocumentContextSource("opened", true), "opened");
});

test("source normalizer defaults active unknown input to active", () => {
    assert.equal(normalizeDocumentContextSource("remote", true), "active");
});

test("source normalizer defaults inactive unknown input to kernel", () => {
    assert.equal(normalizeDocumentContextSource("remote", false), "kernel");
});

test("metadata derivation is deterministic for complete values", () => {
    assert.equal(deriveDocumentContextMetadataStatus(validId, "T", validNotebook), "complete");
});

test("metadata derivation treats empty title as partial", () => {
    assert.equal(deriveDocumentContextMetadataStatus(validId, "", validNotebook), "partial");
});

test("metadata derivation treats all empty values as unavailable", () => {
    assert.equal(deriveDocumentContextMetadataStatus("", "", ""), "unavailable");
});

test("metadata derivation does not accept boolean truthiness as complete", () => {
    assert.equal(deriveDocumentContextMetadataStatus(validId, true, validNotebook), "partial");
});

test("path source helper forces none when unavailable", () => {
    assert.equal(deriveDocumentContextPathSource("tab", false, "opened"), "none");
});

test("path source helper preserves explicit tab source", () => {
    assert.equal(deriveDocumentContextPathSource("tab", true, "kernel"), "tab");
});

test("path source helper preserves explicit kernel source", () => {
    assert.equal(deriveDocumentContextPathSource("kernel", true, "opened"), "kernel");
});

test("path source helper defaults active paths to tab", () => {
    assert.equal(deriveDocumentContextPathSource("", true, "active"), "tab");
});

test("path source helper defaults kernel paths to kernel", () => {
    assert.equal(deriveDocumentContextPathSource("", true, "kernel"), "kernel");
});

test("path source helper rejects unknown source values", () => {
    assert.equal(deriveDocumentContextPathSource("remote", true, "opened"), "tab");
});

test("outline helper forces unavailable after failure", () => {
    assert.equal(deriveDocumentContextOutlineStatus("available", false, [{title: "H"}]), "unavailable");
});

test("outline helper preserves explicit available state", () => {
    assert.equal(deriveDocumentContextOutlineStatus("available", true, []), "available");
});

test("outline helper preserves explicit empty state", () => {
    assert.equal(deriveDocumentContextOutlineStatus("empty", true, [{title: "H"}]), "empty");
});

test("outline helper derives available from non-empty headings", () => {
    assert.equal(deriveDocumentContextOutlineStatus("", true, [{title: "H"}]), "available");
});

test("outline helper derives empty from an empty list", () => {
    assert.equal(deriveDocumentContextOutlineStatus("", true, []), "empty");
});

test("outline helper rejects explicit unavailable on success", () => {
    assert.equal(deriveDocumentContextOutlineStatus("unavailable", true, []), "empty");
});

test("outline helper handles malformed heading containers", () => {
    assert.equal(deriveDocumentContextOutlineStatus("", true, "bad"), "empty");
});
