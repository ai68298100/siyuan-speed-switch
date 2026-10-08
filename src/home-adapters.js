"use strict";

const {DEVICES, getModuleDefinition, normalizeConfig} = (() => {
    const model = require("./home-model.js");
    // normalizeConfig is intentionally kept private in the model; adapters
    // receive already bounded config and only expose bounded snapshots.
    return {...model, normalizeConfig: (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const result = {};
        Object.keys(value).slice(0, 32).filter((key) => /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key)).sort().forEach((key) => {
            if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key)) return;
            const item = value[key];
            if (typeof item === "string") result[key] = item.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 512);
            else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
            else if (typeof item === "boolean") result[key] = item;
        });
        return result;
    }};
})();

const MAX_SNAPSHOT_ITEMS = 24;
const CALENDAR_MAX_SNAPSHOT_ITEMS = 42;
const MAX_TEXT = 256;
const DEFAULT_READ_TIMEOUT_MS = 800;
const DEFAULT_CACHE_TTL_MS = 3000;
const snapshotCache = new Map();
const failureBackoff = new Map();
const diagnostics = [];
const MAX_DIAGNOSTICS = 32;
const inFlightReads = new Map();
const readGenerations = new Map();
const invalidatedReadGenerations = new Map();
function recordDiagnostic(type, moduleId, device) {
    diagnostics.push({type: safeText(type, 24), moduleId: safeText(moduleId, 64), device: DEVICES.includes(device) ? device : "desktop", at: Date.now()});
    if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
}

function safeText(value, max = MAX_TEXT) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function safeHref(value) {
    const href = safeText(value, 512);
    if (!href) return "";
    try {
        const url = new URL(href);
        return ["https:", "http:", "siyuan:"].includes(url.protocol) ? href : "";
    } catch (_) {
        return "";
    }
}

function safeImageHref(value) {
    const href = safeText(value, 512);
    if (!href) return "";
    try {
        const url = new URL(href);
        return url.protocol === "https:" && url.hostname === "lain.bgm.tv" && url.pathname.startsWith("/pic/cover/")
            ? url.href : "";
    } catch (_) {
        return "";
    }
}

function normalizeAdapter(adapter) {
    if (!adapter || typeof adapter !== "object") return null;
    const moduleId = safeText(adapter.moduleId, 64);
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(moduleId) || typeof adapter.read !== "function") return null;
    const supportedDevices = Array.isArray(adapter.supportedDevices)
        ? DEVICES.filter((device) => adapter.supportedDevices.includes(device)) : [];
    if (!supportedDevices.length) return null;
    const timeoutMs = Number.isFinite(adapter.timeoutMs) ? Math.min(10000, Math.max(100, Math.trunc(adapter.timeoutMs))) : DEFAULT_READ_TIMEOUT_MS;
    const cacheTtlMs = Number.isFinite(adapter.cacheTtlMs) ? Math.min(3600000, Math.max(0, Math.trunc(adapter.cacheTtlMs))) : DEFAULT_CACHE_TTL_MS;
    return {moduleId, supportedDevices, read: adapter.read, timeoutMs, cacheTtlMs};
}

function registerHomeAdapters(adapters = []) {
    const result = new Map();
    (Array.isArray(adapters) ? adapters : []).forEach((raw) => {
        const adapter = normalizeAdapter(raw);
        if (adapter) result.set(adapter.moduleId, adapter);
    });
    return result;
}

function buildHomeAdapterCacheKey(moduleId, device, normalizedConfig = {}) {
    const target = DEVICES.includes(device) ? device : "desktop";
    return `${safeText(moduleId, 64)}:${target}:${JSON.stringify(normalizedConfig && typeof normalizedConfig === "object" ? normalizedConfig : {})}`;
}

function unregisterHomeAdapter(adapters, moduleId) {
    const map = adapters instanceof Map ? adapters : registerHomeAdapters(adapters);
    const id = safeText(moduleId, 64);
    const pendingKeys = new Set();
    map.delete(id);
    const prefix = `${id}:`;
    for (const key of snapshotCache.keys()) if (key.startsWith(prefix)) snapshotCache.delete(key);
    for (const key of failureBackoff.keys()) if (key.startsWith(prefix)) failureBackoff.delete(key);
    for (const key of inFlightReads.keys()) {
        if (!key.startsWith(prefix)) continue;
        pendingKeys.add(key);
        inFlightReads.delete(key);
        const invalidatedGeneration = (readGenerations.get(key) || 0) + 1;
        readGenerations.set(key, invalidatedGeneration);
        invalidatedReadGenerations.set(key, invalidatedGeneration);
    }
    for (const key of [...readGenerations.keys()]) {
        if (!key.startsWith(prefix) || pendingKeys.has(key)) continue;
        // Completed reads have no stale promise left to guard. Remove their
        // generation tombstones so provider rotation cannot grow maps forever.
        readGenerations.delete(key);
        invalidatedReadGenerations.delete(key);
    }
    for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
        if (diagnostics[index].moduleId === id) diagnostics.splice(index, 1);
    }
    return map;
}

