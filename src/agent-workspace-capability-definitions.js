"use strict";

// Data-driven definitions for the v0.17 workspace capabilities.  This module
// intentionally stays outside the production entry until bundle headroom and
// real-host approval UX are ready; callers can pass the returned definitions to
// the existing Agent registration helpers without duplicating bridge policy.
// ADR 0063（T-6677）：自建审批管线（bridge/session/capability/execution/
// approval/token）已撤除，本模块只保留 diagnostics 定义的构造与校验；
// plan/execute 处理器将按宿主确认卡路线重新接线。
const {buildWorkspaceCapabilityProbeSnapshot} = require("./agent-workspace-probe.js");
// v0.17 阶段 1（D-220）：运行时/会话/registry/diagnostics 簇已整体搬移至
// agent-workspace-runtime.js；此处同名引入并继续 re-export，供既有契约测试使用。
const {
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS,
    WORKSPACE_RUNTIME_SNAPSHOT_VERSION,
    WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION,
    MAX_RUNTIME_SESSIONS,
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC,
    normalizeWorkspaceCapabilityRuntimeSnapshot,
    isWorkspaceCapabilityRuntimeSnapshotCompatible,
    validateWorkspaceCapabilityRuntimeSnapshot,
    normalizeWorkspaceCapabilityRuntimeEvents,
    createWorkspaceCapabilityEventQueue,
    readWorkspaceCapabilityRuntimeEventsForReplay,
    recoverWorkspaceCapabilityRuntime,
    commitWorkspaceCapabilityRuntimeRecovery,
    createWorkspaceCapabilityRecoveryCoordinator,
    createWorkspaceCapabilityRuntimeSession,
    createWorkspaceCapabilityRuntimeSessionRegistry,
    normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot,
    buildWorkspaceCapabilityRuntimeSessionRegistrySnapshot,
    isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible,
    validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff,
    buildWorkspaceCapabilityRuntimeSessionRegistrySummary,
    createWorkspaceCapabilityRuntimeRegistryDiffQueue,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithDeadline,
    recoverWorkspaceCapabilityRuntimeSessionRegistryDiff,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult,
    commitWorkspaceCapabilityRuntimeSessionRegistryDiffRecovery,
    createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator,
    buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics,
    createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler,
} = require("./agent-workspace-runtime.js");

// ADR 0063：plan/execute 处理器的 effects 常量随自建管线撤除；
// 未来按宿主确认卡路线重新接线时在此登记新的声明。

const WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION = 1;
const WORKSPACE_CAPABILITY_DIAGNOSTICS_SNAPSHOT_VERSION = 1;
const WORKSPACE_CAPABILITY_NAMES = Object.freeze([
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.name,
]);

function normalizeWorkspaceCapabilityHandle(handle) {
    if (typeof handle === "function") return {managed: true, kind: "disposer"};
    if (handle && typeof handle.dispose === "function") return {managed: true, kind: "object"};
    if (typeof handle === "string" || typeof handle === "number") return {managed: true, kind: "id"};
    if (handle === undefined) return {managed: false, kind: "opaque"};
    return {managed: false, kind: "invalid"};
}

function createWorkspaceCapabilityDiagnosticsDefinition(registry, diffQueue = null, diffCoordinator = null) {
    return Object.freeze({
        spec: WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC,
        effects: WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS,
        handler: createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler(registry, diffQueue, diffCoordinator),
    });
}

function normalizeWorkspaceCapabilityRuntimeRegistryDiagnosticsInput(value) {
    return Object.freeze(value && typeof value === "object" && !Array.isArray(value) ? {} : {});
}

function validateWorkspaceCapabilityDefinition(definition) {
    const spec = definition && definition.spec;
    const name = typeof spec?.name === "string" ? spec.name : "";
    const canonicalSpec = name === WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.name ? spec === WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC : false;
    if (!canonicalSpec) return {ok: false, reason: "unknown_capability"};
    if (typeof definition.handler !== "function") return {ok: false, reason: "invalid_handler"};
    if (!spec.inputSchema || typeof spec.inputSchema !== "object" || !spec.outputSchema || typeof spec.outputSchema !== "object") return {ok: false, reason: "invalid_schema"};
    if (spec.inputSchema.type !== "object" || spec.outputSchema.type !== "object") return {ok: false, reason: "invalid_schema"};
    return {ok: true, name, effects: WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS};
}

function validateWorkspaceCapabilityDefinitions(definitions) {
    const source = Array.isArray(definitions) ? definitions : [];
    const results = source.slice(0, 8).map((definition) => validateWorkspaceCapabilityDefinition(definition));
    const names = results.filter((result) => result.ok).map((result) => result.name);
    const unique = new Set(names);
    return Object.freeze({ok: results.length === source.length && results.every((result) => result.ok) && unique.size === names.length, total: results.length, valid: results.filter((result) => result.ok).length, invalid: results.filter((result) => !result.ok).length, duplicate: names.length - unique.size, results: results.map((result) => ({ok: result.ok, name: result.name || "", reason: result.reason || "ready"}))});
}

function normalizeWorkspaceCapabilityRegistrationFailureReason(error) {
    const name = typeof error?.name === "string" ? error.name : "";
    if (name === "AbortError" || name === "ABORT_ERR") return "cancelled";
    if (name === "TimeoutError" || name === "TIMEOUT_ERR") return "timeout";
    return "failed";
}

