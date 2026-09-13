"use strict";

const {buildWorkspacePlan} = require("./agent-workspace-plan.js");
const {EXECUTE_WORKSPACE_PLAN_SPEC, normalizeExecutionRequest} = require("./agent-workspace-capability.js");
const {createWorkspaceExecutionSession} = require("./agent-workspace-session.js");
const {buildWorkspacePlanSummary} = require("./agent-workspace-actions.js");

const MAX_STORED_PLANS = 32;

// Bridge facade for future addAgentCapability handlers.  Plans stay in memory
// only and are bounded; no document content is persisted between sessions.
function createWorkspaceAgentBridge(options = {}) {
    const session = options.session || createWorkspaceExecutionSession(options);
    const max = Math.min(MAX_STORED_PLANS, Math.max(1, Math.trunc(Number(options.maxPlans) || MAX_STORED_PLANS)));
    const plans = new Map();
    const remember = (plan) => {
        plans.delete(plan.planId);
        plans.set(plan.planId, plan);
        while (plans.size > max) plans.delete(plans.keys().next().value);
    };
    return Object.freeze({
        plan(input, now = Date.now()) {
            const plan = buildWorkspacePlan(input, now);
            if (!plan.steps.length) return null;
            remember(plan);
            return {...plan, summary: buildWorkspacePlanSummary(plan)};
        },
        issue(planId, device = "desktop", now = Date.now()) {
            const plan = plans.get(typeof planId === "string" ? planId : "");
            return plan ? session.issue(plan, device, now) : null;
        },
        async execute(request, now = Date.now()) {
            const normalized = normalizeExecutionRequest(request);
            const plan = normalized && plans.get(normalized.planId);
            if (!normalized || !plan) return {planId: normalized?.planId || "", status: "plan_not_found", receipt: ""};
            return session.execute(plan, {
                planId: normalized.planId,
                digest: normalized.digest,
                device: normalized.device,
                expiresAt: plan.expiresAt,
                approvalToken: normalized.approvalToken,
            }, {now});
        },
        size() { return plans.size; },
        dispose() { plans.clear(); session.dispose?.(); },
    });
}

module.exports = {MAX_STORED_PLANS, EXECUTE_WORKSPACE_PLAN_SPEC, createWorkspaceAgentBridge};