function canReadAdapter(adapter, device) {
    return !!adapter && DEVICES.includes(device) && adapter.supportedDevices.includes(device);
}

function normalizeSnapshot(value, options = {}) {
    if (!value || typeof value !== "object") return {title: "", items: [], updatedAt: 0, empty: true};
    const rawItems = Array.isArray(value.items) ? value.items : [];
    const requestedMax = Number.isFinite(options.maxItems) ? Math.trunc(options.maxItems) : MAX_SNAPSHOT_ITEMS;
    const maxItems = Math.min(CALENDAR_MAX_SNAPSHOT_ITEMS, Math.max(1, requestedMax));
    const items = rawItems.slice(0, maxItems).map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = {label: safeText(item.label), value: safeText(item.value), href: safeHref(item.href), command: safeText(item.command, 128)};
        const image = safeImageHref(item.image);
        if (image) entry.image = image;
        const secondary = safeText(item.secondary, 96);
        if (secondary) entry.secondary = secondary;
        // 协议 v2.2：count 为非负整数（如标签出现次数），渲染为行内比例条
        if (Number.isFinite(item.count) && item.count >= 0) entry.count = Math.min(9999, Math.trunc(item.count));
        if (Number.isFinite(item.rank) && item.rank > 0) entry.rank = Math.min(9999, Math.trunc(item.rank));
        if (typeof item.done === "boolean") entry.done = item.done;
        if (item.outside === true) entry.outside = true;
        if (["off", "work"].includes(item.holiday)) entry.holiday = item.holiday;
        return entry;
        // 协议 v2：command 为 "插件名::命令key"，点击由宿主代为执行（有界格式）
        
    }).filter(Boolean);
    // 协议 v2.1：stat 为可选概览数值（如"今日待办 5 条"），渲染为大数字英雄区
    const statRaw = value.stat && typeof value.stat === "object" ? value.stat : null;
    const stat = statRaw && safeText(statRaw.value, 32)
        ? {value: safeText(statRaw.value, 32), label: safeText(statRaw.label, 32), progress: Number.isFinite(statRaw.progress) ? Math.min(100, Math.max(0, statRaw.progress)) : null}
        : null;
    const snapshot = {title: safeText(value.title, 64), items, stat, updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0, empty: items.length === 0};
    if (value.status === "blocked") snapshot.status = "blocked";
    if (["fresh", "cached", "stale"].includes(value.sourceHealth)) snapshot.sourceHealth = value.sourceHealth;
    const emptyHint = safeText(value.emptyHint, 96);
    if (emptyHint) snapshot.emptyHint = emptyHint;
    return snapshot;
}

const HOME_DATA_SOURCES = Object.freeze({
    "today-tasks": {kind: "siyuan", supportedDevices: ["desktop", "sidebar", "mobile"]},
    "today-journal": {kind: "siyuan", supportedDevices: ["desktop", "sidebar", "mobile"]},
    "recent-documents": {kind: "siyuan", supportedDevices: ["desktop", "sidebar", "mobile"]},
    "plugin-data": {kind: "plugin", supportedDevices: ["desktop", "sidebar", "mobile"]},
});

function getHomeDataSourceContract(sourceId) {
    const id = safeText(sourceId, 64);
    const source = HOME_DATA_SOURCES[id];
    return source ? {sourceId: id, kind: source.kind, supportedDevices: [...source.supportedDevices], readOnly: true} : null;
}

