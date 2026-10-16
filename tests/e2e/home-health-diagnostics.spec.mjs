import {expect, test} from "@playwright/test";
import {artifactPath, openApp} from "./helpers/app.mjs";

const MODULE_ID = "e2e-health-diagnostics";
const PRIVATE_TITLE = "private-title diary-secret@example.test D:/Personal/Diary";
const PRIVATE_INSTANCE = "private-instance-personal-secret";
const PRIVATE_REASON = "private-reason https://private.example.test/token D:/Personal/Diary diary-secret@example.test";

async function openStaleHealthDetails(page, clipboardMode = "pending") {
    // The real isolated kernel and installed plugin remain in use. Provider reads,
    // saved layout and clipboard writes are replaced only inside this test page.
    await page.route(/^https?:\/\//, route => {
        const hostname = new URL(route.request().url()).hostname;
        return ["127.0.0.1", "localhost", "::1"].includes(hostname) ? route.continue() : route.abort();
    });
    await openApp(page);
    const labels = await page.evaluate(({moduleId, title, instanceId, reason, clipboardMode}) => {
        const plugin = window.siyuan.ws.app.plugins.find(item => item.name === "siyuan-speed-switch");
        plugin.getSettings = () => ({homeSizeMode: "fullscreen", panelSizeMode: "fullscreen"});
        plugin.saveDataDebounced = () => {};
        plugin.saveHomeState = () => {};
        const fixture = window.__homeHealthDiagnostics = {mode: "ready", calls: [], settle: null, reads: 0};
        Object.defineProperty(navigator, "clipboard", {configurable: true, value: {
            writeText(value) {
                fixture.calls.push(value);
                return clipboardMode === "reject" ? Promise.reject(new DOMException("Denied", "NotAllowedError"))
                    : new Promise(resolve => {fixture.settle = resolve;});
            },
        }});
        plugin.homeRuntime.registerAdapter({
            moduleId, title, supportedDevices: ["desktop"], sizes: ["small"],
            read: () => ({items: [{label: "Retained fixture content"}]}),
        });
        plugin.homeThirdPartyIds.add(moduleId);
        const snapshot = {items: [{label: "Retained fixture content"}], updatedAt: Date.now()};
        plugin.homeRuntime.read = id => {
            if (id !== moduleId) return Promise.resolve({ok: false, reason: "unregistered"});
            fixture.reads += 1;
            return Promise.resolve(fixture.mode === "ready"
                ? {ok: true, snapshot}
                : {ok: false, reason, snapshot});
        };
        plugin.getHomeState = () => ({schemaVersion: 1, defaultsVersion: 2,
            instances: [{instanceId, moduleId, enabled: true, config: {}}],
            layouts: {desktop: [{instanceId, x: 0, y: 0, w: 4, h: 1, size: "small", collapsed: false}], sidebar: [], mobile: []},
        });
        plugin.commands.find(command => command.langKey === "secondPanel").callback();
        return {
            cancel: plugin.i18n.cancel,
            back: plugin.i18n.homeHealthBack,
            copied: plugin.i18n.homeHealthCopied,
            copyFailed: plugin.i18n.homeHealthCopyFailed,
            status: plugin.i18n.homeHealthStatus,
            stale: plugin.i18n.homeHealthStale,
            evidenceHint: plugin.i18n.homeHealthEvidenceHint,
        };
    }, {moduleId: MODULE_ID, title: PRIVATE_TITLE, instanceId: PRIVATE_INSTANCE, reason: PRIVATE_REASON, clipboardMode});
    const workbench = page.locator(".sw-home");
    const cell = workbench.locator(`.sw-home__cell[data-module-id="${MODULE_ID}"]`);
    await expect(cell).toHaveAttribute("data-sw-health", "ok");
    await page.evaluate(() => {window.__homeHealthDiagnostics.mode = "failed";});
    await workbench.locator(".sw-home__refresh").click();
    await expect(cell).toHaveAttribute("data-sw-health", "stale");
    await expect(cell).toContainText("Retained fixture content");
    const receiptDetails = workbench.locator(".sw-home__receipt-details");
    await receiptDetails.click();
    const details = page.locator(".sw-home-health");
    await expect(details).toBeVisible();
    const row = details.locator(".sw-home-health__row--stale");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(PRIVATE_TITLE);
    const opener = row.locator(".sw-home-health__actions button").last();
    return {labels, details, receiptDetails, opener};
}

