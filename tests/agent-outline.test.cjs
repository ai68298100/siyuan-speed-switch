const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    AGENT_CAPABILITY_SPECS,
    flattenOutline,
    registerAgentActionCapability,
    registerReadOnlyAgentCapabilities,
} = require('../src/agent-capabilities.js');
const {DOCUMENT_CONTEXT_SPEC, buildDocumentContext} = require('../src/agent-document-context.js');
const {WORKSPACE_PLAN_SPEC, WORKSPACE_PLAN_RECEIPT_SCHEMA, buildWorkspacePlan, isWorkspacePlanExpired, validateWorkspacePlan, buildWorkspaceReceipt, runWorkspacePlan} = require('../src/agent-workspace-plan.js');
const {ACTION_KEYS, WORKSPACE_ACTION_SPECS, normalizeWorkspaceStep, normalizeWorkspaceActionResult, validateWorkspaceActionPostcondition, createWorkspaceActionExecutor, buildWorkspacePlanSummary} = require('../src/agent-workspace-actions.js');
const {createNavigationActionHandlers} = require('../src/agent-host-actions.js');
const {createDocumentSetRestoreHandler} = require('../src/agent-document-set-actions.js');
const {createDocumentSet} = require('../src/document-sets.js');
const {createWriteActionHandlers} = require('../src/agent-write-actions.js');
const {createWorkspaceHostHandlers} = require('../src/agent-workspace-registry.js');
const {WORKSPACE_CAPABILITY_NAMES, WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC, WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS, normalizeWorkspaceCapabilityHandle, createWorkspaceCapabilityDiagnosticsDefinition, normalizeWorkspaceCapabilityRuntimeRegistryDiagnosticsInput, validateWorkspaceCapabilityDefinition, validateWorkspaceCapabilityDefinitions, normalizeWorkspaceCapabilityRegistrationFailureReason, registerWorkspaceCapabilityDefinitions, disposeWorkspaceCapabilityRegistrations, createWorkspaceCapabilityLifecycle, buildWorkspaceCapabilityRuntimeSnapshot, WORKSPACE_RUNTIME_SNAPSHOT_VERSION, normalizeWorkspaceCapabilityRuntimeSnapshot, isWorkspaceCapabilityRuntimeSnapshotCompatible, validateWorkspaceCapabilityRuntimeSnapshot, diffWorkspaceCapabilityRuntimeSnapshots, buildWorkspaceCapabilityRuntimeEvents, normalizeWorkspaceCapabilityRuntimeEvents, createWorkspaceCapabilityEventQueue, enqueueWorkspaceCapabilityRuntimeDiff, readWorkspaceCapabilityRuntimeEventsForReplay, recoverWorkspaceCapabilityRuntime, recoverWorkspaceCapabilityRuntimeWithSignal, recoverWorkspaceCapabilityRuntimeWithDeadline, normalizeWorkspaceCapabilityRuntimeRecoveryResult, commitWorkspaceCapabilityRuntimeRecovery, recoverAndCommitWorkspaceCapabilityRuntime, recoverWorkspaceCapabilityRuntimeSafe, createWorkspaceCapabilityRecoveryCoordinator, createWorkspaceCapabilityRuntimeSession, WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION, WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION, WORKSPACE_CAPABILITY_DIAGNOSTICS_SNAPSHOT_VERSION, MAX_RUNTIME_SESSIONS, buildWorkspaceCapabilityRuntimeSessionSnapshot, normalizeWorkspaceCapabilityRuntimeSessionSnapshot, createWorkspaceCapabilityRuntimeSessionRegistry, normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot, buildWorkspaceCapabilityRuntimeSessionRegistrySnapshot, isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible, validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot, normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff, diffWorkspaceCapabilityRuntimeSessionRegistrySnapshots, buildWorkspaceCapabilityRuntimeSessionRegistrySummary, createWorkspaceCapabilityRuntimeRegistryDiffQueue, enqueueWorkspaceCapabilityRuntimeSessionRegistryDiff, readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay, readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal, readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithDeadline, commitWorkspaceCapabilityRuntimeSessionRegistryDiffReplay, recoverWorkspaceCapabilityRuntimeSessionRegistryDiff, normalizeWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryResult, recoverWorkspaceCapabilityRuntimeSessionRegistryDiffSafe, commitWorkspaceCapabilityRuntimeSessionRegistryDiffRecovery, createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator, buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics, normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult, normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics, createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler, buildWorkspaceCapabilityDefinitionsDiagnostics, normalizeWorkspaceCapabilityDefinitionsDiagnostics, buildWorkspaceCapabilityLifecycleDiagnostics, buildWorkspaceCapabilityDefinitionLifecycleDiagnostics, buildWorkspaceCapabilityDiagnosticsSnapshot, normalizeWorkspaceCapabilityDiagnosticsSnapshot, isWorkspaceCapabilityDiagnosticsSnapshotCompatible, validateWorkspaceCapabilityDiagnosticsSnapshot, diffWorkspaceCapabilityDiagnosticsSnapshots, buildWorkspaceCapabilityDiagnosticsEvents, normalizeWorkspaceCapabilityDiagnosticsEvents, createWorkspaceCapabilityDiagnosticsEventQueue, enqueueWorkspaceCapabilityDiagnosticsDiff, readWorkspaceCapabilityDiagnosticsEventsForReplay, commitWorkspaceCapabilityDiagnosticsReplay, recoverWorkspaceCapabilityDiagnostics, readWorkspaceCapabilityDiagnosticsEventsForReplayWithSignal, readWorkspaceCapabilityDiagnosticsEventsForReplayWithDeadline, normalizeWorkspaceCapabilityDiagnosticsRecoveryResult, commitWorkspaceCapabilityDiagnosticsRecovery, createWorkspaceCapabilityDiagnosticsRecoveryCoordinator, normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult, createWorkspaceCapabilityDiagnosticsJointRecoveryCoordinator, createWorkspaceCapabilityDiagnosticsJointRecoveryHandler, createWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryCoordinator, normalizeWorkspaceCapabilityRuntimeRegistryEvents, readWorkspaceCapabilityRuntimeRegistryEventsForReplay, readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithSignal, readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithDeadline, commitWorkspaceCapabilityRuntimeRegistryReplay, commitWorkspaceCapabilityRuntimeRegistryRecovery, recoverWorkspaceCapabilityRuntimeRegistry, normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult, recoverWorkspaceCapabilityRuntimeRegistrySafe, createWorkspaceCapabilityRuntimeRegistryRecoveryCoordinator} = require('../src/agent-workspace-capability-definitions.js');
const {PROBE_REASONS, normalizeWorkspaceCapabilityProbeOutcome, probeWorkspaceCapabilityHost, buildWorkspaceCapabilityProbeSnapshot} = require('../src/agent-workspace-probe.js');

test("outline capability spec is read-only, bounded and requires a document id", () => {
    const spec = AGENT_CAPABILITY_SPECS.outline;
    assert.equal(spec.name, "get-document-outline");
    assert.deepEqual(spec.inputSchema.required, ["id"]);
    assert.equal(spec.inputSchema.properties.limit.maximum, 48);
    assert.equal(spec.outputSchema.properties.headings.maxItems, 48);
    assert.match(spec.description, /只读/);
});

test("document-context groundwork keeps a bounded read-only contract", () => {
    assert.equal(DOCUMENT_CONTEXT_SPEC.name, "document-context");
    assert.equal(DOCUMENT_CONTEXT_SPEC.inputSchema.properties.limit.maximum, 24);
    assert.equal(DOCUMENT_CONTEXT_SPEC.outputSchema.properties.headings.maxItems, 24);
    assert.match(DOCUMENT_CONTEXT_SPEC.description, /不返回正文/);
    const context = buildDocumentContext({
        id: "20260913083000-abcdef", title: " 当前文档\n标题 ",
        notebookId: "20260913083000-boxbox", path: " /项目/路线 ", active: true,
        headings: [{id: "20260913083001-aaaaaaa", name: "第一章", depth: 0}], markdown: "drop",
    }, {limit: 1});
    assert.deepEqual(Object.fromEntries(Object.entries(context).filter(([key]) => !["source", "outlineAvailable", "outlineStatus", "metadataStatus", "metadataMissing", "pathSource", "pathReason", "notebookName", "notebookNameSource", "pathAvailable"].includes(key))), {
        id: "20260913083000-abcdef", title: "当前文档 标题", notebookId: "20260913083000-boxbox",
        path: "/项目/路线", active: true,
        headings: [{id: "20260913083001-aaaaaaa", title: "第一章", depth: 0}],
    });
    assert.equal(Object.hasOwn(context, "markdown"), false);
});

test("workspace-plan is a dry-run contract with fixed actions and expiry", () => {
    assert.equal(WORKSPACE_PLAN_SPEC.name, "workspace-plan");
    assert.deepEqual(WORKSPACE_PLAN_SPEC.inputSchema.required, ["steps"]);
    assert.equal(WORKSPACE_PLAN_SPEC.inputSchema.properties.steps.maxItems, 8);
    assert.match(WORKSPACE_PLAN_SPEC.description, /不执行/);
    const plan = buildWorkspacePlan({
        ttlMs: 99999999,
        steps: [
            {action: "open-document", id: "20260913083000-abcdef"},
            {action: "update-task-status", id: "20260913083001-abcdef", done: true},
            {action: "open-documents", ids: ["20260913083002-abcdef", "bad", "20260913083002-abcdef"]},
            {action: "drop-private-action"},
        ],
    }, 1700000000000);
    assert.equal(plan.steps.length, 3);
    assert.equal(plan.requiresConfirmation, true);
    assert.equal(plan.requiresWrite, true);
    assert.equal(plan.steps[1].done, true);
    assert.deepEqual(plan.steps[2].ids, ["20260913083002-abcdef"]);
    assert.equal(plan.expiresAt - plan.createdAt, 600000);
    assert.equal(isWorkspacePlanExpired(plan, plan.createdAt + 599999), false);
    assert.equal(isWorkspacePlanExpired(plan, plan.expiresAt), true);
    assert.equal(buildWorkspacePlan({steps: []}, 1700000000000).requiresConfirmation, false);
});

