"use strict";

// v0.17 Agent groundwork.  Kept as a standalone contract until the host-side
// capability is wired after a real desktop cancellation/permission audit.
const {flattenOutline, normalizeAgentDocumentId, normalizeAgentNotebookId} = require("./agent-capabilities.js");

const MAX_HEADINGS = 24;
const MAX_PATH_LENGTH = 256;

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
            headings: {type: "array", maxItems: MAX_HEADINGS, items: {type: "object", maxProperties: 3, additionalProperties: false}},
        },
        required: ["id", "title", "notebookId", "path", "active", "headings"],
        additionalProperties: false,
    }),
});

function buildDocumentContext(value, options = {}) {
    const source = value && typeof value === "object" ? value : {};
    const limit = Math.min(MAX_HEADINGS, Math.max(1, Math.trunc(Number(options.limit) || MAX_HEADINGS)));
    return {
        id: normalizeAgentDocumentId(source.id),
        title: cleanText(source.title, 256),
        notebookId: normalizeAgentNotebookId(source.notebookId),
        path: cleanText(source.path, MAX_PATH_LENGTH),
        active: source.active === true,
        headings: flattenOutline(source.headings, limit),
    };
}

function cleanText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

module.exports = {MAX_HEADINGS, DOCUMENT_CONTEXT_SPEC, buildDocumentContext};
