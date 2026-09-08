const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeOpenHistory} = require("../src/util.js");

const ROOT_A = "20260906120000-aaaaaaa";
const ROOT_B = "20260906120001-bbbbbbb";

function recoveryPlan(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
        const root = entry?.rootId;
        if (!root || seen.has(root)) return false;
        seen.add(root);
        return true;
    });
}

test("recent history: migrates tab keys to root keys and removes duplicate roots", () => {
    const output = sanitizeOpenHistory([
        {key: "tab-a", rootId: ROOT_A, title: "A", ts: 3},
        {key: ROOT_A, rootId: ROOT_A, title: "duplicate", ts: 2},
        {key: "tab-b", rootId: ROOT_B, title: "B", ts: 1},
    ]);
    assert.deepEqual(output.items.map((item) => item.key), [ROOT_A, ROOT_B]);
    assert.equal(output.items[0].title, "A");
    assert.equal(output.changed, true);
});

test("recent history: filters malformed entries and enforces capacity", () => {
    const output = sanitizeOpenHistory([
        null,
        {key: "", title: "empty"},
        {key: "one", title: "1"},
        {key: "two", title: "2"},
        {key: "three", title: "3"},
    ], 2);
    assert.deepEqual(output.items.map((item) => item.key), ["one", "two"]);
    assert.equal(output.changed, true);
});

test("recent history: stable non-document keys remain usable while invalid root ids are not treated as documents", () => {
    const output = sanitizeOpenHistory([
        {key: "plugin:clock", rootId: "not-a-root", title: "Clock", ts: 1},
        {key: ROOT_A, title: "A", ts: 2},
    ]);
    assert.equal(output.items[0].key, "plugin:clock");
    assert.equal(output.items[0].rootId, null);
    assert.equal(output.items[1].rootId, ROOT_A);
});

test("recent history: recovery plan never opens the same root twice", () => {
    const history = sanitizeOpenHistory([
        {key: "tab-a", rootId: ROOT_A, title: "A"},
        {key: ROOT_A, rootId: ROOT_A, title: "A duplicate"},
        {key: "tab-b", rootId: ROOT_B, title: "B"},
    ]).items;
    const plan = recoveryPlan([...history, {key: "stale", rootId: ROOT_A, title: "stale"}]);
    assert.deepEqual(plan.map((entry) => entry.rootId), [ROOT_A, ROOT_B]);
});