async function readHomeModule(adapters, moduleId, device, config = {}, options = {}) {
    const map = adapters instanceof Map ? adapters : registerHomeAdapters(adapters);
    const normalizedModuleId = safeText(moduleId, 64);
    const adapter = map.get(normalizedModuleId);
    if (!adapter) return {ok: false, reason: "unregistered", snapshot: normalizeSnapshot(null)};
    if (!canReadAdapter(adapter, device)) return {ok: false, reason: "unsupported", snapshot: normalizeSnapshot(null)};
    const normalizedConfig = normalizeConfig(config);
    const cacheKey = buildHomeAdapterCacheKey(adapter.moduleId, device, normalizedConfig);
    const now = Date.now();
    const failedUntil = failureBackoff.get(cacheKey) || 0;
    if (options.force !== true && failedUntil > now) {
        const cached = snapshotCache.get(cacheKey);
        recordDiagnostic("backoff", moduleId, device);
        return {ok: false, reason: "backoff", snapshot: cached?.snapshot || normalizeSnapshot(null)};
    }
    const ttl = Number.isFinite(options.cacheTtlMs) ? Math.max(0, options.cacheTtlMs) : adapter.cacheTtlMs;
    if (options.force !== true && ttl > 0) {
        const cached = snapshotCache.get(cacheKey);
        if (cached && now - cached.at < ttl) {
            recordDiagnostic("cache", moduleId, device);
            return {ok: true, cached: true, snapshot: cached.snapshot};
        }
    }
    let signal = options.signal && typeof options.signal === "object" ? options.signal : null;
    // T-7164：dedupe 只共享相同取消语境的读——不同 signal 的调用者各自开读，
    // 首调用者的 abort 不再误伤共享等待者。
    if (options.dedupe !== false) {
        const inflight = inFlightReads.get(cacheKey);
        if (inflight && inflight.signal === signal) return inflight.promise;
    }
    const generation = (readGenerations.get(cacheKey) || 0) + 1;
    readGenerations.set(cacheKey, generation);
    const run = (async () => {
    let timeoutHandle = null;
    let abortHandler = null;
    try {
        const timeout = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : adapter.timeoutMs;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error("timeout")), timeout);
        });
        if (signal?.aborted) throw new Error("aborted");
        const abortPromise = signal && typeof signal.addEventListener === "function" ? new Promise((_, reject) => {
            abortHandler = () => reject(new Error("aborted"));
            signal.addEventListener("abort", abortHandler, {once: true});
        }) : null;
        const value = await Promise.race([
            // 尺寸感知接口（协议 v2.3）：第三参携带当前型号，适配器可按尺寸裁剪内容
            Promise.resolve(adapter.read(normalizedConfig, device, {
                size: typeof options.size === "string" ? options.size.slice(0, 16) : "",
                signal,
            })),
            timeoutPromise,
            ...(abortPromise ? [abortPromise] : []),
        ]);
        const snapshot = normalizeSnapshot(value, {
            maxItems: adapter.moduleId === "journal-calendar" ? CALENDAR_MAX_SNAPSHOT_ITEMS : MAX_SNAPSHOT_ITEMS,
        });
        if (invalidatedReadGenerations.get(cacheKey) > generation) {
            return {ok: false, reason: "stale", snapshot: normalizeSnapshot(null)};
        }
        // T-7164：缓存提交与退避清除同守卫——旧代成功不得清除新代的失败退避。
        if (readGenerations.get(cacheKey) === generation) {
            snapshotCache.set(cacheKey, {at: Date.now(), snapshot});
            failureBackoff.delete(cacheKey);
        }
        if (snapshot.empty) recordDiagnostic("empty", moduleId, device);
        return {ok: true, cached: false, snapshot};
    } catch (error) {
        if (invalidatedReadGenerations.get(cacheKey) > generation) {
            return {ok: false, reason: "stale", snapshot: normalizeSnapshot(null)};
        }
        const reason = error?.message === "timeout" ? "timeout" : error?.message === "aborted" ? "aborted" : "failed";
        const previous = failureBackoff.get(cacheKey) || 0;
        const delay = Math.min(30000, previous > now ? Math.max(1000, (previous - now) * 2) : 1000);
        if (reason !== "aborted" && readGenerations.get(cacheKey) === generation) failureBackoff.set(cacheKey, now + delay);
        const cached = snapshotCache.get(cacheKey);
        recordDiagnostic(reason, moduleId, device);
        return {ok: false, reason, snapshot: cached?.snapshot || normalizeSnapshot(null)};
    } finally {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
        if (signal && abortHandler && typeof signal.removeEventListener === "function") {
            signal.removeEventListener("abort", abortHandler);
        }
    }
    })();
    inFlightReads.set(cacheKey, {promise: run, signal});
    try { return await run; } finally {
        const inflight = inFlightReads.get(cacheKey);
        if (inflight && inflight.promise === run) inFlightReads.delete(cacheKey);
        const invalidatedGeneration = invalidatedReadGenerations.get(cacheKey);
        if (!inFlightReads.has(cacheKey)
            && invalidatedGeneration !== undefined
            && readGenerations.get(cacheKey) === invalidatedGeneration) {
            invalidatedReadGenerations.delete(cacheKey);
            readGenerations.delete(cacheKey);
        }
    }
}

