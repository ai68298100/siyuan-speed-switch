import {expect, test} from "@playwright/test";
import {openApp, openSwitcher, artifactPath} from "./helpers/app.mjs";

test("preview keyboard scrolling is not intercepted when tab cards exist", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);
    // Keep the real installed styles and keydown handler; bound only the reading fixture.
    const scroll = page.locator(".sw__scroll").first();
    await scroll.evaluate(element => {
        element.innerHTML = '<div class="sw__grid"><div tabindex="0" class="sw__card sw__focused">Open tab</div></div>'
            + '<div class="sw__doc-results sw--with-preview"><div class="sw__doc-grid"></div>'
            + '<aside class="sw__doc-preview"><div class="sw__doc-preview-header">Preview</div>'
            + '<div tabindex="0" class="sw__doc-preview-body">'
            + '<p class="sw__doc-preview-block">Document reading content.</p>'.repeat(60) + '</div></aside></div>';
    });
    await expect(scroll.locator(".sw__card")).toBeVisible();
    const body = scroll.locator(".sw__doc-preview-body");
    await body.focus();
    for (const key of ["ArrowDown", "PageDown", "End"]) {
        await body.evaluate(element => {element.scrollTop = 0;});
        await page.keyboard.press(key);
        await expect(body).toBeFocused();
        await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    }
    await page.screenshot({path: artifactPath("preview-keyboard-scroll.png")});
});

test("open studio tracks viewport shrink and expansion without losing draft", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);
    await page.locator(".sw__snippet-studio-btn").click();
    const root = page.locator(".sw-snippet-studio-host.sw-studio");
    await expect(root).toBeVisible();
    const editor = root.locator(".sw-studio__editor");
    await editor.fill("body { color: red; }");
    const host = page.locator(".b3-dialog__container.sw-dialog--snippet-studio");
    for (const size of [{width: 1440, height: 900}, {width: 960, height: 720},
        {width: 800, height: 600}, {width: 1440, height: 900}]) {
        await page.setViewportSize(size);
        await page.evaluate(() => Promise.all(document.getAnimations()
            .filter(animation => animation.effect.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {}))));
        await expect(host, "studio width tracks viewport").toHaveCSS("width", `${size.width}px`);
        await expect(host, "studio height tracks viewport").toHaveCSS("height", `${size.height}px`);
        await expect(editor).toHaveValue("body { color: red; }");
        await expect(root.locator(".sw-platform-header__close")).toBeVisible();
        if (size.width === 960) await page.screenshot({path: artifactPath("studio-resize-960.png")});
    }
    await root.locator(".sw-platform-header__close").click();
    const leave = page.locator(".sw-studio__leave");
    await expect(leave).toBeVisible();
    await leave.locator("button").nth(2).click();
    await expect(root).toBeVisible();
    await expect(editor).toHaveValue("body { color: red; }");
    await root.locator(".sw-platform-header__close").click();
    await expect(leave).toBeVisible();
    await leave.locator("button").nth(1).click();
    await expect(root).toHaveCount(0);
});

test("studio narrow toolbar and short AI panel do not overlap", async ({page}) => {
    await page.setViewportSize({width: 960, height: 720});
    await openApp(page);
    await openSwitcher(page);
    await page.locator(".sw__snippet-studio-btn").click();
    const root = page.locator(".sw-snippet-studio-host.sw-studio");
    await expect(root).toBeVisible();
    await root.locator(".sw-studio__editor").fill("body { color: red; }");
    for (const height of [720, 600]) {
        await page.setViewportSize({width: 960, height});
        await page.evaluate(() => Promise.all(document.getAnimations()
            .filter(animation => animation.effect.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => {}))));
        const metrics = await root.evaluate(element => {
            const meta = element.querySelector(".sw-studio__editor-meta").getBoundingClientRect();
            const buttons = [...element.querySelectorAll(".sw-studio__editor-section .sw-studio__section-bar button")];
            const overlaps = buttons.some(button => {
                const box = button.getBoundingClientRect();
                return meta.left < box.right && meta.right > box.left && meta.top < box.bottom && meta.bottom > box.top;
            });
            const empty = element.querySelector(".sw-studio__ai-empty").getBoundingClientRect();
            const apply = element.querySelector(".sw-studio__ai > button:last-child").getBoundingClientRect();
            const lower = element.querySelector(".sw-studio__lower");
            const lowerBox = lower.getBoundingClientRect();
            const hit = document.elementFromPoint(lowerBox.left + 40, lowerBox.top + 16);
            return {overlaps, aiGap: apply.top - empty.bottom, previewCoversDetails: !lower.contains(hit)};
        });
        expect.soft(metrics.overlaps, `toolbar overlap at ${height}px`).toBe(false);
        expect.soft(metrics.aiGap, `AI result/action gap at ${height}px`).toBeGreaterThanOrEqual(0);
        expect.soft(metrics.previewCoversDetails, `preview must not cover details at ${height}px`).toBe(false);
        if (height === 720) {
            const preview = root.locator(".sw-studio__preview-section");
            await preview.evaluate((element) => {element.style.overflow = "visible";});
            const covered = await root.evaluate((element) => {
                const lower = element.querySelector(".sw-studio__lower");
                const box = lower.getBoundingClientRect();
                return !lower.contains(document.elementFromPoint(box.left + 40, box.top + 16));
            });
            expect(covered, "removing the preview scroll boundary must expose the overlap").toBe(true);
            await preview.evaluate((element) => {element.style.removeProperty("overflow");});
        }
        if (height === 720) await page.screenshot({path: artifactPath("studio-resize-960.png")});
    }
});
