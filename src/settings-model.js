"use strict";

const {normalizeFloatingBallConfig} = require("./floating-ball-model.js");

/**
 * Normalize persisted settings independently from DOM and plugin instances.
 * `options` supplies range and enum validators so this module remains a small
 * serializable boundary that can also be reused by migration tooling.
 */
function normalizeSettings(saved, options = {}) {
    const defaults = options.defaults && typeof options.defaults === "object" ? options.defaults : {};
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
    const smartGroups = [];
    if (Array.isArray(source.favoriteSmartGroups)) {
        for (const raw of source.favoriteSmartGroups) {
            if (smartGroups.length >= 4) break;
            if (!raw || typeof raw !== "object") continue;
            const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 24) : "";
            const tag = typeof raw.tag === "string" ? raw.tag.trim().replace(/['\\%_]/g, "").slice(0, 32) : "";
            if (!name || !tag || smartGroups.some((item) => item.name === name)) continue;
            smartGroups.push({name, tag});
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

module.exports = {normalizeSettings, resolvePanelSize, formatStorageBytes, buildStorageUsageSummary};
