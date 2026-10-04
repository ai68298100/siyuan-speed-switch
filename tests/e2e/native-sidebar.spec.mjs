import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {artifactPath, appURL, openApp, target} from "./helpers/app.mjs";

const enabled = process.env.SWSS_E2E_NATIVE_SIDEBAR === "1";
const SIDEBAR_SELECTOR = ".sw--sidebar";

function hostSnapshot(page) {
    return page.evaluate(() => {
        const root = document.querySelector(".sw--sidebar");
        const dock = root?.closest(".layout__dockr");
        const rootRect = root?.getBoundingClientRect();
        const dockRect = dock?.getBoundingClientRect();
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
        const dockType = plugin ? `${plugin.name}sidebar` : "";
        const dockItem = dockType
            ? document.querySelector(`.dock__item[data-type="${dockType}"]`)
            : null;
        const divider = Array.from(document.querySelectorAll(".layout__resize.layout__resize--lr"))
            .map((element, index) => ({element, index, rect: element.getBoundingClientRect()}))
            .filter(({rect}) => rect.width >= 2 && rect.height > 500 && rect.x > 500)
            .sort((left, right) => right.rect.x - left.rect.x)[0];
        return {
            root: rootRect ? {x: rootRect.x, y: rootRect.y, width: rootRect.width, height: rootRect.height} : null,
            dock: dockRect ? {x: dockRect.x, y: dockRect.y, width: dockRect.width, height: dockRect.height} : null,
            hostDock: Boolean(dock && dock.classList.contains("layout__dockr")),
            dockType,
            dockItem: Boolean(dockItem),
            divider: divider ? {index: divider.index, x: divider.rect.x, y: divider.rect.y, width: divider.rect.width, height: divider.rect.height} : null,
        };
    });
}

async function waitForNativeSidebar(page) {
    await page.waitForFunction(() => {
        const root = document.querySelector(".sw--sidebar");
        const dock = root?.closest(".layout__dockr");
        const rootRect = root?.getBoundingClientRect();
        const dockRect = dock?.getBoundingClientRect();
        const divider = Array.from(document.querySelectorAll(".layout__resize.layout__resize--lr"))
            .some((element) => {
                const rect = element.getBoundingClientRect();
                return rect.width >= 2 && rect.height > 500 && rect.x > 500;
            });
        return Boolean(root?.isConnected && dock?.isConnected && rootRect?.width > 0 && dockRect?.width > 0 && divider);
    }, undefined, {timeout: 20000});
}

async function toggleNativeSidebar(page) {
    await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
        if (!plugin || typeof plugin.toggleSidebar !== "function") throw new Error("real plugin dock toggle is unavailable");
        plugin.toggleSidebar();
    });
    await waitForNativeSidebar(page);
}

async function dragDivider(page, delta) {
    const snapshot = await hostSnapshot(page);
    if (!snapshot.divider) throw new Error("real host right dock divider is unavailable");
    const divider = page.locator(".layout__resize.layout__resize--lr").nth(snapshot.divider.index);
    const box = await divider.boundingBox();
    if (!box) throw new Error("real host right dock divider has no hit box");
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(200, box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta, box.y + Math.min(200, box.height / 2), {steps: 10});
    await page.mouse.up();
    await page.waitForTimeout(500);
}

async function measureControls(page) {
    return page.evaluate(() => {
        const root = document.querySelector(".sw--sidebar");
        const toolbar = root?.querySelector(".sw__toolbar");
        const selectors = [
            ".sw__search",
            ".sw__search-filter-btn",
            ".sw__sort-trigger",
            ".sw__journal-btn",
            ".sw__settings-btn",
        ];
        const controls = selectors.map((selector) => {
            const element = root?.querySelector(selector);
            const rect = element?.getBoundingClientRect();
            return {
                selector,
                present: Boolean(element),
                width: rect?.width || 0,
                height: rect?.height || 0,
                tabIndex: element instanceof HTMLElement ? element.tabIndex : -1,
                label: element?.getAttribute("aria-label") || "",
            };
        });
        const rootRect = root?.getBoundingClientRect();
        const toolbarRect = toolbar?.getBoundingClientRect();
        const sortLabel = root?.querySelector(".sw__sort-trigger-label");
        return {
            root: rootRect ? {width: rootRect.width, height: rootRect.height, clientWidth: root?.clientWidth || 0, scrollWidth: root?.scrollWidth || 0} : null,
            toolbar: toolbarRect ? {width: toolbarRect.width, height: toolbarRect.height, clientWidth: toolbar?.clientWidth || 0, scrollWidth: toolbar?.scrollWidth || 0} : null,
            controls,
            sortLabel: sortLabel ? {
                clientWidth: sortLabel.clientWidth,
                scrollWidth: sortLabel.scrollWidth,
                overflow: getComputedStyle(sortLabel).overflow,
                whiteSpace: getComputedStyle(sortLabel).whiteSpace,
            } : null,
        };
    });
}

