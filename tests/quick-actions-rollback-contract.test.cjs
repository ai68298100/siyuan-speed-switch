const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

test("rollback contract: failed import keeps previous valid snapshot", () => {
    const previous = sanitizeQuickActions([{id: "ok", kind: "builtin", value: "journal", label: "日记"}]).items;
    const imported = sanitizeQuickActions([null, {bad: true}]);
    const effective = imported.changed && imported.items.length === 0 ? previous : imported.items;
    assert.deepEqual(effective.map((item) => item.id), ["ok"]);
});

test("rollback contract: target merge remains stable across repeated migrations", () => {
    const input = [{id: "p", kind: "adapter", value: "p/open", label: "P", targets: ["mobile", "desktop", "mobile"]}];
    const first = sanitizeQuickActions(input).items;
    const second = sanitizeQuickActions(first).items;
    assert.deepEqual(second[0].targets, first[0].targets);
});

test("rollback contract: old-version entries recover without executable fields", () => {
    const output = sanitizeQuickActions([{id: "legacy", kind: "command", value: "p/open", label: "入口", callback: "not imported"}]).items[0];
    assert.equal(Object.prototype.hasOwnProperty.call(output, "callback"), false);
    assert.equal(output.value, "p/open");
});
