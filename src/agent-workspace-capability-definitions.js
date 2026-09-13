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
const {buildWorkspaceCapabilityProbeSnapshot} = require("./agent-workspace-probe.js");

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
const WORKSPACE_RUNTIME_SNAPSHOT_VERSION = 1;

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
        probe() {
            return buildWorkspaceCapabilityProbeSnapshot(host);
        },
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
        snapshot() {
            return Object.freeze({
                host: buildWorkspaceCapabilityProbeSnapshot(host),
                registration: Object.freeze({registered: registrations.length, failed, unmanaged, disposed}),
            });
        },
    });
}

function buildWorkspaceCapabilityRuntimeSnapshot(lifecycle, bridge) {
    const lifecycleSnapshot = lifecycle && typeof lifecycle.snapshot === "function"
        ? lifecycle.snapshot()
        : {host: {available: false, reason: "unavailable"}, registration: {registered: 0, failed: 0, unmanaged: 0, disposed: false}};
    const bridgeSnapshot = bridge && typeof bridge.status === "function"
        ? bridge.status()
        : {planCount: 0, maxPlans: 0, disposed: true};
    return Object.freeze({version: WORKSPACE_RUNTIME_SNAPSHOT_VERSION, lifecycle: lifecycleSnapshot, bridge: bridgeSnapshot});
}

function normalizeWorkspaceCapabilityRuntimeSnapshot(value) {
    const source = value && typeof value === "object" ? value : {};
    const host = source.lifecycle?.host && typeof source.lifecycle.host === "object" ? source.lifecycle.host : {};
    const registration = source.lifecycle?.registration && typeof source.lifecycle.registration === "object" ? source.lifecycle.registration : {};
    const bridge = source.bridge && typeof source.bridge === "object" ? source.bridge : {};
    const count = (input, max) => Math.min(max, Math.max(0, Math.trunc(Number(input) || 0)));
    return Object.freeze({
        version: WORKSPACE_RUNTIME_SNAPSHOT_VERSION,
        lifecycle: Object.freeze({
            host: Object.freeze({available: host.available === true, reason: ["ready", "unavailable", "timeout", "cancelled", "failed"].includes(host.reason) ? host.reason : "failed"}),
            registration: Object.freeze({registered: count(registration.registered, 2), failed: count(registration.failed, 2), unmanaged: count(registration.unmanaged, 2), disposed: registration.disposed === true}),
        }),
        bridge: Object.freeze({planCount: count(bridge.planCount, 32), maxPlans: count(bridge.maxPlans, 32), disposed: bridge.disposed === true}),
    });
}

function isWorkspaceCapabilityRuntimeSnapshotCompatible(value) {
    if (!value || typeof value !== "object") return false;
    return value.version === undefined || value.version === WORKSPACE_RUNTIME_SNAPSHOT_VERSION;
}

function validateWorkspaceCapabilityRuntimeSnapshot(value) {
    if (!isWorkspaceCapabilityRuntimeSnapshotCompatible(value)) return {ok: false, reason: "unsupported_version"};
    const snapshot = normalizeWorkspaceCapabilityRuntimeSnapshot(value);
    const registration = snapshot.lifecycle.registration;
    const bridge = snapshot.bridge;
    if (registration.registered + registration.failed > 2) return {ok: false, reason: "registration_overflow"};
    if (bridge.planCount > bridge.maxPlans) return {ok: false, reason: "plan_overflow"};
    if (registration.disposed !== bridge.disposed) return {ok: false, reason: "dispose_mismatch"};
    return {ok: true, version: snapshot.version};
}

