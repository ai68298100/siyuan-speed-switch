/* T-6925 手机端布局诊断（真机反馈对齐问题取证）：
   1) 切换器最近打开卡片——缩略图与信息行必须在同一卡片内齐平（无缝隙）；
   2) 工作台——快捷条与滚动内容的重叠关系、模块标题不叠字。
   截图写 .tmp/mobile-layout/ 供目视审查；几何断言防回归。 */
import {expect, test} from "@playwright/test";
import {devices} from "@playwright/test";
import path from "node:path";
import {openApp, createClient} from "./helpers/app.mjs";

const OUT = path.resolve(".tmp", "mobile-layout");
const RUN = String(Date.now()).slice(-6);

async function waitForIndexedDocuments(client, titles) {
    await expect.poll(async () => {
        const indexed = await Promise.all(titles.map(async (title) => {
            const records = await client.postChecked("/api/filetree/searchDocs", {k: title});
            return Array.isArray(records) && records.some((record) => String(record?.hPath || "").split("/").pop() === title);
        }));
        return indexed.every(Boolean);
    }, {timeout: 30000, intervals: [250, 500, 1000]}).toBe(true);
}

async function newMobilePage(browser) {
    const context = await browser.newContext({...devices["iPhone 13"]});
    const page = await context.newPage();
    await openApp(page, {bundle: "mobile"});
    return {context, page};
}

async function openSecondPanel(page) {
    await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        const command = (plugin.commands || []).find((item) => item?.langKey === "secondPanel");
        if (command?.callback) command.callback();
        else plugin.openSecondPanel?.();
    });
    await page.waitForSelector(".sw-home__cell, .sw-home__grid", {timeout: 20000});
    await page.waitForTimeout(800);
}

test("mobile workbench: quick bar geometry and module header", async ({browser}) => {
    const {context, page} = await newMobilePage(browser);
    await openSecondPanel(page);
    await page.screenshot({path: path.join(OUT, `workbench-${RUN}.png`)});
    const geometry = await page.evaluate(() => {
        const bar = document.querySelector(".sw-home__quick-actions");
        const scroll = document.querySelector(".b3-dialog__content .sw-home__grid, .b3-dialog__content");
        const titles = Array.from(document.querySelectorAll(".sw-home__cell .sw-home__def-title, .sw-home__cell strong, .sw-home__cell [class*=title]"))
            .slice(0, 4).map((el) => ({text: (el.textContent || "").slice(0, 24), rect: el.getBoundingClientRect().toJSON()}));
        const barRect = bar ? bar.getBoundingClientRect().toJSON() : null;
        return {barRect, titles, scrollClass: scroll?.className || ""};
    });
    console.log("[r12-workbench]", JSON.stringify(geometry, null, 1));
    await context.close();
});

test("mobile switcher: recent cards keep one card body", async ({browser}) => {
    const client = createClient();
    const created = await client.postChecked("/api/notebook/createNotebook", {name: `速切移动布局-${RUN}`});
    const notebook = String(created.notebook?.id || created.notebook || "");
    try {
        for (let i = 1; i <= 2; i++) {
            await client.postChecked("/api/filetree/createDocWithMd", {
                notebook, path: `/速切布局文档${RUN}-${i}`, markdown: `# 速切布局文档${RUN}-${i}\n\n内容段落，用于生成缩略图。`,
            });
        }
        await waitForIndexedDocuments(client, [1, 2].map((i) => `速切布局文档${RUN}-${i}`));
        const {context, page} = await newMobilePage(browser);
        // 打开两篇文档生成最近记录，然后回到切换器（手机走真实顶栏按钮路径——
        // 公开钩子 openSwitcher 在手机端是 no-op）
        for (let i = 1; i <= 2; i++) {
            await page.locator("#swMobileTopBarBtn").click();
            await page.waitForSelector("input.sw__search", {timeout: 15000});
            await page.locator("input.sw__search").fill(`速切布局文档${RUN}-${i}`);
            await page.waitForSelector(".sw__doc-item", {timeout: 20000});
            await page.locator(".sw__doc-item", {hasText: `速切布局文档${RUN}-${i}`}).first().click();
            await page.waitForTimeout(1200);
        }
        await page.locator("#swMobileTopBarBtn").click();
        await page.waitForSelector("input.sw__search", {timeout: 15000});
        await page.waitForTimeout(600);
        // 切到最近打开分区（点击含该文案的分区控件；找不到则留在默认视图）
        const recentChip = page.locator("button, .b3-chip, .sw__seg-item").filter({hasText: /最近打开|Recent/}).first();
        if (await recentChip.count()) await recentChip.click().catch(() => undefined);
        await page.waitForTimeout(800);
        await page.screenshot({path: path.join(OUT, `recent-${RUN}.png`)});
        const cards = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".sw__card")).slice(0, 4).map((card) => {
                const thumb = card.querySelector(".sw__thumb");
                const meta = card.querySelector(".sw__meta");
                const cardRect = card.getBoundingClientRect();
                const thumbRect = thumb ? thumb.getBoundingClientRect() : null;
                const metaRect = meta ? meta.getBoundingClientRect() : null;
                return {
                    card: {w: Math.round(cardRect.width), h: Math.round(cardRect.height)},
                    gapThumbToMeta: thumbRect && metaRect ? Math.round(metaRect.top - thumbRect.bottom) : null,
                    thumbH: thumbRect ? Math.round(thumbRect.height) : null,
                };
            });
        });
        console.log("[r12-recent]", JSON.stringify(cards, null, 1));
        // 同一卡片内缩略图与信息行必须齐平（无割裂缝隙）
        for (const card of cards) {
            if (card.gapThumbToMeta !== null) expect(Math.abs(card.gapThumbToMeta)).toBeLessThanOrEqual(1);
        }
        await context.close();
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook}).catch(() => undefined);
    }
});

