const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const Ajv = require("ajv");
const {readSourceFile} = require("./source-scan.cjs");
const planApi = require("../src/agent-workspace-plan.js");
const {createWorkspaceActionExecutor} = require("../src/agent-workspace-actions.js");
const {createWorkspaceHostHandlers} = require("../src/agent-workspace-registry.js");
const {registerReadOnlyAgentCapabilities, registerAgentActionCapability, normalizeAgentNotebookId} = require("../src/agent-capabilities.js");
const {normalizeDocumentSets} = require("../src/document-sets.js");
const {openDocumentOnDesktop} = require("../src/document-actions.js");

const source = readSourceFile("src/index.ts");
const sourceFile = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const pluginClass = sourceFile.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "SpeedSwitchPlugin");
assert.ok(pluginClass, "production plugin class must exist");
const methods = pluginClass.members.filter((node) => ts.isMethodDeclaration(node) && node.name?.getText(sourceFile) === "registerWorkspacePlanCapabilities");
assert.equal(methods.length, 1, "the production workspace plan registrar must have one implementation");
const registrarSource = methods[0].getText(sourceFile);

function mount(transform = (value) => value) {
    const calls = {opened: [], sql: [], writes: [], created: [], appended: []};
    const registered = new Map();
    const dependencies = {
        ...planApi, registerReadOnlyAgentCapabilities, registerAgentActionCapability,
        createWorkspaceHostHandlers, createWorkspaceActionExecutor,
        normalizeDocumentSets, normalizeAgentNotebookId, openDocumentOnDesktop,
        DOCUMENT_SETS_KEY: "sets", getSiyuan: () => ({}), logger: {warn() {}},
        openTab: async ({doc}) => { calls.opened.push(doc.id); },
    };
    const compiled = ts.transpileModule(`class WorkspacePlanHost {${transform(registrarSource)}}\nreturn WorkspacePlanHost;`, {
        compilerOptions: {target: ts.ScriptTarget.ES2020},
    }).outputText;
    const Host = new Function(...Object.keys(dependencies), compiled)(...Object.values(dependencies));
    const host = new Host();
    Object.assign(host, {
        app: {}, isMobile: false, data: {},
        getSettings: () => ({agentActionsEnabled: true, journalNotebook: "20261018090000-notebox"}),
        loadNotebooks: async () => [{id: "20261018090000-notebox", name: "工作"}],
        ensureTodayJournal: async () => "20261018090003-journal",
        clampTaskWritePayload: (value) => value,
        fetchKernelJson: async (path, args) => {
            if (path === "/api/query/sql") {
                calls.sql.push(args.stmt);
                // Model a real task-list item: a paragraph-only query cannot read it.
                if (args.stmt.includes("SELECT markdown, content")) {
                    return {code: 0, data: /type IN \('i','p'\)/.test(args.stmt) ? [{markdown: "- [ ] 待办", content: "待办"}] : []};
                }
                return {code: 0, data: [{id: "20261018090002-created"}]};
            }
            if (path === "/api/block/updateBlock") calls.writes.push(args);
            if (path === "/api/filetree/createDocWithMd") calls.created.push(args);
            if (path === "/api/block/appendBlock") calls.appended.push(args);
            return {code: 0};
        },
    });
    host.registerWorkspacePlanCapabilities({addAgentCapability: (definition) => {
        registered.set(definition.name, definition);
        return definition.name;
    }});
    return {host, calls, registered};
}

test("workspace plans for every fixed action satisfy the declared propose and execute schemas", () => {
    const plan = planApi.buildWorkspacePlan({steps: [
        {action: "open-document", id: "20261018090000-openone"},
        {action: "open-documents", ids: ["20261018090001-opentwo"]},
        {action: "restore-document-set", setId: "set-work"},
        {action: "update-task-status", id: "20261018090004-taskrow", done: true},
        {action: "create-document", notebook: "工作", title: "新文档", markdown: "# 初始正文"},
        {action: "append-to-journal", content: "记录一条"},
    ]});
    const ajv = new Ajv();
    const validateOutput = ajv.compile(planApi.WORKSPACE_PLAN_SPEC.outputSchema);
    const validateInput = ajv.compile(planApi.WORKSPACE_EXECUTE_SPEC.inputSchema);
    assert.equal(plan.steps.length, 6);
    assert.equal(validateOutput(plan), true, JSON.stringify(validateOutput.errors));
    assert.equal(validateInput(plan), true, JSON.stringify(validateInput.errors));
    assert.equal(validateInput({...plan, steps: [...plan.steps, {...plan.steps[4], index: 6, markdown: "x".repeat(4097)}]}), false);
    assert.equal(validateOutput({...plan, steps: [{...plan.steps[5], extra: "undeclared"}]}), false);
});

