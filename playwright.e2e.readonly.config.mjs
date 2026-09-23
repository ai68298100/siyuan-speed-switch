/* 只读实例 E2E 配置（T-6833）：复用可写通道准备的同一测试工作区，另起 --readonly 内核。 */
import {defineConfig} from "@playwright/test";
import path from "node:path";

export default defineConfig({
    testDir: "./tests/e2e/readonly",
    testMatch: "**/*.spec.mjs",
    globalSetup: path.resolve(import.meta.dirname, "tests/e2e/readonly/global-setup.mjs"),
    timeout: 120000,
    workers: 1,
    retries: 1,
    fullyParallel: false,
    outputDir: ".artifacts/e2e/test-results",
    reporter: [["list"], ["json", {outputFile: ".artifacts/e2e/results-readonly.json"}]],
    use: {
        headless: true,
        viewport: {width: 1440, height: 900},
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});
