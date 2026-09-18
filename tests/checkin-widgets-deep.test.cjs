const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../src/home-model.js");
const bridge = require("../src/checkin-bridge-model.js");

const NOW = Date.parse("2026-09-17T10:00:00");
const items = [
    {id: "a", name: "阅读", kind: "count", group: "学习", target: 1},
    {id: "b", name: "冥想", kind: "once", group: "生活"},
];
const events = [
    {itemId: "a", localDate: "2026-09-17", value: 1},
    {itemId: "a", localDate: "2026-09-16", value: 1},
    {itemId: "b", localDate: "2026-09-17", value: 1},
];
const occasions = [
    {name: "缴费", occurrenceDate: "2026-09-20", kind: "日程", daysUntil: 3},
    {name: "复查", occurrenceDate: "2026-09-10", kind: "提醒", daysUntil: -7},
];

test("checkin today group badge is gated without changing the done math", () => {
    const standard = bridge.buildCheckinTodaySnapshot(items, events, {}, {}, NOW);
    assert.equal(standard.items[0].secondary, "学习", "分组默认显示");
    assert.equal(standard.stat.value, "2/2");
    const hidden = bridge.buildCheckinTodaySnapshot(items, events, {showGroup: "否"}, {}, NOW);
    assert.equal(hidden.items[0].secondary, "");
    assert.equal(hidden.stat.value, "2/2", "分组开关不影响完成统计");
});

test("checkin streak and monthly rank toggles keep leaderboard order", () => {
    const streak = bridge.buildCheckinStreakSnapshot(items, events, {}, {}, NOW);
    assert.equal(streak.items[0].rank, 1);
    const streakNoRank = bridge.buildCheckinStreakSnapshot(items, events, {showRank: "否"}, {}, NOW);
    assert.equal(streakNoRank.items[0].rank, undefined);
    assert.equal(streakNoRank.items[0].value, streak.items[0].value, "排名开关不影响连续天数");
    const monthly = bridge.buildCheckinMonthlySnapshot(items, events, {}, {}, NOW);
    assert.equal(monthly.items[0].rank, 1);
    const monthlyNoRank = bridge.buildCheckinMonthlySnapshot(items, events, {showRank: "否"}, {}, NOW);
    assert.equal(monthlyNoRank.items[0].rank, undefined);
    assert.equal(monthlyNoRank.items[0].label, monthly.items[0].label);
});

test("checkin occasions kind badge is gated and dates still resolve", () => {
    const standard = bridge.buildCheckinOccasionsSnapshot(occasions, {}, {}, NOW);
    assert.equal(standard.items[0].label, "复查", "已过期事项按 daysUntil 升序排前");
    assert.equal(standard.items[0].secondary, "提醒");
    assert.equal(standard.items[1].secondary, "日程");
    assert.equal(standard.items[0].value, "2026-09-10", "过期事项按原始日期回显");
    assert.equal(standard.items[1].value, "3 天后", "未来事项显示相对天数");
    const hidden = bridge.buildCheckinOccasionsSnapshot(occasions, {showKind: "否"}, {}, NOW);
    assert.equal(hidden.items[0].secondary, "");
    assert.equal(hidden.items[1].secondary, "");
    assert.equal(hidden.items[1].secondary, "");
});

test("checkin bridge schemas stay semantic and bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("checkin-today").configSchema.map((f) => f.key), ["limit", "group", "showGroup"]);
    assert.deepEqual(byId.get("checkin-streak").configSchema.map((f) => f.key), ["limit", "showRank"]);
    assert.deepEqual(byId.get("checkin-occasions").configSchema.map((f) => f.key), ["limit", "showKind"]);
    assert.deepEqual(byId.get("checkin-monthly").configSchema.map((f) => f.key), ["limit", "showRank"]);
    // 热力图/周报/摘要保持既有字段（bridge 层无可安全外放的新显示项，已复核）
    assert.deepEqual(byId.get("checkin-year-heatmap").configSchema.map((f) => f.key), ["yearOffset"]);
    assert.deepEqual(byId.get("checkin-weekly").configSchema.map((f) => f.key), ["limit"]);
    for (const id of ["checkin-today", "checkin-streak", "checkin-occasions", "checkin-monthly", "checkin-year-heatmap", "checkin-weekly"]) {
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
});
