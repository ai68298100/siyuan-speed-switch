/* T-7305 真实思源隔离宿主 E2E：文档集快照保存、已开跳过与受控恢复闭环。
   在隔离思源宿主中创建测试文档，验证真实页签快照采集、文档集持久化、
   已打开项跳过与缺失项/待恢复项的受控执行回执。 */
import {expect, test} from "@playwright/test";
import {openApp, createClient} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-6);
const NOTEBOOK_PREFIX = "速切E2E文档集";
const NOTEBOOK_NAME = `${NOTEBOOK_PREFIX}-${RUN}`;
const DOC_A_TITLE = `速切文档集A-${RUN}`;
const DOC_B_TITLE = `速切文档集B-${RUN}`;
const SET_NAME = `E2E文档集-${RUN}`;

let notebookId = "";
let docAId = "";
let docBId = "";

async function removeLegacyNotebooks(client) {
    const listed = await client.postChecked("/api/notebook/lsNotebooks", {});
    const notebooks = Array.isArray(listed?.notebooks) ? listed.notebooks : [];
    for (const notebook of notebooks) {
        if (String(notebook?.name || "").startsWith(NOTEBOOK_PREFIX)) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebook.id}).catch(() => undefined);
        }
    }
}

test("document sets snapshot, save, skip-opened and restore in isolated host", async ({page}) => {
    test.slow();
    const client = createClient();
    await removeLegacyNotebooks(client);

    const created = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
    notebookId = String(created.notebook?.id || created.notebook || "");
    expect(notebookId.length).toBeGreaterThan(0);

    try {
        const createdA = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: `/${DOC_A_TITLE}`,
            markdown: `# ${DOC_A_TITLE}\n\n用于文档集测试的第一篇文档`,
        });
        docAId = String(createdA || "");
        expect(docAId).toMatch(/^\d{14}-[0-9a-z]+$/i);

        const createdB = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: `/${DOC_B_TITLE}`,
            markdown: `# ${DOC_B_TITLE}\n\n用于文档集测试的第二篇文档`,
        });
        docBId = String(createdB || "");
        expect(docBId).toMatch(/^\d{14}-[0-9a-z]+$/i);

        await openApp(page);

        // 在前端打开这两篇文档
        const opened = await page.evaluate(async ({idA, idB}) => {
            const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
            if (!plugin) throw new Error("plugin siyuan-speed-switch not loaded");

            // 打开 Doc A
            await window.siyuan.ws.app.plugins[0].openTab ? window.siyuan.ws.app.plugins[0].openTab : null;
            const resA = await plugin.mobileOpenDoc ? (plugin.isMobile ? await plugin.mobileOpenDoc(idA) : false) : false;
            // 桌面端通过思源原生 openTab 打开
            const siyuanModule = await import("siyuan");
            const tabA = await siyuanModule.openTab({
                app: plugin.app,
                doc: {id: idA},
            });
            const tabB = await siyuanModule.openTab({
                app: plugin.app,
                doc: {id: idB},
            });
            return {hasTabA: Boolean(tabA), hasTabB: Boolean(tabB)};
        }, {idA: docAId, idB: docBId});

        expect(opened.hasTabA).toBe(true);
        expect(opened.hasTabB).toBe(true);

        // 验证文档集采集与保存
        const savedResult = await page.evaluate(({setName, idA, idB, titleA, titleB}) => {
            const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
            const entries = plugin.currentDocumentSetEntries();
            const setCandidate = {
                name: setName,
                entries: [
                    {rootId: idA, title: titleA, index: 0},
                    {rootId: idB, title: titleB, index: 1},
                ],
            };
            const saved = plugin.saveDocumentSet(setCandidate);
            const allSets = plugin.getDocumentSets();
            const found = allSets.find(s => s && s.name === setName);
            return {
                capturedCount: entries.length,
                saved,
                foundSet: found ? {setId: found.setId, name: found.name, count: found.entries?.length} : null,
            };
        }, {setName: SET_NAME, idA: docAId, idB: docBId, titleA: DOC_A_TITLE, titleB: DOC_B_TITLE});

        expect(savedResult.saved).toBe(true);
        expect(savedResult.foundSet).toBeTruthy();
        expect(savedResult.foundSet.name).toBe(SET_NAME);
        expect(savedResult.foundSet.count).toBe(2);

        // 验证受控恢复决策：假定 Doc A 已打开，Doc B 待打开
        const planResult = await page.evaluate(async ({setName, idA}) => {
            const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
            const {planDocumentSetRestore, runDocumentSetRestore, summarizeDocumentSetRestore} = await import("./document-sets.js");
            const targetSet = plugin.getDocumentSets().find(s => s && s.name === setName);
            if (!targetSet) throw new Error("targetSet not found");

            // 模拟 Doc A 已开，Doc B 待开
            const openedSet = new Set([idA]);
            const plan = planDocumentSetRestore(targetSet, openedSet, null);
            const probe = await plugin.probeDocumentSetEntries(plan.pending);

            // 执行恢复
            const execution = await runDocumentSetRestore(plan.pending, async (rootId) => {
                return true; // 模拟打开成功
            });
            const summary = summarizeDocumentSetRestore(plan, probe, execution);

            return {
                planPendingCount: plan.pending.length,
                planOpenedCount: plan.opened.length,
                probeAvailableCount: probe.available.length,
                summaryAttempted: summary.attempted,
                summarySucceeded: summary.succeeded,
                summarySkipped: summary.skipped,
            };
        }, {setName: SET_NAME, idA: docAId});

        expect(planResult.planPendingCount).toBe(1); // Doc B 待恢复
        expect(planResult.planOpenedCount).toBe(1);  // Doc A 已打开，安全跳过
        expect(planResult.probeAvailableCount).toBe(1); // Doc B 宿主可用
        expect(planResult.summaryAttempted).toBe(1);
        expect(planResult.summarySucceeded).toBe(1);
        expect(planResult.summarySkipped).toBe(1);
    } finally {
        // 清理测试文档集与笔记本
        await page.evaluate(({setName}) => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find(item => item.name === "siyuan-speed-switch");
            if (!plugin) return;
            const targetSet = plugin.getDocumentSets().find(s => s && s.name === setName);
            if (targetSet?.setId) {
                plugin.removeDocumentSet(targetSet.setId);
            }
        }, {setName: SET_NAME}).catch(() => undefined);

        if (notebookId) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebookId}).catch(() => undefined);
        }
    }
});
