import {expect, test} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {openApp, openSwitcher} from "./helpers/app.mjs";

test("document preview adapts its frame and keeps the header outside body scrolling", async ({page}) => {
    await openApp(page);
    await openSwitcher(page);
    // Use the actual installed stylesheet and a bounded fixture, without changing user documents.
    await page.locator(".sw__scroll").first().evaluate(scroll => {
        scroll.innerHTML = '<div class="sw__doc-results sw--with-preview"><div class="sw__window-label">Documents</div>'
            + '<div class="sw__doc-grid"><button class="sw__doc-item">A document</button></div>'
            + '<aside class="sw__doc-preview"><div class="sw__doc-preview-header">Document preview</div>'
            + '<div tabindex="0" class="sw__doc-preview-body"><h3 class="sw__doc-preview-title">A long document title</h3>'
            + '<p class="sw__doc-preview-block">Readable document content. </p>'.repeat(60) + '</div></aside></div>';
    });
    const scroll = page.locator(".sw__scroll").first();
    const pane = scroll.locator(".sw__doc-preview");
    for (const theme of ["light", "dark"]) {
        await page.evaluate(theme => document.documentElement.setAttribute("data-theme-mode", theme), theme);
        for (const width of [1300, 960, 680, 600, 390]) {
            await scroll.evaluate((element, width) => {element.style.width = `${width}px`;}, width);
            if (width < 680) {
                await expect(pane).toBeHidden();
                continue;
            }
            await expect(pane).toBeVisible();
            const metrics = await pane.evaluate(element => {
                const style = getComputedStyle(element);
                const body = element.querySelector(".sw__doc-preview-body");
                const header = element.querySelector(".sw__doc-preview-header");
                const before = header.getBoundingClientRect().top;
                body.scrollTop = 150;
                return {width: parseFloat(style.width), containerWidth: element.parentElement.clientWidth,
                    height: parseFloat(style.height), borders: [style.borderTopWidth, style.borderRightWidth,
                    style.borderBottomWidth, style.borderLeftWidth], radius: style.borderTopLeftRadius,
                    font: getComputedStyle(body.querySelector("p")).fontSize,
                    scroll: body.scrollTop, headerShift: header.getBoundingClientRect().top - before,
                    overflow: element.parentElement.scrollWidth > element.parentElement.clientWidth + 1};
            });
            expect(metrics.width).toBeCloseTo(Math.max(280, Math.min(480, metrics.containerWidth * .34)), 0);
            expect(metrics.height).toBeGreaterThan(400);
            expect(metrics.borders).toEqual(["1px", "1px", "1px", "1px"]);
            expect(metrics.radius).toBe("8px");
            expect(metrics.font).toBe("13px");
            expect(metrics.scroll).toBeGreaterThan(0);
            expect(metrics.headerShift).toBe(0);
            expect(metrics.overflow).toBe(false);
        }
    }
    await scroll.evaluate(element => {element.style.width = "1300px";});
    const body = pane.locator(".sw__doc-preview-body");
    await body.evaluate(element => {element.scrollTop = 0;});
    await body.focus();
    await expect(pane).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.setViewportSize({width: 1440, height: 500});
    await scroll.evaluate(element => {element.style.height = "240px"; element.style.flex = "none";});
    await expect(pane).toBeVisible();
    await expect.poll(() => pane.evaluate(element => {
        const scroll = element.closest(".sw__scroll");
        const style = getComputedStyle(scroll);
        const available = scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 48;
        return element.offsetHeight <= available + 1;
    })).toBe(true);
    await scroll.evaluate(element => {element.style.removeProperty("height"); element.style.removeProperty("flex");});
    await page.setViewportSize({width: 1440, height: 900});
    fs.mkdirSync(path.resolve(".artifacts/e2e"), {recursive: true});
    await page.screenshot({path: path.resolve(".artifacts/e2e/doc-preview-layout.png")});
});
