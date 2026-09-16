"use strict";

// v0.21 生活信息支线（ROADMAP「再评估 iCal 与 GitHub 贡献热力图」）：iCal 订阅只读组件的
// 契约/纯模型层。按 T-123/T-124 先例先行交付可测纯模型，宿主接入（adapter/catalog/i18n）
// 待产品确认后另行接线——本模块不发起网络请求、不读取宿主数据。
//
// 信任边界：
//   - 订阅 URL 由用户配置：传输规则与 Miniflux/Configured Feed 一致（https 或 http+本机、
//     拒绝 URL 内嵌凭据），另要求路径以 .ics 结尾（iCal 订阅源的常见形态）；
//   - ics 文本是有界输入（默认 256 KiB 上限），解析只提取 VEVENT 的五个字段，
//     其余属性一律忽略，防止超大/恶意订阅源拖垮面板；
//   - 输出条目数与时间窗均有界，失败归一为稳定 token，不携带原始异常。

const ICAL_MAX_SOURCE_BYTES = 256 * 1024;
const ICAL_MAX_EVENTS = 500;
const ICAL_MAX_SUMMARY_LENGTH = 256;
const ICAL_MAX_LOCATION_LENGTH = 256;
const ICAL_DEFAULT_WINDOW_DAYS = 14;
const ICAL_MAX_WINDOW_DAYS = 60;
const ICAL_DEFAULT_MAX_ITEMS = 6;
const ICAL_MAX_ITEMS = 12;

const ICAL_FAILURE_REASONS = Object.freeze([
    "invalid_url",
    "parse_failed",
    "empty",
]);

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.length <= max ? value : value.slice(0, max);
}

// T-630-1：订阅配置归一化。URL 传输规则与 allowedConfiguredFeedUrl 对齐：
// https（或 http+本机）、拒绝 URL 内嵌凭据、要求 .ics 路径。
function normalizeIcalSubscriptionConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawUrl = boundedText(source.url, 512);
    let url = "";
    try {
        const parsed = new URL(rawUrl);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname.toLowerCase());
        const transportOk = parsed.protocol === "https:" || (parsed.protocol === "http:" && local);
        const pathOk = /\.ics$/i.test(parsed.pathname);
        if (transportOk && pathOk && !parsed.username && !parsed.password) {
            url = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
        }
    } catch (_) { /* 留空触发配置提示 */ }
    const windowDays = Number.isFinite(Math.trunc(Number(source.windowDays)))
        ? Math.min(ICAL_MAX_WINDOW_DAYS, Math.max(1, Math.trunc(Number(source.windowDays))))
        : ICAL_DEFAULT_WINDOW_DAYS;
    const maxEvents = Number.isFinite(Math.trunc(Number(source.maxEvents)))
        ? Math.min(ICAL_MAX_ITEMS, Math.max(1, Math.trunc(Number(source.maxEvents))))
        : ICAL_DEFAULT_MAX_ITEMS;
    return {
        url,
        windowDays,
        maxEvents,
        title: boundedText(source.title, 64) || "iCal",
    };
}

// RFC 5545 折行展开：续行以空格/制表符开头，折叠回单行。
function unfoldIcalLines(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = raw.split("\n");
    const unfolded = [];
    for (const line of lines) {
        if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
            unfolded[unfolded.length - 1] += line.slice(1);
        } else unfolded.push(line);
    }
    return unfolded;
}