test("workspace receipt normalizes partial, cancelled and failed steps", () => {
    const plan = buildWorkspacePlan({steps: [
        {action: "open-document", id: "20260913083000-abcdef"},
        {action: "update-task-status", id: "20260913083001-abcdef", done: true},
        {action: "open-documents", ids: ["20260913083002-abcdef"]},
    ]}, 1700000000000);
    assert.equal(WORKSPACE_PLAN_RECEIPT_SCHEMA.properties.failed.maxItems, 8);
    const receipt = buildWorkspaceReceipt(plan, [
        {status: "completed"},
        {status: "failed", reason: "not found!"},
        {status: "cancelled"},
    ], 1700000000100);
    assert.equal(receipt.status, "partial");
    assert.deepEqual(receipt.completed, [0]);
    assert.deepEqual(receipt.failed, [{index: 1, reason: "notfound"}]);
    assert.deepEqual(receipt.cancelled, [2]);
    assert.match(receipt.receipt, /^rc-[a-z0-9]+$/);
    const expired = buildWorkspaceReceipt(plan, [], plan.expiresAt);
    assert.equal(expired.status, "expired");
});

test("workspace plan runner requires approval and isolates cancellation", async () => {
    const plan = buildWorkspacePlan({steps: [
        {action: "open-document", id: "20260913083000-abcdef"},
        {action: "open-document", id: "20260913083001-abcdef"},
        {action: "update-task-status", id: "20260913083002-abcdef", done: true},
    ]}, 1700000000000);
    const denied = await runWorkspacePlan(plan, {approved: false, now: 1700000000100, runStep: async () => ({status: "completed"})});
    assert.equal(denied.status, "denied");
    assert.deepEqual(denied.completed, []);
    let calls = 0;
    const signal = {aborted: false};
    const cancelled = await runWorkspacePlan(plan, {
        approved: true, signal, now: () => 1700000000100,
        runStep: async (_step, index) => { calls += 1; if (index === 0) signal.aborted = true; return {status: "completed"}; },
    });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(calls, 1);
    assert.deepEqual(cancelled.completed, [0]);
    assert.deepEqual(cancelled.cancelled, [1, 2]);
    const failed = await runWorkspacePlan(plan, {approved: true, now: 1700000000100});
    assert.equal(failed.status, "failed");
    assert.equal(failed.failed[0].reason, "executor_missing");
});

test("workspace plan validation rejects tampered structure before execution", async () => {
    const plan = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    assert.deepEqual(validateWorkspacePlan(plan), {ok: true});
    const tampered = {...plan, steps: [{...plan.steps[0], index: 1}]};
    assert.equal(validateWorkspacePlan(tampered).reason, "invalid_step");
    const wrongWrite = {...plan, steps: [{...plan.steps[0], requiresWrite: true}]};
    assert.equal(validateWorkspacePlan(wrongWrite).reason, "invalid_step");
    let calls = 0;
    const receipt = await runWorkspacePlan(tampered, {approved: true, runStep: async () => { calls += 1; return {status: "completed", id: "20260913083000-abcdef"}; }});
    assert.equal(receipt.status, "failed");
    assert.equal(calls, 0);
});

test("workspace action adapter dispatches only normalized fixed actions", async () => {
    assert.equal(ACTION_KEYS["append-to-journal"], "appendToJournal");
    assert.equal(WORKSPACE_ACTION_SPECS["update-task-status"].effect, "localWrite");
    assert.deepEqual(normalizeWorkspaceStep({action: "open-document", ids: ["20260913083000-abcdef"]}), {
        action: "open-document", id: "20260913083000-abcdef",
    });
    assert.equal(normalizeWorkspaceStep({action: "open-document", id: "javascript:bad"}), null);
    assert.deepEqual(normalizeWorkspaceStep({action: "create-document", notebook: " 工作 ", title: " 新文档 ", markdown: "# 初始"}), {
        action: "create-document", notebook: "工作", title: "新文档", markdown: "# 初始",
    });
    assert.equal(normalizeWorkspaceStep({action: "append-to-journal", content: "\n\t"}), null);
    const calls = [];
    const execute = createWorkspaceActionExecutor({
        openDocument: async (step, context) => { calls.push({step, context}); return {status: "completed", id: step.id}; },
    });
    assert.deepEqual(await execute({action: "open-document", id: "20260913083000-abcdef"}), {status: "completed", id: "20260913083000-abcdef"});
    assert.deepEqual(await execute({action: "update-task-status", id: "20260913083001-abcdef", done: true}), {status: "failed", reason: "handler_missing"});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].context.action, "open-document");
});

test("workspace action executor stops before handler when signal is aborted", async () => {
    let calls = 0;
    const execute = createWorkspaceActionExecutor({openDocument: async () => { calls += 1; return {status: "completed", id: "20260913083000-abcdef"}; }}, {signal: {aborted: true}});
    assert.deepEqual(await execute({action: "open-document", id: "20260913083000-abcdef"}, 2), {status: "cancelled"});
    assert.equal(calls, 0);
});

test("navigation host adapter opens single and batch documents with cancellation", async () => {
    const opened = [];
    const handlers = createNavigationActionHandlers({isMobile: false, app: {}, openTab: async ({doc}) => { opened.push(doc.id); }});
    assert.deepEqual(await handlers.openDocument({id: "20260913083000-abcdef"}), {status: "completed", id: "20260913083000-abcdef"});
    assert.deepEqual(await handlers.openDocuments({ids: ["20260913083001-abcdef", "20260913083002-abcdef"]}), {
        status: "completed", opened: ["20260913083001-abcdef", "20260913083002-abcdef"], failed: [],
    });
    const signal = {aborted: true};
    assert.deepEqual(await handlers.openDocument({id: "20260913083003-abcdef"}, {signal}), {status: "cancelled", reason: "open_failed"});
    assert.deepEqual(opened, ["20260913083000-abcdef", "20260913083001-abcdef", "20260913083002-abcdef"]);
});

test("document-set restore adapter preserves order, skips opened and respects cancellation", async () => {
    const set = createDocumentSet("项目", [
        {rootId: "20260913083000-abcdef", title: "一", index: 0},
        {rootId: "20260913083001-abcdef", title: "二", index: 1},
        {rootId: "20260913083002-abcdef", title: "三", index: 2},
    ], {now: 1700000000000, setId: "set-project"});
    const opened = [];
    const handler = createDocumentSetRestoreHandler({
        getSet: async () => set,
        getOpenedIds: () => ["20260913083001-abcdef"],
        probeEntries: async (entries) => entries.map((entry) => entry.rootId),
        openDocument: async (id) => { opened.push(id); return true; },
    });
    assert.deepEqual(await handler({setId: "set-project"}), {status: "completed"});
    assert.deepEqual(opened, ["20260913083000-abcdef", "20260913083002-abcdef"]);
    const cancelled = await handler({setId: "set-project"}, {signal: {aborted: true}});
    assert.deepEqual(cancelled, {status: "cancelled"});
    const missing = createDocumentSetRestoreHandler({getSet: async () => null, openDocument: async () => true});
    assert.deepEqual(await missing({setId: "set-project"}), {status: "failed", reason: "set_not_found"});
});

test("write action adapters validate payloads and return stable IDs", async () => {
    const calls = [];
    const handlers = createWriteActionHandlers({
        readTask: async () => ({markdown: "- [ ] 做事", content: "做事"}),
        updateBlock: async (id, markdown) => { calls.push([id, markdown]); return true; },
        createDocument: async () => ({docId: "20260913083002-abcdef", ignored: "secret"}),
        notebook: "20260913083000-boxbox",
        ensureJournal: async () => "20260913083003-abcdef",
        appendBlock: async () => true,
    });
    assert.deepEqual(await handlers.updateTaskStatus({id: "20260913083001-abcdef", done: true}), {status: "completed", id: "20260913083001-abcdef", done: true});
    assert.deepEqual(await handlers.createDocument({notebook: "20260913083000-boxbox", title: "新建", markdown: "# hi"}), {status: "completed", docId: "20260913083002-abcdef"});
    assert.deepEqual(await handlers.appendToJournal({content: "记录\n一条"}), {status: "completed", docId: "20260913083003-abcdef"});
    assert.equal(calls[0][1], "- [x] 做事");
    const denied = await handlers.updateTaskStatus({id: "20260913083001-abcdef", done: false}, {signal: {aborted: true}});
    assert.deepEqual(denied, {status: "cancelled"});
    const missing = createWriteActionHandlers({});
    assert.deepEqual(await missing.createDocument({notebook: "x", title: "y"}), {status: "failed", reason: "handler_missing"});
});

