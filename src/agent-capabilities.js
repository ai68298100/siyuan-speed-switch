"use strict";

// Agent-facing helpers stay independent from the SiYuan DOM.  The host owns
// capability policy and lifecycle; this module only bounds input/output and
// describes the read-only contract shared by desktop and mobile.

const MAX_QUERY_LENGTH = 200;
const MAX_NOTEBOOK_LENGTH = 64;
const MAX_ITEMS = 32;
const MAX_SEARCH_ITEMS = 32;
const MAX_OUTLINE_ITEMS = 48;
const MAX_AGENT_PATHS = 8;
const MAX_AGENT_PATH_LENGTH = 1024;
const MAX_DIAGNOSTICS = 32;
const MAX_TEXT_LENGTH = 256;
const MAX_SNIPPET_LENGTH = 600;
const ITEM_SOURCES = Object.freeze(["tabs", "recent", "closed", "favorite", "title", "opened", "global"]);
const SEARCH_SOURCES = Object.freeze(["tabs", "title", "global", "tabs+title", "tabs+global"]);
const SEARCH_METHODS = Object.freeze(["keyword", "query", "regexp"]);
const SEARCH_ORDERS = Object.freeze(["relevanceDesc", "updatedDesc", "createdDesc", "content"]);
const SEARCH_TYPES = Object.freeze(["document", "heading", "paragraph", "codeBlock"]);
const SEARCH_SUBTYPES = Object.freeze(["h1", "h2", "h3", "h4", "h5", "h6", "o", "u", "t"]);
const HOME_DIAGNOSTIC_TYPES = Object.freeze(["backoff", "cache", "empty", "timeout", "aborted", "failed"]);
const HOME_DIAGNOSTIC_DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const HOME_CONFIG_FIELD_TYPES = Object.freeze(["text", "number", "select", "notebook"]);
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

function normalizeAgentFailureReason(error, deadlineExpired = false) {
    if (deadlineExpired === true) return "timeout";
    const source = error && typeof error === "object" ? error : {};
    const name = String(source.name || "").toLowerCase();
    const code = String(source.code || "").toLowerCase();
    const message = String(source.message || error || "").toLowerCase();
    if (name === "aborterror" || code === "abort_err" || message.includes("aborted") || message.includes("cancelled") || message.includes("canceled")) return "cancelled";
    if (name === "timeouterror" || code === "timeout" || message.includes("timeout") || message.includes("timed out")) return "timeout";
    return "failed";
}

function buildAgentHomeDiagnostics(items, limit = 16, windowMinutes = 60, now = Date.now()) {
    const normalizedLimit = normalizeAgentLimit(limit, 16);
    const minutes = Math.min(1440, Math.max(1, Number.parseInt(String(windowMinutes), 10) || 60));
    const currentTime = Number.isFinite(now) && now > 0 ? Math.floor(now) : Date.now();
    const since = Math.max(1, currentTime - minutes * 60000);
    const diagnostics = [];
    const source = Array.isArray(items) ? items.slice(-MAX_DIAGNOSTICS * 2) : [];
    source.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const moduleId = asText(item.moduleId, 64);
        const device = asText(item.device, 16);
        const at = Number(item.at);
        if (!/^[A-Za-z0-9._:-]{1,64}$/.test(moduleId)
            || !HOME_DIAGNOSTIC_DEVICES.includes(device)
            || !Number.isFinite(at) || at < since || at > currentTime) return;
        const rawType = asText(item.type, 24);
        diagnostics.push({
            type: HOME_DIAGNOSTIC_TYPES.includes(rawType) ? rawType : "failed",
            moduleId,
            device,
            at: Math.floor(at),
        });
    });
    const byType = Object.fromEntries(HOME_DIAGNOSTIC_TYPES.map((type) => [type, 0]));
    const byDevice = Object.fromEntries(HOME_DIAGNOSTIC_DEVICES.map((device) => [device, 0]));
    diagnostics.forEach((item) => {
        byType[item.type] += 1;
        byDevice[item.device] += 1;
    });
    const completed = byType.cache + byType.empty;
    const failures = diagnostics.length - completed;
    return {
        diagnostics: diagnostics.slice(-normalizedLimit),
        summary: {total: diagnostics.length, windowMinutes: minutes, byType, byDevice, cacheHits: byType.cache, completed, failures},
    };
}

