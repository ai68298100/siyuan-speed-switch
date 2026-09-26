"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {buildSnippetDiff, summarizeDiff, DIFF_MAX_LINES} = require("../src/snippet-diff.js");

const rowsOf = (diff, type) => diff.rows.filter((row) => row.type === type).map((row) => row.text);

test("snippet diff: identical content yields zero hunks", () => {
    const diff = buildSnippetDiff("p { color: red; }", "p { color: red; }");
    assert.equal(diff.degraded, false);
    assert.deepEqual(diff.hunks, []);
    assert.equal(diff.added, 0);
    assert.equal(diff.removed, 0);
});

test("snippet diff: pure insertion appends ins rows with target line numbers", () => {
    const diff = buildSnippetDiff("a\nb", "a\nb\nc");
    assert.deepEqual(rowsOf(diff, "ins"), ["c"]);
    assert.deepEqual(rowsOf(diff, "del"), []);
    assert.equal(diff.rows.at(-1).bLine, 3);
    assert.equal(diff.added, 1);
});

test("snippet diff: pure deletion keeps source line numbers", () => {
    const diff = buildSnippetDiff("a\nb\nc", "a");
    assert.deepEqual(rowsOf(diff, "del"), ["b", "c"]);
    assert.deepEqual(rowsOf(diff, "ins"), []);
    assert.equal(diff.rows[1].aLine, 2);
    assert.equal(diff.removed, 2);
});

test("snippet diff: modified line pairs del and ins", () => {
    const diff = buildSnippetDiff("color: red;", "color: blue;");
    assert.deepEqual(rowsOf(diff, "del"), ["color: red;"]);
    assert.deepEqual(rowsOf(diff, "ins"), ["color: blue;"]);
});

test("snippet diff: reordered lines become del plus ins, not silent context", () => {
    const diff = buildSnippetDiff("x\ny", "y\nx");
    assert.ok(diff.hunks.length >= 1);
    // LCS 保留一行作 context（确定性 tie-break 删除先行的 x），另一行呈 del+ins。
    assert.deepEqual(rowsOf(diff, "del"), ["x"]);
    assert.deepEqual(rowsOf(diff, "ins"), ["x"]);
    assert.deepEqual(rowsOf(diff, "context"), ["y"]);
});

test("snippet diff: empty baseline or candidate stays bounded and typed", () => {
    const insertAll = buildSnippetDiff("", "p {}");
    assert.deepEqual(rowsOf(insertAll, "ins"), ["p {}"]);
    const deleteAll = buildSnippetDiff("p {}", "");
    assert.deepEqual(rowsOf(deleteAll, "del"), ["p {}"]);
    const bothEmpty = buildSnippetDiff("", "");
    assert.deepEqual(bothEmpty.hunks, []);
});

test("snippet diff: distant changes split into separate hunks with context", () => {
    const before = Array.from({length: 30}, (_, i) => `line-${i}`).join("\n");
    const after = before
        .replace("line-2", "line-2 CHANGED")
        .replace("line-25", "line-25 CHANGED");
    const diff = buildSnippetDiff(before, after);
    assert.equal(diff.hunks.length, 2, "changes 23 lines apart must not merge");
    for (const hunk of diff.hunks) {
        assert.ok(hunk.rows.length >= 2, "each hunk carries context rows");
        assert.ok(hunk.rows.some((row) => row.type !== "context"), "each hunk contains its change");
    }
});

test("snippet diff: nearby changes merge into one hunk", () => {
    const before = "a\nb\nc\nd\ne\nf";
    const after = "a\nB\nc\nD\ne\nf";
    const diff = buildSnippetDiff(before, after);
    assert.equal(diff.hunks.length, 1, "changes within context distance must merge");
});

test("snippet diff: oversized input degrades to a single whole-block hunk without rows", () => {
    const big = Array.from({length: DIFF_MAX_LINES + 1}, (_, i) => `l${i}`).join("\n");
    const diff = buildSnippetDiff("small", big);
    assert.equal(diff.degraded, true);
    assert.equal(diff.hunks.length, 1);
    assert.deepEqual(diff.rows, [], "degraded diff must not expand rows");
    assert.equal(diff.added, DIFF_MAX_LINES + 1);
    assert.equal(diff.removed, 1);
});

test("snippet diff: summary reports hunks, line delta and byte delta", () => {
    const before = "a\nb\nc";
    const after = "a\nB\nc\nd";
    const diff = buildSnippetDiff(before, after);
    const summary = summarizeDiff(before, after, diff);
    assert.equal(summary.hunks, diff.hunks.length);
    assert.equal(summary.added, 2);
    assert.equal(summary.removed, 1);
    assert.equal(summary.byteDelta, Buffer.byteLength(after) - Buffer.byteLength(before));
    assert.equal(summarizeDiff(before, before, buildSnippetDiff(before, before)).byteDelta, 0);
});
