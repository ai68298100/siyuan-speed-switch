"use strict";

// T-6869 统一平台 SurfaceContext（P1-c，ADR 0079）
// 平台外壳的路由上下文纯模型：表面 ID 白名单、跨表面上下文归一化、
// 悬浮球"恢复上次表面"的安全回退决策，以及 ContextBar 文案投影。
// 只做纯数据投影：不触碰 DOM、不持有会话状态；会话状态由宿主（index.ts）持有。

const PLATFORM_SURFACE_IDS = Object.freeze(["switcher", "workbench", "studio"]);
const DEFAULT_SURFACE = "switcher";

// 入口白名单：记录平台表面从哪里被打开（P3 跨表面对象/焦点恢复的元数据基础）。
const PLATFORM_SURFACE_ENTRIES = Object.freeze([
    "toolbar", "surface-nav", "fab", "back", "command", "breadcrumb", "external", "unknown",
]);

// 与 savedSearches 查询上限（120）一致；objectId 对齐文档集当前集 id 的清洗口径并放宽到 128。
const SURFACE_QUERY_MAX = 120;
const SURFACE_OBJECT_ID_MAX = 128;

function cleanSurfaceText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

/** 表面 ID 白名单校验：非法值回落 fallback（传空串可探测"完全非法"）。 */
function normalizeSurfaceId(value, fallback = DEFAULT_SURFACE) {
    return PLATFORM_SURFACE_IDS.includes(value) ? value : fallback;
}

/**
 * 归一化一次跨表面打开的上下文：entry 不在白名单时归 unknown，
 * objectId/query 有界清洗；没有任何有效字段时返回 null（调用方不必挂空上下文）。
 */
function normalizeSurfaceContext(input) {
    if (!input || typeof input !== "object") return null;
    const entry = PLATFORM_SURFACE_ENTRIES.includes(input.entry) ? input.entry : "unknown";
    const objectId = cleanSurfaceText(input.objectId, SURFACE_OBJECT_ID_MAX);
    const query = cleanSurfaceText(input.query, SURFACE_QUERY_MAX);
    if (entry === "unknown" && !objectId && !query) return null;
    return {entry, objectId, query};
}

/**
 * 悬浮球"恢复上次表面"的唯一决策点：上次表面仍在当前端可用清单内才恢复，
 * 否则回退 fallback（默认切换器）。覆盖两类失效：桌面开过片段实验室后到手机端、
 * 以及会话外的非法值——可用清单缺失时同样走切换器，不猜表面。
 */
function resolveSurfaceReturnTarget(lastSurface, available, fallback = DEFAULT_SURFACE) {
    const candidate = normalizeSurfaceId(lastSurface, "");
    if (!candidate) return fallback;
    const pool = Array.isArray(available) && available.length > 0 ? available : [fallback];
    return pool.includes(candidate) ? candidate : fallback;
}

/** ContextBar 文案投影：对象位恒为表面名；提示位有查询现场时显示查询，否则用表面固定提示。 */
function buildSurfaceContextCaption({surface, context, labels} = {}) {
    const safeSurface = normalizeSurfaceId(surface);
    const safeLabels = labels && typeof labels === "object" ? labels : {};
    const surfaceLabels = safeLabels.surfaces && typeof safeLabels.surfaces === "object" ? safeLabels.surfaces : {};
    const hintLabels = safeLabels.hints && typeof safeLabels.hints === "object" ? safeLabels.hints : {};
    const surfaceName = surfaceLabels[safeSurface];
    const object = typeof surfaceName === "string" && surfaceName ? surfaceName : safeSurface;
    const query = context && typeof context === "object" ? cleanSurfaceText(context.query, SURFACE_QUERY_MAX) : "";
    const surfaceHint = hintLabels[safeSurface];
    const hint = query || (typeof surfaceHint === "string" ? surfaceHint : "");
    return {object, hint, hasQuery: Boolean(query)};
}

// T-6878（P2 跨表面对象第一批，ADR 0079 §6）：统一对象种类白名单——
// 片段/内容/动作/工作现场/组件；未知种类不投影（诚实呈现，不猜种类）。
const PLATFORM_OBJECT_KINDS = Object.freeze(["content", "action", "workspace", "widget", "snippet"]);
const SNIPPET_OBJECT_MAX = 8;
const SNIPPET_ID_MAX = 64;
const SNIPPET_NAME_MAX = 120;

/**
 * 片段对象过滤与有界化：query 非空时按名称（大小写不敏感）与类型过滤，
 * id 去重、数量有界（默认 6，上限 8）；content 缺失时保留既有 lines（二次过滤
 * 已投影对象不丢行数）。非法条目一律跳过。
 */
function filterSnippetObjects(items, query, limit = 6) {
    const max = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), SNIPPET_OBJECT_MAX) : 6;
    const q = cleanSurfaceText(query, SURFACE_QUERY_MAX).toLowerCase();
    const out = [];
    for (const raw of Array.isArray(items) ? items : []) {
        if (out.length >= max) break;
        if (!raw || typeof raw !== "object") continue;
        const id = cleanSurfaceText(raw.id, SNIPPET_ID_MAX);
        const name = cleanSurfaceText(raw.name, SNIPPET_NAME_MAX);
        const type = raw.type === "js" ? "js" : raw.type === "css" ? "css" : "";
        if (!id || !name || !type) continue;
        if (q && !name.toLowerCase().includes(q) && !type.includes(q)) continue;
        if (out.some((existing) => existing.id === id)) continue;
        const content = typeof raw.content === "string" ? raw.content : "";
        const lines = content ? content.split("\n").length : (typeof raw.lines === "number" && Number.isFinite(raw.lines) ? Math.max(0, Math.floor(raw.lines)) : 0);
        out.push({id, name, type, enabled: raw.enabled === true, lines});
    }
    return out;
}

/**
 * 把 /api/snippet/getSnippet 的响应投影为有界的片段对象摘要（跨表面打开的目标）。
 * 只保留 id/name/type 合法且非空的条目（type 仅 css|js）；code !== 0 或载荷畸形
 * 返回 []——调用方按"无对象"处理，不抛错。
 */
function projectSnippetObjects(response, options = {}) {
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.floor(options.limit), SNIPPET_OBJECT_MAX)
        : 6;
    const safe = response && typeof response === "object" ? response : {};
    if (safe.code !== 0 || !safe.data || typeof safe.data !== "object") return [];
    const list = Array.isArray(safe.data.snippets) ? safe.data.snippets : [];
    return filterSnippetObjects(list, cleanSurfaceText(options.query, SURFACE_QUERY_MAX), limit);
}

module.exports = {
    PLATFORM_SURFACE_IDS,
    PLATFORM_SURFACE_ENTRIES,
    PLATFORM_OBJECT_KINDS,
    DEFAULT_SURFACE,
    SURFACE_QUERY_MAX,
    SURFACE_OBJECT_ID_MAX,
    normalizeSurfaceId,
    normalizeSurfaceContext,
    resolveSurfaceReturnTarget,
    buildSurfaceContextCaption,
    projectSnippetObjects,
    filterSnippetObjects,
};
