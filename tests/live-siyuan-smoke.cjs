const fs = require("node:fs");

const cdpPort = Number(process.env.SIYUAN_CDP_PORT || 9223);
const outputPath = process.env.SIYUAN_SMOKE_SCREENSHOT || "";
const cssPath = process.env.SIYUAN_SMOKE_CSS || "";
const reloadTarget = process.env.SIYUAN_SMOKE_RELOAD === "1";

function screenshotName(base, suffix) {
    if (!base) return "";
    const dot = base.lastIndexOf(".");
    return dot > 0 ? `${base.slice(0, dot)}-${suffix}${base.slice(dot)}` : `${base}-${suffix}.png`;
}

async function main() {
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
    const target = targets.find((item) => item.type === "page" && item.url.includes("/stage/build/desktop/"));
    if (!target?.webSocketDebuggerUrl) throw new Error("SiYuan browser target not found");

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let commandId = 0;
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, {once: true});
        socket.addEventListener("error", reject, {once: true});
    });
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (!message.id || !pending.has(message.id)) return;
        const {resolve, reject} = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++commandId;
        pending.set(id, {resolve, reject});
        socket.send(JSON.stringify({id, method, params}));
    });
    const evaluate = async (expression) => {
        const result = await command("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
        return result.result.value;
    };

    await command("Runtime.enable");
    await command("Page.enable");
    if (reloadTarget) {
        await command("Page.reload", {ignoreCache: true});
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    await command("Emulation.setDeviceMetricsOverride", {width: 1200, height: 900, deviceScaleFactor: 1, mobile: false});
    await evaluate(`(async () => {
        const deadline = Date.now() + 30000;
        while ((!document.querySelector("#plugin_siyuan-speed-switch_0") || document.readyState !== "complete") && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        document.querySelectorAll(".b3-dialog__container").forEach(container => {
            if (!container.querySelector(".speed-switch, .sw-settings")) return;
            container.querySelector(".b3-dialog__close")?.dispatchEvent(new MouseEvent("click", {bubbles: true}));
        });
    })()`);
    if (cssPath) {
        const css = fs.readFileSync(cssPath, "utf8");
        await evaluate(`(() => {
            document.querySelector("#sw-live-smoke-css")?.remove();
            const style = document.createElement("style");
            style.id = "sw-live-smoke-css";
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
        })()`);
    }
    const inventory = await evaluate(`(() => ({
        title: document.title,
        readyState: document.readyState,
        pluginLoaded: Boolean(window.siyuan?.ws?.app?.plugins?.find?.(item => item.name === "siyuan-speed-switch")),
        speedSwitchNodes: [...document.querySelectorAll("[data-type*='speed-switch'], [data-id*='speed-switch'], [aria-label*='小驴'], [aria-label*='切换页签']")].map(node => ({tag: node.tagName, cls: node.className, title: node.title, aria: node.getAttribute("aria-label"), type: node.getAttribute("data-type"), id: node.id})),
        toolbarCandidates: [...document.querySelectorAll("#toolbar svg use")].map(use => ({href: use.getAttribute("href") || use.getAttribute("xlink:href"), parent: use.closest("button, span")?.outerHTML?.slice(0, 300)})).filter(item => /layout|switch/i.test(item.href || "")),
    }))()`);
    console.log(JSON.stringify(inventory, null, 2));

    if (!inventory.pluginLoaded) throw new Error("siyuan-speed-switch is not loaded");
    const desktop = await evaluate(`(async () => {
        document.querySelector("#plugin_siyuan-speed-switch_0")?.click();
        const deadline = Date.now() + 5000;
        while (!document.querySelector(".speed-switch:not(.sw__mobile)") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        const root = document.querySelector(".speed-switch:not(.sw__mobile)");
        const toolbar = root?.querySelector(".sw__toolbar");
        const visibleChildren = [...(toolbar?.children || [])].filter(node => getComputedStyle(node).display !== "none");
        const tops = visibleChildren.map(node => Math.round(node.getBoundingClientRect().top));
        const rect = root?.getBoundingClientRect();
        const quick = root?.querySelector(".sw__quick-actions:not(.fn__none), .sw__quick-rail:not(.fn__none)");
        return {
            present: Boolean(root),
            viewport: {width: innerWidth, height: innerHeight},
            rect: rect && {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height},
            toolbar: toolbar && {height: toolbar.getBoundingClientRect().height, flexWrap: getComputedStyle(toolbar).flexWrap, childTops: tops, verticalSpread: tops.length ? Math.max(...tops) - Math.min(...tops) : 0},
            quick: quick && {className: quick.className, width: quick.getBoundingClientRect().width, height: quick.getBoundingClientRect().height, buttons: quick.querySelectorAll(".sw__quick-action").length},
        };
    })()`);
    console.log(`DESKTOP=${JSON.stringify(desktop)}`);
    if (!desktop.present || desktop.toolbar.flexWrap !== "nowrap" || desktop.toolbar.verticalSpread > 4) {
        throw new Error("Desktop switcher toolbar is missing or wrapped");
    }

    if (outputPath) {
        const screenshot = await command("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
        fs.writeFileSync(screenshotName(outputPath, "desktop"), Buffer.from(screenshot.data, "base64"));
    }

    const settingsDesktop = await evaluate(`(async () => {
        document.querySelector(".speed-switch:not(.sw__mobile) .sw__settings-btn")?.click();
        const deadline = Date.now() + 5000;
        while (!document.querySelector(".sw-settings") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        document.querySelector("#sw-settings-tab-quickActions")?.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const root = document.querySelector(".sw-settings");
        const container = root?.closest(".b3-dialog__container");
        const header = root?.querySelector(".sw-setting__quick-header");
        const firstRow = root?.querySelector(".sw-setting__quick-action:not(.sw-setting__quick-action--add)");
        const headerCells = [...(header?.children || [])].map(node => node.getBoundingClientRect());
        const rowCells = [...(firstRow?.children || [])].map(node => node.getBoundingClientRect());
        const rect = container?.getBoundingClientRect();
        return {
            present: Boolean(root),
            rect: rect && {left: rect.left, right: rect.right, width: rect.width},
            overflow: root && {clientWidth: root.clientWidth, scrollWidth: root.scrollWidth},
            headerCenters: headerCells.map(item => Math.round(item.left + item.width / 2)),
            rowCenters: rowCells.map(item => Math.round(item.left + item.width / 2)),
            rows: root?.querySelectorAll(".sw-setting__quick-action:not(.sw-setting__quick-action--add)").length,
            hasAddButton: Boolean(root?.querySelector(".sw-setting__quick-action--add button")),
        };
    })()`);
    console.log(`SETTINGS_DESKTOP=${JSON.stringify(settingsDesktop)}`);
    if (!settingsDesktop.present || !settingsDesktop.hasAddButton || settingsDesktop.overflow.scrollWidth > settingsDesktop.overflow.clientWidth + 1) {
        throw new Error("Desktop quick-action settings are missing or overflowing");
    }
    const columnsAligned = settingsDesktop.headerCenters.length === settingsDesktop.rowCenters.length
        && settingsDesktop.headerCenters.every((center, index) => Math.abs(center - settingsDesktop.rowCenters[index]) <= 4);
    if (!columnsAligned) throw new Error("Desktop quick-action headers are not aligned with their columns");

    await command("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
    await new Promise((resolve) => setTimeout(resolve, 200));
    const settingsMobile = await evaluate(`(() => {
        const root = document.querySelector(".sw-settings");
        const container = root?.closest(".b3-dialog__container");
        const panel = root?.querySelector(".sw-settings__panels");
        const rows = [...(root?.querySelectorAll(".sw-setting__quick-action:not(.sw-setting__quick-action--add)") || [])];
        const rect = container?.getBoundingClientRect();
        return {
            viewport: {width: innerWidth, height: innerHeight},
            rect: rect && {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height},
            rootOverflow: root && {clientWidth: root.clientWidth, scrollWidth: root.scrollWidth},
            panelOverflow: panel && {clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth},
            rowOverflow: rows.map(row => ({clientWidth: row.clientWidth, scrollWidth: row.scrollWidth, left: row.getBoundingClientRect().left, right: row.getBoundingClientRect().right})),
            tabDirection: root && getComputedStyle(root).flexDirection,
        };
    })()`);
    console.log(`SETTINGS_MOBILE=${JSON.stringify(settingsMobile)}`);
    const mobileFits = settingsMobile.rect.left >= -1 && settingsMobile.rect.right <= settingsMobile.viewport.width + 1
        && settingsMobile.rootOverflow.scrollWidth <= settingsMobile.rootOverflow.clientWidth + 1
        && settingsMobile.panelOverflow.scrollWidth <= settingsMobile.panelOverflow.clientWidth + 1
        && settingsMobile.rowOverflow.every(item => item.scrollWidth <= item.clientWidth + 1 && item.left >= -1 && item.right <= settingsMobile.viewport.width + 1)
        && settingsMobile.tabDirection === "column";
    if (!mobileFits) throw new Error("Mobile settings overflow the viewport");

    if (outputPath) {
        const screenshot = await command("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
        const mobilePath = screenshotName(outputPath, "settings-mobile");
        fs.writeFileSync(mobilePath, Buffer.from(screenshot.data, "base64"));
        console.log(`screenshots=${screenshotName(outputPath, "desktop")},${mobilePath}`);
    }
    await command("Emulation.clearDeviceMetricsOverride");
    socket.close();
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
