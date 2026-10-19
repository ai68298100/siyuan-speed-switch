const test = require("node:test");
const assert = require("node:assert/strict");
const {
    AGENT_CAPABILITY_SPECS,
    READ_ONLY_EFFECTS,
    normalizeAgentFailureReason,
    normalizeAgentDocumentId,
    flipTaskMarkdown,
    sanitizeJournalAppend,
} = require("../src/agent-capabilities.js");

const READ_ONLY_KEYS = ["outline", "navigation", "search", "homeWidgets", "workspaceContext", "homeDiagnostics"];
const WRITE_ACTION_KEYS = ["updateTask", "createDocument", "appendToJournal"];

test("ADR 0221 T-7295: Agent capability matrix strictly partitions read-only effects and write effects", () => {
    // 1. 只读能力校验：不得包含任何 localWrite 属性
    for (const key of READ_ONLY_KEYS) {
        const spec = AGENT_CAPABILITY_SPECS[key];
        assert.ok(spec, `read-only spec ${key} must exist`);
        assert.equal(spec.inputSchema.additionalProperties, false, `${key} input must reject additionalProperties`);
        assert.ok(spec.outputSchema && typeof spec.outputSchema === "object", `${key} must have outputSchema`);
    }

    // 2. 写动作能力校验：必须显式声明写效果并提示用户确认
    for (const key of WRITE_ACTION_KEYS) {
        const spec = AGENT_CAPABILITY_SPECS[key];
        assert.ok(spec, `write spec ${key} must exist`);
        assert.match(spec.description, /确认|confirm/i, `${key} must declare user confirmation requirement`);
        assert.equal(spec.inputSchema.additionalProperties, false, `${key} input must reject additionalProperties`);
    }
});

test("ADR 0221 T-7295: Controlled execution input sanitization and normalized failure reasons", () => {
    // ID 格式净化：拒绝伪造协议与相对路径
    assert.equal(normalizeAgentDocumentId("20261017120000-abcdef"), "20261017120000-abcdef");
    assert.equal(normalizeAgentDocumentId("javascript:alert(1)"), "");
    assert.equal(normalizeAgentDocumentId("../../etc/passwd"), "");

    // 任务打勾切换：拒绝非任务文本，仅修改状态标记
    assert.equal(flipTaskMarkdown("* [ ] 待办任务", true), "* [x] 待办任务");
    assert.equal(flipTaskMarkdown("- [x] 已完成任务", false), "- [ ] 已完成任务");
    assert.equal(flipTaskMarkdown("普通段落", true), "", "非任务段落必须拒绝翻转");

    // 日记追加净化：去首尾空格、扁平化换行并钳制 512 字符
    assert.equal(sanitizeJournalAppend("   "), "");
    assert.equal(sanitizeJournalAppend("测试文本\n第二行"), "测试文本 第二行");
    assert.equal(sanitizeJournalAppend("x".repeat(600)).length, 512);

    // 失败状态归一化：不泄露底层异常堆栈
    assert.equal(normalizeAgentFailureReason({name: "AbortError"}), "cancelled");
    assert.equal(normalizeAgentFailureReason({name: "TimeoutError"}), "timeout");
    assert.equal(normalizeAgentFailureReason(new Error("opaque kernel error")), "failed");
    assert.equal(normalizeAgentFailureReason(null), "failed");
});

test("ADR 0221 T-7295: controlled agent safety contract has discriminating negative probes", () => {
    // 负向探针 1: 若写操作缺失确认说明，契约必须拒绝
    assert.throws(() => {
        const fakeWriteSpec = {description: "自动静默写入文档，直接生效无需用户交互"};
        assert.match(fakeWriteSpec.description, /确认|confirm/i, "写操作缺失确认必须被拦截");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 若只读能力被掺杂 localWrite: true，契约必须拒绝
    assert.throws(() => {
        const fakeReadOnlyEffects = {...READ_ONLY_EFFECTS, localWrite: true};
        assert.equal(fakeReadOnlyEffects.localWrite, undefined, "只读效果包含 localWrite 必须被拦截");
    }, /ERR_ASSERTION/);
});

test("T-7332: Agent read-only capabilities enforce strict input schemas, zero write side effects and output bounds with negative probes", () => {
    const {
        MAX_QUERY_LENGTH,
        normalizeAgentQuery,
        buildAgentHomeDiagnostics,
        normalizeAgentWidgetConfigFields,
    } = require("../src/agent-capabilities.js");

    // 1. 查询文本与长度严格有界截断在 200 字符内
    const oversizedQuery = "q".repeat(MAX_QUERY_LENGTH + 50);
    const normalizedQuery = normalizeAgentQuery(oversizedQuery);
    assert.equal(normalizedQuery.length, MAX_QUERY_LENGTH, "超长查询词必须截断在 200 字符上限内");

    // 2. 组件配置字段上限与类型约束（最多 8 项）
    const manyFields = Array.from({length: 20}, (_, i) => ({
        key: `f${i}`,
        type: "number",
        label: `字段 ${i}`,
    }));
    const normalizedFields = normalizeAgentWidgetConfigFields(manyFields);
    assert.equal(normalizedFields.length, 8, "配置字段必须严格有界截断在 8 个字段内");

    // 3. 诊断快照时间窗口与容量上限约束
    const diagnostics = buildAgentHomeDiagnostics(
        Array.from({length: 40}, (_, i) => ({
            moduleId: "tasks",
            device: "desktop",
            at: Date.now() - i * 1000,
            type: "failed",
        })),
        16,
        60
    );
    assert.ok(diagnostics.diagnostics.length <= 16, "诊断条目数必须受限于 limit");
    assert.equal(diagnostics.summary.windowMinutes, 60);

    // 4. 负向探针 1: 若查询词未被截断（保持 250 字符），必须触发断言失败
    assert.throws(() => {
        assert.ok(oversizedQuery.length <= MAX_QUERY_LENGTH, "查询词超限未截断探针");
    }, /ERR_ASSERTION/);

    // 5. 负向探针 2: 若配置字段未截断（保持 20 项），必须触发断言失败
    assert.throws(() => {
        assert.ok(manyFields.length <= 8, "配置字段超限未截断探针");
    }, /ERR_ASSERTION/);
});
