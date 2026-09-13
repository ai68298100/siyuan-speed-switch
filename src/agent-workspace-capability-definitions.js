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
const WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION = 1;
const WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION = 1;
const MAX_RUNTIME_SESSIONS = 8;

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
        status() { return Object.freeze({size: queue.length, maxItems: max, cursor: nextSequence - 1, disposed}); },
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

function recoverWorkspaceCapabilityRuntimeSafe(queue, cursor = 0, snapshot = null, limit = 16, signal) {
    return normalizeWorkspaceCapabilityRuntimeRecoveryResult(recoverWorkspaceCapabilityRuntimeWithSignal(queue, cursor, snapshot, limit, signal));
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
        snapshot() {
            const queueStatus = queue && typeof queue.status === "function" ? queue.status() : {size: 0, maxItems: 0, cursor: lastCursor, disposed: true};
            return Object.freeze({coordinator: Object.freeze({lastCursor, commits, disposed}), queue: queueStatus});
        },
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

function createWorkspaceCapabilityRuntimeSession(maxItems = 16) {
    const queue = createWorkspaceCapabilityEventQueue(maxItems);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    const sessionId = `ws-${Math.random().toString(36).slice(2, 10)}`;
    let disposed = false;
    return Object.freeze({
        sessionId,
        queue,
        coordinator,
        snapshot() { return Object.freeze({sessionId, disposed, runtime: coordinator.snapshot()}); },
        dispose() { if (disposed) return; disposed = true; coordinator.dispose(true); },
    });
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

function createWorkspaceCapabilityRuntimeSessionRegistry(maxSessions = MAX_RUNTIME_SESSIONS, options = {}) {
    const max = Math.min(MAX_RUNTIME_SESSIONS, Math.max(1, Math.trunc(Number(maxSessions) || MAX_RUNTIME_SESSIONS)));
    const sessions = new Map();
    const lastSeen = new Map();
    let disposed = false;
    const events = [];
    let nextEventSequence = 1;
    const emit = (type, sessionId) => {
        events.push({sequence: nextEventSequence++, type, sessionId});
        while (events.length > 8) events.shift();
        if (typeof options.onEvent === "function") {
            try { options.onEvent({type, sessionId}); } catch (_error) { /* isolate observer */ }
        }
    };
    return Object.freeze({
        create(maxItems = 16) {
            if (disposed) return null;
            const session = createWorkspaceCapabilityRuntimeSession(maxItems);
            sessions.set(session.sessionId, session);
            lastSeen.set(session.sessionId, Date.now());
            emit("created", session.sessionId);
            while (sessions.size > max) {
                const oldest = sessions.keys().next().value;
                sessions.get(oldest)?.dispose();
                sessions.delete(oldest);
                emit("evicted", oldest);
            }
            return session;
        },
        get(sessionId, now = Date.now()) {
            if (disposed || typeof sessionId !== "string") return null;
            const session = sessions.get(sessionId) || null;
            if (session) lastSeen.set(sessionId, Number.isFinite(Number(now)) ? Number(now) : Date.now());
            return session;
        },
        remove(sessionId) {
            const session = this.get(sessionId);
            if (!session) return false;
            session.dispose();
            sessions.delete(sessionId);
            lastSeen.delete(sessionId);
            emit("removed", sessionId);
            return true;
        },
        prune() {
            let removed = 0;
            for (const [sessionId, session] of sessions) {
                if (session.snapshot().disposed) {
                    session.dispose();
                    sessions.delete(sessionId);
                    lastSeen.delete(sessionId);
                    removed += 1;
                    emit("pruned", sessionId);
                }
            }
            return removed;
        },
        pruneIdle(now = Date.now(), maxIdleMs = 30 * 60 * 1000) {
            const current = Number(now);
            const idle = Number(maxIdleMs);
            if (!Number.isFinite(current) || !Number.isFinite(idle) || idle < 1000) return 0;
            let removed = 0;
            for (const [sessionId, session] of sessions) {
                if (!session.snapshot().disposed && current - (lastSeen.get(sessionId) || current) >= idle) {
                    session.dispose();
                    sessions.delete(sessionId);
                    lastSeen.delete(sessionId);
                    emit("idle", sessionId);
                    removed += 1;
                }
            }
            return removed;
        },
        size() { return sessions.size; },
        status() { return Object.freeze({size: sessions.size, maxSessions: max, disposed}); },
        events(limit = 8) { return events.slice(-Math.min(8, Math.max(0, Math.trunc(Number(limit) || 8)))).map(({type, sessionId}) => ({type, sessionId})); },
        eventCursor() { return nextEventSequence - 1; },
        eventsSince(cursor = 0, limit = 8) {
            const from = Math.max(0, Math.trunc(Number(cursor) || 0));
            const count = Math.min(8, Math.max(0, Math.trunc(Number(limit) || 8)));
            const first = events[0]?.sequence || nextEventSequence;
            return {cursor: nextEventSequence - 1, truncated: from < first - 1, events: events.filter((event) => event.sequence > from).slice(0, count).map((event) => ({sequence: event.sequence, type: event.type, sessionId: event.sessionId}))};
        },
        acknowledgeEvents(cursor = 0) {
            const upto = Math.max(0, Math.trunc(Number(cursor) || 0));
            let removed = 0;
            while (events.length && events[0].sequence <= upto) { events.shift(); removed += 1; }
            return removed;
        },
        snapshot() {
            return Object.freeze({
                size: sessions.size,
                maxSessions: max,
                disposed,
                sessions: [...sessions.values()].slice(0, max).map((session) => ({
                    sessionId: session.sessionId,
                    disposed: session.snapshot().disposed,
                    runtime: session.snapshot().runtime,
                })),
            });
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            sessions.forEach((session) => session.dispose());
            sessions.clear();
            lastSeen.clear();
            events.length = 0;
        },
    });
}

function normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(value) {
    const source = value && typeof value === "object" ? value : {};
    const sessions = Array.isArray(source.sessions) ? source.sessions.slice(0, MAX_RUNTIME_SESSIONS).map((item) => {
        const sessionId = typeof item?.sessionId === "string" && /^ws-[a-z0-9]{8}$/.test(item.sessionId) ? item.sessionId : "";
        return {sessionId, disposed: item?.disposed === true, runtime: item?.runtime && typeof item.runtime === "object" ? item.runtime : null};
    }).filter((item) => item.sessionId) : [];
    return Object.freeze({size: Math.min(MAX_RUNTIME_SESSIONS, Math.max(0, Math.trunc(Number(source.size) || sessions.length))), maxSessions: Math.min(MAX_RUNTIME_SESSIONS, Math.max(0, Math.trunc(Number(source.maxSessions) || MAX_RUNTIME_SESSIONS))), disposed: source.disposed === true, sessions});
}

function buildWorkspaceCapabilityRuntimeSessionRegistrySnapshot(registry) {
    const source = registry && typeof registry.snapshot === "function" ? registry.snapshot() : {};
    const normalized = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(source);
    return Object.freeze({...normalized, version: WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION});
}

function isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible(value) {
    if (!value || typeof value !== "object") return false;
    return value.version === undefined || value.version === WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION;
}

function validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot(value) {
    if (!value || typeof value !== "object") return {ok: false, reason: "invalid_snapshot"};
    if (!isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible(value)) return {ok: false, reason: "unsupported_version"};
    const normalized = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(value);
    if (normalized.maxSessions < 1 || normalized.size > normalized.maxSessions || normalized.sessions.length > normalized.maxSessions) return {ok: false, reason: "capacity_overflow"};
    const ids = normalized.sessions.map((session) => session.sessionId);
    if (new Set(ids).size !== ids.length) return {ok: false, reason: "duplicate_session"};
    if (normalized.size !== normalized.sessions.length) return {ok: false, reason: "size_mismatch"};
    if (normalized.disposed && normalized.sessions.length !== 0) return {ok: false, reason: "dispose_mismatch"};
    return {ok: true, maxSessions: normalized.maxSessions, size: normalized.size};
}

function normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff(events) {
    const allowed = ["created", "removed", "disposed", "capacity"];
    return (Array.isArray(events) ? events : []).slice(0, 8).map((event) => {
        const type = allowed.includes(event?.type) ? event.type : "";
        const sessionId = typeof event?.sessionId === "string" && /^ws-[a-z0-9]{8}$/.test(event.sessionId) ? event.sessionId : "";
        const size = Math.max(0, Math.min(MAX_RUNTIME_SESSIONS, Math.trunc(Number(event?.size) || 0)));
        const maxSessions = Math.max(0, Math.min(MAX_RUNTIME_SESSIONS, Math.trunc(Number(event?.maxSessions) || 0)));
        if ((type === "created" || type === "removed" || type === "disposed") && !sessionId) return null;
        if (type === "capacity" && maxSessions < 1) return null;
        return type === "capacity" ? {type, size, maxSessions} : {type, sessionId};
    }).filter(Boolean);
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
    recoverWorkspaceCapabilityRuntimeSafe,
    createWorkspaceCapabilityRecoveryCoordinator,
    createWorkspaceCapabilityRuntimeSession,
    WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION,
    WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION,
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
