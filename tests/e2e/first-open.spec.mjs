/* T-6885/T-7151：真实内核下测量切换器首开与搜索主路径。
   首开使用页面内 performance.now；搜索交互的计时包围 Playwright 输入和等待，含少量协议往返。
   关闭/沉降不计入样本。p50/p95 只在样本数足够时标记，样本不足不宣称 p95。 */
import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, createClient} from "./helpers/app.mjs";

const SAMPLES_WARM = 20;
// The isolated host fixture seeds exactly two temporary documents. Keep these
// samples small so a delayed kernel index cannot turn a benchmark into a long
// timeout; p95 is intentionally null below the 20-sample threshold.
const SAMPLES_FILTER = 2;
const SAMPLES_ACTIVATION = 1;
const PERF_RUN = String(Date.now()).slice(-8);
const PERF_NOTEBOOK_PREFIX = "速切性能E2E";
const PERF_NOTEBOOK_NAME = `${PERF_NOTEBOOK_PREFIX}-${PERF_RUN}`;
// 判定线（结合 ROADMAP §3.5 预算口径与既有 T-6838 观测）：
// 热启动 p50 ≤ 300ms 才认为无需骨架态；冷启动只记录不设门（受首帧竞态影响大）。
const WARM_BUDGET_MS = 300;

function summarizeSamples(samples) {
    const values = samples.filter((value) => Number.isFinite(value)).map((value) => Math.round(value)).sort((a, b) => a - b);
    if (!values.length) return {sampleCount: 0, p50: null, p95: null, min: null, max: null};
    const percentile = (ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
    return {
        sampleCount: values.length,
        p50: percentile(0.5),
        // p95 needs at least 20 samples to be a useful tail observation here.
        p95: values.length >= 20 ? percentile(0.95) : null,
        min: values[0],
        max: values[values.length - 1],
    };
}

async function measureSwitcherOpen(page) {
    return page.evaluate(async () => {
        const t0 = performance.now();
        window.siyuanSpeedSwitch.openSwitcher();
        for (let i = 0; i < 1000; i += 1) {
            const input = document.querySelector("input.sw__search");
            if (input) {
                input.focus();
                return {ms: Math.round(performance.now() - t0), searchVisible: true, searchFocusable: document.activeElement === input};
            }
            await new Promise((resolve) => setTimeout(resolve, 4));
        }
        return {ms: -1, searchVisible: false, searchFocusable: false};
    });
}

async function closeSwitcher(page) {
    await page.evaluate(() => document.querySelector(".sw__search") && window.siyuanSpeedSwitch?.whenReady());
    await page.keyboard.press("Escape");
    await page.waitForSelector("input.sw__search", {state: "detached", timeout: 5000});
}

test("T-6849/T-7151 首帧评估：切换器打开→搜索框可聚焦（冷 1 次 + 热 20 次）", async ({page}) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    await openApp(page);

    // 冷启动：首次打开（含首次 Dialog 创建与列表装配）
    const cold = await measureSwitcherOpen(page);
    expect(cold.searchVisible, "冷启动后搜索框必须出现").toBe(true);
    expect(cold.searchFocusable, "冷启动后搜索框必须可聚焦").toBe(true);
    await closeSwitcher(page);

    // 热启动：反复开关。20 个样本才计算 p95，避免把 5 次样本的最大值冒充 p95。
    const warm = [];
    for (let i = 0; i < SAMPLES_WARM; i += 1) {
        const sample = await measureSwitcherOpen(page);
        expect(sample.searchVisible, `热启动第 ${i + 1} 次搜索框必须出现`).toBe(true);
        expect(sample.searchFocusable, `热启动第 ${i + 1} 次搜索框必须可聚焦`).toBe(true);
        warm.push(sample.ms);
        await closeSwitcher(page);
    }
    const summaryWarm = summarizeSamples(warm);
    const summary = {
        coldMs: cold.ms,
        warmSamples: warm,
        warm: summaryWarm,
    };
    console.log("[T-6849] first-open timing:", JSON.stringify(summary));
    // 骨架态判定：热启动 p50 ≤ 300ms → 无需骨架（记录数据即可）。
    expect(summary.warm.p50, `热启动 p50 ${summary.warm.p50}ms 超过 300ms 判定线`).toBeLessThanOrEqual(WARM_BUDGET_MS);
    expect(pageErrors, `真实例出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
});

async function seedPerformanceDocs(client) {
    const created = await client.postChecked("/api/notebook/createNotebook", {name: PERF_NOTEBOOK_NAME});
    const notebook = String(created.notebook?.id || created.notebook || "");
    expect(notebook).toBeTruthy();
    const docs = [];
    for (let index = 0; index < 2; index += 1) {
        const title = `速切性能命中${PERF_RUN}-${String(index + 1).padStart(2, "0")}`;
        const id = await client.postChecked("/api/filetree/createDocWithMd", {
            notebook,
            path: `/${title}`,
            markdown: `# ${title}\n\n性能主路径样本 ${index + 1}`,
        });
        docs.push({id: String(id || ""), title});
    }
    return {notebook, docs};
}

