const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    AGENT_CAPABILITY_SPECS,
    flattenOutline,
} = require('../src/agent-capabilities.js');
const {DOCUMENT_CONTEXT_SPEC, buildDocumentContext} = require('../src/agent-document-context.js');
const {WORKSPACE_PLAN_SPEC, WORKSPACE_PLAN_RECEIPT_SCHEMA, buildWorkspacePlan, isWorkspacePlanExpired, validateWorkspacePlan, buildWorkspaceReceipt, runWorkspacePlan} = require('../src/agent-workspace-plan.js');
const {ACTION_KEYS, WORKSPACE_ACTION_SPECS, normalizeWorkspaceStep, normalizeWorkspaceActionResult, validateWorkspaceActionPostcondition, createWorkspaceActionExecutor, buildWorkspacePlanSummary} = require('../src/agent-workspace-actions.js');
const {normalizePlanId, workspacePlanDigest, createWorkspaceExecutionGuard, executeWorkspacePlan} = require('../src/agent-workspace-execution.js');
const {EXECUTE_WORKSPACE_PLAN_SPEC, normalizeExecutionRequest, buildExecutionGateResult} = require('../src/agent-workspace-capability.js');
const {normalizeToken, createApprovalTokenStore} = require('../src/agent-approval-token.js');
const {createWorkspaceApprovalChallenge, validateWorkspaceApprovalChallenge} = require('../src/agent-workspace-approval.js');
const {createNavigationActionHandlers} = require('../src/agent-host-actions.js');
const {createDocumentSetRestoreHandler} = require('../src/agent-document-set-actions.js');
const {createDocumentSet} = require('../src/document-sets.js');
const {createWriteActionHandlers} = require('../src/agent-write-actions.js');
const {createWorkspaceHostHandlers} = require('../src/agent-workspace-registry.js');
const {createWorkspaceExecutionSession} = require('../src/agent-workspace-session.js');
const {createWorkspaceAgentBridge, MAX_STORED_PLANS, WORKSPACE_PLAN_HANDLER_SPEC, EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC, createWorkspacePlanHandler, createWorkspaceExecuteHandler} = require('../src/agent-workspace-bridge.js');
const {WORKSPACE_PLAN_EFFECTS, EXECUTE_WORKSPACE_PLAN_EFFECTS, createWorkspaceCapabilityDefinitions, registerWorkspaceCapabilityDefinitions, disposeWorkspaceCapabilityRegistrations, createWorkspaceCapabilityLifecycle, normalizeWorkspaceCapabilityHandle, buildWorkspaceCapabilityRuntimeSnapshot, WORKSPACE_RUNTIME_SNAPSHOT_VERSION, normalizeWorkspaceCapabilityRuntimeSnapshot, isWorkspaceCapabilityRuntimeSnapshotCompatible, validateWorkspaceCapabilityRuntimeSnapshot, diffWorkspaceCapabilityRuntimeSnapshots, buildWorkspaceCapabilityRuntimeEvents, normalizeWorkspaceCapabilityRuntimeEvents, createWorkspaceCapabilityEventQueue, enqueueWorkspaceCapabilityRuntimeDiff, readWorkspaceCapabilityRuntimeEventsForReplay, recoverWorkspaceCapabilityRuntime, recoverWorkspaceCapabilityRuntimeWithSignal, recoverWorkspaceCapabilityRuntimeWithDeadline, normalizeWorkspaceCapabilityRuntimeRecoveryResult, recoverWorkspaceCapabilityRuntimeSafe, commitWorkspaceCapabilityRuntimeRecovery, recoverAndCommitWorkspaceCapabilityRuntime, createWorkspaceCapabilityRecoveryCoordinator, createWorkspaceCapabilityRuntimeSession} = require('../src/agent-workspace-capability-definitions.js');
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
    assert.deepEqual(context, {
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

test("workspace execution session issues, executes once, and disposes state", async () => {
    const opened = [];
    const session = createWorkspaceExecutionSession({
        navigation: {isMobile: false, app: {}, openTab: async ({doc}) => opened.push(doc.id)},
        documentSet: {getSet: async () => null, openDocument: async () => true},
    });
    const plan = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    const challenge = session.issue({...plan}, "desktop", 1700000000100);
    assert.equal(challenge.planId, plan.planId);
    const preview = session.preview(buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083001-abcdef"}]}, 1700000000010), "desktop", 1700000000100);
    assert.equal(preview.stepCount, 1);
    assert.equal(preview.requiresConfirmation, true);
    assert.equal(Object.hasOwn(preview, "content"), false);
    const receipt = await session.execute(plan, challenge, {now: 1700000000101});
    assert.equal(receipt.status, "completed");
    assert.deepEqual(opened, ["20260913083000-abcdef"]);
    const replay = await session.execute(plan, challenge, {now: 1700000000102});
    assert.equal(replay.status, "consumed");
    session.dispose();
    const afterDispose = await session.execute(plan, challenge, {now: 1700000000103});
    assert.equal(afterDispose.status, "invalid_token");
});

test("workspace agent bridge provides bounded plan issue execute lifecycle", async () => {
    const opened = [];
    const bridge = createWorkspaceAgentBridge({
        maxPlans: 1,
        navigation: {isMobile: false, app: {}, openTab: async ({doc}) => opened.push(doc.id)},
        documentSet: {getSet: async () => null, openDocument: async () => true},
    });
    assert.equal(MAX_STORED_PLANS, 32);
    const plan = bridge.plan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    assert.equal(plan.summary.stepCount, 1);
    assert.deepEqual(bridge.status(), {planCount: 1, maxPlans: 1, disposed: false});
    const challenge = bridge.issue(plan.planId, "desktop", 1700000000100);
    assert.equal(challenge.planId, plan.planId);
    const preview = bridge.preview(plan.planId, "desktop", 1700000000100);
    assert.equal(preview.planId, plan.planId);
    assert.equal(preview.stepCount, 1);
    assert.equal(Object.hasOwn(preview, "content"), false);
    assert.equal(bridge.preview("wp-missing"), null);
    const result = await bridge.execute(challenge, 1700000000101);
    assert.equal(result.status, "completed");
    assert.deepEqual(opened, ["20260913083000-abcdef"]);
    const unknown = await bridge.execute({...challenge, planId: "wp-missing"}, 1700000000101);
    assert.equal(unknown.status, "plan_not_found");
    const expiredPlan = bridge.plan({steps: [{action: "open-document", id: "20260913083001-abcdef"}]}, 1700000000000);
    assert.equal(bridge.size(), 1);
    assert.equal(bridge.prune(expiredPlan.expiresAt), 1);
    assert.equal(bridge.size(), 0);
    assert.deepEqual(bridge.status(), {planCount: 0, maxPlans: 1, disposed: false});
    assert.equal(bridge.prune(expiredPlan.expiresAt + 1), 0);
    bridge.dispose();
    assert.equal(bridge.size(), 0);
    assert.deepEqual(bridge.status(), {planCount: 0, maxPlans: 1, disposed: true});
    assert.equal(bridge.plan({steps: [{action: "open-document", id: "20260913083002-abcdef"}]}, 1700000000000), null);
    assert.equal(bridge.issue(plan.planId), null);
    assert.equal(bridge.preview(plan.planId), null);
    assert.deepEqual(await bridge.execute(challenge), {planId: "", status: "bridge_disposed", receipt: ""});
    bridge.dispose();
});

test("workspace bridge handler factories expose structured capability results", async () => {
    assert.equal(WORKSPACE_PLAN_HANDLER_SPEC.name, "workspace-plan");
    assert.equal(EXECUTE_WORKSPACE_PLAN_HANDLER_SPEC.name, "execute-workspace-plan");
    const bridge = createWorkspaceAgentBridge({
        navigation: {isMobile: false, app: {}, openTab: async () => true},
        documentSet: {getSet: async () => null, openDocument: async () => true},
    });
    const planHandler = createWorkspacePlanHandler(bridge, () => 1700000000000);
    const planned = await planHandler({steps: [{action: "open-document", id: "20260913083000-abcdef"}]});
    assert.equal(planned.structuredContent.planId.startsWith("wp-"), true);
    assert.equal(planned.result, JSON.stringify(planned.structuredContent));
    assert.deepEqual(await createWorkspacePlanHandler(bridge, () => 1700000000000)({steps: []}), {error: "invalid_plan"});

    const executeHandler = createWorkspaceExecuteHandler({execute: async (request, now) => ({status: "completed", planId: request.planId, now})}, () => 1700000000010);
    const executed = await executeHandler({planId: "wp-test", digest: "pd-test", approvalToken: "at-test"});
    assert.deepEqual(executed.structuredContent, {status: "completed", planId: "wp-test", now: 1700000000010});
    assert.equal(executed.result, JSON.stringify(executed.structuredContent));
    assert.deepEqual(await createWorkspaceExecuteHandler(null)({}), {error: "executor_unavailable"});
    assert.deepEqual(await createWorkspacePlanHandler({plan: () => { throw new Error("secret"); }})({steps: []}), {error: "invalid_plan"});
    assert.deepEqual(await createWorkspaceExecuteHandler({execute: async () => { throw new Error("secret"); }})({}), {error: "executor_unavailable"});
    bridge.dispose();
});

test("workspace capability definitions are data-driven and effect-scoped", async () => {
    assert.deepEqual(WORKSPACE_PLAN_EFFECTS, {localRead: true, localWrite: false, dataEgress: false, externalCost: false});
    assert.deepEqual(EXECUTE_WORKSPACE_PLAN_EFFECTS, {localRead: true, localWrite: true, dataEgress: false, externalCost: false});
    const calls = [];
    const bridge = {
        plan: (args, now) => ({planId: "wp-def", steps: args.steps, now}),
        execute: async (args, now) => { calls.push({args, now}); return {planId: args.planId, status: "completed", receipt: "rc-def"}; },
    };
    const definitions = createWorkspaceCapabilityDefinitions(bridge, () => 1700000000042);
    assert.equal(Object.isFrozen(definitions), true);
    assert.deepEqual(definitions.map((item) => item.spec.name), ["workspace-plan", "execute-workspace-plan"]);
    assert.deepEqual(definitions[0].effects, WORKSPACE_PLAN_EFFECTS);
    assert.deepEqual(definitions[1].effects, EXECUTE_WORKSPACE_PLAN_EFFECTS);
    const planned = await definitions[0].handler({steps: [{action: "open-document", id: "20260913083000-abcdef"}]});
    assert.equal(planned.structuredContent.planId, "wp-def");
    const executed = await definitions[1].handler({planId: "wp-def", digest: "pd-abcdef", approvalToken: "at-valid"});
    assert.equal(executed.structuredContent.status, "completed");
    assert.equal(calls[0].now, 1700000000042);
});

test("workspace capability registration enforces known names and effects", () => {
    const calls = [];
    const host = {addAgentCapability: (definition) => { calls.push(definition); return `registered:${definition.name}`; }};
    const definitions = createWorkspaceCapabilityDefinitions({plan: () => null, execute: async () => ({})});
    const registered = registerWorkspaceCapabilityDefinitions(host, [
        definitions[0],
        {...definitions[1], effects: WORKSPACE_PLAN_EFFECTS},
        {spec: {name: "unknown-capability"}, handler: () => true},
        {spec: {...definitions[0].spec}, handler: () => true},
        {spec: definitions[0].spec, handler: "not-a-function"},
    ]);
    assert.deepEqual(registered, ["registered:workspace-plan", "registered:execute-workspace-plan"]);
    assert.deepEqual(calls[0].effects, WORKSPACE_PLAN_EFFECTS);
    assert.deepEqual(calls[1].effects, EXECUTE_WORKSPACE_PLAN_EFFECTS);
    assert.equal(typeof calls[0].handler, "function");
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
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {plan: () => null, execute: async () => ({})});
    assert.deepEqual(lifecycle.probe(), {available: true, reason: "ready"});
    const first = lifecycle.register();
    const second = lifecycle.register();
    assert.deepEqual(second, first);
    assert.equal(lifecycle.size(), 2);
    assert.equal(events.filter((item) => item.startsWith("add:")).length, 2);
    assert.deepEqual(lifecycle.status(), {registered: 2, failed: 0, unmanaged: 0, disposed: false});
    assert.deepEqual(lifecycle.snapshot(), {
        host: {available: true, reason: "ready"},
        registration: {registered: 2, failed: 0, unmanaged: 0, disposed: false},
    });
    assert.equal(lifecycle.dispose(), 2);
    assert.equal(lifecycle.dispose(), 0);
    assert.equal(lifecycle.size(), 0);
    assert.deepEqual(lifecycle.status(), {registered: 0, failed: 0, unmanaged: 0, disposed: true});
    assert.deepEqual(lifecycle.register(), []);
    assert.equal(events.filter((item) => item.startsWith("add:")).length, 2);
});

test("workspace capability lifecycle reports bounded partial registration failures", () => {
    const errors = [];
    const host = {addAgentCapability: ({name}) => {
        if (name === "execute-workspace-plan") throw new Error("secret");
        return "workspace-plan-handle";
    }};
    const lifecycle = createWorkspaceCapabilityLifecycle(host, {}, Date.now, (error) => errors.push(error));
    assert.deepEqual(lifecycle.probe(), {available: true, reason: "ready"});
    assert.deepEqual(lifecycle.register(), ["workspace-plan-handle"]);
    assert.deepEqual(lifecycle.status(), {registered: 1, failed: 1, unmanaged: 0, disposed: false});
    assert.equal(errors.length, 1);
    assert.equal(lifecycle.register().length, 1);
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

test("workspace execution guard prevents replay and stays bounded", () => {
    const plan = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    assert.equal(normalizePlanId(plan.planId), plan.planId);
    assert.equal(normalizePlanId("javascript:bad"), "");
    const guard = createWorkspaceExecutionGuard(1);
    assert.deepEqual(guard.begin(plan, false, 1700000000100), {ok: false, reason: "denied"});
    const digest = workspacePlanDigest(plan);
    assert.equal(digest.startsWith("pd-"), true);
    assert.equal(guard.begin(plan, {approved: true, digest: "pd-invalid"}, 1700000000100).reason, "digest_mismatch");
    assert.deepEqual(guard.begin(plan, {approved: true, digest}, 1700000000100), {ok: true, planId: plan.planId});
    assert.equal(guard.begin(plan, true, 1700000000101).reason, "already_running");
    assert.equal(guard.finish(plan.planId, "rc-abc", "partial"), true);
    assert.deepEqual(guard.get(plan.planId), {status: "partial", receipt: "rc-abc"});
    assert.equal(guard.begin(plan, true, 1700000000102).reason, "already_consumed");
    const other = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083001-abcdef"}]}, 1700000000001);
    assert.equal(guard.begin(other, true, 1700000000100).ok, true);
    assert.equal(guard.get(plan.planId), null);
});

test("workspace orchestrator binds approval digest and consumes once", async () => {
    const plan = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    const guard = createWorkspaceExecutionGuard();
    const calls = [];
    const digest = workspacePlanDigest(plan);
    const receipt = await executeWorkspacePlan(plan, {
        guard, approved: true, digest, now: 1700000000100,
        runStep: async (step) => { calls.push(step.action); return {status: "completed"}; },
    });
    assert.equal(receipt.status, "completed");
    assert.deepEqual(calls, ["open-document"]);
    const replay = await executeWorkspacePlan(plan, {guard, approved: true, digest, now: 1700000000101, runStep: async () => ({status: "completed"})});
    assert.equal(replay.status, "already_consumed");
});

test("workspace orchestrator validates and consumes approval token before steps", async () => {
    const base = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    const plan = {...base, digest: workspacePlanDigest(base)};
    const approvalStore = createApprovalTokenStore();
    const token = approvalStore.issue(plan, "desktop", 1700000000100, "integration");
    let calls = 0;
    const options = {
        approvalStore, approvalToken: token, guard: createWorkspaceExecutionGuard(), approved: true,
        digest: plan.digest, device: "desktop", now: 1700000000101,
        runStep: async () => { calls += 1; return {status: "completed"}; },
    };
    const receipt = await executeWorkspacePlan(plan, options);
    assert.equal(receipt.status, "completed");
    assert.equal(calls, 1);
    const replay = await executeWorkspacePlan(plan, {...options, now: 1700000000102});
    assert.equal(replay.status, "consumed");
    assert.equal(calls, 1);
    const otherToken = approvalStore.issue(plan, "sidebar", 1700000000100, "other");
    const mismatch = await executeWorkspacePlan(plan, {...options, approvalToken: otherToken, device: "desktop", guard: createWorkspaceExecutionGuard(), now: 1700000000103});
    assert.equal(mismatch.status, "binding_mismatch");
});

test("execute-workspace-plan contract requires digest and one-time approval token", () => {
    assert.equal(EXECUTE_WORKSPACE_PLAN_SPEC.name, "execute-workspace-plan");
    assert.deepEqual(EXECUTE_WORKSPACE_PLAN_SPEC.inputSchema.required, ["planId", "digest", "approvalToken"]);
    assert.equal(EXECUTE_WORKSPACE_PLAN_SPEC.inputSchema.additionalProperties, false);
    const valid = normalizeExecutionRequest({planId: "wp-l8-abc123", digest: "pd-abc123", approvalToken: "approve_123", device: "sidebar"});
    assert.deepEqual(valid, {planId: "wp-l8-abc123", digest: "pd-abc123", approvalToken: "approve_123", device: "sidebar"});
    assert.equal(normalizeExecutionRequest({...valid, approvalToken: "short"}), null);
    assert.equal(normalizeExecutionRequest({...valid, digest: "bad"}), null);
    assert.deepEqual(buildExecutionGateResult(valid, "expired"), {planId: "wp-l8-abc123", status: "expired", receipt: ""});
});

test("approval token binds plan digest, device and one-time consumption", () => {
    const base = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    const plan = {...base, digest: workspacePlanDigest(base)};
    const store = createApprovalTokenStore(1);
    const token = store.issue(plan, "sidebar", 1700000000100, "fixture");
    assert.match(token, /^at-[a-z0-9]{8,16}$/);
    assert.equal(normalizeToken(token), token);
    assert.equal(store.validate(token, {planId: plan.planId, digest: plan.digest, device: "desktop"}, 1700000000101).reason, "binding_mismatch");
    assert.deepEqual(store.validate(token, {planId: plan.planId, digest: plan.digest, device: "sidebar"}, 1700000000101), {ok: true, planId: plan.planId, device: "sidebar"});
    assert.deepEqual(store.consume(token, {planId: plan.planId, digest: plan.digest, device: "sidebar"}, 1700000000102), {ok: true, planId: plan.planId, device: "sidebar"});
    assert.equal(store.validate(token, {planId: plan.planId, digest: plan.digest, device: "sidebar"}).reason, "consumed");
    const other = {...buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083001-abcdef"}]}, 1700000000001), digest: "pd-abcdef"};
    const second = store.issue(other, "desktop", 1700000000100, "other");
    assert.ok(second);
    assert.equal(store.size(), 1);
    assert.equal(store.validate(token, {planId: plan.planId, digest: plan.digest, device: "sidebar"}).reason, "invalid_token");
});

test("workspace approval challenge binds immutable plan metadata", () => {
    const plan = buildWorkspacePlan({steps: [{action: "open-document", id: "20260913083000-abcdef"}]}, 1700000000000);
    const store = createApprovalTokenStore();
    const challenge = createWorkspaceApprovalChallenge(plan, store, "sidebar", 1700000000100);
    assert.deepEqual(Object.keys(challenge).sort(), ["approvalToken", "device", "digest", "expiresAt", "planId"]);
    assert.equal(challenge.planId, plan.planId);
    assert.equal(challenge.device, "sidebar");
    assert.deepEqual(validateWorkspaceApprovalChallenge(challenge, plan, 1700000000101), {ok: true, planId: plan.planId, device: "sidebar"});
    assert.equal(validateWorkspaceApprovalChallenge({...challenge, digest: "pd-tampered"}, plan, 1700000000101).reason, "digest_mismatch");
    assert.equal(validateWorkspaceApprovalChallenge({...challenge, expiresAt: plan.expiresAt + 1}, plan, 1700000000101).reason, "expiry_mismatch");
    assert.equal(createWorkspaceApprovalChallenge(plan, store, "desktop", plan.expiresAt), null);
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