// Register only the known definitions.  Effects are selected by capability
// name instead of trusting caller-supplied metadata, preventing a malformed
// definition from silently downgrading an execution capability to read-only.
function registerWorkspaceCapabilityDefinitions(host, definitions, onError = (_error, _spec) => {}) {
    if (!host || typeof host.addAgentCapability !== "function") return [];
    const registered = [];
    (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
        const spec = definition && definition.spec;
        const name = spec && typeof spec.name === "string" ? spec.name : "";
        const validation = validateWorkspaceCapabilityDefinition(definition);
        if (!validation.ok) return;
        const effects = validation.effects;
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
    let opaque = 0;
    let invalid = 0;
    const failureReasons = {cancelled: 0, timeout: 0, failed: 0};
    return Object.freeze({
        probe() {
            return buildWorkspaceCapabilityProbeSnapshot(host);
        },
        register(definitionsOverride = null) {
            if (disposed || registrations.length) return registrations.slice();
            const definitions = Array.isArray(definitionsOverride) ? definitionsOverride : [createWorkspaceCapabilityDiagnosticsDefinition()];
            registrations = registerWorkspaceCapabilityDefinitions(host, definitions, (error, spec) => {
                failed = Math.min(2, failed + 1);
                const reason = normalizeWorkspaceCapabilityRegistrationFailureReason(error);
                failureReasons[reason] = Math.min(8, failureReasons[reason] + 1);
                onError(error, spec);
            });
            unmanaged = registrations.reduce((count, handle) => count + (normalizeWorkspaceCapabilityHandle(handle).managed ? 0 : 1), 0);
            opaque = registrations.filter((handle) => normalizeWorkspaceCapabilityHandle(handle).kind === "opaque").length;
            invalid = registrations.filter((handle) => normalizeWorkspaceCapabilityHandle(handle).kind === "invalid").length;
            return registrations.slice();
        },
        dispose() {
            if (disposed) return 0;
            disposed = true;
            const count = disposeWorkspaceCapabilityRegistrations(host, registrations, onError);
            registrations = [];
            unmanaged = 0;
            opaque = 0;
            invalid = 0;
            return count;
        },
        size() { return registrations.length; },
        handleStatus() { return Object.freeze({opaque, invalid}); },
        failureStatus() { return Object.freeze({total: Math.min(8, failed), byReason: Object.freeze({...failureReasons})}); },
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



function enqueueWorkspaceCapabilityRuntimeDiff(queue, previous, current) {
    if (!queue || typeof queue.push !== "function") return 0;
    return queue.push(buildWorkspaceCapabilityRuntimeEvents(previous, current));
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


function recoverAndCommitWorkspaceCapabilityRuntime(queue, cursor = 0, snapshot = null, limit = 16) {
    const recovery = recoverWorkspaceCapabilityRuntime(queue, cursor, snapshot, limit);
    const acknowledged = commitWorkspaceCapabilityRuntimeRecovery(queue, recovery);
    return Object.freeze({...recovery, acknowledged});
}

function recoverWorkspaceCapabilityRuntimeSafe(queue, cursor = 0, snapshot = null, limit = 16, signal) {
    return normalizeWorkspaceCapabilityRuntimeRecoveryResult(recoverWorkspaceCapabilityRuntimeWithSignal(queue, cursor, snapshot, limit, signal));
}



function buildWorkspaceCapabilityRuntimeSessionSnapshot(session) {
    const source = session && typeof session.snapshot === "function" ? session.snapshot() : {};
    const sessionId = typeof source.sessionId === "string" && /^ws-[a-z0-9]{8}$/.test(source.sessionId) ? source.sessionId : "";
    return Object.freeze({version: WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION, sessionId, disposed: source.disposed === true, runtime: source.runtime || null});
}

function normalizeWorkspaceCapabilityRuntimeSessionSnapshot(value) {
    const source = value && typeof value === "object" ? value : {};
    const sessionId = typeof source.sessionId === "string" && /^ws-[a-z0-9]{8}$/.test(source.sessionId) ? source.sessionId : "";
    return Object.freeze({version: WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION, sessionId, disposed: source.disposed === true, runtime: source.runtime && typeof source.runtime === "object" ? source.runtime : null});
}







function diffWorkspaceCapabilityRuntimeSessionRegistrySnapshots(previous, current) {
    const before = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(previous);
    const after = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(current);
    const events = [];
    const beforeMap = new Map(before.sessions.map((session) => [session.sessionId, session]));
    const afterMap = new Map(after.sessions.map((session) => [session.sessionId, session]));
    for (const sessionId of afterMap.keys()) if (!beforeMap.has(sessionId)) events.push({type: "created", sessionId});
    for (const sessionId of beforeMap.keys()) if (!afterMap.has(sessionId)) events.push({type: "removed", sessionId});
    for (const [sessionId, session] of afterMap) {
        const prior = beforeMap.get(sessionId);
        if (prior && prior.disposed !== session.disposed && session.disposed) events.push({type: "disposed", sessionId});
    }
    if (before.size !== after.size || before.maxSessions !== after.maxSessions) events.push({type: "capacity", size: after.size, maxSessions: after.maxSessions});
    return normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff(events);
}



function enqueueWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, previous, current) {
    if (!queue || typeof queue.push !== "function") return 0;
    return queue.push(diffWorkspaceCapabilityRuntimeSessionRegistrySnapshots(previous, current));
}




function commitWorkspaceCapabilityRuntimeSessionRegistryDiffReplay(queue, replay) {
    if (!queue || typeof queue.acknowledge !== "function" || !replay || replay.ok !== true || replay.reason !== "ready") return 0;
    return queue.acknowledge(replay.cursor);
}



function recoverWorkspaceCapabilityRuntimeSessionRegistryDiffSafe(queue, cursor = 0, limit = 8, snapshot = null, signal) {
    if (signal?.aborted) return normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", cursor});
    const recovery = recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, cursor, limit, snapshot);
    if (signal?.aborted) return normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", cursor: recovery.cursor});
    return normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult(recovery);
}



function normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const modes = ["events", "snapshot", "unavailable", "cancelled", "timeout", "invalid_snapshot"];
    const mode = modes.includes(source.mode) ? source.mode : "unavailable";
    const ok = source.ok === true && (mode === "events" || mode === "snapshot");
    const reason = ["ready", "snapshot_required", "registry_unavailable", "queue_unavailable", "invalid_snapshot", "cancelled", "timeout", "joint_coordinator_disposed"].includes(source.reason) ? source.reason : (ok ? "ready" : mode);
    return Object.freeze({
        ok,
        mode,
        reason,
        registry: source.registry ? normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult(source.registry) : null,
        diff: source.diff ? normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult(source.diff) : null,
        acknowledged: Math.max(0, Math.min(16, Math.trunc(Number(source.acknowledged) || 0))),
    });
}


function buildWorkspaceCapabilityDefinitionsDiagnostics(definitions) {
    const matrix = validateWorkspaceCapabilityDefinitions(definitions);
    return Object.freeze({ok: matrix.ok, total: matrix.total, valid: matrix.valid, invalid: matrix.invalid, duplicate: matrix.duplicate});
}

function normalizeWorkspaceCapabilityDefinitionsDiagnostics(value) {
    const source = value && typeof value === "object" ? value : {};
    const bounded = (input, max) => Math.max(0, Math.min(max, Math.trunc(Number(input) || 0)));
    return Object.freeze({ok: source.ok === true, total: bounded(source.total, 8), valid: bounded(source.valid, 8), invalid: bounded(source.invalid, 8), duplicate: bounded(source.duplicate, 8)});
}

function buildWorkspaceCapabilityLifecycleDiagnostics(lifecycle) {
    const status = lifecycle && typeof lifecycle.status === "function" ? lifecycle.status() : {registered: 0, failed: 0, unmanaged: 0, disposed: true};
    const handleStatus = lifecycle && typeof lifecycle.handleStatus === "function" ? lifecycle.handleStatus() : {opaque: 0, invalid: 0};
    const failureStatus = lifecycle && typeof lifecycle.failureStatus === "function" ? lifecycle.failureStatus() : {total: 0, byReason: {cancelled: 0, timeout: 0, failed: 0}};
    const probe = lifecycle && typeof lifecycle.probe === "function" ? lifecycle.probe() : {available: false, reason: "unavailable"};
    const bounded = (input, max) => Math.max(0, Math.min(max, Math.trunc(Number(input) || 0)));
    return Object.freeze({probe: Object.freeze({available: probe.available === true, reason: ["ready", "unavailable", "timeout", "cancelled", "failed"].includes(probe.reason) ? probe.reason : "failed"}), status: Object.freeze({registered: bounded(status.registered, 8), failed: bounded(status.failed, 8), unmanaged: bounded(status.unmanaged, 8), disposed: status.disposed === true}), handles: Object.freeze({opaque: bounded(handleStatus.opaque, 8), invalid: bounded(handleStatus.invalid, 8)}), failures: Object.freeze({total: bounded(failureStatus.total, 8), byReason: Object.freeze({cancelled: bounded(failureStatus.byReason?.cancelled, 8), timeout: bounded(failureStatus.byReason?.timeout, 8), failed: bounded(failureStatus.byReason?.failed, 8)})})});
}

function buildWorkspaceCapabilityDefinitionLifecycleDiagnostics(definitions, lifecycle) {
    return Object.freeze({definitions: normalizeWorkspaceCapabilityDefinitionsDiagnostics(buildWorkspaceCapabilityDefinitionsDiagnostics(definitions)), lifecycle: buildWorkspaceCapabilityLifecycleDiagnostics(lifecycle)});
}

function buildWorkspaceCapabilityDiagnosticsSnapshot(definitions, lifecycle, registry, diffQueue = null, diffCoordinator = null) {
    return Object.freeze({version: WORKSPACE_CAPABILITY_DIAGNOSTICS_SNAPSHOT_VERSION, definitionLifecycle: buildWorkspaceCapabilityDefinitionLifecycleDiagnostics(definitions, lifecycle), runtimeRegistry: normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(registry, diffQueue, diffCoordinator))});
}

function normalizeWorkspaceCapabilityDiagnosticsSnapshot(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze({version: WORKSPACE_CAPABILITY_DIAGNOSTICS_SNAPSHOT_VERSION, definitionLifecycle: source.definitionLifecycle && typeof source.definitionLifecycle === "object" ? source.definitionLifecycle : {definitions: {ok: false, total: 0, valid: 0, invalid: 0, duplicate: 0}, lifecycle: buildWorkspaceCapabilityLifecycleDiagnostics(null)}, runtimeRegistry: normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(source.runtimeRegistry)});
}

function isWorkspaceCapabilityDiagnosticsSnapshotCompatible(value) {
    return !!value && typeof value === "object" && (value.version === undefined || value.version === WORKSPACE_CAPABILITY_DIAGNOSTICS_SNAPSHOT_VERSION);
}

function validateWorkspaceCapabilityDiagnosticsSnapshot(value) {
    if (!isWorkspaceCapabilityDiagnosticsSnapshotCompatible(value)) return {ok: false, reason: "unsupported_version"};
    const normalized = normalizeWorkspaceCapabilityDiagnosticsSnapshot(value);
    const definitions = normalized.definitionLifecycle?.definitions;
    if (!definitions || definitions.valid + definitions.invalid > 8) return {ok: false, reason: "definition_overflow"};
    if (!normalized.runtimeRegistry || !normalized.runtimeRegistry.summary) return {ok: false, reason: "registry_missing"};
    return {ok: true, version: normalized.version};
}

function diffWorkspaceCapabilityDiagnosticsSnapshots(previous, current) {
    const before = normalizeWorkspaceCapabilityDiagnosticsSnapshot(previous);
    const after = normalizeWorkspaceCapabilityDiagnosticsSnapshot(current);
    return Object.freeze({definitionsChanged: JSON.stringify(before.definitionLifecycle?.definitions) !== JSON.stringify(after.definitionLifecycle?.definitions), lifecycleChanged: JSON.stringify(before.definitionLifecycle?.lifecycle) !== JSON.stringify(after.definitionLifecycle?.lifecycle), registryChanged: JSON.stringify(before.runtimeRegistry?.registry) !== JSON.stringify(after.runtimeRegistry?.registry), diffQueueChanged: JSON.stringify(before.runtimeRegistry?.diffQueue) !== JSON.stringify(after.runtimeRegistry?.diffQueue), coordinatorChanged: JSON.stringify(before.runtimeRegistry?.diffCoordinator) !== JSON.stringify(after.runtimeRegistry?.diffCoordinator)});
}

function buildWorkspaceCapabilityDiagnosticsEvents(previous, current) {
    const diff = diffWorkspaceCapabilityDiagnosticsSnapshots(previous, current);
    return ["definitions", "lifecycle", "registry", "diffQueue", "coordinator"].filter((type) => diff[`${type}Changed`]).map((type) => ({type, changed: true}));
}

function normalizeWorkspaceCapabilityDiagnosticsEvents(events) {
    const order = ["definitions", "lifecycle", "registry", "diffQueue", "coordinator"];
    const source = Array.isArray(events) ? events : [];
    const seen = new Set();
    return order.filter((type) => source.some((event) => event?.type === type) && !seen.has(type) && seen.add(type)).map((type) => ({type, changed: true}));
}

function createWorkspaceCapabilityDiagnosticsEventQueue(maxItems = 8) {
    const max = Math.min(8, Math.max(1, Math.trunc(Number(maxItems) || 8)));
    const queue = []; let disposed = false; let nextSequence = 1;
    return Object.freeze({
        push(events) { if (disposed) return 0; const normalized = normalizeWorkspaceCapabilityDiagnosticsEvents(events); normalized.forEach((event) => queue.push({sequence: nextSequence++, event})); while (queue.length > max) queue.shift(); return normalized.length; },
        readSince(cursor = 0, limit = max) { const from = Math.max(0, Math.trunc(Number(cursor) || 0)); const count = Math.min(max, Math.max(0, Math.trunc(Number(limit) || max))); const first = queue[0]?.sequence || nextSequence; return {cursor: nextSequence - 1, truncated: from < first - 1, events: queue.filter((entry) => entry.sequence > from).slice(0, count).map((entry) => ({sequence: entry.sequence, event: {...entry.event}}))}; },
        acknowledge(cursor = 0) { const upto = Math.max(0, Math.trunc(Number(cursor) || 0)); let removed = 0; while (queue.length && queue[0].sequence <= upto) { queue.shift(); removed += 1; } return removed; },
        size() { return queue.length; }, status() { return Object.freeze({size: queue.length, maxItems: max, cursor: nextSequence - 1, disposed}); }, dispose() { disposed = true; queue.length = 0; },
    });
}

function enqueueWorkspaceCapabilityDiagnosticsDiff(queue, previous, current) {
    if (!queue || typeof queue.push !== "function") return 0;
    return queue.push(buildWorkspaceCapabilityDiagnosticsEvents(previous, current));
}

function readWorkspaceCapabilityDiagnosticsEventsForReplay(queue, cursor = 0, limit = 8) {
    if (!queue || typeof queue.readSince !== "function") return {ok: false, reason: "queue_unavailable", cursor: 0, events: []};
    let batch; try { batch = queue.readSince(cursor, limit); } catch (_error) { return {ok: false, reason: "queue_unavailable", cursor: 0, events: []}; }
    if (!batch || batch.truncated === true) return {ok: false, reason: "snapshot_required", cursor: Number(batch?.cursor) || 0, events: []};
    return {ok: true, reason: "ready", cursor: Number(batch.cursor) || 0, events: normalizeWorkspaceCapabilityDiagnosticsEvents(batch.events?.map((entry) => entry.event))};
}

function commitWorkspaceCapabilityDiagnosticsReplay(queue, replay) { if (!queue || typeof queue.acknowledge !== "function" || !replay || replay.ok !== true || replay.reason !== "ready") return 0; return queue.acknowledge(replay.cursor); }

function recoverWorkspaceCapabilityDiagnostics(queue, cursor = 0, limit = 8, snapshot = null) {
    const replay = readWorkspaceCapabilityDiagnosticsEventsForReplay(queue, cursor, limit);
    if (replay.ok) return {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null};
    if (replay.reason !== "snapshot_required" || !isWorkspaceCapabilityDiagnosticsSnapshotCompatible(snapshot)) return {ok: false, mode: replay.reason === "snapshot_required" ? "invalid_snapshot" : "unavailable", reason: replay.reason === "snapshot_required" ? "invalid_snapshot" : replay.reason, cursor: replay.cursor, events: [], snapshot: null};
    const validation = validateWorkspaceCapabilityDiagnosticsSnapshot(snapshot);
    if (!validation.ok) return {ok: false, mode: "invalid_snapshot", reason: validation.reason, cursor: replay.cursor, events: [], snapshot: null};
    return {ok: true, mode: "snapshot", reason: "snapshot_required", cursor: replay.cursor, events: [], snapshot: normalizeWorkspaceCapabilityDiagnosticsSnapshot(snapshot)};
}

function readWorkspaceCapabilityDiagnosticsEventsForReplayWithSignal(queue, cursor = 0, limit = 8, signal) {
    const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
    if (signal?.aborted) return {ok: false, reason: "cancelled", cursor: safeCursor, events: []};
    const replay = readWorkspaceCapabilityDiagnosticsEventsForReplay(queue, safeCursor, limit);
    if (signal?.aborted) return {ok: false, reason: "cancelled", cursor: replay.cursor, events: []};
    return replay;
}

function readWorkspaceCapabilityDiagnosticsEventsForReplayWithDeadline(queue, cursor = 0, limit = 8, deadline, now = Date.now) {
    const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
    const expiresAt = Number(deadline);
    const current = typeof now === "function" ? Number(now()) : Number(now);
    if (Number.isFinite(expiresAt) && Number.isFinite(current) && current >= expiresAt) return {ok: false, reason: "timeout", cursor: safeCursor, events: []};
    const replay = readWorkspaceCapabilityDiagnosticsEventsForReplay(queue, safeCursor, limit);
    const after = typeof now === "function" ? Number(now()) : Number(now);
    if (Number.isFinite(expiresAt) && Number.isFinite(after) && after >= expiresAt) return {ok: false, reason: "timeout", cursor: replay.cursor, events: []};
    return replay;
}

function normalizeWorkspaceCapabilityDiagnosticsRecoveryResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const modes = ["events", "snapshot", "unavailable", "invalid_snapshot", "cancelled", "timeout"];
    const mode = modes.includes(source.mode) ? source.mode : "unavailable";
    const ok = source.ok === true && (mode === "events" || mode === "snapshot");
    const reason = ["ready", "snapshot_required", "queue_unavailable", "invalid_snapshot", "cancelled", "timeout", "diagnostics_coordinator_disposed"].includes(source.reason) ? source.reason : (ok ? "ready" : mode);
    return Object.freeze({ok, mode, reason, cursor: Math.max(0, Math.min(0x7fffffff, Math.trunc(Number(source.cursor) || 0))), events: mode === "events" ? normalizeWorkspaceCapabilityDiagnosticsEvents(source.events) : [], snapshot: mode === "snapshot" && source.snapshot ? normalizeWorkspaceCapabilityDiagnosticsSnapshot(source.snapshot) : null});
}

