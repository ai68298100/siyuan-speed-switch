'use strict';

// ==================== T-7342 深入穿透检索运行时编排模型 ====================
// 目标：将 T-7338 语法解析模型转译为确定的思源内核端点请求描述与响应聚合。
// 架构契约：
//   - 纯领域模型：零 DOM、零网络依赖、纯数据映射；
//   - 端点请求规划：输出结构化的 { endpoint, body, method, meta }，杜绝把未经转义的语法原样塞入内核；
//   - 防注入 SQL 生成：严格单引号转义、剔除危险字符（分号/注释）、强制 SELECT、固定 ORDER 与有界 LIMIT；
//   - 结果聚合归一化：将大纲节点树或 SQL 数据行统一映射为切换器展示项。

const {
    SEARCH_MODES,
    parsePenetrationQuery,
    filterOutlineHeadings,
    normalizePenetrationBlockResult,
} = require("./penetration-search-model.js");

const MAX_SQL_NEEDLE_LENGTH = 64;
const DEFAULT_BLOCK_LIMIT = 20;
const MAX_BLOCK_LIMIT = 40;
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;

/**
 * 安全转义 SQL 字符串字面量：单引号双写、剔除换行/制表符/分号/注释。
 *
 * @param {string} value 待转义的原始搜索词
 * @returns {string} 安全的 SQL 字面量内容（不包含外层单引号）
 */
function escapeSqlLiteral(value) {
    if (typeof value !== "string") return "";
    return value
        .slice(0, MAX_SQL_NEEDLE_LENGTH)
        .replace(/[\u0000-\u001f\u007f;]/g, " ")
        .replace(/--/g, "")
        .replace(/'/g, "''")
        .trim();
}

/**
 * 构造用于块级深入检索的安全只读 SQL 语句。
 *
 * @param {string} needle 块搜索关键词
 * @param {object} [options] 包含 notebookId, limit 等
 * @returns {string} 安全的 SELECT SQL 语句
 */
function buildBlockSearchSql(needle, options = {}) {
    const escaped = escapeSqlLiteral(needle);
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.floor(options.limit), MAX_BLOCK_LIMIT)
        : DEFAULT_BLOCK_LIMIT;

    const notebookFilter = options.notebookId && typeof options.notebookId === "string"
        ? ` AND box = '${escapeSqlLiteral(options.notebookId)}'`
        : "";

    // 仅检索正文块（排除纯根文档块 type='d'），按更新时间倒序排序
    return `SELECT id, root_id, content, type, sub_type, updated FROM blocks WHERE content LIKE '%${escaped}%' AND type NOT IN ('d')${notebookFilter} ORDER BY updated DESC LIMIT ${limit}`;
}

/**
 * 针对当前用户输入的搜索查询，规划对应的内核端点请求描述。
 *
 * @param {string} rawQuery 用户输入
 * @param {object} [context] 包含 activeDocId, activeDocTitle, notebookId
 * @param {object} [options] 额外配置（limit 等）
 * @returns {object} 结构化的请求计划
 */
