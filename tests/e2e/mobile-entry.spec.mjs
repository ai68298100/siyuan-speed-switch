/* T-6780 配套（桌面可自动化的部分）：移动前端 bundle（/stage/build/mobile/，
   iPhone 13 视口）真实例验证——悬浮球入口注入、切换器可开、搜索可输入、
   全程零未捕获异常。Android 真机侧滑零误触仍归 T-6780 真机批。 */
import {expect, test} from "@playwright/test";
import {devices} from "@playwright/test";
import {openApp, createClient} from "./helpers/app.mjs";

test("移动前端真实例：悬浮球入口注入、切换器可用、零未捕获异常", async ({browser}) => {
    const client = createClient();
    const created = await client.postChecked("/api/notebook/createNotebook", {name: `速切移动E2E-${Date.now()}`});
    const notebook = String(created.notebook?.id || created.notebook || "");
    const docTitle = `速切移动文档${Date.now().toString(36)}`;
    try {
        await client.postChecked("/api/filetree/createDocWithMd", {
            notebook, path: `/${docTitle}`, markdown: `${docTitle} 的内容`,
        });
        const context = await browser.newContext({...devices["iPhone 13"]});
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

        await openApp(page, {bundle: "mobile"});
        // 移动顶栏入口必须注入（ensureMobileTopBarButton）
        await expect(page.locator("#swMobileTopBarBtn")).toHaveCount(1, {timeout: 15000});
        // 通过顶栏入口打开切换器（真实点击路径）
        await page.locator("#swMobileTopBarBtn").click();
        const search = page.locator("input.sw__search");
        await expect(search).toHaveCount(1, {timeout: 15000});

        await search.fill(docTitle);
        await page.waitForSelector(".sw__doc-item", {timeout: 20000});
        await page.locator(".sw__doc-item", {hasText: docTitle}).first().click();
        // 移动前端无 .protyle-title：以 protyle 容器出现且包含文档内容为打开依据
        await page.waitForFunction((title) => {
            const protyle = document.querySelector(".protyle");
            return Boolean(protyle) && (protyle.textContent || "").includes(title);
        }, docTitle, {timeout: 20000});

        expect(pageErrors, `移动前端出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
        await context.close();
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook}).catch(() => undefined);
    }
});