function commitWorkspaceCapabilityDiagnosticsRecovery(queue, recovery) {
    if (!queue || typeof queue.acknowledge !== "function" || !recovery || recovery.ok !== true || (recovery.mode !== "events" && recovery.mode !== "snapshot")) return 0;
    return queue.acknowledge(recovery.cursor);
}

function createWorkspaceCapabilityDiagnosticsRecoveryCoordinator(queue) {
    let lastCursor = 0; let commits = 0; let disposed = false;
    const unavailable = () => ({ok: false, mode: "unavailable", reason: "diagnostics_coordinator_disposed", cursor: lastCursor, events: [], snapshot: null});
    return Object.freeze({
        recover(cursor = 0, limit = 8, snapshot = null) { if (disposed) return unavailable(); return recoverWorkspaceCapabilityDiagnostics(queue, Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0))), limit, snapshot); },
        commit(recovery) { if (disposed || !recovery || recovery.ok !== true) return 0; const cursor = Math.max(0, Math.trunc(Number(recovery.cursor) || 0)); if (cursor <= lastCursor || (recovery.mode !== "events" && recovery.mode !== "snapshot")) return 0; const acknowledged = commitWorkspaceCapabilityDiagnosticsRecovery(queue, recovery); if (acknowledged > 0 || recovery.mode === "snapshot") { lastCursor = cursor; commits = Math.min(32, commits + 1); } return acknowledged; },
        recoverAndCommit(cursor = 0, limit = 8, snapshot = null) { if (disposed) return {...unavailable(), acknowledged: 0}; const recovery = this.recover(cursor, limit, snapshot); return Object.freeze({...normalizeWorkspaceCapabilityDiagnosticsRecoveryResult(recovery), acknowledged: this.commit(recovery)}); },
        recoverAndCommitWithSignal(cursor = 0, limit = 8, snapshot = null, signal) { if (disposed) return {...unavailable(), acknowledged: 0}; const replay = readWorkspaceCapabilityDiagnosticsEventsForReplayWithSignal(queue, Math.max(lastCursor, cursor), limit, signal); const recovery = replay.ok ? {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null} : replay.reason === "snapshot_required" && !signal?.aborted ? recoverWorkspaceCapabilityDiagnostics(queue, Math.max(lastCursor, cursor), limit, snapshot) : {...replay, mode: replay.reason === "cancelled" ? "cancelled" : "unavailable"}; return Object.freeze({...normalizeWorkspaceCapabilityDiagnosticsRecoveryResult(recovery), acknowledged: this.commit(recovery)}); },
        recoverAndCommitWithDeadline(cursor = 0, limit = 8, snapshot = null, deadline, now = Date.now) { if (disposed) return {...unavailable(), acknowledged: 0}; const replay = readWorkspaceCapabilityDiagnosticsEventsForReplayWithDeadline(queue, Math.max(lastCursor, cursor), limit, deadline, now); const recovery = replay.ok ? {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null} : replay.reason === "snapshot_required" ? recoverWorkspaceCapabilityDiagnostics(queue, Math.max(lastCursor, cursor), limit, snapshot) : {...replay, mode: replay.reason === "timeout" ? "timeout" : "unavailable"}; const current = typeof now === "function" ? Number(now()) : Number(now); if (Number.isFinite(Number(deadline)) && Number.isFinite(current) && current >= Number(deadline)) return Object.freeze({...normalizeWorkspaceCapabilityDiagnosticsRecoveryResult({ok: false, mode: "timeout", reason: "timeout", cursor: replay.cursor}), acknowledged: 0}); return Object.freeze({...normalizeWorkspaceCapabilityDiagnosticsRecoveryResult(recovery), acknowledged: this.commit(recovery)}); },
        status() { return Object.freeze({lastCursor, commits, disposed}); },
        snapshot() { return Object.freeze({coordinator: Object.freeze({lastCursor, commits, disposed}), queue: queue?.status?.() || {size: 0, maxItems: 0, cursor: 0, disposed: true}}); },
        dispose() { disposed = true; },
    });
}

function normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const modes = ["events", "snapshot", "unavailable", "invalid_snapshot", "cancelled", "timeout"];
    const mode = modes.includes(source.mode) ? source.mode : "unavailable";
    const ok = source.ok === true && (mode === "events" || mode === "snapshot");
    const reason = ["ready", "snapshot_required", "queue_unavailable", "invalid_snapshot", "cancelled", "timeout", "diagnostics_joint_coordinator_disposed"].includes(source.reason) ? source.reason : (ok ? "ready" : mode);
    return Object.freeze({ok, mode, reason, events: source.events ? normalizeWorkspaceCapabilityDiagnosticsRecoveryResult(source.events) : null, snapshot: source.snapshot ? normalizeWorkspaceCapabilityDiagnosticsSnapshot(source.snapshot) : null, acknowledged: Math.max(0, Math.min(8, Math.trunc(Number(source.acknowledged) || 0)))});
}

function createWorkspaceCapabilityDiagnosticsJointRecoveryCoordinator(queue) {
    let lastCursor = 0; let commits = 0; let disposed = false;
    const unavailable = () => ({ok: false, mode: "unavailable", reason: "diagnostics_joint_coordinator_disposed", events: null, snapshot: null, acknowledged: 0});
    return Object.freeze({
        recover(cursor = 0, limit = 8, snapshot = null) {
            if (disposed) return unavailable();
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            const recovery = recoverWorkspaceCapabilityDiagnostics(queue, requested, limit, snapshot);
            return recovery.mode === "events" ? {ok: true, mode: "events", reason: "ready", events: recovery, snapshot: null, acknowledged: 0} : recovery.mode === "snapshot" ? {ok: true, mode: "snapshot", reason: "snapshot_required", events: recovery, snapshot: recovery.snapshot, acknowledged: 0} : {ok: false, mode: recovery.mode, reason: recovery.reason, events: recovery, snapshot: null, acknowledged: 0};
        },
        commit(recovery) {
            if (disposed || !recovery || recovery.ok !== true || !recovery.events) return 0;
            const cursor = Math.max(0, Math.trunc(Number(recovery.events.cursor) || 0));
            if (cursor <= lastCursor) return 0;
            const acknowledged = commitWorkspaceCapabilityDiagnosticsRecovery(queue, recovery.events);
            if (acknowledged > 0 || recovery.mode === "snapshot") { lastCursor = cursor; commits = Math.min(32, commits + 1); return acknowledged; }
            return 0;
        },
        recoverAndCommit(cursor = 0, limit = 8, snapshot = null) { if (disposed) return {...unavailable(), acknowledged: 0}; const recovery = this.recover(cursor, limit, snapshot); return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({...recovery, acknowledged: this.commit(recovery)}); },
        recoverAndCommitWithSignal(cursor = 0, limit = 8, snapshot = null, signal) { if (disposed) return {...unavailable(), acknowledged: 0}; if (signal?.aborted) return {...unavailable(), reason: "cancelled", acknowledged: 0}; const recovery = this.recover(cursor, limit, snapshot); if (signal?.aborted) return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", acknowledged: 0}); return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({...recovery, acknowledged: this.commit(recovery)}); },
        recoverAndCommitWithDeadline(cursor = 0, limit = 8, snapshot = null, deadline, now = Date.now) { if (disposed) return {...unavailable(), acknowledged: 0}; const expiresAt = Number(deadline); const current = typeof now === "function" ? Number(now()) : Number(now); if (Number.isFinite(expiresAt) && Number.isFinite(current) && current >= expiresAt) return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({ok: false, mode: "timeout", reason: "timeout", acknowledged: 0}); const recovery = this.recover(cursor, limit, snapshot); const after = typeof now === "function" ? Number(now()) : Number(now); if (Number.isFinite(expiresAt) && Number.isFinite(after) && after >= expiresAt) return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({ok: false, mode: "timeout", reason: "timeout", acknowledged: 0}); return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({...recovery, acknowledged: this.commit(recovery)}); },
        status() { return Object.freeze({lastCursor, commits, disposed}); },
        snapshot() { return Object.freeze({coordinator: Object.freeze({lastCursor, commits, disposed}), queue: queue?.status?.() || {size: 0, maxItems: 0, cursor: 0, disposed: true}}); },
        dispose() { disposed = true; },
    });
}

function createWorkspaceCapabilityDiagnosticsJointRecoveryHandler(coordinator, snapshotProvider = null) {
    return function diagnosticsJointRecoveryHandler(input = {}) {
        try {
            const cursor = Math.max(0, Math.trunc(Number(input?.cursor) || 0));
            const limit = Math.min(8, Math.max(1, Math.trunc(Number(input?.limit) || 8)));
            const snapshot = typeof snapshotProvider === "function" ? snapshotProvider() : null;
            return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult(coordinator && typeof coordinator.recover === "function" ? coordinator.recover(cursor, limit, snapshot) : {ok: false, mode: "unavailable", reason: "queue_unavailable"});
        } catch (_error) {
            return normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({ok: false, mode: "unavailable", reason: "queue_unavailable"});
        }
    };
}

function createWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryCoordinator(registry, diffQueue) {
    let registryCursor = 0;
    let diffCursor = 0;
    let commits = 0;
    let disposed = false;
    const unavailable = () => ({ok: false, mode: "unavailable", reason: "joint_coordinator_disposed", registry: null, diff: null, acknowledged: 0});
    const recoverPair = (cursor = 0, diffCursorInput = 0, limit = 8, snapshot = null) => {
        const requestedRegistry = Math.max(registryCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
        const requestedDiff = Math.max(diffCursor, Math.max(0, Math.trunc(Number(diffCursorInput) || 0)));
        const registryRecovery = recoverWorkspaceCapabilityRuntimeRegistry(registry, requestedRegistry, limit);
        const diffRecovery = recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(diffQueue, requestedDiff, limit, snapshot);
        const ok = registryRecovery.ok === true && diffRecovery.ok === true;
        const mode = ok && (registryRecovery.mode === "snapshot" || diffRecovery.mode === "snapshot") ? "snapshot" : ok ? "events" : (registryRecovery.mode === "invalid_snapshot" || diffRecovery.mode === "invalid_snapshot" ? "invalid_snapshot" : "unavailable");
        const reason = ok ? (mode === "snapshot" ? "snapshot_required" : "ready") : (registryRecovery.reason || diffRecovery.reason || "unavailable");
        return {ok, mode, reason, registry: registryRecovery, diff: diffRecovery, acknowledged: 0};
    };
    return Object.freeze({
        recover(cursor = 0, diffCursorInput = 0, limit = 8, snapshot = null) { return disposed ? unavailable() : recoverPair(cursor, diffCursorInput, limit, snapshot); },
        commit(recovery) {
            if (disposed || !recovery || recovery.ok !== true || !recovery.registry || !recovery.diff) return 0;
            const nextRegistry = Math.max(0, Math.trunc(Number(recovery.registry.cursor) || 0));
            const nextDiff = Math.max(0, Math.trunc(Number(recovery.diff.cursor) || 0));
            if (nextRegistry <= registryCursor || nextDiff <= diffCursor) return 0;
            const registryAck = commitWorkspaceCapabilityRuntimeRegistryRecovery(registry, recovery.registry);
            const diffAck = commitWorkspaceCapabilityRuntimeSessionRegistryDiffRecovery(diffQueue, recovery.diff);
            if ((registryAck > 0 || recovery.registry.mode === "snapshot") && (diffAck > 0 || recovery.diff.mode === "snapshot")) {
                registryCursor = nextRegistry; diffCursor = nextDiff; commits = Math.min(32, commits + 1); return registryAck + diffAck;
            }
            return 0;
        },
        recoverAndCommit(cursor = 0, diffCursorInput = 0, limit = 8, snapshot = null) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const recovery = this.recover(cursor, diffCursorInput, limit, snapshot);
            return normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({...recovery, acknowledged: this.commit(recovery)});
        },
        recoverAndCommitWithSignal(cursor = 0, diffCursorInput = 0, limit = 8, snapshot = null, signal) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            if (signal?.aborted) return {...unavailable(), reason: "cancelled", acknowledged: 0};
            const recovery = recoverPair(cursor, diffCursorInput, limit, snapshot);
            if (signal?.aborted) return normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", acknowledged: 0});
            return normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({...recovery, acknowledged: this.commit(recovery)});
        },
        recoverAndCommitWithDeadline(cursor = 0, diffCursorInput = 0, limit = 8, snapshot = null, deadline, now = Date.now) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const expiresAt = Number(deadline);
            const current = typeof now === "function" ? Number(now()) : Number(now);
            if (Number.isFinite(expiresAt) && Number.isFinite(current) && current >= expiresAt) return normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({ok: false, mode: "timeout", reason: "timeout", acknowledged: 0});
            const recovery = recoverPair(cursor, diffCursorInput, limit, snapshot);
            const after = typeof now === "function" ? Number(now()) : Number(now);
            if (Number.isFinite(expiresAt) && Number.isFinite(after) && after >= expiresAt) return normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({ok: false, mode: "timeout", reason: "timeout", acknowledged: 0});
            return normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({...recovery, acknowledged: this.commit(recovery)});
        },
        status() { return Object.freeze({registryCursor, diffCursor, commits, disposed}); },
        snapshot() { return Object.freeze({coordinator: Object.freeze({registryCursor, diffCursor, commits, disposed}), registry: registry?.status?.() || {size: 0, maxSessions: 0, disposed: true}, diffQueue: diffQueue?.status?.() || {size: 0, maxItems: 0, cursor: 0, disposed: true}}); },
        dispose() { disposed = true; },
    });
}

