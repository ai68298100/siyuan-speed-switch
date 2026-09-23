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

test("document set restore report classifies every entry status in plan order", () => {
    const value = {setId: "project", name: "Project", entries: [
        {rootId: "doc-a", title: "A"},
        {rootId: "doc-b", title: "B"},
        {rootId: "doc-c", title: "C"},
        {rootId: "doc-d", title: "D"},
        {rootId: "doc-e", title: "E"},
    ]};
    const plan = sets.planDocumentSetRestore(value, new Set(["doc-a"]), null);
    const probe = {available: [{rootId: "doc-b"}, {rootId: "doc-c"}], unknown: [], missing: [{rootId: "doc-d"}]};
    const execution = {succeeded: 1, failed: 1, results: [
        {rootId: "doc-b", ok: true},
        {rootId: "doc-c", ok: false, error: "open failed"},
    ]};
    const report = sets.buildDocumentSetRestoreReport(plan, probe, execution, {now: 1000});
    assert.equal(report.schemaVersion, sets.DOCUMENT_SET_RESTORE_REPORT_VERSION);
    assert.equal(report.generatedAt, 1000);
    assert.equal(report.setId, "project");
    assert.equal(report.setName, "Project");
    // 计数必须复用 summarizeDocumentSetRestore 的口径，不能与界面提示分叉
    assert.deepEqual(report.counts, {
        succeeded: 1, failed: 1, skipped: 1, missing: 1, unknown: 0, available: 2, cancelled: false, attempted: 2,
    });
    assert.deepEqual(report.entries.map((item) => [item.rootId, item.status]), [
        ["doc-a", "opened"], ["doc-b", "restored"], ["doc-c", "failed"], ["doc-d", "missing"], ["doc-e", "pending"],
    ]);
    assert.equal(report.entries[2].error, "open failed");
    assert.equal("error" in report.entries[1], false, "non-failed entries must not carry an error field");
});

test("document set restore report stays bounded and scrubs failure text", () => {
    // 刻意传入超限的 set（生产路径已被 normalizeSet 截断）：报告不能信任调用方
    const entries = Array.from({length: 45}, (_, index) => ({rootId: `doc-${index}`, title: `T${index}`, index}));
    const plan = {set: {setId: "big", name: "Big", entries}, opened: [], pending: []};
    const execution = {succeeded: 0, failed: 1, results: [
        {rootId: "doc-0", ok: false, error: "x".repeat(400) + "\u0000\u001f"},
    ]};
    const report = sets.buildDocumentSetRestoreReport(plan, {missing: []}, execution, {now: 1});
    assert.equal(report.entries.length, sets.DOCUMENT_SET_ENTRY_MAX, "entries must stay within the entry ceiling");
    assert.ok(report.entries[0].error.length <= 160, "failure text must be truncated before export");
    assert.equal(/[\u0000-\u001f\u007f]/.test(JSON.stringify(report)), false,
        "the exported report must not carry control characters");
});

test("document set restore report is deterministic and tolerates garbage input", () => {
    const plan = {set: {setId: "p", name: "P", entries: [{rootId: "doc-a", title: "A", index: 0}]}, opened: [], pending: []};
    const first = sets.buildDocumentSetRestoreReport(plan, {missing: []}, {results: []}, {now: 42});
    const second = sets.buildDocumentSetRestoreReport(plan, {missing: []}, {results: []}, {now: 42});
    assert.deepEqual(first, second, "same inputs and same injected clock must produce the same report");
    assert.equal(JSON.parse(JSON.stringify(first)).generatedAt, 42, "the report must survive a JSON round-trip");
    const empty = sets.buildDocumentSetRestoreReport(null, null, null, {now: 7});
    assert.equal(empty.setId, "");
    assert.equal(empty.setName, "");
    assert.deepEqual(empty.entries, []);
    assert.deepEqual(empty.counts, {
        succeeded: 0, failed: 0, skipped: 0, missing: 0, unknown: 0, available: 0, cancelled: false, attempted: 0,
    });
});

test("document set restore report keeps the first result per id and leaves untried entries pending", () => {
    const plan = {set: {setId: "p", name: "P", entries: [
        {rootId: "doc-a", title: "A", index: 0},
        {rootId: "doc-b", title: "B", index: 1},
    ]}, opened: [], pending: []};
    const execution = {succeeded: 1, failed: 0, cancelled: true, results: [
        {rootId: "doc-a", ok: true},
        {rootId: "doc-a", ok: false, error: "late retry"},
    ]};
    const report = sets.buildDocumentSetRestoreReport(plan, {}, execution, {now: 5});
    assert.equal(report.counts.cancelled, true);
    assert.equal(report.entries[0].status, "restored", "a duplicated id must be judged by its first result only");
    assert.equal("error" in report.entries[0], false);
    assert.equal(report.entries[1].status, "pending", "an entry never attempted must not be reported as failed");
});

