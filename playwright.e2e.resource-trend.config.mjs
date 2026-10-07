/* T-7153：资源趋势只允许通过显式 opt-in 的独立配置运行。 */
import {defineConfig} from "@playwright/test";
import path from "node:path";

const artifactDir = path.resolve(process.env.SWSS_E2E_ARTIFACT_DIR || ".artifacts/e2e-resource-trend");

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: "**/resource-trend.spec.mjs",
    globalSetup: path.resolve(import.meta.dirname, "tests/e2e/resource-trend-global-setup.mjs"),
    timeout: 180000,
    workers: 1,
    retries: 0,
    fullyParallel: false,
    outputDir: path.join(artifactDir, "test-results"),
    reporter: [["list"], ["json", {outputFile: path.join(artifactDir, "results.json")}]],
    use: {
        headless: true,
        viewport: {width: 1440, height: 900},
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});