function normalizeAgentWidgetConfigFields(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 8).map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const key = asText(raw.key, 32);
        const type = HOME_CONFIG_FIELD_TYPES.includes(raw.type) ? raw.type : "";
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key) || !type) return null;
        const field = {key, label: asText(raw.label, 32) || key, type};
        if (type === "number") {
            const min = Number.isFinite(raw.min) ? Math.min(1000000, Math.max(-1000000, Math.trunc(raw.min))) : 0;
            const max = Number.isFinite(raw.max) ? Math.min(1000000, Math.max(-1000000, Math.trunc(raw.max))) : 100;
            field.min = Math.min(min, max);
            field.max = Math.max(min, max);
            if (Number.isFinite(raw.defaults)) field.defaultValue = Math.min(field.max, Math.max(field.min, Math.trunc(raw.defaults)));
        } else if (type === "select") {
            field.options = [...new Set((Array.isArray(raw.options) ? raw.options : []).map((item) => asText(item, 32)).filter(Boolean))].slice(0, 12);
            if (!field.options.length) return null;
            const selected = asText(raw.defaults, 32);
            field.defaultValue = field.options.includes(selected) ? selected : field.options[0];
        } else if (type === "text") {
            field.defaultValue = asText(raw.defaults, 128);
        }
        return field;
    }).filter(Boolean);
}

function normalizeAgentWidgetConfig(value, schema) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = {};
    normalizeAgentWidgetConfigFields(schema).forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(source, field.key)) return;
        if (field.type === "number") {
            const number = Number(source[field.key]);
            if (Number.isFinite(number)) result[field.key] = Math.min(field.max, Math.max(field.min, Math.trunc(number)));
        } else if (field.type === "notebook") {
            const notebook = normalizeAgentNotebookId(source[field.key]);
            if (notebook) result[field.key] = notebook;
        } else if (field.type === "select") {
            const selected = asText(source[field.key], 32);
            if (field.options.includes(selected)) result[field.key] = selected;
        } else {
            result[field.key] = asText(source[field.key], 512);
        }
    });
    return result;
}

function buildAgentWidgetSnapshot(moduleId, title, value, options = {}) {
    const source = value && typeof value === "object" ? value : {};
    const snapshot = source.snapshot && typeof source.snapshot === "object" ? source.snapshot : {};
    const settings = options && typeof options === "object" ? options : {};
    const device = HOME_DIAGNOSTIC_DEVICES.includes(settings.device) ? settings.device : "desktop";
    const limit = Math.min(24, normalizeAgentLimit(settings.limit, 12));
    const rawItems = (Array.isArray(snapshot.items) ? snapshot.items : []).slice(0, 24);
    const normalizedItems = rawItems.map((item) => {
        if (!item || typeof item !== "object") return null;
        const label = asText(item.label, 256);
        if (!label) return null;
        const entry = {label, value: asText(item.value, 256)};
        if (item.secondary !== undefined) entry.secondary = asText(item.secondary, 32);
        if (Number.isFinite(item.count) && item.count >= 0) entry.count = Math.min(9999, Math.trunc(item.count));
        if (typeof item.done === "boolean") entry.done = item.done;
        return entry;
    }).filter(Boolean);
    const total = normalizedItems.length;
    const offset = Math.min(total, Math.min(MAX_ITEMS * 2, Math.max(0, Number.parseInt(String(settings.offset), 10) || 0)));
    const items = normalizedItems.slice(offset, offset + limit);
    const appliedConfig = {};
    const rawConfig = settings.config && typeof settings.config === "object" && !Array.isArray(settings.config) ? settings.config : {};
    Object.keys(rawConfig).slice(0, 8).forEach((key) => {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key)) return;
        const value = rawConfig[key];
        if (typeof value === "string") appliedConfig[key] = asText(value, 512);
        else if (typeof value === "boolean") appliedConfig[key] = value;
        else if (Number.isFinite(value)) appliedConfig[key] = Math.min(1000000, Math.max(-1000000, Math.trunc(value)));
    });
    const status = source.ok ? "ok" : asText(source.reason, 32) || "unavailable";
    const content = {
        moduleId: asText(moduleId, 64),
        title: asText(title, 64),
        status,
        retryable: !source.ok && ["backoff", "timeout", "failed"].includes(status),
        device,
        cached: source.cached === true,
        updatedAt: Number.isFinite(snapshot.updatedAt) ? Math.min(9999999999999, Math.max(0, Math.trunc(snapshot.updatedAt))) : 0,
        items,
        total,
        offset,
        truncated: offset + items.length < total,
        appliedConfig,
    };
    const stat = snapshot.stat && typeof snapshot.stat === "object" ? snapshot.stat : null;
    const statValue = stat ? asText(stat.value, 32) : "";
    if (statValue) {
        content.stat = {
            value: statValue,
            label: asText(stat.label, 32),
            progress: Number.isFinite(stat.progress) ? Math.min(100, Math.max(0, stat.progress)) : null,
        };
        const arc = stat.arc && typeof stat.arc === "object" ? stat.arc : null;
        const max = arc && Number.isFinite(arc.max) ? Math.min(1000000, Math.max(0, arc.max)) : 0;
        const value = arc && Number.isFinite(arc.value) ? Math.min(max, Math.max(0, arc.value)) : -1;
        if (max > 0 && value >= 0) content.stat.arc = {value, max};
    }
    return content;
}

