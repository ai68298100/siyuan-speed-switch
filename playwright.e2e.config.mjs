/* E2E 配置（T-6833）：真实例 UI 必须串行——同一个内核只有一个文档树与一套插件实例。 */
import {defineConfig} from "@playwright/test";
import path from "node:path";

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: "**/*.spec.mjs",
    /* 只读实例需要另起一个 --readonly 内核，走独立配置。 */
    testIgnore: "**/readonly/**",
    globalSetup: path.resolve(import.meta.dirname, "tests/e2e/global-setup.mjs"),
    timeout: 120000,
    workers: 1,
    retries: 1,
    fullyParallel: false,
    outputDir: ".artifacts/e2e/test-results",
    reporter: [["list"], ["json", {outputFile: ".artifacts/e2e/results.json"}]],
    use: {
        headless: true,
        viewport: {width: 1440, height: 900},
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});
