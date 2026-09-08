const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeClosedEntries, planClosedRecovery, mergeRecentDocumentRecords, runRecoveryPlan, applyRecentEvent} = require("../src/recent-closed.js");

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

test("recent closed: shared normalizer filters malformed records and bounds titles", () => {
    const output = normalizeClosedEntries([
        {rootId: "a", closedAt: 4, title: " A "},
        {rootId: "a", closedAt: 3},
        {rootId: "b", closedAt: 0},
        {rootId: "c", closedAt: 2, title: "x".repeat(240)},
    ], 2);
    assert.deepEqual(output.items.map((item) => item.rootId), ["a", "c"]);
    assert.equal(output.items[0].title, "A");
    assert.equal(output.items[1].title.length, 200);
    assert.equal(output.changed, true);
});

test("recent closed: recovery only returns currently available roots", () => {
    const output = planClosedRecovery([
        {rootId: "missing", closedAt: 4}, {rootId: "b", closedAt: 3}, {rootId: "a", closedAt: 2},
    ], new Set(["a", "b"]));
    assert.deepEqual(output.map((item) => item.rootId), ["b", "a"]);
});

test("recent records: merge keeps open records first and removes duplicate roots", () => {
    const output = mergeRecentDocumentRecords(
        [{rootId: "a", title: "Open A", ts: 9}, {rootId: "b", title: "Open B", ts: 8}],
        [{rootId: "b", title: "Closed B", closedAt: 7}, {rootId: "c", title: "Closed C", closedAt: 6}],
    );
    assert.deepEqual(output.map((item) => [item.rootId, item.source]), [["a", "open"], ["b", "open"], ["c", "closed"]]);
});

test("recent recovery: one failed open does not block later entries", async () => {
    const output = await runRecoveryPlan([{rootId: "a"}, {rootId: "b"}, {rootId: "c"}], async (rootId) => {
        if (rootId === "b") throw new Error("missing");
        return true;
    });
    assert.deepEqual(output.succeeded, ["a", "c"]);
    assert.deepEqual(output.failed, ["b"]);
    assert.equal(output.results.length, 3);
});

test("recent events: open and close events are idempotent and mutually exclusive", () => {
    let state = applyRecentEvent({}, {type: "open", rootId: "a", ts: 1});
    state = applyRecentEvent(state, {type: "open", rootId: "a", ts: 2});
    state = applyRecentEvent(state, {type: "close", rootId: "a", closedAt: 3});
    assert.deepEqual(state.open, []);
    assert.deepEqual(state.closed.map((item) => item.rootId), ["a"]);
    const unchanged = applyRecentEvent(state, {type: "unknown", rootId: "a"});
    assert.equal(unchanged.changed, false);
});
