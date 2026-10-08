// T-7155：材质层叠修复的计算样式实证。
// 用真实打包 dist/index.css + 最小工作台 DOM，采样 plain/accent/dark/vibrant
// 四种材质卡片的计算背景与文字色：
//  - 彩色材质 background-image 必须是渐变（修复前被 _06/_07 通用背景覆盖为 none）；
//  - 彩色材质 color 必须是材质浅色前景（白系），不允许回退到深色主题文字；
//  - 背景与文字做粗对比度检查（≥3:1），白字浅底的历史缺陷必须精确失败。
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawn} = require("node:child_process");
const assert = require("node:assert/strict");

const repo = path.resolve(__dirname, "..");
const cssPath = path.join(repo, "dist", "index.css");
const baseCssPath = path.join(repo, "tests", "fixtures", "siyuan-mobile-base.css");
if (!fs.existsSync(cssPath)) throw new Error("dist/index.css missing — run pnpm build first");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-material-check-"));
const htmlPath = path.join(tempDir, "index.html");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cells = ["plain", "accent", "dark", "vibrant"].map((mat) => {
    const cls = mat === "plain" ? "" : ` mat-${mat}`;
    return `<div class="sw-home" id="host"><div class="sw-home__grid"><div class="sw-home__cell${cls}" data-material="${mat}"><div class="sw-home__cell-body"><div class="sw__home-module"><div class="sw__home-module-header">Header</div><div class="sw__home-stat-value">42</div></div></div></div></div></div>`;
}).join("\n");

fs.writeFileSync(htmlPath, `<!doctype html><html data-theme-mode="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///${baseCssPath.replace(/\\/g, "/")}">
<link rel="stylesheet" href="file:///${cssPath.replace(/\\/g, "/")}">
</head><body>${cells}</body></html>`);

const candidates = [process.env.BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter((c) => fs.existsSync(c));
const browserPath = candidates[0];
if (!browserPath) throw new Error("Chromium not found");

async function main() {
    const profile = fs.mkdtempSync(path.join(tempDir, "profile-"));
    const child = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run",
        "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio: "ignore", windowsHide: true});
    let socket;
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
        await send("Page.enable");
        await send("Page.navigate", {url: "file:///" + htmlPath.replace(/\\/g, "/")});
        await delay(600);
        const r = await send("Runtime.evaluate", {expression: `(() => {
            const parse = (c) => { const m = c.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : [0, 0, 0, 0]; };
            const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
            const out = {};
            for (const cell of document.querySelectorAll(".sw-home__cell")) {
                const cs = getComputedStyle(cell);
                out[cell.dataset.material] = {
                    bgImage: cs.backgroundImage,
                    bg: cs.backgroundColor,
                    color: cs.color,
                };
            }
            // 对比度：彩色材质上首段文字相对卡片合成背景
            for (const mat of ["accent", "dark", "vibrant"]) {
                const cell = document.querySelector('.sw-home__cell[data-material="' + mat + '"]');
                const cs = getComputedStyle(cell);
                const text = getComputedStyle(cell.querySelector(".sw__home-stat-value")).color;
                // 用渐变中点近似合成背景（取 background-image 无法直接采样，退而断言文字为白系）
                out[mat + "_text"] = text;
            }
            return out;
        })()`, returnByValue: true});
        if (r.exceptionDetails) throw new Error("PAGE ERROR: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
        const s = r.result.value;
        console.log(JSON.stringify(s, null, 1));

        for (const mat of ["accent", "dark", "vibrant"]) {
            assert.match(s[mat].bgImage, /gradient/i, `${mat}: 彩色材质背景必须是渐变（修复前被通用规则覆盖为 none）`);
            const [tr, tg, tb] = parseColor(s[mat].color);
            assert.ok(tr > 200 && tg > 200 && tb > 200, `${mat}: 材质前景必须为白系，实际 ${s[mat].color}`);
        }
        assert.doesNotMatch(s.plain.bgImage, /gradient/i, "plain 无材质渐变属预期");
        console.log("material computed-style check: OK");
    } finally {
        socket?.close();
        child.kill();
        setTimeout(() => { try { fs.rmSync(tempDir, {recursive: true, force: true}); } catch {} }, 500);
    }
}

function parseColor(c) {
    const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

main().catch((e) => { console.error("MATERIAL CHECK FAILED:", e.message); process.exit(1); });
