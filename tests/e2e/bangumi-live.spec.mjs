import {expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

test("真实思源 Bangumi 在线日历与官方封面加载", async ({page}) => {
    test.skip(process.env.SWSS_E2E_LIVE_BANGUMI !== "1", "online evidence requires SWSS_E2E_LIVE_BANGUMI=1");
    await openApp(page);
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((entry) => entry.name === "siyuan-speed-switch");
        const settings = plugin.getSettings();
        plugin.getSettings = () => ({...settings, homeSizeMode: "fullscreen"});
        plugin.getHomeState = () => ({schemaVersion: 1,
            instances: [{instanceId: "live-bangumi", moduleId: "external-anime-bangumi", enabled: true,
                config: {dayRange: "本周", limit: 4, showCovers: "是", showDates: "是", showScore: "是"}}],
            layouts: {desktop: [{instanceId: "live-bangumi", x: 0, y: 0, w: 12, h: 4, size: "full"}]}});
        plugin.commands.find((command) => command.langKey === "secondPanel").callback();
    });
    const cell = page.locator('.sw-home__cell[data-module-id="external-anime-bangumi"]');
    await expect(cell).toBeVisible();
    const programs = cell.locator(".sw__home-media-item.has-cover");
    await expect(programs.first()).toBeVisible({timeout: 20000});
    expect(await programs.count()).toBeGreaterThan(0);
    const cover = programs.first().locator("img");
    await expect(cover).toHaveAttribute("src", /^https:\/\/lain\.bgm\.tv\/pic\/cover\//);
    await cover.scrollIntoViewIfNeeded();
    await expect.poll(() => cover.evaluate((image) => image.complete && image.naturalWidth > 0), {timeout: 20000}).toBe(true);
    await expect(page.locator(".sw-home__receipt")).toContainText("1/1 widgets healthy");
    console.log(JSON.stringify({provider: "Bangumi",programs: await programs.count(),
        coverLoaded: await cover.evaluate((image) => ({width: image.naturalWidth, height: image.naturalHeight})),
        mocked: false}));
    await page.screenshot({path: test.info().outputPath("bangumi-live.png"), fullPage: true});
});
