'use strict';

// T-7335 Raycast 式次级动作画板模型：纯领域模型，零 DOM/网络依赖。
// 文案回退与 i18n 完整交由调用方在 actions 渲染前注入（见 src/i18n/*.json），
// 模型本体不内嵌回退字符串，以控制 zip 体积。

const ACTION_MAX_QUERY_LENGTH = 64;
const ACTION_MAX_RESULTS = 24;

const ACTION_SECTION_MAP = Object.freeze({
    OPEN: "open",
    COPY: "copy",
    MANAGE: "manage",
});

/**
 * 从不同类型的原始切换器条目中统一提取标准化动作上下文。
 * @param {object} item 原始数据对象（Tab 卡片、文档结果、收藏、历史、文档集）
 * @returns {object} 标准化动作上下文
 */
function extractActionContext(item) {
    if (!item || typeof item !== "object") {
        return {
            kind: "unknown",
            rootId: "",
            blockId: "",
            title: "",
            path: "",
            hPath: "",
            notebookId: "",
            isPinned: false,
            isFaved: false,
            setId: "",
            entryCount: 0,
        };
    }
    const kind = typeof item.kind === "string" && item.kind
        ? item.kind
        : (item.setId ? "doc-set" : (item.tab ? "tab" : "doc"));
    const rootId = String(item.rootId || item.root_id || item.id || item.docId || item.documentId || "");
    const blockId = String(item.blockId || item.block_id || "");
    const title = String(item.title || item.name || item.label || item.key || rootId || "Untitled");
    const path = String(item.path || item.rootPath || item.root_path || "");
    const hPath = String(item.hPath || item.path || "");
    const notebookId = String(item.notebookId || item.notebookID || item.box || "");
    return {
        kind,
        rootId,
        blockId,
        title,
        path,
        hPath,
        notebookId,
        isPinned: Boolean(item.isPinned || item.pinned),
        isFaved: Boolean(item.isFaved || item.faved || item.isFavorite),
        setId: String(item.setId || ""),
        entryCount: Number.isFinite(item.entryCount) ? Math.max(0, Math.floor(item.entryCount)) : 0,
    };
}

/**
 * 生成预设动作清单。
 * @param {object} i18n 多语言标签映射（可选）
 * @returns {Array<object>} 动作定义字典
 */
function getBuiltinActionDefinitions(i18n) {
    const t = i18n && typeof i18n === "object" ? i18n : {};
    const ALL_PLATFORMS = ["desktop", "mobile", "sidebar"];
    const DESKTOP_ONLY = ["desktop"];
    const ALL_KINDS = ["tab", "doc", "favorite", "closed"];
    const s = ACTION_SECTION_MAP;
    const lk = (k) => {
        const keyWithPrefix = "actionPalette" + k.charAt(0).toUpperCase() + k.slice(1);
        return t[keyWithPrefix] || t[k] || k;
    };
    return [
        {id: "open-active", section: s.OPEN, label: lk("openActive"), icon: "iconFile", shortcut: "↵", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "open-right", section: s.OPEN, label: lk("openRight"), icon: "iconLayoutRight", shortcut: "⌘↵", supportedKinds: ALL_KINDS, platforms: DESKTOP_ONLY},
        {id: "open-bottom", section: s.OPEN, label: lk("openBottom"), icon: "iconLayoutBottom", shortcut: "⌥↵", supportedKinds: ALL_KINDS, platforms: DESKTOP_ONLY},
        {id: "open-preview", section: s.OPEN, label: lk("openPreview"), icon: "iconEye", shortcut: "⇧↵", supportedKinds: ["doc", "favorite", "closed"], platforms: DESKTOP_ONLY},
        {id: "open-in-reader", section: s.OPEN, label: lk("openInReader"), icon: "iconBook", shortcut: "⌥R", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "open-in-media", section: s.OPEN, label: lk("openInMedia"), icon: "iconVideo", shortcut: "⌥V", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "restore-doc-set", section: s.OPEN, label: lk("restoreDocSet"), icon: "iconHistory", shortcut: "↵", supportedKinds: ["doc-set"], platforms: ALL_PLATFORMS},
        {id: "copy-block-link", section: s.COPY, label: lk("copyBlockLink"), icon: "iconLink", shortcut: "⌘C", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "copy-markdown-link", section: s.COPY, label: lk("copyMarkdownLink"), icon: "iconRef", shortcut: "⌘⇧C", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "copy-id", section: s.COPY, label: lk("copyId"), icon: "iconCopy", shortcut: "⌥C", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "copy-path", section: s.COPY, label: lk("copyPath"), icon: "iconFolder", shortcut: "⌃C", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "save-as-doc-set", section: s.MANAGE, label: lk("saveAsDocSet"), icon: "iconFolder", shortcut: "⌘⇧S", supportedKinds: ["tab", "doc"], platforms: ALL_PLATFORMS},
        {id: "undo-closed-tab", section: s.MANAGE, label: lk("undoClosedTab"), icon: "iconHistory", shortcut: "⌘⇧T", supportedKinds: ALL_KINDS, platforms: ALL_PLATFORMS},
        {id: "toggle-pin", section: s.MANAGE, label: (ctx) => lk(ctx.isPinned ? "unpinTab" : "pinTab"), icon: (ctx) => ctx.isPinned ? "iconUnpin" : "iconPin", shortcut: "⌘P", supportedKinds: ["tab"], platforms: ALL_PLATFORMS},
        {id: "toggle-fav", section: s.MANAGE, label: (ctx) => lk(ctx.isFaved ? "unfavoriteTab" : "favoriteTab"), icon: "iconStar", shortcut: "⌘D", supportedKinds: ["tab", "doc", "closed"], platforms: ALL_PLATFORMS},
        {id: "close-tab", section: s.MANAGE, label: lk("closeTab"), icon: "iconClose", shortcut: "⌘W", supportedKinds: ["tab"], platforms: ALL_PLATFORMS, isDestructive: true},
    ];
}