async function assertProductionRoundTrip(transform) {
    const {registered, calls} = mount(transform);
    const proposed = await registered.get("workspace-plan").handler({steps: [
        {action: "open-document", id: "20261018090000-openone"},
        {action: "update-task-status", id: "20261018090004-taskrow", done: true},
        {action: "create-document", notebook: "工作", title: "新文档", markdown: "# 内容"},
        {action: "append-to-journal", content: "记录一条"},
    ]});
    const executed = await registered.get("execute-workspace-plan").handler(proposed.structuredContent);
    assert.equal(executed.structuredContent.status, "completed");
    assert.deepEqual(executed.structuredContent.completed, [0, 1, 2, 3]);
    assert.deepEqual(calls.opened, ["20261018090000-openone"]);
    assert.deepEqual(calls.writes, [{dataType: "markdown", data: "- [x] 待办", id: "20261018090004-taskrow"}]);
    assert.deepEqual(calls.created, [{notebook: "20261018090000-notebox", path: "新文档", markdown: "# 内容"}]);
    assert.deepEqual(calls.appended, [{dataType: "markdown", data: "记录一条", parentID: "20261018090003-journal"}]);
}

test("production propose-to-execute route normalizes single targets and runs all three write actions", async () => {
    await assertProductionRoundTrip();
});

test("production route regression probe rejects bypassing the normalized action executor", async () => {
    await assert.rejects(() => assertProductionRoundTrip((value) => {
        const regressed = value.replace("runStep: createWorkspaceActionExecutor(handlers)", "runStep: (step) => handlers.openDocument(step, {})");
        assert.notEqual(regressed, value, "negative probe must replace the production executor call");
        return regressed;
    }), /completed|failed|partial/);
});

test("plan runner passes its local AbortSignal through the executor and stops writes after cancellation", async () => {
    const controller = new AbortController();
    const seen = [];
    let writes = 0;
    const plan = planApi.buildWorkspacePlan({steps: [
        {action: "open-document", id: "20261018090000-openone"},
        {action: "update-task-status", id: "20261018090004-taskrow", done: true},
    ]});
    const executor = createWorkspaceActionExecutor({
        openDocument: async (step, context) => { seen.push(context.signal); controller.abort(); return {status: "completed", id: step.id}; },
        updateTaskStatus: async () => { writes += 1; return {status: "completed"}; },
    });
    const receipt = await planApi.runWorkspacePlan(plan, {approved: true, signal: controller.signal, runStep: executor});
    assert.deepEqual(seen, [controller.signal]);
    assert.equal(writes, 0);
    assert.equal(receipt.status, "cancelled");
    assert.deepEqual(receipt.completed, [0]);
    assert.deepEqual(receipt.cancelled, [1]);
    assert.deepEqual(await executor(plan.steps[1], 1, {signal: controller.signal}), {status: "cancelled"});
});

test("plan validation blocks malformed create and append payloads before any handler", async () => {
    for (const step of [
        {action: "create-document", notebook: "工作", title: "新文档", markdown: ""},
        {action: "append-to-journal", content: "记录一条"},
    ]) {
        const plan = planApi.buildWorkspacePlan({steps: [step]});
        const invalid = {...plan, steps: [{...plan.steps[0], ...(step.action === "create-document" ? {title: ""} : {content: ""})}]};
        let calls = 0;
        const receipt = await planApi.runWorkspacePlan(invalid, {approved: true, runStep: async () => { calls += 1; }});
        assert.equal(receipt.status, "failed");
        assert.equal(calls, 0);
    }
});

test("local cancellation during a task read reaches the real write handler before updateBlock", async () => {
    const controller = new AbortController();
    let writes = 0;
    const handlers = createWorkspaceHostHandlers({write: {
        readTask: async () => { controller.abort(); return {markdown: "- [ ] 待办"}; },
        updateBlock: async () => { writes += 1; return true; },
    }});
    const plan = planApi.buildWorkspacePlan({steps: [{action: "update-task-status", id: "20261018090004-taskrow", done: true}]});
    const receipt = await planApi.runWorkspacePlan(plan, {
        approved: true, signal: controller.signal, runStep: createWorkspaceActionExecutor(handlers),
    });
    assert.equal(writes, 0);
    assert.equal(receipt.status, "cancelled");
    assert.deepEqual(receipt.cancelled, [0]);
});
