const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    AGENT_CAPABILITY_SPECS,
    flattenOutline,
} = require('../src/agent-capabilities.js');
const {DOCUMENT_CONTEXT_SPEC, buildDocumentContext} = require('../src/agent-document-context.js');
const {WORKSPACE_PLAN_SPEC, buildWorkspacePlan, isWorkspacePlanExpired} = require('../src/agent-workspace-plan.js');

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