function buildAgentWidgetCatalog(items, options = {}) {
    const source = options && typeof options === "object" ? options : {};
    const device = HOME_DIAGNOSTIC_DEVICES.includes(source.device) ? source.device : "desktop";
    const readOnly = typeof source.readOnly === "boolean" ? source.readOnly : null;
    const requestedSource = ["builtin", "external"].includes(source.source) ? source.source : null;
    const limit = Math.min(24, normalizeAgentLimit(source.limit, 24));
    const requestedOffset = Math.min(MAX_ITEMS * 2, Math.max(0, Number.parseInt(String(source.offset), 10) || 0));
    const rawItems = Array.isArray(items) ? items : [];
    const eligible = [];
    const seen = new Set();
    rawItems.slice(0, MAX_ITEMS * 2).forEach((item) => {
        if (!item || typeof item !== "object") return;
        const moduleId = asText(item.moduleId, 64);
        if (!/^[A-Za-z0-9._:-]{1,64}$/.test(moduleId) || seen.has(moduleId)) return;
        seen.add(moduleId);
        const supportedDevices = HOME_DIAGNOSTIC_DEVICES.filter((value) => item.supportedDevices?.includes?.(value));
        const itemReadOnly = item.readOnly !== false;
        const itemSource = item.category === "siyuan" ? "builtin" : "external";
        if (!supportedDevices.includes(device)
            || (readOnly !== null && itemReadOnly !== readOnly)
            || (requestedSource !== null && itemSource !== requestedSource)) return;
        eligible.push({
            moduleId,
            title: asText(item.title, 64) || moduleId,
            description: asText(item.description, 256),
            sizes: (Array.isArray(item.sizes) ? item.sizes : []).map((size) => asText(size, 32)).filter(Boolean).slice(0, 8),
            supportedDevices,
            readOnly: itemReadOnly,
            source: itemSource,
            configFields: normalizeAgentWidgetConfigFields(item.configSchema),
        });
    });
    const offset = Math.min(requestedOffset, eligible.length);
    const widgets = eligible.slice(offset, offset + limit);
    return {
        widgets,
        total: eligible.length,
        offset,
        truncated: rawItems.length > MAX_ITEMS * 2 || offset + widgets.length < eligible.length,
    };
}

function normalizeAgentNotebook(value) {
    const notebook = asText(value, MAX_NOTEBOOK_LENGTH);
    return /^[A-Za-z0-9_-]{1,64}$/.test(notebook) ? notebook : "";
}

function normalizeAgentSearchPaths(value) {
    if (!Array.isArray(value)) return [];
    const paths = [];
    const seen = new Set();
    value.slice(0, MAX_AGENT_PATHS).forEach((entry) => {
        const path = asText(entry, MAX_AGENT_PATH_LENGTH).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        if (!path || seen.has(path)) return;
        const parts = path.split("/");
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(parts[0])) return;
        if (parts.some((part) => !part || part === "." || part === "..")) return;
        if (/['"`;]|--|\/\*|\*\//.test(path)) return;
        seen.add(path);
        paths.push(path);
    });
    return paths;
}

function normalizeAgentLimit(value, fallback = 12) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(MAX_ITEMS, Math.max(1, parsed));
}

