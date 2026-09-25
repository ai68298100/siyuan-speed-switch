"use strict";

const {normalizeFloatingBallConfig} = require("./floating-ball-model.js");

/**
 * Normalize persisted settings independently from DOM and plugin instances.
 * `options` supplies range and enum validators so this module remains a small
 * serializable boundary that can also be reused by migration tooling.
 */
// ==================== T-6796 皮肤注册表（白名单） ====================
// fusion = 跟随思源主题（默认，无覆盖）；其余为 _10-skins.scss 中定义的
// 独立皮肤 id。新增皮肤必须：①加入白名单 ②在 _10-skins.scss 提供变量与
// 质感层 ③i18n 三键（名称/描述）④对比度采样过 WCAG AA。

const SKIN_IDS = ["fusion", "apple", "midnight", "paper"];

// T-6810：Essentials rootId 形态校验（14 位时间戳 + '-' + 字母数字），去重、限 10 条
const ESSENTIAL_ID_RE = /^\d{14}-[0-9a-z]+$/i;
function normalizeEssentials(value, max = 10) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const items = [];
    for (const raw of value) {
        if (items.length >= max) break;
        if (typeof raw !== "string" || !ESSENTIAL_ID_RE.test(raw) || seen.has(raw)) continue;
        seen.add(raw);
        items.push(raw);
    }
    return items;
}

function normalizeSkin(value) {
    return SKIN_IDS.includes(value) ? value : "fusion";
}

// T-6851：组件商店视图状态清洗——密度/视图模式白名单、排序白名单、折叠分组
// 名称有界（≤32 条、每条 ≤48 字符、去重）。只保留有值字段，空对象=无状态。
function normalizeHomeStoreState(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const cleaned = {};
    if (raw.density === "compact" || raw.density === "comfortable") cleaned.density = raw.density;
    if (raw.viewMode === "grid" || raw.viewMode === "list") cleaned.viewMode = raw.viewMode;
    if (typeof raw.sort === "string" && ["relevance", "title", "status", "category"].includes(raw.sort)) {
        cleaned.sort = raw.sort;
    }
    const collapsedGroups = [];
    if (Array.isArray(raw.collapsedGroups)) {
        for (const name of raw.collapsedGroups) {
            if (collapsedGroups.length >= 32) break;
            if (typeof name !== "string") continue;
            const bounded = name.trim().slice(0, 48);
            if (bounded && !collapsedGroups.includes(bounded)) collapsedGroups.push(bounded);
        }
    }
    if (collapsedGroups.length > 0) cleaned.collapsedGroups = collapsedGroups;
    return cleaned;
}

