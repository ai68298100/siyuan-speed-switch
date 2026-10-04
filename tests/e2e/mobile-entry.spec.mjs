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
    const openedTitle = `速切移动已打开${Date.now().toString(36)}`;
    try {
        const openedDoc = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook, path: `/${openedTitle}`, markdown: `${openedTitle} 的内容`,
        });
        const openedDocId = String(openedDoc || "");
        const createdDoc = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook, path: `/${docTitle}`, markdown: `${docTitle} 的内容`,
        });
        const docId = String(createdDoc || "");
        await expect.poll(async () => {
            const docs = await client.postChecked("/api/filetree/searchDocs", {k: docTitle});
            return Array.isArray(docs) && docs.some((doc) => doc?.id === docId
                || String(doc?.path || "").includes(docId));
        }, {timeout: 20000}).toBe(true);
        const context = await browser.newContext({...devices["iPhone 13"]});
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

        await openApp(page, {bundle: "mobile"});
        await page.evaluate(async ({openedId, targetId}) => {
            const tabs = window.siyuan?.mobile?.tabs;
            if (openedId && typeof tabs?.open === "function") await tabs.open(openedId);
            const target = tabs?.state?.tabs?.find((tab) => tab.current?.rootID === targetId);
            if (target && typeof tabs.close === "function") await tabs.close(target.id);
        }, {openedId: openedDocId, targetId: docId});
        await expect.poll(() => page.evaluate((rootId) =>
            !(window.siyuan?.mobile?.tabs?.state?.tabs || []).some((tab) => tab.current?.rootID === rootId), docId),
        {timeout: 10000}).toBe(true);
        const hostOverview = page.locator("#model .mobile-tabs");
        if (await hostOverview.count()) {
            await page.evaluate(() => {
                document.querySelector("#modelClose")?.dispatchEvent(new MouseEvent("click", {bubbles: true}));
            });
            await expect.poll(() => page.evaluate(() => {
                const model = document.getElementById("model");
                return !model || model.style.transform !== "translateX(0px)" || !model.querySelector(".mobile-tabs");
            }), {timeout: 10000}).toBe(true);
        }
        // 移动顶栏入口必须注入（ensureMobileTopBarButton）
        await expect(page.locator("#swMobileTopBarBtn")).toHaveCount(1, {timeout: 15000});
        // 通过顶栏入口打开切换器（真实点击路径）
        await page.locator("#swMobileTopBarBtn").click();
        const search = page.locator("input.sw__search");
        await expect(search).toHaveCount(1, {timeout: 15000});

        await search.fill(docTitle);
        await expect.poll(() => page.locator(".sw__doc-item").count(), {timeout: 20000}).toBeGreaterThan(0);
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
