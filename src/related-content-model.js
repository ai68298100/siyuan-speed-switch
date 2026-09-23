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

module.exports = {
    RELATED_ITEM_MAX,
    projectRelatedContent,
    isRelatedCacheHit,
};
