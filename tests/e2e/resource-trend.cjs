// T-7153: browser-only resource trend probe. It is intentionally a test
// helper and never enters the webpack production bundle.
const fs = require("node:fs");
const path = require("node:path");

const PROBE_SOURCE = fs.readFileSync(
    path.join(__dirname, "..", "resource-trend-probe.browser.js"),
    "utf8",
);

/** Install before page activity when possible; current-page installation is
 * also supported for existing Playwright pages. The return value is a sample
 * taken after installation, not a claim about activity before that point. */
async function installResourceTrendProbe(page, label = "probe-installed") {
    await page.addInitScript({content: PROBE_SOURCE});
    await page.evaluate(PROBE_SOURCE);
    return page.evaluate((sampleLabel) => window.__swssResourceTrendProbe?.sample(sampleLabel) ?? null, label);
}

async function sampleResourceTrend(page, label = "sample") {
    return page.evaluate((sampleLabel) => window.__swssResourceTrendProbe?.sample(sampleLabel) ?? null, label);
}

async function disposeResourceTrendProbe(page) {
    return page.evaluate(() => {
        const probe = window.__swssResourceTrendProbe;
        if (!probe) return false;
        probe.dispose();
        return true;
    });
}

module.exports = {PROBE_SOURCE, installResourceTrendProbe, sampleResourceTrend, disposeResourceTrendProbe};
