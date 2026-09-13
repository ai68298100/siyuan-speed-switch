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

const WORKSPACE_CAPABILITY_NAMES = Object.freeze([
    WORKSPACE_PLAN_HANDLER_SPEC.name,
    EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC.name,
]);

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

// Register only the two known definitions.  Effects are selected by capability
// name instead of trusting caller-supplied metadata, preventing a malformed
// definition from silently downgrading an execution capability to read-only.
function registerWorkspaceCapabilityDefinitions(host, definitions, onError = (_error, _spec) => {}) {
    if (!host || typeof host.addAgentCapability !== "function") return [];
    const registered = [];
    (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
        const spec = definition && definition.spec;
        const name = spec && typeof spec.name === "string" ? spec.name : "";
        if (!WORKSPACE_CAPABILITY_NAMES.includes(name) || typeof definition.handler !== "function") return;
        const effects = name === EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC.name
            ? EXECUTE_WORKSPACE_PLAN_EFFECTS
            : WORKSPACE_PLAN_EFFECTS;
        try {
            registered.push(host.addAgentCapability({...spec, effects, handler: definition.handler}));
        } catch (error) {
            onError(error, spec);
        }
    });
    return registered;
}

module.exports = {
    WORKSPACE_PLAN_EFFECTS,
    EXECUTE_WORKSPACE_PLAN_EFFECTS,
    WORKSPACE_CAPABILITY_NAMES,
    createWorkspaceCapabilityDefinitions,
    registerWorkspaceCapabilityDefinitions,
};
