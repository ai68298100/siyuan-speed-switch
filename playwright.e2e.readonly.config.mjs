/* 只读实例 E2E 配置（T-6833）：复用可写通道准备的同一测试工作区，另起 --readonly 内核。 */
import {defineConfig} from "@playwright/test";
import path from "node:path";

const artifactDir = path.resolve(process.env.SWSS_E2E_ARTIFACT_DIR || ".artifacts/e2e");

export default defineConfig({
    testDir: "./tests/e2e/readonly",
    testMatch: "**/*.spec.mjs",
    globalSetup: path.resolve(import.meta.dirname, "tests/e2e/readonly/global-setup.mjs"),
    timeout: 120000,
    workers: 1,
    retries: 1,
    fullyParallel: false,
    outputDir: path.join(artifactDir, "test-results"),
    reporter: [["list"], ["json", {outputFile: path.join(artifactDir, "results-readonly.json")}]],
    use: {
        headless: true,
        viewport: {width: 1440, height: 900},
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});
