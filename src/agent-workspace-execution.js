"use strict";

// One-shot execution guard for v0.17 plans.  This module owns no timers or
// host state; it prevents replaying the same approved plan in one plugin
// lifetime and keeps a small bounded receipt index.
const MAX_EXECUTION_RECORDS = 32;
const PLAN_ID_RE = /^wp-[a-z0-9-]{3,32}$/;

function createWorkspaceExecutionGuard(limit = MAX_EXECUTION_RECORDS) {
    const max = Math.min(MAX_EXECUTION_RECORDS, Math.max(1, Math.trunc(Number(limit) || MAX_EXECUTION_RECORDS)));
    const records = new Map();
    const remember = (planId, record) => {
        records.delete(planId);
        records.set(planId, record);
        while (records.size > max) records.delete(records.keys().next().value);
    };
    return Object.freeze({
        begin(plan, approved, now = Date.now()) {
            const planId = normalizePlanId(plan?.planId);
            if (!planId) return {ok: false, reason: "invalid_plan"};
            if (approved !== true) return {ok: false, reason: "denied"};
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

module.exports = {MAX_EXECUTION_RECORDS, PLAN_ID_RE, normalizePlanId, createWorkspaceExecutionGuard};