test("workspace host registry composes all six fixed action handlers", async () => {
    const opened = [];
    const handlers = createWorkspaceHostHandlers({
        navigation: {isMobile: false, app: {}, openTab: async ({doc}) => opened.push(doc.id)},
        documentSet: {getSet: async () => null, openDocument: async () => true},
        write: {
            readTask: async () => ({markdown: "- [ ] task"}),
            updateBlock: async () => true,
            createDocument: async () => ({docId: "20260913083002-abcdef"}),
            notebook: "20260913083000-boxbox",
            ensureJournal: async () => "20260913083003-abcdef",
            appendBlock: async () => true,
        },
    });
    assert.deepEqual(Object.keys(handlers).sort(), ["appendToJournal", "createDocument", "openDocument", "openDocuments", "restoreDocumentSet", "updateTaskStatus"]);
    const execute = createWorkspaceActionExecutor(handlers);
    assert.deepEqual(await execute({action: "open-document", id: "20260913083000-abcdef"}), {status: "completed", id: "20260913083000-abcdef"});
    assert.deepEqual(await execute({action: "update-task-status", id: "20260913083001-abcdef", done: true}), {status: "completed", id: "20260913083001-abcdef", done: true});
    assert.deepEqual(await execute({action: "create-document", notebook: "20260913083000-boxbox", title: "新建"}), {status: "completed", docId: "20260913083002-abcdef"});
    assert.equal(opened.length, 1);
});






test("workspace diagnostics definition is read-only and registration adapter preserves canonical effects", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    const definition = createWorkspaceCapabilityDiagnosticsDefinition(registry);
    assert.equal(definition.spec, WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC);
    assert.deepEqual(definition.effects, WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS);
    const calls = [];
    const host = {addAgentCapability: (entry) => { calls.push(entry); return "diagnostics-id"; }};
    assert.deepEqual(registerWorkspaceCapabilityDefinitions(host, [definition]), ["diagnostics-id"]);
    assert.deepEqual(calls[0].effects, WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_EFFECTS);
    registry.dispose();
});


test("workspace diagnostics registration participates in lifecycle disposal", () => {
    const removed = [];
    const host = {addAgentCapability: (entry) => ({dispose: () => removed.push(entry.name)})};
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    const definitions = [createWorkspaceCapabilityDiagnosticsDefinition(registry)];
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {plan: () => null, execute: async () => ({})});
    assert.equal(lifecycle.register(definitions).length, 1);
    assert.equal(lifecycle.status().registered, 1);
    assert.equal(lifecycle.dispose(), 1);
    assert.deepEqual(removed, ["workspace-runtime-registry-diagnostics"]);
    assert.equal(lifecycle.register(definitions).length, 0);
    registry.dispose();
});

test("workspace capability registrations dispose safely across host handle styles", () => {
    const removed = [];
    const host = {removeAgentCapability: (handle) => removed.push(handle)};
    let functionDisposed = 0;
    let objectDisposed = 0;
    const errors = [];
    const count = disposeWorkspaceCapabilityRegistrations(host, [
        () => { functionDisposed += 1; },
        {dispose: () => { objectDisposed += 1; }},
        "capability-id",
        {dispose: () => { throw new Error("secret"); }},
    ], (error) => errors.push(error));
    assert.equal(count, 3);
    assert.equal(functionDisposed, 1);
    assert.equal(objectDisposed, 1);
    assert.deepEqual(removed, ["capability-id"]);
    assert.equal(errors.length, 1);
    assert.deepEqual(disposeWorkspaceCapabilityRegistrations(null, ["ignored"]), 0);
});

test("workspace capability lifecycle registers once and disposes irreversibly", () => {
    const events = [];
    const host = {
        addAgentCapability: ({name}) => { events.push(`add:${name}`); return () => events.push(`dispose:${name}`); },
    };
    // ADR 0063：自建 plan/execute 定义撤除后，默认注册面仅剩 diagnostics 定义
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {});
    assert.deepEqual(lifecycle.probe(), {available: true, reason: "ready"});
    const first = lifecycle.register();
    const second = lifecycle.register();
    assert.deepEqual(second, first);
    assert.equal(lifecycle.size(), 1);
    assert.equal(events.filter((item) => item.startsWith("add:")).length, 1);
    assert.deepEqual(lifecycle.status(), {registered: 1, failed: 0, unmanaged: 0, disposed: false});
    assert.deepEqual(lifecycle.snapshot(), {
        host: {available: true, reason: "ready"},
        registration: {registered: 1, failed: 0, unmanaged: 0, disposed: false},
    });
    assert.equal(lifecycle.dispose(), 1);
    assert.equal(lifecycle.dispose(), 0);
    assert.equal(lifecycle.size(), 0);
    assert.deepEqual(lifecycle.status(), {registered: 0, failed: 0, unmanaged: 0, disposed: true});
    assert.deepEqual(lifecycle.register(), []);
    assert.equal(events.filter((item) => item.startsWith("add:")).length, 1);
});

test("workspace capability lifecycle reports bounded partial registration failures", () => {
    const errors = [];
    let index = 0;
    const host = {addAgentCapability: () => {
        index += 1;
        if (index === 1) throw new Error("secret");
        return "second-handle";
    }};
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {}, Date.now, (error) => errors.push(error));
    assert.deepEqual(lifecycle.probe(), {available: true, reason: "ready"});
    // 覆盖两份合法定义：首次注册抛错、第二次成功 → 部分失败语义
    const definitions = [createWorkspaceCapabilityDiagnosticsDefinition(), createWorkspaceCapabilityDiagnosticsDefinition()];
    assert.deepEqual(lifecycle.register(definitions), ["second-handle"]);
    assert.deepEqual(lifecycle.status(), {registered: 1, failed: 1, unmanaged: 0, disposed: false});
    assert.equal(errors.length, 1);
    assert.equal(lifecycle.register().length, 1);
});

test("workspace capability lifecycle reports opaque and invalid host handles", () => {
    let index = 0;
    const host = {addAgentCapability: () => index++ === 0 ? undefined : null};
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {});
    // 覆盖两份 diagnostics 定义以触发 opaque/invalid 两种句柄形态
    assert.equal(lifecycle.register([createWorkspaceCapabilityDiagnosticsDefinition(), createWorkspaceCapabilityDiagnosticsDefinition()]).length, 2);
    assert.deepEqual(lifecycle.status(), {registered: 2, failed: 0, unmanaged: 2, disposed: false});
    assert.deepEqual(lifecycle.handleStatus(), {opaque: 1, invalid: 1});
});

test("workspace capability registration failure reasons stay stable", () => {
    assert.equal(normalizeWorkspaceCapabilityRegistrationFailureReason({name: "AbortError"}), "cancelled");
    assert.equal(normalizeWorkspaceCapabilityRegistrationFailureReason({name: "TimeoutError"}), "timeout");
    assert.equal(normalizeWorkspaceCapabilityRegistrationFailureReason(new Error("secret")), "failed");
    const host = {addAgentCapability: ({name}) => { if (name === WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.name) throw Object.assign(new Error("x"), {name: "TimeoutError"}); return "ok"; }};
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {});
    lifecycle.register();
    assert.deepEqual(lifecycle.failureStatus(), {total: 1, byReason: {cancelled: 0, timeout: 1, failed: 0}});
});

test("workspace capability definitions diagnostics stay bounded", () => {
    const definitions = [createWorkspaceCapabilityDiagnosticsDefinition()];
    assert.deepEqual(buildWorkspaceCapabilityDefinitionsDiagnostics(definitions), {ok: true, total: 1, valid: 1, invalid: 0, duplicate: 0});
    assert.deepEqual(buildWorkspaceCapabilityDefinitionsDiagnostics([{spec: {name: "secret"}, handler: () => true}]), {ok: false, total: 1, valid: 0, invalid: 1, duplicate: 0});
});

test("workspace definition/lifecycle diagnostics form a bounded read-only bundle", () => {
    const definitions = [createWorkspaceCapabilityDiagnosticsDefinition()];
    const lifecycle = createWorkspaceCapabilityLifecycle({addAgentCapability: () => undefined}, {});
    lifecycle.register();
    const bundle = buildWorkspaceCapabilityDefinitionLifecycleDiagnostics(definitions, lifecycle);
    assert.equal(bundle.definitions.valid, 1);
    assert.equal(bundle.lifecycle.status.registered, 1);
    assert.equal(bundle.lifecycle.handles.opaque, 1);
    assert.equal(bundle.lifecycle.failures.total, 0);
    assert.deepEqual(normalizeWorkspaceCapabilityDefinitionsDiagnostics({total: 99, valid: 99, invalid: -1, duplicate: 99, secret: "drop"}), {ok: false, total: 8, valid: 8, invalid: 0, duplicate: 8});
});

test("workspace diagnostics snapshot is versioned, compatible, and validated", () => {
    const definitions = [createWorkspaceCapabilityDiagnosticsDefinition()];
    const lifecycle = createWorkspaceCapabilityLifecycle({addAgentCapability: () => "ok"}, {});
    lifecycle.register();
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    const snapshot = buildWorkspaceCapabilityDiagnosticsSnapshot(definitions, lifecycle, registry);
    assert.equal(snapshot.version, 1);
    assert.equal(isWorkspaceCapabilityDiagnosticsSnapshotCompatible(snapshot), true);
    assert.deepEqual(validateWorkspaceCapabilityDiagnosticsSnapshot(snapshot), {ok: true, version: 1});
    assert.deepEqual(validateWorkspaceCapabilityDiagnosticsSnapshot({...snapshot, version: 2}), {ok: false, reason: "unsupported_version"});
    assert.equal(normalizeWorkspaceCapabilityDiagnosticsSnapshot({...snapshot, definitionLifecycle: null}).version, 1);
    registry.dispose();
});

