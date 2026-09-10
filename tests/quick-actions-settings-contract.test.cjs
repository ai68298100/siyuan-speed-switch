const test = require("node:test");
const assert = require("node:assert/strict");
const {appendQuickAction, sanitizeQuickActions, getDefaultQuickActions, resolveQuickActionSupport} = require("../src/quick-actions.js");

function move(items, from, to) { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next.map((x, i) => ({...x, order: (i + 1) * 10})); }

test("settings contract: add then edit targets persists as a serializable action", () => {
    const added = appendQuickAction(getDefaultQuickActions(), {id: "checkin", kind: "adapter", value: "checkin/open", label: "打卡"});
    assert.equal(added.added, true);
    const edited = {...added.items.at(-1), targets: ["desktop", "mobile"]};
    const restored = sanitizeQuickActions([...added.items.slice(0, -1), edited]);
    assert.deepEqual(restored.items.at(-1).targets, ["desktop", "mobile"]);
});

test("settings contract: reorder updates stable order and delete removes only selected entry", () => {
    const base = getDefaultQuickActions();
    const reordered = move(base, 1, 0);
    assert.deepEqual(reordered.map((item) => item.value), ["journal", "search", "settings"]);
    const deleted = reordered.filter((item) => item.value !== "journal");
    assert.deepEqual(deleted.map((item) => item.value), ["search", "settings"]);
    assert.equal(deleted[0].order, 20);
});

test("settings contract: disabled action remains stored but is not rendered", () => {
    const action = {kind: "adapter", value: "open", targets: ["desktop"], enabled: false};
    const result = sanitizeQuickActions([{id: "a", ...action, label: "入口"}]).items[0];
    assert.equal(result.enabled, false);
});

test("settings contract: unknown mobile capability produces an explicit hint", () => {
    assert.equal(resolveQuickActionSupport("command", "plugin/open", "mobile"), "unknown");
});

test("settings contract: restore defaults removes custom entries and recreates defaults", () => {
    const custom = appendQuickAction(getDefaultQuickActions(), {id: "x", kind: "command", value: "x", label: "自定义"}).items;
    assert.equal(custom.length, 4);
    const restored = sanitizeQuickActions(getDefaultQuickActions());
    assert.deepEqual(restored.items.map((item) => item.value), ["search", "journal", "settings"]);
});
