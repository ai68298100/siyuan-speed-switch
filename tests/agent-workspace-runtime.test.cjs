const test = require('node:test');
const assert = require('node:assert/strict');
const rt = require('../src/agent-workspace-runtime.js');

const {
    WORKSPACE_RUNTIME_SNAPSHOT_VERSION,
    isWorkspaceCapabilityRuntimeSnapshotCompatible,
    validateWorkspaceCapabilityRuntimeSnapshot,
    normalizeWorkspaceCapabilityRuntimeSnapshot,
    diffWorkspaceCapabilityRuntimeSnapshots,
    buildWorkspaceCapabilityRuntimeEvents,
    normalizeWorkspaceCapabilityRuntimeEvents,
    createWorkspaceCapabilityEventQueue,
    enqueueWorkspaceCapabilityRuntimeDiff,
    readWorkspaceCapabilityRuntimeEventsForReplay,
} = rt;

const snapshot = (overrides = {}) => {
    const base = {
        lifecycle: {
            host: {available: true, reason: "ready"},
            registration: {registered: 1, failed: 0, unmanaged: 0, disposed: false},
        },
        bridge: {planCount: 0, maxPlans: 8, disposed: false},
    };
    return JSON.parse(JSON.stringify(overrides === null ? base : {...base, ...overrides}));
};
const deep = (obj) => JSON.parse(JSON.stringify(obj));

// ---------- T-162 版本兼容门禁 ----------
test('runtime snapshot without version is compatible', () => {
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible(snapshot()), true);
});
test('runtime snapshot at version 1 is compatible', () => {
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible({...snapshot(), version: WORKSPACE_RUNTIME_SNAPSHOT_VERSION}), true);
});
test('runtime snapshot from an unknown future version is rejected', () => {
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible({...snapshot(), version: WORKSPACE_RUNTIME_SNAPSHOT_VERSION + 1}), false);
});
test('runtime compatibility rejects non-object input', () => {
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible(null), false);
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible("snapshot"), false);
});

// ---------- T-163 一致性校验 ----------
test('valid snapshot passes consistency validation', () => {
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot(snapshot()), {ok: true, version: 1});
});
test('registration overflow is rejected with a stable reason', () => {
    const broken = snapshot();
    broken.lifecycle.registration.registered = 2;
    broken.lifecycle.registration.failed = 1;
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot(broken), {ok: false, reason: "registration_overflow"});
});
test('plan overflow is rejected with a stable reason', () => {
    const broken = snapshot();
    broken.bridge.planCount = 5;
    broken.bridge.maxPlans = 2;
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot(broken), {ok: false, reason: "plan_overflow"});
});
test('dispose mismatch between lifecycle and bridge is rejected', () => {
    const broken = snapshot();
    broken.lifecycle.registration.disposed = true;
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot(broken), {ok: false, reason: "dispose_mismatch"});
});
test('unknown future version is rejected before shape checks', () => {
    const broken = snapshot();
    broken.version = 999;
    broken.bridge.planCount = 99;
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot(broken), {ok: false, reason: "unsupported_version"});
});
test('normalization clamps counters into bounded ranges', () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeSnapshot(snapshot());
    assert.equal(normalized.lifecycle.registration.registered, 1);
    assert.equal(normalized.bridge.planCount, 0);
});

// ---------- T-164 状态转移 diff ----------
test('diff reports host change only', () => {
    const before = snapshot();
    const after = snapshot();
    after.lifecycle.host.available = false;
    after.lifecycle.host.reason = "unavailable";
    const diff = diffWorkspaceCapabilityRuntimeSnapshots(before, after);
    assert.deepEqual(diff, {hostChanged: true, registrationChanged: false, unmanagedChanged: false, disposedChanged: false, planDelta: 0});
});
test('diff reports plan delta without raw snapshots', () => {
    const before = snapshot();
    const after = snapshot();
    after.bridge.planCount = 2;
    const diff = diffWorkspaceCapabilityRuntimeSnapshots(before, after);
    assert.equal(diff.planDelta, 2);
    assert.ok(!("before" in diff) && !("after" in diff), 'diff 不得携带原始快照');
});
test('diff clamps plan delta into ±32', () => {
    const before = snapshot();
    const after = snapshot();
    after.bridge.planCount = 32;
    after.bridge.maxPlans = 32;
    assert.equal(diffWorkspaceCapabilityRuntimeSnapshots(before, after).planDelta, 32);
    const reverse = diffWorkspaceCapabilityRuntimeSnapshots(after, before);
    assert.equal(reverse.planDelta, -32);
});
test('diff of identical snapshots is all-zero', () => {
    const snap = snapshot();
    assert.deepEqual(diffWorkspaceCapabilityRuntimeSnapshots(snap, snap), {hostChanged: false, registrationChanged: false, unmanagedChanged: false, disposedChanged: false, planDelta: 0});
});
test('diff reports dispose state changes', () => {
    const before = snapshot();
    const after = snapshot();
    after.bridge.disposed = true;
    after.lifecycle.registration.disposed = true;
    assert.equal(diffWorkspaceCapabilityRuntimeSnapshots(before, after).disposedChanged, true);
});

