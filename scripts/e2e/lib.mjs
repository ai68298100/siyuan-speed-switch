/* E2E 基础设施（T-6833，移植自小驴打卡 scripts/e2e/lib.mjs 的成熟方案）：
   用本机已安装的思源内核跑真实插件实例——独立隔离工作区 + 真实 dist 安装链 +
   真实前端 bundle（/stage/build/desktop|mobile）。 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {execFileSync, spawn} from "node:child_process";

export const PLUGIN_NAME = "siyuan-speed-switch";
export const STORAGE_DIR = `storage/petal/${PLUGIN_NAME}`;
export const MARKER_FILE = "swss-e2e.json";
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

export function e2eConfig() {
    const workspace = process.env.SWSS_E2E_WORKSPACE || path.join(os.homedir(), "SiYuan-SpeedSwitch-E2E");
    const host = "127.0.0.1";
    const port = Number(process.env.SWSS_E2E_PORT || 6837);
    const artifactDir = path.resolve(process.env.SWSS_E2E_ARTIFACT_DIR || path.join(REPO_ROOT, ".artifacts", "e2e"));
    const pluginName = process.env.SWSS_E2E_PLUGIN_NAME || PLUGIN_NAME;
    const pluginSource = process.env.SWSS_E2E_PLUGIN_SOURCE || "";
    return {workspace, host, port, baseURL: `http://${host}:${port}`, artifactDir, pluginName, pluginSource};
}

export function listeningOwners(port) {
    let output;
    try {
        if (process.platform === "win32") {
            output = execFileSync("netstat", ["-ano", "-p", "tcp"], {encoding: "utf8", windowsHide: true});
        } else {
            try {
                output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {encoding: "utf8"});
            } catch {
                output = execFileSync("ss", ["-ltnp"], {encoding: "utf8"});
            }
        }
    } catch (error) {
        throw new Error(`无法确认端口 ${port} 的监听进程，拒绝启动 E2E 内核：${error?.message || error}`);
    }
    const owners = new Set();
    if (process.platform === "win32") {
        const portPattern = new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[?::\\]?|\\*):${port}\\b`);
        for (const line of String(output).split(/\r?\n/)) {
            if (!portPattern.test(line) || !/\bLISTEN(?:ING)?\b/i.test(line)) continue;
            const pid = line.trim().match(/(\d+)\s*$/)?.[1];
            if (pid) owners.add(Number(pid));
        }
    } else if (String(output).trim() && String(output).trim().split(/\r?\n/).every((line) => /^\d+$/.test(line.trim()))) {
        for (const pid of String(output).trim().split(/\r?\n/)) owners.add(Number(pid));
    } else {
        const portPattern = new RegExp(`(?:\\*|0\\.0\\.0\\.0|127\\.0\\.0\\.1|::|\\[::\\]):${port}(?:\\s|$)`);
        for (const line of String(output).split(/\r?\n/)) {
            if (!portPattern.test(line)) continue;
            const matches = [...line.matchAll(/pid=(\d+)/g)];
            if (matches.length) matches.forEach((match) => owners.add(Number(match[1])));
            else owners.add(-1);
        }
    }
    return owners;
}

export function assertPortUnoccupied(port) {
    const owners = listeningOwners(port);
    if (owners.size) throw new Error(`拒绝启动 E2E：端口 ${port} 已被 PID ${[...owners].join(", ")} 占用`);
}

export function assertPortOwnedByChild(port, childPid) {
    const owners = listeningOwners(port);
    if (!owners.has(Number(childPid)) || owners.size !== 1) {
        throw new Error(`端口 ${port} 监听者不属于本轮唯一内核进程：期望 PID ${childPid}，实际 ${[...owners].join(", ") || "无"}`);
    }
}

export async function waitForPortOwnedByChild(port, childPid, timeoutMs = 15000) {
    const deadline = Date.now() + Math.max(1, timeoutMs);
    while (Date.now() < deadline) {
        const owners = listeningOwners(port);
        if (owners.has(Number(childPid)) && owners.size === 1) return;
        if (owners.size > 0 && !owners.has(Number(childPid))) {
            throw new Error(`端口 ${port} 在启动期间被其他进程占用：PID ${[...owners].join(", ")}；拒绝向该服务发送请求`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`等待本轮内核 PID ${childPid} 监听端口 ${port} 超时；拒绝向该服务发送请求`);
}

/** 只允许指向本机回环，避免测试打到用户的远端思源。 */
function assertLoopback(baseURL) {
    const url = new URL(baseURL);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
        throw new Error(`E2E 只允许本机回环目标，当前为 ${url.hostname}（如需远端请显式改造并自担风险）`);
    }
}

