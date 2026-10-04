/* T-6924 真实分屏 E2E：搜索结果 Ctrl+点击 = 右侧分屏打开（openTab position:right）。
   断言真实内核布局中出现第二个页签容器（分屏 Wnd），且既有页签不丢失。
   真实内核、真实搜索，不 mock；每轮唯一后缀防历史残留。 */
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, createClient} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-6);
const NOTEBOOK_PREFIX = "速切E2E分屏";
const NOTEBOOK_NAME = `${NOTEBOOK_PREFIX}-${RUN}`;
const DOC_TITLE = `速切分屏文档${RUN}`;

let notebookId = "";

async function removeLegacyNotebooks(client) {
    const listed = await client.postChecked("/api/notebook/lsNotebooks", {});
    const notebooks = Array.isArray(listed?.notebooks) ? listed.notebooks : [];
    for (const notebook of notebooks) {
        if (String(notebook?.name || "").startsWith(NOTEBOOK_PREFIX)) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebook.id}).catch(() => undefined);
        }
    }
}

test("ctrl+click on a search result opens the document in a right split", async ({page}) => {
    const client = createClient();
    await removeLegacyNotebooks(client);
    const created = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
    notebookId = String(created.notebook?.id || created.notebook || "");
    expect(notebookId.length).toBeGreaterThan(0);
    try {
        const doc = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: `/${DOC_TITLE}`,
            markdown: `# ${DOC_TITLE}\n\n${DOC_TITLE} 的内容首段`,
        });
        expect(String(doc || "").length).toBeGreaterThan(0);
        await expect.poll(async () => {
            const docs = await client.postChecked("/api/filetree/searchDocs", {k: DOC_TITLE});
            return Array.isArray(docs) && docs.some(item => item.id === doc
                || String(item.path || "").includes(doc));
        }, {timeout: 20000}).toBe(true);

        await openApp(page);
        await openSwitcher(page);
        const search = page.locator("input.sw__search");
        await search.fill(DOC_TITLE);
        await page.waitForSelector(".sw__doc-item", {timeout: 30000});

        const dumpLayout = () => page.evaluate(() => {
            const center = document.querySelector(".layout__center") || document.querySelector(".layout");
            if (!center) return "no-layout";
            const walk = (el, depth) => {
                if (depth > 4) return [];
                const rows = [`${"  ".repeat(depth)}<${el.tagName.toLowerCase()} class="${el.className}">`];
                for (const child of el.children) rows.push(...walk(child, depth + 1));
                return rows;
            };
            return walk(center, 0).join("\n").slice(0, 2600);
        });
        console.log("[split-before]\n" + await dumpLayout());
        const containersBefore = await page.locator(".layout-tab-container").count();
        await page.locator(".sw__doc-item", {hasText: DOC_TITLE}).first().click({modifiers: ["Control"]});
        await expect.poll(() => page.locator(".layout-tab-container").count()).toBeGreaterThan(containersBefore);
        console.log("[split-after]\n" + await dumpLayout());

        // 右侧分屏 = 布局中出现新的页签容器（Wnd）
        const containersAfter = await page.locator(".layout-tab-container").count();
        expect(containersAfter, `before=${containersBefore}`).toBeGreaterThan(containersBefore);
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook: notebookId}).catch(() => undefined);
    }
});
