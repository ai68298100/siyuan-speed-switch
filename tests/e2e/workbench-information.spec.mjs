import {expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

test("workbench keeps actions compact and exposes loading, failure and recovery", async ({page}) => {
    await openApp(page);
    // Temporary read-only adapters and in-memory layout; never overwrite saved user layout.
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        const fixture = window.__workbenchFixture = {mode: "pending", release: null};
        const snapshot = {items: [{label: "Retained component content", value: "Ready"}]};
        for (const id of ["e2e-workbench-fast", "e2e-workbench-slow"]) {
            plugin.homeRuntime.registerAdapter({moduleId: id, title: id, supportedDevices: ["desktop"], sizes: ["small"],
                read: () => id.endsWith("fast") ? snapshot : fixture.mode === "failed" ? Promise.reject(new Error("fixture failure"))
                    : fixture.mode === "pending" ? new Promise(resolve => {fixture.release = () => resolve(snapshot);}) : snapshot});
            plugin.homeThirdPartyIds.add(id);
        }
        plugin.getHomeState = () => ({schemaVersion: 1,
            instances: ["fast", "slow"].map(id => ({instanceId: id, moduleId: `e2e-workbench-${id}`, enabled: true, config: {}})),
            layouts: {desktop: ["fast", "slow"].map(id => ({instanceId: id, x: 0, y: 0, w: 4, h: 1, size: "small"}))}});
        plugin.commands.find(item => item.langKey === "secondPanel").callback();
    });
    const root = page.locator(".sw-home");
    const receipt = root.locator(".sw-home__receipt");
    await expect(root).toBeVisible();
    await expect(root.locator(".sw-home__cell")).toHaveCount(2);
    await expect(root.locator(".sw-home__greeting, .sw-home__hint")).toHaveCount(0);
    await expect(receipt).toHaveAttribute("role", "status");
    await expect.soft(receipt, "initial loading receipt").toHaveAttribute("data-state", "loading", {timeout: 300});
    await expect(receipt).toContainText("Loading");
    await expect.poll(() => page.evaluate(() => typeof window.__workbenchFixture.release)).toBe("function");
    await page.evaluate(() => {window.__workbenchFixture.mode = "ready"; window.__workbenchFixture.release();});
    await expect(receipt).toHaveAttribute("data-state", "ready");
    await expect(receipt).toHaveText("2/2 widgets healthy");

    const refresh = root.locator(".sw-home__refresh");
    await page.evaluate(() => {window.__workbenchFixture.mode = "failed";});
    await refresh.click();
    await expect.soft(receipt, "failed receipt").toHaveAttribute("data-state", "error", {timeout: 300});
    await expect(receipt).toHaveText("1/2 widgets healthy · 1 failed");
    await expect(root.locator('.sw-home__cell[data-module-id="e2e-workbench-slow"]')).toContainText("Retained component content");
    await expect(root.locator('.sw-home__cell[data-module-id="e2e-workbench-slow"]')).toHaveAttribute("data-sw-health", "failed");
    await expect(refresh).toHaveAttribute("aria-busy", "false");
    await expect(refresh).toContainText("Retry");
    await page.evaluate(() => {window.__workbenchFixture.mode = "pending"; window.__workbenchFixture.release = null;});
    await refresh.click();
    await expect(refresh).toBeDisabled();
    await expect.soft(receipt, "retry loading receipt").toHaveAttribute("data-state", "loading", {timeout: 300});
    await expect(receipt).toContainText("Loading");
    await expect.poll(() => page.evaluate(() => typeof window.__workbenchFixture.release)).toBe("function");
    await page.evaluate(() => {window.__workbenchFixture.mode = "ready"; window.__workbenchFixture.release();});
    await expect(receipt).toHaveAttribute("data-state", "ready");
    await expect(refresh).toBeEnabled();
    await expect(refresh).toContainText("Refresh all");

    for (const width of [1440, 960, 600]) {
        await page.setViewportSize({width, height: 720});
        await page.evaluate(() => Promise.all(document.getAnimations()
            .filter(animation => animation.effect.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {}))));
        const host = page.locator(".sw-platform-dialog--workbench");
        await expect.soft(host, "workbench width follows viewport").toHaveCSS("width", `${width}px`, {timeout: 500});
        await expect.soft(host, "workbench height follows viewport").toHaveCSS("height", "720px", {timeout: 500});
        for (const button of await root.locator(".sw-home__bar button").all()) {
            await expect.soft(button, "workbench action is fully visible").toBeInViewport({ratio: 1, timeout: 500});
        }
    }
    if (test.info().errors.length) return;
    await page.setViewportSize({width: 1440, height: 900});
    const edit = root.locator(".sw-home__bar button").first();
    await edit.click();
    await expect(root.locator(".sw-home__bar button").first()).toHaveAttribute("aria-pressed", "true");
    await root.locator(".sw-home__edit-done").click();
    await expect(root.locator(".sw-home__bar button").first()).toHaveAttribute("aria-pressed", "false");
    await page.setViewportSize({width: 1440, height: 900});
    await page.screenshot({path: ".artifacts/e2e/workbench-information.png"});
    await root.locator(".sw-home__add").click();
    await expect(page.locator(".sw-home-store")).toBeVisible();
});