/** 思源安装定位：优先环境变量，其次常见安装路径；返回内核与 app 目录。 */
export function resolveInstall() {
    const candidates = [];
    if (process.env.SWSS_E2E_KERNEL) candidates.push(process.env.SWSS_E2E_KERNEL);
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    candidates.push(
        path.join(programFiles, "SiYuan", "resources", "kernel", "SiYuan-Kernel.exe"),
        "D:\\RJ\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe",
        "D:\\biji\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe",
        "/Applications/SiYuan.app/Contents/Resources/kernel/SiYuan-Kernel",
    );
    const kernel = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!kernel) {
        throw new Error(`未找到 SiYuan-Kernel，请设置 SWSS_E2E_KERNEL。已尝试:\n${candidates.join("\n")}`);
    }
    const appDir = process.env.SWSS_E2E_APP_DIR || path.resolve(path.dirname(kernel), "..");
    for (const required of ["stage", "appearance"]) {
        if (!fs.existsSync(path.join(appDir, required))) throw new Error(`思源 app 目录缺少 ${required}: ${appDir}`);
    }
    return {kernel, appDir};
}

/** 工作区必须有我们自己的标记文件，绝不让 E2E 指向用户的真实笔记本数据。 */
export function prepareWorkspace(workspace) {
    if (fs.existsSync(workspace)) {
        const markerPath = path.join(workspace, MARKER_FILE);
        if (!fs.existsSync(markerPath)) {
            throw new Error(`拒绝使用非 E2E 工作区 ${workspace}：缺少 ${MARKER_FILE} 标记，可能是用户的真实数据`);
        }
        const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
        if (marker.protected) throw new Error(`工作区 ${workspace} 已被标记为 protected，拒绝写入`);
        return {created: false, marker};
    }
    fs.mkdirSync(path.join(workspace, "data"), {recursive: true});
    const marker = {createdBy: "siyuan-speed-switch e2e", createdIso: new Date().toISOString()};
    fs.writeFileSync(path.join(workspace, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`);
    return {created: true, marker};
}

/** 把 dist/ 装进工作区插件目录；思源要求 plugin.json.name 与目录名一致，否则整包静默不加载。 */
export function installPlugin(workspace, repoRoot, sourceDir = process.env.SWSS_E2E_PLUGIN_SOURCE || path.join(repoRoot, "dist"), pluginName = process.env.SWSS_E2E_PLUGIN_NAME || PLUGIN_NAME) {
    const dist = path.resolve(sourceDir);
    for (const required of ["index.js", "index.css", "plugin.json"]) {
        if (!fs.existsSync(path.join(dist, required))) {
            throw new Error(`dist/${required} 不存在，请先执行 pnpm run build`);
        }
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, "plugin.json"), "utf8"));
    if (manifest.name !== pluginName) throw new Error(`dist/plugin.json.name=${manifest.name} 与目录名 ${pluginName} 不一致`);
    const target = path.join(workspace, "data", "plugins", pluginName);
    fs.rmSync(target, {recursive: true, force: true});
    fs.mkdirSync(target, {recursive: true});
    fs.cpSync(dist, target, {recursive: true, force: true});
    // The release archive keeps the lazy studio chunk under dist/ so the
    // runtime URL remains explicit. Mirror that layout in the E2E plugin
    // directory after flattening the build output.
    const lazyChunk = path.join(target, "snippet-studio.js");
    if (fs.existsSync(lazyChunk)) {
        const lazyDir = path.join(target, "dist");
        fs.mkdirSync(lazyDir, {recursive: true});
        fs.renameSync(lazyChunk, path.join(lazyDir, "snippet-studio.js"));
    }
    return {target, version: manifest.version, pluginName};
}

/** extraArgs 必须是 serve 子命令的旗标（如 --readonly true），放在子命令之后。 */
export function startKernel({kernel, appDir, workspace, port, extraArgs = []}) {
    const child = spawn(kernel, ["--workspace", workspace, "serve", "--wd", appDir, "--port", String(port), ...extraArgs], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {...process.env, SIYUAN_WORKSPACE_PATH: workspace},
    });
    const lines = [];
    const capture = (stream) => stream.on("data", (chunk) => {
        String(chunk).split(/\r?\n/).forEach((line) => {
            if (!line) return;
            lines.push(line);
            if (lines.length > 4000) lines.shift();
        });
    });
    capture(child.stdout);
    capture(child.stderr);
    return {child, lines};
}

export function readAccessToken(workspace) {
    try {
        const conf = JSON.parse(fs.readFileSync(path.join(workspace, "conf", "conf.json"), "utf8"));
        return typeof conf.accessAuthCode === "string" ? conf.accessAuthCode : "";
    } catch {
        return "";
    }
}

/** 内核启动失败时把日志尾部一起抛出，避免只剩「超时」这种无信息失败。 */
function failWithLog(message, lines) {
    throw new Error(`${message}\n--- 内核日志尾部 ---\n${lines.slice(-30).join("\n")}`);
}

export class SiyuanClient {
    constructor({baseURL, token}) {
        assertLoopback(baseURL);
        this.baseURL = baseURL.replace(/\/$/, "");
        this.token = token || "";
    }

    headers(extra = {}) {
        const headers = {...extra};
        if (this.token) headers.Authorization = `Token ${this.token}`;
        return headers;
    }

    async post(route, body = {}) {
        const response = await fetch(`${this.baseURL}${route}`, {method: "POST", headers: this.headers({"Content-Type": "application/json"}), body: JSON.stringify(body)});
        const text = await response.text();
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`${route} 返回非 JSON（HTTP ${response.status}）: ${text.slice(0, 200)}`); }
        if (!response.ok && payload.code === undefined) throw new Error(`${route} HTTP ${response.status}: ${text.slice(0, 200)}`);
        return payload;
    }

    async postChecked(route, body = {}) {
        const payload = await this.post(route, body);
        if (payload.code !== 0) throw new Error(`${route} code=${payload.code} msg=${payload.msg || ""}`);
        return payload.data;
    }

    async version() { return this.postChecked("/api/system/version"); }

    async bootProgress() { return this.post("/api/system/bootProgress"); }

    async waitForBoot(lines, timeoutMs = 60000) {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            if ((lines || []).some((line) => line.includes("lock workspace"))) {
                failWithLog("工作区被锁定：另一个思源内核正占用它（或有残留进程握着 .lock）。关闭该实例，或用 SWSS_E2E_WORKSPACE 换一个测试工作区。", lines);
            }
            const progress = await this.bootProgress().catch(() => undefined);
            if (progress && progress.code === 0 && progress.data && Number(progress.data.progress) >= 100) {
                await this.version();
                return;
            }
            if (progress && progress.code !== 0 && progress.code !== undefined && progress.msg) throw new Error(`bootProgress: ${progress.msg}`);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        failWithLog(`等待内核就绪超时（${timeoutMs}ms）`, lines || []);
    }

    async getFile(storageName) {
        const response = await fetch(`${this.baseURL}/api/file/getFile`, {
            method: "POST",
            headers: this.headers({"Content-Type": "application/json"}),
            body: JSON.stringify({path: `/data/${STORAGE_DIR}/${storageName}`}),
        });
        if (response.status === 202 || response.status === 404) return undefined;
        const text = await response.text();
        if (!text) return undefined;
        try { return JSON.parse(text); } catch { throw new Error(`读取 ${storageName} 失败（HTTP ${response.status}）: ${text.slice(0, 160)}`); }
    }

    /** putFile 是 multipart 表单；写入插件存储会触发内核对其它前端实例的 dataChange 推送。 */
    async putFile(storageName, value) {
        const form = new FormData();
        form.set("path", `/data/${STORAGE_DIR}/${storageName}`);
        form.set("isDir", "false");
        form.set("file", new Blob([JSON.stringify(value)], {type: "application/json"}), storageName);
        const response = await fetch(`${this.baseURL}/api/file/putFile`, {method: "POST", headers: this.headers(), body: form});
        const text = await response.text();
        if (!response.ok) throw new Error(`写入 ${storageName} 失败 HTTP ${response.status}: ${text.slice(0, 200)}`);
        if (text) {
            const payload = JSON.parse(text);
            if (payload.code !== 0) throw new Error(`写入 ${storageName} code=${payload.code} msg=${payload.msg || ""}`);
        }
    }

    async readWorkspaceFile(workspacePath) {
        const response = await fetch(`${this.baseURL}/api/file/getFile`, {
            method: "POST",
            headers: this.headers({"Content-Type": "application/json"}),
            body: JSON.stringify({path: workspacePath}),
        });
        if (!response.ok) return undefined;
        return response.text();
    }

    async exit() { await this.post("/api/system/exit", {force: true}).catch(() => undefined); }

    /** 启用/禁用插件：内核会向其它前端实例推 reload/unload（不含本客户端）。 */
    async setPetalEnabled(packageName, enabled) { return this.post("/api/petal/setPetalEnabled", {packageName, enabled}); }
}

export async function stopKernel({client, child}, lines) {
    await client.exit();
    const exited = await Promise.race([
        new Promise((resolve) => child.once("exit", () => resolve(true))),
        new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
    ]);
    if (!exited) {
        child.kill("SIGKILL");
        if (lines) console.warn("[e2e] 内核未在 8 秒内退出，已强制结束");
    }
}

export function kernelErrorLines(lines) {
    const source = lines || [];
    const ignored = new Set();
    let exitSeen = false;
    let closingHttp = false;
    let closingErrors = [];
    // T-7245: cmux logs server closure at E level. Ignore only the complete, ordered
    // graceful-exit sequence; identical text during normal operation remains an error.
    for (let index = 0; index < source.length; index++) {
        const line = source[index];
        if (/^\s*I \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} conf\.go:\d+: exited kernel\s*$/.test(line)) {
            exitSeen = true;
            closingHttp = false;
            closingErrors = [];
        } else if (/^\s*I \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} operation_watchdog\.go:\d+: operation \[exit kernel servers\], stage \[close HTTP server\] started\s*$/.test(line)) {
            closingHttp = exitSeen;
            closingErrors = [];
        } else if (/^\s*I \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} operation_watchdog\.go:\d+: operation \[exit kernel servers\], stage \[close HTTP server\] finished(?:, elapsed \[[^\]\r\n]+\], total \[[^\]\r\n]+\])?\s*$/.test(line)) {
            if (closingHttp) closingErrors.forEach((errorIndex) => ignored.add(errorIndex));
            exitSeen = false;
            closingHttp = false;
            closingErrors = [];
        } else if (closingHttp && /^\s*E \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} cmux\.go:\d+: multiplexed HTTPS server error: mux: server closed\s*$/.test(line)) {
            closingErrors.push(index);
        }
    }
    return source.filter((line, index) => !ignored.has(index) && /^\s*(E |\[E\]|PANIC|F \[)/.test(line) && !/lock: another process is using|workspace is being locked/i.test(line));
}

/**
 * 集市信任（bazaar.trust）与插件启用状态都不在 data/plugins 目录里：
 * 前者是 conf.json 的开关，后者是 data/storage/petal/petals.json 的登记项。
 * 只把 dist 拷进 data/plugins 是不会加载的——这一步必须显式做。
 */
export async function enablePlugin({client, workspace, pluginName}) {
    const trust = await client.post("/api/setting/setBazaar", {trust: true});
    if (trust.code !== 0) {
        const confPath = path.join(workspace, "conf", "conf.json");
        const conf = fs.existsSync(confPath) ? JSON.parse(fs.readFileSync(confPath, "utf8")) : {};
        conf.bazaar = {...(conf.bazaar || {}), trust: true};
        fs.writeFileSync(confPath, JSON.stringify(conf, null, 2));
        throw new Error(`setBazaar 失败（code=${trust.code} msg=${trust.msg || ""}），已改写 conf.json，需要重启内核后重试`);
    }
    const enabled = await client.post("/api/petal/setPetalEnabled", {packageName: pluginName, enabled: true});
    if (enabled.code !== 0) throw new Error(`setPetalEnabled ${pluginName} 失败：code=${enabled.code} msg=${enabled.msg || ""}`);
    const petals = await client.post("/api/petal/loadPetals", {frontend: "desktop"});
    const loaded = (petals.data || []).find((item) => item.name === pluginName);
    if (!loaded) throw new Error(`内核未下发插件 ${pluginName}，loadPetals 返回 ${(petals.data || []).map((item) => item.name).join(", ") || "空"}`);
    if (!(loaded.js || "").length) throw new Error(`插件 ${pluginName} 的 index.js 为空，检查 dist 是否完整`);
    return {name: loaded.name, version: loaded.version, jsBytes: loaded.js.length, cssBytes: (loaded.css || "").length};
}
