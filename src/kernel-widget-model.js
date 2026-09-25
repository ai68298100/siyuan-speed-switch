"use strict";

// T-6465：用户内容（名称/标题/标签/路径）排序显式钉定 zh 拼音 Collator，
// 消除 localeCompare 缺省 locale 的宿主漂移（CI 镜像升级实证）。
const {compareText} = require("./util.js");

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

function formatKernelTime(value) {
    const stamp = boundedText(value, 32);
    if (!/^\d{14}$/.test(stamp)) return "";
    return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}`;
}

function localDateKey(now = Date.now()) {
    const date = new Date(Number.isFinite(now) ? now : Date.now());
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateKey(value) {
    const date = boundedText(value, 8);
    return /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : "";
}

// ---------- T-6321 置顶文档（/api/filetree/getPinnedDocs） ----------
function normalizePinnedDocsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 8),
        showPath: source.showPath !== "否" && source.showPath !== false,
        showChildCount: source.showChildCount !== "否" && source.showChildCount !== false,
        showRank: source.showRank === "是" || source.showRank === true,
        showUnavailable: source.showUnavailable !== "否" && source.showUnavailable !== false,
    };
}

function buildPinnedDocsSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const list = responseItems(payload);
    if (!list) return null;
    const normalized = normalizePinnedDocsConfig(config);
    const items = [];
    let unavailable = 0;
    for (const doc of list) {
        if (!doc || typeof doc !== "object") continue;
        const id = boundedText(doc.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id)) continue;
        const invalid = doc.unavailable === true;
        if (invalid) unavailable += 1;
        if (invalid && !normalized.showUnavailable) continue;
        if (!id) continue;
        if (items.length >= normalized.limit) break;
        const details = [];
        if (invalid) details.push(boundedText(labels.unavailable, 48) || "文档不可用");
        const path = normalized.showPath ? boundedText(doc.hpath || doc.hPath, 96) : "";
        if (path) details.push(path);
        const childCount = Math.max(0, Math.trunc(Number(doc.subFileCount)) || 0);
        if (normalized.showChildCount) details.push(`${childCount} ${boundedText(labels.children, 24) || "个子文档"}`);
        items.push({
            label: boundedText(doc.name, 128) || id,
            value: invalid ? "" : id,
            secondary: details.join(" · "),
            ...(normalized.showRank ? {rank: items.length + 1} : {}),
        });
    }
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "置顶文档", items, labels, now, status, "还没有置顶文档");
    snapshot.stat = {
        value: list.length > items.length ? `${items.length}/${list.length}` : String(items.length),
        label: unavailable > 0 ? `${boundedText(labels.stat, 24) || "置顶"} · ${unavailable} ${boundedText(labels.unavailableShort, 16) || "不可用"}` : boundedText(labels.stat, 32) || "置顶",
    };
    return snapshot;
}

// ---------- T-6322 收集箱（/api/inbox/getShorthands，云端） ----------
function normalizeInboxConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const page = Math.min(100, Math.max(1, Math.trunc(Number(source.page)) || 1));
    return {
        page,
        limit: clampLimit(source.limit, 8),
        query: boundedText(source.query, 64),
        showPreview: source.showPreview !== "否" && source.showPreview !== false,
        showLinkHost: source.showLinkHost !== "否" && source.showLinkHost !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function safeHttpHost(value) {
    try {
        const url = new URL(String(value || ""));
        return ["http:", "https:"].includes(url.protocol) ? boundedText(url.hostname, 64) : "";
    } catch (_) {
        return "";
    }
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
        const title = boundedText(shorthand.shorthandTitle, 128);
        const content = boundedText(shorthand.shorthandContent, 160);
        const label = title || content;
        if (!label) continue;
        if (normalized.query && !`${title}\n${content}`.toLocaleLowerCase().includes(normalized.query.toLocaleLowerCase())) continue;
        if (items.length >= normalized.limit) break;
        const rawUrl = boundedText(shorthand.shorthandURL, 512);
        const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : undefined;
        const details = [];
        if (normalized.showPreview && title && content && content !== title) details.push(content);
        const host = normalized.showLinkHost ? safeHttpHost(rawUrl) : "";
        if (host) details.push(host);
        items.push({
            label,
            value: rawUrl,
            href,
            ...(details.length ? {secondary: details.join(" · ")} : {}),
            ...(normalized.showRank ? {rank: items.length + 1} : {}),
        });
    }
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "收集箱", items, labels, now, status,
        normalized.query ? (boundedText(labels.emptyFiltered, 96) || "当前页没有符合筛选条件的速记") : "收集箱为空或未登录思源账号");
    const pagination = inner.data && typeof inner.data.pagination === "object" ? inner.data.pagination : {};
    const total = Math.max(0, Math.trunc(Number(pagination.total ?? pagination.totalCount)) || 0);
    snapshot.stat = {
        value: total > 0 ? (items.length < total ? `${items.length}/${total}` : String(total)) : String(items.length),
        label: `${boundedText(labels.page, 24) || "云端页码"} ${normalized.page}`,
    };
    return snapshot;
}

// ---------- T-6419 近期预约（attributes.custom-reservation） ----------
function normalizeTodayReservationsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const days = Math.trunc(Number(source.days));
    const overdueDays = Math.trunc(Number(source.overdueDays));
    return {
        days: Number.isFinite(days) ? Math.min(14, Math.max(0, days)) : 3,
        overdueDays: Number.isFinite(overdueDays) ? Math.min(14, Math.max(0, overdueDays)) : 0,
        limit: clampLimit(source.limit, 8),
        notebook: boundedText(source.notebook, 64),
        query: boundedText(source.query, 64),
        sortBy: source.sortBy === "最近更新" ? "最近更新" : "预约时间",
        showDate: source.showDate !== "否" && source.showDate !== false,
        showStatus: source.showStatus !== "否" && source.showStatus !== false,
        showPath: source.showPath !== "否" && source.showPath !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildTodayReservationsSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeTodayReservationsConfig(config);
    const today = localDateKey(now);
    const entries = [];
    const seen = new Set();
    for (const [order, row] of rows.entries()) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id, 64);
        const date = boundedText(row.date, 8);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || !/^\d{8}$/.test(date) || seen.has(id)) continue;
        const content = boundedText(row.content, 128) || id;
        const path = boundedText(row.hpath || row.hPath, 128);
        if (normalized.query && !`${content}\n${path}`.toLocaleLowerCase().includes(normalized.query.toLocaleLowerCase())) continue;
        seen.add(id);
        entries.push({id, date, content, path, updated: boundedText(row.updated, 32), order});
    }
    entries.sort((left, right) => normalized.sortBy === "最近更新"
        ? right.updated.localeCompare(left.updated) || left.date.localeCompare(right.date) || left.order - right.order
        : left.date.localeCompare(right.date) || right.updated.localeCompare(left.updated) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showDate) details.push(formatDateKey(entry.date));
        if (normalized.showStatus && entry.date === today) details.push(boundedText(labels.today, 24) || "今天");
        else if (normalized.showStatus && entry.date < today) details.push(boundedText(labels.overdue, 24) || "已过期");
        if (normalized.showPath && entry.path) details.push(entry.path);
        return {
            label: entry.content,
            value: entry.id,
            ...(details.length ? {secondary: details.join(" · ")} : {}),
            ...(normalized.showRank ? {rank: index + 1} : {}),
        };
    });
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "近期预约", items, labels, now, status,
        normalized.query ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的预约") : boundedText(labels.empty, 96) || "近期没有预约");
    snapshot.stat = {value: entries.length > items.length ? `${items.length}/${entries.length}` : String(entries.length), label: boundedText(labels.stat, 32) || "已预约"};
    return snapshot;
}

// ---------- T-6323 最近更新（/api/block/getRecentUpdatedBlocks） ----------
function normalizeRecentUpdatesConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 8),
        groupByDocument: source.groupByDocument !== "否" && source.groupByDocument !== false,
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUpdated: source.showUpdated !== "否" && source.showUpdated !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildRecentUpdatesSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const blocks = responseItems(payload);
    if (!blocks) return null;
    const normalized = normalizeRecentUpdatesConfig(config);
    const entries = [];
    const seen = new Set();
    const byDocument = new Map();
    for (const [order, block] of blocks.entries()) {
        if (!block || typeof block !== "object") continue;
        const rootId = boundedText(block.rootID, 64) || boundedText(block.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(rootId)) continue;
        const content = boundedText(block.fcontent, 120) || boundedText(block.content, 120);
        const hPath = boundedText(block.hPath || block.hpath, 128);
        const updated = boundedText(block.updated || block.updatedAt, 32);
        const key = `${rootId}:${content}`;
        if (!content || seen.has(key)) continue;
        seen.add(key);
        if (normalized.groupByDocument) {
            const previous = byDocument.get(rootId);
            if (previous) {
                previous.count += 1;
                if (!previous.path && hPath) previous.path = hPath;
                if (!previous.updated && updated) previous.updated = updated;
            } else {
                const entry = {rootId, content, path: hPath, updated, count: 1, order};
                byDocument.set(rootId, entry);
                entries.push(entry);
            }
        } else {
            entries.push({rootId, content, path: hPath, updated, count: 1, order});
        }
    }
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showPath && entry.path) details.push(entry.path);
        const time = normalized.showUpdated ? formatKernelTime(entry.updated) : "";
        if (time) details.push(time);
        if (normalized.groupByDocument && entry.count > 1) details.push(`${entry.count} ${boundedText(labels.blocks, 24) || "个更新块"}`);
        return {
            label: entry.content,
            value: entry.rootId,
            ...(details.length ? {secondary: details.join(" · ")} : {}),
            ...(normalized.showRank ? {rank: index + 1} : {}),
        };
    });
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "最近更新", items, labels, now, status, "暂无最近更新的内容块");
    snapshot.stat = {
        value: String(entries.length),
        label: normalized.groupByDocument
            ? boundedText(labels.statDocuments || labels.stat, 32) || "篇更新文档"
            : boundedText(labels.statBlocks || labels.blocks, 32) || "个更新块",
    };
    return snapshot;
}

// ---------- T-6324 数据健康（/api/asset/getMissingAssets） ----------
// T-6434：内核没有资产修复端点，组件不伪造“一键修复”入口；深度化收敛为
// 检索/排序/投影开关 + 有界全量扫描后的“已显示/总数”与严重度标签。
const DATA_HEALTH_SCAN_BOUND = 512;

function normalizeDataHealthConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 8),
        query: boundedText(source.query, 64).toLowerCase(),
        sortBy: source.sortBy === "名称" ? "name" : "order",
        showPath: source.showPath !== "否" && source.showPath !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildDataHealthSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const assets = responseItems(payload);
    if (!assets) return null;
    const normalized = normalizeDataHealthConfig(config);
    const distinct = new Map();
    const scanned = assets.slice(0, DATA_HEALTH_SCAN_BOUND);
    for (const asset of scanned) {
        if (!asset || typeof asset !== "object") continue;
        const name = boundedText(asset.name, 128) || boundedText(asset.item, 128);
        if (!name || distinct.has(name)) continue;
        // T-6471：真实响应含 blockIDs（引用该资源的块）——取首个标准块 ID 作为
        // 点击打开目标；item 为路径形态引用（真实响应无 path 字段，作回退）。
        const blockIds = Array.isArray(asset.blockIDs) ? asset.blockIDs : [];
        const blockId = blockIds.map((id) => boundedText(id, 64)).find((id) => /^\d{14}-[0-9a-z]+$/i.test(id)) || "";
        distinct.set(name, {name, path: boundedText(asset.item, 160) || boundedText(asset.path, 160), blockId});
    }
    let entries = [...distinct.values()];
    if (normalized.query) {
        entries = entries.filter((entry) => entry.name.toLowerCase().includes(normalized.query)
            || entry.path.toLowerCase().includes(normalized.query));
    }
    if (normalized.sortBy === "name") {
        entries.sort((a, b) => compareText(a.name, b.name));
    }
    const items = entries.slice(0, normalized.limit).map((entry, index) => ({
        label: entry.name,
        value: entry.blockId,
        secondary: normalized.showPath ? entry.path : "",
        rank: normalized.showRank ? index + 1 : undefined,
    }));
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "数据健康", items, labels, now, status, "未发现缺失资源");
    const total = entries.length;
    const severe = total >= 10;
    const statLabel = severe
        ? boundedText(labels.statMany, 32) || boundedText(labels.stat, 32) || "缺失资源"
        : boundedText(labels.stat, 32) || "缺失资源";
    snapshot.stat = {value: items.length < total ? `${items.length}/${total}` : String(total), label: statLabel};
    return snapshot;
}

// ---------- T-6325 原生最近文档（/api/storage/getRecentDocs） ----------
function normalizeHostRecentDocsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 8),
        showPath: source.showPath !== "否",
        showRank: source.showRank === "是",
    };
}

function buildHostRecentDocsSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const docs = responseItems(payload);
    if (!docs) return null;
    const normalized = normalizeHostRecentDocsConfig(config);
    const byId = new Map();
    docs.forEach((doc, order) => {
        if (!doc || typeof doc !== "object") return;
        const id = boundedText(doc.rootID, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id)) return;
        const stamp = Math.max(Number(doc.viewedAt) || 0, Number(doc.closedAt) || 0, Number(doc.openAt) || 0);
        const title = boundedText(doc.title, 128);
        const path = boundedText(doc.hPath, 160) || boundedText(doc.hpath, 160);
        const previous = byId.get(id);
        if (!previous) {
            byId.set(id, {stamp, title, path, order});
            return;
        }
        const newer = stamp > previous.stamp;
        byId.set(id, {
            stamp: Math.max(stamp, previous.stamp),
            order: Math.min(order, previous.order),
            title: newer ? title || previous.title : previous.title || title,
            path: newer ? path || previous.path : previous.path || path,
        });
    });
    const entries = [...byId.entries()].sort((a, b) => b[1].stamp - a[1].stamp || a[1].order - b[1].order);
    const items = entries
        .slice(0, normalized.limit)
        .map(([id, entry], index) => ({
            label: entry.title || id,
            value: id,
            ...(normalized.showPath && entry.path ? {secondary: entry.path} : {}),
            ...(normalized.showRank ? {rank: index + 1} : {}),
        }));
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "最近文档", items, labels, now, status, "暂无最近打开的文档");
    snapshot.stat = {value: String(entries.length), label: boundedText(labels.stat, 32) || "篇文档"};
    return snapshot;
}

// ---------- T-6328 数据库导航（/api/query/sql，type='av'） ----------
function normalizeDatabaseListConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    // T-6850/P8：绑定 blockId 时组件切换为该库的表格形态投影（复用 database-table
    // 的 AV 两级取数管线）；未绑定保持全库清单形态
    const blockId = boundedText(source.blockId, 64);
    return {
        blockId: /^\d{14}-[0-9a-z]+$/i.test(blockId) ? blockId : "",
        limit: clampLimit(source.limit, 8),
        notebook: boundedText(source.notebook, 64),
        query: boundedText(source.query, 64).replace(/[%_']/g, ""),
        sortBy: ["最近更新", "名称", "路径"].includes(source.sortBy) ? source.sortBy : "最近更新",
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUpdated: source.showUpdated === "是" || source.showUpdated === true,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildDatabaseListSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    const list = Array.isArray(rows) ? rows : null;
    if (list === null) return null;
    const normalized = normalizeDatabaseListConfig(config);
    const entries = [];
    const seen = new Set();
    for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || seen.has(id)) continue;
        seen.add(id);
        const label = boundedText(row.content, 128) || boundedText(row.hpath, 128) || id;
        const path = boundedText(row.hpath || row.hPath, 128);
        if (normalized.query && !`${label}\n${path}`.toLocaleLowerCase().includes(normalized.query.toLocaleLowerCase())) continue;
        entries.push({id, label, path, updated: boundedText(row.updated, 32), order: entries.length});
    }
    entries.sort((left, right) => {
        if (normalized.sortBy === "名称") return compareText(left.label, right.label) || left.order - right.order;
        if (normalized.sortBy === "路径") return compareText(left.path, right.path) || compareText(left.label, right.label) || left.order - right.order;
        return right.updated.localeCompare(left.updated) || left.order - right.order;
    });
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showPath && entry.path) details.push(entry.path);
        const time = normalized.showUpdated ? formatKernelTime(entry.updated) : "";
        if (time) details.push(time);
        return {label: entry.label, value: entry.id, ...(details.length ? {secondary: details.join(" · ")} : {}), ...(normalized.showRank ? {rank: index + 1} : {})};
    });
    const reportedTotal = Math.trunc(Number(list[0]?.total_count ?? list[0]?.totalCount));
    const total = Number.isFinite(reportedTotal) && reportedTotal >= entries.length ? reportedTotal : entries.length;
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "数据库", items, labels, now, status, normalized.query ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的数据库") : "工作区里还没有思源数据库");
    snapshot.stat = {value: total > items.length ? `${items.length}/${total}` : String(total), label: boundedText(labels.stat, 32) || "个数据库"};
    return snapshot;
}

// ---------- T-6329 已存筛选（/api/storage/getCriteria，思源原生搜索的已存条件） ----------
function normalizeSavedSearchesConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const methodNames = ["文本", "查询语法", "SQL", "正则", "语义"];
    return {
        limit: clampLimit(source.limit, 8),
        query: boundedText(source.query, 64),
        method: methodNames.includes(source.method) ? methodNames.indexOf(source.method) : -1,
        sortBy: source.sortBy === "名称" ? "名称" : "原顺序",
        showKeyword: source.showKeyword !== "否" && source.showKeyword !== false,
        showMethod: source.showMethod !== "否" && source.showMethod !== false,
        showScope: source.showScope !== "否" && source.showScope !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

const CRITERIA_METHODS_COUNT = 5;

// ---------- T-6330 数据库当前视图投影（/api/av/renderAttributeView，ADR 0058） ----------
// 语义：视图筛选/排序/分页交还内核；本层只做"当前视图 → 列表项"的有界投影。
// av 契约（v3.8.4 kernel/api/av_contract_mapping.go）：
//   data.view = 视图实例（table 型含 columns/rows）；行 cells[i] 对齐 columns[i]；
//   cell.valueType ∈ block/text/number/select/mSelect/date/...；cell.value 为 av.Value。
function normalizeAvTableConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const blockId = boundedText(source.blockId, 64);
    const rawColumns = Array.isArray(source.columns)
        ? source.columns
        : typeof source.columns === "string" ? source.columns.split(",") : [];
    const columns = [...new Set(rawColumns.map((item) => boundedText(item, 64)).filter(Boolean))].slice(0, 3);
    return {
        blockId: /^\d{14}-[0-9a-z]+$/i.test(blockId) ? blockId : "",
        limit: clampLimit(source.limit, 8),
        columns,
        showColumnNames: source.showColumnNames !== "否" && source.showColumnNames !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

// 宽容抽取：av.Value 的形态随字段类型不同（text.content / number / mSelect / block），
// 逐族尝试取展示文本；全不命中返回空串（调用方跳过）。绝不透传原始 JSON。
function extractAvCellText(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 2) return "";
    if (typeof value.renderedContent === "string") return value.renderedContent;
    if (value.text && typeof value.text.content === "string") return value.text.content;
    if (value.block && typeof value.block.content === "string") return value.block.content;
    if (value.number && typeof value.number.formattedContent === "string") return value.number.formattedContent;
    if (value.number && Number.isFinite(Number(value.number.content))) return String(value.number.content);
    if (Array.isArray(value.mSelect)) {
        return value.mSelect
            .map((option) => (option && typeof option.content === "string" ? option.content : ""))
            .filter(Boolean)
            .join("、");
    }
    if (value.date && typeof value.date.formattedContent === "string") return value.date.formattedContent;
    if (value.date && ["string", "number"].includes(typeof value.date.content)) return String(value.date.content);
    for (const key of ["url", "email", "phone"]) {
        if (value[key] && typeof value[key].content === "string") return value[key].content;
    }
    if (value.checkbox && typeof value.checkbox.checked === "boolean") return value.checkbox.checked ? "☑" : "☐";
    if (Array.isArray(value.mAsset)) {
        return value.mAsset.slice(0, 3)
            .map((asset) => asset && (boundedText(asset.name, 48) || boundedText(asset.content, 72)))
            .filter(Boolean)
            .join("、");
    }
    if (typeof value.template === "string") return value.template;
    if (value.template && typeof value.template.content === "string") return value.template.content;
    for (const key of ["created", "updated"]) {
        if (value[key] && typeof value[key].formattedContent === "string") return value[key].formattedContent;
    }
    for (const key of ["relation", "rollup"]) {
        if (!value[key] || !Array.isArray(value[key].contents)) continue;
        return value[key].contents.slice(0, 3)
            .map((entry) => extractAvCellText(entry, depth + 1))
            .filter(Boolean)
            .join("、");
    }
    return "";
}

// v3.8.x 返回 view.table；较新的公开 API 把 columns/rows/rowCount 直接挂在 view 上。
// 分组视图把行放在 groups[] 的子视图中。这里统一成行源，避免版本差异导致整卡空白。
function collectAvTableSources(view) {
    const tableOf = (candidate) => {
        if (!candidate || typeof candidate !== "object") return null;
        const nested = candidate.table && typeof candidate.table === "object" ? candidate.table : candidate;
        return Array.isArray(nested.columns) && Array.isArray(nested.rows) ? nested : null;
    };
    const root = tableOf(view);
    const groups = Array.isArray(view?.groups)
        ? view.groups.slice(0, 128).map(tableOf).filter(Boolean)
        : [];
    const sources = groups.length > 0 ? groups : (root ? [root] : []);
    const columns = (root && root.columns.length > 0 ? root.columns : sources[0]?.columns) || [];
    return {columns, sources};
}

function buildAvTableSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
        ? payload.data
        : null;
    if (!data) return null;
    const view = data.view && typeof data.view === "object" ? data.view : null;
    const tableData = collectAvTableSources(view);
    if (!tableData.sources.length || !tableData.columns.length) return null;
    const normalized = normalizeAvTableConfig(config);
    if (!normalized.blockId) return null;

    const availableColumns = tableData.columns.filter((column) => column && typeof column === "object" && column.hidden !== true);
    const selected = normalized.columns;
    const selectedColumns = selected.length > 0
        ? selected.map((key) => availableColumns.find((column) => [column.id, column.name, column.key, column.label].some((value) => String(value || "") === key))).filter(Boolean)
        : availableColumns;
    const columns = selected.length > 0 && selectedColumns.length === 0 ? availableColumns : selectedColumns;
    const primaryColumn = columns[0] || null;
    const secondaryColumns = columns.slice(1, 3);
    const cellOf = (row, column) => {
        if (!column) return "";
        return (Array.isArray(row.cells) ? row.cells : []).find((cell) => cell && (
            cell.id === column.id || cell.keyID === column.id || cell.value?.keyID === column.id
        ));
    };
    const textOf = (row, column) => extractAvCellText(cellOf(row, column)?.value);

    const items = [];
    const seenRows = new Set();
    for (const source of tableData.sources) {
        for (const row of source.rows) {
            if (!row || typeof row !== "object" || !Array.isArray(row.cells)) continue;
            const rowId = boundedText(row.id, 64);
            if (rowId && seenRows.has(rowId)) continue;
            if (rowId) seenRows.add(rowId);
            if (items.length >= normalized.limit) break;
            const label = boundedText(textOf(row, primaryColumn), 120);
            if (!label) continue;
            const valueParts = secondaryColumns.map((column) => {
                const value = boundedText(textOf(row, column), 60);
                if (!value) return "";
                const name = boundedText(column.name || column.label, 32);
                return normalized.showColumnNames && name ? `${name}：${value}` : value;
            }).filter(Boolean);
            const primaryCell = cellOf(row, primaryColumn);
            const boundBlockId = boundedText(primaryCell?.value?.block?.id, 64);
            const openId = /^\d{14}-[0-9a-z]+$/i.test(boundBlockId) ? boundBlockId : rowId;
            items.push({
                label,
                value: /^\d{14}-[0-9a-z]+$/i.test(openId) ? openId : "",
                secondary: valueParts.join(" · "),
                ...(normalized.showRank ? {rank: items.length + 1} : {}),
            });
        }
        if (items.length >= normalized.limit) break;
    }
    const totalRows = tableData.sources.reduce((total, source) => {
        const count = Math.trunc(Number(source.rowCount));
        return total + (Number.isFinite(count) && count >= 0 ? count : source.rows.length);
    }, 0);
    const viewName = boundedText(view.name, 48) || boundedText(data.name, 48);
    const title = [boundedText(labels.title, 32) || "数据库", viewName].filter(Boolean).join(" · ");
    const snapshot = snapshotOf(title, items, labels, now, status, boundedText(labels.empty, 96) || "数据库当前视图暂无数据行");
    snapshot.stat = {
        value: totalRows > items.length ? `${items.length}/${totalRows}` : String(items.length),
        label: boundedText(labels.stat, 32) || "显示/总行",
    };
    return snapshot;
}

// ---------- T-6373 随机回顾：有界配置与候选统计 ----------
function normalizeRandomReviewConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawDays = Math.trunc(Number(source.days));
    const rawLimit = Math.trunc(Number(source.limit));
    const parentDocument = boundedText(source.parentDocument, 64);
    return {
        days: Number.isFinite(rawDays) ? Math.min(3650, Math.max(7, rawDays)) : 90,
        limit: Number.isFinite(rawLimit) ? Math.min(6, Math.max(1, rawLimit)) : 3,
        notebook: boundedText(source.notebook, 64),
        parentDocument: /^\d{14}-[0-9a-z]+$/i.test(parentDocument) ? parentDocument : "",
        showPath: source.showPath !== "否" && source.showPath !== false,
    };
}

function buildRandomReviewSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const rows = responseItems(payload);
    if (!rows) return null;
    const normalized = normalizeRandomReviewConfig(config);
    const seen = new Set();
    const items = [];
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || seen.has(id)) continue;
        seen.add(id);
        const label = boundedText(row.content, 120) || id;
        const path = normalized.showPath ? boundedText(row.hpath || row.hPath, 96) : "";
        items.push({label, value: id, ...(path ? {secondary: path} : {})});
        if (items.length >= normalized.limit) break;
    }
    const reportedTotal = Math.trunc(Number(rows[0]?.total_count ?? rows[0]?.totalCount));
    const total = Number.isFinite(reportedTotal) && reportedTotal >= items.length ? reportedTotal : items.length;
    const emptyHint = normalized.parentDocument
        ? boundedText(labels.emptyScoped, 96) || "该父文档下暂无符合条件的子文档"
        : boundedText(labels.empty, 96) || "可回顾文档不足";
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "随机回顾", items, labels, now, status, emptyHint);
    snapshot.stat = {value: String(total), label: boundedText(labels.stat, 32) || "候选文档"};
    return snapshot;
}

// ---------- T-6390 近期编辑：有界时间窗、标题/路径筛选与准确总量 ----------
function normalizeRecentEditsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const days = Math.trunc(Number(source.days));
    return {
        limit: clampLimit(source.limit, 8),
        notebook: boundedText(source.notebook, 64),
        days: Number.isFinite(days) ? Math.min(3650, Math.max(1, days)) : 30,
        query: boundedText(source.query, 64).replace(/[%_']/g, ""),
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUpdated: source.showUpdated !== "否" && source.showUpdated !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildRecentEditsSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeRecentEditsConfig(config);
    const seen = new Set();
    const entries = [];
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id || row.root_id, 64);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || seen.has(id)) continue;
        seen.add(id);
        const label = boundedText(row.content, 128) || id;
        const path = boundedText(row.hpath || row.hPath, 128);
        if (normalized.query && !`${label}\n${path}`.toLocaleLowerCase().includes(normalized.query.toLocaleLowerCase())) continue;
        entries.push({id, label, path, updated: boundedText(row.updated, 32)});
    }
    entries.sort((left, right) => right.updated.localeCompare(left.updated));
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showPath && entry.path) details.push(entry.path);
        const time = normalized.showUpdated ? formatKernelTime(entry.updated) : "";
        if (time) details.push(time);
        return {label: entry.label, value: entry.id, ...(details.length ? {secondary: details.join(" · ")} : {}), ...(normalized.showRank ? {rank: index + 1} : {})};
    });
    const reportedTotal = Math.trunc(Number(rows[0]?.total_count ?? rows[0]?.totalCount));
    const total = Number.isFinite(reportedTotal) && reportedTotal >= entries.length ? reportedTotal : entries.length;
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "近期编辑", items, labels, now, status,
        normalized.query ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的近期编辑") : (boundedText(labels.empty, 96) || "当前范围暂无近期编辑文档"));
    snapshot.stat = {value: total > items.length ? `${items.length}/${total}` : String(total), label: boundedText(labels.stat, 32) || "篇文档"};
    return snapshot;
}

// ---------- T-6392~T-6399 文档导航：大纲、关系、标签与书签 ----------
function normalizeOutlineWidgetConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const maxDepth = Math.trunc(Number(source.maxDepth));
    return {
        limit: clampLimit(source.limit, 8),
        query: boundedText(source.query, 64),
        maxDepth: Number.isFinite(maxDepth) ? Math.min(8, Math.max(1, maxDepth)) : 8,
        showLevel: source.showLevel !== "否" && source.showLevel !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildOutlineWidgetSnapshot(headings, config, labels = {}, now = Date.now(), status = "fresh", documentTitle = "") {
    if (!Array.isArray(headings)) return null;
    const normalized = normalizeOutlineWidgetConfig(config);
    const query = normalized.query.toLocaleLowerCase();
    const seen = new Set();
    const entries = [];
    for (const heading of headings) {
        if (!heading || typeof heading !== "object") continue;
        const id = boundedText(heading.id, 64);
        const title = boundedText(heading.title || heading.name, 160);
        const depth = Math.min(7, Math.max(0, Math.trunc(Number(heading.depth)) || 0));
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || !title || seen.has(id) || depth >= normalized.maxDepth) continue;
        if (query && !title.toLocaleLowerCase().includes(query)) continue;
        seen.add(id);
        entries.push({id, title, depth});
    }
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const levelTemplate = boundedText(labels.level, 32) || "H{level}";
        return {
            label: entry.title,
            value: entry.id,
            ...(normalized.showLevel ? {secondary: levelTemplate.replace("{level}", String(entry.depth + 1))} : {}),
            ...(normalized.showRank ? {rank: index + 1} : {}),
        };
    });
    const baseTitle = boundedText(labels.title, 64) || "当前文档大纲";
    const doc = boundedText(documentTitle, 48);
    const snapshot = snapshotOf(doc ? `${baseTitle} · ${doc}` : baseTitle, items, labels, now, status,
        normalized.query ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的标题") : (boundedText(labels.empty, 96) || "当前文档没有标题"));
    snapshot.stat = {
        value: entries.length > items.length ? `${items.length}/${entries.length}` : String(entries.length),
        label: boundedText(labels.stat, 32) || "标题",
    };
    return snapshot;
}

function normalizeDocumentRelationsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 6),
        relation: ["子块", "引用"].includes(source.relation) ? source.relation : "全部",
        query: boundedText(source.query, 64),
        showType: source.showType !== "否" && source.showType !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildDocumentRelationsSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh", documentTitle = "") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeDocumentRelationsConfig(config);
    const wanted = normalized.relation === "子块" ? "child" : normalized.relation === "引用" ? "reference" : "";
    const query = normalized.query.toLocaleLowerCase();
    const entries = [];
    const byKey = new Map();
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const relation = row.relation === "reference" ? "reference" : row.relation === "child" ? "child" : "";
        const id = boundedText(row.target_id || row.targetId || row.id, 64);
        const label = boundedText(row.content, 160) || (relation === "reference" ? (boundedText(labels.reference, 32) || "引用") : (boundedText(labels.child, 32) || "子块"));
        if (!relation || (wanted && relation !== wanted) || !/^\d{14}-[0-9a-z]+$/i.test(id)) continue;
        if (query && !label.toLocaleLowerCase().includes(query)) continue;
        const key = `${relation}:${id}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.count += 1;
            continue;
        }
        const entry = {relation, id, label, count: 1};
        byKey.set(key, entry);
        entries.push(entry);
    }
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showType) details.push(entry.relation === "reference" ? (boundedText(labels.reference, 32) || "引用") : (boundedText(labels.child, 32) || "子块"));
        if (entry.relation === "reference" && entry.count > 1) {
            details.push((boundedText(labels.referenceCount, 40) || "{count} 处引用").replace("{count}", String(entry.count)));
        }
        return {
            label: entry.label,
            value: entry.id,
            ...(details.length ? {secondary: details.join(" · ")} : {}),
            ...(normalized.showRank ? {rank: index + 1} : {}),
        };
    });
    const baseTitle = boundedText(labels.title, 64) || "文档关系摘要";
    const doc = boundedText(documentTitle, 48);
    const snapshot = snapshotOf(doc ? `${baseTitle} · ${doc}` : baseTitle, items, labels, now, status,
        normalized.query || wanted ? (boundedText(labels.emptyFiltered, 96) || "当前筛选下没有文档关系") : (boundedText(labels.empty, 96) || "当前文档没有可显示的关系"));
    snapshot.stat = {
        value: entries.length > items.length ? `${items.length}/${entries.length}` : String(entries.length),
        label: boundedText(labels.stat, 32) || "关系",
    };
    return snapshot;
}

function normalizeTagListConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 8),
        query: boundedText(source.query, 64),
        sortBy: source.sortBy === "名称" ? "名称" : "数量",
        showCount: source.showCount !== "否" && source.showCount !== false,
        showHierarchy: source.showHierarchy !== "否" && source.showHierarchy !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function flattenTagEntries(nodes, parent = "", depth = 0, out = [], visited = new Set()) {
    if (!Array.isArray(nodes) || depth > 8 || out.length >= 128) return out;
    for (const node of nodes) {
        if (!node || typeof node !== "object" || visited.has(node) || out.length >= 128) continue;
        visited.add(node);
        const name = boundedText(node.name || node.label, 96);
        if (!name) continue;
        const path = parent ? `${parent}/${name}` : name;
        const rawCount = Math.trunc(Number(node.count ?? node.blockCount));
        out.push({name, path: boundedText(path, 160), count: Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0, order: out.length});
        flattenTagEntries(Array.isArray(node.children) ? node.children : node.tags, path, depth + 1, out, visited);
    }
    return out;
}

function buildTagListSnapshot(tags, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(tags)) return null;
    const normalized = normalizeTagListConfig(config);
    const query = normalized.query.toLocaleLowerCase();
    const seen = new Set();
    const entries = flattenTagEntries(tags).filter((entry) => {
        const key = entry.path.toLocaleLowerCase();
        if (seen.has(key) || (query && !key.includes(query))) return false;
        seen.add(key);
        return true;
    });
    entries.sort((left, right) => normalized.sortBy === "名称"
        ? compareText(left.path, right.path) || left.order - right.order
        : right.count - left.count || compareText(left.path, right.path) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => ({
        label: normalized.showHierarchy ? entry.path : entry.name,
        value: `tag:${entry.path}`,
        ...(normalized.showCount ? {secondary: `${entry.count} ${boundedText(labels.blocks, 24) || "个块"}`} : {}),
        ...(normalized.showRank ? {rank: index + 1} : {}),
    }));
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "标签", items, labels, now, status,
        normalized.query ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的标签") : (boundedText(labels.empty, 96) || "还没有标签"));
    snapshot.stat = {value: entries.length > items.length ? `${items.length}/${entries.length}` : String(entries.length), label: boundedText(labels.stat, 32) || "个标签"};
    return snapshot;
}

function normalizeBookmarkListConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        limit: clampLimit(source.limit, 8),
        query: boundedText(source.query, 64),
        sortBy: source.sortBy === "名称" ? "名称" : "数量",
        showCount: source.showCount !== "否" && source.showCount !== false,
        showEmpty: source.showEmpty !== "否" && source.showEmpty !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildBookmarkListSnapshot(bookmarks, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(bookmarks)) return null;
    const normalized = normalizeBookmarkListConfig(config);
    const query = normalized.query.toLocaleLowerCase();
    const byName = new Map();
    for (const [order, bookmark] of bookmarks.entries()) {
        if (!bookmark || typeof bookmark !== "object") continue;
        const name = boundedText(bookmark.name || bookmark.bookmark, 96);
        if (!name || (query && !name.toLocaleLowerCase().includes(query))) continue;
        const rawCount = Math.trunc(Number(bookmark.count));
        const count = Number.isFinite(rawCount) ? Math.max(0, rawCount) : Array.isArray(bookmark.blocks) ? bookmark.blocks.length : 0;
        if (!normalized.showEmpty && count === 0) continue;
        const key = name.toLocaleLowerCase();
        const existing = byName.get(key);
        if (!existing || count > existing.count) byName.set(key, {name, count, order: existing ? existing.order : order});
    }
    const entries = [...byName.values()];
    entries.sort((left, right) => normalized.sortBy === "名称"
        ? compareText(left.name, right.name) || left.order - right.order
        : right.count - left.count || compareText(left.name, right.name) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => ({
        label: entry.name,
        value: `bookmark:${entry.name}`,
        ...(normalized.showCount ? {secondary: entry.count > 0 ? `${entry.count} ${boundedText(labels.blocks, 24) || "个块"}` : (boundedText(labels.emptyEntry, 32) || "空书签")} : {}),
        ...(normalized.showRank ? {rank: index + 1} : {}),
    }));
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "书签", items, labels, now, status,
        normalized.query || !normalized.showEmpty ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的书签") : (boundedText(labels.empty, 96) || "还没有书签"));
    snapshot.stat = {value: entries.length > items.length ? `${items.length}/${entries.length}` : String(entries.length), label: boundedText(labels.stat, 32) || "个书签"};
    return snapshot;
}

