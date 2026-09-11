const {test} = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/home-model.js');

test("insight-style widgets are registered with bounded sizes", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    const noteStats = byId.get("note-stats");
    assert.ok(noteStats, "note-stats registered");
    assert.deepEqual(noteStats.sizes, ["small", "medium"]);
    const yearProgress = byId.get("year-progress");
    assert.ok(yearProgress, "year-progress registered");
    assert.deepEqual(yearProgress.sizes, ["xs", "small"]);
    const recentEdits = byId.get("recent-edits");
    assert.ok(recentEdits, "recent-edits registered");
    assert.deepEqual(recentEdits.sizes, ["medium", "wide", "large"]);
});

test("year progress percentage stays within bounds for leap and non-leap years", () => {
    // 与适配器同口径的纯计算（闰年 366 天 / 平年 365 天）
    const percentFor = (year, month, day) => {
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);
        const dayMs = 86400000;
        const total = Math.round((end.getTime() - start.getTime()) / dayMs);
        const elapsed = Math.min(total, Math.floor((new Date(year, month, day).getTime() - start.getTime()) / dayMs) + 1);
        return {total, percent: Math.round(elapsed / total * 100), elapsed, remaining: total - elapsed};
    };
    assert.equal(percentFor(2024, 0, 1).total, 366); // 闰年
    assert.equal(percentFor(2025, 0, 1).total, 365); // 平年
    assert.equal(percentFor(2025, 0, 1).percent, 0);   // 元旦约为 0%（1/365 → 0）
    assert.equal(percentFor(2025, 11, 31).percent, 100); // 年末 100%
    const mid = percentFor(2025, 5, 30);
    assert.ok(mid.percent > 40 && mid.percent < 60);
    assert.ok(mid.elapsed + mid.remaining === mid.total);
});
