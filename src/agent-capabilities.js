"use strict";

// Agent-facing helpers stay independent from the SiYuan DOM.  The host owns
// capability policy and lifecycle; this module only bounds input/output and
// describes the read-only contract shared by desktop and mobile.

const MAX_QUERY_LENGTH = 200;
const MAX_NOTEBOOK_LENGTH = 64;
const MAX_ITEMS = 32;
const MAX_SEARCH_ITEMS = 32;
const MAX_TEXT_LENGTH = 256;
const MAX_SNIPPET_LENGTH = 600;
const ITEM_SOURCES = Object.freeze(["tabs", "recent", "favorite", "title", "opened", "global"]);
const SEARCH_SOURCES = Object.freeze(["tabs", "title", "global", "tabs+title", "tabs+global"]);
const SEARCH_METHODS = Object.freeze(["keyword", "query", "regexp"]);
const SEARCH_ORDERS = Object.freeze(["relevanceDesc", "updatedDesc", "createdDesc", "content"]);
const SEARCH_TYPES = Object.freeze(["document", "heading", "paragraph", "codeBlock"]);
const SEARCH_SUBTYPES = Object.freeze(["h1", "h2", "h3", "h4", "h5", "h6", "o", "u", "t"]);
const GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter()
    : null;

function asText(value, maxLength = MAX_TEXT_LENGTH) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    const text = String(value)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!GRAPHEME_SEGMENTER) return Array.from(text).slice(0, maxLength).join("");
    let result = "";
    let codePoints = 0;
    for (const part of GRAPHEME_SEGMENTER.segment(text)) {
        const size = Array.from(part.segment).length;
        if (codePoints + size > maxLength) break;
        result += part.segment;
        codePoints += size;
    }
    return result;
}

function normalizeAgentQuery(value) {
    return asText(value, MAX_QUERY_LENGTH);
}

function normalizeAgentNotebook(value) {
    const notebook = asText(value, MAX_NOTEBOOK_LENGTH);
    return /^[A-Za-z0-9_-]{1,64}$/.test(notebook) ? notebook : "";
}

function normalizeAgentLimit(value, fallback = 12) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_ITEMS, Math.max(1, parsed));
}

function normalizeAgentSearchMethod(value) {
    if (value === undefined || value === null || value === "" || value === "keyword") return "keyword";
    return SEARCH_METHODS.includes(value) ? value : "";
}

function normalizeAgentSearchOrder(value) {
    if (value === undefined || value === null || value === "" || value === "relevanceDesc") return "relevanceDesc";
    return SEARCH_ORDERS.includes(value) ? value : "";
}

function normalizeAgentSearchType(value) {
    if (value === undefined || value === null || value === "") return "";
    return SEARCH_TYPES.includes(value) ? value : "";
}

function normalizeAgentSearchSubType(value) {
    if (value === undefined || value === null || value === "") return "";
    return SEARCH_SUBTYPES.includes(value) ? value : "";
}

function normalizeAgentRootId(value) {
    const id = asText(value, 64);
    return /^\d{14}-[0-9a-z]+$/i.test(id) ? id : "";
}

function normalizeAgentItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const result = {};
    ["id", "rootId", "title", "path", "notebookId", "group", "source", "active", "ts"].forEach((key) => {
        if (source[key] === undefined || source[key] === null) return;
        if (key === "active") {
            result[key] = source[key] === true;
        } else if (key === "ts") {
            const ts = Number(source[key]);
            if (Number.isFinite(ts) && ts > 0) result[key] = Math.floor(ts);
        } else if (key === "rootId") {
            const rootId = normalizeAgentRootId(source[key]);
            if (rootId) result[key] = rootId;
        } else if (key === "notebookId") {
            const notebook = normalizeAgentNotebook(source[key]);
            if (notebook) result[key] = notebook;
        } else if (key === "source") {
            const itemSource = asText(source[key], 32);
            if (ITEM_SOURCES.includes(itemSource)) result[key] = itemSource;
        } else {
            const text = asText(source[key]);
            if (text) result[key] = text;
        }
    });
    if (Array.isArray(source.blockIds)) {
        const blockIds = source.blockIds
            .map((value) => asText(value, 64))
            .filter((value) => /^\d{14}-[0-9a-z]+$/i.test(value))
            .slice(0, 8);
        if (blockIds.length > 0) result.blockIds = blockIds;
    }
    if (Array.isArray(source.snippets)) {
        const snippets = source.snippets
            .map((value) => asText(value, MAX_SNIPPET_LENGTH))
            .filter(Boolean)
            .slice(0, 2);
        if (snippets.length > 0) result.snippets = snippets;
    }
    return result;
}

function limitAgentItems(items, limit = MAX_ITEMS) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const output = [];
    items.slice(0, MAX_ITEMS * 2).forEach((item) => {
        if (output.length >= normalizeAgentLimit(limit, MAX_ITEMS)) return;
        const normalized = normalizeAgentItem(item);
        const key = normalized.rootId || normalized.id || normalized.title;
        if (!key || seen.has(key)) return;
        seen.add(key);
        output.push(normalized);
    });
    return output;
}

function buildAgentNavigationResult(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const limit = normalizeAgentLimit(source.limit, 12);
    return {
        activeId: asText(source.activeId, 128),
        mobile: source.mobile === true,
        tabs: limitAgentItems(source.tabs, limit),
        recent: limitAgentItems(source.recent, limit),
        favorites: limitAgentItems(source.favorites, limit),
    };
}

