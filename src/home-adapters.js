"use strict";

const {DEVICES, getModuleDefinition, normalizeConfig} = (() => {
    const model = require("./home-model.js");
    // normalizeConfig is intentionally kept private in the model; adapters
    // receive already bounded config and only expose bounded snapshots.
    return {...model, normalizeConfig: (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const result = {};
        Object.keys(value).slice(0, 32).forEach((key) => {
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
const MAX_TEXT = 256;
const DEFAULT_READ_TIMEOUT_MS = 800;
const DEFAULT_CACHE_TTL_MS = 3000;
const snapshotCache = new Map();
const failureBackoff = new Map();
const diagnostics = [];
const MAX_DIAGNOSTICS = 32;
const inFlightReads = new Map();
const readGenerations = new Map();
function recordDiagnostic(type, moduleId, device) {
    diagnostics.push({type: safeText(type, 24), moduleId: safeText(moduleId, 64), device: DEVICES.includes(device) ? device : "desktop", at: Date.now()});
    if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.splice(0, diagnostics.length - MAX_DIAGNOSTICS);
}

function safeText(value, max = MAX_TEXT) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function normalizeAdapter(adapter) {
    if (!adapter || typeof adapter !== "object") return null;
    const moduleId = safeText(adapter.moduleId, 64);
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(moduleId) || typeof adapter.read !== "function") return null;
    const supportedDevices = Array.isArray(adapter.supportedDevices)
        ? DEVICES.filter((device) => adapter.supportedDevices.includes(device)) : [];
    if (!supportedDevices.length) return null;
    return {moduleId, supportedDevices, read: adapter.read};
}

function registerHomeAdapters(adapters = []) {
    const result = new Map();
    (Array.isArray(adapters) ? adapters : []).forEach((raw) => {
        const adapter = normalizeAdapter(raw);
        if (adapter) result.set(adapter.moduleId, adapter);
    });
    return result;
}

function unregisterHomeAdapter(adapters, moduleId) {
    const map = adapters instanceof Map ? adapters : registerHomeAdapters(adapters);
    const id = safeText(moduleId, 64);
    map.delete(id);
    const prefix = `${id}:`;
    for (const key of snapshotCache.keys()) if (key.startsWith(prefix)) snapshotCache.delete(key);
    for (const key of failureBackoff.keys()) if (key.startsWith(prefix)) failureBackoff.delete(key);
    for (const key of inFlightReads.keys()) {
        if (!key.startsWith(prefix)) continue;
        inFlightReads.delete(key);
        readGenerations.set(key, (readGenerations.get(key) || 0) + 1);
    }
    for (const key of readGenerations.keys()) {
        if (key.startsWith(prefix) && !inFlightReads.has(key)) readGenerations.set(key, (readGenerations.get(key) || 0) + 1);
    }
    for (let index = diagnostics.length - 1; index >= 0; index -= 1) {
        if (diagnostics[index].moduleId === id) diagnostics.splice(index, 1);
    }
    return map;
}

function canReadAdapter(adapter, device) {
    return !!adapter && DEVICES.includes(device) && adapter.supportedDevices.includes(device);
}

function normalizeSnapshot(value) {
    if (!value || typeof value !== "object") return {title: "", items: [], updatedAt: 0, empty: true};
    const rawItems = Array.isArray(value.items) ? value.items : [];
    const items = rawItems.slice(0, MAX_SNAPSHOT_ITEMS).map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = {label: safeText(item.label), value: safeText(item.value), href: safeText(item.href, 512), command: safeText(item.command, 128)};
        // 协议 v2.2：count 为非负整数（如标签出现次数），渲染为行内比例条
        if (Number.isFinite(item.count) && item.count >= 0) entry.count = Math.min(9999, Math.trunc(item.count));
        if (typeof item.done === "boolean") entry.done = item.done;
        return entry;
        // 协议 v2：command 为 "插件名::命令key"，点击由宿主代为执行（有界格式）
        
    }).filter(Boolean);
    // 协议 v2.1：stat 为可选概览数值（如"今日待办 5 条"），渲染为大数字英雄区
    const statRaw = value.stat && typeof value.stat === "object" ? value.stat : null;
    const stat = statRaw && safeText(statRaw.value, 32)
        ? {value: safeText(statRaw.value, 32), label: safeText(statRaw.label, 32), progress: Number.isFinite(statRaw.progress) ? Math.min(100, Math.max(0, statRaw.progress)) : null}
        : null;
    return {title: safeText(value.title, 64), items, stat, updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0, empty: items.length === 0};
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
    const cacheKey = `${adapter.moduleId}:${device}:${JSON.stringify(normalizeConfig(config))}`;
    const generation = (readGenerations.get(cacheKey) || 0) + 1;
    readGenerations.set(cacheKey, generation);
    const now = Date.now();
    const failedUntil = failureBackoff.get(cacheKey) || 0;
    if (options.force !== true && failedUntil > now) {
        const cached = snapshotCache.get(cacheKey);
        recordDiagnostic("backoff", moduleId, device);
        return {ok: false, reason: "backoff", snapshot: cached?.snapshot || normalizeSnapshot(null)};
    }
    const ttl = Number.isFinite(options.cacheTtlMs) ? Math.max(0, options.cacheTtlMs) : DEFAULT_CACHE_TTL_MS;
    if (options.force !== true && ttl > 0) {
        const cached = snapshotCache.get(cacheKey);
        if (cached && now - cached.at < ttl) {
            recordDiagnostic("cache", moduleId, device);
            return {ok: true, cached: true, snapshot: cached.snapshot};
        }
    }
    if (options.dedupe !== false && inFlightReads.has(cacheKey)) return inFlightReads.get(cacheKey);
    const run = (async () => {
    let timeoutHandle = null;
    let abortHandler = null;
    let signal = null;
    try {
        const timeout = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : DEFAULT_READ_TIMEOUT_MS;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error("timeout")), timeout);
        });
        signal = options.signal && typeof options.signal === "object" ? options.signal : null;
        if (signal?.aborted) throw new Error("aborted");
        const abortPromise = signal && typeof signal.addEventListener === "function" ? new Promise((_, reject) => {
            abortHandler = () => reject(new Error("aborted"));
            signal.addEventListener("abort", abortHandler, {once: true});
        }) : null;
        const value = await Promise.race([
            Promise.resolve(adapter.read(normalizeConfig(config), device)),
            timeoutPromise,
            ...(abortPromise ? [abortPromise] : []),
        ]);
        const snapshot = normalizeSnapshot(value);
        if (readGenerations.get(cacheKey) === generation) snapshotCache.set(cacheKey, {at: Date.now(), snapshot});
        failureBackoff.delete(cacheKey);
        if (snapshot.empty) recordDiagnostic("empty", moduleId, device);
        return {ok: true, cached: false, snapshot};
    } catch (error) {
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
    inFlightReads.set(cacheKey, run);
    try { return await run; } finally {
        if (inFlightReads.get(cacheKey) === run) inFlightReads.delete(cacheKey);
    }
}

function clearHomeSnapshotCache() {
    snapshotCache.clear();
    failureBackoff.clear();
    inFlightReads.clear();
    readGenerations.clear();
    diagnostics.length = 0;
}

function getHomeAdapterDiagnostics() {
    return diagnostics.map((item) => ({...item}));
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

module.exports = {MAX_SNAPSHOT_ITEMS, DEFAULT_READ_TIMEOUT_MS, DEFAULT_CACHE_TTL_MS, MAX_DIAGNOSTICS, HOME_DATA_SOURCES, getHomeDataSourceContract, registerHomeAdapters, unregisterHomeAdapter, canReadAdapter, normalizeSnapshot, readHomeModule, clearHomeSnapshotCache, getHomeAdapterDiagnostics, consumeHomeAdapterDiagnostics, planHomeRefresh, planHomeLifecycleRefresh, coalesceHomeRefreshEvents};
