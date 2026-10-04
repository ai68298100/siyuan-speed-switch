import {expect, test} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {createClient, openApp, openSwitcher} from "./helpers/app.mjs";

async function openStudio(page) {
    await openApp(page);
    await openSwitcher(page);
    await page.locator(".sw__snippet-studio-btn").click();
    const root = page.locator(".sw-snippet-studio-host.sw-studio");
    await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
    return root;
}

test("真实思源目录元数据支持别名标签置顶且不改原生正文和开关", async ({page}) => {
    const client = createClient();
    const native = {id: `meta-${Date.now()}`, name: "Catalog metadata fixture", type: "css", content: ".metadata-fixture{}", enabled: false, disabledInPublish: false};
    const snapshot = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
    await client.postChecked("/api/snippet/setSnippet", {snippets: [...snapshot.snippets, native]});
    try {
        const root = await openStudio(page);
        await root.getByRole("button", {name: "Choose snippet", exact: true}).click();
        await page.locator(`.sw-studio__catalog-item[data-snippet-id="${native.id}"]`).click();
        await root.locator(".sw-studio__metadata summary").click();
        await root.getByRole("textbox", {name: "Alias", exact: true}).fill("Unique alias fixture");
        await root.getByRole("textbox", {name: "Tags (comma-separated, up to 8)", exact: true}).fill("work, css");
        await root.getByRole("textbox", {name: "Summary", exact: true}).fill("<img src=x onerror=alert(1)>");
        await root.getByRole("checkbox", {name: "Pinned", exact: true}).check();
        await root.getByRole("button", {name: "Choose snippet", exact: true}).click();
        const picker = page.locator(".sw-studio__picker");
        await picker.getByRole("textbox", {name: "Search snippets", exact: true}).fill("Unique alias fixture");
        const item = picker.locator(`.sw-studio__catalog-item[data-snippet-id="${native.id}"]`);
        await expect(item).toContainText("Pinned");
        await expect(item).toContainText("<img src=x onerror=alert(1)>");
        await expect(item.locator("img")).toHaveCount(0);
        const after = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        expect(after.snippets.find((entry) => entry.id === native.id)).toEqual(native);
    } finally {
        const after = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        await client.postChecked("/api/snippet/setSnippet", {snippets: after.snippets.filter((entry) => entry.id !== native.id)});
    }
});

test("真实思源片段商店先只读预览，再经脏稿确认加入草稿", async ({page}) => {
    const root = await openStudio(page);
    const editor = root.locator(".sw-studio__editor");
    await editor.fill(".keep-unsaved{}");
    await root.getByRole("button", {name: "Snippet store", exact: true}).click();
    const picker = page.locator(".sw-studio__picker");
    await picker.getByRole("combobox", {name: "Source", exact: true}).selectOption("builtin");
    await picker.locator(".sw-studio__catalog-item").first().click();
    await expect(editor).toHaveValue(".keep-unsaved{}");
    await expect(picker.locator(".sw-studio__store-canvas iframe")).toHaveAttribute("sandbox", "");
    await expect(picker.locator(".sw-studio__store-preview")).toContainText("MIT");
    const content = await picker.locator(".sw-studio__store-code").textContent();
    await picker.getByRole("button", {name: "Create a disabled draft from this", exact: true}).click();
    const leave = page.locator(".sw-studio__leave");
    await expect(leave).toBeVisible();
    await leave.locator("button").nth(1).click();
    await expect(picker).toHaveCount(0);
    await expect(editor).toHaveValue(content);
    await expect(root.locator(".sw-studio__selection .sw-studio__state-badge")).toContainText("Unsaved");
});

test("真实思源受控 SSE 显示授权失败重试与候选导出，未选代码不出请求", async ({page}) => {
    let requestBody;
    let attempts = 0;
    await page.route("**/api/ai/editor/chat", async (route) => {
        requestBody = route.request().postDataJSON();
        attempts += 1;
        if (attempts === 1) return route.fulfill({status: 403, body: "denied"});
        const body = `event: content\ndata: ${JSON.stringify({token: ".candidate-fixture{}"})}\n\nevent: done\ndata: {"finishReason":"stop"}\n\n`;
        return route.fulfill({status: 200, contentType: "text/event-stream", body});
    });
    const root = await openStudio(page);
    const editor = root.locator(".sw-studio__editor");
    await editor.fill(".private-draft{}");
    await root.locator(".sw-studio__prompt").fill("Create a fixture rule");
    await root.locator(".sw-studio__ai > .sw-studio__consent input").check();
    await root.getByRole("button", {name: "Generate draft", exact: true}).click();
    await expect(root.locator(".sw-studio__ai [role=status]")).toContainText("not authorized");
    expect(JSON.parse(requestBody.input).currentCode).toBe("");
    expect(requestBody.history).toEqual([]);
    await root.getByRole("button", {name: "Retry generation", exact: true}).click();
    await expect(root.getByRole("button", {name: "Export candidate", exact: true})).toBeEnabled();
    await expect(editor).toHaveValue(".private-draft{}");
    const downloaded = page.waitForEvent("download");
    await root.getByRole("button", {name: "Export candidate", exact: true}).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe("candidate.css");
    expect(await readFile(await download.path(), "utf8")).toBe(".candidate-fixture{}");
    await editor.fill(".edited-after-result{}");
    await expect(root.locator(".sw-studio__ai-stale")).toBeVisible();
});

