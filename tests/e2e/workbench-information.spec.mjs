import {expect, test} from "@playwright/test";
import {openApp, artifactPath} from "./helpers/app.mjs";

test("workbench exposes keyboard edit shortcuts, loading, failure and recovery", async ({page}) => {
    await openApp(page);
    // Temporary read-only adapters and in-memory layout; never overwrite saved user layout.
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        const opener = document.createElement("button");
        opener.type = "button";
        opener.dataset.testid = "workbench-shortcut-opener";
        document.body.appendChild(opener);
        opener.focus();
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

    const shortcutToggle = root.locator('[data-home-action="edit"]');
    await expect(shortcutToggle).toHaveAttribute("aria-keyshortcuts", "Control+B Meta+B");
    await expect(shortcutToggle).toHaveAttribute("title", /Ctrl\/Cmd\+B/);
    await shortcutToggle.focus();
    await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {
        key: "b", ctrlKey: true, bubbles: true, cancelable: true, isComposing: true,
    })));
    await expect(shortcutToggle).toHaveAttribute("aria-pressed", "false");
    await page.locator('[data-testid="workbench-shortcut-opener"]').focus();
    await page.keyboard.press("Control+b");
    await expect(root.locator('[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator('[data-home-action="edit"]')).toHaveAttribute("aria-keyshortcuts", "Escape");
    await page.keyboard.press("Escape");
    await expect(root.locator('[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "false");
    await expect(root).toBeVisible();

    await root.evaluate(element => {
        const input = document.createElement("input");
        input.dataset.testid = "workbench-shortcut-guard";
        element.appendChild(input);
        input.focus();
    });
    await page.keyboard.press("Control+b");
    await expect(root.locator('[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "false");
    await expect(root).toBeVisible();
    await root.locator('[data-testid="workbench-shortcut-guard"]').evaluate(input => input.remove());

    await page.setViewportSize({width: 1440, height: 900});
    await page.screenshot({path: artifactPath("workbench-information.png")});
    await root.locator(".sw-home__add").click();
    await expect(page.locator(".sw-home-store")).toBeVisible();
    await page.locator('[data-testid="workbench-shortcut-opener"]').focus();
    await page.keyboard.press("Control+b");
    await expect(root.locator('[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "false");
    await page.locator(".sw-home-store__close").click();
    await expect(page.locator(".sw-home-store")).toHaveCount(0);
    await page.locator('[data-testid="workbench-shortcut-opener"]').evaluate(opener => opener.remove());
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
test("workbench edit mode stays visually still when resumed through surface navigation", async ({page}) => {
    await openApp(page);
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        plugin.getSettings = () => ({homeSizeMode: "fullscreen", panelSizeMode: "fullscreen"});
        plugin.getHomeState = () => ({schemaVersion: 1,
            instances: [{instanceId: "e2e-static-edit", moduleId: "recent-documents", enabled: true, config: {}}],
            layouts: {desktop: [{instanceId: "e2e-static-edit", x: 0, y: 0, w: 4, h: 1, size: "small"}]}});
        plugin.commands.find(item => item.langKey === "secondPanel").callback();
    });

    const root = page.locator(".sw-home");
    await expect(root).toBeVisible();
    await root.locator('.sw-home__bar button[data-home-action="edit"]').click();
    await expect(root.locator('.sw-home__bar button[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "true");
    const cells = root.locator(".sw-home__grid--editing .sw-home__cell");
    await expect(cells).toHaveCount(1);

    const motion = await cells.first().evaluate(element => ({
        animationName: getComputedStyle(element).animationName,
        runningAnimations: element.getAnimations().filter(animation => animation.playState === "running").length,
        outlineStyle: getComputedStyle(element).outlineStyle,
        dragHandle: Boolean(element.querySelector(".sw-home__tool--drag")),
    }));
    expect(motion.animationName).toBe("none");
    expect(motion.runningAnimations).toBe(0);
    expect(motion.outlineStyle).toBe("dashed");
    expect(motion.dragHandle).toBe(true);

    await root.locator('.sw-platform-surface-nav__item[data-surface="studio"]').click();
    await expect(page.locator(".sw-studio")).toBeVisible();
    await page.locator('button.sw-platform-surface-nav__item[data-surface="workbench"]').click();
    await expect(root.locator('.sw-home__bar button[data-home-action="edit"]')).toHaveAttribute("aria-pressed", "true");
    await expect(root.locator(".sw-home__grid--editing .sw-home__cell")).toHaveCSS("animation-name", "none");
    await expect(root.locator(".sw-home__tool--drag")).toBeVisible();
});

test("workbench can add missing curated defaults without replacing existing layout", async ({page}) => {
    await openApp(page);
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        plugin.getSettings = () => ({homeSizeMode: "fullscreen", panelSizeMode: "fullscreen"});
        const available = ["recent-documents", "today-journal", "today-tasks"]
            .filter(id => plugin.homeRuntime.listModules("desktop").some(module => module.moduleId === id));
        if (available.length < 2) throw new Error("fixture requires at least two available curated default widgets");
        const kept = {instanceId: "e2e-kept-default", moduleId: available[0], enabled: true, config: {}};
        const initial = {schemaVersion: 1, instances: [kept], layouts: {
            desktop: [{instanceId: kept.instanceId, x: 3, y: 2, w: 4, h: 1, size: "small"}],
        }};
        window.__restoreDefaultsFixture = {state: initial, available};
        plugin.getHomeState = () => structuredClone(window.__restoreDefaultsFixture.state);
        plugin.saveHomeState = state => {window.__restoreDefaultsFixture.state = structuredClone(state);};
        plugin.commands.find(item => item.langKey === "secondPanel").callback();
    });

    const root = page.locator(".sw-home");
    await expect(root).toBeVisible();
    await root.locator('[data-home-action="edit"]').click();
    const restore = root.locator('[data-home-action="restore-default"]');
    await expect(restore).toBeVisible();
    await expect(restore).toBeEnabled();
    await expect(restore).toHaveText(/Add selected defaults|补齐精选组件/);

    const before = await page.evaluate(() => structuredClone(window.__restoreDefaultsFixture.state));
    const cancelDialog = async dialog => {await dialog.dismiss();};
    page.on("dialog", cancelDialog);
    await restore.click();
    await page.removeListener("dialog", cancelDialog);
    await expect.poll(() => page.evaluate(() => window.__restoreDefaultsFixture.state.instances.length)).toBe(before.instances.length);
    expect(await page.evaluate(() => window.__restoreDefaultsFixture.state)).toEqual(before);

    const confirmDialog = page.waitForEvent("dialog", {timeout: 5000}).then(async dialog => {
        const message = dialog.message();
        await dialog.accept();
        return message;
    });
    await restore.click();
    expect(await confirmDialog).toMatch(/Add \d+ selected default widgets|将补齐 \d+ 个精选默认组件/);

    await expect(restore).toBeDisabled();
    await expect(restore).toHaveAttribute("title", /already in this workbench|已在当前工作台中/);
    const after = await page.evaluate(() => window.__restoreDefaultsFixture.state);
    const modules = after.instances.map(instance => instance.moduleId);
    const available = await page.evaluate(() => window.__restoreDefaultsFixture.available);
    for (const moduleId of available) expect(modules.filter(id => id === moduleId)).toHaveLength(1);
    expect(after.layouts.desktop.find(item => item.instanceId === "e2e-kept-default")).toMatchObject({x: 3, y: 2});

    const undo = root.locator('.sw-home__edit-banner button.sw-home__history')
        .filter({hasText: /Undo|撤销/i});
    await expect(undo).toBeVisible();
    await undo.click();
    await expect.poll(() => page.evaluate(() => window.__restoreDefaultsFixture.state.instances.length)).toBe(before.instances.length);
    await expect(root.locator('[data-home-action="restore-default"]')).toBeEnabled();
});