function planPenetrationSearchRequest(rawQuery, context = {}, options = {}) {
    const parsed = parsePenetrationQuery(rawQuery);
    const safeCtx = context && typeof context === "object" ? context : {};

    // 1. 普通文档搜索模式
    if (parsed.mode === SEARCH_MODES.DOC) {
        return {
            mode: SEARCH_MODES.DOC,
            isPenetration: false,
            endpoint: "/api/filetree/searchDocs",
            body: {k: parsed.cleanKernelQuery},
            method: "doc",
            query: parsed.cleanKernelQuery,
        };
    }

    // 2. 块级深入检索模式（^关键词）
    if (parsed.mode === SEARCH_MODES.BLOCK) {
        if (!parsed.blockNeedle) {
            return {
                mode: SEARCH_MODES.BLOCK,
                isPenetration: true,
                empty: true,
                hint: "请输入块级搜索关键词",
            };
        }
        const sql = buildBlockSearchSql(parsed.blockNeedle, {
            ...options,
            notebookId: safeCtx.notebookId,
        });
        return {
            mode: SEARCH_MODES.BLOCK,
            isPenetration: true,
            endpoint: "/api/query/sql",
            body: {stmt: sql},
            method: "block",
            blockNeedle: parsed.blockNeedle,
        };
    }

    // 3. 大纲穿透模式（:标题 或 文档名:标题）
    if (parsed.mode === SEARCH_MODES.OUTLINE) {
        if (parsed.isCurrentDoc) {
            // 当前活动文档穿透
            const activeId = safeCtx.activeDocId && BLOCK_ID_RE.test(String(safeCtx.activeDocId))
                ? String(safeCtx.activeDocId)
                : "";
            if (!activeId) {
                return {
                    mode: SEARCH_MODES.OUTLINE,
                    isPenetration: true,
                    error: "no_active_doc",
                    hint: "请先在思源中打开或聚焦一篇文档",
                };
            }
            return {
                mode: SEARCH_MODES.OUTLINE,
                isPenetration: true,
                isCurrentDoc: true,
                endpoint: "/api/outline/getDocOutline",
                body: {id: activeId},
                method: "outline-current",
                headingNeedle: parsed.headingNeedle,
                activeDocId: activeId,
                activeDocTitle: String(safeCtx.activeDocTitle || "当前文档"),
            };
        }

        // 跨文档指定穿透（文档名:标题）：先解析匹配的文档
        return {
            mode: SEARCH_MODES.OUTLINE,
            isPenetration: true,
            isCurrentDoc: false,
            endpoint: "/api/filetree/searchDocs",
            body: {k: parsed.cleanKernelQuery},
            method: "outline-cross-doc",
            docNeedle: parsed.docNeedle,
            headingNeedle: parsed.headingNeedle,
        };
    }

    // 4. 标签检索模式（#标签）
    if (parsed.mode === SEARCH_MODES.TAG) {
        return {
            mode: SEARCH_MODES.TAG,
            isPenetration: true,
            endpoint: "/api/tag/getTag",
            body: {},
            method: "tag",
            tagNeedle: parsed.tagNeedle,
            badge: parsed.badge,
        };
    }

    // 5. 书签检索模式（!书签）
    if (parsed.mode === SEARCH_MODES.BOOKMARK) {
        return {
            mode: SEARCH_MODES.BOOKMARK,
            isPenetration: true,
            endpoint: "/api/bookmark/getBookmark",
            body: {},
            method: "bookmark",
            bookmarkNeedle: parsed.bookmarkNeedle,
            badge: parsed.badge,
        };
    }

    // 6. 命令模式（>命令）
    if (parsed.mode === SEARCH_MODES.COMMAND) {
        return {
            mode: SEARCH_MODES.COMMAND,
            isPenetration: true,
            method: "command",
            commandNeedle: parsed.commandNeedle,
            badge: parsed.badge,
            localOnly: true,
        };
    }

    // 兜底回退
    return {
        mode: SEARCH_MODES.DOC,
        isPenetration: false,
        endpoint: "/api/filetree/searchDocs",
        body: {k: parsed.cleanKernelQuery},
        method: "doc",
        query: parsed.cleanKernelQuery,
    };
}

/**
 * 递归展开思源内核大纲树节点（/api/outline/getDocOutline 返回的树结构）。
 *
 * @param {Array<object>} nodes 大纲树根节点数组
 * @param {number} [depth] 当前层级
 * @returns {Array<object>} 扁平化的标题节点列表 [{id, content, depth, subType}]
 */
function flattenOutlineTree(nodes, depth = 1) {
    if (!Array.isArray(nodes)) return [];
    const flattened = [];
    nodes.forEach((node) => {
        if (!node || typeof node !== "object") return;
        const id = String(node.id || node.blockId || "");
        const content = String(node.content || node.name || node.text || "");
        const currentDepth = Number.isFinite(node.depth) ? Number(node.depth) : depth;
        if (id && content) {
            flattened.push({
                id,
                content,
                depth: Math.min(6, Math.max(1, currentDepth)),
                subType: String(node.subType || `h${currentDepth}`),
            });
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
            flattened.push(...flattenOutlineTree(node.children, depth + 1));
        }
    });
    return flattened;
}

/**
 * 将内核返回的原始响应聚合为切换器可展示的标准条目结构。
 *
 * @param {object} plan planPenetrationSearchRequest 输出的计划对象
 * @param {object|Array} rawResponse 内核端点返回的原始响应 JSON
 * @param {object} [context] 包含 activeDocId, activeDocTitle 等
 * @returns {Array<object>} 归一化后的搜索条目列表
 */
