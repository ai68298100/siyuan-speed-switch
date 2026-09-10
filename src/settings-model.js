"use strict";

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
        panelScale: clamp(source.panelScale, ...range("panelScale"), defaults.panelScale),
        groupBy,
        columns: clamp(source.columns, ...range("columns"), defaults.columns),
        thumbHeight: clamp(source.thumbHeight, ...range("thumbHeight"), defaults.thumbHeight),
        sortBy: normalizeEnum(source.sortBy, options.sortBy || [], defaults.sortBy),
        excludedDocks,
        dockDisplay: normalizeEnum(source.dockDisplay, options.dockDisplay || [], defaults.dockDisplay),
        sidebarLayout: normalizeEnum(source.sidebarLayout, options.sidebarLayout || [], defaults.sidebarLayout),
        fullscreen: panelSizeMode === "fullscreen",
        fabEnabled: bool("fabEnabled"),
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

module.exports = {normalizeSettings, resolvePanelSize};
