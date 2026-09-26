/* UI 审查截图工具（T-审查轮）：SWSS_AUDIT=1 时随 E2E 套件运行，
   对真实内核的切换器各状态截屏到 .tmp/audit/，供人工/视觉审查。
   常规 `pnpm run test:e2e` 不带该环境变量时整文件跳过，零开销。 */
import {test} from "@playwright/test";
import {openApp, openSwitcher, createClient, appURL} from "./helpers/app.mjs";
import fs from "node:fs";
import path from "node:path";

const enabled = process.env.SWSS_AUDIT === "1";
const outDir = path.resolve(import.meta.dirname, "..", "..", ".tmp", "audit");

async function seedAuditDocs(client) {
    const name = `速切审查素材-${String(Date.now()).slice(-6)}`;
    const created = await client.postChecked("/api/notebook/createNotebook", {name});
    const notebookId = String(created.notebook?.id || created.notebook || "");
    const seed = async (title, markdown) => client.postChecked("/api/filetree/createDocWithMd", {
        notebook: notebookId, path: `/${title}`, markdown,
    });
    await seed("项目复盘会议纪要", "# 项目复盘会议纪要\n\n## 背景与目标\n\n本季度围绕检索与导航完成了一轮完整重构，覆盖排序诊断、结果锚定与预览能力。\n\n## 关键结论\n\n搜索命中率提升明显，键盘链路打通后平均切换耗时下降。\n\n## 下一步计划\n\n继续打磨预览窗格与移动端体验，补齐真机验收证据。");
    await seed("周报 2026-09-25", "# 周报\n\n本周完成发版两个、修复若干；下周聚焦性能与 UI 审查轮。\n\n- 发版 v0.35.0 / v0.36.0\n- 键盘链路收口\n- 预览窗格上线");
    await seed("架构决策记录模板", "# 架构决策记录\n\n## 背景\n\n## 取舍\n\n## 后果\n\n正文段落用于验证摘要截断效果：这是一段较长的说明文本，用来检查预览窗格在多段落文档下的首段投影是否保持在预算内且展示完整。");
    return {notebookId};
}

