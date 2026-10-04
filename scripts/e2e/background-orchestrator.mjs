/* 多插件 E2E 编排器（T-7112）：
   每个任务独占工作区、端口、产物目录和内核进程，并从同一份固定 dist 快照启动。
   该模块不负责构建插件；调用方应先完成生产构建，再把快照交给各个实例。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_BASE_PORT = 6837;
const DEFAULT_PORT_SCAN_LIMIT = 64;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_RUN_ROOT = path.join(REPO_ROOT, ".artifacts", "e2e-background");
const DEFAULT_WORKSPACE_ROOT = path.join(os.tmpdir(), "siyuan-speed-switch-e2e");
const DEFAULT_LEASE_ROOT = path.join(os.tmpdir(), "siyuan-speed-switch-e2e-port-leases");
const DEFAULT_COMMAND = [process.platform === "win32" ? "pnpm.cmd" : "pnpm", "test:e2e"];

function fail(message) {
    throw new Error(`[background-e2e] ${message}`);
}

function safeId(value) {
    const id = String(value || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) {
        fail(`任务 id 非法：${id || "空"}；只允许字母、数字、点、下划线和短横线`);
    }
    return id;
}

function asPositiveInteger(value, name) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) fail(`${name} 必须是正整数，当前为 ${value}`);
    return number;
}

function resolveCommand(command) {
    if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || !part)) {
        fail("command 必须是非空字符串数组，例如 [\"pnpm\", \"test:e2e\"]");
    }
    const parts = [...command];
    if (process.platform === "win32" && (parts[0] === "pnpm" || parts[0] === "pnpm.cmd" || parts[0] === "pnpm.ps1")) {
        const pnpmCmd = path.join(path.dirname(process.execPath), "pnpm.cmd");
        const corepackPnpm = path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "pnpm.js");
        if (fs.existsSync(corepackPnpm)) parts.splice(0, 1, process.execPath, corepackPnpm);
        else if (fs.existsSync(pnpmCmd)) parts[0] = pnpmCmd;
        else fail(`Windows 找不到可执行 pnpm：既无 ${pnpmCmd}，也无 ${corepackPnpm}`);
    }
    return parts;
}

function normalizeEnvironment(environment) {
    if (environment === undefined) return {};
    if (!environment || typeof environment !== "object" || Array.isArray(environment)) fail("env 必须是对象");
    return Object.fromEntries(Object.entries(environment).map(([key, value]) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail(`env 键名非法：${key}`);
        if (value === undefined || value === null || typeof value === "object") fail(`env.${key} 必须是标量值`);
        return [key, String(value)];
    }));
}

export function normalizeJobs(input, {baseDir = process.cwd(), count = 1, defaults = {}} = {}) {
    let jobs;
    if (input === undefined) {
        jobs = Array.from({length: count}, (_, index) => ({id: `instance-${index + 1}`}));
    } else if (Array.isArray(input)) {
        jobs = input;
    } else if (input && Array.isArray(input.jobs)) {
        jobs = input.jobs;
    } else {
        fail("jobs 文件必须是数组，或包含 jobs 数组的对象");
    }
    if (jobs.length === 0) fail("至少需要一个 E2E 任务");
    const seen = new Set();
    return jobs.map((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`第 ${index + 1} 个任务必须是对象`);
        const id = safeId(raw.id || `instance-${index + 1}`);
        if (seen.has(id)) fail(`任务 id 重复：${id}`);
        seen.add(id);
        const repoRoot = path.resolve(baseDir, raw.repoRoot || defaults.repoRoot || ".");
        const distDir = path.resolve(repoRoot, raw.distDir || defaults.distDir || "dist");
        const pluginName = raw.pluginName || defaults.pluginName || "";
        if (pluginName && !/^[A-Za-z0-9._-]+$/.test(pluginName)) fail(`插件名非法：${pluginName}`);
        return {
            id,
            repoRoot,
            distDir,
            pluginName,
            command: resolveCommand(raw.command || defaults.command || DEFAULT_COMMAND),
            env: normalizeEnvironment(raw.env),
        };
    });
}

function walkFiles(root, relative = "") {
    const directory = path.join(root, relative);
    return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) return walkFiles(root, child);
        if (!entry.isFile()) fail(`快照包含不支持的文件类型：${child}`);
        return [child];
    }).sort((left, right) => left.localeCompare(right));
}

export function hashDirectory(root) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`快照目录不存在：${root}`);
    const files = walkFiles(root);
    if (files.length === 0) fail(`快照目录为空：${root}`);
    const digest = crypto.createHash("sha256");
    const entries = files.map((relative) => {
        const bytes = fs.readFileSync(path.join(root, relative));
        const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        digest.update(relative.replaceAll(path.sep, "/"));
        digest.update("\0");
        digest.update(bytes);
        digest.update("\0");
        return {path: relative.replaceAll(path.sep, "/"), bytes: bytes.length, sha256};
    });
    return {sha256: digest.digest("hex"), files: entries};
}

export function createPluginSnapshot({repoRoot, distDir, snapshotRoot, pluginName = ""}) {
    const sourceDir = path.resolve(distDir);
    const manifestPath = path.join(sourceDir, "plugin.json");
    for (const required of ["index.js", "index.css", "plugin.json"]) {
        if (!fs.existsSync(path.join(sourceDir, required))) fail(`插件产物缺少 ${required}：${sourceDir}`);
    }
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (error) { fail(`无法解析 ${manifestPath}：${error.message}`); }
    const resolvedPluginName = pluginName || String(manifest.name || "");
    if (!resolvedPluginName) fail(`plugin.json 未提供 name：${manifestPath}`);
    if (manifest.name !== resolvedPluginName) fail(`plugin.json.name=${manifest.name} 与任务插件名 ${resolvedPluginName} 不一致`);
    fs.rmSync(snapshotRoot, {recursive: true, force: true});
    fs.mkdirSync(snapshotRoot, {recursive: true});
    const snapshotDist = path.join(snapshotRoot, "dist");
    fs.cpSync(sourceDir, snapshotDist, {recursive: true, force: true});
    const snapshot = hashDirectory(snapshotDist);
    const metadata = {
        createdIso: new Date().toISOString(),
        repoRoot: path.resolve(repoRoot),
        sourceDir,
        pluginName: resolvedPluginName,
        version: String(manifest.version || ""),
        ...snapshot,
    };
    const metadataPath = path.join(snapshotRoot, "snapshot.json");
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return {distDir: snapshotDist, metadataPath, ...metadata};
}

export function assertSnapshotUnchanged(snapshot) {
    const current = hashDirectory(snapshot.distDir);
    if (current.sha256 !== snapshot.sha256) fail(`固定构建快照被修改：${snapshot.distDir}`);
    return current;
}

function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid < 1) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === "EPERM";
    }
}

function tryListen(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        const finish = (available) => {
            server.removeAllListeners();
            if (server.listening) server.close(() => resolve(available));
            else resolve(available);
        };
        server.once("error", () => finish(false));
        server.listen({host: "127.0.0.1", port}, () => finish(true));
    });
}

function staleLease(lockPath) {
    try {
        const lease = JSON.parse(fs.readFileSync(path.join(lockPath, "lease.json"), "utf8"));
        return lease.pid !== process.pid && !processIsAlive(Number(lease.pid));
    } catch {
        return false;
    }
}

export async function acquirePortLease({basePort = DEFAULT_BASE_PORT, scanLimit = DEFAULT_PORT_SCAN_LIMIT, leaseRoot = DEFAULT_LEASE_ROOT, owner = "background-e2e"} = {}) {
    const first = asPositiveInteger(basePort, "basePort");
    const limit = asPositiveInteger(scanLimit, "scanLimit");
    if (first < 1024 || first + limit - 1 > 65535) fail(`端口扫描范围越界：${first}..${first + limit - 1}`);
    fs.mkdirSync(leaseRoot, {recursive: true});
    for (let offset = 0; offset < limit; offset += 1) {
        const port = first + offset;
        const lockPath = path.join(leaseRoot, `port-${port}`);
        try {
            fs.mkdirSync(lockPath);
        } catch (error) {
            if (error.code === "EEXIST" && staleLease(lockPath)) fs.rmSync(lockPath, {recursive: true, force: true});
            continue;
        }
        const token = crypto.randomUUID();
        fs.writeFileSync(path.join(lockPath, "lease.json"), `${JSON.stringify({owner, pid: process.pid, port, token, createdIso: new Date().toISOString()}, null, 2)}\n`);
        if (await tryListen(port)) {
            return {
                port,
                lockPath,
                token,
                release() {
                    try {
                        const current = JSON.parse(fs.readFileSync(path.join(lockPath, "lease.json"), "utf8"));
                        if (current.token === token) fs.rmSync(lockPath, {recursive: true, force: true});
                    } catch { /* 已清理或进程退出，不再阻塞下一次 E2E */ }
                },
            };
        }
        fs.rmSync(lockPath, {recursive: true, force: true});
    }
    fail(`没有可用端口：${first}..${first + limit - 1}`);
}

