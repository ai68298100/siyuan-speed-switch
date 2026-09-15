"use strict";

// Pure widget-store semantics shared by desktop, sidebar and mobile adapters.
// DOM rendering stays in index.ts; this module owns bounded filtering,
// grouping, status and preview decisions so future store surfaces remain
// behaviorally aligned.

const STORE_TABS = Object.freeze(["all", "builtin", "offline", "local", "network", "plugin", "conditional", "added"]);
const STORE_DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const STORE_AVAILABILITY = Object.freeze(["ready", "conditional", "external"]);
const STORE_CATEGORIES = Object.freeze(["builtin", "plugin"]);
const STORE_INTEGRATIONS = Object.freeze(["offline", "local", "network"]);
const STORE_SORTS = Object.freeze(["relevance", "title", "status", "category"]);
const PREVIEW_KINDS = Object.freeze({
    "today-journal": "documents", "journal-monthly": "calendar", "recent-daily-notes": "documents", "today-reservations": "tasks",
    "on-this-day": "documents", "journal-calendar": "calendar", "writing-streak": "progress", "today-tasks": "tasks",
    "note-stats": "stat", "year-progress": "progress", "today-writing": "progress", "recent-writing-activity": "chart", "countdown": "countdown",
    "flashcard-due": "tasks", "random-review": "tasks", "quick-capture": "tasks", "clipped-unread": "feed",
    "recent-documents": "documents", "favorites": "documents", "document-sets": "documents", "fixed-document": "documents", "recent-edits": "documents",
    "current-document-outline": "outline", "document-relations-summary": "outline",
    "external-local-time": "stat", "external-weather-open-meteo": "weather", "external-anime-bangumi": "media",
    "external-hot-news-dailyhot": "feed", "external-news-newsnow": "feed",
    "external-activitywatch-time": "activity",
});
const SOURCE_INFO = Object.freeze({
    "external-local-time": Object.freeze({providerName: "SiYuan runtime", integration: "direct", privacy: "local-only"}),
    "external-weather-open-meteo": Object.freeze({providerName: "Open-Meteo", integration: "http", privacy: "location-only"}),
    "external-anime-bangumi": Object.freeze({providerName: "Bangumi", integration: "http", privacy: "none"}),
    "external-hot-news-dailyhot": Object.freeze({providerName: "DailyHotApi", integration: "http", privacy: "endpoint-only"}),
    "external-news-newsnow": Object.freeze({providerName: "NewsNow", integration: "http", privacy: "endpoint-only"}),
    "external-activitywatch-time": Object.freeze({providerName: "ActivityWatch", integration: "local-bridge", privacy: "local-only"}),
});

function boundedText(value, max = 256) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeHomeStoreQuery(value) {
    return boundedText(value, 128).toLowerCase();
}

function normalizeHomeStoreSort(value) {
    return STORE_SORTS.includes(value) ? value : "relevance";
}

function normalizeHomeStoreCardId(value) {
    return boundedText(value, 96).replace(/[^a-zA-Z0-9._:-]/g, "");
}

function tokenizeHomeStoreQuery(value) {
    const query = normalizeHomeStoreQuery(value);
    return [...new Set(query.split(/\s+/).filter(Boolean).slice(0, 12))];
}

function matchesHomeStoreTokens(card, query, filter) {
    const item = normalizeHomeStoreCard(card);
    const tokens = tokenizeHomeStoreQuery(query);
    return tokens.every((token) => item.search.includes(token)) && matchesHomeStoreCard(item, "", filter);
}

function resolveHomeStoreStatusRank(card) {
    const item = normalizeHomeStoreCard(card);
    if (item.added) return 0;
    if (item.availability === "ready") return 1;
    if (item.availability === "conditional") return 2;
    return 3;
}

function compareHomeStoreCards(a, b, sort = "relevance") {
    const key = normalizeHomeStoreSort(sort);
    const left = normalizeHomeStoreCard(a);
    const right = normalizeHomeStoreCard(b);
    if (key === "status") return resolveHomeStoreStatusRank(left) - resolveHomeStoreStatusRank(right) || left.search.localeCompare(right.search);
    if (key === "category") return left.category.localeCompare(right.category) || left.search.localeCompare(right.search);
    if (key === "title") return left.search.localeCompare(right.search);
    return (right.added ? 1 : 0) - (left.added ? 1 : 0) || left.search.localeCompare(right.search);
}

