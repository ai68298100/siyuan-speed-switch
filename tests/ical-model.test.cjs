const test = require('node:test');
const assert = require('node:assert/strict');
const ical = require('../src/ical-model.js');

const {
    normalizeIcalSubscriptionConfig,
    allowedIcalUrlShape,
    unfoldIcalLines,
    parseIcalDateValue,
    parseIcsEvents,
    upcomingIcalEvents,
} = ical;

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 17, 0, 0, 0); // 2026-09-17 UTC

const icsOf = (...events) => [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events,
    "END:VCALENDAR",
].join("\n");

const vevent = (start, end, summary) => `BEGIN:VEVENT\nDTSTART:${start}\nDTEND:${end}\nSUMMARY:${summary}\nEND:VEVENT`;

// ---------- 配置归一化 ----------
test('ical config accepts https .ics url and clamps bounds', () => {
    const config = normalizeIcalSubscriptionConfig({
        url: "https://example.com/calendar.ics?token=abc",
        windowDays: 999,
        maxEvents: 999,
        title: "课程表",
    });
    assert.equal(config.url, "https://example.com/calendar.ics?token=abc");
    assert.equal(config.windowDays, 60);
    assert.equal(config.maxEvents, 12);
    assert.equal(config.title, "课程表");
});
test('ical config rejects non-https public transport and non-ics paths', () => {
    assert.equal(normalizeIcalSubscriptionConfig({url: "http://example.com/calendar.ics"}).url, "");
    assert.equal(normalizeIcalSubscriptionConfig({url: "https://example.com/feed.rss"}).url, "");
});
test('ical config allows http for local hosts only', () => {
    assert.equal(normalizeIcalSubscriptionConfig({url: "http://localhost/cal.ics"}).url, "http://localhost/cal.ics");
    assert.equal(normalizeIcalSubscriptionConfig({url: "http://192.168.1.2/cal.ics"}).url, "");
});
test('ical config rejects urls with embedded credentials', () => {
    assert.equal(normalizeIcalSubscriptionConfig({url: "https://user:pass@example.com/calendar.ics"}).url, "");
});
test('ical url shape helper mirrors config normalization', () => {
    assert.equal(allowedIcalUrlShape("https://example.com/calendar.ics"), true);
    assert.equal(allowedIcalUrlShape("https://example.com/calendar.ics?token=x"), true);
    assert.equal(allowedIcalUrlShape("javascript:alert(1)"), false);
    assert.equal(allowedIcalUrlShape("not a url"), false);
});

// ---------- 日期解析 ----------
test('ical date parsing handles date-only, floating and utc forms', () => {
    assert.equal(parseIcalDateValue("20260917"), Date.UTC(2026, 8, 17));
    const utc = parseIcalDateValue("20260917T083000Z");
    assert.equal(utc, Date.UTC(2026, 8, 17, 8, 30, 0));
    const floating = parseIcalDateValue("20260917T083000");
    const expected = new Date(2026, 8, 17, 8, 30, 0).getTime();
    assert.equal(floating, expected);
});
test('ical date parsing rejects malformed values', () => {
    assert.equal(parseIcalDateValue("2026-09-17"), null);
    assert.equal(parseIcalDateValue("20260917T0830"), null);
    assert.equal(parseIcalDateValue("drop table"), null);
    assert.equal(parseIcalDateValue(""), null);
});

// ---------- 折行展开 ----------
test('ical unfolding joins continuation lines', () => {
    const unfolded = unfoldIcalLines([
        "BEGIN:VCALENDAR",
        "SUMMARY:很长的摘要被折成",
        " 两行来满足 75 字节限制",
        "END:VCALENDAR",
    ].join("\n"));
    assert.deepEqual(unfolded, ["BEGIN:VCALENDAR", "SUMMARY:很长的摘要被折成两行来满足 75 字节限制", "END:VCALENDAR"]);
});

// ---------- 解析 ----------
test('ical parsing extracts bounded event fields', () => {
    const result = parseIcsEvents(icsOf(
        vevent("20260918T090000Z", "20260918T100000Z", "周会\\,例会"),
        vevent("20260919", "20260920", "全天事件"),
    ));
    assert.equal(result.ok, true);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].summary, "周会,例会");
    assert.equal(result.events[1].start, Date.UTC(2026, 8, 19));
    assert.equal(result.events[1].end, Date.UTC(2026, 8, 20));
});
test('ical parsing skips events without start or summary', () => {
    const result = parseIcsEvents(icsOf(
        "BEGIN:VEVENT\nDTEND:20260918T100000Z\nEND:VEVENT",
        vevent("20260918T090000Z", "20260918T100000Z", "有效事件"),
    ));
    assert.equal(result.events.length, 1);
});
test('ical parsing rejects non-calendar payloads', () => {
    assert.deepEqual(parseIcsEvents("<html>not a calendar</html>"), {ok: false, reason: "parse_failed", events: []});
    assert.deepEqual(parseIcsEvents(""), {ok: false, reason: "parse_failed", events: []});
});
test('ical parsing rejects oversized sources instead of silently truncating', () => {
    const big = icsOf(vevent("20260918T090000Z", "20260918T100000Z", "x")) + " ".repeat(ical.ICAL_MAX_SOURCE_BYTES + 1);
    assert.deepEqual(parseIcsEvents(big), {ok: false, reason: "parse_failed", events: []});
});
test('ical parsing caps parsed events at the bounded limit', () => {
    const events = [];
    for (let i = 0; i < 600; i += 1) {
        const day = String(18 + (i % 5)).padStart(2, "0");
        events.push(vevent(`202609${day}T0${i % 10}0000Z`, `202609${day}T100000Z`, `事件 ${i}`));
    }
    const result = parseIcsEvents(icsOf(...events), {maxParsedEvents: 500});
    assert.equal(result.events.length, 500);
});

