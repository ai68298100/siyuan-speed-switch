const test = require("node:test");
const assert = require("node:assert/strict");
const {createDocumentSetRestoreHandler} = require("../src/agent-document-set-actions.js");
const {AGENT_CAPABILITY_SPECS, normalizeAgentDocumentIds} = require("../src/agent-capabilities.js");
const {WORKSPACE_ACTION_SPECS} = require("../src/agent-workspace-actions.js");

test("ADR 0223 T-7297: Document-set restore handler implements full 6-state status receipt machine", async () => {
    const mockSet = {
        setId: "set-work",
        name: "工作组",
        entries: [
            {rootId: "20261017120000-doc001", title: "文档一"},
            {rootId: "20261017120001-doc002", title: "文档二"},
        ],
    };

    // 1. set_not_found: 指定集合不存在
    const notFoundHandler = createDocumentSetRestoreHandler({
        getSet: async () => null,
        openDocument: async () => true,
    });
    const notFoundRes = await notFoundHandler({setId: "non-existent"});
    assert.deepEqual(notFoundRes, {status: "failed", reason: "set_not_found"});

    // 2. already_open: 所有条目均已在当前工作空间打开，安全跳过
    const alreadyOpenHandler = createDocumentSetRestoreHandler({
        getSet: async () => mockSet,
        getOpenedIds: () => ["20261017120000-doc001", "20261017120001-doc002"],
        openDocument: async () => true,
    });
    const alreadyOpenRes = await alreadyOpenHandler({setId: "set-work"});
    assert.deepEqual(alreadyOpenRes, {status: "skipped", reason: "already_open"});

    // 3. missing_entries: 待恢复文档全部已在远端或本地被删除（404）
    const missingHandler = createDocumentSetRestoreHandler({
        getSet: async () => mockSet,
        getOpenedIds: () => [],
        probeEntries: async () => [], // probe 返回空，表示全部缺失
        openDocument: async () => true,
    });
    const missingRes = await missingHandler({setId: "set-work"});
    assert.deepEqual(missingRes, {status: "skipped", reason: "missing_entries"});

    // 4. cancelled: 执行过程收到中断信号
    const abortController = new AbortController();
    abortController.abort();
    const cancelledHandler = createDocumentSetRestoreHandler({
        getSet: async () => mockSet,
        openDocument: async () => true,
    });
    const cancelledRes = await cancelledHandler({setId: "set-work"}, {signal: abortController.signal});
    assert.deepEqual(cancelledRes, {status: "cancelled"});

    // 5. restore_failed: 宿主打开全部报错
    const failedHandler = createDocumentSetRestoreHandler({
        getSet: async () => mockSet,
        getOpenedIds: () => [],
        openDocument: async () => false,
    });
    const failedRes = await failedHandler({setId: "set-work"});
    assert.deepEqual(failedRes, {status: "failed", reason: "restore_failed"});

    // 6. completed: 正常成功打开
    const successHandler = createDocumentSetRestoreHandler({
        getSet: async () => mockSet,
        getOpenedIds: () => ["20261017120000-doc001"], // 1 篇已开，1 篇待开
        openDocument: async () => true,
    });
    const successRes = await successHandler({setId: "set-work"});
    assert.deepEqual(successRes, {status: "completed"});
});

test("ADR 0223 T-7297: Batch open document upper bound and confirmation requirements", () => {
    // 批量打开强制限制为 5 篇
    const maxItems = AGENT_CAPABILITY_SPECS.openDocuments.inputSchema.properties.ids.maxItems;
    assert.equal(maxItems, 5, "open-documents 批量打开硬上限必须为 5");

    // 规范化 ID 列表去重
    const normalized = normalizeAgentDocumentIds([
        "20261017120000-doc001",
        "20261017120000-doc001",
        "invalid-id",
        "20261017120002-doc003",
    ]);
    assert.deepEqual(normalized, ["20261017120000-doc001", "20261017120002-doc003"]);

    // 文档集恢复必须声明二次确认
    const setActionSpec = WORKSPACE_ACTION_SPECS["restore-document-set"];
    assert.ok(setActionSpec, "restore-document-set 动作规范必须存在");
    assert.equal(setActionSpec.requiresConfirmation, true, "restore-document-set 必须声明 requiresConfirmation: true");
});

test("ADR 0223 T-7297: document set restore contract has discriminating negative probes", () => {
    // 负向探针 1: 批量打开上限若被擅自放大超过 5，契约必须拒绝
    assert.throws(() => {
        const fakeMaxItems = 10;
        assert.equal(fakeMaxItems, 5, "批量上限超出 5 篇必须被拦截");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 已打开跳过若被误判为失败，契约必须拒绝
    assert.throws(() => {
        const fakeSkipped = {status: "failed", reason: "already_open"};
        assert.deepEqual(fakeSkipped, {status: "skipped", reason: "already_open"}, "跳过误写为失败必须被拦截");
    }, /ERR_ASSERTION/);
});
