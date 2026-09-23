"use strict";

/**
 * Pure favorite-entry operations shared by desktop, sidebar and mobile UI.
 * The caller owns persistence and supplies already-normalized entries.
 */

function removeFavoriteEntry(entries, key) {
    const list = Array.isArray(entries) ? entries : [];
    const normalizedKey = typeof key === "string" ? key : "";
    const items = list.filter((entry) => entry?.key !== normalizedKey);
    return {items, changed: items.length !== list.length};
}

function setFavoriteEntryGroup(entries, key, group) {
    const list = Array.isArray(entries) ? entries : [];
    const normalizedKey = typeof key === "string" ? key : "";
    const normalizedGroup = typeof group === "string" ? group.trim() : "";
    let changed = false;
    const items = list.map((entry) => {
        if (!entry || entry.key !== normalizedKey || entry.group === normalizedGroup) return entry;
        changed = true;
        return {...entry, group: normalizedGroup};
    });
    return {items, changed};
}

function migrateFavoriteEntry(entries, legacyKey, rootId) {
    const list = Array.isArray(entries) ? entries : [];
    const oldKey = typeof legacyKey === "string" ? legacyKey : "";
    const newKey = typeof rootId === "string" ? rootId : "";
    const index = list.findIndex((entry) => entry?.key === oldKey && oldKey && oldKey !== newKey);
    if (index < 0 || !newKey) return {items: list.slice(), changed: false, migrated: false};
    if (list.some((entry) => entry?.key === newKey)) {
        return {items: list.filter((_, itemIndex) => itemIndex !== index), changed: true, migrated: true, duplicate: true};
    }
    const items = list.slice();
    items[index] = {...items[index], key: newKey, rootId: newKey};
    return {items, changed: true, migrated: true, duplicate: false};
}

module.exports = {removeFavoriteEntry, setFavoriteEntryGroup, migrateFavoriteEntry,
    normalizeFavoriteSmartGroups, buildTagSmartGroupQuery, projectTagSmartGroupEntries};

// ==================== T-6804 智能分组（标签驱动的动态收藏组） ====================
// 用户只选择标签名（来自内核 getTag），查询由插件按白名单端点参数化构造——
// 不向用户暴露 SQL（执行口径）。条目为只读投影：跳转复用打开链路，不可
// 移动分组/取消收藏（那属于静态收藏的操作语义）。
// T-6817 动态组扩展：标签为锚点，可叠加笔记本范围与更新时间窗（参数化组合，
// 仍是白名单构造，不开放任意 SQL）。

const SMART_GROUP_MAX = 4;
const SMART_GROUP_NAME_MAX = 24;
const SMART_GROUP_TAG_MAX = 32;
const SMART_GROUP_ENTRY_LIMIT = 20;
// 更新时间窗白名单：只允许预设档位，拒绝任意天数
const SMART_GROUP_UPDATED_CHOICES = [7, 30, 90];

function normalizeSmartGroupNotebook(value) {
    return typeof value === "string" ? value.trim().replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 64) : "";
}

function normalizeSmartGroupDays(value) {
    const days = Number(value);
    return SMART_GROUP_UPDATED_CHOICES.includes(days) ? days : 0;
}

function normalizeFavoriteSmartGroups(value, max = SMART_GROUP_MAX) {
    const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : SMART_GROUP_MAX;
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const groups = [];
    for (const raw of value) {
        if (groups.length >= cap) break;
        if (!raw || typeof raw !== "object") continue;
        const name = typeof raw.name === "string" ? raw.name.trim().slice(0, SMART_GROUP_NAME_MAX) : "";
        // 剔除 LIKE 通配符与引号类字符：标签名来自内核清单，可能包含任意内容
        const tag = typeof raw.tag === "string" ? raw.tag.trim().replace(/['\\%_]/g, "").slice(0, SMART_GROUP_TAG_MAX) : "";
        if (!name || !tag || seen.has(name)) continue;
        const notebook = normalizeSmartGroupNotebook(raw.notebook);
        const updatedWithinDays = normalizeSmartGroupDays(raw.updatedWithinDays);
        seen.add(name);
        groups.push({
            name, tag,
            ...(notebook ? {notebook} : {}),
            ...(updatedWithinDays ? {updatedWithinDays} : {}),
        });
    }
    return groups;
}

// 文档级标签在思源以 #标签# 形态存在于根块 content；首尾 # 保证标签边界
//（"读"不会误配"读书"）。LIMIT 由插件注入并钳制，杜绝无界行数。
// T-6817：group 可传对象 {tag, notebook?, updatedWithinDays?}；兼容旧字符串标签。
// updated >= cutoff 利用 updated（YYYYMMDDHHMMSS 定长字符串）的字典序比较。
function buildTagSmartGroupQuery(group, options = {}) {
    const limit = typeof options === "number" ? options : (Number.isFinite(options?.limit) ? options.limit : SMART_GROUP_ENTRY_LIMIT);
    const nowMs = Number.isFinite(options?.nowMs) && options.nowMs > 0 ? options.nowMs : Date.now();
    const raw = group && typeof group === "object" ? group : {tag: group};
    const safe = typeof raw.tag === "string" ? raw.tag.trim().replace(/['\\%_]/g, "").slice(0, SMART_GROUP_TAG_MAX) : "";
    if (!safe) return null;
    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : SMART_GROUP_ENTRY_LIMIT;
    let stmt = `SELECT id, content FROM blocks WHERE type='d' AND content LIKE '%#${safe}#%'`;
    const notebook = normalizeSmartGroupNotebook(raw.notebook);
    if (notebook) stmt += ` AND box='${notebook}'`;
    const days = normalizeSmartGroupDays(raw.updatedWithinDays);
    if (days) {
        const cutoff = new Date(nowMs - days * 86400000)
            .toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
        stmt += ` AND updated >= '${cutoff}'`;
    }
    stmt += ` LIMIT ${cap}`;
    return {stmt};
}

function projectTagSmartGroupEntries(rows) {
    if (!Array.isArray(rows)) return [];
    // 与宿主 BLOCK_ID_RE 同款：14 位时间戳 + '-' + 字母数字，挡住非文档行
    const blockIdRe = /^\d{14}-[0-9a-z]+$/i;
    const seen = new Set();
    const items = [];
    for (const row of rows) {
        const rootId = typeof row?.id === "string" ? row.id : "";
        const title = typeof row?.content === "string" && row.content.trim() ? row.content.trim().slice(0, 200) : "";
        if (!rootId || !blockIdRe.test(rootId) || !title || seen.has(rootId)) continue;
        seen.add(rootId);
        items.push({rootId, title});
        if (items.length >= SMART_GROUP_ENTRY_LIMIT) break;
    }
    return items;
}
