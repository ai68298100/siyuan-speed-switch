/* T-6827 保存的搜索真实链路：真实内核 + 真实筛选菜单中保存当前查询 →
   空查询工作台出现对应 chip → 单击 chip 回放查询。全程零未捕获异常。 */
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher} from "./helpers/app.mjs";

const QUERY = "saved-e2e-锚定";

test("真实内核：保存当前搜索并在工作台回放", async ({page}) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

    await openApp(page);
    await openSwitcher(page);

    const search = page.locator("input.sw__search");
    await search.fill(QUERY);

    // 打开筛选菜单并保存当前搜索（E2E 工作区语言可为 zh/en，文案双匹配）
    await page.locator(".sw__search-filter-btn").click();
    const saveItem = page.locator(".b3-menu__item", {hasText: /保存当前搜索|Save current search/});
    await expect(saveItem).toHaveCount(1, {timeout: 8000});
    await saveItem.click();

    // 清空查询 → 零词条工作台出现，保存的搜索 chip 就位
    await search.fill("");
    const chip = page.locator(".sw__workbench-chip", {hasText: QUERY});
    await expect(chip).toHaveCount(1, {timeout: 8000});

    // 单击 chip：查询写回输入框，搜索立即执行
    await chip.click();
    await expect(search).toHaveValue(QUERY);

    expect(pageErrors, `保存搜索链路出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
});
