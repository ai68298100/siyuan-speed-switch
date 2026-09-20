const {readSourceText} = require("./source-scan.cjs");
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const a = require('../src/agent-readonly-audit.js');

const read = (name = 'demo') => ({name, effects: ['localRead'], devices: ['desktop', 'mobile']});

test('constants expose bounded audit enums', () => { assert.deepEqual(a.SAFE_EFFECTS, ['localRead']); assert.equal(a.MAX_ITEMS, 32); });
test('capability names normalize', () => assert.equal(a.normalizeAgentCapabilityName('  Search-Docs '), 'search-docs'));
test('capability names bound length', () => assert.equal(a.normalizeAgentCapabilityName('x'.repeat(200)).length, 96));
test('device normalizes known value', () => assert.equal(a.normalizeAgentAuditDevice('mobile'), 'mobile'));
test('device falls back desktop', () => assert.equal(a.normalizeAgentAuditDevice('tablet'), 'desktop'));
test('status normalizes known value', () => assert.equal(a.normalizeAgentAuditStatus('timeout'), 'timeout'));
test('status falls back failed', () => assert.equal(a.normalizeAgentAuditStatus('oops'), 'failed'));
test('reason normalizes permission denied', () => assert.equal(a.normalizeAgentAuditReason('permission_denied'), 'permission_denied'));
test('reason falls back failed', () => assert.equal(a.normalizeAgentAuditReason('oops'), 'failed'));
test('effects keep local read', () => assert.deepEqual(a.normalizeAgentAuditEffects(['localRead', 'localWrite']), ['localRead']));
test('effects malformed input is empty', () => assert.deepEqual(a.normalizeAgentAuditEffects('localRead'), []));
test('devices dedupe known entries', () => assert.deepEqual(a.normalizeAgentAuditDevices(['desktop', 'desktop']), ['desktop']));
test('devices invalid list falls back all', () => assert.deepEqual(a.normalizeAgentAuditDevices(['tablet']), ['desktop', 'sidebar', 'mobile']));
test('counts clamp upper bound', () => assert.equal(a.normalizeAgentAuditCount(100), 32));
test('counts reject nonfinite', () => assert.equal(a.normalizeAgentAuditCount('nope'), 0));
test('boolean only accepts true', () => assert.equal(a.normalizeAgentAuditBoolean(1), false));
test('read-only effects accept exact localRead', () => assert.equal(a.isReadOnlyAgentEffects(['localRead']), true));
test('write effects reject read-only audit', () => assert.equal(a.isReadOnlyAgentEffects(['localWrite']), false));




test('definition audit accepts valid read-only item', () => assert.equal(a.auditAgentCapabilityDefinition(read('x')).valid, true));
test('definition audit rejects missing name', () => assert.equal(a.auditAgentCapabilityDefinition({effects: ['localRead']}).reason, 'missing_name'));
test('definition audit rejects write effect', () => assert.equal(a.auditAgentCapabilityDefinition({name: 'x', effects: ['localWrite']}).reason, 'non_read_only'));
test('definition audit accepts wrapper spec', () => assert.equal(a.auditAgentCapabilityDefinition({spec: read('x')}).valid, true));
test('definitions audit counts total', () => assert.equal(a.auditAgentCapabilityDefinitions([read('a'), read('b')]).total, 2));
test('definitions audit catches duplicate names', () => assert.equal(a.auditAgentCapabilityDefinitions([read('a'), read('a')]).duplicates, 1));
test('definitions audit caps input', () => assert.equal(a.auditAgentCapabilityDefinitions(Array.from({length: 40}, (_, i) => read(String(i)))).total, 32));
test('definitions audit malformed input is empty valid', () => assert.equal(a.auditAgentCapabilityDefinitions(null).valid, true));
test('audit summary strips item details', () => assert.deepEqual(a.summarizeAgentCapabilityAudit({valid: true, total: 2, validCount: 2, invalidCount: 0, duplicates: 0}), {valid: true, total: 2, validCount: 2, invalidCount: 0, duplicates: 0}));
test('snapshot uses version one', () => assert.equal(a.buildAgentReadOnlyAuditSnapshot({device: 'mobile'}).version, 1));
test('snapshot normalizes disposed invalidity', () => assert.equal(a.normalizeAgentReadOnlyAuditSnapshot({disposed: true, audit: {valid: true}}).audit.valid, false));