function readJsonIfExists(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return undefined; }
}

function writeStreamLines(stream, file) {
    const output = fs.createWriteStream(file, {flags: "a"});
    stream.on("data", (chunk) => output.write(chunk));
    return output;
}

function terminatePidTree(pid) {
    if (!Number.isInteger(pid) || pid < 1) return Promise.resolve();
    if (process.platform === "win32") {
        return new Promise((resolve) => {
            const killer = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `taskkill /PID ${pid} /T /F`], {stdio: "ignore", windowsHide: true});
            killer.once("exit", () => resolve());
            killer.once("error", () => resolve());
        });
    }
    try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch { /* 已退出 */ } }
    return Promise.resolve();
}

async function requestKernelExit(artifactDir) {
    const target = readJsonIfExists(path.join(artifactDir, "target.json"));
    if (!target?.baseURL) return;
    const headers = target.token ? {Authorization: `Token ${target.token}`} : {};
    await fetch(`${target.baseURL}/api/system/exit`, {method: "POST", headers: {...headers, "Content-Type": "application/json"}, body: JSON.stringify({force: true})}).catch(() => undefined);
    await terminatePidTree(Number(target.kernelPid));
}

function waitForChild(child, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        let timer;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        child.once("error", (error) => finish({error}));
        child.once("exit", (code, signal) => finish({code, signal}));
        timer = setTimeout(() => finish({timedOut: true}), timeoutMs);
    });
}

