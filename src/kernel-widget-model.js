"use strict";

// 内核数据组件的有界投影模型（T-6321~T-6325、T-6328）。
// 数据源全部是思源内核自带的只读端点（v3.8.x 起）：置顶文档、收集箱、最近更新块、
// 缺失资源、原生最近文档、数据库块清单。与外部组件不同，这些不需要白名单 URL——
// 请求走 index.ts 的 KERNEL_ENDPOINTS 字面量分发；本文件只做响应形状的有界投影。
//
// 信任边界：
//   - 内核响应是有界输入：所有文本字段经 boundedText 钳制，条目数按配置截断，
//     不把未校验字段透传给渲染层；
//   - 收集箱（getShorthands）是云端接口：未登录/网络失败/内层 code 非零都归一为
//     null（由 adapter 转确定空态），绝不把云端错误文本带给用户；
//   - 点击语义与面板既有约定一致：item.value 为块/文档 ID 时面板直接打开该文档，
//     链接类（收集箱原文 URL）交给渲染层的 href 白名单。

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampLimit(value, fallback = 8) {
    const raw = Math.trunc(Number(value));
    return Number.isFinite(raw) ? Math.min(12, Math.max(1, raw)) : fallback;
}

function responseItems(payload) {
    if (payload && typeof payload === "object" && Array.isArray(payload.data)) return payload.data;
    return null;
}

function snapshotOf(title, items, labels, now, status, emptyHint = "") {
    return {
        title: boundedText(title, 64) || boundedText(labels.title, 64) || "",
        items,
        emptyHint: items.length === 0 ? (emptyHint || boundedText(labels.empty, 96) || "暂无内容") : "",
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        sourceHealth: ["fresh", "cached", "stale"].includes(status) ? status : "fresh",
    };
}

// ---------- T-6321 置顶文档（/api/filetree/getPinnedDocs） ----------
function normalizePinnedDocsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {limit: clampLimit(source.limit, 8)};
}

function buildPinnedDocsSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const list = responseItems(payload);
    if (!list) return null;
    const normalized = normalizePinnedDocsConfig(config);
    const items = [];
    for (const doc of list) {
        if (!doc || typeof doc !== "object" || doc.unavailable === true) continue;
        const id = boundedText(doc.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id)) continue;
        if (items.length >= normalized.limit) break;
        items.push({
            label: boundedText(doc.name, 128) || id,
            value: id,
            rank: items.length + 1,
        });
    }
    return snapshotOf(boundedText(labels.title, 64) || "置顶文档", items, labels, now, status, "还没有置顶文档");
}

// ---------- T-6322 收集箱（/api/inbox/getShorthands，云端） ----------
function normalizeInboxConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const page = Math.max(1, Math.trunc(Number(source.page)) || 1);
    return {page, limit: clampLimit(source.limit, 8)};
}

// 双层信封：内核 {code, data:{code, data:{shorthands}}}——内层任一 code 非零或
// 未登录（内核层 code!=0）都返回 null。
function buildInboxSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const outer = payload && typeof payload === "object" ? payload : null;
    if (!outer || Number(outer.code) !== 0) return null;
    const inner = outer.data && typeof outer.data === "object" ? outer.data : null;
    if (!inner || Number(inner.code) !== 0) return null;
    const page = inner.data && typeof inner.data === "object" && Array.isArray(inner.data.shorthands)
        ? inner.data.shorthands
        : null;
    if (!page) return null;
    const normalized = normalizeInboxConfig(config);
    const items = [];
    for (const shorthand of page) {
        if (!shorthand || typeof shorthand !== "object") continue;
        if (items.length >= normalized.limit) break;
        const title = boundedText(shorthand.shorthandTitle, 128);
        const content = boundedText(shorthand.shorthandContent, 160);
        const label = title || content;
        if (!label) continue;
        items.push({
            label,
            value: boundedText(shorthand.shorthandURL, 512),
            href: /^https?:\/\//i.test(String(shorthand.shorthandURL || "")) ? String(shorthand.shorthandURL) : undefined,
            rank: items.length + 1,
        });
    }
    return snapshotOf(boundedText(labels.title, 64) || "收集箱", items, labels, now, status, "收集箱为空或未登录思源账号");
}

// ---------- T-6323 最近更新（/api/block/getRecentUpdatedBlocks） ----------
function normalizeRecentUpdatesConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {limit: clampLimit(source.limit, 8)};
}

function buildRecentUpdatesSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const blocks = responseItems(payload);
    if (!blocks) return null;
    const normalized = normalizeRecentUpdatesConfig(config);
    const items = [];
    const seen = new Set();
    for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const rootId = boundedText(block.rootID, 64) || boundedText(block.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(rootId)) continue;
        const content = boundedText(block.fcontent, 120) || boundedText(block.content, 120);
        const hPath = boundedText(block.hPath, 128);
        const key = `${rootId}:${content}`;
        if (!content || seen.has(key)) continue;
        seen.add(key);
        if (items.length >= normalized.limit) break;
        items.push({
            label: content,
            value: rootId,
            secondary: hPath,
            rank: items.length + 1,
        });
    }
    return snapshotOf(boundedText(labels.title, 64) || "最近更新", items, labels, now, status, "暂无最近更新的内容块");
}

// ---------- T-6324 数据健康（/api/asset/getMissingAssets） ----------
function normalizeDataHealthConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {limit: clampLimit(source.limit, 8)};
}

function buildDataHealthSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const assets = responseItems(payload);
    if (!assets) return null;
    const normalized = normalizeDataHealthConfig(config);
    const items = [];
    const seen = new Set();
    for (const asset of assets) {
        if (!asset || typeof asset !== "object") continue;
        const name = boundedText(asset.name, 128) || boundedText(asset.item, 128);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        if (items.length >= normalized.limit) break;
        items.push({
            label: name,
            value: "",
            secondary: boundedText(asset.path, 160),
            rank: items.length + 1,
        });
    }
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "数据健康", items, labels, now, status, "未发现缺失资源");
    snapshot.stat = {value: String(items.length >= normalized.limit ? `${normalized.limit}+` : items.length), label: boundedText(labels.stat, 32) || "缺失资源"};
    return snapshot;
}

// ---------- T-6325 原生最近文档（/api/storage/getRecentDocs） ----------
function normalizeHostRecentDocsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {limit: clampLimit(source.limit, 8)};
}

function buildHostRecentDocsSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const docs = responseItems(payload);
    if (!docs) return null;
    const normalized = normalizeHostRecentDocsConfig(config);
    const byId = new Map();
    for (const doc of docs) {
        if (!doc || typeof doc !== "object") continue;
        const id = boundedText(doc.rootID, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id)) continue;
        const stamp = Math.max(Number(doc.viewedAt) || 0, Number(doc.closedAt) || 0, Number(doc.openAt) || 0);
        const previous = byId.get(id);
        if (!previous || stamp > previous.stamp) byId.set(id, {stamp, title: boundedText(doc.title, 128)});
    }
    const items = [...byId.entries()]
        .sort((a, b) => b[1].stamp - a[1].stamp)
        .slice(0, normalized.limit)
        .map(([id, entry], index) => ({
            label: entry.title || id,
            value: id,
            rank: index + 1,
        }));
    return snapshotOf(boundedText(labels.title, 64) || "最近文档", items, labels, now, status, "暂无最近打开的文档");
}

// ---------- T-6328 数据库导航（/api/query/sql，type='av'） ----------
function normalizeDatabaseListConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {limit: clampLimit(source.limit, 8)};
}

function buildDatabaseListSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    const list = Array.isArray(rows) ? rows : null;
    if (list === null) return null;
    const normalized = normalizeDatabaseListConfig(config);
    const items = [];
    const seen = new Set();
    for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || seen.has(id)) continue;
        seen.add(id);
        if (items.length >= normalized.limit) break;
        items.push({
            label: boundedText(row.content, 128) || boundedText(row.hpath, 128) || id,
            value: id,
            secondary: boundedText(row.hpath, 128),
            rank: items.length + 1,
        });
    }
    return snapshotOf(boundedText(labels.title, 64) || "数据库", items, labels, now, status, "工作区里还没有思源数据库");
}

module.exports = {
    normalizePinnedDocsConfig,
    buildPinnedDocsSnapshot,
    normalizeInboxConfig,
    buildInboxSnapshot,
    normalizeRecentUpdatesConfig,
    buildRecentUpdatesSnapshot,
    normalizeDataHealthConfig,
    buildDataHealthSnapshot,
    normalizeHostRecentDocsConfig,
    buildHostRecentDocsSnapshot,
    normalizeDatabaseListConfig,
    buildDatabaseListSnapshot,
};
