import {expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

test("组件商店桌面全屏并在目录选择后直接显示实时预览", async ({page}) => {
    await openApp(page);
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        plugin.openPlatformSurface("workbench");
    });
    await page.locator(".sw-home").waitFor({state: "visible"});
    await page.locator(".sw-home__add").click();

    const store = page.locator(".sw-home-store");
    await expect(store).toBeVisible();
    const dialog = page.locator(".sw-home-store-dialog");
    await expect(dialog).toBeVisible();
    const viewport = await page.evaluate(() => ({width: window.innerWidth, height: window.innerHeight}));
    await expect.poll(() => dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {width: Math.round(rect.width), height: Math.round(rect.height)};
    })).toEqual(viewport);

    const preview = store.locator(".sw-home-store__live-preview");
    await expect(preview).toHaveCount(1);
    await expect(preview.locator(".sw-store-preview")).toHaveAttribute("aria-busy", "false", {timeout: 10000});

    const sizeButtons = store.locator(".sw-home-store__detail .sw-home-store__size[data-size]");
    if (await sizeButtons.count() > 1) {
        const nextSize = sizeButtons.nth(1);
        const sizeValue = await nextSize.getAttribute("data-size");
        await nextSize.click();
        await expect(preview.locator(".sw-store-preview")).toHaveAttribute("data-size", sizeValue || "");
    }

    const cards = store.locator(".sw-home-store__catalog .sw-home-store__card[data-module-id]");
    if (await cards.count() > 1) {
        const secondModule = await cards.nth(1).getAttribute("data-module-id");
        await cards.nth(1).evaluate((element) => (element instanceof HTMLElement ? element.click() : undefined));
        await expect(store).toHaveAttribute("data-selected-module", secondModule || "");
        await expect(store.locator(".sw-home-store__live-preview")).toHaveCount(1);
        await expect(store.locator(".sw-home-store__live-preview .sw-store-preview")).toHaveAttribute("aria-busy", "false", {timeout: 10000});
    }
});
