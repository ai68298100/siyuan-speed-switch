/* T-7307 真实思源隔离宿主 E2E：代码片段三模式导入规划与原生安全保存闭环。
   在隔离思源宿主中验证片段真实读取、新增保存、Merge/Fork 导入写回，
   以及测试后恢复原始快照确保宿主零残留。 */
import {expect, test} from "@playwright/test";
import {openApp, createClient} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-6);
const SNIPPET_ID = `20261018120000-e2e${RUN}`;
const SNIPPET_NAME = `E2E片段-${RUN}`;

test("snippet studio: safe native mutation, 3-mode import plan and baseline restore", async ({page}) => {
    test.slow();
    await openApp(page);

    // 在隔离宿主环境中执行真实片段读取、保存、规划导入与还原闭环
    const result = await page.evaluate(async ({snippetId, snippetName}) => {
        const {createSnippetStore} = await import("./snippet-studio-host.js");
        const {planSnippetImport} = await import("./snippet-import-plan.js");
        const {snippetSnapshotSignature} = await import("./snippet-studio-model.js");

        const store = createSnippetStore();

        // 1. 读取初始宿主基线快照并留存签名
        const initialSnapshot = await store.readSnapshot();
        const initialSig = snippetSnapshotSignature(initialSnapshot);
        const initialSnippets = initialSnapshot.snippets || [];

        // 2. 通过 store.mutate 新增一个测试片段并真实写回宿主原生存储
        const testSnippet = {
            id: snippetId,
            name: snippetName,
            type: "css",
            content: `/* E2E CSS */ .sw-e2e-test { color: var(--b3-theme-primary); }`,
            enabled: true,
        };

        const addedList = await store.mutate(initialSnippets, "add", testSnippet);
        const hasAddedTest = addedList.some((s) => s.id === snippetId);

        // 3. 验证导入规划引擎在真实宿主片段列表上的行为
        // 3a. Merge 模式：更新代码与名称，严格保留本地 enabled 状态 (true)
        const incomingUpdate = [
            {
                id: snippetId,
                name: `${snippetName}-更新版`,
                type: "css",
                content: `/* E2E CSS Updated */ .sw-e2e-test { font-size: 16px; }`,
                enabled: false, // 外部导入标记为 false，但 Merge 必须保留本地 true
            },
            {
                id: `20261018120001-e2enew${snippetId.slice(-4)}`,
                name: `${snippetName}-全新条目`,
                type: "css",
                content: `.sw-new { display: flex; }`,
                enabled: true,
            },
        ];

        const mergePlan = planSnippetImport(addedList, incomingUpdate, {mode: "merge"});
        const mergedTarget = mergePlan.list.find((s) => s.id === snippetId);
        const mergeKeptEnabled = mergedTarget?.enabled === true;
        const mergeUpdatedContent = mergedTarget?.content.includes("font-size: 16px;");

        // 3b. Fork 模式：派生新 ID，不覆盖已有条目，且克隆项默认安全未启用 (enabled: false)
        const forkPlan = planSnippetImport(addedList, incomingUpdate, {mode: "fork"});
        const forkedClone = forkPlan.list.find((s) => s.name === `${snippetName}-更新版`);
        const forkGeneratedNewId = forkedClone && forkedClone.id !== snippetId;
        const forkDefaultDisabled = forkedClone?.enabled === false;

        // 4. 将 Merge 规划出的更新写回宿主，验证真实持久化
        const nextSnapshot = {
            snippets: mergePlan.list,
            settings: initialSnapshot.settings,
        };
        const currentSnapshot = await store.readSnapshot();
        const currentSig = snippetSnapshotSignature(currentSnapshot);
        const restoredMerge = await store.restoreSnapshot(currentSig, nextSnapshot);
        const confirmedMergeSnippet = restoredMerge.snippets.find((s) => s.id === snippetId);

        // 5. 还原初始基线快照，保证宿主环境零污染残留
        const afterMergeSig = snippetSnapshotSignature(restoredMerge);
        const revertedSnapshot = await store.restoreSnapshot(afterMergeSig, initialSnapshot);
        const finalSig = snippetSnapshotSignature(revertedSnapshot);

        return {
            initialCount: initialSnippets.length,
            hasAddedTest,
            mergeAddedCount: mergePlan.addedCount,
            mergeUpdatedCount: mergePlan.updatedCount,
            mergeKeptEnabled,
            mergeUpdatedContent,
            forkGeneratedNewId,
            forkDefaultDisabled,
            confirmedMergeContent: confirmedMergeSnippet?.content,
            confirmedMergeEnabled: confirmedMergeSnippet?.enabled,
            finalRestored: finalSig === initialSig,
        };
    }, {snippetId: SNIPPET_ID, snippetName: SNIPPET_NAME});

    expect(result.hasAddedTest).toBe(true);
    expect(result.mergeUpdatedCount).toBe(1);
    expect(result.mergeAddedCount).toBe(1);
    expect(result.mergeKeptEnabled).toBe(true);
    expect(result.mergeUpdatedContent).toBe(true);
    expect(result.forkGeneratedNewId).toBe(true);
    expect(result.forkDefaultDisabled).toBe(true);
    expect(result.confirmedMergeEnabled).toBe(true);
    expect(result.finalRestored).toBe(true);
});
