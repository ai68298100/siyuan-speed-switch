const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AGENT_CAPABILITY_SPECS,
    buildAgentWorkspaceContext,
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