function sortHomeStoreCards(cards, sort = "relevance") {
    return (Array.isArray(cards) ? cards : []).map((card, index) => ({card, index}))
        .sort((a, b) => compareHomeStoreCards(a.card, b.card, sort) || a.index - b.index)
        .map((entry) => entry.card);
}

function countHomeStoreByAvailability(cards) {
    const counts = {ready: 0, conditional: 0, external: 0};
    (Array.isArray(cards) ? cards : []).forEach((card) => {
        const key = normalizeHomeStoreCard(card).availability;
        if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    });
    return counts;
}

function countHomeStoreByIntegration(cards) {
    const counts = {offline: 0, local: 0, network: 0, unknown: 0};
    (Array.isArray(cards) ? cards : []).forEach((card) => {
        const key = normalizeHomeStoreCard(card).integration;
        if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    });
    return counts;
}

function buildHomeStoreTabCounts(cards) {
    const all = Array.isArray(cards) ? cards : [];
    return {
        all: all.length,
        builtin: all.filter((card) => normalizeHomeStoreCard(card).category === "builtin").length,
        plugin: all.filter((card) => normalizeHomeStoreCard(card).category === "plugin").length,
        offline: all.filter((card) => normalizeHomeStoreCard(card).integration === "offline").length,
        local: all.filter((card) => normalizeHomeStoreCard(card).integration === "local").length,
        network: all.filter((card) => normalizeHomeStoreCard(card).integration === "network").length,
        conditional: all.filter((card) => normalizeHomeStoreCard(card).availability === "conditional").length,
        added: all.filter(isHomeStoreAdded).length,
    };
}

function resolveHomeStoreCardA11y(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    const title = boundedText(labels.title || item.search, 128);
    const state = item.added ? boundedText(labels.added || "已添加", 32) : boundedText(labels.notAdded || "未添加", 32);
    return [title, state].filter(Boolean).join(" · ");
}

function normalizeHomeStorePage(value, total = 0, pageSize = 24) {
    const size = Number.isFinite(Number(pageSize)) ? Math.min(100, Math.max(1, Math.trunc(Number(pageSize)))) : 24;
    const pages = Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / size));
    const page = Number.isFinite(Number(value)) ? Math.min(pages, Math.max(1, Math.trunc(Number(value)))) : 1;
    return {page, pageSize: size, pages};
}

function sliceHomeStorePage(cards, page = 1, pageSize = 24) {
    const list = Array.isArray(cards) ? cards : [];
    const meta = normalizeHomeStorePage(page, list.length, pageSize);
    return {items: list.slice((meta.page - 1) * meta.pageSize, meta.page * meta.pageSize), ...meta};
}

function normalizeHomeStoreFocusIndex(value, count) {
    const total = Math.max(0, Math.trunc(Number(count) || 0));
    if (!total) return -1;
    const index = Math.trunc(Number(value));
    return Number.isFinite(index) ? Math.min(total - 1, Math.max(0, index)) : 0;
}

function moveHomeStoreFocus(index, count, delta) {
    const total = Math.max(0, Math.trunc(Number(count) || 0));
    if (!total) return -1;
    const current = normalizeHomeStoreFocusIndex(index, total);
    return (current + Math.trunc(Number(delta) || 0) + total) % total;
}

function serializeHomeStoreCollapsedGroups(values) {
    return [...normalizeHomeStoreCollapsedGroups(values)].sort().join("|");
}

function parseHomeStoreCollapsedGroups(value) {
    return normalizeHomeStoreCollapsedGroups(typeof value === "string" ? value.split("|") : []);
}

function resolveHomeStoreGroupCount(cards, query, filter) {
    return filterHomeStoreCards(cards, query, filter).length;
}

function isHomeStoreCardVisible(card, query, filter) {
    return matchesHomeStoreCard(card, query, filter);
}

function normalizeHomeStoreCardTitle(value, fallback = "组件") {
    return boundedText(value, 96) || boundedText(fallback, 96) || "组件";
}