/**
 * 根据条目上下文与当前运行端侧，筛选当前可用的动作列表。
 */
function getAvailableActions(context, options = {}) {
    const safeCtx = context && typeof context === "object" ? context : extractActionContext(null);
    const platform = typeof options.platform === "string" && options.platform ? options.platform : "desktop";
    const i18n = options.i18n && typeof options.i18n === "object" ? options.i18n : {};
    const builtinDefs = getBuiltinActionDefinitions(i18n);
    const customDefs = Array.isArray(options.customActions) ? options.customActions : [];
    const allDefs = builtinDefs.concat(customDefs);

    const available = [];
    for (const def of allDefs) {
        if (!def || typeof def !== "object" || !def.id) continue;
        if (Array.isArray(def.supportedKinds) && def.supportedKinds.indexOf(safeCtx.kind) === -1) continue;
        if (Array.isArray(def.platforms) && def.platforms.indexOf(platform) === -1) continue;
        available.push({
            id: def.id,
            section: def.section || ACTION_SECTION_MAP.MANAGE,
            label: typeof def.label === "function" ? def.label(safeCtx) : String(def.label || def.id),
            icon: typeof def.icon === "function" ? def.icon(safeCtx) : String(def.icon || "iconFile"),
            shortcut: String(def.shortcut || ""),
            isDestructive: Boolean(def.isDestructive),
        });
    }
    return available;
}

/**
 * 在动作画板内针对输入的查询过滤动作项（支持标签、ID、快捷键匹配）。
 */
function filterPaletteActions(actions, query, options = {}) {
    if (!Array.isArray(actions)) return [];
    const rawNeedle = typeof query === "string" ? query.trim().toLowerCase() : "";
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.floor(options.limit), ACTION_MAX_RESULTS)
        : ACTION_MAX_RESULTS;

    if (!rawNeedle) {
        return actions.slice(0, limit);
    }

    const needle = rawNeedle.slice(0, ACTION_MAX_QUERY_LENGTH);
    const scored = [];
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (!action || typeof action !== "object") continue;
        const label = String(action.label || "").toLowerCase();
        const id = String(action.id || "").toLowerCase();
        const shortcut = String(action.shortcut || "").toLowerCase();

        let score = 0;
        if (label === needle || id === needle) score = 100;
        else if (label.startsWith(needle) || id.startsWith(needle)) score = 60;
        else if (label.indexOf(needle) >= 0 || id.indexOf(needle) >= 0) score = 30;
        else if (shortcut && shortcut.indexOf(needle) >= 0) score = 10;
        if (score > 0) scored.push({action, score, index: i});
    }
    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    return scored.slice(0, limit).map((item) => item.action);
}

/**
 * 构造统一格式的操作执行回执。
 */
function createActionExecutionReceipt(actionId, context, success, message) {
    const safeCtx = context && typeof context === "object" ? context : extractActionContext(null);
    return {
        actionId: String(actionId || "unknown"),
        kind: safeCtx.kind,
        targetId: safeCtx.blockId || safeCtx.rootId || safeCtx.setId || "",
        title: safeCtx.title,
        success: Boolean(success),
        message: typeof message === "string" ? message : "",
        timestamp: Date.now(),
    };
}

module.exports = {
    ACTION_SECTIONS: ACTION_SECTION_MAP,
    ACTION_MAX_QUERY_LENGTH,
    ACTION_MAX_RESULTS,
    extractActionContext,
    getBuiltinActionDefinitions,
    getAvailableActions,
    filterPaletteActions,
    createActionExecutionReceipt,
};