// ---------- T-6401~T-6408 日期与剪藏入口 ----------
function normalizeClippedUnreadConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        tag: boundedText(source.tag, 32),
        limit: clampLimit(source.limit, 8),
        notebook: boundedText(source.notebook, 64),
        sortBy: source.sortBy === "名称" ? "名称" : "最近剪藏",
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUpdated: source.showUpdated !== "否" && source.showUpdated !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildClippedUnreadSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeClippedUnreadConfig(config);
    const seen = new Set();
    const entries = [];
    for (const [order, row] of rows.entries()) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.root_id || row.rootId || row.id, 64);
        const title = boundedText(row.title || row.content, 128) || id;
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || seen.has(id)) continue;
        seen.add(id);
        entries.push({id, title, path: boundedText(row.hpath || row.hPath, 128), updated: boundedText(row.latest || row.updated, 32), order});
    }
    entries.sort((left, right) => normalized.sortBy === "名称"
        ? compareText(left.title, right.title) || left.order - right.order
        : right.updated.localeCompare(left.updated) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showPath && entry.path) details.push(entry.path);
        if (normalized.showUpdated && /^\d{14}$/.test(entry.updated)) details.push(formatKernelTime(entry.updated));
        return {label: entry.title, value: entry.id, ...(details.length ? {secondary: details.join(" · ")} : {}), ...(normalized.showRank ? {rank: index + 1} : {})};
    });
    const reportedTotal = Math.trunc(Number(rows[0]?.total_count ?? rows[0]?.totalCount));
    const total = Number.isFinite(reportedTotal) && reportedTotal >= entries.length ? reportedTotal : entries.length;
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "剪藏待读", items, labels, now, status,
        boundedText(labels.empty, 96) || "还没有符合条件的剪藏");
    snapshot.stat = {value: total > items.length ? `${items.length}/${total}` : String(total), label: boundedText(labels.stat, 32) || "篇待读"};
    return snapshot;
}

function normalizeOnThisDayConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const years = Math.trunc(Number(source.yearRange));
    return {
        limit: Math.min(20, Math.max(1, Math.trunc(Number(source.limit) || 8))),
        notebook: boundedText(source.notebook, 64),
        yearRange: Number.isFinite(years) ? Math.min(100, Math.max(1, years)) : 20,
        sortBy: source.sortBy === "最早年份" ? "最早年份" : "最近年份",
        showYear: source.showYear !== "否" && source.showYear !== false,
        showPath: source.showPath !== "否" && source.showPath !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildOnThisDaySnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeOnThisDayConfig(config);
    const current = new Date(now);
    const currentYear = current.getFullYear();
    const earliest = currentYear - normalized.yearRange;
    const seen = new Set();
    const entries = [];
    for (const [order, row] of rows.entries()) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id || row.root_id, 64);
        const title = boundedText(row.content || row.title, 128);
        const match = /^(\d{4})-(\d{2})-(\d{2})(?:\b|$)/.exec(title);
        const year = match ? Number(match[1]) : 0;
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || !title || !match || year >= currentYear || year < earliest || seen.has(id)) continue;
        seen.add(id);
        entries.push({id, title, year, path: boundedText(row.hpath || row.hPath, 128), order});
    }
    entries.sort((left, right) => normalized.sortBy === "最早年份"
        ? left.year - right.year || compareText(left.title, right.title) || left.order - right.order
        : right.year - left.year || compareText(left.title, right.title) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showYear) details.push(`${entry.year}`);
        if (normalized.showPath && entry.path) details.push(entry.path);
        return {label: entry.title, value: entry.id, ...(details.length ? {secondary: details.join(" · ")} : {}), ...(normalized.showRank ? {rank: index + 1} : {})};
    });
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "往年今日", items, labels, now, status,
        boundedText(labels.empty, 96) || "这一天还没有往年记录");
    snapshot.stat = {value: String(entries.length), label: boundedText(labels.stat, 32) || "篇记录"};
    return snapshot;
}

function normalizeRecentDailyNotesConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const days = Math.trunc(Number(source.days));
    return {
        days: Number.isFinite(days) ? Math.min(60, Math.max(7, days)) : 14,
        limit: Math.min(20, Math.max(1, Math.trunc(Number(source.limit) || 10))),
        notebook: boundedText(source.notebook, 64),
        sortBy: source.sortBy === "最近更新" ? "最近更新" : "日期",
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUpdated: source.showUpdated !== "否" && source.showUpdated !== false,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildRecentDailyNotesSnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeRecentDailyNotesConfig(config);
    const current = new Date(now);
    const end = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const start = new Date(end.getTime() - (normalized.days - 1) * 86400000);
    const toKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const fromKey = toKey(start);
    const toDateKey = toKey(end);
    const seen = new Set();
    const entries = [];
    for (const [order, row] of rows.entries()) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.root_id || row.rootId || row.id, 64);
        const title = boundedText(row.content || row.title, 128);
        const date = /^(20\d{2}-\d{2}-\d{2})(?:\b|$)/.exec(title)?.[1] || "";
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || !date || date < fromKey || date > toDateKey || seen.has(id)) continue;
        seen.add(id);
        entries.push({id, title, date, path: boundedText(row.hpath || row.hPath, 128), updated: boundedText(row.updated, 32), order});
    }
    entries.sort((left, right) => normalized.sortBy === "最近更新"
        ? right.updated.localeCompare(left.updated) || right.date.localeCompare(left.date) || left.order - right.order
        : right.date.localeCompare(left.date) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showPath && entry.path) details.push(entry.path);
        if (normalized.showUpdated && /^\d{14}$/.test(entry.updated)) details.push(formatKernelTime(entry.updated));
        return {label: entry.title, value: entry.id, ...(details.length ? {secondary: details.join(" · ")} : {}), ...(normalized.showRank ? {rank: index + 1} : {})};
    });
    const reportedTotal = Math.trunc(Number(rows[0]?.total_count ?? rows[0]?.totalCount));
    const total = Number.isFinite(reportedTotal) && reportedTotal >= entries.length ? reportedTotal : entries.length;
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "近期日记", items, labels, now, status,
        boundedText(labels.empty, 96) || "时间范围内没有已有日记");
    snapshot.stat = {value: total > items.length ? `${items.length}/${total}` : String(total), label: boundedText(labels.stat, 32) || "篇日记"};
    return snapshot;
}

// ---------- T-6409~T-6416 月度日记、今日待办、闪卡与日历配置 ----------
function normalizeJournalMonthlyConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const offset = Math.trunc(Number(source.monthOffset));
    return {
        limit: Math.min(20, Math.max(1, Math.trunc(Number(source.limit) || 12))),
        notebook: boundedText(source.notebook, 64),
        monthOffset: Number.isFinite(offset) ? Math.min(24, Math.max(-24, offset)) : 0,
        sortBy: source.sortBy === "最近更新" ? "最近更新" : "日期",
        showPath: source.showPath !== "否" && source.showPath !== false,
        showUpdated: source.showUpdated === "是" || source.showUpdated === true,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function resolveReferenceDate(now) {
    const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    return Number.isFinite(date.getTime()) ? date : new Date();
}

function buildJournalMonthlySnapshot(rows, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!Array.isArray(rows)) return null;
    const normalized = normalizeJournalMonthlyConfig(config);
    const reference = resolveReferenceDate(now);
    const target = new Date(reference.getFullYear(), reference.getMonth() + normalized.monthOffset, 1);
    const prefix = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    const attrPrefix = `custom-dailynote-${prefix.replace("-", "")}`;
    const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const titleDate = new RegExp(`^${prefix}-(\\d{2})(?:\\D|$)`);
    const attrDate = new RegExp(`^${attrPrefix}(\\d{2})$`);
    const seen = new Set();
    const entries = [];
    for (const [order, row] of rows.entries()) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.root_id || row.rootId || row.id, 64);
        const title = boundedText(row.content || row.title, 128);
        const attr = boundedText(row.daily_attr || row.dailyAttr, 64);
        const titleDay = titleDate.exec(title)?.[1];
        const attrDay = attrDate.exec(attr)?.[1];
        const day = Number(attrDay || titleDay || 0);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || day < 1 || day > maxDay || seen.has(id)) continue;
        seen.add(id);
        entries.push({
            id,
            title: title || `${prefix}-${String(day).padStart(2, "0")}`,
            date: `${prefix}-${String(day).padStart(2, "0")}`,
            path: boundedText(row.hpath || row.hPath, 128),
            updated: boundedText(row.updated, 32),
            order,
        });
    }
    entries.sort((left, right) => normalized.sortBy === "最近更新"
        ? right.updated.localeCompare(left.updated) || right.date.localeCompare(left.date) || left.order - right.order
        : right.date.localeCompare(left.date) || left.order - right.order);
    const journalItems = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showPath && entry.path) details.push(entry.path);
        if (normalized.showUpdated && /^\d{14}$/.test(entry.updated)) details.push(formatKernelTime(entry.updated));
        return {label: entry.title, value: entry.id, ...(details.length ? {secondary: details.join(" · ")} : {}), ...(normalized.showRank ? {rank: index + 1} : {})};
    });
    const action = normalized.monthOffset === 0 && boundedText(labels.todayAction, 96)
        ? [{label: boundedText(labels.todayAction, 96), value: normalized.notebook ? `action:journal:${normalized.notebook}` : "action:journal"}]
        : [];
    const snapshot = snapshotOf(
        (boundedText(labels.monthTitle, 64) || "{year}-{month}").replace("{year}", String(target.getFullYear())).replace("{month}", String(target.getMonth() + 1)),
        [...action, ...journalItems], labels, now, status,
        boundedText(labels.empty, 96) || "这个月还没有日记",
    );
    const reportedTotal = Math.trunc(Number(rows[0]?.total_count ?? rows[0]?.totalCount));
    const total = Number.isFinite(reportedTotal) && reportedTotal >= entries.length ? reportedTotal : entries.length;
    snapshot.stat = {value: total > journalItems.length ? `${journalItems.length}/${total}` : String(total), label: boundedText(labels.stat, 32) || "篇日记"};
    return snapshot;
}

function normalizeTodayTasksConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const days = Math.trunc(Number(source.days));
    return {
        limit: clampLimit(source.limit, 8),
        allDocuments: source.allDocuments === "是" || source.allDocuments === true,
        notebook: boundedText(source.notebook, 64),
        showCompleted: source.showCompleted === "是" || source.showCompleted === true,
        days: Number.isFinite(days) ? Math.min(365, Math.max(7, days)) : 30,
        query: boundedText(source.query, 64),
        sortBy: source.sortBy === "文档名称" ? "文档名称" : "最近更新",
        showDocument: source.showDocument !== "否" && source.showDocument !== false,
        showPath: source.showPath === "是" || source.showPath === true,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildTodayTasksSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const rows = Array.isArray(payload) ? payload : payload && Array.isArray(payload.data) ? payload.data : null;
    if (!rows) return null;
    const normalized = normalizeTodayTasksConfig(config);
    const query = normalized.query.toLocaleLowerCase();
    const seen = new Set();
    const entries = [];
    for (const [order, row] of rows.entries()) {
        if (!row || typeof row !== "object") continue;
        const id = boundedText(row.id, 64);
        const markdown = boundedText(row.markdown, 512);
        const label = boundedText(row.content, 160);
        const document = boundedText(row.document_title || row.documentTitle, 128);
        const path = boundedText(row.hpath || row.hPath, 128);
        const updated = boundedText(row.updated, 32);
        const done = /\[[xX]\](?:\s|$)/.test(markdown);
        if (!/^\d{14}-[0-9a-z]+$/i.test(id) || !label || !/\[[ xX]\](?:\s|$)/.test(markdown) || seen.has(id)) continue;
        if (!normalized.showCompleted && done) continue;
        if (query && !`${label}\n${document}\n${path}`.toLocaleLowerCase().includes(query)) continue;
        seen.add(id);
        entries.push({id, label, document, path, updated, done, order});
    }
    entries.sort((left, right) => normalized.sortBy === "文档名称"
        ? compareText(left.document, right.document) || left.order - right.order
        : right.updated.localeCompare(left.updated) || left.order - right.order);
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const details = [];
        if (normalized.showDocument && entry.document) details.push(entry.document);
        if (normalized.showPath && entry.path && entry.path !== entry.document) details.push(entry.path);
        return {
            label: entry.label,
            value: entry.id,
            done: entry.done,
            ...(details.length ? {secondary: details.join(" · ")} : {}),
            ...(normalized.showRank ? {rank: index + 1} : {}),
        };
    });
    const reported = Math.trunc(Number(!Array.isArray(payload) ? payload.total : NaN));
    const total = query ? entries.length : Number.isFinite(reported) && reported >= entries.length ? reported : entries.length;
    const emptyHint = query ? boundedText(labels.emptyFiltered, 96) : boundedText(labels.empty, 96);
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "今日待办", items, labels, now, status, emptyHint || "今天还没有可显示的待办");
    snapshot.stat = {value: total > items.length ? `${items.length}/${total}` : String(total), label: boundedText(labels.stat, 32) || "条待办"};
    return snapshot;
}

function normalizeFlashcardDueConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        notebook: boundedText(source.notebook, 64),
        limit: clampLimit(source.limit, 8),
        sortBy: source.sortBy === "笔记本顺序" ? "笔记本顺序" : "待复习数量",
        showNotebook: source.showNotebook !== "否" && source.showNotebook !== false,
        showPath: source.showPath === "是" || source.showPath === true,
        showRank: source.showRank === "是" || source.showRank === true,
    };
}

function buildFlashcardDueSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) return null;
    const normalized = normalizeFlashcardDueConfig(config);
    const detailMode = payload.mode === "cards";
    const entries = [];
    const seen = new Set();
    for (const [order, row] of payload.data.entries()) {
        if (!row || typeof row !== "object") continue;
        if (detailMode) {
            const id = boundedText(row.id || row.block_id, 64);
            const rootId = boundedText(row.root_id || row.rootId || id, 64);
            const label = boundedText(row.content || row.label, 160);
            if (!/^\d{14}-[0-9a-z]+$/i.test(rootId) || !label || seen.has(id || rootId)) continue;
            seen.add(id || rootId);
            entries.push({id: rootId, label, notebook: boundedText(row.notebook_name || payload.notebookName, 96), path: boundedText(row.hpath || row.hPath, 128), order});
        } else {
            const id = boundedText(row.id, 64);
            const label = boundedText(row.label || row.name, 96);
            const count = Math.max(0, Math.trunc(Number(row.count)) || 0);
            if (!label || count === 0 || seen.has(id || label)) continue;
            seen.add(id || label);
            entries.push({id, label, count, order});
        }
    }
    if (!detailMode && normalized.sortBy === "待复习数量") {
        entries.sort((left, right) => right.count - left.count || compareText(left.label, right.label) || left.order - right.order);
    }
    const items = entries.slice(0, normalized.limit).map((entry, index) => detailMode ? {
        label: entry.label,
        value: entry.id,
        secondary: [normalized.showNotebook ? entry.notebook : "", normalized.showPath ? entry.path : ""].filter(Boolean).join(" · "),
        ...(normalized.showRank ? {rank: index + 1} : {}),
    } : {
        label: entry.label,
        value: "",
        count: entry.count,
        ...(normalized.showRank ? {rank: index + 1} : {}),
    });
    const due = Math.max(0, Math.trunc(Number(payload.total)) || entries.reduce((sum, entry) => sum + (entry.count || 0), 0));
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "闪卡待复习", items, labels, now, status,
        detailMode ? (boundedText(labels.emptyCards, 96) || "这个笔记本没有待复习闪卡") : (boundedText(labels.emptyNotebooks, 96) || "暂无待复习闪卡"));
    snapshot.stat = {value: String(due), label: boundedText(labels.stat, 32) || "张待复习"};
    return snapshot;
}

function normalizeJournalCalendarConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const offset = Math.trunc(Number(source.monthOffset));
    return {
        monthOffset: Number.isFinite(offset) ? Math.min(24, Math.max(-24, offset)) : 0,
        weekStart: source.weekStart === "周日" ? "周日" : "周一",
        showAdjacent: source.showAdjacent !== "否" && source.showAdjacent !== false,
        showLunar: source.showLunar === "是" || source.showLunar === true,
        showHolidays: source.showHolidays === "是" || source.showHolidays === true,
        notebook: boundedText(source.notebook, 64),
    };
}

// ---------- T-6425~T-6432 写作统计、目标、活跃度与连续打卡 ----------
function clampInteger(value, min, max, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function finiteCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function localDayKeys(days, now = Date.now()) {
    const end = new Date(Number.isFinite(now) ? now : Date.now());
    const midnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Array.from({length: days}, (_unused, index) => {
        const date = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - (days - index - 1));
        return localDateKey(date.getTime());
    });
}

function normalizeNoteStatsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        notebook: boundedText(source.notebook, 64),
        days: clampInteger(source.days, 7, 90, 7),
        primaryMetric: source.primaryMetric === "估算字数" ? "估算字数" : "文档数",
        showTrend: source.showTrend !== "否" && source.showTrend !== false,
        showStrength: source.showStrength === "是" || source.showStrength === true,
    };
}

function buildNoteStatsSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const normalized = normalizeNoteStatsConfig(config);
    const docs = finiteCount(payload.docs);
    const chars = finiteCount(payload.chars);
    const created = finiteCount(payload.created);
    const updated = finiteCount(payload.updated);
    const previousCreated = finiteCount(payload.previousCreated);
    const previousUpdated = finiteCount(payload.previousUpdated);
    const currentActivity = created + updated;
    const previousActivity = previousCreated + previousUpdated;
    const items = [{
        label: normalized.primaryMetric === "估算字数"
            ? `${boundedText(labels.documents, 32) || "文档数"} · ${docs.toLocaleString()}`
            : `${boundedText(labels.characters, 32) || "估算字数"} · ${chars.toLocaleString()}`,
        value: "",
    }, {
        label: `${boundedText(labels.created, 32) || "新建文档"} · ${created}`,
        value: "",
    }, {
        label: `${boundedText(labels.updated, 32) || "修订文档"} · ${updated}`,
        value: "",
    }];
    if (normalized.showTrend) {
        let trend = 0;
        let trendLabel = boundedText(labels.trendFlat, 48) || "与上一周期持平";
        if (previousActivity === 0 && currentActivity > 0) {
            trend = 100;
            trendLabel = boundedText(labels.trendNew, 48) || "本周期恢复活跃";
        } else if (previousActivity > 0) {
            trend = Math.round((currentActivity - previousActivity) / previousActivity * 100);
            const template = trend >= 0 ? (boundedText(labels.trendUp, 64) || "较上一周期 +{value}%") : (boundedText(labels.trendDown, 64) || "较上一周期 {value}%");
            trendLabel = template.replace("{value}", String(trend));
        }
        items.push({label: trendLabel, value: "", count: Math.abs(trend)});
    }
    // T-6682 写作强度（opt-in）：与 recent-writing-activity 同源的指数平滑——对
    // "当日有无文档活动"二值信号按半衰期 14 天递推（k = 0.5^(1/14)），得 [0,1]
    // 强度后取百分数。数据来自 adapter 追加的按日有界序列（payload.daily）。
    if (normalized.showStrength && Array.isArray(payload.daily) && payload.daily.length) {
        const k = Math.pow(0.5, 1 / 14);
        let strength = 0;
        for (const row of [...payload.daily].sort((left, right) => (left && left.day < right.day ? -1 : left && left.day > right.day ? 1 : 0))) {
            const active = finiteCount(row && (row.activity ?? row.created ?? row.updated)) > 0 ? 1 : 0;
            strength = strength * k + active * (1 - k);
        }
        items.push({
            label: boundedText(labels.strength, 24) || "写作强度",
            value: `${Math.round(strength * 100)}%`,
            secondary: `${boundedText(labels.strengthHalfLife, 24) || "半衰期"} 14 天`,
        });
    }
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "笔记统计", items, labels, now, status);
    snapshot.stat = normalized.primaryMetric === "估算字数"
        ? {value: chars.toLocaleString(), label: boundedText(labels.characters, 32) || "估算字数"}
        : {value: docs.toLocaleString(), label: boundedText(labels.documents, 32) || "文档数"};
    return snapshot;
}

function normalizeTodayWritingConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        notebook: boundedText(source.notebook, 64),
        goal: clampInteger(source.goal, 0, 50000, 1000),
        showBlocks: source.showBlocks !== "否" && source.showBlocks !== false,
        showNewDocs: source.showNewDocs !== "否" && source.showNewDocs !== false,
        showEditedDocs: source.showEditedDocs !== "否" && source.showEditedDocs !== false,
    };
}

function buildTodayWritingSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const normalized = normalizeTodayWritingConfig(config);
    const chars = finiteCount(payload.chars);
    const blocks = finiteCount(payload.blocks);
    const createdDocs = finiteCount(payload.createdDocs);
    const updatedDocs = finiteCount(payload.updatedDocs);
    const items = [];
    if (normalized.showBlocks) items.push({label: `${boundedText(labels.blocks, 32) || "新增内容块"} · ${blocks}`, value: ""});
    if (normalized.showNewDocs) items.push({label: `${boundedText(labels.createdDocs, 32) || "新建文档"} · ${createdDocs}`, value: ""});
    if (normalized.showEditedDocs) items.push({label: `${boundedText(labels.updatedDocs, 32) || "修订文档"} · ${updatedDocs}`, value: ""});
    if (items.length === 0) items.push({label: chars > 0 ? (boundedText(labels.active, 64) || "今天已经开始写作") : (boundedText(labels.zero, 64) || "今天还没有新增内容"), value: ""});
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "今日写作", items, labels, now, status);
    snapshot.stat = {
        value: chars.toLocaleString(),
        label: boundedText(labels.characters, 32) || "新增字符",
        ...(normalized.goal > 0 ? {
            progress: Math.min(100, Math.round(chars / normalized.goal * 100)),
            arc: {value: Math.min(chars, normalized.goal), max: normalized.goal},
        } : {}),
    };
    return snapshot;
}

function normalizeRecentWritingActivityConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        // T-6459：回看上限 90 → 366 天（12 个月）；SQL LIMIT 随天数缩放，
        // 模型扫描帽同步放到 400，保证长窗口下最近日期不被截断。
        days: clampInteger(source.days, 7, 366, 14),
        notebook: boundedText(source.notebook, 64),
        metric: source.metric === "新增字符" ? "新增字符" : "内容块",
        density: source.density === "紧凑" ? "紧凑" : "每日",
        showZero: source.showZero !== "否" && source.showZero !== false,
        showAverage: source.showAverage !== "否" && source.showAverage !== false,
        // T-6458：写作强度分（指数平滑半衰期口径，opt-in）
        showStrength: source.showStrength === "是" || source.showStrength === true,
        // T-6684 年历网格视图：53 周分页（按年），yearOffset 偏移年份（0=今年）
        view: source.view === "年历" ? "年历" : "列表",
        yearOffset: clampInteger(source.yearOffset, -3, 0, 0),
    };
}

function buildRecentWritingActivitySnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const rows = Array.isArray(payload) ? payload : payload && Array.isArray(payload.data) ? payload.data : null;
    if (!rows) return null;
    const normalized = normalizeRecentWritingActivityConfig(config);
    // T-6684 年历网格视图：53 周 × 7 天格子（列=周、行=周日~周六，与 heatmap 渲染契约
    // 一致），展示 yearOffset 偏移年的每日活跃度。色阶 0~4 由当年非零计数的四分位量化
    //（确定性纯函数，无全局状态）；非当年格子 outside=true。快照携带 viewType="heatmap"
    //（视图组装层白名单校验后覆盖定义 viewType）。
    if (normalized.view === "年历") {
        const nowDate = new Date(Number.isFinite(now) ? now : Date.now());
        const year = nowDate.getFullYear() + normalized.yearOffset;
        const byDay = new Map();
        for (const row of rows.slice(0, 400)) {
            const day = boundedText(row && row.day, 8);
            if (!byDay.has(day)) byDay.set(day, {blocks: 0, chars: 0});
            const bucket = byDay.get(day);
            bucket.blocks += finiteCount(row.blocks ?? row.n);
            bucket.chars += finiteCount(row.chars);
        }
        const metricKey = normalized.metric === "新增字符" ? "chars" : "blocks";
        const jan1 = new Date(year, 0, 1);
        const gridStart = new Date(year, 0, 1 - jan1.getDay()); // 行=周日~周六：对齐到当年首日所在周的周日
        const dayCounts = [];
        for (let cell = 0; cell < 371; cell += 1) {
            const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + cell);
            const key = localDateKey(day.getTime());
            if (day.getFullYear() === year) {
                const value = (byDay.get(key) || {blocks: 0, chars: 0})[metricKey];
                dayCounts.push({key, label: `${year}-${key.slice(4, 6)}-${key.slice(6, 8)}`, count: value});
            } else {
                dayCounts.push({key: "", label: "", count: 0, outside: true});
            }
        }
        const nonzero = dayCounts.map((cell) => cell.count).filter((count) => count > 0).sort((left, right) => left - right);
        // 色阶按非零计数的排名比例量化（1..4）：同值同档、最大值必达 4，确定性纯函数
        const levelOf = (count) => {
            if (!(count > 0) || !nonzero.length) return 0;
            const rank = nonzero.indexOf(count);
            return Math.min(4, 1 + Math.floor(4 * rank / Math.max(1, nonzero.length - 1)));
        };
        const items = dayCounts.map((cell) => {
            if (cell.outside) return {label: "", count: 0, outside: true};
            return {label: cell.label, count: cell.count, level: levelOf(cell.count)};
        });
        const total = dayCounts.reduce((sum, cell) => sum + cell.count, 0);
        const activeDays = nonzero.length;
        return {
            title: `${boundedText(labels.title, 64) || "近期写作活跃度"} · ${year}`,
            items,
            emptyHint: "",
            viewType: "heatmap",
            stat: {value: total.toLocaleString(), label: `${normalized.metric} · ${boundedText(labels.yearActive, 32) || "活跃"} ${activeDays} 天`},
            updatedAt: Number.isFinite(now) ? Math.floor(now) : Date.now(),
            sourceHealth: ["fresh", "cached", "stale"].includes(status) ? status : "fresh",
        };
    }
    const keys = localDayKeys(normalized.days, now);
    const allowed = new Set(keys);
    const byDay = new Map(keys.map((key) => [key, {blocks: 0, chars: 0}]));
    for (const row of rows.slice(0, 400)) {
        const day = boundedText(row && row.day, 8);
        if (!allowed.has(day)) continue;
        const current = byDay.get(day);
        current.blocks += finiteCount(row.blocks ?? row.n);
        current.chars += finiteCount(row.chars);
    }
    const daily = keys.map((day) => ({day, ...byDay.get(day)}));
    const metricKey = normalized.metric === "新增字符" ? "chars" : "blocks";
    const bucketSize = normalized.density === "紧凑" ? Math.max(1, Math.ceil(daily.length / 14)) : 1;
    const buckets = [];
    for (let index = 0; index < daily.length; index += bucketSize) {
        const group = daily.slice(index, index + bucketSize);
        const count = group.reduce((sum, entry) => sum + entry[metricKey], 0);
        if (count === 0 && !normalized.showZero) continue;
        const first = group[0].day;
        const last = group[group.length - 1].day;
        const label = first === last ? formatDateKey(first) : `${formatDateKey(first).slice(5)}–${formatDateKey(last).slice(5)}`;
        buckets.push({
            label,
            value: "",
            count,
            secondary: `${count.toLocaleString()} ${normalized.metric === "新增字符" ? (boundedText(labels.characters, 24) || "字符") : (boundedText(labels.blocks, 24) || "内容块")}`,
        });
    }
    const total = daily.reduce((sum, entry) => sum + entry[metricKey], 0);
    const average = Math.round(total / normalized.days);
    // T-6458 写作强度：教科书指数平滑——对“当日有无写作”二值信号按半衰期 14 天
    // 递推（k = 0.5^(1/14)），得 [0,1] 强度后取百分数。口径为本仓自建；uhabits
    // 仅作概念参考（GPL，见竞品调研 §7.6 许可分档），未移植其代码。
    if (normalized.showStrength) {
        const k = Math.pow(0.5, 1 / 14);
        let strength = 0;
        for (const entry of daily) {
            strength = strength * k + (entry[metricKey] > 0 ? 1 : 0) * (1 - k);
        }
        buckets.unshift({
            label: boundedText(labels.strength, 24) || "写作强度",
            value: `${Math.round(strength * 100)}%`,
            secondary: `${boundedText(labels.strengthHalfLife, 24) || "半衰期"} 14 ${boundedText(labels.dayUnit, 8) || "天"}`,
        });
    }
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "近期写作活跃度", buckets, labels, now, status,
        boundedText(labels.empty, 96) || "统计范围内没有写作活动");
    snapshot.stat = {
        value: total.toLocaleString(),
        label: normalized.showAverage
            ? `${normalized.metric} · ${(boundedText(labels.average, 32) || "日均 {value}").replace("{value}", String(average))}`
            : normalized.metric,
    };
    return snapshot;
}

const REST_DAY_PRESETS = Object.freeze(["无", "周末", "周六", "周日", "周一", "周二", "周三", "周四", "周五"]);

// 休息日预设 → JS getDay 集合（0=周日…6=周六）；休息日豁免：不计达标也不断签（uhabits SKIP 语义）
function restDaySetOf(preset) {
    const set = new Set();
    if (preset === "周末") return new Set([0, 6]);
    const map = {"周日": 0, "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6};
    if (map[preset] !== undefined) set.add(map[preset]);
    return set;
}

function normalizeWritingStreakConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        notebook: boundedText(source.notebook, 64),
        windowDays: clampInteger(source.windowDays, 30, 365, 90),
        metric: source.metric === "内容块" ? "内容块" : "新增字符",
        dailyGoal: clampInteger(source.dailyGoal, 1, 5000, 1),
        weekStart: source.weekStart === "周日" ? "周日" : "周一",
        todayGrace: source.todayGrace !== "否" && source.todayGrace !== false,
        weeklyGoal: clampInteger(source.weeklyGoal, 0, 7, 0),
        restDays: REST_DAY_PRESETS.includes(source.restDays) ? source.restDays : "无",
    };
}

function buildWritingStreakSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const rows = Array.isArray(payload) ? payload : payload && Array.isArray(payload.data) ? payload.data : null;
    if (!rows) return null;
    const normalized = normalizeWritingStreakConfig(config);
    const keys = localDayKeys(normalized.windowDays, now);
    const allowed = new Set(keys);
    const totals = new Map(keys.map((key) => [key, {blocks: 0, chars: 0}]));
    for (const row of rows.slice(0, 400)) {
        const day = boundedText(row && row.day, 8);
        if (!allowed.has(day)) continue;
        const current = totals.get(day);
        current.blocks += finiteCount(row.blocks ?? row.n);
        current.chars += finiteCount(row.chars);
    }
    const metricKey = normalized.metric === "内容块" ? "blocks" : "chars";
    const completed = new Set(keys.filter((key) => totals.get(key)[metricKey] >= normalized.dailyGoal));
    // 豁免休息日：不计达标、不断签（从日键反推星期）
    const restSet = restDaySetOf(normalized.restDays);
    const isRestKey = (key) => {
        if (!restSet.size || typeof key !== "string" || key.length !== 8) return false;
        const day = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
        return restSet.has(day.getDay());
    };
    let cursor = keys.length - 1;
    const todayComplete = completed.has(keys[cursor]);
    if (!todayComplete && !isRestKey(keys[cursor]) && normalized.todayGrace) cursor -= 1;
    let streak = 0;
    while (cursor >= 0) {
        if (isRestKey(keys[cursor])) { cursor -= 1; continue; }
        if (completed.has(keys[cursor])) { streak += 1; cursor -= 1; continue; }
        break;
    }
    let gap = 0;
    for (let index = keys.length - 1; index >= 0; index -= 1) {
        if (isRestKey(keys[index])) continue;
        if (completed.has(keys[index])) break;
        gap += 1;
    }
    const current = new Date(Number.isFinite(now) ? now : Date.now());
    const dayIndex = normalized.weekStart === "周日" ? current.getDay() : (current.getDay() + 6) % 7;
    const weekStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() - dayIndex);
    const labelsText = boundedText(labels.weekdays, 7) || "一二三四五六日";
    const weekLabels = normalized.weekStart === "周日" ? `${labelsText.slice(-1)}${labelsText.slice(0, -1)}` : labelsText;
    const weekRest = [];
    const items = Array.from({length: 7}, (_unused, index) => {
        const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index);
        const key = localDateKey(day.getTime());
        const rest = isRestKey(key);
        weekRest.push(rest);
        return {label: weekLabels.slice(index, index + 1), value: "", done: completed.has(key)};
    });
    // 每周 n/m 口径：周内非休息日达标数 ≥ weeklyGoal 记为一个达标周；本周未达标不断签（延续上周连击）
    let completedThisWeek = 0;
    items.forEach((item, index) => { if (!weekRest[index] && item.done) completedThisWeek += 1; });
    let weeklyStreak = 0;
    if (normalized.weeklyGoal >= 2) {
        const weekTotals = new Map();
        let currentWeekKey = "";
        for (const key of keys) {
            if (isRestKey(key)) continue;
            const day = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
            const offset = normalized.weekStart === "周日" ? day.getDay() : (day.getDay() + 6) % 7;
            const weekKey = localDateKey(new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset).getTime());
            if (key === keys[keys.length - 1]) currentWeekKey = weekKey;
            if (completed.has(key)) weekTotals.set(weekKey, (weekTotals.get(weekKey) || 0) + 1);
        }
        const ordered = [...weekTotals.entries()].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
        const currentIndex = currentWeekKey ? ordered.findIndex(([weekKey]) => weekKey === currentWeekKey) : ordered.length - 1;
        for (let w = ordered.length - 1; w >= 0; w -= 1) {
            const met = ordered[w][1] >= normalized.weeklyGoal;
            if (w === currentIndex) { if (met) weeklyStreak += 1; continue; }
            if (met) weeklyStreak += 1; else break;
        }
    }
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "写作打卡", items, labels, now, status);
    if (normalized.weeklyGoal >= 2) {
        const pending = weeklyStreak > 0 && completedThisWeek < normalized.weeklyGoal;
        snapshot.stat = {
            value: String(weeklyStreak),
            label: pending ? (boundedText(labels.weeklyPending, 32) || "周连续 · 本周待完成") : (boundedText(labels.weeklyStreak, 32) || "周连续"),
            arc: {value: Math.min(completedThisWeek, normalized.weeklyGoal), max: normalized.weeklyGoal},
        };
        return snapshot;
    }
    snapshot.stat = {value: String(streak), label: statLabelOf(), arc: {value: completedThisWeek, max: 7}};
    return snapshot;

    function statLabelOf() {
        let statLabel = boundedText(labels.streak, 32) || "天连续";
        if (!todayComplete && gap <= 1 && normalized.todayGrace && streak > 0) statLabel = boundedText(labels.pending, 32) || "天连续 · 今日待完成";
        else if (streak === 0 && gap > 0) statLabel = (boundedText(labels.gap, 48) || "已中断 {value} 天").replace("{value}", String(gap));
        return statLabel;
    }
}

function buildSavedSearchesSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    const criteria = responseItems(payload);
    if (!criteria) return null;
    const normalized = normalizeSavedSearchesConfig(config);
    const methods = Array.isArray(labels.methods) ? labels.methods : [];
    const entries = [];
    const seen = new Set();
    for (const [order, criterion] of criteria.entries()) {
        if (!criterion || typeof criterion !== "object") continue;
        const name = boundedText(criterion.name, 96);
        const keyword = boundedText(criterion.k, 64);
        if (!name && !keyword) continue;
        const key = `${name}\u0000${keyword}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const methodIndex = Number(criterion.method);
        if (normalized.method >= 0 && methodIndex !== normalized.method) continue;
        const scope = boundedText(criterion.hPath, 96);
        if (normalized.query && !`${name}\n${keyword}\n${scope}`.toLocaleLowerCase().includes(normalized.query.toLocaleLowerCase())) continue;
        entries.push({name, keyword, methodIndex, scope, order});
    }
    if (normalized.sortBy === "名称") {
        entries.sort((left, right) => compareText(left.name || left.keyword, right.name || right.keyword) || left.order - right.order);
    }
    const items = entries.slice(0, normalized.limit).map((entry, index) => {
        const method = methods[entry.methodIndex] || "";
        const secondary = [
            normalized.showKeyword ? entry.keyword : "",
            normalized.showMethod ? method : "",
            normalized.showScope && entry.scope ? `@${entry.scope}` : "",
        ].filter(Boolean).join(" · ");
        return {
            label: entry.name || entry.keyword,
            value: "",
            secondary,
            ...(normalized.showRank ? {rank: index + 1} : {}),
        };
    });
    const snapshot = snapshotOf(boundedText(labels.title, 64) || "已存筛选", items, labels, now, status,
        normalized.query || normalized.method >= 0 ? (boundedText(labels.emptyFiltered, 96) || "没有符合筛选条件的已存搜索") : "还没有已存的搜索条件");
    snapshot.stat = {value: entries.length > items.length ? `${items.length}/${entries.length}` : String(entries.length), label: boundedText(labels.stat, 32) || "已存条件"};
    return snapshot;
}

module.exports = {
    normalizePinnedDocsConfig,
    buildPinnedDocsSnapshot,
    normalizeInboxConfig,
    buildInboxSnapshot,
    normalizeTodayReservationsConfig,
    buildTodayReservationsSnapshot,
    normalizeRecentUpdatesConfig,
    buildRecentUpdatesSnapshot,
    normalizeDataHealthConfig,
    buildDataHealthSnapshot,
    DATA_HEALTH_SCAN_BOUND,
    normalizeHostRecentDocsConfig,
    buildHostRecentDocsSnapshot,
    normalizeDatabaseListConfig,
    buildDatabaseListSnapshot,
    normalizeSavedSearchesConfig,
    buildSavedSearchesSnapshot,
    CRITERIA_METHODS_COUNT,
    normalizeAvTableConfig,
    extractAvCellText,
    buildAvTableSnapshot,
    normalizeRandomReviewConfig,
    buildRandomReviewSnapshot,
    normalizeRecentEditsConfig,
    buildRecentEditsSnapshot,
    normalizeOutlineWidgetConfig,
    buildOutlineWidgetSnapshot,
    normalizeDocumentRelationsConfig,
    buildDocumentRelationsSnapshot,
    normalizeTagListConfig,
    buildTagListSnapshot,
    normalizeBookmarkListConfig,
    buildBookmarkListSnapshot,
    normalizeClippedUnreadConfig,
    buildClippedUnreadSnapshot,
    normalizeOnThisDayConfig,
    buildOnThisDaySnapshot,
    normalizeRecentDailyNotesConfig,
    buildRecentDailyNotesSnapshot,
    normalizeJournalMonthlyConfig,
    buildJournalMonthlySnapshot,
    normalizeTodayTasksConfig,
    buildTodayTasksSnapshot,
    normalizeFlashcardDueConfig,
    buildFlashcardDueSnapshot,
    normalizeJournalCalendarConfig,
    normalizeNoteStatsConfig,
    buildNoteStatsSnapshot,
    normalizeTodayWritingConfig,
    buildTodayWritingSnapshot,
    normalizeRecentWritingActivityConfig,
    buildRecentWritingActivitySnapshot,
    normalizeWritingStreakConfig,
    buildWritingStreakSnapshot,
};
