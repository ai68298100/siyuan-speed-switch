"use strict";

// Builds the bounded payload shown to a user before a plan is executed.  The
// challenge contains no document body; it only binds the immutable plan
// digest to one device and the plan expiry.
const {workspacePlanDigest, normalizePlanId} = require("./agent-workspace-execution.js");
const {DEVICES} = require("./agent-approval-token.js");

function createWorkspaceApprovalChallenge(plan, tokenStore, device = "desktop", now = Date.now()) {
    const planId = normalizePlanId(plan?.planId);
    const target = DEVICES.includes(device) ? device : "desktop";
    const expiresAt = Number(plan?.expiresAt);
    if (!planId || !tokenStore || typeof tokenStore.issue !== "function" || !Number.isFinite(expiresAt) || expiresAt <= Number(now)) return null;
    const digest = workspacePlanDigest(plan);
    const approvalPlan = {...plan, digest};
    const approvalToken = tokenStore.issue(approvalPlan, target, now);
    if (!approvalToken) return null;
    return {planId, digest, device: target, expiresAt, approvalToken};
}

function validateWorkspaceApprovalChallenge(challenge, plan, now = Date.now()) {
    if (!challenge || typeof challenge !== "object" || !plan) return {ok: false, reason: "invalid_challenge"};
    if (normalizePlanId(challenge.planId) !== normalizePlanId(plan.planId)) return {ok: false, reason: "plan_mismatch"};
    if (challenge.digest !== workspacePlanDigest(plan)) return {ok: false, reason: "digest_mismatch"};
    if (!DEVICES.includes(challenge.device)) return {ok: false, reason: "device_mismatch"};
    if (!Number.isFinite(Number(challenge.expiresAt)) || Number(now) >= Number(challenge.expiresAt)) return {ok: false, reason: "expired"};
    if (Number(challenge.expiresAt) !== Number(plan.expiresAt)) return {ok: false, reason: "expiry_mismatch"};
    return {ok: true, planId: normalizePlanId(plan.planId), device: challenge.device};
}

module.exports = {createWorkspaceApprovalChallenge, validateWorkspaceApprovalChallenge};