function resolveHomeStoreSortLabel(sort, labels = {}) {
    const key = normalizeHomeStoreSort(sort);
    return boundedText(labels[key], 48) || key;
}

function buildHomeStoreCardMetadata(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    return {title: normalizeHomeStoreCardTitle(labels.title || item.search), status: item.added ? "added" : item.availability, integration: item.integration, selectable: !item.added || item.added};
}

function buildHomeStoreSectionSummary(cards, query, filter, labels = {}) {
    const summary = summarizeHomeStoreCards(cards, query, filter);
    return {text: boundedText(labels.text, 128).replace("{visible}", String(summary.visible)).replace("{total}", String(summary.total)).replace("{added}", String(summary.added)), ...summary};
}

function isHomeStoreActionEnabled(action, card) {
    const key = boundedText(action, 32);
    const item = normalizeHomeStoreCard(card);
    if (["preview", "configure", "remove"].includes(key)) return item.added || key === "preview";
    if (key === "add") return !item.added && item.availability !== "external";
    return false;
}

function resolveHomeStoreButtonLabel(action, card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    const title = normalizeHomeStoreCardTitle(labels.title || item.search);
    const text = boundedText(labels[action], 48) || keyFallback(action);
    return `${text} · ${title}`;
}

function keyFallback(action) {
    return ({add: "添加", configure: "配置", remove: "移除", preview: "预览"})[action] || "操作";
}

function normalizeHomeStoreCardOrder(cards) {
    return (Array.isArray(cards) ? cards : []).map((card, index) => ({card, index})).filter(({card}) => !!normalizeHomeStoreCard(card).search).sort((a, b) => a.index - b.index).map(({card}) => card);
}

function findHomeStoreCardIndex(cards, moduleId) {
    const key = boundedText(moduleId, 96);
    return normalizeHomeStoreCardOrder(cards).findIndex((card) => boundedText(card?.moduleId || card?.id, 96) === key);
}

function moveHomeStoreCard(cards, from, to) {
    const list = normalizeHomeStoreCardOrder(cards);
    if (!list.length) return [];
    const source = normalizeHomeStoreFocusIndex(from, list.length);
    const target = normalizeHomeStoreFocusIndex(to, list.length);
    const [item] = list.splice(source, 1);
    list.splice(target, 0, item);
    return list;
}

function buildHomeStoreEmptyState(query, filter, labels = {}) {
    const hasQuery = !!normalizeHomeStoreQuery(query);
    const tab = normalizeHomeStoreTab(filter?.tab);
    return {kind: hasQuery ? "search" : tab !== "all" ? "filter" : "empty", text: boundedText(labels[hasQuery ? "search" : tab !== "all" ? "filter" : "empty"], 128) || "暂无组件"};
}

function resolveHomeStoreFilterDescription(filter, labels = {}) {
    const normalized = filter && typeof filter === "object" ? filter : resolveHomeStoreFilter("all");
    return boundedText(labels[normalized.tab] || labels.all, 96);
}

function serializeHomeStoreFilter(filter) {
    const normalized = resolveHomeStoreFilter(filter?.tab);
    return JSON.stringify(normalized);
}

function parseHomeStoreFilter(value) {
    try { return resolveHomeStoreFilter(JSON.parse(typeof value === "string" ? value : "").tab); } catch (_) { return resolveHomeStoreFilter("all"); }
}

function sameHomeStoreFilter(left, right) {
    return serializeHomeStoreFilter(left) === serializeHomeStoreFilter(right);
}

function mergeHomeStoreFilters(base, override) {
    return resolveHomeStoreFilter(override?.tab || base?.tab || "all");
}

function resetHomeStoreFilter() {
    return resolveHomeStoreFilter("all");
}

function resolveHomeStoreStatusTone(card) {
    const item = normalizeHomeStoreCard(card);
    if (item.added) return "success";
    if (item.availability === "conditional") return "warning";
    if (item.availability === "external") return "info";
    return "neutral";
}

function resolveHomeStoreIntegrationTone(card) {
    const key = normalizeHomeStoreCard(card).integration;
    return ({offline: "offline", local: "local", network: "network"})[key] || "unknown";
}

