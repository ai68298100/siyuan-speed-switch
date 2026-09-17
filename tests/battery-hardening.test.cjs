// T-6314 电池模型加固契约：只补 battery-model.test.cjs 未覆盖的真实行为——
// allowEmptyLevel 逃生门、边界值（上限/负值/NaN）、时间估计的截断语义、
// formatDuration 的亚分钟与标签净化。
const test = require('node:test');
const assert = require('node:assert/strict');
const {TIME_ESTIMATE_MAX_SECONDS, normalizeBatteryReading, normalizeTimeEstimate, formatDuration} = require('../src/battery-model.js');

test('allowEmptyLevel opt-in accepts a genuine zero reading', () => {
    const strict = normalizeBatteryReading({level: 0, charging: false});
    assert.equal(strict.level, null, "缺省时 0 视为实现缺陷");
    const optedIn = normalizeBatteryReading({level: 0, allowEmptyLevel: true, charging: false});
    assert.equal(optedIn.level, 0);
    assert.equal(optedIn.levelPercent, 0);
});

test('level boundaries: one and the cap are valid, negatives and NaN are not', () => {
    assert.equal(normalizeBatteryReading({level: 1}).levelPercent, 100);
    assert.equal(normalizeBatteryReading({level: 0.5}).levelPercent, 50);
    assert.equal(normalizeBatteryReading({level: 1.5}).level, null);
    assert.equal(normalizeBatteryReading({level: -0.1}).level, null);
    assert.equal(normalizeBatteryReading({level: Number.NaN}).level, null);
    assert.equal(normalizeBatteryReading({level: "0.75"}).level, 0.75, "字符串数字按 Number 语义放行");
});

test('charging default is false unless literally true', () => {
    assert.equal(normalizeBatteryReading({}).charging, false);
    assert.equal(normalizeBatteryReading({charging: "yes"}).charging, false);
    assert.equal(normalizeBatteryReading({charging: 1}).charging, false);
    assert.equal(normalizeBatteryReading({charging: true}).charging, true);
});

test('time estimates truncate fractional seconds and pin the weekly ceiling', () => {
    assert.equal(normalizeTimeEstimate(3661.9), 3661);
    assert.equal(normalizeTimeEstimate(TIME_ESTIMATE_MAX_SECONDS), TIME_ESTIMATE_MAX_SECONDS, "恰好一周仍有效");
    assert.equal(normalizeTimeEstimate(TIME_ESTIMATE_MAX_SECONDS + 1), null, "超过一周视为无有效估计");
    assert.equal(normalizeTimeEstimate(Infinity), null);
    assert.equal(normalizeTimeEstimate(0), null);
    assert.equal(normalizeTimeEstimate(-10), null);
});

test('formatDuration omits empty minutes and floors sub-minute estimates to one minute', () => {
    assert.equal(formatDuration(3600), "1 小时");
    assert.equal(formatDuration(3660), "1 小时 1 分钟");
    assert.equal(formatDuration(59), "1 分钟", "不足一分钟向下取整为 1 分钟显示");
    assert.equal(formatDuration(0), "");
    assert.equal(formatDuration(Number.NaN), "");
});

test('formatDuration labels are sanitized with fallbacks', () => {
    assert.equal(formatDuration(3600, {hours: `${"标".repeat(50)}`}), `1 ${"标".repeat(24)}`, "超长标签截断到 24");
    assert.equal(formatDuration(3600, {hours: "   "}), "1 小时", "清洗后为空回退默认");
    assert.equal(formatDuration(60, {hours: `${"标".repeat(50)}`}), "1 分钟", "纯分钟耗时不会渲染小时标签");
});
