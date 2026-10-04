const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawnSync} = require("node:child_process");
const {readCompiledCssContracts} = require("./compiled-css-contracts.cjs");
const css = fs.readFileSync(path.join(__dirname, "../dist/index.css"), "utf8");

for (const [key, pattern] of [
    ["reducedMotion", /prefers-reduced-motion\s*:\s*reduce/g],
    ["reducedData", /prefers-reduced-data\s*:\s*reduce/g],
    ["safeArea", /safe-area-inset-bottom/g],
    ["errorMix", /--b3-theme-error/g],
]) test(`compiled CSS ${key} accepts minified syntax and detects removed production tokens`, () => {
    assert.equal(readCompiledCssContracts(css)[key], true);
    const invalid = css.replace(pattern, "removed-token");
    assert.notEqual(invalid, css);
    assert.equal(readCompiledCssContracts(invalid)[key], false);
    const decoy = `/* ${css} */`;
    assert.equal(readCompiledCssContracts(decoy)[key], false);
});

test("compiled CSS smoke rejects removed motion data safe-area and error-color contracts", (testContext) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swss-css-contract-"));
    const filename = path.join(directory, "invalid.css");
    testContext.after(() => {fs.unlinkSync(filename); fs.rmdirSync(directory);});
    fs.writeFileSync(filename, css.replace(/prefers-reduced-motion/g, "removed-motion")
        .replace(/prefers-reduced-data/g, "removed-data").replace(/safe-area-inset-bottom/g, "removed-inset")
        .replace(/--b3-theme-error/g, "--removed-error"));
    const result = spawnSync(process.execPath, [path.join(__dirname, "mobile-card-smoke.cjs")], {
        env: {...process.env, SWSS_SMOKE_CSS_PATH: filename}, encoding: "utf8", timeout: 30000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    for (const label of ["home calendar keyboard and motion rules", "home loading skeleton motion fallback",
        "responsive quick actions, mobile settings, and icon sort rules", "shared empty/loading/error state semantics"]) {
        assert.ok(result.stdout.split(/\r?\n/).includes(`FAIL ${label}`), label);
    }
});
