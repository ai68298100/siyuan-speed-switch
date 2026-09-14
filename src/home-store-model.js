"use strict";

// Pure widget-store semantics shared by desktop, sidebar and mobile adapters.
// DOM rendering stays in index.ts; this module owns bounded filtering,
// grouping, status and preview decisions so future store surfaces remain
// behaviorally aligned.

const STORE_TABS = Object.freeze(["all", "builtin", "plugin", "conditional", "added"]);
const STORE_DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const STORE_AVAILABILITY = Object.freeze(["ready", "conditional", "external"]);
const STORE_CATEGORIES = Object.freeze(["builtin", "plugin"]);
const PREVIEW_KINDS = Object.freeze({
    "journal-calendar": "calendar", "today-tasks": "tasks", "note-stats": "stat", "year-progress": "progress",
    "today-writing": "progress", "recent-writing-activity": "chart", "countdown": "countdown", "flashcard-due": "tasks",
    "random-review": "tasks", "current-document-outline": "outline", "recent-documents": "documents", favorites: "documents",
    "external-local-time": "stat", "external-weather-open-meteo": "weather", "external-anime-bangumi": "media",
});
const SOURCE_INFO = Object.freeze({
    "external-local-time": Object.freeze({providerName: "SiYuan runtime", integration: "direct", privacy: "local-only"}),
    "external-weather-open-meteo": Object.freeze({providerName: "Open-Meteo", integration: "http", privacy: "location-only"}),
    "external-anime-bangumi": Object.freeze({providerName: "Bangumi", integration: "http", privacy: "none"}),
});

function boundedText(value, max = 256) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeHomeStoreQuery(value) {
    return boundedText(value, 128).toLowerCase();
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
        addedOnly: key === "added",
    };
}

function normalizeHomeStoreCard(card) {
    const source = card && typeof card === "object" ? card : {};
    return {
        search: boundedText(source.search, 512).toLowerCase(),
        category: normalizeHomeStoreCategory(source.category),
        availability: normalizeHomeStoreAvailability(source.availability),
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
    return ["calendar", "tasks", "stat", "progress", "chart", "countdown", "outline", "documents", "weather", "media", "plugin", "list"].includes(value)
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
    STORE_TABS, STORE_DEVICES, STORE_AVAILABILITY, STORE_CATEGORIES,
    normalizeHomeStoreQuery, normalizeHomeStoreTab, normalizeHomeStoreDevice, normalizeHomeStoreCategory,
    normalizeHomeStoreAvailability, resolveHomeStoreFilter, normalizeHomeStoreCard, matchesHomeStoreCard,
    filterHomeStoreCards, isHomeStoreAdded, countHomeStoreCards, summarizeHomeStoreCards, buildHomeStoreSearchText,
    resolveHomeStorePreviewKind, resolveHomeStoreSourceInfo, normalizeHomeStorePreviewKind, resolveHomeStoreCardStatus,
    resolveHomeStoreSizeSelection, isHomeStoreSizeSupported, normalizeHomeStoreSupportedSurfaces,
    isHomeStoreConditional, isHomeStoreExternal, shouldShowHomeStoreSection, shouldShowHomeStoreGroup,
    normalizeHomeStoreGroupLabel, groupHomeStoreCards, orderHomeStoreGroups, dedupeHomeStoreCards,
    normalizeHomeStoreCollapsedGroups, toggleHomeStoreGroup, resolveHomeStoreAction, getHomeStoreTabKeys,
};
