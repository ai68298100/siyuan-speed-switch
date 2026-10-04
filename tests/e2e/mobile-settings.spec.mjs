import {devices, expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

test("mobile settings expose the thumbnail range control and legacy FAB guidance", async ({browser}) => {
    const context = await browser.newContext({...devices["iPhone 13"]});
    const page = await context.newPage();
    try {
        await openApp(page, {bundle: "mobile"});
        await page.locator("#swMobileTopBarBtn").click();
        await expect(page.locator(".sw__settings-btn")).toBeVisible();
        await page.locator(".sw__settings-btn").click();

        const settings = page.locator(".sw-settings");
        await expect(settings).toBeVisible();
        await settings.locator('.sw-settings__tab[data-panel="mobile"]').click();
        const panel = settings.locator('.sw-settings__panel[data-panel="mobile"]');
        const range = panel.locator('.sw-settings__range-number input[type="range"]');
        const numeric = panel.locator('.sw-settings__range-number input[type="number"]');
        await expect(range).toHaveAttribute("min", "48");
        await expect(range).toHaveAttribute("max", "200");
        await expect(numeric).toHaveAttribute("min", "48");
        await expect(numeric).toHaveAttribute("max", "200");
        await expect(panel.locator(".sw-settings__group-reset")).toHaveCount(1);
        await expect(panel.locator(".sw-settings__mobile-fab-migration")).toBeVisible();

        await range.fill("160");
        await expect(numeric).toHaveValue("160");
        await numeric.fill("144");
        await numeric.press("Tab");
        await expect(panel.locator('.sw-settings__range-number input[type="number"]')).toHaveValue("144");

        const bounds = await range.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth};
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
    } finally {
        await context.close();
    }
});
