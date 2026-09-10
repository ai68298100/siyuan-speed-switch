const test = require("node:test");
const assert = require("node:assert/strict");
const sets = require("../src/document-sets.js");

test("document sets normalize legacy arrays and remove invalid duplicates", () => {
    const result = sets.normalizeDocumentSets([
        {setId: "alpha", name: " Alpha ", entries: [{rootId: "doc-a", title: "A"}, {rootId: "doc-a"}, {rootId: ""}]},
        {setId: "alpha", name: "duplicate", entries: [{rootId: "doc-b"}]},
    ]);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.changed, true);
    assert.equal(result.sets.length, 1);
    assert.deepEqual(result.sets[0].entries[0], {rootId: "doc-a", title: "A", group: "", index: 0});
});

test("document set create and upsert preserve identity while updating timestamps", () => {
    const created = sets.createDocumentSet("Project", [{rootId: "doc-a"}], {setId: "project", now: 10});
    assert.equal(created.createdAt, 10);
    const inserted = sets.upsertDocumentSet({schemaVersion: 1, sets: []}, created, {now: 20});
    assert.equal(inserted.state.sets[0].setId, "project");
    const updated = sets.upsertDocumentSet(inserted.state, {setId: "project", name: "Project 2", entries: [{rootId: "doc-b"}]}, {now: 30});
    assert.equal(updated.state.sets.length, 1);
    assert.equal(updated.state.sets[0].createdAt, 10);
    assert.equal(updated.state.sets[0].updatedAt, 30);
    assert.equal(updated.state.sets[0].entries[0].rootId, "doc-b");
});

test("document set removal is idempotent", () => {
    const value = {schemaVersion: 1, sets: [{setId: "a", name: "A", entries: [{rootId: "doc-a"}]}]};
    const removed = sets.removeDocumentSet(value, "a");
    assert.equal(removed.changed, true);
    assert.deepEqual(removed.state.sets, []);
    assert.equal(sets.removeDocumentSet(removed.state, "a").changed, false);
});

test("document set import merge overwrites matching ids and stays bounded", () => {
    const current = {schemaVersion: 1, sets: [{setId: "a", name: "Old", entries: [{rootId: "doc-a"}]}]};
    const incoming = {schemaVersion: 1, sets: [
        {setId: "a", name: "New", entries: [{rootId: "doc-b"}]},
        {setId: "b", name: "Second", entries: [{rootId: "doc-c"}]},
    ]};
    const result = sets.mergeDocumentSets(current, incoming, {now: 20, max: 2});
    assert.equal(result.imported, 2);
    assert.equal(result.state.sets.length, 2);
    assert.equal(result.state.sets.find((item) => item.setId === "a").name, "New");
});

test("document set restore plan separates opened, pending, and missing entries", () => {
    const value = {setId: "project", name: "Project", entries: [
        {rootId: "doc-a", title: "A"}, {rootId: "doc-b", title: "B"}, {rootId: "doc-c", title: "C"},
    ]};
    const plan = sets.planDocumentSetRestore(value, new Set(["doc-a"]), new Set(["doc-a", "doc-b"]));
    assert.deepEqual(plan.opened.map((item) => item.rootId), ["doc-a"]);
    assert.deepEqual(plan.pending.map((item) => item.rootId), ["doc-b"]);
    assert.deepEqual(plan.missing.map((item) => item.rootId), ["doc-c"]);
    assert.equal(plan.canRestore, true);
});

test("document set restore plan marks an already-open set as a no-op", () => {
    const value = {setId: "project", name: "Project", entries: [{rootId: "doc-a"}]};
    const plan = sets.planDocumentSetRestore(value, new Set(["doc-a"]), new Set(["doc-a"]));
    assert.deepEqual(plan.pending, []);
    assert.deepEqual(plan.missing, []);
    assert.equal(plan.canRestore, false);
});

test("document set restore plan follows persisted entry indexes", () => {
    const value = {setId: "project", name: "Project", entries: [
        {rootId: "doc-b", index: 20},
        {rootId: "doc-a", index: 10},
        {rootId: "doc-c", index: 30},
    ]};
    const plan = sets.planDocumentSetRestore(value, new Set(), new Set(["doc-a", "doc-b", "doc-c"]));
    assert.deepEqual(plan.pending.map((item) => item.rootId), ["doc-a", "doc-b", "doc-c"]);
});

test("document set restore summary normalizes execution counters and skips", () => {
    const plan = {opened: [{rootId: "a"}], pending: [{rootId: "b"}], missing: [{rootId: "c"}]};
    const probe = {available: [{rootId: "b"}], unknown: [], missing: [{rootId: "c"}]};
    assert.deepEqual(sets.summarizeDocumentSetRestore(plan, probe, {succeeded: 1, failed: 2, cancelled: true}), {
        succeeded: 1, failed: 2, skipped: 1, missing: 1, unknown: 0, available: 1, cancelled: true, attempted: 3,
    });
    assert.deepEqual(sets.summarizeDocumentSetRestore(null, null), {
        succeeded: 0, failed: 0, skipped: 0, missing: 0, unknown: 0, available: 0, cancelled: false, attempted: 0,
    });
});

test("document set restore execution isolates failures and honors cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await sets.runDocumentSetRestore([
        {rootId: "a"}, {rootId: "b"}, {rootId: "c"}, {rootId: "d"},
    ], async (rootId) => {
        calls += 1;
        if (rootId === "b") throw new Error("missing");
        if (rootId === "c") controller.abort();
        return true;
    }, {signal: controller.signal});
    assert.equal(calls, 3);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.cancelled, true);
    assert.deepEqual(result.results.map((item) => item.rootId), ["a", "b", "c"]);
});
