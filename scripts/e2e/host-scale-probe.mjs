/* T-7151/T-7196：隔离桌面宿主配置探针。
 *
 * 这个脚本只验证宿主对 fileTree.maxOpenTabCount 的 API 回读和上限夹取，
 * 不创建笔记本、文档或页签。它不会使用默认工作区/端口：必须显式提供
 * SWSS_E2E_WORKSPACE 与 SWSS_E2E_PORT，避免误触用户正在使用的内核。
 * 执行前还会确认监听端口属于本轮启动的内核进程，确认后才发写请求。
 *
 * 运行示例（请使用全新的临时工作区和专属端口）：
 *   $env:SWSS_E2E_WORKSPACE = 'D:\\Temp\\swss-host-probe'
 *   $env:SWSS_E2E_PORT = '6849'
 *   node scripts/e2e/host-scale-probe.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {
    e2eConfig,
    readAccessToken,
    resolveInstall,
    SiyuanClient,
    startKernel,
    stopKernel,
} from "./lib.mjs";

const PERSONAL_PORT = 6806;
const MARKER_FILE = "swss-e2e.json";
const REQUESTED_VALUES = [1, 32, 500];

function requireExplicitIsolation() {
    if (!process.env.SWSS_E2E_WORKSPACE || !process.env.SWSS_E2E_PORT) {
        throw new Error("宿主规模探针必须显式设置 SWSS_E2E_WORKSPACE 与 SWSS_E2E_PORT；拒绝使用默认 E2E 目标");
    }
    const cfg = e2eConfig();
    if (cfg.host !== "127.0.0.1") throw new Error(`探针只允许 127.0.0.1，当前为 ${cfg.host}`);
    if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) {
        throw new Error(`SWSS_E2E_PORT 无效：${cfg.port}`);
    }
    if (cfg.port === PERSONAL_PORT) throw new Error("拒绝使用个人内核端口 6806");
    if (!path.isAbsolute(cfg.workspace)) throw new Error(`SWSS_E2E_WORKSPACE 必须是绝对路径：${cfg.workspace}`);
    if (path.resolve(cfg.workspace) === path.parse(cfg.workspace).root) {
        throw new Error(`拒绝把文件系统根目录作为 E2E 工作区：${cfg.workspace}`);
    }
    return cfg;
}

function assertMarkedWorkspace(cfg) {
    const markerPath = path.join(cfg.workspace, MARKER_FILE);
    if (!fs.existsSync(markerPath)) {
        throw new Error(`拒绝使用未标记的 E2E 工作区：${cfg.workspace}；请先由隔离编排器或 prepareWorkspace 创建 ${MARKER_FILE}`);
    }
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    if (marker.protected) throw new Error(`工作区 ${cfg.workspace} 已受保护，拒绝写入`);
    if (marker.createdBy !== "siyuan-speed-switch e2e") {
        throw new Error(`工作区标记来源不匹配：${cfg.workspace}`);
    }
    return {created: false, marker};
}

function listeningOwners(port) {
    let output;
    try {
        output = execFileSync("netstat", ["-ano", "-p", "tcp"], {encoding: "utf8", windowsHide: true});
    } catch (error) {
        throw new Error(`无法读取端口监听者，拒绝继续：${error?.message || error}`);
    }
    const owners = new Set();
    const portPattern = new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[?::\\]?|\\*):${port}\\b`);
    for (const line of String(output).split(/\r?\n/)) {
        if (!portPattern.test(line) || !/\bLISTEN(?:ING)?\b/i.test(line)) continue;
        const pid = line.trim().match(/(\d+)\s*$/)?.[1];
        if (pid) owners.add(Number(pid));
    }
    return owners;
}

function assertPortOwnedByChild(port, childPid) {
    const owners = listeningOwners(port);
    if (!owners.has(Number(childPid)) || owners.size !== 1) {
        throw new Error(`端口 ${port} 监听者不属于本轮唯一内核进程：期望 PID ${childPid}，实际 ${[...owners].join(", ") || "无"}`);
    }
}

function readMaxOpenTabCount(config) {
    const value = config?.fileTree?.maxOpenTabCount;
    if (!Number.isInteger(value)) throw new Error("/api/system/getConf 未返回整数 fileTree.maxOpenTabCount");
    return value;
}

function cloneFileTree(fileTree) {
    if (!fileTree || typeof fileTree !== "object" || Array.isArray(fileTree)) {
        throw new Error("/api/system/getConf 未返回可恢复的 fileTree 配置");
    }
    return JSON.parse(JSON.stringify(fileTree));
}

async function main() {
    const cfg = requireExplicitIsolation();
    const occupiedBeforeStart = listeningOwners(cfg.port);
    if (occupiedBeforeStart.size) {
        throw new Error(`拒绝启动：端口 ${cfg.port} 已被占用（PID ${[...occupiedBeforeStart].join(", ")}），不会向该服务发送退出或配置请求`);
    }
    const workspaceState = assertMarkedWorkspace(cfg);
    const install = resolveInstall();
    const running = startKernel({kernel: install.kernel, appDir: install.appDir, workspace: cfg.workspace, port: cfg.port});
    let client = new SiyuanClient({baseURL: cfg.baseURL});
    let originalFileTree;
    let restored = false;
    let ownsPort = false;
    const report = {
        workspace: cfg.workspace,
        port: cfg.port,
        kernelPid: running.child.pid,
        workspaceCreated: workspaceState.created,
        documentsCreated: 0,
        tabsCreated: 0,
        values: [],
    };
    try {
        await client.waitForBoot(running.lines);
        assertPortOwnedByChild(cfg.port, running.child.pid);
        ownsPort = true;
        const token = readAccessToken(cfg.workspace);
        client = new SiyuanClient({baseURL: cfg.baseURL, token});

        const initial = await client.postChecked("/api/system/getConf");
        originalFileTree = cloneFileTree(initial?.fileTree);
        report.initial = readMaxOpenTabCount(initial);

        for (const requested of REQUESTED_VALUES) {
            const payload = {...originalFileTree, maxOpenTabCount: requested};
            await client.postChecked("/api/setting/setFiletree", payload);
            const observed = await client.postChecked("/api/system/getConf");
            const observedValue = readMaxOpenTabCount(observed);
            report.values.push({requested, observed: observedValue});
        }
        console.log(JSON.stringify(report, null, 2));
    } finally {
        if (originalFileTree && client) {
            try {
                await client.postChecked("/api/setting/setFiletree", originalFileTree);
                const restoredConfig = await client.postChecked("/api/system/getConf");
                restored = readMaxOpenTabCount(restoredConfig) === readMaxOpenTabCount({fileTree: originalFileTree});
            } catch (error) {
                console.error(`[host-scale-probe] 恢复 fileTree 失败：${error?.message || error}`);
            }
        }
        if (ownsPort) {
            await stopKernel({client, child: running.child}, running.lines);
        } else if (!running.child.killed) {
            running.child.kill();
        }
        if (originalFileTree && !restored) throw new Error("探针结束时未能确认 fileTree 已恢复");
    }
}

main().catch((error) => {
    console.error(`[host-scale-probe] ${error?.stack || error}`);
    process.exitCode = 1;
});