// ---------- T-165 状态事件 ----------
test('diff converts into at most five event kinds', () => {
    const before = snapshot();
    const after = snapshot();
    after.lifecycle.host.available = false;
    after.lifecycle.registration.registered = 2;
    after.lifecycle.registration.unmanaged = 1;
    after.bridge.planCount = 3;
    after.bridge.disposed = true;
    after.lifecycle.registration.disposed = true;
    const events = buildWorkspaceCapabilityRuntimeEvents(diffWorkspaceCapabilityRuntimeSnapshots(before, after));
    assert.equal(events.length, 5);
    assert.deepEqual(events.map((e) => e.type), ["host", "registration", "unmanaged", "plans", "disposed"]);
});
test('plans event carries a bounded delta and zero delta emits nothing', () => {
    const before = snapshot();
    const after = snapshot();
    after.bridge.planCount = 2;
    const events = buildWorkspaceCapabilityRuntimeEvents(diffWorkspaceCapabilityRuntimeSnapshots(before, after));
    assert.deepEqual(events, [{type: "plans", delta: 2}]);
    assert.deepEqual(buildWorkspaceCapabilityRuntimeEvents({planDelta: 0}), []);
});
test('event builder tolerates missing or hostile diff input', () => {
    assert.deepEqual(buildWorkspaceCapabilityRuntimeEvents(null), []);
    assert.deepEqual(buildWorkspaceCapabilityRuntimeEvents("diff"), []);
});

// ---------- T-166 事件归一化 ----------
test('event normalization dedupes by type and fixes order', () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeEvents([
        {type: "plans", delta: 1},
        {type: "disposed"},
        {type: "host"},
        {type: "plans", delta: 2},
        {type: "registration"},
    ]);
    assert.deepEqual(normalized.map((e) => e.type), ["host", "registration", "plans", "disposed"]);
    assert.equal(normalized.find((e) => e.type === "plans").delta, 1);
});
test('event normalization clamps plan delta and drops zero delta', () => {
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeEvents([{type: "plans", delta: 99}]), [{type: "plans", delta: 32}]);
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeEvents([{type: "plans", delta: 0}]), []);
});
test('event normalization drops unknown event types', () => {
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeEvents([{type: "mystery"}]), []);
});

// ---------- T-167 事件队列 ----------
test('event queue is bounded at max items', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    for (let i = 0; i < 20; i += 1) queue.push([{type: "plans", delta: 1}]);
    assert.equal(queue.size(), 16);
    assert.equal(queue.status().maxItems, 16);
});
test('event queue stops accepting after dispose', () => {
    const queue = createWorkspaceCapabilityEventQueue();
    queue.dispose();
    assert.equal(queue.push([{type: "host"}]), 0);
    assert.equal(queue.status().disposed, true);
});
test('event queue clamps invalid max items to a positive bound', () => {
    assert.equal(createWorkspaceCapabilityEventQueue(0).status().maxItems, 16);
    assert.ok(createWorkspaceCapabilityEventQueue(-3).status().maxItems >= 1);
});

// ---------- T-168 事件游标 ----------
test('readSince returns monotonic sequences and acknowledge consumes them', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    queue.push([{type: "registration"}]);
    queue.push([{type: "plans", delta: 1}]);
    const batch = queue.readSince(0, 16);
    assert.equal(batch.events.length, 3);
    assert.deepEqual(batch.events.map((e) => e.sequence), [1, 2, 3]);
    assert.equal(batch.truncated, false);
    assert.equal(queue.acknowledge(2), 2);
    assert.equal(queue.size(), 1);
    const rest = queue.readSince(2, 16);
    assert.deepEqual(rest.events.map((e) => e.sequence), [3]);
});
test('readSince reports truncation when the cursor is too old', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    for (let i = 0; i < 20; i += 1) queue.push([{type: "plans", delta: 1}]);
    const batch = queue.readSince(1, 16);
    assert.equal(batch.truncated, true);
});
test('acknowledge with a future cursor removes nothing extra', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    assert.equal(queue.acknowledge(999), 1);
    assert.equal(queue.size(), 0);
});

