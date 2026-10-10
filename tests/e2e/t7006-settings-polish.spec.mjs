import {expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

test("T-7006 settings rail and range controls stay usable at narrow width", async ({page}) => {
    await openApp(page);
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        if (!plugin) throw new Error("siyuan-speed-switch plugin instance is unavailable");
        plugin.openSetting("mobile");
    });

    const settings = page.locator(".sw-settings");
    await expect(settings).toBeVisible();
    const rail = settings.locator(".sw-settings__tabs");
    await expect.poll(() => rail.evaluate((element) => getComputedStyle(element.closest(".b3-dialog__container")).transform)).toBe("none");
    const railMetrics = await rail.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
            height: rect.height,
            overflowX: style.overflowX,
            touchAction: style.touchAction,
            scrollable: element.scrollWidth >= element.clientWidth,
        };
    });
    expect(railMetrics.height).toBeGreaterThanOrEqual(44);
    expect(railMetrics.overflowX).toBe("auto");
    expect(railMetrics.touchAction).toContain("pan-x");
    expect(railMetrics.scrollable).toBeTruthy();

    const tab = rail.locator('.sw-settings__tab[data-panel="mobile"]');
    expect(await tab.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await tab.focus();
    await expect(tab).toBeFocused();
    expect(await tab.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");

    const range = settings.locator('input[type="range"].sw-settings__range').first();
    await expect(range).toBeVisible();
    const rangeMetrics = await range.evaluate((element) => {
        const style = getComputedStyle(element);
        return {height: element.getBoundingClientRect().height, minHeight: style.minHeight, touchAction: style.touchAction};
    });
    expect(rangeMetrics.height).toBeGreaterThanOrEqual(40);
    expect(rangeMetrics.minHeight).toBe("44px");
    expect(rangeMetrics.touchAction).toBe("manipulation");

    const settingsBody = settings.locator('.sw-settings__panels');
    expect(await settingsBody.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
});