test("真实思源未失焦元数据关闭仍确认，跨字段输入不丢值", async ({page}) => {
    const root = await openStudio(page);
    await root.locator(".sw-studio__metadata summary").click();
    const alias = root.getByRole("textbox", {name: "Alias", exact: true});
    await alias.fill("Unblurred metadata fixture");
    await expect(alias).toBeFocused();
    await root.locator(".sw-platform-header__close").evaluate((button) => button.click());
    const leave = page.locator(".sw-studio__leave");
    await expect(leave).toBeVisible();
    await leave.locator("button").nth(2).click();
    await root.locator(".sw-studio__editor").fill(".retain-live-metadata{}");
    await expect(alias).toHaveValue("Unblurred metadata fixture");
    await root.locator(".sw-platform-header__close").click();
    await page.locator(".sw-studio__leave button").nth(1).click();
    await expect(root).toHaveCount(0);
});

for (const lateConfirmation of [false, true]) {
    test(`真实思源元数据保存失败保留原生 ID，修复通道后同条目重试 (late=${lateConfirmation})`, async ({page}) => {
        const client = createClient();
        const name = `Metadata recovery fixture ${Date.now()}`;
        let settingAttempts = 0;
        if (lateConfirmation) {
            await page.route("**/api/setting/setSnippet", async (route) => {
                settingAttempts += 1;
                if (settingAttempts === 1) return route.fulfill({status: 503, body: "notification unavailable"});
                return route.continue();
            });
        }
        const root = await openStudio(page);
        try {
            await root.getByRole("textbox", {name: "Name", exact: true}).fill(name);
            await root.locator(".sw-studio__editor").fill(".metadata-recovery-fixture{}");
            await root.locator(".sw-studio__metadata summary").click();
            const alias = root.getByRole("textbox", {name: "Alias", exact: true});
            await alias.fill("Pending metadata recovery");
            await page.evaluate(() => {
                const plugin = window.siyuan.ws.app.plugins.find((entry) => entry.name === "siyuan-speed-switch");
                const originalSave = plugin.saveDataDebounced;
                window.__t7098RestoreMetadataSave = () => {
                    plugin.saveDataDebounced = originalSave;
                    delete window.__t7098RestoreMetadataSave;
                };
                plugin.saveDataDebounced = function (key, ...args) {
                    if (key === "sw_snippet_groups") throw new Error("metadata adapter unavailable");
                    return originalSave.call(this, key, ...args);
                };
            });
            await root.locator(".sw-platform-header__close").click();
            await page.locator(".sw-studio__leave button").first().click();
            await expect(root.locator(".sw-studio__status")).toContainText("Save did not complete");
            await expect(root).toBeVisible();
            await expect(alias).toHaveValue("Pending metadata recovery");
            const afterFailure = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
            const saved = afterFailure.snippets.filter((entry) => entry.name === name);
            expect(saved).toHaveLength(1);
            expect(saved[0].enabled).toBe(false);
            await page.evaluate(() => window.__t7098RestoreMetadataSave());
            await root.locator(".sw-platform-header__close").click();
            await expect(page.locator(".sw-studio__leave")).toBeVisible();
            await page.locator(".sw-studio__leave button").first().click();
            await expect(root).toHaveCount(0);
            const afterRetry = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
            const retried = afterRetry.snippets.filter((entry) => entry.name === name);
            expect(retried).toHaveLength(1);
            expect(retried[0].id).toBe(saved[0].id);
            if (lateConfirmation) expect(settingAttempts).toBeGreaterThanOrEqual(2);
            await page.evaluate(() => window.siyuan.ws.app.plugins
                .find((entry) => entry.name === "siyuan-speed-switch").flushPendingSaves());
            const reopened = await openStudio(page);
            await reopened.getByRole("button", {name: "Choose snippet", exact: true}).click();
            const picker = page.locator(".sw-studio__picker");
            await picker.getByRole("textbox", {name: "Search snippets", exact: true}).fill("Pending metadata recovery");
            await expect(picker.locator(`.sw-studio__catalog-item[data-snippet-id="${saved[0].id}"]`)).toBeVisible();
        } finally {
            await page.evaluate(() => window.__t7098RestoreMetadataSave?.());
            const snapshot = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
            await client.postChecked("/api/snippet/setSnippet", {snippets: snapshot.snippets.filter((entry) => entry.name !== name)});
        }
    });
}