function resolveHomeStoreActionPriority(card) {
    const item = normalizeHomeStoreCard(card);
    if (!item.added) return item.availability === "conditional" ? 2 : 0;
    return item.availability === "conditional" ? 1 : 3;
}

function listHomeStoreActionOrder(card) {
    const item = normalizeHomeStoreCard(card);
    return item.added ? ["configure", "preview", "remove"] : ["add", "preview"];
}

function normalizeHomeStoreHighlightText(value) {
    return boundedText(value, 160);
}

function buildHomeStoreHighlightRanges(text, query) {
    const value = normalizeHomeStoreHighlightText(text);
    const tokens = tokenizeHomeStoreQuery(query).sort((a, b) => b.length - a.length);
    const ranges = [];
    tokens.forEach((token) => {
        let start = 0;
        const lower = value.toLowerCase();
        while (token && (start = lower.indexOf(token, start)) >= 0) {
            const end = start + token.length;
            if (!ranges.some((range) => start < range.end && end > range.start)) ranges.push({start, end});
            start = end;
        }
    });
    return ranges.sort((a, b) => a.start - b.start);
}

function buildHomeStoreHighlightSegments(text, query) {
    const value = normalizeHomeStoreHighlightText(text);
    const ranges = buildHomeStoreHighlightRanges(value, query);
    if (!ranges.length) return [{text: value, highlighted: false}];
    const segments = [];
    let cursor = 0;
    ranges.forEach((range) => {
        if (range.start > cursor) segments.push({text: value.slice(cursor, range.start), highlighted: false});
        segments.push({text: value.slice(range.start, range.end), highlighted: true});
        cursor = range.end;
    });
    if (cursor < value.length) segments.push({text: value.slice(cursor), highlighted: false});
    return segments;
}

function resolveHomeStoreEmptyAction(kind) {
    return ({search: "clear-search", filter: "clear-filters", empty: "open-store"})[kind] || "open-store";
}

function buildHomeStoreEmptyActionLabel(kind, labels = {}) {
    const action = resolveHomeStoreEmptyAction(kind);
    return boundedText(labels[action], 64) || action;
}

function normalizeHomeStoreGroupKey(value) {
    return boundedText(value, 96).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "other";
}

function buildHomeStoreGroupId(value, index = 0) {
    const position = Math.max(0, Math.trunc(Number(index) || 0));
    return `sw-store-group-${normalizeHomeStoreGroupKey(value)}-${position}`;
}

function resolveHomeStoreCardDensity(size) {
    return ({xs: "compact", small: "compact", medium: "comfortable", wide: "comfortable", large: "spacious", full: "spacious"})[size] || "comfortable";
}

function normalizeHomeStoreCardSize(size, supported = []) {
    const options = Array.isArray(supported) && supported.length ? supported.filter((item) => typeof item === "string") : ["medium"];
    return options.includes(size) ? size : options[0];
}

function resolveHomeStoreCardLayout(size, supported = []) {
    const normalized = normalizeHomeStoreCardSize(size, supported);
    return {size: normalized, density: resolveHomeStoreCardDensity(normalized), mobile: "medium"};
}

function buildHomeStoreSourceSummary(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    const network = ({offline: labels.offline, local: labels.local, network: labels.network})[item.integration] || labels.unknown || "";
    return [boundedText(labels.source, 32), network].filter(Boolean).join(" · ");
}

function compareHomeStoreCardIdentity(left, right) {
    const a = boundedText(left?.moduleId || left?.id, 96);
    const b = boundedText(right?.moduleId || right?.id, 96);
    return a === b;
}

