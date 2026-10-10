// 面板互切 CDP 复现（T-7015 后续诊断）：全屏切换器/工作台 → 打开片段实验室。
// 真实 src/index.ts bundle（siyuan 走高保真桩）以 <script src> 加载，驱动面板互切。
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawn} = require("node:child_process");
const {createRequire} = require("node:module");
const assert = require("node:assert/strict");
const esbuild = createRequire(require.resolve("esbuild-loader"))("esbuild");

const repo = process.cwd();
const artifactDir = path.join(repo, ".tmp", "surface-switch");
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
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./index.css"></head><body>
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
fs.copyFileSync(path.join(repo, "dist", "index.css"), path.join(artifactDir, "index.css"));
fs.writeFileSync(path.join(artifactDir, "page.html"), pageHtml);

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
        const captureHeader = async (name) => {
            const shot = await send("Page.captureScreenshot", {format: "png"});
            fs.writeFileSync(path.join(artifactDir, name), Buffer.from(shot.data, "base64"));
        };
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {width: 1366, height: 768, deviceScaleFactor: 1, mobile: false});
        await send("Page.navigate", {url: "file:///" + path.join(artifactDir, "page.html").replace(/\\/g, "/")});
        for (let i = 0; i < 40; i += 1) {
            await delay(150);
            const state = await evalJs("window.__bootState || 'loading'");
            if (state !== "loading") { console.log("boot:", state); break; }
        }
        const snapshot = () => evalJs(`(() => {
            const dialogs = [...document.querySelectorAll(".b3-dialog")].map((d) => ({
                studio: !!d.querySelector(".sw-snippet-studio-host"),
                studioMounted: !!d.querySelector(".sw-studio"),
                surface: d.querySelector("[data-sw-surface]")?.dataset.swSurface || null,
                z: Number(d.style.zIndex || 0),
                containerSize: (() => { const r = d.querySelector(".b3-dialog__container").getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); })(),
                connected: d.isConnected,
            }));
            return JSON.stringify({dialogs});
        })()`);
        const assertDialogs = async (label, expect) => {
            const snap = JSON.parse(await snapshot());
            const dialogs = snap.dialogs.filter((d) => d.connected);
            for (const rule of expect) {
                const hit = dialogs.find((d) => d.surface === rule.surface);
                assert.ok(hit, `${label}: ${rule.surface} dialog must exist`);
                if (rule.studioMounted !== undefined) {
                    assert.equal(hit.studioMounted, rule.studioMounted, `${label}: ${rule.surface} studio mount state`);
                }
                if (rule.fullscreen) {
                    assert.ok(hit.containerSize.startsWith("1366x"), `${label}: ${rule.surface} must fill viewport, got ${hit.containerSize}`);
                }
                if (rule.zAbove) {
                    const others = dialogs.filter((d) => d !== hit);
                    assert.ok(others.every((d) => hit.z > d.z), `${label}: ${rule.surface} z ${hit.z} must be above ${JSON.stringify(others.map((d) => d.z))}`);
                }
            }
            // SurfaceNav 诚实性：「片段实验室」只能是 BUTTON 或不存在；当前表面的
            // aria-current span 合法（studio 自身 chrome），无 aria-current 的
            // 非 button 项 = 灰字假入口（用户实测形态），必须为零。
            const fakeNav = await evalJs(`[...document.querySelectorAll('.sw-platform-surface-nav__item')].filter((x) => x.dataset.surface === 'studio' && x.tagName !== 'BUTTON' && !x.hasAttribute('aria-current')).length`);
            assert.equal(fakeNav, 0, `${label}: studio nav entry must never render as a non-button (fake entry)`);
            console.log(`${label}: OK`);
        };
        await evalJs(`window.__plugin.showSwitcher()`);
        await delay(250);
        // case A：全屏切换器 + 真实点击工具栏 studio 按钮（与用户操作一致）
        await evalJs(`document.querySelector('.sw__snippet-studio-btn').click()`);
        await delay(600);
        await assertDialogs("case A (fullscreen switcher, real click)", [
            {surface: "studio", studioMounted: true, fullscreen: true, zAbove: true},
        ]);
        // case B：studio=adaptive 从全屏切换器进（T-6986 非全屏分支）
        await evalJs(`window.__plugin.snippetStudioDialog && window.__plugin.snippetStudioDialog.destroy(); window.__plugin.updateSettings({studioSizeMode: 'adaptive'}); window.__plugin.showSwitcher();`);
        await delay(250);
        await evalJs(`document.querySelector('.sw__snippet-studio-btn').click()`);
        await delay(600);
        await assertDialogs("case B (studio adaptive, real click)", [
            {surface: "studio", studioMounted: true},
        ]);
        await evalJs(`window.__plugin.snippetStudioDialog && window.__plugin.snippetStudioDialog.destroy(); window.__plugin.updateSettings({studioSizeMode: 'fullscreen'}); window.__plugin.showSwitcher();`);
        await delay(250);
        // case C：全屏工作台 → SurfaceNav 点「片段实验室」（真实按钮）
        await evalJs(`window.__plugin.openPlatformSurface("workbench");`);
        await delay(300);
        const navClicked = await evalJs(`(() => { const b = [...document.querySelectorAll('.sw-platform-surface-nav__item')].find((x) => x.dataset.surface === 'studio' && x.tagName === 'BUTTON'); if (b) b.click(); return !!b; })()`);
        assert.equal(navClicked, true, "case C: workbench surface-nav must render studio as a real button");
        await delay(600);
        await assertDialogs("case C (fullscreen workbench, surface-nav click)", [
            {surface: "studio", studioMounted: true, fullscreen: true, zAbove: true},
        ]);

        const readHeaderGeometry = async () => JSON.parse(await evalJs(`(() => {
            const headers = [...document.querySelectorAll('.sw-platform-header')]
                .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            const header = headers.at(-1);
            if (!header) return null;
            const rect = (selector) => {
                const el = selector === '.sw-platform-header' ? header : header.querySelector(selector);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height};
            };
            return JSON.stringify({
                header: rect('.sw-platform-header'),
                brand: rect('.sw-platform-header__brand'),
                nav: rect('.sw-platform-surface-nav'),
                actions: rect('.sw-platform-header__actions'),
                settings: rect('.sw-platform-header__settings'),
                close: rect('.sw-platform-header__close'),
                items: [...header.querySelectorAll('.sw-platform-surface-nav__item')].map((el) => {
                    const r = el.getBoundingClientRect();
                    return {surface: el.dataset.surface, tag: el.tagName, width: r.width, height: r.height};
                }),
            });
        })()`));
        const desktopGeometry = await readHeaderGeometry();
        assert.ok(desktopGeometry?.close, "R5 header: close button is present in the active surface");
        assert.ok(desktopGeometry.actions.right <= desktopGeometry.header.right - 12,
            `R5 desktop: action group is anchored to the right edge (${JSON.stringify(desktopGeometry)})`);
        assert.ok(Math.abs((desktopGeometry.nav.left + desktopGeometry.nav.right) / 2
            - (desktopGeometry.header.left + desktopGeometry.header.right) / 2) < 4,
        `R5 desktop: surface navigation is centered (${JSON.stringify(desktopGeometry)})`);
        assert.ok(desktopGeometry.items.every((item) => item.width >= 100 && item.height >= 48),
            `R5 desktop: every surface entry has a stable hit target (${JSON.stringify(desktopGeometry.items)})`);
        await captureHeader("topbar-desktop.png");

        await send("Emulation.setDeviceMetricsOverride", {width: 560, height: 820, deviceScaleFactor: 1, mobile: false});
        await delay(200);
        const narrowGeometry = await readHeaderGeometry();
        assert.ok(narrowGeometry.nav.top >= narrowGeometry.actions.bottom,
            `R5 narrow: navigation occupies its own second row (${JSON.stringify(narrowGeometry)})`);
        assert.ok(narrowGeometry.close.right <= narrowGeometry.header.right - 8,
            `R5 narrow: close button stays at the far right (${JSON.stringify(narrowGeometry)})`);
        assert.ok(narrowGeometry.items.every((item) => item.width >= 80 && item.height >= 44),
            `R5 narrow: surface entries remain easy to hit (${JSON.stringify(narrowGeometry.items)})`);
        await captureHeader("topbar-narrow.png");

        await send("Emulation.setDeviceMetricsOverride", {width: 560, height: 600, deviceScaleFactor: 1, mobile: false});
        await delay(120);
        const shortWindowGeometry = await readHeaderGeometry();
        assert.ok(shortWindowGeometry.items.every((item) => item.height >= 44),
            `R5 short window: compact header keeps 44px navigation targets (${JSON.stringify(shortWindowGeometry.items)})`);

        await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
        await send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 1});
        await delay(120);
        const touchGeometry = await readHeaderGeometry();
        const touchPointer = await evalJs(`matchMedia('(pointer: coarse)').matches`);
        assert.ok(touchPointer, "R5 touch: browser is emulating a coarse primary pointer");
        assert.ok(touchGeometry.items.every((item) => item.height >= 48),
            `R5 touch: surface entries keep a 48px target (${JSON.stringify(touchGeometry.items)})`);
        assert.ok(touchGeometry.close.height >= 44,
            `R5 touch: close remains at least 44px (${JSON.stringify(touchGeometry.close)})`);
        assert.ok(touchGeometry.settings?.height >= 44,
            `R5 touch: settings remains at least 44px (${JSON.stringify(touchGeometry.settings)})`);
        await captureHeader("topbar-touch.png");

        await send("Emulation.setTouchEmulationEnabled", {enabled: false});
        await send("Emulation.setDeviceMetricsOverride", {width: 560, height: 820, deviceScaleFactor: 1, mobile: false});
        await delay(120);
        const clickSurfaceWithPointer = async (surface, label) => {
            const point = await evalJs(`(() => {
                const button = [...document.querySelectorAll('.sw-platform-surface-nav__item')]
                    .find((el) => el.dataset.surface === ${JSON.stringify(surface)} && el.tagName === 'BUTTON');
                if (!button) return null;
                const r = button.getBoundingClientRect();
                return {x: r.left + r.width / 2, y: r.top + r.height / 2};
            })()`);
            assert.ok(point, `${label}: ${surface} surface must be a real button`);
            await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x, y: point.y});
            await send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1});
            await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1});
            await delay(600);
            await assertDialogs(`${label} (coordinate click)`, [{surface, studioMounted: surface === "studio"}]);
        };
        await clickSurfaceWithPointer("workbench", "R5 narrow switch to workbench");
        await clickSurfaceWithPointer("switcher", "R5 narrow switch to switcher");
        await clickSurfaceWithPointer("studio", "R5 narrow switch back to studio");

        const sidebarSetup = await evalJs(`(() => {
            const host = document.createElement('div');
            host.className = 'sw--sidebar';
            Object.assign(host.style, {position: 'fixed', left: '0', top: '0', width: '245px', zIndex: '99999'});
            document.body.appendChild(host);
            const labels = {
                platformName: '小驴雷切', contextLabel: '工作上下文',
                surfaces: {switcher: '切换器', workbench: '工作台', studio: '片段实验室'},
                hints: {switcher: '查找、预览和打开内容', workbench: '编排信息组件和工作现场', studio: '安全编辑、预览和管理代码片段'},
            };
            window.__sidebarNavigation = '';
            window.__plugin.mountPlatformChrome(host, {
                surface: 'switcher', labels, status: {label: '已连接'},
                onNavigate: (surface) => { window.__sidebarNavigation = surface; },
                onSettings: () => {}, onClose: () => {}, settingsLabel: '打开设置', closeLabel: '关闭平台',
            });
            return true;
        })()`);
        assert.equal(sidebarSetup, true, "R5 sidebar: production chrome mounts in a native-width host");
        const sidebarGeometry = JSON.parse(await evalJs(`(() => {
            const host = document.querySelector('.sw--sidebar');
            const chrome = host.querySelector(':scope > .sw-platform-chrome');
            const header = chrome.querySelector('.sw-platform-header');
            const rect = (selector) => {
                const el = chrome.querySelector(selector);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height};
            };
            const nav = chrome.querySelector('.sw-platform-surface-nav');
            const navRect = nav.getBoundingClientRect();
            const actions = chrome.querySelector('.sw-platform-header__actions').getBoundingClientRect();
            return JSON.stringify({
                width: host.getBoundingClientRect().width,
                header: rect('.sw-platform-header'), actions: rect('.sw-platform-header__actions'),
                nav: {left: navRect.left, right: navRect.right, top: navRect.top, bottom: navRect.bottom,
                    width: navRect.width, height: navRect.height, clientWidth: nav.clientWidth, scrollWidth: nav.scrollWidth},
                settings: rect('.sw-platform-header__settings'), close: rect('.sw-platform-header__close'),
                closeGroup: rect('.sw-platform-header__close-group'),
                items: [...header.querySelectorAll('.sw-platform-surface-nav__item')].map((el) => {
                    const r = el.getBoundingClientRect();
                    const label = el.querySelector('.sw-platform-surface-nav__label');
                    return {surface: el.dataset.surface, tag: el.tagName, width: r.width, height: r.height,
                        text: label.textContent, labelWidth: label.clientWidth, labelScrollWidth: label.scrollWidth,
                        current: el.getAttribute('aria-current')};
                }),
            });
        })()`));
        assert.equal(sidebarGeometry.width, 245, `R5 sidebar: fixture must use the actual 245px host width (${JSON.stringify(sidebarGeometry)})`);
        assert.ok(sidebarGeometry.nav.top >= sidebarGeometry.actions.bottom,
            `R5 sidebar: navigation occupies a dedicated row below actions (${JSON.stringify(sidebarGeometry)})`);
        assert.ok(sidebarGeometry.nav.scrollWidth <= sidebarGeometry.nav.clientWidth + 1,
            `R5 sidebar: navigation does not horizontally overflow (${JSON.stringify(sidebarGeometry.nav)})`);
        assert.ok(sidebarGeometry.items.every((item) => item.height >= 44 && item.labelScrollWidth <= item.labelWidth + 1),
            `R5 sidebar: all labels fit inside accessible hit targets (${JSON.stringify(sidebarGeometry.items)})`);
        assert.equal(sidebarGeometry.items.find((item) => item.surface === 'switcher').current, 'page',
            "R5 sidebar: current surface has a current-page state");
        assert.ok(sidebarGeometry.close.right <= sidebarGeometry.header.right - 8,
            `R5 sidebar: close button stays anchored to the right (${JSON.stringify(sidebarGeometry)})`);
        assert.ok(sidebarGeometry.settings.right < sidebarGeometry.closeGroup.left,
            `R5 sidebar: settings and close groups do not overlap (${JSON.stringify(sidebarGeometry)})`);
        const sidebarClick = {
            x: sidebarGeometry.items.find((item) => item.surface === 'workbench').width,
            y: sidebarGeometry.items.find((item) => item.surface === 'workbench').height,
        };
        const sidebarPoint = await evalJs(`(() => { const b = document.querySelector('.sw--sidebar [data-surface="workbench"]'); const r = b.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
        await send("Input.dispatchMouseEvent", {type: "mouseMoved", x: sidebarPoint.x, y: sidebarPoint.y});
        await send("Input.dispatchMouseEvent", {type: "mousePressed", x: sidebarPoint.x, y: sidebarPoint.y, button: "left", clickCount: 1});
        await send("Input.dispatchMouseEvent", {type: "mouseReleased", x: sidebarPoint.x, y: sidebarPoint.y, button: "left", clickCount: 1});
        assert.equal(await evalJs("window.__sidebarNavigation"), "workbench",
            `R5 sidebar: coordinate click reaches the intended surface (${JSON.stringify(sidebarClick)})`);
        console.log("surface-switch smoke: all cases green");
    } finally {
        socket?.close();
        child.kill();
    }
}
main().catch((e) => { console.error("HARNESS FAILED:", e.message); process.exit(1); });
