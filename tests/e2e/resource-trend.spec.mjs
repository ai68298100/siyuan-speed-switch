/* T-7153：真实宿主资源趋势观察。默认跳过，只在隔离编排器中显式启用。 */
import fs from "node:fs/promises";
import {expect, test} from "@playwright/test";
import {
    assertExplicitResourceTrendIsolation,
    disposeResourceTrendProbe,
    installResourceTrendProbe,
    sampleResourceTrend,
} from "./resource-trend.cjs";
import {openApp, openSwitcher} from "./helpers/app.mjs";

const ENABLED = process.env.SWSS_E2E_RESOURCE_TREND === "1";
const CYCLES = Math.max(1, Number.parseInt(process.env.SWSS_E2E_RESOURCE_TREND_CYCLES || "12", 10) || 12);
const LONG_RUN = process.env.SWSS_E2E_RESOURCE_TREND_LONG === "1";
const CHECKPOINT_INTERVAL = Math.max(1, Number.parseInt(process.env.SWSS_E2E_RESOURCE_TREND_CHECKPOINT || "300", 10) || 300);

function isCheckpoint(cycleNumber) {
    return !LONG_RUN || cycleNumber === CYCLES || cycleNumber % CHECKPOINT_INTERVAL === 0;
}

function delta(before, after) {
    if (!before || !after) return null;
    return {
        activeObservedRegistrations: after.listenerActivity.activeObservedRegistrations - before.listenerActivity.activeObservedRegistrations,
        pendingTimers: after.timers.pendingObserved - before.timers.pendingObserved,
        pendingFrames: after.animationFrames.pendingObserved - before.animationFrames.pendingObserved,
        inFlightFetches: after.fetch.inFlightObserved - before.fetch.inFlightObserved,
        elementCount: after.dom.elementCount === null || before.dom.elementCount === null ? null : after.dom.elementCount - before.dom.elementCount,
    };
}

async function settle(page) {
    await page.waitForTimeout(240);
    await page.evaluate(() => Promise.all(document.getAnimations()
        .filter((animation) => animation.effect?.getTiming?.().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))));
}

async function sampleHomeResourceStats(page) {
    return page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
        const stats = plugin?.homeRuntime?.resourceStats;
        if (typeof stats !== "function") return null;
        const value = stats();
        if (!value || typeof value !== "object") return null;
        return Object.fromEntries(Object.entries(value).map(([key, raw]) => [key, Number.isFinite(Number(raw)) ? Number(raw) : null]));
    });
}

