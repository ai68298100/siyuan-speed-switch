"use strict";

function normalizeClockLocale(value, fallback = "zh-CN") {
    const candidate = typeof value === "string" ? value.trim().replace(/_/g, "-").slice(0, 64) : "";
    if (candidate) {
        try {
            if (Intl.DateTimeFormat.supportedLocalesOf([candidate]).length > 0) return candidate;
        } catch (_) { /* invalid BCP 47 tag */ }
    }
    try {
        if (Intl.DateTimeFormat.supportedLocalesOf([fallback]).length > 0) return fallback;
    } catch (_) { /* use deterministic final fallback */ }
    return "en-US";
}

function normalizeLocalTimeConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        hour12: source.hourFormat === "12 小时制",
        showSeconds: source.showSeconds === "是",
        showDate: source.showDate !== "否" && source.showDate !== false,
    };
}

function buildLocalTimeSnapshot(date = new Date(), locale = "zh-CN", labels = {}, config = {}) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
    const safeLocale = normalizeClockLocale(locale);
    const normalized = normalizeLocalTimeConfig(config);
    const timeOptions = {hour: "2-digit", minute: "2-digit", hour12: normalized.hour12};
    if (normalized.showSeconds) timeOptions.second = "2-digit";
    const items = [];
    if (normalized.showDate) {
        items.push({
            label: `${new Intl.DateTimeFormat(safeLocale, {year: "numeric", month: "long", day: "numeric"}).format(value)} · ${new Intl.DateTimeFormat(safeLocale, {weekday: "long"}).format(value)}`,
            value: "",
        });
    }
    return {
        stat: {
            value: new Intl.DateTimeFormat(safeLocale, timeOptions).format(value),
            label: typeof labels.localTime === "string" ? labels.localTime.slice(0, 32) : "",
        },
        items,
    };
}

// ---------- T-6433/T-6456 年度进度：日历日语义 + 年/季/月周期 ----------
function normalizeYearProgressConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        showElapsed: source.showElapsed !== "否" && source.showElapsed !== false,
        showRemaining: source.showRemaining !== "否" && source.showRemaining !== false,
        period: source.period === "季度" || source.period === "月份" ? source.period : "年度",
    };
}

function buildYearProgressSnapshot(now = new Date(), config = {}, labels = {}) {
    const value = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(0);
    const normalized = normalizeYearProgressConfig(config);
    const year = value.getFullYear();
    const dayMs = 86400000;
    // 用本地年月日的 UTC 毫秒差计算日历天数：DST 造成的一小时偏移被整除吸收，
    // 平年/闰年与季/月边界由日历本身给出，不依赖运行环境的时区偏移量。
    const startUtc = Date.UTC(year, 0, 1);
    const endUtc = Date.UTC(year + 1, 0, 1);
    const label = `${year}`;
    if (normalized.period === "季度") {
        const quarter = Math.floor(value.getMonth() / 3);
        return projectProgress(
            value,
            Date.UTC(year, quarter * 3, 1),
            Date.UTC(year, quarter * 3 + 3, 1),
            `${year} Q${quarter + 1}`,
            normalized,
            labels,
        );
    }
    if (normalized.period === "月份") {
        return projectProgress(
            value,
            Date.UTC(year, value.getMonth(), 1),
            Date.UTC(year, value.getMonth() + 1, 1),
            `${year}-${String(value.getMonth() + 1).padStart(2, "0")}`,
            normalized,
            labels,
        );
    }
    return projectProgress(value, startUtc, endUtc, label, normalized, labels);
}

function projectProgress(value, startUtc, endUtc, label, normalized, labels) {
    const dayMs = 86400000;
    const total = Math.round((endUtc - startUtc) / dayMs);
    const elapsed = Math.min(total, Math.max(1, Math.round((Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) - startUtc) / dayMs) + 1));
    const remaining = total - elapsed;
    const percent = Math.round((elapsed / total) * 100);
    const items = [];
    const elapsedLabel = typeof labels.elapsed === "string" ? labels.elapsed : "";
    const remainingLabel = typeof labels.remaining === "string" ? labels.remaining : "";
    if (normalized.showElapsed && elapsedLabel) items.push({label: elapsedLabel.replace("{x}", String(elapsed)), value: ""});
    if (normalized.showRemaining && remainingLabel) items.push({label: remainingLabel.replace("{x}", String(remaining)), value: ""});
    return {
        stat: {value: `${percent}%`, label, progress: percent, arc: {value: elapsed, max: total}},
        items,
    };
}

// ---------- T-6435 倒数日：目标日期校验、每年重复与到期语义 ----------
const COUNTDOWN_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCountdownConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const target = typeof source.targetDate === "string" ? source.targetDate.trim() : "";
    return {
        title: typeof source.title === "string" ? source.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 32) : "",
        targetDate: COUNTDOWN_DATE_PATTERN.test(target) ? target : "",
        repeat: source.repeat === "每年" ? "yearly" : "none",
        showTargetDate: source.showTargetDate !== "否" && source.showTargetDate !== false,
        // T-6455：倒数（默认，剩余天数）与累计（“已经 N 天”，从最近一次发生日起算）双模式
        mode: source.mode === "累计" ? "elapsed" : "countdown",
    };
}