test("workspace diagnostics snapshots produce stable bounded change events", () => {
    const before = {version: 1, definitionLifecycle: {definitions: {ok: true, total: 2, valid: 2, invalid: 0, duplicate: 0}, lifecycle: {status: {registered: 1}}}, runtimeRegistry: {registry: {size: 0}, diffQueue: {size: 0}, diffCoordinator: {commits: 0}}};
    const after = {...before, runtimeRegistry: {...before.runtimeRegistry, registry: {size: 1}}};
    assert.deepEqual(diffWorkspaceCapabilityDiagnosticsSnapshots(before, after), {definitionsChanged: false, lifecycleChanged: false, registryChanged: true, diffQueueChanged: false, coordinatorChanged: false});
    assert.deepEqual(buildWorkspaceCapabilityDiagnosticsEvents(before, after), [{type: "registry", changed: true}]);
    assert.deepEqual(normalizeWorkspaceCapabilityDiagnosticsEvents([{type: "coordinator"}, {type: "coordinator"}, {type: "secret"}]), [{type: "coordinator", changed: true}]);
});

test("workspace diagnostics event queue supports bounded replay and snapshot recovery", () => {
    const queue = createWorkspaceCapabilityDiagnosticsEventQueue(2);
    const before = {version: 1, runtimeRegistry: {registry: {size: 0}}, definitionLifecycle: {},};
    const after = {version: 1, runtimeRegistry: {registry: {size: 1}}, definitionLifecycle: {},};
    assert.equal(enqueueWorkspaceCapabilityDiagnosticsDiff(queue, before, after), 1);
    const replay = readWorkspaceCapabilityDiagnosticsEventsForReplay(queue, 0, 8);
    assert.equal(replay.ok, true);
    assert.equal(commitWorkspaceCapabilityDiagnosticsReplay(queue, replay), 1);
    queue.push([{type: "registry"}]); queue.push([{type: "lifecycle"}]); queue.push([{type: "coordinator"}]);
    const snapshot = buildWorkspaceCapabilityDiagnosticsSnapshot([], null, null);
    const recovered = recoverWorkspaceCapabilityDiagnostics(queue, 0, 8, snapshot);
    assert.equal(recovered.mode, "snapshot");
    assert.equal(recovered.snapshot.version, 1);
});

test("workspace diagnostics replay cancellation and deadline preserve queue", () => {
    const queue = createWorkspaceCapabilityDiagnosticsEventQueue(2);
    queue.push([{type: "registry"}]);
    const controller = new AbortController(); controller.abort();
    assert.equal(readWorkspaceCapabilityDiagnosticsEventsForReplayWithSignal(queue, 0, 8, controller.signal).reason, "cancelled");
    assert.equal(readWorkspaceCapabilityDiagnosticsEventsForReplayWithDeadline(queue, 0, 8, 100, 100).reason, "timeout");
    assert.equal(queue.size(), 1);
});

test("workspace diagnostics recovery coordinator enforces monotonic commits and disposal", () => {
    const queue = createWorkspaceCapabilityDiagnosticsEventQueue(2);
    queue.push([{type: "registry"}]);
    const coordinator = createWorkspaceCapabilityDiagnosticsRecoveryCoordinator(queue);
    const result = coordinator.recoverAndCommit(0, 8, null);
    assert.equal(result.ok, true); assert.equal(result.acknowledged, 1);
    assert.equal(coordinator.commit(result), 0);
    coordinator.dispose();
    assert.equal(coordinator.recover().reason, "diagnostics_coordinator_disposed");
    assert.deepEqual(normalizeWorkspaceCapabilityDiagnosticsRecoveryResult({ok: true, mode: "events", reason: "secret", cursor: 99, events: [{type: "registry"}]}), {ok: true, mode: "events", reason: "ready", cursor: 99, events: [{type: "registry", changed: true}], snapshot: null});
});

test("workspace diagnostics joint coordinator replays and acknowledges atomically", () => {
    const queue = createWorkspaceCapabilityDiagnosticsEventQueue(2);
    queue.push([{type: "registry"}]);
    const coordinator = createWorkspaceCapabilityDiagnosticsJointRecoveryCoordinator(queue);
    const snapshot = buildWorkspaceCapabilityDiagnosticsSnapshot([], null, null);
    const result = coordinator.recoverAndCommit(0, 8, snapshot);
    assert.equal(result.ok, true);
    assert.equal(result.acknowledged, 1);
    assert.equal(coordinator.status().lastCursor, 1);
    assert.equal(coordinator.commit(result), 0);
    coordinator.dispose();
    assert.equal(coordinator.recover().reason, "diagnostics_joint_coordinator_disposed");
    assert.equal(normalizeWorkspaceCapabilityDiagnosticsJointRecoveryResult({ok: true, mode: "events", acknowledged: 99}).acknowledged, 8);
});

test("workspace capability lifecycle probe is unavailable on legacy hosts", () => {
    const lifecycle = createWorkspaceCapabilityLifecycle({}, {});
    assert.deepEqual(lifecycle.probe(), {available: false, reason: "unavailable"});
    assert.deepEqual(lifecycle.register(), []);
    assert.deepEqual(lifecycle.status(), {registered: 0, failed: 0, unmanaged: 0, disposed: false});
    assert.deepEqual(lifecycle.snapshot().host, {available: false, reason: "unavailable"});
});

test("workspace capability handles normalize managed and opaque host returns", () => {
    assert.deepEqual(normalizeWorkspaceCapabilityHandle(() => true), {managed: true, kind: "disposer"});
    assert.deepEqual(normalizeWorkspaceCapabilityHandle({dispose() {}}), {managed: true, kind: "object"});
    assert.deepEqual(normalizeWorkspaceCapabilityHandle("capability-id"), {managed: true, kind: "id"});
    assert.deepEqual(normalizeWorkspaceCapabilityHandle(undefined), {managed: false, kind: "opaque"});
    assert.deepEqual(normalizeWorkspaceCapabilityHandle(null), {managed: false, kind: "invalid"});
});

test("workspace runtime snapshot composes lifecycle and bridge state safely", () => {
    const lifecycle = {snapshot: () => ({host: {available: true, reason: "ready"}, registration: {registered: 2, failed: 0, unmanaged: 0, disposed: false}})};
    const bridge = {status: () => ({planCount: 1, maxPlans: 32, disposed: false})};
    const snapshot = buildWorkspaceCapabilityRuntimeSnapshot(lifecycle, bridge);
    assert.deepEqual(snapshot, {
        version: WORKSPACE_RUNTIME_SNAPSHOT_VERSION,
        lifecycle: {host: {available: true, reason: "ready"}, registration: {registered: 2, failed: 0, unmanaged: 0, disposed: false}},
        bridge: {planCount: 1, maxPlans: 32, disposed: false},
    });
    assert.equal(Object.isFrozen(snapshot), true);
    assert.deepEqual(buildWorkspaceCapabilityRuntimeSnapshot(null, null), {
        version: WORKSPACE_RUNTIME_SNAPSHOT_VERSION,
        lifecycle: {host: {available: false, reason: "unavailable"}, registration: {registered: 0, failed: 0, unmanaged: 0, disposed: false}},
        bridge: {planCount: 0, maxPlans: 0, disposed: true},
    });
});

test("workspace runtime snapshot normalization is versioned and bounded", () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeSnapshot({
        version: 99,
        lifecycle: {host: {available: "yes", reason: "secret"}, registration: {registered: 99, failed: -2, unmanaged: 4, disposed: 1}},
        bridge: {planCount: 99, maxPlans: 99, disposed: "yes"},
        token: "drop",
    });
    assert.deepEqual(normalized, {
        version: 1,
        lifecycle: {host: {available: false, reason: "failed"}, registration: {registered: 2, failed: 0, unmanaged: 2, disposed: false}},
        bridge: {planCount: 32, maxPlans: 32, disposed: false},
    });
    assert.equal(Object.hasOwn(normalized, "token"), false);
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible(normalized), true);
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible({version: 2}), false);
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible({}), true);
    assert.equal(isWorkspaceCapabilityRuntimeSnapshotCompatible(null), false);
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot(normalized), {ok: true, version: 1});
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot({...normalized, version: 2}), {ok: false, reason: "unsupported_version"});
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot({...normalized, bridge: {...normalized.bridge, planCount: 2, maxPlans: 1}}), {ok: false, reason: "plan_overflow"});
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSnapshot({...normalized, bridge: {...normalized.bridge, disposed: true}}), {ok: false, reason: "dispose_mismatch"});
    const baseline = {...normalized, bridge: {...normalized.bridge, planCount: 0}};
    assert.deepEqual(diffWorkspaceCapabilityRuntimeSnapshots(baseline, {...normalized, lifecycle: {...normalized.lifecycle, host: {available: true, reason: "ready"}}, bridge: {...normalized.bridge, planCount: 3, disposed: true}}), {
        hostChanged: true, registrationChanged: false, unmanagedChanged: false, planCountDelta: 3, bridgeDisposedChanged: true,
    });
    assert.deepEqual(buildWorkspaceCapabilityRuntimeEvents(baseline, {...normalized, lifecycle: {...normalized.lifecycle, host: {available: true, reason: "ready"}}, bridge: {...normalized.bridge, planCount: 3, disposed: true}}), [
        {type: "host", changed: true}, {type: "plans", delta: 3}, {type: "disposed", changed: true},
    ]);
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeEvents([{type: "plans", delta: 99}, {type: "host"}, {type: "host"}, {type: "unknown"}, {type: "disposed"}]), [
        {type: "host", changed: true}, {type: "plans", delta: 32}, {type: "disposed", changed: true},
    ]);
});

