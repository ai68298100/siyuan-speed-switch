import {expect, test} from "@playwright/test";
import {openApp, openSwitcher} from "./helpers/app.mjs";

test("three panels omit redundant host titles and retain internal navigation and close", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);
    for (const [surface, selector] of [
        ["switcher", '.sw-platform-surface[data-sw-surface="switcher"]'],
        ["workbench", ".sw-home"],
        ["studio", ".sw-snippet-studio-host.sw-studio"],
    ]) {
        const root = page.locator(selector);
        await expect(root).toBeVisible();
        await page.evaluate(() => Promise.all(document.getAnimations()
            .filter(animation => animation.effect.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {}))));
        const host = root.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " b3-dialog__container ")]');
        await expect(host.locator(".b3-dialog__header"), `${surface}: redundant host title`).toBeHidden();
        await expect(root.locator(".sw-platform-chrome")).toBeVisible();
        await expect(root.locator(".sw-platform-header__close")).toBeVisible();
        await page.screenshot({path: `.artifacts/e2e/panel-header-${surface}.png`});
        if (surface !== "studio") {
            const next = surface === "switcher" ? "workbench" : "studio";
            await root.locator(`.sw-platform-surface-nav__item[data-surface="${next}"]`).click();
        } else {
            await expect(root.locator(".sw-studio__header")).toBeVisible();
            await root.locator(".sw-platform-header__close").click();
            await expect(root).toHaveCount(0);
        }
    }
});
