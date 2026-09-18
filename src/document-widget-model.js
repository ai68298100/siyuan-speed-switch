"use strict";

// 本地文档入口组件的纯投影模型。收藏、文档集和指定文档共用同一组
// 有界文本、配置默认值和失效目标语义，避免 adapter 各自拼装卡片。
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;

function text(value, max = 128) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
        : "";
}

function limitOf(value, fallback = 8) {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.min(12, Math.max(1, parsed)) : fallback;
}

function resolveFavoriteRootId(favorite) {
    const rootId = text(favorite?.rootId, 64);
    if (BLOCK_ID_RE.test(rootId)) return rootId;
    const key = text(favorite?.key, 96);
    return BLOCK_ID_RE.test(key) ? key : "";
}

function normalizeFavoritesWidgetConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: limitOf(source.limit, 8),
        group: text(source.group, 64),
        showGroup: source.showGroup !== "否" && source.showGroup !== false,
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUnavailable: source.showUnavailable !== "否" && source.showUnavailable !== false,
    };
}

function selectFavoriteEntries(value, config) {
    const normalized = normalizeFavoritesWidgetConfig(config);
    const source = Array.isArray(value) ? value : [];
    const scoped = source.filter((favorite) => {
        if (!favorite || typeof favorite !== "object" || !text(favorite.key, 96)) return false;
        const group = text(favorite.group, 64);
        if (!normalized.group) return true;
        if (normalized.group === "__ungrouped__") return !group;
        return group === normalized.group;
    });
    return {normalized, scoped, visible: scoped.slice(0, normalized.limit)};
}

function favoriteDocumentIdsForProbe(value, config) {
    const {visible} = selectFavoriteEntries(value, config);
    return [...new Set(visible.map(resolveFavoriteRootId).filter(Boolean))];
}

function buildFavoritesWidgetSnapshot(value, documents, openedKeys, config, labels = {}) {
    const {normalized, scoped, visible} = selectFavoriteEntries(value, config);
    const rows = Array.isArray(documents) ? documents : [];
    const documentMap = new Map();
    rows.forEach((row) => {
        const id = text(row?.id, 64);
        if (BLOCK_ID_RE.test(id) && !documentMap.has(id)) documentMap.set(id, row);
    });
    const opened = openedKeys instanceof Set ? openedKeys : new Set(Array.isArray(openedKeys) ? openedKeys : []);
    const items = [];
    visible.forEach((favorite) => {
        const key = text(favorite.key, 96);
        const rootId = resolveFavoriteRootId(favorite);
        const document = rootId ? documentMap.get(rootId) : null;
        const sessionOnly = !rootId && opened.has(key);
        const unavailable = rootId ? !document : !sessionOnly;
        if (unavailable && !normalized.showUnavailable) return;
        const group = text(favorite.group, 64);
        const parts = [];
        if (unavailable) parts.push(text(labels.unavailable, 48) || "目标已不可用");
        else if (sessionOnly) parts.push(text(labels.sessionOnly, 48) || "仅当前会话可用");
        if (normalized.showGroup) parts.push(group || text(labels.ungrouped, 32) || "未分组");
        const path = normalized.showPath ? text(document?.hpath || document?.hPath, 96) : "";
        if (path) parts.push(path);
        items.push({
            label: text(favorite.title, 128) || text(document?.content, 128) || key,
            value: key,
            secondary: parts.join(" · "),
        });
    });
    const scopedEmpty = normalized.group
        ? text(labels.emptyGroup, 96) || "该分组还没有收藏"
        : text(labels.empty, 96) || "还没有收藏";
    return {
        title: text(labels.title, 64) || "收藏",
        stat: {value: String(scoped.length), label: text(labels.stat, 32) || "收藏"},
        items,
        emptyHint: items.length === 0
            ? (scoped.length > 0 ? text(labels.emptyAvailable, 96) || "没有可显示的收藏" : scopedEmpty)
            : "",
    };
}

function normalizeDocumentSetsWidgetConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const sortBy = ["名称", "文档数"].includes(source.sortBy) ? source.sortBy : "最近使用";
    return {
        limit: limitOf(source.limit, 8),
        sortBy,
        showCount: source.showCount !== "否" && source.showCount !== false,
        showUpdated: source.showUpdated !== "否" && source.showUpdated !== false,
    };
}

function buildDocumentSetsWidgetSnapshot(value, config, labels = {}) {
    const normalized = normalizeDocumentSetsWidgetConfig(config);
    const sets = (Array.isArray(value) ? value : []).filter((set) => set && typeof set === "object" && text(set.setId, 96) && text(set.name, 80));
    const sorted = sets.map((set, index) => ({set, index})).sort((left, right) => {
        if (normalized.sortBy === "名称") return text(left.set.name, 80).localeCompare(text(right.set.name, 80)) || left.index - right.index;
        if (normalized.sortBy === "文档数") {
            const delta = (Array.isArray(right.set.entries) ? right.set.entries.length : 0) - (Array.isArray(left.set.entries) ? left.set.entries.length : 0);
            return delta || left.index - right.index;
        }
        return (Number(right.set.updatedAt) || 0) - (Number(left.set.updatedAt) || 0) || left.index - right.index;
    });
    const items = sorted.slice(0, normalized.limit).map(({set}) => {
        const count = Array.isArray(set.entries) ? set.entries.length : 0;
        const parts = [];
        if (normalized.showCount) parts.push(`${count} ${text(labels.documents, 24) || "篇文档"}`);
        const stamp = Number(set.updatedAt) || Number(set.createdAt) || 0;
        if (normalized.showUpdated && stamp > 0) {
            const date = new Date(stamp);
            if (!Number.isNaN(date.getTime())) parts.push(date.toISOString().slice(0, 10));
        }
        return {label: text(set.name, 80), value: `set:${text(set.setId, 96)}`, secondary: parts.join(" · ")};
    });
    return {
        title: text(labels.title, 64) || "文档集",
        stat: {value: String(sets.length), label: text(labels.stat, 32) || "文档集"},
        items,
        emptyHint: items.length === 0 ? text(labels.empty, 96) || "还没有保存文档集" : "",
    };
}

function normalizeFixedDocumentConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const docId = text(source.docId, 64);
    return {
        docId: BLOCK_ID_RE.test(docId) ? docId : "",
        title: text(source.title, 128),
        showPath: source.showPath !== "否" && source.showPath !== false,
    };
}

function buildFixedDocumentSnapshot(documents, config, labels = {}) {
    const normalized = normalizeFixedDocumentConfig(config);
    if (!normalized.docId) return {items: [], emptyHint: text(labels.configure, 96) || "请先选择文档"};
    const rows = Array.isArray(documents) ? documents : [];
    const row = rows.find((candidate) => text(candidate?.id, 64) === normalized.docId);
    if (!row) return {items: [], emptyHint: text(labels.unavailable, 96) || "绑定文档已不存在或不可用"};
    const path = normalized.showPath ? text(row.hpath || row.hPath, 96) : "";
    return {
        items: [{
            label: normalized.title || text(row.content, 128) || normalized.docId,
            value: normalized.docId,
            ...(path ? {secondary: path} : {}),
        }],
        emptyHint: "",
    };
}

module.exports = {
    normalizeFavoritesWidgetConfig,
    selectFavoriteEntries,
    favoriteDocumentIdsForProbe,
    buildFavoritesWidgetSnapshot,
    normalizeDocumentSetsWidgetConfig,
    buildDocumentSetsWidgetSnapshot,
    normalizeFixedDocumentConfig,
    buildFixedDocumentSnapshot,
};