async function runProviderLifecycleFixture(page) {
    const installed = await page.evaluate(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
        if (!plugin || typeof plugin.registerHomeModule !== "function" || typeof plugin.readHomeModule !== "function") return null;
        const state = {mode: "success", calls: 0, release: null, unregister: null, pendingRead: null};
        state.unregister = plugin.registerHomeModule({
            moduleId: "e2e-t7153-provider",
            title: "T-7153 fixture",
            supportedDevices: ["desktop"],
            cacheTtlMs: 60000,
            timeoutMs: 1000,
            read: () => {
                state.calls += 1;
                if (state.mode === "pending") return new Promise((resolve) => { state.release = () => resolve({title: "late", items: [{label: "late"}]}); });
                if (state.mode === "failed") return Promise.reject(new Error("fixture_failure"));
                return {title: "ready", items: [{label: "ok"}]};
            },
        });
        window.__t7153Provider = state;
        return {registered: typeof state.unregister === "function"};
    });
    if (!installed?.registered) return {skipped: true, reason: "public provider API unavailable"};

    const read = (options = {}) => page.evaluate(async (readOptions) => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        return plugin.readHomeModule("e2e-t7153-provider", "desktop", {}, {cacheTtlMs: 60000, ...readOptions});
    }, options);
    const first = await read();
    const cached = await read();
    const failed = await page.evaluate(async () => {
        window.__t7153Provider.mode = "failed";
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        return plugin.readHomeModule("e2e-t7153-provider", "desktop", {}, {cacheTtlMs: 0, force: true});
    });
    const backedOff = await read({cacheTtlMs: 0});
    const failedStats = await sampleHomeResourceStats(page);
    const pendingStarted = await page.evaluate(() => {
        window.__t7153Provider.mode = "pending";
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        window.__t7153Provider.pendingRead = plugin.readHomeModule("e2e-t7153-provider", "desktop", {}, {cacheTtlMs: 0, force: true});
        return true;
    });
    await page.waitForFunction(() => Number(window.__t7153Provider?.calls || 0) >= 3 && typeof window.__t7153Provider?.release === "function");
    const beforeUnload = await sampleHomeResourceStats(page);
    await page.evaluate(() => window.__t7153Provider.unregister());
    await page.evaluate(() => window.__t7153Provider.release?.());
    const stale = await page.evaluate(async () => await window.__t7153Provider.pendingRead);
    const afterUnload = await sampleHomeResourceStats(page);
    const replacement = await page.evaluate(() => {
        const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
        window.__t7153Provider.mode = "success";
        window.__t7153Provider.unregister = plugin.registerHomeModule({
            moduleId: "e2e-t7153-provider",
            title: "T-7153 fixture replacement",
            supportedDevices: ["desktop"],
            cacheTtlMs: 60000,
            timeoutMs: 1000,
            read: () => ({title: "replacement", items: [{label: "ok"}]}),
        });
        return typeof window.__t7153Provider.unregister === "function";
    });
    const recovered = await read({force: true});
    const afterRecovery = await sampleHomeResourceStats(page);
    await page.evaluate(() => window.__t7153Provider.unregister());
    const finalStats = await sampleHomeResourceStats(page);
    await page.evaluate(() => { delete window.__t7153Provider; });
    return {first, cached, failed, backedOff, failedStats, pendingStarted, beforeUnload, stale, afterUnload, replacement, recovered, afterRecovery, finalStats};
}

