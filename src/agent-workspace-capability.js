"use strict";

// Contract-only surface for the future host Agent capability.  Keeping this
// separate lets us review the approval payload without registering an action
// that can mutate a workspace before real-host tests are complete.
const {normalizePlanId, DIGEST_RE} = require("./agent-workspace-execution.js");

const APPROVAL_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;
const EXECUTION_DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);

const EXECUTE_WORKSPACE_PLAN_SPEC = Object.freeze({
    name: "execute-workspace-plan",
    title: "小驴雷切执行工作区计划",
    description: "受控执行已确认的工作区计划。必须提供与计划内容匹配的摘要和一次性确认令牌；过期、拒绝或重复计划不会执行。",
    inputSchema: Object.freeze({
        type: "object",
        properties: {
            planId: {type: "string", minLength: 3, maxLength: 32, pattern: "^wp-[a-z0-9-]{3,32}$"},
            digest: {type: "string", minLength: 6, maxLength: 16, pattern: "^pd-[a-z0-9]{6,12}$"},
            approvalToken: {type: "string", minLength: 8, maxLength: 64, pattern: "^[A-Za-z0-9_-]{8,64}$"},
            device: {type: "string", enum: EXECUTION_DEVICES},
        },
        required: ["planId", "digest", "approvalToken"],
        additionalProperties: false,
    }),
    outputSchema: Object.freeze({
        type: "object",
        properties: {
            planId: {type: "string", maxLength: 32},
            status: {type: "string", maxLength: 24},
            receipt: {type: "string", maxLength: 64},
        },
        required: ["planId", "status", "receipt"],
        additionalProperties: false,
    }),
});

function normalizeExecutionRequest(value) {
    const source = value && typeof value === "object" ? value : {};
    const planId = normalizePlanId(source.planId);
    const digest = typeof source.digest === "string" ? source.digest.trim().slice(0, 16) : "";
    const approvalToken = typeof source.approvalToken === "string" ? source.approvalToken.trim().slice(0, 64) : "";
    const device = EXECUTION_DEVICES.includes(source.device) ? source.device : "desktop";
    if (!planId || !DIGEST_RE.test(digest) || !APPROVAL_TOKEN_RE.test(approvalToken)) return null;
    return {planId, digest, approvalToken, device};
}

function buildExecutionGateResult(request, status) {
    const normalized = normalizeExecutionRequest(request);
    return {planId: normalized?.planId || "", status: typeof status === "string" ? status.slice(0, 24) : "failed", receipt: ""};
}

module.exports = {APPROVAL_TOKEN_RE, EXECUTION_DEVICES, EXECUTE_WORKSPACE_PLAN_SPEC, normalizeExecutionRequest, buildExecutionGateResult};
