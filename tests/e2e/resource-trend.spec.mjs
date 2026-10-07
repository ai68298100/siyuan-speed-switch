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
        const renderListenerRerenders = [];
        let workbenchOpened = 0;
        let storeOpened = 0;

        for (let index = 0; index < CYCLES; index += 1) {
            await openSwitcher(page);
            const search = page.locator("input.sw__search");
            await search.fill(index % 2 === 0 ? "" : "T-7153");
            await page.waitForTimeout(100);
            samples.push(await sampleResourceTrend(page, `switcher-${index + 1}`));
            await page.keyboard.press("Escape");
            await page.locator("input.sw__search").waitFor({state: "detached", timeout: 10000}).catch(() => undefined);

            await page.evaluate(() => {
                const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item?.name === "siyuan-speed-switch");
                plugin?.openPlatformSurface?.("workbench");
            });
            const workbench = page.locator('.sw-home[data-sw-surface="workbench"]:visible').first();
            await workbench.waitFor({state: "visible", timeout: 15000});
            workbenchOpened += 1;
            samples.push(await sampleResourceTrend(page, `workbench-${index + 1}`));

            const add = workbench.locator(".sw-home__add").first();
            if (await add.count() && await add.isVisible().catch(() => false)) {
                await add.click();
                const store = page.locator(".sw-home-store:visible").first();
                await store.waitFor({state: "visible", timeout: 15000});
                storeOpened += 1;
                await sampleResourceTrend(page, `store-${index + 1}`).then((sample) => samples.push(sample));
                const beforeRerender = await sampleResourceTrend(page, `store-before-rerender-${index + 1}`);
                samples.push(beforeRerender);
                const catalogCards = store.locator(".sw-home-store__catalog .sw-home-store__card");
                expect(await catalogCards.count(), "商店目录必须有卡片用于触发真实重绘").toBeGreaterThan(0);
                await catalogCards.first().click();
                await page.waitForTimeout(80);
                const afterRerender = await sampleResourceTrend(page, `store-after-rerender-${index + 1}`);
                samples.push(afterRerender);
                renderListenerRerenders.push({
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
            samples.push(await sampleResourceTrend(page, `settled-${index + 1}`));
        }

        await settle(page);
        const settled = await sampleResourceTrend(page, "final-settled", {includeListenerBreakdown: true});
        samples.push(settled);
        const report = {
            isolation,
            cycles: CYCLES,
            optionalActions: {workbenchOpened, storeOpened},
            baseline,
            settled,
            delta: delta(baseline, settled),
            samples,
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
        expect(settled.storeRenderListenerActivity.added, "真实商店循环应经过被观测的渲染节点监听").toBeGreaterThan(0);
        expect(settled.storeRenderListenerActivity.active, "商店关闭后显式登记的渲染节点监听必须全部移除").toBe(0);
        expect(await disposeResourceTrendProbe(page)).toBe(true);
    });
});
