'use strict';

// ==================== T-7338 Obsidian 风格深入穿透检索模型 ====================
// 目标：为搜索框提供大纲穿透（`:` 语法）与块级深入检索（`^` 语法）纯领域模型。
// 借鉴 Obsidian Quick Switcher++：
//   - `docName:heading`：检索并直达指定文档的特定层级标题；
//   - `:heading`：穿透当前活动文档的大纲标题；
//   - `^blockKeyword`：全局深入检索段落/列表/代码等正文块；
//   - 零 DOM、零网络依赖、纯语法解析与节点过滤状态机；
//   - 杜绝把自定义语法原样塞给内核端点（提供 cleanKernelQuery）。

const MAX_QUERY_LENGTH = 128;
const MAX_OUTLINE_RESULTS = 24;
const MAX_BLOCK_CONTENT_BYTES = 120;
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;

const SEARCH_MODES = Object.freeze({
    DOC: "doc",
    OUTLINE: "outline",
    BLOCK: "block",
});

function boundedText(value, max = 120) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/**
 * 解析用户输入的搜索查询，判定检索模式并提取多段关键字。
 *
 * 语法规则：
 * 1. 块级前缀：以 `^` 开头（如 `^重构架构`），判定为 block 模式；
 * 2. 大纲穿透：包含 `:` 且不属于 URL/引号内部（如 `周报:下周计划` 或 `:下周计划`），判定为 outline 模式；
 * 3. 普通模式：默认 doc 模式。
 *
 * @param {string} raw 用户原始输入
 * @returns {object} 解析后的结构化查询
 */
function parsePenetrationQuery(raw) {
    const text = typeof raw === "string" ? raw.trim().slice(0, MAX_QUERY_LENGTH) : "";
    if (!text) {
        return {
            mode: SEARCH_MODES.DOC,
            raw: "",
            docNeedle: "",
            headingNeedle: "",
            blockNeedle: "",
            cleanKernelQuery: "",
            isCurrentDoc: false,
        };
    }

    // 1. 块级前缀：以 `^` 开头
    if (text.startsWith("^")) {
        const needle = text.slice(1).trim();
        return {
            mode: SEARCH_MODES.BLOCK,
            raw: text,
            docNeedle: "",
            headingNeedle: "",
            blockNeedle: needle,
            cleanKernelQuery: needle,
            isCurrentDoc: false,
        };
    }

    // 2. 大纲穿透：以 `:` 分隔（忽略引号内部的冒号，如 `"http://example"`）
    const colonIndex = findOutlineColonIndex(text);
    if (colonIndex >= 0) {
        const docPart = text.slice(0, colonIndex).trim();
        const headingPart = text.slice(colonIndex + 1).trim();
        const isCurrentDoc = docPart === "";
        return {
            mode: SEARCH_MODES.OUTLINE,
            raw: text,
            docNeedle: docPart,
            headingNeedle: headingPart,
            blockNeedle: "",
            cleanKernelQuery: isCurrentDoc ? "" : docPart,
            isCurrentDoc,
        };
    }

    // 3. 默认文档模式
    return {
        mode: SEARCH_MODES.DOC,
        raw: text,
        docNeedle: text,
        headingNeedle: "",
        blockNeedle: "",
        cleanKernelQuery: text,
        isCurrentDoc: false,
    };
}

/**
 * 查找用作大纲穿透的冒号位置（忽略双引号内的冒号与普通 URL 协议头）。
 */
function findOutlineColonIndex(text) {
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === ":" && !inQuotes) {
            // 排除 URL 协议（如 http: 或 https: 或 file:）
            const prefix = text.slice(0, i).toLowerCase();
            if (prefix === "http" || prefix === "https" || prefix === "file" || prefix === "siyuan") {
                continue;
            }
            return i;
        }
    }
    return -1;
}

/**
 * 在给定大纲树或标题节点列表中，根据标题查询关键字过滤并排序。
 *
 * @param {Array<object>} headings 大纲标题节点数组 [{id, content, depth, subType}]
 * @param {string} needle 标题搜索关键词
 * @param {object} [options] 限制上限等参数
 * @returns {Array<object>} 过滤并排序后的标题列表
 */
function filterOutlineHeadings(headings, needle, options = {}) {
    if (!Array.isArray(headings)) return [];
    const rawQuery = typeof needle === "string" ? needle.trim().toLowerCase() : "";
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.floor(options.limit), MAX_OUTLINE_RESULTS)
        : MAX_OUTLINE_RESULTS;

    if (!rawQuery) {
        return headings.slice(0, limit);
    }

    const scored = [];
    headings.forEach((heading, index) => {
        if (!heading || typeof heading !== "object") return;
        const content = boundedText(heading.content || heading.name || heading.text || "", 120);
        const lower = content.toLowerCase();
        const depth = Number.isFinite(heading.depth) ? Math.min(6, Math.max(1, Math.floor(heading.depth))) : 1;

        let score = 0;
        if (lower === rawQuery) {
            score = 100;
        } else if (lower.startsWith(rawQuery)) {
            score = 60;
        } else if (lower.includes(rawQuery)) {
            score = 30;
        }

        if (score > 0) {
            // 层级加权：高层级标题（H1 > H2 > H3）优先展现
            const depthWeight = (7 - depth) * 2;
            scored.push({
                heading: {
                    id: String(heading.id || ""),
                    content,
                    depth,
                    subType: String(heading.subType || `h${depth}`),
                },
                score: score + depthWeight,
                index,
            });
        }
    });

    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    return scored.slice(0, limit).map((item) => item.heading);
}

/**
 * 结构化归一化块级检索结果条目。
 *
 * @param {object} rawBlock 思源内核返回的原始块对象
 * @param {object} [docScope] 所属文档上下文 { rootId, title, path }
 * @returns {object|null} 归一化后的块结果
 */
function normalizePenetrationBlockResult(rawBlock, docScope = {}) {
    if (!rawBlock || typeof rawBlock !== "object") return null;

    const blockId = String(rawBlock.id || rawBlock.block_id || rawBlock.rootID || "");
    if (!BLOCK_ID_RE.test(blockId)) return null;

    const rootId = String(rawBlock.root_id || rawBlock.rootId || docScope.rootId || blockId);
    const rawContent = String(rawBlock.content || rawBlock.markdown || rawBlock.text || "");
    // 清洗 Markdown/HTML 残留标记
    const content = boundedText(rawContent.replace(/<[^>]+>/g, "").replace(/[*_#`~]/g, ""), MAX_BLOCK_CONTENT_BYTES);
    const subType = boundedText(rawBlock.subType || rawBlock.type || "p", 32);
    const docTitle = boundedText(docScope.title || rawBlock.docTitle || rootId, 64);
    const docPath = boundedText(docScope.path || rawBlock.docPath || "", 120);

    return {
        blockId,
        rootId,
        content: content || "（空块）",
        subType,
        docTitle,
        docPath,
    };
}

module.exports = {
    SEARCH_MODES,
    MAX_QUERY_LENGTH,
    MAX_OUTLINE_RESULTS,
    MAX_BLOCK_CONTENT_BYTES,
    parsePenetrationQuery,
    findOutlineColonIndex,
    filterOutlineHeadings,
    normalizePenetrationBlockResult,
};
