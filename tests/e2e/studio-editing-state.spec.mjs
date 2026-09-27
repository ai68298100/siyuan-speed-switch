import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, createClient} from "./helpers/app.mjs";

async function openStudio(page) {
    await openApp(page);
    await openSwitcher(page);
    await page.locator(".sw__snippet-studio-btn").click();
    const root = page.locator(".sw-snippet-studio-host.sw-studio");
    await expect(root).toBeVisible();
    await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
    return root;
}

test("studio unsaved state follows edits, save and exact reversion", async ({page}) => {
    const root = await openStudio(page);
    const client = createClient();
    const name = `studio-editing-e2e-${Date.now()}`;
    const badge = root.locator(".sw-studio__header-actions .sw-studio__state-badge");
    const selection = root.locator(".sw-studio__selection .sw-studio__state-badge");
    const editor = root.locator(".sw-studio__editor");
    const nameInput = root.locator(".sw-studio__details input");
    try {
        await expect(badge).toHaveText("Draft");
        await nameInput.fill(name);
        await expect(badge).toHaveText("Unsaved changes");
        await expect(selection).toHaveText("Unsaved changes");
        await expect(badge).toHaveAttribute("aria-live", "polite");
        await editor.fill("body { color: red; }");
        await page.route("**/api/snippet/setSnippet", route => route.fulfill({
            status: 200, contentType: "application/json", body: JSON.stringify({code: -1, msg: "save rejected"}),
        }));
        await root.getByRole("button", {name: "Save draft", exact: true}).click();
        await expect(root.locator(".sw-studio__status")).toHaveAttribute("data-state", "error");
        await expect(badge).toHaveText("Unsaved changes");
        await expect(editor).toHaveValue("body { color: red; }");
        await page.unroute("**/api/snippet/setSnippet");
        await root.getByRole("button", {name: "Save draft", exact: true}).click();
        await expect(root.locator(".sw-studio__status")).toHaveText("Saved");
        await expect(badge).toHaveText("Disabled");
        const stored = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        expect(stored.snippets.find(item => item.name === name)?.enabled).toBe(false);
        await editor.fill("body { color: blue; }");
        await expect(badge).toHaveText("Unsaved changes");
        await editor.fill("body { color: red; }");
        await expect(badge).toHaveText("Disabled");
        await nameInput.fill(`${name}-edited`);
        await expect(badge).toHaveText("Unsaved changes");
        await nameInput.fill(name);
        await expect(selection).toHaveText("Disabled");
    } finally {
        // Only remove this test's disabled snippet from the isolated workspace.
        const stored = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        const snippets = stored.snippets.filter(item => item.name !== name);
        if (snippets.length !== stored.snippets.length) {
            await client.postChecked("/api/snippet/setSnippet", {snippets});
        }
    }
});

test("studio save stays reachable while details scroll and safety boundaries remain", async ({page}) => {
    const root = await openStudio(page);
    const save = root.getByRole("button", {name: "Save draft", exact: true});
    await root.locator(".sw-studio__details input").fill("Layout-only draft");
    await root.locator(".sw-studio__editor").fill("body { color: red; }");
    for (const size of [{width: 1440, height: 900}, {width: 960, height: 600}, {width: 800, height: 600}]) {
        await page.setViewportSize(size);
        await page.evaluate(() => Promise.all(document.getAnimations()
            .filter(animation => animation.effect.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {}))));
        await expect(root.locator(".sw-studio__footer").getByRole("button", {name: "Save draft", exact: true}),
            "save belongs to the persistent footer").toHaveCount(1);
        await root.locator(".sw-studio__details").evaluate(element => {element.scrollTop = element.scrollHeight;});
        await expect(save).toBeEnabled();
        await expect.soft(save, `save is fully visible at ${size.width}px`).toBeInViewport({ratio: 1});
        const order = await root.locator(".sw-studio__details").evaluate(element => {
            const name = element.querySelector("input");
            const capabilities = element.querySelector(".sw-studio__capabilities");
            return Boolean(name.compareDocumentPosition(capabilities) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        expect.soft(order, "name editing precedes safety notes").toBe(true);
        await expect(root.locator(".sw-studio__capability")).toHaveCount(5);
    }
    await page.setViewportSize({width: 960, height: 720});
    await root.locator(".sw-studio__details").evaluate(element => {element.scrollTop = 0;});
    await root.locator(".sw-studio__layout").evaluate(element => {element.scrollTop = 0;});
    await page.screenshot({path: ".artifacts/e2e/studio-editing-footer.png"});
});
