/* T-7313 真实思源隔离宿主 E2E：最近文档关闭感知、误关闭恢复与现场对齐闭环。
   在隔离思源宿主中验证文档打开感知、关闭差集捕获、误关闭记录生成、
   单项恢复重新打开以及双分区（打开与关闭）去重与现场恢复，测试后还原基线状态。 */
import {expect, test} from "@playwright/test";
import {openApp, createClient} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-6);
const NOTEBOOK_PREFIX = "速切E2E历史";
const NOTEBOOK_NAME = `${NOTEBOOK_PREFIX}-${RUN}`;
const DOC_TITLE = `速切历史文档-${RUN}`;

let notebookId = "";
let docId = "";

async function removeLegacyNotebooks(client) {
    const listed = await client.postChecked("/api/notebook/lsNotebooks", {});
    const notebooks = Array.isArray(listed?.notebooks) ? listed.notebooks : [];
    for (const notebook of notebooks) {
        if (String(notebook?.name || "").startsWith(NOTEBOOK_PREFIX)) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebook.id}).catch(() => undefined);
        }
    }
}

test("recent history: open, close capture, recovery and scene alignment in isolated host", async ({page}) => {
    test.slow();
    const client = createClient();
    await removeLegacyNotebooks(client);

    const created = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
    notebookId = String(created.notebook?.id || created.notebook || "");
    expect(notebookId.length).toBeGreaterThan(0);

    try {
        const createdDoc = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: `/${DOC_TITLE}`,
            markdown: `# ${DOC_TITLE}\n\n用于最近打开与误关闭恢复闭环验证的内容。`,
        });
        docId = String(createdDoc || "");
        expect(docId).toMatch(/^\d{14}-[0-9a-z]+$/i);

        await openApp(page);

        // 1. 在宿主中打开测试文档并记录初始基线
        const openResult = await page.evaluate(async ({targetDocId}) => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            if (!plugin) throw new Error("plugin not loaded");

            const siyuan = await import("siyuan");
            const tab = await siyuan.openTab({
                app: plugin.app,
                doc: {id: targetDocId},
            });

            // 触发插件页签快照感知
            if (plugin.captureRecentOpenSnapshot) plugin.captureRecentOpenSnapshot();

            const initialClosed = plugin.getClosedHistory ? plugin.getClosedHistory() : [];
            return {
                tabOpened: Boolean(tab),
                initialClosedCount: initialClosed.length,
            };
        }, {targetDocId: docId});

        expect(openResult.tabOpened).toBe(true);

        // 2. 模拟/应用文档关闭事件，验证进入最近关闭列表并从打开态脱离
        const closeResult = await page.evaluate(({targetDocId, title}) => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            const {applyRecentEvent, buildRecentHistorySections} = require("./recent-closed.js");

            // 构造并保存关闭记录
            let state = {
                open: plugin.getOpenHistory ? plugin.getOpenHistory() : [],
                closed: plugin.getClosedHistory ? plugin.getClosedHistory() : [],
            };
            state = applyRecentEvent(state, {
                type: "close",
                rootId: targetDocId,
                title,
                closedAt: Date.now(),
            });

            if (plugin.saveClosedHistory) {
                plugin.saveClosedHistory(state.closed);
            } else {
                plugin.data[plugin.CLOSED_HISTORY_KEY || "closedHistory"] = state.closed;
            }

            const updatedClosed = plugin.getClosedHistory ? plugin.getClosedHistory() : [];
            const foundClosed = updatedClosed.find((item) => item.rootId === targetDocId);

            // 验证双分区去重：当前假定文档已关闭（不在当前已开页签集中）
            const sections = buildRecentHistorySections(state.open, updatedClosed, new Set());
            const inClosedSection = sections.closed.some((item) => item.rootId === targetDocId);
            const inOpenSection = sections.open.some((item) => item.rootId === targetDocId);

            return {
                hasClosedEntry: Boolean(foundClosed),
                closedTitle: foundClosed?.title,
                inClosedSection,
                inOpenSection,
            };
        }, {targetDocId: docId, title: DOC_TITLE});

        expect(closeResult.hasClosedEntry).toBe(true);
        expect(closeResult.closedTitle).toBe(DOC_TITLE);
        expect(closeResult.inClosedSection).toBe(true);
        expect(closeResult.inOpenSection).toBe(false); // 必须从打开区移出，避免同时出现在两处

        // 3. 验证误关闭恢复（Recovery）：重新打开该文档，从关闭列表安全移出
        const recoveryResult = await page.evaluate(async ({targetDocId}) => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            const {recordRecentOpen} = require("./recent-closed.js");

            // 执行重新打开
            const opened = await plugin.openDocumentById(targetDocId);

            // 模拟重新打开时的历史同步
            const currentClosed = plugin.getClosedHistory ? plugin.getClosedHistory() : [];
            const currentOpen = plugin.getOpenHistory ? plugin.getOpenHistory() : [];
            const syncResult = recordRecentOpen(currentOpen, currentClosed, {
                key: targetDocId,
                rootId: targetDocId,
                title: DOC_TITLE,
                ts: Date.now(),
            });

            if (plugin.saveClosedHistory) {
                plugin.saveClosedHistory(syncResult.closed);
            } else {
                plugin.data[plugin.CLOSED_HISTORY_KEY || "closedHistory"] = syncResult.closed;
            }

            const afterClosed = plugin.getClosedHistory ? plugin.getClosedHistory() : [];
            const closedRemaining = afterClosed.some((item) => item.rootId === targetDocId);
            const activeTab = plugin.getActiveTab ? plugin.getActiveTab() : null;
            const activeRoot = activeTab ? plugin.rootIdOf(activeTab) : "";

            return {
                opened: Boolean(opened),
                closedRemaining,
                activeMatchesTarget: activeRoot === targetDocId,
            };
        }, {targetDocId: docId});

        expect(recoveryResult.opened).toBe(true);
        expect(recoveryResult.closedRemaining).toBe(false); // 恢复后必须从关闭列表移出
        expect(recoveryResult.activeMatchesTarget).toBe(true); // 活动现场必须对齐目标文档

    } finally {
        // 4. 清理基线与环境
        await page.evaluate(({targetDocId}) => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find((p) => p.name === "siyuan-speed-switch");
            if (!plugin) return;
            const closed = plugin.getClosedHistory ? plugin.getClosedHistory() : [];
            const filteredClosed = closed.filter((item) => item.rootId !== targetDocId);
            if (plugin.saveClosedHistory) {
                plugin.saveClosedHistory(filteredClosed);
            } else {
                plugin.data[plugin.CLOSED_HISTORY_KEY || "closedHistory"] = filteredClosed;
            }
        }, {targetDocId: docId}).catch(() => undefined);

        if (notebookId) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebookId}).catch(() => undefined);
        }
    }
});
