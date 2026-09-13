"use strict";

// v0.17 Agent groundwork: dry-run plans are deliberately standalone until
// host-level approval, cancellation and expiry semantics are verified.
const {normalizeAgentDocumentId, normalizeAgentDocumentIds} = require("./agent-capabilities.js");

const MAX_PLAN_STEPS = 8;
const MAX_PLAN_TTL_MS = 10 * 60 * 1000;
const PLAN_ACTIONS = Object.freeze(["open-document", "open-documents", "restore-document-set", "update-task-status", "create-document", "append-to-journal"]);
const WRITE_ACTIONS = Object.freeze(["update-task-status", "create-document", "append-to-journal"]);
const RECEIPT_STATUSES = Object.freeze(["completed", "skipped", "failed", "cancelled"]);
const PLAN_RESULT_STATUSES = Object.freeze(["completed", "partial", "failed", "cancelled", "expired"]);

const WORKSPACE_PLAN_SPEC = Object.freeze({
    name: "workspace-plan",
    title: "小驴速切工作区执行计划",
    description: "只读生成待审阅的工作区动作计划。仅列出固定白名单动作和有界目标，不执行任何导航或写入。",
    inputSchema: Object.freeze({
        type: "object",
        properties: {
            steps: {
                type: "array",
                minItems: 1,
                maxItems: MAX_PLAN_STEPS,
                items: {
                    type: "object",
                    properties: {
                        action: {type: "string", enum: PLAN_ACTIONS},
                        id: {type: "string", maxLength: 64},
                        ids: {type: "array", maxItems: 5, items: {type: "string", maxLength: 64}},
                        setId: {type: "string", maxLength: 64},
                        done: {type: "boolean"},
                    },
                    required: ["action"],
                    additionalProperties: false,
                },
            },
            ttlMs: {type: "integer", minimum: 1000, maximum: MAX_PLAN_TTL_MS},
        },
        required: ["steps"],
        additionalProperties: false,
    }),
    outputSchema: Object.freeze({
        type: "object",
        properties: {
            planId: {type: "string", maxLength: 32},
            createdAt: {type: "integer", minimum: 1},
            expiresAt: {type: "integer", minimum: 1},
            requiresConfirmation: {type: "boolean"},
            requiresWrite: {type: "boolean"},
            steps: {
                type: "array",
                maxItems: MAX_PLAN_STEPS,
                items: {
                    type: "object",
                    properties: {
                        index: {type: "integer", minimum: 0, maximum: MAX_PLAN_STEPS},
                        action: {type: "string", enum: PLAN_ACTIONS},
                        ids: {type: "array", maxItems: 5, items: {type: "string", maxLength: 64}},
                        setId: {type: "string", maxLength: 64},
                        done: {type: "boolean"},
                        requiresWrite: {type: "boolean"},
                    },
                    required: ["index", "action", "requiresWrite"],
                    additionalProperties: false,
                },
            },
        },
        required: ["planId", "createdAt", "expiresAt", "requiresConfirmation", "requiresWrite", "steps"],
        additionalProperties: false,
    }),
});

const WORKSPACE_PLAN_RECEIPT_SCHEMA = Object.freeze({
    type: "object",
    properties: {
        planId: {type: "string", maxLength: 32},
        status: {type: "string", enum: PLAN_RESULT_STATUSES},
        completed: {type: "array", maxItems: MAX_PLAN_STEPS, items: {type: "integer", minimum: 0, maximum: MAX_PLAN_STEPS}},
        skipped: {type: "array", maxItems: MAX_PLAN_STEPS, items: {type: "integer", minimum: 0, maximum: MAX_PLAN_STEPS}},
        failed: {type: "array", maxItems: MAX_PLAN_STEPS, items: {type: "object", properties: {index: {type: "integer", minimum: 0, maximum: MAX_PLAN_STEPS}, reason: {type: "string", maxLength: 32}}, required: ["index", "reason"], additionalProperties: false}},
        cancelled: {type: "array", maxItems: MAX_PLAN_STEPS, items: {type: "integer", minimum: 0, maximum: MAX_PLAN_STEPS}},
        receipt: {type: "string", maxLength: 64},
    },
    required: ["planId", "status", "completed", "skipped", "failed", "cancelled", "receipt"],
    additionalProperties: false,
});

