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

function normalizeWorkspaceCapabilityHandle(handle) {
    if (typeof handle === "function") return {managed: true, kind: "disposer"};
    if (handle && typeof handle.dispose === "function") return {managed: true, kind: "object"};
    if (typeof handle === "string" || typeof handle === "number") return {managed: true, kind: "id"};
    if (handle === undefined) return {managed: false, kind: "opaque"};
    return {managed: false, kind: "invalid"};
}

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
        const canonical = name === WORKSPACE_PLAN_HANDLER_SPEC.name
            ? spec === WORKSPACE_PLAN_HANDLER_SPEC
            : name === EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC.name
                ? spec === EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC
                : false;
        if (!canonical || typeof definition.handler !== "function") return;
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

// Best-effort lifecycle cleanup for hosts that expose a disposer or explicit
// removeAgentCapability API.  Unknown handles are ignored; teardown must never
// make plugin unload fail or leak an exception into the Agent channel.
function disposeWorkspaceCapabilityRegistrations(host, registrations, onError = (_error) => {}) {
    const items = Array.isArray(registrations) ? registrations : [];
    let disposed = 0;
    items.forEach((handle) => {
        try {
            if (typeof handle === "function") {
                handle();
                disposed += 1;
            } else if (handle && typeof handle.dispose === "function") {
                handle.dispose();
                disposed += 1;
            } else if (host && typeof host.removeAgentCapability === "function" && handle !== undefined && handle !== null) {
                host.removeAgentCapability(handle);
                disposed += 1;
            }
        } catch (error) {
            onError(error);
        }
    });
    return disposed;
}

function createWorkspaceCapabilityLifecycle(host, bridge, now = Date.now, onError = (_error, _spec) => {}) {
    let registrations = [];
    let disposed = false;
    let failed = 0;
    let unmanaged = 0;
    return Object.freeze({
        register() {
            if (disposed || registrations.length) return registrations.slice();
            const definitions = createWorkspaceCapabilityDefinitions(bridge, now);
            registrations = registerWorkspaceCapabilityDefinitions(host, definitions, (error, spec) => {
                failed = Math.min(2, failed + 1);
                onError(error, spec);
            });
            unmanaged = registrations.reduce((count, handle) => count + (normalizeWorkspaceCapabilityHandle(handle).managed ? 0 : 1), 0);
            return registrations.slice();
        },
        dispose() {
            if (disposed) return 0;
            disposed = true;
            const count = disposeWorkspaceCapabilityRegistrations(host, registrations, onError);
            registrations = [];
            unmanaged = 0;
            return count;
        },
        size() { return registrations.length; },
        status() {
            return Object.freeze({registered: registrations.length, failed, unmanaged, disposed});
        },
    });
}

module.exports = {
    WORKSPACE_PLAN_EFFECTS,
    EXECUTE_WORKSPACE_PLAN_EFFECTS,
    WORKSPACE_CAPABILITY_NAMES,
    normalizeWorkspaceCapabilityHandle,
    createWorkspaceCapabilityDefinitions,
    registerWorkspaceCapabilityDefinitions,
    disposeWorkspaceCapabilityRegistrations,
    createWorkspaceCapabilityLifecycle,
};