function aggregatePenetrationResults(plan, rawResponse, context = {}) {
    if (!plan || !plan.isPenetration || !rawResponse) return [];
    const safeCtx = context && typeof context === "object" ? context : {};

    // 1. 大纲响应聚合
    if (plan.mode === SEARCH_MODES.OUTLINE) {
        // 思源 /api/outline/getDocOutline 返回数据在 data 字段中
        const tree = Array.isArray(rawResponse.data)
            ? rawResponse.data
            : (Array.isArray(rawResponse) ? rawResponse : []);
        const flattened = flattenOutlineTree(tree);
        const filtered = filterOutlineHeadings(flattened, plan.headingNeedle);

        return filtered.map((heading) => ({
            id: heading.id,
            rootId: String(plan.activeDocId || safeCtx.activeDocId || heading.id),
            blockId: heading.id,
            title: heading.content,
            subTitle: `${String(plan.activeDocTitle || safeCtx.activeDocTitle || "文档")} · H${heading.depth} 标题`,
            icon: "iconAlignLeft",
            kind: "heading",
            depth: heading.depth,
        }));
    }

    // 2. 块搜索响应聚合
    if (plan.mode === SEARCH_MODES.BLOCK) {
        // 思源 /api/query/sql 返回行数组在 data 字段中
        const rows = Array.isArray(rawResponse.data)
            ? rawResponse.data
            : (Array.isArray(rawResponse) ? rawResponse : []);

        const results = [];
        rows.forEach((row) => {
            const normalized = normalizePenetrationBlockResult(row, {
                rootId: safeCtx.activeDocId,
                title: safeCtx.activeDocTitle,
            });
            if (normalized) {
                results.push({
                    id: normalized.blockId,
                    rootId: normalized.rootId,
                    blockId: normalized.blockId,
                    title: normalized.content,
                    subTitle: normalized.docTitle ? `${normalized.docTitle} · 正文块` : "正文块",
                    icon: "iconParagraph",
                    kind: "block",
                    subType: normalized.subType,
                });
            }
        });
        return results;
    }

    // 3. 标签响应聚合（#标签）
    if (plan.mode === SEARCH_MODES.TAG) {
        const rawTags = Array.isArray(rawResponse.data)
            ? rawResponse.data
            : (Array.isArray(rawResponse) ? rawResponse : (rawResponse?.data ? [rawResponse.data] : []));
        const needle = (plan.tagNeedle || "").toLowerCase();
        const results = [];

        function extractTags(nodes) {
            if (!Array.isArray(nodes)) return;
            for (const item of nodes) {
                if (!item || typeof item !== "object") continue;
                const label = String(item.label || item.tag || item.name || item.title || "");
                const blockId = String(item.blockId || item.id || item.rootId || "");
                const count = Number(item.count || item.subFileCount || 1);
                if (label && (!needle || label.toLowerCase().includes(needle))) {
                    results.push({
                        id: blockId || `tag-${label}`,
                        rootId: String(item.rootId || blockId || ""),
                        blockId: blockId,
                        title: `#${label.replace(/^#/, "")}`,
                        subTitle: `标签 · ${count} 处引用`,
                        icon: "iconTag",
                        kind: "tag",
                        tag: label,
                    });
                }
                if (Array.isArray(item.children)) {
                    extractTags(item.children);
                }
            }
        }
        extractTags(rawTags);
        return results.slice(0, 30);
    }

    // 4. 书签响应聚合（!书签）
    if (plan.mode === SEARCH_MODES.BOOKMARK) {
        const rawBookmarks = Array.isArray(rawResponse.data)
            ? rawResponse.data
            : (Array.isArray(rawResponse) ? rawResponse : (rawResponse?.data ? [rawResponse.data] : []));
        const needle = (plan.bookmarkNeedle || "").toLowerCase();
        const results = [];

        function extractBookmarks(nodes) {
            if (!Array.isArray(nodes)) return;
            for (const item of nodes) {
                if (!item || typeof item !== "object") continue;
                const label = String(item.label || item.bookmark || item.name || item.title || "");
                const blockId = String(item.blockId || item.id || item.rootId || "");
                const count = Number(item.count || item.subFileCount || 1);
                if (label && (!needle || label.toLowerCase().includes(needle))) {
                    results.push({
                        id: blockId || `bookmark-${label}`,
                        rootId: String(item.rootId || blockId || ""),
                        blockId: blockId,
                        title: `!${label.replace(/^!/, "")}`,
                        subTitle: `书签 · ${count} 处标记`,
                        icon: "iconBookmark",
                        kind: "bookmark",
                        bookmark: label,
                    });
                }
                if (Array.isArray(item.children)) {
                    extractBookmarks(item.children);
                }
            }
        }
        extractBookmarks(rawBookmarks);
        return results.slice(0, 30);
    }

    return [];
}

module.exports = {
    MAX_SQL_NEEDLE_LENGTH,
    DEFAULT_BLOCK_LIMIT,
    MAX_BLOCK_LIMIT,
    escapeSqlLiteral,
    buildBlockSearchSql,
    planPenetrationSearchRequest,
    flattenOutlineTree,
    aggregatePenetrationResults,
};