test("workspace capability event queue stays bounded and consumable", () => {
    const queue = createWorkspaceCapabilityEventQueue(2);
    assert.equal(queue.push([{type: "host"}, {type: "plans", delta: 1}, {type: "disposed"}]), 3);
    assert.equal(queue.size(), 2);
    assert.deepEqual(queue.read(), [{type: "plans", delta: 1}, {type: "disposed", changed: true}]);
    assert.deepEqual(queue.readSince(0), {
        cursor: 3,
        truncated: true,
        events: [{sequence: 2, event: {type: "plans", delta: 1}}, {sequence: 3, event: {type: "disposed", changed: true}}],
    });
    assert.equal(queue.acknowledge(2), 1);
    assert.equal(queue.size(), 1);
    assert.deepEqual(queue.status(), {size: 1, maxItems: 2, cursor: 3, disposed: false});
    assert.deepEqual(queue.consume(1), [{type: "disposed", changed: true}]);
    assert.equal(queue.size(), 0);
    queue.dispose();
    assert.equal(queue.push([{type: "host"}]), 0);
    assert.deepEqual(queue.consume(), []);
});

test("workspace runtime diff enqueue bridges snapshots into the queue", () => {
    const queue = createWorkspaceCapabilityEventQueue(4);
    const before = {version: 1, lifecycle: {host: {available: false, reason: "unavailable"}, registration: {registered: 0, failed: 0, unmanaged: 0, disposed: false}}, bridge: {planCount: 0, maxPlans: 4, disposed: false}};
    const after = {...before, lifecycle: {...before.lifecycle, host: {available: true, reason: "ready"}}, bridge: {...before.bridge, planCount: 2}};
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(queue, before, after), 2);
    assert.deepEqual(queue.readSince(0).events, [{sequence: 1, event: {type: "host", changed: true}}, {sequence: 2, event: {type: "plans", delta: 2}}]);
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(null, before, after), 0);
    assert.equal(enqueueWorkspaceCapabilityRuntimeDiff(queue, before, before), 0);
    assert.deepEqual(readWorkspaceCapabilityRuntimeEventsForReplay(queue, 0), {ok: true, reason: "ready", cursor: 2, events: [
        {sequence: 1, event: {type: "host", changed: true}},
        {sequence: 2, event: {type: "plans", delta: 2}},
    ]});
    assert.deepEqual(readWorkspaceCapabilityRuntimeEventsForReplay(null), {ok: false, reason: "queue_unavailable", cursor: 0, events: []});
});

test("workspace runtime replay requests a fresh snapshot after queue overflow", () => {
    const queue = createWorkspaceCapabilityEventQueue(1);
    queue.push([{type: "host"}, {type: "disposed"}]);
    assert.deepEqual(readWorkspaceCapabilityRuntimeEventsForReplay(queue, 0), {ok: false, reason: "snapshot_required", cursor: 2, events: []});
    assert.deepEqual(readWorkspaceCapabilityRuntimeEventsForReplay(queue, 1), {ok: true, reason: "ready", cursor: 2, events: [{sequence: 2, event: {type: "disposed", changed: true}}]});
    const snapshot = {version: 1, lifecycle: {host: {available: true, reason: "ready"}, registration: {registered: 1, failed: 0, unmanaged: 0, disposed: false}}, bridge: {planCount: 1, maxPlans: 4, disposed: false}};
    const recovered = recoverWorkspaceCapabilityRuntime(queue, 0, snapshot);
    assert.deepEqual(recovered, {ok: true, mode: "snapshot", cursor: 2, events: [], snapshot});
    assert.equal(commitWorkspaceCapabilityRuntimeRecovery(queue, recovered), 1);
    assert.equal(queue.size(), 0);
    assert.deepEqual(recoverWorkspaceCapabilityRuntime(queue, 0, {...snapshot, version: 2}), {ok: false, mode: "unavailable", reason: "snapshot_required", cursor: 2, events: [], snapshot: null});
    assert.equal(commitWorkspaceCapabilityRuntimeRecovery(queue, {ok: false, mode: "unavailable", cursor: 2}), 0);
    const queued = createWorkspaceCapabilityEventQueue(2);
    queued.push([{type: "host"}]);
    const committed = recoverAndCommitWorkspaceCapabilityRuntime(queued, 0, null);
    assert.equal(committed.mode, "events");
    assert.equal(committed.acknowledged, 1);
    assert.equal(queued.size(), 0);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queued);
    assert.equal(coordinator.commit({ok: true, mode: "events", cursor: 2}), 0);
    assert.deepEqual(coordinator.status(), {lastCursor: 0, commits: 0, disposed: false});
});

test("workspace runtime recovery coordinator rejects duplicate and stale commits", () => {
    const queue = createWorkspaceCapabilityEventQueue(4);
    queue.push([{type: "host"}, {type: "disposed"}]);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    const first = coordinator.recoverAndCommit(0, null);
    assert.equal(first.acknowledged, 2);
    assert.deepEqual(coordinator.status(), {lastCursor: 2, commits: 1, disposed: false});
    assert.equal(coordinator.commit(first), 0);
    assert.equal(coordinator.commit({ok: true, mode: "events", cursor: 1}), 0);
    assert.deepEqual(coordinator.status(), {lastCursor: 2, commits: 1, disposed: false});
    assert.deepEqual(coordinator.snapshot().coordinator, {lastCursor: 2, commits: 1, disposed: false});
    coordinator.dispose();
    assert.deepEqual(coordinator.status(), {lastCursor: 2, commits: 1, disposed: true});
    assert.deepEqual(coordinator.recoverAndCommit(2), {ok: false, mode: "unavailable", reason: "coordinator_disposed", cursor: 2, events: [], snapshot: null, acknowledged: 0});
    assert.equal(coordinator.commit({ok: true, mode: "events", cursor: 3}), 0);
    assert.deepEqual(coordinator.snapshot().coordinator, {lastCursor: 2, commits: 1, disposed: true});
});

test("workspace runtime recovery honors cancellation without consuming events", () => {
    const queue = createWorkspaceCapabilityEventQueue(2);
    queue.push([{type: "host"}]);
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeWithSignal(queue, 0, null, 16, controller.signal), {ok: false, mode: "cancelled", reason: "cancelled", cursor: 0, events: [], snapshot: null});
    assert.equal(queue.size(), 1);
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeWithSignal(queue, 0, null, 16, {aborted: false}), {ok: true, mode: "events", cursor: 1, events: [{sequence: 1, event: {type: "host", changed: true}}], snapshot: null});
});

test("workspace runtime recovery honors deadline without consuming events", () => {
    const queue = createWorkspaceCapabilityEventQueue(2);
    queue.push([{type: "host"}]);
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeWithDeadline(queue, 0, null, 16, 100, 100), {ok: false, mode: "timeout", reason: "timeout", cursor: 0, events: [], snapshot: null});
    assert.equal(queue.size(), 1);
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeWithDeadline(queue, 0, null, 16, 100, 99), {ok: true, mode: "events", cursor: 1, events: [{sequence: 1, event: {type: "host", changed: true}}], snapshot: null});
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeSafe(queue, 0, null, 16, {aborted: true}), {ok: false, mode: "cancelled", reason: "cancelled", cursor: 0, events: [], snapshot: null});
});

test("workspace runtime recovery result normalization keeps terminal modes bounded", () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeRecoveryResult({ok: true, mode: "events", reason: "secret text", cursor: 99, events: [{sequence: 1, event: {type: "host"}, secret: "drop"}], token: "drop"});
    assert.deepEqual(normalized, {ok: true, mode: "events", reason: "ready", cursor: 99, events: [{sequence: 1, event: {type: "host"}}], snapshot: null});
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeRecoveryResult({ok: true, mode: "unknown", cursor: -1}), {ok: false, mode: "unavailable", reason: "unavailable", cursor: 0, events: [], snapshot: null});
});

test("workspace recovery coordinator can optionally dispose its owned queue", () => {
    const queue = createWorkspaceCapabilityEventQueue(2);
    queue.push([{type: "host"}]);
    const coordinator = createWorkspaceCapabilityRecoveryCoordinator(queue);
    assert.equal(coordinator.dispose(true), 1);
    assert.equal(queue.size(), 0);
    assert.equal(coordinator.dispose(true), 0);
    assert.equal(coordinator.status().disposed, true);
});

test("workspace runtime session isolates queue and coordinator lifecycle", () => {
    const first = createWorkspaceCapabilityRuntimeSession(2);
    const second = createWorkspaceCapabilityRuntimeSession(2);
    assert.match(first.sessionId, /^ws-[a-z0-9]{8}$/);
    assert.notEqual(first.sessionId, second.sessionId);
    first.queue.push([{type: "host"}]);
    assert.equal(first.snapshot().runtime.queue.size, 1);
    assert.equal(second.snapshot().runtime.queue.size, 0);
    first.dispose();
    assert.equal(first.snapshot().disposed, true);
    assert.equal(first.snapshot().runtime.queue.disposed, true);
    assert.equal(first.queue.push([{type: "disposed"}]), 0);
    second.dispose();
});

test("workspace session registry snapshot normalization stays bounded", () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeSessionRegistrySnapshot({size: 99, maxSessions: 99, disposed: "yes", sessions: [{sessionId: "ws-12345678", disposed: false, runtime: {ok: true}, token: "drop"}, {sessionId: "bad"}]});
    assert.deepEqual(normalized, {size: 8, maxSessions: 8, disposed: false, sessions: [{sessionId: "ws-12345678", disposed: false, runtime: {ok: true}}]});
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeRegistryEvents([{sequence: 1, type: "created", sessionId: "ws-12345678"}, {sequence: 2, type: "secret", sessionId: "ws-12345678"}, {sequence: 3, type: "removed", sessionId: "bad"}]), [{sequence: 1, type: "created", sessionId: "ws-12345678"}]);
});