async function clipboardCalls(page) {
    return page.evaluate(() => window.__homeHealthDiagnostics.calls);
}

test("health diagnostics preview and cancellation keep the clipboard untouched and restore focus", async ({page}) => {
    const {labels, details, receiptDetails, opener} = await openStaleHealthDetails(page);
    await opener.click();
    const preview = page.locator(".sw-home-health__preview");
    const summary = preview.locator("textarea.sw-home-health__summary");
    await expect(preview).toBeVisible();
    await expect(details).toBeHidden();
    await expect(summary).toHaveAttribute("readonly", "");
    await expect(summary).toBeFocused();
    expect(await clipboardCalls(page)).toEqual([]);

    const text = await summary.inputValue();
    expect(text).toContain("external-widget");
    expect(text).toContain(`${labels.status}: ${labels.stale} (failed)`);
    for (const field of ["Plugin:", "SiYuan:", "Device: desktop", "Surface: workbench"]) expect(text).toContain(field);
    expect(text).toContain(labels.evidenceHint);
    for (const privateValue of [MODULE_ID, PRIVATE_TITLE, PRIVATE_INSTANCE, PRIVATE_REASON, "diary-secret@example.test", "D:/Personal/Diary"]) {
        expect(text).not.toContain(privateValue);
    }

    await preview.getByRole("button", {name: labels.cancel, exact: true}).click();
    await expect(preview).toHaveCount(0);
    await expect(details).toBeVisible();
    await expect(opener).toBeFocused();
    expect(await clipboardCalls(page)).toEqual([]);
    // Escape closes the actual SiYuan Dialog and returns to its workbench entry.
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await expect(receiptDetails).toBeFocused();
    expect(await clipboardCalls(page)).toEqual([]);
});