function countdownDayDiff(targetTime, todayStart) {
    return Math.round((targetTime - todayStart) / 86400000);
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function parseCountdownDate(target) {
    if (!COUNTDOWN_DATE_PATTERN.test(target)) return null;
    const year = Number(target.slice(0, 4));
    const month = Number(target.slice(5, 7));
    const day = Number(target.slice(8, 10));
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
    return {year, month, day};
}

function isRealCalendarDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// 每年重复按“当月最后一天”钳制：2 月 29 日在平年落到 2 月 28 日，不漂移到别的月份。
function yearlyOccurrence(year, month, day) {
    const lastDay = new Date(year, month, 0).getDate();
    const effectiveDay = Math.min(day, lastDay);
    return {time: new Date(year, month - 1, effectiveDay).getTime(), day: effectiveDay};
}

function buildCountdownSnapshot(now = new Date(), config = {}, labels = {}) {
    const normalized = normalizeCountdownConfig(config);
    const hint = typeof labels.hint === "string" ? labels.hint : "";
    const parts = parseCountdownDate(normalized.targetDate);
    if (!parts) return {items: [{label: hint, value: ""}]};
    const value = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(0);
    const todayStart = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    let targetTime;
    let displayDate;
    if (normalized.repeat === "yearly") {
        let occurrence = yearlyOccurrence(value.getFullYear(), parts.month, parts.day);
        if (occurrence.time < todayStart) occurrence = yearlyOccurrence(value.getFullYear() + 1, parts.month, parts.day);
        targetTime = occurrence.time;
        displayDate = `${pad2(parts.month)}-${pad2(occurrence.day)}`;
    } else {
        // 一次性目标日期严格校验：2 月 30 日等不可能日期回退配置提示，不静默溢出
        if (!isRealCalendarDate(parts.year, parts.month, parts.day)) return {items: [{label: hint, value: ""}]};
        targetTime = new Date(parts.year, parts.month - 1, parts.day).getTime();
        displayDate = normalized.targetDate;
    }
    if (!Number.isFinite(targetTime)) return {items: [{label: hint, value: ""}]};
    const elapsedLabel = typeof labels.elapsedDays === "string" && labels.elapsedDays ? labels.elapsedDays : "已经 {n} 天";
    if (normalized.mode === "elapsed") {
        // 累计口径：N = 距最近一次发生日（每年重复取最近周年）的整天数，当天记 0；
        // 目标在未来（一次性日期尚未到来）时没有已流逝的天数，同样记 0，不伪造倒计回退。
        const thisYearOccurrence = yearlyOccurrence(value.getFullYear(), parts.month, parts.day);
        const anchor = normalized.repeat === "yearly"
            ? (thisYearOccurrence.time <= todayStart ? thisYearOccurrence.time : yearlyOccurrence(value.getFullYear() - 1, parts.month, parts.day).time)
            : targetTime;
        const elapsedDays = Math.max(0, countdownDayDiff(todayStart, anchor));
        const title2 = normalized.title || (typeof labels.untitled === "string" ? labels.untitled : "");
        const yearlyMark2 = normalized.repeat === "yearly" && typeof labels.yearly === "string" ? labels.yearly : "";
        const parts2 = [title2, yearlyMark2];
        if (normalized.showTargetDate) parts2.push(displayDate);
        return {
            stat: {value: String(elapsedDays), label: elapsedLabel.replace("{n}", String(elapsedDays))},
            items: [{label: parts2.filter(Boolean).join(" · "), value: ""}],
        };
    }
    const days = countdownDayDiff(targetTime, todayStart);
    const remaining = typeof labels.remaining === "string" ? labels.remaining : "";
    const todayLabel = typeof labels.today === "string" ? labels.today : "";
    const passed = typeof labels.passed === "string" ? labels.passed : "";
    const dayLabel = days > 0 ? remaining.replace("{n}", String(days))
        : days === 0 ? todayLabel
            : passed.replace("{n}", String(-days));
    const title = normalized.title || (typeof labels.untitled === "string" ? labels.untitled : "");
    const yearlyMark = normalized.repeat === "yearly" && typeof labels.yearly === "string" ? labels.yearly : "";
    const content = [title, yearlyMark];
    if (normalized.showTargetDate) content.push(displayDate);
    return {
        stat: {value: days === 0 ? "0" : String(Math.abs(days)), label: dayLabel},
        items: [{label: content.filter(Boolean).join(" · "), value: ""}],
    };
}

const WORLD_CLOCK_MAX_CITIES = 8;

function isValidTimeZone(timeZone) {
    if (typeof timeZone !== "string" || !timeZone) return false;
    try {
        new Intl.DateTimeFormat("en-US", {timeZone}).format(new Date(0));
        return true;
    } catch (_) {
        return false;
    }
}

function normalizeWorldClockConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const raw = typeof source.cities === "string" ? source.cities : "";
    const zones = [...new Set(raw.split(/[,，;；\s]+/)
        .map((item) => item.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 64))
        .filter((item) => isValidTimeZone(item)))]
        .slice(0, WORLD_CLOCK_MAX_CITIES);
    return {cities: zones, hour12: source.hourFormat === "12 小时制"};
}

