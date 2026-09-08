const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

function mergeSnapshots(local, incoming) {
    const a = sanitizeQuickActions(local).items;
    const b = sanitizeQuickActions(incoming).items;
    const byId = new Map(a.map((item) => [item.id, item]));
    b.forEach((item) => byId.set(item.id, item));
    return [...byId.values()].sort((x, y) => x.order - y.order || x.id.localeCompare(y.id));
}

test("sync conflict: incoming snapshot deterministically replaces same entry", () => {
    const merged = mergeSnapshots(
        [{id: "p", kind: "command", value: "old", label: "旧", targets: ["desktop"]}],
        [{id: "p", kind: "command", value: "new", label: "新", targets: ["mobile"]}],
    );
    assert.equal(merged[0].value, "new");
    assert.deepEqual(merged[0].targets, ["mobile"]);
});

test("sync conflict: different entries retain stable order", () => {
    const merged = mergeSnapshots(
        [{id: "b", kind: "command", value: "b", label: "B", order: 20}],
        [{id: "a", kind: "command", value: "a", label: "A", order: 10}],
    );
    assert.deepEqual(merged.map((item) => item.id), ["a", "b"]);
});

test("sync conflict: malformed incoming snapshot cannot erase valid local state", () => {
    const local = [{id: "p", kind: "command", value: "open", label: "入口"}];
    const incoming = [null, {id: "bad", kind: "builtin", value: "invalid"}];
    const normalized = sanitizeQuickActions(incoming);
    const effective = normalized.items.length === 0 ? sanitizeQuickActions(local).items : normalized.items;
    assert.equal(effective[0].value, "open");
});
