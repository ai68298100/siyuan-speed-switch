const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");

test("widget store previews refresh real data and separate size selection from commit", () => {
    assert.match(source, /controller\.mount\(\);\s*void controller\.refresh\(\{\}, \{force: true\}\);/);
    assert.match(source, /homeStoreApplySize/);
    assert.match(source, /homeStoreAdd/);
    assert.match(source, /tile\.dataset\.size = sizeKey/);
    assert.match(source, /sw-home-store__add/);
    assert.match(source, /selectedTile\?\.classList\.remove\("is-selected"\)/);
    assert.match(source, /sw-home-store__availability/);
    assert.match(source, /homeStoreAvailabilityConditional/);
    assert.match(source, /homeStoreTabConditional/);
    assert.match(source, /card\.dataset\.availability === availabilityFilter/);
    assert.match(source, /listModules\(device\)\.forEach/);
    assert.match(source, /sw-home-store__group/);
    assert.match(source, /grid\.classList\.toggle\("fn__none", !visible\)/);
    assert.match(source, /!added && def\.availability === "conditional"/);
    assert.match(source, /homeStoreConditionalHint/);
    assert.match(source, /addedInstance && Array\.isArray\(def\.configSchema\)/);
    assert.match(source, /sw-home-store__configure/);
    assert.match(source, /openHomeConfigForm\(addedInstance, def\.configSchema/);
    assert.match(source, /homeStoreSupportedSurfaces/);
    assert.match(source, /sw-home-store__support/);
});
