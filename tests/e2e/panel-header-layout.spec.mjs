import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, artifactPath} from "./helpers/app.mjs";

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
        await page.screenshot({path: artifactPath(`panel-header-${surface}.png`)});
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

test("surface navigation feedback appears immediately and one press navigates once", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);
    const root = page.locator('.sw-platform-surface[data-sw-surface="switcher"]');
    const navButton = root.locator('.sw-platform-surface-nav__item[data-surface="workbench"]');
    await expect(navButton).toHaveAttribute("type", "button");

    const beforeHover = await navButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {background: style.backgroundColor, transition: style.transitionDuration};
    });
    await navButton.hover();
    const afterHover = await navButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {background: style.backgroundColor, transition: style.transitionDuration};
    });
    expect(afterHover.transition).toBe("0s");
    expect(afterHover.background).not.toBe(beforeHover.background);

    await navButton.focus();
    await expect(navButton).toBeFocused();
    const focusOutline = await navButton.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(focusOutline).toBe("solid");

    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((candidate) => candidate?.name === "siyuan-speed-switch");
        if (!plugin) throw new Error("siyuan-speed-switch plugin instance is unavailable");
        const original = plugin.openPlatformSurface;
        window.__surfaceNavCallCount = 0;
        plugin.openPlatformSurface = function(...args) {
            window.__surfaceNavCallCount += 1;
            return original.apply(this, args);
        };
    });
    const box = await navButton.boundingBox();
    if (!box) throw new Error("surface navigation button has no hit box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressedFeedback = await navButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {background: style.backgroundColor, transform: style.transform};
    });
    expect(pressedFeedback.background).not.toBe(beforeHover.background);
    expect(pressedFeedback.transform).not.toBe("none");
    await page.mouse.up();
    expect(await page.evaluate(() => window.__surfaceNavCallCount)).toBe(1);
    await expect(page.locator(".sw-home")).toBeVisible();
});