test("workspace session registry snapshot validation detects bounded consistency errors", () => {
    const valid = {size: 1, maxSessions: 2, disposed: false, sessions: [{sessionId: "ws-12345678", disposed: false, runtime: null}]};
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot(valid), {ok: true, maxSessions: 2, size: 1});
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot({...valid, size: 2}), {ok: false, reason: "size_mismatch"});
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot({...valid, sessions: [valid.sessions[0], valid.sessions[0]]}), {ok: false, reason: "duplicate_session"});
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot({...valid, disposed: true}), {ok: false, reason: "dispose_mismatch"});
    assert.equal(WORKSPACE_RUNTIME_SESSION_REGISTRY_SNAPSHOT_VERSION, 1);
    assert.equal(isWorkspaceCapabilityRuntimeSessionRegistrySnapshotCompatible({...valid, version: 2}), false);
    assert.deepEqual(validateWorkspaceCapabilityRuntimeSessionRegistrySnapshot({...valid, version: 2}), {ok: false, reason: "unsupported_version"});
});

test("workspace session registry snapshots expose a versioned bounded builder", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    registry.create();
    const snapshot = buildWorkspaceCapabilityRuntimeSessionRegistrySnapshot(registry);
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.size, 1);
    assert.equal(snapshot.sessions.length, 1);
    registry.dispose();
});

test("workspace session registry snapshot diff emits bounded lifecycle events", () => {
    const before = {size: 1, maxSessions: 2, disposed: false, sessions: [{sessionId: "ws-12345678", disposed: false, runtime: null}]};
    const after = {size: 1, maxSessions: 1, disposed: false, sessions: [{sessionId: "ws-87654321", disposed: true, runtime: null}]};
    assert.deepEqual(diffWorkspaceCapabilityRuntimeSessionRegistrySnapshots(before, after), [
        {type: "created", sessionId: "ws-87654321"},
        {type: "removed", sessionId: "ws-12345678"},
        {type: "capacity", size: 1, maxSessions: 1},
    ]);
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeSessionRegistryDiff([{type: "capacity", size: 99, maxSessions: 99}, {type: "disposed", sessionId: "bad"}]), [{type: "capacity", size: 8, maxSessions: 8}]);
});

test("workspace session registry summary stays bounded and marks invalid snapshots", () => {
    const summary = buildWorkspaceCapabilityRuntimeSessionRegistrySummary({size: 2, maxSessions: 2, disposed: false, sessions: [
        {sessionId: "ws-12345678", disposed: false, runtime: null},
        {sessionId: "ws-87654321", disposed: true, runtime: null},
    ]});
    assert.deepEqual(summary, {ok: true, reason: "ready", size: 2, maxSessions: 2, active: 1, disposed: 1, capacityAvailable: 0});
    assert.equal(buildWorkspaceCapabilityRuntimeSessionRegistrySummary({size: 2, maxSessions: 2, sessions: []}).ok, false);
});

test("workspace session registry diff queue is bounded, cursor-based, and disposable", () => {
    const queue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(2);
    const before = {size: 0, maxSessions: 2, disposed: false, sessions: []};
    const after = {size: 1, maxSessions: 2, disposed: false, sessions: [{sessionId: "ws-12345678", disposed: false, runtime: null}]};
    assert.equal(enqueueWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, before, after), 2);
    assert.deepEqual(queue.readSince(0), {cursor: 2, truncated: false, events: [{sequence: 1, event: {type: "created", sessionId: "ws-12345678"}}, {sequence: 2, event: {type: "capacity", size: 1, maxSessions: 2}}]});
    assert.equal(queue.acknowledge(1), 1);
    queue.dispose();
    assert.equal(queue.push([{type: "created", sessionId: "ws-87654321"}]), 0);
});

test("workspace session registry diff replay supports acknowledge and snapshot recovery", () => {
    const queue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(1);
    queue.push([{type: "created", sessionId: "ws-12345678"}]);
    const replay = readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplay(queue, 0, 8);
    assert.equal(replay.ok, true);
    assert.equal(commitWorkspaceCapabilityRuntimeSessionRegistryDiffReplay(queue, replay), 1);
    queue.push([{type: "created", sessionId: "ws-12345678"}]);
    queue.push([{type: "removed", sessionId: "ws-12345678"}]);
    const snapshot = {size: 0, maxSessions: 1, disposed: false, sessions: []};
    const recovered = recoverWorkspaceCapabilityRuntimeSessionRegistryDiff(queue, 0, 8, snapshot);
    assert.equal(recovered.mode, "snapshot");
    assert.equal(recovered.snapshot.size, 0);
    assert.equal(commitWorkspaceCapabilityRuntimeSessionRegistryDiffReplay(queue, {ok: false, reason: "snapshot_required", cursor: recovered.cursor}), 0);
});

test("workspace session registry diff replay cancellation and deadline preserve queue", () => {
    const queue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(2);
    queue.push([{type: "created", sessionId: "ws-12345678"}]);
    const controller = new AbortController();
    controller.abort();
    assert.equal(readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithSignal(queue, 0, 8, controller.signal).reason, "cancelled");
    assert.equal(readWorkspaceCapabilityRuntimeSessionRegistryDiffForReplayWithDeadline(queue, 0, 8, 100, 100).reason, "timeout");
    assert.equal(queue.size(), 1);
});

test("workspace session registry diff coordinator enforces safe commits and disposal", () => {
    const queue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(2);
    queue.push([{type: "created", sessionId: "ws-12345678"}]);
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator(queue);
    const controller = new AbortController();
    controller.abort();
    assert.equal(coordinator.recoverAndCommitWithSignal(0, 8, null, controller.signal).acknowledged, 0);
    const committed = coordinator.recoverAndCommit(0, 8, null);
    assert.equal(committed.acknowledged, 1);
    assert.equal(coordinator.commit(committed), 0);
    coordinator.dispose();
    assert.equal(coordinator.recover().reason, "diff_coordinator_disposed");
});

test("workspace session registry diff coordinator exposes bounded snapshot", () => {
    const queue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(2);
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator(queue);
    assert.deepEqual(coordinator.snapshot(), {coordinator: {lastCursor: 0, commits: 0, disposed: false}, queue: {size: 0, maxItems: 2, cursor: 0, disposed: false}});
    coordinator.dispose();
});

test("workspace registry diagnostics combine summary, queue, and coordinator safely", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    registry.create();
    const queue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(2);
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryDiffRecoveryCoordinator(queue);
    const diagnostics = buildWorkspaceCapabilityRuntimeSessionRegistryDiagnostics(registry, queue, coordinator);
    assert.equal(diagnostics.summary.active, 1);
    assert.equal(diagnostics.registry.size, 1);
    assert.equal(diagnostics.diffQueue.maxItems, 2);
    assert.equal(diagnostics.diffCoordinator.disposed, false);
    coordinator.dispose();
    registry.dispose();
});

test("workspace registry joint recovery coordinator commits both queues atomically", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const diffQueue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(2);
    diffQueue.push([{type: "created", sessionId: "ws-12345678"}]);
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryCoordinator(registry, diffQueue);
    const result = coordinator.recoverAndCommit(0, 0, 8, null);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "events");
    assert.equal(result.acknowledged, 2);
    assert.equal(coordinator.status().commits, 1);
    assert.equal(coordinator.commit(result), 0);
    coordinator.dispose();
    registry.dispose();
});

test("workspace registry joint recovery refuses partial success", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const diffQueue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(1);
    diffQueue.push([{type: "created", sessionId: "ws-12345678"}]);
    diffQueue.push([{type: "removed", sessionId: "ws-12345678"}]);
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryCoordinator(registry, diffQueue);
    const result = coordinator.recoverAndCommit(0, 0, 8, null);
    assert.equal(result.ok, false);
    assert.equal(result.acknowledged, 0);
    assert.equal(registry.eventsSince(0).events.length, 1);
    assert.equal(diffQueue.size(), 1);
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryResult({ok: true, mode: "events", registry: result.registry, diff: result.diff, acknowledged: 99}).acknowledged, 16);
    registry.dispose();
});

test("workspace registry joint recovery signal and deadline never partially acknowledge", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const diffQueue = createWorkspaceCapabilityRuntimeRegistryDiffQueue(1);
    diffQueue.push([{type: "created", sessionId: "ws-12345678"}]);
    diffQueue.push([{type: "removed", sessionId: "ws-12345678"}]);
    const coordinator = createWorkspaceCapabilityRuntimeSessionRegistryJointRecoveryCoordinator(registry, diffQueue);
    const controller = new AbortController();
    controller.abort();
    assert.equal(coordinator.recoverAndCommitWithSignal(0, 0, 8, null, controller.signal).reason, "cancelled");
    assert.equal(registry.eventsSince(0).events.length, 1);
    assert.equal(coordinator.recoverAndCommitWithDeadline(0, 0, 8, null, 100, 100).reason, "timeout");
    assert.equal(diffQueue.size(), 1);
    coordinator.dispose(); registry.dispose();
});

