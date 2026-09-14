"use strict";

const MAX_RESPONSE_BYTES = 128 * 1024;
const WEATHER_TTL_MS = 15 * 60 * 1000;
const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const HOLIDAY_TTL_MS = 24 * 60 * 60 * 1000;
const BANGUMI_TTL_MS = 30 * 60 * 1000;
const FEED_TTL_MS = 30 * 60 * 1000;
const ACTIVITYWATCH_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();

function allowedLifeWidgetUrl(url) {
    if (typeof url !== "string" || url.length > 1024) return false;
    if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search?")
        || url.startsWith("https://api.open-meteo.com/v1/forecast?")) return true;
    if (url === "https://api.bgm.tv/calendar") return true;
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

function allowedConfiguredFeedUrl(value) {
    if (typeof value !== "string" || value.length > 512) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.hash) return false;
        const daily = url.pathname.match(/^\/(?:api\/)?(weibo|zhihu|bilibili|baidu|douyin|douban-movie|ithome|36kr|sspai|v2ex)\/?$/);
        if (daily) return url.search === "";
        if (url.pathname.replace(/\/$/, "") !== "/api/s") return false;
        const entries = [...url.searchParams.entries()];
        return entries.length === 1 && entries[0][0] === "id" && /^[a-z0-9-]{2,48}$/.test(entries[0][1]);
    } catch (_) {
        return false;
    }
}

function allowedActivityWatchUrl(value) {
    if (typeof value !== "string" || value.length > 320) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        return local && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            && !url.search && !url.hash && url.pathname === "/api/0/query/";
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
    const configuredFeedAllowed = options.allowConfiguredFeed === true && allowedConfiguredFeedUrl(url);
    if (!allowedLifeWidgetUrl(url) && !configuredFeedAllowed) throw new Error("blocked_endpoint");
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
        const requestOptions = controller
            ? {signal: controller.signal, headers: {Accept: "application/json"}, redirect: "error"}
            : {headers: {Accept: "application/json"}, redirect: "error"};
        const request = fetchImpl(url, requestOptions);
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

async function loadBangumiCalendar(options = {}) {
    const url = "https://api.bgm.tv/calendar";
    const cached = cacheRead("bangumi:calendar", BANGUMI_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite("bangumi:calendar", await fetchBoundedLifeJson(url, options), options.now);
}

async function loadConfiguredFeed(url, options = {}) {
    if (!allowedConfiguredFeedUrl(url)) throw new Error("blocked_endpoint");
    const key = `feed:${url}`;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < FEED_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(url, {...options, allowConfiguredFeed: true});
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

async function fetchActivityWatchQuery(url, body, options = {}) {
    if (!allowedActivityWatchUrl(url) || !body || typeof body !== "object") throw new Error("blocked_endpoint");
    const serialized = JSON.stringify(body);
    if (serialized.length > 8192) throw new Error("request_too_large");
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("unsupported");
    const externalSignal = options.signal && typeof options.signal === "object" ? options.signal : null;
    if (externalSignal?.aborted) throw new Error("aborted");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const abort = () => controller?.abort();
    externalSignal?.addEventListener?.("abort", abort, {once: true});
    const timeoutMs = Math.min(10000, Math.max(500, Math.trunc(Number(options.timeoutMs)) || 5000));
    let rejectTimeout = null;
    const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => { timedOut = true; controller?.abort(); rejectTimeout?.(new Error("timeout")); }, timeoutMs);
    try {
        const request = fetchImpl(url, {
            method: "POST", body: serialized, redirect: "error",
            headers: {Accept: "application/json", "Content-Type": "application/json"},
            ...(controller ? {signal: controller.signal} : {}),
        });
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

async function loadActivityWatchSummary(request, options = {}) {
    if (!request || !allowedActivityWatchUrl(request.url)) throw new Error("blocked_endpoint");
    const key = `activitywatch:${String(request.cacheKey || request.url).slice(0, 512)}`;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < ACTIVITYWATCH_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchActivityWatchQuery(request.url, request.body, options);
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
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
    BANGUMI_TTL_MS,
    FEED_TTL_MS,
    ACTIVITYWATCH_TTL_MS,
    allowedLifeWidgetUrl,
    allowedConfiguredFeedUrl,
    allowedActivityWatchUrl,
    fetchBoundedLifeJson,
    loadWeatherLocation,
    loadWeatherForecast,
    loadHolidayYear,
    loadBangumiCalendar,
    loadConfiguredFeed,
    fetchActivityWatchQuery,
    loadActivityWatchSummary,
    clearLifeWidgetCaches,
    lifeWidgetCacheSize,
};