function normalizeWorkspaceCapabilityRuntimeRegistryEvents(events) {
    const allowed = ["created", "evicted", "removed", "pruned", "idle"];
    return (Array.isArray(events) ? events : []).slice(0, 8).map((event) => {
        const type = allowed.includes(event?.type) ? event.type : "";
        const sessionId = typeof event?.sessionId === "string" && /^ws-[a-z0-9]{8}$/.test(event.sessionId) ? event.sessionId : "";
        const sequence = Math.max(0, Math.trunc(Number(event?.sequence) || 0));
        return type && sessionId ? {sequence, type, sessionId} : null;
    }).filter(Boolean);
}

function readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, cursor = 0, limit = 8) {
    if (!registry || typeof registry.eventsSince !== "function") return {ok: false, reason: "registry_unavailable", cursor: 0, events: []};
    let batch;
    try { batch = registry.eventsSince(cursor, limit); } catch (_error) { return {ok: false, reason: "registry_unavailable", cursor: 0, events: []}; }
    if (!batch || typeof batch !== "object") return {ok: false, reason: "registry_unavailable", cursor: 0, events: []};
    if (batch.truncated === true) return {ok: false, reason: "snapshot_required", cursor: Number(batch.cursor) || 0, events: []};
    return {ok: true, reason: "ready", cursor: Number(batch.cursor) || 0, events: normalizeWorkspaceCapabilityRuntimeRegistryEvents(batch.events)};
}

function readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithSignal(registry, cursor = 0, limit = 8, signal) {
    const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
    if (signal?.aborted) return {ok: false, reason: "cancelled", cursor: safeCursor, events: []};
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, safeCursor, limit);
    if (signal?.aborted) return {ok: false, reason: "cancelled", cursor: replay.cursor, events: []};
    return replay;
}

function readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithDeadline(registry, cursor = 0, limit = 8, deadline, now = Date.now) {
    const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
    const current = typeof now === "function" ? Number(now()) : Number(now);
    const expiresAt = Number(deadline);
    if (Number.isFinite(expiresAt) && Number.isFinite(current) && current >= expiresAt) return {ok: false, reason: "timeout", cursor: safeCursor, events: []};
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, safeCursor, limit);
    const after = typeof now === "function" ? Number(now()) : Number(now);
    if (Number.isFinite(expiresAt) && Number.isFinite(after) && after >= expiresAt) return {ok: false, reason: "timeout", cursor: replay.cursor, events: []};
    return replay;
}

function commitWorkspaceCapabilityRuntimeRegistryReplay(registry, replay) {
    if (!registry || typeof registry.acknowledgeEvents !== "function" || !replay || replay.ok !== true) return 0;
    if (replay.reason !== "ready") return 0;
    return registry.acknowledgeEvents(replay.cursor);
}