export async function runJob(plan, {timeoutMs = DEFAULT_TIMEOUT_MS, onStart = () => {}, onFinish = () => {}} = {}) {
    fs.mkdirSync(plan.artifactDir, {recursive: true});
    fs.writeFileSync(path.join(plan.artifactDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    assertSnapshotUnchanged(plan.snapshot);
    const [command, ...args] = plan.command;
    const spawnOptions = {
        cwd: plan.repoRoot,
        env: {
            ...process.env,
            ...plan.env,
            SWSS_E2E_WORKSPACE: plan.workspace,
            SWSS_E2E_PORT: String(plan.port),
            SWSS_E2E_ARTIFACT_DIR: plan.artifactDir,
            SWSS_E2E_PLUGIN_NAME: plan.pluginName,
            SWSS_E2E_PLUGIN_SOURCE: plan.snapshot.distDir,
            SWSS_E2E_SNAPSHOT_META: plan.snapshot.metadataPath,
            SWSS_E2E_BACKGROUND_INSTANCE_ID: plan.id,
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32" && /\.cmd$/i.test(command),
    };
    let child;
    try {
        child = spawn(command, args, spawnOptions);
    } catch (error) {
        onFinish(undefined, plan);
        return {id: plan.id, status: "failed", exitCode: null, signal: null, error: error.message, port: plan.port, workspace: plan.workspace, artifactDir: plan.artifactDir};
    }
    onStart(child, plan);
    const stdout = writeStreamLines(child.stdout, path.join(plan.artifactDir, "runner.stdout.log"));
    const stderr = writeStreamLines(child.stderr, path.join(plan.artifactDir, "runner.stderr.log"));
    const result = await waitForChild(child, timeoutMs);
    if (result.timedOut) {
        await requestKernelExit(plan.artifactDir);
        await terminatePidTree(child.pid);
    }
    await requestKernelExit(plan.artifactDir);
    await new Promise((resolve) => { stdout.end(resolve); });
    await new Promise((resolve) => { stderr.end(resolve); });
    let snapshotError;
    try { assertSnapshotUnchanged(plan.snapshot); } catch (error) { snapshotError = error; }
    const status = result.timedOut ? "timed-out" : result.error || result.code !== 0 ? "failed" : "passed";
    if (!plan.keepWorkspaces) fs.rmSync(plan.workspace, {recursive: true, force: true});
    onFinish(child, plan);
    return {
        id: plan.id,
        status: snapshotError ? "failed" : status,
        exitCode: result.code ?? null,
        signal: result.signal || null,
        error: result.error?.message || snapshotError?.message || null,
        port: plan.port,
        workspace: plan.workspace,
        artifactDir: plan.artifactDir,
    };
}

function timestampId() {
    return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function createRunPlan({jobs, runRoot = DEFAULT_RUN_ROOT, workspaceRoot = DEFAULT_WORKSPACE_ROOT, basePort = DEFAULT_BASE_PORT, portScanLimit = DEFAULT_PORT_SCAN_LIMIT, keepWorkspaces = true} = {}) {
    if (!Array.isArray(jobs) || jobs.length === 0) fail("createRunPlan 至少需要一个任务");
    const runId = timestampId();
    const root = path.resolve(runRoot, runId);
    fs.mkdirSync(root, {recursive: true});
    const snapshotsRoot = path.join(root, "snapshots");
    const artifactsRoot = path.join(root, "artifacts");
    const workspacesRoot = path.resolve(workspaceRoot, runId);
    fs.mkdirSync(snapshotsRoot, {recursive: true});
    fs.mkdirSync(artifactsRoot, {recursive: true});
    fs.mkdirSync(workspacesRoot, {recursive: true});
    const snapshotCache = new Map();
    const plans = [];
    const leases = [];
    try {
        for (const job of jobs) {
            const cacheKey = `${job.repoRoot}\0${job.distDir}\0${job.pluginName}`;
            let snapshot = snapshotCache.get(cacheKey);
            if (!snapshot) {
                const snapshotId = `snapshot-${snapshotCache.size + 1}`;
                snapshot = createPluginSnapshot({repoRoot: job.repoRoot, distDir: job.distDir, snapshotRoot: path.join(snapshotsRoot, snapshotId), pluginName: job.pluginName});
                snapshotCache.set(cacheKey, snapshot);
            }
            const lease = await acquirePortLease({basePort, scanLimit: portScanLimit, owner: `${runId}/${job.id}`});
            leases.push(lease);
            const workspace = path.join(workspacesRoot, job.id);
            const artifactDir = path.join(artifactsRoot, job.id);
            const pluginName = job.pluginName || snapshot.pluginName;
            plans.push({
                id: job.id,
                repoRoot: job.repoRoot,
                pluginName,
                command: job.command,
                env: job.env,
                port: lease.port,
                workspace,
                artifactDir,
                snapshot,
                keepWorkspaces,
            });
        }
    } catch (error) {
        leases.forEach((lease) => lease.release());
        throw error;
    }
    const metadata = {runId, createdIso: new Date().toISOString(), root, workspaceRoot: workspacesRoot, plans: plans.map(({snapshot, ...plan}) => ({...plan, snapshot: {sha256: snapshot.sha256, pluginName: snapshot.pluginName, version: snapshot.version, metadataPath: snapshot.metadataPath}}))};
    fs.writeFileSync(path.join(root, "run.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    return {runId, root, plans, leases, metadata};
}

function loadJobsFile(file) {
    const absolute = path.resolve(file);
    const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
    return {raw, baseDir: path.dirname(absolute)};
}

export function parseArgs(argv) {
    const options = {count: 2, basePort: DEFAULT_BASE_PORT, portScanLimit: DEFAULT_PORT_SCAN_LIMIT, timeoutMs: DEFAULT_TIMEOUT_MS, keepWorkspaces: true};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = () => { if (index + 1 >= argv.length) fail(`${arg} 缺少参数`); index += 1; return argv[index]; };
        if (arg === "--jobs-file") options.jobsFile = next();
        else if (arg === "--count") options.count = asPositiveInteger(next(), "count");
        else if (arg === "--base-port") options.basePort = asPositiveInteger(next(), "base-port");
        else if (arg === "--port-scan-limit") options.portScanLimit = asPositiveInteger(next(), "port-scan-limit");
        else if (arg === "--timeout-ms") options.timeoutMs = asPositiveInteger(next(), "timeout-ms");
        else if (arg === "--run-root") options.runRoot = next();
        else if (arg === "--workspace-root") options.workspaceRoot = next();
        else if (arg === "--keep-workspaces") options.keepWorkspaces = true;
        else if (arg === "--remove-workspaces") options.keepWorkspaces = false;
        else if (arg === "--dry-run") options.dryRun = true;
        else if (arg === "--help" || arg === "-h") options.help = true;
        else fail(`未知参数：${arg}`);
    }
    return options;
}

function printHelp() {
    console.log(`用法：node scripts/e2e/background-orchestrator.mjs [选项]

默认启动当前插件的 2 个隔离 E2E 实例。跨插件时使用 --jobs-file。
  --jobs-file <json>       任务配置文件（每项含 id/repoRoot/pluginName/command）
  --count <n>              无 jobs 文件时启动当前插件实例数，默认 2
  --base-port <n>          端口扫描起点，默认 6837
  --port-scan-limit <n>    端口扫描数量，默认 64
  --timeout-ms <n>         单任务超时，默认 1200000
  --run-root <path>        编排产物根目录
  --workspace-root <path>  临时工作区根目录
  --remove-workspaces      任务结束后删除本轮工作区
  --dry-run                只生成计划，不启动测试
`);
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) { printHelp(); return 0; }
    const loaded = options.jobsFile ? loadJobsFile(options.jobsFile) : {raw: undefined, baseDir: process.cwd()};
    const jobs = normalizeJobs(loaded.raw, {baseDir: loaded.baseDir, count: options.count});
    const run = await createRunPlan({...options, jobs});
    console.log(`[background-e2e] run ${run.runId}：${run.plans.map((plan) => `${plan.id}@${plan.port}`).join(", ")}`);
    if (options.dryRun) {
        run.leases.forEach((lease) => lease.release());
        console.log(JSON.stringify(run.metadata, null, 2));
        return 0;
    }
    let interrupted = false;
    const active = new Map();
    const onInterrupt = () => {
        interrupted = true;
        for (const [child, plan] of active) {
            void requestKernelExit(plan.artifactDir);
            void terminatePidTree(child.pid);
        }
    };
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onInterrupt);
    let results;
    try {
        results = await Promise.all(run.plans.map(async (plan) => {
            const promise = runJob(plan, {timeoutMs: options.timeoutMs, onStart: (child) => active.set(child, plan), onFinish: (child) => active.delete(child)});
            const result = await promise;
            return result;
        }));
    } finally {
        process.removeListener("SIGINT", onInterrupt);
        process.removeListener("SIGTERM", onInterrupt);
        run.leases.forEach((lease) => lease.release());
    }
    const summary = {runId: run.runId, interrupted, results};
    fs.writeFileSync(path.join(run.root, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    return interrupted || results.some((result) => result.status !== "passed") ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}` || path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
    main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
