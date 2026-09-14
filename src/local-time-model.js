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

function buildLocalTimeSnapshot(date = new Date(), locale = "zh-CN", labels = {}) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
    const safeLocale = normalizeClockLocale(locale);
    return {
        stat: {
            value: new Intl.DateTimeFormat(safeLocale, {hour: "2-digit", minute: "2-digit", hour12: false}).format(value),
            label: typeof labels.localTime === "string" ? labels.localTime.slice(0, 32) : "",
        },
        items: [{
            label: `${new Intl.DateTimeFormat(safeLocale, {year: "numeric", month: "long", day: "numeric"}).format(value)} · ${new Intl.DateTimeFormat(safeLocale, {weekday: "long"}).format(value)}`,
            value: "",
        }],
    };
}

function millisecondsToNextMinute(now = Date.now()) {
    const value = Number.isFinite(now) ? Math.max(0, Math.trunc(now)) : 0;
    const remainder = value % 60000;
    return Math.min(60025, Math.max(25, 60000 - remainder + 25));
}

module.exports = {normalizeClockLocale, buildLocalTimeSnapshot, millisecondsToNextMinute};
