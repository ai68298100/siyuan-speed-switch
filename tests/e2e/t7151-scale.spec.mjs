/* T-7151：隔离桌面宿主 32 页签真实 UI 基准。
 *
 * 这条用例默认跳过；只有显式设置 SWSS_E2E_SCALE=1，且同时提供本轮
 * SWSS_E2E_WORKSPACE/SWSS_E2E_PORT 时才运行。它不允许端口 6806，也要求
 * 工作区带有 swss-e2e.json 标记，避免误写个人内核。
 *
 * 每个文档都经真实切换器完成「打开→搜索→点击→编辑器出现」，随后打开
 * 切换器空查询读取 .sw__card[data-tab-id]，并同时记录 .protyle-title。
 * 宿主页签上限先经 /api/setting/setFiletree 设置为 32，测试结束恢复原值，
 * 再删除本轮临时笔记本。100/500 不在这里伪装成页签规模。
 */
import fs from "node:fs";
import path from "node:path";
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, createClient, target} from "./helpers/app.mjs";

const ENABLED = process.env.SWSS_E2E_SCALE === "1";
const MAX_OPEN_TABS = 32;
const PERSONAL_PORT = 6806;
const MARKER_FILE = "swss-e2e.json";
const RUN = String(Date.now()).slice(-8);
const NOTEBOOK_PREFIX = "速切T7151规模E2E";
const NOTEBOOK_NAME = `${NOTEBOOK_PREFIX}-${RUN}`;
const DOC_PREFIX = `速切规模命中${RUN}`;

function cloneFileTree(fileTree) {
    if (!fileTree || typeof fileTree !== "object" || Array.isArray(fileTree)) {
        throw new Error("/api/system/getConf 未返回可恢复的 conf.fileTree 配置");
    }
    return JSON.parse(JSON.stringify(fileTree));
}

function readFileTree(config) {
    const fileTree = config?.conf?.fileTree || config?.fileTree;
    if (!fileTree || typeof fileTree !== "object" || Array.isArray(fileTree)) {
        throw new Error("/api/system/getConf 未返回可读取的 conf.fileTree 配置");
    }
    return fileTree;
}

function assertExplicitIsolation() {
    if (!process.env.SWSS_E2E_WORKSPACE || !process.env.SWSS_E2E_PORT) {
        throw new Error("T-7151 32 页签基准必须显式设置 SWSS_E2E_WORKSPACE 与 SWSS_E2E_PORT");
    }
    const configuredWorkspace = path.resolve(process.env.SWSS_E2E_WORKSPACE);
    const configuredPort = Number(process.env.SWSS_E2E_PORT);
    if (!Number.isInteger(configuredPort) || configuredPort < 1024 || configuredPort > 65535) {
        throw new Error(`SWSS_E2E_PORT 无效：${process.env.SWSS_E2E_PORT}`);
    }
    if (configuredPort === PERSONAL_PORT) {
        throw new Error("T-7151 32 页签基准拒绝使用个人内核端口 6806");
    }
    if (configuredWorkspace === path.parse(configuredWorkspace).root) {
        throw new Error(`T-7151 32 页签基准拒绝使用文件系统根目录：${configuredWorkspace}`);
    }
    const markerPath = path.join(configuredWorkspace, MARKER_FILE);
    if (!fs.existsSync(markerPath)) {
        throw new Error(`T-7151 32 页签基准拒绝未标记工作区：${configuredWorkspace}`);
    }
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    if (marker.protected || marker.createdBy !== "siyuan-speed-switch e2e") {
        throw new Error(`T-7151 32 页签基准工作区标记来源不匹配：${configuredWorkspace}`);
    }

    const targetInfo = target();
    const targetWorkspace = path.resolve(String(targetInfo.workspace || ""));
    const targetPort = Number(new URL(targetInfo.baseURL).port);
    if (targetWorkspace !== configuredWorkspace || targetPort !== configuredPort) {
        throw new Error(`E2E target 与显式隔离配置不一致：target=${targetWorkspace}:${targetPort} config=${configuredWorkspace}:${configuredPort}`);
    }
    return {workspace: configuredWorkspace, port: configuredPort};
}

