// T-6309 小驴打卡「本月统计」桥接组件契约：月内去重天数、总量、项目排行
// （once/count 限定）、能力协商、确定空态与目录接线。
const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../src/checkin-bridge-model.js');
const home = require('../src/home-model.js');

const {buildCheckinMonthlySnapshot, readCheckinBridge} = bridge;

// 2026-09-17 为周四；当月 30 天。
const NOW = Date.UTC(2026, 8, 17, 4, 0, 0); // 本地时区按 UTC 断言保持确定性

const item = (id, extra = {}) => ({id, name: `项目-${id}`, kind: "once", ...extra});
const event = (itemId, localDate, value = 1) => ({itemId, localDate, value});

const apiOf = (items, events) => ({
    protocol: "siyuan-checkin",
    hasCapability: (name) => name === "items.read",
    getItems: () => items,
    getEvents: () => events,
});

// ---------- 快照构建 ----------
test('monthly snapshot counts distinct days and totals within the month only', () => {
    const items = [item("a"), item("b")];
    const events = [
        event("a", "2026-09-01", 1),
        event("a", "2026-09-01", 2),
        event("a", "2026-09-15", 1),
        event("b", "2026-08-30", 5),
        event("b", "2026-09-17", 3),
    ];
    const snapshot = buildCheckinMonthlySnapshot(items, events, {}, {}, NOW);
    assert.equal(snapshot.stat.value, "3/30", "去重打卡天数 / 本月总天数");
    assert.equal(snapshot.secondaryStat.value, "7", "跨月事件不计入总量");
    assert.equal(snapshot.bestDay, "2026-09-01", "单日最大值为最佳日");
    assert.equal(snapshot.emptyHint, "");
});

test('monthly ranking only lists once/count items with positive values', () => {
    const items = [
        item("counted", {kind: "count"}),
        item("amounted", {kind: "amount"}),
        item("empty"),
        item("archived", {archived: true}),
    ];
    const events = [
        event("counted", "2026-09-02", 4),
        event("amounted", "2026-09-02", 99),
        event("ghost", "2026-09-02", 7),
        event("archived", "2026-09-03", 2),
    ];
    const snapshot = buildCheckinMonthlySnapshot(items, events, {}, {}, NOW);
    assert.deepEqual(snapshot.items.map((row) => row.label), ["项目-counted"], "amount/archived/无记录项目都不进排行");
    assert.equal(snapshot.items[0].value, "4");
    assert.equal(snapshot.items[0].rank, 1);
});

test('monthly target progress and unit follow the today-widget wording', () => {
    const items = [item("goal", {kind: "count", target: 10, unit: "次"})];
    const snapshot = buildCheckinMonthlySnapshot(items, [event("goal", "2026-09-05", 6)], {}, {}, NOW);
    assert.equal(snapshot.items[0].value, "6/10 次");
    assert.equal(snapshot.items[0].done, false);
});

test('monthly limit clamps the ranking output', () => {
    const items = Array.from({length: 9}, (_, index) => item(`i${index}`));
    const events = items.map((entry, index) => event(entry.id, "2026-09-06", index + 1));
    const snapshot = buildCheckinMonthlySnapshot(items, events, {limit: 3}, {}, NOW);
    assert.equal(snapshot.items.length, 3);
    assert.equal(snapshot.items[0].value, "9", "按记录量降序");
});

test('empty month yields a determined empty state, not a failure', () => {
    const snapshot = buildCheckinMonthlySnapshot([item("a")], [], {}, {}, NOW);
    assert.equal(snapshot.items.length, 0);
    assert.equal(snapshot.stat.value, "0/30");
    assert.match(snapshot.emptyHint, /本月/);
});

// ---------- 桥接读取入口 ----------
test('readCheckinBridge routes checkin-monthly behind the items.read capability', () => {
    const items = [item("a")];
    const events = [event("a", "2026-09-10", 1)];
    const ok = readCheckinBridge("checkin-monthly", {scope: {siyuanCheckin: apiOf(items, events)}, now: NOW});
    assert.equal(ok.stat.label, "本月打卡天数");
    const absent = readCheckinBridge("checkin-monthly", {scope: {}, now: NOW});
    assert.ok(absent.emptyHint, "打卡缺席返回确定空态");
    const oldApi = {protocol: "siyuan-checkin", getItems: () => items, getEvents: () => events};
    const degraded = readCheckinBridge("checkin-monthly", {scope: {siyuanCheckin: oldApi}, now: NOW});
    assert.equal(degraded.stat.value, "1/30", "无握手方法的旧宿主按 getter 推断能力");
    const wrongProtocol = readCheckinBridge("checkin-monthly", {scope: {siyuanCheckin: {protocol: "other"}}, now: NOW});
    assert.ok(wrongProtocol.emptyHint, "协议不符必须拒绝");
});

// ---------- 目录接线 ----------
test('checkin-monthly is registered as the sixth siyuan-checkin widget', () => {
    const def = home.registerModules([]).find((entry) => entry.moduleId === "checkin-monthly");
    assert.ok(def, "目录条目存在");
    assert.equal(def.source.pluginId, "siyuan-checkin");
    assert.equal(def.source.order, 6);
    assert.equal(def.readOnly, true);
    assert.deepEqual(def.configSchema.map((field) => field.key), ["limit"]);
});
