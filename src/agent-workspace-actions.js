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

module.exports = {ACTION_KEYS, WORKSPACE_ACTION_SPECS, normalizeWorkspaceStep, createWorkspaceActionExecutor, buildWorkspacePlanSummary};