function summarizeSamples(samples) {
    const values = samples.filter((value) => Number.isFinite(value)).map((value) => Math.round(value)).sort((a, b) => a - b);
    if (!values.length) return {sampleCount: 0, p50: null, p95: null, min: null, max: null};
    const percentile = (ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
    return {
        sampleCount: values.length,
        p50: percentile(0.5),
        p95: values.length >= 20 ? percentile(0.95) : null,
        min: values[0],
        max: values[values.length - 1],
    };
}

async function seedDocs(client) {
    let notebook = "";
    try {
        const created = await client.postChecked("/api/notebook/createNotebook", {name: NOTEBOOK_NAME});
        notebook = String(created.notebook?.id || created.notebook || "");
        expect(notebook, "隔离规模基准必须创建临时笔记本").toBeTruthy();
        const docs = [];
        for (let index = 0; index < MAX_OPEN_TABS; index += 1) {
            const title = `${DOC_PREFIX}-${String(index + 1).padStart(2, "0")}`;
            const id = await client.postChecked("/api/filetree/createDocWithMd", {
                notebook,
                path: `/${title}`,
                markdown: `# ${title}\n\nT-7151 32 页签真实打开样本 ${index + 1}`,
            });
            docs.push({id: String(id || ""), title});
        }
        return {notebook, docs};
    } catch (error) {
        if (notebook) await client.post("/api/notebook/removeNotebook", {notebook}).catch(() => undefined);
        throw error;
    }
}

async function waitForIndexedDocs(client, docs) {
    const ids = new Set(docs.map((doc) => doc.id));
    await expect.poll(async () => {
        const results = await client.postChecked("/api/filetree/searchDocs", {k: DOC_PREFIX});
        return Array.isArray(results)
            ? results.filter((entry) => ids.has(String(entry?.id || ""))
                || docs.some((doc) => String(entry?.path || "").includes(doc.id))).length
            : 0;
    }, {timeout: 30000, intervals: [250, 500, 1000]}).toBe(MAX_OPEN_TABS);
}

async function inspectVisibleTabs(page, fixtureIds, fixtureTitles) {
    await openSwitcher(page);
    await page.locator("input.sw__search").fill("");
    await page.waitForTimeout(80);
    const state = await page.evaluate(({ids, expectedTitles}) => {
        const isVisible = (element) => {
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
        };
        const cards = Array.from(document.querySelectorAll(".sw__card[data-tab-id]"));
        const protyleTitles = Array.from(document.querySelectorAll(".protyle-title"));
        const fixture = new Set(ids);
        return {
            cards: cards.length,
            visibleCards: cards.filter(isVisible).length,
            fixtureCards: cards.filter((card) => fixture.has(card.getAttribute("data-root-id") || "")).length,
            cardTitles: cards.map((card) => card.getAttribute("data-title") || "").filter(Boolean),
            protyleTitles: protyleTitles.length,
            visibleProtyleTitles: protyleTitles.filter(isVisible).length,
            fixtureProtyleTitles: protyleTitles.filter((title) => expectedTitles.some((fixtureTitle) => (title.textContent || "").includes(fixtureTitle))).length,
        };
    }, {ids: [...fixtureIds], expectedTitles: fixtureTitles});
    await page.keyboard.press("Escape");
    await page.waitForSelector("input.sw__search", {state: "detached", timeout: 5000}).catch(() => undefined);
    return state;
}

async function waitForSwitcherClosed(page) {
    if (await page.locator("input.sw__search").count()) {
        await page.keyboard.press("Escape");
    }
    await page.waitForSelector("input.sw__search", {state: "detached", timeout: 10000});
}

test.describe("T-7151 隔离桌面 32 页签真实规模", () => {
    test.describe.configure({retries: 0});
    test.skip(!ENABLED, "规模基准必须显式设置 SWSS_E2E_SCALE=1 才运行");

    test("真实切换器连续打开 32 篇临时文档并记录页签上限", async ({page}) => {
        test.slow();
        test.setTimeout(300000);
        const isolation = assertExplicitIsolation();
        const client = createClient();
        const seeded = await seedDocs(client);
        let originalFileTree;
        let restored = false;
        let cleanupError;
        const samples = [];
        const fixtureIds = new Set(seeded.docs.map((doc) => doc.id));
        const fixtureTitles = seeded.docs.map((doc) => doc.title);
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
        try {
            const initial = await client.postChecked("/api/system/getConf");
            originalFileTree = cloneFileTree(readFileTree(initial));
            await client.postChecked("/api/setting/setFiletree", {...originalFileTree, maxOpenTabCount: MAX_OPEN_TABS});
            const configured = await client.postChecked("/api/system/getConf");
            expect(readFileTree(configured).maxOpenTabCount, "宿主必须接受 32 页签配置").toBe(MAX_OPEN_TABS);
            await waitForIndexedDocs(client, seeded.docs);

            await openApp(page);
            const baseline = await inspectVisibleTabs(page, fixtureIds, fixtureTitles);
            const baselineNonFixture = Math.max(0, baseline.cards - baseline.fixtureCards);
            const expectedFixtureMinimum = Math.max(1, Math.min(seeded.docs.length, MAX_OPEN_TABS - baselineNonFixture));
            for (const [index, doc] of seeded.docs.entries()) {
                const started = await page.evaluate(() => performance.now());
                await openSwitcher(page);
                const result = page.locator(".sw__doc-item", {hasText: doc.title}).first();
                await page.locator("input.sw__search").fill(doc.title);
                await result.waitFor({state: "visible", timeout: 30000});
                await result.click();
                await page.waitForFunction((title) => Array.from(document.querySelectorAll(".protyle-title"))
                    .some((element) => (element.textContent || "").includes(title)), doc.title, {timeout: 30000});
                await waitForSwitcherClosed(page);
                const snapshot = await inspectVisibleTabs(page, fixtureIds, fixtureTitles);
                samples.push({index: index + 1, title: doc.title, openMs: Math.round((await page.evaluate(() => performance.now())) - started), ...snapshot});
                expect(snapshot.fixtureCards, `第 ${index + 1} 个文档点击后必须有真实页签卡片`).toBeGreaterThanOrEqual(1);
                expect(snapshot.fixtureProtyleTitles, `第 ${index + 1} 个文档点击后必须有真实编辑器标题`).toBeGreaterThanOrEqual(1);
                expect(snapshot.cards, `宿主页签数不能超过配置上限（第 ${index + 1} 次）`).toBeLessThanOrEqual(MAX_OPEN_TABS);
            }

            const last = samples.at(-1);
            const report = {
                isolation,
                maxOpenTabCount: MAX_OPEN_TABS,
                baseline,
                final: last,
                open: summarizeSamples(samples.map((sample) => sample.openMs)),
                expectedFixtureMinimum,
                samples,
                fixture: {notebook: seeded.notebook, documentCount: seeded.docs.length, fixtureIds: [...fixtureIds]},
            };
            console.log("[T-7151] isolated 32-tab UI scale:", JSON.stringify(report));
            expect(last.cards).toBeLessThanOrEqual(MAX_OPEN_TABS);
            expect(last.fixtureCards).toBeGreaterThanOrEqual(expectedFixtureMinimum);
            expect(pageErrors, `32 页签规模测试出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
        } finally {
            // 恢复宿主配置，即使 UI 断言失败也不把 32 写入后续测试工作区。
            if (originalFileTree) {
                try {
                    await client.postChecked("/api/setting/setFiletree", originalFileTree);
                    const restoredConfig = await client.postChecked("/api/system/getConf");
                    restored = readFileTree(restoredConfig).maxOpenTabCount === originalFileTree.maxOpenTabCount;
                } catch (error) {
                    console.error(`[T-7151] 恢复 maxOpenTabCount 失败：${error?.message || error}`);
                }
            }
            // 删除临时笔记本；调用真实 API，不保留规模夹具污染隔离工作区。
            await client.post("/api/notebook/removeNotebook", {notebook: seeded.notebook}).then((payload) => {
                if (payload?.code !== 0) throw new Error(`code=${payload?.code} msg=${payload?.msg || ""}`);
            }).catch((error) => {
                console.error(`[T-7151] 删除临时笔记本失败：${error?.message || error}`);
                cleanupError = error;
            });
            if (originalFileTree && !restored) throw new Error("T-7151 32 页签基准结束时未能确认宿主配置恢复");
            if (cleanupError) throw new Error(`T-7151 32 页签基准未能清理临时笔记本：${cleanupError?.message || cleanupError}`);
        }
    });
});