test("T-7115 opt-in real host dock: narrow layout keeps filters, focus and controls reachable", async ({page}) => {
    test.skip(!enabled, "真实原生 dock 证据需要 SWSS_E2E_NATIVE_SIDEBAR=1");
    test.slow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

    await openApp(page);
    await page.waitForTimeout(1000);
    await toggleNativeSidebar(page);
    const host = await hostSnapshot(page);
    expect(host.hostDock, "侧栏必须挂在真实思源 layout__dockr 内").toBe(true);
    expect(host.dockItem, "必须存在真实思源 dock item").toBe(true);
    expect(host.dockType).toBe("siyuan-speed-switchsidebar");

    const wide = host.root?.width || 0;
    if (wide < 280) await dragDivider(page, -220);
    const widened = await hostSnapshot(page);
    expect(widened.divider, "真实宿主右侧分隔条必须可定位").not.toBeNull();
    const wideAfterSetup = widened.root?.width || 0;
    await dragDivider(page, 190);
    const narrow = await hostSnapshot(page);
    const narrowWidth = narrow.root?.width || 0;
    expect(narrowWidth, "拖动真实宿主分隔条后侧栏必须变窄").toBeLessThan(wideAfterSetup);
    expect(narrowWidth).toBeGreaterThanOrEqual(100);

    const controls = await measureControls(page);
    expect(controls.root).not.toBeNull();
    expect(controls.toolbar).not.toBeNull();
    expect(controls.root.scrollWidth).toBeLessThanOrEqual(controls.root.clientWidth + 1);
    expect(controls.toolbar.scrollWidth).toBeLessThanOrEqual(controls.toolbar.clientWidth + 1);
    for (const control of controls.controls) {
        expect(control.present, `${control.selector} must remain in the real dock`).toBe(true);
        expect(control.width, `${control.selector} must retain a hit box`).toBeGreaterThan(0);
        expect(control.height, `${control.selector} must retain a hit box`).toBeGreaterThan(0);
        expect(control.tabIndex, `${control.selector} must remain keyboard reachable`).toBeGreaterThanOrEqual(0);
    }
    expect(controls.sortLabel?.overflow).toBe("hidden");
    expect(controls.sortLabel?.whiteSpace).toBe("nowrap");

    const filterButton = page.locator(`${SIDEBAR_SELECTOR} .sw__search-filter-btn`);
    await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
        const scroll = document.querySelector(".sw--sidebar .sw__scroll");
        if (!plugin || !scroll) throw new Error("sidebar search session is unavailable");
        plugin.docSearchState.notebookNames.set(scroll, new Map([["probe-notebook", "Redacted notebook"]]));
        plugin.docSearchState.filters.set(scroll, Object.freeze({notebook: "probe-notebook", paths: ["/"]}));
        plugin.refreshSidebar();
    });
    await expect(filterButton).toHaveAttribute("data-filter-count", "2");
    await expect(filterButton).toHaveAttribute("aria-pressed", "true");
    await expect(filterButton).toHaveAttribute("aria-label", /2/);
    await filterButton.click();
    const reset = page.locator(".b3-menu__item", {hasText: /Reset all filters|重置全部筛选/}).last();
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(filterButton).toHaveAttribute("data-filter-count", "");
    await expect(filterButton).toHaveAttribute("aria-pressed", "false");

    for (const selector of [".sw__search", ".sw__search-filter-btn", ".sw__sort-trigger", ".sw__journal-btn", ".sw__settings-btn"]) {
        const control = page.locator(`${SIDEBAR_SELECTOR} ${selector}`);
        await control.focus();
        await expect(control).toBeFocused();
    }

    const report = {
        task: "T-7115",
        kind: "real-host-e2e",
        kernelVersion: target().kernelVersion,
        host: {
            dockClass: "layout__dockr",
            dockItem: host.dockType,
            wideWidth: wideAfterSetup,
            narrowWidth,
            controls: controls.controls.map(({selector, width, height, tabIndex}) => ({selector, width, height, tabIndex})),
            noHorizontalOverflow: controls.root.scrollWidth <= controls.root.clientWidth + 1 && controls.toolbar.scrollWidth <= controls.toolbar.clientWidth + 1,
        },
    };
    fs.mkdirSync(artifactPath(), {recursive: true});
    fs.writeFileSync(artifactPath("native-sidebar.json"), `${JSON.stringify(report, null, 2)}\n`);
    expect(pageErrors, `真实侧栏出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
});
