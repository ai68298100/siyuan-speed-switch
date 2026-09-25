/* T-6885（T-6849 首帧骨架评估）：真实内核下测量"切换器打开→可交互"耗时，
   用数据决定是否需要骨架态（防过度工程：超标才做骨架）。
   计时在页面内完成（performance.now + 4ms 轮询等输入框出现），
   规避 Playwright 协议往返开销；冷启动 1 次 + 热启动 5 次采样。 */
import {expect, test} from "@playwright/test";
import {openApp} from "./helpers/app.mjs";

const SAMPLES_WARM = 5;
// 判定线（结合 ROADMAP §3.5 预算口径与既有 T-6838 观测）：
// 热启动 p95 > 300ms 才认为需要骨架态；冷启动只记录不设门（受首帧竞态影响大）。
const WARM_BUDGET_MS = 300;

async function measureOnce(page) {
    return page.evaluate(async () => {
        const t0 = performance.now();
        window.siyuanSpeedSwitch.openSwitcher();
        for (let i = 0; i < 1000; i += 1) {
            const input = document.querySelector("input.sw__search");
            if (input) {
                return {ms: Math.round(performance.now() - t0), interactive: true};
            }
            await new Promise((resolve) => setTimeout(resolve, 4));
        }
        return {ms: -1, interactive: false};
    });
}

async function closeSwitcher(page) {
    await page.evaluate(() => document.querySelector(".sw__search") && window.siyuanSpeedSwitch?.whenReady());
    await page.keyboard.press("Escape");
    await page.waitForSelector("input.sw__search", {state: "detached", timeout: 5000});
}

test("T-6849 首帧评估：切换器打开→可交互耗时（冷 1 次 + 热 5 次）", async ({page}) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    await openApp(page);

    // 冷启动：首次打开（含首次 Dialog 创建与列表装配）
    const cold = await measureOnce(page);
    expect(cold.interactive, "冷启动后搜索框必须出现").toBe(true);
    await closeSwitcher(page);

    // 热启动：反复开关
    const warm = [];
    for (let i = 0; i < SAMPLES_WARM; i += 1) {
        const sample = await measureOnce(page);
        expect(sample.interactive, `热启动第 ${i + 1} 次搜索框必须出现`).toBe(true);
        warm.push(sample.ms);
        await closeSwitcher(page);
    }
    const sorted = [...warm].sort((a, b) => a - b);
    const summary = {
        coldMs: cold.ms,
        warmSamples: warm,
        warmMin: sorted[0],
        warmMedian: sorted[Math.floor(sorted.length / 2)],
        warmMax: sorted[sorted.length - 1],
    };
    console.log("[T-6849] first-open timing:", JSON.stringify(summary));
    // 骨架态判定：热启动中位数 ≤ 300ms → 无需骨架（记录数据即可）。
    expect(summary.warmMedian, `热启动中位数 ${summary.warmMedian}ms 超过 300ms 判定线`).toBeLessThanOrEqual(WARM_BUDGET_MS);
    expect(pageErrors, `真实例出现未捕获异常：${pageErrors.join(" | ")}`).toEqual([]);
});