function clearHomeSnapshotCache() {
    snapshotCache.clear();
    failureBackoff.clear();
    // Keep pending promises visible while invalidating their generation. A
    // later read with the same key must not accept a pre-clear response.
    for (const key of inFlightReads.keys()) {
        const invalidatedGeneration = (readGenerations.get(key) || 0) + 1;
        readGenerations.set(key, invalidatedGeneration);
        invalidatedReadGenerations.set(key, invalidatedGeneration);
    }
    for (const key of [...readGenerations.keys()]) {
        if (!inFlightReads.has(key)) {
            readGenerations.delete(key);
            invalidatedReadGenerations.delete(key);
        }
    }
    diagnostics.length = 0;
}

function getHomeAdapterDiagnostics() {
    return diagnostics.map((item) => ({...item}));
}

// Resource trend probes observe only bounded state counts. Cache keys and
// provider payloads stay inside this module and never cross the diagnostic
// boundary.
function getHomeAdapterResourceStats() {
    return {
        snapshotCacheEntries: snapshotCache.size,
        failureBackoffEntries: failureBackoff.size,
        inFlightReads: inFlightReads.size,
        readGenerationEntries: readGenerations.size,
        invalidatedReadGenerationEntries: invalidatedReadGenerations.size,
        diagnosticEntries: diagnostics.length,
    };
}

function planHomeRefresh({visible = true, device = "desktop", stale = false, force = false, failure = false} = {}) {
    const target = DEVICES.includes(device) ? device : "desktop";
    if (force) return {shouldRefresh: true, reason: "force", device: target, delayMs: 0};
    if (!visible) return {shouldRefresh: false, reason: "hidden", device: target, delayMs: 0};
    if (failure) return {shouldRefresh: false, reason: "backoff", device: target, delayMs: target === "mobile" ? 15000 : 5000};
    if (!stale) return {shouldRefresh: false, reason: "fresh", device: target, delayMs: 0};
    return {shouldRefresh: true, reason: "stale", device: target, delayMs: target === "mobile" ? 500 : 0};
}

function planHomeLifecycleRefresh(event = {}, state = {}) {
    const type = safeText(event && typeof event === "object" ? event.type : "", 32);
    const next = {...state};
    if (type === "panel-hidden") next.visible = false;
    else if (type === "panel-visible") next.visible = true;
    else if (type === "tab-changed" || type === "device-changed") next.stale = true;
    else if (type === "force-refresh") next.force = true;
    else if (type === "recovered") { next.failure = false; next.stale = true; }
    return planHomeRefresh(next);
}

function coalesceHomeRefreshEvents(events = [], state = {}, max = 8) {
    const list = Array.isArray(events) ? events.slice(-Math.max(1, max)) : [];
    let plan = planHomeRefresh(state);
    list.forEach((event) => {
        plan = planHomeLifecycleRefresh(event, {...state, ...plan, stale: plan.reason === "stale" || plan.shouldRefresh});
    });
    return plan;
}

function consumeHomeAdapterDiagnostics(device) {
    const hasDeviceFilter = DEVICES.includes(device);
    const filtered = hasDeviceFilter ? diagnostics.filter((item) => item.device === device) : diagnostics.slice();
    if (hasDeviceFilter) {
        const retained = diagnostics.filter((item) => item.device !== device);
        diagnostics.splice(0, diagnostics.length, ...retained);
    } else diagnostics.length = 0;
    return filtered.map((item) => ({...item}));
}

module.exports = {MAX_SNAPSHOT_ITEMS, CALENDAR_MAX_SNAPSHOT_ITEMS, DEFAULT_READ_TIMEOUT_MS, DEFAULT_CACHE_TTL_MS, MAX_DIAGNOSTICS, HOME_DATA_SOURCES, getHomeDataSourceContract, registerHomeAdapters, buildHomeAdapterCacheKey, normalizeHomeAdapterConfig: normalizeConfig, unregisterHomeAdapter, canReadAdapter, normalizeSnapshot, readHomeModule, clearHomeSnapshotCache, getHomeAdapterDiagnostics, getHomeAdapterResourceStats, consumeHomeAdapterDiagnostics, planHomeRefresh, planHomeLifecycleRefresh, coalesceHomeRefreshEvents};
