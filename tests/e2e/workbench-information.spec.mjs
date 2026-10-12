import {expect, test} from "@playwright/test";
import {openApp, artifactPath} from "./helpers/app.mjs";

test("workbench keeps actions compact and exposes loading, failure and recovery", async ({page}) => {
    await openApp(page);
    // Temporary read-only adapters and in-memory layout; never overwrite saved user layout.
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        plugin.getSettings = () => ({homeSizeMode: "fullscreen", panelSizeMode: "fullscreen"});
        const fixture = window.__workbenchFixture = {mode: "pending", release: null};
        const snapshot = {items: [{label: "Retained component content", value: "Ready"}]};
        for (const id of ["e2e-workbench-fast", "e2e-workbench-slow"]) {
            plugin.homeRuntime.registerAdapter({moduleId: id, title: id, supportedDevices: ["desktop"], sizes: ["small"], timeoutMs: 10000,
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
    const summary = receipt.locator("span").first();
    await expect(summary).toHaveText("2/2 widgets healthy");
    await expect(receipt.locator("button")).toHaveText("Details");

    const refresh = root.locator(".sw-home__refresh");
    await page.evaluate(() => {window.__workbenchFixture.mode = "failed";});
    await refresh.click();
    // A failed refresh with a retained snapshot is an honest stale-cache state:
    // the workbench remains usable while the affected cell exposes the failure.
    await expect.soft(receipt, "stale receipt").toHaveAttribute("data-state", "ready", {timeout: 300});
    await expect(summary).toHaveText("1/2 widgets healthy · 1 stale");
    await expect(root.locator('.sw-home__cell[data-module-id="e2e-workbench-slow"]')).toContainText("Retained component content");
    await expect(root.locator('.sw-home__cell[data-module-id="e2e-workbench-slow"]')).toHaveAttribute("data-sw-health", "stale");
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
    await page.screenshot({path: artifactPath("workbench-information.png")});
    await root.locator(".sw-home__add").click();
    await expect(page.locator(".sw-home-store")).toBeVisible();
});

test("workbench explains unavailable saved widgets and offers a nearby store action", async ({page}) => {
    await openApp(page);
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        plugin.getSettings = () => ({homeSizeMode: "fullscreen", panelSizeMode: "fullscreen"});
        plugin.getHomeState = () => ({schemaVersion: 1,
            instances: [{instanceId: "e2e-unavailable", moduleId: "e2e-unavailable", enabled: true, config: {}}],
            layouts: {desktop: [{instanceId: "e2e-unavailable", x: 0, y: 0, w: 4, h: 1, size: "small"}]}});
        plugin.commands.find(item => item.langKey === "secondPanel").callback();
    });

    const root = page.locator(".sw-home");
    const empty = root.locator(".sw-home__empty--unavailable");
    await expect(empty).toBeVisible();
    await expect(empty.locator("h2")).toHaveText(/widgets are unavailable|组件暂不可用/i);
    await expect(empty).toContainText(/saved layout is preserved|布局会保留/);
    const emptyHeight = await empty.evaluate((element) => Math.round(element.getBoundingClientRect().height));
    expect(emptyHeight).toBeGreaterThanOrEqual(300);
    await expect(root.locator(".sw-home__body .sw-home__grid > .sw-home__cell--unavailable")).toHaveCount(1);
    await expect(root.locator(".sw-home__refresh")).toHaveCount(0);
    await page.screenshot({path: artifactPath("workbench-unavailable-wide.png")});
    await page.setViewportSize({width: 520, height: 720});
    const compactLayout = await empty.evaluate((element) => {
        const surface = element.closest(".sw-home");
        const bounds = element.getBoundingClientRect();
        const ghost = surface?.querySelector(".sw-home__cell--unavailable");
        const ghostBounds = ghost?.getBoundingClientRect();
        const ghostTextFits = ghost && ghostBounds
            ? Array.from(ghost.querySelectorAll("strong, p"), (node) => {
                const rect = node.getBoundingClientRect();
                return rect.top >= ghostBounds.top - 1 && rect.bottom <= ghostBounds.bottom + 1;
            }).every(Boolean)
            : false;
        const buttonsFit = Array.from(element.querySelectorAll("button"), (button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        }).every(Boolean);
        const workArea = surface?.querySelector(".sw-home__grid")?.getBoundingClientRect();
        return {
            overflow: Boolean(surface && surface.scrollWidth > surface.clientWidth + 1),
            buttonsFit,
            ghostFillsWorkArea: Boolean(ghostBounds && workArea && ghostBounds.width >= workArea.width * 0.9),
            ghostTextFits,
        };
    });
    expect(compactLayout.overflow).toBe(false);
    expect(compactLayout.buttonsFit).toBe(true);
    expect(compactLayout.ghostFillsWorkArea).toBe(true);
    expect(compactLayout.ghostTextFits).toBe(true);
    await page.screenshot({path: artifactPath("workbench-unavailable-compact.png")});
    await page.setViewportSize({width: 1440, height: 900});
    await empty.locator("button.sw-home__empty-edit").click();
    await expect(root.locator('.sw-home__bar button[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator(".sw-home__cell--unavailable .sw-home__tool")).toBeVisible();
    await empty.locator("button.sw-home__empty-store").click();
    await expect(page.locator(".sw-home-store")).toBeVisible();
    await expect(root.locator(".sw-home__cell--unavailable")).toHaveCount(1);
});
