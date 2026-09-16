"use strict";

// v0.17 阶段 1（D-220）：workspace 运行时基础设施——事件队列、恢复协调器、
// 执行会话、session registry、registry diff 队列与只读 diagnostics 处理器。
// 全部为纯内存/纯函数实现（无宿主、无 I/O），自 agent-workspace-capability-definitions.js
// 机械搬移（逐字节一致）；该文件改为从这里 require 并 re-export，既有契约测试不变。
// 生产入口仅引本模块 + agent-workspace-diagnostics 包装器，
// 不把未启用的 plan/execute definitions 矩阵拖进 bundle。

const WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS = Object.freeze({
    localRead: true,
    localWrite: false,
    dataEgress: false,
    externalCost: false,
});

const WORKSPACE_RUNTIME_SNAPSHOT_VERSION = 1;

const WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION = 1;

const MAX_RUNTIME_SESSIONS = 8;

const WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC = Object.freeze({
    name: "workspace-runtime-registry-diagnostics",
    title: "Workspace runtime registry diagnostics",
    description: "Read-only bounded registry/session lifecycle counters; never returns document content or host exceptions.",
    inputSchema: Object.freeze({type: "object", properties: {}, additionalProperties: false}),
    outputSchema: Object.freeze({
        type: "object",
        properties: {
            summary: Object.freeze({type: "object", properties: {ok: {type: "boolean"}, reason: {type: "string", enum: ["ready", "invalid_snapshot", "registry_unavailable"]}, size: {type: "integer", minimum: 0, maximum: 8}, maxSessions: {type: "integer", minimum: 0, maximum: 8}, active: {type: "integer", minimum: 0, maximum: 8}, disposed: {type: "integer", minimum: 0, maximum: 8}, capacityAvailable: {type: "integer", minimum: 0, maximum: 8}}, required: ["ok", "reason", "size", "maxSessions", "active", "disposed", "capacityAvailable"], additionalProperties: false}),
            registry: Object.freeze({type: "object", properties: {size: {type: "integer", minimum: 0, maximum: 8}, maxSessions: {type: "integer", minimum: 0, maximum: 8}, disposed: {type: "boolean"}}, required: ["size", "maxSessions", "disposed"], additionalProperties: false}),
            diffQueue: Object.freeze({type: "object", properties: {size: {type: "integer", minimum: 0, maximum: 8}, maxItems: {type: "integer", minimum: 0, maximum: 8}, cursor: {type: "integer", minimum: 0, maximum: 2147483647}, disposed: {type: "boolean"}}, required: ["size", "maxItems", "cursor", "disposed"], additionalProperties: false}),
            diffCoordinator: Object.freeze({type: "object", properties: {lastCursor: {type: "integer", minimum: 0, maximum: 2147483647}, commits: {type: "integer", minimum: 0, maximum: 32}, disposed: {type: "boolean"}}, required: ["lastCursor", "commits", "disposed"], additionalProperties: false}),
        },
        required: ["summary", "registry", "diffQueue", "diffCoordinator"],
        additionalProperties: false,
    }),
});

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

// T-164：两次 runtime 快照间的状态转移 diff。输出有界布尔值与计划数量增量（±32 钳制），
// 不携带原始快照——消费方据此决定是否通知 UI/诊断，而不是回放完整状态。
function diffWorkspaceCapabilityRuntimeSnapshots(before, after) {
    const beforeSnapshot = normalizeWorkspaceCapabilityRuntimeSnapshot(before);
    const afterSnapshot = normalizeWorkspaceCapabilityRuntimeSnapshot(after);
    const hostChanged = beforeSnapshot.lifecycle.host.available !== afterSnapshot.lifecycle.host.available
        || beforeSnapshot.lifecycle.host.reason !== afterSnapshot.lifecycle.host.reason;
    const registrationChanged = beforeSnapshot.lifecycle.registration.registered !== afterSnapshot.lifecycle.registration.registered
        || beforeSnapshot.lifecycle.registration.failed !== afterSnapshot.lifecycle.registration.failed;
    const unmanagedChanged = beforeSnapshot.lifecycle.registration.unmanaged !== afterSnapshot.lifecycle.registration.unmanaged;
    const disposedChanged = beforeSnapshot.lifecycle.registration.disposed !== afterSnapshot.lifecycle.registration.disposed
        || beforeSnapshot.bridge.disposed !== afterSnapshot.bridge.disposed;
    const planDelta = Math.max(-32, Math.min(32, afterSnapshot.bridge.planCount - beforeSnapshot.bridge.planCount));
    return Object.freeze({hostChanged, registrationChanged, unmanagedChanged, disposedChanged, planDelta});
}

