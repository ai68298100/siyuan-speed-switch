import {expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

test("T-7001 settings expose behavior, journal, workbench, shortcut, and sidebar compatibility controls", async ({page}) => {
    await openApp(page);
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        if (!plugin) throw new Error("siyuan-speed-switch plugin instance is unavailable");
        plugin.openSetting("behavior");
    });
    const settings = page.locator(".sw-settings");
    await expect(settings).toBeVisible();

    const behavior = settings.locator('.sw-settings__panel[data-panel="behavior"]');
    const scrollRow = behavior.locator(".sw-settings__item").filter({hasText: /Remember document scroll position|记住文档滚动位置/});
    const scrollToggle = scrollRow.locator('input[type="checkbox"]');
    await expect(scrollToggle).toBeVisible();
    await scrollToggle.check();
    await scrollToggle.uncheck();
    await expect(scrollToggle).not.toBeChecked();
    await scrollToggle.check();
    await expect(behavior.getByText("⌥⇧S")).toBeVisible();
    await expect(behavior.getByText("⌥⇧P")).toBeVisible();

    await settings.locator('.sw-settings__tab[data-panel="panels"]').click();
    const panels = settings.locator('.sw-settings__panel[data-panel="panels"]');
    const rememberRow = panels.locator(".sw-settings__item").filter({hasText: /Remember workbench state|跨会话记住工作台状态/});
    const rememberToggle = rememberRow.locator('input[type="checkbox"]');
    await expect(rememberToggle).toBeVisible();
    await rememberToggle.check();
    await rememberToggle.uncheck();
    await expect(rememberToggle).not.toBeChecked();
    await rememberToggle.check();
    await expect(panels.getByText(/^(List|列表)$/)).toBeVisible();
    const retryRow = panels.locator(".sw-settings__item").filter({hasText: /Allow per-widget retry|允许单项失败重试/});
    await expect(retryRow.locator('input[type="checkbox"]')).toBeVisible();

    await settings.locator('.sw-settings__tab[data-panel="journal"]').click();
    const journal = settings.locator('.sw-settings__panel[data-panel="journal"]');
    await expect(journal.getByText(/Create a missing journal|日记不存在时自动创建/)).toBeVisible();

    await settings.locator('.sw-settings__tab[data-panel="floatingBall"]').click();
    const floatingBall = settings.locator('.sw-settings__panel[data-panel="floatingBall"]');
    await expect(floatingBall.getByText(/The sidebar floating-ball entry is retired|侧栏悬浮球入口已停止提供/)).toBeVisible();
    await expect(floatingBall.getByText(/^(Sidebar floating ball|侧栏悬浮球)$/)).toHaveCount(0);
});
