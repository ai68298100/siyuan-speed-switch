const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const home = require("../src/home-model.js");
const {readSourceFile} = require("./source-scan.cjs");
const source = readSourceFile("src/index.ts");

function registrationWindow() {
    const start = source.indexOf('register("clipped-unread"');
    const end = source.indexOf('register("on-this-day"', start);
    return source.slice(start, end);
}

test("clipped unread is explicitly an external provider module", () => {
    const definition = home.registerModules([]).find((item) => item.moduleId === "clipped-unread");
    assert.equal(definition.availability, "external");
    assert.equal(definition.source.pluginId, "siyuan-clipper");
    assert.equal(definition.source.name, "思源剪藏");
});

test("clipped unread builtin adapter is a blocked placeholder without SQL", () => {
    const window = registrationWindow();
    assert.match(window, /status: "blocked"/);
    assert.match(window, /homeClippedProviderMissing/);
    assert.doesNotMatch(window, /fetchKernelJson\("\/api\/query\/sql"/);
    assert.doesNotMatch(window, /buildClippedUnreadSnapshot|normalizeClippedUnreadConfig/);
});

test("clipped unread provider contract documents the shared module id", () => {
    const protocol = fs.readFileSync(path.join(__dirname, "..", "docs", "widget-protocol.md"), "utf8");
    assert.match(protocol, /`clipped-unread` 是一个约定的外部提供方 moduleId/);
    assert.match(protocol, /status: "blocked"/);
    assert.match(protocol, /moduleId: "clipped-unread"/);
});
