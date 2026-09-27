import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, PLUGIN_NAME} from "./helpers/app.mjs";

test("桌面第三面板入口加载发布 chunk 并显示片段实验室", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);

    const chunkPath = `/plugins/${PLUGIN_NAME}/dist/snippet-studio.js`;
    const responsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith("/snippet-studio.js"),
    );
    await page.locator(".sw__snippet-studio-btn").click();

    const response = await responsePromise;
    expect(new URL(response.url()).pathname).toBe(chunkPath);
    expect(response.status(), `片段实验室脚本请求失败：${response.url()}`).toBe(200);
    await expect(page.locator(".sw-snippet-studio-host.sw-studio .sw-studio__layout")).toBeVisible();
    await expect(page.getByText("操作失败。", {exact: true})).toHaveCount(0);
});
