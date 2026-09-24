/* T-6826 真实打开链路 E2E：在真实内核里创建笔记本与文档，经切换器三层搜索
   （真实 searchDocs 端点）命中并单击打开，断言真实 protyle 页签出现。
   这是"搜索 → 打开"主路径的真实宿主证据（不 mock 任何内核请求）。
   每轮使用唯一后缀，避免命中历史运行残留的旧文档；启动时清理残留笔记本。 */
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, createClient} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-6);
const NOTEBOOK_PREFIX = "速切E2E打开链路";
const NOTEBOOK_NAME = `${NOTEBOOK_PREFIX}-${RUN}`;
const DOC_TITLE = `速切锚定文档${RUN}`;

let notebookId = "";
let docARootId = "";

async function removeLegacyNotebooks(client) {
    // 历史运行残留清理（失败运行的 finally 可能被强杀跳过）
    const listed = await client.postChecked("/api/notebook/lsNotebooks", {});
    const notebooks = Array.isArray(listed?.notebooks) ? listed.notebooks : [];
    for (const notebook of notebooks) {
        if (String(notebook?.name || "").startsWith(NOTEBOOK_PREFIX)) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebook.id}).catch(() => undefined);
        }
    }
}

async function seedDocs(client) {
    const created = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
    // 契约：CreateNotebookData.notebook 为 Notebook 对象（含 id），不是裸字符串
    notebookId = String(created.notebook?.id || created.notebook || "");
    expect(notebookId.length).toBeGreaterThan(0);
    const docA = await client.postChecked("/api/filetree/createDocWithMd", {
        notebook: notebookId,
        path: `/${DOC_TITLE}`,
        markdown: `${DOC_TITLE} 的内容`,
    });
    docARootId = String(docA || "");
    expect(docARootId.length).toBeGreaterThan(0);
    // 关联链路（T-6814）：文档 B 带指向 A 的块引 → A 的反链应包含 B
    await client.postChecked("/api/filetree/createDocWithMd", {
        notebook: notebookId,
        path: `/速切关联${RUN}`,
        markdown: `((${docARootId} "参见 ${DOC_TITLE}"))`,
    });
    // 陪衬文档：让文档结果区不止一条，避免恰好命中的偶然通过
    await client.postChecked("/api/filetree/createDocWithMd", {
        notebook: notebookId,
        path: `/速切锚定陪衬${RUN}`,
        markdown: `速切锚定陪衬${RUN} 的内容`,
    });
}

test("真实内核：切换器搜索命中真实文档并单击打开真实页签", async ({page}) => {
    test.slow(); // 全链路（搜索→打开→关联→预览）余量放宽，机器负载抖动不影响结论
    const client = createClient();
    await removeLegacyNotebooks(client);
    await seedDocs(client);
    try {
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    page.on("console", (message) => { if (message.text().includes("[sw-dbg]")) console.log("[captured]", message.text()); });

        await openApp(page);
        await openSwitcher(page);

        const search = page.locator("input.sw__search");
        await search.fill(DOC_TITLE);
        // 防抖 + 真实 searchDocs 往返，文档结果卡片出现
        await page.waitForSelector(".sw__doc-item", {timeout: 30000});
        const firstDoc = page.locator(".sw__doc-item", {hasText: DOC_TITLE}).first();
        await expect(firstDoc).toBeVisible({timeout: 10000});
        // T-6834/T-6835：查询词在标题行真实渲染为 <mark> 高亮（分段装配，非 innerHTML）
        await expect(firstDoc.locator(".sw__doc-title mark").first()).toBeVisible({timeout: 10000});
        // T-6837 键序直达第二片：结果行携带 1-9 角标；焦点落在结果行按数字键直达
        await expect(firstDoc).toHaveAttribute("data-sw-digit", /./, {timeout: 10000});

        // T-6837：数字直达路径打开（焦点落在结果行按角标数字键直达；>9 条时回退点击）
        const digit = await firstDoc.getAttribute("data-sw-digit");
        if (digit) {
            await firstDoc.focus();
            // T-6838：结果行 ↑/↓ 行导航——焦点行随方向键移动并跟随滚动
            const secondDoc = page.locator(".sw__doc-grid .sw__doc-item").nth(1);
            if (await secondDoc.count()) {
                await page.keyboard.press("ArrowDown");
                const movedDown = await page.evaluate(() => document.activeElement?.getAttribute("data-sw-doc-key"));
                const secondKey = await secondDoc.getAttribute("data-sw-doc-key");
                if (secondKey) {
                    await expect(movedDown === secondKey, "ArrowDown 后焦点应落在第 2 行").toBe(true);
                    await page.keyboard.press("ArrowUp");
                    const movedUp = await page.evaluate(() => document.activeElement?.getAttribute("data-sw-doc-key"));
                    const firstKey = await firstDoc.getAttribute("data-sw-doc-key");
                    await expect(movedUp === firstKey, "ArrowUp 后焦点应回到第 1 行").toBe(true);
                }
            }
            await page.keyboard.press(digit);
        } else {
            await firstDoc.click();
        }
        // 打开的是真实 protyle 编辑器页签，且加载了目标文档
        await page.waitForFunction((title) => {
            return Array.from(document.querySelectorAll(".protyle-title"))
                .some((element) => (element.textContent || "").includes(title));
        }, DOC_TITLE, {timeout: 20000});
        // T-6831：真实面包屑入口按钮（3.8.5 addBreadcrumbButton）已挂载
        // （多编辑器会挂多个且部分在隐藏分栏里，以计数为准）
        await page.waitForFunction(() => {
            return document.querySelectorAll('[data-plugin-name="siyuan-speed-switch"]').length > 0;
        }, undefined, {timeout: 10000});

        // T-6814 关联内容：A 处于活动状态时再开切换器（空查询工作台），
        // 应出现指向 B（带块引指向 A）的关联 chip；点击后真实打开 B。
        // fill("") 触发一次 applySearch：工作台随输入事件渲染。
        await openSwitcher(page);
        const search2 = page.locator("input.sw__search").last();
        await search2.fill("");
        const relatedChip = page.locator(".sw__workbench-chip", {hasText: `速切关联${RUN}`});
        await expect(relatedChip).toHaveCount(1, {timeout: 20000});
        await relatedChip.click();
        await page.waitForFunction((title) => {
            return Array.from(document.querySelectorAll(".protyle-title"))
                .some((element) => (element.textContent || "").includes(title));
        }, `速切关联${RUN}`, {timeout: 20000});

        // T-6816 预览基础：Alt+点击文档结果 → 只读预览页签（doc.mode preview）
        await openSwitcher(page);
        // 预览对象用未打开的陪衬文档：结果区按设计排除已打开文档
        const search3 = page.locator("input.sw__search").last();
        await search3.fill(`速切锚定陪衬${RUN}`);
        await page.waitForSelector(".sw__doc-item", {timeout: 30000});
        await page.locator(".sw__doc-item", {hasText: `速切锚定陪衬${RUN}`}).first().click({modifiers: ["Alt"]});
        await page.waitForSelector(".protyle-preview:not(.fn__none)", {timeout: 20000});

        expect(pageErrors, `真实打开链路出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
    } finally {
        // 测试自清理：移除 E2E 笔记本（隔离工作区内，无用户数据）
        await client.post("/api/notebook/removeNotebook", {notebook: notebookId}).catch(() => undefined);
    }
});
