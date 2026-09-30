// calendar#17 第三方组件全链路 e2e（外发前实证，T-7069~T-7072）。
// 真实 src/index.ts bundle（siyuan 高保真桩）+ 无头 Chromium + CDP 真实点击，
// 按用户可感知路径逐步走通：注册 → 商店可见 → 选尺寸 → 预览尺寸生效 →
// 添加 → 反复归一化不丢 → 面板渲染内容 → 禁用（unregister）布局保留 +
// 面板诚实占位 → 商店不可用卡片清理 → 装机前曝光。
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawn} = require("node:child_process");
const {createRequire} = require("node:module");
const assert = require("node:assert/strict");
const esbuild = createRequire(require.resolve("esbuild-loader"))("esbuild");

const repo = process.cwd();
const artifactDir = path.join(repo, ".tmp", "third-party-lifecycle");
fs.mkdirSync(artifactDir, {recursive: true});
const profile = fs.mkdtempSync(path.join(artifactDir, "profile-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bundle = esbuild.buildSync({
    stdin: {contents: [
        'import * as mod from "./index.ts";',
        'import {openHomeWidgetStore} from "./home-store-ui";',
        'globalThis.__SpeedSwitch = mod.default ?? mod;',
        'globalThis.__OpenStore = openHomeWidgetStore;',
    ].join("\n"), resolveDir: path.join(repo, "src"), loader: "ts"},
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
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {width: 1366, height: 768, deviceScaleFactor: 1, mobile: false});
        await send("Page.navigate", {url: "file:///" + path.join(artifactDir, "page.html").replace(/\\/g, "/")});
        for (let i = 0; i < 40; i += 1) {
            await delay(150);
            const state = await evalJs("window.__bootState || 'loading'");
            if (state !== "loading") { console.log("boot:", state); break; }
        }
        assert.equal(await evalJs("window.__bootState"), "booted", "插件必须启动成功");
        const click = (sel) => evalJs(`(() => { const el = ${sel}; if (!el) return false; el.click(); return true; })()`);

        // —— 第 1 步：模拟 Calendar 真实适配（逐字段照抄 LvSpeed 分支形态）——
        const registered = await evalJs(`(() => {
            const readCounts = {small: 2, wide: 4};
            window.__calendarReads = [];
            window.__calendarUnregister = window.__plugin.registerHomeModule({
                moduleId: "calendar-recent-periodic",
                title: "Calendar · 近期周期笔记",
                description: "显示周期笔记",
                icon: "iconCalendar",
                category: "plugin",
                availability: "ready",
                supportedDevices: ["desktop", "sidebar", "mobile"],
                sizes: ["small", "medium", "wide", "large", "full"],
                protocolVersion: 2,
                source: {pluginId: "siyuan-plugin-calendar", name: "Calendar", version: "0.5.1", homepage: "https://github.com/gradypark86/siyuan-plugin-calendar"},
                readOnly: true,
                open: () => { window.__calendarOpened = (window.__calendarOpened || 0) + 1; },
                read: async (config, device, context) => {
                    window.__calendarReads.push(context && context.size);
                    const all = ["周记 · 第 40 周", "月记 · 2026-09", "年记 · 2026", "周记 · 第 39 周", "月记 · 2026-08", "年记 · 2025"];
                    const limit = context && readCounts[context.size] ? readCounts[context.size] : 6;
                    return {title: "近期周期笔记", items: all.slice(0, limit).map((label) => ({label, value: "20260930120000"}))};
                },
            });
            return window.__plugin.getHomeModules("desktop").some((m) => m.moduleId === "calendar-recent-periodic");
        })()`);
        assert.equal(registered, true, "case 1: 模拟 Calendar 注册必须成功（getHomeModules 可见）");
        console.log("case 1 (register, real host API): OK");

        // —— 第 2 步：打开商店，卡片可见（未添加）——
        await evalJs(`__OpenStore.call(window.__plugin, "desktop", () => {})`);
        await delay(700);
        const cardInfo = await evalJs(`(() => {
            const card = document.querySelector('.sw-home-store__card[data-module-id="calendar-recent-periodic"]');
            if (!card) return null;
            return {added: card.dataset.added, tiles: !!card.querySelector('.sw-home-store__size[data-size="wide"]')};
        })()`);
        assert.deepEqual(cardInfo, {added: "false", tiles: true}, "case 2: 商店必须展示 Calendar 卡片（未添加 + 五档尺寸瓦片）");
        console.log("case 2 (store card visible, not added): OK");

        // —— 第 3 步：选 wide 档 → 预览（T-7069：预览必须跟随所选尺寸而非恒 medium）——
        assert.equal(await click(`document.querySelector('.sw-home-store__card[data-module-id="calendar-recent-periodic"] .sw-home-store__size[data-size="wide"]')`), true, "wide 尺寸瓦片必须存在");
        await delay(150);
        assert.equal(await click(`document.querySelector('.sw-home-store__card[data-module-id="calendar-recent-periodic"] .sw-home-store__preview-btn')`), true, "预览按钮必须存在");
        await delay(700);
        const preview = await evalJs(`(() => {
            const el = document.querySelector(".sw-store-preview");
            if (!el) return null;
            return {size: el.dataset.size, items: el.querySelectorAll(".sw-store-preview__body li, .sw-store-preview__body .sw-home-cell-item, .sw-store-preview__body *").length};
        })()`);
        assert.ok(preview, "预览对话框必须打开");
        assert.equal(preview.size, "wide", "case 3: 预览必须使用所选 wide 档（修复前恒 medium）");
        console.log("case 3 (preview honors selected size): OK ->", JSON.stringify(preview));
        // 关闭预览对话框（保留商店）
        await evalJs(`document.querySelectorAll(".b3-dialog").forEach((d) => { if (!d.querySelector(".sw-home-store") && d.isConnected) d.remove(); })`);
        await delay(150);

        // —— 第 4 步：添加 → 状态持久化 → 反复归一化不丢（calendar#17 核心 repro）——
        assert.equal(await click(`document.querySelector('.sw-home-store__card[data-module-id="calendar-recent-periodic"] .sw-home-store__add')`), true, "添加按钮必须存在");
        await delay(500);
        const afterAdd = await evalJs(`(() => {
            const state = window.__plugin.getHomeState();
            const card = document.querySelector('.sw-home-store__card[data-module-id="calendar-recent-periodic"]');
            return {
                instance: state.instances.some((i) => i.moduleId === "calendar-recent-periodic"),
                layout: (state.layouts.desktop || []).some((l) => l.instanceId === "calendar-recent-periodic"),
                added: card ? card.dataset.added : null,
            };
        })()`);
        assert.deepEqual(afterAdd, {instance: true, layout: true, added: "true"}, "case 4: 添加后实例与布局必须落盘");
        for (let i = 0; i < 5; i += 1) {
            const survived = await evalJs(`window.__plugin.getHomeState().instances.some((i) => i.moduleId === "calendar-recent-periodic")`);
            assert.equal(survived, true, `case 4: 归一化第 ${i + 1} 次后组件必须保留（calendar#17 复现路径）`);
        }
        console.log("case 4 (add survives repeated normalization): OK");

        // —— 第 5 步：工作台面板真实渲染第三方组件内容 ——
        await evalJs(`document.querySelectorAll(".b3-dialog").forEach((d) => { if (d.querySelector(".sw-home-store") && d.isConnected) d.remove(); })`);
        await evalJs(`window.__plugin.openPlatformSurface("workbench")`);
        await delay(900);
        const cell = await evalJs(`(() => {
            const el = document.querySelector('.sw-home__cell[data-module-id="calendar-recent-periodic"]');
            if (!el) return null;
            return {text: el.textContent.slice(0, 120), unavailable: el.classList.contains("sw-home__cell--unavailable")};
        })()`);
        assert.ok(cell, "case 5: 工作台必须渲染 Calendar 单元格");
        assert.equal(cell.unavailable, false, "可用提供方不得渲染为不可用占位");
        assert.ok(cell.text.includes("周记") || cell.text.includes("月记") || cell.text.includes("年记"), "单元格必须渲染 read 返回的真实条目");
        console.log("case 5 (workbench cell renders read items): OK");

        // —— 第 6 步：unregister（模拟禁用）→ 布局保留 + 面板诚实占位（ADR 0103 + T-7031）——
        await evalJs(`window.__calendarUnregister()`);
        await delay(300);
        const keptAfterUnregister = await evalJs(`window.__plugin.getHomeState().instances.some((i) => i.moduleId === "calendar-recent-periodic")`);
        assert.equal(keptAfterUnregister, true, "case 6: 禁用（unregister）后实例必须保留（ADR 0103）");
        await evalJs(`document.querySelectorAll(".b3-dialog").forEach((d) => { if (d.isConnected) d.remove(); })`);
        await evalJs(`window.__plugin.openPlatformSurface("workbench")`);
        await delay(700);
        const ghost = await evalJs(`(() => {
            const el = document.querySelector('.sw-home__cell--unavailable[data-instance-id]');
            if (!el) return null;
            return {exists: true, text: el.textContent.slice(0, 80)};
        })()`);
        assert.ok(ghost, "case 6: 禁用后面板必须渲染诚实占位（T-7031）");
        // 编辑态附移除出口（T-7031 设计：占位移除按钮在编辑模式渲染）
        assert.equal(await click(`[...document.querySelectorAll('[data-home-action="edit"]')].find((b) => b.isConnected)`), true, "工作台必须提供编辑开关");
        await delay(400);
        const ghostRemove = await evalJs(`(() => {
            const el = document.querySelector('.sw-home__cell--unavailable[data-instance-id]');
            return el ? !!el.querySelector("button") : null;
        })()`);
        assert.equal(ghostRemove, true, "case 6: 编辑态占位必须提供移除出口");
        // 退出编辑态，避免影响后续商店用例
        await click(`[...document.querySelectorAll('[data-home-action="edit"]')].find((b) => b.isConnected && b.getAttribute("aria-pressed") === "true")`);
        await delay(300);
        console.log("case 6 (disable keeps layout + honest panel placeholder with edit-mode removal): OK");

        // —— 第 7 步：商店不可用卡片 → 一键清理（T-7071）——
        await evalJs(`document.querySelectorAll(".b3-dialog").forEach((d) => { if (d.isConnected) d.remove(); })`);
        await evalJs(`__OpenStore.call(window.__plugin, "desktop", () => {})`);
        await delay(700);
        const unavailableCard = await evalJs(`(() => {
            const card = document.querySelector('.sw-home-store__card--unavailable[data-module-id="calendar-recent-periodic"]');
            if (!card) return null;
            return {removeBtn: !!card.querySelector(".sw-home-store__remove-unavailable")};
        })()`);
        assert.ok(unavailableCard, "case 7: 禁用后商店必须展示不可用卡片");
        assert.equal(unavailableCard.removeBtn, true, "不可用卡片必须带清理按钮");
        assert.equal(await click(`document.querySelector('.sw-home-store__card--unavailable[data-module-id="calendar-recent-periodic"] .sw-home-store__remove-unavailable')`), true, "清理按钮必须可点");
        await delay(400);
        const afterCleanup = await evalJs(`window.__plugin.getHomeState().instances.some((i) => i.moduleId === "calendar-recent-periodic")`);
        assert.equal(afterCleanup, false, "case 7: 清理后实例必须真正移除");
        console.log("case 7 (unavailable card + explicit cleanup): OK");

        // —— 第 8 步：装机前曝光（T-7072）——提供方未注册、实例已清 → missing 分区仍可见 ——
        const preinstall = await evalJs(`(() => {
            const card = document.querySelector('.sw-home-store__card[data-module-id="calendar-recent-periodic"]');
            if (!card) return null;
            return {status: card.dataset.status, availability: card.dataset.availability};
        })()`);
        assert.ok(preinstall, "case 8: 未安装提供方时目录仍必须展示 Calendar 组件（装机前曝光）");
        console.log("case 8 (pre-install catalog exposure): OK ->", JSON.stringify(preinstall));

        console.log("third-party lifecycle e2e: all cases green");
    } finally {
        socket?.close();
        child.kill();
    }
}
main().catch((e) => { console.error("HARNESS FAILED:", e.message); process.exit(1); });
