/* E2E 基础设施（T-6833，移植自小驴打卡 scripts/e2e/lib.mjs 的成熟方案）：
   用本机已安装的思源内核跑真实插件实例——独立隔离工作区 + 真实 dist 安装链 +
   真实前端 bundle（/stage/build/desktop|mobile）。 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawn} from "node:child_process";

export const PLUGIN_NAME = "siyuan-speed-switch";
export const STORAGE_DIR = `storage/petal/${PLUGIN_NAME}`;
export const MARKER_FILE = "swss-e2e.json";

export function e2eConfig() {
    const workspace = process.env.SWSS_E2E_WORKSPACE || path.join(os.homedir(), "SiYuan-SpeedSwitch-E2E");
    const host = "127.0.0.1";
    const port = Number(process.env.SWSS_E2E_PORT || 6837);
    return {workspace, host, port, baseURL: `http://${host}:${port}`};
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
export function installPlugin(workspace, repoRoot) {
    const dist = path.join(repoRoot, "dist");
    for (const required of ["index.js", "index.css", "plugin.json"]) {
        if (!fs.existsSync(path.join(dist, required))) {
            throw new Error(`dist/${required} 不存在，请先执行 pnpm run build`);
        }
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dist, "plugin.json"), "utf8"));
    if (manifest.name !== PLUGIN_NAME) throw new Error(`dist/plugin.json.name=${manifest.name} 与目录名 ${PLUGIN_NAME} 不一致`);
    const target = path.join(workspace, "data", "plugins", PLUGIN_NAME);
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
    return {target, version: manifest.version};
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
    return (lines || []).filter((line) => /^\s*(E |\[E\]|PANIC|F \[)/.test(line) && !/lock: another process is using|workspace is being locked/i.test(line));
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