function diffWorkspaceCapabilityRuntimeSnapshots(previous, current) {
    const before = normalizeWorkspaceCapabilityRuntimeSnapshot(previous);
    const after = normalizeWorkspaceCapabilityRuntimeSnapshot(current);
    return Object.freeze({
        hostChanged: before.lifecycle.host.available !== after.lifecycle.host.available || before.lifecycle.host.reason !== after.lifecycle.host.reason,
        registrationChanged: before.lifecycle.registration.registered !== after.lifecycle.registration.registered || before.lifecycle.registration.failed !== after.lifecycle.registration.failed,
        unmanagedChanged: before.lifecycle.registration.unmanaged !== after.lifecycle.registration.unmanaged,
        planCountDelta: after.bridge.planCount - before.bridge.planCount,
        bridgeDisposedChanged: before.bridge.disposed !== after.bridge.disposed,
    });
}

function buildWorkspaceCapabilityRuntimeEvents(previous, current) {
    const diff = diffWorkspaceCapabilityRuntimeSnapshots(previous, current);
    const events = [];
    if (diff.hostChanged) events.push({type: "host", changed: true});
    if (diff.registrationChanged) events.push({type: "registration", changed: true});
    if (diff.unmanagedChanged) events.push({type: "unmanaged", changed: true});
    if (diff.planCountDelta !== 0) events.push({type: "plans", delta: Math.max(-32, Math.min(32, diff.planCountDelta))});
    if (diff.bridgeDisposedChanged) events.push({type: "disposed", changed: true});
    return events;
}

function normalizeWorkspaceCapabilityRuntimeEvents(events) {
    const order = ["host", "registration", "unmanaged", "plans", "disposed"];
    const source = Array.isArray(events) ? events : [];
    const byType = new Map();
    source.forEach((event) => {
        if (!event || !order.includes(event.type) || byType.has(event.type)) return;
        if (event.type === "plans") {
            const delta = Math.max(-32, Math.min(32, Math.trunc(Number(event.delta) || 0)));
            if (delta === 0) return;
            byType.set(event.type, {type: "plans", delta});
        } else byType.set(event.type, {type: event.type, changed: true});
    });
    return order.filter((type) => byType.has(type)).map((type) => byType.get(type));
}

function createWorkspaceCapabilityEventQueue(maxItems = 16) {
    const max = Math.min(16, Math.max(1, Math.trunc(Number(maxItems) || 16)));
    const queue = [];
    let disposed = false;
    let nextSequence = 1;
    return Object.freeze({
        push(events) {
            if (disposed) return 0;
            const normalized = normalizeWorkspaceCapabilityRuntimeEvents(events);
            normalized.forEach((event) => queue.push({sequence: nextSequence++, event}));
            while (queue.length > max) queue.shift();
            return normalized.length;
        },
        read(limit = max) {
            const count = Math.min(max, Math.max(0, Math.trunc(Number(limit) || max)));
            return queue.slice(0, count).map((entry) => ({...entry.event}));
        },
        consume(limit = max) {
            const items = this.read(limit);
            queue.splice(0, items.length);
            return items;
        },
        readSince(cursor = 0, limit = max) {
            const from = Math.max(0, Math.trunc(Number(cursor) || 0));
            const count = Math.min(max, Math.max(0, Math.trunc(Number(limit) || max)));
            const first = queue[0]?.sequence || nextSequence;
            const items = queue.filter((entry) => entry.sequence > from).slice(0, count);
            return {
                cursor: nextSequence - 1,
                truncated: from < first - 1,
                events: items.map((entry) => ({sequence: entry.sequence, event: {...entry.event}})),
            };
        },
        acknowledge(cursor = 0) {
            const upto = Math.max(0, Math.trunc(Number(cursor) || 0));
            let removed = 0;
            while (queue.length && queue[0].sequence <= upto) {
                queue.shift();
                removed += 1;
            }
            return removed;
        },
        size() { return queue.length; },
        dispose() { disposed = true; queue.length = 0; },
    });
}

function enqueueWorkspaceCapabilityRuntimeDiff(queue, previous, current) {
    if (!queue || typeof queue.push !== "function") return 0;
    return queue.push(buildWorkspaceCapabilityRuntimeEvents(previous, current));
}

