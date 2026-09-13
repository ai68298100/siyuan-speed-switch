const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");

test("path filter remains model-gated until the host endpoint is approved", () => {
    assert.match(source, /delete next\.paths/);
    assert.doesNotMatch(source, /listDocsByPath/);
});
