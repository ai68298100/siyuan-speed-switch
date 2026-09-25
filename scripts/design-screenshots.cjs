// T-6870 全插件统一 UI 原型截图：docs/design/platform-ui-redesign-2026-09-26.html
// 对每个 [data-shot] 截图到 docs/design/redesign-2026-09-26/<id>.png，另存整页联络图。
// 用法：先 pnpm run build，再 node scripts/design-screenshots.cjs（仅开发链，不进门禁）。
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {chromium} = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "docs", "design", "platform-ui-redesign-2026-09-26.html");
const outDir = path.join(root, "docs", "design", "redesign-2026-09-26");

async function main() {
    if (!fs.existsSync(htmlPath)) throw new Error(`prototype html missing: ${htmlPath}`);
    fs.mkdirSync(outDir, {recursive: true});
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1800, height: 1200}, deviceScaleFactor: 2});
    await page.goto(pathToFileURL(htmlPath).href, {waitUntil: "networkidle"});
    await page.waitForTimeout(400);
    const shots = await page.$$eval("[data-shot]", (nodes) => nodes.map((n) => n.getAttribute("data-shot")));
    if (shots.length < 20) throw new Error(`expected >=20 screens, found ${shots.length}`);
    for (const id of shots) {
        const el = await page.$(`[data-shot="${id}"]`);
        await el.screenshot({path: path.join(outDir, `${id}.png`)});
        console.log("shot", id);
    }
    await page.screenshot({path: path.join(root, ".tmp", "design", "00-contact-sheet.png"), fullPage: true});
    console.log(`done: ${shots.length} screens -> ${outDir} (contact sheet -> .tmp/design/)`);
    await browser.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
