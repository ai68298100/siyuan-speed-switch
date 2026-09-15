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
    return {cities: zones};
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
    const formatCache = new Map();
    const timeIn = (timeZone) => {
        if (!formatCache.has(timeZone)) {
            formatCache.set(timeZone, new Intl.DateTimeFormat(locale, {hour: "2-digit", minute: "2-digit", hour12: false, timeZone}));
        }
        return formatCache.get(timeZone).format(value);
    };
    const rows = zones.map((zone) => {
        const resolved = zone === "local" ? localZone : zone;
        const city = zone === "local"
            ? (boundedZoneLabel(labels.local) || boundedZoneLabel(localZone.split("/").pop()) || "Local")
            : boundedZoneLabel(zone.split("/").pop().replace(/_/g, " "));
        const offset = zone === "local" ? "" : zoneShortName(resolved, value, locale);
        return {
            label: city,
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

module.exports = {normalizeClockLocale, buildLocalTimeSnapshot, normalizeWorldClockConfig, buildWorldClockSnapshot, millisecondsToNextMinute, WORLD_CLOCK_MAX_CITIES};
