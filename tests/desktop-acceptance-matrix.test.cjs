const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {MATRIX_PATH, readMatrix, validateMatrix} = require("../scripts/desktop-acceptance-matrix.cjs");

test("T-7115 desktop acceptance matrix has complete local and host boundaries", () => {
    const summary = validateMatrix(readMatrix());
    assert.equal(summary.cases, 11);
    assert.equal(summary.localVerified, 10);
    assert.equal(summary.partialHost, 5);
    assert.equal(summary.pendingHost, 6);
});

test("T-7115 matrix rejects browser-only host verification", () => {
    const matrix = readMatrix();
    const item = matrix.cases.find((entry) => entry.id === "desktop.theme-light-dark");
    item.host = {status: "verified", evidence: [{path: "tests/chromium-style-smoke.cjs", kind: "chromium"}]};
    assert.throws(() => validateMatrix(matrix), /不得用 Chromium 单独宣称 host verified/);
});

test("T-7115 matrix rejects a pending host case without its blocker", () => {
    const matrix = readMatrix();
    const item = matrix.cases.find((entry) => entry.id === "desktop.theme-light-dark");
    delete item.host.blockers;
    assert.throws(() => validateMatrix(matrix), /pending 必须有 blockers/);
});

test("T-7115 fixture stays inside the repository and remains parseable", () => {
    assert.equal(path.isAbsolute(path.relative(process.cwd(), MATRIX_PATH)), false);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8")));
});

test("T-7115 clean checkout may omit local-only artifact evidence, but not tracked evidence", () => {
    const matrix = readMatrix();
    const item = matrix.cases.find((entry) => entry.id === "desktop.surface-navigation-close");
    const original = item.host.evidence[0].path;
    item.host.evidence[0].path = ".artifacts/missing-on-clean-checkout/results.json";
    const summary = validateMatrix(matrix);
    assert.ok(summary.missingLocalOnlyEvidence >= 1);
    item.host.evidence[0].path = "docs/missing-on-clean-checkout.json";
    assert.throws(() => validateMatrix(matrix), /evidence 不存在/);
    item.host.evidence[0].path = original;
});
