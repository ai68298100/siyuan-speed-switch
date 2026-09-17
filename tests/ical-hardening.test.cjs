// T-6311 iCal 模型加固契约：只补 ical-model.test.cjs 未覆盖的真实行为。
// 参数化日期（TZID）、RFC 5545 转义、属性覆盖语义、窗口边界、URL 细节。
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeIcalSubscriptionConfig, unfoldIcalLines, parseIcalDateValue, parseIcsEvents, upcomingIcalEvents} = require('../src/ical-model.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 17, 0, 0, 0);

const vevent = (...lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", ...lines, "END:VEVENT", "END:VCALENDAR"].join("\n");

test('tzid and value parameters on date properties are stripped before parsing', () => {
    const parsed = parseIcsEvents(vevent(
        "DTSTART;TZID=Asia/Shanghai:20260917T080000",
        "DTEND;VALUE=DATE:20260918",
        "SUMMARY:参数化日期",
    ));
    assert.equal(parsed.ok, true);
    assert.ok(Number.isFinite(parsed.events[0].start), "TZID 参数剥离后按浮动本地时间解析");
    assert.equal(parsed.events[0].end > parsed.events[0].start, true);
});

test('rfc 5545 escapes resolve in summary and location', () => {
    const parsed = parseIcsEvents(vevent(
        "DTSTART:20260917T080000Z",
        "SUMMARY:逗号\\, 分号\\; 换行\\n结尾",
        "LOCATION:反斜杠\\\\结束",
    ));
    assert.equal(parsed.events[0].summary, "逗号, 分号; 换行 结尾");
    assert.equal(parsed.events[0].location, "反斜杠\\结束");
});

test('summary clamps at 256 characters', () => {
    const parsed = parseIcsEvents(vevent("DTSTART:20260917T080000Z", `SUMMARY:${"长".repeat(400)}`));
    assert.equal(parsed.events[0].summary.length, 256);
});

test('a repeated property line lets the last occurrence win', () => {
    const parsed = parseIcsEvents(vevent(
        "DTSTART:20260917T080000Z",
        "SUMMARY:第一版",
        "SUMMARY:第二版",
    ));
    assert.equal(parsed.events[0].summary, "第二版");
});

test('tab-indented continuation lines unfold like space-indented ones', () => {
    const unfolded = unfoldIcalLines("SUMMARY:折行\n\t继续");
    assert.equal(unfolded[0], "SUMMARY:折行继续");
});

test('upcoming keeps an in-progress event and drops one that ended over an hour ago', () => {
    const inProgress = {start: NOW - 3 * DAY, end: NOW + 30 * 60 * 1000, summary: "进行中", location: ""};
    const justEnded = {start: NOW - 2 * DAY, end: NOW, summary: "刚结束", location: ""};
    const longOver = {start: NOW - 3 * DAY, end: NOW - 2 * DAY, summary: "早已结束", location: ""};
    const result = upcomingIcalEvents([inProgress, justEnded, longOver], NOW, {windowDays: 14});
    assert.deepEqual(result.map((event) => event.summary), ["进行中", "刚结束"], "结束不早于 now-1h 的都在窗口内");
});

test('equal start times keep their original order', () => {
    const events = [
        {start: NOW + DAY, end: NOW + DAY, summary: "先录", location: ""},
        {start: NOW + DAY, end: NOW + DAY, summary: "后录", location: ""},
    ];
    assert.deepEqual(upcomingIcalEvents(events, NOW).map((event) => event.summary), ["先录", "后录"]);
});

test('url normalization preserves query strings and accepts uppercase .ICS', () => {
    const withQuery = normalizeIcalSubscriptionConfig({url: "https://example.com/cal.ics?token=abc"});
    assert.equal(withQuery.url, "https://example.com/cal.ics?token=abc");
    const upper = normalizeIcalSubscriptionConfig({url: "https://example.com/cal.ICS"});
    assert.notEqual(upper.url, "", ".ICS 大小写不敏感");
    const withFragment = normalizeIcalSubscriptionConfig({url: "https://example.com/cal.ics#frag"});
    assert.equal(withFragment.url, "https://example.com/cal.ics", "fragment 被静默剥离而非拒绝（钉住现状）");
});

test('title config keeps the raw text bounded without trimming', () => {
    assert.equal(normalizeIcalSubscriptionConfig({}).title, "iCal");
    assert.equal(normalizeIcalSubscriptionConfig({title: "  课程表  "}).title, "  课程表  ", "title 有界但不 trim，钉住现状");
    assert.equal(normalizeIcalSubscriptionConfig({title: `${"长".repeat(100)}`}).title.length, 64);
});
