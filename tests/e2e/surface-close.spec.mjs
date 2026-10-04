import {devices, expect, test} from "@playwright/test";
import {openApp, openSwitcher} from "./helpers/app.mjs";

test("desktop surfaces close through their own header and studio protects a dirty draft", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);

    const switcher = page.locator('.sw-platform-surface[data-sw-surface="switcher"]');
    await expect(switcher.locator(".sw-platform-header__close")).toBeVisible();
    await switcher.locator(".sw-platform-header__close").click();
    await expect(switcher).toHaveCount(0);

    await openSwitcher(page);
    await switcher.locator('.sw-platform-surface-nav__item[data-surface="workbench"]').click();
    const workbench = page.locator('.sw-platform-surface[data-sw-surface="workbench"]');
    await expect(workbench).toBeVisible();
    await workbench.locator(".sw-platform-header__close").click();
    await expect(workbench).toHaveCount(0);

    await openSwitcher(page);
    await switcher.locator('.sw-platform-surface-nav__item[data-surface="studio"]').click();
    const studio = page.locator(".sw-snippet-studio-host.sw-studio");
    await expect(studio).toBeVisible();
    await studio.locator(".sw-platform-header__close").click();
    await expect(studio).toHaveCount(0);

    await openSwitcher(page);
    await switcher.locator('.sw-platform-surface-nav__item[data-surface="studio"]').click();
    const dirtyStudio = page.locator(".sw-snippet-studio-host.sw-studio");
    await expect(dirtyStudio).toBeVisible();
    await dirtyStudio.locator(".sw-studio__editor").fill("body { color: red; }");
    await dirtyStudio.locator(".sw-platform-header__close").click();
    const leave = page.locator(".sw-studio__leave");
    await expect(leave).toBeVisible();
    await leave.locator("button").nth(2).click();
    await expect(dirtyStudio).toBeVisible();
    await dirtyStudio.locator(".sw-platform-header__close").click();
    await expect(page.locator(".sw-studio__leave")).toBeVisible();
    await page.locator(".sw-studio__leave button").nth(1).click();
    await expect(dirtyStudio).toHaveCount(0);
});

test("mobile surface chrome closes the real switcher dialog", async ({browser}) => {
    const context = await browser.newContext({...devices["iPhone 13"]});
    const page = await context.newPage();
    try {
        await openApp(page, {bundle: "mobile"});
        await expect(page.locator("#swMobileTopBarBtn")).toHaveCount(1, {timeout: 15000});
        await page.locator("#swMobileTopBarBtn").click();
        const mobile = page.locator(".sw__mobile");
        await expect(mobile).toBeVisible();
        await expect(mobile.locator(".sw-platform-header__close")).toBeVisible();
        await mobile.locator(".sw-platform-header__close").click();
        await expect(mobile).toHaveCount(0);
    } finally {
        await context.close();
    }
});
