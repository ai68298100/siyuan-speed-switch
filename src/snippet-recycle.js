"use strict";

// T-7025（ADR 0100）：片段回收站纯模型——捕获、归一、去重与三限淘汰。
// 只做纯数据投影：不触碰 DOM、不持有会话状态；持久化由宿主经 sw_snippet_recycle
// key 管理（D-401 版本戳仪式）。语义要点：
// ①进入来源仅三种（overwrite/delete/conflict，明确枚举，ADR 0100 D1）；
// ②去重：同 snippetId+content 在去重窗口内只保留最新一条；
// ③三限淘汰：数量 50 / 年龄 30 天 / 字节总量 256 KiB，超限从最旧端丢弃；
// ④畸形条目丢弃、非法版本整体重置为空 store（沿用 sw_related_swr 语义）。

const RECYCLE_STORE_VERSION = 1;
const SNIPPET_RECYCLE_MAX_ENTRIES = 50;
const SNIPPET_RECYCLE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SNIPPET_RECYCLE_MAX_BYTES = 256 * 1024;
const SNIPPET_RECYCLE_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const RECYCLE_ORIGINS = Object.freeze(["overwrite", "delete", "conflict"]);
const RECYCLE_NAME_MAX = 128;
const RECYCLE_ID_MAX = 128;

function byteLength(text) {
    const value = String(text);
    // 沿用 floating-ball-settings-model 的沙箱安全口径：优先 TextEncoder，
    // 缺失时用 encodeURIComponent 近似（宿主 WebView 无 Node Buffer）。
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
    try {
        return encodeURIComponent(value).replace(/%[0-9A-Fa-f]{2}/g, "xx").length;
    } catch (_) {
        return value.length;
    }
}

function cleanRecycleText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

/** 构建回收站条目：origin 白名单、名称/id/类型清洗有界、内容必须是字符串、时间戳由调用方注入。 */
function buildRecycleEntry({origin, snippetId, name, type, content}, now) {
    if (!RECYCLE_ORIGINS.includes(origin)) return null;
    if (typeof content !== "string" || content.length === 0) return null;
    const stamp = Number(now);
    if (!Number.isFinite(stamp) || stamp <= 0) return null;
    const kind = type === "js" ? "js" : "css";
    return Object.freeze({
        recId: `${Math.round(stamp)}-${Math.random().toString(36).slice(2, 10)}`,
        origin,
        snippetId: cleanRecycleText(snippetId, RECYCLE_ID_MAX),
        name: cleanRecycleText(name, RECYCLE_NAME_MAX) || "(untitled)",
        type: kind,
        content,
        size: byteLength(content) + byteLength(name),
        createdAt: Math.round(stamp),
    });
}

function normalizeRecycleEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (!RECYCLE_ORIGINS.includes(raw.origin)) return null;
    if (typeof raw.content !== "string" || raw.content.length === 0) return null;
    if (typeof raw.recId !== "string" || raw.recId.length === 0 || raw.recId.length > 64) return null;
    const createdAt = Number(raw.createdAt);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    return Object.freeze({
        recId: raw.recId,
        origin: raw.origin,
        snippetId: cleanRecycleText(raw.snippetId, RECYCLE_ID_MAX),
        name: cleanRecycleText(raw.name, RECYCLE_NAME_MAX) || "(untitled)",
        type: raw.type === "js" ? "js" : "css",
        content: raw.content,
        size: byteLength(raw.content) + byteLength(raw.name),
        createdAt: Math.round(createdAt),
    });
}

/** 三限淘汰：年龄 → 数量 → 字节总量，全部从最旧端丢弃；返回 {entries, evicted}。 */
function evictRecycleEntries(entries, {now, maxEntries = SNIPPET_RECYCLE_MAX_ENTRIES, maxAgeMs = SNIPPET_RECYCLE_MAX_AGE_MS, maxBytes = SNIPPET_RECYCLE_MAX_BYTES} = {}) {
    const stamp = Number(now) || Date.now();
    let list = entries.filter((entry) => stamp - entry.createdAt <= maxAgeMs);
    let evicted = entries.length - list.length;
    if (list.length > maxEntries) {
        evicted += list.length - maxEntries;
        list = list.slice(list.length - maxEntries);
    }
    let total = list.reduce((sum, entry) => sum + entry.size, 0);
    while (total > maxBytes && list.length > 1) {
        const dropped = list.shift();
        total -= dropped.size;
        evicted += 1;
    }
    return {entries: list, evicted};
}

/** 归一存储载荷：畸形条目丢弃、非法版本整体重置；重排最旧→最新并再次三限兜底。 */
function normalizeRecycleStore(value, now = Date.now()) {
    const fresh = {version: RECYCLE_STORE_VERSION, entries: []};
    if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze(fresh);
    if (value.version !== RECYCLE_STORE_VERSION) return Object.freeze(fresh);
    if (!Array.isArray(value.entries)) return Object.freeze(fresh);
    const seen = new Set();
    const entries = [];
    for (const raw of value.entries) {
        const entry = normalizeRecycleEntry(raw);
        if (!entry || seen.has(entry.recId)) continue;
        seen.add(entry.recId);
        entries.push(entry);
    }
    entries.sort((a, b) => a.createdAt - b.createdAt);
    const bounded = evictRecycleEntries(entries, {now});
    return Object.freeze({version: RECYCLE_STORE_VERSION, entries: Object.freeze(bounded.entries)});
}

/** 追加条目：去重窗口内同 snippetId+content 只留最新；写入侧淘汰计数如实返回。 */
function appendRecycleEntry(store, entry, now = Date.now()) {
    const current = normalizeRecycleStore(store, now);
    if (!entry) return {store: current, added: false, evicted: 0};
    const kept = current.entries.filter((existing) => {
        if (existing.snippetId !== entry.snippetId || existing.content !== entry.content) return true;
        return entry.createdAt - existing.createdAt > SNIPPET_RECYCLE_DEDUPE_WINDOW_MS;
    });
    const merged = evictRecycleEntries([...kept, entry], {now});
    return {
        store: Object.freeze({version: RECYCLE_STORE_VERSION, entries: Object.freeze(merged.entries)}),
        added: true,
        evicted: (current.entries.length - kept.length) + merged.evicted,
    };
}

/** 清空：返回空 store（永久删除由宿主按 recId 过滤后复用本模块归一）。 */
function purgeRecycleEntry(store, recId, now = Date.now()) {
    const current = normalizeRecycleStore(store, now);
    const entries = current.entries.filter((entry) => entry.recId !== recId);
    return Object.freeze({version: RECYCLE_STORE_VERSION, entries: Object.freeze(entries), removed: current.entries.length - entries.length});
}

module.exports = {
    RECYCLE_STORE_VERSION,
    SNIPPET_RECYCLE_MAX_ENTRIES,
    SNIPPET_RECYCLE_MAX_AGE_MS,
    SNIPPET_RECYCLE_MAX_BYTES,
    SNIPPET_RECYCLE_DEDUPE_WINDOW_MS,
    RECYCLE_ORIGINS,
    buildRecycleEntry,
    normalizeRecycleEntry,
    normalizeRecycleStore,
    appendRecycleEntry,
    evictRecycleEntries,
    purgeRecycleEntry,
};
