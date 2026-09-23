/* T-6833 只读真实例：--readonly 内核下插件必须照常加载、切换器照常可开（导航器是只读安全面），
   且全程零未捕获异常。写入类断言（putFile 被拒）已在 readonly global-setup 前置自证。 */
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher} from "../helpers/app.mjs";

test("只读真实例：插件可用且切换器可打开、零未捕获异常", async ({page}) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

    await openApp(page, {target: "target-readonly"});
    const readonlyFlag = await page.evaluate(() => Boolean(window.siyuan?.config?.readonly));
    expect(readonlyFlag, "该实例应以只读角色运行").toBe(true);

    await openSwitcher(page);
    await expect(page.locator("input.sw__search")).toHaveCount(1);

    expect(pageErrors, `只读实例出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
});
