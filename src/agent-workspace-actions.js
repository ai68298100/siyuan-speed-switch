"use strict";

// Fixed-action adapter for v0.17 plans.  The module validates and dispatches
// only declared actions; host integration supplies the actual side effects.
const {PLAN_ACTIONS} = require("./agent-workspace-plan.js");
const {normalizeAgentDocumentId, normalizeAgentDocumentIds, normalizeAgentNotebookId, sanitizeJournalAppend} = require("./agent-capabilities.js");

const ACTION_KEYS = Object.freeze({
    "open-document": "openDocument",
    "open-documents": "openDocuments",
    "restore-document-set": "restoreDocumentSet",
    "update-task-status": "updateTaskStatus",
    "create-document": "createDocument",
    "append-to-journal": "appendToJournal",
});

function normalizeWorkspaceStep(step) {
    if (!step || typeof step !== "object" || !PLAN_ACTIONS.includes(step.action)) return null;
    const action = step.action;
    const out = {action};
    if (action === "open-document" || action === "update-task-status") {
        const id = normalizeAgentDocumentId(Array.isArray(step.ids) ? step.ids[0] : step.id);
        if (!id) return null;
        out.id = id;
        if (action === "update-task-status") out.done = step.done === true;
    } else if (action === "open-documents") {
        out.ids = normalizeAgentDocumentIds(step.ids, 5);
        if (!out.ids.length) return null;
    } else if (action === "restore-document-set") {
        out.setId = typeof step.setId === "string" ? step.setId.trim().slice(0, 64) : "";
        if (!out.setId) return null;
    } else if (action === "create-document") {
        out.notebook = normalizeAgentNotebookId(step.notebook) || (typeof step.notebook === "string" ? step.notebook.trim().slice(0, 64) : "");
        out.title = typeof step.title === "string" ? step.title.trim().slice(0, 128) : "";
        out.markdown = typeof step.markdown === "string" ? step.markdown.slice(0, 4096) : "";
        if (!out.notebook || !out.title) return null;
    } else if (action === "append-to-journal") {
        out.content = sanitizeJournalAppend(step.content);
        if (!out.content) return null;
    }
    return out;
}

function createWorkspaceActionExecutor(handlers = {}) {
    return async (step) => {
        const normalized = normalizeWorkspaceStep(step);
        if (!normalized) return {status: "failed", reason: "invalid_step"};
        const handler = handlers[ACTION_KEYS[normalized.action]];
        if (typeof handler !== "function") return {status: "failed", reason: "handler_missing"};
        try {
            const result = await handler(normalized);
            return result && typeof result === "object" ? result : {status: "completed"};
        } catch (error) {
            return {status: "failed", reason: error?.reason || error?.code || "handler_failed"};
        }
    };
}

module.exports = {ACTION_KEYS, normalizeWorkspaceStep, createWorkspaceActionExecutor};
