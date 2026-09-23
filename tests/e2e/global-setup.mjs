/* E2E 全局前置（T-6833）：准备独立工作区 → 装入 dist → 起内核 → 等就绪 → 启用插件 →
   落盘 target.json；返回的清理函数负责关内核并把内核日志与错误摘要写到 .artifacts/e2e/。 */
import fs from "node:fs";
import path from "node:path";
import {
    e2eConfig,
    enablePlugin,
    installPlugin,
    kernelErrorLines,
    PLUGIN_NAME,
    prepareWorkspace,
    readAccessToken,
    resolveInstall,
    SiyuanClient,
    startKernel,
    stopKernel,
} from "../../scripts/e2e/lib.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const artifactDir = path.join(repoRoot, ".artifacts", "e2e");
export const targetFile = path.join(artifactDir, "target.json");

export default async function globalSetup() {
    fs.mkdirSync(artifactDir, {recursive: true});
    const cfg = e2eConfig();
    const install = resolveInstall();
    const prepared = prepareWorkspace(cfg.workspace);
    const installed = installPlugin(cfg.workspace, repoRoot);
    if (!fs.existsSync(path.join(cfg.workspace, "data", "plugins", PLUGIN_NAME, "i18n", "zh-CN.json"))) {
        throw new Error("E2E plugin install did not copy nested i18n resources");
    }
    console.log(`[e2e] 工作区 ${cfg.workspace}（${prepared.created ? "新建" : "复用"}）· 插件 v${installed.version} · 内核 ${install.kernel}`);

    const running = startKernel({kernel: install.kernel, appDir: install.appDir, workspace: cfg.workspace, port: cfg.port});
    let client = new SiyuanClient({baseURL: cfg.baseURL});
    try {
        await client.waitForBoot(running.lines);
    } catch (error) {
        fs.writeFileSync(path.join(artifactDir, "kernel-start.log"), running.lines.join("\n"));
        await stopKernel({client, child: running.child}).catch(() => undefined);
        throw error;
    }
    const token = readAccessToken(cfg.workspace);
    client = new SiyuanClient({baseURL: cfg.baseURL, token});
    const kernelVersion = await client.version();
    const enabled = await enablePlugin({client, workspace: cfg.workspace, pluginName: PLUGIN_NAME});
    console.log(`[e2e] 插件已启用并下发：${enabled.name} v${enabled.version}（js ${Math.round(enabled.jsBytes / 1024)}KB / css ${Math.round(enabled.cssBytes / 1024)}KB）`);
    fs.writeFileSync(targetFile, JSON.stringify({baseURL: cfg.baseURL, token, workspace: cfg.workspace, kernelVersion, pluginVersion: installed.version}, null, 2));
    console.log(`[e2e] 就绪：思源 ${kernelVersion} @ ${cfg.baseURL}${token ? "（带访问码）" : "（回环免鉴权）"}`);

    return async () => {
        await stopKernel({client, child: running.child}, running.lines);
        fs.writeFileSync(path.join(artifactDir, "kernel.log"), running.lines.join("\n"));
        const errors = kernelErrorLines(running.lines);
        fs.writeFileSync(path.join(artifactDir, "kernel-errors.log"), errors.join("\n"));
        if (errors.length) console.warn(`[e2e] 内核日志有 ${errors.length} 行错误，见 .artifacts/e2e/kernel-errors.log`);
    };
}