test("T-7151 真实内核：输入过滤/激活与受控慢失败样本", async ({page}) => {
    test.slow();
    const client = createClient();
    const seeded = await seedPerformanceDocs(client);
    try {
        // Do not let a missing second index entry silently fall back to the
        // first document: the delayed-response sample must exercise a distinct
        // seeded document, and both documents are part of this fixture contract.
        expect(seeded.docs).toHaveLength(2);
        for (const doc of seeded.docs) {
            await expect.poll(async () => {
                const docs = await client.postChecked("/api/filetree/searchDocs", {k: doc.title});
                return Array.isArray(docs) && docs.some((entry) => entry?.id === doc.id || String(entry?.path || "").includes(doc.id));
            }, {timeout: 20000}).toBe(true);
        }
        await openApp(page);
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));

        const filterSamples = [];
        for (const doc of seeded.docs.slice(0, SAMPLES_FILTER)) {
            await openSwitcher(page);
            const input = page.locator("input.sw__search");
            // This interaction timer includes Playwright input/wait round trips.
            const started = await page.evaluate(() => performance.now());
            await input.fill(doc.title);
            await page.locator(".sw__doc-item", {hasText: doc.title}).first().waitFor({state: "visible", timeout: 30000});
            filterSamples.push((await page.evaluate(() => performance.now())) - started);
            await closeSwitcher(page);
        }

        const activationSamples = [];
        for (const doc of seeded.docs.slice(0, SAMPLES_ACTIVATION)) {
            await openSwitcher(page);
            const input = page.locator("input.sw__search");
            await input.fill(doc.title);
            const result = page.locator(".sw__doc-item", {hasText: doc.title}).first();
            await result.waitFor({state: "visible", timeout: 30000});
            const resultAt = await page.evaluate(() => performance.now());
            await result.click();
            await page.waitForFunction((title) => Array.from(document.querySelectorAll(".protyle-title")).some((el) => (el.textContent || "").includes(title)), doc.title, {timeout: 30000});
            activationSamples.push((await page.evaluate(() => performance.now())) - resultAt);
            // Keep the isolated fixture bounded: close the just-opened card through
            // the same user-visible action instead of calling an internal host API.
            await openSwitcher(page);
            const card = page.locator(".sw__card").first();
            if (await card.count()) await card.locator(".sw__close:visible").first().click();
            await closeSwitcher(page);
        }

        // Use the second seeded root for slow-path measurement so the result is
        // not excluded while the activation fixture is open.
        const slowDoc = seeded.docs[1];
        await page.route("**/api/filetree/searchDocs", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 250));
            await route.continue();
        });
        await openSwitcher(page);
        const slowInputStarted = await page.evaluate(() => performance.now());
        await page.locator("input.sw__search").fill(slowDoc.title);
        await page.locator(".sw__doc-item", {hasText: slowDoc.title}).first().waitFor({state: "visible", timeout: 30000});
        const slowMs = (await page.evaluate(() => performance.now())) - slowInputStarted;
        await closeSwitcher(page);
        await page.unroute("**/api/filetree/searchDocs");

        const failedTitle = `速切性能失败${PERF_RUN}`;
        const failRoute = async (route) => route.fulfill({status: 503, contentType: "application/json", body: JSON.stringify({code: 1, msg: "controlled benchmark failure"})});
        await page.route("**/api/filetree/searchDocs", failRoute);
        await page.route("**/api/search/fullTextSearchBlock", failRoute);
        await page.route("**/api/search/semanticSearchBlock", failRoute);
        await openSwitcher(page);
        const failedStarted = await page.evaluate(() => performance.now());
        await page.locator("input.sw__search").fill(failedTitle);
        await page.locator(".sw__doc-status--error").waitFor({state: "visible", timeout: 30000});
        const failedMs = (await page.evaluate(() => performance.now())) - failedStarted;
        await closeSwitcher(page);
        await page.unroute("**/api/filetree/searchDocs", failRoute);
        await page.unroute("**/api/search/fullTextSearchBlock", failRoute);
        await page.unroute("**/api/search/semanticSearchBlock", failRoute);

        const report = {
            filter: summarizeSamples(filterSamples),
            activation: summarizeSamples(activationSamples),
            controlledRemote: {slowMs: Math.round(slowMs), failedMs: Math.round(failedMs), sampleCount: 1, p95: null},
            fixture: {seededDocuments: seeded.docs.length, realTabCount: await page.locator(".sw__card").count()},
        };
        console.log("[T-7151] search interaction timing:", JSON.stringify(report));
        expect(report.filter.p50).toBeGreaterThanOrEqual(0);
        expect(report.activation.p50).toBeGreaterThanOrEqual(0);
        expect(pageErrors, `真实例出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
    } finally {
        await client.post("/api/notebook/removeNotebook", {notebook: seeded.notebook}).catch(() => undefined);
    }
});
