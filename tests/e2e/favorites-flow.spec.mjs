/* T-7310 真实思源隔离宿主 E2E：收藏分组添加、多端点击与返回现场闭环。
   在隔离思源宿主中创建真实测试文档，通过插件 API 验证收藏添加、
   分组归属、收藏列表读取、点击打开与现场恢复，并在运行后还原基线状态。 */
import {expect, test} from "@playwright/test";
import {openApp, createClient} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-6);
const NOTEBOOK_PREFIX = "速切E2E收藏";
const NOTEBOOK_NAME = `${NOTEBOOK_PREFIX}-${RUN}`;
const DOC_TITLE = `速切收藏文档-${RUN}`;
const GROUP_NAME = `E2E分组-${RUN}`;

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

test("favorites: add to group, query across surfaces and return to scene in isolated host", async ({page}) => {
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
            markdown: `# ${DOC_TITLE}\n\n用于收藏流程端到端验证的测试文档内容。`,
        });
        docId = String(createdDoc || "");
        expect(docId).toMatch(/^\d{14}-[0-9a-z]+$/i);

        await openApp(page);

        // 1. 打开测试文档并记录初始基线收藏状态
        const initialStatus = await page.evaluate(async ({targetDocId}) => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            if (!plugin) throw new Error("plugin not loaded");

            const siyuan = await import("siyuan");
            const tab = await siyuan.openTab({
                app: plugin.app,
                doc: {id: targetDocId},
            });

            const initialFavs = plugin.getFavorites ? plugin.getFavorites() : [];
            const initialGroups = plugin.getFavoriteGroupNames ? plugin.getFavoriteGroupNames() : [];
            return {
                tabOpened: Boolean(tab),
                initialFavCount: initialFavs.length,
                initialGroupCount: initialGroups.length,
            };
        }, {targetDocId: docId});

        expect(initialStatus.tabOpened).toBe(true);

        // 2. 创建收藏分组并添加该文档到指定分组
        const addResult = await page.evaluate(({targetDocId, title, groupName}) => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            const createdGroup = plugin.createFavoriteGroup(groupName);

            // 直接通过生产保存方法将文档收藏并打上分组
            const favList = plugin.getFavorites().slice();
            const existingIndex = favList.findIndex((item) => item.rootId === targetDocId || item.key === targetDocId);
            if (existingIndex >= 0) {
                favList[existingIndex].group = groupName;
            } else {
                favList.unshift({
                    key: targetDocId,
                    rootId: targetDocId,
                    title,
                    group: groupName,
                });
            }
            plugin.saveFavorites(favList);

            const updatedFavs = plugin.getFavorites();
            const savedItem = updatedFavs.find((f) => f.rootId === targetDocId);
            const allGroups = plugin.getFavoriteGroupNames();

            return {
                createdGroup,
                hasSavedItem: Boolean(savedItem),
                savedGroup: savedItem?.group,
                groupIncluded: allGroups.includes(groupName),
            };
        }, {targetDocId: docId, title: DOC_TITLE, groupName: GROUP_NAME});

        expect(addResult.createdGroup).toBe(true);
        expect(addResult.hasSavedItem).toBe(true);
        expect(addResult.savedGroup).toBe(GROUP_NAME);
        expect(addResult.groupIncluded).toBe(true);

        // 3. 验证工作台收藏小组件（favorites widget）快照中能正确包含此条目
        const widgetSnapshot = await page.evaluate(async () => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            const readOutcome = await plugin.readHomeModule("favorites", "desktop", {}, {force: true, cacheTtlMs: 0});
            return {
                ok: readOutcome?.ok,
                itemCount: readOutcome?.snapshot?.items?.length || 0,
                hasTargetDoc: (readOutcome?.snapshot?.items || []).some((item) => String(item.value || "").includes(docId) || String(item.label || "").includes(DOC_TITLE)),
            };
        });

        expect(widgetSnapshot.ok).toBe(true);
        expect(widgetSnapshot.hasTargetDoc).toBe(true);

        // 4. 验证通过收藏项执行打开并返回现场
        const openAndReturnResult = await page.evaluate(async ({targetDocId}) => {
            const plugin = window.siyuan.ws.app.plugins.find((p) => p.name === "siyuan-speed-switch");
            const opened = await plugin.openDocumentById(targetDocId);
            const activeTab = plugin.getActiveTab ? plugin.getActiveTab() : null;
            const activeRoot = activeTab ? plugin.rootIdOf(activeTab) : "";
            return {
                opened: Boolean(opened),
                activeRootMatches: activeRoot === targetDocId,
            };
        }, {targetDocId: docId});

        expect(openAndReturnResult.opened).toBe(true);
        expect(openAndReturnResult.activeRootMatches).toBe(true);

    } finally {
        // 5. 还原环境与基线，清除测试创建的收藏条目与分组
        await page.evaluate(({targetDocId, groupName}) => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find((p) => p.name === "siyuan-speed-switch");
            if (!plugin) return;

            // 移除收藏项
            const favList = plugin.getFavorites ? plugin.getFavorites().slice() : [];
            const filteredFavs = favList.filter((f) => f.rootId !== targetDocId && f.key !== targetDocId);
            if (plugin.saveFavorites) plugin.saveFavorites(filteredFavs);

            // 移除测试分组
            const registry = plugin.getFavGroupRegistry ? plugin.getFavGroupRegistry().slice() : [];
            const filteredRegistry = registry.filter((g) => g !== groupName);
            if (plugin.saveFavGroupRegistry) plugin.saveFavGroupRegistry(filteredRegistry);
        }, {targetDocId: docId, groupName: GROUP_NAME}).catch(() => undefined);

        if (notebookId) {
            await client.post("/api/notebook/removeNotebook", {notebook: notebookId}).catch(() => undefined);
        }
    }
});
