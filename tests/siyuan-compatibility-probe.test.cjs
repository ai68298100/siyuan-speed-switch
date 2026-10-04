const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {runCompatibilityProbe, readFixture} = require("../scripts/siyuan-compatibility-probe.cjs");

const fixturePath = path.join(__dirname, "fixtures", "siyuan-compatibility-probes.json");

test("T-7114 compatibility probe exercises both 3.8.x shapes and lifecycle", () => {
    const report = runCompatibilityProbe();
    assert.equal(report.versions.length, 2);
    assert.equal(report.aliases.length, 2);
    assert.equal(report.lifecycle.checked, 5);
    assert.deepEqual(report.versions.map((entry) => entry.version), ["3.8.4-beta.2", "3.8.6"]);
});

test("T-7114 probe rejects a path-only title record when its safe path disappears", () => {
    const fixture = readFixture(fixturePath);
    fixture.versions[1].titleSearch.record.path = "/unsafe/title.md";
    assert.throws(() => runCompatibilityProbe({fixture}), /3\.8\.6 标题路径记录未归一化/);
});

test("T-7114 probe rejects lifecycle cleanup drift", () => {
    const fixture = readFixture(fixturePath);
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8")
        .replace("delete (window as any).siyuanSpeedSwitch;", "void window;");
    assert.throws(() => runCompatibilityProbe({fixture, sourceText: source}), /生命周期接线缺失/);
});
