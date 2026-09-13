"use strict";

// One-shot execution guard for v0.17 plans.  This module owns no timers or
// host state; it prevents replaying the same approved plan in one plugin
// lifetime and keeps a small bounded receipt index.
const MAX_EXECUTION_RECORDS = 32;
const PLAN_ID_RE = /^wp-[a-z0-9-]{3,32}$/;
const DIGEST_RE = /^pd-[a-z0-9]{6,12}$/;

function createWorkspaceExecutionGuard(limit = MAX_EXECUTION_RECORDS) {
    const max = Math.min(MAX_EXECUTION_RECORDS, Math.max(1, Math.trunc(Number(limit) || MAX_EXECUTION_RECORDS)));
    const records = new Map();
    const remember = (planId, record) => {
        records.delete(planId);
        records.set(planId, record);
        while (records.size > max) records.delete(records.keys().next().value);
    };
    return Object.freeze({
        begin(plan, approved, now = Date.now(), digest = "") {
            const planId = normalizePlanId(plan?.planId);
            if (!planId) return {ok: false, reason: "invalid_plan"};
            const allowed = approved && typeof approved === "object" ? approved.approved === true : approved === true;
            const expectedDigest = approved && typeof approved === "object" ? approved.digest : digest;
            if (allowed !== true) return {ok: false, reason: "denied"};
            if (expectedDigest && expectedDigest !== workspacePlanDigest(plan)) return {ok: false, reason: "digest_mismatch"};
            if (Number.isFinite(now) && Number(now) >= Number(plan.expiresAt)) return {ok: false, reason: "expired"};
            const previous = records.get(planId);
            if (previous) return {ok: false, reason: previous.status === "running" ? "already_running" : "already_consumed", receipt: previous.receipt || ""};
            remember(planId, {status: "running", receipt: ""});
            return {ok: true, planId};
        },
        finish(planId, receipt, status = "completed") {
            const id = normalizePlanId(planId);
            if (!id || !records.has(id)) return false;
            const safeReceipt = typeof receipt === "string" ? receipt.slice(0, 64) : "";
            remember(id, {status: status === "running" ? "completed" : String(status).slice(0, 24), receipt: safeReceipt});
            return true;
        },
        get(planId) {
            const record = records.get(normalizePlanId(planId));
            return record ? {...record} : null;
        },
        clear() { records.clear(); },
    });
}

function normalizePlanId(value) {
    const id = typeof value === "string" ? value.trim().slice(0, 32) : "";
    return PLAN_ID_RE.test(id) ? id : "";
}

function workspacePlanDigest(plan) {
    const source = plan && typeof plan === "object" ? {planId: plan.planId, createdAt: plan.createdAt, expiresAt: plan.expiresAt, steps: plan.steps} : {};
    let hash = 2166136261;
    for (const char of JSON.stringify(source)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `pd-${(hash >>> 0).toString(36)}`;
}

async function executeWorkspacePlan(plan, options = {}) {
    const guard = options.guard || createWorkspaceExecutionGuard();
    const now = typeof options.now === "function" ? Number(options.now()) : Number(options.now || Date.now());
    const approvalStore = options.approvalStore;
    const request = {planId: plan?.planId, digest: options.digest || "", device: options.device || "desktop"};
    if (approvalStore && typeof approvalStore.validate === "function") {
        const tokenCheck = approvalStore.validate(options.approvalToken, request, now);
        if (!tokenCheck.ok) return {planId: normalizePlanId(plan?.planId), status: tokenCheck.reason, receipt: ""};
    }
    const check = guard.begin(plan, {approved: options.approved === true, digest: options.digest || ""}, now);
    if (!check.ok) return {planId: normalizePlanId(plan?.planId), status: check.reason, receipt: check.receipt || ""};
    if (approvalStore && typeof approvalStore.consume === "function") {
        const consumed = approvalStore.consume(options.approvalToken, request, now);
        if (!consumed.ok) {
            guard.finish(plan.planId, "", consumed.reason);
            return {planId: normalizePlanId(plan?.planId), status: consumed.reason, receipt: ""};
        }
    }
    const {runWorkspacePlan} = require("./agent-workspace-plan.js");
    const receipt = await runWorkspacePlan(plan, options);
    guard.finish(plan.planId, receipt.receipt, receipt.status);
    return receipt;
}

module.exports = {MAX_EXECUTION_RECORDS, PLAN_ID_RE, DIGEST_RE, normalizePlanId, workspacePlanDigest, createWorkspaceExecutionGuard, executeWorkspacePlan};