function commitWorkspaceCapabilityRuntimeRegistryRecovery(registry, recovery) {
    if (!registry || typeof registry.acknowledgeEvents !== "function" || !recovery || recovery.ok !== true) return 0;
    if (recovery.mode !== "events" && recovery.mode !== "snapshot") return 0;
    return registry.acknowledgeEvents(recovery.cursor);
}

function recoverWorkspaceCapabilityRuntimeRegistry(registry, cursor = 0, limit = 8) {
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, cursor, limit);
    if (replay.ok) return {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null};
    if (replay.reason !== "snapshot_required" || !registry || typeof registry.snapshot !== "function") return {ok: false, mode: "unavailable", reason: replay.reason, cursor: replay.cursor, events: [], snapshot: null};
    try {
        const rawSnapshot = registry.snapshot();
        if (!isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible(rawSnapshot)) return {ok: false, mode: "invalid_snapshot", reason: "unsupported_version", cursor: replay.cursor, events: [], snapshot: null};
        const snapshot = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(rawSnapshot);
        const validation = validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot(rawSnapshot);
        if (!validation.ok) return {ok: false, mode: "invalid_snapshot", reason: "invalid_snapshot", cursor: replay.cursor, events: [], snapshot: null};
        return {ok: true, mode: "snapshot", reason: "snapshot_required", cursor: replay.cursor, events: [], snapshot};
    } catch (_error) {
        return {ok: false, mode: "unavailable", reason: "registry_unavailable", cursor: replay.cursor, events: [], snapshot: null};
    }
}

function normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const modes = ["events", "snapshot", "unavailable", "invalid_snapshot", "cancelled", "timeout"];
    const mode = modes.includes(source.mode) ? source.mode : "unavailable";
    const ok = source.ok === true && (mode === "events" || mode === "snapshot");
    const reason = ["ready", "snapshot_required", "registry_unavailable", "invalid_snapshot", "cancelled", "timeout", "registry_coordinator_disposed"].includes(source.reason)
        ? source.reason
        : (ok ? "ready" : mode);
    return Object.freeze({
        ok,
        mode,
        reason,
        cursor: Math.max(0, Math.min(0x7fffffff, Math.trunc(Number(source.cursor) || 0))),
        events: mode === "events" ? normalizeWorkspaceCapabilityRuntimeRegistryEvents(source.events) : [],
        snapshot: mode === "snapshot" && source.snapshot ? normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(source.snapshot) : null,
    });
}

function recoverWorkspaceCapabilityRuntimeRegistrySafe(registry, cursor = 0, limit = 8, signal) {
    if (signal?.aborted) return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", cursor});
    const recovery = recoverWorkspaceCapabilityRuntimeRegistry(registry, cursor, limit);
    if (signal?.aborted) return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", cursor: recovery.cursor});
    return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult(recovery);
}

