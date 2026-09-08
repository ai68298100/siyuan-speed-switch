const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

test("migration contract: legacy entries normalize into current serializable fields", () => {
    const result = sanitizeQuickActions([{id: "legacy", kind: "adapter", value: "p/open", label: "入口", supportedDevices: ["desktop", "mobile"]}]).items[0];
    assert.equal(result.id, "legacy");
    assert.deepEqual(result.targets, ["desktop"]);
});

test("migration contract: unknown providers remain isolated as ordinary serializable commands", () => {
    const result = sanitizeQuickActions([{id: "unknown", kind: "command", value: "missing/open", label: "未知", targets: ["desktop"]}]).items[0];
    assert.equal(result.kind, "command");
    assert.equal(result.value, "missing/open");
});

test("migration contract: explicit three-surface targets merge without duplicates", () => {
    const result = sanitizeQuickActions([{id: "p", kind: "adapter", value: "p/open", label: "P", targets: ["desktop", "mobile", "desktop", "sidebar"]}]).items[0];
    assert.deepEqual(result.targets, ["desktop", "mobile", "sidebar"]);
});

test("migration contract: malformed imported configuration is isolated", () => {
    const result = sanitizeQuickActions([null, {id: "bad", kind: "builtin", value: "invalid"}, {id: "ok", kind: "builtin", value: "journal", label: "日记"}]);
    assert.deepEqual(result.items.map((item) => item.id), ["ok"]);
    assert.equal(result.changed, true);
});
