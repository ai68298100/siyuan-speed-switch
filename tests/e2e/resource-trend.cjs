// T-7153: browser-only resource trend probe. It is intentionally a test
// helper and never enters the webpack production bundle.
const fs = require("node:fs");
const path = require("node:path");

const PROBE_SOURCE = fs.readFileSync(
    path.join(__dirname, "..", "resource-trend-probe.browser.js"),
    "utf8",
);

/**
 * Resource trend is a write-capable, long-lived host test.  Keep its safety
 * boundary stricter than the shared E2E defaults: callers must opt in with an
 * explicit marked workspace and port, and the generated target must point to
 * that same loopback instance.  This helper intentionally does not create a
 * workspace or start a kernel.
 */
function assertExplicitResourceTrendIsolation({rootDir = path.resolve(__dirname, "..", ".."), artifactDir, requireTarget = true, requireMarker = true} = {}) {
    const workspace = String(process.env.SWSS_E2E_WORKSPACE || "").trim();
    const port = Number(process.env.SWSS_E2E_PORT || 0);
    if (!workspace) throw new Error("resource-trend E2E 必须显式设置 SWSS_E2E_WORKSPACE");
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error(`resource-trend E2E 的 SWSS_E2E_PORT 非法：${process.env.SWSS_E2E_PORT || "空"}`);
    }
    if (port === 6806) throw new Error("resource-trend E2E 拒绝使用个人端口 6806");
    const resolvedWorkspace = path.resolve(workspace);
    if (resolvedWorkspace === path.resolve(rootDir)) {
        throw new Error("resource-trend E2E 拒绝把仓库根目录当作思源工作区");
    }
    const markerPath = path.join(resolvedWorkspace, "swss-e2e.json");
    if (!requireMarker && !requireTarget) {
        const resolvedArtifactDir = path.resolve(artifactDir || process.env.SWSS_E2E_ARTIFACT_DIR || path.join(rootDir, ".artifacts", "e2e-resource-trend"));
        return {workspace: resolvedWorkspace, port, artifactDir: resolvedArtifactDir, target: null};
    }
    if (!fs.existsSync(markerPath)) {
        throw new Error(`resource-trend E2E 工作区缺少 swss-e2e.json：${resolvedWorkspace}`);
    }
    let marker;
    try {
        marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    } catch (error) {
        throw new Error(`resource-trend E2E 无法读取工作区标记：${error.message}`);
    }
    if (marker?.protected) throw new Error(`resource-trend E2E 拒绝 protected 工作区：${resolvedWorkspace}`);
    if (marker?.createdBy !== "siyuan-speed-switch e2e") {
        throw new Error(`resource-trend E2E 工作区标记来源不受信任：${resolvedWorkspace}`);
    }

    const resolvedArtifactDir = path.resolve(artifactDir || process.env.SWSS_E2E_ARTIFACT_DIR || path.join(rootDir, ".artifacts", "e2e-resource-trend"));
    const targetPath = path.join(resolvedArtifactDir, "target.json");
    if (!requireTarget) return {workspace: resolvedWorkspace, port, artifactDir: resolvedArtifactDir, target: null};
    if (!fs.existsSync(targetPath)) throw new Error(`resource-trend E2E 缺少 globalSetup target.json：${targetPath}`);
    let target;
    try {
        target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    } catch (error) {
        throw new Error(`resource-trend E2E 无法解析 target.json：${error.message}`);
    }
    const expectedBaseURL = `http://127.0.0.1:${port}`;
    if (target?.workspace && path.resolve(String(target.workspace)) !== resolvedWorkspace) {
        throw new Error(`resource-trend E2E target workspace 与环境不一致：${target.workspace}`);
    }
    if (String(target?.baseURL || "").replace(/\/$/, "") !== expectedBaseURL) {
        throw new Error(`resource-trend E2E target baseURL 与端口不一致：${target?.baseURL || "空"}`);
    }
    return {workspace: resolvedWorkspace, port, artifactDir: resolvedArtifactDir, target};
}

/** Install before page activity when possible; current-page installation is
 * also supported for existing Playwright pages. The return value is a sample
 * taken after installation, not a claim about activity before that point. */
async function installResourceTrendProbe(page, label = "probe-installed") {
    await page.addInitScript({content: PROBE_SOURCE});
    await page.evaluate(PROBE_SOURCE);
    return page.evaluate((sampleLabel) => window.__swssResourceTrendProbe?.sample(sampleLabel) ?? null, label);
}

async function sampleResourceTrend(page, label = "sample", options = {}) {
    return page.evaluate(({sampleLabel, sampleOptions}) => window.__swssResourceTrendProbe?.sample(sampleLabel, sampleOptions) ?? null, {
        sampleLabel: label,
        sampleOptions: options,
    });
}

async function disposeResourceTrendProbe(page) {
    return page.evaluate(() => {
        const probe = window.__swssResourceTrendProbe;
        if (!probe) return false;
        probe.dispose();
        return true;
    });
}

module.exports = {
    PROBE_SOURCE,
    assertExplicitResourceTrendIsolation,
    installResourceTrendProbe,
    sampleResourceTrend,
    disposeResourceTrendProbe,
};