function normalizeSettings(saved, options = {}) {    const defaults = options.defaults && typeof options.defaults === "object" ? options.defaults : {};
    const source = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    const clamp = typeof options.clamp === "function" ? options.clamp : (value, _min, _max, fallback) => value ?? fallback;
    const normalizeEnum = typeof options.normalizeEnum === "function" ? options.normalizeEnum : (value, _allowed, fallback) => value ?? fallback;
    const ranges = options.ranges || {};
    const range = (key) => ranges[key] || [0, Number.MAX_SAFE_INTEGER];
    const bool = (key) => typeof source[key] === "boolean" ? source[key] : Boolean(defaults[key]);
    const string = (key) => typeof source[key] === "string" ? source[key] : (defaults[key] || "");
    const display = (key) => {
        const value = source[key];
        return value === "full" || value === "icons" || value === "hidden" ? value : (defaults[key] || "full");
    };
    const quickActions = typeof options.quickActions === "function"
        ? options.quickActions(source.quickActions)
        : (Array.isArray(source.quickActions) ? source.quickActions : (defaults.quickActions || []));
    // T-6804 标签智能分组（与 favorite-actions.js 的清洗规则保持一致）
    const smartGroups = [];    if (Array.isArray(source.favoriteSmartGroups)) {
        for (const raw of source.favoriteSmartGroups) {
            if (smartGroups.length >= 4) break;
            if (!raw || typeof raw !== "object") continue;
            const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 24) : "";
            const tag = typeof raw.tag === "string" ? raw.tag.trim().replace(/['\\%_]/g, "").slice(0, 32) : "";
            if (!name || !tag || smartGroups.some((item) => item.name === name)) continue;
            smartGroups.push({name, tag});
        }
    }
    // T-6827 保存的搜索：有界（16 条），名称/查询有界、笔记本 ID 形态校验，
    // 同 id 或同（名称+查询）去重。
    const savedSearches = [];
    if (Array.isArray(source.savedSearches)) {
        for (const raw of source.savedSearches) {
            if (savedSearches.length >= 16) break;
            if (!raw || typeof raw !== "object") continue;
            const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 64) : "";
            const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
            const query = typeof raw.query === "string" ? raw.query.trim().slice(0, 120) : "";
            const notebook = typeof raw.notebook === "string" ? raw.notebook.trim().slice(0, 64) : "";
            if (!id || !name || !query) continue;
            if (savedSearches.some((item) => item.id === id
                || (item.name === name && item.query === query))) continue;
            savedSearches.push(notebook ? {id, name, query, notebook} : {id, name, query});
        }
    }
    // T-6757: keep the new spatial entry configuration inside the existing
    // settings object.  The legacy fabEnabled flag is passed only as a
    // migration hint; once a versioned floatingBall.mobile value exists it
    // remains authoritative.
    const floatingBall = normalizeFloatingBallConfig(source.floatingBall, {
        legacyFabEnabled: source.fabEnabled,
    });
    const excludedDocks = Array.isArray(source.excludedDocks)
        ? source.excludedDocks.filter((value) => typeof value === "string")
        : [];
    // Panel size mode. Data saved before the mode existed only carried the
    // boolean `fullscreen`; honor it instead of silently dropping those users
    // back into the adaptive default.
    const panelSizeMode = source.panelSizeMode === "adaptive" || source.panelSizeMode === "custom"
        || source.panelSizeMode === "fullscreen"
        ? source.panelSizeMode
        : (source.panelSizeMode === undefined && source.fullscreen === true ? "fullscreen" : (defaults.panelSizeMode || "adaptive"));
    const groupBy = source.groupBy === "none" || source.groupBy === "notebook"
        || source.groupBy === "favorites" || source.groupBy === "createdMonth"
        ? source.groupBy
        : (defaults.groupBy || "notebook");
    const homePalette = source.homePalette === "auto" || source.homePalette === "soft" || source.homePalette === "mono"
        ? source.homePalette
        : (defaults.homePalette || "auto");
    return {
        dialogWidth: clamp(source.dialogWidth, ...range("dialogWidth"), defaults.dialogWidth),
        dialogHeight: clamp(source.dialogHeight, ...range("dialogHeight"), defaults.dialogHeight),
        panelSizeMode,
        homeSizeMode: source.homeSizeMode === "follow" || source.homeSizeMode === "adaptive"
            || source.homeSizeMode === "custom" || source.homeSizeMode === "fullscreen"
            ? source.homeSizeMode
            : (defaults.homeSizeMode || "follow"),
        homeWidth: clamp(source.homeWidth, ...range("homeWidth"), defaults.homeWidth || 960),
        homeHeight: clamp(source.homeHeight, ...range("homeHeight"), defaults.homeHeight || 720),
        homePalette,
        panelScale: clamp(source.panelScale, ...range("panelScale"), defaults.panelScale),
        groupBy,
        columns: clamp(source.columns, ...range("columns"), defaults.columns),
        thumbHeight: clamp(source.thumbHeight, ...range("thumbHeight"), defaults.thumbHeight),
        sortBy: normalizeEnum(source.sortBy, options.sortBy || [], defaults.sortBy),
        excludedDocks,
        dockDisplay: normalizeEnum(source.dockDisplay, options.dockDisplay || [], defaults.dockDisplay),
        sidebarLayout: normalizeEnum(source.sidebarLayout, options.sidebarLayout || [], defaults.sidebarLayout),
        fullscreen: panelSizeMode === "fullscreen",
        // Keep the legacy field as a read-compatible projection of the
        // versioned mobile entry.  This prevents old and new settings views
        // from rendering opposite switch states after a partial migration.
        fabEnabled: floatingBall.enabled.mobile,
        floatingBall,
        agentActionsEnabled: bool("agentActionsEnabled"),
        // T-6800 文档集工作区切换：自动保存默认开启；当前集 id 有界（setId 形态）
        documentSetsAutoSave: source.documentSetsAutoSave === undefined ? true : source.documentSetsAutoSave === true,
        documentSetsCurrentId: typeof source.documentSetsCurrentId === "string"
            ? source.documentSetsCurrentId.trim().slice(0, 64) : "",
        // T-6804 标签智能分组：有界（4 组），标签名剔除 LIKE 通配/引号字符
        favoriteSmartGroups: smartGroups,
        // T-6827 保存的搜索：有界（16 条）
        savedSearches,
        // T-6796 皮肤：白名单外的值一律回落融合主题
        skin: normalizeSkin(source.skin),
        // T-6805 拼音辅助匹配：默认开启；关闭后标题匹配只走子串
        pinyinMatch: source.pinyinMatch === undefined ? true : source.pinyinMatch === true,
        // T-6823 密度档位：comfortable（默认现状）| compact（紧凑），白名单外回落
        density: source.density === "compact" ? "compact" : "comfortable",
        // T-6851 组件商店视图状态跨会话记忆（密度/视图模式/排序/折叠分组，均有界；
        // 空对象=无状态，各字段缺省时商店 UI 走自己的默认值）
        homeStore: normalizeHomeStoreState(source.homeStore),
        // T-6830 打开策略：开启后搜索结果命中已开页签时聚焦而非新开（防重复页签），默认关
        reuseOpenTabs: source.reuseOpenTabs === undefined ? false : source.reuseOpenTabs === true,
        // T-6883 页签卡更新时间徽标：开启后在卡片上显示最后编辑时刻/日期，默认关
        showCardUpdatedBadge: source.showCardUpdatedBadge === undefined ? false : source.showCardUpdatedBadge === true,
        // T-6810 Essentials 常驻层：跨文档集自动打开的必需文档 rootId（≤10，形态校验）
        documentSetEssentials: normalizeEssentials(source.documentSetEssentials),
        mobileColumns: clamp(source.mobileColumns, ...range("mobileColumns"), defaults.mobileColumns),
        mobileThumbHeight: clamp(source.mobileThumbHeight, ...range("mobileThumbHeight"), defaults.mobileThumbHeight),
        journalNotebook: string("journalNotebook"),
        lastSettingsTab: string("lastSettingsTab"),
        quickActions,
        quickActionsRightRail: bool("quickActionsRightRail"),
        quickActionsDisplayDesktop: display("quickActionsDisplayDesktop"),
        quickActionsDisplaySidebar: display("quickActionsDisplaySidebar"),
        quickActionsDisplayMobile: display("quickActionsDisplayMobile"),
        quickActionsCollapsedDesktopBottom: bool("quickActionsCollapsedDesktopBottom"),
        quickActionsCollapsedDesktopRight: bool("quickActionsCollapsedDesktopRight"),
        quickActionsCollapsedSidebar: bool("quickActionsCollapsedSidebar"),
        quickActionsCollapsedMobile: bool("quickActionsCollapsedMobile"),
    };
}

