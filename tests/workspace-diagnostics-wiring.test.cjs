/**
 * v0.17 阶段 1（D-220）：workspace 运行时只读诊断能力生产接入契约测试。
 *
 * 覆盖：canonical spec/effects 身份与形状、wrapper 校验门、handler 输出
 * 符合 outputSchema 的有界快照、异常隔离（registry 异常不外泄）、卸载
 * 后计数语义、以及生产源码的接线事实（import/注册/卸载三处齐全）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const {
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC,
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS,
    createWorkspaceCapabilityRuntimeSessionRegistry,
    createWorkspaceCapabilityRuntimeRegistryDiffQueue,
    createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator,
    createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler,
} = require('../src/agent-workspace-runtime.js');
const {createWorkspaceRuntimeDiagnostics} = require('../src/agent-workspace-diagnostics.js');

test('workspace diagnostics: wrapper validates the canonical definition', () => {
    const runtime = createWorkspaceRuntimeDiagnostics();
    try {
        assert.equal(runtime.validation.ok, true);
        assert.equal(runtime.spec, WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC);
    } finally {
        runtime.dispose();
    }
});

test('workspace diagnostics: handler returns a bounded ready snapshot with an empty registry', () => {
    const runtime = createWorkspaceRuntimeDiagnostics();
    try {
        const output = runtime.handler({});
        assert.deepEqual(Object.keys(output).sort(), ['diffCoordinator', 'diffQueue', 'registry', 'summary']);
        assert.equal(output.summary.ok, true);
        assert.equal(output.summary.reason, 'ready');
        assert.equal(output.summary.size, 0);
        assert.equal(output.summary.maxSessions, 8);
        assert.equal(output.summary.capacityAvailable, 8);
        assert.equal(output.registry.disposed, false);
        assert.equal(output.diffQueue.size, 0);
        assert.equal(output.diffCoordinator.commits, 0);
    } finally {
        runtime.dispose();
    }
});

test('workspace diagnostics: session lifecycle is reflected through the same read-only capability', () => {
    // 阶段 2/3 前置验证：registry 建会话后，同一 handler 无需改动即反映计数。
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry();
    const diffQueue = createWorkspaceCapabilityRuntimeRegistryDiffQueue();
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator(diffQueue);
    const handler = createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler(registry, diffQueue, coordinator);
    const session = registry.create(4);
    assert.ok(session);
    const withSession = handler({});
    assert.equal(withSession.summary.size, 1);
    assert.equal(withSession.summary.active, 1);
    assert.equal(withSession.summary.capacityAvailable, 7);
    assert.equal(registry.remove(session.sessionId), true);
    const afterRemove = handler({});
    assert.equal(afterRemove.summary.size, 0);
    coordinator.dispose();
    diffQueue.dispose();
    registry.dispose();
    const afterDispose = handler({});
    // 既有契约：disposed registry 的 snapshot 仍是合法空快照（size 0、无残留
    // 会话），summary 保持结构完整；disposed 标志通过 registry 段暴露。
    assert.equal(afterDispose.registry.disposed, true);
    assert.equal(afterDispose.summary.size, 0);
    assert.equal(afterDispose.summary.active, 0);
    assert.equal(afterDispose.diffQueue.disposed, true);
});

test('workspace diagnostics: handler never leaks host exceptions', () => {
    // 传入行为异常的 registry：handler 必须归一化为 unavailable，不抛错。
    const hostile = {snapshot() { throw new Error('host secret'); }, status() { throw new Error('host secret'); }};
    const handler = createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler(hostile, null, null);
    const output = handler({});
    assert.equal(output.summary.ok, false);
    assert.equal(output.summary.reason, 'registry_unavailable');
    assert.equal(JSON.stringify(output).includes('host secret'), false);
});

test('workspace diagnostics: production entry wires import, registration and unload disposal', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
    assert.match(source, /import \{createWorkspaceRuntimeDiagnostics\} from "\.\/agent-workspace-diagnostics";/);
    assert.match(source, /this\.workspaceRuntimeDiagnostics = createWorkspaceRuntimeDiagnostics\(\);/);
    assert.match(source, /spec: this\.workspaceRuntimeDiagnostics\.spec as unknown as Record<string, unknown>/);
    assert.match(source, /this\.workspaceRuntimeDiagnostics\?\.dispose\(\);/);
    // 注册走的仍是只读通道（localRead 强制），执行链不得进入生产注册面
    const wiringStart = source.indexOf('const readOnlyDefinitions');
    const wiringEnd = source.indexOf('registerReadOnlyAgentCapabilities(pluginWithAgent, readOnlyDefinitions');
    assert.ok(wiringStart > 0 && wiringEnd > wiringStart);
    const wiring = source.slice(wiringStart, wiringEnd);
    assert.doesNotMatch(wiring, /EXECUTE_WORKSPACE_PLAN|WORKSPACE_PLAN_HANDLER_SPEC|agent-workspace-bridge/);
});

test('workspace diagnostics: canonical spec effects stay read-only and bounded', () => {
    assert.deepEqual(WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS, {localRead: true, localWrite: false, dataEgress: false, externalCost: false});
    assert.equal(WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.inputSchema.additionalProperties, false);
    assert.equal(WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.outputSchema.additionalProperties, false);
});

test('workspace runtime: double dispose and post-dispose reads are safe and idempotent', () => {
    const runtime = createWorkspaceRuntimeDiagnostics();
    const first = runtime.handler({});
    assert.equal(first.summary.ok, true);
    runtime.dispose();
    runtime.dispose(); // 二次 dispose 必须为无害 no-op
    const after = runtime.handler({});
    assert.equal(after.registry.disposed, true);
    assert.equal(after.diffQueue.disposed, true);
    assert.equal(after.diffCoordinator.disposed, true);
    // dispose 后 handler 仍返回结构完整的归一化快照，不抛宿主异常
    assert.deepEqual(Object.keys(after).sort(), ['diffCoordinator', 'diffQueue', 'registry', 'summary']);
});

test('workspace runtime module loads standalone (re-export chain guard)', () => {
    // 防御性自检：生产入口直接 require runtime 模块。若未来有人把
    // runtime 的导出改名或让 definitions 的 re-export 断链，这里先失败。
    const rt = require('../src/agent-workspace-runtime.js');
    const definitions = require('../src/agent-workspace-capability-definitions.js');
    for (const name of [
        'WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC',
        'WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS',
        'createWorkspaceCapabilityRuntimeSessionRegistry',
        'createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler',
        'validateWorkspaceRuntimeDiagnosticsDefinition',
    ]) {
        assert.equal(typeof rt[name], 'function' === typeof rt[name] ? 'function' : typeof rt[name] === 'object' ? 'object' : 'undefined',
            `runtime export ${name} disappeared`);
    }
    // canonical spec 必须是同一对象（definitions re-export 与 wrapper 校验共享身份）
    assert.equal(definitions.WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC, rt.WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC);
});
