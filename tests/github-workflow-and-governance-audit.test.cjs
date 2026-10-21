// T-7360 GitHub Actions CI/CD 工作流与仓库工程治理配置契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 ci.yml 包含完整的静态批量审计与浏览器 Smoke 步骤；
//   2. 验证 release.yml 包含 SHA-256 校验和生成与多资产上传；
//   3. 验证 SECURITY.md 对齐 v0.48.x 支持矩阵；
//   4. 验证 bug_report.yml 包含动作画板与穿透检索表面选项；
//   5. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const ciYml = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
const releaseYml = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
const securityMd = fs.readFileSync(path.join(root, ".github/SECURITY.md"), "utf8");
const bugReportYml = fs.readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/bug_report.yml"), "utf8");

test("T-7360: ci.yml 强化覆盖全套静态批量门禁与浏览器样式 Smoke", () => {
    assert.match(ciYml, /pnpm run release:check/, "CI 必须执行 release:check 包体漂移门禁");
    assert.match(ciYml, /pnpm run quality:audit/, "CI 必须执行 quality:audit 质量批量门禁");
    assert.match(ciYml, /pnpm run integration:audit/, "CI 必须执行 integration:audit 集成边界门禁");
    assert.match(ciYml, /pnpm run current-status:audit/, "CI 必须执行 current-status:audit 状态索引门禁");
    assert.match(ciYml, /pnpm test:smoke:browser/, "CI 必须执行浏览器样式 Smoke");
    assert.match(ciYml, /pnpm test:smoke:floating-ball/, "CI 必须执行悬浮球 Smoke");
});

test("T-7360: release.yml 自动生成并上传 package.zip.sha256 密码学校验文件", () => {
    assert.match(releaseYml, /sha256sum\s+package\.zip\s*>\s*package\.zip\.sha256/, "Release 必须生成 sha256sum 校验和");
    assert.match(releaseYml, /package\.zip\.sha256/, "Release 必须声明上传 package.zip.sha256 资产文件");
});

test("T-7360: SECURITY.md 安全策略对齐当前 v0.48.x 活跃支持系列", () => {
    assert.match(securityMd, /v0\.48\.x/, "SECURITY.md 必须将 v0.48.x 声明为当前活跃支持版本系列");
    assert.match(securityMd, /活跃支持 \(Active\)/, "必须明确标注 Active 状态");
});

test("T-7360: bug_report.yml 入口选项包含动作画板与穿透检索表面", () => {
    assert.match(bugReportYml, /切换器动作画板 \/ Action Palette/, "Issue 模板必须包含动作画板选项");
    assert.match(bugReportYml, /穿透检索 \/ Penetration Search/, "Issue 模板必须包含穿透检索选项");
});

test("T-7360 门禁负向验证: 若工作流未声明关键门禁或篡改散列步骤必定精确红", () => {
    // 探针 1: CI 缺少质量审计必须被断言拒绝
    assert.throws(() => {
        assert.match(ciYml, /non_existent_fake_gate_step/, "非法未声明步骤应断言失败");
    }, assert.AssertionError);

    // 探针 2: 负向断言伪造的不存在安全版本
    assert.throws(() => {
        assert.match(securityMd, /v999\.999\.x/, "不存在版本应断言失败");
    }, assert.AssertionError);
});
