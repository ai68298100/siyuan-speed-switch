const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AGENT_CAPABILITY_SPECS,
    AGENT_JOURNAL_STATUSES,
    buildAgentWorkspaceContext,
    normalizeAgentJournalStatus,
    normalizeAgentTimestamp,
} = require('../src/agent-capabilities.js');

const ROOT = '20260915090000-abcdef';

test('timestamp missing defaults to zero', () => assert.equal(normalizeAgentTimestamp(undefined), 0));
test('timestamp negative defaults to zero', () => assert.equal(normalizeAgentTimestamp(-1), 0));
test('timestamp NaN defaults to zero', () => assert.equal(normalizeAgentTimestamp('nope'), 0));
test('timestamp infinity defaults to zero', () => assert.equal(normalizeAgentTimestamp(Infinity), 0));
test('timestamp truncates fractional values', () => assert.equal(normalizeAgentTimestamp(12.9), 12));
test('timestamp accepts numeric strings', () => assert.equal(normalizeAgentTimestamp('42'), 42));
test('timestamp caps oversized values', () => assert.equal(normalizeAgentTimestamp(999999999999999), 9999999999999));
test('timestamp preserves zero', () => assert.equal(normalizeAgentTimestamp(0), 0));
test('timestamp fallback is used for invalid input', () => assert.equal(normalizeAgentTimestamp('bad', 88), 88));
test('timestamp fallback is capped', () => assert.equal(normalizeAgentTimestamp('bad', 99999999999999), 9999999999999));

test('workspace context defaults to desktop', () => assert.equal(buildAgentWorkspaceContext().device, 'desktop'));
test('workspace context preserves mobile device', () => assert.equal(buildAgentWorkspaceContext({device: 'mobile'}).device, 'mobile'));
test('workspace context records syncing true', () => assert.equal(buildAgentWorkspaceContext({syncing: true}).syncing, true));
test('workspace context records syncing false', () => assert.equal(buildAgentWorkspaceContext({syncing: false}).syncing, false));
test('workspace context accepts generated timestamp', () => assert.equal(buildAgentWorkspaceContext({generatedAt: 123}).generatedAt, 123));
test('workspace context normalizes generated timestamp', () => assert.equal(buildAgentWorkspaceContext({generatedAt: 12.8}).generatedAt, 12));
test('workspace context caps generated timestamp', () => assert.equal(buildAgentWorkspaceContext({generatedAt: 99999999999999}).generatedAt, 9999999999999));
test('workspace context drops invalid generated timestamp', () => assert.equal(buildAgentWorkspaceContext({generatedAt: 'x'}).generatedAt, 0));
test('workspace context applies limit to open tabs', () => {
    const context = buildAgentWorkspaceContext({limit: 2, openTabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}]});
    assert.equal(context.openTabs.length, 2);
});
test('workspace context applies limit to closed tabs', () => {
    const context = buildAgentWorkspaceContext({limit: 2, closedTabs: [{id: 'a'}, {id: 'b'}, {id: 'c'}]});
    assert.equal(context.closedTabs.length, 2);
});
test('workspace context excludes closed roots reopened in tabs', () => {
    const context = buildAgentWorkspaceContext({openTabs: [{rootId: ROOT}], closedTabs: [{rootId: ROOT}, {id: 'other'}]});
    assert.deepEqual(context.closedTabs.map((item) => item.id), ['other']);
});
test('workspace context exposes freshness fields', () => {
    const context = buildAgentWorkspaceContext({generatedAt: 77, syncing: true});
    assert.deepEqual({generatedAt: context.generatedAt, syncing: context.syncing}, {generatedAt: 77, syncing: true});
});
test('workspace schema declares generated timestamp', () => {
    assert.deepEqual(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.generatedAt, {
        type: 'integer', minimum: 0, maximum: 9999999999999,
    });
});
test('workspace schema declares syncing flag', () => {
    assert.deepEqual(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.syncing, {type: 'boolean'});
});
test('workspace schema requires generated timestamp', () => assert.ok(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.required.includes('generatedAt')));
test('workspace schema requires syncing flag', () => assert.ok(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.required.includes('syncing')));
test('workspace schema timestamp has bounded maximum', () => assert.equal(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.generatedAt.maximum, 9999999999999));
test('workspace schema keeps additional properties disabled', () => assert.equal(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.additionalProperties, false));
test('workspace input schema remains limit-only', () => assert.deepEqual(Object.keys(AGENT_CAPABILITY_SPECS.workspaceContext.inputSchema.properties), ['limit']));
test('workspace context keeps a fixed top-level shape', () => assert.deepEqual(Object.keys(buildAgentWorkspaceContext()).sort(), [
    'activeDocument', 'closedTabs', 'device', 'documentSets', 'generatedAt', 'openTabs', 'quickActions', 'syncing', 'todayJournal',
].sort()));
test('workspace context does not mutate source', () => {
    const source = {generatedAt: 1, syncing: true, openTabs: [{id: 'a', title: 'A'}]};
    buildAgentWorkspaceContext(source);
    assert.deepEqual(source, {generatedAt: 1, syncing: true, openTabs: [{id: 'a', title: 'A'}]});
});
test('workspace context syncing is strict boolean', () => assert.equal(buildAgentWorkspaceContext({syncing: 1}).syncing, false));
test('workspace context old input remains safe', () => {
    const context = buildAgentWorkspaceContext({activeDocument: {id: ROOT, title: 'old'}});
    assert.equal(context.generatedAt, 0);
    assert.equal(context.syncing, false);
});
test('workspace context detaches generated output arrays', () => {
    const context = buildAgentWorkspaceContext({openTabs: [{id: 'a', title: 'A'}]});
    context.openTabs.push({id: 'b'});
    assert.equal(context.openTabs.length, 2);
});
test('workspace context preserves active document metadata', () => {
    const context = buildAgentWorkspaceContext({activeDocument: {id: ROOT, title: 'Active'}});
    assert.deepEqual(context.activeDocument, {id: ROOT, title: 'Active'});
});
test('workspace context rejects unsupported device to desktop', () => assert.equal(buildAgentWorkspaceContext({device: 'tablet'}).device, 'desktop'));
test('workspace context caps document sets independently', () => {
    const sets = Array.from({length: 12}, (_, index) => ({name: `set-${index}`, count: index}));
    assert.equal(buildAgentWorkspaceContext({documentSets: sets}).documentSets.length, 8);
});
test('workspace context caps quick actions independently', () => {
    const actions = Array.from({length: 20}, (_, index) => ({label: `action-${index}`, kind: 'builtin'}));
    assert.equal(buildAgentWorkspaceContext({quickActions: actions}).quickActions.length, 16);
});

