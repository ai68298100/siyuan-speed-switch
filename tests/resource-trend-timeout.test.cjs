const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getResourceTrendTimeoutMs,
    parsePositiveTimeoutMs,
} = require("./e2e/resource-trend.cjs");

test("T-7203 uses an explicit timeout when configured", () => {
    assert.equal(parsePositiveTimeoutMs("7200000"), 7200000);
    assert.equal(getResourceTrendTimeoutMs({cycles: 2160, longRun: true, configuredTimeout: "7200000"}), 7200000);
});

test("T-7203 gives long runs a bounded two-hour-session budget", () => {
    assert.equal(getResourceTrendTimeoutMs({cycles: 335, longRun: true}), 9_000_000);
    assert.equal(getResourceTrendTimeoutMs({cycles: 60, longRun: false}), 780_000);
});

test("T-7203 ignores malformed or non-positive timeout overrides", () => {
    assert.equal(parsePositiveTimeoutMs("0"), null);
    assert.equal(parsePositiveTimeoutMs("not-a-number"), null);
    assert.equal(getResourceTrendTimeoutMs({cycles: 335, longRun: true, configuredTimeout: "0"}), 9_000_000);
});
