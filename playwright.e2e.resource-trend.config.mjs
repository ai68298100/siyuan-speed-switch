/* T-7153：资源趋势只允许通过显式 opt-in 的独立配置运行。 */
import {defineConfig} from "@playwright/test";
import path from "node:path";

const artifactDir = path.resolve(process.env.SWSS_E2E_ARTIFACT_DIR || ".artifacts/e2e-resource-trend");
const longRun = process.env.SWSS_E2E_RESOURCE_TREND_LONG === "1";

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
        // A multi-hour run already writes checkpoint NDJSON. Keeping a full
        // Playwright trace for every long-run failure can exceed the browser
        // process memory before the resource report is flushed.
        trace: longRun ? "off" : "retain-on-failure",
        screenshot: longRun ? "off" : "only-on-failure",
    },
});