function buildWorkspacePlan(input, now = Date.now()) {
    const source = input && typeof input === "object" ? input : {};
    const createdAt = Number.isFinite(now) && now > 0 ? Math.floor(now) : Date.now();
    const ttlMs = Math.min(MAX_PLAN_TTL_MS, Math.max(1000, Math.trunc(Number(source.ttlMs) || MAX_PLAN_TTL_MS)));
    const steps = [];
    (Array.isArray(source.steps) ? source.steps : []).slice(0, MAX_PLAN_STEPS).forEach((raw) => {
        if (!raw || typeof raw !== "object" || !PLAN_ACTIONS.includes(raw.action)) return;
        const action = raw.action;
        const item = {index: steps.length, action, requiresWrite: WRITE_ACTIONS.includes(action)};
        if (action === "open-document" || action === "update-task-status") {
            const id = normalizeAgentDocumentId(raw.id);
            if (!id) return;
            item.ids = [id];
            if (action === "update-task-status") item.done = raw.done === true;
        } else if (action === "open-documents") {
            const ids = normalizeAgentDocumentIds(raw.ids, 5);
            if (!ids.length) return;
            item.ids = ids;
        } else if (action === "restore-document-set") {
            const setId = typeof raw.setId === "string" ? raw.setId.trim().slice(0, 64) : "";
            if (!setId) return;
            item.setId = setId;
        }
        steps.push(item);
    });
    const requiresWrite = steps.some((step) => step.requiresWrite);
    const expiresAt = createdAt + ttlMs;
    return {
        planId: makePlanId(createdAt, steps),
        createdAt,
        expiresAt,
        requiresConfirmation: steps.length > 0,
        requiresWrite,
        steps,
    };
}

function isWorkspacePlanExpired(plan, now = Date.now()) {
    return !plan || !Number.isFinite(now) || Math.floor(now) >= Number(plan.expiresAt);
}

function buildWorkspaceReceipt(plan, results, now = Date.now()) {
    const source = Array.isArray(results) ? results : [];
    const completed = [], skipped = [], cancelled = [], failed = [];
    for (let index = 0; index < Math.min(MAX_PLAN_STEPS, plan?.steps?.length || 0); index += 1) {
        const result = source[index] && typeof source[index] === "object" ? source[index] : {};
        const status = RECEIPT_STATUSES.includes(result.status) ? result.status : "skipped";
        if (status === "completed") completed.push(index);
        else if (status === "cancelled") cancelled.push(index);
        else if (status === "failed") failed.push({index, reason: cleanReason(result.reason)});
        else skipped.push(index);
    }
    let status = "completed";
    if (isWorkspacePlanExpired(plan, now)) status = "expired";
    else if (cancelled.length && !completed.length && !failed.length) status = "cancelled";
    else if (failed.length || skipped.length || cancelled.length) status = completed.length ? "partial" : "failed";
    return {planId: typeof plan?.planId === "string" ? plan.planId.slice(0, 32) : "", status, completed, skipped, failed, cancelled, receipt: makeReceiptId(plan?.planId, now, status)};
}

function cleanReason(value) {
    const text = typeof value === "string" ? value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : "failed";
    return text || "failed";
}

function makeReceiptId(planId, now, status) {
    const base = `${String(planId || "plan").slice(0, 24)}:${Math.floor(Number(now) || Date.now())}:${status}`;
    let hash = 0;
    for (const char of base) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `rc-${hash.toString(36)}`;
}

function makePlanId(createdAt, steps) {
    let hash = createdAt >>> 0;
    JSON.stringify(steps).split("").forEach((char) => { hash = (hash * 33 + char.charCodeAt(0)) >>> 0; });
    return `wp-${createdAt.toString(36)}-${hash.toString(36)}`.slice(0, 32);
}

module.exports = {MAX_PLAN_STEPS, MAX_PLAN_TTL_MS, PLAN_ACTIONS, WORKSPACE_PLAN_SPEC, WORKSPACE_PLAN_RECEIPT_SCHEMA, buildWorkspacePlan, isWorkspacePlanExpired, buildWorkspaceReceipt};