function readWorkspaceCapabilityRuntimeEventsForReplay(queue, cursor = 0, limit = 16) {
    if (!queue || typeof queue.readSince !== "function") return {ok: false, reason: "queue_unavailable", cursor: 0, events: []};
    const batch = queue.readSince(cursor, limit);
    if (!batch || batch.truncated === true) return {ok: false, reason: "snapshot_required", cursor: Number(batch?.cursor) || 0, events: []};
    return {ok: true, reason: "ready", cursor: Number(batch.cursor) || 0, events: Array.isArray(batch.events) ? batch.events.map((entry) => ({sequence: entry.sequence, event: {...entry.event}})) : []};
}

function recoverWorkspaceCapabilityRuntime(queue, cursor = 0, snapshot = null, limit = 16) {
    const replay = readWorkspaceCapabilityRuntimeEventsForReplay(queue, cursor, limit);
    if (replay.ok) return {ok: true, mode: "events", cursor: replay.cursor, events: replay.events, snapshot: null};
    if (replay.reason !== "snapshot_required" || !isWorkspaceCapabilityRuntimeSnapshotCompatible(snapshot)) {
        return {ok: false, mode: "unavailable", reason: replay.reason, cursor: replay.cursor, events: [], snapshot: null};
    }
    const normalized = normalizeWorkspaceCapabilityRuntimeSnapshot(snapshot);
    const valid = validateWorkspaceCapabilityRuntimeSnapshot(normalized);
    if (!valid.ok) return {ok: false, mode: "invalid_snapshot", reason: valid.reason, cursor: replay.cursor, events: [], snapshot: null};
    return {ok: true, mode: "snapshot", cursor: replay.cursor, events: [], snapshot: normalized};
}

function recoverWorkspaceCapabilityRuntimeWithSignal(queue, cursor = 0, snapshot = null, limit = 16, signal) {
    if (signal?.aborted) return {ok: false, mode: "cancelled", reason: "cancelled", cursor: Math.max(0, Math.trunc(Number(cursor) || 0)), events: [], snapshot: null};
    const recovery = recoverWorkspaceCapabilityRuntime(queue, cursor, snapshot, limit);
    if (signal?.aborted) return {ok: false, mode: "cancelled", reason: "cancelled", cursor: recovery.cursor, events: [], snapshot: null};
    return recovery;
}

function recoverWorkspaceCapabilityRuntimeWithDeadline(queue, cursor = 0, snapshot = null, limit = 16, deadline, now = Date.now) {
    const current = typeof now === "function" ? Number(now()) : Number(now);
    const expiresAt = Number(deadline);
    if (Number.isFinite(expiresAt) && Number.isFinite(current) && current >= expiresAt) {
        return {ok: false, mode: "timeout", reason: "timeout", cursor: Math.max(0, Math.trunc(Number(cursor) || 0)), events: [], snapshot: null};
    }
    const recovery = recoverWorkspaceCapabilityRuntime(queue, cursor, snapshot, limit);
    const after = typeof now === "function" ? Number(now()) : Number(now);
    if (Number.isFinite(expiresAt) && Number.isFinite(after) && after >= expiresAt) {
        return {ok: false, mode: "timeout", reason: "timeout", cursor: recovery.cursor, events: [], snapshot: null};
    }
    return recovery;
}

function normalizeWorkspaceCapabilityRuntimeRecoveryResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const modes = ["events", "snapshot", "unavailable", "invalid_snapshot", "cancelled", "timeout"];
    const mode = modes.includes(source.mode) ? source.mode : "unavailable";
    const ok = source.ok === true && (mode === "events" || mode === "snapshot");
    const result = {
        ok,
        mode,
        reason: ["ready", "snapshot_required", "queue_unavailable", "invalid_snapshot", "cancelled", "timeout", "coordinator_disposed"].includes(source.reason) ? source.reason : (ok ? "ready" : mode),
        cursor: Math.max(0, Math.min(0x7fffffff, Math.trunc(Number(source.cursor) || 0))),
        events: mode === "events" && Array.isArray(source.events) ? source.events.slice(0, 16).map((entry) => ({sequence: Math.max(0, Math.trunc(Number(entry?.sequence) || 0)), event: entry?.event && typeof entry.event === "object" ? {...entry.event} : {}})) : [],
        snapshot: mode === "snapshot" && source.snapshot ? normalizeWorkspaceCapabilityRuntimeSnapshot(source.snapshot) : null,
    };
    return Object.freeze(result);
}