function zoneDateParts(timeZone, date, locale) {
    try {
        const parts = new Intl.DateTimeFormat(locale, {timeZone, year: "numeric", month: "numeric", day: "numeric"}).formatToParts(date);
        const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
        const result = {year: pick("year"), month: pick("month"), day: pick("day")};
        return [result.year, result.month, result.day].every((n) => Number.isFinite(n)) ? result : null;
    } catch (_) {
        return null;
    }
}

function zoneDayDelta(localParts, zoneParts) {
    if (!localParts || !zoneParts) return 0;
    const utc = (p) => Date.UTC(p.year, p.month - 1, p.day);
    return Math.round((utc(zoneParts) - utc(localParts)) / 86400000);
}

function zoneShortName(timeZone, date, locale) {
    try {
        const parts = new Intl.DateTimeFormat(locale, {timeZone, timeZoneName: "short"}).formatToParts(date);
        return boundedZoneLabel(parts.find((part) => part.type === "timeZoneName")?.value || "");
    } catch (_) {
        return "";
    }
}

function boundedZoneLabel(value) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 24) : "";
}

function buildWorldClockSnapshot(date = new Date(), config = {}, labels = {}) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
    const locale = normalizeClockLocale(typeof labels.locale === "string" ? labels.locale : "zh-CN");
    const normalized = normalizeWorldClockConfig(config);
    // 空配置回退本地与 UTC，保证组件开箱可用；列表本身无城市时仍显示两行而不是空态。
    const zones = normalized.cities.length > 0
        ? [...new Set([...normalized.cities, "UTC"])]
        : ["local", "UTC"];
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // 相对日标记：与世界时钟本地日期比较，仅标注 ±1/±2 天（±2 只在时区极值的小时出现）
    const localParts = {year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate()};
    const dayOffsets = Array.isArray(labels.dayOffsets) ? labels.dayOffsets : [];
    const dayWord = (delta) => (delta >= -2 && delta <= 2 && delta !== 0 ? boundedZoneLabel(dayOffsets[delta + 2]) : "");
    const formatCache = new Map();
    const timeIn = (timeZone) => {
        if (!formatCache.has(timeZone)) {
            formatCache.set(timeZone, new Intl.DateTimeFormat(locale, {hour: "2-digit", minute: "2-digit", hour12: normalized.hour12, timeZone}));
        }
        return formatCache.get(timeZone).format(value);
    };
    const rows = zones.map((zone) => {
        const resolved = zone === "local" ? localZone : zone;
        const city = zone === "local"
            ? (boundedZoneLabel(labels.local) || boundedZoneLabel(localZone.split("/").pop()) || "Local")
            : boundedZoneLabel(zone.split("/").pop().replace(/_/g, " "));
        const offset = zone === "local" ? "" : zoneShortName(resolved, value, locale);
        const marker = zone === "local" ? "" : dayWord(zoneDayDelta(localParts, zoneDateParts(resolved, value, locale)));
        return {
            label: marker ? `${city} · ${marker}` : city,
            value: offset ? `${timeIn(resolved)} ${offset}` : timeIn(resolved),
        };
    });
    return {stat: {value: rows[0]?.value || "", label: boundedZoneLabel(labels.worldClock) || "世界时钟"}, items: rows};
}

function millisecondsToNextMinute(now = Date.now()) {
    const value = Number.isFinite(now) ? Math.max(0, Math.trunc(now)) : 0;
    const remainder = value % 60000;
    return Math.min(60025, Math.max(25, 60000 - remainder + 25));
}

// 秒针模式专用：仅在被显式开启秒显示的本地时钟卡片存在时使用，其余路径保持分钟心跳。
function millisecondsToNextSecond(now = Date.now()) {
    const value = Number.isFinite(now) ? Math.max(0, Math.trunc(now)) : 0;
    const remainder = value % 1000;
    return Math.min(1025, Math.max(25, 1000 - remainder + 25));
}

module.exports = {normalizeClockLocale, buildLocalTimeSnapshot, normalizeLocalTimeConfig, normalizeWorldClockConfig, buildWorldClockSnapshot, millisecondsToNextMinute, millisecondsToNextSecond, normalizeYearProgressConfig, buildYearProgressSnapshot, normalizeCountdownConfig, buildCountdownSnapshot, WORLD_CLOCK_MAX_CITIES};
