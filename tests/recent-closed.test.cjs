const test = require("node:test");
const assert = require("node:assert/strict");

function capClosed(entries, max = 50) {
    return (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.rootId && entry.closedAt)
        .filter((entry, index, all) => all.findIndex((item) => item.rootId === entry.rootId) === index)
        .slice(0, max);
}

function recoveryPlan(entries, availableRoots) {
    const seen = new Set();
    return capClosed(entries).filter((entry) => {
        if (!availableRoots.has(entry.rootId) || seen.has(entry.rootId)) return false;
        seen.add(entry.rootId);
        return true;
    });
}

test("recent closed: records are capped and newest duplicate root wins", () => {
    const records = capClosed([
        {rootId: "a", closedAt: 4}, {rootId: "a", closedAt: 3},
        {rootId: "b", closedAt: 2}, {rootId: "c", closedAt: 1},
    ], 2);
    assert.deepEqual(records.map((item) => item.rootId), ["a", "b"]);
});

test("recent closed: recovery plan de-duplicates roots", () => {
    const plan = recoveryPlan([
        {rootId: "a", closedAt: 3}, {rootId: "a", closedAt: 2}, {rootId: "b", closedAt: 1},
    ], new Set(["a", "b"]));
    assert.deepEqual(plan.map((item) => item.rootId), ["a", "b"]);
});

test("recent closed: missing close event does not create a fabricated record", () => {
    assert.deepEqual(capClosed([{rootId: "a"}, {rootId: "b", closedAt: 0}, null]), []);
});

test("recent closed: invalid documents do not block valid recovery entries", () => {
    const plan = recoveryPlan([
        {rootId: "missing", closedAt: 3}, {rootId: "valid", closedAt: 2},
    ], new Set(["valid"]));
    assert.deepEqual(plan.map((item) => item.rootId), ["valid"]);
});