function createWorkspaceCapabilityRuntimeRegistryRecoveryCoordinator(registry) {
    let lastCursor = 0;
    let commits = 0;
    let disposed = false;
    const unavailable = () => ({ok: false, mode: "unavailable", reason: "registry_coordinator_disposed", cursor: lastCursor, events: [], snapshot: null});
    return Object.freeze({
        recover(cursor = 0, limit = 8) {
            if (disposed) return unavailable();
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            return recoverWorkspaceCapabilityRuntimeRegistry(registry, requested, limit);
        },
        recoverWithSignal(cursor = 0, limit = 8, signal) {
            if (disposed) return unavailable();
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithSignal(registry, requested, limit, signal);
            if (replay.ok) return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null});
            if (replay.reason !== "snapshot_required") return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({...replay, mode: replay.reason === "cancelled" ? "cancelled" : "unavailable"});
            if (signal?.aborted) return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", cursor: replay.cursor});
            const recovery = recoverWorkspaceCapabilityRuntimeRegistry(registry, requested, limit);
            return signal?.aborted
                ? normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: false, mode: "cancelled", reason: "cancelled", cursor: recovery.cursor})
                : normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult(recovery);
        },
        recoverWithDeadline(cursor = 0, limit = 8, deadline, now = Date.now) {
            if (disposed) return unavailable();
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithDeadline(registry, requested, limit, deadline, now);
            if (!replay.ok && replay.reason !== "snapshot_required") return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({...replay, mode: replay.reason === "timeout" ? "timeout" : "unavailable"});
            if (replay.reason !== "snapshot_required") return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null});
            const recovery = recoverWorkspaceCapabilityRuntimeRegistry(registry, requested, limit);
            const after = typeof now === "function" ? Number(now()) : Number(now);
            if (Number.isFinite(Number(deadline)) && Number.isFinite(after) && after >= Number(deadline)) return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: false, mode: "timeout", reason: "timeout", cursor: recovery.cursor});
            return normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult(recovery);
        },
        commit(recovery) {
            if (disposed || !recovery || recovery.ok !== true) return 0;
            const cursor = Math.max(0, Math.trunc(Number(recovery.cursor) || 0));
            if (cursor <= lastCursor || (recovery.mode !== "events" && recovery.mode !== "snapshot")) return 0;
            const acknowledged = commitWorkspaceCapabilityRuntimeRegistryRecovery(registry, recovery);
            if (acknowledged > 0 || recovery.mode === "snapshot") {
                lastCursor = cursor;
                commits = Math.min(32, commits + 1);
            }
            return acknowledged;
        },
        recoverAndCommit(cursor = 0, limit = 8) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const recovery = this.recover(cursor, limit);
            return Object.freeze({...recovery, acknowledged: this.commit(recovery)});
        },
        recoverAndCommitWithSignal(cursor = 0, limit = 8, signal) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const recovery = this.recoverWithSignal(cursor, limit, signal);
            return Object.freeze({...recovery, acknowledged: this.commit(recovery)});
        },
        recoverAndCommitWithDeadline(cursor = 0, limit = 8, deadline, now = Date.now) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const recovery = this.recoverWithDeadline(cursor, limit, deadline, now);
            return Object.freeze({...recovery, acknowledged: this.commit(recovery)});
        },
        status() { return Object.freeze({lastCursor, commits, disposed}); },
        snapshot() {
            const registryStatus = registry && typeof registry.status === "function" ? registry.status() : {size: 0, maxSessions: 0, disposed: true};
            return Object.freeze({coordinator: Object.freeze({lastCursor, commits, disposed}), registry: registryStatus});
        },
        dispose() { if (!disposed) disposed = true; },
    });
}

module.exports = {
    WORKSPACE_CAPABILITY_NAMES,
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC,
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS,
    normalizeWorkspaceCapabilityHandle,
    createWorkspaceCapabilityDiagnosticsDefinition,
    normalizeWorkspaceCapabilityRuntimeRegistryDiagnosticsInput,
    validateWorkspaceCapabilityDefinition,
    validateWorkspaceCapabilityDefinitions,
    normalizeWorkspaceCapabilityRegistrationFailureReason,
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
    recoverWorkspaceCapabilityRuntimeSafe,
    createWorkspaceCapabilityRecoveryCoordinator,
    createWorkspaceCapabilityRuntimeSession,
    WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION,
    WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION,
    WORKSPACE_CAPABILITY_DIAGNOSTICS_SNAPSHOT_VERSION,
    MAX_RUNTIME_SESSIONS,
    buildWorkspaceCapabilityRuntimeSessionSnapshot,
    normalizeWorkspaceCapabilityRuntimeSessionSnapshot,
    createWorkspaceCapabilityRuntimeSessionRegistry,
    normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot,
    buildWorkspaceCapabilityRuntimeSessionRegistrySnapshot,
    isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible,
    validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff,
    diffWorkspaceCapabilityRuntimeSessionRegistrySnapshots,
    buildWorkspaceCapabilityRuntimeSessionRegistrySummary,
    createWorkspaceCapabilityRuntimeRegistryDiffQueue,
    enqueueWorkspaceCapabilityRuntimeSessionRegistryDiff,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForSignal: readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal,
    readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithDeadline,
    commitWorkspaceCapabilityRuntimeSessionRegistryDiffReplay,
    recoverWorkspaceCapabilityRuntimeSessionRegistryDiff,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult,
    recoverWorkspaceCapabilityRuntimeSessionRegistryDiffSafe,
    commitWorkspaceCapabilityRuntimeSessionRegistryDiffRecovery,
    createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator,
    buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult,
    normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics,
    createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler,
    buildWorkspaceCapabilityDefinitionsDiagnostics,
    normalizeWorkspaceCapabilityDefinitionsDiagnostics,
    buildWorkspaceCapabilityLifecycleDiagnostics,
    buildWorkspaceCapabilityDefinitionLifecycleDiagnostics,
    buildWorkspaceCapabilityDiagnosticsSnapshot,
    normalizeWorkspaceCapabilityDiagnosticsSnapshot,
    isWorkspaceCapabilityDiagnosticsSnapshotCompatible,
    validateWorkspaceCapabilityDiagnosticsSnapshot,
    diffWorkspaceCapabilityDiagnosticsSnapshots,
    buildWorkspaceCapabilityDiagnosticsEvents,
    normalizeWorkspaceCapabilityDiagnosticsEvents,
    createWorkspaceCapabilityDiagnosticsEventQueue,
    enqueueWorkspaceCapabilityDiagnosticsDiff,
    readWorkspaceCapabilityDiagnosticsEventsForReplay,
    commitWorkspaceCapabilityDiagnosticsReplay,
    recoverWorkspaceCapabilityDiagnostics,
    readWorkspaceCapabilityDiagnosticsEventsForReplayWithSignal,
    readWorkspaceCapabilityDiagnosticsEventsForReplayWithDeadline,
    normalizeWorkspaceCapabilityDiagnosticsRecoveryResult,
    commitWorkspaceCapabilityDiagnosticsRecovery,
    createWorkspaceCapabilityDiagnosticsRecoveryCoordinator,
    normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult,
    createWorkspaceCapabilityDiagnosticsJointRecoveryCoordinator,
    createWorkspaceCapabilityDiagnosticsJointRecoveryHandler,
    createWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryCoordinator,
    normalizeWorkspaceCapabilityRuntimeRegistryEvents,
    readWorkspaceCapabilityRuntimeRegistryEventsForReplay,
    readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithSignal,
    readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithDeadline,
    commitWorkspaceCapabilityRuntimeRegistryReplay,
    commitWorkspaceCapabilityRuntimeRegistryRecovery,
    recoverWorkspaceCapabilityRuntimeRegistry,
    normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult,
    recoverWorkspaceCapabilityRuntimeRegistrySafe,
    createWorkspaceCapabilityRuntimeRegistryRecoveryCoordinator,
};
