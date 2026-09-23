import {Plugin, Dialog, Menu, getFrontend, getAllTabs, getActiveTab, openTab, showMessage} from "siyuan";
import type {IMenu, TEventBus, TPluginDataChangeReason} from "siyuan";
import "./index.scss";
import {logger} from "./logger";
import {clampNum, stableSortBy, normalizeSortBy, sortItems as sortItemsUtil, sortGroupItems as sortGroupItemsUtil, resolveQuickActionSurfaceState, groupFavoritesByGroup, groupTabsByMode, resolveIconFallback, resolveIconReference, normalizeCustomIcon, isImageIconReference, normalizeQuickActionText, buildTabGroupsByParent, resolveTabRootId, resolveFavoriteRootId, planGroupOpenFavorites, sanitizeDocIds, normalizeSqlResult, capMru, sanitizeFavorites, sanitizeOpenHistory, sanitizeStringList, isSuccessfulMobileTabsResult, clampOversizedIcons, normalizeThumbCache, isGlobalShortcutHostReady, safeRegisterPluginCommand} from "./util";
import {createSearchSession, beginSearch, cacheSearchResult, disposeSearchSession} from "./search-session";
import {normalizeClosedEntries, buildRecentHistorySections, applyRecentEvent, removeRecentEntry, recordRecentOpen, formatChangedWindowStart, entryChangedWithin, computeScrollRatio, planScrollRestore} from "./recent-closed";
import {runStorageMigration, KEY_ORDER, STORAGE_SCHEMA_VERSION} from "./storage-migration";
import {aggregateSearchResults, buildFullTextSearchRequest, buildNativeSearchTabConfig, buildOpenedDocumentScope, buildOpenedDocumentSearchRequests, buildSearchCacheKey, buildUnifiedSections, buildNavigationResultModel, buildSearchHealthSnapshot, canUseTitleSearch, extractSearchRecords, filterSearchDocuments as filterNativeSearchDocuments, formatCleanQuery, isSemanticEmbeddingConfigured, matchesParsedQuery, matchesSearchDocumentFilters, normalizeSearchDocumentFilters, normalizeSearchResult, normalizeTitleSearchDocuments, parseSearchQuery, pinyinTitleHit, resolveSearchNotebookId} from "./search-model";
import {MAX_PATH_ITEMS, buildPathFilterListRequest, normalizePathFilterProbeOutcome} from "./path-filter-model";
import {buildPinnedDocsSnapshot, normalizePinnedDocsConfig, buildInboxSnapshot, normalizeInboxConfig, buildTodayReservationsSnapshot, normalizeTodayReservationsConfig, buildRecentUpdatesSnapshot, buildDataHealthSnapshot, buildHostRecentDocsSnapshot, buildDatabaseListSnapshot, normalizeDatabaseListConfig, buildSavedSearchesSnapshot, buildAvTableSnapshot, normalizeAvTableConfig, buildRandomReviewSnapshot, normalizeRandomReviewConfig, buildRecentEditsSnapshot, normalizeRecentEditsConfig, buildOutlineWidgetSnapshot, buildDocumentRelationsSnapshot, buildTagListSnapshot, buildBookmarkListSnapshot, buildClippedUnreadSnapshot, normalizeClippedUnreadConfig, buildOnThisDaySnapshot, normalizeOnThisDayConfig, buildRecentDailyNotesSnapshot, normalizeRecentDailyNotesConfig, buildJournalMonthlySnapshot, normalizeJournalMonthlyConfig, buildTodayTasksSnapshot, normalizeTodayTasksConfig, buildFlashcardDueSnapshot, normalizeFlashcardDueConfig, normalizeJournalCalendarConfig, normalizeNoteStatsConfig, buildNoteStatsSnapshot, normalizeTodayWritingConfig, buildTodayWritingSnapshot, normalizeRecentWritingActivityConfig, buildRecentWritingActivitySnapshot, normalizeWritingStreakConfig, buildWritingStreakSnapshot} from "./kernel-widget-model";
import {favoriteDocumentIdsForProbe, buildFavoritesWidgetSnapshot, buildDocumentSetsWidgetSnapshot, normalizeFixedDocumentConfig, buildFixedDocumentSnapshot} from "./document-widget-model";
import {
    sanitizeQuickActions,
    getDefaultQuickActions,
    getBuiltinQuickActions,
    getDefaultQuickActionTargets,
    resolveQuickActionSupport,
    getQuickActionCommandTargets,
    getGlobalQuickActions,
    shouldRenderQuickAction,
    appendQuickAction,
    migrateQuickActionDefaults,
    QUICK_ACTION_DEFAULTS_VERSION,
    createQuickActionRegistry,
} from "./quick-actions";
import {mountQuickActionPicker} from "./quick-actions-ui";
import {createHomeRuntime} from "./home-runtime";
import {buildHomeModuleView, renderHomeModuleView} from "./home-view";
import {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures, summarizeHomeRefreshFailures, selectHomeRefreshRetryEntries} from "./home-controller";
import {resolveWidgetCatalogState} from "./widget-catalog";
import {createHomePanelController} from "./home-panel";
import {normalizeHomeState, resolveMobileHomeSize} from "./home-model";
import {buildQuickCaptureAction, parseQuickCaptureAction, buildQuickCaptureInitialText, buildPluginCommandsSnapshot} from "./home-model";
import {registerExternalHomeAdapters} from "./home-external-adapters";
import {openHomeConfigForm} from "./home-config-form";
import {createDocSearchState} from "./doc-search-state";
import {
    appendDocResultsEmpty,
    appendDocResultsViewAll,
    appendDocSearchStatus,
    applySavedSearchFilters,
    bindDocSearchFilter,
    buildDocResultItem,
    collectOpenRootIds,
    disposeDocSearchSession,
    docSearchHitId,
    docSearchResultId,
    ensureDocResultsBox,
    filterDocSearchResults,
    getDocSearchFilterCount,
    getDocSearchFilterSummary,
    getDocSearchSession,
    hasDocSearchFilter,
    loadDocSearchPathChildren,
    openDocSearchResult,
    renderDocResults,
    runDocSearchFetch,
    runFullTextSearchFallback,
    runOpenedDocumentContentSearch,
    updateDocSearchHealth,
} from "./doc-search-ui";
import {openMobileSwitcherDialog, bindMobileSwitcherToolbarActions, renderMobileList, openMobileGroupActions} from "./mobile-switcher-ui";
import {openSecondPanel} from "./second-panel-ui";
import {openHomeWidgetStore} from "./home-store-ui";
import {resolveStoreNetworkLabel, resolveStorePrivacyLabel} from "./store-labels";
import {buildSettingsAppearance, buildSettingsBehavior, buildSettingsPanels, buildSettingsDockToggles, buildSettingsHomePanel, buildSettingsMobile, buildSettingsFloatingBall, buildSettingsJournal, buildSettingsFavorites, buildSettingsFavCreateRow, buildSettingsFavGroupList, buildSettingsFavSection, buildFavGroupRowActions, buildSettingsFavItemRow, buildSettingsQuickActions, buildQuickActionsTransferControls, buildSettingsDocumentSets, buildSettingsStorage} from "./settings-sections";
import {normalizeHomeStoreQuery, resolveHomeStoreFilter, matchesHomeStoreCard, summarizeHomeStoreCards, buildHomeStoreSearchText, resolveHomeStorePreviewKind, resolveHomeStoreSourceInfo, resolveHomeStoreCardStatus, resolveHomeStoreCardA11y, sortHomeStoreCards, normalizeHomeStoreSort, matchesHomeStoreTokens, buildHomeStoreTabCounts, resolveHomeStoreStatusTone, resolveHomeStoreIntegrationTone, resolveHomeStoreCardTone, buildHomeStoreCardBadges, buildHomeStoreResultSummary, resolveHomeStoreDensityLabel, resolveHomeConfigKind, buildHomeConfigSections, resolveHomeConfigPlaceholder, resolveHomeConfigHint, summarizeHomeConfigDraft, resolveHomeConfigIntegration, normalizeHomeStoreInstallability, resolveHomeStoreInstallabilityReason, canHomeStoreInstall, resolveHomeStoreTouchTargetSize, resolveHomeStorePrimaryAction, resolveHomeStorePrimaryActionLabel, buildHomeStoreCardStateSummary, normalizeHomeStoreViewMode, resolveHomeStoreViewModeLabel, toggleHomeStoreSelection, buildHomeStoreSelectionSummary, resolveHomeStoreDependencyInfo, summarizeHomeStoreDependencies, buildHomeStoreDependencySummary} from "./home-store-model";
import {millisecondsToNextMinute, buildYearProgressSnapshot, buildCountdownSnapshot} from "./local-time-model";
import {mergeHolidayPayloads, holidayPresentation, normalizeMinifluxConfig} from "./life-widget-model";
import {loadHolidayYear, allowedLifeWidgetUrl, allowedActivityWatchUrl, clearLifeWidgetCaches, allowedIcalFeedUrl, loadIcalText, allowedMinifluxUrl, allowedMinifluxCategoriesUrl} from "./life-widget-network";
import {normalizeDocumentSets, createDocumentSet, upsertDocumentSet, removeDocumentSet, mergeDocumentSets, planDocumentSetRestore, summarizeDocumentSetRestore, runDocumentSetRestore, pickNextDocumentSet} from "./document-sets";
import {projectRelatedContent, isRelatedCacheHit} from "./related-content-model";
import {buildConfigPack, normalizeConfigPackImport} from "./config-pack-model";
import {openDocumentOnMobile, openDocumentOnDesktop} from "./document-actions";
import {ensureTodayJournal as ensureTodayJournalAction} from "./journal-actions";
import {removeFavoriteEntry, setFavoriteEntryGroup, migrateFavoriteEntry, normalizeFavoriteSmartGroups, buildTagSmartGroupQuery, projectTagSmartGroupEntries} from "./favorite-actions";
import {normalizeSettings, resolvePanelSize, normalizeEssentials} from "./settings-model";
import {createDefaultFloatingBallConfig, resolveFloatingBallClickAction, normalizeFloatingBallConfig, applyFloatingBallPreset, pickNextFloatingBallPreset} from "./floating-ball-model";
import {createFloatingBallUi} from "./floating-ball-ui";
import {createFloatingBallActionExecutor} from "./floating-ball-actions";
import {selectAdjacentTab, scrollSurfaceTo} from "./floating-ball-generic-actions";
import {checkFloatingBallSettingsBudget} from "./floating-ball-settings-model";
import type {FloatingBallUiController, FloatingBallPosition, FloatingBallSurface} from "./floating-ball-ui";
import {createFloatingBallPanelController} from "./floating-ball-panel";
import {
    AGENT_CAPABILITY_SPECS,
    flattenOutline,
    MAX_SEARCH_ITEMS,
    buildAgentNavigationResult,
    buildAgentWorkspaceContext,
    buildAgentSearchResult,
    normalizeAgentLimit,
    normalizeAgentSearchOffset,
    normalizeAgentSearchMethod,
    normalizeAgentSearchOrder,
    normalizeAgentSearchType,
    normalizeAgentSearchSubType,
    normalizeAgentNotebook,
    normalizeAgentSearchPaths,
    normalizeAgentQuery,
    normalizeAgentFailureReason,
    buildAgentHomeDiagnostics,
    buildAgentWidgetCatalog,
    normalizeAgentWidgetConfig,
    buildAgentWidgetSnapshot,
    flipTaskMarkdown,
    sanitizeJournalAppend,
    registerReadOnlyAgentCapabilities,
    normalizeAgentDocumentId,
    normalizeAgentDocumentIds,
    normalizeAgentNotebookId,
    normalizeAgentJournalStatus,
    buildNotebookBoxScope,
    registerAgentActionCapability,
} from "./agent-capabilities";
import {createWorkspaceRuntimeDiagnostics} from "./agent-workspace-diagnostics";
// T-1219 执行链（ADR 0063 宿主路线）：propose 只读 + execute 整单一次确认
import {
    WORKSPACE_PLAN_SPEC,
    WORKSPACE_EXECUTE_SPEC,
    buildWorkspacePlan,
    isWorkspacePlanExpired,
    validateWorkspacePlan,
    runWorkspacePlan,
} from "./agent-workspace-plan";
import {createWorkspaceHostHandlers} from "./agent-workspace-registry";
import {normalizeRssReadState} from "./rss-model";
import {buildActivityWatchBucketsUrl, normalizeActivityWatchBuckets} from "./life-widget-model";
import {loadActivityWatchBuckets} from "./life-widget-network";

import {
    auditAgentCapabilityDefinitions,
    summarizeAgentCapabilityAudit,
    buildAgentReadOnlyAuditSnapshot,
    createAgentReadOnlyAuditHistory,
} from "./agent-readonly-audit";
import {DOCUMENT_CONTEXT_SPEC, buildDocumentContext, normalizeDocumentContextRequest} from "./agent-document-context";
import {
    SEARCH_DEBOUNCE_MS,
    DOC_RESULT_LIMIT,
    DOC_SEARCH_FETCH_LIMIT,
    DOC_SEARCH_CACHE_LIMIT,
    SAVE_DEBOUNCE_MS,
    FAB_HIDE_DELAY_MS,
    BACK_TOP_THRESHOLD_PX,
    MESSAGE_DEFAULT_MS,
    UPDATED_CACHE_MS,
    NOTEBOOK_FETCH_TIMEOUT_MS,
    DOCUMENT_SET_PROBE_CONCURRENCY,
    DOCUMENT_SET_PROBE_TIMEOUT_MS,
    DOCUMENT_SET_IMPORT_MAX_BYTES,
    TAB_SETTLE_MS,
    TAB_VERIFY_TIMEOUT_MS,
    SYNC_WATCHDOG_MS,
    DIALOG_WIDTH_MIN_PX,
    DIALOG_WIDTH_MAX_PX,
    DIALOG_HEIGHT_MIN_PX,
    DIALOG_HEIGHT_MAX_PX,
    THUMB_HEIGHT_MIN_PX,
    THUMB_HEIGHT_MAX_PX,
    MOBILE_THUMB_HEIGHT_MIN_PX,
    MOBILE_THUMB_HEIGHT_MAX_PX,
    COLUMNS_MIN,
    COLUMNS_MAX,
    MOBILE_COLUMNS_MIN,
    MOBILE_COLUMNS_MAX,
    MOBILE_COLUMNS_SINGLE,
    MOBILE_COLUMNS_DOUBLE,
    MOBILE_COLUMNS_AUTO,
    SIDEBAR_DEFAULT_WIDTH_PX,
    CONTENT_WIDTH_PX,
    THUMB_BATCH,
    THUMB_CACHE_MAX,
    THUMB_HTML_MAX,
    THUMB_BATCH_MOBILE,
    THUMB_CACHE_MAX_MOBILE,
    THUMB_HTML_MAX_MOBILE,
    THUMB_CLONE_MAX,
    THUMB_API_MAX,
    THUMB_API_MAX_MOBILE,
    MRU_MAX,
    HISTORY_MAX,
    FAVORITES_MAX,
    PINNED_MAX,
    FAVORITE_GROUPS_MAX,
    BLOCK_ID_RE,
    FAV_PANEL_WIDTH_PX,
    FAV_PANEL_MAX_HEIGHT_PX,
    FAV_PANEL_MIN_HEIGHT_PX,
    MRU_KEY,
    HISTORY_KEY,
    CLOSED_HISTORY_KEY,
    PINNED_KEY,
    FAV_KEY,
    FAV_GROUPS_KEY,
    SETTINGS_KEY,
    THUMB_CACHE_KEY,
    FAV_COLLAPSED_KEY,
    QUICK_ACTIONS_KEY,
    QUICK_ACTIONS_DEFAULTS_KEY,
    HOME_STATE_KEY,
    DOCUMENT_SETS_KEY,
    QUICK_ACTIONS_MAX,
    SIDEBAR_DOCK_TYPE,
    DEFAULT_HOTKEY,
    LEGACY_HOTKEY,
    SECOND_PANEL_HOTKEY,
    PanelSizeMode,
    PANEL_SIZE_MODES,
    PANEL_SCALE_MIN,
    PANEL_SCALE_MAX,
    PANEL_SCALE_DEFAULT,
    PANEL_SIZE_MIN_PX,
    SETTINGS_PANEL_SCALE,
    GROUP_FLOW_MIN_CARD_PX,
    GROUP_FLOW_GAP_PX,
    HOME_SIZE_DEFAULTS,
    HOME_SIZE_MODES,
    HomeSizeMode,
    HOME_WIDGET_SIZES,
    HOME_WIDGET_SIZE_LABELS,
    HomeWidgetSize,
    TabGroupMode,
    TAB_GROUP_MODES,
    TAB_GROUP_MODE_DEFAULT,
    PERSISTENT_KEYS,
    SCHEMA_VERSION_KEY,
    RSS_READ_KEY,
    ICON_CATALOG,
    ICON_CATEGORIES,
} from "./constants";
import {
    getSiyuan,
    IMobileTabsState,
    IMobileTabsAPI,
    ISiyuanGlobal,
    ISiyuanKeymap,
    ISiyuanLayout,
    ISiyuanLayoutDock,
    ISiyuanUiLayout,
    ISiyuanMobile,
    ISiyuanConfig,
    IProtyleTabModel,
    IElementStorage,
} from "./types";

declare module "./util" {
    // 璁?TS 浠嶈兘浠?./util.js 鎷垮埌鍑芥暟绛惧悕锛涜繍琛屾椂 import.js 璧?Node CJS
    export function clampNum(value: unknown, min: number, max: number, fallback: number): number;
    export function stableSortBy<T>(arr: T[], keyFn: (item: T) => string | number): T[];
    export function normalizeSortBy(value: unknown, allowed: readonly string[], fallback: string): string;
    export function sortItems<T>(items: T[], sortBy: string, mru?: string[], options?: {
        titleOf?: (item: T) => string;
        rootIdOf?: (item: T) => string;
        pinKeyOf?: (item: T) => string;
        updatedMap?: {[rootId: string]: string};
    }): T[];
    export function sortGroupItems<T>(group: T[], sortBy: string, mru?: string[], pinned?: Set<string> | Iterable<string>, updatedMap?: {[rootId: string]: string}, callbacks?: {
        titleOf?: (item: T) => string;
        rootIdOf?: (item: T) => string;
        pinKeyOf?: (item: T) => string;
    }): T[];
    export function resolveQuickActionSurfaceState(surface: string, settings?: Record<string, unknown>, selector?: string): {
        surface: "desktop" | "sidebar" | "mobile";
        display: "full" | "icons" | "hidden";
        isRightRail: boolean;
        collapsed: boolean;
    };
    export function groupFavoritesByGroup<T extends {group?: string}>(favorites: T[], groupNames: string[]): Map<string, T[]>;
    export function resolveIconFallback(raw: string): {type: "svg", value: string} | {type: "emoji", value: string};
    export function normalizeCustomIcon(value: unknown): string | undefined;
    export function isImageIconReference(value: unknown): boolean;
    export function resolveIconReference(raw: unknown, availableSymbols: Iterable<string> | null | undefined, fallback?: string | string[]): {type: "svg", value: string} | {type: "emoji", value: string} | {type: "image", value: string};
    export function normalizeQuickActionText(value: unknown, max?: number): string;
    export function buildTabGroupsByParent<T extends {parent?: {element?: HTMLElement, headersElement?: HTMLElement}}>(
        tabs: T[], fallbackKey: HTMLElement,
    ): Map<HTMLElement, Array<{tab: T}>>;
    export function resolveTabRootId(tab: {model?: IProtyleTabModel, headElement?: HTMLElement}): string | null;
    export function planGroupOpenFavorites<T extends {key: string}>(
        favorites: T[], openedKeys: Set<string>, resolveRootId: (favorite: T) => string,
    ): {targets: Array<{favorite: T, rootId: string}>, invalid: number};
    export function sanitizeFavorites(values: unknown, max?: number): {items: IFavoriteItem[], changed: boolean};
    export function sanitizeOpenHistory(values: unknown, max?: number): {items: IOpenHistoryEntry[], changed: boolean};
    export function sanitizeStringList(values: unknown, max?: number): {items: string[], changed: boolean};
    export function isSuccessfulMobileTabsResult(result: unknown): boolean;
    export function sanitizeQuickActions(values: unknown, max?: number): {items: IQuickAction[], changed: boolean};
    export function getDefaultQuickActions(): IQuickAction[];
    export function getBuiltinQuickActions(): IQuickAction[];
    export function normalizeThumbCache(values: unknown, options?: {max?: number, htmlMax?: number}):
        {cache: IThumbCache, kept: number, removed: number, changed: boolean};
}

declare module "./quick-actions" {
    export function sanitizeQuickActions(values: unknown, max?: number): {items: IQuickAction[], changed: boolean};
    export function getDefaultQuickActions(): IQuickAction[];
    export function getBuiltinQuickActions(): IQuickAction[];
    export function getDefaultQuickActionTargets(kind: string, value: string, declaredTargets?: string[]): string[];
    export function resolveQuickActionSupport(kind: string, value: string, target: string, declaredTargets?: string[]): "supported" | "unsupported" | "unknown";
    export function shouldRenderQuickAction(action: IQuickAction, surface: string, context?: string, declaredTargets?: string[]): boolean;
    export function appendQuickAction(actions: IQuickAction[], candidate: Partial<IQuickAction> & {declaredTargets?: string[]}, max?: number): {items: IQuickAction[], added: boolean, reason: string};
    export function createQuickActionRegistry(): any;
}

declare module "./floating-ball-panel" {
    export function createFloatingBallPanelController(options: Record<string, unknown>): {
        mount: () => HTMLElement | null;
        update: (patch?: Record<string, unknown>) => void;
        openMore: () => void;
        closeMore: (options?: {restoreFocus?: boolean}) => void;
        destroy: () => void;
        getElement: () => HTMLElement | null;
        isMoreOpen: () => boolean;
    } | null;
}

declare module "./floating-ball-actions" {
    export function createFloatingBallActionExecutor(options: Record<string, unknown>): (action: unknown) => Promise<{ok: boolean; reason?: string; result?: unknown}>;
}

declare module "./quick-actions-ui" {
    export function mountQuickActionPicker(options: {
        trigger: HTMLElement;
        host: HTMLElement;
        candidates: Array<{id: string, label: string, icon: string, group?: string, secondary?: string, searchText?: string, fallbackIcon?: string | string[]}>;
        searchPlaceholder?: string;
        emptyText?: string;
        onSelect: (candidate: any) => void;
    }): HTMLElement | null;
}

declare module "./home-runtime" {
    export function createHomeRuntime(): {
        registerAdapter(options: Record<string, unknown>): {registered: boolean; unregister: () => boolean | void};
        listModules(device?: string): unknown[];
        read(moduleId: string, device?: string, config?: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
        diagnostics(): Array<{type: string; moduleId: string; device: string; at: number}>;
        dispose(): void;
    };
}

declare module "./home-view" {
    export function buildHomeModuleView(module: unknown, result: unknown, options?: {collapsed?: boolean}): unknown;
    export function renderHomeModuleView(doc: unknown, view: unknown, options?: {labels?: Record<string, string>; onToggle?: (view: unknown) => void; onItem?: (item: unknown, view: unknown) => void; onCalendarNavigate?: (direction: number, view: unknown) => void; onRetry?: (view: unknown) => void}): unknown;
}
declare module "./home-controller" {
    export function createHomeModuleController(options: Record<string, unknown>): {
        mount: () => unknown;
        refresh: (config?: Record<string, unknown>, readOptions?: Record<string, unknown>) => Promise<{ok: boolean; reason: string; view: unknown}>;
        toggle: () => unknown;
        showError: (reason?: string) => unknown;
        dispose: () => void;
        getView: () => unknown;
    } | null;
    export function refreshHomeModules(entries: unknown[], options?: {concurrency?: number}): Promise<unknown[]>;
    export function countHomeRefreshFailures(results: unknown): number;
    export function summarizeHomeRefreshFailures(results: unknown): {timeout: number; failed: number; other: number};
    export function selectHomeRefreshRetryEntries(entries: unknown[], results: unknown): unknown[];
}
declare module "./home-panel" {
    export function createHomePanelController(options: Record<string, unknown>): {
        mount: () => unknown;
        refresh: (config?: unknown, readOptions?: Record<string, unknown>) => Promise<{ok: boolean; reason: string; results: Array<{ok: boolean; reason: string; view: unknown}>}>;
        toggle: (moduleId: string) => unknown;
        dispose: () => void;
        listModules: () => unknown[];
        getViews: () => unknown[];
    } | null;
}
declare module "./recent-closed" {
    export function removeRecentEntry<T extends Record<string, unknown>>(entries: T[], key: string, field?: "key" | "rootId"): {items: T[]; changed: boolean};
    export function recordRecentOpen<T extends Record<string, unknown>>(openEntries: T[], closedEntries: T[], entry: {key: string; rootId?: string | null; title?: string; ts?: number}, max?: number): {open: T[]; closed: T[]; changed: boolean};
}
declare module "./favorite-actions" {
    export function removeFavoriteEntry<T extends {key?: string}>(entries: T[], key: string): {items: T[]; changed: boolean};
    export function setFavoriteEntryGroup<T extends {key?: string; group?: string}>(entries: T[], key: string, group: string): {items: T[]; changed: boolean};
    export function migrateFavoriteEntry<T extends {key?: string; rootId?: string}>(entries: T[], legacyKey: string, rootId: string): {items: T[]; changed: boolean; migrated: boolean; duplicate?: boolean};
}
declare module "./home-model" {
    export function normalizeHomeState(value: unknown): {schemaVersion: number; instances: Array<{instanceId: string; moduleId: string; enabled: boolean; config: Record<string, unknown>}>; layouts: Record<string, Array<{instanceId: string; x: number; y: number; w: number; h: number; collapsed: boolean}>>};
    export function resolveMobileHomeSize(value: unknown): string;
    export function buildQuickCaptureAction(value: unknown): string;
    export function parseQuickCaptureAction(value: unknown): {notebook: string; initialText: string; includeTime: boolean} | null;
    export function buildQuickCaptureInitialText(value: unknown, now?: Date): string;
    export function buildPluginCommandsSnapshot(commands: unknown, config: unknown, labels?: Record<string, string>): any;
}
declare module "./settings-model" {
    export function normalizeSettings(saved: unknown, options?: Record<string, unknown>): any;
    export function resolvePanelSize(settings: {panelSizeMode?: string; panelScale?: number; dialogWidth?: number; dialogHeight?: number} | null | undefined, viewport: {width: number; height: number; minWidth?: number; minHeight?: number}): {width: number; height: number};
}
declare module "./document-sets" {
    export function normalizeDocumentSets(value: unknown, max?: number): {schemaVersion: number; sets: unknown[]; changed: boolean};
    export function createDocumentSet(name: string, entries: unknown[], options?: Record<string, unknown>): any;
    export function upsertDocumentSet(value: unknown, candidate: unknown, options?: Record<string, unknown>): any;
    export function removeDocumentSet(value: unknown, setId: string, options?: Record<string, unknown>): any;
    export function mergeDocumentSets(value: unknown, incoming: unknown, options?: Record<string, unknown>): any;
    export function planDocumentSetRestore(value: unknown, openedRootIds?: unknown, availableRootIds?: unknown, max?: number): any;
    export function summarizeDocumentSetRestore(plan: unknown, probe: unknown, execution?: {succeeded?: number; failed?: number; cancelled?: boolean}): {succeeded: number; failed: number; skipped: number; missing: number; unknown: number; available: number; cancelled: boolean; attempted: number};
    export function runDocumentSetRestore(entries: Array<{rootId: string}>, openRoot: (rootId: string, entry: unknown) => Promise<unknown> | unknown, options?: {signal?: AbortSignal; shouldContinue?: () => boolean}): Promise<{succeeded: number; failed: number; attempted: number; cancelled: boolean; results: Array<{rootId: string; ok: boolean; error?: string}>}>;
}
// 卡片三按钮所需图标 symbol（与官方 litheness sprite 同名同形）：
// 手机端模板不含内联 symbol，官方 sprite 由 loadAssets 异步注入且依赖 App 版本，
// 首帧 <use> 引用到空 symbol 时按钮渲染为空白（三按钮"隐形"根因），插件须自带兜底
const CARD_ICON_SPRITE =
    '<symbol id="iconUnpin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/></symbol>' +
    '<symbol id="iconPin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></symbol>' +
    '<symbol id="iconStar" viewBox="0 0 24 24" fill="var(--b3-icon-star-fill, none)" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></symbol>' +
    '<symbol id="iconClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>' +
    // 第二面板专属图标：与 iconLayout（2×2 均等网格）同族，但为 dashboard 变体
    // （一格宽 + 三格小），暗示"聚合面板"，外框/描边风格保持一致以示同源
    '<symbol id="iconLayoutHome" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="10" rx="1.2"/><rect x="13.5" y="3" width="7.5" height="6" rx="1.2"/><rect x="13.5" y="12" width="7.5" height="9" rx="1.2"/><rect x="3" y="16" width="7.5" height="5" rx="1.2"/></symbol>';

// 单分组渲染上下文：避免 renderTabGroup 形参列表爆炸，所有共享字段打包到一个对象
export interface ITabGroupRenderCtx {
    reusable: Map<string, HTMLElement>;
    activeTabId: string | undefined;
    pinned: Set<string>;
    favorites: Set<string>;
    mru: string[];
    settings: ISwSettings;
    opts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose};
}

// siyuan 包未将 Tab 作为顶层命名导出，这里从 getAllTabs 返回类型推导
type Tab = ReturnType<typeof getAllTabs>[number];

export interface IDocSearchResult {
    id?: string;
    rootId?: string;
    name?: string;
    title?: string;
    path?: string;
    hPath?: string;
    notebookId?: string;
    notebookID?: string;
    box?: string;
    blockIds?: string[];
    snippets?: Array<{text?: string; blockId?: string | null}>;
    source?: string;
}

export interface IDocSearchFilters {
    notebook?: string;
    paths?: string[];
    types?: Record<string, boolean>;
    subTypes?: Record<string, boolean>;
    method?: "keyword" | "query" | "regexp" | "semantic";
    orderBy?: "relevanceDesc" | "updatedDesc" | "createdDesc" | "content";
}

export interface ISearchSession<T> {
    version: number;
    cache: Map<string, T>;
    controller: AbortController | null;
    timer: number | null;
    cacheLimit: number;
}

declare module "./search-session" {
    export function createSearchSession<T>(cacheLimit: number): ISearchSession<T>;
    export function beginSearch<T>(session: ISearchSession<T>): number;
    export function cacheSearchResult<T>(session: ISearchSession<T>, key: string, value: T): void;
    export function disposeSearchSession<T>(session: ISearchSession<T>): void;
}

declare module "./search-model" {
    export function aggregateSearchResults(results: unknown[], options?: {
        documents?: number;
        snippets?: number;
        blockIds?: number;
        source?: string;
    }): {cards: Array<{
         rootId: string;
         title: string;
         path: string;
         notebookId?: string;
         blockIds?: string[];
        snippets: Array<{text: string; blockId?: string | null}>;
    }>};
    export function buildFullTextSearchRequest(input?: Record<string, unknown>): {
        endpoint: string;
        body: Record<string, unknown>;
    } | null;
    export function buildNativeSearchTabConfig(input?: Record<string, unknown>): {instance: string; config: Record<string, unknown>} | null;
    export function buildSearchCacheKey(input?: Record<string, unknown>): string;
    export function canUseTitleSearch(filters?: Record<string, unknown>): boolean;
    export function extractSearchRecords(payload: unknown): unknown[];
    export function normalizeSearchResult(value: unknown, source?: string): {
        rootId: string;
        blockId?: string;
        title?: string;
        path?: string;
        notebookId?: string;
    } | null;
    export function buildSearchScoreBreakdown(value: unknown, options?: Record<string, unknown>): {
        source: string;
        sourceWeight: number;
        titleScore: number;
        total: number;
        kernelScore: number | null;
        titleMatch: boolean;
        pathMatch: boolean;
        pinyinMatch: boolean;
        filterMatch: boolean;
        lastPicked: boolean;
        updated: string;
        matchedFields: string[];
    };
    export function buildSearchHealthSnapshot(options?: Record<string, unknown>): {
        query: string;
        state: string;
        remote: boolean;
        cacheHit: boolean;
        fallbackUsed: boolean;
        fallbackReason: string;
        counts: Record<string, number>;
        sources: Array<{key: string; status: string; count: number; latencyMs: number}>;
        totalLatencyMs: number;
        slowThresholdMs: number;
        slow: boolean;
        truncated: boolean;
        degraded: boolean;
        reasons: string[];
    };
    export function pickDocViewportAnchor(entries: Array<{key: string; top: number}>, viewportHeight: number): {key: string; offset: number} | null;
    export function planDocViewportRestore(anchor: {key: string; offset: number} | null, entries: Array<{key: string; top: number}>, scrollTop: number): number | null;
    export function filterSearchDocuments(value: unknown[], filters?: Record<string, unknown>): unknown[];
    export function matchesSearchDocumentFilters(value: unknown, filters?: {
        notebook?: string;
        paths?: string[];
    }): boolean;
    export function normalizeSearchDocumentFilters(filters?: Record<string, unknown>): {
        notebook: string;
        paths: string[];
    };
    export function normalizeTitleSearchDocuments(value: unknown[]): unknown[];
    export function resolveSearchNotebookId(value: unknown, current?: unknown, model?: unknown, initData?: unknown): string;
    export function buildOpenedDocumentScope(value: unknown): {rootId: string; notebook: string; path: string} | null;
    export function buildOpenedDocumentSearchRequests(tabs: unknown[], query: string, options?: Record<string, unknown>): Array<{
        endpoint: string;
        body: Record<string, unknown>;
        scope: {rootId: string; notebook: string; path: string};
    }>;
    export function isSemanticEmbeddingConfigured(config: unknown): boolean;
}

export type DocSearchRenderState = "results" | "loading" | "error";

// IMobileTabEntry / IMobileTabsState 已迁移至 ./types.ts（思源全局对象的相关结构）
// 页签排序方式：mru=最近使用 layout=打开顺序 layoutDesc=打开倒序 titleAsc/titleDesc=标题升降序 updatedDesc=最近编辑

// addDock 回调里的 this 类型（思源把面板元素挂到回调自身的 .element 上）
interface IDockHandlerSelf {
    element?: HTMLElement;
}
export type SortBy = "mru" | "layout" | "layoutDesc" | "titleAsc" | "titleDesc" | "updatedDesc";
export type QuickActionDisplay = "full" | "icons" | "hidden";
export type HomePalette = "auto" | "soft" | "mono";
const SORT_BY_LIST: SortBy[] = ["mru", "layout", "layoutDesc", "titleAsc", "titleDesc", "updatedDesc"];
// 页签卡片操作完成后的收尾动作（弹窗模式销毁弹窗，侧边栏模式刷新列表）
export type IOverlayClose = () => void;

// 存储 key / dock type / 快捷键等注册常量已集中到 ./constants.ts（ADR-0002 遗留闭环，v0.16.5）

// 默认设置（可被用户设置覆盖）
const DEFAULT_SETTINGS: ISwSettings = {
    dialogWidth: 880,      // 固定尺寸模式的宽度 px
    dialogHeight: 600,     // 固定尺寸模式的高度 px
    panelSizeMode: "adaptive", // 面板尺寸模式：adaptive=屏幕比例自适应（默认）/ custom=固定尺寸 / fullscreen=全屏
    panelScale: PANEL_SCALE_DEFAULT, // 自适应比例（百分比，相对当前可视区宽高）
    groupBy: TAB_GROUP_MODE_DEFAULT, // 列表分组：默认按笔记本
    homeSizeMode: "follow", // 组件面板尺寸模式：跟随第一面板
    homePalette: "auto",     // 组件卡片强调色：自动多彩 / 柔和 / 单色
    homeWidth: 960,          // 组件面板固定宽度
    homeHeight: 720,         // 组件面板固定高度
    columns: 0,            // 缩略图列数，0=自动
    thumbHeight: 128,      // 缂╃暐鍥鹃珮搴?px
    sortBy: "mru",         // 页签排序方式
    excludedDocks: [],     // 不显示在左侧列表的面板类型
    dockDisplay: "collapsed",   // Default to the compact icon rail; users can expand it when labels are needed.
    fullscreen: false,     // 全屏模式：切换器铺满整个窗口，按 Esc 退出
    sidebarLayout: "enlarge", // 侧边栏缩略图布局：enlarge 放大填满栏宽（默认）/ columns 按宽度自动加列
    fabEnabled: false,     // 手机端悬浮按钮默认关闭，需要的用户在设置中打开
    floatingBall: createDefaultFloatingBallConfig(), // T-6757 版本化悬浮球配置（旧 fabEnabled 仍兼容）
    mobileColumns: MOBILE_COLUMNS_AUTO, // 默认自动（竖屏单列，横屏双列）
    mobileThumbHeight: 80, // 手机端缩略图高度
    journalNotebook: "",   // 默认日记笔记本 id，空=未设置（首次点击日记按钮时弹出选择）
    lastSettingsTab: "appearance", // 设置面板上次所在标签页（打开时直接跳转，提升反复进入设置的操作效率）
    quickActions: getDefaultQuickActions() as IQuickAction[],
    quickActionsRightRail: false,
    quickActionsDisplayDesktop: "full",
    quickActionsDisplaySidebar: "full",
    quickActionsDisplayMobile: "full",
    quickActionsCollapsedDesktopBottom: false,
    quickActionsCollapsedDesktopRight: false,
    quickActionsCollapsedSidebar: false,
    quickActionsCollapsedMobile: false,
    agentActionsEnabled: true, // T-6692b 灰度开关：Agent 受控动作总开关（默认开）
    documentSetsAutoSave: true, // T-6800 工作区切换：离开当前集时自动快照（默认开）
    documentSetsCurrentId: "", // T-6800 当前工作区集 id（空=尚未激活任何集）
    favoriteSmartGroups: [], // T-6804 标签智能分组
    savedSearches: [], // T-6827 保存的搜索
    skin: "fusion", // T-6796 默认融合思源主题
    pinyinMatch: true, // T-6805 拼音辅助匹配默认开
    density: "comfortable", // T-6823 密度默认舒适
    reuseOpenTabs: false, // T-6830 打开策略默认总是新开
    documentSetEssentials: [], // T-6810 Essentials 常驻文档
};

// 左侧面板显示方式
export type DockDisplay = "hidden" | "collapsed" | "full";
const DOCK_DISPLAY_LIST: DockDisplay[] = ["hidden", "collapsed", "full"];
// 侧边栏缩略图布局：enlarge 放大填满栏宽（默认） / columns 按宽度自动增加列数
export type SidebarLayout = "enlarge" | "columns";
const SIDEBAR_LAYOUT_LIST: SidebarLayout[] = ["enlarge", "columns"];

export interface ISwSettings {
    dialogWidth: number;
    dialogHeight: number;
    panelSizeMode: PanelSizeMode; // 面板尺寸模式
    panelScale: number;           // 自适应比例（百分比）
    homeSizeMode: HomeSizeMode;   // 组件面板尺寸模式
    homePalette: HomePalette;
    homeWidth: number;            // 组件面板固定宽度
    homeHeight: number;           // 组件面板固定高度
    groupBy: TabGroupMode;        // 列表分组方式（默认按笔记本）
    columns: number;
    thumbHeight: number;
    sortBy: SortBy;
    excludedDocks: string[];
    dockDisplay: DockDisplay;
    fullscreen: boolean;       // 全屏模式：切换器铺满整个窗口，Esc 退出
    sidebarLayout: SidebarLayout; // 侧边栏缩略图布局：enlarge 放大 / columns 自动加列
    // 鎵嬫満绔?
    fabEnabled: boolean;       // 是否启用悬浮按钮
    floatingBall: any;         // 版本化悬浮球配置；由 floating-ball-model 负责净化
    mobileColumns: number;     // 0=单列 1=双列 2=自动
    mobileThumbHeight: number; // 手机端缩略图高度
    journalNotebook: string;   // 默认日记笔记本 id，空=未设置
    lastSettingsTab: string;   // 设置面板上次所在标签页（appearance/behavior/panels/favorites/journal/mobile）
    quickActions: IQuickAction[];
    quickActionsRightRail: boolean;
    quickActionsDisplayDesktop: QuickActionDisplay;
    quickActionsDisplaySidebar: QuickActionDisplay;
    quickActionsDisplayMobile: QuickActionDisplay;
    quickActionsCollapsedDesktopBottom: boolean;
    quickActionsCollapsedDesktopRight: boolean;
    quickActionsCollapsedSidebar: boolean;
    quickActionsCollapsedMobile: boolean;
    agentActionsEnabled: boolean; // T-6692b 受控动作总开关
    documentSetsAutoSave: boolean; // T-6800 切换文档集时自动把现场快照回当前集（默认开）
    documentSetsCurrentId: string; // T-6800 当前工作区语义：最近一次恢复/激活的文档集 id
    favoriteSmartGroups: Array<{name: string; tag: string}>; // T-6804 标签智能分组（最多 4 组）
    savedSearches: Array<{id: string; name: string; query: string; notebook?: string}>; // T-6827 保存的搜索（最多 16 条）
    skin: PanelSkin; // T-6796 界面皮肤：fusion=跟随思源主题（默认）
    pinyinMatch: boolean; // T-6805 拼音辅助匹配（全拼/首字母），默认开
    density: "comfortable" | "compact"; // T-6823 密度档位（默认 comfortable）
    reuseOpenTabs: boolean; // T-6830 打开策略：命中已开页签时聚焦复用（默认关=总是新开）
    documentSetEssentials: string[]; // T-6810 Essentials：每次文档集恢复后自动打开的必需文档
}

export interface IGroupedTab {
    tab: Tab;
    card?: HTMLElement;
}

interface IDockPanel {
    type: string;
    title: string;
    icon: string;
}

export type QuickActionTarget = "desktop" | "sidebar" | "mobile";
export type PanelSkin = "fusion" | "apple" | "midnight" | "paper";
type QuickActionKind = "builtin" | "dock" | "adapter" | "command" | "global";
export type QuickActionSupport = "supported" | "unsupported" | "unknown";
export interface IQuickAction {
    id: string;
    label: string;
    icon: string;
    kind: QuickActionKind;
    value: string;
    targets: QuickActionTarget[];
    order: number;
    enabled: boolean;
}

interface IQuickActionProvider {
    id: string;
    label: string;
    icon: string;
    value: string;
    targets: QuickActionTarget[];
    declaredTargets?: QuickActionTarget[];
}

export interface IQuickActionPickerCandidate {
    id: string;
    label: string;
    icon: string;
    group: string;
    secondary: string;
    searchText: string;
    fallbackIcon?: string | string[];
    action: IQuickAction;
}

interface IQuickActionPluginCommand {
    id: string;
    value: string;
    label: string;
    icon: string;
    pluginName: string;
    pluginTitle: string;
    commandKey: string;
    declaredTargets?: QuickActionTarget[];
}

interface IQuickActionPluginLike {
    name?: string;
    displayName?: string;
    i18n?: Record<string, string>;
    getQuickActionCapabilities?: () => unknown;
    commands?: Array<{
        langKey?: string;
        langText?: string;
        icon?: string;
        callback?: () => void;
        globalCallback?: () => void;
    }>;
}

// 缩略图缓存条目：文档 rootID → 内容快照
interface IThumbCache {
    [rootId: string]: { title: string, html: string, ts: number };
}

// 模块级 WeakMap：滚动容器 → 已挂的 IntersectionObserver，避免在 HTMLElement 上自挂私有属性
const thumbObserverCache = new WeakMap<HTMLElement, IntersectionObserver>();

// 收藏条目：文档页签存 rootId（关闭后仍可重开）；非文档页签仅存页签 id。
// 收藏项永久留存直到用户主动删除；rootId 缺失时跳转/批量打开用 key 兜底（见 jumpToFavorite）
export interface IFavoriteItem {
    key: string;       // pinKeyOf锛歳ootId || tab.id
    title: string;
    rootId: string | null;
    group: string;     // 分组名，空字符串表示未分组（旧数据无此字段按未分组处理）
}

interface IOpenHistoryEntry {
    key: string;
    rootId: string | null;
    title: string;
    ts: number;
    source?: "open" | "closed";
    closedAt?: number;
}

export default class SpeedSwitchPlugin extends Plugin {
    private isMobile = false;
    // 文档搜索链路状态宿主（R5a，D-381）：6 个实例级状态收拢为单一状态对象，
    // WeakMap/Set 语义与代际竞态保护不变；生命周期（含卸载清理）由原消费点继续驱动。
    private docSearchState = createDocSearchState();
    // v0.17 阶段 1（D-220）：workspace 运行时只读诊断能力的生命周期持有者
    private workspaceRuntimeDiagnostics: ReturnType<typeof createWorkspaceRuntimeDiagnostics> | null = null;
    // v0.17：保留有界的 Agent 只读注册生命周期快照，仅供插件内部诊断使用。
    private agentReadOnlyAuditHistory = createAgentReadOnlyAuditHistory(8);
    // 存储迁移演练快照（v0.20 数据连续性，D-386）：onload 只读恢复报告，仅内存、不落盘。
    private storageMigrationReport: ReturnType<typeof runStorageMigration>["report"] | null = null;
    // 存储版本戳降级证据（D-401）：载入到比当前插件更新的版本戳时记录原值——
    // 数据可能来自更高版本的插件，保留证据且不覆写，供诊断透出；正常路径恒为 null。
    private storageSchemaDowngradeFrom: number | null = null;
    // onDataChanged 重入保护：同步批次会连续广播，合并为"这轮跑完再补一轮"。
    private dataChangeReloadInFlight = false;
    private dataChangeReloadQueued = false;
    private activeAgentSearchControllers = new Set<AbortController>();
    private activeDocumentSetRestoreControllers = new Set<AbortController>();
    private switcherRefreshers = new Set<() => void>();
    private quickActionAdapters = new Map<string, (value: string) => void | Promise<void>>();
    private quickActionAdapterTargets = new Map<string, QuickActionTarget[]>();
    private quickActionProviders = new Map<string, IQuickActionProvider>();
    private quickActionProviderTokens = new Map<string, symbol>();
    private quickActionRegistry = createQuickActionRegistry();
    private homeRuntime = createHomeRuntime();
    private homeModuleChangeListeners = new Set<() => void>();
    private switcherRefreshFrame: number | null = null;
    private switcherRefreshFrameCancel: (() => void) | null = null;
    private sidebarElement: HTMLElement | null = null; // 侧边栏 dock 面板内容元素
    private sidebarHistoryDropdownDispose: (() => void) | null = null;
    private sidebarSearchFilterDispose: (() => void) | null = null;
    private sidebarResizeObserver: ResizeObserver | null = null; // 侧边栏尺寸监听，变化时重算缩略图缩放
    private sidebarIconObserver: MutationObserver | null = null;
    private sidebarIconFrameCancel: (() => void) | null = null;
    private saveTimers = new Map<string, number>(); // 去抖写盘定时器：MRU/置顶/收藏等高频数据合并落盘
    private saveChains = new Map<string, Promise<void>>(); // 同一 key 的写入严格串行，避免旧请求覆盖新数据
    private recentOpenSnapshot = new Map<string, string>();
    private recentClosedSyncTimer: number | null = null;
    private lifecycleGeneration = 0;
    private isUnloading = false;
    private syncing = false;
    private syncDepth = 0;
    private syncRefreshPending = false;
    private syncWatchdogTimer: number | null = null;
    private globalEventHandlers: {
        switchProtyle: () => void;
        loadedProtyle: () => void;
        destroyProtyle: () => void;
        syncStart: () => void;
        syncEnd: () => void;
        syncFail: () => void;
    } | null = null;
    private favCollapsed = new Set<string>(); // 收藏下拉中已折叠的分组名（已持久化，重启后恢复）
    private fabElement: HTMLElement | null = null; // 手机端悬浮按钮
    private floatingBallUi: FloatingBallUiController | null = null;
    // T-6758: each surface owns its controller and persisted position.  The
    // legacy `floatingBallUi` field remains a mobile alias for existing
    // suspend/toolbar code until the action surface is fully migrated.
    private floatingBallUis = new Map<FloatingBallSurface, FloatingBallUiController>();
    private floatingBallPanels = new Map<FloatingBallSurface, ReturnType<typeof createFloatingBallPanelController>>();
    private fabModalDepth = 0; // Keep the floating button behind plugin dialogs, including nested transitions.
    private mobileTopBarButton: HTMLElement | null = null; // 手机端顶栏切换器入口按钮（自行注入 mobileTopBar）
    private cardTabs = new WeakMap<HTMLElement, Tab>(); // 复用卡片始终指向最新的 Tab 对象
    // T-6461 动作面板键：卡片构建时缓存 handlers，供 Shift+F10 / ContextMenu 键盘呼出动作菜单
    private cardMenuHandlers = new WeakMap<HTMLElement, {
        onActivate: (tab: Tab) => void,
        onTogglePin: (tab: Tab, card: HTMLElement) => void,
        onToggleFav: (tab: Tab, card: HTMLElement) => void,
        onCloseTab: (tab: Tab, card: HTMLElement) => void,
    }>();

    private activeHistoryMenu: Menu | null = null;
    private historyDropdownClosers = new WeakMap<HTMLElement, {close: () => void; dispose: () => void}>();
    private historyDropdownCloseSet = new Set<() => void>();
    private groupOperationBusy = false;

    async onload() {
        this.isUnloading = false;
        this.lifecycleGeneration += 1;
        // 允许同一插件实例在宿主热重载后重新开始一段独立的审计历史。
        if (this.agentReadOnlyAuditHistory.status().disposed) {
            this.agentReadOnlyAuditHistory = createAgentReadOnlyAuditHistory(8);
        }
        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

        // 尽早注入卡片按钮图标：官方 sprite 为异步注入，首帧渲染的三按钮可能引用到空 symbol
        this.addIcons(CARD_ICON_SPRITE);

        this.fixLegacyHotkey();
        await this.initPersistentData();

        // contextMenu 是 v3.8.4 运行时新增参数，随包的类型定义尚未收录——
        // 用结构化局部类型承接（菜单对象运行时只需 addItem），变量传参绕开
        // 字面量多余属性检查。
        type TopBarContextMenu = (menu: {addItem: (item: {icon: string; label: string; click: () => void}) => void}) => void;
        const switcherTopBar: {icon: string; title: string; position: "right"; contextMenu: TopBarContextMenu; callback: () => void} = {
            icon: "iconLayout",
            title: this.i18n.switchTabs,
            position: "right",
            contextMenu: (menu) => {
                menu.addItem({
                    icon: "iconSettings",
                    label: this.i18n.settings,
                    click: () => void this.openSetting(),
                });
                menu.addItem({
                    icon: "iconLayoutHome",
                    label: this.i18n.secondPanel,
                    click: () => openSecondPanel.call(this),
                });
            },
            callback: () => {
                this.showSwitcher();
            },
        };
        this.addTopBar(switcherTopBar);

        // 第二面板顶栏入口：与切换器并列，一键直达聚合面板（dashboard 变体图标，与 iconLayout 同族）
        const secondPanelTopBar: {icon: string; title: string; position: "right"; contextMenu: TopBarContextMenu; callback: () => void} = {
            icon: "iconLayoutHome",
            title: this.i18n.secondPanel,
            position: "right",
            contextMenu: (menu) => {
                menu.addItem({
                    icon: "iconSettings",
                    label: this.i18n.settings,
                    click: () => void this.openSetting(),
                });
                menu.addItem({
                    icon: "iconLayout",
                    label: this.i18n.switchTabs,
                    click: () => {
                        this.showSwitcher();
                    },
                });
            },
            callback: () => {
                openSecondPanel.call(this);
            },
        };
        this.addTopBar(secondPanelTopBar);

        // 注册侧边栏 dock 面板（桌面）与手机端入口（顶栏 + FAB），互斥
        if (!this.isMobile) {
            this.registerDesktopDock();
        }
        if (this.isMobile) {
            this.registerMobileEntries();
        } else {
            // ADR 0072: only the desktop window mounts a floating ball; the
            // sidebar dock no longer hosts its own portal.
            this.updateFloatingBallVisibility();
        }

        this.captureRecentOpenSnapshot();
        // T-6796：设置加载完成后应用已保存的皮肤（body 标记）
        this.applySkin();
        // T-6823：密度档位（body 标记）随 onload 一并应用
        this.applyDensity();
        this.bindGlobalEvents();
        // 命令注册经 safeRegisterPluginCommand 隔离：内核 addCommand 抛错（如
        // globalCallback 触发的 sendGlobalShortcut 读 window.siyuan.languages["_trayMenu"]
        // 而 languages 未就绪，issue #1）不得中断 onload——否则后面整个
        // registerAgentCapabilities 与受控动作注册都会被跳过。
        safeRegisterPluginCommand(this, {
            langKey: "switchTabs",
            hotkey: DEFAULT_HOTKEY,
            callback: () => {
                this.showSwitcher();
            },
        }, (langKey, error) => logger.warn(`register plugin command ${langKey} fail`, error));
        // globalCallback: 焦点不在思源时也执行。思源为这类命令提供系统级
        // 全局热键位（设置→快捷键 里绑定"全局"），触发时会同时把思源带到前台。
        // languages 未就绪的宿主时序下降级为仅应用内热键（见上方 issue #1 注释）。
        const secondPanelCommand: {langKey: string; hotkey: string; callback: () => void; globalCallback?: () => void} = {
            langKey: "secondPanel",
            hotkey: SECOND_PANEL_HOTKEY,
            callback: () => {
                openSecondPanel.call(this);
            },
        };
        if (isGlobalShortcutHostReady((window as {siyuan?: {languages?: unknown}}).siyuan)) {
            secondPanelCommand.globalCallback = () => {
                openSecondPanel.call(this);
            };
        }
        safeRegisterPluginCommand(this, secondPanelCommand, (langKey, error) => logger.warn(`register plugin command ${langKey} fail`, error));
        // T-6327：思源 v3.8.3 起自带命令面板，多注册命令零 UI 成本地提升可发现性。
        safeRegisterPluginCommand(this, {
            langKey: "openSettings",
            hotkey: "",
            callback: () => {
                void this.openSetting();
            },
        }, (langKey, error) => logger.warn(`register plugin command ${langKey} fail`, error));
        safeRegisterPluginCommand(this, {
            langKey: "openJournal",
            hotkey: "",
            callback: () => {
                void this.openJournal();
            },
        }, (langKey, error) => logger.warn(`register plugin command ${langKey} fail`, error));
        safeRegisterPluginCommand(this, {
            langKey: "clipboardEntry",
            hotkey: "",
            callback: () => {
                void this.openClipboardEntry();
            },
        }, (langKey, error) => logger.warn(`register plugin command ${langKey} fail`, error));
        this.registerAgentCapabilities();
        // 受控导航动作：Agent 可把查询结果直接打开为页面（不修改任何笔记数据）
        const pluginWithAgentAction = this as unknown as {
            addAgentCapability?: (options: Record<string, unknown>) => string;
        };
        registerAgentActionCapability(pluginWithAgentAction, {
            spec: AGENT_CAPABILITY_SPECS.openDocument,
            // ADR 0063：效果显式声明 localRead（免确认）——确认链由宿主 Agent 确认卡承担
            effects: {localRead: true, localWrite: false, dataEgress: false, externalCost: false},
            handler: async (args: Record<string, unknown>) => {
                const id = normalizeAgentDocumentId(args?.id);
                if (!id) return {error: "invalid document id"};
                try {
                    if (this.isMobile) {
                        await this.mobileOpenDoc(id);
                    } else {
                        await openTab({app: this.app, doc: {id}});
                    }
                    return {structuredContent: {ok: true, id}, result: JSON.stringify({ok: true, id})};
                } catch (error) {
                    logger.warn("Agent open document fail", error);
                    return {error: "open failed"};
                }
            },
        }, (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));

        // 受控导航（批量）：AI 一次打开最多 5 篇文档组成工作区。ADR 0063：批量动作
        // 声明 localWrite → 确认（含标题列表、超时=拒绝）由宿主 Agent 确认卡承担
        // T-6692b 灰度开关：受控写入/批量动作受 agentActionsEnabled 总开关约束（默认开）；
        // 关闭后仅保留只读能力与单文档导航（open-document），执行链一并停用
        const agentActionsOn = this.getSettings().agentActionsEnabled !== false;
        if (agentActionsOn) {
        registerAgentActionCapability(pluginWithAgentAction, {
            spec: AGENT_CAPABILITY_SPECS.openDocuments,
            effects: {localRead: true, localWrite: true, dataEgress: false, externalCost: false},
            handler: async (args: Record<string, unknown>) => {
                const ids = normalizeAgentDocumentIds(args?.ids);
                if (ids.length === 0) return {error: "no valid document ids"};
                const opened: string[] = [];
                const failed: string[] = [];
                for (const id of ids) {
                    try {
                        if (this.isMobile) {
                            await this.mobileOpenDoc(id);
                        } else {
                            await openTab({app: this.app, doc: {id}});
                        }
                        opened.push(id);
                    } catch (error) {
                        logger.warn("Agent batch open document fail", id, error);
                        failed.push(id);
                    }
                }
                return {structuredContent: {ok: failed.length === 0, opened, failed}, result: JSON.stringify({ok: failed.length === 0, opened, failed})};
            },
        }, (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));

        // 受控写试点：AI 切换任务勾选状态。确认（含任务摘要、超时=拒绝）由宿主
        // Agent 确认卡按 localWrite 声明承担，只改勾选标记不改写任务文本
        registerAgentActionCapability(pluginWithAgentAction, {
            spec: AGENT_CAPABILITY_SPECS.updateTask,
            effects: {localRead: true, localWrite: true, dataEgress: false, externalCost: false},
            handler: async (args: Record<string, unknown>) => {
                const id = normalizeAgentDocumentId(args?.id);
                const done = args?.done === true;
                if (!id) return {error: "invalid task id"};
                const rowJson = await this.fetchKernelJson("/api/query/sql", {
                    stmt: `SELECT markdown, content FROM blocks WHERE id='${id}' AND type='p'`,
                });
                const row = (rowJson?.data || [])[0] as {markdown?: string; content?: string} | undefined;
                if (!row) return {error: "task not found"};
                const newMarkdown = flipTaskMarkdown(String(row.markdown || ""), done);
                if (!newMarkdown) return {error: "not a task block"};
                const updateJson = await this.fetchKernelJson("/api/block/updateBlock", {
                    dataType: "markdown", data: this.clampTaskWritePayload(newMarkdown), id,
                });
                if (!updateJson || updateJson.code !== 0) return {error: "update failed"};
                return {structuredContent: {ok: true, id, done}, result: JSON.stringify({ok: true, id, done})};
            },
        }, (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));

        // 受控写：AI 在指定笔记本下新建文档（确认由宿主确认卡按 localWrite 声明承担；
        // 参数 notebook 支持 ID 或名称）
        registerAgentActionCapability(pluginWithAgentAction, {
            spec: AGENT_CAPABILITY_SPECS.createDocument,
            effects: {localRead: true, localWrite: true, dataEgress: false, externalCost: false},
            handler: async (args: Record<string, unknown>) => {
                const rawNotebook = String(args?.notebook || "").trim();
                const title = String(args?.title || "").trim().slice(0, 128);
                const markdown = String(args?.markdown || "").slice(0, 4096);
                if (!rawNotebook || !title) return {error: "notebook and title are required"};
                const notebooks = await this.loadNotebooks();
                const target = normalizeAgentNotebookId(rawNotebook)
                    ? notebooks.find((nb) => nb.id === rawNotebook)
                    : notebooks.find((nb) => nb.name === rawNotebook);
                if (!target) return {error: "unknown notebook"};
                const createJson = await this.fetchKernelJson("/api/filetree/createDocWithMd", {
                    notebook: target.id, path: title, markdown,
                });
                if (!createJson || createJson.code !== 0) {
                    logger.warn("Agent create document fail", createJson?.msg);
                    return {error: "create failed"};
                }
                // createDocWithMd 不回传文档 ID：按标题回查最近创建的同名根文档
                const locate = await this.fetchKernelJson("/api/query/sql", {
                    stmt: `SELECT id FROM blocks WHERE type='d' AND content='${title.split("'").join("''")}' ORDER BY created DESC LIMIT 1`,
                });
                const docId = (locate?.data || [])[0]?.id || "";
                return {structuredContent: {ok: true, notebook: target.id, title, docId}, result: JSON.stringify({ok: true, notebook: target.id, title, docId})};
            },
        }, (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));

        // 受控写：向今日日记末尾追加一条内容（日记缺失自动创建；确认由宿主确认卡
        // 按 localWrite 声明承担；只追加不改写）
        registerAgentActionCapability(pluginWithAgentAction, {
            spec: AGENT_CAPABILITY_SPECS.appendToJournal,
            effects: {localRead: true, localWrite: true, dataEgress: false, externalCost: false},
            handler: async (args: Record<string, unknown>) => {
                const content = sanitizeJournalAppend(args?.content);
                if (!content) return {error: "invalid content"};
                const notebook = normalizeAgentNotebookId(this.getSettings().journalNotebook);
                if (!notebook) return {error: "journal notebook not configured"};
                const docId = await this.ensureTodayJournal(notebook);
                if (!docId) return {error: "journal unavailable"};
                const appendJson = await this.fetchKernelJson("/api/block/appendBlock", {
                    dataType: "markdown", data: content, parentID: docId,
                });
                if (!appendJson || appendJson.code !== 0) return {error: "append failed"};
                return {structuredContent: {ok: true, docId}, result: JSON.stringify({ok: true, docId})};
            },
        }, (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));        }
        this.registerWorkspacePlanCapabilities(pluginWithAgentAction);
        this.registerBuiltinHomeAdapters();
    }

    // T-1219 执行链（ADR 0063 宿主路线）：
    // - propose（只读，localRead）：把请求步骤归一化为固定白名单动作计划（≤8 步、带过期），不执行；
    // - execute（localWrite）：整份计划是一次确认单元——宿主确认卡展示计划并承担批准/超时/取消，
    //   批准后按序执行并返回有界回执。结构/过期校验在执行侧强制；单步失败不阻断其余步骤。
    private registerWorkspacePlanCapabilities(pluginWithAgent: {addAgentCapability?: (options: Record<string, unknown>) => string}) {
        registerReadOnlyAgentCapabilities(pluginWithAgent, [{
            spec: WORKSPACE_PLAN_SPEC,
            handler: async (args: Record<string, unknown>) => {
                const plan = buildWorkspacePlan(args);
                if (!plan || !plan.steps.length) return {error: "no valid steps"};
                return {structuredContent: plan, result: JSON.stringify(plan)};
            },
        }], (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));

        registerAgentActionCapability(pluginWithAgent, {
            spec: WORKSPACE_EXECUTE_SPEC,
            effects: {localRead: true, localWrite: true, dataEgress: false, externalCost: false},
            handler: async (args: Record<string, unknown>) => {
                // T-6692b 灰度开关：execute 受 agentActionsEnabled 约束（注册期一次性判定）
                if (this.getSettings().agentActionsEnabled === false) return {error: "agent actions disabled"};
                const plan = args?.plan && typeof args.plan === "object" ? args.plan : args;
                if (!validateWorkspacePlan(plan).ok) return {error: "invalid plan"};
                if (isWorkspacePlanExpired(plan)) return {error: "plan expired"};
                const handlers = createWorkspaceHostHandlers({
                    navigation: {
                        isMobile: this.isMobile, app: this.app, openTab,
                        tabs: getSiyuan()?.mobile?.tabs, logger,
                    },
                    documentSet: {
                        getSet: (setId: string) => {
                            const sets = normalizeDocumentSets(this.data[DOCUMENT_SETS_KEY]).sets as Array<{setId?: string}>;
                            return sets.find((item) => item.setId === setId) || null;
                        },
                        openDocument: (rootId: string) =>
                            this.isMobile ? this.mobileOpenDoc(rootId) : openDocumentOnDesktop({rootId, app: this.app, openTab, logger}),
                    },
                    write: {
                        readTask: async (id: string) => {
                            const json = await this.fetchKernelJson("/api/query/sql", {
                                stmt: `SELECT markdown, content FROM blocks WHERE id='${id}' AND type='p'`,
                            });
                            return (json?.data || [])[0];
                        },
                        updateBlock: async (id: string, markdown: string) => {
                            const json = await this.fetchKernelJson("/api/block/updateBlock", {
                                dataType: "markdown", data: this.clampTaskWritePayload(markdown), id,
                            });
                            return !!json && json.code === 0;
                        },
                        createDocument: async (payload: {notebook: string; title: string; markdown: string}) => {
                            const notebooks = await this.loadNotebooks();
                            const target = normalizeAgentNotebookId(payload.notebook)
                                ? notebooks.find((nb) => nb.id === payload.notebook)
                                : notebooks.find((nb) => nb.name === payload.notebook);
                            if (!target) return {docId: ""};
                            const created = await this.fetchKernelJson("/api/filetree/createDocWithMd", {
                                notebook: target.id, path: payload.title, markdown: payload.markdown,
                            });
                            if (!created || created.code !== 0) return {docId: ""};
                            // createDocWithMd 不回传 ID：按标题回查最近创建的同名根文档
                            const locate = await this.fetchKernelJson("/api/query/sql", {
                                stmt: `SELECT id FROM blocks WHERE type='d' AND content='${payload.title.split("'").join("''")}' ORDER BY created DESC LIMIT 1`,
                            });
                            return {docId: (locate?.data || [])[0]?.id || ""};
                        },
                        ensureJournal: (notebook: string) => this.ensureTodayJournal(notebook),
                        appendBlock: async (docId: string, content: string) => {
                            const json = await this.fetchKernelJson("/api/block/appendBlock", {
                                dataType: "markdown", data: content, parentID: docId,
                            });
                            return !!json && json.code === 0;
                        },
                        notebook: normalizeAgentNotebookId(this.getSettings().journalNotebook),
                    },
                });
                const actionMap: Record<string, (step: Record<string, unknown>, context: {signal?: AbortSignal}) => Promise<unknown>> = {
                    "open-document": handlers.openDocument,
                    "open-documents": handlers.openDocuments,
                    "restore-document-set": handlers.restoreDocumentSet,
                    "update-task-status": handlers.updateTaskStatus,
                    "create-document": handlers.createDocument,
                    "append-to-journal": handlers.appendToJournal,
                };
                const receipt = await runWorkspacePlan(plan, {
                    approved: true, // 宿主确认卡即审批：本能力声明 localWrite，批准/超时/取消由宿主承担
                    runStep: async (step: Record<string, unknown>) => {
                        const handler = actionMap[String(step.action)];
                        return handler ? handler(step, {}) : {status: "failed", reason: "unsupported_action"};
                    },
                });
                return {structuredContent: receipt, result: JSON.stringify(receipt)};
            },
        }, (error: unknown, spec: {name?: string}) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));
    }

    // T-6685 RSS 已读状态：宿主侧唯一读写点。读取返回归一化后的 seen 映射；
    // 标记合并进当前状态后重新有界化（最旧剪除），去抖落盘。
    public rssReadState(): Record<string, number> {
        return normalizeRssReadState(this.data[RSS_READ_KEY]).seen;
    }

    public markRssItemsSeen(keys: string[]): void {
        if (!Array.isArray(keys) || keys.length === 0) return;
        const state = normalizeRssReadState(this.data[RSS_READ_KEY]);
        const stamp = Date.now();
        for (const key of keys) {
            if (typeof key === "string" && key.length >= 1 && key.length <= 128) state.seen[key] = stamp;
        }
        const bounded = normalizeRssReadState(state);
        this.data[RSS_READ_KEY] = bounded;
        this.saveDataDebounced(RSS_READ_KEY);
    }

    // 只读取持久化 key、不产生任何写入：onload 与 onDataChanged 共用同一份清单，
    // 防止两处 key 列表各写一遍而漂移。
    private async loadPersistentKeys() {
        return Promise.all(PERSISTENT_KEYS.map((key) => this.loadData(key)))
            .catch((e) => logger.warn("load data fail", e));
    }

    // 预加载 13 个持久化 key：loadData 写入 this.data，让 getMru 等能读到旧值
    private async initPersistentData() {
        await this.loadPersistentKeys();
        // 加载期 sanitize：清理历史脏数据（0.16.5），仅在确实变化时回写，避免每次启动重写文件
        this.sanitizePersistentData();
        // 存储迁移演练快照（v0.20 数据连续性，D-386）：在宿主静默修复链之后运行
        // 同源演练管道，生成只读恢复报告存实例内存——不落盘、不重写数据。
        // 报告出现 cleaned/reset 即暴露宿主清洗缺口，是演练同源性的运行时验证。
        this.captureStorageMigrationSnapshot();
        this.runQuickActionDefaultsMigration();
        // 存储版本戳（D-401）：在全部加载期清洗与一次性迁移之后落戳——戳存在
        // 即代表"这份数据已经过当前版本的全部加载期处理"。仅在 onload 路径执行；
        // onDataChanged 钩子链禁写盘（写盘会再次广播形成回环），不做落戳。
        this.stampStorageSchemaVersion();
        // 收藏分组折叠状态：从持久化数据初始化（旧版本无此数据时为默认展开）
        this.initFavCollapsed();
    }

    // 存储版本戳（D-401）：STORAGE_SCHEMA_VERSION 此前只存在于演练管道，
    // 无处持久化，因此无法识别"数据来自更新/更旧版本的插件"。
    // 语义：缺失或损坏 → 落当前版本；等于当前版本 → 幂等跳过（无写入）；
    // 小于当前版本 → 未来版本迁移入口，当前对齐后落戳；大于当前版本 →
    // 疑似降级：保留原值不覆写（抹掉会丢失证据），记录字段并告警。
    private stampStorageSchemaVersion() {
        const stored = this.data[SCHEMA_VERSION_KEY];
        if (stored === STORAGE_SCHEMA_VERSION) return;
        if (typeof stored === "number" && Number.isInteger(stored) && Number.isFinite(stored) && stored >= 1) {
            if (stored > STORAGE_SCHEMA_VERSION) {
                this.storageSchemaDowngradeFrom = stored;
                logger.warn("storage schema stamp is newer than the plugin (downgrade suspected); value preserved", {
                    stored,
                    current: STORAGE_SCHEMA_VERSION,
                });
                return;
            }
        }
        this.data[SCHEMA_VERSION_KEY] = STORAGE_SCHEMA_VERSION;
        this.saveDataDebounced(SCHEMA_VERSION_KEY);
    }

    // 加载期数据净化：收藏列表结构校验/按 key 去重，置顶与分组注册表过滤非法字符串
    private sanitizePersistentData() {
        const favorites = sanitizeFavorites(this.data[FAV_KEY], FAVORITES_MAX);
        if (favorites.changed) {
            this.data[FAV_KEY] = favorites.items;
            this.saveDataDebounced(FAV_KEY);
        }
        const pinned = sanitizeStringList(this.data[PINNED_KEY], PINNED_MAX);
        if (pinned.changed) {
            this.data[PINNED_KEY] = pinned.items;
            this.saveDataDebounced(PINNED_KEY);
        }
        const groups = sanitizeStringList(this.data[FAV_GROUPS_KEY], FAVORITE_GROUPS_MAX);
        if (groups.changed) {
            this.data[FAV_GROUPS_KEY] = groups.items;
            this.saveDataDebounced(FAV_GROUPS_KEY);
        }
        const history = sanitizeOpenHistory(this.data[HISTORY_KEY], HISTORY_MAX);
        if (history.changed) {
            this.data[HISTORY_KEY] = history.items;
            this.saveDataDebounced(HISTORY_KEY);
        }
        const closedHistory = normalizeClosedEntries(this.data[CLOSED_HISTORY_KEY], HISTORY_MAX);
        if (closedHistory.changed) {
            this.data[CLOSED_HISTORY_KEY] = closedHistory.items;
            this.saveDataDebounced(CLOSED_HISTORY_KEY);
        }
        const quickActions = sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY], QUICK_ACTIONS_MAX);
        if (quickActions.changed) {
            this.data[QUICK_ACTIONS_KEY] = quickActions.items;
            this.saveDataDebounced(QUICK_ACTIONS_KEY);
        }
        const documentSets = normalizeDocumentSets(this.data[DOCUMENT_SETS_KEY]);
        if (documentSets.changed || this.data[DOCUMENT_SETS_KEY]?.schemaVersion !== documentSets.schemaVersion) {
            this.data[DOCUMENT_SETS_KEY] = documentSets;
            this.saveDataDebounced(DOCUMENT_SETS_KEY);
        }
        // 缩略图缓存（v0.20 数据连续性，D-392）：此前只有写入侧上限，而写入侧只拦新增、
        // 不清理存量——磁盘上的超限/损坏条目无处回收（结构损坏，或手机端 v0.7.0 写入侧
        // 误用桌面上限、v0.8.0 起收紧到 30 条 / 80 KiB 后留下的 31~40 条残留）。
        // 桌面 40 条 / 200 KiB 自 v0.2.0 引入起从未变过。
        // 这里按当前端型（手机上限更保守）做读取侧归一化，规则与 setThumbCache 完全镜像。
        const thumbCache = normalizeThumbCache(this.data[THUMB_CACHE_KEY], {
            max: this.isMobile ? THUMB_CACHE_MAX_MOBILE : THUMB_CACHE_MAX,
            htmlMax: this.isMobile ? THUMB_HTML_MAX_MOBILE : THUMB_HTML_MAX,
        });
        if (thumbCache.changed) {
            this.data[THUMB_CACHE_KEY] = thumbCache.cache;
            this.saveDataDebounced(THUMB_CACHE_KEY);
        }
    }

    // 存储迁移演练快照（D-386 第二步·保守桥接）：宿主静默修复链已执行完毕，
    // 此处用同源演练管道对 this.data 再做一次只读演练。理想情况下全部 kept；
    // 出现 cleaned/reset 即宿主清洗与演练管道存在缺口，报告即为发现机制。
    // 报告仅存实例内存（有界、无原始数据回显），不落盘、不重写 this.data。
    private captureStorageMigrationSnapshot() {
        const payloads: Record<string, unknown> = {};
        for (const key of KEY_ORDER) {
            payloads[key] = this.data[key];
        }
        const result = runStorageMigration(payloads, {
            // 端型上限必须与 sanitizePersistentData / setThumbCache 一致，否则演练会
            // 与宿主判级分叉：手机端缓存上限 30/80 KiB 比桌面 40/200 KiB 更紧，
            // 若演练恒用桌面上限，手机端宿主已清洗的 key 会在报告里显示为 kept，
            // 而 35 条缓存在手机端会显示 kept、实际宿主会 cleaned——报告就不再同源。
            limits: {
                thumbCache: this.isMobile ? THUMB_CACHE_MAX_MOBILE : THUMB_CACHE_MAX,
                thumbHtml: this.isMobile ? THUMB_HTML_MAX_MOBILE : THUMB_HTML_MAX,
            },
        });
        this.storageMigrationReport = result.report;
        const anomalies = result.report.keys.filter((entry) => entry.status === "cleaned" || entry.status === "reset" || entry.status === "migrated");
        if (anomalies.length > 0) {
            logger.warn("storage migration drill found gaps after host sanitize", {
                keys: anomalies.map((entry) => `${entry.key}:${entry.status}`).join(","),
            });
        }
    }

    // One-time migration: pre-marker quick-action bars were machine-written
    // from older default sets (auto-registered provider entries included).
    // Reset them to the current minimal defaults exactly once; from then on
    // the stored marker keeps user curation untouched.
    private runQuickActionDefaultsMigration() {
        const decision = migrateQuickActionDefaults(this.data[QUICK_ACTIONS_KEY], this.data[QUICK_ACTIONS_DEFAULTS_KEY]);
        if (!decision.migrated) return;
        this.data[QUICK_ACTIONS_KEY] = decision.items as IQuickAction[];
        this.saveDataDebounced(QUICK_ACTIONS_KEY);
        this.data[QUICK_ACTIONS_DEFAULTS_KEY] = QUICK_ACTION_DEFAULTS_VERSION;
        this.saveDataDebounced(QUICK_ACTIONS_DEFAULTS_KEY);
    }

    // 桌面侧边栏 dock：与切换器同样的卡片列表，常驻便于快速切换；
    // resize 只重算缩略图缩放比例，不重建列表（避免闪烁与滚动位置丢失）
    private registerDesktopDock() {
        const self = this;
        this.addDock({
            config: {
                position: "RightBottom",
                size: {width: SIDEBAR_DEFAULT_WIDTH_PX, height: 0},
                icon: "iconLayout",
                title: this.i18n.switchTabs,
                show: false,
            },
            data: {},
            type: SIDEBAR_DOCK_TYPE,
            init() {
                const handler = this as unknown as IDockHandlerSelf;
                self.renderSidebarPanel(handler.element as HTMLElement);
            },
            resize() {
                const handler = this as unknown as IDockHandlerSelf;
                const element = handler.element;
                if (element?.isConnected) {
                    self.rescaleThumbs(element);
                }
            },
        });
    }

    // 手机端入口：顶栏按钮（常驻，思源 3.8.x 不开放插件顶栏，自行插入）
    // + 悬浮按钮（可选，设置里可关）
    private registerMobileEntries() {
        this.ensureMobileTopBarButton();
        this.updateFABVisibility();
    }

    // 全局事件：切换 / 打开 / 关闭页签时同步侧边栏高亮或全量刷新；
    // 手机端顺带确认入口按钮仍在（内核个别场景会重建顶栏 DOM）
    private bindGlobalEvents() {
        if (this.globalEventHandlers) return;
        const switchProtyle = () => {
            this.refreshSidebarActive();
            this.scheduleOpenSwitchersRefresh();
            if (this.isMobile) {
                this.ensureMobileTopBarButton();
            }
        };
        // 页签增减（文档打开/关闭）时全量刷新侧边栏列表
        const loadedProtyle = () => {
            this.captureRecentOpenSnapshot();
            if (this.syncing) return;
            // 侧栏全量重建合并调度：批量开关文档时不再逐事件重建
            this.scheduleSidebarRefresh();
            this.scheduleOpenSwitchersRefresh();
        };
        const destroyProtyle = () => {
            this.scheduleRecentClosedSync();
            if (this.syncing) return;
            this.scheduleSidebarRefresh();
            this.scheduleOpenSwitchersRefresh();
        };
        const syncStart = () => {
            this.syncDepth += 1;
            this.syncRefreshPending = true;
            this.armSyncWatchdog();
            this.setSyncPresentation(true);
        };
        const syncFinish = (failed = false) => {
            if (failed) {
                this.syncDepth = 0;
            } else if (this.syncDepth > 0) {
                this.syncDepth -= 1;
            }
            if (this.syncDepth > 0) return;
            this.clearSyncWatchdog();
            this.syncRefreshPending = false;
            this.setSyncPresentation(false);
            this.scheduleSidebarRefresh();
        };
        const syncEnd = () => syncFinish(false);
        const syncFail = () => syncFinish(true);
        this.globalEventHandlers = {switchProtyle, loadedProtyle, destroyProtyle, syncStart, syncEnd, syncFail};
        this.eventBus.on("switch-protyle", switchProtyle);
        this.eventBus.on("loaded-protyle-static", loadedProtyle);
        this.eventBus.on("destroy-protyle", destroyProtyle);
        this.eventBus.on("sync-start", syncStart);
        this.eventBus.on("sync-end", syncEnd);
        this.eventBus.on("sync-fail", syncFail);
    }

    private setSyncPresentation(syncing: boolean) {
        this.syncing = syncing;
        const roots: HTMLElement[] = [];
        if (this.sidebarElement) roots.push(this.sidebarElement);
        document.querySelectorAll<HTMLElement>(".sw-home").forEach((root) => roots.push(root));
        roots.forEach((root) => {
            root.classList.toggle("sw--syncing", syncing);
            root.setAttribute("aria-busy", String(syncing));
            root.dataset.syncing = String(syncing);
        });
    }

    private clearSyncWatchdog() {
        if (this.syncWatchdogTimer !== null) {
            window.clearTimeout(this.syncWatchdogTimer);
            this.syncWatchdogTimer = null;
        }
    }

    private armSyncWatchdog() {
        this.clearSyncWatchdog();
        this.syncWatchdogTimer = window.setTimeout(() => {
            this.syncWatchdogTimer = null;
            if (!this.syncing) return;
            this.syncDepth = 0;
            this.syncRefreshPending = false;
            this.setSyncPresentation(false);
            this.scheduleSidebarRefresh();
        }, SYNC_WATCHDOG_MS);
    }

    private registerSwitcherRefresh(callback: () => void): () => void {
        this.switcherRefreshers.add(callback);
        return () => this.switcherRefreshers.delete(callback);
    }

    private refreshOpenSwitchers() {
        Array.from(this.switcherRefreshers).forEach((refresh) => {
            try {
                refresh();
            } catch (e) {
                logger.warn("refresh switcher fail", e);
            }
        });
    }

    private scheduleOpenSwitchersRefresh() {
        if (this.switcherRefreshFrame !== null || this.switcherRefreshers.size === 0) return;
        const refresh = () => {
            this.switcherRefreshFrame = null;
            this.switcherRefreshFrameCancel = null;
            this.refreshOpenSwitchers();
        };
        if (typeof requestAnimationFrame === "function") {
            const frame = requestAnimationFrame(refresh);
            this.switcherRefreshFrame = frame;
            this.switcherRefreshFrameCancel = () => cancelAnimationFrame(frame);
        } else {
            const timer = window.setTimeout(refresh, 16);
            this.switcherRefreshFrame = timer;
            this.switcherRefreshFrameCancel = () => window.clearTimeout(timer);
        }
    }

    private scheduleAnimationFrame(callback: FrameRequestCallback): number {
        if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
        return window.setTimeout(() => callback(Date.now()), 16);
    }

    // 布局就绪后再次确认手机端入口：部分机型上 onload 执行时顶栏尚未构建完成，
    // 插件按钮会插入失败；这里兜底重试一次
    onLayoutReady() {
        this.isMobile ? this.ensureMobileTopBarButton() : undefined;
        this.updateFloatingBallVisibility();
        this.exposePublicApi();
        this.setupBreadcrumbEntry();
    }

    // T-6831 面包屑入口：3.8.5+ Plugin.addBreadcrumbButton（v3.8.5 源码实证，
    // icon 须为 svg id/tag）。旧版宿主无此方法=能力缺失，静默不挂载不报错。
    private breadcrumbButtonId = "";

    private setupBreadcrumbEntry() {
        const host = this as unknown as {
            addBreadcrumbButton?: (options: {id: string; icon: string; title: string; callback: (event: MouseEvent) => void}) => string;
        };
        if (typeof host.addBreadcrumbButton !== "function") return;
        try {
            this.breadcrumbButtonId = host.addBreadcrumbButton({
                id: "swBreadcrumbEntry",
                icon: "iconSearch",
                title: this.i18n.breadcrumbEntry,
                callback: () => {
                    if (!this.isMobile && !this.isUnloading) this.showSwitcher(true);
                },
            }) || "";
        } catch (error) {
            logger.warn("breadcrumb entry unavailable", error);
            this.breadcrumbButtonId = "";
        }
    }

    private teardownBreadcrumbEntry() {
        if (!this.breadcrumbButtonId) return;
        const host = this as unknown as {removeBreadcrumbButton?: (id: string) => void};
        if (typeof host.removeBreadcrumbButton === "function") {
            try {
                host.removeBreadcrumbButton(this.breadcrumbButtonId);
            } catch (error) {
                logger.warn("breadcrumb entry teardown fail", error);
            }
        }
        this.breadcrumbButtonId = "";
    }

    /**
     * T-6833 公开钩子：E2E 真实例测试与生态消费的稳定入口
     * （契约对齐小驴打卡 window.siyuanCheckin：whenReady 为就绪信号）。
     * 钩子在 onLayoutReady 后挂载——它的存在本身即代表初始化完成；
     * onunload 移除，不留悬挂引用。只暴露受控动作，不泄漏内部状态。
     */
    private exposePublicApi() {
        (window as any).siyuanSpeedSwitch = {
            whenReady: () => true,
            openSwitcher: () => {
                if (!this.isMobile && !this.isUnloading) {
                    this.showSwitcher(true);
                }
            },
        };
    }

    /**
     * 宿主默认行为：插件存储数据变化时整体重载插件（并等待返回的 Promise）。
     * 小驴雷切有 13 个持久化 key，任一跨设备同步合并（sync）或其他窗口写盘（overwrite）
     * 都会销毁已打开的切换器/第二面板与搜索会话，表现为图标闪烁、弹窗凭空关闭。
     * 这里改为有界重读 + 惰性刷新。
     *
     * 纪律：本钩子调用链内不得写盘——写盘会再次广播数据变更并回到本钩子，形成
     * "写⇄重载"回环。因此只走只读的 loadPersistentKeys + 只读演练，跳过
     * sanitizePersistentData 与一次性默认值迁移这类会回写的步骤；各 getter 的读时
     * sanitize 仍会兜住脏数据，加载期收敛留给下一次 onload。
     * 另：宿主在拆除预算内等待本钩子返回的 Promise，故必须保持有界、不并发重入。
     */
    async onDataChanged(reason?: TPluginDataChangeReason) {
        if (this.isUnloading || this.dataChangeReloadInFlight) {
            this.dataChangeReloadQueued = true;
            return;
        }
        this.dataChangeReloadInFlight = true;
        try {
            do {
                this.dataChangeReloadQueued = false;
                await this.loadPersistentKeys();
                this.settingsCache = null;
                this.updateFloatingBallVisibility();
                this.captureStorageMigrationSnapshot();
                this.initFavCollapsed();
                this.scheduleSidebarRefresh();
            } while (this.dataChangeReloadQueued);
        } catch (error) {
            logger.warn("data change refresh fail", {reason: reason || "unknown"});
            logger.debug(error);
        } finally {
            this.dataChangeReloadInFlight = false;
            this.dataChangeReloadQueued = false;
        }
    }

    async onunload() {
        this.isUnloading = true;
        this.lifecycleGeneration += 1;
        // T-6831：面包屑入口随生命周期拆除
        this.teardownBreadcrumbEntry();
        // T-6823：密度档位标记随生命周期移除
        if (typeof document !== "undefined" && document.body) {
            delete document.body.dataset.swDensity;
        }
        // T-6833：公开钩子随生命周期拆除
        if (typeof window !== "undefined") {
            delete (window as any).siyuanSpeedSwitch;
        }
        // T-6796 皮肤层：卸载时移除 body 标记，宿主恢复纯净主题
        if (typeof document !== "undefined" && document.body) {
            delete document.body.dataset.swSkin;
        }
        const pendingSaves = this.flushPendingSaves();
        const globalEventHandlers = this.globalEventHandlers;
        if (globalEventHandlers && typeof this.eventBus.off === "function") {
            this.eventBus.off("switch-protyle", globalEventHandlers.switchProtyle);
            this.eventBus.off("loaded-protyle-static", globalEventHandlers.loadedProtyle);
            this.eventBus.off("destroy-protyle", globalEventHandlers.destroyProtyle);
            this.eventBus.off("sync-start", globalEventHandlers.syncStart);
            this.eventBus.off("sync-end", globalEventHandlers.syncEnd);
            this.eventBus.off("sync-fail", globalEventHandlers.syncFail);
        }
        this.globalEventHandlers = null;
        this.syncDepth = 0;
        this.syncRefreshPending = false;
        this.syncing = false;
        this.clearSyncWatchdog();
        this.docSearchState.activeSessions.forEach((session) => disposeSearchSession(session));
        this.docSearchState.activeSessions.clear();
        this.activeAgentSearchControllers.forEach((controller) => controller.abort());
        this.activeAgentSearchControllers.clear();
        this.activeDocumentSetRestoreControllers.forEach((controller) => controller.abort());
        this.activeDocumentSetRestoreControllers.clear();
        // v0.17 阶段 1（D-220）：销毁 workspace 诊断运行时（registry/queue/coordinator）
        this.workspaceRuntimeDiagnostics?.dispose();
        this.workspaceRuntimeDiagnostics = null;
        // v0.17：卸载前写入脱敏 disposed 快照，再销毁历史容器；不向 Agent/UI 透传明细。
        this.agentReadOnlyAuditHistory.record(buildAgentReadOnlyAuditSnapshot({
            status: "unavailable",
            reason: "unavailable",
            disposed: true,
        }));
        this.agentReadOnlyAuditHistory.dispose();
        this.switcherRefreshers.clear();
        this.quickActionAdapters.clear();
        this.quickActionAdapterTargets.clear();
        this.quickActionProviders.clear();
        this.quickActionProviderTokens.clear();
        this.quickActionRegistry = createQuickActionRegistry();
        if (this.sidebarRefreshTimer) {
            window.clearTimeout(this.sidebarRefreshTimer);
            this.sidebarRefreshTimer = 0;
        }
        this.groupFlowObserver?.disconnect();
        this.groupFlowObserver = null;
        this.homeRuntime.dispose();
        clearLifeWidgetCaches();
        this.homeModuleChangeListeners.clear();
        this.closeHistoryMenu();
        this.sidebarHistoryDropdownDispose?.();
        this.sidebarHistoryDropdownDispose = null;
        this.sidebarSearchFilterDispose?.();
        this.sidebarSearchFilterDispose = null;
        this.historyDropdownCloseSet.forEach((close) => close());
        this.historyDropdownCloseSet.clear();
        document.querySelectorAll<HTMLElement>(".sw__mobile-sort-overlay, .sw__mobile-sheet-overlay, .sw-quick-icon-picker-overlay").forEach((overlay) => overlay.remove());
        if (this.switcherRefreshFrame !== null) {
            this.switcherRefreshFrameCancel?.();
            this.switcherRefreshFrame = null;
            this.switcherRefreshFrameCancel = null;
        }
        if (this.recentClosedSyncTimer !== null) {
            window.clearTimeout(this.recentClosedSyncTimer);
            this.recentClosedSyncTimer = null;
        }
        this.sidebarResizeObserver?.disconnect();
        this.sidebarResizeObserver = null;
        this.sidebarIconObserver?.disconnect();
        this.sidebarIconObserver = null;
        this.sidebarIconFrameCancel?.();
        this.sidebarIconFrameCancel = null;
        this.removeDock(SIDEBAR_DOCK_TYPE);
        this.sidebarElement = null;
        this.floatingBallPanels.forEach((panel) => panel?.destroy());
        this.floatingBallPanels.clear();
        this.floatingBallUis.forEach((controller) => controller.destroy());
        this.floatingBallUis.clear();
        this.floatingBallUi = null;
        this.fabElement = null;
        this.fabModalDepth = 0;
        this.mobileTopBarButton?.remove();
        this.mobileTopBarButton = null;
        await pendingSaves;
    }

    // ==================== 鎸佷箙鍖栨€ц兘 ====================

    // 去抖写盘：高频数据（MRU/置顶/收藏）每次操作只更新内存，合并后延迟落盘，
    // 避免连续收藏/置顶/切换页签时每个动作都触发一次内核文件写入（交互卡顿的根因）
    // T-6466 存储用量透明化配套之前：Miniflux 分类发现——设置表单的分类选择器
    // 据此渲染选项；凭据仅经 X-Auth-Token 请求头，绝不写入日志或缓存。
    // T-6689 ActivityWatch 桶发现：仅本地端点（网络层白名单放行 /api/0/buckets），
    // 只保留 aw-watcher-window 类型，供配置表单下拉选择
    async loadActivityWatchBuckets(endpoint: string): Promise<Array<{id: string; hostname: string; label: string}>> {
        const url = buildActivityWatchBucketsUrl({endpoint});
        if (!url) return [];
        const envelope = await loadActivityWatchBuckets(url);
        return normalizeActivityWatchBuckets(envelope?.payload);
    }

    async loadMinifluxCategoryOptions(endpoint: string, token: string): Promise<Array<{id: string; name: string}>> {
        const normalized = normalizeMinifluxConfig({endpoint, token});
        if (!normalized.origin || !normalized.token) return [];
        try {
            const response = await this.fetchActivityWatchViaKernel(`${normalized.origin}/v1/categories`, {headers: {"X-Auth-Token": token}});
            if (!response || response.ok !== true) return [];
            const body = await response.text();
            const rows = JSON.parse(body);
            if (!Array.isArray(rows)) return [];
            const seen = new Set<string>();
            const items: Array<{id: string; name: string}> = [];
            for (const row of rows.slice(0, 64)) {
                const id = String(row && row.id !== undefined && row.id !== null ? row.id : "");
                const name = String(row && row.title !== undefined && row.title !== null ? row.title : "")
                    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
                if (!/^\d{1,12}$/.test(id) || !name || seen.has(id)) continue;
                seen.add(id);
                items.push({id, name});
            }
            return items;
        } catch {
            return [];
        }
    }

    // T-6463 存储用量透明化：逐常量显式 loadData（存储 key 审计门禁要求首参为 *_KEY
    // 常量），测量近似 UTF-8 字节数；单 key 读取失败按 0 计，不拖垮整个报表。
    async measureStorageUsage(): Promise<Array<{key: string, bytes: number}>> {
        const encoder = new TextEncoder();
        const measure = async (key: string, value: Promise<unknown>): Promise<{key: string, bytes: number}> => {
            let bytes = 0;
            try {
                const data = await value;
                const json = data === undefined || data === null ? "" : JSON.stringify(data);
                bytes = encoder.encode(json).length;
            } catch {
                bytes = 0;
            }
            return {key, bytes};
        };
        return Promise.all(PERSISTENT_KEYS.map((key) => measure(key, this.loadData(key))));
    }

    private saveDataDebounced(key: string) {
        if (this.isUnloading) return;
        const timer = this.saveTimers.get(key);
        if (timer) {
            clearTimeout(timer);
        }
        this.saveTimers.set(key, window.setTimeout(() => {
            this.saveTimers.delete(key);
            this.queueSave(key, this.data[key]);
        }, SAVE_DEBOUNCE_MS));
    }

    private queueSave(key: string, value: unknown): Promise<void> {
        const previous = this.saveChains.get(key) || Promise.resolve();
        const next = previous
            .then(() => this.saveData(key, value))
            .catch((e) => logger.warn("save data fail", e));
        this.saveChains.set(key, next);
        void next.then(() => {
            if (this.saveChains.get(key) === next) {
                this.saveChains.delete(key);
            }
        });
        return next;
    }

    // 立即落盘全部待写数据（卸载时调用，避免丢失最近一次去抖窗口内的改动）
    private flushPendingSaves(): Promise<void> {
        this.saveTimers.forEach((timer, key) => {
            clearTimeout(timer);
            this.queueSave(key, this.data[key]);
        });
        this.saveTimers.clear();
        return Promise.all(Array.from(this.saveChains.values())).then((): void => undefined);
    }

    // 旧版本默认快捷键 "⇧⌥S" 无法被思源热键匹配命中，且可能已持久化到快捷键配置中，
    // 加载时将其修正为可匹配的 "⌥⇧S"（组合键不变，仍是 Alt+Shift+S）
    private fixLegacyHotkey() {
        try {
            const siyuan = getSiyuan();
            const keymapItem = siyuan?.config?.keymap?.plugin?.[this.name]?.switchTabs;
            if (keymapItem && keymapItem.custom === LEGACY_HOTKEY) {
                keymapItem.custom = DEFAULT_HOTKEY;
            }
        } catch (e) {
            // 配置不可用时忽略，默认值本身已是正确顺序
        }
    }

    // ==================== 设置 ====================

    // 读取设置：与默认值合并，保证新增字段有默认值
    private settingsCache: ISwSettings | null = null;

    // 设置对象记忆化：规范化成本虽小但调用频次高（渲染/绑定路径每次都会读取），
    // 命中缓存时零开销返回；updateSettings 写入后统一失效
    private getSettings(): ISwSettings {
        if (!this.settingsCache) {
            this.settingsCache = this.computeSettings();
        }
        return this.settingsCache;
    }

    private computeSettings(): ISwSettings {
        // 磁盘读取的是 unknown，老版本/异常数据字段可能缺失，全部按字段逐一降级到默认值。
        // 用 Partial<ISwSettings> 把整个 saved 一次性收窄，后续字段访问就不再需要每行断言。
        const saved = this.data[SETTINGS_KEY];
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {...DEFAULT_SETTINGS};
        return normalizeSettings(saved, {
            defaults: DEFAULT_SETTINGS,
            clamp: (value: unknown, min: number, max: number, fallback: number) => this.clampNum(value, min, max, fallback),
            normalizeEnum: (value: unknown, allowed: readonly string[], fallback: string) => normalizeSortBy(value, allowed, fallback),
            ranges: {
                dialogWidth: [DIALOG_WIDTH_MIN_PX, DIALOG_WIDTH_MAX_PX],
                dialogHeight: [DIALOG_HEIGHT_MIN_PX, DIALOG_HEIGHT_MAX_PX],
                panelScale: [PANEL_SCALE_MIN, PANEL_SCALE_MAX],
                homeWidth: [480, 1920],
                homeHeight: [360, 1280],
                columns: [COLUMNS_MIN, COLUMNS_MAX],
                thumbHeight: [THUMB_HEIGHT_MIN_PX, THUMB_HEIGHT_MAX_PX],
                mobileColumns: [MOBILE_COLUMNS_MIN, MOBILE_COLUMNS_MAX],
                mobileThumbHeight: [MOBILE_THUMB_HEIGHT_MIN_PX, MOBILE_THUMB_HEIGHT_MAX_PX],
            },
            sortBy: SORT_BY_LIST,
            dockDisplay: DOCK_DISPLAY_LIST,
            sidebarLayout: SIDEBAR_LAYOUT_LIST,
            quickActions: () => sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY], QUICK_ACTIONS_MAX).items,
        }) as ISwSettings;
    }

    private normalizeQuickActionDisplay(value: unknown, fallback: QuickActionDisplay): QuickActionDisplay {
        return value === "full" || value === "icons" || value === "hidden" ? value : fallback;
    }

    private updateSettings(patch: Partial<ISwSettings>) {
        const settings = {...this.getSettings(), ...patch};
        this.data[SETTINGS_KEY] = settings;
        this.settingsCache = null; // 设置已变更，下一次读取重新规范化
        this.saveDataDebounced(SETTINGS_KEY);
        if (Object.prototype.hasOwnProperty.call(patch, "skin")) {
            this.applySkin();
        }
        if (Object.prototype.hasOwnProperty.call(patch, "density")) {
            this.applyDensity();
        }
        if (Object.keys(patch).some((key) => key !== "lastSettingsTab")) {
            this.refreshOpenSwitchers();
            if (this.sidebarElement?.isConnected) {
                this.refreshSidebar();
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, "floatingBall")) {
            this.updateFloatingBallVisibility();
            if (typeof document === "object") {
                document.querySelector<HTMLElement>(".sw-floating-ball-settings")
                    ?.dispatchEvent(new Event("sw-floating-ball-refresh"));
            }
        }
    }

    // T-6796 皮肤层应用：body 上只放标记属性；变量覆盖在 CSS 内限定于速切
    // 自己的根容器（.speed-switch/.sw-home/.sw-fab-root/.sw-settings-dialog），
    // 宿主思源与其他插件零影响。onload 应用、设置变更即刷新、onunload 移除。
    // ==================== T-6805 phase 3：全库标题拼音补齐 ====================
    // 纯 ASCII 查询且内核标题结果不足时，从惰性标题缓存（一次有界 SQL + 5 分钟
    // TTL）中按拼音补齐结果。缓存超界（>20000 行）整体重建。

    private pinyinTitleCache: {rows: Array<{id: string; title: string}>; ts: number} | null = null;

    private async getPinyinTitleMatches(keyword: string, existing: IDocSearchResult[]): Promise<IDocSearchResult[]> {
        if (this.isMobile) return [];
        const needle = keyword.trim().toLowerCase();
        if (!/^[a-z0-9]+$/.test(needle) || needle.length < 2) return [];
        const now = Date.now();
        if (!this.pinyinTitleCache || now - this.pinyinTitleCache.ts > 300000) {
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: "SELECT id, content FROM blocks WHERE type='d' LIMIT 20000",
            });
            const rows = (Array.isArray(json?.data) ? json.data : [])
                .map((row: {id?: unknown; content?: unknown}) => ({
                    id: typeof row?.id === "string" ? row.id : "",
                    title: typeof row?.content === "string" ? row.content.trim() : "",
                }))
                .filter((row: {id: string; title: string}) => row.id && row.title);
            this.pinyinTitleCache = {rows, ts: now};
        }
        const exclude = new Set<string>(existing.map((doc) => doc.id).filter(Boolean) as string[]);
        const matches: IDocSearchResult[] = [];
        for (const row of this.pinyinTitleCache.rows) {
            if (exclude.has(row.id)) continue;
            if (pinyinTitleHit(row.title, needle)) {
                exclude.add(row.id);
                matches.push({
                    id: row.id,
                    rootId: row.id,
                    title: row.title,
                    hPath: "",
                    source: "pinyin",
                });
            }
            if (matches.length >= 12) break;
        }
        return matches;
    }

    private applySkin(): void {
        if (typeof document === "undefined" || !document.body) return;
        const skin = this.getSettings().skin || "fusion";
        if (skin === "fusion") {
            delete document.body.dataset.swSkin;
        } else {
            document.body.dataset.swSkin = skin;
        }
    }

    // T-6823 密度档位：comfortable（默认，现状）| compact（紧凑行高/间距）。
    // 与皮肤同机制：body 只放标记，SCSS 按标记覆盖间距变量；卸载移除。
    private applyDensity(): void {
        if (typeof document === "undefined" || !document.body) return;
        if (this.getSettings().density === "compact") {
            document.body.dataset.swDensity = "compact";
        } else {
            delete document.body.dataset.swDensity;
        }
    }

    private clampNum(value: any, min: number, max: number, fallback: number): number {
        // 委派到 util.clampNum（pure，便于单元测试）；class 内保留方法签名以便现有调用点不变
        return clampNum(value, min, max, fallback);
    }

    // ==================== 设置页本地控件工厂（统一格式、减少重复） ====================

    // 数字输入：右侧带单位标签，change 时经 clampNum 校验后回调；label 用于读屏与移动端语义
    private num(value: number, min: number, max: number, step: number, unit: string, onChange: (v: number) => void, label?: string): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "sw-settings__num";
        const input = document.createElement("input");
        input.className = "b3-text-field fn__flex-center";
        input.type = "number";
        input.inputMode = "numeric";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        if (label) {
            input.setAttribute("aria-label", label);
        }
        input.addEventListener("change", () => {
            const normalized = this.clampNum(input.value, min, max, value);
            input.value = String(normalized);
            onChange(normalized);
        });
        const unitEl = document.createElement("span");
        unitEl.className = "sw-settings__num-unit";
        unitEl.textContent = unit;
        wrap.appendChild(input);
        wrap.appendChild(unitEl);
        return wrap;
    }

    // 下拉选择控件
    private select(options: Array<{value: string, label: string}>, value: string, onChange: (v: string) => void): HTMLElement {
        const selectEl = document.createElement("select");
        selectEl.className = "b3-select fn__flex-center";
        options.forEach(({value: v, label}) => {
            const option = document.createElement("option");
            option.value = v;
            option.textContent = label;
            selectEl.appendChild(option);
        });
        selectEl.value = value;
        selectEl.addEventListener("change", () => onChange(selectEl.value));
        return selectEl;
    }

    // 行容器用 div：开关本身是 label（b3-switch 标准结构 input+span），label 不可嵌套
    private switcher(checked: boolean, onChange: (v: boolean) => void): HTMLElement {
        const label = document.createElement("label");
        label.className = "sw-switch";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = checked;
        input.addEventListener("change", () => onChange(input.checked));
        label.appendChild(input);
        label.appendChild(document.createElement("span"));
        return label;
    }

    // 设置条目：左侧标题+可选描述，右侧控件；column 时控件占满整行
    private settingItem(title: string, description: string | undefined, action: HTMLElement, column = false): HTMLElement {
        const item = document.createElement("div");
        item.className = column ? "sw-settings__item sw-settings__item--column" : "sw-settings__item";
        const main = document.createElement("div");
        main.className = "sw-settings__item-main";
        const titleEl = document.createElement("div");
        titleEl.className = "sw-settings__item-title";
        titleEl.textContent = title;
        main.appendChild(titleEl);
        if (description) {
            const desc = document.createElement("div");
            desc.className = "sw-settings__item-desc";
            desc.textContent = description;
            main.appendChild(desc);
        }
        const actionEl = document.createElement("div");
        actionEl.className = "sw-settings__item-action";
        actionEl.appendChild(action);
        item.appendChild(main);
        item.appendChild(actionEl);
        return item;
    }

    // 拉取已打开的笔记本列表（id + name），用于默认日记笔记本下拉
    private async loadNotebooks(): Promise<Array<{id: string, name: string}>> {
    // 内核无响应时超时中断请求，避免设置页下拉一直停在加载中
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        let timer: number | null = null;
        const timeoutPromise = new Promise<Response>((_, reject) => {
            timer = window.setTimeout(() => {
                controller?.abort();
                reject(new Error("timeout"));
            }, NOTEBOOK_FETCH_TIMEOUT_MS);
        });
        try {
            const request = fetch("/api/notebook/lsNotebooks", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: "{}",
                ...(controller ? {signal: controller.signal} : {}),
            });
            const response = await Promise.race([request, timeoutPromise]);
            if (!response.ok) {
                throw new Error(`lsNotebooks HTTP ${response.status}`);
            }
            const json = await response.json();
            const notebooks = (json?.data?.notebooks ?? []) as Array<{id: string, name: string, closed?: number}>;
            return notebooks
                .filter((nb) => nb && nb.id && !nb.closed)
                .map((nb) => ({id: nb.id, name: nb.name}));
        } catch (e) {
            logger.warn("load notebooks fail", e);
            return [];
        } finally {
            window.clearTimeout(timer);
        }
    }

    // 默认日记笔记本下拉（异步填充已打开笔记本，当前值命中时回填选中）
    private notebookSelect(current: string, onPick: (id: string) => void): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "sw-settings__journal-sel";
        const sel = document.createElement("select");
        sel.className = "b3-select fn__flex-center";
        sel.disabled = true; // 加载完成前禁用
        sel.appendChild(new Option(this.i18n.notebookLoading, ""));
        wrap.appendChild(sel);
        this.loadNotebooks().then((notebooks) => {
            sel.innerHTML = "";
            sel.appendChild(new Option(this.i18n.notebookPlaceholder, ""));
            notebooks.forEach((nb) => {
                const opt = new Option(nb.name, nb.id);
                opt.title = nb.name;
                sel.appendChild(opt);
            });
            sel.value = notebooks.some((nb) => nb.id === current) ? current : "";
            sel.disabled = false;
        });
        sel.addEventListener("change", () => onPick(sel.value));
        return wrap;
    }

    // 打开/创建当日日记：默认日记本未设置时先弹出下拉选择
    // 快速记录：Flomo 式弹窗，输入一句追加到今日日记末尾（未配置日记本时先让用户选择）
    // 商店实时预览：以默认尺寸渲染真实组件（数据与面板同源），关闭窗口即释放实例
    private openHomeWidgetGuide() {
        const dialog = new Dialog({
            title: this.i18n.homeStoreGuideTitle,
            content: '<div class="speed-switch sw-home-store-guide"></div>',
            width: this.isMobile ? "min(520px, 94vw)" : "min(720px, 76vw)",
            height: this.isMobile ? "min(640px, 82vh)" : "min(620px, 78vh)",
        });
        const root = dialog.element.querySelector<HTMLElement>(".sw-home-store-guide");
        if (!root) return;
        const hint = document.createElement("p");
        hint.className = "sw-home-store-guide__hint";
        hint.textContent = this.i18n.homeStoreGuideHint;
        root.appendChild(hint);
        const link = document.createElement("a");
        link.className = "b3-button b3-button--outline sw-home-store-guide__link";
        link.href = "https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/component-store-guide.md";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = this.i18n.homeStoreGuide;
        root.appendChild(link);
        const note = document.createElement("p");
        note.className = "sw-home-store-guide__note";
        note.textContent = "docs/component-store-guide.md";
        root.appendChild(note);

        const dependencyTitle = document.createElement("h3");
        dependencyTitle.className = "sw-home-store-guide__dependency-title";
        dependencyTitle.textContent = "非思源本体依赖";
        root.appendChild(dependencyTitle);
        const dependencySummary = summarizeHomeStoreDependencies();
        const dependencySummaryText = document.createElement("p");
        dependencySummaryText.className = "sw-home-store-guide__dependency-summary";
        dependencySummaryText.textContent = `已整理 ${dependencySummary.total} 项：${dependencySummary.required} 项需前置依赖，${dependencySummary.optional} 项为可选数据源。`;
        root.appendChild(dependencySummaryText);
        const dependencyList = document.createElement("ul");
        dependencyList.className = "sw-home-store-guide__dependency-list";
        dependencyList.setAttribute("aria-label", "非思源本体依赖清单");
        dependencySummary.entries.forEach(({info}) => {
            const item = document.createElement("li");
            item.className = `sw-home-store-guide__dependency-item is-${info.required ? "required" : "optional"}`;
            const name = document.createElement("strong");
            name.textContent = info.name;
            item.appendChild(name);
            const badge = document.createElement("span");
            badge.className = "sw-home-store-guide__dependency-badge";
            badge.textContent = info.required ? "需前置依赖" : "可选数据源";
            item.appendChild(badge);
            const setup = document.createElement("span");
            setup.className = "sw-home-store-guide__dependency-setup";
            setup.textContent = info.setup;
            item.appendChild(setup);
            if (info.installUrl) {
                const install = document.createElement("a");
                install.href = info.installUrl;
                install.target = "_blank";
                install.rel = "noopener noreferrer";
                install.textContent = "安装地址";
                install.setAttribute("aria-label", `${info.name} 安装地址`);
                item.appendChild(install);
            }
            dependencyList.appendChild(item);
        });
        root.appendChild(dependencyList);
        const dependencyLink = document.createElement("a");
        dependencyLink.className = "b3-button b3-button--outline sw-home-store-guide__dependency-link";
        dependencyLink.href = "https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/external-component-installation.md";
        dependencyLink.target = "_blank";
        dependencyLink.rel = "noopener noreferrer";
        dependencyLink.textContent = "查看非思源组件安装说明";
        root.appendChild(dependencyLink);
    }

    // 商店预览 dialog（openStoreWidgetPreview）已外迁至 home-store-ui.ts（R1，D-379）

    // T-6818 快速捕获流程：输入 → 目标（今日日记/当前文档）→ 目的地预览 →
    // 受控写入（白名单端点/既有桥）→ 回执。每步失败原因独立呈现。
    private openQuickCapture(preferredNotebook = "", initialText = "") {
        const dialog = new Dialog({
            title: this.i18n.quickCaptureTitle,
            content: '<div class="speed-switch sw-quick-capture"></div>',
            width: this.isMobile ? "min(420px, 92vw)" : "380px",
            height: this.isMobile ? "min(280px, 60vh)" : "260px",
        });
        const root = dialog.element.querySelector<HTMLElement>(".sw-quick-capture");
        if (!root) return;
        type CaptureTarget = "journal" | "current";
        let target: CaptureTarget = "journal";

        const input = document.createElement("textarea");
        input.className = "b3-text-field fn__block sw-quick-capture__input";
        input.rows = 3;
        input.placeholder = this.i18n.quickCapturePlaceholder;
        input.value = initialText;
        input.setAttribute("aria-label", this.i18n.quickCaptureTitle);
        // T-6815/T-6818 目的地预览：写到哪里、写什么副作用，提交前可见
        const previewLine = document.createElement("p");
        previewLine.className = "sw-quick-capture__preview";
        previewLine.setAttribute("aria-live", "polite");

        const actions = document.createElement("div");
        actions.className = "sw-quick-capture__actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "b3-button b3-button--text";
        cancel.textContent = this.i18n.quickCaptureCancel;
        cancel.addEventListener("click", () => dialog.destroy());
        const save = document.createElement("button");
        save.type = "button";
        save.className = "b3-button b3-button--outline";
        save.textContent = this.i18n.quickCaptureSave;

        const targets = document.createElement("div");
        targets.className = "sw-quick-capture__targets";
        targets.setAttribute("role", "tablist");
        const targetButtons: Array<{key: CaptureTarget; el: HTMLButtonElement}> = [];
        const makeTargetButton = (key: CaptureTarget, label: string) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "b3-button b3-button--small";
            button.textContent = label;
            button.setAttribute("role", "tab");
            button.addEventListener("click", () => setActiveTarget(key));
            targetButtons.push({key, el: button});
            targets.appendChild(button);
        };
        makeTargetButton("journal", this.i18n.quickCaptureTargetJournal);
        const captureRoot = this.resolveActiveCaptureRoot();
        if (!this.isMobile) makeTargetButton("current", this.i18n.quickCaptureTargetCurrent);
        const setActiveTarget = (next: CaptureTarget) => {
            target = next;
            targetButtons.forEach(({key, el}) => {
                el.classList.toggle("sw__target--active", key === target);
                el.setAttribute("aria-selected", String(key === target));
            });
            updatePreview();
        };
        const updatePreview = () => {
            if (target === "journal") {
                save.disabled = false;
                const today = new Date();
                const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                previewLine.textContent = this.i18n.quickCapturePreviewJournal.replace("{x}", ymd);
                // 预览 enriched：笔记本名异步补齐（有界缓存清单）
                void this.loadNotebooks().then((notebooks: Array<{id: string; name: string}>): void => {
                    if (!previewLine.isConnected) return;
                    const notebookId = normalizeAgentNotebookId(preferredNotebook) || normalizeAgentNotebookId(this.getSettings().journalNotebook);
                    const found = notebooks.find((nb) => nb.id === notebookId);
                    if (found) previewLine.textContent = this.i18n.quickCapturePreviewJournal.replace("{x}", `${found.name} · ${ymd}`);
                }).catch((): undefined => undefined);
                return;
            }
            const capture = this.resolveActiveCaptureRoot();
            if (capture) {
                save.disabled = false;
                previewLine.textContent = this.i18n.quickCapturePreviewCurrent.replace("{x}", capture.title);
            } else {
                save.disabled = true;
                previewLine.textContent = this.i18n.quickCaptureNoTarget;
            }
        };

        let saving = false;
        const submit = () => {
            if (saving) return;
            void (async () => {
                const content = sanitizeJournalAppend(input.value);
                if (!content) {
                    showMessage(this.i18n.quickCaptureEmpty);
                    return;
                }
                saving = true;
                save.disabled = true;
                cancel.disabled = true;
                let completed = false;
                try {
                    if (target === "current") {
                        // 受控写入（当前文档）：追加到活动文档末尾（内核 appendBlock，白名单端点）
                        const capture = this.resolveActiveCaptureRoot();
                        if (!capture) {
                            showMessage(this.i18n.quickCaptureNoTarget, MESSAGE_DEFAULT_MS, "error");
                            return;
                        }
                        const appendJson = await this.fetchKernelJson("/api/block/appendBlock", {
                            dataType: "markdown", data: content, parentID: capture.rootId,
                        });
                        if (!appendJson || appendJson.code !== 0) {
                            showMessage(this.i18n.quickCaptureFailed, MESSAGE_DEFAULT_MS, "error");
                            return;
                        }
                        completed = true;
                        dialog.destroy();
                        showMessage(`${this.i18n.quickCaptureDone} · ${this.i18n.quickCapturePreviewCurrent.replace("{x}", capture.title)}`);
                        return;
                    }
                    let notebook = normalizeAgentNotebookId(preferredNotebook) || normalizeAgentNotebookId(this.getSettings().journalNotebook);
                    if (!notebook) {
                        notebook = await this.promptJournalNotebook();
                        if (!notebook) return;
                    }
                    const docId = await this.ensureTodayJournal(notebook);
                    if (!docId) {
                        showMessage(this.i18n.journalFailed, MESSAGE_DEFAULT_MS, "error");
                        return;
                    }
                    const appendJson = await this.fetchKernelJson("/api/block/appendBlock", {
                        dataType: "markdown", data: content, parentID: docId,
                    });
                    if (!appendJson || appendJson.code !== 0) {
                        showMessage(this.i18n.quickCaptureFailed, MESSAGE_DEFAULT_MS, "error");
                        return;
                    }
                    completed = true;
                    dialog.destroy();
                    showMessage(this.i18n.quickCaptureDone);
                } catch (error) {
                    logger.warn("quick capture failed", error);
                    showMessage(this.i18n.quickCaptureFailed, MESSAGE_DEFAULT_MS, "error");
                } finally {
                    if (!completed) {
                        saving = false;
                        save.disabled = false;
                        cancel.disabled = false;
                        input.focus();
                    }
                }
            })();
        };
        save.addEventListener("click", submit);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
            }
        });
        actions.append(cancel, save);
        root.append(targets, input, previewLine, actions);
        setActiveTarget("journal");
        window.setTimeout(() => {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }, 30);
    }

    // T-6818：活动文档捕获目标（rootId + 可见标题）；无活动编辑器时为 null
    private resolveActiveCaptureRoot(): {rootId: string; title: string} | null {
        const editor = this.resolveActiveHostEditor();
        const rootId = String(editor?.protyle?.block?.parentID || "");
        if (!editor || !rootId) return null;
        const title = document.querySelector(".layout__wnd--active .item--focus .protyle-title")?.textContent?.trim()
            || document.querySelector(".protyle-title")?.textContent?.trim()
            || rootId;
        return {rootId, title: title.slice(0, 120)};
    }

    private async openJournal(preferredNotebook = "") {
        let notebook = normalizeAgentNotebookId(preferredNotebook) || this.getSettings().journalNotebook;
        if (!notebook) {
            notebook = await this.promptJournalNotebook();
            if (!notebook) {
                return; // 鐢ㄦ埛鍙栨秷閫夋嫨
            }
        }
        const id = await this.ensureTodayJournal(notebook);
        if (!id) {
            showMessage(this.i18n.journalFailed, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        if (this.isMobile) {
            // openTab 在手机端是空实现，走 MobileTabs.open
            this.mobileOpenDoc(id);
        } else {
            openTab({app: this.app, doc: {id}});
        }
    }

    // 调用内核 createDailyNote：已有当日日记时返回其 id（不重复创建）
    private async ensureTodayJournal(notebook: string): Promise<string | null> {
        return ensureTodayJournalAction({notebook, fetchImpl: fetch, logger});
    }

    // 首次点击日记按钮：弹窗选择默认日记笔记本，选择后保存并返回
    private promptJournalNotebook(): Promise<string> {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (value: string) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            let releaseJournalDialog: () => void = () => undefined;
            const dialog = new Dialog({
                title: this.i18n.journalChoose,
                content: this.buildJournalPromptHtml(),
                width: "min(460px, 90vw)",
                destroyCallback: () => releaseJournalDialog(),
            });
            releaseJournalDialog = this.suspendFABForDialog(() => finish(""));
            const sel = dialog.element.querySelector<HTMLSelectElement>(".sw-journal-prompt__sel > select")
                ?? this.createJournalSelect(dialog);
            const confirmBtn = dialog.element.querySelector<HTMLButtonElement>(".sw-journal-prompt__confirm");
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            this.loadNotebooks().then((notebooks) => {
                this.populateJournalNotebookSelect(sel, confirmBtn, notebooks);
            });
            this.bindJournalPromptEvents(dialog, sel, confirmBtn, finish);
        });
    }

    // 笔记本选择弹窗 HTML：提示文本 + select 占位 + 取消/确认按钮
    private buildJournalPromptHtml(): string {
        return `<div class="b3-dialog__content sw-journal-prompt">
    <div class="b3-label__text sw-journal-prompt__tip">${this.i18n.journalChooseTip}</div>
    <div class="sw-journal-prompt__sel"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text sw-journal-prompt__confirm">${this.i18n.confirm}</button>
</div>`;
    }

    // select 不存在时（DOM 未找到占位 div）动态创建一个；正常情况下 HTML 里已有占位
    private createJournalSelect(dialog: Dialog): HTMLSelectElement {
        const sel = document.createElement("select");
        sel.className = "b3-select fn__flex-center fn__block";
        sel.disabled = true;
        sel.appendChild(new Option(this.i18n.notebookLoading, ""));
        dialog.element.querySelector(".sw-journal-prompt__sel")?.appendChild(sel);
        return sel;
    }

    // 加载到笔记本列表后填充选项：无笔记本显示空态；否则默认选中第一项
    private populateJournalNotebookSelect(
        sel: HTMLSelectElement,
        confirmBtn: HTMLButtonElement | null,
        notebooks: Array<{id: string, name: string}>,
    ) {
        if (notebooks.length === 0) {
            sel.disabled = true;
            sel.innerHTML = "";
            sel.appendChild(new Option(this.i18n.journalNoNotebook, ""));
            return;
        }
        sel.disabled = false;
        sel.innerHTML = "";
        notebooks.forEach((nb) => {
            const opt = new Option(nb.name, nb.id);
            opt.title = nb.name;
            sel.appendChild(opt);
        });
        sel.value = notebooks[0].id;
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
    }

    // 确认：写入设置 + 关闭弹窗 + resolve(id)；取消：resolve("")（调用方按空值兜底）
    private bindJournalPromptEvents(
        dialog: Dialog,
        sel: HTMLSelectElement,
        confirmBtn: HTMLButtonElement | null,
        resolve: (id: string) => void,
    ) {
        confirmBtn?.addEventListener("click", () => {
            const picked = sel.value;
            if (!picked) {
                return;
            }
            this.updateSettings({journalNotebook: picked});
            resolve(picked);
            dialog.destroy();
        });
        dialog.element.querySelector(".b3-button--cancel")?.addEventListener("click", () => {
            dialog.destroy();
            resolve("");
        });
    }

    // 插件设置页（设置 → 插件 → 小驴速切 → 设置图标）
    // 布局：左侧标签栏（外观/行为/面板/收藏/手机端）+ 右侧分组面板，点击标签切换
    openSetting(initialPanel?: string) {
        const s = this.getSettings();
        const panelKeys = ["appearance", "behavior", "panels", "favorites", "quickActions", "floatingBall", "documentSets", "journal", "mobile", "storage"] as const;
        const panelLabels: Record<string, string> = {
            appearance: this.i18n.secAppearance,
            behavior: this.i18n.secBehavior,
            panels: this.i18n.secPanels,
            favorites: this.i18n.secFavorites,
            quickActions: this.i18n.secQuickActions,
            floatingBall: this.i18n.secFloatingBall,
            documentSets: this.i18n.secDocumentSets,
            journal: this.i18n.secJournal,
            mobile: this.i18n.secMobile,
            storage: this.i18n.secStorage,
        };

        // T-6479：设置弹窗的 resize 监听释放改挂宿主 destroyCallback（不再覆写 dialog.destroy）。
        let releaseSettingsDialog: () => void = () => undefined;
        let releaseSettingsFab: () => void = () => undefined;
        const dialog = new Dialog({
            title: this.i18n.settings,
            content: '<div class="sw-settings"></div>',
            destroyCallback: () => {
                releaseSettingsDialog();
                releaseSettingsFab();
            },
            // 桌面端独立采用 70% 视口自适应（不与第一面板的 panelScale 联动）；手机端按视口收缩，避免溢出屏幕
            width: this.isMobile ? "min(720px, 88vw)" : `${resolvePanelSize({...this.getSettings(), panelSizeMode: "adaptive", panelScale: SETTINGS_PANEL_SCALE}, {width: window.innerWidth, height: window.innerHeight, minWidth: PANEL_SIZE_MIN_PX, minHeight: PANEL_SIZE_MIN_PX}).width}px`,
            height: this.isMobile ? "min(560px, 85vh)" : `${resolvePanelSize({...this.getSettings(), panelSizeMode: "adaptive", panelScale: SETTINGS_PANEL_SCALE}, {width: window.innerWidth, height: window.innerHeight, minWidth: PANEL_SIZE_MIN_PX, minHeight: PANEL_SIZE_MIN_PX}).height}px`,
        });
        releaseSettingsFab = this.suspendFABForDialog();

        const root = dialog.element.querySelector<HTMLElement>(".sw-settings");
        if (!root) {
            return;
        }
        dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.classList.add("sw-settings-dialog");

        const tabs = document.createElement("div");
        tabs.className = "sw-settings__tabs";
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", this.i18n.settings);
        const horizontalTabs = typeof window === "object" && typeof window.matchMedia === "function"
            && window.matchMedia("(max-width: 560px)").matches;
        tabs.setAttribute("aria-orientation", horizontalTabs ? "horizontal" : "vertical");
        const updateTabsOrientation = () => {
            const isHorizontal = typeof window === "object" && typeof window.matchMedia === "function"
                && window.matchMedia("(max-width: 560px)").matches;
            tabs.setAttribute("aria-orientation", isHorizontal ? "horizontal" : "vertical");
        };
        const onSettingsResize = () => updateTabsOrientation();
        if (typeof window === "object" && typeof window.addEventListener === "function") {
            window.addEventListener("resize", onSettingsResize);
        }
        let settingsDestroyed = false;
        releaseSettingsDialog = () => {
            if (settingsDestroyed) return;
            settingsDestroyed = true;
            if (typeof window === "object" && typeof window.removeEventListener === "function") {
                window.removeEventListener("resize", onSettingsResize);
            }
        };
        const panels = document.createElement("div");
        panels.className = "sw-settings__panels";

        const ensureTabVisible = (key: string, behavior: ScrollBehavior = "auto") => {
            const activeTab = tabs.querySelector<HTMLElement>(`.sw-settings__tab[data-panel="${key}"]`);
            if (!activeTab || tabs.scrollWidth <= tabs.clientWidth) return;
            const itemLeft = activeTab.offsetLeft;
            const itemRight = itemLeft + activeTab.offsetWidth;
            const edge = Math.max(12, Math.min(28, Math.floor(tabs.clientWidth * 0.12)));
            let nextLeft = tabs.scrollLeft;
            if (itemLeft < tabs.scrollLeft + edge) nextLeft = itemLeft - edge;
            else if (itemRight > tabs.scrollLeft + tabs.clientWidth - edge) nextLeft = itemRight - tabs.clientWidth + edge;
            nextLeft = Math.max(0, Math.min(nextLeft, tabs.scrollWidth - tabs.clientWidth));
            const reduceMotion = typeof window === "object" && typeof window.matchMedia === "function"
                && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : behavior;
            if (typeof tabs.scrollTo === "function") {
                try {
                    tabs.scrollTo({left: nextLeft, behavior: scrollBehavior});
                    return;
                } catch (_) {
                    // Older WebViews may reject the options object.
                }
            }
            tabs.scrollLeft = nextLeft;
        };

        // 切换分组：仅激活对应标签与面板，同步 aria-selected 供读屏感知；
        // persist=true 时记录最近选中的标签页（仅用户主动点击时写盘，避免打开设置就产生一次无效写入）
        const activate = (key: string, persist = false) => {
            if (key === "floatingBall") {
                panels.querySelector(".sw-floating-ball-settings")?.dispatchEvent(new Event("sw-floating-ball-refresh"));
            }
            tabs.querySelectorAll<HTMLElement>(".sw-settings__tab").forEach((tab) => {
                const active = tab.dataset.panel === key;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", active ? "true" : "false");
                tab.tabIndex = active ? 0 : -1;
            });
            panels.querySelectorAll<HTMLElement>(".sw-settings__panel").forEach((p) => {
                const active = p.dataset.panel === key;
                p.classList.toggle("is-active", active);
                p.hidden = !active;
                p.setAttribute("aria-hidden", active ? "false" : "true");
            });
            if (persist) {
                this.updateSettings({lastSettingsTab: key});
            }
            this.scheduleAnimationFrame(() => ensureTabVisible(key, persist ? "smooth" : "auto"));
        };

        const activateByOffset = (currentKey: string, offset: number) => {
            const currentIndex = panelKeys.indexOf(currentKey as typeof panelKeys[number]);
            if (currentIndex < 0) return;
            const nextKey = panelKeys[(currentIndex + offset + panelKeys.length) % panelKeys.length];
            activate(nextKey, true);
            tabs.querySelector<HTMLButtonElement>(`.sw-settings__tab[data-panel="${nextKey}"]`)?.focus();
        };

        const builders: Record<string, () => HTMLElement> = {
            appearance: () => buildSettingsAppearance.call(this, s),
            behavior: () => buildSettingsBehavior.call(this, s),
            panels: () => buildSettingsPanels.call(this, s),
            favorites: () => buildSettingsFavorites.call(this, ),
            quickActions: () => buildSettingsQuickActions.call(this, ),
            floatingBall: () => buildSettingsFloatingBall.call(this, s),
            documentSets: () => buildSettingsDocumentSets.call(this, ),
            journal: () => buildSettingsJournal.call(this, s),
            mobile: () => buildSettingsMobile.call(this, s),
            storage: () => buildSettingsStorage.call(this),
            homePanel: () => buildSettingsHomePanel.call(this, s),
        };

        // 构建标签栏与分组面板
        panelKeys.forEach((key) => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "sw-settings__tab";
            tab.setAttribute("role", "tab");
            tab.dataset.panel = key;
            tab.id = `sw-settings-tab-${key}`;
            tab.setAttribute("aria-controls", `sw-settings-panel-${key}`);
            tab.tabIndex = -1;
            tab.textContent = panelLabels[key];
            tab.addEventListener("click", () => activate(key, true));
            tab.addEventListener("keydown", (event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    activateByOffset(key, 1);
                } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    activateByOffset(key, -1);
                } else if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    const targetKey = event.key === "Home" ? panelKeys[0] : panelKeys[panelKeys.length - 1];
                    activate(targetKey, true);
                    tabs.querySelector<HTMLButtonElement>(`.sw-settings__tab[data-panel="${targetKey}"]`)?.focus();
                }
            });
            tabs.appendChild(tab);

            const panelEl = document.createElement("div");
            panelEl.className = "sw-settings__panel";
            panelEl.setAttribute("role", "tabpanel");
            panelEl.dataset.panel = key;
            panelEl.id = `sw-settings-panel-${key}`;
            panelEl.setAttribute("aria-labelledby", `sw-settings-tab-${key}`);
            panelEl.appendChild(builders[key]());
            panels.appendChild(panelEl);
        });

        root.appendChild(tabs);
        root.appendChild(panels);

        // 打开时直接跳转到上次所在的标签页（默认外观）；activate 内部会记录切换，下次进入保持
        const lastTab = initialPanel || this.getSettings().lastSettingsTab;
        const panelKeysArr: string[] = [...panelKeys];
        const initial = panelKeysArr.includes(lastTab) ? lastTab : panelKeys[0];
        activate(initial);
        // Only move the horizontal tab strip. scrollIntoView also scrolls
        // Dialog ancestors in Android WebView and can shift the entire settings
        // page off screen when opening the quick-action panel directly.
        this.scheduleAnimationFrame(() => {
            if (!root.isConnected) return;
            root.scrollLeft = 0;
            panels.scrollLeft = 0;
            ensureTabVisible(initial);
        });
    }

    // 设置页“外观/行为/面板/收藏/日记/移动端/主页”各分节的 UI 构建已外迁至 settings-sections.ts（R4 重构 D-376）。

    private reorderFavoriteGroups(source: string, target: string) {
        const names = this.getFavoriteGroupNames();
        const from = names.indexOf(source);
        const to = names.indexOf(target);
        if (from < 0 || to < 0 || from === to) return;
        const [moved] = names.splice(from, 1);
        names.splice(names.indexOf(target), 0, moved);
        this.saveFavGroupRegistry(names);
        this.refreshFavSelects();
    }

    private reorderFavoritesInGroup(group: string, sourceKey: string, targetKey: string) {
        const list = this.getFavorites();
        const groupItems = list.filter((item) => (item.group || "") === group);
        const from = groupItems.findIndex((item) => item.key === sourceKey);
        const to = groupItems.findIndex((item) => item.key === targetKey);
        if (from < 0 || to < 0 || from === to) return;
        const [moved] = groupItems.splice(from, 1);
        groupItems.splice(to, 0, moved);
        let cursor = 0;
        for (let index = 0; index < list.length; index++) {
            if ((list[index].group || "") === group) list[index] = groupItems[cursor++];
        }
        this.saveFavorites(list);
        this.refreshFavSelects();
    }

    // 单个分组行：名称 + 收藏数 + 重命名按钮 + 删除按钮
    private buildFavGroupRow(name: string, count: number, render: () => void): HTMLElement {
        const row = document.createElement("div");
        row.className = "sw-setting__group-row";

        const label = document.createElement("span");
        label.className = "sw-setting__group-name";
        label.textContent = name;
        label.title = name;

        const countEl = document.createElement("span");
        countEl.className = "sw-setting__group-count";
        countEl.textContent = String(count);
        countEl.title = this.i18n.groupCountTip;

        // 重命名：行内切换为输入框，确认后整组迁移
        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "b3-button b3-button--small sw-setting__group-btn";
        renameBtn.textContent = this.i18n.rename;
        renameBtn.addEventListener("click", () => {
            this.replaceFavGroupRowWithRenameControls(row, name, render);
        });

        // 删除分组：组内收藏项移出到未分组
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "b3-button b3-button--small sw-setting__group-btn sw-setting__group-del";
        deleteBtn.textContent = this.i18n.deleteGroup;
        deleteBtn.addEventListener("click", () => {
            if (confirm(this.i18n.deleteGroupConfirm)) {
                this.deleteFavoriteGroup(name);
                render();
            }
        });

        row.appendChild(label);
        row.appendChild(countEl);
        row.appendChild(renameBtn);
        row.appendChild(deleteBtn);
        return row;
    }

    // 行内重命名 UI：清空行内容 → 输入框 + 确认/取消按钮 + 事件绑定
    private replaceFavGroupRowWithRenameControls(row: HTMLElement, name: string, render: () => void) {
        row.innerHTML = "";
        const input = document.createElement("input");
        input.className = "b3-text-field";
        input.value = name;
        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "b3-button b3-button--small b3-button--text";
        okBtn.textContent = this.i18n.confirm;
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "b3-button b3-button--small b3-button--cancel";
        cancelBtn.textContent = this.i18n.cancel;
        const apply = () => {
            const to = input.value.trim();
            if (to && to !== name) {
                this.renameFavoriteGroup(name, to);
            }
            render();
        };
        okBtn.addEventListener("click", apply);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                apply();
            } else if (event.key === "Escape") {
                render();
            }
        });
        cancelBtn.addEventListener("click", () => render());
        row.appendChild(input);
        row.appendChild(okBtn);
        row.appendChild(cancelBtn);
        input.focus();
        input.select();
    }

    // 收藏项列表：每行标题 + 分组下拉（改动即保存）；无收藏时追加空态
    private appendSettingsFavItems(
        box: HTMLElement,
        favorites: IFavoriteItem[],
        groupNames: string[],
        render: () => void,
    ) {
        if (favorites.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw-setting__fav-empty";
            empty.setAttribute("role", "status");
            empty.textContent = this.i18n.noFavorites;
            box.appendChild(empty);
            return;
        }
        const list = document.createElement("div");
        list.className = "sw-setting__fav-list";
        favorites.forEach((fav) => {
            const row = document.createElement("div");
            row.className = "sw-setting__fav-row";
            const name = document.createElement("span");
            name.className = "sw-setting__fav-name";
            name.textContent = fav.title;
            name.title = fav.title;
            const selectEl = document.createElement("select");
            selectEl.className = "b3-select";
            selectEl.appendChild(new Option(this.i18n.ungrouped, ""));
            groupNames.forEach((group) => selectEl.appendChild(new Option(group, group)));
            selectEl.value = fav.group || "";
            selectEl.addEventListener("change", () => {
                this.setFavoriteGroup(fav.key, selectEl.value);
                render();
            });
            row.appendChild(name);
            row.appendChild(selectEl);
            list.appendChild(row);
        });
        box.appendChild(list);
    }

    // ==================== 切换器 ====================

    // 打开页签切换器
    private showSwitcher(focusSearch = false) {
        // 手机端走独立适配
        if (this.isMobile) {
            this.showMobileSwitcher(focusSearch);
            return;
        }

        const tabs = getAllTabs();
        const settings = this.getSettings();
        const activeTab = this.getActiveTab();
        // 全屏模式：切换器铺满整个窗口（Esc 退出由思源 Dialog 默认行为提供）
        const fullscreen = settings.fullscreen;

        // T-6481：Dialog 的 destroyCallback 必须在构造时就成型，而资源是在后续装配方法里
        // 创建的，故用一个可变 holder 把两者接起来（宿主只认构造参数）。
        const releaseFab = this.suspendFABForDialog();
        const switcherRelease: {fn: () => void} = {fn: releaseFab};
        const dialog = this.createSwitcherDialog(settings, fullscreen, switcherRelease);
        // 工具栏、列表/回到顶部/缩略图懒加载 等子模块装配
        this.assembleSwitcherParts(dialog, settings, fullscreen, tabs, activeTab, switcherRelease, focusSearch);
    }

    // 构造桌面端切换器 Dialog（内容 HTML + 尺寸），外部只关心装配顺序，不关心 DOM 结构细节
    private createSwitcherDialog(settings: ISwSettings, fullscreen: boolean, release: {fn: () => void}): Dialog {
        const size = this.resolvePanelDialogSize(settings, fullscreen);
        return new Dialog({
            title: "",
            content: this.buildSwitcherHtml(fullscreen),
            width: `${size.width}px`,
            height: `${size.height}px`,
            destroyCallback: () => release.fn(),
        });
    }

    // Shared sizing for the desktop switcher and second-panel dialogs:
    // fullscreen fills the viewport, adaptive follows the configured screen
    // ratio, custom uses the fixed pixel settings.
    private resolvePanelDialogSize(settings: ISwSettings, fullscreen: boolean) {
        return resolvePanelSize(
            {...settings, panelSizeMode: fullscreen ? "fullscreen" : settings.panelSizeMode},
            {width: window.innerWidth, height: window.innerHeight, minWidth: PANEL_SIZE_MIN_PX, minHeight: PANEL_SIZE_MIN_PX},
        );
    }

    // 切换器主体 HTML 字符串（结构：顶栏搜索/收藏下拉/排序/全屏按钮 + 滚动区 + 回到顶部）
    private buildSwitcherHtml(fullscreen: boolean): string {
        return `<div class="speed-switch sw__body${fullscreen ? " sw--fullscreen" : ""}">
    <div class="sw__main">
        <div class="sw__dock fn__none"></div>
        <div class="sw__content">
            <div class="sw__toolbar">
                <div class="sw__search-wrap">
                    <svg class="sw__search-icon" width="14" height="14"><use xlink:href="#iconSearch"></use></svg>
                    <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" aria-label="${this.i18n.searchTabs}" autocomplete="off" spellcheck="false" />
                    <button type="button" class="sw__search-filter-btn" aria-label="${this.i18n.searchFilters}" title="${this.i18n.searchFilters}">
                        <svg width="14" height="14"><use xlink:href="#iconFilter"></use></svg>
                    </button>
                </div>
                <div class="sw__select-wrap">
                    <div class="sw__fav-dd"></div>
                </div>
                <div class="sw__select-wrap">
                    <div class="sw__history-dd"></div>
                </div>
                <div class="sw__select-wrap">
                    <button type="button" class="b3-button b3-button--text sw__sort-trigger" aria-label="${this.i18n.setSortBy}">
                        <svg width="16" height="16"><use xlink:href="#iconSort"></use></svg>
                        <span class="sw__sort-trigger-label"></span>
                    </button>
                </div>
                <button type="button" class="b3-button b3-button--text sw__icon-btn sw__fullscreen-btn" aria-label="${fullscreen ? this.i18n.exitFullscreen : this.i18n.enterFullscreen}" title="${fullscreen ? this.i18n.exitFullscreen : this.i18n.enterFullscreen}">
                    <svg class="sw__fs-enter" width="16" height="16" viewBox="0 0 24 24"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <svg class="sw__fs-exit" width="16" height="16" viewBox="0 0 24 24"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button type="button" class="b3-button b3-button--text sw__icon-btn sw__journal-btn" aria-label="${this.i18n.journalBtn}" title="${this.i18n.journalBtn}">
                    <svg width="16" height="16"><use xlink:href="#iconCalendar"></use></svg>
                </button>
                <button type="button" class="b3-button b3-button--text sw__icon-btn sw__refresh-btn" aria-label="${this.i18n.homeRefreshAll}" title="${this.i18n.homeRefreshAll}">
                    <svg width="16" height="16"><use xlink:href="#iconRefresh"></use></svg>
                </button>
                <button type="button" class="b3-button b3-button--text sw__icon-btn sw__settings-btn" aria-label="${this.i18n.settings}" title="${this.i18n.settings}">
                    <svg width="16" height="16"><use xlink:href="#iconSettings"></use></svg>
                </button>
            </div>
            <div class="sw__scroll" tabindex="0"></div>
            <div class="sw__quick-actions" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
            <button type="button" class="sw__back-top b3-tooltips b3-tooltips__n" aria-label="${this.i18n.backTop}">
                <svg><use xlink:href="#iconUp"></use></svg>
            </button>
        </div>
        <div class="sw__quick-rail fn__none" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
    </div>
</div>`;
    }

    // 装配：全屏切换、工具栏事件、收藏下拉、列表渲染、搜索过滤、回到顶部、缩略图懒加载
    private assembleSwitcherParts(
        dialog: Dialog,
        settings: ISwSettings,
        fullscreen: boolean,
        tabs: Tab[],
        activeTab: Tab | undefined,
        release: {fn: () => void},
        focusSearch = false,
    ) {
        const releaseFab = release.fn;
        this.prepareSwitcherChrome(dialog, fullscreen);

        // 左侧侧边栏面板列表（与思源 Ctrl+Tab 切换面板一致），按设置排除与显示方式渲染，无可面板时自动隐藏
        const dockElement = dialog.element.querySelector<HTMLDivElement>(".sw__dock");
        this.renderDockList(dockElement, dialog, settings.excludedDocks, settings.dockDisplay);

        // 清理缩略图缓存中已无对应打开页签的孤儿条目（页签关闭即失效）
        this.pruneThumbCache(tabs);

        // 宸ュ叿鏍忓紩鐢?
const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        if (!scrollElement) {
            return;
        }
        const closeOverlay = () => dialog.destroy();
        let refreshList: () => void = () => undefined;
        const listOpts = {onOverlayClose: closeOverlay, onTabsChanged: () => refreshList()};
        // 列表区与工具栏排序切换共享的「最近编辑」更新时间映射（loadUpdatedMap 异步回填）
const updatedMap: {[rootId: string]: string} = {};

        refreshList = () => {
            if (!dialog.element.isConnected) {
                return;
            }
            this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts,
                (sortSelect?.value as SortBy) || settings.sortBy, updatedMap);
            if (searchInput && (searchInput.value.trim() !== "" || hasDocSearchFilter.call(this, scrollElement))) {
                this.applySearch(scrollElement, searchInput, closeOverlay);
            } else {
                // T-6807/T-6814：首次打开（空查询且无筛选）也要呈现零词条工作台
                this.renderWorkbench(scrollElement, "", closeOverlay);
            }
        };
        const refreshQuickActions = () => {
            if (!dialog.element.isConnected) return;
            const currentSettings = this.getSettings();
            this.renderQuickActions(dialog.element, "desktop", searchInput, closeOverlay, ".sw__quick-actions");
            this.renderQuickActions(dialog.element, "desktop", searchInput, closeOverlay, ".sw__quick-rail");
            const useRightRail = currentSettings.quickActionsRightRail
                && currentSettings.quickActionsDisplayDesktop !== "hidden";
            dialog.element.querySelector<HTMLElement>(".sw__body")?.classList.toggle("sw--quick-rail", useRightRail);
            dialog.element.querySelector<HTMLElement>(".sw__quick-actions")?.classList.toggle("fn__none", currentSettings.quickActionsRightRail);
            dialog.element.querySelector<HTMLElement>(".sw__quick-rail")?.classList.toggle("fn__none", !currentSettings.quickActionsRightRail);
        };
        const refreshSurface = () => {
            refreshList();
            refreshQuickActions();
        };
        dialog.element.querySelector<HTMLButtonElement>(".sw__refresh-btn")?.addEventListener("click", () => {
            this.notebookListCache = null;
            refreshSurface();
        });
        const unregisterRefresh = this.registerSwitcherRefresh(refreshSurface);
        let iconClampFrame = 0;
        const clampIcons = () => {
            if (iconClampFrame || !dialog.element.isConnected) return;
            iconClampFrame = requestAnimationFrame(() => {
                iconClampFrame = 0;
                if (dialog.element.isConnected) clampOversizedIcons(dialog.element);
            });
        };
        const iconObserver = typeof MutationObserver === "function"
            ? new MutationObserver(clampIcons) : null;
        iconObserver?.observe(dialog.element, {childList: true, subtree: true});
        clampIcons();
        const disposeSearchFilter: () => void = searchInput
            ? bindDocSearchFilter.call(this, dialog.element, scrollElement, searchInput, closeOverlay)
            : () => undefined;
        const disposeHistoryDropdown = this.setupOpenHistoryDropdown(dialog.element.querySelector<HTMLElement>(".sw__history-dd"), closeOverlay);
        let switcherReleased = false;
        release.fn = () => {
            if (switcherReleased) return;
            switcherReleased = true;
            releaseFab();
            unregisterRefresh();
            iconObserver?.disconnect();
            if (iconClampFrame) cancelAnimationFrame(iconClampFrame);
            disposeSearchFilter();
            disposeHistoryDropdown();
            disposeDocSearchSession.call(this, scrollElement);
        };

        this.bindSwitcherFullscreenToggle(dialog, settings, fullscreen);
        this.bindSwitcherToolbarActions(dialog, searchInput, sortSelect, listOpts, closeOverlay, updatedMap);

        // 收藏下拉组件：星标触发 + 分组面板（分组可折叠/展开，项点击跳转）
        const favDd = dialog.element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, closeOverlay, refreshList);
        if (sortSelect) {
            sortSelect.value = settings.sortBy;
        }

        // 右侧页签缩略图网格：每次打开都重新克隆渲染，展示各页签的最新状态
        this.bindSwitcherListArea(dialog, scrollElement, tabs, activeTab, listOpts, settings, searchInput, sortSelect, closeOverlay, updatedMap);
        refreshQuickActions();

        // 普通打开仍把焦点交给滚动区，保持键盘卡片导航语义；动作面板
        // 的“搜索”入口显式要求搜索框获得焦点，避免只打开切换器却让
        // 用户再点一次输入框。
        if (focusSearch && searchInput) {
            searchInput.focus();
        } else {
            scrollElement.focus();
        }

        // 鍥炲埌椤堕儴鎸夐挳
        this.bindSwitcherBackTop(dialog, scrollElement);
    }

    // 弹窗外观准备：全屏模式下给容器加类（去圆角/边框/最大宽度），并锁定 .b3-dialog__body 不整体滚动
    private prepareSwitcherChrome(dialog: Dialog, fullscreen: boolean) {
        if (fullscreen) {
            dialog.element.querySelector(".b3-dialog__container")?.classList.add("sw-dialog--fullscreen");
        }
        // 思源 .b3-dialog__body 默认 overflow:auto，内容一高就会整体滚动把工具栏滚走，
        // 加类锁定它（配套 SCSS 规则见 .sw-scroll-locked），保证只有 .sw__scroll 滚动、顶栏始终固定
        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }
    }

    // 绑定切换器列表区：初次渲染 + 键盘导航 + 「最近编辑」排序回源 + 搜索输入
    private bindSwitcherListArea(
        dialog: Dialog,
        scrollElement: HTMLDivElement,
        tabs: Tab[],
        activeTab: Tab | undefined,
        listOpts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
        settings: ISwSettings,
        searchInput: HTMLInputElement | null,
        sortSelect: HTMLSelectElement | null,
        closeOverlay: IOverlayClose,
        updatedMap: {[rootId: string]: string},
    ) {
        this.renderList(scrollElement, tabs, activeTab, listOpts, settings.sortBy, updatedMap);
        // T-6807/T-6814：首次打开（空查询且无筛选）即呈现零词条工作台（含关联内容行）
        if (searchInput && searchInput.value.trim() === "" && !hasDocSearchFilter.call(this, scrollElement)) {
            this.renderWorkbench(scrollElement, "", closeOverlay);
        }
        this.bindKeydown(scrollElement, closeOverlay);

        // 「最近编辑」排序需要文档更新时间：后台查询一次，完成后若仍处于该排序则重排
        this.loadUpdatedMap(tabs).then((map) => {
            Object.assign(updatedMap, map);
            if (dialog.element.isConnected && sortSelect?.value === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
                // 弹窗存活期间页签可能已增减，重取最新列表
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
            }
        });

        // 搜索：已打开页签匹配显示在上半部分，同时全库文档结果显示在下半部分
        if (searchInput) {
            this.bindSearchInputComposition(searchInput, () => {
                this.applySearch(scrollElement, searchInput, closeOverlay);
            });
        }
    }

    /**
     * 中文输入法（IME）守卫：composition（拼音候选中）期间的 input 事件
     * 不触发搜索，避免拼音中间态作为关键词发出请求并闪现错误结果；
     * compositionend 后立即补一次触发。applySearch 内部有防抖与请求
     * 序号去重，compositionend 与随后的 input 双触发是无害的。
     */
    private bindSearchInputComposition(input: HTMLInputElement, onTrigger: () => void) {
        let composing = false;
        input.addEventListener("compositionstart", () => {
            composing = true;
        });
        input.addEventListener("compositionend", () => {
            composing = false;
            onTrigger();
        });
        input.addEventListener("input", () => {
            if (composing) return;
            onTrigger();
        });
    }

    // 绑定回到顶部按钮：滚动超过 240px 显示，点击平滑回顶
    private bindSwitcherBackTop(dialog: Dialog, scrollElement: HTMLElement) {
        const backTopBtn = dialog.element.querySelector<HTMLElement>(".sw__back-top");
        if (!backTopBtn) {
            return;
        }
        scrollElement.addEventListener("scroll", () => {
            backTopBtn.classList.toggle("sw__show", scrollElement.scrollTop >= BACK_TOP_THRESHOLD_PX);
        });
        backTopBtn.addEventListener("click", () => {
            scrollElement.scrollTo({top: 0, behavior: "smooth"});
        });
    }

    // 绑定"全屏 ⇄ 普通"原地切换按钮（与关闭弹窗不同：原地切换可以保留搜索/缩略图状态）
    private bindSwitcherFullscreenToggle(dialog: Dialog, settings: ISwSettings, initialFullscreen: boolean) {
        const fsBtn = dialog.element.querySelector<HTMLElement>(".sw__fullscreen-btn");
        const swBody = dialog.element.querySelector<HTMLElement>(".sw__body");
        let isFullscreen = initialFullscreen;
        const toggleFullscreen = (toFullscreen: boolean) => {
            const container = dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
            if (!container || toFullscreen === isFullscreen) {
                return;
            }
            isFullscreen = toFullscreen;
            if (toFullscreen) {
                container.style.width = "100vw";
                container.style.height = "100vh";
                container.classList.add("sw-dialog--fullscreen");
                swBody?.classList.add("sw--fullscreen");
                fsBtn?.setAttribute("aria-label", this.i18n.exitFullscreen);
            } else {
                const restored = this.resolvePanelDialogSize(settings, false);
                container.style.width = `${restored.width}px`;
                container.style.height = `${restored.height}px`;
                container.classList.remove("sw-dialog--fullscreen");
                swBody?.classList.remove("sw--fullscreen");
                fsBtn?.setAttribute("aria-label", this.i18n.enterFullscreen);
            }
        };
        fsBtn?.addEventListener("click", () => toggleFullscreen(!isFullscreen));
    }

    // 工具栏顶栏按钮：设置 / 侧边栏 / 日记按钮 + 排序切换
    private bindSwitcherToolbarActions(
        dialog: Dialog,
        searchInput: HTMLInputElement | null,
        sortSelect: HTMLSelectElement | null,
        listOpts: {onOverlayClose: () => void, onTabsChanged: () => void},
        closeOverlay: () => void,
        updatedMap: {[rootId: string]: string},
    ) {
        dialog.element.querySelector(".sw__settings-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.openSetting();
        });
        // 顶栏日记按钮：打开/新建当日日记（未设默认日记本时首次点击弹出选择）
        dialog.element.querySelector(".sw__journal-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.openJournal();
        });
        // 排序/分组一体化变更：更新设置 → 重排列表 → 补查最近编辑 → 清搜索词
        const applySortChange = (nextSort: SortBy) => {
            this.updateSettings({sortBy: nextSort});
            const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
            // 弹窗存活期间页签可能已增减，重取最新列表；沿用共享 updatedMap，已回源的更新时间不重算
            if (scrollElement) {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, nextSort, updatedMap);
            }
            this.loadUpdatedMap(getAllTabs()).then((map) => {
                Object.assign(updatedMap, map);
                if (dialog.element.isConnected && this.getSettings().sortBy === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
                    const el = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
                    if (el) {
                        this.renderList(el, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
                    }
                }
            });
            if (searchInput) {
                searchInput.value = "";
                this.applySearch(scrollElement, searchInput, closeOverlay);
            }
            scrollElement?.focus();
        };
        const applyGroupChange = (nextGroup: TabGroupMode) => {
            this.updateSettings({groupBy: nextGroup});
            this.updateSortTriggerLabel(dialog.element);
            const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
            if (scrollElement) {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, this.getSettings().sortBy, updatedMap);
            }
        };
        sortSelect?.addEventListener("change", () => {
            applySortChange(sortSelect.value as SortBy);
        });
        this.bindSortTriggerMenu(dialog.element, applySortChange, applyGroupChange);
    }

    // 排序触发按钮：标签 = 分组·排序 组合；点击弹出自制浮层（与收藏/最近下拉同模式，
    // 不用思源 Menu——插件弹窗层级可能盖住 body 级菜单），浮层含分组方式与组内排序两段单选
    private updateSortTriggerLabel(scope: HTMLElement) {
        const labelEl = scope.querySelector<HTMLElement>(".sw__sort-trigger .sw__sort-trigger-label");
        if (!labelEl) return;
        const s = this.getSettings();
        const groupLabels: Record<string, string> = {
            none: this.i18n.groupNone,
            notebook: this.i18n.groupNotebook,
            path: this.i18n.groupPath,
            favorites: this.i18n.groupFavorites,
            createdMonth: this.i18n.groupCreatedMonth,
        };
        const sortLabels: Record<string, string> = {
            mru: this.i18n.sortMru,
            layout: this.i18n.sortLayout,
            layoutDesc: this.i18n.sortLayoutDesc,
            updatedDesc: this.i18n.sortUpdatedDesc,
            titleAsc: this.i18n.sortTitleAsc,
            titleDesc: this.i18n.sortTitleDesc,
        };
        labelEl.textContent = (groupLabels[s.groupBy] || s.groupBy) + " · " + (sortLabels[s.sortBy] || s.sortBy);
    }

    private bindSortTriggerMenu(
        scope: HTMLElement,
        applySortChange: (nextSort: SortBy) => void,
        applyGroupChange: (nextGroup: TabGroupMode) => void,
    ) {
        const trigger = scope.querySelector<HTMLButtonElement>(".sw__sort-trigger");
        if (!trigger) return;
        this.updateSortTriggerLabel(scope);
        let panel: HTMLElement | null = null;
        let outsideHandler: ((event: PointerEvent) => void) | null = null;
        let keyHandler: ((event: KeyboardEvent) => void) | null = null;
        let resizeHandler: (() => void) | null = null;
        const closePanel = () => {
            panel?.remove();
            panel = null;
            if (outsideHandler) document.removeEventListener("pointerdown", outsideHandler, true);
            if (keyHandler) document.removeEventListener("keydown", keyHandler, true);
            if (resizeHandler) window.removeEventListener("resize", resizeHandler);
            outsideHandler = null;
            keyHandler = null;
            resizeHandler = null;
        };
        const radioRow = (label: string, checked: boolean, onClick: () => void) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "sw__sort-menu-option";
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", String(checked));
            item.innerHTML = "<span></span>" + (checked ? '<svg><use xlink:href="#iconCheck"></use></svg>' : "");
            item.querySelector("span")!.textContent = label;
            item.addEventListener("click", () => {
                closePanel();
                onClick();
            });
            return item;
        };
        const sectionTitle = (label: string) => {
            const title = document.createElement("div");
            title.className = "sw__sort-menu-section";
            title.textContent = label;
            return title;
        };
        trigger.addEventListener("click", () => {
            if (panel) { closePanel(); return; }
            panel = document.createElement("div");
            panel.className = "sw__sort-menu";
            panel.setAttribute("role", "menu");
            panel.setAttribute("aria-label", this.i18n.setSortBy);
            const s = this.getSettings();
            panel.appendChild(sectionTitle(this.i18n.groupModeTitle));
            ([
                ["notebook", this.i18n.groupNotebook],
                ["path", this.i18n.groupPath],
                ["favorites", this.i18n.groupFavorites],
                ["createdMonth", this.i18n.groupCreatedMonth],
                ["none", this.i18n.groupNone],
            ] as Array<[TabGroupMode, string]>).forEach(([value, label]) => {
                panel!.appendChild(radioRow(label, s.groupBy === value, () => {
                    this.updateSortTriggerLabel(scope);
                    applyGroupChange(value);
                }));
            });
            panel.appendChild(sectionTitle(this.i18n.groupSortTitle));
            ([
                ["mru", this.i18n.sortMru],
                ["layout", this.i18n.sortLayout],
                ["layoutDesc", this.i18n.sortLayoutDesc],
                ["updatedDesc", this.i18n.sortUpdatedDesc],
                ["titleAsc", this.i18n.sortTitleAsc],
                ["titleDesc", this.i18n.sortTitleDesc],
            ] as Array<[SortBy, string]>).forEach(([value, label]) => {
                panel!.appendChild(radioRow(label, s.sortBy === value, () => {
                    this.updateSortTriggerLabel(scope);
                    applySortChange(value);
                }));
            });
            // 挂到 body：dialog.element 不在 .speed-switch 内容容器内，挂这里样式选择器会失配，
            // 浮层退化为文档流裸块；body + fixed + 高 z-index 与手机端排序面板同模式
            document.body.appendChild(panel);
            const positionPanel = () => {
                const rect = trigger.getBoundingClientRect();
                panel.style.top = `${Math.round(rect.bottom + 6)}px`;
                panel.style.right = `${Math.round(Math.max(6, window.innerWidth - rect.right))}px`;
            };
            positionPanel();
            outsideHandler = (event) => {
                if (!panel?.contains(event.target as Node) && event.target !== trigger && !trigger.contains(event.target as Node)) closePanel();
            };
            document.addEventListener("pointerdown", outsideHandler, true);
            keyHandler = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closePanel();
                }
            };
            document.addEventListener("keydown", keyHandler, true);
            resizeHandler = positionPanel;
        });
    }


    // 执行搜索：已打开页签匹配卡片显示在上半部分，同时（防抖）搜索全库文档标题显示在下半部分
    private applySearch(scrollElement: HTMLElement, searchInput: HTMLInputElement, onClose: IOverlayClose) {
        const keyword = searchInput.value.trim();
        scrollElement.dataset.swDocSearchQuery = keyword;
        const session = getDocSearchSession.call(this, scrollElement);
        const filters = this.docSearchState.filters.get(scrollElement) || {};
        // T-6802 查询运算符：解析一次，全链路共享（本地页签匹配 / 内核查询清洗 /
        // 统一索引分区 / 文档结果客户端预过滤）。发给内核的查询剔除排除项。
        const parsedQuery = parseSearchQuery(searchInput.value);
        const kernelQuery = formatCleanQuery(parsedQuery);
        this.docSearchState.parsedQueries.set(scrollElement, parsedQuery);
        const localTabCount = this.filterCards(scrollElement, searchInput.value, new Set(), filters, parsedQuery);
        updateDocSearchHealth.call(this, scrollElement, {
            query: keyword,
            remote: Boolean(kernelQuery),
            state: kernelQuery ? "loading" : "idle",
            counts: {tabs: localTabCount},
            sources: {
                tabs: {status: localTabCount > 0 ? "ready" : "empty"},
                opened: {status: kernelQuery ? "pending" : "skipped"},
                global: {status: kernelQuery ? "pending" : "skipped"},
            },
        }, true);
        // T-6799 统一索引：查询时把"收藏/最近关闭/文档集"的命中分区渲染在
        // 页签卡片与全库文档结果之间；空查询时整块移除。
        this.renderUnifiedSections(scrollElement, keyword, onClose, parsedQuery);
        // T-6807 零词条工作台：空查询时直接呈现"场景预设/文档集/智能分组"入口。
        this.renderWorkbench(scrollElement, keyword, onClose);
        // T-6809 过滤条：查询时在结果区顶部提供类型收窄 chips（纯展示层可见性）。
        this.applySearchChips(scrollElement, keyword);

        // 每次输入都让上一轮请求失效。空关键词或缓存命中也必须递增序号；
        // 否则较慢的旧请求返回后会覆盖当前界面。
        const version = beginSearch(session);

        // 关键词为空：隐藏文档结果，恢复纯列表
        if (keyword === "" || kernelQuery === "") {
            // 空查询，或只剩排除项（没有正向词可交给内核）时不发请求
            renderDocResults.call(this, scrollElement, null, onClose);
            return;
        }
        // 鍛戒腑缂撳瓨鐩存帴娓叉煋锛堜紝鍚庢灉鍙?缂撳瓨缁撴灉鍙?瀹夊叏澶嶇敤锛?
        const cacheKey = buildSearchCacheKey({scope: "global", query: kernelQuery, filters});
        const cached = session.cache.get(cacheKey);
        if (cached) {
            renderDocResults.call(this, scrollElement, cached, onClose);
            // Open-tab content is surface-specific and may have changed since
            // the cached global result. Refresh it without re-fetching global.
            void runDocSearchFetch.call(this, scrollElement, searchInput, keyword, version, onClose, filters, cacheKey, kernelQuery);
            return;
        }
        renderDocResults.call(this, scrollElement, [], onClose, "loading");
        // 延迟 180ms 再请求全库文档（防抖），避免每个按键都打内核；
        session.timer = window.setTimeout(() => {
            session.timer = null;
            // 守卫用原始 keyword，内核请求用清洗后的 kernelQuery（T-6802 修正）
            void runDocSearchFetch.call(this, scrollElement, searchInput, keyword, version, onClose, filters, cacheKey, kernelQuery);
        }, SEARCH_DEBOUNCE_MS);
    }

    // ==================== T-6809 搜索过滤条（类型收窄 chips） ====================

    private applySearchChips(scrollElement: HTMLElement, keyword: string) {
        if (!keyword) {
            this.docSearchState.chipFilters.delete(scrollElement);
            scrollElement.removeAttribute("data-sw-chip");
            scrollElement.querySelector(".sw__search-chips")?.remove();
            return;
        }
        const selected = this.docSearchState.chipFilters.get(scrollElement) || "all";
        scrollElement.dataset.swChip = selected;
        let row = scrollElement.querySelector<HTMLElement>(".sw__search-chips");
        if (!row) {
            row = document.createElement("div");
            row.className = "sw__search-chips";
            row.setAttribute("role", "tablist");
            row.setAttribute("aria-label", this.i18n.chipsLabel);
            const defs: Array<[string, string]> = [
                ["all", this.i18n.chipsAll],
                ["tabs", this.i18n.chipsTabs],
                ["unified", this.i18n.chipsCollections],
                ["docs", this.i18n.chipsDocs],
            ];
            defs.forEach(([key, label]) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "sw__search-chip";
                chip.dataset.chip = key;
                chip.textContent = label;
                chip.setAttribute("role", "tab");
                chip.addEventListener("click", () => {
                    this.docSearchState.chipFilters.set(scrollElement, key);
                    scrollElement.dataset.swChip = key;
                    row!.querySelectorAll<HTMLElement>(".sw__search-chip").forEach((el) => {
                        const active = el.dataset.chip === key;
                        el.classList.toggle("is-active", active);
                        el.setAttribute("aria-selected", String(active));
                    });
                });
                row.appendChild(chip);
            });
            scrollElement.prepend(row);
        }
        row.querySelectorAll<HTMLElement>(".sw__search-chip").forEach((el) => {
            const active = el.dataset.chip === selected;
            el.classList.toggle("is-active", active);
            el.setAttribute("aria-selected", String(active));
        });
    }

    // T-6799 统一索引分区：收藏/最近关闭/文档集的查询命中。挂在页签卡片之后、
    // 全库文档结果区之前；激活语义见 activateUnifiedItem。纯过滤逻辑在
    // switcher-unified-index.js（可单元测试），本层只做装配。
    private renderUnifiedSections(scrollElement: HTMLElement, keyword: string, onClose: IOverlayClose, parsedQuery?: {phrases: string[]; excludes: string[]; terms: string[]}) {
        const existing = scrollElement.querySelector<HTMLElement>(".sw__unified");
        if (!keyword) {
            existing?.remove();
            return;
        }
        const sections = buildUnifiedSections({
            query: keyword,
            favorites: this.getFavorites(),
            closed: this.getClosedHistory(),
            documentSets: this.getDocumentSets(),
            excludeRootIds: collectOpenRootIds.call(this),
            limitPerSection: 4,
            parsedQuery,
        });
        const navigation: any = buildNavigationResultModel({
            query: keyword,
            unifiedSections: sections,
            maxItemsPerGroup: 4,
            maxTotalItems: 12,
        });
        const unifiedGroup = navigation.groups.find((group: any) => group.key === "unified");
        const visibleSections = unifiedGroup?.sections || [];
        if (!visibleSections.length) {
            existing?.remove();
            return;
        }
        let box = existing;
        if (!box) {
            box = document.createElement("div");
            box.className = "sw__unified";
            const docResults = scrollElement.querySelector(".sw__doc-results");
            if (docResults) scrollElement.insertBefore(box, docResults);
            else scrollElement.appendChild(box);
        }
        box.textContent = "";
        const sectionTitles: Record<string, string> = {
            favorites: this.i18n.unifiedFavorites,
            closed: this.i18n.unifiedClosed,
            "doc-sets": this.i18n.unifiedDocSets,
        };
        visibleSections.forEach((section: any) => {
            const sectionEl = document.createElement("div");
            sectionEl.className = "sw__unified-section";
            const label = document.createElement("div");
            label.className = "sw__window-label";
            label.textContent = sectionTitles[section.key] || section.key;
            const grid = document.createElement("div");
            grid.className = "sw__doc-grid";
            section.items.forEach((item: any) => {
                const record = item as Record<string, unknown>;
                const meta = item.kind === "favorite"
                    ? (String(record.group || "") || this.i18n.unifiedFavorites)
                    : item.kind === "doc-set"
                        ? `${record.entryCount} ${this.i18n.unifiedDocSetDocs}`
                        : (Number(record.closedAt) > 0 ? new Date(Number(record.closedAt)).toLocaleDateString() : "");
                const button = document.createElement("button");
                button.type = "button";
                button.className = "sw__doc-item";
                const copy = document.createElement("span");
                copy.className = "sw__doc-copy";
                const title = document.createElement("span");
                title.className = "sw__doc-title";
                title.textContent = item.kind === "doc-set"
                    ? String(record.name || "")
                    : String(record.title || "");
                const metaEl = document.createElement("span");
                metaEl.className = "sw__doc-path";
                if (meta) metaEl.textContent = meta;
                copy.append(title, metaEl);
                button.appendChild(copy);
                button.addEventListener("click", () => this.activateUnifiedItem(item, onClose));
                // T-6810 并排打开：右键在右侧分屏打开（桌面）
                if (!this.isMobile && (item.kind === "favorite" || item.kind === "closed")) {
                    const itemRecord = item as Record<string, unknown>;
                    const rootId = String(itemRecord.rootId || "");
                    if (rootId && BLOCK_ID_RE.test(rootId)) {
                        button.title = (button.title ? button.title + " · " : "") + this.i18n.docSearchSplitHint;
                        button.addEventListener("contextmenu", (event) => {
                            event.preventDefault();
                            onClose();
                            void openTab({app: this.app, doc: {id: rootId}, position: "right"});
                        });
                    }
                }
                grid.appendChild(button);
            });
            sectionEl.append(label, grid);
            box.appendChild(sectionEl);
        });
    }

    private activateUnifiedItem(item: {kind: string; key?: string; rootId?: string; setId?: string}, onClose: IOverlayClose) {
        if (item.kind === "favorite") {
            const favorite = this.getFavorites().find((fav) => fav.key === item.key);
            if (favorite) {
                onClose();
                void this.jumpToFavorite(favorite, () => undefined);
                return;
            }
        }
        if (item.kind === "closed" || (item.kind === "favorite" && item.rootId)) {
            const rootId = String(item.rootId || "");
            if (!rootId) return;
            onClose();
            if (this.isMobile) {
                void this.mobileOpenDoc(rootId);
            } else {
                void openTab({app: this.app, doc: {id: rootId}});
            }
            return;
        }
        if (item.kind === "doc-set" && item.setId) {
            onClose();
            void this.restoreDocumentSetFromHome(item.setId);
        }
    }

    private getQuickActions(): IQuickAction[] {
        return sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY], QUICK_ACTIONS_MAX).items;
    }

    private saveQuickActions(actions: IQuickAction[]) {
        const normalized = sanitizeQuickActions(actions, QUICK_ACTIONS_MAX).items;
        if (!checkFloatingBallSettingsBudget(this.getSettings().floatingBall, normalized).ok) {
            showMessage(this.i18n.floatingBallImportFailed);
            return;
        }
        this.data[QUICK_ACTIONS_KEY] = normalized;
        this.saveDataDebounced(QUICK_ACTIONS_KEY);
        this.refreshOpenSwitchers();
        this.refreshSidebar();
        this.refreshFloatingBallPanels();
        if (typeof document === "object") {
            document.querySelector<HTMLElement>(".sw-floating-ball-settings")
                ?.dispatchEvent(new Event("sw-floating-ball-refresh"));
        }
    }

    private refreshFloatingBallPanels() {
        if (this.floatingBallPanels.size === 0) return;
        const config = this.getSettings().floatingBall || {};
        const actions = this.getFloatingBallActions();
        this.floatingBallPanels.forEach((panel) => panel?.update({config, actions}));
    }

    /**
     * 供第三方插件注册稳定的公开动作。持久化配置只保存 adapter id/value；
     * 不保存函数或 DOM 选择器；插件卸载后对应入口会安全地变为无动作。
     */
    public registerQuickActionAdapter(id: string, handler: (value: string) => void | Promise<void>, targets?: QuickActionTarget[]): () => void {
        if (!/^[A-Za-z0-9._:-]+$/.test(id) || typeof handler !== "function") {
            return () => undefined;
        }
        this.quickActionAdapters.set(id, handler);
        if (Array.isArray(targets)) {
            this.quickActionAdapterTargets.set(id, targets.filter((target, index, list) =>
                ["desktop", "sidebar", "mobile"].includes(target) && list.indexOf(target) === index));
        } else {
            this.quickActionAdapterTargets.delete(id);
        }
        this.refreshFloatingBallPanels();
        return () => {
            if (this.quickActionAdapters.get(id) === handler) {
                this.quickActionAdapters.delete(id);
                this.quickActionAdapterTargets.delete(id);
                this.refreshFloatingBallPanels();
            }
        };
    }

    /**
     * Register a persistent entry for another plugin. The callback stays in
     * memory while the provider is loaded; only serializable metadata is saved.
     */
    public registerQuickAction(options: {
        id: string;
        label: string;
        icon?: string;
        value?: string;
        targets?: QuickActionTarget[];
        handler: (value: string) => void | Promise<void>;
    }): () => void {
        if (!options || !/^[A-Za-z0-9._:-]+$/.test(options.id) || typeof options.handler !== "function") {
            return () => undefined;
        }
        const adapterId = options.id;
        const actionValue = options.value ? `${adapterId}/${options.value}` : adapterId;
        const registrationToken = Symbol(actionValue);
        this.quickActionProviderTokens.set(actionValue, registrationToken);
        const declaredTargets = Array.isArray(options.targets) ? options.targets : undefined;
        this.quickActionRegistry.register({
            id: adapterId,
            name: options.label,
            targets: declaredTargets,
            actions: [{value: options.value || "action", label: options.label, icon: options.icon || "iconPlugin", kind: "adapter"}],
        }, (action: {value?: string}) => options.handler(String(action?.value || "").replace(`${adapterId}/`, "")));
        const unregisterAdapter = this.registerQuickActionAdapter(adapterId, options.handler, declaredTargets);
        this.quickActionProviders.set(actionValue, {
            id: adapterId,
            label: normalizeQuickActionText(options.label, 80),
            icon: options.icon || "iconPlugin",
            value: actionValue,
            targets: (declaredTargets ? [...declaredTargets] : getDefaultQuickActionTargets("adapter", actionValue)) as QuickActionTarget[],
            declaredTargets: declaredTargets ? [...declaredTargets] : undefined,
        });
        const actions = this.getQuickActions();
        const existing = actions.find((item) => item.kind === "adapter" && item.value === actionValue);
        if (existing) {
            existing.label = normalizeQuickActionText(options.label, 80) || existing.label;
            existing.icon = options.icon || existing.icon;
            existing.targets = declaredTargets ? [...declaredTargets] : existing.targets;
            this.saveQuickActions(actions);
        }
        this.refreshFloatingBallPanels();
        return () => {
            if (this.quickActionProviderTokens.get(actionValue) !== registrationToken) return;
            this.quickActionProviderTokens.delete(actionValue);
            unregisterAdapter();
            this.quickActionProviders.delete(actionValue);
            this.quickActionRegistry.unregister(adapterId);
            this.refreshFloatingBallPanels();
        };
    }

    /** Opt-in read-only module boundary for the future home/second-panel UI. */
    public registerHomeModule(options: {
        moduleId: string;
        title?: string;
        icon?: string;
        category?: string;
        supportedDevices?: Array<"desktop" | "sidebar" | "mobile">;
        sizes?: Array<"xs" | "small" | "medium" | "tall" | "wide" | "large" | "full">;
        description?: string;
        protocolVersion?: number;
        author?: string;
        homepage?: string;
        source?: {pluginId?: string; name?: string; icon?: string; version?: string; homepage?: string; collection?: string; order?: number};
        clickCommand?: string;
        configSchema?: Array<Record<string, unknown>>;
        refreshOn?: Array<"switch-protyle" | "loaded-protyle" | "destroy-protyle">;
        read: (config: Record<string, unknown>, device: string) => unknown | Promise<unknown>;
        readOnly?: boolean;
        open?: () => void;
    }): () => void {
        const registration = this.homeRuntime.registerAdapter(options as unknown as Record<string, unknown>);
        const moduleId = String(options?.moduleId || "");
        if (registration.registered && typeof options?.open === "function") {
            this.homeModuleOpens.set(String(options.moduleId), (options as unknown as {open: () => void}).open);
        } else if (registration.registered) {
            this.homeModuleOpens.delete(moduleId);
        }
        if (registration.registered) {
            this.homeThirdPartyIds.add(moduleId);
            this.homeModuleChangeListeners.forEach((listener) => listener());
        }
        if (!registration.registered) return () => undefined;
        return () => {
            if (!registration.unregister()) return;
            this.homeModuleOpens.delete(moduleId);
            this.homeThirdPartyIds.delete(moduleId);
            this.homeModuleChangeListeners.forEach((listener) => listener());
        };
    }

    public getHomeModules(device: "desktop" | "sidebar" | "mobile" = this.isMobile ? "mobile" : "desktop") {
        return this.homeRuntime.listModules(device);
    }

    public readHomeModule(moduleId: string, device: "desktop" | "sidebar" | "mobile" = this.isMobile ? "mobile" : "desktop", config: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
        return this.homeRuntime.read(moduleId, device, config, options);
    }

    public buildHomeModuleView(moduleId: string, device: "desktop" | "sidebar" | "mobile" = this.isMobile ? "mobile" : "desktop", result: unknown, collapsed = false) {
        const module = this.homeRuntime.listModules(device).find((item: any) => item.moduleId === moduleId);
        return buildHomeModuleView(module, result, {collapsed});
    }

    /**
     * Convert an opt-in home module view into a DOM subtree. The host decides
     * where (or whether) to mount it; no default panel is created here.
     */
    public renderHomeModuleView(doc: unknown, view: unknown, options: Record<string, unknown> = {}) {
        return renderHomeModuleView(doc, view, options as any);
    }

    /** Create an explicit, lifecycle-bound home module mount for integrations. */
    public createHomeModuleController(container: unknown, moduleId: string, device: "desktop" | "sidebar" | "mobile" = this.isMobile ? "mobile" : "desktop", config: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
        const module = this.homeRuntime.listModules(device).find((item: any) => item.moduleId === moduleId);
        if (!module || !container || typeof (container as any).appendChild !== "function") return null;
        return createHomeModuleController({
            document: (container as any).ownerDocument || document,
            container,
            module,
            config,
            labels: options.labels,
            onItem: options.onItem,
            onToggle: options.onToggle,
            read: (nextConfig: Record<string, unknown>, readOptions: Record<string, unknown>) => this.homeRuntime.read(moduleId, device, nextConfig, readOptions),
        } as any);
    }

    /** Create an explicit multi-module second-panel mount for integrations. */
    public createHomePanelController(container: unknown, device: "desktop" | "sidebar" | "mobile" = this.isMobile ? "mobile" : "desktop", options: Record<string, unknown> = {}) {
        if (!container || typeof (container as any).appendChild !== "function") return null;
        const modules = this.homeRuntime.listModules(device);
        return createHomePanelController({
            document: (container as any).ownerDocument || document,
            container,
            modules,
            title: options.title,
            labels: options.labels,
            onItem: options.onItem,
            onToggle: options.onToggle,
            read: (module: any, config: Record<string, unknown>, readOptions: Record<string, unknown>) => this.homeRuntime.read(module.moduleId, device, config, readOptions),
        } as any);
    }

    private getPluginCommands(): IQuickActionPluginCommand[] {
        const plugins = (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins;
        if (!Array.isArray(plugins)) return [];
        const commands: IQuickActionPluginCommand[] = [];
        const seen = new Set<string>();
        plugins.forEach((plugin) => {
            const pluginName = typeof plugin?.name === "string" ? plugin.name : "";
            if (!pluginName || pluginName === this.name || !Array.isArray(plugin.commands)) return;
            const pluginTitle = normalizeQuickActionText(plugin.displayName, 40) || pluginName;
            plugin.commands.forEach((command) => {
                if (!command || typeof command !== "object") return;
                const commandKey = typeof command?.langKey === "string" ? command.langKey : "";
                if (!commandKey || (!command.callback && !command.globalCallback)) return;
                const value = `${pluginName}::${commandKey}`;
                if (seen.has(value)) return;
                seen.add(value);
                const safeId = `${pluginName}-${commandKey}`.replace(/[^A-Za-z0-9_-]/g, "-");
                const commandLabel = normalizeQuickActionText(command.langText || plugin.i18n?.[commandKey] || commandKey, 24) || commandKey;
                commands.push({
                    id: `command-${safeId}`,
                    value,
                    label: commandLabel,
                    icon: typeof command.icon === "string"
                        && /^[A-Za-z][A-Za-z0-9_-]*$/.test(command.icon)
                        && command.icon !== "iconCommand"
                        ? command.icon : "iconPlugin",
                    pluginName,
                    pluginTitle,
                    commandKey,
                    declaredTargets: this.getQuickActionDeclaredTargets({kind: "command", value} as IQuickAction),
                });
            });
        });
        return commands;
    }

    private getQuickActionDeclaredTargets(action: IQuickAction): QuickActionTarget[] | undefined {
        if (action.kind === "command") {
            const plugins = (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins;
            return getQuickActionCommandTargets(plugins, action.value) as QuickActionTarget[] | undefined;
        }
        // Host commands ship a source-verified surface set in their catalog
        // entry (T-6790); treat it as the declaration.
        if (action.kind === "global" && Array.isArray(action.targets)) {
            return [...action.targets];
        }
        if (action.kind !== "adapter") return undefined;
        const adapterId = action.value.split("/", 1)[0];
        return this.quickActionAdapterTargets.get(adapterId);
    }

    private getQuickActionSupport(action: IQuickAction, target: QuickActionTarget): QuickActionSupport {
        // globalCommand is only exported by SiYuan 3.8.3+; older hosts must
        // see these actions as unsupported rather than broken at runtime.
        if (action.kind === "global" && !this.hostCommandsAvailable()) return "unsupported";
        return resolveQuickActionSupport(action.kind, action.value, target,
            this.getQuickActionDeclaredTargets(action)) as QuickActionSupport;
    }

    /** SiYuan 3.8.3+ exposes globalCommand on the plugin instance (API.ts createAPI). */
    private hostCommandsAvailable(): boolean {
        return typeof (this as unknown as {globalCommand?: unknown}).globalCommand === "function";
    }

    /** Dispatch a verified host command (T-6790 catalog) through the official bridge. */
    private runHostCommand(value: string): boolean {
        const bridge = this as unknown as {globalCommand?: (command: string, app: unknown) => unknown};
        if (typeof bridge.globalCommand !== "function") return false;
        bridge.globalCommand.call(this, value, this.app);
        return true;
    }

    /**
     * T-6792 插入模板：列出 <data>/templates/ 下的模板（内核 manage 端点），
     * 选中后 render 为 HTML 并经官方 protyle.insert 写入当前光标处。
     * 渲染目标 id 取活动编辑器根块；无活动编辑器时提示后放弃。
     */
    private async openTemplatePicker(): Promise<void> {
        const editor = this.resolveActiveHostEditor();
        if (!editor) {
            showMessage(this.i18n.templatePickerNoEditor, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        const listing = await this.fetchKernelJson("/api/template/manage", {action: "list"});
        const entries = Array.isArray(listing?.data)
            ? listing.data.filter((entry: unknown) => {
                const item = entry as {path?: unknown; isDir?: unknown};
                return Boolean(item) && typeof item.path === "string" && item.path.length > 0 && item.isDir !== true;
            })
            : [];
        if (!entries.length) {
            showMessage(this.i18n.templatePickerEmpty, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        const dialog = new Dialog({
            title: this.i18n.templatePickerTitle,
            content: '<div class="speed-switch sw-template-picker"></div>',
            width: this.isMobile ? "min(440px, 92vw)" : "400px",
            height: this.isMobile ? "min(420px, 68vh)" : "360px",
        });
        const root = dialog.element.querySelector<HTMLElement>(".sw-template-picker");
        if (!root) return;
        const list = document.createElement("div");
        list.className = "sw-template-picker__list";
        entries.forEach((entry: {path: string}) => {
            const name = entry.path.split("/").pop() || entry.path;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "b3-list-item b3-list-item--narrow sw-template-picker__item";
            button.textContent = name;
            button.title = entry.path;
            button.addEventListener("click", () => {
                button.disabled = true;
                void this.insertHostTemplate(editor, entry.path).then((inserted) => {
                    if (inserted) dialog.destroy();
                    else button.disabled = false;
                });
            });
            list.appendChild(button);
        });
        root.appendChild(list);
    }

    private resolveActiveHostEditor(): {protyle: {block?: {parentID?: string}; insert: (html: string, isBlock?: boolean, useProtyleRange?: boolean) => void}} | null {
        const bridge = this as unknown as {getActiveEditor?: (wndActive?: boolean) => unknown};
        if (typeof bridge.getActiveEditor !== "function") return null;
        const editor = bridge.getActiveEditor.call(this) as {protyle?: {block?: {parentID?: string}; insert?: (html: string, isBlock?: boolean, useProtyleRange?: boolean) => void}} | undefined;
        return editor?.protyle?.insert ? (editor as {protyle: {block?: {parentID?: string}; insert: (html: string, isBlock?: boolean, useProtyleRange?: boolean) => void}}) : null;
    }

    private async insertHostTemplate(editor: {protyle: {block?: {parentID?: string}; insert: (html: string, isBlock?: boolean, useProtyleRange?: boolean) => void}}, path: string): Promise<boolean> {
        const rendered = await this.fetchKernelJson("/api/template/render", {
            id: editor.protyle.block?.parentID || "",
            path,
            mode: "editorInsert",
        }, 15000);
        const content = rendered?.data?.content;
        if (!rendered || rendered.code !== 0 || typeof content !== "string" || !content.trim()) {
            logger.warn("template insert failed", rendered?.msg || "empty content");
            showMessage(this.i18n.templateInsertFailed, MESSAGE_DEFAULT_MS, "error");
            return false;
        }
        editor.protyle.insert(content, true, true);
        return true;
    }

    /**
     * T-6791 一键同步：直调内核 performSync（不走 globalCommand 的确认弹窗）。
     * 只读/发布模式与同步进行中的拒绝都来自内核（CheckReadonly/互斥），
     * 插件侧只区分完成与失败两种提示；大库同步放宽到 60s 超时。
     */
    private async syncNow(): Promise<void> {
        const payload = await this.fetchKernelJson("/api/sync/performSync", {}, 60000);
        if (!payload || payload.code !== 0) {
            logger.warn("sync failed", payload?.msg || "kernel unreachable");
            showMessage(this.i18n.syncNowFailed, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        showMessage(this.i18n.syncNowCompleted, MESSAGE_DEFAULT_MS);
    }

    /**
     * Return only SVG symbol ids from the current document.  Plugin DOM
     * elements can legitimately share an id with an icon-like value, so
     * getElementById alone is not sufficient for deciding whether a symbol
     * reference is renderable.
     */
    private getAvailableIconSymbols(): Set<string> {
        return new Set(Array.from(document.querySelectorAll<SVGSymbolElement>("symbol[id]"))
            .map((symbol) => symbol.id)
            .filter((id) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(id)));
    }

    private renderQuickActionIcon(host: HTMLElement, raw: string, fallback: string | string[] = "iconFile") {
        host.innerHTML = "";
        const resolved = resolveIconReference(raw, this.getAvailableIconSymbols(), fallback);
        host.classList.remove("sw__quick-action-icon--image", "sw__quick-action-icon--emoji");
        if (resolved.type === "image") {
            const image = document.createElement("img");
            image.alt = "";
            image.loading = "lazy";
            image.referrerPolicy = "no-referrer";
            image.src = resolved.value;
            image.className = "sw__quick-action-icon-image";
            image.addEventListener("error", () => {
                if (image.parentNode === host) this.renderQuickActionIcon(host, "", fallback);
            }, {once: true});
            host.appendChild(image);
            host.classList.add("sw__quick-action-icon--image");
            return;
        }
        if (resolved.type === "emoji") {
            host.textContent = resolved.value;
            host.classList.add("sw__quick-action-icon--emoji");
            return;
        }
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `#${resolved.value}`);
        use.setAttribute("xlink:href", `#${resolved.value}`);
        svg.appendChild(use);
        host.appendChild(svg);
    }

    private renderQuickActions(container: HTMLElement, surface: "desktop" | "sidebar" | "mobile", searchInput: HTMLInputElement | null, close: () => void, selector = ".sw__quick-actions") {
        const host = container.querySelector<HTMLElement>(selector);
        if (!host) return;
        host.innerHTML = "";
        const settings = this.getSettings();
        const presentation = resolveQuickActionSurfaceState(surface, settings, selector);
        const {display, isRightRail, collapsed} = presentation;
        host.classList.toggle("sw__quick-actions--icons", display === "icons" || (collapsed && isRightRail));
        host.classList.toggle("sw__quick-actions--hidden", display === "hidden");
        host.classList.toggle("sw__quick-actions--collapsed", collapsed && display !== "hidden");
        if (display === "hidden") return;

        const collapseButton = document.createElement("button");
        collapseButton.type = "button";
        collapseButton.className = "sw__quick-action sw__quick-action--collapse";
        collapseButton.setAttribute("aria-label", collapsed ? this.i18n.quickExpand : this.i18n.quickCollapse);
        collapseButton.title = collapsed ? this.i18n.quickExpand : this.i18n.quickCollapse;
        collapseButton.innerHTML = `<span class="sw__quick-action-icon"><svg><use xlink:href="#${collapsed ? (isRightRail ? "iconLeft" : "iconUp") : (isRightRail ? "iconRight" : "iconDown")}"></use></svg></span>`;
        collapseButton.addEventListener("click", () => {
            if (surface === "desktop" && isRightRail) this.updateSettings({quickActionsCollapsedDesktopRight: !collapsed});
            else if (surface === "desktop") this.updateSettings({quickActionsCollapsedDesktopBottom: !collapsed});
            else if (surface === "sidebar") this.updateSettings({quickActionsCollapsedSidebar: !collapsed});
            else this.updateSettings({quickActionsCollapsedMobile: !collapsed});
        });
        host.appendChild(collapseButton);
        if (collapsed && !isRightRail) return;
        const actions = this.getQuickActions()
            .filter((action) => shouldRenderQuickAction(action, surface, "switcher", this.getQuickActionDeclaredTargets(action)))
            .sort((a, b) => a.order - b.order);
        // The same action host is used by desktop, sidebar, and mobile. Only
        // hide it when the current surface has no enabled actions; hiding all
        // non-desktop surfaces made the newly added entries unreachable there.
        actions.forEach((action) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sw__quick-action b3-tooltips b3-tooltips__n";
            button.setAttribute("aria-label", action.label);
            button.title = action.label;
            const icon = document.createElement("span");
            icon.className = "sw__quick-action-icon";
            const pluginFallback = action.kind === "adapter" || action.kind === "command"
                ? ["iconPlugin", "iconFile"] : "iconFile";
            this.renderQuickActionIcon(icon, action.icon, pluginFallback);
            const label = document.createElement("span");
            label.className = "sw__quick-action-label";
            label.textContent = action.label;
            button.append(icon, label);
            button.addEventListener("click", () => this.executeQuickAction(action, searchInput, close, surface));
            host.appendChild(button);
        });
        // 组件面板入口：桌面与手机底栏都常驻（手机端此前只能绕道"更多"菜单）
        if (surface === "desktop" || surface === "mobile") {
            const homeButton = document.createElement("button");
            homeButton.type = "button";
            homeButton.className = "sw__quick-action sw__quick-action--home b3-tooltips b3-tooltips__n";
            homeButton.setAttribute("aria-label", this.i18n.secondPanel);
            homeButton.title = this.i18n.secondPanel;
            homeButton.innerHTML = `<span class="sw__quick-action-icon"><svg><use xlink:href="#iconLayoutHome"></use></svg></span><span class="sw__quick-action-label">${this.i18n.secondPanel}</span>`;
            homeButton.addEventListener("click", () => {
                close();
                openSecondPanel.call(this);
            });
            host.appendChild(homeButton);
        }
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "sw__quick-action sw__quick-action--add b3-tooltips b3-tooltips__n";
        addButton.setAttribute("aria-label", this.i18n.addQuickAction);
        addButton.title = this.i18n.addQuickAction;
        const addIcon = document.createElement("span");
        addIcon.className = "sw__quick-action-icon";
        addIcon.innerHTML = '<svg><use xlink:href="#iconAdd"></use></svg>';
        const addLabel = document.createElement("span");
        addLabel.className = "sw__quick-action-label";
        addLabel.textContent = this.i18n.addQuickAction;
        addButton.append(addIcon, addLabel);
        addButton.addEventListener("click", () => {
            close();
            this.openSetting("quickActions");
        });
        host.appendChild(addButton);
    }

    /** Cycle through the host's current tabs, wrapping at either edge. */
    private cycleFloatingBallTab(offset: number): boolean {
        const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const activeId = this.isMobile ? this.getMobileActiveTabId() : this.getActiveTab()?.id;
        const next = selectAdjacentTab(tabs, activeId, offset);
        if (!next) return false;
        this.activateTab(next);
        return true;
    }

    /** Scroll the active document first, then fall back to a visible host list. */
    private scrollFloatingBallSurface(surface: QuickActionTarget, edge: "top" | "bottom") {
        const preferred: HTMLElement[] = [];
        if (surface !== "sidebar") {
            const active = this.isMobile
                ? this.getMobileTabs().find((tab) => tab.id === this.getMobileActiveTabId())
                : this.getActiveTab();
            const panel = (active as unknown as {panelElement?: HTMLElement} | undefined)?.panelElement;
            const content = panel?.querySelector<HTMLElement>(".protyle-content, .protyle-wysiwyg");
            if (content) preferred.push(content);
        }
        return scrollSurfaceTo(document, surface, this.sidebarElement, edge, {preferredElements: preferred});
    }

    private executeQuickAction(action: IQuickAction, searchInput: HTMLInputElement | null, close: () => void, surface?: QuickActionTarget) {
        const actionSurface = surface || (this.isMobile ? "mobile" : "desktop");
        const executor = createFloatingBallActionExecutor({
            adapters: this.quickActionAdapters,
            registry: this.quickActionRegistry,
            getDockByType: (type: string) => this.getDockByType(type),
            plugins: (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins,
            context: {surface: actionSurface, source: "quick-actions"},
            close,
            onSwitcher: () => this.showSwitcher(),
            onSearch: () => {
                if (searchInput?.isConnected) {
                    searchInput.focus();
                    return;
                }
                // Home/second-panel callers do not own a search input. Keep
                // the action useful by opening the correct switcher surface
                // and asking that surface to focus its real input.
                this.showSwitcher(true);
            },
            onJournal: () => this.openJournal(),
            onSettings: () => this.openSetting(),
            onHome: () => openSecondPanel.call(this),
            onQuickCapture: () => this.openQuickCapture(),
            onPreviousTab: () => this.cycleFloatingBallTab(-1),
            onNextTab: () => this.cycleFloatingBallTab(1),
            onScrollTop: () => this.scrollFloatingBallSurface(actionSurface, "top"),
            onScrollBottom: () => this.scrollFloatingBallSurface(actionSurface, "bottom"),
            onSyncNow: () => this.syncNow(),
            onInsertTemplate: () => this.openTemplatePicker(),
            onCycleDocSet: () => this.cycleDocumentSet(),
            onCycleBallPreset: () => this.cycleBallPreset(),
            onThrowToWindow: () => this.throwActiveDocToWindow()
                ? undefined : {ok: false, reason: "unavailable"},
            onHideKeyboard: () => this.hideMobileKeyboard()
                ? undefined : {ok: false, reason: "unavailable"},
            onJumpBack: () => this.jumpBack().then((ok) => {
                if (!ok) showMessage(this.i18n.jumpStackEmpty, MESSAGE_DEFAULT_MS, "error");
            }),
            onJumpForward: () => this.jumpForward().then((ok) => {
                if (!ok) showMessage(this.i18n.jumpStackEmpty, MESSAGE_DEFAULT_MS, "error");
            }),
            onGlobalCommand: (action: {value: string}) => this.runHostCommand(action.value)
                ? undefined : {ok: false, reason: "unavailable"},
        });
        void Promise.resolve(executor(action)).then((result) => {
            if (result?.ok) return;
            const reason = result?.reason === "failed" ? "failed" : "unavailable";
            logger.warn(`quick action ${reason}`, action.value);
            showMessage(
                reason === "failed" ? this.i18n.quickActionFailed : this.i18n.quickActionUnavailable,
                MESSAGE_DEFAULT_MS,
                "error",
            );
        }).catch((error) => {
            // The executor normalises provider errors, but keep this final
            // boundary defensive so a host callback can never create an
            // unhandled rejection in a toolbar click handler.
            logger.warn("quick action execution failed", error);
            showMessage(this.i18n.quickActionFailed, MESSAGE_DEFAULT_MS, "error");
        });
    }

    // T-6807 零词条工作台：空查询时直接呈现"场景预设/文档集/智能分组"入口
    // （Kvaesitso/Notion 的零态即工作台思想）。全部来自本地配置或按需拉取，
    // 不发任何无界请求；有查询时整块移除，避免与结果区争抢注意力。
    private renderWorkbench(scrollElement: HTMLElement, keyword: string, onClose: IOverlayClose) {
        const existing = scrollElement.querySelector<HTMLElement>(".sw__workbench");
        if (keyword) {
            existing?.remove();
            return;
        }
        if (existing) return;
        const presets = normalizeFloatingBallConfig(this.getSettings().floatingBall).presets || [];
        const docSets = this.getDocumentSets();
        const smartGroups = this.getSettings().favoriteSmartGroups || [];
        const savedSearches = this.getSettings().savedSearches || [];
        const activeRootId = this.rootIdOf(this.getActiveTab());
        // T-6814：有活动文档时关联内容行也可独立撑起工作台
        if (!presets.length && !docSets.length && !smartGroups.length && !savedSearches.length && !activeRootId) return;

        const box = document.createElement("div");
        box.className = "sw__workbench";
        const title = document.createElement("div");
        title.className = "sw__window-label";
        title.textContent = this.i18n.workbenchLabel;
        box.appendChild(title);

        const addRow = (label: string, items: Array<{label: string; onClick: () => void; onRemove?: () => void}>) => {
            if (!items.length) return;
            const rowTitle = document.createElement("div");
            rowTitle.className = "sw__workbench-row-label";
            rowTitle.textContent = label;
            box.appendChild(rowTitle);
            const row = document.createElement("div");
            row.className = "sw__workbench-row";
            items.forEach((item) => {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "sw__workbench-chip";
                chip.textContent = item.label;
                chip.addEventListener("click", () => {
                    chip.disabled = true;
                    item.onClick();
                    chip.disabled = false;
                });
                // T-6827：保存的搜索支持右键删除（确认后移除并重建工作台）
                chip.addEventListener("contextmenu", (event) => {
                    if (!item.onRemove) return;
                    event.preventDefault();
                    item.onRemove();
                });
                row.appendChild(chip);
            });
            box.appendChild(row);
        };

        addRow(this.i18n.workbenchPresets, presets.map((preset: any) => ({
            label: preset.name,
            onClick: () => {
                const applied = applyFloatingBallPreset(this.getSettings().floatingBall, preset.id);
                if (!applied.preset) return;
                this.updateSettings({floatingBall: applied.config});
                showMessage(this.i18n.floatingBallPresetApplied.replace("{x}", applied.preset.name), MESSAGE_DEFAULT_MS);
            },
        })));
        addRow(this.i18n.workbenchDocSets, docSets.map((set: any) => ({
            label: set.name,
            onClick: () => {
                onClose();
                void this.restoreDocumentSetFromHome(set.setId);
            },
        })));
        addRow(this.i18n.workbenchSmart, smartGroups.map((group) => ({
            label: `#${group.tag}`,
            onClick: () => this.openTagSmartGroupEntries(group),
        })));
        // T-6827 保存的搜索：单击应用（查询+笔记本筛选回放），右键删除
        addRow(this.i18n.workbenchSaved, savedSearches.map((saved: any) => ({
            label: saved.name,
            onClick: () => this.applySavedSearch(scrollElement, saved, onClose),
            onRemove: () => {
                if (!confirm(String(this.i18n.searchSavedDeleteConfirm).replace("{x}", String(saved.name || "")))) return;
                this.updateSettings({
                    savedSearches: (this.getSettings().savedSearches || []).filter((item: any) => item?.id !== saved.id),
                });
                scrollElement.querySelector(".sw__workbench")?.remove();
                this.renderWorkbench(scrollElement, "", onClose);
            },
        })));

        // T-6814 关联内容：活动文档的反链/提及（官方 getBacklink2 单次往返，
        // 有界投影 + 60s 会话缓存 + 竞态丢弃）。无活动文档或加载失败时整行不出现。
        if (activeRootId) {
            const relatedBox = document.createElement("div");
            relatedBox.className = "sw__workbench-related";
            box.appendChild(relatedBox);
            void this.fillRelatedContent(relatedBox, activeRootId, onClose);
        }

        const docResults = scrollElement.querySelector(".sw__doc-results");
        if (docResults) scrollElement.insertBefore(box, docResults);
        else scrollElement.appendChild(box);
    }

    // T-6821 深链接/剪贴板入口：读剪贴板 → 思源块链接（siyuan://blocks/<id>）
    // 确认后打开；普通文本预填进快速捕获（目标选择照常）。消毒、来源标记、
    // 用户确认、不保存凭据；空/不可读剪贴板给出明确回执。
    async openClipboardEntry() {
        let text = "";
        try {
            text = String(await navigator.clipboard?.readText?.() || "");
        } catch (error) {
            logger.warn("clipboard read fail", error);
        }
        const clean = text.trim();
        if (!clean) {
            showMessage(this.i18n.clipboardEmpty, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        const linkMatch = clean.match(/^siyuan:\/\/blocks\/(\d{14}-[0-9a-z]+)$/i);
        if (linkMatch) {
            // 来源标记：链接来自剪贴板，打开前向用户确认目的地
            if (confirm(this.i18n.clipboardOpenConfirm)) {
                void openDocSearchResult.call(this, linkMatch[1], null);
            }
            return;
        }
        this.openQuickCapture("", clean.slice(0, 500));
    }

    // ==================== T-6824 可迁移配置包：导出 / 导入 ====================

    public exportConfigPack(): string {
        const pack = buildConfigPack(
            {settings: this.getSettings(), documentSets: this.data[DOCUMENT_SETS_KEY]},
            {now: Date.now()},
        );
        return JSON.stringify(pack, null, 2);
    }

    /**
     * 导入配置包：整体校验通过后才落盘（校验-提交两段式，任一环节失败零写入）。
     * settings 深校验走既有 normalizeSettings；documentSets 深校验走既有
     * normalizeDocumentSets 迁移门禁。返回 {ok, reason?} 供 UI 呈现失败原因。
     */
    public importConfigPack(payload: unknown): {ok: boolean; reason?: string} {
        const result = normalizeConfigPackImport(payload);
        if (!result.ok) return {ok: false, reason: result.reason};
        let dsState: unknown = null;
        if (result.documentSets) {
            const normalized = normalizeDocumentSets(result.documentSets);
            dsState = {schemaVersion: normalized.schemaVersion, sets: normalized.sets};
        }
        this.updateSettings(result.settings);
        if (result.documentSets) {
            this.data[DOCUMENT_SETS_KEY] = dsState;
            this.saveDataDebounced(DOCUMENT_SETS_KEY);
        }
        return {ok: true};
    }

    // T-6827 保存的搜索：设置读取、保存（名称默认=查询文本，免去 Electron 不支持的
    // window.prompt；重命名交由后续版本）与应用回放。
    getSavedSearches(): Array<{id: string; name: string; query: string; notebook?: string}> {
        return Array.isArray(this.getSettings().savedSearches) ? this.getSettings().savedSearches : [];
    }

    saveCurrentSearch(query: string, filters: IDocSearchFilters = {}) {
        const cleanQuery = String(query || "").trim();
        if (!cleanQuery) return;
        const entry: {id: string; name: string; query: string; notebook?: string} = {
            id: `sw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            name: cleanQuery.slice(0, 40),
            query: cleanQuery.slice(0, 120),
        };
        if (filters && typeof (filters as any).notebook === "string" && (filters as any).notebook) {
            entry.notebook = String((filters as any).notebook).slice(0, 64);
        }
        this.updateSettings({savedSearches: [...this.getSavedSearches(), entry]});
        showMessage(this.i18n.searchSavedDone, MESSAGE_DEFAULT_MS);
    }

    applySavedSearch(scrollElement: HTMLElement, saved: {id?: string; name?: string; query: string; notebook?: string}, onClose: IOverlayClose) {
        // 输入框在顶栏（.sw__toolbar），是滚动容器的兄弟节点——必须从对话框根查找
        const root = scrollElement.closest(".speed-switch") as HTMLElement | null;
        const searchInput = (root || scrollElement.ownerDocument).querySelector<HTMLInputElement>(".sw__search");
        if (!searchInput) return;
        applySavedSearchFilters.call(this, scrollElement, searchInput, saved, onClose);
    }

    // T-6830 打开策略：按 rootId 找已打开页签；桌面/移动共用 rootIdOf 归一
    findOpenTabByRootId(rootId: string): Tab | null {
        const target = String(rootId || "");
        if (!target) return null;
        const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
        return tabs.find((tab) => this.rootIdOf(tab) === target) || null;
    }

    reuseOpenTabsEnabled(): boolean {
        return this.getSettings().reuseOpenTabs === true;
    }

    activateTabForReuse(rootId: string, onClose?: IOverlayClose): boolean {
        const existing = this.findOpenTabByRootId(rootId);
        if (!existing) return false;
        this.activateTab(existing, onClose);
        return true;
    }

    // T-6814 关联内容：拉取 + 填充。缓存以 rootId 绑定（60s TTL，FIFO ≤8），
    // 面板被移除/卸载后竞态丢弃；失败静默收起该行，不给空查询工作台添噪音。
    private relatedContentCache = new Map<string, {rootId: string; at: number; projection: {items: Array<{id: string; source: string; title: string; hPath: string}>; counts: {backlinks: number; mentions: number; shown: number}; truncated: boolean}}>();

    private async fillRelatedContent(box: HTMLElement, rootId: string, onClose: IOverlayClose): Promise<void> {
        const now = Date.now();
        const cached = this.relatedContentCache.get(rootId);
        let projection = cached && isRelatedCacheHit(cached, rootId, now) ? cached.projection : null;
        if (!projection) {
            // k/mk 为契约必传字段（可为空串）；块引索引在文档创建后有秒级延迟，
            // 首查为空时有界轮询（2.5s×5 次，共约 12.5s），期间面板被移除即放弃。
            const attempt = async (delayMs: number, retried: number): Promise<void> => {
                if (delayMs) {
                    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
                    // 仅重试路径提前判连：首次调用时工作台尚未插入 DOM（同步执行段）
                    if (!box.isConnected || this.isUnloading) return;
                }
                const payload = await this.fetchKernelJson("/api/ref/getBacklink2", {id: rootId, k: "", mk: "", includeMentions: true});
                if (!box.isConnected) return;
                projection = payload ? projectRelatedContent(payload.data) : null;
                if (!projection || projection.items.length === 0) {
                    if (retried < 5) return void attempt(2500, retried + 1) as Promise<void>;
                    return;
                }
                if (this.relatedContentCache.size >= 8) {
                    const oldest = this.relatedContentCache.keys().next().value;
                    if (oldest !== undefined) this.relatedContentCache.delete(oldest);
                }
                this.relatedContentCache.set(rootId, {rootId, at: Date.now(), projection});
                this.renderRelatedRow(box, projection, onClose);
            };
            return void attempt(0, 0);
        }
        this.renderRelatedRow(box, projection, onClose);
    }

    private renderRelatedRow(box: HTMLElement, projection: {items: Array<{id: string; source: string; title: string; hPath: string}>; counts: {backlinks: number; mentions: number; shown: number}; truncated: boolean}, onClose: IOverlayClose): void {
        if (!box.isConnected || projection.items.length === 0) return;
        const rowLabel = document.createElement("div");
        rowLabel.className = "sw__workbench-row-label";
        const total = projection.counts.backlinks + projection.counts.mentions;
        rowLabel.textContent = projection.truncated
            ? `${this.i18n.workbenchRelated} (${projection.counts.shown}/${total})`
            : this.i18n.workbenchRelated;
        box.appendChild(rowLabel);
        const row = document.createElement("div");
        row.className = "sw__workbench-row";
        projection.items.forEach((item) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "sw__workbench-chip";
            chip.textContent = (item.source === "mention" ? "∼ " : "") + item.title;
            chip.title = item.hPath || item.title;
            chip.addEventListener("click", () => {
                onClose();
                void openDocSearchResult.call(this, item.id, null);
            });
            row.appendChild(chip);
        });
        box.appendChild(row);
    }

    // T-6804/T-6807：拉取一个标签智能分组的条目并以只读列表呈现
    private openTagSmartGroupEntries(group: {name: string; tag: string}) {
        const query = buildTagSmartGroupQuery(group, {nowMs: Date.now()});
        if (!query) return;
        void this.fetchKernelJson("/api/query/sql", query).then((json) => {
            const entries = projectTagSmartGroupEntries(json?.data);
            const list = document.createElement("div");
            list.className = "sw__workbench-entries";
            entries.forEach((entry) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sw__doc-item";
                const copy = document.createElement("span");
                copy.className = "sw__doc-copy";
                const title = document.createElement("span");
                title.className = "sw__doc-title";
                title.textContent = entry.title;
                copy.appendChild(title);
                item.appendChild(copy);
                item.addEventListener("click", () => {
                    if (this.isMobile) void this.mobileOpenDoc(entry.rootId);
                    else void openTab({app: this.app, doc: {id: entry.rootId}});
                });
                list.appendChild(item);
            });
            if (!entries.length) {
                const empty = document.createElement("p");
                empty.className = "sw-settings__hint";
                empty.textContent = this.i18n.favSmartGroupEmpty;
                list.appendChild(empty);
            }
            this.openHostListDialog(`${group.name} · #${group.tag}`, list);
        });
    }

    private openHostListDialog(title: string, content: HTMLElement) {
        const dialog = new Dialog({
            title,
            content: '<div class="speed-switch sw__host-list"></div>',
            width: this.isMobile ? "min(440px, 92vw)" : "400px",
            height: this.isMobile ? "min(420px, 68vh)" : "360px",
        });
        const root = dialog.element.querySelector<HTMLElement>(".sw__host-list");
        if (!root) return;
        root.appendChild(content);
    }

    // ==================== 第二面板（小组件主页） ====================

    // 第三方模块的"跳转本体"回调（仅内存，不持久化）；模块读取失败时面板显示跳转按钮
    private homeModuleOpens = new Map<string, () => void>();
    private homeThirdPartyIds = new Set<string>();
    // 秒开快照（D-382）：面板会话内存级的"最后一次好数据"，按 instanceId 键控；
    // 仅插件生命周期内有效（不落盘），配置变更时失效，重开面板时直出"缓存"态。
    private homePanelSnapshots = new Map<string, {snapshot: any; at: number}>();
    private homeBuiltinAdapterIds = new Set<string>();
    private static HOME_ACCENTS = ["#7c6cf2", "#4f8ef7", "#35b8a8", "#f2a03d", "#e8637c", "#59b96f", "#e05fd0", "#8a93a6"];
    // 供 second-panel-ui 的宿主契约读取（this 参数模式拿不到类静态成员）
    private readonly homeAccents = SpeedSwitchPlugin.HOME_ACCENTS;

    // 全库扫描时间窗起点：days 天前的 "YYYYMMDDHHmmss"（思源 updated 同格式，可直接字符串比较）
    private taskWindowStart(days: number): string {
        const d = new Date(Date.now() - Math.max(1, days) * 86400000);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}000000`;
    }

    // 内核 HTTP POST 共用逻辑：端点白名单 + 5s 超时 + 非 2xx 抛错 + 失败返回 null
    private static KERNEL_ENDPOINTS = new Set([
        "/api/query/sql", "/api/tag/getTag", "/api/bookmark/getBookmark",
        "/api/filetree/getDoc", "/api/filetree/createDocWithMd",
        "/api/block/updateBlock", "/api/block/insertBlock", "/api/block/appendBlock",
        "/api/outline/getDocOutline", "/api/riff/getNotebookRiffDueCards",
        // v0.18 路径筛选（T-103）：只读列目录，用于搜索筛选选择路径前缀。
        // 真实宿主证据见 docs/path-filter-host-evidence.md（D-365）。
        "/api/filetree/listDocsByPath",
        // v3.8.x 内核数据组件群（T-6321~T-6325）：全部只读端点。
        "/api/filetree/getPinnedDocs",
        "/api/inbox/getShorthands",
        "/api/block/getRecentUpdatedBlocks",
        "/api/asset/getMissingAssets",
        // T-6814 关联内容（D3）：官方反链/提及一次性查询，只读。
        "/api/ref/getBacklink2",
        "/api/storage/getRecentDocs",
        "/api/storage/getCriteria",
        // v3.8.x 数据库只读渲染（T-6330 / ADR 0058）。
        "/api/av/renderAttributeView",
        // T-6470：数据库表格两级取数——renderAttributeView 0 行时经 getAttributeView
        // 解析真实库 ID（data.av.id）重试（嵌入/镜像库块 ID ≠ 库 ID）。
        "/api/av/getAttributeView",
        // T-6791 一键同步：写端点，CheckAdminRole+CheckReadonly（只读/发布模式）
        // 由内核侧拒绝；同步进行中的互斥也由内核处理。
        "/api/sync/performSync",
        // T-6792 插入模板：manage 列清单，render 渲染为 HTML 后经 protyle.insert
        // 写入光标处；render 的 path 校验（必须在 <data>/templates/ 内）由内核负责。
        "/api/template/manage",
        "/api/template/render",
    ]);

    /**
     * 语义搜索能力判定（P3-3）：读取宿主 AI embedding 配置，与内核
     * isEmbeddingEnabled 镜像一致。实时读取不缓存——用户中途启用 AI 配置
     * 后无需重载插件即可生效；未配置时语义选项不出现且请求静默走 keyword。
     */
    private isSemanticSearchAvailable(): boolean {
        try {
            return isSemanticEmbeddingConfigured(getSiyuan()?.config);
        } catch (_) {
            return false;
        }
    }

    private async fetchKernelJson(url: string, body: Record<string, unknown>, timeoutMs = 5000): Promise<any | null> {
        // 安全守卫（纵深防御）：仅允许同源、硬编码的思源内核相对路径。
        // - 必须以 "/" 开头（相对路径 → 同源），拒绝任何绝对 URL 与外部 host；
        // - 必须命中端点白名单，杜绝把请求指向任意地址（SSRF）。
        if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || !SpeedSwitchPlugin.KERNEL_ENDPOINTS.has(url)) {
            logger.warn("blocked non-whitelisted kernel endpoint", url);
            return null;
        }
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timer = window.setTimeout(() => controller?.abort(), timeoutMs);
        try {
            // 每个端点的 fetch 都使用字面量 URL（安全扫描要求：不存在变量 URL 请求）
            const init = {
                method: "POST" as const,
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
                ...(controller ? {signal: controller.signal} : {}),
            };
            let response: Response;
            switch (url) {
                case "/api/query/sql":
                    response = await fetch("/api/query/sql", init);
                    break;
                case "/api/tag/getTag":
                    response = await fetch("/api/tag/getTag", init);
                    break;
                case "/api/bookmark/getBookmark":
                    response = await fetch("/api/bookmark/getBookmark", init);
                    break;
                case "/api/filetree/getDoc":
                    response = await fetch("/api/filetree/getDoc", init);
                    break;
                case "/api/filetree/createDocWithMd":
                    response = await fetch("/api/filetree/createDocWithMd", init);
                    break;
                case "/api/block/updateBlock":
                    response = await fetch("/api/block/updateBlock", init);
                    break;
                case "/api/block/insertBlock":
                    response = await fetch("/api/block/insertBlock", init);
                    break;
                case "/api/block/appendBlock":
                    response = await fetch("/api/block/appendBlock", init);
                    break;
                case "/api/outline/getDocOutline":
                    response = await fetch("/api/outline/getDocOutline", init);
                    break;
                case "/api/riff/getNotebookRiffDueCards":
                    response = await fetch("/api/riff/getNotebookRiffDueCards", init);
                    break;
                case "/api/filetree/listDocsByPath":
                    response = await fetch("/api/filetree/listDocsByPath", init);
                    break;
                case "/api/filetree/getPinnedDocs":
                    response = await fetch("/api/filetree/getPinnedDocs", init);
                    break;
                case "/api/inbox/getShorthands":
                    response = await fetch("/api/inbox/getShorthands", init);
                    break;
                case "/api/block/getRecentUpdatedBlocks":
                    response = await fetch("/api/block/getRecentUpdatedBlocks", init);
                    break;
                case "/api/asset/getMissingAssets":
                    response = await fetch("/api/asset/getMissingAssets", init);
                    break;
                case "/api/ref/getBacklink2":
                    response = await fetch("/api/ref/getBacklink2", init);
                    break;
                case "/api/storage/getRecentDocs":
                    response = await fetch("/api/storage/getRecentDocs", init);
                    break;
                case "/api/storage/getCriteria":
                    response = await fetch("/api/storage/getCriteria", init);
                    break;
                case "/api/av/renderAttributeView":
                    response = await fetch("/api/av/renderAttributeView", init);
                    break;
                case "/api/av/getAttributeView":
                    response = await fetch("/api/av/getAttributeView", init);
                    break;
                case "/api/sync/performSync":
                    response = await fetch("/api/sync/performSync", init);
                    break;
                case "/api/template/manage":
                    response = await fetch("/api/template/manage", init);
                    break;
                case "/api/template/render":
                    response = await fetch("/api/template/render", init);
                    break;
                default:
                    logger.warn("blocked non-whitelisted kernel endpoint", url);
                    return null;
            }
            if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            logger.warn("kernel request fail", url, e);
            return null;
        } finally {
            window.clearTimeout(timer);
        }
    }

    // 外部生活组件在桌面 WebView 中可能受 CORS/代理环境影响。这里复用思源公开的
    // JSON 正向代理；目标在发出前仍必须命中生活组件 HTTPS 白名单或 ActivityWatch
    // 回环地址 + 固定 query 路由，避免形成任意 SSRF 通道。
    private async fetchActivityWatchViaKernel(url: string, init: {body?: string; headers?: Record<string, string>}): Promise<any> {
        // T-6466：补上 Miniflux 两条路由（entries/categories）——此前代理门禁不含
        // Miniflux，真实请求会被 blocked_endpoint 拦截（单测 mock fetchImpl 掩盖）。
        if (!allowedActivityWatchUrl(url) && !allowedLifeWidgetUrl(url)
            && !allowedMinifluxUrl(url) && !allowedMinifluxCategoriesUrl(url)) throw new Error("blocked_endpoint");
        const isPost = typeof init?.body === "string";
        const proxyBody: Record<string, unknown> = {
            url,
            method: isPost ? "POST" : "GET",
            timeout: 8000,
            contentType: "application/json",
            headers: [{Accept: "application/json"}],
            responseEncoding: "text",
        };
        // 附加请求头（如 Miniflux 的 X-Auth-Token）：逐键合并进代理头数组。
        // 值只进入发往本机内核的代理请求体；不写入任何插件日志、缓存或错误消息。
        const extraHeaders = init?.headers && typeof init.headers === "object" ? init.headers : {};
        for (const [name, value] of Object.entries(extraHeaders)) {
            if (!/^[A-Za-z0-9-]+$/.test(name) || typeof value !== "string" || !value) continue;
            proxyBody.headers = [...(proxyBody.headers as Array<Record<string, string>>), {[name]: value}];
        }
        if (isPost) {
            proxyBody.payload = init.body;
            proxyBody.payloadEncoding = "text";
        }
        const response = await fetch("/api/network/forwardProxy", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(proxyBody),
        });
        if (!response.ok) throw new Error("proxy_http_error");
        const envelope = await response.json();
        const data = envelope?.code === 0 && envelope?.data && typeof envelope.data === "object" ? envelope.data : null;
        const body = typeof data?.body === "string" ? data.body : "";
        const status = Number(data?.status);
        return {
            ok: Number.isFinite(status) && status >= 200 && status < 300,
            headers: {get: (name: string) => name.toLowerCase() === "content-length" ? String(body.length) : null},
            text: async () => body,
        };
    }

    // 内置只读适配器：面板数据全部来自插件既有领域数据（最近/收藏/日记/文档集/指定文档）。
    // 注册定义覆盖 home-model DEFAULT_MODULES 的同名项（标题随 i18n）。
    private registerBuiltinHomeAdapters() {
        const register = (
            moduleId: string,
            title: string,
            icon: string,
            description: string,
            refreshOn: string[],
            read: (config: Record<string, unknown>, device?: string, context?: {size?: string; signal?: AbortSignal | null}) => any | Promise<any>,
            policies: {timeoutMs?: number; cacheTtlMs?: number} = {},
            source?: {pluginId?: string; name?: string; icon?: string; version?: string; homepage?: string; collection?: string; order?: number},
        ) => {
            const result = this.homeRuntime.registerAdapter({
                moduleId, title, icon, description, category: "siyuan",
                supportedDevices: ["desktop", "sidebar", "mobile"],
                refreshOn,
                read,
                ...policies,
                ...(source ? {source} : {}),
            });
            if (result.registered) this.homeBuiltinAdapterIds.add(moduleId);
        };
        register("recent-documents", this.i18n.homeRecentDocuments, "iconHistory", this.i18n.homeDescRecent, ["switch-protyle", "loaded-protyle", "destroy-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/storage/getRecentDocs", {});
            return buildHostRecentDocsSnapshot(json, config, {
                title: this.i18n.homeRecentDocuments, empty: this.i18n.homeHostRecentEmpty, stat: this.i18n.homeUnitDocs,
            }) || {emptyHint: this.i18n.homeHostRecentEmpty, items: []};
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        register("favorites", this.i18n.homeFavorites, "iconStar", this.i18n.homeDescFav, ["switch-protyle", "loaded-protyle", "destroy-protyle"], async (config) => {
            const favorites = this.getFavorites();
            const documentIds = favoriteDocumentIdsForProbe(favorites, config);
            let documents: unknown[] = [];
            if (documentIds.length > 0) {
                const quoted = documentIds.map((id) => `'${id}'`).join(",");
                const json = await this.fetchKernelJson("/api/query/sql", {
                    stmt: `SELECT id, content, hpath FROM blocks WHERE type='d' AND id IN (${quoted}) LIMIT 12`,
                });
                if (!Array.isArray(json?.data)) throw new Error("invalid_favorite_documents");
                documents = json.data;
            }
            const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
            const openedKeys = new Set(tabs.map((tab) => this.pinKeyOf(tab)));
            return buildFavoritesWidgetSnapshot(favorites, documents, openedKeys, config, {
                title: this.i18n.homeFavorites,
                stat: this.i18n.homeStatFavorites,
                empty: this.i18n.homeFavoritesEmpty,
                emptyGroup: this.i18n.homeFavoritesGroupEmpty,
                emptyAvailable: this.i18n.homeFavoritesAvailableEmpty,
                ungrouped: this.i18n.homeFavoritesUngrouped,
                unavailable: this.i18n.homeFavoritesUnavailable,
                sessionOnly: this.i18n.homeFavoritesSessionOnly,
            });
        }, {timeoutMs: 1200, cacheTtlMs: 0});
        register("today-journal", this.i18n.homeTodayJournal, "iconCalendar", this.i18n.homeDescJournal, ["switch-protyle", "loaded-protyle"], (config) => {
            const notebook = normalizeAgentNotebookId(config.notebook);
            return {items: [{label: this.i18n.homeTodayJournalOpen, value: notebook ? `action:journal:${notebook}` : "action:journal"}]};
        }, {cacheTtlMs: 0});
        register("document-sets", this.i18n.homeDocumentSets, "iconLayout", this.i18n.homeDescDocSets, ["loaded-protyle", "destroy-protyle"], (config) =>
            buildDocumentSetsWidgetSnapshot(this.getDocumentSets(), config, {
                title: this.i18n.homeDocumentSets,
                stat: this.i18n.homeStatDocSets,
                documents: this.i18n.homeUnitDocs,
                empty: this.i18n.homeDocumentSetsEmpty,
            }), {cacheTtlMs: 0});
        register("fixed-document", this.i18n.homeFixedDocument, "iconFile", this.i18n.homeDescFixed, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeFixedDocumentConfig(config);
            if (!normalized.docId) return buildFixedDocumentSnapshot([], normalized, {
                configure: this.i18n.homeFixedDocumentConfigHint,
                unavailable: this.i18n.homeFixedDocumentUnavailable,
            });
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, content, hpath FROM blocks WHERE type='d' AND id='${normalized.docId}' LIMIT 1`,
            });
            if (!Array.isArray(json?.data)) throw new Error("invalid_fixed_document");
            return buildFixedDocumentSnapshot(json.data, normalized, {
                configure: this.i18n.homeFixedDocumentConfigHint,
                unavailable: this.i18n.homeFixedDocumentUnavailable,
            });
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 今日待办：默认读取“今日日记”文档中的任务块；开启全库扫描后才扩大到
        // 最近窗口内的全库任务。旧实现默认扫描当前打开文档，既不代表“今天”，
        // 也会让日记里的任务在未打开时完全消失。
        register("today-tasks", this.i18n.homeTodayTasks, "iconCheck", this.i18n.homeDescTasks, ["switch-protyle", "loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeTodayTasksConfig(config);
            const scanAll = normalized.allDocuments;
            const notebookFilter = normalizeAgentNotebookId(normalized.notebook);
            const since = this.taskWindowStart(normalized.days);
            // 显示已完成时同时匹配未勾选与已勾选（含大写 X）；否则只看未完成任务
            // 思源任务的规范数据库形态是列表项 type='i' / subtype='t'；
            // markdown 前缀可能是 "* [ ]"、"- [ ]" 等，SQL 只做宽门槛，
            // 最终由纯投影模型再次确认 checkbox。
            const stateCondition = normalized.showCompleted
                ? `(markdown LIKE '%[ ]%' OR markdown LIKE '%[x]%' OR markdown LIKE '%[X]%')`
                : `markdown LIKE '%[ ]%'`;
            const today = new Date();
            const pad = (value: number) => String(value).padStart(2, "0");
            const todayTitle = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            const todayAttr = `custom-dailynote-${todayTitle.replace(/-/g, "")}`;
            const escapedNotebook = notebookFilter.split("'").join("''");
            const notebookScope = notebookFilter ? ` AND d.box='${escapedNotebook}'` : "";
            // 默认范围优先使用思源今日日记属性，日期标题仅作为旧数据的兼容回退。
            // 全库模式保留旧的时间窗语义，避免一次性扫描超大工作空间。
            const scope = scanAll
                ? `${notebookFilter ? ` AND b.box='${escapedNotebook}'` : ""} AND b.updated >= '${since}'`
                : ` AND (d.id IN (SELECT block_id FROM attributes WHERE name='${todayAttr}') OR d.content LIKE '${todayTitle}%')${notebookScope}`;
            const fromClause = "blocks b JOIN blocks d ON d.id=b.root_id AND d.type='d'";
            const escapedQuery = normalized.query.split("'").join("''");
            const queryScope = escapedQuery
                ? ` AND instr(lower(COALESCE(b.content,'') || char(10) || COALESCE(d.content,'') || char(10) || COALESCE(d.hpath,'')), lower('${escapedQuery}')) > 0`
                : "";
            const orderBy = normalized.sortBy === "文档名称"
                ? "d.content COLLATE NOCASE ASC, b.created ASC"
                : "b.updated DESC";
            const [json, countJson] = await Promise.all([
                this.fetchKernelJson("/api/query/sql", {
                    stmt: `SELECT b.id, b.content, b.markdown, b.updated, d.content AS document_title, d.hpath FROM ${fromClause} WHERE b.type='i' AND b.subtype='t' AND ${stateCondition.replace(/\bmarkdown\b/g, "b.markdown")}${scope}${queryScope} ORDER BY ${orderBy} LIMIT 48`,
                }),
                this.fetchKernelJson("/api/query/sql", {
                    stmt: `SELECT COUNT(*) AS total FROM ${fromClause} WHERE b.type='i' AND b.subtype='t' AND ${stateCondition.replace(/\bmarkdown\b/g, "b.markdown")}${scope}${queryScope}`,
                }),
            ]);
            const total = Math.max(0, Number((countJson?.data || [])[0]?.total) || 0);
            const snapshot = buildTodayTasksSnapshot({data: json?.data, total}, normalized, {
                title: this.i18n.homeTodayTasks,
                stat: this.i18n.homeStatTasks,
                empty: !scanAll ? `今天（${todayTitle}）还没有可显示的待办` : this.i18n.homeTasksEmpty,
                emptyFiltered: this.i18n.homeTasksFilteredEmpty,
            });
            if (!snapshot) throw new Error("invalid_today_tasks");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 标签：getTag，点击打开思源标签面板（data 在 3.8.x 内核直接是数组，兼容旧的 data.tags 包装）
        register("tags", this.i18n.homeTags, "iconTags", this.i18n.homeDescTags, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/tag/getTag", {});
            const tags = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.tags) ? json.data.tags : null;
            const snapshot = buildTagListSnapshot(tags, config, {
                title: this.i18n.homeTags, stat: this.i18n.homeStatTags, blocks: this.i18n.homeUnitBlocks,
                empty: this.i18n.homeTagsEmpty, emptyFiltered: this.i18n.homeTagsFilteredEmpty,
            });
            if (!snapshot) throw new Error("invalid_tags");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 2000});
        // 书签：getBookmark，点击打开思源书签面板（data 直接是数组；无 count 时回退 blocks 数）
        register("bookmarks", this.i18n.homeBookmarks, "iconBookmark", this.i18n.homeDescBookmarks, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/bookmark/getBookmark", {});
            const bookmarks = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.bookmarks) ? json.data.bookmarks : null;
            const snapshot = buildBookmarkListSnapshot(bookmarks, config, {
                title: this.i18n.homeBookmarks, stat: this.i18n.homeStatBookmarks, blocks: this.i18n.homeUnitBlocks,
                empty: this.i18n.homeBookmarksEmpty, emptyFiltered: this.i18n.homeBookmarksFilteredEmpty,
                emptyEntry: this.i18n.homeBookmarkEmptyEntry,
            });
            if (!snapshot) throw new Error("invalid_bookmarks");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 2000});
        // 月度日记：兼容官方日记属性与日期标题，可浏览前后 24 个月；当月保留“打开今日日记”入口。
        register("journal-monthly", this.i18n.homeJournalMonthly, "iconCalendar", this.i18n.homeDescJournalMonthly, ["switch-protyle", "loaded-protyle"], async (config) => {
            const normalized = normalizeJournalMonthlyConfig(config);
            const now = new Date();
            const target = new Date(now.getFullYear(), now.getMonth() + normalized.monthOffset, 1);
            const prefix = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
            const next = new Date(target.getFullYear(), target.getMonth() + 1, 1);
            const nextPrefix = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
            const attrPrefix = `custom-dailynote-${prefix.replace("-", "")}`;
            const maxDay = String(new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()).padStart(2, "0");
            const notebook = normalizeAgentNotebookId(normalized.notebook);
            const notebookScope = buildNotebookBoxScope(notebook, "b");
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT b.id, b.root_id, b.content, b.hpath, b.updated, a.name AS daily_attr, COUNT(*) OVER() AS total_count FROM blocks b LEFT JOIN attributes a ON a.block_id=b.id AND a.name BETWEEN '${attrPrefix}01' AND '${attrPrefix}${maxDay}' WHERE b.type='d'${notebookScope} AND (a.name IS NOT NULL OR (b.content >= '${prefix}-01' AND b.content < '${nextPrefix}-01')) ORDER BY b.updated DESC LIMIT 48`,
            });
            const snapshot = buildJournalMonthlySnapshot(json?.data, {...normalized, notebook}, {
                monthTitle: this.i18n.homeCalendarMonthFormat,
                todayAction: this.i18n.homeTodayJournalOpen,
                stat: this.i18n.homeStatMonthlyJournals,
                empty: this.i18n.homeJournalMonthlyEmpty,
            }, now.getTime());
            if (!snapshot) throw new Error("invalid_journal_monthly");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1500});
        // 笔记统计：单次聚合全库规模与两个相邻时间窗，避免四次查询产生口径漂移。
        register("note-stats", this.i18n.homeNoteStats, "iconChart", this.i18n.homeDescNoteStats, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeNoteStatsConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const current = new Date();
            current.setHours(0, 0, 0, 0);
            current.setDate(current.getDate() - (normalized.days - 1));
            const previous = new Date(current.getFullYear(), current.getMonth(), current.getDate() - normalized.days);
            const kernelStamp = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}000000`;
            const currentStart = kernelStamp(current);
            const previousStart = kernelStamp(previous);
            const json = await this.fetchKernelJson("/api/query/sql", {stmt: `SELECT COUNT(CASE WHEN type='d' THEN 1 END) AS docs, COALESCE(SUM(CASE WHEN type<>'d' THEN length ELSE 0 END), 0) AS chars, COUNT(CASE WHEN type='d' AND created >= '${currentStart}' THEN 1 END) AS created, COUNT(CASE WHEN type='d' AND updated >= '${currentStart}' AND created < '${currentStart}' THEN 1 END) AS updated, COUNT(CASE WHEN type='d' AND created >= '${previousStart}' AND created < '${currentStart}' THEN 1 END) AS previous_created, COUNT(CASE WHEN type='d' AND updated >= '${previousStart}' AND updated < '${currentStart}' AND created < '${previousStart}' THEN 1 END) AS previous_updated FROM blocks WHERE 1=1${notebookScope}`});
            const row = (json?.data || [])[0];
            // T-6682 写作强度（opt-in）：仅在启用时追加一条按日有界查询（≤2×窗口行），
            // 模型层以同一指数平滑口径（半衰期 14 天）计算强度；关闭时零额外请求
            let daily: Array<{day: string; created: number; updated: number}> | undefined;
            if (normalized.showStrength) {
                const dailyJson = await this.fetchKernelJson("/api/query/sql", {stmt: `SELECT substr(created, 1, 8) AS day, COUNT(CASE WHEN type='d' THEN 1 END) AS created, COUNT(CASE WHEN type<>'d' THEN 1 END) AS updated FROM blocks WHERE created >= '${previousStart}'${notebookScope} GROUP BY substr(created, 1, 8) ORDER BY day LIMIT ${normalized.days * 2}`});
                daily = (dailyJson?.data || []) as Array<{day: string; created: number; updated: number}>;
            }
            const snapshot = buildNoteStatsSnapshot(row ? {
                docs: row.docs, chars: row.chars, created: row.created, updated: row.updated,
                previousCreated: row.previous_created, previousUpdated: row.previous_updated,
                daily,
            } : null, normalized, {
                title: this.i18n.homeNoteStats, documents: this.i18n.homeUnitDocs,
                characters: this.i18n.homeCharEstimate, created: this.i18n.homeWritingNewDocs,
                updated: this.i18n.homeWritingEditedDocs, trendUp: this.i18n.homeWritingTrendUp,
                trendDown: this.i18n.homeWritingTrendDown, trendFlat: this.i18n.homeWritingTrendFlat,
                trendNew: this.i18n.homeWritingTrendNew,
                strength: this.i18n.homeWritingStrength, strengthHalfLife: this.i18n.homeWritingStrengthHalfLife,
            });
            if (!snapshot) throw new Error("invalid_note_stats");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 年度进度：纯前端计算（已过天数 / 剩余天数 / 百分比），带进度条；日历日语义在模型内固定
        register("year-progress", this.i18n.homeYearProgress, "iconRefresh", this.i18n.homeDescYearProgress, [], (config, _device, context) => {
            const snapshot = buildYearProgressSnapshot(new Date(), config, {
                elapsed: this.i18n.homeYearElapsed, remaining: this.i18n.homeYearRemaining,
            });
            // xs 紧凑密度：只保留主进度，不铺两条明细
            if (context && context.size === "xs") return {...snapshot, items: []};
            return snapshot;
        });
        // 外部服务组件（13 个 external-* 适配器）的注册定义外迁至 home-external-adapters
        // （R2 重构 D-375）：register 闭包原样传入，宿主经 this 绑定提供 i18n 与内核代理
        // fetch；新增外部组件改在 home-external-adapters.ts 登记，index.ts 不再随之增长。
        registerExternalHomeAdapters.call(this, register);
        // 近期编辑：全库最近修改的文档列表，点击直达
        register("recent-edits", this.i18n.homeRecentEdits, "iconEdit", this.i18n.homeDescRecentEdits, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeRecentEditsConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const since = this.taskWindowStart(normalized.days);
            const keywordScope = normalized.query ? ` AND (content LIKE '%${normalized.query}%' OR hpath LIKE '%${normalized.query}%')` : "";
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, content, hpath, updated, COUNT(*) OVER() AS total_count FROM blocks WHERE type='d'${notebookScope} AND updated >= '${since}'${keywordScope} ORDER BY updated DESC LIMIT ${normalized.limit}`,
            });
            const snapshot = buildRecentEditsSnapshot(json?.data, normalized, {
                title: this.i18n.homeRecentEdits, empty: this.i18n.homeRecentEditsEmpty,
                emptyFiltered: this.i18n.homeRecentEditsFilteredEmpty, stat: this.i18n.homeUnitDocs,
            });
            if (!snapshot) throw new Error("invalid_recent_edits");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 闪卡待复习：笔记本级到期闪卡（只读）；限定单本显示卡片列表，全部笔记本显示到期数分布
        register("flashcard-due", this.i18n.homeFlashcardDue, "iconClock", this.i18n.homeDescFlashcardDue, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeFlashcardDueConfig(config);
            const notebookFilter = normalizeAgentNotebookId(normalized.notebook);
            if (notebookFilter) {
                const [json, notebookList] = await Promise.all([
                    this.fetchKernelJson("/api/riff/getNotebookRiffDueCards", {notebook: notebookFilter}),
                    this.loadNotebooks(),
                ]);
                const due = Number(json?.data?.unreviewedCount) || 0;
                const blockIds = ((json?.data?.cards || []) as Array<{blockID?: string}>)
                    .map((card) => String(card?.blockID || ""))
                    .filter((id) => BLOCK_ID_RE.test(id))
                    .slice(0, normalized.limit);
                const cardRows = blockIds.length > 0 ? (((await this.fetchKernelJson("/api/query/sql", {
                    stmt: `SELECT b.id, b.content, b.root_id, d.hpath FROM blocks b LEFT JOIN blocks d ON d.id=b.root_id AND d.type='d' WHERE b.id IN ('${blockIds.join("','")}') LIMIT ${normalized.limit}`,
                }))?.data || []) as Array<{id: string; content: string; root_id: string; hpath?: string}>) : [];
                const order = new Map(blockIds.map((id, index) => [id, index]));
                cardRows.sort((left, right) => (order.get(left.id) ?? blockIds.length) - (order.get(right.id) ?? blockIds.length));
                const snapshot = buildFlashcardDueSnapshot({
                    mode: "cards", data: cardRows, total: due,
                    notebookName: notebookList.find((entry) => entry.id === notebookFilter)?.name || "",
                }, normalized, {
                    title: this.i18n.homeFlashcardDue, stat: this.i18n.homeStatFlashcards,
                    emptyCards: this.i18n.homeFlashcardEmpty,
                });
                if (!snapshot) throw new Error("invalid_flashcard_due");
                return snapshot;
            }
            const notebooks = (await this.loadNotebooks()).slice(0, 12);
            const counts: Array<{id: string; label: string; count: number}> = [];
            // 大型工作区最多读取 12 本且每批并发 4 个，避免瞬时打满 riff 端点。
            for (let index = 0; index < notebooks.length; index += 4) {
                const chunk = await Promise.all(notebooks.slice(index, index + 4).map(async (nb) => {
                    const json = await this.fetchKernelJson("/api/riff/getNotebookRiffDueCards", {notebook: nb.id});
                    return {id: nb.id, label: nb.name, count: Number(json?.data?.unreviewedCount) || 0};
                }));
                counts.push(...chunk);
            }
            const total = counts.reduce((sum, entry) => sum + entry.count, 0);
            const snapshot = buildFlashcardDueSnapshot({mode: "notebooks", data: counts, total}, normalized, {
                title: this.i18n.homeFlashcardDue, stat: this.i18n.homeStatFlashcards,
                emptyNotebooks: this.i18n.homeFlashcardEmpty,
            });
            if (!snapshot) throw new Error("invalid_flashcard_due");
            return snapshot;
        }, {timeoutMs: 2500, cacheTtlMs: 2000});
        // 随机回顾：抽取 N 天未更新的旧文档（SQLite random()，只读）；仅手动刷新重抽，不订阅事件
        register("random-review", this.i18n.homeRandomReview, "iconDice", this.i18n.homeDescRandomReview, [], async (config) => {
            const normalized = normalizeRandomReviewConfig(config);
            const cutoff = this.taskWindowStart(normalized.days);
            // 精确父文档范围优先于笔记本范围，避免两项配置冲突时产生难以解释的空结果。
            const notebookScope = normalized.parentDocument ? "" : buildNotebookBoxScope(normalized.notebook);
            const parentId = normalized.parentDocument;
            const parentScope = parentId ? ` AND path LIKE '%/${parentId}.sy/%'` : "";
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, content, hpath, COUNT(*) OVER() AS total_count FROM blocks WHERE type='d'${notebookScope}${parentScope} AND updated < '${cutoff}' ORDER BY random() LIMIT ${normalized.limit}`,
            });
            return buildRandomReviewSnapshot(json, normalized, {
                title: this.i18n.homeRandomReview,
                stat: this.i18n.homeRandomReviewCandidates,
                empty: this.i18n.homeRandomReviewEmpty,
                emptyScoped: this.i18n.homeRandomReviewScopedEmpty,
            }) || {items: [], emptyHint: this.i18n.homeRandomReviewEmpty};
        }, {timeoutMs: 1500, cacheTtlMs: 15000});
        // 剪藏待读：按标签聚合的待读清单（Safari 阅读列表风格）；点击直达文档
        register("clipped-unread", this.i18n.homeClippedUnread, "iconBookmark", this.i18n.homeDescClippedUnread, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeClippedUnreadConfig({...config, tag: config.tag || "剪藏"});
            const tag = normalized.tag.replace(/[%_]/g, "").split("'").join("");
            if (!tag) return {items: [], emptyHint: this.i18n.homeClippedEmpty};
            const notebookScope = buildNotebookBoxScope(normalized.notebook, "b");
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT b.root_id AS root_id, d.content AS title, d.hpath AS hpath, MAX(b.created) AS latest, COUNT(*) OVER() AS total_count FROM blocks b JOIN blocks d ON d.id = b.root_id WHERE b.tag LIKE '%${tag}%'${notebookScope} AND b.root_id <> '' GROUP BY b.root_id ORDER BY latest DESC LIMIT 48`,
            });
            const snapshot = buildClippedUnreadSnapshot(json?.data, normalized, {
                title: this.i18n.homeClippedUnread, stat: this.i18n.homeStatClipped, empty: this.i18n.homeClippedEmpty,
            });
            if (!snapshot) throw new Error("invalid_clipped_unread");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1500});
        // 往年今日：同月同日的往年日记/文档（照片"回忆"风格）
        register("on-this-day", this.i18n.homeOnThisDay, "iconClock", this.i18n.homeDescOnThisDay, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const now = new Date();
            const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const thisYear = String(now.getFullYear());
            const normalized = normalizeOnThisDayConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, content, hpath FROM blocks WHERE type='d'${notebookScope} AND content GLOB '20[0-9][0-9]-${mmdd}*' AND content NOT GLOB '${thisYear}-${mmdd}*' ORDER BY content DESC LIMIT 64`,
            });
            const snapshot = buildOnThisDaySnapshot(json?.data, normalized, {
                title: this.i18n.homeOnThisDay, stat: this.i18n.homeStatOnThisDay, empty: this.i18n.homeOnThisDayEmpty,
            });
            if (!snapshot) throw new Error("invalid_on_this_day");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1500});
        // 今日写作：一次聚合读取新增字符/块和文档变化，并按可配置目标投影进度。
        register("today-writing", this.i18n.homeTodayWriting, "iconEdit", this.i18n.homeDescTodayWriting, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeTodayWritingConfig(config);
            const now = new Date();
            const start = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}000000`;
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const json = await this.fetchKernelJson("/api/query/sql", {stmt: `SELECT COALESCE(SUM(CASE WHEN type<>'d' AND created >= '${start}' THEN length ELSE 0 END), 0) AS chars, COUNT(CASE WHEN type<>'d' AND created >= '${start}' THEN 1 END) AS blocks, COUNT(CASE WHEN type='d' AND created >= '${start}' THEN 1 END) AS created_docs, COUNT(CASE WHEN type='d' AND updated >= '${start}' AND created < '${start}' THEN 1 END) AS updated_docs FROM blocks WHERE 1=1${notebookScope}`});
            const row = (json?.data || [])[0];
            const snapshot = buildTodayWritingSnapshot(row ? {
                chars: row.chars, blocks: row.blocks, createdDocs: row.created_docs, updatedDocs: row.updated_docs,
            } : null, normalized, {
                title: this.i18n.homeTodayWriting, characters: this.i18n.homeWritingNewChars,
                blocks: this.i18n.homeWritingNewBlocks, createdDocs: this.i18n.homeWritingNewDocs,
                updatedDocs: this.i18n.homeWritingEditedDocs, zero: this.i18n.homeTodayWritingZero,
                active: this.i18n.homeTodayWritingActive,
            });
            if (!snapshot) throw new Error("invalid_today_writing");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 写作打卡：按用户选择的每日阈值计算连续天数、断档提示与可配置周起始日。
        register("writing-streak", this.i18n.homeWritingStreak, "iconCheck", this.i18n.homeDescWritingStreak, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeWritingStreakConfig(config);
            const since = this.taskWindowStart(normalized.windowDays - 1);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT substr(created, 1, 8) AS day, COUNT(*) AS blocks, COALESCE(SUM(length), 0) AS chars FROM blocks WHERE type<>'d' AND created >= '${since}'${notebookScope} GROUP BY substr(created, 1, 8) ORDER BY day DESC LIMIT ${normalized.windowDays}`,
            });
            const snapshot = buildWritingStreakSnapshot(json?.data, normalized, {
                title: this.i18n.homeWritingStreak, weekdays: this.i18n.homeCalendarWeekdays,
                streak: this.i18n.homeStatStreakDays, pending: this.i18n.homeStreakPending,
                gap: this.i18n.homeStreakGap,
                weeklyStreak: this.i18n.homeStatStreakWeeks, weeklyPending: this.i18n.homeStreakWeeklyPending,
            });
            if (!snapshot) throw new Error("invalid_writing_streak");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 倒数日：手动设定目标日期（纪念日/DDL），显示剩余或已过天数；支持每年重复与倒数/累计双模式
        register("countdown", this.i18n.homeCountdown, "iconClock", this.i18n.homeDescCountdown, ["loaded-protyle"], (config) => {
            return buildCountdownSnapshot(new Date(), config, {
                hint: this.i18n.homeCountdownHint, untitled: this.i18n.homeCountdown,
                remaining: this.i18n.homeCountdownRemaining, today: this.i18n.homeCountdownToday,
                passed: this.i18n.homeCountdownPassed, yearly: this.i18n.homeCountdownYearly,
                elapsedDays: this.i18n.homeCountdownElapsed,
            });
        });
        // 日历月视图：本月日历网格（周一开头），有日记的日期可点击直达
        register("journal-calendar", this.i18n.homeJournalCalendar, "iconCalendar", this.i18n.homeDescJournalCalendar, ["loaded-protyle"], async (config, _device, context) => {
            const normalized = normalizeJournalCalendarConfig(config);
            const now = new Date();
            const base = new Date(now.getFullYear(), now.getMonth() + normalized.monthOffset, 1);
            const year = base.getFullYear();
            const month = base.getMonth();
            const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
            const attrPrefix = `custom-dailynote-${year}${String(month + 1).padStart(2, "0")}`;
            const notebookScope = buildNotebookBoxScope(normalized.notebook, "b");
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT b.id, b.content, b.updated, a.name AS daily_attr FROM blocks b LEFT JOIN attributes a ON a.block_id=b.id AND a.name GLOB '${attrPrefix}[0-3][0-9]' WHERE b.type='d'${notebookScope} AND (a.name IS NOT NULL OR b.content LIKE '${prefix}%') ORDER BY b.updated DESC, b.id ASC LIMIT 200`,
            });
            // Hoist both matchers: they depend only on the month prefix, so
            // compiling them per row would rebuild identical regexes up to the query
            // limit (200) times on every calendar render.
            const attrRe = new RegExp(`^${attrPrefix}(\\d{2})$`);
            const titleRe = new RegExp(`^${prefix}(\\d{2})(?:\\D|$)`);
            const journalByDay = new Map<string, string>();
            ((json?.data || []) as Array<{id: string; content: string; daily_attr?: string}>).forEach((row) => {
                const attrMatch = String(row.daily_attr || "").match(attrRe);
                const titleMatch = String(row.content).match(titleRe);
                const day = Number(attrMatch?.[1] || titleMatch?.[1] || 0);
                if (day >= 1 && day <= 31 && !journalByDay.has(String(day))) journalByDay.set(String(day), row.id);
            });
            const firstWeekday = new Date(year, month, 1).getDay();
            const leadingBlanks = normalized.weekStart === "周日" ? firstWeekday : (firstWeekday + 6) % 7;
            const showLunar = normalized.showLunar;
            const lunarFormatter = showLunar ? (() => {
                try {
                    return new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {month: "numeric", day: "numeric"});
                } catch (_) {
                    return null;
                }
            })() : null;
            const gridStart = new Date(year, month, 1 - leadingBlanks);
            const gridDates = Array.from({length: 42}, (_unused, index) =>
                new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
            let holidays = new Map<string, {date: string; name: string; isOffDay: boolean}>();
            if (normalized.showHolidays) {
                // holiday-cn 说明 12 月日期可能由下一年度公告修订，因此网格涉及的每个
                // 年份同时检查其下一年度文件；最多三个年度请求且均受 24 小时缓存约束。
                const yearSet = new Set<number>();
                gridDates.forEach((date) => {
                    yearSet.add(date.getFullYear());
                    yearSet.add(date.getFullYear() + 1);
                });
                const years = [...yearSet].slice(0, 3);
                const payloads = await Promise.all(years.map(async (entryYear) => {
                    try {
                        return await loadHolidayYear(entryYear, {signal: context?.signal});
                    } catch (_) {
                        return null;
                    }
                }));
                holidays = mergeHolidayPayloads(payloads.filter(Boolean));
            }
            const items: Array<{label: string; value: string; done?: boolean; outside?: boolean; secondary?: string; holiday?: string; weekend?: boolean}> = [];
            for (let index = 0; index < 42; index += 1) {
                const date = gridDates[index];
                const inMonth = date.getFullYear() === year && date.getMonth() === month;
                const visible = inMonth || normalized.showAdjacent;
                const dayKey = String(date.getDate());
                const lunar = inMonth && lunarFormatter ? lunarFormatter.format(date).slice(0, 16) : "";
                const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const holiday = holidayPresentation(holidays.get(isoDate), {work: this.i18n.homeHolidayWork});
                const secondary = visible ? [holiday?.label, lunar].filter(Boolean).join(" · ").slice(0, 32) : "";
                const isToday = date.getFullYear() === now.getFullYear()
                    && date.getMonth() === now.getMonth()
                    && date.getDate() === now.getDate();
                items.push({
                    label: visible ? dayKey : "",
                    value: inMonth ? journalByDay.get(dayKey) || "" : "",
                    ...(visible && isToday ? {done: true} : {}),
                    ...(inMonth ? {} : {outside: true}),
                    ...(secondary ? {secondary} : {}),
                    ...(visible && holiday ? {holiday: holiday.kind} : {}),
                    weekend: date.getDay() === 0 || date.getDay() === 6,
                });
            }
            const title = this.i18n.homeCalendarMonthFormat
                .replace("{year}", String(year))
                .replace("{month}", String(month + 1));
            const weekdays = this.i18n.homeCalendarWeekdays || "一二三四五六日";
            const calendarWeekdays = normalized.weekStart === "周日"
                ? `${weekdays.slice(-1)}${weekdays.slice(0, -1)}`
                : weekdays;
            return {
                title, items, calendarWeekdays,
                stat: {value: String(journalByDay.size), label: this.i18n.homeStatMonthlyJournals},
            };
        }, {timeoutMs: 2000, cacheTtlMs: 1500});
        // 快速记录：Flomo 式一键记一句到今日日记（点击后弹输入框，需确认追加）
        // 近期写作活跃度：补齐零值日期，支持块/字符口径与最多 14 桶的紧凑密度。
        register("recent-writing-activity", this.i18n.homeRecentWritingActivity, "iconChart", this.i18n.homeDescRecentWritingActivity, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeRecentWritingActivityConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const since = this.taskWindowStart(normalized.days - 1);
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT substr(created, 1, 8) AS day, COUNT(*) AS blocks, COALESCE(SUM(length), 0) AS chars FROM blocks WHERE type<>'d' AND created >= '${since}'${notebookScope} GROUP BY substr(created, 1, 8) ORDER BY day ASC LIMIT ${normalized.days}`,
            });
            const snapshot = buildRecentWritingActivitySnapshot(json?.data, normalized, {
                title: this.i18n.homeRecentWritingActivity, blocks: this.i18n.homeStatWritingBlocks,
                characters: this.i18n.homeUnitChars, average: this.i18n.homeWritingDailyAverage,
                empty: this.i18n.homeWritingActivityEmpty,
                strength: this.i18n.homeWritingStrength, strengthHalfLife: this.i18n.homeWritingStrengthHalfLife,
            });
            if (!snapshot) throw new Error("invalid_writing_activity");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 近期日记：按日期标题探测已存在的日记，绝不创建缺失日期。
        register("recent-daily-notes", this.i18n.homeRecentDailyNotes, "iconCalendar", this.i18n.homeDescRecentDailyNotes, ["switch-protyle", "loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeRecentDailyNotesConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const now = new Date();
            const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (normalized.days - 1));
            const from = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, root_id, content, hpath, updated, COUNT(*) OVER() AS total_count FROM blocks WHERE type='d'${notebookScope} AND content GLOB '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' AND content >= '${from}' AND content < '${today}~' ORDER BY content DESC LIMIT 48`,
            });
            const snapshot = buildRecentDailyNotesSnapshot(json?.data, normalized, {
                title: this.i18n.homeRecentDailyNotes, stat: this.i18n.homeStatRecentDaily, empty: this.i18n.homeRecentDailyEmpty,
            });
            if (!snapshot) throw new Error("invalid_recent_daily_notes");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1500});
        // 文档关系摘要：仅查询活动文档的直接子块与引用它的块，限制数量并保持只读。
        register("document-relations-summary", this.i18n.homeDocumentRelationsSummary, "iconGraph", this.i18n.homeDescDocumentRelationsSummary, ["switch-protyle", "loaded-protyle"], async (config) => {
            const active = this.isMobile
                ? this.getMobileTabs().find((tab) => tab.id === this.getMobileActiveTabId())
                : this.getActiveTab();
            const rootId = active ? this.rootIdOf(active) : "";
            if (!rootId || !BLOCK_ID_RE.test(rootId)) return {items: [], emptyHint: this.i18n.homeCurrentDocumentMissing};
            const escaped = rootId.split("'").join("''");
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, content, id AS target_id, 'child' AS relation FROM blocks WHERE root_id='${escaped}' AND parent_id='${escaped}' UNION ALL SELECT id, content, root_id AS target_id, 'reference' AS relation FROM blocks WHERE id<>'${escaped}' AND markdown LIKE '%((${escaped}%' ORDER BY relation ASC, id DESC LIMIT 64`,
            });
            const rows = (json?.data || []) as Array<{id?: string; content?: string; target_id?: string; relation?: string}>;
            const snapshot = buildDocumentRelationsSnapshot(rows, config, {
                title: this.i18n.homeDocumentRelationsSummary, stat: this.i18n.homeStatRelations,
                child: this.i18n.homeRelationChild, reference: this.i18n.homeRelationReference,
                referenceCount: this.i18n.homeRelationReferenceCount,
                empty: this.i18n.homeRelationsEmpty, emptyFiltered: this.i18n.homeRelationsFilteredEmpty,
            }, Date.now(), "fresh", active ? this.titleOf(active) : "");
            if (!snapshot) throw new Error("invalid_document_relations");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 当前文档大纲：复用 Agent 大纲扁平化口径，仅读取活动文档且限制标题数量。
        register("current-document-outline", this.i18n.homeCurrentDocumentOutline, "iconList", this.i18n.homeDescCurrentDocumentOutline, ["switch-protyle", "loaded-protyle"], async (config) => {
            const active = this.isMobile
                ? this.getMobileTabs().find((tab) => tab.id === this.getMobileActiveTabId())
                : this.getActiveTab();
            const rootId = active ? this.rootIdOf(active) : "";
            if (!rootId || !BLOCK_ID_RE.test(rootId)) return {items: [], emptyHint: this.i18n.homeCurrentDocumentMissing};
            const json = await this.fetchKernelJson("/api/outline/getDocOutline", {id: rootId, preview: false});
            if (!Array.isArray(json?.data)) throw new Error("invalid_document_outline");
            const headings = flattenOutline(json.data, 64);
            const snapshot = buildOutlineWidgetSnapshot(headings, config, {
                title: this.i18n.homeCurrentDocumentOutline, stat: this.i18n.homeStatOutlineHeadings,
                level: this.i18n.homeOutlineLevel, empty: this.i18n.homeOutlineEmpty,
                emptyFiltered: this.i18n.homeOutlineFilteredEmpty,
            }, Date.now(), "fresh", active ? this.titleOf(active) : "");
            if (!snapshot) throw new Error("invalid_document_outline");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        // 近期预约：复用日记插件确认过的 attributes.custom-reservation 数据契约，只读查询。
        register("today-reservations", this.i18n.homeTodayReservations, "iconClock", this.i18n.homeDescTodayReservations, ["switch-protyle", "loaded-protyle"], async (config) => {
            const normalized = normalizeTodayReservationsConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook, "B");
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT B.id, B.content, B.hpath, B.updated, A.value AS date FROM blocks AS B INNER JOIN attributes AS A ON A.block_id=B.id AND A.name='custom-reservation' WHERE A.value >= strftime('%Y%m%d', datetime('now','localtime','-${normalized.overdueDays} days')) AND A.value <= strftime('%Y%m%d', datetime('now','localtime','+${normalized.days} days'))${notebookScope} ORDER BY A.value, B.updated DESC LIMIT 48`,
            });
            if (!Array.isArray(json?.data)) throw new Error("invalid_today_reservations");
            const snapshot = buildTodayReservationsSnapshot(json.data, normalized, {
                title: this.i18n.homeTodayReservations, stat: this.i18n.homeStatReservations,
                today: this.i18n.homeReservationToday, overdue: this.i18n.homeReservationOverdue,
                empty: this.i18n.homeReservationsEmpty, emptyFiltered: this.i18n.homeReservationsFilteredEmpty,
            });
            if (!snapshot) throw new Error("invalid_today_reservations");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        register("quick-capture", this.i18n.homeQuickCapture, "iconAdd", this.i18n.homeDescQuickCapture, [], (config) => ({
            items: [{label: this.i18n.quickCaptureAction, value: buildQuickCaptureAction(config)}],
        }));
        // 插件命令启动器：枚举其他插件的命令，任何插件无需适配即可进面板一键触发
        register("plugin-commands", this.i18n.homePluginCommands, "iconPlugin", this.i18n.homeDescCmds, [], (config) => {
            const snapshot = buildPluginCommandsSnapshot(this.getPluginCommands(), config, {
                stat: this.i18n.homePluginCommandsStat, empty: this.i18n.homePluginCommandsEmpty,
                emptyFiltered: this.i18n.homePluginCommandsFilteredEmpty,
            });
            if (!snapshot) throw new Error("invalid_plugin_commands");
            return snapshot;
        });
        // 内核数据组件群（T-6321~T-6325、T-6328，v3.8.x 只读端点）：投影逻辑在
        // kernel-widget-model.js，这里只做端点调用与空态归一。
        register("pinned-docs", this.i18n.homePinnedDocs, "iconBookmark", this.i18n.homeDescPinnedDocs, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/filetree/getPinnedDocs", {});
            if (!Array.isArray(json?.data)) throw new Error("invalid_pinned_docs");
            const normalized = normalizePinnedDocsConfig(config);
            let pinnedDocs = json.data;
            if (normalized.showPath) {
                const ids = pinnedDocs.slice(0, normalized.limit)
                    .map((doc: any) => String(doc?.id || ""))
                    .filter((id: string) => BLOCK_ID_RE.test(id));
                if (ids.length > 0) {
                    const quoted = [...new Set(ids)].map((id) => `'${id}'`).join(",");
                    const metadata = await this.fetchKernelJson("/api/query/sql", {
                        stmt: `SELECT id, hpath FROM blocks WHERE type='d' AND id IN (${quoted}) LIMIT 12`,
                    });
                    const pathById = new Map((Array.isArray(metadata?.data) ? metadata.data : [])
                        .map((row: any) => [String(row?.id || ""), String(row?.hpath || "")]));
                    pinnedDocs = pinnedDocs.map((doc: any) => ({...doc, hpath: pathById.get(String(doc?.id || "")) || ""}));
                }
            }
            const snapshot = buildPinnedDocsSnapshot({...json, data: pinnedDocs}, normalized, {
                title: this.i18n.homePinnedDocs,
                empty: this.i18n.homePinnedDocsEmpty,
                stat: this.i18n.homePinnedDocsStat,
                children: this.i18n.homePinnedDocsChildren,
                unavailable: this.i18n.homePinnedDocsUnavailable,
                unavailableShort: this.i18n.homePinnedDocsUnavailableShort,
            });
            if (!snapshot) throw new Error("invalid_pinned_docs");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        register("inbox-shorthands", this.i18n.homeInbox, "iconInbox", this.i18n.homeDescInbox, [], async (config) => {
            const normalized = normalizeInboxConfig(config);
            const json = await this.fetchKernelJson("/api/inbox/getShorthands", {page: normalized.page});
            const snapshot = buildInboxSnapshot(json, normalized, {
                title: this.i18n.homeInbox, empty: this.i18n.homeInboxEmpty,
                emptyFiltered: this.i18n.homeInboxFilteredEmpty, page: this.i18n.homeInboxPage,
            });
            if (!snapshot) return {emptyHint: this.i18n.homeInboxUnavailable, items: []};
            return snapshot;
        }, {timeoutMs: 2500, cacheTtlMs: 30000});
        register("recent-updates", this.i18n.homeRecentUpdates, "iconRefresh", this.i18n.homeDescRecentUpdates, ["switch-protyle", "loaded-protyle", "destroy-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/block/getRecentUpdatedBlocks", {});
            const snapshot = buildRecentUpdatesSnapshot(json, config, {
                title: this.i18n.homeRecentUpdates, empty: this.i18n.homeRecentUpdatesEmpty,
                statDocuments: this.i18n.homeRecentUpdatesStat, statBlocks: this.i18n.homeRecentUpdatesBlocks,
                blocks: this.i18n.homeRecentUpdatesBlocks,
            });
            if (!snapshot) throw new Error("invalid_recent_updates");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        register("data-health", this.i18n.homeDataHealth, "iconCloud", this.i18n.homeDescDataHealth, ["loaded-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/asset/getMissingAssets", {});
            const snapshot = buildDataHealthSnapshot(json, config, {
                title: this.i18n.homeDataHealth, empty: this.i18n.homeDataHealthEmpty, stat: this.i18n.homeDataHealthStat,
                statMany: this.i18n.homeDataHealthStatMany,
            });
            if (!snapshot) throw new Error("invalid_data_health");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        register("database-list", this.i18n.homeDatabaseList, "iconDatabase", this.i18n.homeDescDatabaseList, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeDatabaseListConfig(config);
            const notebookScope = buildNotebookBoxScope(normalized.notebook);
            const keywordScope = normalized.query ? ` AND (content LIKE '%${normalized.query}%' OR hpath LIKE '%${normalized.query}%')` : "";
            const orderBy = normalized.sortBy === "名称" ? "content COLLATE NOCASE, updated DESC"
                : normalized.sortBy === "路径" ? "hpath COLLATE NOCASE, content COLLATE NOCASE" : "updated DESC";
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, content, hpath, updated, COUNT(*) OVER() AS total_count FROM blocks WHERE type = 'av'${notebookScope}${keywordScope} ORDER BY ${orderBy} LIMIT ${normalized.limit}`,
            });
            const snapshot = buildDatabaseListSnapshot(json?.data, normalized, {
                title: this.i18n.homeDatabaseList, empty: this.i18n.homeDatabaseListEmpty,
                emptyFiltered: this.i18n.homeDatabaseListFilteredEmpty, stat: this.i18n.homeDatabaseListStat,
            });
            if (!snapshot) throw new Error("invalid_database_list");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 1000});
        register("saved-searches", this.i18n.homeSavedSearches, "iconSearch", this.i18n.homeDescSavedSearches, ["loaded-protyle"], async (config) => {
            const json = await this.fetchKernelJson("/api/storage/getCriteria", {});
            const snapshot = buildSavedSearchesSnapshot(json, config, {
                title: this.i18n.homeSavedSearches, empty: this.i18n.homeSavedSearchesEmpty, stat: this.i18n.homeSavedSearchesStat,
                emptyFiltered: this.i18n.homeSavedSearchesFilteredEmpty,
                methods: [this.i18n.homeCriteriaMethod0, this.i18n.homeCriteriaMethod1, this.i18n.homeCriteriaMethod2, this.i18n.homeCriteriaMethod3, this.i18n.homeCriteriaMethod4],
            });
            if (!snapshot) throw new Error("invalid_saved_searches");
            return snapshot;
        }, {timeoutMs: 1200, cacheTtlMs: 2000});
        // 数据库表格（T-6330 / ADR 0058）：用户绑定一个数据库块，投影其当前视图
        // （筛选/排序/分页交还内核）；只读，行点击按块 ID 打开。
        register("database-table", this.i18n.homeAvTable, "iconDatabase", this.i18n.homeDescAvTable, ["loaded-protyle", "destroy-protyle"], async (config) => {
            const normalized = normalizeAvTableConfig(config);
            if (!normalized.blockId) return {emptyHint: this.i18n.homeAvTableConfigHint, items: []};
            // T-6470：嵌入/镜像库块 ID≠库 ID，块 ID 调用 rows=0；pageSize 取数，0 行经 getAttributeView 解析库 ID 重试（证据 kernel-api-smoke）。
            const fetchView = (id: string, extra: Record<string, unknown> = {}) =>
                this.fetchKernelJson("/api/av/renderAttributeView", {id, pageSize: 100, ...extra});
            let json = await fetchView(normalized.blockId);
            if (!json?.data?.view?.rows?.length) {
                try {
                    const full = await this.fetchKernelJson("/api/av/getAttributeView", {id: normalized.blockId});
                    const dbId = full?.data?.av?.id;
                    const viewID = full?.data?.av?.viewID;
                    if (typeof dbId === "string" && dbId && dbId !== normalized.blockId && typeof viewID === "string" && viewID) {
                        json = await fetchView(dbId, {viewID});
                    }
                } catch (_) { /* 保持首呼结果 */ }
            }
            const snapshot = buildAvTableSnapshot(json, normalized, {
                title: this.i18n.homeAvTable, empty: this.i18n.homeAvTableEmpty,
                stat: this.i18n.homeAvTableRows,
            });
            if (!snapshot) return {emptyHint: this.i18n.homeAvTableUnavailable, items: []};
            return snapshot;
        }, {timeoutMs: 1500, cacheTtlMs: 1000});
    }

    private getHomeState() {
        return normalizeHomeState(this.data[HOME_STATE_KEY]);
    }

    private saveHomeState(state: { schemaVersion: number; instances: unknown[]; layouts: Record<string, unknown[]> }) {
        this.data[HOME_STATE_KEY] = state;
        this.saveDataDebounced(HOME_STATE_KEY);
    }

    public loadHomeFavoriteGroups(): Array<{id: string; title: string}> {
        return this.getFavoriteGroupNames().slice(0, FAVORITE_GROUPS_MAX).map((name) => ({id: name, title: name}));
    }

    public async loadHomeDatabaseOptions(): Promise<Array<{id: string; title: string}>> {
        const json = await this.fetchKernelJson("/api/query/sql", {
            stmt: "SELECT id, content, hpath FROM blocks WHERE type = 'av' ORDER BY updated DESC, id ASC LIMIT 200",
        });
        const payload = normalizeSqlResult(json);
        if (payload.truncated) {
            // 选择器被内核截断：目标项可能不在候选里。截断可见化待补 i18n 提示（T-6482）。
            logger.warn("settings picker truncated by kernel limit", payload.limit);
        }
        const rows = payload.rows;
        const seen = new Set<string>();
        const items = rows.reduce((items: Array<{id: string; title: string}>, row: any) => {
            const id = typeof row?.id === "string" && BLOCK_ID_RE.test(row.id) ? row.id : "";
            if (!id || seen.has(id)) return items;
            seen.add(id);
            const content = String(row.content || "").trim();
            const path = String(row.hpath || "").trim();
            const title = [content, path && path !== content ? path : ""].filter(Boolean).join(" · ");
            items.push({id, title: String(title || id).slice(0, 128)});
            return items;
        }, []) as Array<{id: string; title: string}> & {truncated?: boolean; limit?: number};
        items.truncated = payload.truncated;
        items.limit = payload.limit;
        return items;
    }

    public async loadHomeDocumentOptions(query = ""): Promise<Array<{id: string; title: string}>> {
        const unsafeQueryChars = new Set(["%", "'", "_", '"', "`", ";", "\\"]);
        const keyword = Array.from(String(query || ""), (char) => unsafeQueryChars.has(char) ? " " : char)
            .join("").replace(/\s+/g, " ").trim().slice(0, 48);
        const filter = keyword
            ? ` AND (content LIKE '%${keyword}%' OR hpath LIKE '%${keyword}%' OR id LIKE '%${keyword}%')`
            : "";
        const json = await this.fetchKernelJson("/api/query/sql", {
            stmt: `SELECT id, content, hpath FROM blocks WHERE type = 'd'${filter} ORDER BY updated DESC, id ASC LIMIT 200`,
        });
        const payload = normalizeSqlResult(json);
        if (payload.truncated) {
            // 选择器被内核截断：目标项可能不在候选里。截断可见化待补 i18n 提示（T-6482）。
            logger.warn("settings picker truncated by kernel limit", payload.limit);
        }
        const rows = payload.rows;
        const seen = new Set<string>();
        const items = rows.reduce((items: Array<{id: string; title: string}>, row: any) => {
            const id = typeof row?.id === "string" && BLOCK_ID_RE.test(row.id) ? row.id : "";
            if (!id || seen.has(id)) return items;
            seen.add(id);
            const content = String(row.content || "").trim();
            const path = String(row.hpath || "").trim();
            const title = [content, path && path !== content ? path : ""].filter(Boolean).join(" · ");
            items.push({id, title: String(title || id).slice(0, 160)});
            return items;
        }, []) as Array<{id: string; title: string}> & {truncated?: boolean; limit?: number};
        items.truncated = payload.truncated;
        items.limit = payload.limit;
        return items;
    }

    public async loadHomeDatabaseColumns(blockId: string): Promise<Array<{id: string; title: string}>> {
        if (!BLOCK_ID_RE.test(blockId)) return [];
        const json = await this.fetchKernelJson("/api/av/renderAttributeView", {id: blockId});
        const view = json?.data?.view;
        const columns = view?.table?.columns || view?.columns;
        if (!Array.isArray(columns)) return [];
        return columns.filter((column: any) => column && column.hidden !== true && typeof column.id === "string")
            .slice(0, 32)
            .map((column: any) => ({id: column.id, title: String(column.name || column.label || column.id).slice(0, 64)}));
    }

    private removeHomeInstance(instanceId: string) {
        const next = this.getHomeState();
        next.instances = next.instances.filter((candidate) => candidate.instanceId !== instanceId);
        Object.keys(next.layouts).forEach((surface) => {
            next.layouts[surface] = (next.layouts[surface] || []).filter((candidate) => candidate.instanceId !== instanceId);
        });
        this.saveHomeState(next);
    }

    // 文档集快速恢复（面板内直达）：复用设置的预检 + 确认 + 可取消执行链路
    private async restoreDocumentSetFromHome(setId: string) {
        const item = this.getDocumentSets().find((candidate: any) => candidate?.setId === setId);
        if (!item) return;
        // T-6800 工作区切换：离开当前集（自动保存开、存在已激活集、目标不同）时，
        // 先把当前打开现场快照回当前集，再执行目标集恢复。
        this.snapshotCurrentDocumentSetBeforeSwitch(setId);
        const opened = new Set(this.currentDocumentSetEntries().map((entry) => entry.rootId));
        const plan = planDocumentSetRestore(item, opened, null);
        if (!plan.pending.length) {
            showMessage(this.i18n.documentSetRestoreNone);
            return;
        }
        const probe = await this.probeDocumentSetEntries(plan.pending);
        if (this.isUnloading) return;
        const candidates = [...probe.available, ...probe.unknown];
        if (!candidates.length) {
            showMessage(this.i18n.documentSetNoAvailable);
            return;
        }
        const confirmations: string[] = [];
        if (probe.missing.length > 0) confirmations.push(`${this.i18n.documentSetMissingConfirm} (${probe.missing.length})`);
        if (probe.unknown.length > 0) confirmations.push(`${this.i18n.documentSetUnknownConfirm} (${probe.unknown.length})`);
        const confirmation = confirmations.length > 0 ? confirmations.join("\n") : this.i18n.documentSetRestoreConfirm;
        if (!confirm(confirmation)) return;
        const execution = await runDocumentSetRestore(candidates, async (rootId) => {
            if (this.isUnloading) return false;
            // T-6826 keepCursor：恢复链批量打开不抢焦点（思源 3.8.5 openTab 官方
            // 选项，旧版宿主自动忽略），现场就位由当前页签保持，不逐个跳转。
            return this.isMobile ? await this.mobileOpenDoc(rootId)
                : await openDocumentOnDesktop({rootId, app: this.app, openTab, logger, keepCursor: true});
        });
        const summary = summarizeDocumentSetRestore(plan, probe, execution);
        let essentialsOutcome: {opened: number; failed: number; skipped: number} | null = null;
        if (summary.attempted > 0) {
            this.saveDocumentSet(item);
            // T-6800：恢复成功即标记当前工作区集（指示器与循环切换的基准）。
            this.updateSettings({documentSetsCurrentId: String(item.setId || "").slice(0, 64)});
            // T-6810/T-6815 场景×文档集联动（分层快照）：优先用集内固化的 presetId，
            // 回退同名匹配；应用成功后把场景固化回集，双向稳定。
            const presets = normalizeFloatingBallConfig(this.getSettings().floatingBall).presets;
            const presetMatch = (item.presetId ? presets.find((preset: {id: string}) => preset.id === item.presetId) : undefined)
                || presets.find((preset: {name: string}) => preset.name === item.name);
            if (presetMatch) {
                const applied = applyFloatingBallPreset(this.getSettings().floatingBall, presetMatch.id);
                if (applied.preset) {
                    this.updateSettings({floatingBall: applied.config});
                    item.presetId = String(applied.preset.id || "").slice(0, 96);
                }
            }
            // T-6815 Essentials 常驻层：带回执打开（opened/failed/skipped），并入统一摘要
            essentialsOutcome = await this.openDocumentSetEssentials();
        }
        let message = `${this.i18n.documentSetRestore}: ${summary.succeeded}/${summary.attempted}`;
        if (essentialsOutcome && essentialsOutcome.opened + essentialsOutcome.failed > 0) {
            message += ` · ${this.i18n.documentSetEssentialsApplied}: +${essentialsOutcome.opened}`;
            if (essentialsOutcome.failed > 0) message += ` / ${this.i18n.documentSetRestoreFailed}: ${essentialsOutcome.failed}`;
        }
        showMessage(message);
    }

    // T-6800 工作区切换的"离开即快照"：把当前打开的文档现场写回当前集
    // （条目上限沿用 DOCUMENT_SET_ENTRY_MAX，超界由 upsertDocumentSet 裁剪）。
    private snapshotCurrentDocumentSetBeforeSwitch(targetSetId: string) {
        const settings = this.getSettings();
        if (settings.documentSetsAutoSave === false) return;
        const currentId = String(settings.documentSetsCurrentId || "");
        if (!currentId || currentId === targetSetId) return;
        const currentSet = this.getDocumentSets().find((candidate: any) => candidate?.setId === currentId);
        if (!currentSet) return;
        const entries = this.currentDocumentSetEntries();
        if (!entries.length) return;
        this.saveDocumentSet({setId: currentId, name: currentSet.name, entries});
    }

    // T-6800 循环切换：按文档集列表顺序切到下一个（环绕）；无集或单集时不动作。
    private async cycleDocumentSet(): Promise<void> {
        const next = pickNextDocumentSet(this.getDocumentSets(), this.getSettings().documentSetsCurrentId);
        if (!next) {
            showMessage(this.i18n.documentSetCycleNone, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        await this.restoreDocumentSetFromHome(next.setId);
    }

    // T-6803 循环切换悬浮球场景预设：无预设/单预设时提示；切换后气泡提示场景名。
    private cycleBallPreset(): void {
        const current = normalizeFloatingBallConfig(this.getSettings().floatingBall);
        const next = pickNextFloatingBallPreset(current.presets, current.currentPresetId);
        if (!next) {
            showMessage(this.i18n.floatingBallPresetCycleNone, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        const applied = applyFloatingBallPreset(current, next.id);
        if (!applied.preset) return;
        this.updateSettings({floatingBall: applied.config});
        showMessage(this.i18n.floatingBallPresetApplied.replace("{x}", applied.preset.name), MESSAGE_DEFAULT_MS);
    }

    // T-6793 抛独立窗口：把当前活动文档送入思源桌面独立小窗（官方 openWindow，
    // 仅桌面；无活动文档/非桌面时如实不可用）。
    private throwActiveDocToWindow(): boolean {
        if (this.isMobile) return false;
        const editor = this.resolveActiveHostEditor();
        const rootId = (editor?.protyle as unknown as {block?: {parentID?: string}})?.block?.parentID || "";
        if (!rootId || !BLOCK_ID_RE.test(rootId)) return false;
        const bridge = this as unknown as {openWindow?: (options: {doc: {id: string}}) => void};
        if (typeof bridge.openWindow !== "function") return false;
        bridge.openWindow.call(this, {doc: {id: rootId}});
        return true;
    }

    // T-6794 收起键盘：Android 原生桥（思源 keyboardToolbar 同款守卫调用）；
    // iOS 无对应桥，如实不可用。
    private hideMobileKeyboard(): boolean {
        if (!this.isMobile) return false;
        const bridge = window as unknown as {JSAndroid?: {hideKeyboard?: () => void}};
        if (bridge.JSAndroid && typeof bridge.JSAndroid.hideKeyboard === "function") {
            bridge.JSAndroid.hideKeyboard();
            return true;
        }
        return false;
    }

    // ==================== T-6806 跳转栈（后退/前进） ====================

    private captureJumpOrigin(): void {
        if (this.suppressJumpCapture) return;
        const editor = this.resolveActiveHostEditor();
        const rootId = (editor?.protyle as unknown as {block?: {parentID?: string}})?.block?.parentID || "";
        if (!rootId || !BLOCK_ID_RE.test(rootId)) return;
        this.jumpBackStack.push({rootId});
        if (this.jumpBackStack.length > 50) this.jumpBackStack.shift();
        this.jumpForwardStack = [];
    }

    private async jumpBack(): Promise<boolean> {
        const target = this.jumpBackStack.pop();
        if (!target) return false;
        const editor = this.resolveActiveHostEditor();
        const currentRootId = (editor?.protyle as unknown as {block?: {parentID?: string}})?.block?.parentID || "";
        if (currentRootId && BLOCK_ID_RE.test(currentRootId)) {
            this.jumpForwardStack.push({rootId: currentRootId});
            if (this.jumpForwardStack.length > 50) this.jumpForwardStack.shift();
        }
        this.suppressJumpCapture = true;
        try {
            if (this.isMobile) await this.mobileOpenDoc(target.rootId);
            else await openTab({app: this.app, doc: {id: target.rootId}});
        } finally {
            this.suppressJumpCapture = false;
        }
        return true;
    }

    private async jumpForward(): Promise<boolean> {
        const target = this.jumpForwardStack.pop();
        if (!target) return false;
        const editor = this.resolveActiveHostEditor();
        const currentRootId = (editor?.protyle as unknown as {block?: {parentID?: string}})?.block?.parentID || "";
        if (currentRootId && BLOCK_ID_RE.test(currentRootId)) {
            this.jumpBackStack.push({rootId: currentRootId});
            if (this.jumpBackStack.length > 50) this.jumpBackStack.shift();
        }
        this.suppressJumpCapture = true;
        try {
            if (this.isMobile) await this.mobileOpenDoc(target.rootId);
            else await openTab({app: this.app, doc: {id: target.rootId}});
        } finally {
            this.suppressJumpCapture = false;
        }
        return true;
    }

    // 执行 "插件名::命令key"（协议 v2 条目级命令 / 模块级 clickCommand 共用）
    private executeHomeCommand(command: string, close: () => void): boolean {
        if (!/^[A-Za-z0-9_-]{1,64}::[A-Za-z0-9_-]{1,64}$/.test(command)) return false;
        const action = {
            id: "home-cmd", label: command, icon: "iconPlugin",
            kind: "command", value: command, targets: ["desktop"], order: 0, enabled: true,
        } as IQuickAction;
        close();
        this.executeQuickAction(action, null, () => undefined);
        return true;
    }

    // 面板内直接勾选待办：用户本人操作即确认，免弹窗；写失败给消息反馈
    // 受控写载荷加固：清除控制字符并钳制 64KB（updateBlock 写入前统一经过）
    private clampTaskWritePayload(markdown: string): string {
        return String(markdown).replace(/\u0000/g, "").slice(0, 65536);
    }

    private async toggleHomeTaskBlock(item: { value?: string; done?: boolean }): Promise<boolean> {
        const id = String(item.value || "");
        if (!BLOCK_ID_RE.test(id)) return false;
        const target = !(item.done === true);
        const rowJson = await this.fetchKernelJson("/api/query/sql", {
            stmt: `SELECT markdown FROM blocks WHERE id='${id}' AND type IN ('i','p')`,
        });
        const row = (rowJson?.data || [])[0] as {markdown?: string} | undefined;
        if (!row) return false;
        const newMarkdown = flipTaskMarkdown(String(row.markdown || ""), target);
        if (!newMarkdown) return false;
        const updateJson = await this.fetchKernelJson("/api/block/updateBlock", {
            dataType: "markdown", data: this.clampTaskWritePayload(newMarkdown), id,
        });
        return !!updateJson && updateJson.code === 0;
    }

    // 面板条目点击分发：条目命令 / 动作协议 / 文档集 / 收藏键 / 文档 rootId
    private handleHomeItemAction(item: { label?: string; value?: string; href?: string; command?: string }, close: () => void) {
        if (item.command && this.executeHomeCommand(item.command, close)) return;
        const value = String(item.value || "");
        const journalNotebook = value.startsWith("action:journal:") ? normalizeAgentNotebookId(value.slice(15)) : "";
        if (value === "action:journal" || journalNotebook) {
            close();
            this.openJournal(journalNotebook);
            return;
        }
        const quickCapture = parseQuickCaptureAction(value);
        if (quickCapture) {
            close();
            this.openQuickCapture(quickCapture.notebook, buildQuickCaptureInitialText(quickCapture));
            return;
        }
        if (value.startsWith("set:")) {
            close();
            void this.restoreDocumentSetFromHome(value.slice(4));
            return;
        }
        if (value.startsWith("tag:") || value.startsWith("bookmark:")) {
            const dockType = value.startsWith("tag:") ? "tag" : "bookmark";
            const dock = this.getDockByType(dockType);
            if (dock?.toggleModel) {
                try {
                    dock.toggleModel(dockType, true);
                    close();
                } catch (e) {
                    logger.warn("open dock fail", dockType, e);
                }
            }
            return;
        }
        if (value.startsWith("cmd:")) {
            const action = {
                id: "home-cmd", label: item.label || "", icon: "iconPlugin",
                kind: "command", value: value.slice(4), targets: ["desktop"], order: 0, enabled: true,
            } as IQuickAction;
            close();
            this.executeQuickAction(action, null, () => undefined);
            return;
        }
        const favorite = this.getFavorites().find((fav) => fav.key === value);
        if (favorite) {
            close();
            void this.jumpToFavorite(favorite, () => undefined);
            return;
        }
        if (BLOCK_ID_RE.test(value)) {
            close();
            if (this.isMobile) {
                void this.mobileOpenDoc(value);
            } else {
                void openTab({app: this.app, doc: {id: value}});
            }
            return;
        }
        if (item.href) {
            window.open(item.href, "_blank", "noopener");
        }
    }


    // 旧宽度档 → 新固定型号就近映射（一次迁移，迁移后 layout.size 非空即视为已迁移）
    private migrateHomeLayoutSize(entry: {w?: number; h?: number; size?: string}, sizes: string[]): string {
        if (entry.size && sizes.includes(entry.size)) return entry.size;
        const w = Number(entry.w) || 6;
        const fallback = w <= 2 ? "xs" : w <= 4 ? "small" : w <= 6 ? "medium" : w <= 9 ? "wide" : "large";
        return sizes.includes(fallback) ? fallback : (sizes[0] || "medium");
    }

    // 型号选择浮层（与排序浮层同模式：body + fixed + 外点/Esc 关闭），列出该模块支持的全部档位
    private openHomeSizeMenu(anchor: HTMLElement, supported: string[], current: string, onPick: (size: string) => void) {
        const panel = document.createElement("div");
        panel.className = "sw__sort-menu sw-home__size-menu";
        panel.setAttribute("role", "menu");
        const cleanup = () => {
            panel.remove();
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", esc, true);
            window.removeEventListener("resize", reposition);
        };
        const outside = (event: PointerEvent) => {
            if (!panel.contains(event.target as Node) && !anchor.contains(event.target as Node)) cleanup();
        };
        const esc = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cleanup();
            }
        };
        const reposition = () => {
            const rect = anchor.getBoundingClientRect();
            // 垂直：贴按钮下方，超出视口下缘时向上收
            panel.style.top = `${Math.round(Math.max(6, Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 6)))}px`;
            // 水平：锚定按钮右缘，再钳制左缘避免整块弹出屏外
            panel.style.right = `${Math.round(Math.max(6, window.innerWidth - rect.right))}px`;
            const box = panel.getBoundingClientRect();
            if (box.left < 6) {
                panel.style.left = "6px";
                panel.style.right = "auto";
            }
        };
        supported.forEach((key) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "sw__sort-menu-option";
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", String(key === current));
            // 型号预览瓦片：按该型号的 12 列比例绘制小矩形，直观对比大小
            const preset = HOME_WIDGET_SIZES[key as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
            const tile = document.createElement("i");
            tile.className = "sw__size-tile";
            tile.style.width = `${Math.max(8, Math.round(preset.w * 2.4))}px`;
            tile.style.height = `${Math.max(5, Math.round(preset.h * 1.7))}px`;
            const label = document.createElement("span");
            label.textContent = HOME_WIDGET_SIZE_LABELS[key as HomeWidgetSize] || key;
            item.append(tile, label);
            if (key === current) item.insertAdjacentHTML("beforeend", '<svg><use xlink:href="#iconCheck"></use></svg>');
            item.addEventListener("click", () => {
                cleanup();
                onPick(key);
            });
            panel.appendChild(item);
        });
        document.body.appendChild(panel);
        reposition();
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", esc, true);
        window.addEventListener("resize", reposition);
    }

    // 协议 v2 声明式配置表单：由 configSchema 渲染，保存写入实例 config 并回调刷新
    // 主页组件配置表单（openHomeConfigForm）已外迁至 home-config-form.ts
    // （R3 重构 D-377），经 .call(this) 绑定宿主调用。

    // 小组件商店（openHomeWidgetStore 与 openStoreWidgetPreview）已外迁至 home-store-ui.ts（R1，D-379）


    private getQuickActionPickerCandidates(actions: IQuickAction[]): IQuickActionPickerCandidate[] {
        const existing = new Set(actions.map((action) => `${action.kind}:${action.value}`));
        const targetNames: Record<QuickActionTarget, string> = {
            desktop: this.i18n.quickDesktop,
            sidebar: this.i18n.quickSidebar,
            mobile: this.i18n.quickMobile,
        };
        const describe = (kind: QuickActionKind, value: string, targets: QuickActionTarget[], declared?: QuickActionTarget[]) => {
            const supported = targets.filter((target) =>
                resolveQuickActionSupport(kind, value, target, declared) !== "unsupported");
            const parts = supported.map((target) => targetNames[target]);
            if (resolveQuickActionSupport(kind, value, "mobile", declared) === "unknown" && !supported.includes("mobile")) {
                parts.push(this.i18n.quickMobileUnknown);
            }
            return parts.join(" · ");
        };
        const candidates: IQuickActionPickerCandidate[] = [];
        const builtinLabels: Record<string, string> = {
            switcher: this.i18n.quickBuiltinSwitcher,
            search: this.i18n.quickBuiltinSearch,
            journal: this.i18n.quickBuiltinJournal,
            settings: this.i18n.quickBuiltinSettings,
            home: this.i18n.secondPanel,
            "quick-capture": this.i18n.quickBuiltinQuickCapture,
            "previous-tab": this.i18n.quickBuiltinPreviousTab,
            "next-tab": this.i18n.quickBuiltinNextTab,
            "scroll-top": this.i18n.quickBuiltinScrollTop,
            "scroll-bottom": this.i18n.quickBuiltinScrollBottom,
            "sync-now": this.i18n.quickBuiltinSyncNow,
            "insert-template": this.i18n.quickBuiltinInsertTemplate,
            "cycle-doc-set": this.i18n.quickBuiltinCycleDocSet,
            "cycle-ball-preset": this.i18n.quickBuiltinCycleBallPreset,
            "throw-window": this.i18n.quickBuiltinThrowWindow,
            "hide-keyboard": this.i18n.quickBuiltinHideKeyboard,
            "jump-back": this.i18n.quickBuiltinJumpBack,
            "jump-forward": this.i18n.quickBuiltinJumpForward,
        };
        getBuiltinQuickActions().forEach((raw) => {
            const action = raw as IQuickAction;
            if (existing.has(`builtin:${action.value}`)) return;
            action.label = builtinLabels[action.value] || action.label;
            candidates.push({
                id: action.id,
                label: action.label,
                icon: action.icon,
                group: this.i18n.quickBuiltin,
                secondary: describe(action.kind, action.value, action.targets),
                searchText: `${action.label} ${action.value} ${this.i18n.quickBuiltin}`,
                action,
            });
        });
        const globalLabels: Record<string, string> = {
            outline: this.i18n.quickGlobalOutline,
            bookmark: this.i18n.quickGlobalBookmark,
            tag: this.i18n.quickGlobalTag,
            inbox: this.i18n.quickGlobalInbox,
            backlinks: this.i18n.quickGlobalBacklinks,
            recentDocs: this.i18n.quickGlobalRecentDocs,
            recentClosed: this.i18n.quickGlobalRecentClosed,
            riffCard: this.i18n.quickGlobalRiffCard,
            editReadonly: this.i18n.quickGlobalEditReadonly,
        };
        getGlobalQuickActions().forEach((raw) => {
            const action = raw as IQuickAction;
            if (existing.has(`global:${action.value}`)) return;
            action.label = globalLabels[action.value] || action.label;
            candidates.push({
                id: action.id,
                label: action.label,
                icon: action.icon,
                group: this.i18n.quickHostCommands,
                secondary: describe(action.kind, action.value, action.targets, action.targets),
                searchText: `${action.label} ${action.value} ${this.i18n.quickHostCommands}`,
                action,
            });
        });
        this.getDockPanels().forEach((panel) => {
            if (existing.has(`dock:${panel.type}`)) return;
            const targets = getDefaultQuickActionTargets("dock", panel.type) as QuickActionTarget[];
            const safeType = panel.type.replace(/[^A-Za-z0-9_-]/g, "-");
            const dockLabel = normalizeQuickActionText(panel.title, 24) || panel.type;
            const action: IQuickAction = {
                id: `dock-${safeType}`,
                label: dockLabel,
                icon: panel.icon || "iconDock",
                kind: "dock",
                value: panel.type,
                targets,
                order: 0,
                enabled: true,
            };
            candidates.push({
                id: action.id,
                label: dockLabel,
                icon: action.icon,
                group: this.i18n.quickDock,
                secondary: describe(action.kind, action.value, targets),
                searchText: `${dockLabel} ${panel.type} ${this.i18n.quickDock}`,
                action,
            });
        });
        this.quickActionProviders.forEach((provider) => {
            if (existing.has(`adapter:${provider.value}`)) return;
            const safeValue = provider.value.replace(/[^A-Za-z0-9_-]/g, "-");
            const providerLabel = normalizeQuickActionText(provider.label, 24) || provider.id;
            const action: IQuickAction = {
                id: `adapter-${safeValue}`,
                label: providerLabel,
                icon: provider.icon,
                kind: "adapter",
                value: provider.value,
                targets: [...provider.targets],
                order: 0,
                enabled: true,
            };
            candidates.push({
                id: action.id,
                label: providerLabel,
                icon: provider.icon,
                // T-6811 按来源插件分组：同一插件的动作聚合在以其命名的分组下
                group: providerLabel || this.i18n.quickPluginActions,
                fallbackIcon: ["iconPlugin", "iconFile"],
                secondary: describe(action.kind, action.value, action.targets, provider.declaredTargets),
                searchText: `${providerLabel} ${provider.id} ${provider.value} ${this.i18n.quickPluginActions}`,
                action,
            });
        });
        this.getPluginCommands().forEach((command) => {
            if (existing.has(`command:${command.value}`)) return;
            const targets = getDefaultQuickActionTargets("command", command.value, command.declaredTargets) as QuickActionTarget[];
            const displayLabel = normalizeQuickActionText(command.label, 24) || normalizeQuickActionText(command.value, 24);
            const pluginTitle = normalizeQuickActionText(command.pluginTitle, 32) || command.pluginName;
            const action: IQuickAction = {
                id: command.id,
                label: displayLabel,
                icon: command.icon,
                kind: "command",
                value: command.value,
                targets,
                order: 0,
                enabled: true,
            };
            candidates.push({
                id: action.id,
                label: displayLabel,
                icon: command.icon,
                // T-6811 按来源插件分组：同一插件的命令聚合在以其命名的分组下
                group: pluginTitle || command.pluginName || this.i18n.quickPluginCommands,
                fallbackIcon: ["iconPlugin", "iconFile"],
                secondary: `${pluginTitle} · ${describe(action.kind, action.value, targets, command.declaredTargets)}`,
                searchText: `${displayLabel} ${pluginTitle} ${command.pluginName} ${command.commandKey} ${this.i18n.quickPluginCommands}`,
                action,
            });
        });
        return candidates;
    }

    private renderQuickActionIconButton(button: HTMLButtonElement, icon: string) {
        button.innerHTML = "";
        const preview = document.createElement("span");
        preview.className = "sw-setting__quick-icon-preview";
        this.renderQuickActionIcon(preview, icon, ["iconPlugin", "iconFile"]);
        const name = document.createElement("span");
        name.className = "sw-setting__quick-icon-name";
        name.textContent = isImageIconReference(icon) ? this.i18n.quickIconImage : /^icon/.test(icon) ? icon.slice(4) : icon;
        const arrow = document.createElement("svg");
        arrow.className = "sw-setting__quick-icon-arrow";
        arrow.innerHTML = '<use xlink:href="#iconDown"></use>';
        button.append(preview, name, arrow);
    }

    private getAvailableQuickActionIcons(current: string): string[] {
        const fallback = [
            "iconLayout", "iconSearch", "iconCalendar", "iconSettings", "iconFile", "iconFolder",
            "iconDock", "iconPlugin", "iconAdd", "iconClock", "iconTask", "iconBookmark",
        ];
        const loaded = Array.from(document.querySelectorAll<SVGSymbolElement>("symbol[id]"))
            .map((symbol) => symbol.id)
            .filter((id) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(id));
        const emoji = ["⭐", "📅", "🔍", "✅", "⚡"];
        return Array.from(new Set([current, ...fallback, ...loaded, ...emoji].filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }

    private openQuickActionIconPicker(action: IQuickAction, onPick: (icon: string) => void) {
        document.querySelector(".sw-quick-icon-picker-overlay")?.remove();
        const overlay = document.createElement("div");
        overlay.className = "sw-quick-icon-picker-overlay";
        const sheet = document.createElement("div");
        sheet.className = "sw-quick-icon-picker";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-label", this.i18n.quickChooseIcon);
        const header = document.createElement("div");
        header.className = "sw-quick-icon-picker__header";
        const title = document.createElement("strong");
        title.textContent = this.i18n.quickChooseIcon;
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "b3-button b3-button--text sw-quick-icon-picker__close";
        closeButton.setAttribute("aria-label", this.i18n.close);
        closeButton.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg>';
        header.append(title, closeButton);
        const search = document.createElement("input");
        search.type = "search";
        search.className = "b3-text-field sw-quick-icon-picker__search";
        search.placeholder = this.i18n.quickIconSearch;
        search.setAttribute("aria-label", this.i18n.quickIconSearch);
        const custom = document.createElement("input");
        custom.type = "text";
        custom.className = "b3-text-field sw-quick-icon-picker__custom";
        custom.placeholder = this.i18n.quickIconCustom || "Emoji、短文字、HTTPS 图片或 data URL";
        custom.setAttribute("aria-label", custom.placeholder);
        custom.value = /^icon[A-Za-z0-9_-]+$/.test(action.icon || "") ? "" : (action.icon || "");
        const customApply = document.createElement("button");
        customApply.type = "button";
        customApply.className = "b3-button sw-quick-icon-picker__custom-apply";
        customApply.textContent = this.i18n.quickIconApplyCustom || "使用自定义图标";
        const customRow = document.createElement("div");
        customRow.className = "sw-quick-icon-picker__custom-row";
        const customPreview = document.createElement("span");
        customPreview.className = "sw-quick-icon-picker__preview";
        customPreview.setAttribute("aria-label", this.i18n.quickIconPreview);
        const customHint = document.createElement("small");
        customHint.className = "sw-quick-icon-picker__hint";
        customHint.textContent = this.i18n.quickIconCustomHint;
        const refreshCustomPreview = () => {
            custom.setCustomValidity("");
            const candidate = normalizeCustomIcon(custom.value);
            customApply.disabled = !candidate;
            this.renderQuickActionIcon(customPreview, candidate || "iconPlugin", ["iconPlugin", "iconFile"]);
        };
        custom.addEventListener("input", refreshCustomPreview);
        customRow.append(customPreview, custom, customApply);
        const grid = document.createElement("div");
        grid.className = "sw-quick-icon-picker__grid";
        const icons = this.getAvailableQuickActionIcons(action.icon);

        // T-6811 图标目录：分类浏览 + 中文/拼音/英文 id 搜索。
        // 目录里没有的宿主图标归入"其他"，Emoji 归入"表情"。
        const catalogMap = new Map<string, {zh: string; en: string; category: string}>(
            ICON_CATALOG.map((entry) => [entry[0], {zh: entry[1], en: entry[2], category: entry[3]}]),
        );
        const categorize = (icon: string): {zh: string; en: string; category: string} => {
            const entry = catalogMap.get(icon);
            if (entry) return entry;
            if (/^icon[A-Za-z0-9_-]+$/.test(icon)) return {zh: icon, en: icon.toLowerCase(), category: "其他"};
            return {zh: "表情", en: "emoji", category: "表情"};
        };
        const items = icons.map((icon) => ({icon, meta: categorize(icon)}));
        const categoryOrder = [...ICON_CATEGORIES, "表情", "其他"];
        const presentCategories = categoryOrder.filter((category) =>
            items.some((item) => item.meta.category === category));
        let activeCategory = "全部";

        const cats = document.createElement("div");
        cats.className = "sw-quick-icon-picker__cats";
        cats.setAttribute("role", "tablist");
        const renderCats = () => {
            cats.textContent = "";
            for (const category of [this.i18n.quickIconCategoryAll || "全部", ...presentCategories]) {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "sw-quick-icon-picker__cat" + (category === activeCategory ? " is-active" : "");
                chip.textContent = category;
                chip.setAttribute("role", "tab");
                chip.setAttribute("aria-selected", String(category === activeCategory));
                chip.addEventListener("click", () => {
                    activeCategory = category;
                    renderCats();
                    renderIcons();
                });
                cats.appendChild(chip);
            }
        };
        renderCats();

        const renderIcons = () => {
            const keyword = search.value.trim().toLocaleLowerCase();
            grid.innerHTML = "";
            const hit = (icon: string, meta: {zh: string; en: string; category: string}) => {
                if (!keyword) return true;
                if (icon.toLocaleLowerCase().includes(keyword)) return true;
                if (meta.zh.toLocaleLowerCase().includes(keyword)) return true;
                if (meta.en.toLowerCase().includes(keyword)) return true;
                // 中文拼音首字母/全拼（复用 T-6805 引擎）
                if (pinyinTitleHit(meta.zh, keyword)) return true;
                return false;
            };
            const visible = items.filter((item) =>
                (activeCategory === "全部" || item.meta.category === activeCategory)
                && hit(item.icon, item.meta));
            if (!visible.length) {
                const empty = document.createElement("div");
                empty.className = "sw-quick-icon-picker__hint";
                empty.textContent = this.i18n.quickIconSearchEmpty || this.i18n.noOpenHistory;
                grid.appendChild(empty);
                return;
            }
            let lastCategory = "";
            visible.forEach((item) => {
                if (item.meta.category !== lastCategory) {
                    lastCategory = item.meta.category;
                    const heading = document.createElement("div");
                    heading.className = "sw-quick-icon-picker__group-title";
                    heading.textContent = item.meta.category;
                    grid.appendChild(heading);
                }
                const option = document.createElement("button");
                option.type = "button";
                option.className = "sw-quick-icon-picker__item";
                option.classList.toggle("is-selected", item.icon === action.icon);
                option.title = item.meta.zh === item.icon ? item.icon : `${item.meta.zh} · ${item.icon}`;
                option.setAttribute("aria-label", option.title);
                this.renderQuickActionIcon(option, item.icon, ["iconPlugin", "iconFile"]);
                option.addEventListener("click", () => {
                    cleanup();
                    onPick(item.icon);
                });
                grid.appendChild(option);
            });
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") cleanup();
        };
        const cleanup = () => {
            document.removeEventListener("keydown", onKeyDown);
            overlay.remove();
        };
        closeButton.addEventListener("click", cleanup);
        customApply.addEventListener("click", () => {
            const candidate = normalizeCustomIcon(custom.value);
            if (!candidate) {
                custom.setCustomValidity(this.i18n.quickIconInvalid || "请输入短文字、Emoji 或安全的 HTTPS/data URL 图标");
                custom.reportValidity?.();
                return;
            }
            cleanup();
            onPick(candidate);
        });
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) cleanup();
        });
        search.addEventListener("input", renderIcons);
        document.addEventListener("keydown", onKeyDown);
        sheet.append(header, search, cats, customRow, customHint, grid);
        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
        renderIcons();
        refreshCustomPreview();
        if (!this.isMobile) search.focus({preventScroll: true});
    }

    // 设置页“快捷动作”分节的 UI 构建（含导入/导出传输控件）已外迁至 settings-sections.ts（R4 重构 D-376）。
    private getDocumentSets(): any[] {
        return normalizeDocumentSets(this.data[DOCUMENT_SETS_KEY]).sets;
    }

    private currentDocumentSetEntries() {
        const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const seen = new Set<string>();
        return tabs.map((tab, index) => {
            const rootId = this.rootIdOf(tab);
            if (!rootId || !BLOCK_ID_RE.test(rootId) || seen.has(rootId)) return null;
            seen.add(rootId);
            return {rootId, title: this.titleOf(tab) || rootId, index};
        }).filter((item): item is {rootId: string; title: string; index: number} => Boolean(item));
    }

    private saveDocumentSet(candidate: unknown) {
        const result = upsertDocumentSet(this.data[DOCUMENT_SETS_KEY], candidate, {now: Date.now()});
        if (!result.item) return false;
        this.data[DOCUMENT_SETS_KEY] = result.state;
        this.saveDataDebounced(DOCUMENT_SETS_KEY);
        return true;
    }

    private async probeDocumentSetEntries(entries: Array<{rootId: string; title: string}>, signal?: AbortSignal) {
        const queue = entries.slice(0, 40);
        const results: Array<"available" | "missing" | "unknown" | null> = new Array(queue.length).fill(null);
        let cursor = 0;
        const worker = async () => {
            while (cursor < queue.length) {
                const index = cursor++;
                const entry = queue[index];
                if (signal?.aborted) break;
                let timeoutHandle: number | null = null;
                try {
                    const request = fetch("/api/filetree/getDoc", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({id: entry.rootId, mode: 0, size: 1}),
                        ...(signal ? {signal} : {}),
                    });
                    const timeout = new Promise<null>((resolve) => {
                        timeoutHandle = window.setTimeout(() => resolve(null), DOCUMENT_SET_PROBE_TIMEOUT_MS);
                    });
                    const response = await Promise.race([request, timeout]);
                    if (!response) {
                        results[index] = "unknown";
                        continue;
                    }
                    results[index] = response.ok ? "available" : response.status === 404 ? "missing" : "unknown";
                } catch (error) {
                    logger.warn("probe document set entry fail", error);
                    results[index] = "unknown";
                } finally {
                    if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
                }
            }
        };
        const workers = Math.min(DOCUMENT_SET_PROBE_CONCURRENCY, queue.length);
        await Promise.all(Array.from({length: workers}, () => worker()));
        return {
            available: queue.filter((_entry, index) => results[index] === "available"),
            missing: queue.filter((_entry, index) => results[index] === "missing"),
            unknown: queue.filter((_entry, index) => results[index] === "unknown"),
        };
    }

    // 「最近编辑」排序的 SQL 结果短缓存：排序方式来回切换 / 列表重渲染时不重复打内核
    private updatedMapCache: {key: string, ts: number, map: {[rootId: string]: string}} | null = null;

    // 查询当前打开文档的更新时间（用于「最近编辑」排序），返回 rootID → updated 映射
    private async loadUpdatedMap(tabs: Tab[]): Promise<{[rootId: string]: string}> {
        // 鐧藉悕鍗曞噣鍖栵細浠呬繚鐣欐爣鍑嗘枃妗?ID锛堟椂闂存埑-7浣嶏級骞跺幓閲嶏紝闈炲父瑙勫€间笉杩?SQL锛堥槻娉ㄥ叆/闃茬粨鏋勭牬鍧忥級
        const ids = sanitizeDocIds(tabs.map((tab) => this.rootIdOf(tab)));
        if (ids.length === 0) {
            return {};
        }
        // 打开的文档集合没变且缓存未过期时直接复用（返回副本防外部误改）
        const key = [...ids].sort().join(",");
        if (this.updatedMapCache && this.updatedMapCache.key === key
            && Date.now() - this.updatedMapCache.ts < UPDATED_CACHE_MS) {
            return {...this.updatedMapCache.map};
        }
        try {
            // T-6478：改走统一分发（同源白名单 + 5s 超时 + 失败归一），并显式给出外层 LIMIT。
            // 缺外层 LIMIT 时内核按 search.limit（默认 64、下限 32）截断，打开页签多于该数
            // 会静默缺更新时间、令「最近编辑」排序错乱；ids 已由 sanitizeDocIds 去重净化。
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT root_id, updated, created FROM blocks WHERE type='d' AND root_id IN ('${ids.join("','")}') LIMIT ${ids.length}`,
            });
            if (!json) {
                // 失败不写缓存：下一次重渲染再取，避免把空映射固化 UPDATED_CACHE_MS。
                return {};
            }
            const map: {[rootId: string]: string} = {};
            normalizeSqlResult(json).rows.forEach((row: any) => {
                map[row.root_id] = row.updated;
                // created 顺带回填缓存（YYYYMMDDHHmmss），供按创建月份分组使用
                if (typeof row.created === "string" && row.created) {
                    this.createdByIdCache[row.root_id] = row.created;
                }
            });
            this.updatedMapCache = {key, ts: Date.now(), map};
            return map;
        } catch (e) {
            logger.warn("query updated fail", e);
            return {};
        }
    }

    // 获取当前活动页签（可能为 undefined）
    private getActiveTab(): Tab | undefined {
        try {
            return getActiveTab() || undefined;
        } catch (e) {
            logger.warn("get active tab fail", e);
        }
        return undefined;
    }

    /**
     * Register only bounded, read-only Agent capabilities. The method is
     * deliberately runtime-gated so the plugin remains compatible with older
     * SiYuan releases whose Plugin base class predates addAgentCapability.
     */
    private registerAgentCapabilities() {
        const pluginWithAgent = this as unknown as {
            addAgentCapability?: (options: Record<string, unknown>) => string;
        };
        const readOnlyDefinitions: Array<{spec: Record<string, unknown>; handler: (args: Record<string, unknown>) => unknown}> = [
            {
                spec: AGENT_CAPABILITY_SPECS.outline,
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const id = normalizeAgentDocumentId(args?.id);
                        if (!id) return {error: "invalid document id"};
                        const limit = Math.min(48, Math.max(1, Math.trunc(Number(args?.limit) || 40)));
                        const json = await this.fetchKernelJson("/api/outline/getDocOutline", {id, preview: false});
                        if (!json || json.code !== 0) return {error: "outline unavailable"};
                        const headings = flattenOutline(Array.isArray(json.data) ? json.data : [], limit);
                        const content = {id, headings};
                        return {structuredContent: content, result: JSON.stringify(content)};
                    } catch (error) {
                        logger.warn("Agent document outline unavailable", error);
                        return {error: "outline unavailable"};
                    }
                },
            },
            {
                // v0.17 阶段 2：文档上下文只读接入。仅返回元数据与有界大纲，绝不回传正文。
                spec: DOCUMENT_CONTEXT_SPEC as unknown as Record<string, unknown>,
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const request = normalizeDocumentContextRequest(args || {});
                        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
                        const active = this.isMobile
                            ? opened.find((tab) => tab.id === this.getMobileActiveTabId())
                            : this.getActiveTab();
                        const activeRoot = active ? this.rootIdOf(active) || active.id : "";
                        const id = request.id || activeRoot;
                        if (!id || !BLOCK_ID_RE.test(id)) return {error: "document context unavailable"};
                        const tab = opened.find((candidate) => (this.rootIdOf(candidate) || candidate.id) === id);
                        const isActiveDocument = Boolean(activeRoot && activeRoot === id);
                        const contextSource = isActiveDocument ? "active" : (tab ? "opened" : "kernel");
                        const notebookMap = new Map((this.notebookListCache || []).map((notebook) => [notebook.id, notebook.name]));
                        const tabNotebookId = tab ? resolveSearchNotebookId(tab as unknown) : "";
                        const cachedNotebookName = tab ? notebookMap.get(tabNotebookId) || "" : "";
                        const tabNotebookName = tab
                            ? cachedNotebookName
                                || (tab as unknown as {notebookName?: string; notebook?: string; boxName?: string}).notebookName
                                || (tab as unknown as {notebook?: string}).notebook
                                || (tab as unknown as {boxName?: string}).boxName || ""
                            : "";
                        const tabNotebookNameSource = cachedNotebookName ? "cache" : (tabNotebookName ? "tab" : "none");
                        let record: Record<string, unknown> = tab ? {
                            id,
                            title: this.titleOf(tab),
                            notebookId: tabNotebookId,
                            notebookName: tabNotebookName,
                            notebookNameSource: tabNotebookNameSource,
                            path: (tab as unknown as {path?: string; hPath?: string}).path
                                || (tab as unknown as {hPath?: string}).hPath || "",
                            pathSource: "tab",
                        } : {id};
                        if (!tab) {
                            let json: any;
                            try {
                                json = await this.fetchKernelJson("/api/query/sql", {
                                    stmt: `SELECT id, content, box FROM blocks WHERE id='${id}' LIMIT 1`,
                                });
                            } catch (error) {
                                logger.warn("Agent document context metadata unavailable", error);
                                return {error: "document context unavailable"};
                            }
                            const row = (json?.data || [])[0] as {id?: string; content?: string; box?: string} | undefined;
                            if (!row || !BLOCK_ID_RE.test(String(row.id || ""))) return {error: "document context unavailable"};
                            const kernelNotebookName = notebookMap.get(String(row.box || "")) || "";
                            record = {id: row.id, title: row.content, notebookId: row.box, notebookName: kernelNotebookName, notebookNameSource: kernelNotebookName ? "cache" : "none", path: "", pathSource: "none"};
                        }
                        let outlineAvailable = request.includeOutline;
                        let outlineJson: any = null;
                        if (request.includeOutline) {
                            try {
                                outlineJson = await this.fetchKernelJson("/api/outline/getDocOutline", {id, preview: false});
                                outlineAvailable = Boolean(outlineJson && outlineJson.code === 0 && Array.isArray(outlineJson.data));
                            } catch (error) {
                                outlineAvailable = false;
                                logger.warn("Agent document context outline unavailable", error);
                            }
                        }
                        const content = buildDocumentContext({
                            ...record,
                            active: isActiveDocument,
                            source: contextSource,
                            outlineAvailable,
                            outlineStatus: !request.includeOutline ? "not-requested" : (outlineAvailable
                                ? ((Array.isArray(outlineJson?.data) && outlineJson.data.length > 0) ? "available" : "empty")
                                : "unavailable"),
                            headings: outlineAvailable ? outlineJson.data : [],
                        }, request);
                        return {structuredContent: content, result: JSON.stringify(content)};
                    } catch (error) {
                        logger.warn("Agent document context unavailable", error);
                        return {error: "document context unavailable"};
                    }
                },
            },
            {
                spec: AGENT_CAPABILITY_SPECS.navigation,
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const limit = normalizeAgentLimit(args?.limit, 12);
                        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
                        const active = this.isMobile
                            ? opened.find((tab) => tab.id === this.getMobileActiveTabId())
                            : this.getActiveTab();
                        const activeTabId = active?.id || "";
                        const activeId = active ? (this.rootIdOf(active) || activeTabId) : null;
                        const tabs = opened.map((tab) => ({
                            id: tab.id,
                            rootId: this.rootIdOf(tab) || undefined,
                            title: this.titleOf(tab),
                            path: (tab as unknown as {path?: string; hPath?: string}).path
                                || (tab as unknown as {hPath?: string}).hPath || undefined,
                            notebookId: resolveSearchNotebookId(tab as unknown) || undefined,
                            active: activeTabId ? tab.id === activeTabId : (this.rootIdOf(tab) || tab.id) === activeId,
                        }));
                        const recent = this.getOpenHistory().map((entry) => ({
                            id: entry.key,
                            rootId: entry.rootId || undefined,
                            title: entry.title,
                            ts: entry.ts,
                            source: "recent",
                        }));
                        const closed = this.getClosedHistory().map((entry) => ({
                            id: entry.rootId,
                            rootId: entry.rootId,
                            title: entry.title,
                            ts: entry.closedAt,
                            source: "closed",
                        }));
                        const favorites = this.getFavorites().map((entry) => ({
                            id: entry.key,
                            rootId: resolveFavoriteRootId(entry) || undefined,
                            title: entry.title,
                            group: entry.group,
                            source: "favorite",
                        }));
                        const content = buildAgentNavigationResult({
                            activeId: activeId || "",
                            mobile: this.isMobile,
                            tabs,
                            recent,
                            closed,
                            favorites,
                            limit,
                        });
                        return {structuredContent: content, result: JSON.stringify(content)};
                    } catch (error) {
                        logger.warn("Agent navigation unavailable", error);
                        return {error: "navigation unavailable"};
                    }
                },
            },
            {
                spec: AGENT_CAPABILITY_SPECS.search,
                handler: async (args: Record<string, unknown>) => this.searchAgentDocuments(args),
            },
            {
                spec: AGENT_CAPABILITY_SPECS.homeWidgets,
                handler: async (args: Record<string, unknown>) => {
                    const currentDevice = this.isMobile ? "mobile" : "desktop";
                    const requestedDevice = ["desktop", "sidebar", "mobile"].includes(String(args?.device || ""))
                        ? String(args.device)
                        : currentDevice;
                    const device = requestedDevice as "desktop" | "sidebar" | "mobile";
                    const requested = String(args?.moduleId || "");
                    const limit = normalizeAgentLimit(args?.limit, 12);
                    try {
                        const queryable = this.homeRuntime.listModules(device)
                            .filter((item: any) =>
                                this.homeBuiltinAdapterIds.has(item.moduleId) || this.homeModuleOpens.has(item.moduleId));
                        // 发现模式：省略 moduleId 时返回全部可查询组件清单
                        if (!requested) {
                            const homeState = this.getHomeState();
                            const configuredModuleIds = ((homeState.layouts[device] || []) as Array<any>).map((entry) => {
                                const instance = (homeState.instances as Array<any>).find((item) => item.instanceId === entry.instanceId);
                                return instance?.moduleId || "";
                            }).filter(Boolean);
                            const configuredState: Record<string, {enabled?: boolean; size?: string}> = {};
                            ((homeState.layouts[device] || []) as Array<any>).forEach((entry) => {
                                const instance = (homeState.instances as Array<any>).find((item) => item.instanceId === entry.instanceId);
                                if (instance?.moduleId) configuredState[instance.moduleId] = {enabled: instance.enabled !== false, size: entry.size};
                            });
                            const content = buildAgentWidgetCatalog(queryable, {
                                device,
                                readOnly: typeof args?.readOnly === "boolean" ? args.readOnly : undefined,
                                source: args?.source,
                                limit: args?.limit,
                                offset: args?.offset,
                                includeState: true,
                                configuredModuleIds,
                                configuredState,
                            });
                            return {structuredContent: content, result: JSON.stringify(content)};
                        }
                        const def = queryable.find((item: any) => item.moduleId === requested) as {title?: string; configSchema?: unknown[]} | undefined;
                        if (!def) {
                            const content = buildAgentWidgetSnapshot(requested, "", {ok: false, reason: "unregistered"}, {device, limit, offset: args?.offset});
                            return {structuredContent: content, result: JSON.stringify(content)};
                        }
                        const config = normalizeAgentWidgetConfig(args?.config, def.configSchema) as Record<string, unknown>;
                        const result = await this.homeRuntime.read(requested, device, config, {cacheTtlMs: 1500, force: args?.refresh === true});
                        const content = buildAgentWidgetSnapshot(requested, def.title, result, {device, limit, offset: args?.offset, config});
                        return {structuredContent: content, result: JSON.stringify(content)};
                    } catch (error) {
                        logger.warn("Agent home widget snapshot unavailable", error);
                        if (requested) {
                            const content = buildAgentWidgetSnapshot(requested, "", {ok: false, reason: "failed"}, {device, limit, offset: args?.offset});
                            return {structuredContent: content, result: JSON.stringify(content)};
                        }
                        return {error: "widget snapshot unavailable"};
                    }
                },
            },
            {
                // 工作区上下文（第三层）：活动文档/页签/文档集/快捷入口/今日日记一次只读汇总
                spec: AGENT_CAPABILITY_SPECS.workspaceContext,
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const limit = normalizeAgentLimit(args?.limit, 12);
                        const device = this.isMobile ? "mobile" : "desktop";
                        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
                        const active = this.isMobile
                            ? opened.find((tab) => tab.id === this.getMobileActiveTabId())
                            : this.getActiveTab();
                        const settings = this.getSettings();
                        const storedActions = sanitizeQuickActions(settings.quickActions);
                        const actionItems = (storedActions.items.length > 0 ? storedActions.items : getDefaultQuickActions())
                            .filter((action) => shouldRenderQuickAction(action, device))
                            .map((action) => ({label: action.label, kind: action.kind}));
                        // 今日日记只读探测：按日期前缀查当日文档（绝不调用 createDailyNote——那会创建）
                        const journalNotebookId = normalizeAgentNotebookId(settings.journalNotebook);
                        let todayJournal: {configured: boolean; docId: string; status: string} = {
                            configured: false,
                            docId: "",
                            status: "unconfigured",
                        };
                        if (journalNotebookId) {
                            todayJournal.configured = true;
                            if (this.syncing) {
                                todayJournal.status = "syncing";
                            } else {
                                const now = new Date();
                                const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                                const journalJson = await this.fetchKernelJson("/api/query/sql", {
                                    stmt: `SELECT id FROM blocks WHERE type='d' AND box='${journalNotebookId}' AND content LIKE '${prefix}%' ORDER BY created DESC LIMIT 1`,
                                });
                                if (!journalJson) {
                                    todayJournal.status = "unavailable";
                                } else {
                                    const found = ((journalJson.data || [])[0] as {id?: string} | undefined)?.id || "";
                                    if (BLOCK_ID_RE.test(found)) {
                                        todayJournal.docId = found;
                                        todayJournal.status = "found";
                                    } else {
                                        todayJournal.status = "missing";
                                    }
                                }
                            }
                        }
                        todayJournal.status = normalizeAgentJournalStatus(todayJournal.status, todayJournal.configured, todayJournal.docId);
                        const content = buildAgentWorkspaceContext({
                            limit,
                            generatedAt: Date.now(),
                            syncing: this.syncing,
                            device,
                            // 存储演练健康（v0.20，D-386）：onload 只读快照透传给纯模型归一
                            storageHealth: this.storageMigrationReport,
                            activeDocument: {id: active ? (this.rootIdOf(active) || "") : "", title: active ? this.titleOf(active) : ""},
                            openTabs: opened.map((tab) => ({
                                id: this.rootIdOf(tab) || tab.id,
                                title: this.titleOf(tab),
                                source: "tabs",
                            })),
                            closedTabs: this.getClosedHistory().map((entry) => ({
                                id: entry.rootId,
                                rootId: entry.rootId,
                                title: entry.title,
                                ts: entry.closedAt,
                                source: "closed",
                            })),
                            documentSets: this.getDocumentSets().map((set: any) => ({
                                name: String(set?.name || ""),
                                count: Array.isArray(set?.entries) ? set.entries.length : 0,
                            })),
                            quickActions: actionItems,
                            todayJournal,
                        });
                        return {structuredContent: content, result: JSON.stringify(content)};
                    } catch (error) {
                        logger.warn("Agent workspace context unavailable", error);
                        return {error: "workspace context unavailable"};
                    }
                },
            },
            {
                spec: AGENT_CAPABILITY_SPECS.homeDiagnostics,
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const limit = normalizeAgentLimit(args?.limit, 16);
                        const diagnostics = typeof this.homeRuntime.diagnostics === "function"
                            ? this.homeRuntime.diagnostics()
                            : [];
                        const windowMinutes = Number.parseInt(String(args?.windowMinutes ?? ""), 10);
                        const content = buildAgentHomeDiagnostics(diagnostics, limit, windowMinutes);
                        return {structuredContent: content, result: JSON.stringify(content)};
                    } catch (error) {
                        logger.warn("Agent home diagnostics unavailable", error);
                        return {error: "home diagnostics unavailable"};
                    }
                },
            },
        ];
        // v0.17 阶段 1（D-220）：workspace 运行时基础设施只读诊断。
        // registry/queue/coordinator 生命周期与插件一致，卸载时统一销毁。
        this.workspaceRuntimeDiagnostics = createWorkspaceRuntimeDiagnostics();
        if (this.workspaceRuntimeDiagnostics.validation.ok) {
            readOnlyDefinitions.push({
                spec: this.workspaceRuntimeDiagnostics.spec as unknown as Record<string, unknown>,
                handler: (args: Record<string, unknown>) => {
                    const runtime = this.workspaceRuntimeDiagnostics;
                    if (!runtime) return {error: "workspace diagnostics unavailable"};
                    return runtime.handler(args || {});
                },
            });
        } else {
            logger.warn("workspace runtime diagnostics definition invalid", this.workspaceRuntimeDiagnostics.validation);
            this.workspaceRuntimeDiagnostics.dispose();
            this.workspaceRuntimeDiagnostics = null;
        }
        const readonlyAudit = summarizeAgentCapabilityAudit(auditAgentCapabilityDefinitions(readOnlyDefinitions));
        if (!readonlyAudit.valid) logger.warn("Agent read-only capability audit rejected definitions", readonlyAudit);
        this.agentReadOnlyAuditHistory.record(buildAgentReadOnlyAuditSnapshot({
            audit: readonlyAudit,
            device: this.isMobile ? "mobile" : "desktop",
            status: readonlyAudit.valid ? "ready" : "failed",
            reason: readonlyAudit.valid ? "unavailable" : "failed",
            disposed: false,
        }));
        registerReadOnlyAgentCapabilities(pluginWithAgent, readOnlyDefinitions, (error, spec) => logger.warn(`register Agent capability ${spec?.name || "unknown"} fail`, error));
    }

    private async searchAgentDocuments(args: Record<string, unknown> = {}) {
        const query = normalizeAgentQuery(args.query);
        if (!query) {
            return {error: "query is required"};
        }
        const filters: IDocSearchFilters = {};
        const hasNotebookArgument = args.notebook !== undefined && args.notebook !== null
            && String(args.notebook).trim() !== "";
        const notebook = normalizeAgentNotebook(args.notebook);
        if (hasNotebookArgument && !notebook) {
            return {error: "invalid notebook id"};
        }
        if (notebook) filters.notebook = notebook;
        if (args.paths !== undefined) {
            if (!Array.isArray(args.paths) || args.paths.length > 8) return {error: "invalid search path"};
            const rawPaths = args.paths.map((value) => String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")).filter(Boolean);
            const paths = normalizeAgentSearchPaths(args.paths);
            if (paths.length !== rawPaths.length || new Set(rawPaths).size !== rawPaths.length) {
                return {error: "invalid search path"};
            }
            if (paths.length > 0) filters.paths = paths;
        }
        const method = normalizeAgentSearchMethod(args.method);
        const orderBy = normalizeAgentSearchOrder(args.orderBy);
        const type = normalizeAgentSearchType(args.type);
        const subType = normalizeAgentSearchSubType(args.subType);
        if ((args.method !== undefined && !method)
            || (args.orderBy !== undefined && !orderBy)
            || (args.type !== undefined && !type)
            || (args.subType !== undefined && !subType)) {
            return {error: "invalid search filter"};
        }
        if (method !== "keyword") filters.method = method as IDocSearchFilters["method"];
        if (orderBy !== "relevanceDesc") filters.orderBy = orderBy as IDocSearchFilters["orderBy"];
        if (type) filters.types = {[type]: true};
        if (subType) filters.subTypes = {[subType]: true};
        const limit = normalizeAgentLimit(args.limit, DOC_RESULT_LIMIT);
        const offset = normalizeAgentSearchOffset(args.offset);
        // AbortController is optional in older embedded WebViews. The Agent
        // request remains bounded by its local result limit and guards even
        // when native cancellation is unavailable.
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        if (controller) this.activeAgentSearchControllers.add(controller);
        const signal = controller?.signal;
        let deadlineExpired = false;
        let timer: number | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = window.setTimeout(() => {
                deadlineExpired = true;
                controller?.abort();
                reject(new Error("timeout"));
            }, NOTEBOOK_FETCH_TIMEOUT_MS);
        });
        try {
            const localTabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
            const queryLower = query.toLocaleLowerCase();
            const localItems = canUseTitleSearch(filters) ? localTabs.map((tab) => {
                const rootId = this.rootIdOf(tab) || "";
                const title = this.titleOf(tab);
                const path = String((tab as unknown as {path?: string; hPath?: string}).path
                    || (tab as unknown as {hPath?: string}).hPath || "");
                const notebookId = resolveSearchNotebookId(tab as unknown);
                if (notebook && notebookId !== notebook) return null;
                if (filters.paths && filterDocSearchResults.call(this, [{path, hPath: path, notebookId}], filters).length === 0) return null;
                if (!`${title} ${path}`.toLocaleLowerCase().includes(queryLower)) return null;
                return {
                    id: rootId || tab.id,
                    rootId: rootId || undefined,
                    title,
                    path: path || undefined,
                    notebookId: notebookId || undefined,
                    source: "tabs",
                };
            }).filter(Boolean) as Array<Record<string, unknown>> : [];

            // A local tab match already satisfies the requested bound. Avoid
            // waking the file tree or full-text endpoint in that case.
            if (offset === 0 && localItems.length >= limit) {
                const content = buildAgentSearchResult(query, localItems, {source: "tabs", limit, offset});
                return {structuredContent: content, result: JSON.stringify(content)};
            }

            let docs: IDocSearchResult[] = [];
            let titleSearchAvailable = true;
            try {
                if (!canUseTitleSearch(filters)) {
                    throw new Error("advanced filters require native search");
                }
                const response = await Promise.race([fetch("/api/filetree/searchDocs", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({k: query}),
                    ...(signal ? {signal} : {}),
                }), timeoutPromise]);
                if (!response.ok) throw new Error(`searchDocs HTTP ${response.status}`);
                const json = await Promise.race([response.json(), timeoutPromise]);
                const rawDocs = extractSearchRecords(json)
                    .slice(0, MAX_SEARCH_ITEMS * 2)
                    .filter((doc: unknown): doc is IDocSearchResult => Boolean(doc) && typeof doc === "object");
                // Native v3.8.x searchDocs records commonly contain only
                // {path, hPath, box, boxIcon}. Normalize the root/title
                // before applying Agent bounds, otherwise valid title hits
                // would be discarded as unidentifiable objects.
                docs = normalizeTitleSearchDocuments(rawDocs) as IDocSearchResult[];
                docs = filterDocSearchResults.call(this, docs, filters);
            } catch (error) {
                const reason = normalizeAgentFailureReason(error, deadlineExpired);
                if (reason === "cancelled" || reason === "timeout") throw error;
                titleSearchAvailable = false;
                logger.warn("Agent title search unavailable", error);
            }

            let source = localItems.length > 0 ? "tabs" : "title";
            if (docs.length === 0) {
                const fallback = await Promise.race([
                    runFullTextSearchFallback.call(this, query, signal, filters, Math.min(DOC_SEARCH_FETCH_LIMIT, offset + limit + 1)),
                    timeoutPromise,
                ]);
                if (fallback !== null) {
                    docs = fallback;
                    source = localItems.length > 0 ? "tabs+global" : "global";
                } else if (localItems.length === 0) {
                    if (!titleSearchAvailable) return {error: "search unavailable"};
                    const content = buildAgentSearchResult(query, [], {source: "title", limit, offset});
                    return {structuredContent: content, result: JSON.stringify(content)};
                }
            } else if (localItems.length > 0) {
                source = "tabs+title";
            }
            const items = localItems.concat(docs.map((doc) => ({
                id: doc.id || doc.rootId,
                rootId: doc.rootId || doc.id,
                title: doc.title || doc.name,
                path: doc.path || doc.hPath,
                notebookId: doc.notebookId || doc.notebookID || doc.box,
                source: doc.source || (source.includes("title") ? "title" : source.includes("global") ? "global" : source),
                blockIds: doc.blockIds,
                snippets: doc.snippets?.map((snippet) => snippet?.text || "").filter(Boolean),
            })));
            const content = buildAgentSearchResult(query, items, {
                source,
                limit,
                offset,
                truncated: docs.length > limit,
            });
            return {structuredContent: content, result: JSON.stringify(content)};
        } catch (error) {
            const reason = normalizeAgentFailureReason(error, deadlineExpired);
            if (reason === "timeout") return {error: "search timed out"};
            if (reason === "cancelled") return {error: "search cancelled"};
            logger.warn("Agent search fail", error);
            return {error: "search unavailable"};
        } finally {
            if (timer !== null) window.clearTimeout(timer);
            if (controller) this.activeAgentSearchControllers.delete(controller);
        }
    }

    // 按关键字过滤卡片，整组无匹配时隐藏分组；返回可见卡片数
    private filterCards(
        scrollElement: HTMLElement,
        keyword: string,
        contentRoots: Set<string> = new Set(),
        filters: IDocSearchFilters = this.docSearchState.filters.get(scrollElement) || {},
        parsedQuery?: {phrases: string[]; excludes: string[]; terms: string[]},
    ): number {
        const kw = keyword.trim().toLowerCase();
        const parsed = parsedQuery || parseSearchQuery(keyword);
        const parsedPositive = parsed.phrases.length + parsed.terms.length;
        const pinyinOn = this.getSettings().pinyinMatch !== false;
        const allowLocalTitleMatch = (!filters.method || filters.method === "keyword")
            && (!filters.types || filters.types.document === true)
            && !filters.subTypes;
        const normalizedScope = normalizeSearchDocumentFilters(filters);
        let visible = 0;
        scrollElement.querySelectorAll<HTMLElement>(".sw__card").forEach((card) => {
            const title = (card.dataset.title || "").toLowerCase();
            const rootId = card.dataset.rootId || "";
            const matchesNotebook = !normalizedScope.notebook || card.dataset.notebookId === normalizedScope.notebook;
            const matchesPath = matchesSearchDocumentFilters({
                path: card.dataset.searchPath || "",
                hPath: card.dataset.searchPath || "",
                notebookId: card.dataset.notebookId || "",
            }, normalizedScope);
            // T-6802：有解析结果时用运算符语义（短语+词 AND、排除项剔除），
            // 否则维持旧的"原始子串包含"。
            const titleMatch = parsedPositive > 0 || parsed.excludes.length > 0
                ? matchesParsedQuery(title, parsed)
                    || (pinyinOn && (parsed.terms.concat(parsed.phrases)).some((needle) => pinyinTitleHit(title, needle)))
                : (!kw || title.includes(kw));
            const match = matchesNotebook && matchesPath
                && (!kw || (allowLocalTitleMatch && titleMatch) || contentRoots.has(rootId));
            card.classList.toggle("fn__none", !match);
            if (match) {
                visible++;
            }
        });
        // 只处理页签卡片分组；全库文档结果区（.sw__doc-results）内部无卡片，
        // 误判为空组会导致继续输入时文档区被 fn__none 永久隐藏
        scrollElement.querySelectorAll<HTMLElement>(".sw__group:not(.sw__doc-results)").forEach((group) => {
            const count = group.querySelectorAll(".sw__card:not(.fn__none)").length;
            group.classList.toggle("fn__none", count === 0);
        });
        return visible;
    }

    // 渲染左侧侧边栏面板列表（文档树/大纲/书签/反链/关系图等，含其他插件注册的面板）
    // mode：hidden 完全隐藏（保持 fn__none，内容区占满全宽）/ collapsed 折叠图标条 / full 完整列表
    private renderDockList(dockElement: HTMLElement | null, dialog: Dialog, excludedDocks: string[], mode: DockDisplay) {
        if (!dockElement || mode === "hidden") {
            return;
        }
        const excluded = new Set(excludedDocks);
        const panels = this.getDockPanels().filter((panel) => !excluded.has(panel.type));
        if (panels.length === 0) {
            return;
        }
        dockElement.classList.remove("fn__none");
        dockElement.innerHTML = "";

        // 折叠 ⇄ 完整 切换按钮：弹窗内即时切换（不写回设置，设置只决定初始形态）
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "sw__dock-toggle b3-tooltips b3-tooltips__e";
        const setToggleState = (collapsed: boolean) => {
            toggle.setAttribute("aria-label", collapsed ? this.i18n.expandDock : this.i18n.collapseDock);
            toggle.innerHTML = `<svg><use xlink:href="#${collapsed ? "iconRight" : "iconLeft"}"></use></svg>`;
            dockElement.classList.toggle("sw__dock--collapsed", collapsed);
        };
        toggle.addEventListener("click", () => {
            setToggleState(!dockElement.classList.contains("sw__dock--collapsed"));
        });
        setToggleState(mode === "collapsed");
        dockElement.appendChild(toggle);

        const label = document.createElement("div");
        label.className = "sw__dock-label";
        label.textContent = this.i18n.panels;
        dockElement.appendChild(label);

        panels.forEach((panel) => {
            dockElement.appendChild(this.createDockItem(panel, dialog));
        });
    }

    // 构建一个面板列表项（图标 + 名称），点击即激活该面板
    private createDockItem(panel: IDockPanel, dialog: Dialog): HTMLElement {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sw__dock-item";
        item.dataset.dockType = panel.type;

        // 面板当前已展开时高亮标识
        try {
            if (document.querySelector(`.dock__item[data-type="${panel.type}"].dock__item--active`)) {
                item.classList.add("sw__active");
            }
        } catch (e) {
            // 蹇界暐楂樹寒妫€娴嬪け璐?
        }

        const icon = document.createElement("span");
        icon.className = "sw__dock-icon";
        icon.innerHTML = `<svg><use xlink:href="#${panel.icon}"></use></svg>`;
        const title = document.createElement("span");
        title.className = "sw__dock-title";
        title.textContent = panel.title;
        item.appendChild(icon);
        item.appendChild(title);
        // 折叠模式下 hover 浮出的面板名称（完整模式由 CSS 隐藏）
        const flyout = document.createElement("span");
        flyout.className = "sw__dock-flyout";
        flyout.textContent = panel.title;
        item.appendChild(flyout);

        item.addEventListener("click", () => this.activateDock(panel.type, dialog));
        return item;
    }

    // 激活侧边栏面板并关闭切换器
    private activateDock(type: string, dialog: Dialog) {
        try {
            const dock = this.getDockByType(type);
            if (dock) {
                // 与思源 Ctrl+Tab 切换面板一致：show=true 表示聚焦/展开该面板
                dock.toggleModel(type, true);
            }
        } catch (e) {
            logger.warn("switch dock fail", e);
        }
        dialog.destroy();
    }

    // 读取布局配置中的全部面板（左/右/下三侧 dock），只保留当前真实存在的面板
    private getDockPanels(): IDockPanel[] {
        const panels: IDockPanel[] = [];
        const seen = new Set<string>();
        try {
            const uiLayout = getSiyuan()?.config?.uiLayout;
            if (!uiLayout) {
                return panels;
            }
            (["left", "right", "bottom"] as const).forEach((position) => {
                const groups = uiLayout[position]?.data;
                if (!Array.isArray(groups)) {
                    return;
                }
                groups.forEach((group: any[]) => {
                    (group || []).forEach((item: any) => {
                        if (item?.type && !seen.has(item.type) && this.getDockByType(item.type)) {
                            seen.add(item.type);
                            panels.push({
                                type: item.type,
                                title: normalizeQuickActionText(item.title || item.type, 80) || item.type,
                                icon: item.icon || "iconDock",
                            });
                        }
                    });
                });
            });
        } catch (e) {
            logger.warn("get dock panels fail", e);
        }
        return panels;
    }

    // 按 type 查找面板所属的 Dock（左侧/右侧/底部），与思源 getDockByType 行为一致
    private getDockByType(type: string): ISiyuanLayoutDock | undefined {
        const layout = getSiyuan()?.layout;
        if (!layout) {
            return undefined;
        }
        const sides: Array<ISiyuanLayoutDock | undefined> = [layout.leftDock, layout.rightDock, layout.bottomDock];
        for (const dock of sides) {
            if (dock?.data?.[type]) {
                return dock;
            }
        }
        return undefined;
    }

    // 页签标题（优先取页签头已渲染文本）
    private titleOf(tab: Tab): string {
        return tab.headElement?.querySelector(".item__text")?.textContent?.trim() || tab.title || tab.id;
    }

    // 每次读取当前模型，避免同一页签导航到新文档后继续使用旧 rootID。
private rootIdOf(tab: Tab): string | null {
        return resolveTabRootId(tab as unknown as {model?: IProtyleTabModel, headElement?: HTMLElement});
    }

    // 置顶键：文档页签用其 rootID（跨会话稳定，重开同一文档置顶状态保留），其余退回页签 id
    private pinKeyOf(tab: Tab): string {
        return this.rootIdOf(tab) || tab.id;
    }

    // 读取置顶列表
    private getPinned(): string[] {
        const data = this.data[PINNED_KEY];
        const result = sanitizeStringList(data, PINNED_MAX);
        if (result.changed) {
            this.data[PINNED_KEY] = result.items;
            this.saveDataDebounced(PINNED_KEY);
        }
        return result.items;
    }

    // 切换置顶状态，返回切换后是否为置顶
    private togglePinned(tab: Tab): boolean {
        const key = this.pinKeyOf(tab);
        const list = this.getPinned();
        const index = list.indexOf(key);
        if (index >= 0) {
            list.splice(index, 1);
            this.data[PINNED_KEY] = list;
            this.saveDataDebounced(PINNED_KEY);
            return false;
        }
        list.unshift(key);
        if (list.length > PINNED_MAX) list.length = PINNED_MAX;
        this.data[PINNED_KEY] = list;
        this.saveDataDebounced(PINNED_KEY);
        return true;
    }

    // ==================== 鏀惰棌 ====================

    // 读取收藏列表（最近收藏在前）
    private getFavorites(): IFavoriteItem[] {
        const data = this.data[FAV_KEY];
        const result = sanitizeFavorites(data, FAVORITES_MAX);
        if (result.changed) {
            this.data[FAV_KEY] = result.items;
            this.saveDataDebounced(FAV_KEY);
        }
        return result.items;
    }

    private saveFavorites(list: IFavoriteItem[]) {
        this.data[FAV_KEY] = sanitizeFavorites(list, FAVORITES_MAX).items;
        this.saveDataDebounced(FAV_KEY);
    }

    // 切换收藏状态，返回切换后是否为已收藏
    private toggleFavorite(tab: Tab): boolean {
        const list = this.getFavorites();
        const rootId = this.rootIdOf(tab);
        if (!rootId) {
            // 未解析页签（懒加载未激活）：key 会退化为一次性 tab.id，收藏后必然无法跳转，
            // 星标还会在页签激活后错乱引发重复收藏。此处仅允许移除同键历史脏数据，拒绝新增
            const index = list.findIndex((item) => item.key === tab.id);
            if (index >= 0) {
                list.splice(index, 1);
                this.saveFavorites(list);
                return false;
            }
            showMessage(this.i18n.favNeedActivate);
            return false;
        }
        if (this.migrateFavoriteKey(list, tab, rootId)) {
            return true;
        }
        const index = list.findIndex((item) => item.key === rootId);
        if (index >= 0) {
            list.splice(index, 1);
            this.saveFavorites(list);
            return false;
        }
        list.unshift({key: rootId, title: this.titleOf(tab), rootId, group: ""});
        this.saveFavorites(list);
        return true;
    }

    // 迁移历史脏收藏条目：旧版本曾把未解析页签的 tab.id（UUID）当作收藏 key，
    // 此类条目 rootId 为空、跳转必然失效。页签激活解析出 rootId 后将其改写为稳定键；
    // 若同文档已存在正常条目则脏条目属于历史重复，直接移除。返回是否发生了迁移
    private migrateFavoriteKey(list: IFavoriteItem[], tab: Tab, rootId: string): boolean {
        const result = migrateFavoriteEntry(list, tab.id, rootId);
        if (!result.migrated) return false;
        list.splice(0, list.length, ...result.items);
        this.saveFavorites(list);
        return true;
    }

    private removeFavorite(key: string) {
        const result = removeFavoriteEntry(this.getFavorites(), key);
        if (result.changed) this.saveFavorites(result.items);
    }

    // ==================== 收藏分组折叠状态持久化 ====================
    // 分组折叠偏好此前是会话级的（重启即全部展开）；改为持久化，重启后保持用户上次的展开/折叠习惯

    // 从持久化数据初始化 favCollapsed 集合
    private initFavCollapsed() {
        const saved = this.data[FAV_COLLAPSED_KEY];
        if (!Array.isArray(saved)) {
            return;
        }
        saved.forEach((name) => {
            if (typeof name === "string" && name) {
                this.favCollapsed.add(name);
            }
        });
    }

    // 鎶樺彔/灞曞紑鐘舵€佸彉鍖栧悗鍘绘姈鍐欏叆鎸佷箙鍖?
    private saveFavCollapsed() {
        this.data[FAV_COLLAPSED_KEY] = Array.from(this.favCollapsed);
        this.saveDataDebounced(FAV_COLLAPSED_KEY);
    }

    // 桌面端顶部的最近打开记录。历史与 MRU 分离，保留关闭页签后仍可重开的文档。
    private setupOpenHistoryDropdown(container: HTMLElement | null, onClose: IOverlayClose): () => void {
        if (!container) return () => undefined;
        const previous = this.historyDropdownClosers.get(container);
        previous?.dispose();
        container.innerHTML = `<button type="button" class="sw__history-trigger" aria-label="${this.i18n.openHistory}">
    <svg width="13" height="13"><use xlink:href="#iconClock"></use></svg><span class="sw__history-trigger-text">${this.i18n.openHistory}</span><span class="sw__history-badge"></span>
</button><div class="sw__history-panel fn__none" role="menu"></div>`;
        const trigger = container.querySelector<HTMLElement>(".sw__history-trigger");
        const panel = container.querySelector<HTMLElement>(".sw__history-panel");
        if (!trigger || !panel) return () => undefined;
        let outsideHandler: ((event: PointerEvent) => void) | null = null;
        let resizeHandler: (() => void) | null = null;
        const close = () => {
            panel.classList.add("fn__none");
            if (outsideHandler) document.removeEventListener("pointerdown", outsideHandler, true);
            if (resizeHandler) window.removeEventListener("resize", resizeHandler);
            outsideHandler = null;
            resizeHandler = null;
        };
        let disposed = false;
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            close();
            if (this.historyDropdownClosers.get(container)?.dispose === dispose) this.historyDropdownClosers.delete(container);
            this.historyDropdownCloseSet.delete(dispose);
        };
        this.historyDropdownClosers.set(container, {close, dispose});
        this.historyDropdownCloseSet.add(dispose);
        trigger.addEventListener("click", async () => {
            if (!panel.classList.contains("fn__none")) { close(); return; }
            trigger.setAttribute("aria-busy", "true");
            await this.syncOfficialRecentHistory();
            trigger.removeAttribute("aria-busy");
        if (disposed || !panel.isConnected) return;
        // T-6799b "只看有改动"：开关状态与内核更新时间缓存在下拉生命周期内保持；
        // 过滤真值 = 内核 blocks.updated 落在窗口期（默认 7 天）内。
        let changedOnly = false;
        let changedUpdatedMap: Map<string, string> | null = null;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "b3-button b3-button--text sw__history-changed-toggle";
        toggle.textContent = this.i18n.historyChangedOnly;
        const renderPanel = () => {
            const windowStart = changedOnly && changedUpdatedMap ? formatChangedWindowStart(Date.now()) : "";
            const filter = changedOnly && changedUpdatedMap
                ? (entry: IOpenHistoryEntry) => entryChangedWithin(entry, changedUpdatedMap!, windowStart)
                : undefined;
            this.renderOpenHistoryPanel(panel, (entry) => {
                close();
                onClose();
                void this.openHistoryEntry(entry);
            }, filter);
            panel.prepend(toggle);
            toggle.setAttribute("aria-pressed", String(changedOnly));
        };
        toggle.addEventListener("click", async () => {
            changedOnly = !changedOnly;
            toggle.setAttribute("aria-pressed", String(changedOnly));
            if (changedOnly && !changedUpdatedMap) {
                toggle.setAttribute("aria-busy", "true");
                const ids = [
                    ...this.getOpenHistory().map((entry) => entry.rootId || ""),
                    ...this.getClosedHistory().map((entry) => entry.rootId || ""),
                ].filter((id) => BLOCK_ID_RE.test(id));
                changedUpdatedMap = await this.fetchDocUpdatedMap(ids);
                toggle.removeAttribute("aria-busy");
            }
            if (disposed || !panel.isConnected) return;
            renderPanel();
        });
        renderPanel();
            panel.classList.remove("fn__none");
            this.positionOpenHistoryPanel(trigger, panel);
            outsideHandler = (event) => { if (!container.contains(event.target as Node)) close(); };
            document.addEventListener("pointerdown", outsideHandler, true);
            resizeHandler = () => {
                if (!panel.classList.contains("fn__none")) this.positionOpenHistoryPanel(trigger, panel);
            };
            window.addEventListener("resize", resizeHandler);
        });
        this.refreshOpenHistoryDropdown(container);
        return dispose;
    }

    // T-6799b：批量取文档根块的 updated（内核 14 位时间戳），32 条/块的有界分批。
    private async fetchDocUpdatedMap(rootIds: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const valid = Array.from(new Set(rootIds.filter((id) => BLOCK_ID_RE.test(id))));
        for (let index = 0; index < valid.length; index += 32) {
            const chunk = valid.slice(index, index + 32);
            const list = chunk.map((id) => `'${id}'`).join(",");
            const json = await this.fetchKernelJson("/api/query/sql", {
                stmt: `SELECT id, updated FROM blocks WHERE id IN (${list})`,
            });
            (Array.isArray(json?.data) ? json.data : []).forEach((row: {id?: string; updated?: string}) => {
                if (row?.id && typeof row.updated === "string") result.set(row.id, row.updated);
            });
        }
        return result;
    }

    private async syncOfficialRecentHistory() {
        const json = await this.fetchKernelJson("/api/storage/getRecentDocs", {});
        const rows = Array.isArray(json?.data) ? json.data : [];
        if (rows.length === 0) return;
        const now = Date.now();
        const entries = rows.slice(0, HISTORY_MAX).map((row: any, index: number) => {
            const rootId = typeof row?.rootID === "string" && BLOCK_ID_RE.test(row.rootID) ? row.rootID : null;
            if (!rootId) return null;
            return {
                key: rootId,
                rootId,
                title: String(row.title || rootId).slice(0, 128),
                ts: Math.max(Number(row.viewedAt) || 0, Number(row.openAt) || 0, now - index),
                source: "open" as const,
            };
        }).filter(Boolean) as IOpenHistoryEntry[];
        if (entries.length > 0) {
            this.data[HISTORY_KEY] = entries;
            this.saveDataDebounced(HISTORY_KEY);
        }
    }

    private positionOpenHistoryPanel(trigger: HTMLElement, panel: HTMLElement) {
        const rect = trigger.getBoundingClientRect();
        const margin = 6;
        const width = Math.min(300, Math.max(220, window.innerWidth - margin * 2));
        const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
        const top = rect.bottom + margin;
        panel.style.width = `${Math.round(width)}px`;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(Math.min(top, window.innerHeight - 180))}px`;
        panel.style.maxHeight = `${Math.max(140, window.innerHeight - top - margin)}px`;
    }

    private renderOpenHistoryPanel(panel: HTMLElement, onPick: (entry: IOpenHistoryEntry) => void, entryFilter?: (entry: IOpenHistoryEntry) => boolean) {
        panel.innerHTML = "";
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const openedKeys = new Set(opened.map((tab) => this.pinKeyOf(tab)));
        const openedRoots = new Set(opened.map((tab) => this.rootIdOf(tab)).filter(Boolean));
        const sections = buildRecentHistorySections(this.getOpenHistory(), this.getClosedHistory(), openedRoots);
        if (sections.count === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__history-empty";
            empty.textContent = this.i18n.noOpenHistory;
            panel.appendChild(empty);
            return;
        }
        let shown = 0;

        const appendSection = (title: string, entries: IOpenHistoryEntry[], clearLabel: string, clearAction: () => void) => {
            const visible = typeof entryFilter === "function" ? entries.filter(entryFilter) : entries;
            if (visible.length === 0) return;
            shown += visible.length;
            const heading = document.createElement("div");
            heading.className = "sw__history-section-title";
            heading.textContent = title;
            panel.appendChild(heading);
            const clear = document.createElement("button");
            clear.type = "button";
            clear.className = "sw__history-clear";
            clear.textContent = clearLabel;
            clear.addEventListener("click", (event) => {
                event.stopPropagation();
                clearAction();
            });
            panel.appendChild(clear);
            visible.forEach((entry) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = `sw__history-item${entry.source === "closed" ? " sw__history-item--closed" : ""}`;
            item.setAttribute("role", "menuitem");
            item.innerHTML = `<svg><use xlink:href="#iconFile"></use></svg><span class="sw__history-copy"><span class="sw__history-title"></span><span class="sw__history-meta"></span></span>`;
            item.querySelector<HTMLElement>(".sw__history-title")!.textContent = entry.title;
            item.querySelector<HTMLElement>(".sw__history-meta")!.textContent = entry.source === "closed"
                ? this.i18n.historyClosed
                : openedKeys.has(entry.key) ? this.i18n.historyOpen : this.i18n.historyClosed;
            item.title = entry.title;
            this.bindHistoryItemActions(item, entry, onPick);
            panel.appendChild(item);
            });
        };
        appendSection(this.i18n.historyOpenSection, sections.open as IOpenHistoryEntry[], this.i18n.clearOpenHistory, () => {
            if (!confirm(this.i18n.clearOpenHistoryConfirm)) return;
            this.data[HISTORY_KEY] = [];
            this.saveDataDebounced(HISTORY_KEY);
            this.refreshOpenHistoryDropdowns();
        });
        appendSection(this.i18n.historyClosedSection, sections.closed as IOpenHistoryEntry[], this.i18n.clearClosedHistory, () => {
            this.data[CLOSED_HISTORY_KEY] = [];
            this.saveDataDebounced(CLOSED_HISTORY_KEY);
            this.refreshOpenHistoryDropdowns();
        });
        if (shown === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__history-empty";
            empty.textContent = this.i18n.historyChangedEmpty;
            panel.appendChild(empty);
        }
    }

    private bindHistoryItemActions(item: HTMLButtonElement, entry: IOpenHistoryEntry, onPick: (entry: IOpenHistoryEntry) => void) {
        let timer: number | null = null;
        let longPressed = false;
        let x = 0;
        let y = 0;
        const clearTimer = () => {
            if (timer !== null) window.clearTimeout(timer);
            timer = null;
        };
        const openMenu = (clientX: number, clientY: number) => {
            this.closeHistoryMenu();
            const menu = new Menu("swHistoryItemMenu");
            this.activeHistoryMenu = menu;
            menu.addItem({label: this.i18n.historyOpenAction, icon: "iconOpen", click: () => onPick(entry)});
            menu.addItem({label: this.i18n.historyRemove, icon: "iconTrashcan", click: () => {
                if (entry.source === "closed") this.removeClosedHistoryEntry(entry.rootId || entry.key);
                else this.removeOpenHistoryEntry(entry.key);
                this.refreshOpenHistoryDropdowns();
            }});
            menu.open({x: clientX, y: clientY});
        };
        item.addEventListener("click", (event) => {
            if (longPressed) {
                longPressed = false;
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            onPick(entry);
        });
        item.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openMenu(event.clientX, event.clientY);
        });
        item.addEventListener("touchstart", (event) => {
            const touch = event.touches[0];
            x = touch?.clientX || 0;
            y = touch?.clientY || 0;
            longPressed = false;
            clearTimer();
            timer = window.setTimeout(() => {
                timer = null;
                longPressed = true;
                openMenu(x, y);
            }, 500);
        }, {passive: true});
        item.addEventListener("touchmove", clearTimer, {passive: true});
        item.addEventListener("touchcancel", clearTimer);
        item.addEventListener("touchend", (event) => {
            clearTimer();
            if (longPressed) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, {passive: false});
    }

    private async openHistoryEntry(entry: IOpenHistoryEntry) {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const current = opened.find((tab) => this.pinKeyOf(tab) === entry.key);
        if (current) { this.activateTab(current); return; }
        // T-6801：切换离开前记录当前活动文档的滚动现场（若活动编辑器可读）
        this.captureActiveDocScroll();
        // T-6806：切换离开前记录跳转原点（后退栈）
        this.captureJumpOrigin();
        if (!entry.rootId || !BLOCK_ID_RE.test(entry.rootId)) {
            if (entry.source === "closed") this.removeClosedHistoryEntry(entry.rootId || entry.key);
            else this.removeOpenHistoryEntry(entry.key);
            showMessage(this.i18n.historyInvalid);
            return;
        }
        if (this.isMobile) {
            const opened = await this.mobileOpenDoc(entry.rootId);
            if (!opened) {
                if (entry.source === "closed") this.removeClosedHistoryEntry(entry.rootId);
                showMessage(this.i18n.openDocFailed);
            }
        } else {
            const opened = await openDocumentOnDesktop({
                rootId: entry.rootId,
                app: this.app,
                openTab,
                logger,
            });
            if (!opened) {
                if (entry.source === "closed") this.removeClosedHistoryEntry(entry.rootId || entry.key);
                else this.removeOpenHistoryEntry(entry.key);
                showMessage(this.i18n.openDocFailed);
            } else {
                // T-6801 重开现场：会话内有过离开记录的文档按比例回卷滚动位置
                this.applyDocScrollAfterOpen(entry.rootId);
            }
        }
    }

    // ==================== T-6801 重开现场（会话级滚动记忆） ====================
    // 纯比例计算在 recent-closed.js；本层只负责捕获时机（关闭前/切换离开前）、
    // 有界等待渲染后的回卷，以及 50 份现场的 FIFO 容量上限。会话级内存态，
    // 不持久化——跨会话的"浏览位置"属宿主能力，插件不伪造。

    private docScrollMemory = new Map<string, number>();
    // T-6802 上次选择置顶：同一查询下用户上次选中的文档结果优先展示（会话级，FIFO 32）
    private lastPickedByQuery = new Map<string, string>();
    // T-6806 跳转栈：速切驱动的文档跳转可后退/前进（会话级，FIFO 50）。
    // 思源原生 backStack 的正确推入依赖模块私有 forwardStack 与内部选区契约，
    // 公开 API 不可达（R2 取证），故自建等价栈。
    private jumpBackStack: Array<{rootId: string}> = [];
    private jumpForwardStack: Array<{rootId: string}> = [];
    private suppressJumpCapture = false;

    private captureDocScrollFromElement(rootId: string, element: HTMLElement) {
        if (!BLOCK_ID_RE.test(rootId)) return;
        const container = element.querySelector<HTMLElement>(".protyle-content");
        if (!container) return;
        const ratio = computeScrollRatio(container.scrollTop, container.scrollHeight, container.clientHeight);
        if (ratio <= 0) {
            this.docScrollMemory.delete(rootId);
            return;
        }
        this.docScrollMemory.set(rootId, ratio);
        while (this.docScrollMemory.size > 50) {
            const oldest = this.docScrollMemory.keys().next().value;
            if (oldest === undefined) break;
            this.docScrollMemory.delete(oldest);
        }
    }

    private captureActiveDocScroll() {
        const editor = this.resolveActiveHostEditor();
        const element = (editor?.protyle as unknown as {element?: HTMLElement} | undefined)?.element;
        if (!element) return;
        const rootId = (editor!.protyle as unknown as {block?: {parentID?: string}}).block?.parentID || "";
        this.captureDocScrollFromElement(rootId, element);
    }

    private applyDocScrollAfterOpen(rootId: string) {
        const ratio = this.docScrollMemory.get(rootId);
        if (typeof ratio !== "number" || !Number.isFinite(ratio)) return;
        let attempts = 0;
        const tick = () => {
            const editor = this.resolveActiveHostEditor();
            const element = (editor?.protyle as unknown as {element?: HTMLElement} | undefined)?.element;
            const container = element?.querySelector<HTMLElement>(".protyle-content");
            if (container && container.scrollHeight > container.clientHeight) {
                const plan = planScrollRestore(
                    {scrollTop: container.scrollTop, scrollHeight: container.scrollHeight, clientHeight: container.clientHeight},
                    ratio,
                );
                if (plan) container.scrollTop = plan.top;
                return;
            }
            if (attempts++ < 30) window.setTimeout(tick, 50);
        };
        tick();
    }

    private refreshOpenHistoryDropdowns() {
        this.closeHistoryMenu();
        document.querySelectorAll<HTMLElement>(".sw__history-dd").forEach((container) => this.refreshOpenHistoryDropdown(container));
    }

    private closeHistoryMenu() {
        if (!this.activeHistoryMenu) return;
        try {
            this.activeHistoryMenu.close();
        } catch (error) {
            logger.warn("close history menu fail", error);
        }
        this.activeHistoryMenu = null;
    }

    private refreshOpenHistoryDropdown(container: HTMLElement) {
        this.historyDropdownClosers.get(container)?.close();
        const badge = container.querySelector<HTMLElement>(".sw__history-badge");
        if (badge) {
            const openedRoots = new Set((this.isMobile ? this.getMobileTabs() : getAllTabs())
                .map((tab) => this.rootIdOf(tab)).filter(Boolean));
            const count = buildRecentHistorySections(this.getOpenHistory(), this.getClosedHistory(), openedRoots).count;
            badge.textContent = String(count);
            badge.classList.toggle("fn__none", count === 0);
        }
        container.querySelector<HTMLElement>(".sw__history-panel")?.classList.add("fn__none");
    }

    // ==================== 鏀惰棌涓嬫媺缁勪欢 ====================
    // 原生 select 的 optgroup 无法折叠且样式简陋，改为自定义下拉：
    // 触发按钮（星标 + 数量徽标）+ 浮层面板（分组标题可折叠/展开，组内项点击跳转）

    // 初始化一个收藏下拉组件（弹窗与侧边栏各一份）
    // onClose：选择收藏项后的收尾（弹窗销毁 / 侧边栏刷新），组件内部还会同时收起面板
    private setupFavDropdown(container: HTMLElement, onClose: IOverlayClose, onChanged: IOverlayClose = () => undefined) {
        container.innerHTML = `<button type="button" class="sw__fav-trigger">
    <svg><use xlink:href="#iconStar"></use></svg>
    <span class="sw__fav-trigger-text">${this.i18n.favorites}</span>
    <span class="sw__fav-badge fn__none"></span>
</button>
<div class="sw__fav-panel fn__none"></div>`;

        const trigger = container.querySelector<HTMLElement>(".sw__fav-trigger");
        const panel = container.querySelector<HTMLElement>(".sw__fav-panel");

        // 面板打开期间才监听 DOM 变化：容器被移除（弹窗销毁/侧边栏重渲染）时解绑全局监听；
        // 面板关闭即 disconnect，避免 body 级 MutationObserver 随编辑操作全局常驻
        const observer = typeof MutationObserver === "function" ? new MutationObserver(() => {
            if (!container.isConnected) {
                unbindGlobal();
            }
        }) : null;
        const unbindGlobal = () => {
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            window.removeEventListener("resize", onReposition);
            document.removeEventListener("scroll", onReposition, true);
            observer?.disconnect();
        };
        // 收起面板并停止 DOM 观察（三条收起路径共用：再次点击触发器 / 点击外部 / 选中收藏项）
        const closePanel = () => {
            panel.classList.add("fn__none");
            // 全局监听仅在面板展开期间存在，关闭后立即释放。
        };
        // 点击外部收起面板；面板关闭期间 MutationObserver 已停止，
        // 宿主容器被移除后由这次全局点击兜底解绑全部监听
        const onDocPointerDown = (event: PointerEvent) => {
            if (!container.isConnected) {
                unbindGlobal();
                return;
            }
            if (!container.contains(event.target as Node)) {
                closePanel();
            }
        };
        // 视口尺寸/滚动变化时重新贴位（fixed 定位不随文档流移动）
        const onReposition = () => {
            if (!panel.classList.contains("fn__none") && container.isConnected) {
                this.positionFavPanel(trigger, panel);
            }
        };
        trigger.addEventListener("click", () => {
            const willOpen = panel.classList.contains("fn__none");
            if (willOpen) {
                this.renderFavPanel(panel, () => {
                    closePanel();
                    onClose();
                }, onChanged);
                panel.classList.remove("fn__none");
                this.positionFavPanel(trigger, panel);
                document.addEventListener("pointerdown", onDocPointerDown, true);
                window.addEventListener("resize", onReposition);
                document.addEventListener("scroll", onReposition, true);
                observer?.observe(document.body, {childList: true, subtree: true});
            } else {
                closePanel();
            }
        });

        this.refreshFavDropdown(container);
    }

    // 计算收藏下拉面板坐标：fixed 定位脱离侧边栏/弹窗的 overflow 裁剪，
    // 宽度按宿主（切换器弹窗或侧边栏面板）与视口的可用空间收缩，
    // 优先与触发器右对齐、出现在下方；左侧越界贴宿主左缘，下方空间不足翻转到上方
    private positionFavPanel(trigger: HTMLElement, panel: HTMLElement) {
        const rect = trigger.getBoundingClientRect();
        const margin = 6;
        let minLeft = margin;
        let maxRight = window.innerWidth - margin;
        const host = trigger.closest<HTMLElement>(".speed-switch");
        if (host) {
            const hostRect = host.getBoundingClientRect();
            minLeft = Math.max(minLeft, hostRect.left + 2);
            maxRight = Math.min(maxRight, hostRect.right - 2);
        }
        // 宽度：理想 FAV_PANEL_WIDTH_PX，按宿主/视口可用空间收缩，确保不超出侧边栏
        const avail = Math.max(0, maxRight - minLeft);
        const width = Math.min(FAV_PANEL_WIDTH_PX, avail);
        let left = Math.min(Math.max(rect.right - width, minLeft), maxRight - width);
        // 垂直：默认在触发器下方，剩余空间不足时翻转到触发器上方
        let top = rect.bottom + margin;
        let maxHeight = window.innerHeight - margin - top;
        if (maxHeight < 180) {
            const over = Math.min(FAV_PANEL_MAX_HEIGHT_PX, rect.top - margin * 2);
            top = Math.max(margin, rect.top - margin - over);
            maxHeight = rect.top - margin - top;
        }
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
        panel.style.maxHeight = `${Math.max(FAV_PANEL_MIN_HEIGHT_PX, Math.round(maxHeight))}px`;
    }

    // 渲染下拉面板内容：分组标题（点击折叠/展开）+ 组内收藏项（点击跳转）
    private renderFavPanel(panel: HTMLElement, onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        panel.innerHTML = "";
        const favorites = this.getFavorites();
        const groupNames = this.getFavoriteGroupNames();

        // 既无收藏也无分组才提示空态；仅有空分组时仍展示分组（数量 0），与设置页保持一致
        if (favorites.length === 0 && groupNames.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__fav-empty";
            empty.setAttribute("role", "status");
            empty.textContent = this.i18n.noFavorites;
            panel.appendChild(empty);
            return;
        }

        // 按分组归类（分组顺序 = 注册表新建顺序在前；注册表中的空分组也占位，数量显示 0）
        const groups = groupFavoritesByGroup(favorites, groupNames);

        // 有分组时未分组的置底显示为「未分组」；无任何分组时平铺不显示组头
        const groupedNames = Array.from(groups.keys()).filter((name) => name !== "");
        const ungrouped = groups.get("") || [];
        if (!groupedNames.length) {
            this.appendFavFlatList(panel, ungrouped, onPick, onChanged);
        } else {
            groupedNames.forEach((name) => this.appendFavGroup(panel, name, groups.get(name) || [], onPick, onChanged));
            if (ungrouped.length > 0) {
                this.appendFavGroup(panel, this.i18n.ungrouped, ungrouped, onPick, onChanged);
            }
        }

        // T-6804 标签智能分组：动态分区置于静态分组之后，按需拉取（面板打开时一次）
        const smartGroups = this.getSettings().favoriteSmartGroups || [];
        smartGroups.forEach((group) => this.appendFavSmartGroup(panel, group, onPick, onChanged));
    }

    // T-6804 智能分组分区：壳体先渲染（加载态），内核按需返回后填充条目。
    // 条目为只读投影：点击跳转，不提供静态收藏的移动/取消菜单。
    private appendFavSmartGroup(panel: HTMLElement, group: {name: string; tag: string}, onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        const groupEl = document.createElement("div");
        groupEl.className = "sw__fav-group sw__fav-group--smart";

        const head = document.createElement("button");
        head.type = "button";
        head.className = "sw__fav-group-head";
        head.title = `${group.tag}`;
        head.innerHTML = `<svg class="sw__fav-arrow"><use xlink:href="#iconRight"></use></svg>
<span class="sw__fav-group-name"></span>
<span class="sw__fav-count">#${group.tag}</span>`;
        head.querySelector<HTMLElement>(".sw__fav-group-name")!.textContent = group.name;
        groupEl.appendChild(head);

        const list = document.createElement("div");
        list.className = "sw__fav-items";
        const status = document.createElement("div");
        status.className = "sw__history-empty sw__fav-smart-status";
        status.textContent = this.i18n.favSmartGroupLoading;
        list.appendChild(status);
        groupEl.appendChild(list);
        panel.appendChild(groupEl);

        const query = buildTagSmartGroupQuery(group, {nowMs: Date.now()});
        if (!query) {
            status.textContent = this.i18n.favSmartGroupLoading;
            return;
        }
        void this.fetchKernelJson("/api/query/sql", query).then((json) => {
            const entries = projectTagSmartGroupEntries(json?.data);
            status.remove();
            entries.forEach((entry) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sw__fav-item";
                item.innerHTML = `<svg><use xlink:href="#iconFile"></use></svg><span></span>`;
                item.querySelector("span")!.textContent = entry.title;
                item.title = entry.title;
                item.setAttribute("role", "menuitem");
                item.addEventListener("click", () => {
                    onPick();
                    if (this.isMobile) {
                        void this.mobileOpenDoc(entry.rootId);
                    } else {
                        void openTab({app: this.app, doc: {id: entry.rootId}});
                    }
                });
                list.appendChild(item);
            });
            if (!entries.length) {
                const emptyItem = document.createElement("div");
                emptyItem.className = "sw__fav-smart-status";
                emptyItem.textContent = this.i18n.favSmartGroupEmpty;
                list.appendChild(emptyItem);
            }
            const count = head.querySelector<HTMLElement>(".sw__fav-count");
            if (count) count.textContent = `${entries.length} · #${group.tag}`;
            onChanged();
        }).catch(() => {
            status.textContent = this.i18n.favSmartGroupEmpty;
        });
    }

    // ==================== T-6804 智能分组配置（设置页 + 面板共用） ====================

    public getFavoriteSmartGroups(): Array<{name: string; tag: string; notebook?: string; updatedWithinDays?: number}> {
        return this.getSettings().favoriteSmartGroups || [];
    }

    public addFavoriteSmartGroup(name: string, tag: string, notebook = "", updatedWithinDays = 0): boolean {
        const current = this.getFavoriteSmartGroups();
        if (current.length >= 4) return false;
        const next = normalizeFavoriteSmartGroups([...current, {name, tag, notebook, updatedWithinDays}]);
        if (next.length === current.length) return false;
        this.updateSettings({favoriteSmartGroups: next});
        return true;
    }

    public removeFavoriteSmartGroup(name: string): void {
        const next = normalizeFavoriteSmartGroups(
            this.getFavoriteSmartGroups().filter((group) => group.name !== name),
        );
        this.updateSettings({favoriteSmartGroups: next});
    }

    // ==================== T-6810 Essentials 常驻层 ====================

    public getDocumentSetEssentials(): string[] {
        return this.getSettings().documentSetEssentials || [];
    }

    public addDocumentSetEssentialsFromCurrentTabs(): number {
        const merged = normalizeEssentials([
            ...this.getSettings().documentSetEssentials,
            ...this.currentDocumentSetEntries().map((entry) => entry.rootId),
        ]);
        this.updateSettings({documentSetEssentials: merged});
        return merged.length;
    }

    public removeDocumentSetEssential(rootId: string): void {
        this.updateSettings({
            documentSetEssentials: (this.getSettings().documentSetEssentials || []).filter((id) => id !== rootId),
        });
    }

    private async openDocumentSetEssentials(): Promise<{opened: number; failed: number; skipped: number}> {
        const essentials = this.getSettings().documentSetEssentials || [];
        const opened = new Set(this.currentDocumentSetEntries().map((entry) => entry.rootId));
        // T-6815：带回执打开——opened=本次成功、failed=尝试失败、skipped=已打开跳过
        const outcome = {opened: 0, failed: 0, skipped: 0};
        for (const rootId of essentials) {
            if (opened.has(rootId)) {
                outcome.skipped += 1;
                continue;
            }
            const ok = this.isMobile ? await this.mobileOpenDoc(rootId)
                // T-6826：常驻层同样不抢焦点（跟随恢复链语义）
                : await openDocumentOnDesktop({rootId, app: this.app, openTab, logger, keepCursor: true});
            if (ok) outcome.opened += 1;
            else outcome.failed += 1;
        }
        return outcome;
    }

    // T-6810 设置页管理器：把当前打开的页签一键加入常驻，逐条移除或全部清空。
    // 自含内部重渲染，不依赖外层 render 闭包。
    public buildDocumentSetEssentialsManager(): HTMLElement {
        const section = document.createElement("div");
        section.className = "sw-document-set-essentials";
        const title = document.createElement("strong");
        title.textContent = this.i18n.documentSetEssentialsLabel;
        const tip = document.createElement("p");
        tip.className = "sw-settings__hint";
        tip.textContent = this.i18n.documentSetEssentialsTip;
        section.append(title, tip);
        const buildContent = () => {
            section.querySelectorAll(".sw-document-set-essentials__dynamic").forEach((el) => el.remove());
            const dynamic = document.createElement("div");
            dynamic.className = "sw-document-set-essentials__dynamic";
            const essentials = this.getDocumentSetEssentials();
            const add = document.createElement("button");
            add.type = "button";
            add.className = "b3-button b3-button--outline";
            add.textContent = this.i18n.documentSetEssentialsAdd;
            add.addEventListener("click", () => {
                this.addDocumentSetEssentialsFromCurrentTabs();
                buildContent();
            });
            dynamic.appendChild(add);
            if (essentials.length) {
                const clear = document.createElement("button");
                clear.type = "button";
                clear.className = "b3-button b3-button--text";
                clear.textContent = this.i18n.documentSetEssentialsClear;
                clear.addEventListener("click", () => {
                    this.updateSettings({documentSetEssentials: []});
                    buildContent();
                });
                dynamic.appendChild(clear);
            }
            if (!essentials.length) {
                const empty = document.createElement("p");
                empty.className = "sw-settings__hint";
                empty.textContent = this.i18n.documentSetEssentialsEmpty;
                dynamic.appendChild(empty);
            } else {
                const list = document.createElement("div");
                list.className = "sw-document-set-essentials__list";
                essentials.forEach((rootId, index) => {
                    const row = document.createElement("div");
                    row.className = "sw-document-set-essentials__item";
                    const label = document.createElement("span");
                    label.textContent = `#${index + 1} · ${rootId.slice(0, 14)}…`;
                    const remove = document.createElement("button");
                    remove.type = "button";
                    remove.className = "b3-button b3-button--text";
                    remove.textContent = this.i18n.documentSetEssentialsRemove;
                    remove.addEventListener("click", () => {
                        this.removeDocumentSetEssential(rootId);
                        buildContent();
                    });
                    row.append(label, remove);
                    list.appendChild(row);
                });
                dynamic.appendChild(list);
            }
            section.appendChild(dynamic);
        };
        buildContent();
        return section;
    }

    public async getFavoriteTagOptions(): Promise<Array<{name: string; count: number}>> {
        const json = await this.fetchKernelJson("/api/tag/getTag", {});
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.tags) ? json.data.tags : [];
        return rows
            .map((row: {name?: unknown; count?: unknown}) => ({
                name: typeof row?.name === "string" ? row.name : "",
                count: Number(row?.count) || 0,
            }))
            .filter((row: {name: string}) => row.name.length > 0)
            .slice(0, 200);
    }

    // T-6817 动态组：笔记本范围下拉的数据源（有界清单，来自内核 lsNotebooks）
    public async getFavoriteNotebookOptions(): Promise<Array<{id: string; name: string}>> {
        const notebooks = await this.loadNotebooks();
        return notebooks.slice(0, 100);
    }

    // 渲染单个收藏分组：可折叠组头（右键弹出一键开/关菜单）+ 组内项列表
    private appendFavGroup(panel: HTMLElement, name: string, items: IFavoriteItem[], onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        const groupEl = document.createElement("div");
        groupEl.className = "sw__fav-group" + (this.favCollapsed.has(name) ? " sw__fav-collapsed" : "");

        const head = document.createElement("button");
        head.type = "button";
        head.className = "sw__fav-group-head";
        head.title = this.i18n.favGroupTip;
        head.innerHTML = `<svg class="sw__fav-arrow"><use xlink:href="#iconRight"></use></svg>
<span class="sw__fav-group-name"></span>
<span class="sw__fav-count">${items.length}</span>`;
        head.querySelector<HTMLElement>(".sw__fav-group-name")!.textContent = name;
        head.addEventListener("click", () => {
            groupEl.classList.toggle("sw__fav-collapsed");
            if (this.favCollapsed.has(name)) {
                this.favCollapsed.delete(name);
            } else {
                this.favCollapsed.add(name);
            }
            this.saveFavCollapsed();
        });
        // 右键弹出「一键开启/关闭组内页签」菜单，与 v0.14.0 changelog 描述对齐
        head.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openFavGroupMenu(items, event, onChanged);
        });
        groupEl.appendChild(head);

        const list = document.createElement("div");
        list.className = "sw__fav-items";
        items.forEach((fav) => {
            list.appendChild(this.makeFavItem(panel, fav, onPick, onChanged));
        });
        groupEl.appendChild(list);
        panel.appendChild(groupEl);
    }

    // 无任何分组时的平铺列表（不显示组头）
    private appendFavFlatList(panel: HTMLElement, items: IFavoriteItem[], onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        const list = document.createElement("div");
        list.className = "sw__fav-items sw__fav-items--flat";
        items.forEach((fav) => {
            list.appendChild(this.makeFavItem(panel, fav, onPick, onChanged));
        });
        panel.appendChild(list);
    }

    // 生成单个收藏项按钮：点击跳转；右键弹出操作菜单（移动至分组 / 取消收藏）
    private makeFavItem(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void, onChanged: IOverlayClose = () => undefined): HTMLButtonElement {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sw__fav-item";
        item.innerHTML = `<svg><use xlink:href="#iconFile"></use></svg><span></span>`;
        item.querySelector("span")!.textContent = fav.title;
        item.title = fav.title;
        item.addEventListener("click", () => {
            this.jumpToFavorite(fav, onPick);
        });
        item.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openFavItemMenu(panel, fav, onPick, event, onChanged);
        });
        return item;
    }

    // 刷新单个下拉组件的触发按钮徽标；面板展开中则收起（内容在下次打开时重建）
    private refreshFavDropdown(container: HTMLElement) {
        const count = this.getFavorites().length;
        const badge = container.querySelector<HTMLElement>(".sw__fav-badge");
        if (badge) {
            badge.textContent = String(count);
            badge.classList.toggle("fn__none", count === 0);
        }
        container.querySelector<HTMLElement>(".sw__fav-panel")?.classList.add("fn__none");
    }

    // 鍒锋柊鎵€鏈夋敹钘忎笅鎷夌粍浠讹紙寮圭獥涓庝晶杈规爮锛夌殑寰芥爣涓庨潰鏉?
    private refreshFavSelects() {
        document.querySelectorAll<HTMLElement>(".sw__fav-dd").forEach((container) => {
            this.refreshFavDropdown(container);
        });
    }

    // 修改收藏项的分组（group 为空表示移出分组）
    private setFavoriteGroup(key: string, group: string) {
        const list = this.getFavorites();
        const result = setFavoriteEntryGroup(list, key, group);
        if (!result.changed) return;
        list.splice(0, list.length, ...result.items);
        this.saveFavorites(list);
        this.refreshFavSelects();
    }

    // 收藏页签到指定分组（已收藏则仅调整分组），用于菜单快速收藏到组
    private addFavoriteToGroup(tab: Tab, group: string) {
        const list = this.getFavorites();
        const rootId = this.rootIdOf(tab);
        if (!rootId) {
            // 与 toggleFavorite 一致：未解析页签拒绝入组，避免产生无法跳转的脏条目
            showMessage(this.i18n.favNeedActivate);
            return;
        }
        this.migrateFavoriteKey(list, tab, rootId);
        const item = list.find((fav) => fav.key === rootId);
        if (item) {
            item.group = group.trim();
        } else {
            list.unshift({key: rootId, title: this.titleOf(tab), rootId, group: group.trim()});
        }
        this.saveFavorites(list);
        this.refreshFavSelects();
    }

    // 分组注册表（允许存在空分组：设置页新建后尚未收藏任何页签的分组）
    private getFavGroupRegistry(): string[] {
        const data = this.data[FAV_GROUPS_KEY];
        const result = sanitizeStringList(data, FAVORITE_GROUPS_MAX);
        if (result.changed) {
            this.data[FAV_GROUPS_KEY] = result.items;
            this.saveDataDebounced(FAV_GROUPS_KEY);
        }
        return result.items;
    }

    private saveFavGroupRegistry(names: string[]) {
        this.data[FAV_GROUPS_KEY] = sanitizeStringList(names, FAVORITE_GROUPS_MAX).items;
        this.saveDataDebounced(FAV_GROUPS_KEY);
    }

    // 全部分组名：注册表在前保持新建顺序，再并入收藏项上出现过的分组名，去重
    private getFavoriteGroupNames(): string[] {
        const merged: string[] = [];
        this.getFavGroupRegistry()
            .concat(this.getFavorites().map((item) => item.group || ""))
            .forEach((name) => {
                if (name && !merged.includes(name)) {
                    merged.push(name);
                }
            });
        return merged;
    }

    // 新建分组（重名直接忽略，返回是否创建成功）
    private createFavoriteGroup(name: string): boolean {
        const trimmed = name.trim();
        if (!trimmed || this.getFavoriteGroupNames().includes(trimmed)) {
            return false;
        }
        this.saveFavGroupRegistry(this.getFavGroupRegistry().concat(trimmed));
        return true;
    }

    // 删除分组：注册表移除，组内收藏项移出到未分组
    private deleteFavoriteGroup(name: string) {
        this.saveFavGroupRegistry(this.getFavGroupRegistry().filter((item) => item !== name));
        const list = this.getFavorites();
        let dirty = false;
        list.forEach((item) => {
            if (item.group === name) {
                item.group = "";
                dirty = true;
            }
        });
        if (dirty) {
            this.saveFavorites(list);
        }
        // 分组被删后清理其折叠状态
        if (this.favCollapsed.delete(name)) {
            this.saveFavCollapsed();
        }
        this.refreshFavSelects();
    }

    // 重命名分组：该组全部收藏项迁移到新名称，注册表同步改名（空分组也可重命名）
    private renameFavoriteGroup(from: string, to: string) {
        const list = this.getFavorites();
        let dirty = false;
        list.forEach((item) => {
            if (item.group === from) {
                item.group = to;
                dirty = true;
            }
        });
        if (dirty) {
            this.saveFavorites(list);
        }
        const registry = this.getFavGroupRegistry();
        const index = registry.indexOf(from);
        if (index >= 0) {
            registry[index] = to;
            this.saveFavGroupRegistry(registry);
        }
        // 分组重命名后同步迁移其折叠状态
        if (this.favCollapsed.delete(from)) {
            this.favCollapsed.add(to);
            this.saveFavCollapsed();
        }
        this.refreshFavSelects();
    }

    // 刷新卡片收藏状态标识（实心/空心星与提示文案）
    private refreshCardFavState(tab: Tab, card: HTMLElement) {
        const isFaved = this.getFavorites().some((item) => item.key === this.pinKeyOf(tab));
        card.classList.toggle("sw__faved", isFaved);
        const favoriteButton = card.querySelector<HTMLElement>(".sw__fav-btn");
        const label = isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab;
        favoriteButton?.setAttribute("aria-label", label);
        favoriteButton?.setAttribute("title", label);
    }

    // 星标点击菜单：未收藏时选择收藏方式（快速收藏 / 收藏到分组 / 新建分组收藏），
    // 已收藏时管理分组（切换分组 / 移出分组 / 取消收藏）
    private openFavMenu(tab: Tab, card: HTMLElement, event: MouseEvent) {
        const key = this.pinKeyOf(tab);
        const favorite = this.getFavorites().find((item) => item.key === key);
        const groupNames = this.getFavoriteGroupNames();
        const menu = new Menu("swFavMenu");

        // 未收藏 / 已收藏两套菜单项，分支差异很大故拆开各自构建
        if (!favorite) {
            this.buildFavMenuUnfavorited(menu, tab, card, groupNames);
        } else {
            this.buildFavMenuFavorited(menu, tab, card, key, favorite, groupNames);
        }
        menu.open({x: event.clientX, y: event.clientY});
    }

    // 未收藏菜单：先收藏（无分组），再列已有分组可直接归入，最后新建分组
    private buildFavMenuUnfavorited(menu: Menu, tab: Tab, card: HTMLElement, groupNames: string[]) {
        menu.addItem({
            label: this.i18n.favoriteTab,
            icon: "iconStar",
            click: () => {
                this.toggleFavorite(tab);
                this.refreshCardFavState(tab, card);
                this.refreshFavSelects();
            },
        });
        if (groupNames.length > 0) {
            menu.addSeparator();
            groupNames.forEach((name) => {
                menu.addItem({
                    label: this.escapeAttr(name),
                    icon: "iconFolder",
                    click: () => {
                        this.addFavoriteToGroup(tab, name);
                        this.refreshCardFavState(tab, card);
                    },
                });
            });
        }
        menu.addSeparator();
        menu.addItem({
            label: this.i18n.newGroupFav,
            icon: "iconAdd",
            click: () => this.openGroupDialog(tab, card),
        });
    }

    // 已收藏菜单：分组列表（当前分组打勾）+ 移出分组 + 新建分组 + 取消收藏
    private buildFavMenuFavorited(
        menu: Menu,
        tab: Tab,
        card: HTMLElement,
        key: string,
        favorite: IFavoriteItem,
        groupNames: string[],
    ) {
        if (groupNames.length > 0) {
            groupNames.forEach((name) => {
                menu.addItem({
                    label: this.escapeAttr(name),
                    icon: favorite.group === name ? "iconSelect" : "iconFolder",
                    click: () => this.setFavoriteGroup(key, name),
                });
            });
            if (favorite.group) {
                menu.addItem({
                    label: this.i18n.removeFromGroup,
                    icon: "iconUnpin",
                    click: () => this.setFavoriteGroup(key, ""),
                });
            }
            menu.addSeparator();
        }
        menu.addItem({
            label: this.i18n.newGroupFav,
            icon: "iconAdd",
            click: () => this.openGroupDialog(tab, card),
        });
        menu.addSeparator();
        menu.addItem({
            label: this.i18n.unfavoriteTab,
            icon: "iconClose",
            click: () => {
                this.toggleFavorite(tab);
                this.refreshCardFavState(tab, card);
                this.refreshFavSelects();
            },
        });
    }

    // 收藏分组右键菜单：一键开启/关闭组内页签
    private openFavGroupMenu(items: IFavoriteItem[], event: MouseEvent, onChanged: IOverlayClose = () => undefined) {
        const menu = new Menu("swFavGroupMenu");
        menu.addItem({
            label: this.i18n.openGroupTabs,
            icon: "iconAdd",
            click: async () => {
                const count = await this.openGroupTabs(items);
                if (count > 0) {
                    onChanged();
                }
            },
        });
        menu.addItem({
            label: this.i18n.closeGroupTabs,
            icon: "iconClose",
            click: async () => {
                const count = await this.closeGroupTabs(items);
                if (count > 0) {
                    onChanged();
                }
            },
        });
        menu.open({x: event.clientX, y: event.clientY});
    }

    // 收藏下拉项右键菜单：移动到既有分组（子菜单，当前分组勾选）/ 取消收藏。
    // 操作后保持面板展开并就地重建，方便连续处理多个收藏项。
    private openFavItemMenu(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void, event: MouseEvent, onChanged: IOverlayClose = () => undefined) {
        const menu = new Menu("swFavItemMenu");
        const moveSub = [{checked: !fav.group, label: this.escapeAttr(this.i18n.ungrouped),
            click: () => this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, ""), panel, onPick, onChanged)}];
        this.getFavoriteGroupNames().forEach((name) => {
            moveSub.push({checked: fav.group === name, label: this.escapeAttr(name),
                click: () => this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, name), panel, onPick, onChanged)});
        });
        menu.addItem({type: "submenu", label: this.i18n.moveToGroup, icon: "iconFolder", submenu: moveSub});
        // 新建分组并移动：弹窗输入分组名（新名称自动新建，留空移出分组）
        menu.addItem({
            label: this.i18n.newGroupFav,
            icon: "iconAdd",
            click: () => this.openFavoriteGroupDialog(panel, fav, onPick, onChanged),
        });
        menu.addSeparator();
        menu.addItem({
            label: this.i18n.unfavoriteTab,
            icon: "iconClose",
            click: () => this.applyFavItemChange(() => this.removeFavorite(fav.key), panel, onPick, onChanged),
        });
        menu.open({x: event.clientX, y: event.clientY});
    }

    // 执行收藏项变更：先落盘并同步所有下拉的徽标（refreshFavSelects 会收起展开中的面板），
    // 再让当前面板保持展开并就地重建，最后按新内容高度重新贴位
    private applyFavItemChange(mutate: () => void, panel: HTMLElement, onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        mutate();
        this.refreshFavSelects();
        panel.classList.remove("fn__none");
        this.renderFavPanel(panel, onPick, onChanged);
        const dd = panel.closest<HTMLElement>(".sw__fav-dd");
        const trigger = dd?.querySelector<HTMLElement>(".sw__fav-trigger");
        if (dd && trigger) {
            this.positionFavPanel(trigger, panel);
        }
    }

    // 转义 HTML 属性值（分组名等用户输入拼入模板时防注入；Menu label 为 innerHTML 亦需转义）
    private escapeAttr(text: string): string {
        return text.replace(/&/g, "&amp;").split('"').join("&quot;").split("'").join("&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // 弹窗设置收藏项的分组：输入分组名（留空移出分组），datalist 列出已有分组便于快速选择；
    // 未收藏的页签确认后自动收藏到该分组
    private openGroupDialog(tab: Tab, card?: HTMLElement) {
        const key = this.pinKeyOf(tab);
        const favorite = this.getFavorites().find((item) => item.key === key);
        const groupNames = this.getFavoriteGroupNames();
        const dialog = new Dialog({
            title: `${this.i18n.setGroup} 路 ${this.escapeAttr(this.titleOf(tab))}`,
            content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block sw__group-input" placeholder="${this.i18n.groupName}" aria-label="${this.i18n.groupName}" list="sw__group-list" value="${this.escapeAttr(favorite?.group || "")}" />
    <datalist id="sw__group-list">${groupNames.map((name) => `<option value="${this.escapeAttr(name)}"></option>`).join("")}</datalist>
    <div class="fn__hr"></div>
    <div class="b3-label__text">${this.i18n.groupTip}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text sw__group-confirm">${this.i18n.confirm}</button>
</div>`,
            width: "420px",
        });
        const input = dialog.element.querySelector<HTMLInputElement>(".sw__group-input");
        const confirm = () => {
            // 未收藏时一并收藏；已收藏时仅调整分组（留空移出分组）
            this.addFavoriteToGroup(tab, input.value);
            if (card) {
                this.refreshCardFavState(tab, card);
            }
            dialog.destroy();
        };
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                confirm();
            }
        });
        dialog.element.querySelector(".sw__group-confirm")?.addEventListener("click", confirm);
        dialog.element.querySelector(".b3-button--cancel")?.addEventListener("click", () => dialog.destroy());
        input.focus();
        input.select();
    }

    // 收藏下拉项：新建分组并移动。弹窗输入分组名（新名称自动新建，留空移出分组），
    // datalist 列出既有分组便于快速选择；确认后就地刷新下拉面板
    private openFavoriteGroupDialog(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        const groupNames = this.getFavoriteGroupNames();
        const dialog = new Dialog({
            title: `${this.i18n.setGroup} 路 ${this.escapeAttr(fav.title)}`,
            content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block sw__group-input" placeholder="${this.i18n.groupName}" aria-label="${this.i18n.groupName}" list="sw__group-list" value="${this.escapeAttr(fav.group || "")}" />
    <datalist id="sw__group-list">${groupNames.map((name) => `<option value="${this.escapeAttr(name)}"></option>`).join("")}</datalist>
    <div class="fn__hr"></div>
    <div class="b3-label__text">${this.i18n.groupTip}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text sw__group-confirm">${this.i18n.confirm}</button>
</div>`,
            width: "420px",
        });
        const input = dialog.element.querySelector<HTMLInputElement>(".sw__group-input");
        const confirm = () => {
            this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, input.value), panel, onPick, onChanged);
            dialog.destroy();
        };
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                confirm();
            }
        });
        dialog.element.querySelector(".sw__group-confirm")?.addEventListener("click", confirm);
        dialog.element.querySelector(".b3-button--cancel")?.addEventListener("click", () => dialog.destroy());
        input.focus();
        input.select();
    }

    // 收藏条目的可跳转 rootId：优先取 rootId 字段，缺失时回退 key；两者都必须是
    // 块 ID 格式——历史脏条目的 key 是一次性 tab.id（UUID），openTab 无法解析只会静默失败
    // 跳转到收藏项：页签已开则切换过去；页签已关闭则按 rootId 重开。
    // 收藏项永久留存（直到用户主动删除）：无法定位文档的历史脏条目仅提示、不自动清理，
    // 用户打开对应页签后星标操作会自动将其迁移修复
    private async jumpToFavorite(favorite: IFavoriteItem, onClose: IOverlayClose) {
        // 鎵嬫満绔?getAllTabs() 鎭仴涓虹┖锛岄渶鐢?MobileTabs 鏁版嵁婧?
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const tab = opened.find((item) => this.pinKeyOf(item) === favorite.key);
        if (tab) {
            this.activateTab(tab, onClose);
            return;
        }
        // T-6806：跳转离开前记录当前现场（后退栈）
        this.captureJumpOrigin();
        const rootId = resolveFavoriteRootId(favorite);
        if (!rootId) {
            showMessage(this.i18n.favInvalidEntry);
            return;
        }
        onClose();
        if (this.isMobile) {
            // openTab 在手机端是空实现，走 MobileTabs.open
            const ok = await this.mobileOpenDoc(rootId);
            if (!ok) {
                showMessage(this.i18n.openDocFailed);
            }
        } else {
            const opened = await openDocumentOnDesktop({
                rootId,
                app: this.app,
                openTab,
                logger,
            });
            if (!opened) showMessage(this.i18n.openDocFailed);
        }
    }

    // 一键开启组内全部页签：打开未打开的收藏（rootId 校验与 jumpToFavorite 一致，
    // 鏃犳晥鍘嗗彶鏉＄洰璺宠繃锛夛紝杩斿洖瀹為檯鎵撳紑鏁?
    private async openGroupTabs(items: IFavoriteItem[]): Promise<number> {
        if (this.groupOperationBusy) {
            showMessage(this.i18n.groupTabsInProgress);
            return 0;
        }
        this.groupOperationBusy = true;
        try {
            return await this.openGroupTabsInternal(items);
        } finally {
            this.groupOperationBusy = false;
        }
    }

    private async openGroupTabsInternal(items: IFavoriteItem[]): Promise<number> {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const openedKeys = new Set(opened.map((tab) => this.pinKeyOf(tab)));
        const plan = planGroupOpenFavorites(items, openedKeys, resolveFavoriteRootId);
        let failed = plan.invalid;
        const attempted: string[] = [];
        for (const {favorite: fav, rootId} of plan.targets) {
            if (this.isMobile) {
                // openTab 在手机端是空实现，串行等待 mobileOpenDoc 完成，避免并发丢调用；
                // 按返回结果计数（文档已删除等失败不计入，不虚报提示）
                if (!(await this.mobileOpenDoc(rootId))) {
                    failed++;
                    continue;
                }
            } else {
                try {
                    await openTab({
                        app: this.app,
                        doc: {id: rootId},
                    });
                } catch (e) {
                    logger.warn("desktop open tab fail", e);
                    failed++;
                    continue;
                }
                // 桌面端连续 openTab 时稍作等待，让思源完成页签创建与状态更新
                await this.sleep(TAB_SETTLE_MS);
            }
            attempted.push(rootId);
            openedKeys.add(rootId);
            openedKeys.add(fav.key);
        }
        const verified = await this.waitForTabStates(attempted, true);
        const count = verified.size;
        failed += attempted.length - count;
        if (count > 0) {
            const message = failed > 0
                ? this.i18n.groupTabsOpenedPartial.replace("{x}", String(count)).replace("{y}", String(failed))
                : this.i18n.groupTabsOpened.replace("{x}", String(count));
            showMessage(message, MESSAGE_DEFAULT_MS, failed > 0 ? "error" : "info");
        } else if (failed > 0) {
            showMessage(this.i18n.groupTabsPartial.replace("{x}", String(failed)), MESSAGE_DEFAULT_MS, "error");
        } else {
            showMessage(this.i18n.groupTabsNoChanges);
        }
        return count;
    }

    // 一键关闭组内已打开的页签：按 pinKey 匹配当前打开页签，返回实际关闭数
    private async closeGroupTabs(items: IFavoriteItem[]): Promise<number> {
        if (this.groupOperationBusy) {
            showMessage(this.i18n.groupTabsInProgress);
            return 0;
        }
        this.groupOperationBusy = true;
        try {
            return await this.closeGroupTabsInternal(items);
        } finally {
            this.groupOperationBusy = false;
        }
    }

    private async closeGroupTabsInternal(items: IFavoriteItem[]): Promise<number> {
        const keys = new Set(items.map((fav) => resolveFavoriteRootId(fav)).filter(Boolean));
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const targets = opened.filter((tab) => keys.has(this.pinKeyOf(tab)));
        let failed = 0;
        const attempted: string[] = [];
        for (const tab of targets) {
            // 仅统计真正关闭成功的页签，失败不计入提示数
            const rootId = this.rootIdOf(tab);
            if (rootId && await this.closeTabQuietly(tab)) {
                attempted.push(tab.id);
            } else {
                failed++;
            }
        }
        const verified = await this.waitForTabStates(attempted, false, true);
        const closed = verified.size;
        failed += attempted.length - closed;
        if (closed > 0) {
            const message = failed > 0
                ? this.i18n.groupTabsClosedPartial.replace("{x}", String(closed)).replace("{y}", String(failed))
                : this.i18n.groupTabsClosed.replace("{x}", String(closed));
            showMessage(message, MESSAGE_DEFAULT_MS, failed > 0 ? "error" : "info");
        } else if (failed > 0) {
            showMessage(this.i18n.groupTabsPartial.replace("{x}", String(failed)), MESSAGE_DEFAULT_MS, "error");
        } else {
            showMessage(this.i18n.groupTabsNoChanges);
        }
        return closed;
    }

    // 排序领域逻辑位于 util.js；这里仅注入宿主 Tab 适配器，避免 UI 层持有排序细节。
    private sortItems(items: IGroupedTab[], sortBy: SortBy, mru: string[], updatedMap: {[rootId: string]: string}) {
        return sortItemsUtil(items, sortBy, mru, {
            titleOf: (item) => this.titleOf(item.tab),
            rootIdOf: (item) => this.rootIdOf(item.tab) || "",
            pinKeyOf: (item) => this.pinKeyOf(item.tab),
            updatedMap,
        });
    }

    // 按窗口分组并渲染全部页签
    // onOverlayClose：激活页签/打开文档后的收尾（弹窗销毁；侧边栏刷新）
    // onTabsChanged：关闭页签后的收尾（弹窗保持打开；侧边栏刷新）
    private renderList(scrollElement: HTMLElement, tabs: Tab[], activeTab: Tab | undefined,
                       opts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
                       sortBy: SortBy, updatedMap: {[rootId: string]: string} = {}) {
        // 清空前收集旧卡片：排序切换/列表刷新时同页签卡片直接复用（移动 DOM 而非重建），
        // 已渲染的缩略图原样保留，重排瞬时完成
        const reusable = new Map<string, HTMLElement>();
        scrollElement.querySelectorAll<HTMLElement>(".sw__card").forEach((card) => {
            if (card.dataset.tabId) {
                reusable.set(card.dataset.tabId, card);
            }
        });
        scrollElement.innerHTML = "";
        const settings = this.getSettings();
        scrollElement.style.setProperty("--sw-thumb-height", `${settings.thumbHeight}px`);
        this.groupFlowObserver?.disconnect();
        this.groupFlowObserver = null;

        const activeTabId = activeTab?.id;
        const mru = this.getMru();
        const pinned = new Set(this.getPinned());
        const favorites = new Set(this.getFavorites().map((item) => item.key));

        const ctx: ITabGroupRenderCtx = {reusable, activeTabId, pinned, favorites, mru, settings, opts};

        const all: IGroupedTab[] = [];
        const focusState: {defaultFocusIndex: number} = {defaultFocusIndex: 0};
        const groupMode = settings.groupBy;
        if (groupMode === "none") {
            // 鎸?parent锛圵nd锛夊垎鏍忓垎缁勶紝淇濇寔 getAllTabs 鐨勫竷灞€鏍戦『搴?
            const groups = buildTabGroupsByParent(tabs, scrollElement);
            groups.forEach((group) => {
                const ordered = this.sortGroupItems(group, sortBy, mru, pinned, updatedMap);
                this.renderTabGroup(scrollElement, ordered, ctx, all, focusState);
            });
        } else {
            this.renderGroupedList(scrollElement, tabs, activeTab, groupMode, ctx, all, focusState, opts, sortBy, updatedMap);
        }

        if (all.length === 0) {
            scrollElement.appendChild(this.buildEmptyState());
            return;
        }

        // 初始焦点
        this.focusCard(all[focusState.defaultFocusIndex]?.card);

        // 视口懒渲染缩略图：复用卡片跳过，新卡片滚入可视区时才生成
        this.renderThumbnails(all, scrollElement, THUMB_BATCH);
    }

    // 单一分组排序：置顶页签固定在前，其余按 sortBy 排列（restItems 内部 sort 走 stable 排序）
    private sortGroupItems(
        group: IGroupedTab[],
        sortBy: SortBy,
        mru: string[],
        pinned: Set<string>,
        updatedMap: {[rootId: string]: string},
    ): IGroupedTab[] {
        return sortGroupItemsUtil(group, sortBy, mru, pinned, updatedMap, {
            titleOf: (item) => this.titleOf(item.tab),
            rootIdOf: (item) => this.rootIdOf(item.tab) || "",
            pinKeyOf: (item) => this.pinKeyOf(item.tab),
        });
    }

    // 渲染单一分组：label + grid + 各卡片；卡片获取委托 acquireGroupCard；累积 defaultFocusIndex
    private renderTabGroup(
        scrollElement: HTMLElement,
        ordered: IGroupedTab[],
        ctx: ITabGroupRenderCtx,
        all: IGroupedTab[],
        focusState: {defaultFocusIndex: number},
    ) {
        const groupEl = document.createElement("div");
        groupEl.className = "sw__group";
        const label = document.createElement("div");
        label.className = "sw__window-label";
        label.textContent = `${this.i18n.currentWindow} 路 ${ordered.length}`;
        groupEl.appendChild(label);

        const grid = this.buildTabGroupGrid(scrollElement, ordered.length, ctx.settings);

        ordered.forEach((item) => {
            const card = this.acquireGroupCard(item, ctx, false);
            grid.appendChild(card);
            item.card = card;
            all.push(item);
            // 默认聚焦 MRU 里最近使用的（非当前活动）页签，更贴近 win+tab 体验
            // MRU 按 pinKey（文档页签为 rootID）记录，需同键匹配
            if (item.tab.id !== ctx.activeTabId && ctx.mru.indexOf(this.pinKeyOf(item.tab)) === 0) {
                focusState.defaultFocusIndex = all.length - 1;
            }
        });
        groupEl.appendChild(grid);
        scrollElement.appendChild(groupEl);
    }
    // ==================== 分类分组（笔记本/收藏/创建月份） ====================

    // 会话内折叠状态（键 = groupMode:groupKey）；跨会话记忆属设置页范畴，列表内保持轻量
    private groupCollapseState = new Set<string>();
    private createdByIdCache: {[rootId: string]: string} = {};
    private notebookListCache: Array<{id: string; name: string}> | null = null;
    // T-6475：rootId → 真实笔记本 ID 缓存。resolveSearchNotebookId 的路径回退会把
    // 文档路径首段（根文档 ID）误当作笔记本 ID，产生"未知笔记本"幻影组；本缓存由
    // 一次有界 SQL（blocks.box）异步富化，纠正这些页签的分组归属。
    private rootNotebookCache: {[rootId: string]: string} = {};

    private groupFlowObserver: ResizeObserver | null = null;
    private homeRefreshTimer = 0;
    private sidebarRefreshTimer = 0;
    private groupFlowLastWidth = 0;

    // 分组流式布局度量：用标准网格自己的公式反推列数与 1fr 实际像素宽，
    // 保证组块内卡片与不分组时逐像素一致；显式列数设置优先
    private computeGroupFlowLayout(scrollElement: HTMLElement, settings: ISwSettings): {cols: number; cellWidth: number} {
        const cs = window.getComputedStyle(scrollElement);
        const contentWidth = Math.max(0, scrollElement.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0"));
        const gap = GROUP_FLOW_GAP_PX;
        const minCard = GROUP_FLOW_MIN_CARD_PX;
        let cols = 1;
        if (!scrollElement.closest(".sw--sidebar") && settings.columns >= 2) {
            cols = settings.columns;
        } else {
            cols = Math.max(1, Math.floor((contentWidth + gap) / (minCard + gap)));
        }
        const cellWidth = (contentWidth - (cols - 1) * gap) / cols;
        return {cols: Math.max(1, cols), cellWidth: Math.max(0, cellWidth)};
    }

    // 容器宽度变化时才重排（rAF 去抖）；不重建数据，仅走既有整列表刷新链路
    private watchGroupFlowResize(
        scrollElement: HTMLElement,
        tabs: Tab[],
        activeTab: Tab | undefined,
        groupMode: TabGroupMode,
        listOpts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
        sortBy: SortBy,
        updatedMap: {[rootId: string]: string},
    ) {
        this.groupFlowObserver?.disconnect();
        this.groupFlowObserver = null;
        this.groupFlowLastWidth = scrollElement.clientWidth;
        if (typeof ResizeObserver !== "function") return;
        let frame = 0;
        const observer = new ResizeObserver(() => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                frame = 0;
                if (!scrollElement.isConnected) return;
                const width = scrollElement.clientWidth;
                if (width === this.groupFlowLastWidth) return;
                this.groupFlowLastWidth = width;
                this.renderList(scrollElement, tabs, activeTab, listOpts, sortBy, updatedMap);
            });
        });
        observer.observe(scrollElement);
        this.groupFlowObserver = observer;
    }

    // 分组渲染主路径：解析分组上下文（收藏分组/笔记本/创建时间）→ groupTabsByMode →
    // 稀疏组流式布局（组块宽度=内容卡片数，上限满宽）；异步数据（创建时间/笔记本名）
    // 就绪后若有关键新数据则重排一次
    private renderGroupedList(
        scrollElement: HTMLElement,
        tabs: Tab[],
        activeTab: Tab | undefined,
        groupMode: TabGroupMode,
        ctx: ITabGroupRenderCtx,
        all: IGroupedTab[],
        focusState: {defaultFocusIndex: number},
        listOpts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
        sortBy: SortBy,
        updatedMap: {[rootId: string]: string},
    ) {
        const favoriteGroupByKey = new Map<string, string>();
        this.getFavorites().forEach((fav) => favoriteGroupByKey.set(fav.key, fav.group || ""));
        const notebookMap = new Map((this.notebookListCache || []).map((nb) => [nb.id, nb.name]));
        const notebookOrder = (this.notebookListCache || []).map((nb) => nb.id);
        const rootIdOf = (tab: Tab) => this.rootIdOf(tab) || "";
        const defs = groupTabsByMode(tabs, groupMode, {
            pinKeyOf: (tab: Tab) => this.pinKeyOf(tab),
            isFavorite: (key: string) => ctx.favorites.has(key),
            favoriteGroupOf: (key: string) => favoriteGroupByKey.get(key) || "",
            favoriteGroupOrder: this.getFavGroupRegistry(),
            notebookIdOf: (tab: Tab) => {
                const resolved = resolveSearchNotebookId(tab as unknown) || "";
                // T-6475：路径回退会产出幻影笔记本 ID（思源文档路径首段是根文档 ID 而
                // 非笔记本 ID，真机实证 id≠box）。凡不在真实笔记本清单里的结果，用
                // rootId→box 缓存纠正（异步富化按需填充）。
                if (!notebookMap.has(resolved)) {
                    const fromRoot = this.rootNotebookCache[rootIdOf(tab)];
                    if (fromRoot) return fromRoot;
                }
                return resolved;
            },
            pathOf: (tab: Tab) => (tab as unknown as {path?: string; hPath?: string}).path
                || (tab as unknown as {hPath?: string}).hPath || "",
            notebookNameOf: (id: string) => {
                const fromCache = notebookMap.get(id) || "";
                if (fromCache) return fromCache;
                // T-6473 分组识别修复：笔记本缓存缺失（未就绪/已关闭/旧数据残留的 ID）时，
                // 从该组页签自带的笔记本名元数据恢复，避免组标签退化成裸 ID
                for (const tab of tabs) {
                    if (resolveSearchNotebookId(tab as unknown) !== id) continue;
                    const t = tab as unknown as {notebookName?: string; notebook?: string; boxName?: string};
                    const name = t.notebookName || t.notebook || t.boxName || "";
                    if (name) return String(name).trim();
                }
                return "";
            },
            notebookOrder,
            createdOf: (key: string) => this.createdByIdCache[key] || "",
            labels: {
                unknownNotebook: this.i18n.groupUnknownNotebook,
                ungroupedFavorite: this.i18n.groupUngroupedFavorite,
                unfavorited: this.i18n.groupUnfavorited,
                unknownMonth: this.i18n.groupUnknownMonth,
                rootPath: this.i18n.groupRootPath,
            },
        });
        defs.forEach((def) => {
            const ordered = this.sortGroupItems(def.items.map((tab: Tab) => ({tab})), sortBy, ctx.mru, ctx.pinned, updatedMap);
            this.renderNamedTabGroup(scrollElement, def, ordered, ctx, all, focusState);
        });
        if (groupMode === "createdMonth") {
            const missing = tabs.some((tab) => {
                const rootId = rootIdOf(tab);
                return !!rootId && !(rootId in this.createdByIdCache);
            });
            if (missing) {
                void this.loadUpdatedMap(tabs).then(() => {
                    // 请求过的 rootId 无论查到与否都落键（未命中记 ""），保证只重排一次不循环
                    tabs.forEach((tab) => {
                        const rootId = rootIdOf(tab);
                        if (rootId && !(rootId in this.createdByIdCache)) this.createdByIdCache[rootId] = "";
                    });
                    if (!scrollElement.isConnected) return;
                    this.renderList(scrollElement, tabs, activeTab, listOpts, sortBy, updatedMap);
                });
            }
        } else if (groupMode === "notebook" && this.notebookListCache === null) {
            void this.loadNotebooks().then((notebooks) => {
                this.notebookListCache = notebooks;
                if (!scrollElement.isConnected || notebooks.length === 0) return;
                this.renderList(scrollElement, tabs, activeTab, listOpts, sortBy, updatedMap);
            });
        }
        // T-6475：笔记本分组富化——路径回退产生的幻影笔记本 ID（或完全缺失）在真实
        // 笔记本清单就绪后，用一次有界 SQL（blocks.box）按 rootId 恢复真实归属并重排；
        // 请求过的 rootId 无论查到与否都落键，保证只富化一次不循环。
        if (groupMode === "notebook") {
            const notebookReady = this.notebookListCache !== null
                ? Promise.resolve(this.notebookListCache as Array<{id: string; name: string}>)
                : this.loadNotebooks().then((notebooks) => {
                    this.notebookListCache = notebooks;
                    return notebooks;
                });
            void notebookReady.then((notebooks) => {
                if (!scrollElement.isConnected || notebooks.length === 0) return;
                const known = new Set(notebooks.map((nb) => nb.id));
                const unknownRoots: string[] = [];
                for (const tab of tabs) {
                    const rootId = rootIdOf(tab);
                    if (!rootId || rootId in this.rootNotebookCache) continue;
                    const resolved = resolveSearchNotebookId(tab as unknown) || "";
                    if (resolved && known.has(resolved)) continue;
                    unknownRoots.push(rootId);
                }
                const enrich = unknownRoots.length > 0
                    ? this.loadRootNotebookMap(unknownRoots).then(() => {
                        tabs.forEach((tab) => {
                            const rootId = rootIdOf(tab);
                            if (rootId && !(rootId in this.rootNotebookCache)) this.rootNotebookCache[rootId] = "";
                        });
                    })
                    : null;
                if (!enrich) return;
                void enrich.then(() => {
                    if (!scrollElement.isConnected) return;
                    this.renderList(scrollElement, tabs, activeTab, listOpts, sortBy, updatedMap);
                });
            });
        }
    }

    // T-6475：按 rootId 批量恢复真实笔记本 ID（blocks.box），有界 32 个/请求；
    // 非法 ID 过滤，响应字段校验后落缓存。
    private async loadRootNotebookMap(rootIds: string[]) {
        const valid = rootIds.filter((id) => BLOCK_ID_RE.test(id)).slice(0, 32);
        if (valid.length === 0) return;
        const list = valid.map((id) => `'${id}'`).join(",");
        const json = await this.fetchKernelJson("/api/query/sql", {
            stmt: `SELECT id, box FROM blocks WHERE type='d' AND id IN (${list}) LIMIT 64`,
        });
        const rows = Array.isArray(json?.data) ? json.data : [];
        rows.forEach((row: {id?: unknown; box?: unknown}) => {
            const id = typeof row?.id === "string" ? row.id : "";
            const box = typeof row?.box === "string" ? row.box : "";
            if (id && BLOCK_ID_RE.test(id)) this.rootNotebookCache[id] = BLOCK_ID_RE.test(box) ? box : "";
        });
    }

    // 命名分组块：可折叠组头（图标+名称+计数）+ 内容网格；块宽 = span 列（上限满宽），
    // 多个组块在 .sw--grouped-flow 下横向流动换行，小分组不再各占一整排
    private renderNamedTabGroup(
        scrollElement: HTMLElement,
        def: {key: string; label: string; icon: string; items: Tab[]},
        ordered: IGroupedTab[],
        ctx: ITabGroupRenderCtx,
        all: IGroupedTab[],
        focusState: {defaultFocusIndex: number},
        span = 0,
        cellWidth = 0,
    ) {
        const collapsed = this.groupCollapseState.has(def.key);
        const groupEl = document.createElement("div");
        groupEl.className = "sw__group sw__group--named" + (collapsed ? " sw__group--collapsed" : "");
        const header = document.createElement("button");
        header.type = "button";
        header.className = "sw__group-header";
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
        header.innerHTML = '<svg class="sw__group-chevron"><use xlink:href="#' + (collapsed ? "iconRight" : "iconDown") + '"></use></svg>'
            + '<svg class="sw__group-icon"><use xlink:href="#' + (def.icon || "iconFile") + '"></use></svg>'
            + '<span class="sw__group-title"></span>'
            + '<span class="sw__group-count">' + ordered.length + '</span>';
        header.querySelector<HTMLElement>(".sw__group-title")!.textContent = def.label;
        header.setAttribute("aria-label", def.label + " (" + ordered.length + ")");
        header.addEventListener("click", () => {
            const nextCollapsed = !this.groupCollapseState.has(def.key);
            if (nextCollapsed) {
                this.groupCollapseState.add(def.key);
            } else {
                this.groupCollapseState.delete(def.key);
            }
            groupEl.classList.toggle("sw__group--collapsed", nextCollapsed);
            header.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
            header.querySelector<SVGUseElement>(".sw__group-chevron use")?.setAttribute("xlink:href", "#" + (nextCollapsed ? "iconRight" : "iconDown"));
        });
        groupEl.appendChild(header);

        const grid = this.buildTabGroupGrid(scrollElement, ordered.length, ctx.settings);
        if (span > 0 && cellWidth > 0) {
            // 组块宽度 = span 张标准卡片 + 块间距；内部 repeat(span, 1fr) 在确定宽度下每列
            // 恰好等于标准网格的 1fr 宽——卡片尺寸与不分组时逐像素一致
            groupEl.style.width = `${Math.round(span * cellWidth + (span - 1) * GROUP_FLOW_GAP_PX)}px`;
            grid.style.gridTemplateColumns = `repeat(${span}, 1fr)`;
        }
        ordered.forEach((item) => {
            const card = this.acquireGroupCard(item, ctx, false);
            grid.appendChild(card);
            item.card = card;
            all.push(item);
            if (item.tab.id !== ctx.activeTabId && ctx.mru.indexOf(this.pinKeyOf(item.tab)) === 0) {
                focusState.defaultFocusIndex = all.length - 1;
            }
        });
        groupEl.appendChild(grid);
        scrollElement.appendChild(groupEl);
    }



    // 取得分组内单张卡片：优先复用旧卡片（同步状态类/图标/标题，缩略图不动，事件沿旧闭包），否则新建；
    // 双端分组渲染共用（renderTabGroup/renderMobileCardsInGroup），手机端追加 sw__mobile-card 修饰类
    private acquireGroupCard(item: IGroupedTab, ctx: ITabGroupRenderCtx, mobile: boolean): HTMLElement {
        const isPinned = ctx.pinned.has(this.pinKeyOf(item.tab));
        const isFaved = ctx.favorites.has(this.pinKeyOf(item.tab));
        let card = ctx.reusable.get(item.tab.id);
        if (card) {
            this.syncCardState(card, item.tab, item.tab.id === ctx.activeTabId, isPinned, isFaved);
            ctx.reusable.delete(item.tab.id);
        } else {
            card = this.createCard(item, item.tab.id === ctx.activeTabId, isPinned, isFaved, {
                onActivate: (tab) => this.activateTab(tab, ctx.opts.onOverlayClose),
                onTogglePin: (tab, cardEl) => this.handleTogglePin(tab, cardEl),
                onToggleFav: (tab, cardEl) => this.handleToggleFav(tab, cardEl),
                onCloseTab: (tab, cardEl) => this.handleCloseTab(tab, cardEl, ctx.opts.onTabsChanged),
            });
        }
        if (mobile) {
            card.classList.add("sw__mobile-card");
        }
        return card;
    }

    // 构造分组卡片网格；侧边栏由专用设置 sidebarLayout 控制列数（CSS 自动响应宽度），弹窗仍用全局 columns
    private buildTabGroupGrid(scrollElement: HTMLElement, count: number, settings: ISwSettings): HTMLElement {
        const grid = document.createElement("div");
        grid.className = "sw__grid";
        const isSidebar = !!scrollElement.closest(".sw--sidebar");
        if (!isSidebar && settings.columns >= 2) {
            grid.style.gridTemplateColumns = `repeat(${settings.columns}, 1fr)`;
        }
        return grid;
    }

    // 复用旧卡片时同步状态：置顶/收藏/激活类名与图标、标题文本
    private syncCardState(card: HTMLElement, tab: Tab, isActive: boolean, isPinned: boolean, isFaved: boolean) {
        this.cardTabs.set(card, tab);
        // Keep surface-specific modifiers when a card is reused during a
        // mobile list refresh.  `renderMobileList` deliberately reuses DOM
        // nodes to preserve thumbnails, but resetting className below used
        // to drop `sw__mobile-card`, making refreshed cards fall back to the
        // desktop layout until the next full dialog rebuild.
        const isMobileCard = card.classList.contains("sw__mobile-card");
        const previousRootId = card.dataset.rootId || "";
        const rootId = this.rootIdOf(tab) || "";
        card.className = "sw__card"
            + (isActive ? " sw__active" : "")
            + (isPinned ? " sw__pinned" : "")
            + (isFaved ? " sw__faved" : "");
        if (isMobileCard) {
            card.classList.add("sw__mobile-card");
        }
        const title = this.titleOf(tab);
        card.dataset.title = title;
        card.dataset.rootId = rootId;
        card.dataset.notebookId = resolveSearchNotebookId(tab as unknown);
        card.dataset.searchPath = buildOpenedDocumentScope(tab as unknown)?.path || "";
        card.querySelector<HTMLElement>(".sw__title")!.textContent = title;
        const icon = card.querySelector<HTMLElement>(".sw__icon");
        if (icon) {
            icon.replaceWith(this.buildCardIcon(tab));
        }
        if (previousRootId !== rootId) {
            card.querySelector<HTMLElement>(".sw__thumb")?.replaceWith(this.buildCardThumb());
        }
        const iconUse = card.querySelector<SVGElement>(".sw__pin use");
        if (iconUse) {
            iconUse.setAttribute("xlink:href", isPinned ? "#iconPin" : "#iconUnpin");
        }
        const pinButton = card.querySelector<HTMLElement>(".sw__pin");
        const pinLabel = isPinned ? this.i18n.unpinTab : this.i18n.pinTab;
        pinButton?.setAttribute("aria-label", pinLabel);
        pinButton?.setAttribute("title", pinLabel);
        const favButton = card.querySelector<HTMLElement>(".sw__fav-btn");
        const favLabel = isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab;
        favButton?.setAttribute("aria-label", favLabel);
        favButton?.setAttribute("title", favLabel);
    }

    // 空态：主文案 + 引导副文案（提示可搜索全库文档）
    private buildEmptyState(): HTMLElement {
        const empty = document.createElement("div");
        empty.className = "sw__empty";
        empty.setAttribute("role", "status");
        empty.setAttribute("aria-live", "polite");
        empty.innerHTML = `<div class="sw__empty-title"></div><div class="sw__empty-sub"></div>`;
        empty.querySelector(".sw__empty-title")!.textContent = this.i18n.noOpenedTabs;
        empty.querySelector(".sw__empty-sub")!.textContent = this.i18n.emptyHint;
        return empty;
    }

    // 置顶/取消置顶：更新状态、图标与提示文案，并调整卡片位置（置顶移动到本组最前）
    private handleTogglePin(tab: Tab, card: HTMLElement) {
        const isPinned = this.togglePinned(tab);
        const iconUse = card.querySelector<SVGElement>(".sw__pin use");
        if (iconUse) {
            iconUse.setAttribute("xlink:href", isPinned ? "#iconPin" : "#iconUnpin");
        }
        const pinButton = card.querySelector<HTMLElement>(".sw__pin");
        const pinLabel = isPinned ? this.i18n.unpinTab : this.i18n.pinTab;
        pinButton?.setAttribute("aria-label", pinLabel);
        pinButton?.setAttribute("title", pinLabel);
        card.classList.toggle("sw__pinned", isPinned);
        if (isPinned) {
            card.parentElement?.prepend(card);
            this.focusCard(card);
        }
    }

    // 收藏/取消收藏（右键菜单入口）：更新卡片标识与提示文案，并刷新顶栏收藏下拉
    private handleToggleFav(tab: Tab, card: HTMLElement) {
        this.toggleFavorite(tab);
        this.refreshCardFavState(tab, card);
        this.refreshFavSelects();
    }

    // 按双端适配关闭单个页签（仅关闭动作本身，不含卡片移除/列表刷新等收尾）；
    // 返回是否真正关闭成功，供批量关闭准确计数
    private async closeTabQuietly(tab: Tab): Promise<boolean> {
        if (this.isMobile) {
            // 手机端：MobileTabs.close 关闭页签；必须保持宿主对象调用（裸调用丢 this），
            // await 返回值以便批量关闭时串行等待，完成后给状态一小段沉降时间
            try {
                const tabs = getSiyuan()?.mobile?.tabs;
                if (typeof tabs?.close !== "function") {
                    return false;
                }
                const result = await tabs.close(tab.id);
                if (!isSuccessfulMobileTabsResult(result)) {
                    logger.warn("mobile close tab non-success result", result);
                }
                await this.sleep(TAB_SETTLE_MS);
                return isSuccessfulMobileTabsResult(result);
            } catch (e) {
                logger.warn("mobile close tab fail", e);
                return false;
            }
        }
        try {
            tab.parent.removeTab(tab.id);
            // 杩炵画 removeTab 鏃剁粰鎬濇簮 DOM/鐘舵€佷竴甯ф矇闄嶆椂闂达紝闄嶄綆婕忓叧姒傜巼
            await this.sleep(TAB_SETTLE_MS);
            return true;
        } catch (e) {
            logger.warn("close tab fail", e);
            return false;
        }
    }

    // 在统一时间窗内核对整组结果，避免逐项等待导致批量操作随页签数线性变慢。
private async waitForTabStates(ids: string[], shouldBeOpen: boolean, matchTabId = false): Promise<Set<string>> {
        const pending = new Set(ids);
        const verified = new Set<string>();
        if (pending.size === 0) {
            return verified;
        }
        const deadline = Date.now() + TAB_VERIFY_TIMEOUT_MS;
        do {
            const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
            const opened = new Set(tabs.map((tab) => matchTabId ? tab.id : this.pinKeyOf(tab)));
            pending.forEach((id) => {
                if (opened.has(id) === shouldBeOpen) {
                    verified.add(id);
                    pending.delete(id);
                }
            });
            if (pending.size === 0) {
                return verified;
            }
            await this.sleep(TAB_SETTLE_MS);
        } while (Date.now() < deadline);
        return verified;
    }

    // 小驴工具：批量开/关页签时避免竞态
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    // 关闭页签：移除页签与卡片；侧边栏模式下整列表刷新（弹窗保持打开）
    private async handleCloseTab(tab: Tab, card: HTMLElement, onTabsChanged: IOverlayClose) {
        // 等待页签真正关闭后再移除卡片，保证 onTabsChanged（侧边栏刷新）触发时读到最新列表
        const closed = await this.closeTabQuietly(tab);
        if (!closed) {
            showMessage(this.i18n.closeTabFailed, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        // 先取引用再移除卡片（remove 后 closest 返回 null）
        const group = card.closest(".sw__group");
        const scroll = card.closest(".sw__scroll");
        card.remove();
        // 同步所在分组：更新计数，组内清空则移除分组容器（弹窗模式不整列表重建）
        if (group) {
            const count = group.querySelectorAll(".sw__card").length;
            if (count === 0) {
                group.remove();
            } else {
                const label = group.querySelector<HTMLElement>(".sw__window-label");
                if (label) {
                    label.textContent = `${this.i18n.currentWindow} 路 ${count}`;
                }
            }
        }
        // 全部页签关闭后展示空态（弹窗保持打开，用户可搜索全库文档打开新的）
        if (scroll && scroll.querySelectorAll(".sw__card").length === 0 && !scroll.querySelector(".sw__doc-results")) {
            scroll.appendChild(this.buildEmptyState());
        }
        onTabsChanged();
    }

    // 构建一张页签卡片（缩略图区域 + 底部信息 + 置顶/收藏/关闭按钮 + 右键菜单）
    private createCard(item: IGroupedTab, isActive: boolean, isPinned: boolean, isFaved: boolean,
                       handlers: {
                           onActivate: (tab: Tab) => void,
                           onTogglePin: (tab: Tab, card: HTMLElement) => void,
                           onToggleFav: (tab: Tab, card: HTMLElement) => void,
                           onCloseTab: (tab: Tab, card: HTMLElement) => void,
                       }): HTMLElement {
        const tab = item.tab;
        const card = document.createElement("div");
        this.cardTabs.set(card, tab);
        card.className = "sw__card"
            + (isActive ? " sw__active" : "")
            + (isPinned ? " sw__pinned" : "")
            + (isFaved ? " sw__faved" : "");
        card.dataset.tabId = tab.id;
        card.dataset.title = this.titleOf(tab);
        card.dataset.rootId = this.rootIdOf(tab) || "";
        card.dataset.notebookId = resolveSearchNotebookId(tab as unknown);
        card.dataset.searchPath = buildOpenedDocumentScope(tab as unknown)?.path || "";

        card.appendChild(this.buildCardThumb());
        card.appendChild(this.buildCardMeta(tab));
        card.appendChild(this.buildCardActions(tab, card, isPinned, isFaved, handlers));
        item.card = card;

        // 桌面右键 / 手机长按：均弹同一操作菜单（pin / fav / 分组 / close）
        card.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openCardMenu(this.cardTabs.get(card) || tab, card, handlers, event.clientX, event.clientY);
        });
        this.cardMenuHandlers.set(card, handlers);
        if (this.isMobile) {
            this.bindCardLongPress(card, tab, handlers);
        }

        // 点击整卡切换到该页签；mouseenter 用于键盘导航的悬浮聚焦
        card.addEventListener("click", () => handlers.onActivate(this.cardTabs.get(card) || tab));
        card.addEventListener("mouseenter", () => this.focusCard(card));
        return card;
    }

    // 缩略图占位（内容由 renderThumbnails 分批填入）
    private buildCardThumb(): HTMLElement {
        const thumb = document.createElement("div");
        thumb.className = "sw__thumb";
        const loading = document.createElement("div");
        loading.className = "sw__thumb-loading";
        loading.setAttribute("role", "status");
        loading.setAttribute("aria-live", "polite");
        loading.innerHTML = `<svg class="sw__spin"><use xlink:href="#iconRefresh"></use></svg><span>${this.i18n.loadingThumbnail}</span>`;
        thumb.appendChild(loading);
        return thumb;
    }

    // 底部：图标 + 标题；图标复用页签头已渲染好的内容，保证与真实页签一致
    private buildCardMeta(tab: Tab): HTMLElement {
        const meta = document.createElement("div");
        meta.className = "sw__meta";
        meta.appendChild(this.buildCardIcon(tab));
        const titleEl = document.createElement("span");
        titleEl.className = "sw__title";
        titleEl.textContent = this.titleOf(tab);
        meta.appendChild(titleEl);
        return meta;
    }

    // 卡片图标：思源 svg sprite > emoji 字符 > tab.icon 兜底
    private buildCardIcon(tab: Tab): HTMLElement {
        const iconBox = document.createElement("span");
        iconBox.className = "sw__icon";
        const graphic = tab.headElement?.querySelector<SVGElement>(".item__graphic use");
        const emoji = tab.headElement?.querySelector(".item__icon");
        if (graphic) {
            const href = graphic.getAttribute("xlink:href");
            iconBox.innerHTML = href ? `<svg aria-hidden="true"><use xlink:href="${href}"></use></svg>` : "";
        } else if (emoji) {
            iconBox.textContent = emoji.textContent || "";
            iconBox.classList.add("sw__icon-emoji");
        } else {
            // 兜底：思源图标名走 svg use；emoji 字符（手机端文档自定义图标）按文本渲染
            const fallback = resolveIconFallback(tab.icon || "");
            if (fallback.type === "emoji") {
                iconBox.textContent = fallback.value;
                iconBox.classList.add("sw__icon-emoji");
            } else {
                iconBox.innerHTML = `<svg aria-hidden="true"><use xlink:href="#${fallback.value}"></use></svg>`;
            }
        }
        return iconBox;
    }

    // 角标按钮（置顶 + 收藏 + 关闭），统一返回 Fragment 便于一次性插入
    private buildCardActions(
        tab: Tab,
        card: HTMLElement,
        isPinned: boolean,
        isFaved: boolean,
        handlers: {
            onTogglePin: (tab: Tab, card: HTMLElement) => void,
            onToggleFav: (tab: Tab, card: HTMLElement) => void,
            onCloseTab: (tab: Tab, card: HTMLElement) => void,
        },
    ): DocumentFragment {
        const frag = document.createDocumentFragment();

        // 置顶按钮（左上角）：已置顶显示实心图钉，tooltip 提示当前可执行的操作
        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "sw__pin";
        pinBtn.setAttribute("aria-label", isPinned ? this.i18n.unpinTab : this.i18n.pinTab);
        pinBtn.title = isPinned ? this.i18n.unpinTab : this.i18n.pinTab;
        pinBtn.innerHTML = `<svg><use xlink:href="${isPinned ? "#iconPin" : "#iconUnpin"}"></use></svg>`;
        pinBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            handlers.onTogglePin(this.cardTabs.get(card) || tab, card);
        });
        frag.appendChild(pinBtn);

        // 收藏按钮（左上角，紧邻置顶）：未收藏空心星、已收藏实心星（CSS 变量 --b3-icon-star-fill 切换填充）
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "sw__fav-btn";
        favBtn.setAttribute("aria-label", isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab);
        favBtn.title = isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab;
        favBtn.innerHTML = '<svg><use xlink:href="#iconStar"></use></svg>';
        favBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            // 点击星标弹出分组菜单：收藏时可直接选分组/新建分组，已收藏时可切换分组或取消收藏
            this.openFavMenu(this.cardTabs.get(card) || tab, card, event);
        });
        frag.appendChild(favBtn);

        // 关闭按钮（右上角）
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "sw__close";
        closeBtn.setAttribute("aria-label", this.i18n.close);
        closeBtn.title = this.i18n.close;
        closeBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg>';
        closeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            handlers.onCloseTab(this.cardTabs.get(card) || tab, card);
        });
        frag.appendChild(closeBtn);

        return frag;
    }

    // 手机端长按（≈500ms）弹出与桌面右键一致的操作菜单；
    // 鎷︽埅 click 蹇呴』娉ㄥ唽鍦?activate 涔嬪墠锛堢洰鏍囪妭鐐规寜娉ㄥ唽椤哄簭瑙﹀彂锛?
    private bindCardLongPress(
        card: HTMLElement,
        tab: Tab,
        handlers: {
            onActivate: (tab: Tab) => void,
            onTogglePin: (tab: Tab, card: HTMLElement) => void,
            onToggleFav: (tab: Tab, card: HTMLElement) => void,
            onCloseTab: (tab: Tab, card: HTMLElement) => void,
        },
    ) {
        let timer: number | undefined;
        let longPressed = false;
        let menuX = 0;
        let menuY = 0;
        const start = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (touch) {
                menuX = touch.clientX;
                menuY = touch.clientY;
            }
            longPressed = false;
            timer = window.setTimeout(() => {
                longPressed = true;
                this.openCardMenu(this.cardTabs.get(card) || tab, card, handlers, menuX, menuY);
            }, 500);
        };
        const cancel = () => {
            if (timer !== undefined) {
                window.clearTimeout(timer);
                timer = undefined;
            }
        };
        const end = (event: TouchEvent) => {
            cancel();
            if (longPressed) {
                // 阻止长按结束后合成 click 触发页签切换
                event.preventDefault();
            }
        };
        card.addEventListener("click", (event) => {
            if (longPressed) {
                longPressed = false;
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        }, true);
        card.addEventListener("touchstart", start, {passive: true});
        card.addEventListener("touchmove", cancel, {passive: true});
        card.addEventListener("touchend", end, {passive: false});
        card.addEventListener("touchcancel", cancel);
    }

    // 卡片操作菜单（桌面右键 / 手机长按共用）：置顶 / 收藏 / 分组 / 关闭
    private openCardMenu(tab: Tab, card: HTMLElement,
                         handlers: {
                             onActivate: (tab: Tab) => void,
                             onTogglePin: (tab: Tab, card: HTMLElement) => void,
                             onToggleFav: (tab: Tab, card: HTMLElement) => void,
                             onCloseTab: (tab: Tab, card: HTMLElement) => void,
                         }, x: number, y: number) {
        const menu = new Menu("swCardMenu");
        const nowPinned = card.classList.contains("sw__pinned");
        const nowFaved = card.classList.contains("sw__faved");
        menu.addItem({
            label: nowPinned ? this.i18n.unpinTab : this.i18n.pinTab,
            icon: nowPinned ? "iconUnpin" : "iconPin",
            click: () => handlers.onTogglePin(tab, card),
        });
        menu.addItem({
            label: nowFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab,
            icon: "iconStar",
            click: () => handlers.onToggleFav(tab, card),
        });
        // 分组管理：已收藏时快速移动至分组（子菜单，当前分组勾选）+ 新建分组并移动；
        // 未收藏时收进收藏并选择分组
        if (nowFaved) {
            const key = this.pinKeyOf(tab);
            const favorite = this.getFavorites().find((item) => item.key === key);
            const moveSub = [{checked: !favorite?.group, label: this.escapeAttr(this.i18n.ungrouped),
                click: () => { this.setFavoriteGroup(key, ""); this.refreshCardFavState(tab, card); }}];
            this.getFavoriteGroupNames().forEach((name) => {
                moveSub.push({checked: favorite?.group === name, label: this.escapeAttr(name),
                    click: () => { this.setFavoriteGroup(key, name); this.refreshCardFavState(tab, card); }});
            });
            menu.addItem({type: "submenu", label: this.i18n.moveToGroup, icon: "iconFolder", submenu: moveSub});
            menu.addItem({
                label: this.i18n.newGroupFav,
                icon: "iconAdd",
                click: () => this.openGroupDialog(tab, card),
            });
        } else {
            menu.addItem({
                label: this.i18n.newGroupFav,
                icon: "iconFolder",
                click: () => this.openGroupDialog(tab, card),
            });
        }
        menu.addItem({
            label: this.i18n.close,
            icon: "iconClose",
            click: () => handlers.onCloseTab(tab, card),
        });
        menu.open({x, y});
    }

    // ==================== 缂╃暐鍥剧紦瀛?====================
    // 缓存按文档 rootID 索引：只要该文档页签还开着（哪怕重启/重置布局后重新恢复），
    // 缓存就保留并在页签 DOM 未就绪时直接渲染；页签关闭后由 pruneThumbCache 清除。

    private getThumbCache(): IThumbCache {
        const data = this.data[THUMB_CACHE_KEY];
        // 与 normalizeThumbCache 的容器判据一致：数组同样是 object，旧判据会把
        // 数组当缓存返回，后续 cache[rootId] = {...} 会往数组上挂具名属性。
        // 加载期归一化已把这类值重置为空对象，这里是运行期的第二道防线。
        return data && typeof data === "object" && !Array.isArray(data) ? data as IThumbCache : {};
    }

    private saveThumbCache(cache: IThumbCache) {
        this.data[THUMB_CACHE_KEY] = cache;
        this.saveDataDebounced(THUMB_CACHE_KEY);
    }

    // 鍐欏叆涓€鏉＄紦瀛橈紙瀹炴椂 DOM 浼樺厛鏇存柊锛夛紝瓒呰繃涓婇檺鏃舵寜鏈€鏃ф窐姹帮紱涓嶇珛鍗冲啓鐩橈紝鐢辫皟鐢ㄦ柟鎵归噺 flush
    private setThumbCache(cache: IThumbCache, rootId: string, title: string, html: string) {
        // 手机端使用更保守的缓存上限（存储/内存更紧张）
        const htmlMax = this.isMobile ? THUMB_HTML_MAX_MOBILE : THUMB_HTML_MAX;
        const cacheMax = this.isMobile ? THUMB_CACHE_MAX_MOBILE : THUMB_CACHE_MAX;
        if (html.length > htmlMax) {
            return;
        }
        cache[rootId] = {title, html, ts: Date.now()};
        // 容量控制：超出上限时删最旧的条目；用稳定排序让 ts 相同时按插入顺序淘汰，行为可预测
        const keys = Object.keys(cache);
        if (keys.length > cacheMax) {
            const sorted = stableSortBy(keys, (k) => cache[k].ts);
            sorted.slice(0, sorted.length - cacheMax).forEach((key) => delete cache[key]);
        }
    }

    // 清理缓存中已无对应打开页签的孤儿条目（页签关闭即失效）
    private pruneThumbCache(tabs: Tab[]) {
        const openIds = new Set<string>();
        tabs.forEach((tab) => {
            const rootId = this.rootIdOf(tab);
            if (rootId) {
                openIds.add(rootId);
            }
        });
        const cache = this.getThumbCache();
        let dirty = false;
        Object.keys(cache).forEach((key) => {
            if (!openIds.has(key)) {
                delete cache[key];
                dirty = true;
            }
        });
        if (dirty) {
            this.saveThumbCache(cache);
        }
    }

    // ==================== 缩略图渲染 ====================

    // 渲染单个页签缩略图：实时 DOM 克隆 → 持久化缓存 → 内核 API 回源（带并发闸门）
    private renderThumbItem(item: IGroupedTab) {
        const thumb = item.card?.querySelector<HTMLElement>(".sw__thumb");
        if (!thumb || !thumb.isConnected) {
            return;
        }
        const title = item.tab.title || "";
        const rootId = this.rootIdOf(item.tab);
        const source = this.getThumbSource(item.tab);
        thumb.innerHTML = "";
        if (source) {
            this.applyThumbContent(thumb, source, title);
            // 实时 DOM 可用：刷新该文档的缓存快照（下次重启/后台未渲染时直接命中）
            if (rootId) {
                const cache = this.getThumbCache();
                this.setThumbCache(cache, rootId, title, source.innerHTML);
                this.saveThumbCache(cache);
            }
            return;
        }
        // 无实时 DOM：尝试命中持久化缓存（跨重启/重置保留）
        const cache = this.getThumbCache();
        const cached = rootId ? cache[rootId] : undefined;
        if (cached) {
            const wrap = document.createElement("div");
            wrap.className = "protyle-wysiwyg";
            wrap.innerHTML = cached.html;
            this.applyThumbContent(thumb, wrap, title);
            return;
        }
        // 缓存也未命中：先占位，再通过内核 API 读取文档内容（成功后写入缓存）
        const placeholder = document.createElement("div");
        placeholder.className = "sw__thumb-placeholder";
        placeholder.textContent = title || item.tab.id;
        thumb.appendChild(placeholder);
        this.fillThumbByApi(item.tab, thumb);
    }

    // 视口懒渲染：只给滚动到可视区（含 240px 预载边距）的卡片生成缩略图，
    // 视野外保持加载占位。打开切换器从"全量克隆"降为"首屏克隆"，大列表秒开
    private renderThumbnails(list: IGroupedTab[], scrollElement: HTMLElement, batch: number) {
        // 同一容器重复渲染时（排序切换/列表刷新）先断开旧观察器，防止泄漏与重复渲染
        // 用 WeakMap 把 IntersectionObserver 绑在元素上，替代 (el as any).__swThumbObserver 的自挂私有属性写法
        const prev = thumbObserverCache.get(scrollElement);
        if (prev) {
            prev.disconnect();
            thumbObserverCache.delete(scrollElement);
        }

        // 环境不支持 IntersectionObserver 时退回原分批全量渲染（思源内核均为 Chromium，仅防御）
        if (typeof IntersectionObserver !== "function") {
            this.renderThumbBatch(list, batch);
            return;
        }

        const thumbItems = new Map<HTMLElement, IGroupedTab>();
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }
                observer.unobserve(entry.target);
                const item = thumbItems.get(entry.target as HTMLElement);
                if (item) {
                    thumbItems.delete(entry.target as HTMLElement);
                    this.renderThumbItem(item);
                }
            });
        }, {root: scrollElement, rootMargin: "240px 0px"});
        thumbObserverCache.set(scrollElement, observer);

        list.forEach((item) => {
            const thumb = item.card?.querySelector<HTMLElement>(".sw__thumb");
            if (!thumb) {
                return;
            }
            // 复用的旧卡片已渲染过（无加载占位）：跳过观察，避免重克隆
            if (!thumb.querySelector(".sw__thumb-loading")) {
                return;
            }
            thumbItems.set(thumb, item);
            observer.observe(thumb);
        });
    }

    // 分批全量渲染（IntersectionObserver 不可用时的兜底路径）
    private renderThumbBatch(list: IGroupedTab[], batch: number) {
        const cache = this.getThumbCache();
        let dirty = false;
        let index = 0;
        const runBatch = () => {
            const end = Math.min(index + batch, list.length);
            for (; index < end; index++) {
                const item = list[index];
                const thumb = item.card?.querySelector<HTMLElement>(".sw__thumb");
                if (!thumb) {
                    continue;
                }
                const title = item.tab.title || "";
                const rootId = this.rootIdOf(item.tab);
                const source = this.getThumbSource(item.tab);
                thumb.innerHTML = "";
                if (source) {
                    this.applyThumbContent(thumb, source, title);
                    if (rootId) {
                        this.setThumbCache(cache, rootId, title, source.innerHTML);
                        dirty = true;
                    }
                    continue;
                }
                const cached = rootId ? cache[rootId] : undefined;
                if (cached) {
                    const wrap = document.createElement("div");
                    wrap.className = "protyle-wysiwyg";
                    wrap.innerHTML = cached.html;
                    this.applyThumbContent(thumb, wrap, title);
                    continue;
                }
                const placeholder = document.createElement("div");
                placeholder.className = "sw__thumb-placeholder";
                placeholder.textContent = title || item.tab.id;
                thumb.appendChild(placeholder);
                this.fillThumbByApi(item.tab, thumb);
            }
            if (index < list.length) {
                this.scheduleAnimationFrame(runBatch);
            } else if (dirty) {
                this.saveThumbCache(cache);
            }
        };
        this.scheduleAnimationFrame(runBatch);
    }

    // 将克隆内容装进缩略图框并按宽度缩放
    private applyThumbContent(thumb: HTMLElement, source: HTMLElement, title: string) {
        const content = document.createElement("div");
        content.className = "sw__thumb-content";
        content.appendChild(source);
        thumb.appendChild(content);
        // 依据盒子实际宽度计算缩放比例；容器尚未完成布局（宽度为 0）时等下一帧重算，
        // 后续尺寸变化由侧边栏的 ResizeObserver 兜底重算
        content.style.visibility = "hidden";
        const syncScale = (attempt: number) => {
            if (!thumb.isConnected) return;
            const width = thumb.clientWidth || thumb.getBoundingClientRect().width;
            if (width > 0) {
                content.style.transform = `scale(${(width / CONTENT_WIDTH_PX).toFixed(3)})`;
                content.style.visibility = "visible";
                return;
            }
            if (attempt < 5) this.scheduleAnimationFrame(() => syncScale(attempt + 1));
            else content.style.visibility = "visible";
        };
        syncScale(0);
        content.setAttribute("aria-label", title);
    }

    // getDoc 回源并发闸门：视口懒渲染下仍可能同时暴露多张缺图卡片，
    // 限制同时在途请求数，手机端更保守，避免打开瞬间打爆内核/网络
    private thumbApiActive = 0;
    private thumbApiQueue: Array<() => void> = [];

    private async acquireThumbApi(): Promise<void> {
        const max = this.isMobile ? THUMB_API_MAX_MOBILE : THUMB_API_MAX;
        if (this.thumbApiActive < max) {
            this.thumbApiActive++;
            return;
        }
        await new Promise<void>((resolve) => {
            this.thumbApiQueue.push(() => {
                this.thumbApiActive++;
                resolve();
            });
        });
    }

    private releaseThumbApi() {
        this.thumbApiActive--;
        const next = this.thumbApiQueue.shift();
        if (next) {
            next();
        }
    }

    // 页签 DOM 中暂无内容（如后台未渲染完）时，通过内核 API 读取文档 HTML 作为缩略内容，并写入缓存
    private async fillThumbByApi(tab: Tab, thumb: HTMLElement) {
        const rootId = this.rootIdOf(tab);
        if (!rootId) {
            return; // 闈炴枃妗ｉ〉绛撅紝淇濇寔鍗犱綅
        }
        await this.acquireThumbApi();
        try {
            // size=32：缩略图只需首屏内容，减小响应体与解析开销
            const response = await fetch("/api/filetree/getDoc", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({id: rootId, mode: 0, size: 32}),
            });
            if (!response.ok) {
                throw new Error(`getDoc HTTP ${response.status}`);
            }
            const json = await response.json();
            const html: string | undefined = json?.data?.content;
            // 弹窗已关闭或内容无效时放弃
            if (!thumb.isConnected || !html) {
                return;
            }
            const wrap = document.createElement("div");
            wrap.className = "protyle-wysiwyg";
            wrap.innerHTML = html;
            thumb.innerHTML = "";
            this.applyThumbContent(thumb, wrap, tab.title || "");
            // API 读取成功：写入缓存，下次（含重启后）直接命中
            const cache = this.getThumbCache();
            this.setThumbCache(cache, rootId, tab.title || "", html);
            this.saveThumbCache(cache);
        } catch (e) {
            // 璇诲彇澶辫触淇濇寔鍗犱綅鍗冲彲
            logger.warn("fetch doc content fail", e);
        } finally {
            this.releaseThumbApi();
        }
    }

    // 裁剪克隆内容：只保留前 max 个子块。缩略图仅显示文档首屏，
    // 大文档整篇 cloneNode 是切换器打开卡顿的主因，裁剪后克隆量与文档大小解耦
    private limitCloneChildren(clone: HTMLElement, max: number) {
        while (clone.children.length > max) {
            clone.removeChild(clone.lastChild as ChildNode);
        }
    }

    // 获取可克隆的缩略图内容源；文档页签优先取其 WYSIWYG 内容
    // 注意：每次打开切换器都会重新调用本方法克隆实时 DOM，保证缩略图展示的是页签当前最新状态
    private getThumbSource(tab: Tab): HTMLElement | null {
        try {
            // Editor 模型的 .editor 即 Protyle 实例，其 wysiwyg.element 为实时文档 DOM
            const model = (tab as unknown as { model?: IProtyleTabModel }).model;
            const wysiwyg = model?.editor?.wysiwyg?.element;
            if (wysiwyg && wysiwyg.childElementCount > 0) {
                const clone = wysiwyg.cloneNode(true) as HTMLElement;
                this.limitCloneChildren(clone, THUMB_CLONE_MAX);
                return clone;
            }
            // 兜底：从面板容器里直接找 WYSIWYG 内容（不依赖 model 内部结构）
            const panelWysiwyg = tab.panelElement?.querySelector<HTMLElement>(".protyle-wysiwyg");
            if (panelWysiwyg && panelWysiwyg.childElementCount > 0) {
                const clone = panelWysiwyg.cloneNode(true) as HTMLElement;
                this.limitCloneChildren(clone, THUMB_CLONE_MAX);
                return clone;
            }
            // 最后再退回整个面板内容
            if (tab.panelElement && tab.panelElement.childElementCount > 0) {
                const clone = tab.panelElement.cloneNode(true) as HTMLElement;
                this.limitCloneChildren(clone, THUMB_CLONE_MAX);
                return clone;
            }
        } catch (e) {
            logger.warn("build thumbnail fail", e);
        }
        return null;
    }

    // 键盘导航：方向键 / Tab 移动，Enter 切换，Esc 关闭（仅弹窗模式使用）
    private bindKeydown(scrollElement: HTMLElement, closeOverlay: IOverlayClose) {
        scrollElement.addEventListener("keydown", (event) => {
            if ((event.target as HTMLElement).closest("button, input, select, textarea")) {
                return;
            }
            const key = event.key;
            const cards = Array.from(scrollElement.querySelectorAll<HTMLElement>(".sw__card"))
                .filter((card) => !card.closest(".fn__none"));
            if (cards.length === 0) {
                return;
            }
            const current = cards.findIndex((el) => el.classList.contains("sw__focused"));
            const focusIndex = current >= 0 ? current : 0;

            // 读取网格真实列数用于上下导航（设置列数或自动时均准确）
            const grid = scrollElement.querySelector(".sw__grid") as HTMLElement | null;
            let colCount = 1;
            if (grid) {
                const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter((c) => c && c !== "none");
                if (cols.length > 0) {
                    colCount = cols.length;
                }
            }

            // 流式分组下组块宽度不等，方向键按屏幕坐标就近移动；Tab 保持顺序移动
            const flowNav = scrollElement.classList.contains("sw--grouped-flow");
            const flowNeighbor = (dir: string): number => {
                const neighbor = this.pickCardByPosition(cards, cards[focusIndex], dir);
                return neighbor ? cards.indexOf(neighbor) : -1;
            };

            let next = -1;
            if (key === "ArrowRight" || (key === "Tab" && !event.shiftKey)) {
                event.preventDefault();
                next = key === "ArrowRight" && flowNav && flowNeighbor(key) >= 0
                    ? flowNeighbor(key)
                    : (focusIndex + 1) % cards.length;
            } else if (key === "ArrowLeft" || (key === "Tab" && event.shiftKey)) {
                event.preventDefault();
                next = key === "ArrowLeft" && flowNav && flowNeighbor(key) >= 0
                    ? flowNeighbor(key)
                    : (focusIndex - 1 + cards.length) % cards.length;
            } else if (key === "ArrowDown") {
                event.preventDefault();
                next = flowNav && flowNeighbor(key) >= 0 ? flowNeighbor(key) : Math.min(focusIndex + colCount, cards.length - 1);
            } else if (key === "ArrowUp") {
                event.preventDefault();
                next = flowNav && flowNeighbor(key) >= 0 ? flowNeighbor(key) : Math.max(focusIndex - colCount, 0);
            } else if (key === "Enter") {
                event.preventDefault();
                this.activateCardByElement(cards[focusIndex], closeOverlay);
                return;
            } else if (/^[1-9]$/.test(key) && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                // T-6820 数字直达：1-9 打开第 n 个可见卡片（与 R3 面板数字快选同构；
                // 输入框在滚动容器外，输入数字不会误触此分支）
                event.preventDefault();
                this.activateCardByElement(cards[Number(key) - 1], closeOverlay);
                return;
            } else if (key === "ContextMenu" || (key === "F10" && event.shiftKey)) {
                // T-6461 动作面板键：键盘呼出聚焦卡片的动作菜单（Shift+F10 / ContextMenu
                // 为标准上下文菜单键，不与输入框快捷键冲突；Raycast Action Panel 心智）
                event.preventDefault();
                const target = cards[focusIndex];
                if (!target) return;
                const tab = this.cardTabs.get(target);
                const menuHandlers = this.cardMenuHandlers.get(target);
                if (tab && menuHandlers) {
                    const rect = target.getBoundingClientRect();
                    this.openCardMenu(tab, target, menuHandlers, rect.left + 16, rect.top + 16);
                }
                return;
            } else if ((key === "ArrowLeft" || key === "ArrowRight") && event.ctrlKey && !event.altKey && !event.metaKey) {
                // T-6820 结果类型快捷键：Ctrl+←/→ 循环过滤条（all→tabs→unified→docs）
                event.preventDefault();
                this.cycleSearchChip(scrollElement, key === "ArrowRight" ? 1 : -1);
                return;
            } else if (key === "Escape") {
                event.stopPropagation();
                closeOverlay();
                return;
            }

            if (next >= 0 && cards[next]) {
                this.focusCard(cards[next]);
                this.scrollIntoView(cards[next], scrollElement);
            }
        });
    }

    // 流式布局下的方向键导航：按屏幕坐标就近移动（组块宽度不等，固定列数换算会跳错位）
    // T-6820：按元素激活页签卡（Enter 与数字直达共用；卡上无对应页签时静默）
    private activateCardByElement(card: HTMLElement | undefined, closeOverlay: IOverlayClose) {
        const tabId = card?.dataset.tabId;
        const tab = (card && this.cardTabs.get(card)) || (this.isMobile
            ? this.getMobileTabs().find((item) => item.id === tabId)
            : getAllTabs().find((item) => item.id === tabId));
        if (tab) {
            this.activateTab(tab, closeOverlay);
        }
    }

    // T-6820 结果类型快捷键：Ctrl+←/→ 循环过滤条（all→tabs→unified→docs）。
    // 空查询时无过滤条，快捷键静默不生效。
    private cycleSearchChip(scrollElement: HTMLElement, delta: number) {
        const order = ["all", "tabs", "unified", "docs"] as const;
        const row = scrollElement.querySelector<HTMLElement>(".sw__search-chips");
        if (!row) return;
        const current = this.docSearchState.chipFilters.get(scrollElement) || "all";
        const index = order.indexOf(current as typeof order[number]);
        const next = order[(index + delta + order.length) % order.length];
        this.docSearchState.chipFilters.set(scrollElement, next);
        scrollElement.dataset.swChip = next;
        row.querySelectorAll<HTMLElement>(".sw__search-chip").forEach((el) => {
            const active = el.dataset.chip === next;
            el.classList.toggle("is-active", active);
            el.setAttribute("aria-selected", String(active));
        });
    }

    private pickCardByPosition(cards: HTMLElement[], current: HTMLElement, key: string): HTMLElement | null {
        const base = current.getBoundingClientRect();
        let best: HTMLElement | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        cards.forEach((card) => {
            if (card === current) return;
            const rect = card.getBoundingClientRect();
            const dx = rect.left - base.left;
            const dy = rect.top - base.top;
            let primary = 0;
            let cross = 0;
            if (key === "ArrowRight") {
                primary = dx; cross = Math.abs(dy);
                if (primary <= 1) return;
            } else if (key === "ArrowLeft") {
                primary = -dx; cross = Math.abs(dy);
                if (primary <= 1) return;
            } else if (key === "ArrowDown") {
                primary = dy; cross = Math.abs(dx);
                if (primary <= 1) return;
            } else if (key === "ArrowUp") {
                primary = -dy; cross = Math.abs(dx);
                if (primary <= 1) return;
            } else {
                return;
            }
            const score = Math.abs(primary) + cross * 2.5;
            if (score < bestScore) {
                bestScore = score;
                best = card;
            }
        });
        return best;
    }

    private focusCard(card: HTMLElement | undefined | null) {
        if (!card) {
            return;
        }
        const container = card.closest(".sw__scroll") || card.parentElement;
        if (container) {
            container.querySelectorAll<HTMLElement>(".sw__card").forEach((el) => {
                el.classList.remove("sw__focused");
                el.removeAttribute("aria-current");
            });
        }
        card.classList.add("sw__focused");
        card.setAttribute("aria-current", "true");
    }

    private scrollIntoView(card: HTMLElement, container: HTMLElement) {
        const cardTop = card.offsetTop;
        const cardBottom = cardTop + card.offsetHeight;
        if (cardTop < container.scrollTop) {
            container.scrollTop = cardTop;
        } else if (cardBottom > container.scrollTop + container.clientHeight) {
            container.scrollTop = cardBottom - container.clientHeight;
        }
    }

    // 切换到目标页签；弹窗模式随后销毁弹窗，侧边栏模式随后刷新列表
    private activateTab(tab: Tab, onClose?: IOverlayClose) {
        // 记录 MRU：按 pinKey（文档页签为 rootID）记录，手机端与桌面端使用同一份 MRU 数据，
        // 通过插件数据同步后两端「最近使用」保持一致
        const key = this.pinKeyOf(tab);
        const mru = this.getMru();
        const list = mru.filter((id) => id !== key);
        list.unshift(key);
        // 上限收敛：超出 MRU_MAX 从尾部丢弃最旧条目，防止插件数据随使用无限膨胀
        this.data[MRU_KEY] = capMru(list, MRU_MAX);
        this.saveDataDebounced(MRU_KEY);
        this.recordOpenHistory(tab);

        if (this.isMobile) {
            // 手机端：MobileTabs.switchTo 切换页签
            try {
                getSiyuan()?.mobile?.tabs?.switchTo?.(tab.id);
            } catch (e) {
                logger.warn("mobile switch tab fail", e);
            }
            onClose?.();
            return;
        }

        // 等价于点击该页签：内部会切到目标页签，并通过 setPanelFocus 激活其所在窗口（支持分栏）
        try {
            tab.parent.switchTab(tab.headElement, true);
            // 偶发场景下 showHeading 不是必暴露的方法，思源历史版本不一定存在，做能力检测
            const parentWithHeading = tab.parent as unknown as { showHeading?: () => void };
            if (typeof parentWithHeading.showHeading === "function") {
                parentWithHeading.showHeading();
            }
        } catch (e) {
            logger.warn("switch tab fail", e);
        }
        onClose?.();
    }

    // ==================== 鎵嬫満绔?====================

    // 手机端数据源适配：思源 getAllTabs() 在手机端（MOBILE 构建）恒返回空数组，
    // 页签数据需从 window.siyuan.mobile.tabs（思源 3.8+ MobileTabs）读取，
    // 包装成与桌面端 Tab 兼容的伪 Tab，使 rootIdOf/titleOf/pinKeyOf/createCard 等直接复用
    private getMobileTabs(): Tab[] {
        const state = getSiyuan()?.mobile?.tabs?.state;
        if (!state?.tabs) {
            return [];
        }
        return state.tabs
            .filter((t) => t.current?.rootID)
            .map((t) => ({
                id: t.id,                       // MobileTabs 页签 id（switchTo/close 使用）
                title: t.current!.title,
                notebookId: t.current!.notebookID,
                path: t.current!.path,
                // 手机端页签图标可能在 t.icon 或 t.current.icon，优先 t.icon（思源不同版本字段不同）
                icon: (t as unknown as {icon?: string}).icon || t.current!.icon || "",
                // 兼容 rootIdOf()：直接命中 model.editor.block.rootID 分支
                model: {editor: {block: {rootID: t.current!.rootID}}},
            } as unknown as Tab));
    }

    // 手机端当前激活页签 id（无激活时返回 undefined）
    private getMobileActiveTabId(): string | undefined {
        return getSiyuan()?.mobile?.tabs?.state?.activeTabID;
    }

    // 手机端打开文档（思源 plugin API openTab 在移动端是空实现），返回是否成功：
    // 1) 浼樺厛 MobileTabs.open(rootID)锛堟€濇簮 3.8+锛夛細蹇呴』淇濇寔瀹夸富瀵硅薄璋冪敤锛堟娊鎴愯８鍑芥暟璋冪敤浼氫涪 this锛?
    //    内部 abortController/navigationEpoch 访问直接抛错），await 返回值判断结果而非固定延时轮询；
    //    open 明确返回失败（invalid/cancelled/failed）时不降级——openTab 在移动端是空实现，降级无意义；
    // 2) 仅当 MobileTabs API 不存在（思源 <3.8）才降级到 plugin.openTab 兜底通道
    private async mobileOpenDoc(rootId: string): Promise<boolean> {
        return openDocumentOnMobile({
            rootId,
            tabs: getSiyuan()?.mobile?.tabs,
            app: this.app,
            openTab,
            logger,
            onFailure: () => showMessage(this.i18n.openDocFailed),
        });
    }

    // 手机端切换器：全屏覆盖弹窗，简化工具栏，单列/双列卡片，纯触摸操作。
    // （T-6679：minAppVersion 已抬到 3.8.0，"旧版无 MobileTabs API 需提示升级"的
    // 运行时门成为死代码，随 ADR 0064 首批兼容层简化移除）
    private showMobileSwitcher(focusSearch = false) {
        const tabs = this.getMobileTabs();
        openMobileSwitcherDialog.call(this, tabs, focusSearch);
    }

    // 打开手机端切换器 Dialog：装配顶栏、列表、搜索、FAB 隐藏等
    private createMobileSwitcherDialog(release: {fn: () => void}): Dialog {
        return new Dialog({
            title: "",
            content: this.buildMobileSwitcherHtml(),
            width: "92vw",
            height: "85vh",
            disableAnimation: true,
            destroyCallback: () => release.fn(),
        });
    }

    // 手机端弹窗骨架。
    // 所有 <svg> 都显式写出 width/height 作为**固有尺寸兜底**：手机 WebView 首次打开时，
    // 插件 index.css 可能尚未作用到这批新插入的节点，此时裸 <svg> 会退回浏览器默认尺寸
    // （300×150），把顶栏撑成"巨大图标 + 控件竖排"的错乱首帧——即用户反馈的
    // "刚进去出现大图标"。带 b3-button 类的图标有思源基础样式兜底所以看起来正常，
    // 裸图标（放大镜/筛选/关闭/星标/齿轮/时钟）才会失控，故这里逐个补齐。
    // 注意：HTML 属性优先级低于任何作者样式，CSS 就绪后仍由 .sw__search-icon 等
    // 规则接管，正常路径视觉零变化。
    private buildMobileSwitcherHtml(): string {
        return `<div class="speed-switch sw__body sw__mobile sw__mobile--initializing" style="visibility:hidden;opacity:0;pointer-events:none">
    <div class="sw__toolbar sw__mobile-toolbar">
        <div class="sw__search-wrap">
            <svg class="sw__search-icon" width="14" height="14"><use xlink:href="#iconSearch"></use></svg>
            <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" aria-label="${this.i18n.searchTabs}" autocomplete="off" spellcheck="false" />
            <button type="button" class="sw__search-filter-btn" aria-label="${this.i18n.searchFilters}" title="${this.i18n.searchFilters}">
                <svg width="15" height="15"><use xlink:href="#iconFilter"></use></svg>
            </button>
        </div>
        <button type="button" class="b3-button b3-button--text sw__sort-btn" aria-label="${this.i18n.setSortBy}"></button>
        <select class="b3-select sw__sort fn__none" aria-label="${this.i18n.setSortBy}">
            <option value="mru">${this.i18n.sortMru}</option>
            <option value="layout">${this.i18n.sortLayout}</option>
            <option value="layoutDesc">${this.i18n.sortLayoutDesc}</option>
            <option value="updatedDesc">${this.i18n.sortUpdatedDesc}</option>
            <option value="titleAsc">${this.i18n.sortTitleAsc}</option>
            <option value="titleDesc">${this.i18n.sortTitleDesc}</option>
        </select>
        <button type="button" class="b3-button b3-button--text sw__icon-btn sw__mobile-close-btn" aria-label="${this.i18n.close}">
            <svg width="16" height="16"><use xlink:href="#iconClose"></use></svg>
        </button>
        <div class="sw__toolbar-row2">
            <button type="button" class="b3-button b3-button--text sw__icon-btn sw__mobile-fav-btn" aria-label="${this.i18n.favorites}">
                <svg width="16" height="16"><use xlink:href="#iconStar"></use></svg><span class="sw__mobile-chip-label">${this.i18n.favorites}</span>
            </button>
            <div class="sw__history-dd"></div>
            <button type="button" class="b3-button b3-button--text sw__icon-btn sw__settings-btn" aria-label="${this.i18n.settings}">
                <svg width="16" height="16"><use xlink:href="#iconSettings"></use></svg><span class="sw__mobile-chip-label">${this.i18n.settingsShort}</span>
            </button>
        </div>
            </div>
    <div class="sw__scroll" tabindex="0"></div>
    <div class="sw__quick-actions" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
</div>`;
    }

    // 手机端顶栏按钮：设置 / 日记 + 排序切换（排序切换复用装配期 renderMobileList 与 updatedMap）
    private renderMobileSwitcherList(
        dialog: Dialog,
        scrollElement: HTMLDivElement,
        sortSelect: HTMLSelectElement,
        settings: ISwSettings,
    ) {
        const listOpts = {
            onOverlayClose: () => dialog.destroy(),
            onTabsChanged: () => {
                refreshMobileList();
                const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
                if (searchInput && (searchInput.value.trim() !== "" || hasDocSearchFilter.call(this, scrollElement))) {
                    this.applySearch(scrollElement, searchInput, () => dialog.destroy());
                }
            },
        };
        let updatedMap: {[rootId: string]: string} = {};
        const refreshMobileList = () => {
            renderMobileList.call(this, scrollElement, this.getMobileTabs(),
                {id: this.getMobileActiveTabId()} as Tab, listOpts, sortSelect.value as SortBy, updatedMap);
        };
        refreshMobileList();
        // 「最近编辑」排序需要文档更新时间：后台查询一次，完成后若仍处于该排序则重排
        const mergedMap = updatedMap;
        this.loadUpdatedMap(this.getMobileTabs()).then((map) => {
            Object.assign(mergedMap, map);
            if (dialog.element.isConnected && sortSelect.value === "updatedDesc") {
                refreshMobileList();
                const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
                if (searchInput && (searchInput.value.trim() !== "" || hasDocSearchFilter.call(this, scrollElement))) {
                    this.applySearch(scrollElement, searchInput, () => dialog.destroy());
                }
            }
        });
        return {renderMobileList: refreshMobileList};
    }

    // 手机端渲染页签卡片列表
    private buildMobileGroupGrid(settings: ISwSettings): HTMLElement {
        const grid = document.createElement("div");
        grid.className = "sw__grid sw__mobile-grid";
        if (settings.mobileColumns === MOBILE_COLUMNS_DOUBLE) {
            grid.classList.add("sw__mobile-grid--double");
        } else if (settings.mobileColumns === MOBILE_COLUMNS_AUTO) {
            // auto: portrait=single, landscape=double (handled by CSS media query)
            grid.classList.add("sw__mobile-grid--auto");
        }
        return grid;
    }

    // 手机端分组卡片渲染：委托 acquireGroupCard（mobile=true 附带 sw__mobile-card）；返回 all 列表供缩略图懒渲染
    private renderMobileCardsInGroup(
        grid: HTMLElement,
        ordered: IGroupedTab[],
        ctx: ITabGroupRenderCtx,
    ): IGroupedTab[] {
        const all: IGroupedTab[] = [];
        ordered.forEach((item) => {
            const card = this.acquireGroupCard(item, ctx, true);
            grid.appendChild(card);
            item.card = card;
            all.push(item);
        });
        return all;
    }

    // 手机端收藏底部弹窗；onTabsChanged：组内页签批量开/关后刷新背后的切换器列表
    private showMobileFavSheet(dialog: Dialog, closeOverlay: IOverlayClose, onTabsChanged?: () => void) {
        const favorites = this.getFavorites();
        const groupNames = this.getFavoriteGroupNames();

        if (favorites.length === 0 && groupNames.length === 0) {
            // 无任何收藏时给出反馈而非静默无响应
            showMessage(this.i18n.mobileNoFav);
            return;
        }

        // 鏋勫缓搴曢儴寮圭獥
        const overlay = document.createElement("div");
        overlay.className = "sw__mobile-sheet-overlay";
        overlay.innerHTML = this.buildMobileFavSheetHtml();
        document.body.appendChild(overlay);

        const sheet = overlay.querySelector<HTMLElement>(".sw__mobile-sheet");
        const body = overlay.querySelector<HTMLElement>(".sw__mobile-sheet-body");
        if (!sheet || !body) {
            // 楠ㄦ灦寮傚父鏃朵笉鑳芥妸绌洪伄缃╃暀鍦?body 涓婃尅浣忔暣灞忎氦浜?
            overlay.remove();
            return;
        }

        // 娓叉煋鍒嗙粍/鍗曞垪琛?绌烘€?
        this.renderMobileFavSheetBody(body, favorites, groupNames, closeOverlay, onTabsChanged, overlay);

        // 动画：下一帧滑入
        this.scheduleAnimationFrame(() => { if (sheet.isConnected) sheet.classList.add("sw__mobile-sheet--open"); });
        // 点击背景关闭
        this.bindMobileFavSheetBackdropClose(overlay, sheet);
    }

    // 收藏底部弹窗 DOM 骨架：抽屉 + 拖把柄 + 标题 + 内容容器
    private buildMobileFavSheetHtml(): string {
        return `<div class="sw__mobile-sheet" role="dialog" aria-modal="true" aria-label="${this.escapeAttr(this.i18n.mobileFavTitle)}">
    <div class="sw__mobile-sheet-handle"></div>
    <div class="sw__mobile-sheet-title">${this.i18n.mobileFavTitle}</div>
    <div class="sw__mobile-sheet-body"></div>
</div>`;
    }

    // 渲染收藏内容：分组（带 ⋯ 批量按钮）/ 单列表（无分组命名空间时）/ 空态
    private renderMobileFavSheetBody(
        body: HTMLElement,
        favorites: IFavoriteItem[],
        groupNames: string[],
        closeOverlay: IOverlayClose,
        onTabsChanged: (() => void) | undefined,
        overlay: HTMLElement,
    ) {
        const groups = groupFavoritesByGroup(favorites, groupNames);
        const groupedNames = Array.from(groups.keys()).filter((name) => name !== "");
        const ungrouped = groups.get("") || [];

        if (groupedNames.length === 0) {
            body.appendChild(this.buildMobileFavSheetList(ungrouped, overlay, closeOverlay));
        } else {
            groupedNames.forEach((name) => {
                this.appendMobileFavSheetSection(body, name, groups.get(name) || [], false,
                    overlay, closeOverlay, onTabsChanged);
            });
            if (ungrouped.length > 0) {
                this.appendMobileFavSheetSection(body, this.i18n.ungrouped, ungrouped, true,
                    overlay, closeOverlay, onTabsChanged);
            }
        }

        // favorites 涓虹┖锛堜粎鏈夌┖鍒嗙粍娉ㄥ唽锛夋椂杩藉姞绌烘€?
        if (favorites.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__mobile-sheet-empty";
            empty.setAttribute("role", "status");
            empty.textContent = this.i18n.mobileNoFav;
            body.appendChild(empty);
        }
    }

    // 渲染单个分组区块：标题（组名 + 数量 + ⋯）+ 项列表
    private appendMobileFavSheetSection(
        body: HTMLElement,
        name: string,
        items: IFavoriteItem[],
        isUngrouped: boolean,
        overlay: HTMLElement,
        closeOverlay: IOverlayClose,
        onTabsChanged: (() => void) | undefined,
    ) {
        const section = document.createElement("div");
        section.className = "sw__mobile-sheet-section";
        const header = document.createElement("div");
        header.className = "sw__mobile-sheet-section-header";
        // ⋯ 按钮：触发组内批量开/关（嵌套底部弹窗）
        header.innerHTML = `<span>${this.escapeAttr(name)}</span>
<span class="sw__mobile-sheet-count">${items.length}</span>
<button type="button" class="sw__mobile-sheet-more" aria-label="${this.escapeAttr(this.i18n.favGroupTip)}">
    <svg><use xlink:href="#iconMore"></use></svg>
</button>`;
        const moreBtn = header.querySelector<HTMLButtonElement>(".sw__mobile-sheet-more");
        moreBtn?.addEventListener("click", (event) => {
            event.stopPropagation();
            // 批量操作完成后：关闭嵌套弹窗 → 关闭收藏弹窗 → 刷新背后切换器列表
            const onNestedClosed = () => {
                document.querySelectorAll(".sw__mobile-sheet-overlay--nested").forEach((el) => el.remove());
                overlay.remove();
                onTabsChanged?.();
            };
            openMobileGroupActions.call(this, name, items, onNestedClosed);
        });
        section.appendChild(header);
        section.appendChild(this.buildMobileFavSheetList(items, overlay, closeOverlay));
        body.appendChild(section);
    }

    // 单列表：每项是文件图标 + 标题，点击关闭弹窗并跳转
    private buildMobileFavSheetList(
        favorites: IFavoriteItem[],
        overlay: HTMLElement,
        closeOverlay: IOverlayClose,
    ): HTMLElement {
        const list = document.createElement("div");
        list.className = "sw__mobile-sheet-list";
        favorites.forEach((fav) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "sw__mobile-sheet-item";
            item.innerHTML = `<svg><use xlink:href="#iconFile"></use></svg><span>${this.escapeAttr(fav.title)}</span>`;
            item.addEventListener("click", () => {
                overlay.remove();
                this.jumpToFavorite(fav, closeOverlay);
            });
            list.appendChild(item);
        });
        return list;
    }

    // 点击背景关闭：抽屉下滑 + 遮罩淡出，250ms 后移除
    private bindMobileFavSheetBackdropClose(overlay: HTMLElement, sheet: HTMLElement) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                sheet.classList.remove("sw__mobile-sheet--open");
                overlay.style.opacity = "0";
                setTimeout(() => overlay.remove(), FAB_HIDE_DELAY_MS);
            }
        });
    }

    // 手机端分组批量操作单（嵌套于收藏弹窗之上、层级更高）：一键开启/关闭组内页签
    private createFAB() {
        const controller = this.createFloatingBallSurface("mobile");
        this.floatingBallUi = controller;
        this.fabElement = controller?.getElement() || null;
    }

    /** Build the floating-ball catalogue from the shared quick-action model.
     * Persisted actions remain authoritative; picker candidates fill in
     * registered builtins, docks, providers and commands without copying a
     * second action definition into the floating-ball layer.
     */
    private getFloatingBallActions(): IQuickAction[] {
        const saved = this.getQuickActions();
        const seen = new Set(saved.map((action) => `${action.kind}:${action.value}`));
        const result = saved.map((action) => ({...action}));
        this.getQuickActionPickerCandidates(saved).forEach((candidate) => {
            const action = candidate.action;
            const key = `${action.kind}:${action.value}`;
            if (seen.has(key)) return;
            seen.add(key);
            result.push({...action});
        });
        const providers = this.quickActionRegistry.snapshot();
        return result.map((action) => {
            let available = true;
            let providerId = "";
            let source = "";
            if (action.kind === "adapter") {
                providerId = action.value.split("/")[0];
                const provider = providers.find((item: {id: string; name?: string}) => item.id === providerId);
                available = this.quickActionAdapters.has(providerId) || Boolean(provider);
                source = provider?.name || providerId;
            } else if (action.kind === "command") {
                const [pluginId, commandKey] = action.value.split("::");
                const plugin = (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins?.find((item) => item.name === pluginId);
                const command = plugin?.commands?.find((item) => item.langKey === commandKey);
                available = typeof (command?.callback || command?.globalCallback) === "function";
                providerId = pluginId;
                source = pluginId;
            } else if (action.kind === "global") {
                available = this.hostCommandsAvailable();
                providerId = "siyuan";
                source = this.i18n.quickHostSource;
            } else if (action.kind === "dock") {
                available = Boolean(this.getDockByType(action.value));
            }
            return {...action, available, providerId, source, providerName: source,
                declaredTargets: this.getQuickActionDeclaredTargets(action),
                ...(available ? {} : {providerMissing: true, reason: "provider-missing"})};
        });
    }

    private executeFloatingBallSurfaceAction(surface: FloatingBallSurface, action: unknown) {
        const controller = this.floatingBallUis.get(surface);
        const panel = this.floatingBallPanels.get(surface);
        if (!controller) return;
        panel?.closeMore({restoreFocus: false});
        const restoreControllerState = controller?.beginExecution() || (() => undefined);
        const executor = createFloatingBallActionExecutor({
            adapters: this.quickActionAdapters,
            registry: this.quickActionRegistry,
            context: {surface: `floating-ball:${surface}`},
            plugins: (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins,
            getDockByType: (type: string) => this.getDockByType(type),
            close: () => panel?.closeMore({restoreFocus: false}),
            onSwitcher: () => this.showSwitcher(),
            onSearch: () => {
                if (surface === "sidebar") {
                    this.sidebarElement?.querySelector<HTMLInputElement>(".sw__search")?.focus();
                } else {
                    this.showSwitcher(true);
                }
            },
            onJournal: () => this.openJournal(),
            onSettings: () => this.openSetting(),
            onHome: () => openSecondPanel.call(this),
            onQuickCapture: () => this.openQuickCapture(),
            onPreviousTab: () => this.cycleFloatingBallTab(-1),
            onNextTab: () => this.cycleFloatingBallTab(1),
            onScrollTop: () => this.scrollFloatingBallSurface(surface, "top"),
            onScrollBottom: () => this.scrollFloatingBallSurface(surface, "bottom"),
            onSyncNow: () => this.syncNow(),
            onInsertTemplate: () => this.openTemplatePicker(),
            onCycleDocSet: () => this.cycleDocumentSet(),
            onCycleBallPreset: () => this.cycleBallPreset(),
            onThrowToWindow: () => this.throwActiveDocToWindow()
                ? undefined : {ok: false, reason: "unavailable"},
            onHideKeyboard: () => this.hideMobileKeyboard()
                ? undefined : {ok: false, reason: "unavailable"},
            onJumpBack: () => this.jumpBack().then((ok) => {
                if (!ok) showMessage(this.i18n.jumpStackEmpty, MESSAGE_DEFAULT_MS, "error");
            }),
            onJumpForward: () => this.jumpForward().then((ok) => {
                if (!ok) showMessage(this.i18n.jumpStackEmpty, MESSAGE_DEFAULT_MS, "error");
            }),
            onGlobalCommand: (action: {value: string}) => this.runHostCommand(action.value)
                ? undefined : {ok: false, reason: "unavailable"},
        });
        void executor(action).then((result) => {
            if (this.floatingBallUis.get(surface) !== controller) return;
            if (!result.ok) {
                const message = result.reason === "failed"
                    ? this.i18n.quickActionFailed
                    : this.i18n.quickActionUnavailable;
                showMessage(message, MESSAGE_DEFAULT_MS, "error");
            }
            restoreControllerState();
        }).catch((error) => {
            if (this.floatingBallUis.get(surface) !== controller) return;
            logger.warn("floating-ball action failed", error);
            showMessage(this.i18n.quickActionFailed, MESSAGE_DEFAULT_MS, "error");
            restoreControllerState();
        });
    }

    /**
     * Mount one portal with independent click and drag actions per surface.
     * Sidebar resolves its host lazily because SiYuan
     * creates and replaces dock content on demand.
     */
    private createFloatingBallSurface(surface: FloatingBallSurface): FloatingBallUiController {
        const settings = this.getSettings();
        const config = settings.floatingBall || {};
        const position = config.position?.[surface] || {edge: "right", yRatio: 0.72};
        const isSidebar = surface === "sidebar";
        let controller = this.floatingBallUis.get(surface);
        if (!controller) {
            controller = createFloatingBallUi({
                surface,
                document,
                host: isSidebar ? (this.sidebarElement || document.body) : document.body,
                resolveHost: isSidebar
                    ? () => this.sidebarElement?.isConnected ? this.sidebarElement : null
                    : () => document.body,
                resolveBounds: isSidebar
                    ? () => {
                        const host = this.sidebarElement;
                        if (!host?.isConnected) return null;
                        const rect = host.getBoundingClientRect();
                        return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
                    }
                    : undefined,
                position,
                touchSlopPx: config.behavior?.touchSlopPx,
                idleOpacity: config.appearance?.idleOpacity,
                idleDelayMs: config.appearance?.idleDelayMs,
                halfHide: config.appearance?.halfHide,
                hideOnFullscreen: config.behavior?.hideOnFullscreen,
                hideOnScroll: config.behavior?.hideOnScroll,
                resolveScrollTarget: isSidebar ? () => this.sidebarElement : undefined,
                excludeScrollTarget: !isSidebar ? (target) => Boolean((target as Node).nodeType && this.sidebarElement?.contains(target as Node)) : undefined,
                recoveryLabel: this.i18n.floatingBallRestoreVisible,
                resolveLayer: () => Number((window as any).siyuan?.zIndex),
                size: isSidebar ? undefined : config.appearance?.size,
                snap: config.behavior?.snap,
                marginPx: config.appearance?.marginPx,
                ariaLabel: this.i18n.switchTabs,
                onOpenSwitcher: () => {
                    const current: any = this.getSettings().floatingBall || {};
                    if (!(this.fabModalDepth === 0 || current.behavior?.yieldToModals === false)) return;
                    const requested = current.clickAction?.[surface] || "switcher";
                    const moreActionId = "__floating-ball-more__";
                    if (requested === moreActionId || requested === "more") {
                        this.refreshFloatingBallPanels();
                        this.floatingBallPanels.get(surface)?.openMore();
                        return;
                    }
                    const descriptor = current.actions?.[surface]?.find((entry: any) => entry.actionId === requested);
                    const resolved = resolveFloatingBallClickAction(requested, this.getFloatingBallActions(), surface, {
                        descriptor,
                        resolveSupport: (action: IQuickAction, target: QuickActionTarget) => this.getQuickActionSupport(action, target),
                    });
                    this.executeFloatingBallSurfaceAction(surface, resolved.action);
                },
                onOpenMore: () => {
                    this.refreshFloatingBallPanels();
                    this.floatingBallPanels.get(surface)?.openMore();
                },
                onBeforeTargeting: () => this.refreshFloatingBallPanels(),
                onDismissOverlays: () => this.floatingBallPanels.get(surface)?.closeMore({restoreFocus: false}),
                onActionTarget: (target) => {
                    const actionButton = target.closest("[data-action-id]") as HTMLElement | null;
                    actionButton?.click();
                },
                onPositionChange: (next) => this.persistFloatingBallPosition(surface, next),
            });
            this.floatingBallUis.set(surface, controller);
        }
        controller.update({
            position,
            touchSlopPx: config.behavior?.touchSlopPx,
            idleOpacity: config.appearance?.idleOpacity,
            idleDelayMs: config.appearance?.idleDelayMs,
            halfHide: config.appearance?.halfHide,
            hideOnFullscreen: config.behavior?.hideOnFullscreen,
            hideOnScroll: config.behavior?.hideOnScroll,
            size: isSidebar ? undefined : config.appearance?.size,
            snap: config.behavior?.snap,
            marginPx: config.appearance?.marginPx,
            ariaLabel: this.i18n.switchTabs,
        });
        controller.mount();
        const container = controller.getElement();
        if (container) {
            const panelOptions = {
                document,
                container,
                surface,
                config,
                actions: this.getFloatingBallActions(),
                includeBuiltins: false,
                labels: {
                    more: this.i18n.floatingBallMore,
                    close: this.i18n.close,
                    unavailable: this.i18n.quickActionUnavailable,
                    empty: this.i18n.quickActionUnavailable,
                    search: this.i18n.floatingBallActionSearch,
                    noResults: this.i18n.quickPickerEmpty,
                    builtin: this.i18n.quickBuiltin,
                    component: this.i18n.secondPanel,
                    plugin: this.i18n.floatingBallPluginActions,
                    other: this.i18n.floatingBallOtherActions,
                    unknown: this.i18n.quickSupportUnknown,
                    mobileTry: this.i18n.floatingBallMobileTryStatus,
                    providerMissing: this.i18n.floatingBallProviderMissing,
                    disabled: this.i18n.floatingBallActionDisabled,
                    enabled: this.i18n.floatingBallEnabled,
                    manage: this.i18n.floatingBallManageActions,
                    toggleFailed: this.i18n.quickActionFailed,
                    builtins: {
                        switcher: this.i18n.switchTabs, search: this.i18n.quickBuiltinSearch,
                        journal: this.i18n.quickBuiltinJournal, settings: this.i18n.quickBuiltinSettings,
                        home: this.i18n.secondPanel,
                    },
                },
                onAction: (action: unknown) => this.executeFloatingBallSurfaceAction(surface, action),
                resolveSupport: (action: IQuickAction, target: QuickActionTarget) => this.getQuickActionSupport(action, target),
                onManageSettings: () => this.openSetting("floatingBall"),
                onToggleAction: (actionId: string, enabled: boolean) => {
                    const current = this.getSettings().floatingBall;
                    this.updateSettings({floatingBall: {
                        ...current,
                        actions: {...current.actions, [surface]: current.actions[surface].map((entry: any) =>
                            entry.actionId === actionId ? {...entry, enabled} : entry)},
                    }});
                },
                onOpenMore: () => controller?.setState("more"),
                onCloseMore: () => {
                    if (controller?.getState() === "more") controller.setState("docked");
                },
            };
            let panel = this.floatingBallPanels.get(surface);
            if (!panel) {
                panel = createFloatingBallPanelController(panelOptions);
                if (panel) {
                    this.floatingBallPanels.set(surface, panel);
                    panel.mount();
                }
            } else {
                panel.update(panelOptions);
            }
        }
        return controller;
    }

    private destroyFloatingBallSurface(surface: FloatingBallSurface) {
        this.floatingBallPanels.get(surface)?.destroy();
        this.floatingBallPanels.delete(surface);
        const controller = this.floatingBallUis.get(surface);
        controller?.destroy();
        this.floatingBallUis.delete(surface);
        if (surface === "mobile") {
            this.floatingBallUi = null;
            this.fabElement = null;
        }
    }

    private persistFloatingBallPosition(surface: FloatingBallSurface, position: FloatingBallPosition) {
        const current = this.getSettings();
        const currentBall = current.floatingBall || {};
        this.updateSettings({
            floatingBall: {
                ...currentBall,
                position: {
                    ...(currentBall.position || {}),
                    [surface]: {...position},
                },
            },
        });
    }

    private suspendFABForDialog(onDestroy?: () => void): () => void {
        // T-6481：不再覆写 dialog.destroy——宿主 Dialog 的 destroyCallback 才是契约，
        // 且 Escape / 遮罩关闭也会走到它。这里返回释放函数，由调用方接进 destroyCallback。
        // T-6487：原实现在非移动端直接 return，onDestroy 永不触发——桌面端用 Escape 关掉
        // 日记笔记本选择弹窗时，调用方 Promise 会永久挂起。
        const modalControllers = [...this.floatingBallUis.values()];
        const shouldYield = this.getSettings().floatingBall?.behavior?.yieldToModals !== false;
        // Count dialogs even when no ball exists yet: enabling a surface from
        // Settings must not put a newly mounted ball above that dialog.
        this.fabModalDepth += 1;
        this.floatingBallPanels.forEach((panel) => panel?.closeMore({restoreFocus: false}));
        if (shouldYield) {
            modalControllers.forEach((controller) => controller.setSuspended(true));
            this.fabElement?.classList.add("sw__fab--hidden");
        }
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.fabModalDepth = Math.max(0, this.fabModalDepth - 1);
            onDestroy?.();
            if (this.fabModalDepth === 0) {
                this.floatingBallUis.forEach((controller) => controller.setSuspended(false));
                this.fabElement?.classList.remove("sw__fab--hidden");
            }
        };
    }

    private updateFABVisibility() {
        this.updateFloatingBallVisibility();
    }

    /** Refresh all spatial entries after settings/data or host layout changes. */
    private updateFloatingBallVisibility() {
        const settings = this.getSettings();
        const config = settings.floatingBall || {};
        const enabled = (surface: FloatingBallSurface) => Boolean(config.enabled?.[surface]);
        // ADR 0072: the sidebar portal is withdrawn (it duplicated the
        // desktop-window ball inside the same host window). The sweep below
        // still destroys a stale sidebar controller left by an earlier release.
        const surfaces: FloatingBallSurface[] = this.isMobile ? ["mobile"] : ["desktop"];

        // A frontend switch/hot reload must not leave a controller from the
        // previous surface alive.  The controller's destroy is idempotent.
        (Object.freeze(["desktop", "sidebar", "mobile"]) as FloatingBallSurface[])
            .filter((surface) => !surfaces.includes(surface))
            .forEach((surface) => this.destroyFloatingBallSurface(surface));

        surfaces.forEach((surface) => {
            if (!enabled(surface)) {
                this.destroyFloatingBallSurface(surface);
                return;
            }
            const controller = this.createFloatingBallSurface(surface);
            const suspended = this.fabModalDepth > 0 && config.behavior?.yieldToModals !== false;
            controller.setSuspended(suspended);
            if (surface === "mobile") {
                this.floatingBallUi = controller;
                this.fabElement = controller.getElement();
                this.fabElement?.classList.toggle("sw__fab--hidden", suspended);
            }
        });
    }

    // 手机端顶栏入口按钮：思源 3.8.x 手机端 addTopBar 只会进右侧菜单"扩展"分组，
    // 这里直接插入 mobileTopBar（旧版无此元素时静默跳过，不影响其他入口）。
    // 切换器入口 + 日记入口各自独立注入，常规运行每个在首次时插入一次即可。
    private ensureMobileTopBarButton() {
        const topBar = document.getElementById("mobileTopBar") || document.getElementById("toolbar");
        if (!topBar) {
            return;
        }
        // 切换器入口（外部只有一个六边形按钮；日记按钮位于切换器弹窗顶栏内）
        if (!this.mobileTopBarButton?.isConnected && !topBar.querySelector("#swMobileTopBarBtn")) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.id = "swMobileTopBarBtn";
            btn.className = "toolbar__button";
            btn.setAttribute("aria-label", this.i18n.switchTabs);
            btn.innerHTML = `<svg><use xlink:href="#iconLayout"></use></svg>`;
            btn.addEventListener("click", () => {
                this.showSwitcher();
            });
            topBar.appendChild(btn);
            this.mobileTopBarButton = btn;
        }
        // Keep our entry off the very end of the bar: the host's trailing
        // controls (close/more) own that spot, and appending used to overlap
        // them. Also repositions buttons appended by older releases.
        const existing = this.mobileTopBarButton?.isConnected
            ? this.mobileTopBarButton
            : topBar.querySelector<HTMLElement>("#swMobileTopBarBtn");
        if (existing && existing.nextElementSibling !== null) {
            const topBarChildren = Array.from(topBar.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
            const insertAnchor = topBarChildren[topBarChildren.length - 1];
            if (insertAnchor && insertAnchor !== existing) {
                topBar.insertBefore(existing, insertAnchor);
            }
        }
    }

    // ==================== 渚ц竟鏍忔ā寮?====================

    // 在 dock 面板内渲染紧凑版切换器（单列卡片，常驻侧边栏便于快速切换）
    private renderSidebarPanel(element: HTMLElement) {
        if (!element) {
            return;
        }
        const previousScrollElement = element.querySelector<HTMLElement>(".sw__scroll");
        const previousSearchFilters = previousScrollElement
            ? this.docSearchState.filters.get(previousScrollElement)
            : undefined;
        const previousSearchQuery = element.querySelector<HTMLInputElement>(".sw__search")?.value || "";
        if (previousScrollElement) {
            disposeDocSearchSession.call(this, previousScrollElement);
        }
        this.sidebarHistoryDropdownDispose?.();
        this.sidebarHistoryDropdownDispose = null;
        this.sidebarSearchFilterDispose?.();
        this.sidebarSearchFilterDispose = null;
        this.sidebarElement = element;
        element.classList.add("speed-switch", "sw__body", "sw--sidebar");
        this.setSyncPresentation(this.syncing);
        // 侧边栏缩略图布局：enlarge（默认）放大填满栏宽；columns 按宽度自动增加列数
        element.classList.toggle("sw--sidebar-columns", this.getSettings().sidebarLayout === "columns");
        element.innerHTML = this.buildSidebarHtml();
        // T-6758: the sidebar host is created/replaced by SiYuan lazily.  Run
        // reconciliation after the host's own markup is ready so mounting the
        // portal cannot be lost to this render's innerHTML replacement.
        this.updateFloatingBallVisibility();
        this.observeSidebarIcons(element);

        const tabs = getAllTabs();
        this.pruneThumbCache(tabs);
        const activeTab = this.getActiveTab();
        const refresh = () => this.refreshSidebar();
        const listOpts = {onOverlayClose: refresh, onTabsChanged: refresh};
        const updatedMap: {[rootId: string]: string} = {};
        const scrollElement = element.querySelector<HTMLDivElement>(".sw__scroll");
        if (!scrollElement) {
            return;
        }
        if (previousSearchFilters) {
            this.docSearchState.filters.set(scrollElement, Object.freeze({...previousSearchFilters}));
        }
        this.renderList(scrollElement, tabs, activeTab, listOpts, this.getSettings().sortBy, updatedMap);

        // 「最近编辑」排序需要文档更新时间：后台查询一次，完成后若仍处于该排序且未搜索则重排
        this.loadUpdatedMap(tabs).then((map) => {
            Object.assign(updatedMap, map);
            const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
            if (element.isConnected && this.getSettings().sortBy === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
            }
        });

        // 面板尺寸变化时仅重算缩略图缩放比例（ResizeObserver 覆盖拖动分隔条等所有场景）
        this.observeSidebarResize(element);
        // 顶栏交互：搜索 / 收藏下拉 / 排序 / 设置 / 回到顶部
        this.sidebarHistoryDropdownDispose = this.bindSidebarToolbarEvents(element, scrollElement, refresh);
        const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
        if (searchInput && (previousSearchQuery || hasDocSearchFilter.call(this, scrollElement))) {
            searchInput.value = previousSearchQuery;
            this.applySearch(scrollElement, searchInput, refresh);
        }
        this.renderQuickActions(element, "sidebar", element.querySelector<HTMLInputElement>(".sw__search"), refresh);
    }

    // 侧边栏 DOM 骨架：搜索 + 收藏下拉 + 排序 + 设置 + 滚动区 + 回到顶部
    private buildSidebarHtml(): string {
        return `<div class="sw__content">
    <div class="sw__toolbar">
        <div class="sw__search-wrap">
            <svg class="sw__search-icon" width="14" height="14"><use xlink:href="#iconSearch"></use></svg>
            <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" aria-label="${this.i18n.searchTabs}" />
            <button type="button" class="sw__search-filter-btn" aria-label="${this.i18n.searchFilters}" title="${this.i18n.searchFilters}">
                <svg width="15" height="15"><use xlink:href="#iconFilter"></use></svg>
            </button>
        </div>
        <div class="sw__select-wrap">
            <div class="sw__fav-dd"></div>
        </div>
        <div class="sw__select-wrap">
            <button type="button" class="b3-button b3-button--text sw__sort-trigger" aria-label="${this.i18n.setSortBy}">
                <svg width="18" height="18"><use xlink:href="#iconSort"></use></svg>
                <span class="sw__sort-trigger-label"></span>
            </button>
        </div>
        <div class="sw__history-dd sw__history-dd--icon"></div>
        <button type="button" class="b3-button b3-button--text sw__icon-btn sw__settings-btn" aria-label="${this.i18n.settings}" title="${this.i18n.settings}">
            <svg width="16" height="16"><use xlink:href="#iconSettings"></use></svg>
        </button>
    </div>
    <div class="sw__scroll" tabindex="0"></div>
    <div class="sw__quick-actions" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
    <button type="button" class="sw__back-top b3-tooltips b3-tooltips__n" aria-label="${this.i18n.backTop}">
        <svg><use xlink:href="#iconUp"></use></svg>
    </button>
</div>`;
    }

    // 侧边栏尺寸监听：拖动分隔条等场景只重算缩略图缩放，不重建 DOM
    private observeSidebarResize(element: HTMLElement) {
        if (this.sidebarResizeObserver) {
            this.sidebarResizeObserver.disconnect();
        }
        if (typeof ResizeObserver !== "function") {
            this.sidebarResizeObserver = null;
            return;
        }
        this.sidebarResizeObserver = new ResizeObserver(() => {
            this.rescaleThumbs(element);
            // T-6762/B5: the divider can resize the dock without a viewport
            // resize. Ask the existing controller to re-read host bounds;
            // this is one event-driven style update, with no polling.
            this.floatingBallUis.get("sidebar")?.update({});
        });
        this.sidebarResizeObserver.observe(element);
    }

    // 常驻 dock 会经历宿主重绘与插件内容增量替换；与弹窗相同地按帧合并 SVG
    // 尺寸钳制，避免样式短暂失效时浏览器 300×150 默认尺寸把工具栏撑开。
    private observeSidebarIcons(element: HTMLElement) {
        this.sidebarIconObserver?.disconnect();
        this.sidebarIconFrameCancel?.();
        this.sidebarIconFrameCancel = null;
        const schedule = () => {
            if (this.sidebarIconFrameCancel) return;
            const run = () => {
                this.sidebarIconFrameCancel = null;
                if (element.isConnected) clampOversizedIcons(element);
            };
            if (typeof requestAnimationFrame === "function") {
                const frame = requestAnimationFrame(run);
                this.sidebarIconFrameCancel = () => cancelAnimationFrame(frame);
            } else {
                const timer = window.setTimeout(run, 16);
                this.sidebarIconFrameCancel = () => window.clearTimeout(timer);
            }
        };
        this.sidebarIconObserver = typeof MutationObserver === "function"
            ? new MutationObserver(schedule) : null;
        this.sidebarIconObserver?.observe(element, {childList: true, subtree: true});
        schedule();
    }

    // 侧边栏顶栏事件：搜索 / 收藏下拉 / 排序切换 / 设置 / 回到顶部
    private bindSidebarToolbarEvents(element: HTMLElement, scrollElement: HTMLDivElement, refresh: IOverlayClose): () => void {
        // 搜索：与弹窗一致，页签匹配在上、全库文档在下
        const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
        const disposeHistoryDropdown = this.setupOpenHistoryDropdown(element.querySelector<HTMLElement>(".sw__history-dd"), refresh);
        this.sidebarSearchFilterDispose = searchInput
            ? bindDocSearchFilter.call(this, element, scrollElement, searchInput, refresh)
            : null;
        this.bindSearchInputComposition(searchInput, () => {
            this.applySearch(scrollElement, searchInput, refresh);
        });

        // 鏀惰棌涓嬫媺缁勪欢锛氭槦鏍囪Е鍙?+ 鍒嗙粍闈㈡澘锛堜晶杈规爮璺宠浆鍚庝粎鍒锋柊鍒楄〃锛?
        const favDd = element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, refresh, refresh);

        // 分组·排序一体化浮层（与弹窗同款，浮层挂 body 不受 dock 层级影响）
        this.bindSortTriggerMenu(element,
            () => this.refreshSidebar(),
            () => this.refreshSidebar());

        element.querySelector(".sw__settings-btn")?.addEventListener("click", () => {
            this.openSetting();
        });

        const backTopBtn = element.querySelector<HTMLElement>(".sw__back-top");
        scrollElement.addEventListener("scroll", () => {
            backTopBtn?.classList.toggle("sw__show", scrollElement.scrollTop >= BACK_TOP_THRESHOLD_PX);
        });
        backTopBtn?.addEventListener("click", () => {
            scrollElement.scrollTo({top: 0, behavior: "smooth"});
        });
        return disposeHistoryDropdown;
    }

    // 重算容器内全部缩略图的缩放比例（侧边栏尺寸变化时调用，内容随面板宽度自动伸缩）
    // 侧栏刷新合并：loaded/destroy 事件连发（如批量打开/关闭）时合并为一次重建，
    // 避免逐事件全量重建侧栏 DOM；150ms 尾沿触发
    private scheduleSidebarRefresh() {
        if (this.sidebarRefreshTimer) return;
        this.sidebarRefreshTimer = window.setTimeout(() => {
            this.sidebarRefreshTimer = 0;
            if (!this.syncing && this.sidebarElement?.isConnected) this.refreshSidebar();
        }, 150);
    }

    private rescaleThumbs(container: HTMLElement) {
        container.querySelectorAll<HTMLElement>(".sw__thumb").forEach((thumb) => {
            const content = thumb.querySelector<HTMLElement>(".sw__thumb-content");
            const width = thumb.clientWidth;
            if (content && width > 0) {
                content.style.transform = `scale(${(width / CONTENT_WIDTH_PX).toFixed(3)})`;
                content.style.visibility = "visible";
            }
        });
    }

    // 刷新侧边栏列表（面板仍连接在 DOM 上时）
    private refreshSidebar() {
        if (this.syncing) return;
        if (this.sidebarElement?.isConnected) {
            this.renderSidebarPanel(this.sidebarElement);
        }
    }

    // 轻量刷新：仅更新侧边栏卡片的当前页签高亮（switch-protyle 高频触发，避免重建列表）
    private refreshSidebarActive() {
        const element = this.sidebarElement;
        if (!element?.isConnected) {
            return;
        }
        const activeId = this.getActiveTab()?.id;
        element.querySelectorAll<HTMLElement>(".sw__card").forEach((card) => {
            card.classList.toggle("sw__active", card.dataset.tabId === activeId);
        });
    }

    // 鎵撳紑锛堟垨鑱氱劍宸叉墦寮€鐨勶級渚ц竟鏍忛潰鏉?
    private toggleSidebar() {
        const type = this.name + SIDEBAR_DOCK_TYPE;
        try {
            const dock = this.getDockByType(type);
            if (dock) {
                dock.toggleModel(type, true);
                this.refreshSidebar();
            }
        } catch (e) {
            logger.warn("toggle sidebar fail", e);
        }
    }

    // 读取 MRU 记录；防御性收敛（过滤非字符串/去重/截断），兼容历史已膨胀的存量数据
    private getMru(): string[] {
        const data = this.data[MRU_KEY];
        return capMru(Array.isArray(data) ? data : [], MRU_MAX);
    }

    private getOpenHistory(): IOpenHistoryEntry[] {
        return sanitizeOpenHistory(this.data[HISTORY_KEY], HISTORY_MAX).items;
    }

    private removeOpenHistoryEntry(key: string) {
        if (typeof key !== "string" || !key) return;
        const history = this.getOpenHistory();
        const result = removeRecentEntry(history, key, "key");
        if (!result.changed) return;
        this.data[HISTORY_KEY] = result.items;
        this.saveDataDebounced(HISTORY_KEY);
        this.refreshOpenHistoryDropdowns();
    }

    private removeClosedHistoryEntry(rootId: string) {
        const history = this.getClosedHistory();
        const result = removeRecentEntry(history, rootId, "rootId");
        if (!result.changed) return;
        this.data[CLOSED_HISTORY_KEY] = result.items;
        this.saveDataDebounced(CLOSED_HISTORY_KEY);
        this.refreshOpenHistoryDropdowns();
    }

    private recordOpenHistory(tab: Tab) {
        const key = this.pinKeyOf(tab);
        if (!key) return;
        const rootId = this.rootIdOf(tab);
        const title = this.titleOf(tab) || key;
        const result = recordRecentOpen(this.getOpenHistory(), this.getClosedHistory(), {key, rootId, title, ts: Date.now()}, HISTORY_MAX);
        this.data[HISTORY_KEY] = result.open;
        this.saveDataDebounced(HISTORY_KEY);
        if (result.closed.length !== this.getClosedHistory().length) {
            this.data[CLOSED_HISTORY_KEY] = result.closed;
            this.saveDataDebounced(CLOSED_HISTORY_KEY);
        }
        this.refreshOpenHistoryDropdowns();
    }

    private getClosedHistory(): Array<{rootId: string; title: string; closedAt: number}> {
        return normalizeClosedEntries(this.data[CLOSED_HISTORY_KEY], HISTORY_MAX).items;
    }

    private captureRecentOpenSnapshot() {
        const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const next = new Map<string, string>();
        tabs.forEach((tab) => {
            const rootId = this.rootIdOf(tab);
            if (rootId && BLOCK_ID_RE.test(rootId)) {
                next.set(rootId, this.titleOf(tab) || rootId);
            }
        });
        this.recentOpenSnapshot = next;
    }

    private scheduleRecentClosedSync() {
        if (this.recentClosedSyncTimer !== null) {
            window.clearTimeout(this.recentClosedSyncTimer);
        }
        const generation = this.lifecycleGeneration;
        this.recentClosedSyncTimer = window.setTimeout(() => {
            this.recentClosedSyncTimer = null;
            if (generation !== this.lifecycleGeneration) return;
            this.syncRecentClosedFromSnapshot(generation);
        }, Math.max(TAB_SETTLE_MS, 30));
    }

    private syncRecentClosedFromSnapshot(generation = this.lifecycleGeneration) {
        if (generation !== this.lifecycleGeneration) return;
        if (this.recentOpenSnapshot.size === 0) return;
        const tabs = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const current = new Set<string>();
        tabs.forEach((tab) => {
            const rootId = this.rootIdOf(tab);
            if (rootId && BLOCK_ID_RE.test(rootId)) current.add(rootId);
        });
        let state: {open: unknown[]; closed: Array<{rootId: string; title: string; closedAt: number}>} = {
            open: [],
            closed: this.getClosedHistory(),
        };
        this.recentOpenSnapshot.forEach((title, rootId) => {
            if (!current.has(rootId)) {
                state = applyRecentEvent(state, {type: "close", rootId, title, closedAt: Date.now()}) as typeof state;
            }
        });
        const closed = normalizeClosedEntries(state.closed, HISTORY_MAX).items;
        const previousClosed = this.getClosedHistory();
        if (closed.length !== previousClosed.length
            || closed.some((item, index) => item.rootId !== previousClosed[index]?.rootId)) {
            this.data[CLOSED_HISTORY_KEY] = closed;
            this.saveDataDebounced(CLOSED_HISTORY_KEY);
            this.refreshOpenHistoryDropdowns();
        }
        this.recentOpenSnapshot = new Map(tabs.map((tab) => {
            const rootId = this.rootIdOf(tab);
            return rootId ? [rootId, this.titleOf(tab) || rootId] as [string, string] : null;
        }).filter((item): item is [string, string] => Boolean(item)));
    }
}
declare module "./document-widget-model" {
    export function favoriteDocumentIdsForProbe(value: unknown, config: unknown): string[];
    export function buildFavoritesWidgetSnapshot(value: unknown, documents: unknown, openedKeys: unknown, config: unknown, labels?: Record<string, string>): any;
    export function buildDocumentSetsWidgetSnapshot(value: unknown, config: unknown, labels?: Record<string, string>): any;
    export function normalizeFixedDocumentConfig(value: unknown): {docId: string; title: string; showPath: boolean};
    export function buildFixedDocumentSnapshot(documents: unknown, config: unknown, labels?: Record<string, string>): any;
}
