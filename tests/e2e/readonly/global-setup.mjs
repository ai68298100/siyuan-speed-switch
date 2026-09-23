/* 只读实例 E2E 前置（T-6833）：同一个测试工作区用 --readonly 再起一个内核。
   只读角色下 setPetalEnabled / putFile 都会被 CheckAdminRole + CheckReadonly 拒绝，
   所以这里不再启用插件——插件的启用状态与信任开关已由 test:e2e 落在工作区里。 */
import fs from "node:fs";
import path from "node:path";
import {
    e2eConfig,
    kernelErrorLines,
    PLUGIN_NAME,
    readAccessToken,
    resolveInstall,
    SiyuanClient,
    startKernel,
    stopKernel,
} from "../../../scripts/e2e/lib.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const artifactDir = path.join(repoRoot, ".artifacts", "e2e");
export const targetFile = path.join(artifactDir, "target-readonly.json");

export default async function globalSetup() {
    fs.mkdirSync(artifactDir, {recursive: true});
    const writable = e2eConfig();
    if (!fs.existsSync(path.join(writable.workspace, "swss-e2e.json"))) {
        throw new Error(`工作区 ${writable.workspace} 不是 E2E 工作区，请先跑 pnpm run test:e2e`);
    }
    if (!fs.existsSync(path.join(writable.workspace, "data", "storage", "petal", "petals.json"))) {
        throw new Error("插件尚未在 E2E 工作区登记启用，请先跑 pnpm run test:e2e");
    }
    const port = Number(process.env.SWSS_E2E_READONLY_PORT || 6838);
    const cfg = {...writable, port, baseURL: `http://127.0.0.1:${port}`};
    const install = resolveInstall();
    const running = startKernel({kernel: install.kernel, appDir: install.appDir, workspace: cfg.workspace, port: cfg.port, extraArgs: ["--readonly", "true"]});
    let client = new SiyuanClient({baseURL: cfg.baseURL});
    try {
        await client.waitForBoot(running.lines);
    } catch (error) {
        fs.writeFileSync(path.join(artifactDir, "kernel-readonly-start.log"), running.lines.join("\n"));
        await stopKernel({client, child: running.child}).catch(() => undefined);
        throw error;
    }
    client = new SiyuanClient({baseURL: cfg.baseURL, token: readAccessToken(cfg.workspace)});
    const kernelVersion = await client.version();
    const petals = await client.post("/api/petal/loadPetals", {frontend: "desktop"});
    if (!(petals.data || []).some((item) => item.name === PLUGIN_NAME)) {
        await stopKernel({client, child: running.child});
        throw new Error(`只读实例未下发插件 ${PLUGIN_NAME}`);
    }
    // 前置自证：只读内核必须真的拒绝写入，否则后续断言无意义
    const rejected = await client.putFile("swss-e2e-readonly-probe", {probe: true}).then(() => null, (error) => error);
    if (!rejected) {
        await stopKernel({client, child: running.child});
        throw new Error("只读实例竟然接受了 putFile 写入，--readonly 未生效");
    }
    fs.writeFileSync(targetFile, JSON.stringify({baseURL: cfg.baseURL, token: readAccessToken(cfg.workspace), workspace: cfg.workspace, kernelVersion, readonly: true}, null, 2));
    console.log(`[e2e] 只读实例就绪：思源 ${kernelVersion} @ ${cfg.baseURL}（putFile 已被内核拒绝）`);

    return async () => {
        await stopKernel({client, child: running.child}, running.lines);
        fs.writeFileSync(path.join(artifactDir, "kernel-readonly.log"), running.lines.join("\n"));
        const errors = kernelErrorLines(running.lines);
        if (errors.length) console.warn(`[e2e] 只读实例内核日志有 ${errors.length} 行错误，见 .artifacts/e2e/kernel-readonly.log`);
    };
}