test.describe("T-7153 真实宿主资源趋势", () => {
    test.describe.configure({retries: 0});
    test.skip(!ENABLED, "资源趋势必须显式设置 SWSS_E2E_RESOURCE_TREND=1 才运行");

    test("商店重绘时释放旧渲染监听并在关闭后归零", async ({page}, testInfo) => {
        test.slow();
        // 商店预览每轮会等待真实宿主异步资源；让压力轮数可扩展而不把
        // 测试超时误报成页面资源问题。
        test.setTimeout(Math.max(180000, CYCLES * 12000 + 60000));
        const isolation = assertExplicitResourceTrendIsolation();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));

        // init script 先于真实思源文档安装；随后再取一次当前页样本作为基线。
        await installResourceTrendProbe(page, "about-blank");
        await openApp(page);
        const baseline = await sampleResourceTrend(page, "baseline", {includeListenerBreakdown: true});
        expect(baseline).toBeTruthy();
        const samples = [baseline];
        const homeResourceSamples = [{label: "baseline", stats: await sampleHomeResourceStats(page)}];
        expect(homeResourceSamples[0].stats, "必须能读取插件自有缓存的受限计数").toBeTruthy();
        const providerLifecycle = await runProviderLifecycleFixture(page);
        expect(providerLifecycle.skipped, "必须通过公开 home provider API 覆盖卸载/失败重试").not.toBe(true);
        expect(providerLifecycle.first?.ok).toBe(true);
        expect(providerLifecycle.cached?.cached).toBe(true);
        expect(providerLifecycle.failed?.ok).toBe(false);
        expect(providerLifecycle.backedOff?.reason).toBe("backoff");
        expect(providerLifecycle.stale?.reason).toBe("stale");
        expect(providerLifecycle.afterUnload?.snapshotCacheEntries).toBe(0);
        expect(providerLifecycle.afterUnload?.failureBackoffEntries).toBe(0);
        expect(providerLifecycle.afterUnload?.inFlightReads).toBe(0);
        expect(providerLifecycle.replacement).toBe(true);
        expect(providerLifecycle.recovered?.ok).toBe(true);
        expect(providerLifecycle.finalStats?.snapshotCacheEntries).toBe(0);
        expect(providerLifecycle.finalStats?.failureBackoffEntries).toBe(0);
        expect(providerLifecycle.finalStats?.inFlightReads).toBe(0);
        expect(providerLifecycle.finalStats?.readGenerationEntries).toBe(0);
        expect(providerLifecycle.finalStats?.invalidatedReadGenerationEntries).toBe(0);
        const renderListenerRerenders = [];
        let workbenchOpened = 0;
        let storeOpened = 0;
        const checkpointPath = testInfo.outputPath("resource-trend-checkpoints.ndjson");
        await fs.writeFile(checkpointPath, "", "utf8");
        let checkpointCount = 0;

        for (let index = 0; index < CYCLES; index += 1) {
            const cycleNumber = index + 1;
            const checkpoint = isCheckpoint(cycleNumber);
            await openSwitcher(page);
            const search = page.locator("input.sw__search");
            await search.fill(index % 2 === 0 ? "" : "T-7153");
            await page.waitForTimeout(100);
            const switcherSample = await sampleResourceTrend(page, `switcher-${cycleNumber}`);
            if (checkpoint) samples.push(switcherSample);
            await page.keyboard.press("Escape");
            await page.locator("input.sw__search").waitFor({state: "detached", timeout: 10000}).catch(() => undefined);

            await page.evaluate(() => {
                const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
                plugin?.openPlatformSurface?.("workbench");
            });
            const workbench = page.locator('.sw-home[data-sw-surface="workbench"]:visible').first();
            await workbench.waitFor({state: "visible", timeout: 15000});
            workbenchOpened += 1;
            const workbenchSample = await sampleResourceTrend(page, `workbench-${cycleNumber}`);
            if (checkpoint) samples.push(workbenchSample);

            const add = workbench.locator(".sw-home__add").first();
            if (await add.count() && await add.isVisible().catch(() => false)) {
                await add.click();
                const store = page.locator(".sw-home-store:visible").first();
                await store.waitFor({state: "visible", timeout: 15000});
                storeOpened += 1;
                const storeSample = await sampleResourceTrend(page, `store-${cycleNumber}`);
                if (checkpoint) samples.push(storeSample);
                const beforeRerender = await sampleResourceTrend(page, `store-before-rerender-${cycleNumber}`);
                if (checkpoint) samples.push(beforeRerender);
                const catalogCards = store.locator(".sw-home-store__catalog .sw-home-store__card");
                expect(await catalogCards.count(), "商店目录必须有卡片用于触发真实重绘").toBeGreaterThan(0);
                await catalogCards.first().click();
                await page.waitForTimeout(80);
                const afterRerender = await sampleResourceTrend(page, `store-after-rerender-${cycleNumber}`);
                if (checkpoint) samples.push(afterRerender);
                if (checkpoint) renderListenerRerenders.push({
                    label: afterRerender.label,
                    removedBefore: beforeRerender.storeRenderListenerActivity.removed,
                    removedAfter: afterRerender.storeRenderListenerActivity.removed,
                });
                expect(
                    afterRerender.storeRenderListenerActivity.removed,
                    "商店每次真实重绘前必须显式移除上一轮渲染监听",
                ).toBeGreaterThan(beforeRerender.storeRenderListenerActivity.removed);
                await page.keyboard.press("Escape");
                await store.waitFor({state: "detached", timeout: 10000}).catch(() => undefined);
            }
            await page.keyboard.press("Escape");
            await settle(page);
            const settledSample = await sampleResourceTrend(page, `settled-${cycleNumber}`, {
                includeListenerBreakdown: checkpoint,
            });
            const settledHomeStats = await sampleHomeResourceStats(page);
            if (checkpoint) {
                samples.push(settledSample);
                homeResourceSamples.push({label: `settled-${cycleNumber}`, stats: settledHomeStats});
                checkpointCount += 1;
                await fs.appendFile(checkpointPath, `${JSON.stringify({cycle: cycleNumber, sample: settledSample, homeStats: settledHomeStats})}\n`, "utf8");
            }
        }

        await settle(page);
        const settled = await sampleResourceTrend(page, "final-settled", {includeListenerBreakdown: true});
        samples.push(settled);
        homeResourceSamples.push({label: "final-settled", stats: await sampleHomeResourceStats(page)});
        const settledHomeResourceSamples = homeResourceSamples.filter((item) => item.stats && /^settled-/.test(item.label));
        const settledCacheCounts = settledHomeResourceSamples.map((item) => item.stats.snapshotCacheEntries).filter(Number.isFinite);
        const settledGenerationCounts = settledHomeResourceSamples.map((item) => item.stats.readGenerationEntries).filter(Number.isFinite);
        const report = {
            isolation,
            cycles: CYCLES,
            checkpointInterval: LONG_RUN ? CHECKPOINT_INTERVAL : null,
            checkpointCount,
            checkpointFile: LONG_RUN ? "resource-trend-checkpoints.ndjson" : null,
            optionalActions: {workbenchOpened, storeOpened},
            baseline,
            settled,
            delta: delta(baseline, settled),
            samples,
            homeResourceSamples,
            providerLifecycle,
            homeResourceTrend: {
                settledCacheCounts,
                settledGenerationCounts,
                cacheRange: settledCacheCounts.length ? Math.max(...settledCacheCounts) - Math.min(...settledCacheCounts) : null,
                generationRange: settledGenerationCounts.length ? Math.max(...settledGenerationCounts) - Math.min(...settledGenerationCounts) : null,
            },
            renderListenerRerenders,
            storeRenderListenerActivity: settled.storeRenderListenerActivity,
            pageErrors,
            evidenceBoundary: "Observed browser registrations and pending work only; the explicit add/remove counter for sw-home-store__ render nodes must settle at zero, but this is not a proof of overall leak absence.",
        };
        const reportPath = testInfo.outputPath("resource-trend.json");
        await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        console.log("[T-7153] isolated resource trend:", JSON.stringify(report));

        expect(pageErrors, `资源趋势循环出现未捕获页面异常：${pageErrors.join(" | ")}`).toEqual([]);
        expect(Number.isFinite(settled.fetch.inFlightObserved)).toBe(true);
        expect(Number.isFinite(settled.timers.pendingObserved)).toBe(true);
        expect(Number.isFinite(settled.animationFrames.pendingObserved)).toBe(true);
        expect(settled.fetch.inFlightObserved, "最终样本不应残留已观察到的 fetch 请求").toBe(0);
        expect(settledHomeResourceSamples.length).toBeGreaterThan(LONG_RUN ? 0 : 2);
        expect(settledHomeResourceSamples.every((item) => item.stats.inFlightReads === 0), "面板稳定后不应残留 provider 读取").toBe(true);
        if (settledCacheCounts.length > 1) {
            expect(settledCacheCounts.at(-1), "缓存计数不应在重复稳定轮次中持续增长").toBeLessThanOrEqual(Math.max(...settledCacheCounts.slice(0, -1)) + 4);
        }
        if (settledGenerationCounts.length > 1) {
            expect(settledGenerationCounts.at(-1), "provider generation 计数不应在重复稳定轮次中持续增长").toBeLessThanOrEqual(Math.max(...settledGenerationCounts.slice(0, -1)) + 4);
        }
        expect(settled.storeRenderListenerActivity.added, "真实商店循环应经过被观测的渲染节点监听").toBeGreaterThan(0);
        expect(settled.storeRenderListenerActivity.active, "商店关闭后显式登记的渲染节点监听必须全部移除").toBe(0);
        expect(await disposeResourceTrendProbe(page)).toBe(true);
    });
});