test("workspace registry diagnostics normalization strips unbounded fields", () => {
    const normalized = normalizeWorkspaceCapabilityRuntimeSessionRegistryDiagnostics({summary: {ok: true, reason: "ready", size: 99, maxSessions: 99, active: 99, disposed: 99, capacityAvailable: 99, secret: "drop"}, registry: {size: 99, maxSessions: 99, disposed: "yes"}, diffQueue: {size: 99, maxItems: 99, cursor: 9999999999, disposed: "yes"}, diffCoordinator: {lastCursor: 9999999999, commits: 99, disposed: "yes"}});
    assert.deepEqual(normalized, {summary: {ok: true, reason: "ready", size: 8, maxSessions: 8, active: 8, disposed: 8, capacityAvailable: 8}, registry: {size: 8, maxSessions: 8, disposed: false}, diffQueue: {size: 8, maxItems: 8, cursor: 2147483647, disposed: false}, diffCoordinator: {lastCursor: 2147483647, commits: 32, disposed: false}});
});

test("workspace registry diagnostics capability contract is read-only and bounded", () => {
    assert.equal(WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.name, "workspace-runtime-registry-diagnostics");
    assert.deepEqual(WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.inputSchema, {type: "object", properties: {}, additionalProperties: false});
    assert.deepEqual(WORKSPACE_RUNTIME_REGISTRY_DIAGNOSTICS_SPEC.outputSchema.required, ["summary", "registry", "diffQueue", "diffCoordinator"]);
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const handler = createWorkspaceCapabilityRuntimeSessionRegistryDiagnosticsHandler(registry);
    const output = handler({secret: "drop"});
    assert.equal(output.summary.active, 1);
    assert.equal(Object.hasOwn(output, "secret"), false);
    registry.dispose();
});

test("workspace session registry prunes idle sessions without touching recent ones", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    const stale = registry.create();
    const recent = registry.create();
    const now = Date.now() + 120000;
    registry.get(recent.sessionId, now);
    assert.equal(registry.pruneIdle(now, 60000), 1);
    assert.equal(registry.get(stale.sessionId), null);
    assert.equal(registry.get(recent.sessionId), recent);
    assert.equal(registry.pruneIdle(now, 0), 0);
    registry.dispose();
});

test("workspace registry events replay and snapshot recovery stay bounded", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    const first = registry.create();
    const second = registry.create();
    const replay = readWorkspaceCapabilityRuntimeRegistryEventsForReplay(registry, 0, 8);
    assert.equal(replay.ok, true);
    assert.equal(replay.events.length, 2);
    assert.equal(commitWorkspaceCapabilityRuntimeRegistryReplay(registry, replay), 2);
    assert.equal(registry.eventsSince(0).events.length, 0);
    first.dispose();
    second.dispose();
    const overflow = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    for (let index = 0; index < 5; index += 1) overflow.create();
    const recovered = recoverWorkspaceCapabilityRuntimeRegistry(overflow, 0);
    assert.equal(recovered.ok, true);
    assert.equal(recovered.mode, "snapshot");
    assert.equal(recovered.snapshot.maxSessions, 1);
    registry.dispose();
    overflow.dispose();
});

test("workspace registry replay cancellation and deadline never acknowledge events", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    registry.create();
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithSignal(registry, 0, 8, controller.signal), {ok: false, reason: "cancelled", cursor: 0, events: []});
    assert.equal(registry.eventsSince(0).events.length, 1);
    assert.deepEqual(readWorkspaceCapabilityRuntimeRegistryEventsForReplayWithDeadline(registry, 0, 8, 100, 100), {ok: false, reason: "timeout", cursor: 0, events: []});
    assert.equal(registry.eventsSince(0).events.length, 1);
    registry.dispose();
});

test("workspace registry recovery coordinator enforces monotonic commits and disposal", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const coordinator = createWorkspaceCapabilityRuntimeRegistryRecoveryCoordinator(registry);
    const recovery = coordinator.recoverAndCommit(0, 8);
    assert.equal(recovery.ok, true);
    assert.equal(recovery.mode, "events");
    assert.equal(recovery.acknowledged, 1);
    assert.equal(coordinator.commit(recovery), 0);
    assert.equal(coordinator.status().lastCursor, recovery.cursor);
    for (let index = 0; index < 10; index += 1) registry.create();
    const snapshot = coordinator.recover(0);
    assert.equal(snapshot.mode, "snapshot");
    assert.equal(coordinator.commit(snapshot) > 0, true);
    coordinator.dispose();
    assert.deepEqual(coordinator.recover(), {ok: false, mode: "unavailable", reason: "registry_coordinator_disposed", cursor: snapshot.cursor, events: [], snapshot: null});
    registry.dispose();
});

test("workspace registry recovery normalizes failures and isolates registry exceptions", () => {
    const broken = {eventsSince() { throw new Error("secret"); }};
    assert.deepEqual(readWorkspaceCapabilityRuntimeRegistryEventsForReplay(broken), {ok: false, reason: "registry_unavailable", cursor: 0, events: []});
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: true, mode: "events", reason: "secret", cursor: 99, events: [{sequence: 1, type: "created", sessionId: "ws-12345678", token: "drop"}]}), {ok: true, mode: "events", reason: "ready", cursor: 99, events: [{sequence: 1, type: "created", sessionId: "ws-12345678"}], snapshot: null});
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeRegistrySafe(broken, 0, 8, controller.signal), {ok: false, mode: "cancelled", reason: "cancelled", cursor: 0, events: [], snapshot: null});
});

test("workspace registry snapshot recovery rejects inconsistent snapshots", () => {
    const broken = {
        eventsSince() { return {cursor: 9, truncated: true, events: []}; },
        snapshot() { return {size: 2, maxSessions: 2, disposed: false, sessions: [{sessionId: "ws-12345678", disposed: false, runtime: null}]}; },
    };
    assert.deepEqual(recoverWorkspaceCapabilityRuntimeRegistry(broken, 0), {ok: false, mode: "invalid_snapshot", reason: "invalid_snapshot", cursor: 9, events: [], snapshot: null});
    assert.deepEqual(normalizeWorkspaceCapabilityRuntimeRegistryRecoveryResult({ok: false, mode: "invalid_snapshot", reason: "invalid_snapshot", cursor: 9, snapshot: {}}), {ok: false, mode: "invalid_snapshot", reason: "invalid_snapshot", cursor: 9, events: [], snapshot: null});
    const unsupported = {...broken, snapshot() { return {version: 2, size: 0, maxSessions: 1, disposed: false, sessions: []}; }};
    assert.equal(recoverWorkspaceCapabilityRuntimeRegistry(unsupported, 0).reason, "unsupported_version");
});

test("workspace registry coordinator signal and deadline paths remain bounded", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const coordinator = createWorkspaceCapabilityRuntimeRegistryRecoveryCoordinator(registry);
    const controller = new AbortController();
    controller.abort();
    assert.equal(coordinator.recoverWithSignal(0, 8, controller.signal).reason, "cancelled");
    assert.equal(coordinator.recoverWithDeadline(0, 8, 100, 100).reason, "timeout");
    assert.equal(registry.eventsSince(0).events.length, 1);
    coordinator.dispose();
    registry.dispose();
});

test("workspace registry coordinator combined signal/deadline recovery commits only success", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(1);
    registry.create();
    const coordinator = createWorkspaceCapabilityRuntimeRegistryRecoveryCoordinator(registry);
    const controller = new AbortController();
    controller.abort();
    assert.equal(coordinator.recoverAndCommitWithSignal(0, 8, controller.signal).acknowledged, 0);
    assert.equal(registry.eventsSince(0).events.length, 1);
    const committed = coordinator.recoverAndCommitWithDeadline(0, 8, 200, 100);
    assert.equal(committed.ok, true);
    assert.equal(committed.acknowledged, 1);
    assert.equal(registry.eventsSince(0).events.length, 0);
    registry.dispose();
});

test("workspace runtime session snapshots are versioned and normalized", () => {
    const session = createWorkspaceCapabilityRuntimeSession(2);
    const snapshot = buildWorkspaceCapabilityRuntimeSessionSnapshot(session);
    assert.equal(snapshot.version, WORKSPACE_RUNTIME_SESSION_SNAPSHOT_VERSION);
    assert.match(snapshot.sessionId, /^ws-[a-z0-9]{8}$/);
    const normalized = normalizeWorkspaceCapabilityRuntimeSessionSnapshot({...snapshot, disposed: "yes", token: "drop"});
    assert.deepEqual(normalized, {...snapshot, disposed: false});
    assert.equal(Object.hasOwn(normalized, "token"), false);
    session.dispose();
});

test("workspace runtime session registry stays bounded and disposes sessions", () => {
    const registry = createWorkspaceCapabilityRuntimeSessionRegistry(2);
    assert.equal(MAX_RUNTIME_SESSIONS, 8);
    const first = registry.create();
    const second = registry.create();
    const third = registry.create();
    assert.equal(registry.size(), 2);
    assert.deepEqual(registry.events(2).map((event) => event.type), ["created", "evicted"]);
    assert.equal(registry.eventCursor(), 4);
    assert.deepEqual(registry.eventsSince(1), {cursor: 4, truncated: false, events: [{sequence: 2, type: "created", sessionId: second.sessionId}, {sequence: 3, type: "created", sessionId: third.sessionId}, {sequence: 4, type: "evicted", sessionId: first.sessionId}]});
    assert.equal(registry.acknowledgeEvents(2), 2);
    assert.equal(first.snapshot().disposed, true);
    assert.equal(registry.get(second.sessionId), second);
    assert.equal(registry.remove(second.sessionId), true);
    assert.equal(registry.remove(second.sessionId), false);
    assert.equal(registry.size(), 1);
    assert.equal(registry.snapshot().sessions.length, 1);
    assert.deepEqual(registry.status(), {size: 1, maxSessions: 2, disposed: false});
    assert.equal(registry.prune(), 0);
    const stale = registry.create();
    stale.dispose();
    assert.equal(registry.prune(), 1);
    assert.equal(registry.get(stale.sessionId), null);
    registry.dispose();
    assert.equal(third.snapshot().disposed, true);
    assert.equal(registry.create(), null);
    assert.deepEqual(registry.status(), {size: 0, maxSessions: 2, disposed: true});
});