function dedupeHomeStoreByIdentity(cards) {
    const seen = new Set();
    return (Array.isArray(cards) ? cards : []).filter((card) => {
        const key = boundedText(card?.moduleId || card?.id, 96);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function scoreHomeStoreCard(card, query) {
    const item = normalizeHomeStoreCard(card);
    const tokens = tokenizeHomeStoreQuery(query);
    if (!tokens.length) return 0;
    return tokens.reduce((score, token) => score + (item.search === token ? 4 : item.search.startsWith(token) ? 2 : item.search.includes(token) ? 1 : 0), 0);
}

function rankHomeStoreCards(cards, query) {
    return (Array.isArray(cards) ? cards : []).map((card, index) => ({card, index, score: scoreHomeStoreCard(card, query)})).sort((a, b) => b.score - a.score || a.index - b.index).map(({card}) => card);
}

function buildHomeStoreSearchSummary(cards, query, labels = {}) {
    const list = Array.isArray(cards) ? cards : [];
    const visible = list.filter((card) => scoreHomeStoreCard(card, query) > 0 || !normalizeHomeStoreQuery(query)).length;
    return boundedText(labels.text, 128).replace("{visible}", String(visible)).replace("{total}", String(list.length));
}

function resolveHomeStoreFilterBadge(tab, labels = {}) {
    const key = normalizeHomeStoreTab(tab);
    return boundedText(labels[key], 48) || key;
}

function resolveHomeStoreKeyboardHint(surface, labels = {}) {
    const key = normalizeHomeStoreDevice(surface);
    return boundedText(labels[key], 96) || "↑↓ 选择，Enter 确认";
}

function buildHomeStoreActionSet(card, labels = {}) {
    return listHomeStoreActionOrder(card).map((action) => ({action, label: resolveHomeStoreButtonLabel(action, card, labels), enabled: isHomeStoreActionEnabled(action, card)}));
}

function normalizeHomeStoreSourceLabel(value, fallback = "来源未知") {
    return boundedText(value, 64) || fallback;
}

function normalizeHomeStoreStatusLabel(value, fallback = "状态未知") {
    return boundedText(value, 64) || fallback;
}

function buildHomeStoreTooltip(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    return [normalizeHomeStoreCardTitle(labels.title || item.search), normalizeHomeStoreStatusLabel(labels.status || item.availability), normalizeHomeStoreSourceLabel(labels.source)].join(" · ");
}

function normalizeHomeStoreSearchState(value) {
    const source = value && typeof value === "object" ? value : {};
    return {query: normalizeHomeStoreQuery(source.query), tab: normalizeHomeStoreTab(source.tab), sort: normalizeHomeStoreSort(source.sort)};
}

function sameHomeStoreSearchState(left, right) {
    return JSON.stringify(normalizeHomeStoreSearchState(left)) === JSON.stringify(normalizeHomeStoreSearchState(right));
}

function resetHomeStoreSearchState() {
    return {query: "", tab: "all", sort: "relevance"};
}

function normalizeHomeStoreTab(value) {
    return STORE_TABS.includes(value) ? value : "all";
}

function normalizeHomeStoreDevice(value) {
    return STORE_DEVICES.includes(value) ? value : "desktop";
}

function normalizeHomeStoreCategory(value) {
    return STORE_CATEGORIES.includes(value) ? value : "builtin";
}

function normalizeHomeStoreAvailability(value) {
    return STORE_AVAILABILITY.includes(value) ? value : "ready";
}

function resolveHomeStoreFilter(tab) {
    const key = normalizeHomeStoreTab(tab);
    return {
        tab: key,
        category: key === "builtin" || key === "plugin" ? key : "all",
        availability: key === "conditional" ? "conditional" : "",
        integration: STORE_INTEGRATIONS.includes(key) ? key : "",
        addedOnly: key === "added",
    };
}

function normalizeHomeStoreCard(card) {
    const source = card && typeof card === "object" ? card : {};
    return {
        search: boundedText(source.search, 512).toLowerCase(),
        category: normalizeHomeStoreCategory(source.category),
        availability: normalizeHomeStoreAvailability(source.availability),
        integration: STORE_INTEGRATIONS.includes(source.integration) ? source.integration : "unknown",
        added: source.added === true || source.added === "true",
    };
}

function matchesHomeStoreCard(card, query, filter) {
    const item = normalizeHomeStoreCard(card);
    const text = normalizeHomeStoreQuery(query);
    const active = filter && typeof filter === "object" ? filter : resolveHomeStoreFilter("all");
    return (!text || item.search.includes(text))
        && (!active.category || active.category === "all" || item.category === active.category)
        && (!active.availability || item.availability === active.availability)
        && (!active.integration || item.integration === active.integration)
        && (!active.addedOnly || item.added);
}

function filterHomeStoreCards(cards, query, filter) {
    if (!Array.isArray(cards)) return [];
    return cards.filter((card) => matchesHomeStoreCard(card, query, filter));
}

function isHomeStoreAdded(card) {
    return normalizeHomeStoreCard(card).added;
}

function countHomeStoreCards(cards) {
    return Array.isArray(cards) ? cards.length : 0;
}

function summarizeHomeStoreCards(cards, query, filter) {
    const all = Array.isArray(cards) ? cards : [];
    const visible = filterHomeStoreCards(all, query, filter);
    return {total: all.length, visible: visible.length, added: all.filter(isHomeStoreAdded).length};
}

function buildHomeStoreSearchText(definition, moduleId) {
    const def = definition && typeof definition === "object" ? definition : {};
    return boundedText(`${def.title || ""} ${def.description || ""} ${moduleId || ""}`, 512).toLowerCase();
}

function resolveHomeStorePreviewKind(moduleId, category) {
    if (typeof moduleId === "string" && PREVIEW_KINDS[moduleId]) return PREVIEW_KINDS[moduleId];
    return normalizeHomeStoreCategory(category) === "plugin" ? "plugin" : "list";
}

function resolveHomeStoreSourceInfo(moduleId) {
    const entry = typeof moduleId === "string" ? SOURCE_INFO[moduleId] : null;
    return entry ? {...entry} : null;
}

function normalizeHomeStorePreviewKind(value) {
    return ["calendar", "tasks", "stat", "progress", "chart", "countdown", "outline", "documents", "weather", "media", "feed", "activity", "plugin", "list"].includes(value)
        ? value : "list";
}

function resolveHomeStoreCardStatus(added, size, supportedSizes) {
    const options = Array.isArray(supportedSizes) && supportedSizes.length ? supportedSizes : ["medium"];
    const sizeKey = typeof size === "string" && options.includes(size) ? size : options[0];
    return {added: !!added, sizeKey, status: added ? "added" : "not-added"};
}

function resolveHomeStoreSizeSelection(current, supportedSizes) {
    const options = Array.isArray(supportedSizes) && supportedSizes.length ? supportedSizes.filter((item) => typeof item === "string") : ["medium"];
    const selected = typeof current === "string" && options.includes(current) ? current : options[0];
    return {options, selected};
}

function isHomeStoreSizeSupported(size, supportedSizes) {
    return Array.isArray(supportedSizes) && typeof size === "string" && supportedSizes.includes(size);
}

function normalizeHomeStoreSupportedSurfaces(value, fallback) {
    const values = Array.isArray(value) ? value : [fallback];
    return [...new Set(values.filter((item) => STORE_DEVICES.includes(item)))];
}

function isHomeStoreConditional(card) {
    return normalizeHomeStoreCard(card).availability === "conditional";
}

function isHomeStoreExternal(card) {
    return normalizeHomeStoreCard(card).availability === "external";
}

function shouldShowHomeStoreSection(visibleCount) {
    return Number.isFinite(visibleCount) && visibleCount > 0;
}

function shouldShowHomeStoreGroup(cards, query, filter) {
    return shouldShowHomeStoreSection(filterHomeStoreCards(cards, query, filter).length);
}

function normalizeHomeStoreGroupLabel(value, fallback = "Other") {
    return boundedText(value, 96) || boundedText(fallback, 96) || "Other";
}

function groupHomeStoreCards(cards, groupOf) {
    const groups = new Map();
    if (!Array.isArray(cards)) return groups;
    cards.forEach((card) => {
        const label = normalizeHomeStoreGroupLabel(typeof groupOf === "function" ? groupOf(card) : "Other");
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(card);
    });
    return groups;
}

function orderHomeStoreGroups(groups, preferred) {
    const keys = groups instanceof Map ? [...groups.keys()] : [];
    const order = Array.isArray(preferred) ? preferred : [];
    return [...order.filter((label) => keys.includes(label)), ...keys.filter((label) => !order.includes(label))];
}

function dedupeHomeStoreCards(cards) {
    if (!Array.isArray(cards)) return [];
    const seen = new Set();
    return cards.filter((card) => {
        const key = boundedText(card?.moduleId || card?.id, 128);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeHomeStoreCollapsedGroups(values) {
    if (!(values instanceof Set) && !Array.isArray(values)) return new Set();
    return new Set([...values].filter((value) => typeof value === "string" && boundedText(value, 96)));
}

function toggleHomeStoreGroup(values, label) {
    const next = normalizeHomeStoreCollapsedGroups(values);
    const key = normalizeHomeStoreGroupLabel(label);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
}

function resolveHomeStoreAction(added, configured) {
    if (added) return configured ? "configure" : "apply-size";
    return "add";
}

function getHomeStoreTabKeys() {
    return [...STORE_TABS];
}

module.exports = {
    STORE_TABS, STORE_DEVICES, STORE_AVAILABILITY, STORE_CATEGORIES, STORE_INTEGRATIONS, STORE_SORTS,
    normalizeHomeStoreQuery, normalizeHomeStoreTab, normalizeHomeStoreDevice, normalizeHomeStoreCategory,
    normalizeHomeStoreSort, normalizeHomeStoreCardId, tokenizeHomeStoreQuery, matchesHomeStoreTokens,
    resolveHomeStoreStatusRank, compareHomeStoreCards, sortHomeStoreCards, countHomeStoreByAvailability,
    countHomeStoreByIntegration, buildHomeStoreTabCounts, resolveHomeStoreCardA11y, normalizeHomeStorePage,
    sliceHomeStorePage, normalizeHomeStoreFocusIndex, moveHomeStoreFocus, serializeHomeStoreCollapsedGroups,
    parseHomeStoreCollapsedGroups, resolveHomeStoreGroupCount, isHomeStoreCardVisible,
    normalizeHomeStoreCardTitle, resolveHomeStoreSortLabel, buildHomeStoreCardMetadata, buildHomeStoreSectionSummary,
    isHomeStoreActionEnabled, resolveHomeStoreButtonLabel, normalizeHomeStoreCardOrder, findHomeStoreCardIndex,
    moveHomeStoreCard, buildHomeStoreEmptyState, resolveHomeStoreFilterDescription, serializeHomeStoreFilter,
    parseHomeStoreFilter, sameHomeStoreFilter, mergeHomeStoreFilters, resetHomeStoreFilter,
    resolveHomeStoreStatusTone, resolveHomeStoreIntegrationTone, resolveHomeStoreActionPriority, listHomeStoreActionOrder,
    normalizeHomeStoreHighlightText, buildHomeStoreHighlightRanges, buildHomeStoreHighlightSegments,
    resolveHomeStoreEmptyAction, buildHomeStoreEmptyActionLabel, normalizeHomeStoreGroupKey, buildHomeStoreGroupId,
    resolveHomeStoreCardDensity, normalizeHomeStoreCardSize, resolveHomeStoreCardLayout, buildHomeStoreSourceSummary,
    compareHomeStoreCardIdentity, dedupeHomeStoreByIdentity,
    scoreHomeStoreCard, rankHomeStoreCards, buildHomeStoreSearchSummary, resolveHomeStoreFilterBadge,
    resolveHomeStoreKeyboardHint, buildHomeStoreActionSet, normalizeHomeStoreSourceLabel,
    normalizeHomeStoreStatusLabel, buildHomeStoreTooltip, normalizeHomeStoreSearchState,
    sameHomeStoreSearchState, resetHomeStoreSearchState,
    normalizeHomeStoreAvailability, resolveHomeStoreFilter, normalizeHomeStoreCard, matchesHomeStoreCard,
    filterHomeStoreCards, isHomeStoreAdded, countHomeStoreCards, summarizeHomeStoreCards, buildHomeStoreSearchText,
    resolveHomeStorePreviewKind, resolveHomeStoreSourceInfo, normalizeHomeStorePreviewKind, resolveHomeStoreCardStatus,
    resolveHomeStoreSizeSelection, isHomeStoreSizeSupported, normalizeHomeStoreSupportedSurfaces,
    isHomeStoreConditional, isHomeStoreExternal, shouldShowHomeStoreSection, shouldShowHomeStoreGroup,
    normalizeHomeStoreGroupLabel, groupHomeStoreCards, orderHomeStoreGroups, dedupeHomeStoreCards,
    normalizeHomeStoreCollapsedGroups, toggleHomeStoreGroup, resolveHomeStoreAction, getHomeStoreTabKeys,
};
