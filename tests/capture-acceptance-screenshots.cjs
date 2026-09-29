// T-7020 验收截图基建：表面×主题矩阵 → PNG（服务 T-7015/T-7036 视觉验收）。
// 驱动机制与 tests/surface-switch-browser-smoke.cjs 同源（esbuild 打真实
// src/index.ts bundle + siyuan-stub + CDP 驱动真实 Chromium）。
// 主题为近似调色板（b3 变量子集），真实思源主题观感归 B-005——本工具产出
// 结构性视觉证据，不冒充真实宿主验收。
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawn} = require("node:child_process");
const {createRequire} = require("node:module");
const esbuild = createRequire(require.resolve("esbuild-loader"))("esbuild");

const repo = process.cwd();
const outDir = path.join(repo, "acceptance-screenshots");
fs.mkdirSync(outDir, {recursive: true});
const artifactDir = path.join(repo, ".tmp", "acceptance-shots");
fs.mkdirSync(artifactDir, {recursive: true});
const profile = fs.mkdtempSync(path.join(artifactDir, "profile-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bundle = esbuild.buildSync({
    stdin: {contents: 'import * as mod from "./index.ts";\nglobalThis.__SpeedSwitch = mod.default ?? mod;',
        resolveDir: path.join(repo, "src"), loader: "ts"},
    bundle: true, format: "iife", platform: "browser", write: false,
    alias: {siyuan: path.join(repo, "tests", "fixtures", "siyuan-stub.ts")},
    loader: {".scss": "empty", ".svg": "empty"},
}).outputFiles[0].text;
fs.writeFileSync(path.join(artifactDir, "bundle.js"), bundle);

const i18nJson = fs.readFileSync(path.join(repo, "src", "i18n", "zh-CN.json"), "utf8");
// 近似 b3 调色板：仅覆盖主要变量，让明暗主题在截图里可区分；真实主题归 B-005。
const PALETTES = {
    light: "--b3-theme-primary:#3575f0;--b3-theme-primary-light:#7a9ff5;--b3-theme-primary-lightest:#dce6fc;--b3-theme-background:#ffffff;--b3-theme-surface:#f5f5f5;--b3-theme-background-light:#fafafa;--b3-theme-on-background:#1f1f1f;--b3-theme-on-surface:#3f3f3f;--b3-theme-on-primary:#ffffff;--b3-border-color:#e0e0e0;--b3-list-hover:#e8e8e8;",
    dark: "--b3-theme-primary:#5b8cf0;--b3-theme-primary-light:#3a5db0;--b3-theme-primary-lightest:#1f2a44;--b3-theme-background:#1e1e1e;--b3-theme-surface:#2a2a2a;--b3-theme-background-light:#252525;--b3-theme-on-background:#dddddd;--b3-theme-on-surface:#bbbbbb;--b3-theme-on-primary:#ffffff;--b3-border-color:#3f3f3f;--b3-list-hover:#333333;",
};

function pageHtml(theme) {
    return `<!doctype html><html data-theme-mode="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="./index.css"><style>:root{${PALETTES[theme]}}</style></head><body>
<script>window.__stubI18n = ${i18nJson};</script>
<script>window.__bootLog = [];</script>
<script src="./bundle.js"></script>
<script>
(async () => {
    try {
        window.siyuan = {zIndex: 90, config: {snippet: {}, lang: "zh_CN"}};
        window.fetch = async (url) => {
            const u = String(url);
            const ok = (body) => new Response(JSON.stringify(body), {status: 200, headers: {"Content-Type": "application/json"}});
            if (u.includes("/api/snippet/")) return ok({snippets: [], css: [], js: []});
            if (u.includes("/api/notebook/")) return ok({notebooks: []});
            return ok({code: 0, msg: "", data: null});
        };
        if (typeof window.__SpeedSwitch !== "function") throw new Error("bundle did not define the plugin class");
        const plugin = new window.__SpeedSwitch();
        await plugin.onload();
        plugin.onLayoutReady();
        window.__plugin = plugin;
        window.__bootState = "booted";
    } catch (e) {
        window.__bootState = "boot-failed: " + (e && e.message);
    }
})();
</script></body></html>`;
}

// 表面×主题矩阵：新增验收面时在 CASES 追加（契约 tests/screenshot-infra.test.cjs 钉住锚点）
const CASES = [
    {id: "switcher-light", theme: "light", action: "window.__plugin.showSwitcher()"},
    {id: "switcher-dark", theme: "dark", action: "window.__plugin.showSwitcher()"},
    {id: "workbench-light", theme: "light", action: 'window.__plugin.openPlatformSurface("workbench")'},
    {id: "workbench-dark", theme: "dark", action: 'window.__plugin.openPlatformSurface("workbench")'},
    {id: "studio-light", theme: "light", action: 'window.__plugin.openPlatformSurface("studio")'},
    {id: "studio-dark", theme: "dark", action: 'window.__plugin.openPlatformSurface("studio")'},
];

const candidates = [process.env.BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter((c) => fs.existsSync(c));
const browserPath = candidates[0];
if (!browserPath) throw new Error("Chromium not found");

async function main() {
    const child = spawn(browserPath, ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
        "--allow-file-access-from-files",
        "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio: "ignore", windowsHide: true});
    let socket;
    const failures = [];
    try {
        const portFile = path.join(profile, "DevToolsActivePort");
        for (let i = 0; !fs.existsSync(portFile) && i < 100; i += 1) await delay(100);
        const port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
        socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
        let seq = 0;
        const pending = new Map();
        socket.addEventListener("message", (event) => {
            const msg = JSON.parse(String(event.data));
            if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        });
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++seq;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
            pending.set(id, (msg) => { clearTimeout(timer); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); });
            socket.send(JSON.stringify({id, method, params}));
        });
        const evalJs = async (expression) => {
            const r = await send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
            if (r.exceptionDetails) throw new Error("PAGE ERROR: " + JSON.stringify(r.exceptionDetails).slice(0, 600));
            return r.result.value;
        };
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {width: 1366, height: 768, deviceScaleFactor: 1, mobile: false});
        for (const entry of CASES) {
            const page = path.join(artifactDir, `page-${entry.theme}.html`);
            if (!fs.existsSync(page)) fs.writeFileSync(page, pageHtml(entry.theme));
            await send("Page.navigate", {url: "file:///" + page.replace(/\\/g, "/")});
            for (let i = 0; i < 40; i += 1) {
                await delay(150);
                const state = await evalJs("window.__bootState || 'loading'");
                if (state !== "loading") break;
            }
            const state = await evalJs("window.__bootState || 'loading'");
            if (state !== "booted") { failures.push(`${entry.id}: boot ${state}`); continue; }
            await evalJs(entry.action);
            await delay(600);
            const shot = await send("Page.captureScreenshot", {format: "png"});
            const out = path.join(outDir, `${entry.id}.png`);
            fs.writeFileSync(out, Buffer.from(shot.data, "base64"));
            console.log(`captured ${entry.id} -> ${path.relative(repo, out)} (${fs.statSync(out).size} bytes)`);
        }
        if (failures.length) throw new Error(failures.join("; "));
        console.log(`acceptance screenshots: ${CASES.length} captured to acceptance-screenshots/`);
    } finally {
        socket?.close();
        child.kill();
    }
}
main().catch((e) => { console.error("HARNESS FAILED:", e.message); process.exit(1); });