test('snapshot diff detects status change', () => assert.equal(a.diffAgentReadOnlyAuditSnapshots({status: 'ready'}, {status: 'timeout'}).statusChanged, true));
test('snapshot diff detects disposal', () => assert.equal(a.diffAgentReadOnlyAuditSnapshots({disposed: false}, {disposed: true}).disposedChanged, true));
test('audit events emit validity change', () => assert.equal(a.buildAgentReadOnlyAuditEvents({audit: {valid: true}}, {audit: {valid: false}})[0].type, 'validity_changed'));
test('audit events are bounded', () => assert.ok(a.buildAgentReadOnlyAuditEvents({status: 'ready'}, {status: 'failed'}).length <= 8));



// v0.17 lifecycle history contract (T-1283~T-1312)
test('history limit defaults to eight', () => assert.equal(a.normalizeAgentAuditHistoryLimit(), 8));
test('history limit clamps to one', () => assert.equal(a.normalizeAgentAuditHistoryLimit(0), 1));
test('history limit clamps to thirty two', () => assert.equal(a.normalizeAgentAuditHistoryLimit(99), 32));
test('history starts empty', () => assert.deepEqual(a.createAgentReadOnlyAuditHistory(3).list(), []));
test('history record accepts snapshot', () => assert.equal(a.createAgentReadOnlyAuditHistory().record({status: 'ready'}).accepted, true));
test('history record returns sequence', () => assert.equal(a.createAgentReadOnlyAuditHistory().record({status: 'ready'}).sequence, 1));
test('history sequences are monotonic', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); h.record({}); assert.deepEqual(h.list().map((x) => x.sequence), [1, 2]); });
test('history evicts oldest beyond capacity', () => { const h = a.createAgentReadOnlyAuditHistory(2); h.record({device: 'desktop'}); h.record({device: 'mobile'}); h.record({device: 'sidebar'}); assert.deepEqual(h.list().map((x) => x.sequence), [2, 3]); });
test('history list returns defensive snapshots', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({status: 'ready'}); const list = h.list(); list[0].snapshot.status = 'failed'; assert.equal(h.latest().snapshot.status, 'ready'); });
test('history latest returns newest item', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({device: 'desktop'}); h.record({device: 'mobile'}); assert.equal(h.latest().snapshot.device, 'mobile'); });
test('history latest is null when empty', () => assert.equal(a.createAgentReadOnlyAuditHistory().latest(), null));
test('history since reads entries after cursor', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({device: 'desktop'}); h.record({device: 'mobile'}); assert.deepEqual(h.since(1).map((x) => x.sequence), [2]); });
test('history since invalid cursor degrades to zero', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); assert.equal(h.since('bad').length, 1); });
test('history since is bounded by capacity', () => { const h = a.createAgentReadOnlyAuditHistory(2); h.record({}); h.record({}); h.record({}); assert.equal(h.since(0).length, 2); });
test('history status reports capacity', () => { const h = a.createAgentReadOnlyAuditHistory(4); assert.equal(h.status().capacity, 4); });
test('history status reports disposed flag', () => { const h = a.createAgentReadOnlyAuditHistory(); h.dispose(); assert.equal(h.status().disposed, true); });
test('history dispose clears entries', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); h.dispose(); assert.equal(h.list().length, 0); });
test('history dispose is idempotent', () => { const h = a.createAgentReadOnlyAuditHistory(); h.dispose(); h.dispose(); assert.equal(h.status().disposed, true); });
test('history rejects records after dispose', () => { const h = a.createAgentReadOnlyAuditHistory(); h.dispose(); assert.equal(h.record({}).accepted, false); });
test('history snapshots normalize nested audit', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({audit: {valid: 1, total: 99}}); assert.deepEqual(h.latest().snapshot.audit, {valid: false, total: 32, validCount: 0, invalidCount: 0, duplicates: 0}); });
test('lifecycle event reports unchanged snapshots', () => assert.deepEqual(a.buildAgentAuditLifecycleEvent({status: 'ready'}, {status: 'ready'}), {type: 'unchanged', count: 0}));
test('lifecycle event reports status changes', () => assert.deepEqual(a.buildAgentAuditLifecycleEvent({status: 'ready'}, {status: 'failed'}), {type: 'status_changed', count: 1}));
test('lifecycle event count is bounded', () => assert.ok(a.buildAgentAuditLifecycleEvent({audit: {valid: true}, status: 'ready', device: 'desktop', disposed: false}, {audit: {valid: false}, status: 'failed', device: 'mobile', disposed: true}).count <= 8));
test('cursor normalizes negative values', () => assert.equal(a.normalizeAgentAuditCursor(-4), 0));
test('cursor truncates fractional values', () => assert.equal(a.normalizeAgentAuditCursor(2.9), 2));
test('cursor rejects nonfinite values', () => assert.equal(a.normalizeAgentAuditCursor('bad'), 0));
test('history preserves device field', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({device: 'mobile'}); assert.equal(h.latest().snapshot.device, 'mobile'); });
test('history preserves status field', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({status: 'timeout'}); assert.equal(h.latest().snapshot.status, 'timeout'); });
test('history preserves stable reason only', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({reason: 'secret stack trace'}); assert.equal(h.latest().snapshot.reason, 'failed'); });
test('history summary does not leak item details', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({audit: {valid: true, items: [{handler: 'secret'}]}}); assert.equal('items' in h.latest().snapshot.audit, false); });
test('duplicate snapshots still receive distinct sequences', () => { const h = a.createAgentReadOnlyAuditHistory(); const a1 = h.record({status: 'ready'}); const a2 = h.record({status: 'ready'}); assert.notEqual(a1.sequence, a2.sequence); });
test('history status latest sequence survives eviction', () => { const h = a.createAgentReadOnlyAuditHistory(1); h.record({}); h.record({}); assert.equal(h.status().latestSequence, 2); });
test('production registration records initial audit snapshot', () => { const source = readSourceText(path.join(__dirname, '..', 'src', 'index.ts')); assert.match(source, /agentReadOnlyAuditHistory\.record\(buildAgentReadOnlyAuditSnapshot/); });
test('production unload records disposed audit snapshot', () => { const source = readSourceText(path.join(__dirname, '..', 'src', 'index.ts')); assert.match(source, /disposed:\s*true/); assert.match(source, /agentReadOnlyAuditHistory\.dispose\(\)/); });
test('production reload resets disposed audit history', () => { const source = readSourceText(path.join(__dirname, '..', 'src', 'index.ts')); assert.match(source, /agentReadOnlyAuditHistory\.status\(\)\.disposed/); assert.match(source, /agentReadOnlyAuditHistory = createAgentReadOnlyAuditHistory\(8\)/); });

// v0.17 audit history summary/replay contract (T-1313~T-1342)
test('history events expose bounded constant', () => assert.equal(a.MAX_HISTORY_EVENTS, 8));
test('history records initial event', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); assert.equal(h.events()[0].type, 'initial'); });
test('history records lifecycle event type', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({status: 'ready'}); h.record({status: 'failed'}); assert.equal(h.events(1)[0].type, 'status_changed'); });
test('history events use monotonic sequence', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); h.record({}); assert.deepEqual(h.events().map((e) => e.sequence), [1, 2]); });
test('history events are cursor filtered', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); h.record({}); assert.deepEqual(h.events(1).map((e) => e.sequence), [2]); });
test('history events are bounded', () => { const h = a.createAgentReadOnlyAuditHistory(32); for (let i = 0; i < 20; i++) h.record({}); assert.ok(h.events().length <= 8); });
test('history events are defensive copies', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); const e = h.events(); e[0].type = 'status_changed'; assert.equal(h.events()[0].type, 'initial'); });
test('history events clear on dispose', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); h.dispose(); assert.deepEqual(h.events(), []); });
test('history event type normalizes unknown values', () => assert.equal(a.normalizeAgentAuditHistoryEventType('secret'), 'unchanged'));
test('history event type preserves disposed change', () => assert.equal(a.normalizeAgentAuditHistoryEventType('disposed_changed'), 'disposed_changed'));
test('history event builder emits initial', () => assert.deepEqual(a.buildAgentAuditHistoryEvent(null, {}, 3), {sequence: 3, type: 'initial', count: 0}));
test('history event builder clamps sequence', () => assert.equal(a.buildAgentAuditHistoryEvent(null, {}, -2).sequence, 0));
test('history event builder clamps count', () => assert.equal(a.buildAgentAuditHistoryEvent({status: 'ready'}, {status: 'failed'}, 1).count, 1));
test('history event normalization has fixed keys', () => assert.deepEqual(Object.keys(a.normalizeAgentAuditHistoryEvent({sequence: 2, type: 'initial', count: 1})).sort(), ['count', 'sequence', 'type']));
test('history event normalization strips text', () => assert.equal(a.normalizeAgentAuditHistoryEvent({type: 'secret', sequence: 'x'}).type, 'unchanged'));
test('history summary reports empty state', () => { const h = a.createAgentReadOnlyAuditHistory(4); assert.deepEqual(a.buildAgentReadOnlyAuditHistorySummary(h), {size: 0, capacity: 4, latestSequence: 0, disposed: false, hasLatest: false}); });
test('history summary reports latest state', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); const s = a.buildAgentReadOnlyAuditHistorySummary(h); assert.equal(s.hasLatest, true); assert.equal(s.latestSequence, 1); });
test('history summary isolates hostile history', () => { const s = a.buildAgentReadOnlyAuditHistorySummary({status() { throw Error('secret'); }, latest() { throw Error('secret'); }}); assert.equal(s.size, 0); assert.equal(s.hasLatest, false); });