test("UI 审查截图集", async ({page}) => {
    test.skip(!enabled, "SWSS_AUDIT=1 时才运行");
    test.setTimeout(120000);
    fs.mkdirSync(outDir, {recursive: true});
    const client = createClient();
    await seedAuditDocs(client);

    const shot = async (name) => page.screenshot({path: path.join(outDir, `${name}.png`), fullPage: false});

    await openApp(page);
    await openSwitcher(page);
    await page.waitForTimeout(1200);
    await shot("01-desktop-empty");

    const search = page.locator("input.sw__search");
    await search.fill("复盘");
    await page.waitForSelector(".sw__doc-item", {timeout: 30000});
    await page.waitForTimeout(600);
    await shot("02-desktop-results");

    await page.locator(".sw__doc-grid .sw__doc-item").first().focus();
    await page.waitForTimeout(1200);
    await shot("03-desktop-preview-focus");

    await page.locator(".sw__doc-grid .sw__doc-item").nth(1).focus();
    await page.waitForTimeout(1200);
    await shot("04-desktop-preview-second");

    await search.fill(">");
    await page.waitForTimeout(900);
    await shot("05-desktop-command");

    await search.fill("");
    await page.waitForTimeout(600);
    // 筛选菜单（筛选按钮在结果区头部；若存在则展开截图）
    const filterBtn = page.locator(".sw__search-chips button, .sw__doc-filter-trigger").first();
    if (await filterBtn.count()) {
        await filterBtn.click().catch(() => undefined);
        await page.waitForTimeout(500);
        await shot("06-desktop-filter");
    }

    // 移动端前端截图（手机视口）
    const context = page.context();
    const mobilePage = await context.newPage();
    await mobilePage.setViewportSize({width: 390, height: 844});
    await mobilePage.goto(appURL({bundle: "mobile"}), {waitUntil: "domcontentloaded"});
    await mobilePage.waitForFunction(() => {
        const plugins = window.siyuan?.ws?.app?.plugins;
        return Array.isArray(plugins) && plugins.some((plugin) => plugin?.name === "siyuan-speed-switch");
    }, undefined, {timeout: 45000}).catch(() => undefined);
    await mobilePage.waitForTimeout(1500);
    await mobilePage.screenshot({path: path.join(outDir, "07-mobile-front.png")});
    const ball = mobilePage.locator("#swFloatingBall, [class*='sw-ball'], [id*='sw-ball']").first();
    if (await ball.count()) {
        await ball.click({force: true}).catch(() => undefined);
        await mobilePage.waitForTimeout(900);
        await mobilePage.screenshot({path: path.join(outDir, "08-mobile-switcher.png")});
    }
    await mobilePage.close();

    // T-6888 审查扩展：统一 UI 战役新表面。每步独立 try/catch（单步失败不阻断其余截图）；
    // 思源设置弹窗关闭按钮为 fn__none，统一用 Esc 关闭（工作室为 disableClose，用 destroy）。
    const step = async (name, fn) => {
        try {
            await fn();
        } catch (error) {
            console.log(`[audit] step ${name} skipped: ${String(error.message || error).slice(0, 120)}`);
            await page.keyboard.press("Escape").catch(() => undefined);
            await page.waitForTimeout(300);
        }
    };
    const closeLastDialog = () => page.evaluate(() => {
        const dialogs = document.querySelectorAll(".b3-dialog__close");
        dialogs[dialogs.length - 1]?.click();
    });

    // 设置页：外观（分组卡片）+ 悬浮球（快滑绑定卡片）——思源设置用 Esc 关闭。
    await step("09/10 settings", async () => {
        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            plugin.openSetting();
        });
        await page.waitForSelector(".sw-settings__tabs", {timeout: 10000});
        await page.locator('.sw-settings__tab[data-panel="appearance"]').click();
        await page.waitForTimeout(700);
        await shot("09-settings-appearance");
        await page.locator('.sw-settings__tab[data-panel="floatingBall"]').click();
        await page.waitForTimeout(700);
        await shot("10-settings-floating-ball");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
    });

    // 工作台（回执条 + 组件卡）。
    await step("11 workbench", async () => {
        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            const command = (plugin.commands || []).find((item) => item?.langKey === "secondPanel");
            if (command?.callback) command.callback();
            else plugin.openSecondPanel?.();
        });
        await page.waitForSelector(".sw-home__cell, .sw-home__receipt", {timeout: 10000});
        await page.waitForTimeout(1200);
        await shot("11-workbench");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
    });

    // 快速捕获。
    await step("12 quick capture", async () => {
        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            plugin.openQuickCapture();
        });
        await page.waitForSelector(".sw-quick-capture", {timeout: 10000});
        await page.waitForTimeout(400);
        await shot("12-quick-capture");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
    });

    // 片段实验室（全屏工作室，disableClose：截图后直接 destroy）。
    await step("13 snippet studio", async () => {
        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            plugin.openSnippetStudio();
        });
        await page.waitForSelector(".sw-studio__layout, .sw-studio", {timeout: 30000});
        await page.waitForTimeout(1500);
        await shot("13-snippet-studio");
        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            plugin.snippetStudioDialog?.destroy();
        });
        await page.waitForTimeout(400);
    });

    // 查询态片段分区（需工作区已有片段数据，无则整步跳过）。
    await step("14 query snippet section", async () => {
        await page.evaluate(() => {
            const plugin = window.siyuan.ws.app.plugins.find((item) => item?.name === "siyuan-speed-switch");
            plugin.snippetObjectsCache = null;
        });
        await openSwitcher(page);
        await page.waitForTimeout(500);
        await search.fill("阴影");
        await page.waitForTimeout(1200);
        if (await page.locator(".sw__snippet-results").count()) await shot("14-query-snippet-section");
    });

console.log(`[audit] screenshots written to ${outDir}`);
});
