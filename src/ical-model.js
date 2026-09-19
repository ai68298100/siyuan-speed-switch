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
// T-6460：RRULE 展开边界——单事件最多展开 120 次发生（≥60 天窗口的每日重复），
// 迭代步进上限 800 天（防 BYDAY/INTERVAL 组合下死循环）；UNTIL/COUNT 任先到者停。
const ICAL_RRULE_MAX_OCCURRENCES = 120;
const ICAL_RRULE_MAX_ITERATIONS = 800;
const ICAL_RRULE_WEEKDAYS = Object.freeze({MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0});

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

// ---------- T-6460：TZID 时区解析与有界 RRULE 展开（RFC 5545 子集，本仓自写） ----------

// 解析日期/日期时间值为「分量」，不做任何时区解释：
// {y, mo, d, h, mi, s, utc, dateOnly}；无法解析返回 null。
function parseIcalNaiveParts(value) {
    const raw = String(value || "").trim();
    const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})Z?$/);
    if (dateOnly) {
        return {y: Number(dateOnly[1]), mo: Number(dateOnly[2]) - 1, d: Number(dateOnly[3]), h: 0, mi: 0, s: 0, utc: /Z$/i.test(raw), dateOnly: true};
    }
    const dateTime = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i);
    if (dateTime) {
        return {y: Number(dateTime[1]), mo: Number(dateTime[2]) - 1, d: Number(dateTime[3]), h: Number(dateTime[4]), mi: Number(dateTime[5]), s: Number(dateTime[6]), utc: !!dateTime[7], dateOnly: false};
    }
    return null;
}

// 时区在某 UTC 时刻的偏移量（毫秒）；无效时区返回 null。
function icalZoneOffsetMs(timeZone, utcMs) {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"}).formatToParts(new Date(utcMs));
        const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
        const y = pick("year"), mo = pick("month"), d = pick("day"), h = pick("hour"), mi = pick("minute"), s = pick("second");
        if (![y, mo, d, h, mi, s].every(Number.isFinite)) return null;
        return Date.UTC(y, mo - 1, d, h, mi, s) - utcMs;
    } catch (_) {
        return null;
    }
}

// 把某时区的墙上时间解析为 UTC 毫秒：两遍逼近处理 DST 边界；无效时区返回 null。
function icalZonedToMs(parts, timeZone) {
    const naiveUtc = Date.UTC(parts.y, parts.mo, parts.d, parts.h, parts.mi, parts.s);
    const offset1 = icalZoneOffsetMs(timeZone, naiveUtc);
    if (offset1 === null) return null;
    const guess = naiveUtc - offset1;
    const offset2 = icalZoneOffsetMs(timeZone, guess);
    if (offset2 === null) return null;
    return naiveUtc - offset2;
}