// v0.17 audit health/report contract (T-1343~T-1372)



test('empty history health is empty', () => assert.equal(a.buildAgentReadOnlyAuditHistoryHealth(a.createAgentReadOnlyAuditHistory()), 'empty'));
test('recorded history health is healthy', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); assert.equal(h.health(), 'healthy'); });
test('disposed history health is unavailable', () => { const h = a.createAgentReadOnlyAuditHistory(); h.dispose(); assert.equal(h.health(), 'unavailable'); });
test('event summary has fixed counters', () => assert.deepEqual(Object.keys(a.buildAgentReadOnlyAuditEventSummary([]).counts).sort(), ['device_changed', 'disposed_changed', 'initial', 'status_changed', 'unchanged', 'validity_changed']));
test('event summary counts initial event', () => assert.equal(a.buildAgentReadOnlyAuditEventSummary([{type: 'initial'}]).counts.initial, 1));
test('event summary bounds total', () => assert.equal(a.buildAgentReadOnlyAuditEventSummary(Array.from({length: 20}, () => ({type: 'initial'}))).total, 8));
test('event summary latest type is stable', () => assert.equal(a.buildAgentReadOnlyAuditEventSummary([{type: 'initial'}, {type: 'status_changed'}]).latestType, 'status_changed'));
test('event summary empty latest type', () => assert.equal(a.buildAgentReadOnlyAuditEventSummary([]).latestType, 'unchanged'));
test('event summary ignores unknown event types', () => assert.equal(a.buildAgentReadOnlyAuditEventSummary([{type: 'secret'}]).counts.unchanged, 1));