// ---------- T-169 diff 入队桥接 ----------
test('enqueue writes diff events into the bounded queue', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    const before = snapshot();
    const after = snapshot();
    after.bridge.planCount = 2;
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(queue, before, after), 1);
    assert.deepEqual(queue.read(), [{type: "plans", delta: 2}]);
});
test('enqueue returns zero when nothing changed', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    const snap = snapshot();
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(queue, snap, snap), 0);
    assert.equal(queue.size(), 0);
});
test('enqueue tolerates invalid queues', () => {
    const snap = snapshot();
    const after = snapshot();
    after.bridge.planCount = 2;
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(null, snap, after), 0);
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff({}, snap, after), 0);
    const disposed = createWorkspaceCapabilityEventQueue(16);
    disposed.dispose();
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(disposed, snap, after), 0);
});

// ---------- T-170 事件安全回放 ----------
test('replay returns a ready batch for a fresh cursor', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const replay = readWorkspaceCapabilityRuntimeEventsForReplay(queue, 0, 16);
    assert.deepEqual(replay, {ok: true, reason: "ready", cursor: 1, events: [{sequence: 1, event: {type: "host", changed: true}}]});
});
test('replay demands a full snapshot when the cursor overflowed the queue', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    for (let i = 0; i < 20; i += 1) queue.push([{type: "plans", delta: 1}]);
    const replay = readWorkspaceCapabilityRuntimeEventsForReplay(queue, 1, 16);
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "snapshot_required");
});
test('replay rejects an unavailable queue', () => {
    assert.deepEqual(readWorkspaceCapabilityRuntimeEventsForReplay(null, 0, 16), {ok: false, reason: "queue_unavailable", cursor: 0, events: []});
});

// ---------- T-171/T-172/T-173：恢复流程、确认与原子门面 ----------
const {
    recoverWorkspaceCapabilityRuntime,
    commitWorkspaceCapabilityRuntimeRecovery,
    recoverAndCommitWorkspaceCapabilityRuntime,
    recoverWorkspaceCapabilityRuntimeWithSignal,
    recoverWorkspaceCapabilityRuntimeSafe,
    createWorkspaceCapabilityRecoveryCoordinator,
} = rt;
test('recovery returns events mode for a fresh cursor', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const recovery = recoverWorkspaceCapabilityRuntime(queue, 0, null, 16);
    assert.equal(recovery.ok, true);
    assert.equal(recovery.mode, "events");
    assert.equal(recovery.cursor, 1);
});
test('recovery returns snapshot mode with a compatible snapshot', () => { const queue = createWorkspaceCapabilityEventQueue(16); for (let i = 0; i < 20; i += 1) queue.push([{type: 'plans', delta: 1}]); const recovery = recoverWorkspaceCapabilityRuntime(queue, 1, snapshot(), 16); assert.equal(recovery.ok, true); assert.equal(recovery.mode, 'snapshot'); });
test('recovery returns unavailable without a compatible snapshot', () => { const queue = createWorkspaceCapabilityEventQueue(16); for (let i = 0; i < 20; i += 1) queue.push([{type: 'plans', delta: 1}]); const recovery = recoverWorkspaceCapabilityRuntime(queue, 1, null, 16); assert.equal(recovery.ok, false); assert.equal(recovery.mode, 'unavailable'); });
test('commit only acknowledges successful recovery modes', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const okRecovery = recoverWorkspaceCapabilityRuntime(queue, 0, null, 16);
    assert.equal(commitWorkspaceCapabilityRuntimeRecovery(queue, okRecovery), 1);
    const failedRecovery = {ok: false, mode: "unavailable", cursor: 99};
    assert.equal(commitWorkspaceCapabilityRuntimeRecovery(queue, failedRecovery), 0);
});
test('recoverAndCommit combines recovery and acknowledgement atomically', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const result = recoverAndCommitWorkspaceCapabilityRuntime(queue, 0, null, 16);
    assert.equal(result.ok, true);
    assert.equal(result.acknowledged, 1);
    assert.equal(queue.size(), 0);
});
test('recoverAndCommit keeps the queue on failed recovery', () => { const queue = createWorkspaceCapabilityEventQueue(16); for (let i = 0; i < 20; i += 1) queue.push([{type: 'plans', delta: 1}]); const result = recoverAndCommitWorkspaceCapabilityRuntime(queue, 1, null, 16); assert.equal(result.ok, false); assert.equal(result.acknowledged, 0); assert.equal(queue.size(), 16); });