function normalizeAgentSearchOffset(value, total = MAX_SEARCH_ITEMS) {
    const parsed = Number.parseInt(String(value), 10);
    const upper = Math.min(MAX_SEARCH_ITEMS * 2, Math.max(0, Number.parseInt(String(total), 10) || 0));
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(upper, Math.max(0, parsed));
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

function excludeAgentItems(items, excluded) {
    const blocked = excluded instanceof Set ? excluded : new Set();
    return (Array.isArray(items) ? items : []).filter((item) => {
        const key = item?.rootId || item?.id || item?.title;
        return key && !blocked.has(key);
    });
}

function buildAgentNavigationResult(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const limit = normalizeAgentLimit(source.limit, 12);
    const tabs = limitAgentItems(source.tabs, limit);
    const openRoots = new Set(tabs.map((item) => item.rootId || item.id).filter(Boolean));
    return {
        activeId: asText(source.activeId, 128),
        mobile: source.mobile === true,
        tabs,
        recent: limitAgentItems(source.recent, limit),
        closed: limitAgentItems(excludeAgentItems(source.closed, openRoots), limit),
        favorites: limitAgentItems(source.favorites, limit),
    };
}

// 工作区上下文（ROADMAP 第三层）：把设备端、活动文档、页签、文档集、
// 快捷入口与今日日记状态收敛为有界的只读快照。未知字段一律降级为空值。
function buildAgentWorkspaceContext(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const limit = normalizeAgentLimit(source.limit, 12);
    const active = source.activeDocument && typeof source.activeDocument === "object" ? source.activeDocument : {};
    const docSets = Array.isArray(source.documentSets) ? source.documentSets : [];
    const actions = Array.isArray(source.quickActions) ? source.quickActions : [];
    const journal = source.todayJournal && typeof source.todayJournal === "object" ? source.todayJournal : {};
    const openTabs = limitAgentItems(source.openTabs, limit);
    const openRoots = new Set(openTabs.map((item) => item.rootId || item.id).filter(Boolean));
    return {
        device: source.device === "mobile" ? "mobile" : "desktop",
        activeDocument: {id: asText(active.id, 64), title: asText(active.title, 256)},
        openTabs,
        closedTabs: limitAgentItems(excludeAgentItems(source.closedTabs, openRoots), limit),
        documentSets: docSets.slice(0, 8)
            .map((set) => ({
                name: asText(set?.name, 128),
                count: Number.isFinite(set?.count) ? Math.max(0, Math.trunc(set.count)) : 0,
            }))
            .filter((set) => set.name),
        quickActions: actions.slice(0, 16)
            .map((action) => ({label: asText(action?.label, 80), kind: asText(action?.kind, 16)}))
            .filter((action) => action.label),
        todayJournal: {
            configured: journal.configured === true,
            docId: asText(journal.docId, 64),
        },
    };
}

function buildAgentSearchResult(query, items, extra = {}) {
    const normalizedQuery = normalizeAgentQuery(query);
    const source = extra && typeof extra === "object" ? extra : {};
    const limit = normalizeAgentLimit(source.limit, 12);
    const allItems = limitAgentItems(items, MAX_SEARCH_ITEMS);
    const offset = normalizeAgentSearchOffset(source.offset, allItems.length);
    const limitedItems = allItems.slice(offset, offset + limit);
    return {
        query: normalizedQuery,
        count: limitedItems.length,
        items: limitedItems,
        source: SEARCH_SOURCES.includes(source.source) ? source.source : "tabs",
        total: allItems.length,
        offset,
        truncated: source.truncated === true || (Array.isArray(items) && items.length > MAX_SEARCH_ITEMS)
            || offset + limitedItems.length < allItems.length,
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
    appendToJournal: Object.freeze({
        name: "append-to-journal",
        title: "小驴速切追加今日日记",
        description: "受控写操作：向今天的日记文档末尾追加一条内容（今日日记不存在时自动创建，日记笔记本取自插件设置）。执行前会弹窗请求用户确认，用户拒绝或超时则不执行。仅在日记末尾追加，不改写已有内容。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                content: {type: "string", minLength: 1, maxLength: 512},
            },
            required: ["content"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                ok: {type: "boolean"},
                docId: {type: "string", maxLength: 64},
            },
            required: ["ok", "docId"],
            additionalProperties: false,
        }),
    }),
    createDocument: Object.freeze({
        name: "create-document",
        title: "小驴速切新建文档",
        description: "受控写操作：在指定笔记本下新建一篇文档（可带初始内容）。执行前会弹窗请求用户确认，用户拒绝或超时则不执行。仅创建新文档，不修改既有内容。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                notebook: {
                    type: "string",
                    minLength: 1,
                    maxLength: 64,
                },
                title: {type: "string", minLength: 1, maxLength: 128},
                markdown: {type: "string", maxLength: 4096},
            },
            required: ["notebook", "title"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                ok: {type: "boolean"},
                notebook: {type: "string", maxLength: 64},
                title: {type: "string", maxLength: 128},
                docId: {type: "string", maxLength: 64},
            },
            required: ["ok", "notebook", "title"],
            additionalProperties: false,
        }),
    }),
    updateTask: Object.freeze({
        name: "update-task-status",
        title: "小驴速切换换任务状态",
        description: "受控写操作：切换指定任务块的完成状态（勾选/取消勾选）。执行前会弹窗请求用户确认，用户拒绝或超时则不执行。仅修改该任务块的勾选标记，不改写任务文本。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                id: {
                    type: "string",
                    minLength: 1,
                    maxLength: 64,
                    pattern: "^[0-9]{14}-[0-9a-z]+$",
                },
                done: {type: "boolean"},
            },
            required: ["id", "done"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                ok: {type: "boolean"},
                id: {type: "string", maxLength: 64},
                done: {type: "boolean"},
            },
            required: ["ok", "id", "done"],
            additionalProperties: false,
        }),
    }),
    openDocument: Object.freeze({
        name: "open-document",
        title: "小驴速切打开文档",
        description: "受控导航动作：在思源界面打开指定文档并定位（只切换页签，不修改任何笔记内容）。用于把查询结果变成可直达的页面。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                id: {
                    type: "string",
                    minLength: 1,
                    maxLength: 64,
                    pattern: "^[0-9]{14}-[0-9a-z]+$",
                },
            },
            required: ["id"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                ok: {type: "boolean"},
                id: {type: "string", maxLength: 64},
            },
            required: ["ok", "id"],
            additionalProperties: false,
        }),
    }),
    openDocuments: Object.freeze({
        name: "open-documents",
        title: "小驴速切批量打开文档",
        description: "受控导航动作：一次打开最多 5 篇文档组成工作区（只切换页签，不修改任何笔记内容）。执行前列出全部文档弹窗请求用户确认，拒绝或超时则不打开。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                ids: {
                    type: "array",
                    minItems: 1,
                    maxItems: 5,
                    items: {
                        type: "string",
                        minLength: 1,
                        maxLength: 64,
                        pattern: "^[0-9]{14}-[0-9a-z]+$",
                    },
                },
            },
            required: ["ids"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                ok: {type: "boolean"},
                opened: {type: "array", maxItems: 5, items: {type: "string", maxLength: 64}},
                failed: {type: "array", maxItems: 5, items: {type: "string", maxLength: 64}},
            },
            required: ["ok", "opened"],
            additionalProperties: false,
        }),
    }),
    homeWidgets: Object.freeze({
        name: "home-widget-snapshot",
        title: "小驴速切组件面板数据",
        description: "只读获取组件面板中任一已注册组件的有界数据快照（如今日待办、本月日记、最近打开、标签、第三方插件组件），或省略 moduleId 发现当前可查询组件。不会修改笔记或页签。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                moduleId: {
                    type: "string",
                    minLength: 1,
                    maxLength: 64,
                    pattern: "^[A-Za-z0-9._:-]{1,64}$",
                },
                limit: {type: "integer", minimum: 1, maximum: 24},
                offset: {type: "integer", minimum: 0, maximum: MAX_ITEMS * 2},
                config: {
                    type: "object",
                    maxProperties: 16,
                    additionalProperties: {
                        anyOf: [
                            {type: "string", maxLength: 512},
                            {type: "number"},
                            {type: "boolean"},
                        ],
                    },
                },
                device: {type: "string", enum: HOME_DIAGNOSTIC_DEVICES},
                readOnly: {type: "boolean"},
                source: {type: "string", enum: ["builtin", "external"]},
                refresh: {type: "boolean"},
            },
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            anyOf: [
                {
                    type: "object",
                    properties: {
                        moduleId: {type: "string", maxLength: 64, pattern: "^[A-Za-z0-9._:-]{1,64}$"},
                        title: {type: "string", maxLength: 64},
                        status: {type: "string", maxLength: 32},
                        retryable: {type: "boolean"},
                        device: {type: "string", enum: HOME_DIAGNOSTIC_DEVICES},
                        cached: {type: "boolean"},
                        updatedAt: {type: "integer", minimum: 0, maximum: 9999999999999},
                        total: {type: "integer", minimum: 0, maximum: 24},
                        offset: {type: "integer", minimum: 0, maximum: 24},
                        truncated: {type: "boolean"},
                        appliedConfig: {
                            type: "object",
                            maxProperties: 8,
                            additionalProperties: {
                                anyOf: [
                                    {type: "string", maxLength: 512},
                                    {type: "integer", minimum: -1000000, maximum: 1000000},
                                    {type: "boolean"},
                                ],
                            },
                        },
                        stat: {
                            type: "object",
                            properties: {
                                value: {type: "string", maxLength: 32},
                                label: {type: "string", maxLength: 32},
                                progress: {anyOf: [{type: "number", minimum: 0, maximum: 100}, {type: "null"}]},
                                arc: {
                                    type: "object",
                                    properties: {
                                        value: {type: "number", minimum: 0, maximum: 1000000},
                                        max: {type: "number", exclusiveMinimum: 0, maximum: 1000000},
                                    },
                                    required: ["value", "max"],
                                    additionalProperties: false,
                                },
                            },
                            required: ["value", "label", "progress"],
                            additionalProperties: false,
                        },
                        items: {
                            type: "array",
                            maxItems: 24,
                            items: {
                                type: "object",
                                properties: {
                                    label: {type: "string", maxLength: 256},
                                    value: {type: "string", maxLength: 256},
                                    secondary: {type: "string", maxLength: 32},
                                    count: {type: "integer", minimum: 0, maximum: 9999},
                                    done: {type: "boolean"},
                                },
                                required: ["label"],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["moduleId", "items", "device", "retryable", "cached", "updatedAt", "total", "offset", "truncated", "appliedConfig"],
                    additionalProperties: false,
                },
                {
                    type: "object",
                    properties: {
                        widgets: {
                            type: "array",
                            maxItems: 24,
                            items: {
                                type: "object",
                                properties: {
                                    moduleId: {type: "string", maxLength: 64, pattern: "^[A-Za-z0-9._:-]{1,64}$"},
                                    title: {type: "string", maxLength: 64},
                                    description: {type: "string", maxLength: 256},
                                    sizes: {
                                        type: "array",
                                        maxItems: 8,
                                        items: {type: "string", maxLength: 32},
                                    },
                                    supportedDevices: {
                                        type: "array",
                                        maxItems: 3,
                                        items: {type: "string", enum: HOME_DIAGNOSTIC_DEVICES},
                                    },
                                    readOnly: {type: "boolean"},
                                    source: {type: "string", enum: ["builtin", "external"]},
                                    configFields: {
                                        type: "array",
                                        maxItems: 8,
                                        items: {
                                            type: "object",
                                            properties: {
                                                key: {type: "string", maxLength: 32, pattern: "^[A-Za-z][A-Za-z0-9_-]{0,31}$"},
                                                label: {type: "string", maxLength: 32},
                                                type: {type: "string", enum: HOME_CONFIG_FIELD_TYPES},
                                                min: {type: "integer", minimum: -1000000, maximum: 1000000},
                                                max: {type: "integer", minimum: -1000000, maximum: 1000000},
                                                defaultValue: {anyOf: [{type: "string", maxLength: 128}, {type: "integer", minimum: -1000000, maximum: 1000000}]},
                                                options: {type: "array", maxItems: 12, items: {type: "string", maxLength: 32}},
                                            },
                                            required: ["key", "label", "type"],
                                            additionalProperties: false,
                                        },
                                    },
                                },
                                required: ["moduleId", "title", "description", "sizes", "supportedDevices", "readOnly", "source", "configFields"],
                                additionalProperties: false,
                            },
                        },
                        total: {type: "integer", minimum: 0, maximum: MAX_ITEMS * 2},
                        offset: {type: "integer", minimum: 0, maximum: MAX_ITEMS * 2},
                        truncated: {type: "boolean"},
                    },
                    required: ["widgets", "total", "offset", "truncated"],
                    additionalProperties: false,
                },
            ],
        }),
    }),
    outline: Object.freeze({
        name: "get-document-outline",
        title: "小驴速切文档大纲",
        description: "只读获取指定文档的标题大纲（标题文本与层级）。可与「打开文档」配合，按标题块 ID 定位到具体章节。不会修改笔记。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                id: {
                    type: "string",
                    minLength: 1,
                    maxLength: 64,
                    pattern: "^[0-9]{14}-[0-9a-z]+$",
                },
                limit: {type: "integer", minimum: 1, maximum: MAX_OUTLINE_ITEMS},
            },
            required: ["id"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                id: {type: "string", maxLength: 64},
                headings: {
                    type: "array",
                    maxItems: MAX_OUTLINE_ITEMS,
                    items: {
                        type: "object",
                        properties: {
                            id: {type: "string", maxLength: 64},
                            title: {type: "string", maxLength: 200},
                            depth: {type: "integer", minimum: 0, maximum: 8},
                        },
                        required: ["id", "title"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["id", "headings"],
            additionalProperties: false,
        }),
    }),
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
                closed: AGENT_ITEMS_SCHEMA,
                favorites: AGENT_ITEMS_SCHEMA,
            },
            required: ["activeId", "mobile", "tabs", "recent", "closed", "favorites"],
            additionalProperties: false,
        }),
    }),
    workspaceContext: Object.freeze({
        name: "workspace-context",
        title: "小驴速切工作区上下文",
        description: "只读汇总当前工作区：设备端、活动文档、打开页签、文档集清单、快捷入口与今日日记状态。供 Agent 一次调用了解用户当前工作环境，不修改任何内容、不创建文档。",
        inputSchema: Object.freeze({
            type: "object",
            properties: {limit: {type: "integer", minimum: 1, maximum: MAX_ITEMS}},
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                device: {type: "string", enum: ["desktop", "mobile"]},
                activeDocument: Object.freeze({
                    type: "object",
                    properties: {
                        id: {type: "string", maxLength: 64},
                        title: {type: "string", maxLength: 256},
                    },
                    additionalProperties: false,
                }),
                openTabs: AGENT_ITEMS_SCHEMA,
                closedTabs: AGENT_ITEMS_SCHEMA,
                documentSets: Object.freeze({
                    type: "array",
                    maxItems: 8,
                    items: Object.freeze({
                        type: "object",
                        properties: {
                            name: {type: "string", maxLength: 128},
                            count: {type: "integer", minimum: 0},
                        },
                        required: ["name", "count"],
                        additionalProperties: false,
                    }),
                }),
                quickActions: Object.freeze({
                    type: "array",
                    maxItems: 16,
                    items: Object.freeze({
                        type: "object",
                        properties: {
                            label: {type: "string", maxLength: 80},
                            kind: {type: "string", maxLength: 16},
                        },
                        required: ["label", "kind"],
                        additionalProperties: false,
                    }),
                }),
                todayJournal: Object.freeze({
                    type: "object",
                    properties: {
                        configured: {type: "boolean"},
                        docId: {type: "string", maxLength: 64},
                    },
                    required: ["configured", "docId"],
                    additionalProperties: false,
                }),
            },
            required: ["device", "activeDocument", "openTabs", "closedTabs", "documentSets", "quickActions", "todayJournal"],
            additionalProperties: false,
        }),
    }),
    homeDiagnostics: Object.freeze({
        name: "home-adapter-diagnostics",
        title: "灏忛┐閫熺粍浠惰瘖鏂憳瑕?",
        description: "鍙杩斿洖缁勪欢閫傞厤鍣ㄧ殑鏈€杩戞垚鍔熴€佺紦瀛樸€佽秴鏃跺拰澶辫触鐘舵€侊紝涓嶅寘鍚紓甯稿璞°€佹晱鎰熸枃鏈垨璇锋眰鍐呭銆?",
        inputSchema: Object.freeze({
            type: "object",
            properties: {
                limit: {type: "integer", minimum: 1, maximum: MAX_DIAGNOSTICS},
                windowMinutes: {type: "integer", minimum: 1, maximum: 1440},
            },
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                diagnostics: Object.freeze({
                    type: "array",
                    maxItems: MAX_DIAGNOSTICS,
                    items: Object.freeze({
                        type: "object",
                        properties: {
                            type: {type: "string", maxLength: 24},
                            moduleId: {type: "string", maxLength: 64},
                            device: {type: "string", enum: HOME_DIAGNOSTIC_DEVICES},
                            at: {type: "integer", minimum: 1},
                        },
                        required: ["type", "moduleId", "device", "at"],
                        additionalProperties: false,
                    }),
                }),
                summary: Object.freeze({
                    type: "object",
                    properties: {
                        total: {type: "integer", minimum: 0, maximum: MAX_DIAGNOSTICS},
                        windowMinutes: {type: "integer", minimum: 1, maximum: 1440},
                        byType: {
                            type: "object",
                            properties: Object.fromEntries(HOME_DIAGNOSTIC_TYPES.map((type) => [type, {type: "integer", minimum: 0, maximum: MAX_DIAGNOSTICS}])),
                            required: HOME_DIAGNOSTIC_TYPES,
                            additionalProperties: false,
                        },
                        byDevice: {
                            type: "object",
                            properties: Object.fromEntries(HOME_DIAGNOSTIC_DEVICES.map((device) => [device, {type: "integer", minimum: 0, maximum: MAX_DIAGNOSTICS}])),
                            required: HOME_DIAGNOSTIC_DEVICES,
                            additionalProperties: false,
                        },
                        cacheHits: {type: "integer", minimum: 0, maximum: MAX_DIAGNOSTICS},
                        completed: {type: "integer", minimum: 0, maximum: MAX_DIAGNOSTICS},
                        failures: {type: "integer", minimum: 0, maximum: MAX_DIAGNOSTICS},
                    },
                    required: ["total", "windowMinutes", "byType", "byDevice", "cacheHits", "completed", "failures"],
                    additionalProperties: false,
                }),
            },
            required: ["diagnostics", "summary"],
            additionalProperties: false,
        }),
    }),
    search: Object.freeze({
        name: "search-documents",
        title: "小驴速切搜索文档",
        description: "只读搜索思源文档；支持受限的笔记本、路径、内容类型、搜索方式和结果排序筛选，并在需要时使用原生块搜索。结果只返回根文档摘要和定位信息。",
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
                paths: {
                    type: "array",
                    maxItems: MAX_AGENT_PATHS,
                    items: {type: "string", minLength: 1, maxLength: MAX_AGENT_PATH_LENGTH},
                },
                limit: {type: "integer", minimum: 1, maximum: MAX_SEARCH_ITEMS},
                offset: {type: "integer", minimum: 0, maximum: MAX_SEARCH_ITEMS * 2},
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
                total: {type: "integer", minimum: 0, maximum: MAX_SEARCH_ITEMS},
                offset: {type: "integer", minimum: 0, maximum: MAX_SEARCH_ITEMS * 2},
                truncated: {type: "boolean"},
            },
            required: ["query", "count", "items", "source", "total", "offset", "truncated"],
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


// 受控导航动作的文档 ID 校验：与块 ID 同格式（14 位时间戳-后缀）
function normalizeAgentDocumentId(value) {
    const id = asText(value, 64);
    return /^\d{14}-[0-9a-z]+$/i.test(id) ? id : "";
}

// 动作类能力注册器：effects 由定义如实给出（区别于只读注册器的 localRead:true）
function registerAgentActionCapability(host, definition, onError = (_error, _spec) => {}) {
    if (!host || typeof host.addAgentCapability !== "function" || !definition?.spec || typeof definition.handler !== "function") return null;
    try {
        return host.addAgentCapability({
            ...definition.spec,
            effects: definition.effects || {},
            handler: definition.handler,
        });
    } catch (error) {
        onError(error, definition.spec);
        return null;
    }
}


// 翻转任务块 markdown 的勾选标记：- [ ] ↔ - [x]（兼容 * + 列表符与缩进）；
// 非任务块（没有勾选框）返回空串，由调用方拒绝执行
function flipTaskMarkdown(markdown, done) {
    const source = typeof markdown === "string" ? markdown : "";
    // 用 String.prototype.match 而非 RegExp.prototype.exec（二者等价；
    // 避免 .exec( 字样触发的命令注入误报）
    const pattern = /^((?:[\s>]*)(?:[*+-]|\d+\.) \[)([ xX])(\].*)$/s;
    const match = source.match(pattern);
    if (!match) return "";
    const target = done ? "x" : " ";
    if (match[2] === target) return "";
    // 输出自净化：清控制字符并钳制 64KB，写回内核前不携带任何越界载荷
    return (source.slice(0, match.index) + match[1] + target + match[3] + source.slice(match.index + match[0].length))
        .replace(/\u0000/g, "")
        .slice(0, 65536);
}


// 笔记本 ID 校验（与思源笔记本 ID 同格式：14 位时间戳-后缀）
function normalizeAgentNotebookId(value) {
    const id = asText(value, 64);
    return /^\d{14}-[0-9a-z]+$/i.test(id) ? id : "";
}

function buildNotebookBoxScope(value, tableAlias = "") {
    const notebook = normalizeAgentNotebookId(value);
    const qualifier = tableAlias === "b" || tableAlias === "B" ? `${tableAlias}.` : "";
    return notebook ? ` AND ${qualifier}box='${notebook}'` : "";
}


// 批量文档 ID 清洗：仅保留合法 ID、去重保序、上限 5 篇；非法输入整体降级为空数组
function normalizeAgentDocumentIds(value, limit = 5) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const item of value) {
        if (out.length >= Math.max(1, limit)) break;
        const id = normalizeAgentDocumentId(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}


// 日记追加内容清洗：压平换行/制表、合并空白、限长 512；清洗后为空则拒绝
function sanitizeJournalAppend(value) {
    const raw = typeof value === "string" ? value : "";
    const cleaned = raw.replace(/[\r\n\t\u0000-\u001f]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return cleaned.slice(0, 512);
}

// 文档大纲扁平化：内核返回嵌套 Path（id/name/depth/blocks），按上限展平为有界列表。
// 只保留非空 id 与标题，depth 限制在 0–8，供 Agent 按标题块 ID 定位章节。
function flattenOutline(nodes, limit = MAX_OUTLINE_ITEMS, depth = 0, out = []) {
    if (!Array.isArray(nodes) || out.length >= limit) return out;
    for (const node of nodes) {
        if (out.length >= limit) break;
        if (!node || typeof node !== "object") continue;
        const id = asText(node.id, 64);
        const title = asText(node.name, 200);
        if (!id || !title) continue;
        const level = Number.isFinite(node.depth) ? node.depth : depth;
        out.push({id, title, depth: Math.min(8, Math.max(0, Math.trunc(level)))});
        flattenOutline(node.blocks || node.children, limit, depth + 1, out);
    }
    return out;
}

module.exports = {
    MAX_QUERY_LENGTH,
    MAX_NOTEBOOK_LENGTH,
    MAX_ITEMS,
    MAX_SEARCH_ITEMS,
    AGENT_ITEM_SCHEMA,
    READ_ONLY_EFFECTS,
    normalizeAgentQuery,
    normalizeAgentFailureReason,
    buildAgentHomeDiagnostics,
    buildAgentWidgetCatalog,
    normalizeAgentWidgetConfigFields,
    normalizeAgentWidgetConfig,
    buildAgentWidgetSnapshot,
    normalizeAgentNotebook,
    normalizeAgentSearchPaths,
    normalizeAgentLimit,
    normalizeAgentSearchOffset,
    normalizeAgentSearchMethod,
    normalizeAgentSearchOrder,
    normalizeAgentSearchType,
    normalizeAgentSearchSubType,
    normalizeAgentRootId,
    normalizeAgentNotebookId,
    buildNotebookBoxScope,
    sanitizeJournalAppend,
    flipTaskMarkdown,
    flattenOutline,
    normalizeAgentDocumentId,
    normalizeAgentDocumentIds,
    registerAgentActionCapability,
    limitAgentItems,
    buildAgentNavigationResult,
    buildAgentWorkspaceContext,
    buildAgentSearchResult,
    AGENT_CAPABILITY_SPECS,
    registerReadOnlyAgentCapabilities,
};
