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
    const target = targets.find((item) => item.type === "page" && item.url.includes("/stage/build/mobile/"));
    if (!target?.webSocketDebuggerUrl) throw new Error("SiYuan mobile browser target not found");

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
        const handler = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) handler.reject(new Error(message.error.message));
        else handler.resolve(message.result);
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
    await command("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 2.75, mobile: true});
    await evaluate(`(async () => {
        const deadline = Date.now() + 30000;
        while ((!document.querySelector("#swMobileTopBarBtn")
            || document.readyState !== "complete"
            || typeof window.siyuan?.mobile?.tabs !== "object") && Date.now() < deadline) {
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
            document.querySelector("#sw-live-mobile-smoke-css")?.remove();
            const style = document.createElement("style");
            style.id = "sw-live-mobile-smoke-css";
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
        })()`);
    }

    const inventory = await evaluate(`(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find?.(item => item.name === "siyuan-speed-switch");
        return {
            title: document.title,
            url: location.href,
            viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
            bodyClass: document.body.className,
            container: window.siyuan?.config?.system?.container,
            workspaceDir: window.siyuan?.config?.system?.workspaceDir,
            pluginLoaded: Boolean(plugin),
            pluginVersion: plugin?.version,
            pluginMobileBranch: plugin?.isMobile,
            hasMobileTabsApi: typeof window.siyuan?.mobile?.tabs?.open === "function" || typeof window.siyuan?.mobile?.tabs === "object",
            mobileButton: Boolean(document.querySelector("#swMobileTopBarBtn")),
        };
    })()`);
    console.log(`INVENTORY=${JSON.stringify(inventory)}`);
    if (!inventory.pluginLoaded || inventory.pluginMobileBranch !== true || !inventory.mobileButton || !inventory.url.includes("/mobile/")) {
        throw new Error("Target did not load the plugin's real mobile branch");
    }

    const switcher = await evaluate(`(async () => {
        if (!document.querySelector(".speed-switch.sw__mobile")) document.querySelector("#swMobileTopBarBtn")?.click();
        const deadline = Date.now() + 5000;
        while (!document.querySelector(".speed-switch.sw__mobile") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const root = document.querySelector(".speed-switch.sw__mobile");
        const toolbar = root?.querySelector(".sw__mobile-toolbar");
        const sort = root?.querySelector(".sw__sort-btn");
        const visibleChildren = [...(toolbar?.children || [])].filter(node => getComputedStyle(node).display !== "none");
        const tops = visibleChildren.map(node => Math.round(node.getBoundingClientRect().top));
        const rect = root?.getBoundingClientRect();
        return {
            present: Boolean(root),
            rect: rect && {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height},
            overflow: root && {clientWidth: root.clientWidth, scrollWidth: root.scrollWidth},
            toolbar: toolbar && {height: toolbar.getBoundingClientRect().height, wrap: getComputedStyle(toolbar).flexWrap, spread: tops.length ? Math.max(...tops) - Math.min(...tops) : 0},
            sort: sort && {hasIcon: Boolean(sort.querySelector("svg use")), text: sort.textContent.trim(), width: sort.getBoundingClientRect().width},
            quick: (() => {
                const host = root?.querySelector(".sw__quick-actions");
                if (!host) return null;
                const label = host.querySelector(".sw__quick-action-label");
                const initialClass = host.className;
                host.classList.add("sw__quick-actions--icons");
                const iconLabelDisplay = label && getComputedStyle(label).display;
                host.classList.add("sw__quick-actions--hidden");
                const hiddenDisplay = getComputedStyle(host).display;
                host.className = initialClass;
                return {className: initialClass, iconLabelDisplay, hiddenDisplay};
            })(),
        };
    })()`);
    console.log(`SWITCHER=${JSON.stringify(switcher)}`);
    const switcherFits = switcher.present && switcher.rect.left >= -1 && switcher.rect.right <= inventory.viewport.width + 1
        && switcher.overflow.scrollWidth <= switcher.overflow.clientWidth + 1
        && switcher.toolbar.wrap === "nowrap" && switcher.toolbar.spread <= 4
        && switcher.sort.hasIcon && switcher.sort.text === "" && switcher.sort.width <= 36
        && switcher.quick.iconLabelDisplay === "none" && switcher.quick.hiddenDisplay === "none";
    if (!switcherFits) throw new Error("Real mobile switcher failed layout checks");

    if (outputPath) {
        const screenshot = await command("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
        fs.writeFileSync(screenshotName(outputPath, "switcher"), Buffer.from(screenshot.data, "base64"));
    }

    const settings = await evaluate(`(async () => {
        document.querySelector(".speed-switch.sw__mobile .sw__settings-btn")?.click();
        const deadline = Date.now() + 5000;
        while (!document.querySelector(".sw-settings") && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        document.querySelector("#sw-settings-tab-quickActions")?.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const root = document.querySelector(".sw-settings");
        const container = root?.closest(".b3-dialog__container");
        const tabs = root?.querySelector(".sw-settings__tabs");
        const panel = root?.querySelector(".sw-settings__panels");
        const rows = [...(root?.querySelectorAll(".sw-setting__quick-action:not(.sw-setting__quick-action--add)") || [])];
        const rect = container?.getBoundingClientRect();
        return {
            present: Boolean(root),
            rect: rect && {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height},
            root: root && {clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, direction: getComputedStyle(root).flexDirection},
            tabs: tabs && {clientWidth: tabs.clientWidth, scrollWidth: tabs.scrollWidth, overflowX: getComputedStyle(tabs).overflowX},
            panel: panel && {clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth, overflowY: getComputedStyle(panel).overflowY},
            rows: rows.map(row => ({clientWidth: row.clientWidth, scrollWidth: row.scrollWidth, left: row.getBoundingClientRect().left, right: row.getBoundingClientRect().right})),
            addButton: Boolean(root?.querySelector(".sw-setting__quick-action--add button")),
            displaySelects: root?.querySelectorAll(".sw-settings__item .b3-select").length,
            fabHidden: (() => {
                const fab = document.querySelector(".sw__fab");
                return !fab || fab.classList.contains("sw__fab--hidden") || getComputedStyle(fab).display === "none";
            })(),
        };
    })()`);
    console.log(`SETTINGS=${JSON.stringify(settings)}`);
    const settingsFit = settings.present && settings.rect.left >= -1 && settings.rect.right <= inventory.viewport.width + 1
        && settings.rect.top >= -1 && settings.rect.bottom <= inventory.viewport.height + 1
        && settings.root.scrollWidth <= settings.root.clientWidth + 1 && settings.root.direction === "column"
        && settings.panel.scrollWidth <= settings.panel.clientWidth + 1 && settings.panel.overflowY === "auto"
        && settings.rows.every(item => item.scrollWidth <= item.clientWidth + 1 && item.left >= -1 && item.right <= inventory.viewport.width + 1)
        && settings.addButton && settings.displaySelects >= 4 && settings.fabHidden;
    if (!settingsFit) throw new Error("Real mobile settings failed layout checks");
    if (outputPath) {
        const screenshot = await command("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
        const settingsPath = screenshotName(outputPath, "settings");
        fs.writeFileSync(settingsPath, Buffer.from(screenshot.data, "base64"));
        console.log(`screenshots=${screenshotName(outputPath, "switcher")},${settingsPath}`);
    }
    socket.close();
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
