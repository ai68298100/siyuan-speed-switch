"use strict";

// v0.17 Agent groundwork.  Kept as a standalone contract until the host-side
// capability is wired after a real desktop cancellation/permission audit.
const {flattenOutline, normalizeAgentDocumentId, normalizeAgentNotebookId} = require("./agent-capabilities.js");

const MAX_HEADINGS = 24;
const MAX_PATH_LENGTH = 256;
const MAX_TITLE_LENGTH = 256;
const DOCUMENT_CONTEXT_SOURCES = Object.freeze(["active", "opened", "kernel"]);

function normalizeDocumentContextRequest(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const id = normalizeAgentDocumentId(source.id);
    const rawLimit = Number(source.limit);
    const limit = Number.isFinite(rawLimit)
        ? Math.min(MAX_HEADINGS, Math.max(1, Math.trunc(rawLimit)))
        : MAX_HEADINGS;
    return {id, limit};
}

function normalizeDocumentContextPath(value) {
    const cleaned = cleanText(value, MAX_PATH_LENGTH).replace(/\\/g, "/");
    const rooted = cleaned.startsWith("/");
    const body = cleaned.replace(/^\/+|\/+$/g, "");
    return (rooted ? "/" : "") + body;
}

function extractDocumentContextRecord(value) {
    const source = value && typeof value === "object" ? value : {};
    const data = source.data && typeof source.data === "object" ? source.data : source;
    return {
        id: data.id ?? data.root_id ?? data.rootId,
        title: data.title ?? data.name ?? data.content,
        notebookId: data.notebookId ?? data.notebookID ?? data.box,
        path: data.path ?? data.hPath ?? data.hpath,
    };
}

const DOCUMENT_CONTEXT_SPEC = Object.freeze({
    name: "document-context",
    title: "小驴速切文档上下文",
    description: "只读获取当前或指定文档的有限上下文：标题、笔记本、路径、活动状态和有界大纲。不返回正文，不修改笔记。",
    inputSchema: Object.freeze({
        type: "object",
        properties: {
            id: {type: "string", minLength: 1, maxLength: 64, pattern: "^[0-9]{14}-[0-9a-z]+$"},
            limit: {type: "integer", minimum: 1, maximum: MAX_HEADINGS},
        },
        additionalProperties: false,
    }),
    outputSchema: Object.freeze({
        type: "object",
        properties: {
            id: {type: "string", maxLength: 64},
            title: {type: "string", maxLength: 256},
            notebookId: {type: "string", maxLength: 64},
            path: {type: "string", maxLength: MAX_PATH_LENGTH},
            active: {type: "boolean"},
            source: {type: "string", enum: [...DOCUMENT_CONTEXT_SOURCES]},
            outlineAvailable: {type: "boolean"},
            headings: {type: "array", maxItems: MAX_HEADINGS, items: {type: "object", maxProperties: 3, additionalProperties: false}},
        },
        required: ["id", "title", "notebookId", "path", "active", "source", "outlineAvailable", "headings"],
        additionalProperties: false,
    }),
});

function buildDocumentContext(value, options = {}) {
    const source = extractDocumentContextRecord(value);
    const limit = normalizeDocumentContextRequest(options).limit;
    const active = value?.active === true;
    const requestedSource = typeof value?.source === "string" ? value.source : "";
    const contextSource = DOCUMENT_CONTEXT_SOURCES.includes(requestedSource)
        ? requestedSource
        : (active ? "active" : "kernel");
    return {
        id: normalizeAgentDocumentId(source.id),
        title: cleanText(source.title, MAX_TITLE_LENGTH),
        notebookId: normalizeAgentNotebookId(source.notebookId),
        path: normalizeDocumentContextPath(source.path),
        active,
        source: contextSource,
        outlineAvailable: value?.outlineAvailable !== false,
        headings: flattenOutline(value?.headings, limit),
    };
}

function cleanText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

module.exports = {
    MAX_HEADINGS,
    MAX_PATH_LENGTH,
    MAX_TITLE_LENGTH,
    DOCUMENT_CONTEXT_SOURCES,
    DOCUMENT_CONTEXT_SPEC,
    normalizeDocumentContextRequest,
    normalizeDocumentContextPath,
    extractDocumentContextRecord,
    buildDocumentContext,
};
