"use strict";

// Data-driven definitions for the v0.17 workspace capabilities.  This module
// intentionally stays outside the production entry until bundle headroom and
// real-host approval UX are ready; callers can pass the returned definitions to
// the existing Agent registration helpers without duplicating bridge policy.
const {
    WORKSPACE_PLAN_HANDLER_SPEC,
    EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC,
    createWorkspacePlanHandler,
    createWorkspaceExecuteHandler,
} = require("./agent-workspace-bridge.js");

const WORKSPACE_PLAN_EFFECTS = Object.freeze({
    localRead: true,
    localWrite: false,
    dataEgress: false,
    externalCost: false,
});

const EXECUTE_WORKSPACE_PLAN_EFFECTS = Object.freeze({
    localRead: true,
    localWrite: true,
    dataEgress: false,
    externalCost: false,
});

function createWorkspaceCapabilityDefinitions(bridge, now = Date.now) {
    return Object.freeze([
        Object.freeze({
            spec: WORKSPACE_PLAN_HANDLER_SPEC,
            effects: WORKSPACE_PLAN_EFFECTS,
            handler: createWorkspacePlanHandler(bridge, now),
        }),
        Object.freeze({
            spec: EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC,
            effects: EXECUTE_WORKSPACE_PLAN_EFFECTS,
            handler: createWorkspaceExecuteHandler(bridge, now),
        }),
    ]);
}

module.exports = {
    WORKSPACE_PLAN_EFFECTS,
    EXECUTE_WORKSPACE_PLAN_EFFECTS,
    createWorkspaceCapabilityDefinitions,
};
