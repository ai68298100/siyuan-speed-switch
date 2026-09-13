"use strict";

// v0.17 Agent groundwork: dry-run plans are deliberately standalone until
// host-level approval, cancellation and expiry semantics are verified.
const {normalizeAgentDocumentId, normalizeAgentDocumentIds} = require("./agent-capabilities.js");

const MAX_PLAN_STEPS = 8;
const MAX_PLAN_TTL_MS = 10 * 60 * 1000;
const PLAN_ACTIONS = Object.freeze(["open-document", "open-documents", "restore-document-set", "update-task-status", "create-document", "append-to-journal"]);
const WRITE_ACTIONS = Object.freeze(["update-task-status", "create-document", "append-to-journal"]);

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

function makePlanId(createdAt, steps) {
    let hash = createdAt >>> 0;
    JSON.stringify(steps).split("").forEach((char) => { hash = (hash * 33 + char.charCodeAt(0)) >>> 0; });
    return `wp-${createdAt.toString(36)}-${hash.toString(36)}`.slice(0, 32);
}

module.exports = {MAX_PLAN_STEPS, MAX_PLAN_TTL_MS, PLAN_ACTIONS, WORKSPACE_PLAN_SPEC, buildWorkspacePlan, isWorkspacePlanExpired};