/**
 * Resolve the on-screen pixel size of a desktop panel dialog.
 * - fullscreen: fill the viewport.
 * - adaptive: a percentage (panelScale) of the current viewport, clamped to a
 *   small-floor so short windows still keep a usable panel.
 * - custom: the user's fixed pixel values (already range-clamped upstream).
 * Viewport values are injected by the caller so this stays pure and testable.
 */
function resolvePanelSize(settings, viewport) {
    const vpWidth = Math.max(0, Number(viewport?.width) || 0);
    const vpHeight = Math.max(0, Number(viewport?.height) || 0);
    // A small floor keeps the panel usable when the viewport is unknown
    // (headless/test callers) or very small; callers pass their own floor.
    const minWidth = Math.max(320, Number(viewport?.minWidth) || 0);
    const minHeight = Math.max(320, Number(viewport?.minHeight) || 0);
    const mode = settings?.panelSizeMode || "adaptive";
    if (mode === "fullscreen") {
        return {width: vpWidth, height: vpHeight};
    }
    if (mode === "custom") {
        return {width: Math.round(Number(settings?.dialogWidth) || 0), height: Math.round(Number(settings?.dialogHeight) || 0)};
    }
    const scale = Math.min(1, Math.max(0, (Number(settings?.panelScale) || 100) / 100));
    const width = Math.max(minWidth, Math.round(vpWidth * scale));
    const height = Math.max(minHeight, Math.round(vpHeight * scale));
    return {
        width: vpWidth > 0 ? Math.min(width, vpWidth) : width,
        height: vpHeight > 0 ? Math.min(height, vpHeight) : height,
    };
}

// T-6463 存储用量透明化：字节数的人读格式（B/KB/MB，1 位小数去尾零）。
function formatStorageBytes(bytes) {
    const value = Math.max(0, Math.round(Number(bytes)));
    if (!Number.isFinite(value)) return "0 B";
    if (value < 1024) return `${value} B`;
    const kb = value / 1024;
    if (kb < 1024) return `${Math.round(kb * 10) / 10} KB`;
    return `${Math.round(kb / 1024 * 10) / 10} MB`;
}

// 条目净化（丢弃非法/负值）、按占用降序、合计。entries = [{key, bytes}]。
function buildStorageUsageSummary(entries) {
    const rows = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && typeof entry.key === "string" && entry.key.trim() !== ""
            && Number.isFinite(Number(entry.bytes)) && Number(entry.bytes) >= 0)
        .map((entry) => ({key: entry.key.trim().slice(0, 96), bytes: Math.round(Number(entry.bytes))}))
        .sort((a, b) => b.bytes - a.bytes);
    const total = rows.reduce((sum, row) => sum + row.bytes, 0);
    return {rows, total};
}

module.exports = {normalizeSettings, resolvePanelSize, formatStorageBytes, buildStorageUsageSummary, normalizeSkin, normalizeEssentials, SKIN_IDS};
