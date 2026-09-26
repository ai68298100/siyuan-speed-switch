"use strict";

// T-6915（ADR 0083 D1）：行级 diff 纯函数。候选与草稿都是有界文本（≤64 KiB），
// 超过行数上限的对比降级为"整块替换"单 hunk，不猜语义、不截断原文。
const DIFF_MAX_LINES = 1200;
const DIFF_CONTEXT = 3;
const encoder = new TextEncoder();

function splitLines(content) {
    // 尾随换行会多出一个空元素——两侧对称处理，diff 结果仍正确。
    return String(content || "").split(/\r\n|\r|\n/);
}

function lcsRows(a, b) {
    const n = a.length;
    const m = b.length;
    const width = m + 1;
    const table = new Int32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[i * width + j] = a[i] === b[j]
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
    }
    const rows = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            rows.push({type: "context", text: a[i], aLine: i + 1, bLine: j + 1});
            i++; j++;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            rows.push({type: "del", text: a[i], aLine: i + 1, bLine: 0});
            i++;
        } else {
            rows.push({type: "ins", text: b[j], aLine: 0, bLine: j + 1});
            j++;
        }
    }
    while (i < n) { rows.push({type: "del", text: a[i], aLine: i + 1, bLine: 0}); i++; }
    while (j < m) { rows.push({type: "ins", text: b[j], aLine: 0, bLine: j + 1}); j++; }
    return rows;
}

// 变更簇间距 ≤ 2×上下文 时并入同一 hunk；簇范围各取 CONTEXT 行上下文，
// 间距约束保证范围互不重叠（每个 context 行只归属一个 hunk）。
function groupHunks(rows) {
    const changeIndexes = [];
    rows.forEach((row, index) => {
        if (row.type !== "context") changeIndexes.push(index);
    });
    if (!changeIndexes.length) return [];
    const clusters = [];
    let start = changeIndexes[0];
    let last = changeIndexes[0];
    for (let k = 1; k < changeIndexes.length; k++) {
        if (changeIndexes[k] - last > DIFF_CONTEXT * 2 + 1) {
            clusters.push([start, last]);
            start = changeIndexes[k];
        }
        last = changeIndexes[k];
    }
    clusters.push([start, last]);
    return clusters.map(([first, end]) => {
        const from = Math.max(0, first - DIFF_CONTEXT);
        const to = Math.min(rows.length - 1, end + DIFF_CONTEXT);
        return {from, to, rows: rows.slice(from, to + 1)};
    });
}

function buildSnippetDiff(before, after) {
    const a = splitLines(before);
    const b = splitLines(after);
    if (a.length > DIFF_MAX_LINES || b.length > DIFF_MAX_LINES) {
        return {degraded: true, rows: [], hunks: [{from: 0, to: 0, rows: []}], added: b.length, removed: a.length};
    }
    const rows = lcsRows(a, b);
    const hunks = groupHunks(rows);
    let added = 0;
    let removed = 0;
    for (const row of rows) {
        if (row.type === "ins") added++;
        else if (row.type === "del") removed++;
    }
    return {degraded: false, rows, hunks, added, removed};
}

function summarizeDiff(before, after, diff) {
    const byteDelta = encoder.encode(String(after || "")).byteLength - encoder.encode(String(before || "")).byteLength;
    return {hunks: diff.hunks.length, added: diff.added, removed: diff.removed, byteDelta};
}

module.exports = {buildSnippetDiff, summarizeDiff, DIFF_MAX_LINES, DIFF_CONTEXT};
