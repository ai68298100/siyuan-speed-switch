"use strict";

const {flipTaskMarkdown, normalizeAgentDocumentId, normalizeAgentNotebookId, sanitizeJournalAppend} = require("./agent-capabilities.js");

function createWriteActionHandlers(options = {}) {
    return {
        updateTaskStatus: async (step, context = {}) => {
            if (context.signal?.aborted) return {status: "cancelled"};
            if (typeof options.readTask !== "function" || typeof options.updateBlock !== "function") return {status: "failed", reason: "handler_missing"};
            const id = normalizeAgentDocumentId(step.id);
            if (!id) return {status: "failed", reason: "invalid_target"};
            const row = await options.readTask(id);
            if (!row || typeof row !== "object") return {status: "failed", reason: "task_not_found"};
            const markdown = flipTaskMarkdown(String(row.markdown || ""), step.done === true);
            if (!markdown) return {status: "failed", reason: "not_a_task"};
            if (context.signal?.aborted) return {status: "cancelled"};
            const ok = await options.updateBlock(id, markdown, context);
            return ok ? {status: "completed", id, done: step.done === true} : {status: "failed", reason: "update_failed"};
        },
        createDocument: async (step, context = {}) => {
            if (context.signal?.aborted) return {status: "cancelled"};
            if (typeof options.createDocument !== "function") return {status: "failed", reason: "handler_missing"};
            const notebook = normalizeAgentNotebookId(step.notebook) || String(step.notebook || "").trim().slice(0, 64);
            const title = String(step.title || "").trim().slice(0, 128);
            const markdown = typeof step.markdown === "string" ? step.markdown.slice(0, 4096) : "";
            if (!notebook || !title) return {status: "failed", reason: "invalid_payload"};
            const result = await options.createDocument({notebook, title, markdown}, context);
            const docId = normalizeAgentDocumentId(result?.docId);
            return docId ? {status: "completed", docId} : {status: "failed", reason: "create_failed"};
        },
        appendToJournal: async (step, context = {}) => {
            if (context.signal?.aborted) return {status: "cancelled"};
            if (typeof options.ensureJournal !== "function" || typeof options.appendBlock !== "function") return {status: "failed", reason: "handler_missing"};
            const content = sanitizeJournalAppend(step.content);
            const notebook = normalizeAgentNotebookId(options.notebook);
            if (!content || !notebook) return {status: "failed", reason: "invalid_payload"};
            const docId = normalizeAgentDocumentId(await options.ensureJournal(notebook, context));
            if (!docId || context.signal?.aborted) return {status: context.signal?.aborted ? "cancelled" : "journal_unavailable"};
            const ok = await options.appendBlock(docId, content, context);
            return ok ? {status: "completed", docId} : {status: "failed", reason: "append_failed"};
        },
    };
}

module.exports = {createWriteActionHandlers};