// ---------- T-174/T-175/T-176：并发协调器与销毁态 ----------
test('coordinator rejects regressed acknowledgements', () => { const queue = createWorkspaceCapabilityEventQueue(16); queue.push([{type: 'host'}]); queue.push([{type: 'registration'}]); const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue); const first = coordinator.recoverAndCommit(0, null, 16); assert.equal(first.acknowledged, 2); assert.equal(coordinator.recoverAndCommit(0, null, 16).acknowledged, 0); assert.equal(coordinator.status().commits, 1); });
test('coordinator disposed state blocks recovery and commit', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    coordinator.dispose();
    const recovery = coordinator.recover(0, null, 16);
    assert.equal(recovery.reason, "coordinator_disposed");
    assert.equal(coordinator.commit({ok: true, mode: "events", cursor: 1}), 0);
    assert.equal(coordinator.status().disposed, true);
});
test('coordinator dispose is idempotent and keeps the shared queue by default', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    assert.equal(coordinator.dispose(), 0);
    assert.equal(coordinator.dispose(), 0);
    assert.equal(queue.size(), 1);
});
test('coordinator dispose(true) clears the bound queue for full unmounts', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    assert.equal(coordinator.dispose(true), 1);
    assert.equal(queue.size(), 0);
});

// ---------- T-177/T-180：取消边界与安全出口 ----------
test('cancelled signal returns a stable cancelled shape without touching the queue', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const signal = {aborted: true};
    const recovery = recoverWorkspaceCapabilityRuntimeWithSignal(queue, 0, null, 16, signal);
    assert.equal(recovery.ok, false);
    assert.equal(recovery.mode, "cancelled");
    assert.equal(recovery.reason, "cancelled");
    assert.equal(queue.size(), 1);
});
test('non-cancelled signal delegates to the normal recovery flow', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    queue.push([{type: "host"}]);
    const recovery = recoverWorkspaceCapabilityRuntimeWithSignal(queue, 0, null, 16, {aborted: false});
    assert.equal(recovery.ok, true);
});
test('safe recovery normalizes a cancelled signal into the same shape', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    const recovery = recoverWorkspaceCapabilityRuntimeSafe(queue, 0, null, 16, {aborted: true});
    assert.equal(recovery.ok, false);
    assert.equal(recovery.mode, "cancelled");
});
test('safe recovery exposes snapshot mode through the same exit', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    for (let i = 0; i < 20; i += 1) queue.push([{type: 'plans', delta: 1}]);
    const recovery = recoverWorkspaceCapabilityRuntimeSafe(queue, 1, snapshot(), 16, null);
    assert.equal(recovery.ok, true);
    assert.equal(recovery.mode, "snapshot");
});

