import {expect, test} from "@playwright/test";
import {createClient, openApp, openSwitcher} from "./helpers/app.mjs";

test("片段分组在真实思源中支持建组、拖放、折叠和平铺偏好", async ({page}, testInfo) => {
    const client = createClient();
    const name = `groups-e2e-${Date.now()}`;
    const stored = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
    const original = Array.isArray(stored.snippets) ? stored.snippets : [];
    const seeded = {
        id: `${Date.now()}-groupse2e`,
        name,
        type: "css",
        content: ".groups-e2e { color: red; }",
        enabled: false,
        disabledInPublish: false,
    };
    await client.postChecked("/api/snippet/setSnippet", {snippets: [...original, seeded]});
    let picker;
    let groupId = "";
    try {
        await openApp(page);
        await openSwitcher(page);
        await page.locator(".sw__snippet-studio-btn").click();
        const root = page.locator(".sw-snippet-studio-host.sw-studio");
        await expect(root.locator(".sw-studio__layout")).toHaveAttribute("aria-busy", "false");
        await root.getByRole("button", {name: "Choose snippet", exact: true}).click();
        picker = page.locator(".sw-studio__picker");
        await expect(picker).toBeVisible();
        page.once("dialog", (dialog) => dialog.accept(name));
        await picker.getByRole("button", {name: "New group", exact: true}).click();
        const group = picker.locator(".sw-studio__group").filter({hasText: name}).first();
        await expect(group).toBeVisible();
        groupId = await group.getAttribute("data-group-id");
        await picker.getByRole("textbox", {name: "Search snippets", exact: true}).fill(name);
        const item = picker.locator(`.sw-studio__catalog-item[data-snippet-id="${seeded.id}"]`);
        await expect(item).toHaveAttribute("draggable", "true");
        await picker.evaluate((element) => {
            window.snippetGroupDragEvents = [];
            for (const type of ["dragstart", "dragover", "drop", "dragend"]) {
                element.addEventListener(type, (event) => {
                    window.snippetGroupDragEvents.push({type, target: event.target.className, prevented: event.defaultPrevented, data: event.dataTransfer?.getData("text/plain"), types: Array.from(event.dataTransfer?.types || [])});
                });
            }
        });
        await page.evaluate(({sourceSelector, targetSelector}) => {
            const source = document.querySelector(sourceSelector);
            const target = document.querySelector(targetSelector);
            if (!source || !target) throw new Error("snippet group drag source or target is missing");
            const dataTransfer = new DataTransfer();
            dataTransfer.effectAllowed = "move";
            dataTransfer.setData("text/plain", source.dataset.snippetId || "");
            source.dispatchEvent(new DragEvent("dragstart", {bubbles: true, cancelable: true, dataTransfer}));
            target.dispatchEvent(new DragEvent("dragenter", {bubbles: true, cancelable: true, dataTransfer}));
            target.dispatchEvent(new DragEvent("dragover", {bubbles: true, cancelable: true, dataTransfer}));
            target.dispatchEvent(new DragEvent("drop", {bubbles: true, cancelable: true, dataTransfer}));
            source.dispatchEvent(new DragEvent("dragend", {bubbles: true, cancelable: true, dataTransfer}));
        }, {
            sourceSelector: `.sw-studio__catalog-item[data-snippet-id="${seeded.id}"]`,
            targetSelector: `[data-group-id="${groupId}"] .sw-studio__group-items`,
        });
        await expect(group.locator(`.sw-studio__group-items [data-snippet-id="${seeded.id}"]`)).toHaveCount(1);

        const toggle = group.locator(".sw-studio__group-toggle");
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        const view = picker.getByRole("combobox", {name: "Group view", exact: true});
        await view.selectOption("flat");
        await expect(view).toHaveValue("flat");
        await expect(picker.locator(`.sw-studio__catalog-item[data-snippet-id="${seeded.id}"] .sw-studio__group-item-label`)).toHaveText(name);
    } finally {
        if (testInfo.status !== testInfo.expectedStatus) {
            const events = await page.evaluate(() => window.snippetGroupDragEvents || []).catch(() => []);
            await testInfo.attach("drag-events", {body: JSON.stringify(events, null, 2), contentType: "application/json"});
        }
        if (picker && groupId) {
            const view = picker.getByRole("combobox", {name: "Group view", exact: true});
            if (await view.count() && await view.inputValue() === "flat") await view.selectOption("tree");
            const group = picker.locator(`[data-group-id="${groupId}"]`);
            if (await group.count()) {
                page.once("dialog", (dialog) => dialog.accept());
                await group.getByRole("button", {name: `Delete group: ${name}`, exact: true}).click({timeout: 3000}).catch(() => undefined);
            }
        }
        const after = await client.postChecked("/api/snippet/getSnippet", {type: "all", enabled: 2});
        const keep = (Array.isArray(after.snippets) ? after.snippets : []).filter((item) => item.id !== seeded.id);
        await client.postChecked("/api/snippet/setSnippet", {snippets: keep});
    }
});