test("health diagnostics confirmation writes once and stays busy until the clipboard settles", async ({page}) => {
    const {labels, details, receiptDetails, opener} = await openStaleHealthDetails(page);
    await opener.click();
    const preview = page.locator(".sw-home-health__preview");
    const copy = preview.locator('button[data-action="copy"]');
    const summary = await preview.locator("textarea").inputValue();
    expect(await clipboardCalls(page)).toEqual([]);
    await copy.click();
    await expect(copy).toBeDisabled();
    await expect(copy).toHaveAttribute("aria-busy", "true");
    expect(await clipboardCalls(page)).toEqual([summary]);
    // Dispatch again while pending to exercise the handler guard as well as the
    // disabled native control; a repeated event must not start another write.
    await copy.dispatchEvent("click");
    expect(await clipboardCalls(page)).toEqual([summary]);
    await expect(preview.getByRole("status")).toBeEmpty();
    await page.evaluate(() => window.__homeHealthDiagnostics.settle());
    await expect(preview.getByRole("status")).toHaveText(labels.copied);
    await expect(copy).toBeEnabled();
    await expect(copy).not.toHaveAttribute("aria-busy", "true");
    expect(await clipboardCalls(page)).toEqual([summary]);
    await page.screenshot({path: artifactPath("T-7288-diagnostics-copied.png")});

    await preview.getByRole("button", {name: labels.back, exact: true}).click();
    await expect(opener).toBeFocused();
    await opener.click();
    await copy.click();
    await expect(copy).toBeDisabled();
    const detachedStatus = await preview.getByRole("status").elementHandle();
    await preview.getByRole("button", {name: labels.cancel, exact: true}).click();
    await expect(preview).toHaveCount(0);
    await expect(details).toBeVisible();
    await expect(opener).toBeFocused();
    await page.evaluate(() => window.__homeHealthDiagnostics.settle());
    await expect(opener).toBeFocused();
    expect(await detachedStatus.evaluate(element => ({connected: element.isConnected, text: element.textContent})))
        .toEqual({connected: false, text: ""});
    await detachedStatus.dispose();
    expect(await clipboardCalls(page)).toEqual([summary, summary]);

    await opener.click();
    await expect(preview.locator("textarea")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(preview).toHaveCount(0);
    await expect(details).toHaveCount(0);
    await expect(receiptDetails).toBeFocused();
    expect(await clipboardCalls(page)).toEqual([summary, summary]);
});

test("health diagnostics denied clipboard keeps a selected manual copy summary at narrow light and dark sizes", async ({page}) => {
    const {labels, opener} = await openStaleHealthDetails(page, "reject");
    await opener.click();
    const preview = page.locator(".sw-home-health__preview");
    const summary = preview.locator("textarea.sw-home-health__summary");
    const originalSummary = await summary.inputValue();
    await preview.locator('button[data-action="copy"]').click();
    await expect(preview.getByRole("status")).toHaveText(labels.copyFailed);
    await expect(summary).toHaveValue(originalSummary);
    await expect(summary).toBeFocused();
    expect(await summary.evaluate(field => ({start: field.selectionStart, end: field.selectionEnd})))
        .toEqual({start: 0, end: originalSummary.length});
    expect(await clipboardCalls(page)).toEqual([originalSummary]);
    await expect(preview.locator('button[data-action="copy"]')).toBeEnabled();

    await page.setViewportSize({width: 375, height: 812});
    const renderedThemes = [];
    for (const theme of ["light", "dark"]) {
        // Load the installed host's real native theme CSS in this page only.
        // Changing a theme data attribute alone does not change SiYuan variables.
        await page.evaluate(value => new Promise((resolve, reject) => {
            document.documentElement.setAttribute("data-theme-mode", value);
            document.querySelector("#e2e-home-health-native-theme")?.remove();
            const sheet = document.createElement("link");
            sheet.id = "e2e-home-health-native-theme";
            sheet.rel = "stylesheet";
            sheet.href = `/appearance/themes/${value === "light" ? "daylight" : "midnight"}/theme.css`;
            sheet.onload = resolve;
            sheet.onerror = () => reject(new Error("Native test theme stylesheet failed to load"));
            document.head.appendChild(sheet);
        }), theme);
        const geometry = await preview.evaluate(element => {
            const host = element.closest(".b3-dialog__container");
            const box = element.getBoundingClientRect();
            const hostBox = host.getBoundingClientRect();
            const controls = Array.from(element.querySelectorAll("textarea, button"));
            const fieldStyle = getComputedStyle(element.querySelector("textarea"));
            return {
                themeBackground: getComputedStyle(document.documentElement).getPropertyValue("--b3-theme-background").trim(),
                fieldBackground: fieldStyle.backgroundColor,
                fieldColor: fieldStyle.color,
                hostInsideViewport: hostBox.left >= -1 && hostBox.right <= innerWidth + 1,
                horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
                controlsFit: controls.length === 3 && controls.every(control => {
                    const rect = control.getBoundingClientRect();
                    return rect.width > 0 && rect.left >= box.left - 1 && rect.right <= box.right + 1;
                }),
            };
        });
        expect(geometry.hostInsideViewport).toBe(true);
        expect(geometry.horizontalOverflow).toBe(false);
        expect(geometry.controlsFit).toBe(true);
        renderedThemes.push(geometry);
        await expect(summary).toBeVisible();
        await expect(preview.getByRole("button", {name: labels.cancel, exact: true})).toBeInViewport({ratio: 1});
        await page.screenshot({path: artifactPath(`T-7288-diagnostics-denied-375-${theme}.png`)});
    }
    expect(renderedThemes[0].themeBackground).not.toBe(renderedThemes[1].themeBackground);
    expect(renderedThemes[0].fieldBackground).not.toBe(renderedThemes[1].fieldBackground);
    expect(renderedThemes[0].fieldColor).not.toBe(renderedThemes[1].fieldColor);
    // A failed browser permission leaves the readable content and an explicit
    // cancel route available; inspecting or resizing it performs no new writes.
    expect(await clipboardCalls(page)).toEqual([originalSummary]);
    await preview.getByRole("button", {name: labels.cancel, exact: true}).click();
    await expect(opener).toBeFocused();
});
