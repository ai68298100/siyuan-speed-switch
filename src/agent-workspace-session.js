"use strict";

const {createApprovalTokenStore} = require("./agent-approval-token.js");
const {createWorkspaceApprovalChallenge, validateWorkspaceApprovalChallenge} = require("./agent-workspace-approval.js");
const {createWorkspaceExecutionGuard, executeWorkspacePlan} = require("./agent-workspace-execution.js");
const {createWorkspaceActionExecutor, buildWorkspacePlanSummary} = require("./agent-workspace-actions.js");
const {createWorkspaceHostHandlers} = require("./agent-workspace-registry.js");

// Session facade for the future Agent host integration.  It owns only
// in-memory approval/replay state and delegates all side effects to injected
// host callbacks.
function createWorkspaceExecutionSession(options = {}) {
    const approvalStore = options.approvalStore || createApprovalTokenStore();
    const guard = options.guard || createWorkspaceExecutionGuard();
    const handlers = options.handlers || createWorkspaceHostHandlers(options);
    return Object.freeze({
        issue(plan, device = "desktop", now = Date.now()) {
            return createWorkspaceApprovalChallenge(plan, approvalStore, device, now);
        },
        preview(plan, device = "desktop", now = Date.now()) {
            const challenge = createWorkspaceApprovalChallenge(plan, approvalStore, device, now);
            return challenge ? {...buildWorkspacePlanSummary(plan), ...challenge} : null;
        },
        async execute(plan, challenge, options2 = {}) {
            const now = typeof options2.now === "function" ? Number(options2.now()) : Number(options2.now || Date.now());
            const check = validateWorkspaceApprovalChallenge(challenge, plan, now);
            if (!check.ok) return {planId: typeof plan?.planId === "string" ? plan.planId.slice(0, 32) : "", status: check.reason, receipt: ""};
            return executeWorkspacePlan(plan, {
                guard,
                approvalStore,
                approvalToken: challenge.approvalToken,
                approved: true,
                digest: challenge.digest,
                device: challenge.device,
                signal: options2.signal || options.signal,
                now: options2.now || now,
                runStep: createWorkspaceActionExecutor(handlers, {signal: options2.signal || options.signal}),
            });
        },
        dispose() {
            approvalStore.clear?.();
            guard.clear?.();
        },
    });
}

module.exports = {createWorkspaceExecutionSession};