function buildAgentSearchResult(query, items, extra = {}) {
    const normalizedQuery = normalizeAgentQuery(query);
    const source = extra && typeof extra === "object" ? extra : {};
    const limitedItems = limitAgentItems(items, source.limit || 12);
    const limit = normalizeAgentLimit(source.limit, 12);
    return {
        query: normalizedQuery,
        count: limitedItems.length,
        items: limitedItems,
        source: SEARCH_SOURCES.includes(source.source) ? source.source : "tabs",
        truncated: source.truncated === true || (Array.isArray(items) && items.length > limit),
    };
}

const AGENT_ITEM_SCHEMA = Object.freeze({
    type: "object",
    properties: {
        id: {type: "string", maxLength: MAX_TEXT_LENGTH},
        rootId: {type: "string", maxLength: 64, pattern: "^\\d{14}-[0-9A-Za-z]+$"},
        title: {type: "string", maxLength: MAX_TEXT_LENGTH},
        path: {type: "string", maxLength: MAX_TEXT_LENGTH},
        notebookId: {type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$"},
        group: {type: "string", maxLength: MAX_TEXT_LENGTH},
        source: {type: "string", enum: ITEM_SOURCES},
        active: {type: "boolean"},
        ts: {type: "integer", minimum: 1},
        blockIds: {
            type: "array",
            maxItems: 8,
            items: {type: "string", maxLength: 64, pattern: "^\\d{14}-[0-9A-Za-z]+$"},
        },
        snippets: {
            type: "array",
            maxItems: 2,
            items: {type: "string", maxLength: MAX_SNIPPET_LENGTH},
        },
    },
    anyOf: [
        {required: ["rootId"], properties: {rootId: {type: "string"}}},
        {required: ["id"], properties: {id: {type: "string"}}},
        {required: ["title"], properties: {title: {type: "string"}}},
    ],
    additionalProperties: false,
});

const AGENT_ITEMS_SCHEMA = Object.freeze({
    type: "array",
    maxItems: MAX_ITEMS,
    items: AGENT_ITEM_SCHEMA,
});

const AGENT_CAPABILITY_SPECS = Object.freeze({
    navigation: Object.freeze({
        name: "navigation-state",
        title: "小驴速切导航状态",
        description: "只读获取小驴速切当前打开页签、最近打开记录和收藏摘要。不会修改笔记或页签。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {limit: {type: "integer", minimum: 1, maximum: MAX_ITEMS}},
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                activeId: {type: "string", maxLength: 128},
                mobile: {type: "boolean"},
                tabs: AGENT_ITEMS_SCHEMA,
                recent: AGENT_ITEMS_SCHEMA,
                favorites: AGENT_ITEMS_SCHEMA,
            },
            required: ["activeId", "mobile", "tabs", "recent", "favorites"],
            additionalProperties: false,
        }),
    }),
    search: Object.freeze({
        name: "search-documents",
        title: "小驴速切搜索文档",
        description: "只读搜索思源文档；支持受限的笔记本、内容类型、搜索方式和结果排序筛选，并在需要时使用原生块搜索。结果只返回根文档摘要和定位信息。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                query: {type: "string", minLength: 1, maxLength: MAX_QUERY_LENGTH},
                notebook: {
                    type: "string",
                    minLength: 1,
                    maxLength: 64,
                    pattern: "^[A-Za-z0-9_-]{1,64}$",
                },
                limit: {type: "integer", minimum: 1, maximum: MAX_SEARCH_ITEMS},
                method: {type: "string", enum: SEARCH_METHODS},
                orderBy: {type: "string", enum: SEARCH_ORDERS},
                type: {type: "string", enum: SEARCH_TYPES},
                subType: {type: "string", enum: SEARCH_SUBTYPES},
            },
            required: ["query"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                query: {type: "string", maxLength: MAX_QUERY_LENGTH},
                count: {type: "integer", minimum: 0, maximum: MAX_SEARCH_ITEMS},
                items: AGENT_ITEMS_SCHEMA,
                source: {type: "string", enum: SEARCH_SOURCES},
                truncated: {type: "boolean"},
            },
            required: ["query", "count", "items", "source", "truncated"],
            additionalProperties: false,
        }),
    }),
});

const READ_ONLY_EFFECTS = Object.freeze({
    localRead: true,
    localWrite: false,
    dataEgress: false,
    externalCost: false,
});

function registerReadOnlyAgentCapabilities(host, definitions, onError = (_error, _spec) => {}) {
    if (!host || typeof host.addAgentCapability !== "function") return [];
    const registered = [];
    (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
        if (!definition?.spec || typeof definition.handler !== "function") return;
        try {
            registered.push(host.addAgentCapability({
                ...definition.spec,
                effects: READ_ONLY_EFFECTS,
                handler: definition.handler,
            }));
        } catch (error) {
            onError(error, definition.spec);
        }
    });
    return registered;
}

module.exports = {
    MAX_QUERY_LENGTH,
    MAX_NOTEBOOK_LENGTH,
    MAX_ITEMS,
    MAX_SEARCH_ITEMS,
    AGENT_ITEM_SCHEMA,
    READ_ONLY_EFFECTS,
    normalizeAgentQuery,
    normalizeAgentNotebook,
    normalizeAgentLimit,
    normalizeAgentSearchMethod,
    normalizeAgentSearchOrder,
    normalizeAgentSearchType,
    normalizeAgentSearchSubType,
    normalizeAgentRootId,
    limitAgentItems,
    buildAgentNavigationResult,
    buildAgentSearchResult,
    AGENT_CAPABILITY_SPECS,
    registerReadOnlyAgentCapabilities,
};
