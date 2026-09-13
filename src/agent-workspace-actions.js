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

const WORKSPACE_ACTION_SPECS = Object.freeze({
    "open-document": Object.freeze({effect: "navigation", requiresConfirmation: true, maxTargets: 1}),
    "open-documents": Object.freeze({effect: "navigation", requiresConfirmation: true, maxTargets: 5}),
    "restore-document-set": Object.freeze({effect: "navigation", requiresConfirmation: true, maxTargets: 1}),
    "update-task-status": Object.freeze({effect: "localWrite", requiresConfirmation: true, maxTargets: 1}),
    "create-document": Object.freeze({effect: "localWrite", requiresConfirmation: true, maxTargets: 1}),
    "append-to-journal": Object.freeze({effect: "localWrite", requiresConfirmation: true, maxTargets: 1}),
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

function createWorkspaceActionExecutor(handlers = {}, options = {}) {
    return async (step, index = 0) => {
        const normalized = normalizeWorkspaceStep(step);
        if (!normalized) return {status: "failed", reason: "invalid_step"};
        if (options.signal?.aborted) return {status: "cancelled"};
        const handler = handlers[ACTION_KEYS[normalized.action]];
        if (typeof handler !== "function") return {status: "failed", reason: "handler_missing"};
        try {
            const result = await handler(normalized, {index, action: normalized.action, signal: options.signal});
            return normalizeWorkspaceActionResult(normalized.action, result);
        } catch (error) {
            return {status: "failed", reason: error?.reason || error?.code || "handler_failed"};
        }
    };
}

function normalizeWorkspaceActionResult(action, result) {
    const source = result && typeof result === "object" ? result : {};
    const status = ["completed", "skipped", "failed", "cancelled"].includes(source.status) ? source.status : "completed";
    const out = {status};
    if (status === "failed") out.reason = cleanResultToken(source.reason || "handler_failed");
    if (action === "open-document" || action === "update-task-status") {
        const id = normalizeAgentDocumentId(source.id);
        if (id) out.id = id;
        if (action === "update-task-status" && typeof source.done === "boolean") out.done = source.done;
    } else if (action === "open-documents") {
        out.opened = normalizeAgentDocumentIds(source.opened, 5);
        out.failed = normalizeAgentDocumentIds(source.failed, 5);
    } else if (status !== "failed" && (action === "create-document" || action === "append-to-journal")) {
        const docId = normalizeAgentDocumentId(source.docId);
        if (docId) out.docId = docId;
    }
    return validateWorkspaceActionPostcondition(action, out);
}

function validateWorkspaceActionPostcondition(action, result) {
    if (result.status !== "completed") return result;
    if (action === "open-document" && !result.id) return {status: "failed", reason: "missing_result"};
    if (action === "open-documents" && !(result.opened?.length || result.failed?.length)) return {status: "failed", reason: "missing_result"};
    if (action === "update-task-status" && (!result.id || typeof result.done !== "boolean")) return {status: "failed", reason: "missing_result"};
    if ((action === "create-document" || action === "append-to-journal") && !result.docId) return {status: "failed", reason: "missing_result"};
    return result;
}

function cleanResultToken(value) {
    const token = typeof value === "string" ? value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : "handler_failed";
    return token || "handler_failed";
}

function buildWorkspacePlanSummary(plan) {
    if (!plan || !Array.isArray(plan.steps)) return null;
    const steps = plan.steps.slice(0, 8).filter((step) => WORKSPACE_ACTION_SPECS[step?.action]);
    const navigationSteps = steps.filter((step) => WORKSPACE_ACTION_SPECS[step.action].effect === "navigation").length;
    const writeSteps = steps.length - navigationSteps;
    const targetCount = steps.reduce((sum, step) => sum + (Array.isArray(step.ids) ? step.ids.length : 1), 0);
    return {
        planId: typeof plan.planId === "string" ? plan.planId.slice(0, 32) : "",
        stepCount: steps.length,
        targetCount: Math.min(40, targetCount),
        navigationSteps,
        writeSteps,
        requiresConfirmation: steps.some((step) => WORKSPACE_ACTION_SPECS[step.action].requiresConfirmation),
        requiresWrite: writeSteps > 0,
    };
}

module.exports = {ACTION_KEYS, WORKSPACE_ACTION_SPECS, normalizeWorkspaceStep, normalizeWorkspaceActionResult, validateWorkspaceActionPostcondition, createWorkspaceActionExecutor, buildWorkspacePlanSummary};
