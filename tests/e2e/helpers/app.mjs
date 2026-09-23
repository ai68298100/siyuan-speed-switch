/* E2E 页面对象（T-6833）：打开真实例前端并等待公开钩子就绪；
   通过 window.siyuanSpeedSwitch（onLayoutReady 挂载）打开切换器。 */
import fs from "node:fs";
import path from "node:path";
import {SiyuanClient} from "../../../scripts/e2e/lib.mjs";

const artifactsDir = path.resolve(import.meta.dirname, "..", "..", "..", ".artifacts", "e2e");
export const PLUGIN_NAME = "siyuan-speed-switch";

/** 目标信息按名字分文件：默认桌面实例，只读实例走 target-readonly.json。 */
export function target(name = "target") {
    const file = path.join(artifactsDir, `${name}.json`);
    if (!fs.existsSync(file)) throw new Error(`缺少 ${file}，请通过对应的 pnpm run test:e2e* 启动`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** bundle 取 desktop / mobile：内核按目录提供不同前端构建。 */
export function appURL({bundle = "desktop", target: targetName = "target"} = {}) {
    const {baseURL, token} = target(targetName);
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    const query = params.toString();
    return `${baseURL}/stage/build/${bundle}/${query ? `?${query}` : ""}`;
}

export function createClient(name = "target") {
    const {baseURL, token} = target(name);
    return new SiyuanClient({baseURL, token});
}

/** 等插件实例与公开钩子就绪（钩子在 onLayoutReady 挂载，存在即就绪）。 */
export async function openApp(page, options = {}) {
    await page.goto(appURL(options), {waitUntil: "domcontentloaded"});
    await page.waitForFunction(() => {
        const plugins = window.siyuan?.ws?.app?.plugins;
        return Array.isArray(plugins) && plugins.some((plugin) => plugin?.name === "siyuan-speed-switch");
    }, undefined, {timeout: 45000});
    await page.waitForFunction(() => typeof window.siyuanSpeedSwitch?.whenReady === "function", undefined, {timeout: 45000});
    await page.evaluate(() => window.siyuanSpeedSwitch.whenReady());
    return page;
}

/** 打开桌面切换器并等搜索框可输入。 */
export async function openSwitcher(page) {
    await page.evaluate(() => window.siyuanSpeedSwitch.openSwitcher());
    await page.waitForSelector("input.sw__search", {timeout: 15000});
    return page;
}
