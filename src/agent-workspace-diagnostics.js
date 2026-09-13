"use strict";

// v0.17 阶段 1（D-220）：workspace 运行时基础设施的只读诊断能力。
// 无输入、输出为有界计数快照（summary/registry/diffQueue/diffCoordinator）。
// registry/queue/coordinator 随插件载入创建、卸载销毁；阶段 2/3 接入
// session 生命周期后，同一能力将自动反映真实会话计数，生产注册面不变。
// 仅依赖 agent-workspace-runtime.js（38 KiB 搬移簇），不拖入未启用的
// plan/execute definitions 矩阵（仍留在 capability-definitions.js 供测试）。
const {
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC,
    WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS,
    createWorkspaceCapabilityRuntimeSessionRegistry,
    createWorkspaceCapabilityRuntimeRegistryDiffQueue,
    createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator,
    createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler,
    validateWorkspaceRuntimeDiagnosticsDefinition,
} = require("./agent-workspace-runtime.js");

function createWorkspaceRuntimeDiagnostics() {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry();
    const diffQueue = createWorkspaceCapabilityRuntimeRegistryDiffQueue();
    const diffCoordinator = createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator(diffQueue);
    // 与 capability-definitions.createWorkspaceCapabilityDiagnosticsDefinition 同构：
    // canonical spec/effects 身份 + runtime diagnostics handler 工厂。
    const definition = Object.freeze({
        spec: WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC,
        effects: WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS,
        handler: createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler(registry, diffQueue, diffCoordinator),
    });
    const validation = validateWorkspaceRuntimeDiagnosticsDefinition(definition);
    return Object.freeze({
        spec: definition.spec,
        handler: definition.handler,
        validation,
        dispose() {
            diffCoordinator.dispose();
            diffQueue.dispose();
            registry.dispose();
        },
    });
}

module.exports = {createWorkspaceRuntimeDiagnostics};
