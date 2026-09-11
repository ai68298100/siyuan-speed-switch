"use strict";

// Agent-facing helpers stay independent from the SiYuan DOM.  The host owns
// capability policy and lifecycle; this module only bounds input/output and
// describes the read-only contract shared by desktop and mobile.

const MAX_QUERY_LENGTH = 200;
const MAX_NOTEBOOK_LENGTH = 64;
const MAX_ITEMS = 32;
const MAX_SEARCH_ITEMS = 32;
const MAX_OUTLINE_ITEMS = 48;
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
    homeWidgets: Object.freeze({
        name: "home-widget-snapshot",
        title: "小驴速切组件面板数据",
        description: "只读获取组件面板中任一已注册组件的有界数据快照（如今日待办、本月日记、最近打开、标签、第三方插件组件）。不会修改笔记或页签。",
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
            },
            required: ["moduleId"],
            additionalProperties: false,
        }),
        outputSchema: Object.freeze({
            type: "object",
            properties: {
                moduleId: {type: "string", maxLength: 64},
                title: {type: "string", maxLength: 64},
                status: {type: "string", maxLength: 32},
                items: {
                    type: "array",
                    maxItems: 24,
                    items: {
                        type: "object",
                        properties: {
                            label: {type: "string", maxLength: 256},
                            value: {type: "string", maxLength: 256},
                        },
                        required: ["label"],
                        additionalProperties: false,
                    },
                },
            },
            required: ["moduleId", "items"],
            additionalProperties: false,
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
    const pattern = /^((?:[\s>]*)(?:[*+-]|\d+\.) \[)([ xX])(\].*)$/s;
    const match = pattern.exec(source);
    if (!match) return "";
    const target = done ? "x" : " ";
    if (match[2] === target) return "";
    return source.slice(0, match.index) + match[1] + target + match[3] + source.slice(match.index + match[0].length);
}


// 笔记本 ID 校验（与思源笔记本 ID 同格式：14 位时间戳-后缀）
function normalizeAgentNotebookId(value) {
    const id = asText(value, 64);
    return /^\d{14}-[0-9a-z]+$/i.test(id) ? id : "";
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
    normalizeAgentNotebook,
    normalizeAgentLimit,
    normalizeAgentSearchMethod,
    normalizeAgentSearchOrder,
    normalizeAgentSearchType,
    normalizeAgentSearchSubType,
    normalizeAgentRootId,
    normalizeAgentNotebookId,
    sanitizeJournalAppend,
    flipTaskMarkdown,
    flattenOutline,
    normalizeAgentDocumentId,
    registerAgentActionCapability,
    limitAgentItems,
    buildAgentNavigationResult,
    buildAgentSearchResult,
    AGENT_CAPABILITY_SPECS,
    registerReadOnlyAgentCapabilities,
};
