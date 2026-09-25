"use strict";

// T-6814 关联内容只读适配（D3，ADR 0076 工作上下文批）
// 数据源 = 内核官方 /api/ref/getBacklink2（v3.8.5 apicontract/ref_list.go 取证）：
//   请求 {id: rootId, includeMentions, includeBacklinks}，一次往返同时拿反链与提及。
// 本模块只做投影与有界化：不触碰 DOM、不持有缓存、不决定请求是否发出。

const RELATED_ID_PATTERN = /^\d{14}-[0-9a-z]{7,14}$/;
const RELATED_ITEM_MAX = 8;
const RELATED_TEXT_MAX = 160;

function cleanRelatedText(value, max = RELATED_TEXT_MAX) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function normalizeRelatedSource(value) {
    return value === "backlink" || value === "mention" ? value : "";
}

/** 单条投影：id 必须是合法块/文档 ID（openTab 块定位依赖），标题回落路径回落 id。 */
function projectRelatedItem(raw, source) {
    if (!raw || typeof raw !== "object") return null;
    const id = cleanRelatedText(raw.id, 64);
    if (!RELATED_ID_PATTERN.test(id)) return null;
    const hPath = cleanRelatedText(raw.hPath, 200);
    const title = cleanRelatedText(raw.name, 120) || hPath || id;
    const box = cleanRelatedText(raw.box, 64);
    return {id, source, title, hPath, ...(box ? {box} : {})};
}

/**
 * 把 getBacklink2 的 data 投影为有界、去重、可序列化的关联条目。
 * 反链优先于提及（显式引用 > 命名命中）；同类内保持内核返回顺序（更新时间降序）。
 * counts 保留内核给出的总量（可能大于投影数）——截断可解释，不伪装成全量。
 */
function projectRelatedContent(payload, options = {}) {
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.floor(options.limit), RELATED_ITEM_MAX)
        : RELATED_ITEM_MAX;
    const safe = payload && typeof payload === "object" ? payload : {};
    const backlinks = [];
    const mentions = [];
    const seen = new Set();
    const push = (list, raw, source) => {
        const item = projectRelatedItem(raw, source);
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        list.push(item);
    };
    (Array.isArray(safe.backlinks) ? safe.backlinks : []).forEach((raw) => push(backlinks, raw, "backlink"));
    (Array.isArray(safe.backmentions) ? safe.backmentions : []).forEach((raw) => push(mentions, raw, "mention"));
    const picked = backlinks.slice(0, limit);
    const mentionsPicked = mentions.slice(0, Math.max(0, limit - picked.length));
    const total = (Number.isFinite(safe.linkRefsCount) ? Math.max(0, Math.floor(safe.linkRefsCount)) : backlinks.length)
        + (Number.isFinite(safe.mentionsCount) ? Math.max(0, Math.floor(safe.mentionsCount)) : mentions.length);
    const shown = picked.length + mentionsPicked.length;
    return {
        items: [...picked, ...mentionsPicked],
        counts: {
            backlinks: Number.isFinite(safe.linkRefsCount) ? Math.max(0, Math.floor(safe.linkRefsCount)) : backlinks.length,
            mentions: Number.isFinite(safe.mentionsCount) ? Math.max(0, Math.floor(safe.mentionsCount)) : mentions.length,
            shown,
        },
        truncated: shown < total,
    };
}

/** 会话级缓存条目有效性判断（TTL 与 rootId 绑定，防跨文档串味）。 */
function isRelatedCacheHit(entry, rootId, now, ttlMs = 60000) {
    if (!entry || typeof entry !== "object") return false;
    if (entry.rootId !== rootId || !rootId) return false;
    const at = Number(entry.at);
    return Number.isFinite(at) && Number.isFinite(ttlMs) && ttlMs > 0 && now - at >= 0 && now - at < ttlMs;
}

// ==================== T-6840 关联内容 SWR 持久化 ====================
// 投影落插件存储（sw_related_swr，D-401 版本戳体系），重启后工作台冷启动消除：
// 先显持久缓存（标注"缓存"）再后台刷新。持久条目不受 60s 会话 TTL 约束
// （显示语义=stale-while-revalidate），但有 7 天硬年龄上界——过期条目在
// normalize 时剔除，不把陈旧数据伪装成"缓存"。有界 8 条、按 at 降序、rootId 去重。
const RELATED_SWR_VERSION = 1;
const RELATED_SWR_MAX_ENTRIES = 8;
const RELATED_SWR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeRelatedSwrProjection(value) {
    if (!value || typeof value !== "object") return null;
    const items = [];
    if (Array.isArray(value.items)) {
        for (const raw of value.items) {
            if (items.length >= RELATED_ITEM_MAX) break;
            if (!raw || typeof raw !== "object") continue;
            const source = normalizeRelatedSource(raw.source);
            if (!source) continue;
            // 持久条目是投影形（title），projectRelatedItem 吃内核形（name）——映射后复用同一校验
            const item = projectRelatedItem({...raw, name: raw.title || raw.name}, source);
            if (!item) continue;
            items.push(item);
        }
    }
    if (items.length === 0) return null;
    const counts = value.counts && typeof value.counts === "object" ? value.counts : {};
    const num = (input) => Number.isFinite(input) && input >= 0 ? Math.floor(input) : 0;
    return {
        items,
        counts: {
            backlinks: num(counts.backlinks),
            mentions: num(counts.mentions),
            shown: Math.min(num(counts.shown) || items.length, items.length),
        },
        truncated: value.truncated === true,
    };
}

/**
 * 持久化存储值 → 可信条目数组（纯函数，onload 载入与写入前清洗共用）。
 * 非法条目整条剔除；rootId 去重保留最新；过期（>7 天）剔除；按 at 降序、上限 8。
 */
function normalizeRelatedSwrStore(value, options = {}) {
    const now = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const output = [];
    if (!value || typeof value !== "object" || value.version !== RELATED_SWR_VERSION || !Array.isArray(value.entries)) {
        return {version: RELATED_SWR_VERSION, entries: output};
    }
    const seen = new Set();
    for (const raw of value.entries) {
        if (output.length >= RELATED_SWR_MAX_ENTRIES) break;
        if (!raw || typeof raw !== "object") continue;
        const rootId = cleanRelatedText(raw.rootId, 64);
        if (!RELATED_ID_PATTERN.test(rootId) || seen.has(rootId)) continue;
        const at = Number(raw.at);
        if (!Number.isFinite(at) || at <= 0 || now - at < 0 || now - at > RELATED_SWR_MAX_AGE_MS) continue;
        const projection = normalizeRelatedSwrProjection(raw.projection);
        if (!projection) continue;
        seen.add(rootId);
        output.push({rootId, at: Math.floor(at), projection});
    }
    output.sort((a, b) => b.at - a.at);
    return {version: RELATED_SWR_VERSION, entries: output.slice(0, RELATED_SWR_MAX_ENTRIES)};
}

/** 会话内存更新后的序列化视图：Map entries → 可持久化 store（调用方负责写盘）。 */
function buildRelatedSwrStore(entries) {
    return normalizeRelatedSwrStore({
        version: RELATED_SWR_VERSION,
        entries: Array.isArray(entries) ? entries : [],
    });
}

module.exports = {
    RELATED_ITEM_MAX,
    RELATED_SWR_VERSION,
    RELATED_SWR_MAX_ENTRIES,
    RELATED_SWR_MAX_AGE_MS,
    projectRelatedContent,
    isRelatedCacheHit,
    normalizeRelatedSwrStore,
    buildRelatedSwrStore,
};