// DTSTART/DTEND 统一入口：Z=UTC；VALUE=DATE=UTC 零点（全天）；TZID=按 IANA 时区解析
// （无效时区回退浮动本地时间）；无标记=浮动本地时间（与既有行为一致）。
function resolveIcalDateTime(left, value) {
    const parts = parseIcalNaiveParts(value);
    if (!parts) return null;
    if (parts.utc || parts.dateOnly) return Date.UTC(parts.y, parts.mo, parts.d, parts.h, parts.mi, parts.s);
    const tzMatch = left.match(/TZID=([^;:\r\n]+)/i);
    if (tzMatch) {
        const timeZone = tzMatch[1].trim().replace(/"/g, "");
        const ms = icalZonedToMs(parts, timeZone);
        if (ms !== null) return ms;
    }
    return new Date(parts.y, parts.mo, parts.d, parts.h, parts.mi, parts.s).getTime();
}

// RRULE 子集：FREQ=DAILY/WEEKLY/MONTHLY、INTERVAL、COUNT、UNTIL、WEEKLY 的 BYDAY。
// 其余（BYMONTHDAY/BYSETPOS/yearly 类）返回 null → 按单次事件呈现，不猜测语义。
function parseIcalRrule(value) {
    const parts = String(value || "").split(";").reduce((acc, item) => {
        const eq = item.indexOf("=");
        if (eq > 0) acc[item.slice(0, eq).toUpperCase()] = item.slice(eq + 1).trim().toUpperCase();
        return acc;
    }, {});
    const freq = parts.FREQ;
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
    return {
        freq,
        interval: Math.min(366, Math.max(1, Math.trunc(Number(parts.INTERVAL)) || 1)),
        count: parts.COUNT !== undefined ? Math.min(ICAL_RRULE_MAX_OCCURRENCES, Math.max(1, Math.trunc(Number(parts.COUNT)) || 1)) : null,
        until: parts.UNTIL !== undefined && parseIcalDateValue(parts.UNTIL) !== null ? parseIcalDateValue(parts.UNTIL) : null,
        byday: freq === "WEEKLY" && parts.BYDAY
            ? parts.BYDAY.split(",").map((token) => ICAL_RRULE_WEEKDAYS[token.trim()]).filter((n) => Number.isInteger(n))
            : [],
        // T-6695b MONTHLY BYDAY 序数子集："2TU"=每月第 2 个周二、"-1FR"=最后一个周五；
        // 无序数前缀（"TU"）在 MONTHLY 语义下视为未支持，整条忽略（回退月内同日步进）。
        byMonthlyByday: freq === "MONTHLY" && parts.BYDAY
            ? parts.BYDAY.split(",").map((token) => {
                const m = token.trim().match(/^(-?\d{1,2})?([A-Z]{2})$/);
                if (!m) return null;
                const dow = ICAL_RRULE_WEEKDAYS[m[2]];
                if (!Number.isInteger(dow)) return null;
                const ordinal = m[1] !== undefined ? Math.trunc(Number(m[1])) : 0;
                if (ordinal === 0 || Math.abs(ordinal) > 5) return null;
                return {ordinal, dow};
            }).filter(Boolean)
            : [],
        // T-6695c MONTHLY BYMONTHDAY 子集："15"=每月 15 日、"-1"=每月最后一天；
        // 0 与越界（|n|>31）视为未支持。
        byMonthDay: freq === "MONTHLY" && parts.BYMONTHDAY
            ? parts.BYMONTHDAY.split(",").map((token) => {
                const n = Math.trunc(Number(token));
                return Number.isFinite(n) && n !== 0 && Math.abs(n) <= 31 ? n : null;
            }).filter((n) => n !== null)
            : [],
    };
}

// 按事件自身的帧（UTC 或浮动本地）做日历步进，避免 DST 造成的小时漂移。
function icalFrameStepper(startMs, utcFrame) {
    const date = new Date(startMs);
    const get = utcFrame
        ? {y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: date.getUTCDate(), h: date.getUTCHours(), mi: date.getUTCMinutes(), s: date.getUTCSeconds(), dow: date.getUTCDay()}
        : {y: date.getFullYear(), mo: date.getMonth(), d: date.getDate(), h: date.getHours(), mi: date.getMinutes(), s: date.getSeconds(), dow: date.getDay()};
    const mk = (y, mo, d) => (utcFrame ? Date.UTC(y, mo, d, get.h, get.mi, get.s) : new Date(y, mo, d, get.h, get.mi, get.s).getTime());
    return {get, mk};
}

function expandIcalRrule(fields, rrule, horizonMs) {
    const duration = (fields.end !== null ? fields.end : fields.start) - fields.start;
    const occurrences = [];
    const limit = Math.min(rrule.count !== null ? rrule.count : ICAL_RRULE_MAX_OCCURRENCES, ICAL_RRULE_MAX_OCCURRENCES);
    const {get, mk} = icalFrameStepper(fields.start, fields.utcFrame);
    const pushOccurrence = (start) => {
        if (start > horizonMs) return false;
        if (rrule.until !== null && start > rrule.until) return false;
        occurrences.push({start, end: start + duration, allDay: fields.allDay === true});
        return occurrences.length < limit;
    };
    if (rrule.freq === "DAILY") {
        for (let i = 0; i < ICAL_RRULE_MAX_ITERATIONS; i += 1) {
            if (!pushOccurrence(mk(get.y, get.mo, get.d + i * rrule.interval))) break;
        }
        return occurrences;
    }
    if (rrule.freq === "WEEKLY" && rrule.byday.length === 0) {
        for (let i = 0; i < ICAL_RRULE_MAX_ITERATIONS; i += 1) {
            if (!pushOccurrence(mk(get.y, get.mo, get.d + i * rrule.interval * 7))) break;
        }
        return occurrences;
    }
    if (rrule.freq === "WEEKLY") {
        // BYDAY：自锚点日逐日历日步进；命中候选星期且落在第 n 个 interval 周内则产出
        for (let step = 0; step < ICAL_RRULE_MAX_ITERATIONS; step += 1) {
            const start = mk(get.y, get.mo, get.d + step);
            const dow = (get.dow + step) % 7;
            if (!rrule.byday.includes(dow)) continue;
            const weekIndex = Math.floor(step / 7);
            if (weekIndex % rrule.interval !== 0) continue;
            if (!pushOccurrence(start)) break;
        }
        return occurrences;
    }
    if (rrule.freq === "MONTHLY" && rrule.byMonthDay.length) {
        // T-6695c MONTHLY BYMONTHDAY 子集：正数=当月第 n 日（该月不存在则跳过，
        // 不钳制——与"每日/每周"锚点语义不同，BYMONTHDAY 本身就指定目标日）；
        // 负数=-1 为月末、-2 为倒数第二天，以此类推。月内按日期升序产出。
        const daysInMonthOf = (y, mo) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        for (let i = 0; i < ICAL_RRULE_MAX_ITERATIONS; i += 1) {
            const monthShift = get.mo + i * rrule.interval;
            const daysInMonth = daysInMonthOf(get.y, monthShift);
            const starts = [];
            for (const rule of rrule.byMonthDay) {
                const day = rule > 0 ? rule : daysInMonth + 1 + rule;
                if (day >= 1 && day <= daysInMonth) starts.push({day, ordinal: rule});
            }
            starts.sort((left, right) => left.day - right.day);
            for (const {day} of starts) {
                const start = fields.utcFrame === true
                    ? Date.UTC(get.y, monthShift, day, get.h, get.mi, get.s)
                    : new Date(get.y, monthShift, day, get.h, get.mi, get.s).getTime();
                if (!pushOccurrence(start)) return occurrences;
            }
        }
        return occurrences;
    }
    if (rrule.freq === "MONTHLY" && rrule.byMonthlyByday.length) {
        // T-6695b MONTHLY BYDAY 序数子集：逐月定位第 n 个/最后一个目标星期，
        // 月内按日期升序产出；COUNT/UNTIL/地平线由 pushOccurrence 统一约束。
        const nthWeekday = (y, mo, ordinal, dow) => {
            const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
            const dowOf = (day) => new Date(Date.UTC(y, mo, day)).getUTCDay();
            if (ordinal > 0) {
                const first = 1 + ((dow - dowOf(1) + 7) % 7);
                const day = first + (ordinal - 1) * 7;
                return day <= daysInMonth ? day : null;
            }
            const day = daysInMonth - ((dowOf(daysInMonth) - dow + 7) % 7) + (ordinal + 1) * 7;
            return day >= 1 ? day : null;
        };
        for (let i = 0; i < ICAL_RRULE_MAX_ITERATIONS; i += 1) {
            const monthShift = get.mo + i * rrule.interval;
            const starts = [];
            for (const entry of rrule.byMonthlyByday) {
                const day = nthWeekday(get.y, monthShift, entry.ordinal, entry.dow);
                if (day !== null) starts.push({day, ordinal: entry.ordinal});
            }
            starts.sort((left, right) => left.day - right.day);
            for (const {day} of starts) {
                const start = fields.utcFrame === true
                    ? Date.UTC(get.y, monthShift, day, get.h, get.mi, get.s)
                    : new Date(get.y, monthShift, day, get.h, get.mi, get.s).getTime();
                if (!pushOccurrence(start)) return occurrences;
            }
        }
        return occurrences;
    }
    if (rrule.freq === "MONTHLY") {
        for (let i = 0; i < ICAL_RRULE_MAX_ITERATIONS; i += 1) {
            const monthShift = get.mo + i * rrule.interval;
            // 目标月不存在锚点日（如 31 日遇 30 天月）时按当月最后一天钳制
            const lastDay = new Date(Date.UTC(get.y, monthShift + 1, 0)).getUTCDate();
            const day = Math.min(get.d, lastDay);
            const start = fields.utcFrame === true
                ? Date.UTC(get.y, monthShift, day, get.h, get.mi, get.s)
                : new Date(get.y, monthShift, day, get.h, get.mi, get.s).getTime();
            if (!pushOccurrence(start)) break;
        }
        return occurrences;
    }
    if (rrule.freq === "YEARLY") {
        // T-6693 深化：生日/周年类 YEARLY 订阅按年步进；2/29 锚点遇平年跳过
        //（RFC 5545 语义：该年不发生，而非钳制到 2/28 伪造发生）。
        const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        for (let i = 0; i < ICAL_RRULE_MAX_ITERATIONS; i += 1) {
            const y = get.y + i * rrule.interval;
            if (get.mo === 1 && get.d === 29 && !isLeapYear(y)) continue;
            if (!pushOccurrence(mk(y, get.mo, get.d))) break;
        }
        return occurrences;
    }
    return occurrences;
}

// 从 unfolded 行中提取某 VEVENT 块的字段。
// T-6447：DTSTART 带 VALUE=DATE 参数（或值为 8 位日期）记为全天事件，视图不再显示 00:00。
// T-6460：TZID 参数按 IANA 时区解析（无效回退浮动本地）；RRULE 解析为有界展开规则。
// T-6462：EXDATE（剔除发生）与 RDATE（追加发生）逐条按自身行的 TZID/Z 语义解析为毫秒。
function extractIcalEventFields(blockLines) {
    const fields = {summary: "", location: "", start: null, end: null, allDay: false, utcFrame: false, rrule: null, exdates: [], rdates: []};
    for (const line of blockLines) {
        const colon = line.indexOf(":");
        if (colon < 0) continue;
        const left = line.slice(0, colon);
        const value = line.slice(colon + 1);
        const name = left.split(";")[0].toUpperCase();
        if (name === "DTSTART") {
            fields.start = resolveIcalDateTime(left, value);
            fields.allDay = /VALUE=DATE/i.test(left) || /^\d{8}Z?$/.test(value.trim());
            // 帧判定：Z 结尾/纯日期/带 TZID 的事件展开时按 UTC 日历步进，浮动按本地
            fields.utcFrame = /TZID=/i.test(left) || /Z$/i.test(value.trim()) || /^\d{8}$/i.test(value.trim());
        }
        else if (name === "DTEND") fields.end = resolveIcalDateTime(left, value);
        else if (name === "SUMMARY") fields.summary = boundedText(unescapeIcalText(value), ICAL_MAX_SUMMARY_LENGTH);
        else if (name === "LOCATION") fields.location = boundedText(unescapeIcalText(value), ICAL_MAX_LOCATION_LENGTH);
        else if (name === "RRULE") {
            if (!fields.rrule) {
                const rule = parseIcalRrule(value);
                if (rule) fields.rrule = rule;
            }
        }
        else if (name === "EXDATE" || name === "RDATE") {
            // 逗号分隔的多值逐个按本行的 TZID/Z 语义解析；无法解析的值静默跳过
            const bucket = name === "EXDATE" ? fields.exdates : fields.rdates;
            for (const single of value.split(",")) {
                const ms = resolveIcalDateTime(left, single);
                if (ms !== null && bucket.length < ICAL_RRULE_MAX_OCCURRENCES) bucket.push(ms);
            }
        }
    }
    return fields;
}

// T-630-2：有界 VEVENT 解析。输入超过上限按 parse_failed 拒绝（不静默截断，
// 避免把超大订阅源误报为"没有日程"）；块内缺 DTSTART 的条目跳过。
// T-6460：RRULE 事件在解析期展开为窗口内的发生（horizon = now + 60 天，
// 单事件 ≤120 次），COUNT/UNTIL 生效；EXDATE/RDATE/BYMONTHDAY 等不支持，
// 含不支持子句的 RRULE 按单次事件呈现（不猜测语义）。
function parseIcsEvents(icsText, options = {}) {
    const maxBytes = Math.max(1024, Math.trunc(Number(options.maxBytes) || ICAL_MAX_SOURCE_BYTES));
    const maxEvents = Math.max(1, Math.trunc(Number(options.maxParsedEvents) || ICAL_MAX_EVENTS));
    const text = String(icsText || "");
    if (text.length > maxBytes) return {ok: false, reason: "parse_failed", events: []};
    if (!/BEGIN:VCALENDAR/i.test(text)) return {ok: false, reason: "parse_failed", events: []};
    const unfolded = unfoldIcalLines(text);
    const current = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const horizon = current + ICAL_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
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
                const excluded = new Set(fields.exdates);
                const isExcluded = (start) => excluded.has(start);
                let occurrences = fields.rrule
                    ? expandIcalRrule(fields, fields.rrule, horizon).filter((occurrence) => !isExcluded(occurrence.start))
                    : [{start: fields.start, end: fields.end !== null ? fields.end : fields.start, allDay: fields.allDay === true}];
                // RDATE 追加发生（与主事件同时长），同样受地平线与去重约束
                for (const extra of fields.rdates) {
                    if (extra > horizon) continue;
                    const start = extra;
                    if (occurrences.some((occurrence) => occurrence.start === start)) continue;
                    occurrences.push({start, end: (fields.end !== null ? fields.end : fields.start) + (start - fields.start), allDay: fields.allDay === true});
                }
                occurrences.sort((a, b) => a.start - b.start);
                for (const occurrence of occurrences) {
                    if (events.length >= maxEvents) break;
                    if (isExcluded(occurrence.start)) continue;
                    events.push({
                        start: occurrence.start,
                        end: occurrence.end,
                        summary: fields.summary,
                        location: fields.location,
                        allDay: occurrence.allDay === true,
                    });
                }
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
