"use strict";

// Pure search-domain helpers. This module intentionally has no DOM or SiYuan
// API dependency so the eventual desktop/sidebar/mobile adapters can share
// the same ordering and de-duplication contract.

const DEFAULT_SEARCH_LIMITS = Object.freeze({
    documents: 12,
    snippets: 2,
    blockIds: 50,
});
const DEFAULT_SEARCH_PAGE_SIZE = 32;

const SEARCH_SOURCES = new Set(["tabs", "opened", "global"]);
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;
const MAX_TITLE_LENGTH = 256;
const MAX_PATH_LENGTH = 1024;
const MAX_SNIPPET_LENGTH = 600;
const MAX_RAW_RESULTS = 5000;
const GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter()
    : null;
const UNORDERED_FILTER_KEYS = new Set([
    "boxes", "idPath", "notebookIds", "notebooks", "pathIds", "paths", "subTypes", "subtypes", "types",
]);

function asText(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function normalizeText(value, maxLength) {
    const text = asText(value)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (maxLength <= 0) return text;
    // Search cards are short, so the small allocation is preferable to
    // rendering a broken trailing emoji or combining sequence.
    if (GRAPHEME_SEGMENTER) {
        return [...GRAPHEME_SEGMENTER.segment(text)]
            .slice(0, maxLength)
            .map((part) => part.segment)
            .join("");
    }
    return Array.from(text).slice(0, maxLength).join("");
}

function normalizeSearchQuery(value) {
    return asText(value).replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function normalizeSource(value) {
    return SEARCH_SOURCES.has(value) ? value : "global";
}

function normalizePositiveInt(value, fallback, min = 0, max = 1000) {
    const number = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeSearchLimits(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        documents: normalizePositiveInt(source.documents ?? source.maxDocuments,
            DEFAULT_SEARCH_LIMITS.documents, 0, 100),
        snippets: normalizePositiveInt(source.snippets ?? source.maxSnippets,
            DEFAULT_SEARCH_LIMITS.snippets, 0, 20),
        blockIds: normalizePositiveInt(source.blockIds ?? source.maxBlockIds,
            DEFAULT_SEARCH_LIMITS.blockIds, 0, 200),
    };
}

function canonicalFilterValue(value, seen = new WeakMap(), path = "$", inArray = false, propertyKey = "") {
    if (value === null) return null;
    if (value === undefined) return inArray ? {$undefined: true} : undefined;
    if (typeof value === "string") {
        const text = asText(value).replace(/\u0000/g, "").trim();
        return text || undefined;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint") return {$bigint: String(value)};
    if (typeof value === "symbol" || typeof value === "function") {
        return {$unsupported: typeof value, value: String(value)};
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) return {$ref: seen.get(value)};
        seen.set(value, path);
        const values = value.map((item, index) => canonicalFilterValue(item, seen, `${path}[${index}]`, true, propertyKey));
        if (UNORDERED_FILTER_KEYS.has(propertyKey)) {
            const unique = new Map(values.map((item) => [JSON.stringify(item), item]));
            return [...unique.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        }
        return values;
    }
    if (typeof value === "object") {
        if (value instanceof Date) return {$date: value.toISOString()};
        if (seen.has(value)) return {$ref: seen.get(value)};
        seen.set(value, path);
        const result = {};
        Object.keys(value).sort().forEach((key) => {
            if (key === "__proto__" || key === "constructor" || key === "prototype") return;
            const item = canonicalFilterValue(value[key], seen, `${path}.${key}`, false, key);
            if (item !== undefined) {
                result[key] = item;
            }
        });
        return result;
    }
    return undefined;
}

/**
 * Normalize filters before they enter a cache key. Object keys are sorted but
 * array order and complete values are preserved to prevent distinct ranges or
 * query modes from sharing cached results.
 */
function normalizeSearchFilters(value) {
    const normalized = canonicalFilterValue(value);
    return normalized && typeof normalized === "object" && !Array.isArray(normalized)
        ? normalized
        : {};
}

function normalizeSearchScope(value) {
    return value === "tabs" || value === "opened" || value === "global" || value === "all"
        ? value
        : "all";
}

/**
 * Build a deterministic, versioned in-memory cache key. The version lets a
 * future result-shape change invalidate old entries without persisting data.
 */
function buildSearchCacheKey(input) {
    const source = typeof input === "string" ? {query: input} : (input || {});
    return JSON.stringify({
        v: 1,
        scope: normalizeSearchScope(source.scope),
        query: normalizeSearchQuery(source.query),
        filters: normalizeSearchFilters(source.filters),
    });
}

function firstText(...values) {
    for (const value of values) {
        const text = normalizeText(value, MAX_PATH_LENGTH);
        if (text) return text;
    }
    return "";
}

function nestedValues(raw, keys) {
    const values = [];
    const containers = [raw, raw?.block, raw?.root, raw?.document, raw?.data];
    containers.forEach((container) => {
        if (!container || typeof container !== "object") return;
        keys.forEach((key) => values.push(container[key]));
    });
    return values;
}

function firstNestedField(containers, keys) {
    for (const container of containers) {
        if (!container || typeof container !== "object") continue;
        for (const key of keys) {
            if (container[key] !== undefined && container[key] !== null) return container[key];
        }
    }
    return undefined;
}

function pathBase(value) {
    const path = normalizeText(value, MAX_PATH_LENGTH).replace(/\\/g, "/");
    const base = path.split("/").filter(Boolean).pop() || "";
    return base.replace(/\.sy$/i, "");
}

function explicitRootId(raw) {
    const rootContainers = [raw?.root, raw?.document, raw?.data?.root, raw?.data?.document];
    const nestedRoot = firstText(firstNestedField(rootContainers, ["rootId", "rootID", "root_id", "id"]));
    if (BLOCK_ID_RE.test(nestedRoot)) return nestedRoot;
    const candidate = firstText(...nestedValues(raw, [
        "rootId", "rootID", "root_id", "documentId", "documentID", "docId", "doc_id",
    ]));
    if (BLOCK_ID_RE.test(candidate)) return candidate;
    const pathCandidate = pathBase(firstText(...nestedValues(raw, ["path", "hPath", "rootPath", "root_path"])));
    return BLOCK_ID_RE.test(pathCandidate) ? pathCandidate : "";
}

function explicitBlockId(raw) {
    const blockContainers = [raw, raw?.block, raw?.data?.block];
    return firstText(...nestedValues({block: raw?.block, data: raw?.data?.block}, ["blockId", "blockID", "block_id", "id"]),
        ...nestedValues(raw, ["blockId", "blockID", "block_id"]),
        firstNestedField(blockContainers, ["id"]));
}

function isDocumentRecord(raw, rootId, directId) {
    const type = firstText(...nestedValues(raw, ["type"])).toLowerCase();
    return type === "d" || type === "doc" || (rootId && directId && rootId === directId && !raw?.block);
}

function resultTitle(raw, path) {
    return firstText(
        ...nestedValues(raw, ["title", "name", "rootTitle", "documentTitle"]),
        pathBase(path),
    );
}

function resultPath(raw) {
    return firstText(...nestedValues(raw, ["hPath", "path", "rootPath", "root_path"]));
}

function resultSnippet(raw) {
    return firstText(...nestedValues(raw, [
        "snippet", "highlight", "matched", "content", "markdown", "blockContent", "text",
    ]));
}

function resultNumber(raw, keys) {
    for (const value of nestedValues(raw, keys)) {
        const number = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(number)) return number;
    }
    return null;
}

/**
 * Convert the several shapes returned by SiYuan search endpoints into one
 * small, safe record. Invalid records without a stable root document id are
 * ignored by returning null.
 */
function normalizeSearchResult(raw, source) {
    if (!raw || typeof raw !== "object") return null;
    const rootId = explicitRootId(raw);
    const directId = explicitBlockId(raw);
    const usableRootId = rootId || (BLOCK_ID_RE.test(directId) && isDocumentRecord(raw, rootId, directId) ? directId : "");
    if (!usableRootId) return null;
    const path = resultPath(raw);
    const title = resultTitle(raw, path) || usableRootId;
    const blockId = directId || null;
    const snippet = resultSnippet(raw);
    const updated = firstText(...nestedValues(raw, ["updated", "updatedAt", "updated_at"]));
    const notebookId = firstText(...nestedValues(raw, ["notebookId", "notebookID", "notebook_id"]));
    const type = firstText(...nestedValues(raw, ["type"]));
    const subType = firstText(...nestedValues(raw, ["subType", "subtype", "sub_type"]));
    return {
        rootId: usableRootId,
        blockId,
        title: normalizeText(title, MAX_TITLE_LENGTH) || usableRootId,
        path: normalizeText(path, MAX_PATH_LENGTH),
        snippet: normalizeText(snippet, MAX_SNIPPET_LENGTH),
        updated,
        notebookId,
        type,
        subType,
        score: resultNumber(raw, ["score", "relevance", "rank"]),
        source: normalizeSource(source || raw.source),
    };
}

function sourceRank(source) {
    return source === "opened" ? 3 : source === "tabs" ? 2 : 1;
}

function mergeText(existing, next, maxLength) {
    return existing || normalizeText(next, maxLength);
}

function createSearchCard(item) {
    return {
        rootId: item.rootId,
        title: item.title || item.rootId,
        path: item.path,
        updated: item.updated,
        notebookId: item.notebookId,
        type: item.type,
        subType: item.subType,
        snippets: [],
        blockIds: [],
        hitCount: 0,
        truncated: false,
        blockIdsTruncated: false,
        score: item.score,
        source: item.source,
        _blockIdSet: new Set(),
        _snippetSet: new Set(),
    };
}

function finalizeSearchCard(card) {
    const {_blockIdSet, _snippetSet, ...publicCard} = card;
    return publicCard;
}

/**
 * Aggregate raw block hits before applying the document limit. Keeping the
 * aggregate metadata lets the layer merger fill slots after de-duplication
 * and accurately report whether more results exist.
 */
function aggregateSearchResults(results, options = {}) {
    const limits = normalizeSearchLimits(options);
    const defaultSource = normalizeSource(options.source || "global");
    const excludedRoots = toRootSet(options.excludedRootIds);
    const groups = new Map();
    const input = Array.isArray(results) ? results : [];
    const rawLimit = normalizePositiveInt(options.maxRawResults, MAX_RAW_RESULTS, 0, MAX_RAW_RESULTS);
    for (let index = 0; index < input.length && index < rawLimit; index++) {
        const item = normalizeSearchResult(input[index], defaultSource);
        if (!item || excludedRoots.has(item.rootId)) continue;
        let group = groups.get(item.rootId);
        if (!group) {
            group = createSearchCard(item);
            groups.set(item.rootId, group);
        }
        group.hitCount += 1;
        if ((!group.title || group.title === group.rootId) && item.title) group.title = item.title;
        group.path = mergeText(group.path, item.path, MAX_PATH_LENGTH);
        group.updated = mergeText(group.updated, item.updated, MAX_PATH_LENGTH);
        group.notebookId = mergeText(group.notebookId, item.notebookId, MAX_PATH_LENGTH);
        group.type = mergeText(group.type, item.type, MAX_PATH_LENGTH);
        group.subType = mergeText(group.subType, item.subType, MAX_PATH_LENGTH);
        if (item.score !== null && (group.score === null || item.score > group.score)) group.score = item.score;
        if (sourceRank(item.source) > sourceRank(group.source)) group.source = item.source;
        if (item.blockId && !group._blockIdSet.has(item.blockId)) {
            group._blockIdSet.add(item.blockId);
            if (group.blockIds.length < limits.blockIds) {
                group.blockIds.push(item.blockId);
            } else {
                group.blockIdsTruncated = true;
            }
        }
        if (item.snippet && !group._snippetSet.has(item.snippet)) {
            group._snippetSet.add(item.snippet);
            if (group.snippets.length < limits.snippets) {
                group.snippets.push({text: item.snippet, blockId: item.blockId});
            } else {
                group.truncated = true;
            }
        }
    }
    return {
        cards: [...groups.values()].map(finalizeSearchCard),
        totalDocuments: groups.size,
        rawCount: Math.min(input.length, rawLimit),
        rawTruncated: input.length > rawLimit,
    };
}

/**
 * Group block-level hits into bounded document cards while preserving API
 * order. De-duplication happens before the document limit is applied.
 */
function groupSearchResults(results, options = {}) {
    const limits = normalizeSearchLimits(options);
    const aggregate = aggregateSearchResults(results, options);
    return limits.documents > 0 ? aggregate.cards.slice(0, limits.documents) : [];
}

function tabRootId(tab) {
    if (!tab || typeof tab !== "object") return "";
    const explicit = firstText(tab.rootId, tab.rootID, tab.root_id, tab.documentId, tab.docId);
    if (explicit) return explicit;
    const fromPath = pathBase(firstText(tab.hPath, tab.path, tab.rootPath));
    return BLOCK_ID_RE.test(fromPath) ? fromPath : "";
}

function tabTitle(tab, rootId) {
    const path = firstText(tab?.hPath, tab?.path, tab?.rootPath);
    return firstText(tab?.title, tab?.name, tab?.label, pathBase(path), rootId);
}

/**
 * Filter only local tab metadata. This function never performs I/O and keeps
 * the original tab object on each item so adapters can activate it directly.
 */
function filterOpenTabs(tabs, query) {
    const keyword = normalizeSearchQuery(query).toLowerCase();
    if (!Array.isArray(tabs)) return [];
    const items = [];
    tabs.forEach((tab, index) => {
        if (!tab || typeof tab !== "object") return;
        const rootId = tabRootId(tab);
        const path = firstText(tab.hPath, tab.path, tab.rootPath);
        const title = tabTitle(tab, rootId || String(tab.id || index));
        const haystack = `${title} ${path}`.toLowerCase();
        if (keyword && !haystack.includes(keyword)) return;
        items.push({
            kind: "tab",
            rootId: rootId || null,
            tab,
            title,
            path,
            updated: firstText(tab.updated, tab.updatedAt),
            source: "tabs",
        });
    });
    return items;
}

function collectTabRootIds(tabs) {
    const roots = new Set();
    if (!Array.isArray(tabs)) return roots;
    tabs.forEach((tab) => {
        const rootId = tabRootId(tab);
        if (rootId) roots.add(rootId);
    });
    return roots;
}

function toRootSet(value) {
    const roots = new Set();
    if (value instanceof Set || Array.isArray(value)) {
        value.forEach((item) => {
            const text = normalizeText(item, MAX_PATH_LENGTH);
            if (text) roots.add(text);
        });
    }
    return roots;
}

function withoutRoots(cards, roots) {
    return cards.filter((card) => !roots.has(card.rootId));
}

function firstArray(...values) {
    return values.find((value) => Array.isArray(value)) || [];
}

/**
 * Merge the three planned search layers. Local tabs are always first; opened
 * document hits follow; global cards fill the remaining document slots. A
 * root shown in an earlier layer is removed from later layers.
 */
function mergeSearchLayers(input = {}) {
    const query = normalizeSearchQuery(input.query);
    const limits = normalizeSearchLimits(input.limits || input);
    const tabs = Array.isArray(input.tabs) ? input.tabs : (Array.isArray(input.openTabs) ? input.openTabs : []);
    const tabItems = filterOpenTabs(tabs, query);
    const displayedTabRoots = new Set(tabItems.map((item) => item.rootId).filter(Boolean));
    const allOpenRoots = collectTabRootIds(tabs);
    toRootSet(input.openRootIds).forEach((rootId) => allOpenRoots.add(rootId));

    if (!query) {
        return {
            query,
            remote: false,
            tabs: tabItems,
            opened: [],
            global: [],
            cards: tabItems,
            counts: {tabs: tabItems.length, opened: 0, global: 0},
        };
    }

    const openedAggregate = aggregateSearchResults(firstArray(input.opened, input.openedResults), {
        ...limits, source: "opened", excludedRootIds: displayedTabRoots,
    });
    const opened = openedAggregate.cards.slice(0, limits.documents);
    opened.forEach((card) => allOpenRoots.add(card.rootId));
    const remaining = Math.max(0, limits.documents - opened.length);
    const globalAggregate = remaining > 0
        ? aggregateSearchResults(firstArray(input.global, input.globalResults), {
            ...limits, documents: remaining, source: "global", excludedRootIds: allOpenRoots,
        })
        : {cards: [], totalDocuments: 0, rawTruncated: false};
    const global = globalAggregate.cards.slice(0, remaining);
    return {
        query,
        remote: true,
        tabs: tabItems,
        opened,
        global,
        cards: [...tabItems, ...opened, ...global],
        counts: {
            tabs: tabItems.length,
            opened: opened.length,
            global: global.length,
        },
        truncated: openedAggregate.rawTruncated
            || openedAggregate.totalDocuments > opened.length
            || globalAggregate.rawTruncated
            || globalAggregate.totalDocuments > global.length,
    };
}

function shouldSearchRemote(query) {
    return normalizeSearchQuery(query).length > 0;
}

const SEARCH_METHOD_NAMES = Object.freeze({keyword: 0, query: 1, sql: 2, regexp: 3, regex: 3, semantic: 4});
const SEARCH_SORT_NAMES = Object.freeze({
    type: 0,
    createdAsc: 1,
    createdDesc: 2,
    updatedAsc: 3,
    updatedDesc: 4,
    content: 5,
    relevanceAsc: 6,
    relevanceDesc: 7,
});

function normalizeSearchEnum(value, names, fallback, min, max) {
    if (typeof value === "string" && Object.prototype.hasOwnProperty.call(names, value)) return names[value];
    return normalizePositiveInt(value, fallback, min, max);
}

function normalizeSearchArray(value, maxItems = 64, maxLength = MAX_PATH_LENGTH) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const items = [];
    value.forEach((entry) => {
        const item = normalizeText(entry, maxLength);
        if (!item || seen.has(item) || items.length >= maxItems) return;
        seen.add(item);
        items.push(item);
    });
    return items;
}

function normalizeSearchPaths(value) {
    return normalizeSearchArray(value).filter((path) => {
        const normalized = path.replace(/\\/g, "/");
        const box = normalized.split("/", 1)[0];
        if (!isSafeSearchBoxId(box)) return false;
        if (/[\u0000-\u001f\u007f'"`;]/.test(normalized) || /--|\/\*|\*\//.test(normalized)) return false;
        return !normalized.split("/").some((part) => part === "..");
    });
}

function isSafeSearchBoxId(value) {
    return /^[A-Za-z0-9_-]{1,64}$/.test(asText(value));
}

function normalizeSearchBooleanMap(value, maxItems = 128) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const map = {};
    Object.keys(value).sort().slice(0, maxItems).forEach((key) => {
        if (/^(?:__proto__|constructor|prototype)$/.test(key)) return;
        if (typeof value[key] === "boolean") map[key] = value[key];
    });
    return map;
}

/**
 * Build the request accepted by SiYuan's native block-search endpoints.
 * SQL mode is never emitted by this plugin. Semantic search is only selected
 * after the caller explicitly confirms endpoint availability.
 */
function buildFullTextSearchRequest(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
    const get = (key, fallback) => source[key] === undefined ? filters[key] ?? fallback : source[key];
    const query = normalizeSearchQuery(get("query", get("k", "")));
    if (!query) return null;
    let method = normalizeSearchEnum(get("method", "keyword"), SEARCH_METHOD_NAMES, 0, 0, 4);
    if (method === 2) method = 0;
    const semanticAvailable = source.capabilities?.semanticSearch === true || get("semanticAvailable", false) === true;
    if (method === 4 && !semanticAvailable) method = 0;
    const paths = normalizeSearchPaths(get("paths", get("idPath", [])));
    const body = {
        query,
        method,
        types: normalizeSearchBooleanMap(get("types", {})),
        subTypes: normalizeSearchBooleanMap(get("subTypes", get("subtypes", {}))),
        paths,
        groupBy: normalizeSearchEnum(get("groupBy", get("group", 0)), {document: 1, none: 0}, 0, 0, 1),
        orderBy: normalizeSearchEnum(get("orderBy", get("sort", 0)), SEARCH_SORT_NAMES, 0, 0, 7),
        page: normalizePositiveInt(get("page", 1), 1, 1, 100000),
        pageSize: normalizePositiveInt(get("pageSize", DEFAULT_SEARCH_PAGE_SIZE), DEFAULT_SEARCH_PAGE_SIZE, 1, 100),
        searchHPath: get("searchHPath", true) !== false,
    };
    const notebook = normalizeText(get("notebook", ""), MAX_PATH_LENGTH);
    if (isSafeSearchBoxId(notebook) && (paths.length === 0 || paths.every((path) => path.split("/", 1)[0] === notebook))) {
        body.notebook = notebook;
    }
    return {
        endpoint: method === 4 ? "/api/search/semanticSearchBlock" : "/api/search/fullTextSearchBlock",
        body,
    };
}

/**
 * SiYuan has returned block-search payloads in a few compatible wrappers
 * across versions. Keep the transport quirk out of the UI adapter and only
 * accept arrays from known result containers. The first non-empty container
 * wins so an empty `data` array cannot hide a populated `blocks` payload.
 */
function extractSearchRecords(payload) {
    const containers = [];
    const seen = new Set();
    const add = (value) => {
        if (Array.isArray(value) && !seen.has(value)) {
            seen.add(value);
            containers.push(value);
        }
    };
    add(payload);
    const queue = [payload, payload?.data, payload?.result, payload?.results];
    queue.forEach((container) => {
        if (!container || typeof container !== "object") return;
        add(container);
        ["data", "blocks", "items", "results", "records"].forEach((key) => add(container[key]));
    });
    return containers.find((items) => items.length > 0) || containers[0] || [];
}

/**
 * Build a bounded path scope for an already-open document. Native search
 * expects notebook/path pairs in `paths`; malformed or mismatched entries are
 * rejected so a stale tab cannot broaden a search to the whole workspace.
 */
function buildOpenedDocumentScope(tab) {
    const source = tab && typeof tab === "object" ? tab : {};
    const rootId = normalizeText(source.rootId || source.rootID || source.documentId || "", MAX_PATH_LENGTH);
    if (!BLOCK_ID_RE.test(rootId)) return null;
    const notebook = normalizeText(source.notebookId || source.notebookID || source.box || "", MAX_PATH_LENGTH);
    const rawPath = normalizeText(source.path || source.hPath || "", MAX_PATH_LENGTH).replace(/\\/g, "/");
    const pathParts = rawPath.split("/").filter(Boolean);
    if (pathParts[0] === notebook) pathParts.shift();
    const docPath = pathParts.join("/") || `${rootId}.sy`;
    if (!notebook || !isSafeSearchBoxId(notebook) || !/^[-A-Za-z0-9_./]+\.sy$/i.test(docPath)) return null;
    return {rootId, notebook, path: `${notebook}/${docPath}`};
}

function buildOpenedDocumentSearchRequest(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const scope = buildOpenedDocumentScope(source.tab || source);
    if (!scope) return null;
    const request = buildFullTextSearchRequest({
        query: source.query || source.k,
        method: source.method || "keyword",
        orderBy: source.orderBy || "relevanceDesc",
        groupBy: "none",
        page: source.page,
        pageSize: source.pageSize,
        searchHPath: false,
        paths: [scope.path],
        notebook: scope.notebook,
    });
    if (!request) return null;
    return {...request, scope};
}

module.exports = {
    DEFAULT_SEARCH_LIMITS,
    DEFAULT_SEARCH_PAGE_SIZE,
    normalizeSearchQuery,
    normalizeSearchFilters,
    normalizeSearchLimits,
    buildSearchCacheKey,
    normalizeSearchResult,
    aggregateSearchResults,
    groupSearchResults,
    filterOpenTabs,
    mergeSearchLayers,
    shouldSearchRemote,
    buildFullTextSearchRequest,
    extractSearchRecords,
    buildOpenedDocumentScope,
    buildOpenedDocumentSearchRequest,
};