test("document sets: cycle picker wraps and requires at least two sets", () => {
    const {pickNextDocumentSet} = require("../src/document-sets.js");
    const sets = [
        {setId: "s1", name: "写作"},
        {setId: "s2", name: "阅读"},
        {setId: "s3", name: "行政"},
    ];
    assert.equal(pickNextDocumentSet(sets, "s1").setId, "s2");
    assert.equal(pickNextDocumentSet(sets, "s3").setId, "s1", "wraps from the last set to the first");
    assert.equal(pickNextDocumentSet(sets, "missing").setId, "s1", "unknown current id starts from the first set");
    assert.equal(pickNextDocumentSet([sets[0]], "s1"), null, "a single set is not worth cycling");
    assert.equal(pickNextDocumentSet([], ""), null);
    assert.equal(pickNextDocumentSet([{name: "no id"}, {name: "also no id"}], ""), null, "entries without setId are ignored");
});

test("document sets: overwrite save stashes the previous content as a version (T-6829)", () => {
    const {normalizeDocumentSets, upsertDocumentSet, DOCUMENT_SET_VERSION_MAX} = require("../src/document-sets.js");
    const first = sets.upsertDocumentSet(null, {setId: "set-1", name: "项目", entries: [{rootId: "20260924000000-aaaaaaaa"}, {rootId: "20260924000000-bbbbbbbb"}]}, {now: 1000});
    assert.deepEqual(first.item.versions, [], "首次保存没有版本");
    // 覆盖保存：内容变化 → 前一版入栈
    const second = sets.upsertDocumentSet(first.state, {setId: "set-1", name: "项目", entries: [{rootId: "20260924000000-aaaaaaaa"}]}, {now: 2000});
    assert.equal(second.item.versions.length, 1);
    assert.equal(second.item.versions[0].savedAt, 1000);
    assert.equal(second.item.versions[0].entries.length, 2);
    // 内容完全相同的覆盖：不产生噪音版本
    const third = sets.upsertDocumentSet(second.state, {setId: "set-1", name: "项目", entries: [{rootId: "20260924000000-aaaaaaaa"}]}, {now: 3000});
    assert.equal(third.item.versions.length, 1, "相同内容覆盖不新增版本");
    // 容量上限 FIFO
    let state = third.state;
    for (let round = 0; round < DOCUMENT_SET_VERSION_MAX + 2; round++) {
        const entry = {rootId: `20260924000000-c${round}aaaaa`};
        state = sets.upsertDocumentSet(state, {setId: "set-1", name: "项目", entries: [entry]}, {now: 4000 + round}).state;
    }
    const capped = normalizeDocumentSets(state).sets[0];
    assert.equal(capped.versions.length, DOCUMENT_SET_VERSION_MAX, "版本栈 FIFO 有界");
});

test("document sets: rollback swaps current with latest version and is reversible (T-6829)", () => {
    const {rollbackDocumentSet} = require("../src/document-sets.js");
    let state = null;
    state = sets.upsertDocumentSet(state, {setId: "set-r", name: "研究", entries: [{rootId: "20260924000000-aaaaaaaa"}]}, {now: 1000}).state;
    state = sets.upsertDocumentSet(state, {setId: "set-r", name: "研究", entries: [{rootId: "20260924000000-bbbbbbbb"}, {rootId: "20260924000000-aaaaaaaa"}]}, {now: 2000}).state;
    // 当前 = b+a，版本[0] = a（savedAt 1000）
    const rolled = rollbackDocumentSet(state, "set-r", {now: 3000});
    assert.equal(rolled.changed, true);
    assert.deepEqual(rolled.item.entries.map((entry) => entry.rootId), ["20260924000000-aaaaaaaa"], "回滚到版本[0]");
    assert.equal(rolled.item.versions[0].savedAt, 3000, "当前内容成为最新版本");
    assert.deepEqual(rolled.item.versions[0].entries.map((entry) => entry.rootId), ["20260924000000-bbbbbbbb", "20260924000000-aaaaaaaa"]);
    // 再回滚一次回到 b+a —— 回滚可逆
    const again = rollbackDocumentSet(rolled.state, "set-r", {now: 4000});
    assert.deepEqual(again.item.entries.map((entry) => entry.rootId), ["20260924000000-bbbbbbbb", "20260924000000-aaaaaaaa"]);
    // 无版本/未知 id 安全
    assert.equal(rollbackDocumentSet(state, "set-nothing", {now: 1}).changed, false);
    const empty = rollbackDocumentSet([{setId: "set-e", name: "空", entries: [{rootId: "20260924000000-aaaaaaaa"}], createdAt: 1, updatedAt: 1}], "set-e", {now: 1});
    assert.equal(empty.changed, false);
});
