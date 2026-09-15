const test = require("node:test");
const assert = require("node:assert/strict");
const battery = require("../src/battery-model.js");

test("battery reading normalizes level to a bounded percent", () => {
    assert.equal(battery.normalizeBatteryReading({level: 0.856, charging: true}).levelPercent, 86);
    assert.equal(battery.normalizeBatteryReading({level: 0.5, charging: false}).level, 0.5);
});
test("battery reading rejects out-of-range levels", () => {
    assert.equal(battery.normalizeBatteryReading({level: 1.4}).level, null);
    assert.equal(battery.normalizeBatteryReading({level: -0.1}).level, null);
    assert.equal(battery.normalizeBatteryReading({level: "bad"}).level, null);
    assert.equal(battery.normalizeBatteryReading(null).level, null);
});
test("battery reading treats level zero as an implementation defect", () => {
    // Chromium 的部分 Android WebView 曾出现 level 恒 0 的缺陷：0 视为无效而非"没电"。
    assert.equal(battery.normalizeBatteryReading({level: 0, charging: true}).level, null);
});
test("battery time estimates reject non-finite and overlong values", () => {
    assert.equal(battery.normalizeTimeEstimate(Number.POSITIVE_INFINITY), null);
    assert.equal(battery.normalizeTimeEstimate(-5), null);
    assert.equal(battery.normalizeTimeEstimate(battery.TIME_ESTIMATE_MAX_SECONDS + 1), null);
    assert.equal(battery.normalizeTimeEstimate(5400), 5400);
});
test("battery duration format hours and minutes", () => {
    assert.equal(battery.formatDuration(5400, {hours: "小时", minutes: "分钟"}), "1 小时 30 分钟");
    assert.equal(battery.formatDuration(3600, {hours: "小时", minutes: "分钟"}), "1 小时");
    assert.equal(battery.formatDuration(300, {hours: "小时", minutes: "分钟"}), "5 分钟");
    assert.equal(battery.formatDuration(0, {hours: "小时", minutes: "分钟"}), "");
});
test("battery snapshot renders charging state with estimate", () => {
    const snapshot = battery.buildBatterySnapshot({level: 0.85, charging: true, chargingTime: 5400, dischargingTime: Infinity}, {
        title: "设备电量", charging: "充电中", discharging: "使用电池", hours: "小时", minutes: "分钟", source: "来源",
    });
    assert.equal(snapshot.stat.value, "85%");
    assert.equal(snapshot.stat.label, "充电中");
    assert.equal(snapshot.items[0].value, "85% · 1 小时 30 分钟");
    assert.match(snapshot.items[1].label, /来源：Battery Status API/);
});
test("battery snapshot omits missing time estimates", () => {
    const snapshot = battery.buildBatterySnapshot({level: 0.42, charging: false, dischargingTime: Number.POSITIVE_INFINITY}, {discharging: "使用电池"});
    assert.equal(snapshot.items[0].value, "42%");
});
test("battery snapshot returns null for unusable readings", () => {
    assert.equal(battery.buildBatterySnapshot({level: 0, charging: true}, {}), null);
    assert.equal(battery.buildBatterySnapshot({level: 2, charging: true}, {}), null);
    assert.equal(battery.buildBatterySnapshot(null, {}), null);
});