// ---------- upcoming 过滤 ----------
test('upcoming filters past events and enforces the horizon', () => {
    const events = [
        {start: now - 3 * DAY, end: now - 2 * DAY, summary: "已结束", location: ""},
        {start: now + DAY, end: now + DAY + 3600000, summary: "明天", location: ""},
        {start: now + 40 * DAY, end: now + 41 * DAY, summary: "超出窗口", location: ""},
    ];
    const upcoming = upcomingIcalEvents(events, now, {windowDays: 14, maxEvents: 6});
    assert.deepEqual(upcoming.map((e) => e.summary), ["明天"]);
});
test('upcoming sorts by start and caps at max events', () => {
    const events = [
        {start: now + 3 * DAY, end: now + 3 * DAY + 1, summary: "晚", location: ""},
        {start: now + 1 * DAY, end: now + 1 * DAY + 1, summary: "早", location: ""},
        {start: now + 2 * DAY, end: now + 2 * DAY + 1, summary: "中", location: ""},
    ];
    const upcoming = upcomingIcalEvents(events, now, {maxEvents: 2});
    assert.deepEqual(upcoming.map((e) => e.summary), ["早", "中"]);
});
test('upcoming tolerates non-array input', () => {
    assert.deepEqual(upcomingIcalEvents(null, now), []);
    assert.deepEqual(upcomingIcalEvents("events", now), []);
});

// ---------- 稳定失败 token ----------
test('ical failure reasons are stable tokens', () => {
    assert.deepEqual([...ical.ICAL_FAILURE_REASONS], ["invalid_url", "parse_failed", "empty"]);
});

test('yearly rrule expands by year with leap-day skip (T-6693)', () => {
    const CRLF = String.fromCharCode(13, 10);
    const ics = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Asia/Shanghai:20240310T090000',
        'DTEND;TZID=Asia/Shanghai:20240310T100000',
        'SUMMARY:周年纪念',
        'RRULE:FREQ=YEARLY;COUNT=3',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join(CRLF);
    // 锚 2024-03-10、COUNT=3 → 2024/2025/2026 各一次（均 ≤ now+60 天地平线）
    const past = parseIcsEvents(ics, {now: new Date(2026, 11, 1, 12).getTime()});
    assert.ok(past, 'parse succeeds');
    assert.equal(past.events.length, 3, 'COUNT=3 expands to three yearly occurrences');
    assert.deepEqual(past.events.map((event) => new Date(event.start).getFullYear()), [2024, 2025, 2026]);
    // 平年 2/29 跳过：锚 2024-02-29，INTERVAL=2 → 2024、2026 发生；2025（平年）不发生
    const leap = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Asia/Shanghai:20240229T090000',
        'SUMMARY:闰日',
        'RRULE:FREQ=YEARLY;INTERVAL=2',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join(CRLF);
    const events = parseIcsEvents(leap, {now: new Date(2025, 5, 1).getTime()});
    // now=2025-06、地平线 60 天：2024-02-29 锚点发生保留；2025-02-29 不存在（平年）被跳过
    assert.equal(events.events.length, 1, 'only the leap-year anchor occurrence is inside the horizon');
    assert.equal(new Date(events.events[0].start).getFullYear(), 2024);
    assert.equal(events.events[0].summary, '闰日');
});

test('monthly byday ordinals expand nth and last weekday occurrences (T-6695b)', () => {
    const lines = (byday) => [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Asia/Shanghai:20260113T090000',
        'SUMMARY:双周会',
        'RRULE:FREQ=MONTHLY;BYDAY=' + byday + ';COUNT=3',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join(String.fromCharCode(13, 10));
    const dayOf = (result) => result.events.map((event) => event.start && new Date(event.start).getDate());
    const second = parseIcsEvents(lines('2TU'), {now: new Date(2026, 0, 20).getTime()});
    assert.deepEqual(dayOf(second), [13, 10, 10], 'the 2nd Tuesday of Jan/Feb/Mar 2026');
    const last = parseIcsEvents(lines('-1FR'), {now: new Date(2026, 0, 31).getTime()});
    assert.deepEqual(dayOf(last), [30, 27, 27], 'the last Fridays of Jan/Feb/Mar 2026 (COUNT=3)');
    // 无序数裸星期（TU）在 MONTHLY 语义未支持 → 回退月内同日步进（锚 13 日）
    const bare = parseIcsEvents(lines('TU'), {now: new Date(2026, 0, 20).getTime()});
    assert.deepEqual(dayOf(bare), [13, 13, 13]);
});

test('monthly bymonthday expands fixed and month-end days (T-6695c)', () => {
    const lines = (bymonthday) => [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Asia/Shanghai:20260115T090000',
        'SUMMARY:月度备份',
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + bymonthday + ';COUNT=3',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join(String.fromCharCode(13, 10));
    const dayOf = (result) => result.events.map((event) => event.start && new Date(event.start).getDate());
    // 每月 15 日：1/15、2/15、3/15
    const fixed = parseIcsEvents(lines('15'), {now: new Date(2026, 0, 20).getTime()});
    assert.deepEqual(dayOf(fixed), [15, 15, 15]);
    // 每月最后一天（-1）：1/31、2/28（2026 平年）、3/31
    const last = parseIcsEvents(lines('-1'), {now: new Date(2026, 0, 31).getTime()});
    assert.deepEqual(dayOf(last), [31, 28, 31]);
    // 组合 15 与 -1：每月两次、月内升序
    const combo = parseIcsEvents(lines('15,-1'), {now: new Date(2026, 0, 16).getTime()});
    assert.deepEqual(dayOf(combo), [15, 31, 15]);
});