test('journal status enum is frozen', () => assert.ok(Object.isFrozen(AGENT_JOURNAL_STATUSES)));
test('journal status enum contains five states', () => assert.deepEqual([...AGENT_JOURNAL_STATUSES], ['unconfigured', 'found', 'missing', 'unavailable', 'syncing']));
test('journal status preserves unconfigured', () => assert.equal(normalizeAgentJournalStatus('unconfigured'), 'unconfigured'));
test('journal status preserves found', () => assert.equal(normalizeAgentJournalStatus('found', true, ROOT), 'found'));
test('journal status preserves missing', () => assert.equal(normalizeAgentJournalStatus('missing', true), 'missing'));
test('journal status preserves unavailable', () => assert.equal(normalizeAgentJournalStatus('unavailable', true), 'unavailable'));
test('journal status preserves syncing', () => assert.equal(normalizeAgentJournalStatus('syncing', true), 'syncing'));
test('journal status defaults unconfigured when disabled', () => assert.equal(normalizeAgentJournalStatus('bad', false), 'unconfigured'));
test('journal status defaults found from document id', () => assert.equal(normalizeAgentJournalStatus('bad', true, ROOT), 'found'));
test('journal status defaults missing without document id', () => assert.equal(normalizeAgentJournalStatus('bad', true), 'missing'));
test('journal status builder adds unconfigured state', () => assert.equal(buildAgentWorkspaceContext().todayJournal.status, 'unconfigured'));
test('journal status builder adds found state', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: true, docId: ROOT}}).todayJournal.status, 'found'));
test('journal status builder adds missing state', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: true}}).todayJournal.status, 'missing'));
test('journal status builder keeps unavailable state', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: true, status: 'unavailable'}}).todayJournal.status, 'unavailable'));
test('journal status builder keeps syncing state', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: true, status: 'syncing'}}).todayJournal.status, 'syncing'));
test('journal status builder rejects unknown state', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: true, status: 'unknown'}}).todayJournal.status, 'missing'));
test('journal status requires configured boolean', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: 1, docId: ROOT}}).todayJournal.configured, false));
test('journal status bounds document id values', () => assert.equal(buildAgentWorkspaceContext({todayJournal: {configured: true, docId: 123}}).todayJournal.docId, '123'));
test('journal schema exposes status enum', () => assert.deepEqual(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.todayJournal.properties.status.enum, [...AGENT_JOURNAL_STATUSES]));
test('journal schema requires status', () => assert.ok(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.todayJournal.required.includes('status')));
test('journal schema keeps additional properties disabled', () => assert.equal(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.todayJournal.additionalProperties, false));
test('journal schema status is bounded string', () => assert.equal(AGENT_CAPABILITY_SPECS.workspaceContext.outputSchema.properties.todayJournal.properties.status.type, 'string'));
test('journal state survives generated timestamp', () => {
    const context = buildAgentWorkspaceContext({generatedAt: 9, todayJournal: {configured: true, status: 'syncing'}});
    assert.equal(context.todayJournal.status, 'syncing');
    assert.equal(context.generatedAt, 9);
});
test('journal state survives sync flag', () => {
    const context = buildAgentWorkspaceContext({syncing: true, todayJournal: {configured: true, status: 'syncing'}});
    assert.equal(context.syncing, true);
    assert.equal(context.todayJournal.status, 'syncing');
});
test('journal status output shape is fixed', () => assert.deepEqual(Object.keys(buildAgentWorkspaceContext().todayJournal).sort(), ['configured', 'docId', 'status'].sort()));
test('journal status does not leak unknown fields', () => {
    const context = buildAgentWorkspaceContext({todayJournal: {configured: true, status: 'found', secret: 'drop'}});
    assert.deepEqual(context.todayJournal, {configured: true, docId: '', status: 'found'});
});
test('journal status source is not mutated', () => {
    const source = {todayJournal: {configured: true, status: 'missing'}};
    buildAgentWorkspaceContext(source);
    assert.deepEqual(source, {todayJournal: {configured: true, status: 'missing'}});
});
test('journal status unknown without config cannot become found', () => assert.equal(normalizeAgentJournalStatus('found', false, ROOT), 'found'));
test('journal status explicit syncing remains valid without id', () => assert.equal(normalizeAgentJournalStatus('syncing', true, ''), 'syncing'));
test('journal status explicit unavailable remains valid with id', () => assert.equal(normalizeAgentJournalStatus('unavailable', true, ROOT), 'unavailable'));
test('journal status list is stable across repeated reads', () => assert.deepEqual([...AGENT_JOURNAL_STATUSES], [...AGENT_JOURNAL_STATUSES]));