test('history object exposes event summary', () => { const h = a.createAgentReadOnlyAuditHistory(); h.record({}); assert.equal(h.eventSummary().total, 1); });
test('history object exposes health', () => { const h = a.createAgentReadOnlyAuditHistory(); assert.equal(typeof h.health, 'function'); });















// v0.17 audit report diff/trend/window contract (T-1373~T-1402)
































// v0.17 audit window merge/recovery contract (T-1403~T-1432)

































// v0.17 audit transport envelope/batch contract (T-1433~T-1462)

































// v0.17 transport queue/recovery contract (T-1463~T-1492)

































// v0.17 transport queue metrics/checkpoint contract (T-1493~T-1522)































// v0.17 transport queue maintenance/health contract (T-1523~T-1552)































// v0.17 transport queue cancellation/replay contract (T-1553~T-1582)
































// v0.17 transport coordinator contract (T-1583~T-1612)
































// v0.17 coordinator health/batch contract (T-1613~T-1642)

































// v0.17 joint coordinator contract (T-1643~T-1672)


































// v0.17 joint snapshot/checkpoint/recovery contract (T-1673~T-1702)































// v0.17 joint checkpoint window consistency contract (T-1703~T-1732)


































// v0.17 joint diagnostics projection contract (T-1738~T-1772)
