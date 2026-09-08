const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeQuickActions} = require("../src/quick-actions.js");

test("retention monitor: obsolete fields are removed after upgrade", () => {
    const item = sanitizeQuickActions([{id: "p", kind: "command", value: "p/open", label: "入口", legacyTarget: "mobile", callback: () => "x"}]).items[0];
    assert.equal(Object.prototype.hasOwnProperty.call(item, "legacyTarget"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "callback"), false);
});

test("retention monitor: persisted list remains capped during repeated upgrades", () => {
    let state = Array.from({length: 100}, (_, i) => ({id: `p${i}`, kind: "command", value: `p${i}`, label: "入口"}));
    for (let i = 0; i < 20; i += 1) state = sanitizeQuickActions(state).items;
    assert.equal(state.length, 12);
});

test("retention monitor: invalid upgraded records do not displace valid entries", () => {
    const output = sanitizeQuickActions([{id: "bad", kind: "builtin", value: "invalid"}, {id: "ok", kind: "builtin", value: "settings", label: "设置"}]);
    assert.deepEqual(output.items.map((item) => item.id), ["ok"]);
});