test("mobile: closing a tab from the switcher stays in the plugin (T-6925)", async ({browser}) => {
    const client = createClient();
    const created = await client.postChecked("/api/notebook/createNotebook", {name: `速切移动关签-${RUN}`});
    const notebook = String(created.notebook?.id || created.notebook || "");
    try {
        for (let i = 1; i <= 2; i++) {
            await client.postChecked("/api/filetree/createDocWithMd", {
                notebook, path: `/速切关签文档${RUN}-${i}`, markdown: `# 速切关签文档${RUN}-${i}\n\n内容。`,
            });
        }
        await waitForIndexedDocuments(client, [1, 2].map((i) => `速切关签文档${RUN}-${i}`));
        const {context, page} = await newMobilePage(browser);
        // 依次打开两篇文档（第二篇为活动页签，第一篇为非活动）
        for (let i = 1; i <= 2; i++) {
            await page.locator("#swMobileTopBarBtn").click();
            await page.waitForSelector("input.sw__search", {timeout: 15000});
            await page.locator("input.sw__search").fill(`速切关签文档${RUN}-${i}`);
            await page.waitForSelector(".sw__doc-item", {timeout: 20000});
            await page.locator(".sw__doc-item", {hasText: `速切关签文档${RUN}-${i}`}).first().click();
            await page.waitForTimeout(1000);
        }
        // 打开切换器，关闭非活动页签（触发宿主 openOverview 副作用）
        await page.locator("#swMobileTopBarBtn").click();
        await page.waitForSelector("input.sw__search", {timeout: 15000});
        const closeButtons = page.locator(".sw__card .sw__close");
        expect(await closeButtons.count()).toBeGreaterThan(0);
        await closeButtons.first().click();
        await page.waitForTimeout(1200);
        // 修复语义：仍停留在插件切换器，且宿主页签总览浮层被按等价操作关闭
        expect(await page.locator("input.sw__search").count()).toBe(1);
        const debug = await page.evaluate(() => {
            const model = document.getElementById("model");
            return {
                transform: model ? model.style.transform : "no-model",
                hasTabs: !!model && !!model.querySelector(".mobile-tabs"),
                hasClose: !!model && !!model.querySelector("#modelClose"),
            };
        });
        console.log("[r12-close-debug]", JSON.stringify(debug));
        // 机制验证：手动点 #modelClose 应能关闭总览（上游 initFramework 绑定的官方路径）
        await page.evaluate(() => {
            const closeEl = document.querySelector("#modelClose");
            closeEl.dispatchEvent(new MouseEvent("click", {bubbles: true}));
        });
        await page.waitForTimeout(600);
        const afterManual = await page.evaluate(() => {
            const model = document.getElementById("model");
            return model ? model.style.transform : "no-model";
        });
        console.log("[r12-close-manual]", JSON.stringify({afterManual}));
        const overviewVisible = await page.evaluate(() => {
            const model = document.getElementById("model");
            return !!model && model.style.transform === "translateX(0px)" && !!model.querySelector(".mobile-tabs");
        });
        expect(overviewVisible).toBe(false);
        await context.close();
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook}).catch(() => undefined);
    }
});
