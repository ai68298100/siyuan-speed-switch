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