test("workspace capability host probe stays stable and side-effect free", () => {
    assert.deepEqual(PROBE_REASONS, ["ready", "unavailable", "timeout", "cancelled", "failed"]);
    assert.deepEqual(probeWorkspaceCapabilityHost({addAgentCapability: () => true}), {ok: true, reason: "ready"});
    assert.deepEqual(probeWorkspaceCapabilityHost({}), {ok: false, reason: "unavailable"});
    assert.deepEqual(normalizeWorkspaceCapabilityProbeOutcome({kind: "timeout"}), {ok: false, reason: "timeout"});
    assert.deepEqual(normalizeWorkspaceCapabilityProbeOutcome({kind: "cancelled"}), {ok: false, reason: "cancelled"});
    assert.deepEqual(normalizeWorkspaceCapabilityProbeOutcome({kind: "unknown", message: "secret"}), {ok: false, reason: "failed"});
    assert.deepEqual(buildWorkspaceCapabilityProbeSnapshot({}), {available: false, reason: "unavailable"});
    assert.deepEqual(buildWorkspaceCapabilityProbeSnapshot({addAgentCapability: () => true}, {kind: "ready"}), {available: true, reason: "ready"});
});

test("workspace plan summary exposes counts without content", () => {
    const plan = buildWorkspacePlan({steps: [
        {action: "open-documents", ids: ["20260913083000-abcdef", "20260913083001-abcdef"]},
        {action: "append-to-journal", content: "秘密正文不应进入摘要"},
    ]}, 1700000000000);
    assert.deepEqual(buildWorkspacePlanSummary(plan), {
        planId: plan.planId,
        stepCount: 2,
        targetCount: 3,
        navigationSteps: 1,
        writeSteps: 1,
        requiresConfirmation: true,
        requiresWrite: true,
    });
    assert.equal(Object.hasOwn(buildWorkspacePlanSummary(plan), "content"), false);
    assert.equal(buildWorkspacePlanSummary(null), null);
});

test("workspace action results stay within stable bounded output", () => {
    assert.deepEqual(normalizeWorkspaceActionResult("open-document", {
        status: "completed", id: "20260913083000-abcdef", title: "secret", raw: {body: "drop"},
    }), {status: "completed", id: "20260913083000-abcdef"});
    assert.deepEqual(normalizeWorkspaceActionResult("open-documents", {
        status: "completed", opened: ["20260913083000-abcdef", "bad", "20260913083000-abcdef"], failed: ["20260913083001-abcdef"],
    }), {status: "completed", opened: ["20260913083000-abcdef"], failed: ["20260913083001-abcdef"]});
    assert.deepEqual(normalizeWorkspaceActionResult("create-document", {status: "failed", reason: "not found!", docId: "20260913083002-abcdef", message: "secret"}), {
        status: "failed", reason: "notfound",
    });
    assert.deepEqual(normalizeWorkspaceActionResult("update-task-status", {status: "completed", id: "bad", done: true}), {status: "failed", reason: "missing_result"});
});

test("workspace action postconditions reject false completed results", () => {
    assert.deepEqual(validateWorkspaceActionPostcondition("open-document", {status: "completed"}), {status: "failed", reason: "missing_result"});
    assert.deepEqual(validateWorkspaceActionPostcondition("update-task-status", {status: "completed", id: "20260913083000-abcdef"}), {status: "failed", reason: "missing_result"});
    assert.deepEqual(validateWorkspaceActionPostcondition("create-document", {status: "completed"}), {status: "failed", reason: "missing_result"});
    assert.deepEqual(validateWorkspaceActionPostcondition("restore-document-set", {status: "completed"}), {status: "completed"});
    assert.deepEqual(validateWorkspaceActionPostcondition("open-document", {status: "failed", reason: "x"}), {status: "failed", reason: "x"});
});







test("flattenOutline flattens nested headings with depth and bounds", () => {
    const nested = [
        {id: "20260101000001-aaaaaaa", name: "第一章", depth: 0, blocks: [
            {id: "20260101000002-bbbbbbb", name: "1.1 小节", depth: 1, blocks: [
                {id: "20260101000003-ccccccc", name: "1.1.1 细节", depth: 2},
            ]},
        ]},
        {id: "20260101000004-ddddddd", name: "第二章", depth: 0},
    ];
    const flat = flattenOutline(nested, 48);
    assert.deepEqual(flat.map((item) => item.title), ["第一章", "1.1 小节", "1.1.1 细节", "第二章"]);
    assert.deepEqual(flat.map((item) => item.depth), [0, 1, 2, 0]);
});

test("flattenOutline respects the limit and skips malformed nodes", () => {
    const nodes = Array.from({length: 20}, (_, i) => ({id: `2026010100000${String(i).padStart(2, "0")}-aaaaaaa`, name: `标题 ${i}`, depth: 0}));
    assert.equal(flattenOutline(nodes, 5).length, 5);
    // 缺 id / 缺标题 / 非对象节点被跳过
    const messy = [
        {name: "无 id"},
        {id: "20260101000001-aaaaaaa"},
        null,
        {id: "20260101000002-bbbbbbb", name: "有效"},
    ];
    assert.deepEqual(flattenOutline(messy, 48).map((item) => item.title), ["有效"]);
    assert.deepEqual(flattenOutline("bad", 48), []);
    // 超深层级被钳制到 8
    assert.equal(flattenOutline([{id: "20260101000003-ccccccc", name: "深", depth: 99}], 48)[0].depth, 8);
});

test("agent capabilities declare actionEffects per action name (ADR 0063)", () => {
    const captured = [];
    const host = {addAgentCapability: (options) => { captured.push(options); return "handle"; }};
    const effects = {localRead: true, localWrite: false, dataEgress: false, externalCost: false};
    registerReadOnlyAgentCapabilities(host, [{spec: {name: "get-document-outline"}, handler: async () => ({})}]);
    registerAgentActionCapability(host, {spec: AGENT_CAPABILITY_SPECS.openDocument, effects, handler: async () => ({})});
    registerAgentActionCapability(host, {spec: AGENT_CAPABILITY_SPECS.openDocuments, effects: {localRead: true, localWrite: true, dataEgress: false, externalCost: false}, handler: async () => ({})});
    // 每个注册必须携带 actionEffects，且动作名键的效果与 effects 声明一致
    for (const entry of captured) {
        const declared = entry.actionEffects && entry.actionEffects[entry.name];
        assert.ok(declared, `${entry.name} must declare actionEffects keyed by its action name`);
        assert.deepEqual(declared, entry.effects, `${entry.name} actionEffects must mirror effects`);
    }
    const byName = new Map(captured.map((entry) => [entry.name, entry]));
    // 受控导航单开必须显式 localRead（免确认）；批量必须 localWrite（宿主确认卡承担确认）
    assert.equal(byName.get("open-document").effects.localRead, true);
    assert.equal(byName.get("open-document").effects.localWrite, false);
    assert.equal(byName.get("open-documents").effects.localWrite, true);
    // 生产接线源码断言：openDocuments 的 effects 必须声明 localWrite（宿主确认卡）
    const indexSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "index.ts"), "utf8");
    assert.match(indexSource, /AGENT_CAPABILITY_SPECS\.openDocuments,\s*effects: \{localRead: true, localWrite: true/,
        "openDocuments production effects must declare localWrite for the host confirmation chain");
});

test("workspace plan execution chain is wired through the host route (T-6680, ADR 0063)", () => {
    const {readSourceText} = require("./source-scan.cjs");
    const source = readSourceText(require("node:path").join(__dirname, "..", "src", "index.ts"));
    // propose 只读 + execute 整单确认的双能力必须接线
    assert.match(source, /registerWorkspacePlanCapabilities/,
        "the workspace plan capabilities registrar must exist and be invoked");
    assert.match(source, /WORKSPACE_PLAN_SPEC,/, "propose capability must use WORKSPACE_PLAN_SPEC");
    assert.match(source, /spec: WORKSPACE_EXECUTE_SPEC,/, "execute capability must use WORKSPACE_EXECUTE_SPEC");
    assert.match(source, /effects: \{localRead: true, localWrite: true, dataEgress: false, externalCost: false\},[\s\S]{0,400}?const plan = args\?\.plan/,
        "execute capability must declare localWrite (host confirmation card = approval unit)");
    // 执行必须走契约模块状态机 + 固定动作注册表
    assert.match(source, /runWorkspacePlan\(plan, \{/, "execution must go through the runWorkspacePlan state machine");
    assert.match(source, /approved: true,/, "host-route execution treats the confirmation card as approval");
    assert.match(source, /createWorkspaceHostHandlers\(\{/, "fixed actions must come from the contract registry");
    // 自建审批管线符号禁止回流生产
    assert.doesNotMatch(source, /agent-workspace-bridge|ApprovalToken|WorkspaceApprovalChallenge/,
        "self-built approval pipeline symbols must stay retired");
    // T-6692b 灰度开关：execute 处理器必须响应 agentActionsEnabled 总开关
    assert.match(source, /if \(this\.getSettings\(\)\.agentActionsEnabled === false\) return \{error: "agent actions disabled"\};/,
        "the execute capability must honor the agentActionsEnabled kill switch");
});
