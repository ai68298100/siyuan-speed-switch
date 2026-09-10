const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeClosedEntries, planClosedRecovery, mergeRecentDocumentRecords, buildRecentHistorySections, runRecoveryPlan, runRecoveryPlanBounded, applyRecentEvent, buildRecentRefreshNotice, removeRecentEntry, recordRecentOpen} = require("../src/recent-closed.js");

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

test("recent history sections give captured closes precedence and expose a deduplicated count", () => {
    const output = buildRecentHistorySections([
        {key: "tab-a", rootId: "a", title: "Open A", ts: 9},
        {key: "tab-b", rootId: "b", title: "Legacy B", ts: 8},
        {key: "utility", title: "Utility", ts: 7},
    ], [
        {rootId: "b", title: "Closed B", closedAt: 10},
        {rootId: "c", title: "Closed C", closedAt: 6},
        {rootId: "a", title: "Stale close A", closedAt: 5},
    ], new Set(["a"]));
    assert.deepEqual(output.open.map((item) => item.key), ["tab-a", "utility"]);
    assert.deepEqual(output.closed.map((item) => item.rootId), ["b", "c"]);
    assert.equal(output.count, 4);
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
    const duplicateOpen = applyRecentEvent(state, {type: "open", rootId: "a", ts: 1});
    assert.equal(duplicateOpen.changed, false);
    state = applyRecentEvent(state, {type: "open", rootId: "a", ts: 2});
    state = applyRecentEvent(state, {type: "close", rootId: "a", closedAt: 3});
    const duplicateClose = applyRecentEvent(state, {type: "close", rootId: "a", closedAt: 3});
    assert.equal(duplicateClose.changed, false);
    assert.deepEqual(state.open, []);
    assert.deepEqual(state.closed.map((item) => item.rootId), ["a"]);
    const unchanged = applyRecentEvent(state, {type: "unknown", rootId: "a"});
    assert.equal(unchanged.changed, false);
});

test("recent events: refresh notice exposes stable counts", () => {
    const notice = buildRecentRefreshNotice({open: [{rootId: "a"}], closed: []}, {open: [], closed: [{rootId: "a"}]});
    assert.deepEqual(notice, {changed: true, openCount: 0, closedCount: 1});
});

test("recent events: out-of-order open after close restores open precedence", () => {
    let state = applyRecentEvent({}, {type: "close", rootId: "a", closedAt: 3});
    state = applyRecentEvent(state, {type: "open", rootId: "a", ts: 4});
    assert.deepEqual(state.open.map((item) => item.rootId), ["a"]);
    assert.deepEqual(state.closed, []);
});

test("recent history: large event streams remain bounded", () => {
    let state = {open: [], closed: []};
    for (let i = 0; i < 5000; i += 1) {
        state = applyRecentEvent(state, {type: i % 2 ? "open" : "close", rootId: `root-${i % 300}`, ts: i, closedAt: i + 1});
    }
    assert.ok(state.open.length <= 50);
    assert.ok(state.closed.length <= 50);
    assert.ok(state.open.length + state.closed.length <= 100);
});

test("recent recovery: bounded batch isolates failures and cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    const output = await runRecoveryPlanBounded(Array.from({length: 120}, (_, i) => ({rootId: `r${i}`})), async (rootId) => {
        calls += 1;
        if (rootId === "r3") throw new Error("missing");
        if (calls === 5) controller.abort();
        return true;
    }, {max: 100, signal: controller.signal});
    assert.equal(output.attempted, 5);
    assert.equal(output.cancelled, true);
    assert.deepEqual(output.failed, ["r3"]);
});

test("recent recovery: legacy callers remain compatible without options", async () => {
    const output = await runRecoveryPlan([{rootId: "legacy"}], async () => undefined);
    assert.deepEqual(output.succeeded, ["legacy"]);
    assert.deepEqual(output.failed, []);
});

test("recent entries: removal is source-aware and idempotent", () => {
    const open = [{key: "tab-a", rootId: "a"}, {key: "tab-b", rootId: "b"}];
    assert.deepEqual(removeRecentEntry(open, "tab-a").items, [{key: "tab-b", rootId: "b"}]);
    assert.equal(removeRecentEntry(open, "missing").changed, false);
    const closed = [{rootId: "a", closedAt: 2}, {rootId: "b", closedAt: 1}];
    assert.deepEqual(removeRecentEntry(closed, "a", "rootId").items, [{rootId: "b", closedAt: 1}]);
    assert.deepEqual(open, [{key: "tab-a", rootId: "a"}, {key: "tab-b", rootId: "b"}]);
});

test("recent entries: recording an open item moves it to the front and clears closed state", () => {
    const result = recordRecentOpen(
        [{key: "old", rootId: "old", title: "Old", ts: 1}, {key: "tab-a", rootId: "a", title: "A", ts: 2}],
        [{rootId: "a", title: "Closed A", closedAt: 3}, {rootId: "b", title: "Closed B", closedAt: 2}],
        {key: "tab-a", rootId: "a", title: "A2", ts: 4},
        10,
    );
    assert.deepEqual(result.open.map((item) => item.key), ["tab-a", "old"]);
    assert.deepEqual(result.closed.map((item) => item.rootId), ["b"]);
    assert.equal(result.changed, true);
});
