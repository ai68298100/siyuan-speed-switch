import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {artifactPath, createClient, openApp} from "./helpers/app.mjs";

const RUN = String(Date.now()).slice(-8);
const NOTEBOOK_NAME = `速切兼容探针-${RUN}`;
const DOC_TITLE = `兼容探针文档-${RUN}`;

test("T-7114 真实思源记录 3.8.x 响应形状与插件卸载边界", async ({page}) => {
    test.slow();
    const client = createClient();
    let notebookId = "";
    let docId = "";
    try {
        const version = await client.version();
        expect(String(version)).toMatch(/^3\.8\./);
        const createdNotebook = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
        notebookId = String(createdNotebook?.notebook?.id || createdNotebook?.notebook || "");
        expect(notebookId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
        docId = String(await client.postChecked("/api/filetree/createDocWithMd", {
            notebook: notebookId,
            path: `/${DOC_TITLE}`,
            markdown: `# ${DOC_TITLE}\n\nT-7114 compatibility probe`,
        }));
        expect(docId).toMatch(/^\d{14}-[0-9a-z]+$/i);

        let titleRecords = [];
        await expect.poll(async () => {
            titleRecords = await client.postChecked("/api/filetree/searchDocs", {k: DOC_TITLE});
            return Array.isArray(titleRecords) && titleRecords.some((record) =>
                String(record?.path || "").includes(docId) || record?.id === docId);
        }, {timeout: 20000}).toBe(true);
        const pathResponse = await client.post("/api/filetree/listDocsByPath", {
            notebook: notebookId,
            path: "/",
            maxListCount: 100,
        });
        expect(pathResponse.code).toBe(0);
        expect(pathResponse.data?.box).toBe(notebookId);
        expect(pathResponse.data?.path).toBe("/");
        expect(Array.isArray(pathResponse.data?.files)).toBe(true);
        expect(pathResponse.data.files.some((file) => file?.id === docId)).toBe(true);

        await openApp(page);
        const lifecycleBefore = await page.evaluate(() => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
            return {
                hasPlugin: Boolean(plugin),
                onload: typeof plugin?.onload,
                onLayoutReady: typeof plugin?.onLayoutReady,
                onunload: typeof plugin?.onunload,
                hasReadyHook: typeof window.siyuanSpeedSwitch?.whenReady === "function",
            };
        });
        expect(lifecycleBefore).toMatchObject({hasPlugin: true, onload: "function", onLayoutReady: "function", onunload: "function", hasReadyHook: true});

        await page.evaluate(async () => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            await plugin.onunload();
        });
        const lifecycleAfter = await page.evaluate(() => ({
            hasReadyHook: typeof window.siyuanSpeedSwitch?.whenReady === "function",
            bodySkin: document.body?.dataset?.swSkin || "",
            bodyDensity: document.body?.dataset?.swDensity || "",
        }));
        expect(lifecycleAfter.hasReadyHook).toBe(false);
        expect(lifecycleAfter.bodySkin).toBe("");
        expect(lifecycleAfter.bodyDensity).toBe("");

        const matchingTitle = titleRecords.find((record) => String(record?.path || "").includes(docId)) || {};
        const matchingFile = pathResponse.data.files.find((file) => file?.id === docId) || {};
        const report = {
            task: "T-7114",
            kernelVersion: String(version),
            notebookId,
            titleShape: {recordFields: Object.keys(matchingTitle).sort(), matchingId: docId},
            pathShape: {dataFields: Object.keys(pathResponse.data || {}).sort(), fileFields: Object.keys(matchingFile).sort()},
            lifecycle: {before: lifecycleBefore, after: lifecycleAfter},
        };
        fs.mkdirSync(artifactPath(), {recursive: true});
        fs.writeFileSync(artifactPath("compatibility-probe.json"), `${JSON.stringify(report, null, 2)}\n`);
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook: notebookId}).catch(() => undefined);
    }
});
