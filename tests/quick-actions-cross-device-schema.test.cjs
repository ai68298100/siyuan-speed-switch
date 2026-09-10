const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

test("cross-device schema: desktop/sidebar/mobile import same package deterministically", () => {
    const pkg = {schemaVersion: 1, items: [
        {id: "j", kind: "builtin", value: "journal", label: "日记", targets: ["desktop", "mobile"]},
        {id: "s", kind: "builtin", value: "settings", label: "设置", targets: ["desktop", "sidebar", "mobile"]},
    ]};
    const snapshots = ["desktop", "sidebar", "mobile"].map(() => sanitizeQuickActions(pkg.items).items);
    assert.deepEqual(snapshots[1], snapshots[0]);
    assert.deepEqual(snapshots[2], snapshots[0]);
});

test("cross-device schema: old package fallback preserves safe defaults", () => {
    const migrated = {schemaVersion: 1, items: sanitizeQuickActions(undefined).items};
    assert.deepEqual(migrated.items.map((item) => item.value), ["search", "journal", "settings"]);
});

test("cross-device schema: normalized order and targets remain stable after round trip", () => {
    const input = [{id: "p", kind: "adapter", value: "p/open", label: "入口", order: 20, targets: ["mobile", "desktop", "mobile"]}];
    const once = sanitizeQuickActions(input).items;
    const twice = sanitizeQuickActions(once).items;
    assert.deepEqual(twice, once);
});