// ---------- T-181~T-194：session facade、registry 与生命周期事件回放 ----------
const {
    createWorkspaceCapabilityRuntimeSession,
    createWorkspaceCapabilityRuntimeSessionRegistry,
    buildWorkspaceCapabilityRuntimeSessionSnapshot,
    normalizeWorkspaceCapabilityRuntimeSessionSnapshot,
    normalizeWorkspaceCapabilityRuntimeRegistryEvents,
    readWorkspaceCapabilityRuntimeRegistryEventsForReplay,
    commitWorkspaceCapabilityRuntimeRegistryReplay,
    recoverWorkspaceCapabilityRuntimeRegistry,
} = rt;
test('coordinator snapshot exposes bounded coordinator and queue state', () => {
    const queue = createWorkspaceCapabilityEventQueue(16);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    const snap = coordinator.snapshot();
    assert.deepEqual(snap, {coordinator: {lastCursor: 0, commits: 0, disposed: false}, queue: {size: 0, maxItems: 16, cursor: 0, disposed: false}});
});
test('runtime session facade shares queue and coordinator lifecycle', () => {
    const session = createWorkspaceCapabilityRuntimeSession(16);
    assert.match(session.sessionId, /^ws-[a-z0-9]{8}$/);
    session.queue.push([{type: "host"}]);
    session.dispose();
    assert.equal(session.snapshot().disposed, true);
    assert.equal(session.queue.size(), 0);
});
test('session snapshot is versioned and normalized', () => {
    const session = createWorkspaceCapabilityRuntimeSession(16);
    const snap = buildWorkspaceCapabilityRuntimeSessionSnapshot(session);
    assert.equal(snap.version, 1);
    assert.equal(snap.disposed, false);
    assert.equal(normalizeWorkspaceCapabilityRuntimeSessionSnapshot(snap).sessionId, snap.sessionId);
    session.dispose();
    assert.equal(buildWorkspaceCapabilityRuntimeSessionSnapshot(session).disposed, true);
});
test('session snapshot normalization rejects hostile ids', () => {
    assert.equal(normalizeWorkspaceCapabilityRuntimeSessionSnapshot({sessionId: "not-ws"}), null);
    assert.equal(normalizeWorkspaceCapabilityRuntimeSessionSnapshot({sessionId: "ws-UPPER"}), null);
    assert.equal(normalizeWorkspaceCapabilityRuntimeSessionSnapshot(null), null);
});
test('registry is bounded and evicts the oldest session', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    const first = registry.create(16);
    registry.create(16);
    registry.create(16);
    assert.equal(registry.size(), 2);
    assert.equal(registry.get(first.sessionId), null, "最老会话应被淘汰");
});
test('registry remove disposes and drops the session', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    const session = registry.create(16);
    assert.equal(registry.remove(session.sessionId), true);
    assert.equal(registry.get(session.sessionId), null);
    assert.equal(registry.remove(session.sessionId), false);
});
test('registry snapshot aggregates bounded session state', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    registry.create(16);
    const snap = registry.snapshot();
    assert.equal(snap.size, 1);
    assert.equal(snap.sessions.length, 1);
    assert.equal(snap.sessions[0].disposed, false);
});
test('registry prune recycles disposed sessions', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    const session = registry.create(16);
    session.dispose();
    assert.equal(registry.prune(), 1);
    assert.equal(registry.size(), 0);
});
test('registry pruneIdle recycles only long-idle sessions', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    const idle = registry.create(16);
    registry.create(16);
    const now = Date.now();
    assert.equal(registry.pruneIdle(now, 0), 0, "非法阈值不回收");
    assert.equal(registry.pruneIdle(now + 1800000, 1800000), 2, '两个会话同批超期，均应回收');
    assert.ok(idle.snapshot().disposed, '被回收会话应标记 disposed');
});
test('registry events are bounded and observed', () => {
    let observed = 0;
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8, {onEvent: () => { observed += 1; }});
    registry.create(16);
    registry.create(16);
    registry.create(16);
    assert.ok(observed >= 3, 'onEvent 观察器须收到生命周期事件');
    assert.ok(registry.events().length <= 8, '事件缓存最多 8 条');
});
test('registry event cursor supports incremental reads and acknowledgement', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    registry.create(16);
    registry.create(16);
    const batch = registry.eventsSince(0, 8);
    assert.equal(batch.events.length, 2);
    assert.equal(registry.acknowledgeEvents(batch.cursor), batch.events.length);
    assert.equal(registry.events().length, 0);
});
test('registry event normalization filters unknown types and ids', () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeRegistryEvents([
        {sequence: 1, type: "created", sessionId: "ws-abcd1234"},
        {sequence: 2, type: "mystery", sessionId: "ws-abcd1234"},
        {sequence: 3, type: "removed", sessionId: "evil"},
        {sequence: 0, type: "pruned", sessionId: "ws-abcd1234"},
    ]);
    assert.deepEqual(normalized, [{sequence: 1, type: "created", sessionId: "ws-abcd1234"}]);
});
test('registry replay returns ready for a fresh cursor', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    registry.create(16);
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, 0, 8);
    assert.equal(replay.ok, true);
    assert.equal(replay.reason, "ready");
    assert.ok(replay.events.length >= 1);
});
test('registry replay demands a snapshot when events overflowed', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    for (let i = 0; i < 12; i += 1) registry.create(16);
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, 1, 8);
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "snapshot_required");
});
test('registry replay commit only consumes ready results', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    registry.create(16);
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, 0, 8);
    assert.equal(commitWorkspaceCapabilityRuntimeRegistryReplay(registry, replay), replay.events.length);
    assert.equal(commitWorkspaceCapabilityRuntimeRegistryReplay(registry, {ok: false, reason: "snapshot_required"}), 0);
});
test('registry recovery falls back to the full snapshot on overflow', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    registry.create(16);
    const full = registry.snapshot();
    for (let i = 0; i < 12; i += 1) registry.create(16);
    const recovery = recoverWorkspaceCapabilityRuntimeRegistry(registry, 1, full, 8);
    assert.equal(recovery.ok, true);
    assert.equal(recovery.mode, "snapshot");
    assert.equal(recovery.snapshot.size, 1);
});
test('registry recovery stays unavailable without a snapshot', () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(8);
    for (let i = 0; i < 12; i += 1) registry.create(16);
    const recovery = recoverWorkspaceCapabilityRuntimeRegistry(registry, 1, null, 8);
    assert.equal(recovery.ok, false);
    assert.equal(recovery.mode, "unavailable");
});
