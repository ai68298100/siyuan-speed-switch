"use strict";

const MAX_RESPONSE_BYTES = 128 * 1024;
const WEATHER_TTL_MS = 15 * 60 * 1000;
const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const HOLIDAY_TTL_MS = 24 * 60 * 60 * 1000;
const responseCache = new Map();

function allowedLifeWidgetUrl(url) {
    if (typeof url !== "string" || url.length > 1024) return false;
    if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search?")
        || url.startsWith("https://api.open-meteo.com/v1/forecast?")) return true;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:"
            && parsed.hostname === "cdn.jsdelivr.net"
            && /^\/gh\/NateScarlet\/holiday-cn@master\/\d{4}\.json$/.test(parsed.pathname)
            && parsed.search === "";
    } catch (_) {
        return false;
    }
}

function cacheRead(key, ttl, now = Date.now()) {
    const entry = responseCache.get(key);
    if (!entry || now - entry.at >= ttl) return null;
    return entry.value;
}

function cacheWrite(key, value, now = Date.now()) {
    responseCache.set(key, {at: now, value});
    while (responseCache.size > 16) responseCache.delete(responseCache.keys().next().value);
    return value;
}

async function fetchBoundedLifeJson(url, options = {}) {
    if (!allowedLifeWidgetUrl(url)) throw new Error("blocked_endpoint");
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("unsupported");
    const externalSignal = options.signal && typeof options.signal === "object" ? options.signal : null;
    if (externalSignal?.aborted) throw new Error("aborted");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const abort = () => controller?.abort();
    externalSignal?.addEventListener?.("abort", abort, {once: true});
    const timeoutMs = Math.min(10000, Math.max(500, Math.trunc(Number(options.timeoutMs)) || 6000));
    let rejectTimeout = null;
    const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        rejectTimeout?.(new Error("timeout"));
    }, timeoutMs);
    try {
        const request = fetchImpl(url, controller ? {signal: controller.signal, headers: {Accept: "application/json"}} : {headers: {Accept: "application/json"}});
        const response = await Promise.race([request, timeout]);
        if (!response?.ok) throw new Error("http_error");
        const declared = Number(response.headers?.get?.("content-length"));
        if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
        const text = await response.text();
        if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
        try { return JSON.parse(text); } catch (_) { throw new Error("invalid_json"); }
    } catch (error) {
        if (timedOut) throw new Error("timeout");
        if (externalSignal?.aborted) throw new Error("aborted");
        throw error instanceof Error ? error : new Error("failed");
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener?.("abort", abort);
    }
}

async function loadWeatherLocation(url, options = {}) {
    const cached = cacheRead(`location:${url}`, LOCATION_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite(`location:${url}`, await fetchBoundedLifeJson(url, options), options.now);
}

async function loadWeatherForecast(url, options = {}) {
    const cached = cacheRead(`weather:${url}`, WEATHER_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite(`weather:${url}`, await fetchBoundedLifeJson(url, options), options.now);
}

async function loadHolidayYear(year, options = {}) {
    const normalizedYear = Math.min(2100, Math.max(2000, Math.trunc(Number(year)) || 2000));
    const url = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${normalizedYear}.json`;
    const cached = cacheRead(`holiday:${normalizedYear}`, HOLIDAY_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite(`holiday:${normalizedYear}`, await fetchBoundedLifeJson(url, options), options.now);
}

function clearLifeWidgetCaches() {
    responseCache.clear();
}

function lifeWidgetCacheSize() {
    return responseCache.size;
}

module.exports = {
    MAX_RESPONSE_BYTES,
    WEATHER_TTL_MS,
    LOCATION_TTL_MS,
    HOLIDAY_TTL_MS,
    allowedLifeWidgetUrl,
    fetchBoundedLifeJson,
    loadWeatherLocation,
    loadWeatherForecast,
    loadHolidayYear,
    clearLifeWidgetCaches,
    lifeWidgetCacheSize,
};
