// T-7020：验收截图基建契约（工具存在性+矩阵覆盖+主题区分能力；
// PNG 内容人审归 T-7015/T-7036，本契约守基建不静默消失）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const captureScript = fs.readFileSync(path.join(__dirname, "capture-acceptance-screenshots.cjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

test("screenshot infra: capture tool, npm script and matrix coverage exist (T-7020)", () => {
    assert.ok(fs.existsSync(path.join(__dirname, "capture-acceptance-screenshots.cjs")), "捕获脚本必须存在");
    assert.equal(pkg.scripts["shots:acceptance"], "node tests/capture-acceptance-screenshots.cjs", "npm script 必须注册");
    for (const caseId of ["switcher-light", "switcher-dark", "workbench-light", "workbench-dark", "studio-light", "studio-dark"]) {
        assert.ok(captureScript.includes(`id: "${caseId}"`), `矩阵必须含 ${caseId}`);
    }
    // 主题区分能力：明暗两套近似调色板必须在 harness 中定义
    assert.match(captureScript, /light: "--b3-theme-primary:/, "明色调色板必须定义");
    assert.match(captureScript, /dark: "--b3-theme-primary:/, "暗色调色板必须定义");
    // 结构性视觉证据定位：不冒充真实宿主验收
    assert.match(captureScript, /真实思源主题观感归 B-005/, "必须声明真实主题归 B-005");
});
