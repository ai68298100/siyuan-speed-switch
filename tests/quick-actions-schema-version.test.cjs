const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

function migratePackage(pkg) {
    if (!pkg || typeof pkg !== "object") return {schemaVersion: 1, items: []};
    if (pkg.schemaVersion !== 1) return {schemaVersion: 1, items: sanitizeQuickActions([]).items};
    return {schemaVersion: 1, items: sanitizeQuickActions(pkg.items).items};
}

test("schema gate: current package emits schema version one and normalized items", () => {
    const out = migratePackage({schemaVersion: 1, items: [{id: "p", kind: "command", value: "p/open", label: "入口"}]});
    assert.equal(out.schemaVersion, 1);
    assert.equal(out.items[0].id, "p");
});

test("schema gate: unknown future versions isolate to safe empty state", () => {
    const out = migratePackage({schemaVersion: 99, items: [{id: "p", kind: "command", value: "p/open"}]});
    assert.equal(out.schemaVersion, 1);
    assert.deepEqual(out.items, []);
});

test("schema gate: legacy unwrapped arrays migrate through same sanitizer", () => {
    const out = migratePackage({schemaVersion: 1, items: [{id: "a", kind: "builtin", value: "journal", label: "日记"}]});
    assert.deepEqual(out.items.map((item) => item.value), ["journal"]);
});
