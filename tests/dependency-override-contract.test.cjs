const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("pnpm dependency overrides live in the workspace configuration", () => {
    const workspace = read("pnpm-workspace.yaml");
    const packageJson = JSON.parse(read("package.json"));
    const overrideLine = workspace.split(/\r?\n/).find((line) => line.trim().startsWith("fast-uri:"));

    assert.equal(overrideLine?.trim(), "fast-uri: '>=4.0.0'");
    assert.equal(Object.hasOwn(packageJson, "pnpm"), false);
});

test("pnpm lockfile resolves every fast-uri entry to the audited major", () => {
    const lockfile = read("pnpm-lock.yaml");
    const versions = [...lockfile.matchAll(/^\s*fast-uri@(\d+)\.(\d+)\.(\d+):/gm)]
        .map((match) => Number(match[1]));

    assert.ok(versions.length >= 2, "lockfile must contain package and snapshot fast-uri entries");
    assert.ok(versions.every((major) => major >= 4), `unexpected fast-uri majors: ${versions.join(", ")}`);
    assert.doesNotMatch(lockfile, /^\s*fast-uri@3\./m);
});