// iCal 日期形态：YYYYMMDD（全天）、YYYYMMDDTHHMMSS（本地浮动）、带 Z（UTC）。
// 返回毫秒时间戳；无法解析返回 null。值内只允许数字/Z，防注入。
function parseIcalDateValue(value) {
    const raw = String(value || "").trim();
    const dateOnly = /^(\d{4})(\d{2})(\d{2})Z?$/.exec(raw);
    if (dateOnly) {
        const y = Number(dateOnly[1]);
        const mo = Number(dateOnly[2]) - 1;
        const d = Number(dateOnly[3]);
        const ms = Date.UTC(y, mo, d, 0, 0, 0);
        return Number.isFinite(ms) ? ms : null;
    }
    const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
    if (dateTime) {
        const y = Number(dateTime[1]);
        const mo = Number(dateTime[2]) - 1;
        const d = Number(dateTime[3]);
        const h = Number(dateTime[4]);
        const mi = Number(dateTime[5]);
        const se = Number(dateTime[6]);
        const ms = dateTime[7] === "Z"
            ? Date.UTC(y, mo, d, h, mi, se)
            : new Date(y, mo, d, h, mi, se).getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    return null;
}

function unescapeIcalText(value) {
    return String(value || "")
        .replace(/\\n/gi, " ")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");
}

// 从 unfolded 行中提取某 VEVENT 块的字段。
function extractIcalEventFields(blockLines) {
    const fields = {summary: "", location: "", start: null, end: null};
    for (const line of blockLines) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const left = line.slice(0, colon);
        const value = line.slice(colon + 1);
        const name = left.split(";")[0].toUpperCase();
        if (name === "DTSTART") fields.start = parseIcalDateValue(value);
        else if (name === "DTEND") fields.end = parseIcalDateValue(value);
        else if (name === "SUMMARY") fields.summary = boundedText(unescapeIcalText(value), ICAL_MAX_SUMMARY_LENGTH);
        else if (name === "LOCATION") fields.location = boundedText(unescapeIcalText(value), ICAL_MAX_LOCATION_LENGTH);
    }
    return fields;
}

// T-630-2：有界 VEVENT 解析。输入超过上限按 parse_failed 拒绝（不静默截断，
// 避免把超大订阅源误报为"没有日程"）；块内缺 DTSTART 的条目跳过。
function parseIcsEvents(icsText, options = {}) {
    const maxBytes = Math.max(1024, Math.trunc(Number(options.maxBytes) || ICAL_MAX_SOURCE_BYTES));
    const maxEvents = Math.max(1, Math.trunc(Number(options.maxParsedEvents) || ICAL_MAX_EVENTS));
    const text = String(icsText || "");
    if (text.length > maxBytes) return {ok: false, reason: "parse_failed", events: []};
    if (!/BEGIN:VCALENDAR/i.test(text)) return {ok: false, reason: "parse_failed", events: []};
    const unfolded = unfoldIcalLines(text);
    const events = [];
    let block = null;
    for (const line of unfolded) {
        const upper = line.toUpperCase();
        if (upper.startsWith("BEGIN:VEVENT")) {
            block = [];
            continue;
        }
        if (upper.startsWith("END:VEVENT") && block) {
            const fields = extractIcalEventFields(block);
            if (fields.start !== null && fields.summary) {
                events.push({
                    start: fields.start,
                    end: fields.end !== null ? fields.end : fields.start,
                    summary: fields.summary,
                    location: fields.location,
                });
            }
            block = null;
            if (events.length >= maxEvents) break;
            continue;
        }
        if (block) block.push(line);
    }
    if (events.length === 0 && !/BEGIN:VEVENT/i.test(text)) {
        return {ok: false, reason: "parse_failed", events: []};
    }
    return {ok: true, reason: "ok", events};
}

// T-630-3： upcoming 过滤——结束时间不早于 now、开始时间不晚于 now + windowDays，
// 按开始时间升序，最多 maxEvents 条。
function upcomingIcalEvents(events, now = Date.now(), options = {}) {
    const current = Number(now);
    if (!Number.isFinite(current)) return [];
    const windowDays = Number.isFinite(Math.trunc(Number(options.windowDays)))
        ? Math.min(ICAL_MAX_WINDOW_DAYS, Math.max(1, Math.trunc(Number(options.windowDays))))
        : ICAL_DEFAULT_WINDOW_DAYS;
    const maxEvents = Math.max(1, Math.trunc(Number(options.maxEvents) || ICAL_DEFAULT_MAX_ITEMS));
    const horizon = current + windowDays * 24 * 60 * 60 * 1000;
    const source = Array.isArray(events) ? events : [];
    return source
        .filter((event) => event && Number.isFinite(event.start) && event.summary
            && event.end >= current - 60 * 60 * 1000 && event.start <= horizon)
        .sort((a, b) => a.start - b.start)
        .slice(0, maxEvents);
}

module.exports = {
    ICAL_FAILURE_REASONS,
    ICAL_MAX_SOURCE_BYTES,
    ICAL_MAX_EVENTS,
    ICAL_MAX_ITEMS,
    ICAL_DEFAULT_WINDOW_DAYS,
    normalizeIcalSubscriptionConfig,
    allowedIcalUrlShape: (value) => normalizeIcalSubscriptionConfig({url: value}).url !== "",
    unfoldIcalLines,
    parseIcalDateValue,
    parseIcsEvents,
    upcomingIcalEvents,
};
