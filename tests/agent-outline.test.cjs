const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    AGENT_CAPABILITY_SPECS,
    flattenOutline,
} = require('../src/agent-capabilities.js');
const {DOCUMENT_CONTEXT_SPEC, buildDocumentContext} = require('../src/agent-document-context.js');
const {WORKSPACE_PLAN_SPEC, WORKSPACE_PLAN_RECEIPT_SCHEMA, buildWorkspacePlan, isWorkspacePlanExpired, buildWorkspaceReceipt, runWorkspacePlan} = require('../src/agent-workspace-plan.js');
const {ACTION_KEYS, normalizeWorkspaceStep, createWorkspaceActionExecutor} = require('../src/agent-workspace-actions.js');
const {normalizePlanId, workspacePlanDigest, createWorkspaceExecutionGuard, executeWorkspacePlan} = require('../src/agent-workspace-execution.js');
const {EXECUTE_WORKSPACE_PLAN_SPEC, normalizeExecutionRequest, buildExecutionGateResult} = require('../src/agent-workspace-capability.js');

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

test("workspace action adapter dispatches only normalized fixed actions", async () => {
    assert.equal(ACTION_KEYS["append-to-journal"], "appendToJournal");
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
        openDocument: async (step) => { calls.push(step); return {status: "completed"}; },
    });
    assert.deepEqual(await execute({action: "open-document", id: "20260913083000-abcdef"}), {status: "completed"});
    assert.deepEqual(await execute({action: "update-task-status", id: "20260913083001-abcdef", done: true}), {status: "failed", reason: "handler_missing"});
    assert.equal(calls.length, 1);
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