// T-165：把 diff 转换为 UI/诊断可消费的固定事件——最多五类（host/registration/unmanaged/
// plans/disposed），每类最多一条，plans 携带 ±32 钳制的增量；无变化输出空数组。
function buildWorkspaceCapabilityRuntimeEvents(diff) {
    const source = diff && typeof diff === "object" ? diff : {};
    const events = [];
    if (source.hostChanged === true) events.push({type: "host"});
    if (source.registrationChanged === true) events.push({type: "registration"});
    if (source.unmanagedChanged === true) events.push({type: "unmanaged"});
    const delta = Math.max(-32, Math.min(32, Math.trunc(Number(source.planDelta) || 0)));
    if (delta !== 0) events.push({type: "plans", delta});
    if (source.disposedChanged === true) events.push({type: "disposed"});
    return events;
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

// T-169：把 snapshot diff 直接写入有界事件队列——统一事件归一化与游标语义。
// 无效队列（缺 push/status）或已 dispose 的队列返回 0；无变化（空事件）也返回 0。
function enqueueWorkspaceCapabilityRuntimeDiff(queue, before, after) {
    if (!queue || typeof queue.push !== "function" || typeof queue.status !== "function") return 0;
    if (queue.status().disposed === true) return 0;
    const diff = diffWorkspaceCapabilityRuntimeSnapshots(before, after);
    const events = buildWorkspaceCapabilityRuntimeEvents(diff);
    if (events.length === 0) return 0;
    return queue.push(events);
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

function commitWorkspaceCapabilityRuntimeRecovery(queue, recovery) {
    if (!queue || typeof queue.acknowledge !== "function" || !recovery || recovery.ok !== true) return 0;
    if (recovery.mode !== "events" && recovery.mode !== "snapshot") return 0;
    return queue.acknowledge(recovery.cursor);
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

function buildWorkspaceCapabilityRuntimeSessionRegistrySummary(value) {
    const snapshot = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(value);
    const validation = validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot(value);
    const active = snapshot.sessions.filter((session) => !session.disposed).length;
    const disposedSessions = snapshot.sessions.length - active;
    return Object.freeze({
        ok: validation.ok === true,
        reason: validation.ok === true ? "ready" : validation.reason,
        size: snapshot.size,
        maxSessions: snapshot.maxSessions,
        active,
        disposed: disposedSessions,
        capacityAvailable: Math.max(0, snapshot.maxSessions - snapshot.size),
    });
}

function createWorkspaceCapabilityRuntimeRegistryDiffQueue(maxItems = 8) {
    const max = Math.min(8, Math.max(1, Math.trunc(Number(maxItems) || 8)));
    const queue = [];
    let disposed = false;
    let nextSequence = 1;
    return Object.freeze({
        push(events) {
            if (disposed) return 0;
            const normalized = normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff(events);
            normalized.forEach((event) => queue.push({sequence: nextSequence++, event}));
            while (queue.length > max) queue.shift();
            return normalized.length;
        },
        readSince(cursor = 0, limit = max) {
            const from = Math.max(0, Math.trunc(Number(cursor) || 0));
            const count = Math.min(max, Math.max(0, Math.trunc(Number(limit) || max)));
            const first = queue[0]?.sequence || nextSequence;
            return {cursor: nextSequence - 1, truncated: from < first - 1, events: queue.filter((entry) => entry.sequence > from).slice(0, count).map((entry) => ({sequence: entry.sequence, event: {...entry.event}}))};
        },
        acknowledge(cursor = 0) {
            const upto = Math.max(0, Math.trunc(Number(cursor) || 0));
            let removed = 0;
            while (queue.length && queue[0].sequence <= upto) { queue.shift(); removed += 1; }
            return removed;
        },
        size() { return queue.length; },
        status() { return Object.freeze({size: queue.length, maxItems: max, cursor: nextSequence - 1, disposed}); },
        dispose() { disposed = true; queue.length = 0; },
    });
}

function readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay(queue, cursor = 0, limit = 8) {
    if (!queue || typeof queue.readSince !== "function") return {ok: false, reason: "queue_unavailable", cursor: 0, events: []};
    let batch;
    try { batch = queue.readSince(cursor, limit); } catch (_error) { return {ok: false, reason: "queue_unavailable", cursor: 0, events: []}; }
    if (!batch || typeof batch !== "object") return {ok: false, reason: "queue_unavailable", cursor: 0, events: []};
    if (batch.truncated === true) return {ok: false, reason: "snapshot_required", cursor: Number(batch.cursor) || 0, events: []};
    return {ok: true, reason: "ready", cursor: Number(batch.cursor) || 0, events: Array.isArray(batch.events) ? batch.events.slice(0, 8).map((entry) => ({sequence: Math.max(0, Math.trunc(Number(entry?.sequence) || 0)), event: normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff([entry?.event])[0]})).filter((entry) => entry.event) : []};
}

function readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal(queue, cursor = 0, limit = 8, signal) {
    const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
    if (signal?.aborted) return {ok: false, reason: "cancelled", cursor: safeCursor, events: []};
    const replay = readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay(queue, safeCursor, limit);
    if (signal?.aborted) return {ok: false, reason: "cancelled", cursor: replay.cursor, events: []};
    return replay;
}

function readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithDeadline(queue, cursor = 0, limit = 8, deadline, now = Date.now) {
    const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
    const expiresAt = Number(deadline);
    const current = typeof now === "function" ? Number(now()) : Number(now);
    if (Number.isFinite(expiresAt) && Number.isFinite(current) && current >= expiresAt) return {ok: false, reason: "timeout", cursor: safeCursor, events: []};
    const replay = readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay(queue, safeCursor, limit);
    const after = typeof now === "function" ? Number(now()) : Number(now);
    if (Number.isFinite(expiresAt) && Number.isFinite(after) && after >= expiresAt) return {ok: false, reason: "timeout", cursor: replay.cursor, events: []};
    return replay;
}

function recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, cursor = 0, limit = 8, snapshot = null) {
    const replay = readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay(queue, cursor, limit);
    if (replay.ok) return {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null};
    if (replay.reason !== "snapshot_required") return {ok: false, mode: "unavailable", reason: replay.reason, cursor: replay.cursor, events: [], snapshot: null};
    const validation = validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot(snapshot);
    if (!validation.ok) return {ok: false, mode: "invalid_snapshot", reason: validation.reason, cursor: replay.cursor, events: [], snapshot: null};
    return {ok: true, mode: "snapshot", reason: "snapshot_required", cursor: replay.cursor, events: [], snapshot: normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(snapshot)};
}

function normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult(value) {
    const source = value && typeof value === "object" ? value : {};
    const modes = ["events", "snapshot", "unavailable", "invalid_snapshot", "cancelled", "timeout"];
    const mode = modes.includes(source.mode) ? source.mode : "unavailable";
    const ok = source.ok === true && (mode === "events" || mode === "snapshot");
    const reason = ["ready", "snapshot_required", "queue_unavailable", "invalid_snapshot", "cancelled", "timeout", "diff_coordinator_disposed"].includes(source.reason) ? source.reason : (ok ? "ready" : mode);
    return Object.freeze({ok, mode, reason, cursor: Math.max(0, Math.min(0x7fffffff, Math.trunc(Number(source.cursor) || 0))), events: mode === "events" ? (Array.isArray(source.events) ? source.events.slice(0, 8).map((entry) => ({sequence: Math.max(0, Math.trunc(Number(entry?.sequence) || 0)), event: normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff([entry?.event])[0]})).filter((entry) => entry.event) : []) : [], snapshot: mode === "snapshot" && source.snapshot ? normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot(source.snapshot) : null});
}

function commitWorkspaceCapabilityRuntimeSessionRegistryDiffRecovery(queue, recovery) {
    if (!queue || typeof queue.acknowledge !== "function" || !recovery || recovery.ok !== true) return 0;
    if (recovery.mode !== "events" && recovery.mode !== "snapshot") return 0;
    return queue.acknowledge(recovery.cursor);
}

function createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator(queue) {
    let lastCursor = 0;
    let commits = 0;
    let disposed = false;
    const unavailable = () => ({ok: false, mode: "unavailable", reason: "diff_coordinator_disposed", cursor: lastCursor, events: [], snapshot: null});
    return Object.freeze({
        recover(cursor = 0, limit = 8, snapshot = null) {
            if (disposed) return unavailable();
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            return recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, requested, limit, snapshot);
        },
        commit(recovery) {
            if (disposed || !recovery || recovery.ok !== true) return 0;
            const cursor = Math.max(0, Math.trunc(Number(recovery.cursor) || 0));
            if (cursor <= lastCursor || (recovery.mode !== "events" && recovery.mode !== "snapshot")) return 0;
            const acknowledged = commitWorkspaceCapabilityRuntimeSessionRegistryDiffRecovery(queue, recovery);
            if (acknowledged > 0 || recovery.mode === "snapshot") { lastCursor = cursor; commits = Math.min(32, commits + 1); }
            return acknowledged;
        },
        recoverAndCommit(cursor = 0, limit = 8, snapshot = null) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const recovery = this.recover(cursor, limit, snapshot);
            return Object.freeze({...recovery, acknowledged: this.commit(recovery)});
        },
        recoverAndCommitWithSignal(cursor = 0, limit = 8, snapshot = null, signal) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            const replay = readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal(queue, requested, limit, signal);
            const recovery = replay.ok
                ? {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null}
                : replay.reason === "snapshot_required" && !signal?.aborted
                    ? recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, requested, limit, snapshot)
                    : {...replay, mode: replay.reason === "cancelled" ? "cancelled" : "unavailable"};
            return Object.freeze({...normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult(recovery), acknowledged: this.commit(recovery)});
        },
        recoverAndCommitWithDeadline(cursor = 0, limit = 8, snapshot = null, deadline, now = Date.now) {
            if (disposed) return {...unavailable(), acknowledged: 0};
            const requested = Math.max(lastCursor, Math.max(0, Math.trunc(Number(cursor) || 0)));
            const replay = readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithDeadline(queue, requested, limit, deadline, now);
            const recovery = replay.ok
                ? {ok: true, mode: "events", reason: "ready", cursor: replay.cursor, events: replay.events, snapshot: null}
                : replay.reason === "snapshot_required"
                    ? recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, requested, limit, snapshot)
                    : {...replay, mode: replay.reason === "timeout" ? "timeout" : "unavailable"};
            const result = normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult(recovery);
            const after = typeof now === "function" ? Number(now()) : Number(now);
            if (Number.isFinite(Number(deadline)) && Number.isFinite(after) && after >= Number(deadline)) return Object.freeze({...normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult({ok: false, mode: "timeout", reason: "timeout", cursor: result.cursor}), acknowledged: 0});
            return Object.freeze({...result, acknowledged: this.commit(result)});
        },
        status() { return Object.freeze({lastCursor, commits, disposed}); },
        snapshot() {
            const queueStatus = queue && typeof queue.status === "function" ? queue.status() : {size: 0, maxItems: 0, cursor: lastCursor, disposed: true};
            return Object.freeze({coordinator: Object.freeze({lastCursor, commits, disposed}), queue: queueStatus});
        },
        dispose() { disposed = true; },
    });
}


function buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(registry, diffQueue = null, diffCoordinator = null) {
    const snapshot = registry && typeof registry.snapshot === "function" ? buildWorkspaceCapabilityRuntimeSessionRegistrySnapshot(registry) : null;
    const summary = snapshot ? buildWorkspaceCapabilityRuntimeSessionRegistrySummary(snapshot) : {ok: false, reason: "registry_unavailable", size: 0, maxSessions: 0, active: 0, disposed: 0, capacityAvailable: 0};
    const registryStatus = registry && typeof registry.status === "function" ? registry.status() : {size: 0, maxSessions: 0, disposed: true};
    const queueStatus = diffQueue && typeof diffQueue.status === "function" ? diffQueue.status() : {size: 0, maxItems: 0, cursor: 0, disposed: true};
    const coordinatorStatus = diffCoordinator && typeof diffCoordinator.status === "function" ? diffCoordinator.status() : {lastCursor: 0, commits: 0, disposed: true};
    return Object.freeze({summary, registry: Object.freeze({...registryStatus}), diffQueue: Object.freeze({...queueStatus}), diffCoordinator: Object.freeze({...coordinatorStatus})});
}

function normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(value) {
    const source = value && typeof value === "object" ? value : {};
    const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
    const bounded = (input, max) => Math.max(0, Math.min(max, Math.trunc(Number(input) || 0)));
    return Object.freeze({
        summary: Object.freeze({ok: summary.ok === true, reason: ["ready", "invalid_snapshot", "registry_unavailable"].includes(summary.reason) ? summary.reason : "registry_unavailable", size: bounded(summary.size, 8), maxSessions: bounded(summary.maxSessions, 8), active: bounded(summary.active, 8), disposed: bounded(summary.disposed, 8), capacityAvailable: bounded(summary.capacityAvailable, 8)}),
        registry: Object.freeze({size: bounded(source.registry?.size, 8), maxSessions: bounded(source.registry?.maxSessions, 8), disposed: source.registry?.disposed === true}),
        diffQueue: Object.freeze({size: bounded(source.diffQueue?.size, 8), maxItems: bounded(source.diffQueue?.maxItems, 8), cursor: bounded(source.diffQueue?.cursor, 0x7fffffff), disposed: source.diffQueue?.disposed === true}),
        diffCoordinator: Object.freeze({lastCursor: bounded(source.diffCoordinator?.lastCursor, 0x7fffffff), commits: bounded(source.diffCoordinator?.commits, 32), disposed: source.diffCoordinator?.disposed === true}),
    });
}


function createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler(registry, diffQueue = null, diffCoordinator = null) {
    return function workspaceRuntimeRegistryDiagnosticsHandler(_input = {}) {
        try {
            return normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(registry, diffQueue, diffCoordinator));
        } catch (_error) {
            return normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(null);
        }
    };
}

module.exports = {
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
    diffWorkspaceCapabilityRuntimeSnapshots,
    buildWorkspaceCapabilityRuntimeEvents,
    enqueueWorkspaceCapabilityRuntimeDiff,
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
};

// diagnostics 定义专用校验：与 capability-definitions 的 canonical 分支语义等价
// （spec 身份、handler 形状、schema 形状、effects 与 canonical 一致），但不引用
// plan/execute bridge 常量，保证生产 bundle 不拖入未启用的执行链。
function validateWorkspaceRuntimeDiagnosticsDefinition(definition) {
    const spec = definition && definition.spec;
    if (spec !== WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC) return {ok: false, reason: "unknown_capability"};
    if (typeof definition.handler !== "function") return {ok: false, reason: "invalid_handler"};
    if (!spec.inputSchema || typeof spec.inputSchema !== "object" || !spec.outputSchema || typeof spec.outputSchema !== "object") return {ok: false, reason: "invalid_schema"};
    if (spec.inputSchema.type !== "object" || spec.outputSchema.type !== "object") return {ok: false, reason: "invalid_schema"};
    const effects = definition.effects;
    const canonical = WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS;
    if (!effects || typeof effects !== "object") return {ok: false, reason: "invalid_effects"};
    for (const key of ["localRead", "localWrite", "dataEgress", "externalCost"]) {
        if (effects[key] !== canonical[key]) return {ok: false, reason: "effects_mismatch"};
    }
    return {ok: true, name: spec.name};
}

module.exports.validateWorkspaceRuntimeDiagnosticsDefinition = validateWorkspaceRuntimeDiagnosticsDefinition;
