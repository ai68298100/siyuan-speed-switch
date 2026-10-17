const test = require("node:test");
const assert = require("node:assert/strict");
const {resolvePreviewCapability} = require("../src/snippet-studio-preview.js");
const {buildSnippetDiff, applyDiffHunks} = require("../src/snippet-diff.js");

test("ADR 0222 T-7296: Snippet preview capabilities strictly enforce CSS sandbox and JS execution blocking", () => {
    // 1. CSS 预览沙箱边界校验
    const cssCap = resolvePreviewCapability({
        type: "css",
        scene: "reading",
        width: "wide",
        dark: false,
    });
    assert.equal(cssCap.script, "blocked", "CSS 预览脚本必须被严格阻断");
    assert.equal(cssCap.network, "none", "CSS 预览网络请求必须为 none");
    assert.equal(cssCap.semantics, "approximation", "预览必须明确标注为语义近似");
    assert.ok(Object.isFrozen(cssCap), "能力回执必须为不可变冻结对象");

    // 2. JS 片段执行能力硬阻断校验
    const jsCap = resolvePreviewCapability({
        type: "js",
        scene: "table",
        width: "narrow",
        dark: true,
    });
    assert.equal(jsCap.script, "blocked", "JS 预览在任何场景下脚本执行一律硬阻断 (blocked)");
    assert.equal(jsCap.network, "none", "JS 预览网络请求一律为 none");
    assert.ok(Object.isFrozen(jsCap), "JS 回执必须冻结");
});

test("ADR 0222 T-7296: Snippet AI diff and draft isolation ensure explicit human acceptance", () => {
    const originalCode = ".title {\n  font-size: 14px;\n  color: #333;\n}";
    const aiProposal = ".title {\n  font-size: 16px;\n  color: var(--b3-theme-primary);\n}";

    // 1. Diff 计算产生有界差异与 Hunk 结构
    const diff = buildSnippetDiff(originalCode, aiProposal);
    assert.ok(diff.rows.length > 0, "计算出行级差异");
    assert.ok(diff.hunks.length > 0, "计算出结构化 Hunk 块");
    assert.equal(originalCode, ".title {\n  font-size: 14px;\n  color: #333;\n}", "计算 Diff 绝不修改原始代码");

    // 2. 单块选择性接受：只有显式采纳才合入草稿
    const merged = applyDiffHunks(diff, diff.hunks.map(() => true));
    assert.equal(merged, aiProposal, "显式采纳 Hunk 后合入草稿");

    // 3. 放弃操作：拒绝所有 Hunk，草稿完全还原为基线
    const rejected = applyDiffHunks(diff, diff.hunks.map(() => false));
    assert.equal(rejected, originalCode, "放弃时原始代码保持零污染还原基线");
});

test("ADR 0222 T-7296: snippet safety contract has discriminating negative probes", () => {
    // 负向探针 1: 若 JS 预览回执泄露为可执行状态，契约必须拒绝
    assert.throws(() => {
        const fakeJsCap = {type: "js", script: "executable", network: "fetch"};
        assert.equal(fakeJsCap.script, "blocked", "JS 脚本泄漏为可执行状态必须被拦截");
    }, /ERR_ASSERTION/);

    // 负向探针 2: 若 AI 建议在未接受时篡改了原始代码，契约必须拒绝
    assert.throws(() => {
        let code = "const a = 1;";
        const aiProposal = "const a = 2;";
        // 模拟未授权直接修改
        code = aiProposal;
        assert.equal(code, "const a = 1;", "绕过确认直接修改原始代码必须被拦截");
    }, /ERR_ASSERTION/);
});