function commitWorkspaceCapabilityRuntimeRecovery(queue, recovery) {
    if (!queue || typeof queue.acknowledge !== "function" || !recovery || recovery.ok !== true) return 0;
    if (recovery.mode !== "events" && recovery.mode !== "snapshot") return 0;
    return queue.acknowledge(recovery.cursor);
}

function recoverAndCommitWorkspaceCapabilityRuntime(queue, cursor = 0, snapshot = null, limit = 16) {
    const recovery = recoverWorkspaceCapabilityRuntime(queue, cursor, snapshot, limit);
    const acknowledged = commitWorkspaceCapabilityRuntimeRecovery(queue, recovery);
    return Object.freeze({...recovery, acknowledged});
}

function createWorkspaceCapabilityRecoveryCoordinator(queue) {
    let lastCursor = 0;
    let commits = 0;
    let disposed = false;
    return Object.freeze({
        recover(cursor = 0, snapshot = null, limit = 16) {
            if (disposed) return {ok: false, mode: "unavailable", reason: "coordinator_disposed", cursor: lastCursor, events: [], snapshot: null};
            return recoverWorkspaceCapabilityRuntime(queue, cursor, snapshot, limit);
        },
        commit(recovery) {
            if (disposed) return 0;
            const cursor = Math.max(0, Math.trunc(Number(recovery?.cursor) || 0));
            if (!recovery || recovery.ok !== true || cursor <= lastCursor) return 0;
            const acknowledged = commitWorkspaceCapabilityRuntimeRecovery(queue, recovery);
            if (acknowledged > 0 || recovery.mode === "snapshot") {
                lastCursor = cursor;
                commits = Math.min(32, commits + 1);
            }
            return acknowledged;
        },
        recoverAndCommit(cursor = 0, snapshot = null, limit = 16) {
            if (disposed) return {ok: false, mode: "unavailable", reason: "coordinator_disposed", cursor: lastCursor, events: [], snapshot: null, acknowledged: 0};
            const recovery = recoverWorkspaceCapabilityRuntime(queue, cursor, snapshot, limit);
            return Object.freeze({...recovery, acknowledged: this.commit(recovery)});
        },
        status() { return Object.freeze({lastCursor, commits, disposed}); },
        dispose(clearQueue = false) {
            if (disposed) return 0;
            disposed = true;
            if (clearQueue === true && queue && typeof queue.dispose === "function") {
                queue.dispose();
                return 1;
            }
            return 0;
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
    buildWorkspaceCapabilityRuntimeSnapshot,
    WORKSPACE_RUNTIME_SNAPSHOT_VERSION,
    normalizeWorkspaceCapabilityRuntimeSnapshot,
    isWorkspaceCapabilityRuntimeSnapshotCompatible,
    validateWorkspaceCapabilityRuntimeSnapshot,
    diffWorkspaceCapabilityRuntimeSnapshots,
    buildWorkspaceCapabilityRuntimeEvents,
    normalizeWorkspaceCapabilityRuntimeEvents,
    createWorkspaceCapabilityEventQueue,
    enqueueWorkspaceCapabilityRuntimeDiff,
    readWorkspaceCapabilityRuntimeEventsForReplay,
    recoverWorkspaceCapabilityRuntime,
    recoverWorkspaceCapabilityRuntimeWithSignal,
    recoverWorkspaceCapabilityRuntimeWithDeadline,
    normalizeWorkspaceCapabilityRuntimeRecoveryResult,
    commitWorkspaceCapabilityRuntimeRecovery,
    recoverAndCommitWorkspaceCapabilityRuntime,
    createWorkspaceCapabilityRecoveryCoordinator,
};
