const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

test("schema final: round-trip keeps id/order/targets stable across devices", () => {
    const input = [
        {id: "a", kind: "command", value: "a/open", label: "A", order: 20, targets: ["mobile", "desktop"]},
        {id: "b", kind: "adapter", value: "b/open", label: "B", order: 10, targets: ["sidebar"]},
    ];
    const first = sanitizeQuickActions(input).items;
    const second = sanitizeQuickActions(first).items;
    assert.deepEqual(second, first);
});

test("schema final: unknown fields and malformed entries are discarded", () => {
    const output = sanitizeQuickActions([{id: "ok", kind: "command", value: "ok", label: "OK", unknown: {x: 1}}, null, {id: "bad", kind: "builtin", value: "invalid"}]);
    assert.deepEqual(output.items.map((item) => item.id), ["ok"]);
    assert.equal(Object.prototype.hasOwnProperty.call(output.items[0], "unknown"), false);
});

test("schema final: missing package data remains safe and deterministic", () => {
    const a = sanitizeQuickActions(undefined).items;
    const b = sanitizeQuickActions(undefined).items;
    assert.deepEqual(a, b);
});
