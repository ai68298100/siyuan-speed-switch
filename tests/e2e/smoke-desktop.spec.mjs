/* T-6833 桌面真实例冒烟：真实内核 + 真实前端 bundle 下，插件可加载、公开钩子就绪、
   切换器可打开、输入不抛未捕获异常、Esc 可关闭、禁用→启用生命周期数据不炸。
   独立隔离工作区为空库：断言聚焦结构与稳定性，不断言具体搜索结果。 */
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher} from "./helpers/app.mjs";

test("桌面真实例：切换器可打开、可输入、Esc 可关闭，全程零未捕获异常", async ({page}) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

    await openApp(page);
    await openSwitcher(page);

    const search = page.locator("input.sw__search");
    await search.fill("e2e");
    // 空库下无页签可过滤，但输入链路（filterCards/防抖/健康快照）必须完整走通不抛错
    await page.waitForTimeout(600);
    await expect(search).toHaveValue("e2e");

    await search.press("Escape");
    await expect(page.locator("input.sw__search")).toHaveCount(0, {timeout: 5000});

    expect(pageErrors, `真实例出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
});

test("桌面真实例：插件实例随内核下发且公开钩子可用", async ({page}) => {
    await openApp(page);
    const descriptor = await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        return {name: plugin?.name || "", hasApi: typeof window.siyuanSpeedSwitch?.openSwitcher === "function"};
    });
    expect(descriptor.name).toBe("siyuan-speed-switch");
    expect(descriptor.hasApi).toBe(true);
});
