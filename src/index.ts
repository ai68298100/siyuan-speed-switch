import {Plugin, Dialog, Menu, getFrontend, getAllTabs, getActiveTab, openTab, showMessage} from "siyuan";
import "./index.scss";
import {logger} from "./logger";
import {clampNum, stableSortBy, normalizeSortBy, groupFavoritesByGroup, resolveIconFallback, resolveIconReference, buildTabGroupsByParent, resolveTabRootId, planGroupOpenFavorites, sanitizeDocIds, capMru, sanitizeFavorites, sanitizeStringList, isSuccessfulMobileTabsResult} from "./util";
import {createSearchSession, beginSearch, cacheSearchResult, disposeSearchSession} from "./search-session";
import {aggregateSearchResults, buildFullTextSearchRequest, extractSearchRecords} from "./search-model";
import {
    sanitizeQuickActions,
    getDefaultQuickActions,
    getBuiltinQuickActions,
    getDefaultQuickActionTargets,
    resolveQuickActionSupport,
    shouldRenderQuickAction,
    appendQuickAction,
} from "./quick-actions";
import {mountQuickActionPicker} from "./quick-actions-ui";
import {
    SEARCH_DEBOUNCE_MS,
    DOC_RESULT_LIMIT,
    DOC_SEARCH_CACHE_LIMIT,
    SAVE_DEBOUNCE_MS,
    FAB_HIDE_DELAY_MS,
    BACK_TOP_THRESHOLD_PX,
    MESSAGE_DEFAULT_MS,
    UPDATED_CACHE_MS,
    NOTEBOOK_FETCH_TIMEOUT_MS,
    TAB_SETTLE_MS,
    TAB_VERIFY_TIMEOUT_MS,
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
    BLOCK_ID_RE,
    FAV_PANEL_WIDTH_PX,
    FAV_PANEL_MAX_HEIGHT_PX,
    FAV_PANEL_MIN_HEIGHT_PX,
    MRU_KEY,
    HISTORY_KEY,
    PINNED_KEY,
    FAV_KEY,
    FAV_GROUPS_KEY,
    SETTINGS_KEY,
    THUMB_CACHE_KEY,
    FAV_COLLAPSED_KEY,
    QUICK_ACTIONS_KEY,
    QUICK_ACTIONS_MAX,
    SIDEBAR_DOCK_TYPE,
    DEFAULT_HOTKEY,
    LEGACY_HOTKEY,
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
    export function groupFavoritesByGroup<T extends {group?: string}>(favorites: T[], groupNames: string[]): Map<string, T[]>;
    export function resolveIconFallback(raw: string): {type: "svg", value: string} | {type: "emoji", value: string};
    export function resolveIconReference(raw: unknown, availableSymbols: Iterable<string> | null | undefined, fallback?: string | string[]): {type: "svg", value: string} | {type: "emoji", value: string};
    export function buildTabGroupsByParent<T extends {parent?: {element?: HTMLElement, headersElement?: HTMLElement}}>(
        tabs: T[], fallbackKey: HTMLElement,
    ): Map<HTMLElement, Array<{tab: T}>>;
    export function resolveTabRootId(tab: {model?: IProtyleTabModel, headElement?: HTMLElement}): string | null;
    export function planGroupOpenFavorites<T extends {key: string}>(
        favorites: T[], openedKeys: Set<string>, resolveRootId: (favorite: T) => string,
    ): {targets: Array<{favorite: T, rootId: string}>, invalid: number};
    export function sanitizeFavorites(values: unknown): {items: IFavoriteItem[], changed: boolean};
    export function sanitizeStringList(values: unknown): {items: string[], changed: boolean};
    export function isSuccessfulMobileTabsResult(result: unknown): boolean;
    export function sanitizeQuickActions(values: unknown, max?: number): {items: IQuickAction[], changed: boolean};
    export function getDefaultQuickActions(): IQuickAction[];
    export function getBuiltinQuickActions(): IQuickAction[];
}

declare module "./quick-actions" {
    export function sanitizeQuickActions(values: unknown, max?: number): {items: IQuickAction[], changed: boolean};
    export function getDefaultQuickActions(): IQuickAction[];
    export function getBuiltinQuickActions(): IQuickAction[];
    export function getDefaultQuickActionTargets(kind: string, value: string, declaredTargets?: string[]): string[];
    export function resolveQuickActionSupport(kind: string, value: string, target: string, declaredTargets?: string[]): "supported" | "unsupported" | "unknown";
    export function shouldRenderQuickAction(action: IQuickAction, surface: string, context?: string, declaredTargets?: string[]): boolean;
    export function appendQuickAction(actions: IQuickAction[], candidate: Partial<IQuickAction> & {declaredTargets?: string[]}, max?: number): {items: IQuickAction[], added: boolean, reason: string};
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

// 鍗＄墖涓夋寜閽墍闇€鍥炬爣 symbol锛堜笌瀹樻柟 litheness sprite 鍚屽悕鍚屽舰锛夛細
// 鎵嬫満绔ā鏉夸笉鍚唴鑱?symbol锛屽畼鏂?sprite 鐢?loadAssets 寮傛娉ㄥ叆涓斾緷璧?App 鐗堟湰锛?
// 棣栧抚 <use> 寮曠敤鍒扮┖ symbol 鏃舵寜閽覆鏌撲负绌虹櫧锛堜笁鎸夐挳"闅愬舰"鏍瑰洜锛夛紝鎻掍欢椤昏嚜甯﹀厹搴?
const CARD_ICON_SPRITE =
    '<symbol id="iconUnpin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/></symbol>' +
    '<symbol id="iconPin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></symbol>' +
    '<symbol id="iconStar" viewBox="0 0 24 24" fill="var(--b3-icon-star-fill, none)" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></symbol>' +
    '<symbol id="iconClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>';

// 鍗曞垎缁勬覆鏌撲笂涓嬫枃锛氶伩鍏?renderTabGroup 褰㈠弬鍒楄〃鐖嗙偢锛屾墍鏈夊叡浜瓧娈垫墦鍖呭埌涓€涓璞?
interface ITabGroupRenderCtx {
    reusable: Map<string, HTMLElement>;
    activeTabId: string | undefined;
    pinned: Set<string>;
    favorites: Set<string>;
    mru: string[];
    settings: ISwSettings;
    opts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose};
}

// siyuan 鍖呮湭灏?Tab 浣滀负椤跺眰鍛藉悕瀵煎嚭锛岃繖閲屼粠 getAllTabs 杩斿洖绫诲瀷鎺ㄥ
type Tab = ReturnType<typeof getAllTabs>[number];

interface IDocSearchResult {
    id?: string;
    rootId?: string;
    name?: string;
    title?: string;
    path?: string;
    hPath?: string;
    snippets?: Array<{text?: string; blockId?: string | null}>;
    source?: string;
}

interface ISearchSession<T> {
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
        snippets: Array<{text: string; blockId?: string | null}>;
    }>};
    export function buildFullTextSearchRequest(input?: Record<string, unknown>): {
        endpoint: string;
        body: Record<string, unknown>;
    } | null;
    export function extractSearchRecords(payload: unknown): unknown[];
}

type DocSearchRenderState = "results" | "loading" | "error";

// IMobileTabEntry / IMobileTabsState 宸茶縼绉昏嚦 ./types.ts锛堟€濇簮鍏ㄥ眬瀵硅薄鐨勭浉鍏崇粨鏋勶級
// 椤电鎺掑簭鏂瑰紡锛歮ru=鏈€杩戜娇鐢?layout=鎵撳紑椤哄簭 layoutDesc=鎵撳紑鍊掑簭 titleAsc/titleDesc=鏍囬鍗囬檷搴?updatedDesc=鏈€杩戠紪杈?

// addDock 鍥炶皟閲岀殑 this 绫诲瀷锛堟€濇簮鎶婇潰鏉垮厓绱犳寕鍒板洖璋冭嚜韬殑 .element 涓婏級
interface IDockHandlerSelf {
    element?: HTMLElement;
}
type SortBy = "mru" | "layout" | "layoutDesc" | "titleAsc" | "titleDesc" | "updatedDesc";
type QuickActionDisplay = "full" | "icons" | "hidden";
const SORT_BY_LIST: SortBy[] = ["mru", "layout", "layoutDesc", "titleAsc", "titleDesc", "updatedDesc"];
// 椤电鍗＄墖鎿嶄綔瀹屾垚鍚庣殑鏀跺熬鍔ㄤ綔锛堝脊绐楁ā寮忛攢姣佸脊绐楋紝渚ц竟鏍忔ā寮忓埛鏂板垪琛級
type IOverlayClose = () => void;

// 瀛樺偍 key / dock type / 蹇嵎閿瓑娉ㄥ唽甯搁噺宸查泦涓埌 ./constants.ts锛圓DR-0002 閬楃暀闂幆锛寁0.16.5锛?

// 榛樿璁剧疆锛堝彲琚敤鎴疯缃鐩栵級
const DEFAULT_SETTINGS: ISwSettings = {
    dialogWidth: 880,      // 鍒囨崲鍣ㄥ脊绐楀搴?px
    dialogHeight: 600,     // 鍒囨崲鍣ㄥ脊绐楅珮搴?px
    columns: 0,            // 缂╃暐鍥惧垪鏁帮紝0=鑷姩
    thumbHeight: 128,      // 缂╃暐鍥鹃珮搴?px
    sortBy: "mru",         // 椤电鎺掑簭鏂瑰紡
    excludedDocks: [],     // 涓嶆樉绀哄湪宸︿晶鍒楄〃鐨勯潰鏉跨被鍨?
    dockDisplay: "full",   // 宸︿晶闈㈡澘鏄剧ず鏂瑰紡锛歨idden 闅愯棌 / collapsed 鎶樺彔鍥炬爣鏉?/ full 瀹屾暣鍒楄〃
    fullscreen: false,     // 鍏ㄥ睆妯″紡锛氬垏鎹㈠櫒閾烘弧鏁翠釜绐楀彛锛屾寜 Esc 閫€鍑?
    sidebarLayout: "enlarge", // 渚ц竟鏍忕缉鐣ュ浘甯冨眬锛歟nlarge 鏀惧ぇ濉弧鏍忓锛堥粯璁わ級/ columns 鎸夊搴﹁嚜鍔ㄥ姞鍒?
    fabEnabled: false,     // 鎵嬫満绔偓娴寜閽粯璁ゅ叧闂紝闇€瑕佺殑鐢ㄦ埛鍦ㄨ缃腑鎵撳紑
    mobileColumns: MOBILE_COLUMNS_AUTO, // 榛樿鑷姩锛堢珫灞忓崟鍒楋紝妯睆鍙屽垪锛?
    mobileThumbHeight: 80, // 鎵嬫満绔缉鐣ュ浘楂樺害
    journalNotebook: "",   // 榛樿鏃ヨ绗旇鏈?id锛岀┖=鏈缃紙棣栨鐐瑰嚮鏃ヨ鎸夐挳鏃跺脊鍑洪€夋嫨锛?
    lastSettingsTab: "appearance", // 璁剧疆闈㈡澘涓婃鎵€鍦ㄦ爣绛鹃〉锛堟墦寮€鏃剁洿鎺ヨ烦杞紝鎻愬崌鍙嶅杩涘叆璁剧疆鐨勬搷浣滄晥鐜囷級
    quickActions: getDefaultQuickActions() as IQuickAction[],
    quickActionsRightRail: false,
    quickActionsDisplayDesktop: "full",
    quickActionsDisplaySidebar: "full",
    quickActionsDisplayMobile: "full",
    quickActionsCollapsedDesktopBottom: false,
    quickActionsCollapsedDesktopRight: false,
    quickActionsCollapsedSidebar: false,
    quickActionsCollapsedMobile: false,
};

// 宸︿晶闈㈡澘鏄剧ず鏂瑰紡
type DockDisplay = "hidden" | "collapsed" | "full";
const DOCK_DISPLAY_LIST: DockDisplay[] = ["hidden", "collapsed", "full"];
// 渚ц竟鏍忕缉鐣ュ浘甯冨眬锛歟nlarge 鏀惧ぇ濉弧鏍忓锛堥粯璁わ級 / columns 鎸夊搴﹁嚜鍔ㄥ鍔犲垪鏁?
type SidebarLayout = "enlarge" | "columns";
const SIDEBAR_LAYOUT_LIST: SidebarLayout[] = ["enlarge", "columns"];

interface ISwSettings {
    dialogWidth: number;
    dialogHeight: number;
    columns: number;
    thumbHeight: number;
    sortBy: SortBy;
    excludedDocks: string[];
    dockDisplay: DockDisplay;
    fullscreen: boolean;       // 鍏ㄥ睆妯″紡锛氬垏鎹㈠櫒閾烘弧鏁翠釜绐楀彛锛孍sc 閫€鍑?
    sidebarLayout: SidebarLayout; // 渚ц竟鏍忕缉鐣ュ浘甯冨眬锛歟nlarge 鏀惧ぇ / columns 鑷姩鍔犲垪
    // 鎵嬫満绔?
    fabEnabled: boolean;       // 鏄惁鍚敤鎮诞鎸夐挳
    mobileColumns: number;     // 0=鍗曞垪 1=鍙屽垪 2=鑷姩
    mobileThumbHeight: number; // 鎵嬫満绔缉鐣ュ浘楂樺害
    journalNotebook: string;   // 榛樿鏃ヨ绗旇鏈?id锛岀┖=鏈缃?
    lastSettingsTab: string;   // 璁剧疆闈㈡澘涓婃鎵€鍦ㄦ爣绛鹃〉锛坅ppearance/behavior/panels/favorites/journal/mobile锛?
    quickActions: IQuickAction[];
    quickActionsRightRail: boolean;
    quickActionsDisplayDesktop: QuickActionDisplay;
    quickActionsDisplaySidebar: QuickActionDisplay;
    quickActionsDisplayMobile: QuickActionDisplay;
    quickActionsCollapsedDesktopBottom: boolean;
    quickActionsCollapsedDesktopRight: boolean;
    quickActionsCollapsedSidebar: boolean;
    quickActionsCollapsedMobile: boolean;
}

interface IGroupedTab {
    tab: Tab;
    card?: HTMLElement;
}

interface IDockPanel {
    type: string;
    title: string;
    icon: string;
}

type QuickActionTarget = "desktop" | "sidebar" | "mobile";
type QuickActionKind = "builtin" | "dock" | "adapter" | "command";
type QuickActionSupport = "supported" | "unsupported" | "unknown";
interface IQuickAction {
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

interface IQuickActionPickerCandidate {
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
}

interface IQuickActionPluginLike {
    name?: string;
    displayName?: string;
    i18n?: Record<string, string>;
    commands?: Array<{
        langKey?: string;
        langText?: string;
        icon?: string;
        callback?: () => void;
        globalCallback?: () => void;
    }>;
}

// 缂╃暐鍥剧紦瀛樻潯鐩細鏂囨。 rootID 鈫?鍐呭蹇収
interface IThumbCache {
    [rootId: string]: { title: string, html: string, ts: number };
}

// 妯″潡绾?WeakMap锛氭粴鍔ㄥ鍣?鈫?宸叉寕鐨?IntersectionObserver锛岄伩鍏嶅湪 HTMLElement 涓婅嚜鎸傜鏈夊睘鎬?
const thumbObserverCache = new WeakMap<HTMLElement, IntersectionObserver>();

// 鏀惰棌鏉＄洰锛氭枃妗ｉ〉绛惧瓨 rootId锛堝叧闂悗浠嶅彲閲嶅紑锛夛紱闈炴枃妗ｉ〉绛句粎瀛橀〉绛?id銆?
// 鏀惰棌椤规案涔呯暀瀛樼洿鍒扮敤鎴蜂富鍔ㄥ垹闄わ紱rootId 缂哄け鏃惰烦杞?鎵归噺鎵撳紑鐢?key 鍏滃簳锛堣 jumpToFavorite锛?
interface IFavoriteItem {
    key: string;       // pinKeyOf锛歳ootId || tab.id
    title: string;
    rootId: string | null;
    group: string;     // 鍒嗙粍鍚嶏紝绌哄瓧绗︿覆琛ㄧず鏈垎缁勶紙鏃ф暟鎹棤姝ゅ瓧娈垫寜鏈垎缁勫鐞嗭級
}

interface IOpenHistoryEntry {
    key: string;
    rootId: string | null;
    title: string;
    ts: number;
}

export default class SpeedSwitchPlugin extends Plugin {
    private isMobile = false;
    private docSearchSessions = new WeakMap<HTMLElement, ISearchSession<IDocSearchResult[]>>();
    private activeDocSearchSessions = new Set<ISearchSession<IDocSearchResult[]>>();
    private switcherRefreshers = new Set<() => void>();
    private quickActionAdapters = new Map<string, (value: string) => void | Promise<void>>();
    private quickActionAdapterTargets = new Map<string, QuickActionTarget[]>();
    private quickActionProviders = new Map<string, IQuickActionProvider>();
    private switcherRefreshFrame: number | null = null;
    private sidebarElement: HTMLElement | null = null; // 渚ц竟鏍?dock 闈㈡澘鍐呭鍏冪礌
    private sidebarResizeObserver: ResizeObserver | null = null; // 渚ц竟鏍忓昂瀵哥洃鍚紝鍙樺寲鏃堕噸绠楃缉鐣ュ浘缂╂斁
    private saveTimers = new Map<string, number>(); // 鍘绘姈鍐欑洏瀹氭椂鍣細MRU/缃《/鏀惰棌绛夐珮棰戞暟鎹悎骞惰惤鐩?
    private saveChains = new Map<string, Promise<void>>(); // 鍚屼竴 key 鐨勫啓鍏ヤ弗鏍间覆琛岋紝閬垮厤鏃ц姹傝鐩栨柊鏁版嵁
    private favCollapsed = new Set<string>(); // 鏀惰棌涓嬫媺涓凡鎶樺彔鐨勫垎缁勫悕锛堝凡鎸佷箙鍖栵紝閲嶅惎鍚庢仮澶嶏級
    private fabElement: HTMLElement | null = null; // 鎵嬫満绔偓娴寜閽?
    private fabModalDepth = 0; // Keep the floating button behind plugin dialogs, including nested transitions.
    private mobileTopBarButton: HTMLElement | null = null; // 鎵嬫満绔《鏍忓垏鎹㈠櫒鍏ュ彛鎸夐挳锛堣嚜琛屾敞鍏?mobileTopBar锛?
    private fabGestureBound = false; // FAB 婊氬姩鎵嬪娍鐩戝惉鏄惁宸茬粦瀹氾紙document 绾э紝鍙粦涓€娆★級
    private fabGestureHandlers: {touchstart: (e: TouchEvent) => void, touchmove: (e: TouchEvent) => void} | null = null;
    private cardTabs = new WeakMap<HTMLElement, Tab>(); // 澶嶇敤鍗＄墖濮嬬粓鎸囧悜鏈€鏂扮殑 Tab 瀵硅薄

    private groupOperationBusy = false;

    async onload() {
        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

        // 灏芥棭娉ㄥ叆鍗＄墖鎸夐挳鍥炬爣锛氬畼鏂?sprite 涓哄紓姝ユ敞鍏ワ紝棣栧抚娓叉煋鐨勪笁鎸夐挳鍙兘寮曠敤鍒扮┖ symbol
        this.addIcons(CARD_ICON_SPRITE);

        this.fixLegacyHotkey();
        await this.initPersistentData();

        this.addTopBar({
            icon: "iconLayout",
            title: this.i18n.switchTabs,
            position: "right",
            callback: () => {
                this.showSwitcher();
            },
        });

        // 娉ㄥ唽渚ц竟鏍?dock 闈㈡澘锛堟闈級涓庢墜鏈虹鍏ュ彛锛堥《鏍?+ FAB锛夛紝浜掓枼
        if (!this.isMobile) {
            this.registerDesktopDock();
        }
        if (this.isMobile) {
            this.registerMobileEntries();
        }

        this.bindGlobalEvents();
        this.addCommand({
            langKey: "switchTabs",
            hotkey: DEFAULT_HOTKEY,
            callback: () => {
                this.showSwitcher();
            },
        });
    }

    // 棰勫姞杞?7 涓寔涔呭寲 key锛歭oadData 鍐欏叆 this.data锛岃 getMru 绛夎兘璇诲埌鏃у€?
    private async initPersistentData() {
        await Promise.all([
            this.loadData(MRU_KEY),
            this.loadData(HISTORY_KEY),
            this.loadData(PINNED_KEY),
            this.loadData(FAV_KEY),
            this.loadData(FAV_GROUPS_KEY),
            this.loadData(FAV_COLLAPSED_KEY),
            this.loadData(QUICK_ACTIONS_KEY),
            this.loadData(SETTINGS_KEY),
            this.loadData(THUMB_CACHE_KEY),
        ]).catch((e) => logger.warn("load data fail", e));
        // 鍔犺浇鏈?sanitize锛氭竻鐞嗗巻鍙茶剰鏁版嵁锛?.16.5锛夛紝浠呭湪纭疄鍙樺寲鏃跺洖鍐欙紝閬垮厤姣忔鍚姩閲嶅啓鏂囦欢
        this.sanitizePersistentData();
        // 鏀惰棌鍒嗙粍鎶樺彔鐘舵€侊細浠庢寔涔呭寲鏁版嵁鍒濆鍖栵紙鏃х増鏈棤姝ゆ暟鎹椂涓洪粯璁ゅ睍寮€锛?
        this.initFavCollapsed();
    }

    // 鍔犺浇鏈熸暟鎹噣鍖栵細鏀惰棌鍒楄〃缁撴瀯鏍￠獙/鎸?key 鍘婚噸锛岀疆椤朵笌鍒嗙粍娉ㄥ唽琛ㄨ繃婊ら潪娉曞瓧绗︿覆
    private sanitizePersistentData() {
        const favorites = sanitizeFavorites(this.data[FAV_KEY]);
        if (favorites.changed) {
            this.data[FAV_KEY] = favorites.items;
            this.saveDataDebounced(FAV_KEY);
        }
        const pinned = sanitizeStringList(this.data[PINNED_KEY]);
        if (pinned.changed) {
            this.data[PINNED_KEY] = pinned.items;
            this.saveDataDebounced(PINNED_KEY);
        }
        const groups = sanitizeStringList(this.data[FAV_GROUPS_KEY]);
        if (groups.changed) {
            this.data[FAV_GROUPS_KEY] = groups.items;
            this.saveDataDebounced(FAV_GROUPS_KEY);
        }
        const history = this.sanitizeOpenHistory(this.data[HISTORY_KEY]);
        if (history.changed) {
            this.data[HISTORY_KEY] = history.items;
            this.saveDataDebounced(HISTORY_KEY);
        }
        const quickActions = sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY], QUICK_ACTIONS_MAX);
        if (quickActions.changed) {
            this.data[QUICK_ACTIONS_KEY] = quickActions.items;
            this.saveDataDebounced(QUICK_ACTIONS_KEY);
        }
    }

    // 妗岄潰渚ц竟鏍?dock锛氫笌鍒囨崲鍣ㄥ悓鏍风殑鍗＄墖鍒楄〃锛屽父椹讳究浜庡揩閫熷垏鎹紱
    // resize 鍙噸绠楃缉鐣ュ浘缂╂斁姣斾緥锛屼笉閲嶅缓鍒楄〃锛堥伩鍏嶉棯鐑佷笌婊氬姩浣嶇疆涓㈠け锛?
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

    // 鎵嬫満绔叆鍙ｏ細椤舵爮鎸夐挳锛堝父椹伙紝鎬濇簮 3.8.x 涓嶅紑鏀炬彃浠堕《鏍忥紝鑷鎻掑叆锛?
    // + 鎮诞鎸夐挳锛堝彲閫夛紝璁剧疆閲屽彲鍏筹級
    private registerMobileEntries() {
        this.ensureMobileTopBarButton();
        this.updateFABVisibility();
    }

    // 鍏ㄥ眬浜嬩欢锛氬垏鎹?/ 鎵撳紑 / 鍏抽棴椤电鏃跺悓姝ヤ晶杈规爮楂樹寒鎴栧叏閲忓埛鏂帮紱
    // 鎵嬫満绔『甯︾‘璁ゅ叆鍙ｆ寜閽粛鍦紙鍐呮牳涓埆鍦烘櫙浼氶噸寤洪《鏍?DOM锛?
    private bindGlobalEvents() {
        this.eventBus.on("switch-protyle", () => {
            this.refreshSidebarActive();
            this.scheduleOpenSwitchersRefresh();
            if (this.isMobile) {
                this.ensureMobileTopBarButton();
            }
        });
        // 椤电澧炲噺锛堟枃妗ｆ墦寮€/鍏抽棴锛夋椂鍒锋柊鎵€鏈夊凡鎵撳紑瑙嗗浘
        this.eventBus.on("loaded-protyle-static", () => {
            this.refreshSidebar();
            this.scheduleOpenSwitchersRefresh();
        });
        this.eventBus.on("destroy-protyle", () => {
            this.refreshSidebar();
            this.scheduleOpenSwitchersRefresh();
        });
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
        this.switcherRefreshFrame = requestAnimationFrame(() => {
            this.switcherRefreshFrame = null;
            this.refreshOpenSwitchers();
        });
    }

    // 甯冨眬灏辩华鍚庡啀娆＄‘璁ゆ墜鏈虹鍏ュ彛锛氶儴鍒嗘満鍨嬩笂 onload 鎵ц鏃堕《鏍忓皻鏈瀯寤哄畬鎴愶紝
    // 鎻掍欢鎸夐挳浼氭彃鍏ュけ璐ワ紱杩欓噷鍏滃簳閲嶈瘯涓€娆?
    onLayoutReady() {
        if (this.isMobile) {
            this.ensureMobileTopBarButton();
            this.updateFABVisibility();
        }
    }

    async onunload() {
        const pendingSaves = this.flushPendingSaves();
        this.activeDocSearchSessions.forEach((session) => disposeSearchSession(session));
        this.activeDocSearchSessions.clear();
        this.switcherRefreshers.clear();
        this.quickActionAdapters.clear();
        this.quickActionAdapterTargets.clear();
        this.quickActionProviders.clear();
        if (this.switcherRefreshFrame !== null) {
            cancelAnimationFrame(this.switcherRefreshFrame);
            this.switcherRefreshFrame = null;
        }
        this.sidebarResizeObserver?.disconnect();
        this.sidebarResizeObserver = null;
        this.removeDock(SIDEBAR_DOCK_TYPE);
        this.sidebarElement = null;
        this.fabElement?.remove();
        this.fabElement = null;
        this.fabModalDepth = 0;
        if (this.fabGestureHandlers) {
            document.removeEventListener("touchstart", this.fabGestureHandlers.touchstart);
            document.removeEventListener("touchmove", this.fabGestureHandlers.touchmove);
            this.fabGestureHandlers = null;
            this.fabGestureBound = false;
        }
        this.mobileTopBarButton?.remove();
        this.mobileTopBarButton = null;
        await pendingSaves;
    }

    // ==================== 鎸佷箙鍖栨€ц兘 ====================

    // 鍘绘姈鍐欑洏锛氶珮棰戞暟鎹紙MRU/缃《/鏀惰棌锛夋瘡娆℃搷浣滃彧鏇存柊鍐呭瓨锛屽悎骞跺悗寤惰繜钀界洏锛?
    // 閬垮厤杩炵画鏀惰棌/缃《/鍒囨崲椤电鏃舵瘡涓姩浣滈兘瑙﹀彂涓€娆″唴鏍告枃浠跺啓鍏ワ紙浜や簰鍗￠】鐨勬牴鍥狅級
    private saveDataDebounced(key: string) {
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

    // 绔嬪嵆钀界洏鍏ㄩ儴寰呭啓鏁版嵁锛堝嵏杞芥椂璋冪敤锛岄伩鍏嶄涪澶辨渶杩戜竴娆″幓鎶栫獥鍙ｅ唴鐨勬敼鍔級
    private flushPendingSaves(): Promise<void> {
        this.saveTimers.forEach((timer, key) => {
            clearTimeout(timer);
            this.queueSave(key, this.data[key]);
        });
        this.saveTimers.clear();
        return Promise.all(Array.from(this.saveChains.values())).then((): void => undefined);
    }

    // 鏃х増鏈粯璁ゅ揩鎹烽敭 "鈬р尌S" 鏃犳硶琚€濇簮鐑敭鍖归厤鍛戒腑锛屼笖鍙兘宸叉寔涔呭寲鍒板揩鎹烽敭閰嶇疆涓紝
    // 鍔犺浇鏃跺皢鍏朵慨姝ｄ负鍙尮閰嶇殑 "鈱モ嚙S"锛堢粍鍚堥敭涓嶅彉锛屼粛鏄?Alt+Shift+S锛?
    private fixLegacyHotkey() {
        try {
            const siyuan = getSiyuan();
            const keymapItem = siyuan?.config?.keymap?.plugin?.[this.name]?.switchTabs;
            if (keymapItem && keymapItem.custom === LEGACY_HOTKEY) {
                keymapItem.custom = DEFAULT_HOTKEY;
            }
        } catch (e) {
            // 閰嶇疆涓嶅彲鐢ㄦ椂蹇界暐锛岄粯璁ゅ€兼湰韬凡鏄纭『搴?
        }
    }

    // ==================== 璁剧疆 ====================

    // 璇诲彇璁剧疆锛氫笌榛樿鍊煎悎骞讹紝淇濊瘉鏂板瀛楁鏈夐粯璁ゅ€?
    private getSettings(): ISwSettings {
        // 纾佺洏璇诲彇鐨勬槸 unknown锛岃€佺増鏈?寮傚父鏁版嵁瀛楁鍙兘缂哄け锛屽叏閮ㄦ寜瀛楁閫愪竴闄嶇骇鍒伴粯璁ゅ€笺€?
        // 鐢?Partial<ISwSettings> 鎶婃暣涓?saved 涓€娆℃€ф敹绐勶紝鍚庣画瀛楁璁块棶灏变笉鍐嶉渶瑕佹瘡琛屾柇瑷€銆?
        const saved = this.data[SETTINGS_KEY] as Partial<ISwSettings> | null | undefined;
        if (!saved || typeof saved !== "object") {
            return {...DEFAULT_SETTINGS};
        }
        return {
            dialogWidth: this.clampNum(saved.dialogWidth, DIALOG_WIDTH_MIN_PX, DIALOG_WIDTH_MAX_PX, DEFAULT_SETTINGS.dialogWidth),
            dialogHeight: this.clampNum(saved.dialogHeight, DIALOG_HEIGHT_MIN_PX, DIALOG_HEIGHT_MAX_PX, DEFAULT_SETTINGS.dialogHeight),
            columns: this.clampNum(saved.columns, COLUMNS_MIN, COLUMNS_MAX, DEFAULT_SETTINGS.columns),
            thumbHeight: this.clampNum(saved.thumbHeight, THUMB_HEIGHT_MIN_PX, THUMB_HEIGHT_MAX_PX, DEFAULT_SETTINGS.thumbHeight),
            sortBy: normalizeSortBy(saved.sortBy, SORT_BY_LIST, DEFAULT_SETTINGS.sortBy) as SortBy,
            excludedDocks: Array.isArray(saved.excludedDocks)
                ? saved.excludedDocks.filter((t) => typeof t === "string")
                : [],
            dockDisplay: normalizeSortBy(saved.dockDisplay, DOCK_DISPLAY_LIST, DEFAULT_SETTINGS.dockDisplay) as DockDisplay,
            sidebarLayout: normalizeSortBy(saved.sidebarLayout, SIDEBAR_LAYOUT_LIST, DEFAULT_SETTINGS.sidebarLayout) as SidebarLayout,
            fullscreen: typeof saved.fullscreen === "boolean"
                ? saved.fullscreen : DEFAULT_SETTINGS.fullscreen,
            fabEnabled: typeof saved.fabEnabled === "boolean"
                ? saved.fabEnabled : DEFAULT_SETTINGS.fabEnabled,
            mobileColumns: this.clampNum(saved.mobileColumns, MOBILE_COLUMNS_MIN, MOBILE_COLUMNS_MAX, DEFAULT_SETTINGS.mobileColumns),
            mobileThumbHeight: this.clampNum(saved.mobileThumbHeight, MOBILE_THUMB_HEIGHT_MIN_PX, MOBILE_THUMB_HEIGHT_MAX_PX, DEFAULT_SETTINGS.mobileThumbHeight),
            journalNotebook: typeof saved.journalNotebook === "string"
                ? saved.journalNotebook : DEFAULT_SETTINGS.journalNotebook,
            lastSettingsTab: typeof saved.lastSettingsTab === "string"
                ? saved.lastSettingsTab : DEFAULT_SETTINGS.lastSettingsTab,
            quickActions: sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY], QUICK_ACTIONS_MAX).items,
            quickActionsRightRail: typeof saved.quickActionsRightRail === "boolean" ? saved.quickActionsRightRail : DEFAULT_SETTINGS.quickActionsRightRail,
            quickActionsDisplayDesktop: this.normalizeQuickActionDisplay(saved.quickActionsDisplayDesktop, DEFAULT_SETTINGS.quickActionsDisplayDesktop),
            quickActionsDisplaySidebar: this.normalizeQuickActionDisplay(saved.quickActionsDisplaySidebar, DEFAULT_SETTINGS.quickActionsDisplaySidebar),
            quickActionsDisplayMobile: this.normalizeQuickActionDisplay(saved.quickActionsDisplayMobile, DEFAULT_SETTINGS.quickActionsDisplayMobile),
            quickActionsCollapsedDesktopBottom: typeof saved.quickActionsCollapsedDesktopBottom === "boolean" ? saved.quickActionsCollapsedDesktopBottom : false,
            quickActionsCollapsedDesktopRight: typeof saved.quickActionsCollapsedDesktopRight === "boolean" ? saved.quickActionsCollapsedDesktopRight : false,
            quickActionsCollapsedSidebar: typeof saved.quickActionsCollapsedSidebar === "boolean" ? saved.quickActionsCollapsedSidebar : false,
            quickActionsCollapsedMobile: typeof saved.quickActionsCollapsedMobile === "boolean" ? saved.quickActionsCollapsedMobile : false,
        };
    }

    private normalizeQuickActionDisplay(value: unknown, fallback: QuickActionDisplay): QuickActionDisplay {
        return value === "full" || value === "icons" || value === "hidden" ? value : fallback;
    }

    private updateSettings(patch: Partial<ISwSettings>) {
        const settings = {...this.getSettings(), ...patch};
        this.data[SETTINGS_KEY] = settings;
        this.saveDataDebounced(SETTINGS_KEY);
        if (Object.keys(patch).some((key) => key !== "lastSettingsTab")) {
            this.refreshOpenSwitchers();
            if (this.sidebarElement?.isConnected) {
                this.refreshSidebar();
            }
        }
    }

    private clampNum(value: any, min: number, max: number, fallback: number): number {
        // 濮旀淳鍒?util.clampNum锛坧ure锛屼究浜庡崟鍏冩祴璇曪級锛沜lass 鍐呬繚鐣欐柟娉曠鍚嶄互渚跨幇鏈夎皟鐢ㄧ偣涓嶅彉
        return clampNum(value, min, max, fallback);
    }

    // ==================== 璁剧疆椤垫湰鍦版帶浠跺伐鍘傦紙缁熶竴鏍煎紡銆佸噺灏戦噸澶嶏級 ====================

    // 鏁板瓧杈撳叆锛氬彸渚у甫鍗曚綅鏍囩锛宑hange 鏃剁粡 clampNum 鏍￠獙鍚庡洖璋冿紱label 鐢ㄤ簬璇诲睆涓庣Щ鍔ㄧ璇箟
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

    // 涓嬫媺閫夋嫨鎺т欢
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

    // 寮€鍏筹紙鐢辨彃浠剁嫭绔嬫牱寮忔帶鍒讹紝閬垮厤涓婚 b3-switch 浼厓绱犲彔鍔狅級
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

    // 璁剧疆鏉＄洰锛氬乏渚ф爣棰?鍙€夋弿杩帮紝鍙充晶鎺т欢锛沜olumn 鏃舵帶浠跺崰婊℃暣琛?
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

    // 鎷夊彇宸叉墦寮€鐨勭瑪璁版湰鍒楄〃锛坕d + name锛夛紝鐢ㄤ簬榛樿鏃ヨ绗旇鏈笅鎷?
    private async loadNotebooks(): Promise<Array<{id: string, name: string}>> {
        // 鍐呮牳鏃犲搷搴旀椂瓒呮椂涓柇璇锋眰锛岄伩鍏嶈缃〉涓嬫媺涓€鐩村仠鍦ㄥ姞杞戒腑
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), NOTEBOOK_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch("/api/notebook/lsNotebooks", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: "{}",
                signal: controller.signal,
            });
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

    // 榛樿鏃ヨ绗旇鏈笅鎷夛紙寮傛濉厖宸叉墦寮€绗旇鏈紝褰撳墠鍊煎懡涓椂鍥炲～閫変腑锛?
    private notebookSelect(current: string, onPick: (id: string) => void): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "sw-settings__journal-sel";
        const sel = document.createElement("select");
        sel.className = "b3-select fn__flex-center";
        sel.disabled = true; // 鍔犺浇瀹屾垚鍓嶇鐢?
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

    // 鎵撳紑/鍒涘缓褰撴棩鏃ヨ锛氶粯璁ゆ棩璁版湰鏈缃椂鍏堝脊鍑轰笅鎷夐€夋嫨
    private async openJournal() {
        let notebook = this.getSettings().journalNotebook;
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
            // openTab 鍦ㄦ墜鏈虹鏄┖瀹炵幇锛岃蛋 MobileTabs.open
            this.mobileOpenDoc(id);
        } else {
            openTab({app: this.app, doc: {id}});
        }
    }

    // 璋冪敤鍐呮牳 createDailyNote锛氬凡鏈夊綋鏃ユ棩璁版椂杩斿洖鍏?id锛堜笉閲嶅鍒涘缓锛?
    private async ensureTodayJournal(notebook: string): Promise<string | null> {
        try {
            const response = await fetch("/api/filetree/createDailyNote", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({notebook}),
            });
            if (!response.ok) {
                throw new Error(`createDailyNote HTTP ${response.status}`);
            }
            const json = await response.json();
            if (json?.code === 0 && json?.data?.id) {
                return json.data.id;
            }
            logger.warn("createDailyNote fail", json);
            return null;
        } catch (e) {
            logger.warn("createDailyNote fail", e);
            return null;
        }
    }

    // 棣栨鐐瑰嚮鏃ヨ鎸夐挳锛氬脊绐楅€夋嫨榛樿鏃ヨ绗旇鏈紝閫夋嫨鍚庝繚瀛樺苟杩斿洖
    private promptJournalNotebook(): Promise<string> {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (value: string) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            const dialog = new Dialog({
                title: this.i18n.journalChoose,
                content: this.buildJournalPromptHtml(),
                width: "min(460px, 90vw)",
            });
            this.suspendFABForDialog(dialog, () => finish(""));
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

    // 绗旇鏈€夋嫨寮圭獥 HTML锛氭彁绀烘枃鏈?+ select 鍗犱綅 + 鍙栨秷/纭鎸夐挳
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

    // select 涓嶅瓨鍦ㄦ椂锛圖OM 鏈壘鍒板崰浣?div锛夊姩鎬佸垱寤轰竴涓紱姝ｅ父鎯呭喌涓?HTML 閲屽凡鏈夊崰浣?
    private createJournalSelect(dialog: Dialog): HTMLSelectElement {
        const sel = document.createElement("select");
        sel.className = "b3-select fn__flex-center fn__block";
        sel.disabled = true;
        sel.appendChild(new Option(this.i18n.notebookLoading, ""));
        dialog.element.querySelector(".sw-journal-prompt__sel")?.appendChild(sel);
        return sel;
    }

    // 鍔犺浇鍒扮瑪璁版湰鍒楄〃鍚庡～鍏呴€夐」锛氭棤绗旇鏈樉绀虹┖鎬侊紱鍚﹀垯榛樿閫変腑绗竴椤?
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

    // 纭锛氬啓鍏ヨ缃?+ 鍏抽棴寮圭獥 + resolve(id)锛涘彇娑堬細resolve("")锛堣皟鐢ㄦ柟鎸夌┖鍊煎厹搴曪級
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

    // 鎻掍欢璁剧疆椤碉紙璁剧疆 鈫?鎻掍欢 鈫?灏忛┐閫熷垏 鈫?璁剧疆鍥炬爣锛?
    // 甯冨眬锛氬乏渚ф爣绛炬爮锛堝瑙?琛屼负/闈㈡澘/鏀惰棌/鎵嬫満绔級+ 鍙充晶鍒嗙粍闈㈡澘锛岀偣鍑绘爣绛惧垏鎹?
    openSetting(initialPanel?: string) {
        const s = this.getSettings();
        const panelKeys = ["appearance", "behavior", "panels", "favorites", "quickActions", "journal", "mobile"] as const;
        const panelLabels: Record<string, string> = {
            appearance: this.i18n.secAppearance,
            behavior: this.i18n.secBehavior,
            panels: this.i18n.secPanels,
            favorites: this.i18n.secFavorites,
            quickActions: this.i18n.secQuickActions,
            journal: this.i18n.secJournal,
            mobile: this.i18n.secMobile,
        };

        const dialog = new Dialog({
            title: this.i18n.settings,
            content: '<div class="sw-settings"></div>',
            // 妗岄潰 720脳560锛涙墜鏈虹锛堝惈妯睆鐭鍙ｏ級鎸夎鍙ｆ敹缂╋紝閬垮厤婧㈠嚭灞忓箷
            width: "min(720px, 88vw)",
            height: "min(560px, 85vh)",
        });
        this.suspendFABForDialog(dialog);

        const root = dialog.element.querySelector<HTMLElement>(".sw-settings");
        if (!root) {
            return;
        }
        dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.classList.add("sw-settings-dialog");

        const tabs = document.createElement("div");
        tabs.className = "sw-settings__tabs";
        tabs.setAttribute("role", "tablist");
        const panels = document.createElement("div");
        panels.className = "sw-settings__panels";

        // 鍒囨崲鍒嗙粍锛氫粎婵€娲诲搴旀爣绛句笌闈㈡澘锛屽悓姝?aria-selected 渚涜灞忔劅鐭ワ紱
        // persist=true 鏃惰褰曟渶杩戦€変腑鐨勬爣绛鹃〉锛堜粎鐢ㄦ埛涓诲姩鐐瑰嚮鏃跺啓鐩橈紝閬垮厤鎵撳紑璁剧疆灏变骇鐢熶竴娆℃棤鏁堝啓鍏ワ級
        const activate = (key: string, persist = false) => {
            tabs.querySelectorAll<HTMLElement>(".sw-settings__tab").forEach((tab) => {
                const active = tab.dataset.panel === key;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", active ? "true" : "false");
                tab.tabIndex = active ? 0 : -1;
            });
            panels.querySelectorAll<HTMLElement>(".sw-settings__panel").forEach((p) => {
                p.classList.toggle("is-active", p.dataset.panel === key);
            });
            if (persist) {
                this.updateSettings({lastSettingsTab: key});
            }
        };

        const activateByOffset = (currentKey: string, offset: number) => {
            const currentIndex = panelKeys.indexOf(currentKey as typeof panelKeys[number]);
            if (currentIndex < 0) return;
            const nextKey = panelKeys[(currentIndex + offset + panelKeys.length) % panelKeys.length];
            activate(nextKey, true);
            tabs.querySelector<HTMLButtonElement>(`.sw-settings__tab[data-panel="${nextKey}"]`)?.focus();
        };

        const builders: Record<string, () => HTMLElement> = {
            appearance: () => this.buildSettingsAppearance(s),
            behavior: () => this.buildSettingsBehavior(s),
            panels: () => this.buildSettingsPanels(s),
            favorites: () => this.buildSettingsFavorites(),
            quickActions: () => this.buildSettingsQuickActions(),
            journal: () => this.buildSettingsJournal(s),
            mobile: () => this.buildSettingsMobile(s),
        };

        // 鏋勫缓鏍囩鏍忎笌鍒嗙粍闈㈡澘
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

        // 鎵撳紑鏃剁洿鎺ヨ烦杞埌涓婃鎵€鍦ㄧ殑鏍囩椤碉紙榛樿澶栬锛夛紱activate 鍐呴儴浼氳褰曞垏鎹紝涓嬫杩涘叆淇濇寔
        const lastTab = initialPanel || this.getSettings().lastSettingsTab;
        const panelKeysArr: string[] = [...panelKeys];
        const initial = panelKeysArr.includes(lastTab) ? lastTab : panelKeys[0];
        activate(initial);
        // Only move the horizontal tab strip. scrollIntoView also scrolls
        // Dialog ancestors in Android WebView and can shift the entire settings
        // page off screen when opening the quick-action panel directly.
        requestAnimationFrame(() => {
            root.scrollLeft = 0;
            panels.scrollLeft = 0;
            const activeTab = tabs.querySelector<HTMLElement>(`.sw-settings__tab[data-panel="${initial}"]`);
            if (!activeTab || tabs.scrollWidth <= tabs.clientWidth) return;
            const itemLeft = activeTab.offsetLeft;
            const itemRight = itemLeft + activeTab.offsetWidth;
            let nextLeft = tabs.scrollLeft;
            if (itemLeft < tabs.scrollLeft) nextLeft = itemLeft;
            else if (itemRight > tabs.scrollLeft + tabs.clientWidth) nextLeft = itemRight - tabs.clientWidth;
            tabs.scrollLeft = Math.max(0, Math.min(nextLeft, tabs.scrollWidth - tabs.clientWidth));
        });
    }

    // ===== 璁剧疆椤?路 澶栬锛氬脊绐楀楂樸€佺缉鐣ュ浘鍒楁暟涓庨珮搴?=====
    private buildSettingsAppearance(s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.append(
            this.settingItem(this.i18n.setWidth, this.i18n.setWidthTip,
                this.num(s.dialogWidth, DIALOG_WIDTH_MIN_PX, DIALOG_WIDTH_MAX_PX, 40, this.i18n.unitPx, (v) => this.updateSettings({dialogWidth: v}), this.i18n.setWidth)),
            this.settingItem(this.i18n.setHeight, this.i18n.setHeightTip,
                this.num(s.dialogHeight, DIALOG_HEIGHT_MIN_PX, DIALOG_HEIGHT_MAX_PX, 40, this.i18n.unitPx, (v) => this.updateSettings({dialogHeight: v}), this.i18n.setHeight)),
            this.settingItem(this.i18n.setColumns, this.i18n.setColumnsTip,
                this.select([{value: "0", label: this.i18n.columnsAuto}].concat(
                    [2, 3, 4, 5, 6, 7, 8].map((n) => ({value: String(n), label: String(n)})),
                ), String(s.columns), (v) => this.updateSettings({columns: this.clampNum(v, 0, 8, s.columns)}))),
            this.settingItem(this.i18n.setThumbHeight, this.i18n.setThumbHeightTip,
                this.num(s.thumbHeight, THUMB_HEIGHT_MIN_PX, THUMB_HEIGHT_MAX_PX, 8, this.i18n.unitPx, (v) => this.updateSettings({thumbHeight: v}), this.i18n.setThumbHeight)),
        );
        return wrapper;
    }

    // ===== 璁剧疆椤?路 琛屼负锛氶粯璁ゆ帓搴忋€佸叏灞忔ā寮?=====
    private buildSettingsBehavior(s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        const sortOptions: Array<{value: SortBy, label: string}> = [
            {value: "mru", label: this.i18n.sortMru},
            {value: "layout", label: this.i18n.sortLayout},
            {value: "layoutDesc", label: this.i18n.sortLayoutDesc},
            {value: "updatedDesc", label: this.i18n.sortUpdatedDesc},
            {value: "titleAsc", label: this.i18n.sortTitleAsc},
            {value: "titleDesc", label: this.i18n.sortTitleDesc},
        ];
        wrapper.append(this.settingItem(this.i18n.setSortBy, this.i18n.setSortByTip,
            this.select(sortOptions, s.sortBy, (v) => this.updateSettings({sortBy: v as SortBy}))));
        // 鍏ㄥ睆鍙睘浜庢闈㈢锛涙墜鏈虹涓嶆樉绀烘棤娉曚娇鐢ㄧ殑鎺у埗銆?
        if (!this.isMobile) {
            wrapper.append(this.settingItem(this.i18n.fullScreen, this.i18n.fullScreenTip,
                this.switcher(s.fullscreen, (v) => {
                    this.updateSettings({fullscreen: v});
                    if (v) {
                        showMessage(this.i18n.fullScreenOn);
                    }
                })));
        }
        return wrapper;
    }

    // ===== 璁剧疆椤?路 闈㈡澘锛氭樉绀烘柟寮忋€佷晶杈规爮甯冨眬銆佸悇 dock 闈㈡澘寮€鍏?=====
    private buildSettingsPanels(s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        const dockOptions: Array<{value: DockDisplay, label: string}> = [
            {value: "hidden", label: this.i18n.dockDisplayHidden},
            {value: "collapsed", label: this.i18n.dockDisplayCollapsed},
            {value: "full", label: this.i18n.dockDisplayFull},
        ];
        const sidebarOptions: Array<{value: SidebarLayout, label: string}> = [
            {value: "enlarge", label: this.i18n.sidebarEnlarge},
            {value: "columns", label: this.i18n.sidebarColumnsAuto},
        ];
        wrapper.append(
            this.settingItem(this.i18n.setDockDisplay, this.i18n.setDockDisplayTip,
                this.select(dockOptions, s.dockDisplay, (v) => this.updateSettings({dockDisplay: v as DockDisplay}))),
            // 渚ц竟鏍忕缉鐣ュ浘甯冨眬锛氭媺浼告斁澶у～婊℃爮瀹斤紝鎴栨寜瀹藉害鑷姩澧炲姞鍒楁暟
            this.settingItem(this.i18n.sidebarLayout, this.i18n.sidebarLayoutTip,
                this.select(sidebarOptions, s.sidebarLayout, (v) => {
                    this.updateSettings({sidebarLayout: v as SidebarLayout});
                })),
            this.settingItem(this.i18n.setDocks, this.i18n.setDocksTip, this.buildSettingsDockToggles(s), true),
        );
        return wrapper;
    }

    // dock 闈㈡澘寮€鍏冲垪琛細鍕鹃€夌殑闈㈡澘鍑虹幇鍦ㄥ垏鎹㈠櫒宸︿晶锛屽彇娑堢殑闅愯棌
    private buildSettingsDockToggles(s: ISwSettings): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__docks b3-label__text";
        const dockPanels = this.getDockPanels();
        const excluded = new Set(s.excludedDocks);
        dockPanels.forEach((panel) => {
            // 琛屽鍣ㄧ敤 div锛氬紑鍏虫湰韬槸 label锛坆3-switch 鏍囧噯缁撴瀯 input+span锛夛紝label 涓嶅彲宓屽
            const row = document.createElement("div");
            row.className = "sw-setting__dock-item";
            const toggle = document.createElement("label");
            toggle.className = "b3-switch sw-switch";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = !excluded.has(panel.type);
            checkbox.dataset.dockType = panel.type;
            checkbox.addEventListener("change", () => {
                const next = new Set(this.getSettings().excludedDocks);
                if (checkbox.checked) {
                    next.delete(panel.type);
                } else {
                    next.add(panel.type);
                }
                this.updateSettings({excludedDocks: Array.from(next)});
            });
            const knob = document.createElement("span");
            toggle.appendChild(checkbox);
            toggle.appendChild(knob);
            const title = document.createElement("span");
            title.textContent = panel.title;
            row.appendChild(toggle);
            row.appendChild(title);
            box.appendChild(row);
        });
        if (dockPanels.length === 0) {
            box.textContent = this.i18n.noDockPanels;
        }
        return box;
    }

    // ===== 璁剧疆椤?路 鎵嬫満绔細鎮诞鎸夐挳寮€鍏炽€佸崱鐗囧竷灞€ =====
    private buildSettingsMobile(s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.append(
            this.settingItem(this.i18n.fabEnabled, this.i18n.fabEnabledTip,
                this.switcher(s.fabEnabled, (v) => {
                    this.updateSettings({fabEnabled: v});
                    this.updateFABVisibility();
                })),
            this.settingItem(this.i18n.mobileLayout, this.i18n.mobileLayoutTip,
                this.select([
                    {value: String(MOBILE_COLUMNS_SINGLE), label: this.i18n.mobileSingle},
                    {value: String(MOBILE_COLUMNS_DOUBLE), label: this.i18n.mobileDouble},
                    {value: String(MOBILE_COLUMNS_AUTO), label: this.i18n.mobileAuto},
                ], String(s.mobileColumns), (v) => this.updateSettings({mobileColumns: parseInt(v, 10)}))),
        );
        return wrapper;
    }

    // ===== 璁剧疆椤?路 鏃ヨ锛氶粯璁ゆ棩璁扮瑪璁版湰 =====
    private buildSettingsJournal(s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.append(
            this.settingItem(this.i18n.journalNotebook, this.i18n.journalNotebookTip,
                this.notebookSelect(s.journalNotebook, (id) => this.updateSettings({journalNotebook: id}))),
        );
        return wrapper;
    }

    // ===== 璁剧疆椤?路 鏀惰棌锛氭柊寤哄垎缁勩€佸垎缁勯噸鍛藉悕/鍒犻櫎銆佽皟鏁存敹钘忛」鎵€灞炲垎缁?=====
    // 鍐呭闅忓鍒犲疄鏃堕噸寤猴紝鏁?render 鍥炶皟鍦ㄥ唴閮ㄥ畾涔夊悗浼犵粰鍚勬覆鏌?helper
    private buildSettingsFavorites(): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__favs";
        const render = () => {
            const favorites = this.getFavorites();
            const groupNames = this.getFavoriteGroupNames();
            box.innerHTML = "";
            box.appendChild(this.buildSettingsFavCreateRow(render));
            if (groupNames.length > 0) {
                box.appendChild(this.buildSettingsFavGroupList(groupNames, favorites, render));
            }
            const ungrouped = favorites.filter((favorite) => !favorite.group);
            if (ungrouped.length > 0) {
                box.appendChild(this.buildSettingsFavSection(this.i18n.ungrouped, ungrouped, groupNames, render, false));
            }
        };
        render();
        return this.settingItem(this.i18n.manageFavorites, this.i18n.manageFavoritesTip, box, true);
    }

    // 鏂板缓鍒嗙粍琛岋細杈撳叆鍚嶇О鍗冲垱寤猴紙绌哄垎缁勪繚鐣欙紝鏀惰棌鏃跺彲閫夌敤锛?
    private buildSettingsFavCreateRow(render: () => void): HTMLElement {
        const createRow = document.createElement("div");
        createRow.className = "sw-setting__fav-create";
        const nameInput = document.createElement("input");
        nameInput.className = "b3-text-field";
        nameInput.placeholder = this.i18n.groupName;
        const createBtn = document.createElement("button");
        createBtn.className = "b3-button b3-button--outline";
        createBtn.textContent = this.i18n.createGroup;
        const doCreate = () => {
            if (this.createFavoriteGroup(nameInput.value)) {
                nameInput.value = "";
                render();
            }
        };
        createBtn.addEventListener("click", doCreate);
        nameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                doCreate();
            }
        });
        createRow.appendChild(nameInput);
        createRow.appendChild(createBtn);
        return createRow;
    }

    // 鍒嗙粍鍒楄〃锛氭瘡琛?鍚嶇О + 鏀惰棌鏁?+ 琛屽唴閲嶅懡鍚?+ 鍒犻櫎锛堢粍鍐呮敹钘忛」绉诲嚭鍒版湭鍒嗙粍锛?
    private buildSettingsFavGroupList(groupNames: string[], favorites: IFavoriteItem[], render: () => void): HTMLElement {
        const groupList = document.createElement("div");
        groupList.className = "sw-setting__group-list";
        groupNames.forEach((name, index) => {
            groupList.appendChild(this.buildSettingsFavSection(name, favorites.filter((fav) => fav.group === name), groupNames, render, true, index));
        });
        return groupList;
    }

    private buildSettingsFavSection(name: string, items: IFavoriteItem[], groupNames: string[], render: () => void, canManage: boolean, groupIndex = -1): HTMLElement {
        const section = document.createElement("section");
        section.className = "sw-setting__fav-section";
        const collapseKey = name || this.i18n.ungrouped;
        const collapsed = this.favCollapsed.has(collapseKey);
        const header = document.createElement("div");
        header.className = "sw-setting__fav-section-head";
        if (canManage) {
            header.draggable = !this.isMobile;
            if (!this.isMobile) {
                header.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", name));
                header.addEventListener("dragover", (event) => event.preventDefault());
                header.addEventListener("drop", (event) => {
                    event.preventDefault();
                    const source = event.dataTransfer?.getData("text/plain");
                    if (source && source !== name) {
                        this.reorderFavoriteGroups(source, name);
                        render();
                    }
                });
            }
        }
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "b3-button b3-button--text sw-setting__fav-collapse";
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.title = this.i18n.favCollapseTip;
        toggle.innerHTML = `<svg><use xlink:href="#iconRight"></use></svg>`;
        toggle.addEventListener("click", () => {
            if (this.favCollapsed.has(collapseKey)) this.favCollapsed.delete(collapseKey);
            else this.favCollapsed.add(collapseKey);
            this.saveFavCollapsed();
            render();
        });
        const number = document.createElement("span");
        number.className = "sw-setting__fav-order";
        number.textContent = canManage ? String(groupIndex + 1) : "-";
        const title = document.createElement("span");
        title.className = "sw-setting__group-name";
        title.textContent = name;
        title.title = name;
        const count = document.createElement("span");
        count.className = "sw-setting__group-count";
        count.textContent = String(items.length);
        header.append(toggle, number, title, count);
        if (canManage) {
            header.append(this.buildFavGroupRowActions(name, render, groupNames, groupIndex));
        }
        section.appendChild(header);
        if (!collapsed) {
            const list = document.createElement("div");
            list.className = "sw-setting__fav-section-items";
            items.forEach((favorite, index) => list.appendChild(this.buildSettingsFavItemRow(favorite, index, items.length, groupNames, render)));
            if (items.length === 0) {
                const empty = document.createElement("div");
                empty.className = "sw-setting__fav-empty";
                empty.textContent = this.i18n.noFavorites;
                list.appendChild(empty);
            }
            section.appendChild(list);
        }
        return section;
    }

    private buildFavGroupRowActions(name: string, render: () => void, groupNames: string[] = [], groupIndex = -1): HTMLElement {
        const actions = document.createElement("span");
        actions.className = "sw-setting__group-actions";
        const button = (label: string, callback: () => void, danger = false) => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = `b3-button b3-button--small sw-setting__group-btn${danger ? " sw-setting__group-del" : ""}`;
            el.textContent = label;
            el.addEventListener("click", callback);
            return el;
        };
        if (groupIndex > 0) {
            actions.append(iconButton("iconUp", this.i18n.favMoveUp, () => {
                this.reorderFavoriteGroups(name, groupNames[groupIndex - 1]);
                render();
            }));
        }
        if (groupIndex >= 0 && groupIndex < groupNames.length - 1) {
            actions.append(iconButton("iconDown", this.i18n.favMoveDown, () => {
                this.reorderFavoriteGroups(name, groupNames[groupIndex + 1]);
                render();
            }));
        }
        actions.append(
            button(this.i18n.rename, () => {
                const next = window.prompt(this.i18n.rename, name);
                if (next !== null && next.trim() && next.trim() !== name) {
                    this.renameFavoriteGroup(name, next.trim());
                    render();
                }
            }),
            button(this.i18n.deleteGroup, () => {
                if (confirm(this.i18n.deleteGroupConfirm)) {
                    this.deleteFavoriteGroup(name);
                    render();
                }
            }, true),
        );
        return actions;

        function iconButton(icon: string, label: string, callback: () => void): HTMLButtonElement {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "b3-button b3-button--text sw-setting__group-icon";
            button.title = label;
            button.setAttribute("aria-label", label);
            button.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;
            button.addEventListener("click", callback);
            return button;
        }
    }

    private buildSettingsFavItemRow(favorite: IFavoriteItem, index: number, count: number, groupNames: string[], render: () => void): HTMLElement {
        const row = document.createElement("div");
        row.className = "sw-setting__fav-row";
        row.draggable = !this.isMobile;
        row.dataset.favoriteKey = favorite.key;
        if (!this.isMobile) {
            row.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", favorite.key));
            row.addEventListener("dragover", (event) => event.preventDefault());
            row.addEventListener("drop", (event) => {
                event.preventDefault();
                const source = event.dataTransfer?.getData("text/plain");
                if (source && source !== favorite.key) {
                    this.reorderFavoritesInGroup(favorite.group || "", source, favorite.key);
                    render();
                }
            });
        }
        const order = document.createElement("span");
        order.className = "sw-setting__fav-item-order";
        order.textContent = String(index + 1);
        const title = document.createElement("span");
        title.className = "sw-setting__fav-name";
        title.textContent = favorite.title;
        title.title = favorite.title;
        const select = document.createElement("select");
        select.className = "b3-select";
        select.appendChild(new Option(this.i18n.ungrouped, ""));
        groupNames.forEach((group) => select.appendChild(new Option(group, group)));
        select.value = favorite.group || "";
        select.addEventListener("change", () => { this.setFavoriteGroup(favorite.key, select.value); render(); });
        const controls = document.createElement("span");
        controls.className = "sw-setting__fav-controls";
        const move = (delta: number) => {
            if (index + delta < 0 || index + delta >= count) return;
            const target = this.getFavorites().filter((item) => (item.group || "") === (favorite.group || ""))[index + delta];
            if (target) { this.reorderFavoritesInGroup(favorite.group || "", favorite.key, target.key); render(); }
        };
        const iconButton = (icon: string, label: string, callback: () => void) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "b3-button b3-button--text sw-setting__fav-control";
            button.title = label;
            button.setAttribute("aria-label", label);
            button.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;
            button.addEventListener("click", callback);
            return button;
        };
        controls.append(iconButton("iconUp", this.i18n.favMoveUp, () => move(-1)), iconButton("iconDown", this.i18n.favMoveDown, () => move(1)));
        row.append(order, title, select, controls);
        return row;
    }

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

    // 鍗曚釜鍒嗙粍琛岋細鍚嶇О + 鏀惰棌鏁?+ 閲嶅懡鍚嶆寜閽?+ 鍒犻櫎鎸夐挳
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

        // 閲嶅懡鍚嶏細琛屽唴鍒囨崲涓鸿緭鍏ユ锛岀‘璁ゅ悗鏁寸粍杩佺Щ
        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "b3-button b3-button--small sw-setting__group-btn";
        renameBtn.textContent = this.i18n.rename;
        renameBtn.addEventListener("click", () => {
            this.replaceFavGroupRowWithRenameControls(row, name, render);
        });

        // 鍒犻櫎鍒嗙粍锛氱粍鍐呮敹钘忛」绉诲嚭鍒版湭鍒嗙粍
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

    // 琛屽唴閲嶅懡鍚?UI锛氭竻绌鸿鍐呭 鈫?杈撳叆妗?+ 纭/鍙栨秷鎸夐挳 + 浜嬩欢缁戝畾
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

    // 鏀惰棌椤瑰垪琛細姣忚鏍囬 + 鍒嗙粍涓嬫媺锛堟敼鍔ㄥ嵆淇濆瓨锛夛紱鏃犳敹钘忔椂杩藉姞绌烘€?
    private appendSettingsFavItems(
        box: HTMLElement,
        favorites: IFavoriteItem[],
        groupNames: string[],
        render: () => void,
    ) {
        if (favorites.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw-setting__fav-empty";
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

    // ==================== 鍒囨崲鍣?====================

    // 鎵撳紑椤电鍒囨崲鍣?
    private showSwitcher() {
        // 鎵嬫満绔蛋鐙珛閫傞厤
        if (this.isMobile) {
            this.showMobileSwitcher();
            return;
        }

        const tabs = getAllTabs();
        if (tabs.length === 0) {
            showMessage(this.i18n.noOpenedTabs);
            return;
        }

        const settings = this.getSettings();
        const activeTab = this.getActiveTab();
        // 鍏ㄥ睆妯″紡锛氬垏鎹㈠櫒閾烘弧鏁翠釜绐楀彛锛圗sc 閫€鍑虹敱鎬濇簮 Dialog 榛樿琛屼负鎻愪緵锛?
        const fullscreen = settings.fullscreen;

        const dialog = this.createSwitcherDialog(settings, fullscreen);
        // 宸ュ叿鏍?鍒楄〃/鍥炲埌椤堕儴/缂╃暐鍥炬噿鍔犺浇 绛夊瓙妯″潡瑁呴厤
        this.assembleSwitcherParts(dialog, settings, fullscreen, tabs, activeTab);
    }

    // 鏋勯€犳闈㈢鍒囨崲鍣?Dialog锛堝唴瀹?HTML + 灏哄锛夛紝澶栭儴鍙叧蹇冭閰嶉『搴忥紝涓嶅叧蹇?DOM 缁撴瀯缁嗚妭
    private createSwitcherDialog(settings: ISwSettings, fullscreen: boolean): Dialog {
        return new Dialog({
            // 鏋佺畝锛氶殣钘忓師鐢熸爣棰樻爮锛岄《鏍忓唴缃簬鍐呭鍖烘渶涓婃柟
            title: "",
            content: this.buildSwitcherHtml(fullscreen),
            width: fullscreen ? "100vw" : `${settings.dialogWidth}px`,
            height: fullscreen ? "100vh" : `${settings.dialogHeight}px`,
        });
    }

    // 鍒囨崲鍣ㄤ富浣?HTML 瀛楃涓诧紙缁撴瀯锛氶《鏍忔悳绱?鏀惰棌涓嬫媺/鎺掑簭/鍏ㄥ睆鎸夐挳 + 婊氬姩鍖?+ 鍥炲埌椤堕儴锛?
    private buildSwitcherHtml(fullscreen: boolean): string {
        return `<div class="speed-switch sw__body${fullscreen ? " sw--fullscreen" : ""}">
    <div class="sw__main">
        <div class="sw__dock fn__none"></div>
        <div class="sw__content">
            <div class="sw__toolbar">
                <div class="sw__search-wrap">
                    <svg class="sw__search-icon"><use xlink:href="#iconSearch"></use></svg>
                    <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" autocomplete="off" spellcheck="false" />
                </div>
                <div class="sw__select-wrap">
                    <div class="sw__fav-dd"></div>
                </div>
                <div class="sw__select-wrap">
                    <div class="sw__history-dd"></div>
                </div>
                <div class="sw__select-wrap">
                    <select class="b3-select sw__sort b3-tooltips b3-tooltips__s" aria-label="${this.i18n.setSortBy}">
                        <option value="mru">${this.i18n.sortMru}</option>
                        <option value="layout">${this.i18n.sortLayout}</option>
                        <option value="layoutDesc">${this.i18n.sortLayoutDesc}</option>
                        <option value="updatedDesc">${this.i18n.sortUpdatedDesc}</option>
                        <option value="titleAsc">${this.i18n.sortTitleAsc}</option>
                        <option value="titleDesc">${this.i18n.sortTitleDesc}</option>
                    </select>
                </div>
                <span class="b3-button b3-button--text sw__icon-btn sw__fullscreen-btn b3-tooltips b3-tooltips__s" aria-label="${fullscreen ? this.i18n.exitFullscreen : this.i18n.enterFullscreen}">
                    <svg class="sw__fs-enter" viewBox="0 0 24 24"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <svg class="sw__fs-exit" viewBox="0 0 24 24"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span class="b3-button b3-button--text sw__icon-btn sw__journal-btn b3-tooltips b3-tooltips__s" aria-label="${this.i18n.journalBtn}">
                    <svg><use xlink:href="#iconCalendar"></use></svg>
                </span>
                <span class="b3-button b3-button--text sw__icon-btn sw__settings-btn b3-tooltips b3-tooltips__s" aria-label="${this.i18n.settings}">
                    <svg><use xlink:href="#iconSettings"></use></svg>
                </span>
            </div>
            <div class="sw__scroll" tabindex="0"></div>
            <div class="sw__quick-actions" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
            <span class="sw__back-top b3-tooltips b3-tooltips__n" aria-label="${this.i18n.backTop}">
                <svg><use xlink:href="#iconUp"></use></svg>
            </span>
        </div>
        <div class="sw__quick-rail fn__none" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
    </div>
</div>`;
    }

    // 瑁呴厤锛氬叏灞忓垏鎹€佸伐鍏锋爮浜嬩欢銆佹敹钘忎笅鎷夈€佸垪琛ㄦ覆鏌撱€佹悳绱㈣繃婊ゃ€佸洖鍒伴《閮ㄣ€佺缉鐣ュ浘鎳掑姞杞?
    private assembleSwitcherParts(
        dialog: Dialog,
        settings: ISwSettings,
        fullscreen: boolean,
        tabs: Tab[],
        activeTab: Tab | undefined,
    ) {
        this.prepareSwitcherChrome(dialog, fullscreen);

        // 宸︿晶渚ц竟鏍忛潰鏉垮垪琛紙涓庢€濇簮 Ctrl+Tab 鍒囨崲闈㈡澘涓€鑷达級锛屾寜璁剧疆鎺掗櫎涓庢樉绀烘柟寮忔覆鏌擄紝鏃犲彲闈㈡澘鏃惰嚜鍔ㄩ殣钘?
        const dockElement = dialog.element.querySelector<HTMLDivElement>(".sw__dock");
        this.renderDockList(dockElement, dialog, settings.excludedDocks, settings.dockDisplay);

        // 娓呯悊缂╃暐鍥剧紦瀛樹腑宸叉棤瀵瑰簲鎵撳紑椤电鐨勫鍎挎潯鐩紙椤电鍏抽棴鍗冲け鏁堬級
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
        // 鍒楄〃鍖轰笌宸ュ叿鏍忔帓搴忓垏鎹㈠叡浜殑銆屾渶杩戠紪杈戙€嶆洿鏂版椂闂存槧灏勶紙loadUpdatedMap 寮傛鍥炲～锛?
const updatedMap: {[rootId: string]: string} = {};

        refreshList = () => {
            if (!dialog.element.isConnected) {
                return;
            }
            this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts,
                (sortSelect?.value as SortBy) || settings.sortBy, updatedMap);
            if (searchInput && searchInput.value.trim() !== "") {
                this.applySearch(scrollElement, searchInput, closeOverlay);
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
        const unregisterRefresh = this.registerSwitcherRefresh(refreshSurface);
        const originalDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            unregisterRefresh();
            this.disposeDocSearchSession(scrollElement);
            originalDestroy();
        };

        this.bindSwitcherFullscreenToggle(dialog, settings, fullscreen);
        this.bindSwitcherToolbarActions(dialog, searchInput, sortSelect, listOpts, closeOverlay, updatedMap);

        // 鏀惰棌涓嬫媺缁勪欢锛氭槦鏍囪Е鍙?+ 鍒嗙粍闈㈡澘锛堝垎缁勫彲鎶樺彔/灞曞紑锛岄」鐐瑰嚮璺宠浆锛?
        const favDd = dialog.element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, closeOverlay, refreshList);
        const historyDd = dialog.element.querySelector<HTMLElement>(".sw__history-dd");
        this.setupOpenHistoryDropdown(historyDd, closeOverlay);
        if (sortSelect) {
            sortSelect.value = settings.sortBy;
        }

        // 鍙充晶椤电缂╃暐鍥剧綉鏍硷細姣忔鎵撳紑閮介噸鏂板厠闅嗘覆鏌擄紝灞曠ず鍚勯〉绛剧殑鏈€鏂扮姸鎬?
        this.bindSwitcherListArea(dialog, scrollElement, tabs, activeTab, listOpts, settings, searchInput, sortSelect, closeOverlay, updatedMap);
        refreshQuickActions();

        // 璁╂粴鍔ㄥ尯鍩熻幏寰楃劍鐐逛互鎺ユ敹閿洏瀵艰埅
        scrollElement.focus();

        // 鍥炲埌椤堕儴鎸夐挳
        this.bindSwitcherBackTop(dialog, scrollElement);
    }

    // 寮圭獥澶栬鍑嗗锛氬叏灞忔ā寮忎笅缁欏鍣ㄥ姞绫伙紙鍘诲渾瑙?杈规/鏈€澶у搴︼級锛屽苟閿佸畾 .b3-dialog__body 涓嶆暣浣撴粴鍔?
    private prepareSwitcherChrome(dialog: Dialog, fullscreen: boolean) {
        if (fullscreen) {
            dialog.element.querySelector(".b3-dialog__container")?.classList.add("sw-dialog--fullscreen");
        }
        // 鎬濇簮 .b3-dialog__body 榛樿 overflow:auto锛屽唴瀹逛竴楂樺氨浼氭暣浣撴粴鍔ㄦ妸宸ュ叿鏍忔粴璧帮紝
        // 鍔犵被閿佸畾瀹冿紙閰嶅 SCSS 瑙勫垯瑙?.sw-scroll-locked锛夛紝淇濊瘉鍙湁 .sw__scroll 婊氬姩銆侀《鏍忓缁堝浐瀹?
        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }
    }

    // 缁戝畾鍒囨崲鍣ㄥ垪琛ㄥ尯锛氬垵娆℃覆鏌?+ 閿洏瀵艰埅 + 銆屾渶杩戠紪杈戙€嶆帓搴忓洖婧?+ 鎼滅储杈撳叆
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
        this.bindKeydown(scrollElement, closeOverlay);

        // 銆屾渶杩戠紪杈戙€嶆帓搴忛渶瑕佹枃妗ｆ洿鏂版椂闂达細鍚庡彴鏌ヨ涓€娆★紝瀹屾垚鍚庤嫢浠嶅浜庤鎺掑簭鍒欓噸鎺?
        this.loadUpdatedMap(tabs).then((map) => {
            Object.assign(updatedMap, map);
            if (dialog.element.isConnected && sortSelect?.value === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
                // 寮圭獥瀛樻椿鏈熼棿椤电鍙兘宸插鍑忥紝閲嶅彇鏈€鏂板垪琛?
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
            }
        });

        // 鎼滅储锛氬凡鎵撳紑椤电鍖归厤鏄剧ず鍦ㄤ笂鍗婇儴鍒嗭紝鍚屾椂鍏ㄥ簱鏂囨。缁撴灉鏄剧ず鍦ㄤ笅鍗婇儴鍒?
        searchInput?.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });
    }

    // 缁戝畾鍥炲埌椤堕儴鎸夐挳锛氭粴鍔ㄨ秴杩?240px 鏄剧ず锛岀偣鍑诲钩婊戝洖椤?
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

    // 缁戝畾"鍏ㄥ睆 鈬?鏅€?鍘熷湴鍒囨崲鎸夐挳锛堜笌鍏抽棴寮圭獥涓嶅悓锛氬師鍦板垏鎹㈠彲浠ヤ繚鐣欐悳绱?缂╃暐鍥剧姸鎬侊級
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
                container.style.width = `${settings.dialogWidth}px`;
                container.style.height = `${settings.dialogHeight}px`;
                container.classList.remove("sw-dialog--fullscreen");
                swBody?.classList.remove("sw--fullscreen");
                fsBtn?.setAttribute("aria-label", this.i18n.enterFullscreen);
            }
        };
        fsBtn?.addEventListener("click", () => toggleFullscreen(!isFullscreen));
    }

    // 宸ュ叿鏍忛《鏍忔寜閽細璁剧疆 / 渚ц竟鏍?/ 鏃ヨ鎸夐挳 + 鎺掑簭鍒囨崲
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
        // 椤舵爮鏃ヨ鎸夐挳锛氭墦寮€/鏂板缓褰撴棩鏃ヨ锛堟湭璁鹃粯璁ゆ棩璁版湰鏃堕娆＄偣鍑诲脊鍑洪€夋嫨锛?
        dialog.element.querySelector(".sw__journal-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.openJournal();
        });
        sortSelect?.addEventListener("change", () => {
            const nextSort = sortSelect.value as SortBy;
            this.updateSettings({sortBy: nextSort});
            const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
            // 寮圭獥瀛樻椿鏈熼棿椤电鍙兘宸插鍑忥紝閲嶅彇鏈€鏂板垪琛紱娌跨敤鍏变韩 updatedMap锛屽凡鍥炴簮鐨勬洿鏂版椂闂翠笉涓?
            if (scrollElement) {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, nextSort, updatedMap);
            }
            // 鎺掑簭鍒囨崲鏃舵枃妗ｅ彲鑳藉張鏈夋洿鏂帮細琛ユ煡涓€娆℃洿鏂版椂闂达紝浠嶅湪銆屾渶杩戠紪杈戙€嶆帓搴忎笖鏈悳绱㈡椂閲嶆帓
            this.loadUpdatedMap(getAllTabs()).then((map) => {
                Object.assign(updatedMap, map);
                if (dialog.element.isConnected && sortSelect?.value === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
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
        });
    }

    // 鎵ц鎼滅储锛氬凡鎵撳紑椤电鍖归厤鍗＄墖鏄剧ず鍦ㄤ笂鍗婇儴鍒嗭紝鍚屾椂锛堥槻鎶栵級鎼滅储鍏ㄥ簱鏂囨。鏍囬鏄剧ず鍦ㄤ笅鍗婇儴鍒?
    private applySearch(scrollElement: HTMLElement, searchInput: HTMLInputElement, onClose: IOverlayClose) {
        const keyword = searchInput.value.trim();
        this.filterCards(scrollElement, searchInput.value);
        const session = this.getDocSearchSession(scrollElement);

        // 姣忔杈撳叆閮借涓婁竴杞姹傚け鏁堛€傜┖鍏抽敭璇嶆垨缂撳瓨鍛戒腑涔熷繀椤婚€掑搴忓彿锛?        // 鍚﹀垯杈冩參鐨勬棫璇锋眰杩斿洖鍚庝細瑕嗙洊褰撳墠鐣岄潰銆?
const version = beginSearch(session);

        // 鍏抽敭璇嶄负绌猴細闅愯棌鏂囨。缁撴灉锛屾仮澶嶇函鍒楄〃
        if (keyword === "") {
            this.renderDocResults(scrollElement, null, onClose);
            return;
        }
        // 鍛戒腑缂撳瓨鐩存帴娓叉煋锛堝凡鎵撳紑鏂囨。鍦ㄦ覆鏌撴椂鎺掗櫎锛岀紦瀛樼粨鏋滃彲瀹夊叏澶嶇敤锛?
const cached = session.cache.get(keyword);
        if (cached) {
            this.renderDocResults(scrollElement, cached, onClose);
            return;
        }
        this.renderDocResults(scrollElement, [], onClose, "loading");
        // 寤惰繜 180ms 鍐嶈姹傚叏搴撴枃妗ｏ紙闃叉姈锛夛紝閬垮厤姣忎釜鎸夐敭閮芥墦鍐呮牳锛?        // 瀹氭椂鍣ㄤ繚瀛樺埌瀛楁锛屾柊涓€杞緭鍏?娓呯┖鏃舵竻鎺夋棫鍥炶皟
        session.timer = window.setTimeout(() => {
            session.timer = null;
            this.runDocSearchFetch(scrollElement, searchInput, keyword, version, onClose);
        }, SEARCH_DEBOUNCE_MS);
    }

    private getQuickActions(): IQuickAction[] {
        return sanitizeQuickActions(this.data[QUICK_ACTIONS_KEY], QUICK_ACTIONS_MAX).items;
    }

    private saveQuickActions(actions: IQuickAction[]) {
        this.data[QUICK_ACTIONS_KEY] = sanitizeQuickActions(actions, QUICK_ACTIONS_MAX).items;
        this.saveDataDebounced(QUICK_ACTIONS_KEY);
        this.refreshOpenSwitchers();
        this.refreshSidebar();
    }

    /**
     * 渚涚涓夋柟鎻掍欢娉ㄥ唽绋冲畾鐨勫叕寮€鍔ㄤ綔銆傛寔涔呭寲閰嶇疆鍙繚瀛?adapter id/value锛?     * 涓嶄繚瀛樺嚱鏁版垨 DOM 閫夋嫨鍣紱鎻掍欢鍗歌浇鍚庡搴斿叆鍙ｄ細瀹夊叏鍦板彉涓烘棤鍔ㄤ綔銆?     */
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
        return () => {
            if (this.quickActionAdapters.get(id) === handler) {
                this.quickActionAdapters.delete(id);
                this.quickActionAdapterTargets.delete(id);
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
        const safeActionId = `${adapterId}-${options.value || "action"}`.replace(/[^A-Za-z0-9_-]/g, "-");
        const declaredTargets = Array.isArray(options.targets) ? options.targets : undefined;
        const unregisterAdapter = this.registerQuickActionAdapter(adapterId, options.handler, declaredTargets);
        this.quickActionProviders.set(actionValue, {
            id: adapterId,
            label: options.label,
            icon: options.icon || "iconPlugin",
            value: actionValue,
            targets: (declaredTargets ? [...declaredTargets] : getDefaultQuickActionTargets("adapter", actionValue)) as QuickActionTarget[],
            declaredTargets: declaredTargets ? [...declaredTargets] : undefined,
        });
        const actions = this.getQuickActions();
        const existing = actions.find((item) => item.kind === "adapter" && item.value === actionValue);
        if (existing) {
            existing.label = options.label;
            existing.icon = options.icon || existing.icon;
            existing.targets = declaredTargets ? [...declaredTargets] : existing.targets;
            this.saveQuickActions(actions);
        } else if (actions.length < QUICK_ACTIONS_MAX) {
            const baseId = `adapter-${safeActionId}`;
            let actionId = baseId;
            let suffix = 2;
            while (actions.some((item) => item.id === actionId)) actionId = `${baseId}-${suffix++}`;
            actions.push({
                id: actionId,
                label: options.label,
                icon: options.icon || "iconPlugin",
                kind: "adapter",
                value: actionValue,
                targets: declaredTargets ? [...declaredTargets] : getDefaultQuickActionTargets("adapter", actionValue) as QuickActionTarget[],
                order: (actions.length + 1) * 10,
                enabled: true,
            });
            this.saveQuickActions(actions);
        }
        return () => {
            unregisterAdapter();
            this.quickActionProviders.delete(actionValue);
        };
    }

    private getPluginCommands(): IQuickActionPluginCommand[] {
        const plugins = (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins;
        if (!Array.isArray(plugins)) return [];
        const commands: IQuickActionPluginCommand[] = [];
        const seen = new Set<string>();
        plugins.forEach((plugin) => {
            const pluginName = typeof plugin?.name === "string" ? plugin.name : "";
            if (!pluginName || pluginName === this.name || !Array.isArray(plugin.commands)) return;
            const pluginTitle = typeof plugin.displayName === "string" && plugin.displayName.trim()
                ? plugin.displayName.trim().replace(/\s+/g, " ").slice(0, 40)
                : pluginName;
            plugin.commands.forEach((command) => {
                if (!command || typeof command !== "object") return;
                const commandKey = typeof command?.langKey === "string" ? command.langKey : "";
                if (!commandKey || (!command.callback && !command.globalCallback)) return;
                const value = `${pluginName}::${commandKey}`;
                if (seen.has(value)) return;
                seen.add(value);
                const safeId = `${pluginName}-${commandKey}`.replace(/[^A-Za-z0-9_-]/g, "-");
                const commandLabel = String(command.langText || plugin.i18n?.[commandKey] || commandKey)
                    .trim().replace(/\s+/g, " ").slice(0, 24) || commandKey;
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
                });
            });
        });
        return commands;
    }

    private getQuickActionDeclaredTargets(action: IQuickAction): QuickActionTarget[] | undefined {
        if (action.kind !== "adapter") return undefined;
        const adapterId = action.value.split("/", 1)[0];
        return this.quickActionAdapterTargets.get(adapterId);
    }

    private getQuickActionSupport(action: IQuickAction, target: QuickActionTarget): QuickActionSupport {
        return resolveQuickActionSupport(action.kind, action.value, target,
            this.getQuickActionDeclaredTargets(action)) as QuickActionSupport;
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
        const display = surface === "desktop" ? settings.quickActionsDisplayDesktop
            : surface === "sidebar" ? settings.quickActionsDisplaySidebar : settings.quickActionsDisplayMobile;
        const isRightRail = surface === "desktop" && selector === ".sw__quick-rail";
        const collapsed = surface === "desktop"
            ? (isRightRail ? settings.quickActionsCollapsedDesktopRight : settings.quickActionsCollapsedDesktopBottom)
            : surface === "sidebar" ? settings.quickActionsCollapsedSidebar : settings.quickActionsCollapsedMobile;
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
            button.addEventListener("click", () => this.executeQuickAction(action, searchInput, close));
            host.appendChild(button);
        });
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

    private executeQuickAction(action: IQuickAction, searchInput: HTMLInputElement | null, close: () => void) {
        if (action.kind === "adapter") {
            const adapterId = action.value.split("/", 1)[0];
            const handler = this.quickActionAdapters.get(adapterId);
            if (!handler) {
                logger.warn("quick action adapter unavailable", action.value);
                showMessage(this.i18n.quickActionUnavailable, MESSAGE_DEFAULT_MS, "error");
                return;
            }
            close();
            Promise.resolve(handler(action.value.slice(adapterId.length + 1))).catch((error) => {
                logger.warn("quick action adapter failed", error);
                showMessage(this.i18n.quickActionFailed, MESSAGE_DEFAULT_MS, "error");
            });
            return;
        }
        if (action.kind === "dock") {
            const dock = this.getDockByType(action.value);
            if (!dock?.toggleModel) {
                showMessage(this.i18n.quickActionUnavailable, MESSAGE_DEFAULT_MS, "error");
                return;
            }
            try {
                dock.toggleModel(action.value, true);
                close();
            } catch (e) {
                logger.warn("quick dock action fail", e);
                showMessage(this.i18n.quickActionFailed, MESSAGE_DEFAULT_MS, "error");
            }
            return;
        }
        if (action.kind === "command") {
            const separator = action.value.indexOf("::");
            const pluginName = separator > 0 ? action.value.slice(0, separator) : "";
            const commandKey = separator > 0 ? action.value.slice(separator + 2) : "";
            const plugins = (this.app as unknown as {plugins?: IQuickActionPluginLike[]}).plugins;
            const plugin = Array.isArray(plugins) ? plugins.find((item) => item?.name === pluginName) : undefined;
            const command = plugin?.commands?.find((item) => item.langKey === commandKey);
            const callback = command?.callback || command?.globalCallback;
            if (!callback) {
                logger.warn("quick plugin command unavailable", action.value);
                showMessage(this.i18n.quickActionUnavailable, MESSAGE_DEFAULT_MS, "error");
                return;
            }
            close();
            try {
                Promise.resolve(callback.call(plugin)).catch((error) => {
                    logger.warn("quick plugin command failed", error);
                    showMessage(this.i18n.quickActionFailed, MESSAGE_DEFAULT_MS, "error");
                });
            } catch (error) {
                logger.warn("quick plugin command failed", error);
                showMessage(this.i18n.quickActionFailed, MESSAGE_DEFAULT_MS, "error");
            }
            return;
        }
        switch (action.value) {
            case "switcher":
                close();
                this.showSwitcher();
                break;
            case "search":
                searchInput?.focus();
                break;
            case "journal":
                close();
                this.openJournal();
                break;
            case "settings":
                close();
                this.openSetting();
                break;
        }
    }

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
        this.getDockPanels().forEach((panel) => {
            if (existing.has(`dock:${panel.type}`)) return;
            const targets = getDefaultQuickActionTargets("dock", panel.type) as QuickActionTarget[];
            const safeType = panel.type.replace(/[^A-Za-z0-9_-]/g, "-");
            const action: IQuickAction = {
                id: `dock-${safeType}`,
                label: panel.title,
                icon: panel.icon || "iconDock",
                kind: "dock",
                value: panel.type,
                targets,
                order: 0,
                enabled: true,
            };
            candidates.push({
                id: action.id,
                label: panel.title,
                icon: action.icon,
                group: this.i18n.quickDock,
                secondary: describe(action.kind, action.value, targets),
                searchText: `${panel.title} ${panel.type} ${this.i18n.quickDock}`,
                action,
            });
        });
        this.quickActionProviders.forEach((provider) => {
            if (existing.has(`adapter:${provider.value}`)) return;
            const safeValue = provider.value.replace(/[^A-Za-z0-9_-]/g, "-");
            const action: IQuickAction = {
                id: `adapter-${safeValue}`,
                label: provider.label,
                icon: provider.icon,
                kind: "adapter",
                value: provider.value,
                targets: [...provider.targets],
                order: 0,
                enabled: true,
            };
            candidates.push({
                id: action.id,
                label: provider.label,
                icon: provider.icon,
                group: this.i18n.quickPluginActions,
                fallbackIcon: ["iconPlugin", "iconFile"],
                secondary: describe(action.kind, action.value, action.targets, provider.declaredTargets),
                searchText: `${provider.label} ${provider.id} ${provider.value} ${this.i18n.quickPluginActions}`,
                action,
            });
        });
        this.getPluginCommands().forEach((command) => {
            if (existing.has(`command:${command.value}`)) return;
            const targets = getDefaultQuickActionTargets("command", command.value) as QuickActionTarget[];
            const displayLabel = command.label.trim().replace(/\s+/g, " ").slice(0, 24) || command.value;
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
                group: this.i18n.quickPluginCommands,
                fallbackIcon: ["iconPlugin", "iconFile"],
                secondary: `${command.pluginTitle} · ${describe(action.kind, action.value, targets)}`,
                searchText: `${displayLabel} ${command.pluginTitle} ${command.pluginName} ${command.commandKey} ${this.i18n.quickPluginCommands}`,
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
        name.textContent = /^icon/.test(icon) ? icon.slice(4) : icon;
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
        const grid = document.createElement("div");
        grid.className = "sw-quick-icon-picker__grid";
        const icons = this.getAvailableQuickActionIcons(action.icon);
        const renderIcons = () => {
            const keyword = search.value.trim().toLocaleLowerCase();
            grid.innerHTML = "";
            icons.filter((icon) => !keyword || icon.toLocaleLowerCase().includes(keyword)).forEach((icon) => {
                const option = document.createElement("button");
                option.type = "button";
                option.className = "sw-quick-icon-picker__item";
                option.classList.toggle("is-selected", icon === action.icon);
                option.title = icon;
                option.setAttribute("aria-label", icon);
                this.renderQuickActionIcon(option, icon, ["iconPlugin", "iconFile"]);
                option.addEventListener("click", () => {
                    cleanup();
                    onPick(icon);
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
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) cleanup();
        });
        search.addEventListener("input", renderIcons);
        document.addEventListener("keydown", onKeyDown);
        sheet.append(header, search, grid);
        overlay.appendChild(sheet);
        document.body.appendChild(overlay);
        renderIcons();
        if (!this.isMobile) search.focus({preventScroll: true});
    }

    private buildSettingsQuickActions(): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__quick-actions";
        const render = () => {
            box.innerHTML = "";
            const actions = this.getQuickActions();
            if (actions.length > 0) {
                const header = document.createElement("div");
                header.className = "sw-setting__quick-header";
                [this.i18n.quickColumnLabel, this.i18n.quickColumnIcon, this.i18n.quickColumnTargets,
                    this.i18n.quickColumnActions, this.i18n.quickColumnEnabled].forEach((label) => {
                    const cell = document.createElement("span");
                    cell.textContent = label;
                    header.appendChild(cell);
                });
                box.appendChild(header);
            }
            actions.forEach((action) => {
                const row = document.createElement("div");
                row.className = "sw-setting__quick-action";
                row.draggable = !this.isMobile;
                row.dataset.quickActionId = action.id;
                // 手机端禁用整行拖拽，避免手势排序与页面上下滑动争抢；保留行内上下移动按钮。
                if (!this.isMobile) {
                    row.addEventListener("dragstart", (event) => {
                        event.dataTransfer?.setData("text/plain", action.id);
                        row.classList.add("is-dragging");
                    });
                    row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
                    row.addEventListener("dragover", (event) => {
                        event.preventDefault();
                        row.classList.add("is-drag-over");
                    });
                    row.addEventListener("dragleave", () => row.classList.remove("is-drag-over"));
                    row.addEventListener("drop", (event) => {
                        event.preventDefault();
                        row.classList.remove("is-drag-over");
                        const sourceId = event.dataTransfer?.getData("text/plain");
                        if (!sourceId || sourceId === action.id) return;
                        const next = this.getQuickActions();
                        const from = next.findIndex((item) => item.id === sourceId);
                        const to = next.findIndex((item) => item.id === action.id);
                        if (from < 0 || to < 0) return;
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        next.forEach((item, itemIndex) => item.order = (itemIndex + 1) * 10);
                        this.saveQuickActions(next);
                        render();
                    });
                }
                const text = document.createElement("input");
                text.className = "b3-text-field";
                text.value = action.label || action.value;
                text.setAttribute("aria-label", action.label || action.value);
                text.addEventListener("change", () => {
                    const label = text.value.trim();
                    if (!label) {
                        text.value = action.label || action.value;
                        return;
                    }
                    const next = this.getQuickActions().map((item) => item.id === action.id
                        ? {...item, label} : item);
                    this.saveQuickActions(next);
                    text.value = this.getQuickActions().find((item) => item.id === action.id)?.label || action.label || action.value;
                });
                const iconButton = document.createElement("button");
                iconButton.type = "button";
                iconButton.className = "b3-button b3-button--text sw-setting__quick-icon";
                iconButton.setAttribute("aria-label", this.i18n.quickChooseIcon);
                iconButton.title = this.i18n.quickChooseIcon;
                this.renderQuickActionIconButton(iconButton, action.icon);
                iconButton.addEventListener("click", () => {
                    this.openQuickActionIconPicker(action, (icon) => {
                        const next = this.getQuickActions().map((item) => item.id === action.id ? {...item, icon} : item);
                        this.saveQuickActions(next);
                        render();
                    });
                });
                const toggle = document.createElement("label");
                toggle.className = "sw-switch";
                const input = document.createElement("input");
                input.type = "checkbox";
                input.checked = action.enabled;
                input.addEventListener("change", () => {
                    const next = this.getQuickActions().map((item) => item.id === action.id
                        ? {...item, enabled: input.checked} : item);
                    this.saveQuickActions(next);
                    render();
                });
                toggle.append(input, document.createElement("span"));
                const targets = document.createElement("div");
                targets.className = "sw-setting__quick-targets";
                [
                    ["desktop", this.i18n.quickDesktop],
                    ["sidebar", this.i18n.quickSidebar],
                    ["mobile", this.i18n.quickMobile],
                ].forEach(([target, label]) => {
                    const typedTarget = target as QuickActionTarget;
                    const support = this.getQuickActionSupport(action, typedTarget);
                    const targetLabel = document.createElement("label");
                    targetLabel.className = "sw-setting__quick-target";
                    targetLabel.classList.toggle("is-unsupported", support === "unsupported");
                    targetLabel.classList.toggle("is-unknown", support === "unknown");
                    if (support === "unsupported") targetLabel.title = this.i18n.quickSupportUnsupported;
                    else if (support === "unknown") targetLabel.title = this.i18n.quickSupportUnknown;
                    const targetInput = document.createElement("input");
                    targetInput.type = "checkbox";
                    targetInput.checked = support !== "unsupported" && action.targets.includes(typedTarget);
                    targetInput.disabled = support === "unsupported";
                    targetInput.addEventListener("change", () => {
                        const next = this.getQuickActions().map((item) => {
                            if (item.id !== action.id) return item;
                            const nextTargets = targetInput.checked
                                ? Array.from(new Set([...item.targets, typedTarget]))
                                : item.targets.filter((itemTarget) => itemTarget !== target);
                            return {...item, targets: nextTargets as QuickActionTarget[]};
                        });
                        this.saveQuickActions(next);
                    });
                    targetLabel.append(targetInput, document.createTextNode(String(label)));
                    if (support === "unknown") {
                        const marker = document.createElement("span");
                        marker.className = "sw-setting__quick-support-marker";
                        marker.textContent = "?";
                        marker.setAttribute("aria-label", this.i18n.quickSupportUnknown);
                        targetLabel.appendChild(marker);
                    }
                    targets.appendChild(targetLabel);
                });
                const controls = document.createElement("div");
                controls.className = "sw-setting__quick-controls";
                const move = (delta: number) => {
                    const next = this.getQuickActions();
                    const index = next.findIndex((item) => item.id === action.id);
                    const targetIndex = index + delta;
                    if (index < 0 || targetIndex < 0 || targetIndex >= next.length) return;
                    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
                    next.forEach((item, itemIndex) => item.order = (itemIndex + 1) * 10);
                    this.saveQuickActions(next);
                    render();
                };
                const button = (iconName: string, label: string, onClick: () => void) => {
                    const actionButton = document.createElement("button");
                    actionButton.type = "button";
                    actionButton.className = "b3-button b3-button--text sw-setting__quick-control";
                    actionButton.setAttribute("aria-label", label);
                    actionButton.title = label;
                    actionButton.innerHTML = `<svg><use xlink:href="#${iconName}"></use></svg>`;
                    actionButton.addEventListener("click", onClick);
                    return actionButton;
                };
                controls.append(
                    button("iconUp", this.i18n.quickMoveUp, () => move(-1)),
                    button("iconDown", this.i18n.quickMoveDown, () => move(1)),
                    button("iconClose", this.i18n.quickRemove, () => {
                        this.saveQuickActions(this.getQuickActions().filter((item) => item.id !== action.id));
                        render();
                    }),
                );
                row.append(text, iconButton, targets, controls, toggle);
                box.appendChild(row);
            });
            const candidates = this.getQuickActionPickerCandidates(actions);
            if (candidates.length > 0 && actions.length < QUICK_ACTIONS_MAX) {
                const addRow = document.createElement("div");
                addRow.className = "sw-setting__quick-action sw-setting__quick-action--add";
                const tip = document.createElement("span");
                tip.className = "sw-setting__quick-add-tip";
                tip.textContent = this.i18n.quickAddTip;
                const add = document.createElement("button");
                add.type = "button";
                add.className = "b3-button b3-button--text";
                add.setAttribute("aria-expanded", "false");
                add.innerHTML = `<svg><use xlink:href="#iconAdd"></use></svg><span>${this.i18n.addQuickAction}</span>`;
                add.addEventListener("click", () => {
                    mountQuickActionPicker({
                        trigger: add,
                        host: addRow,
                        candidates,
                        searchPlaceholder: this.i18n.quickPickerSearch,
                        emptyText: this.i18n.quickPickerEmpty,
                        onSelect: (candidate: IQuickActionPickerCandidate) => {
                            const result = appendQuickAction(this.getQuickActions(), candidate.action, QUICK_ACTIONS_MAX);
                            if (!result.added) {
                                showMessage(result.reason === "full" ? this.i18n.quickActionLimit : this.i18n.quickActionDuplicate);
                                return;
                            }
                            this.saveQuickActions(result.items);
                            render();
                        },
                    });
                });
                addRow.append(add, tip);
                box.appendChild(addRow);
            }
            if (actions.length === 0 && candidates.length === 0) box.textContent = this.i18n.noQuickActions;
        };
        render();
        const wrapper = document.createElement("div");
        const displayOptions = [
            {value: "full", label: this.i18n.quickDisplayFull},
            {value: "icons", label: this.i18n.quickDisplayIcons},
            {value: "hidden", label: this.i18n.quickDisplayHidden},
        ];
        const settings = this.getSettings();
        wrapper.append(
            this.settingItem(this.i18n.quickActions, this.i18n.quickActionsTip, box, true),
            this.settingItem(this.i18n.quickPosition, this.i18n.quickPositionTip,
                this.select([{value: "bottom", label: this.i18n.quickPositionBottom}, {value: "right", label: this.i18n.quickPositionRight}],
                    settings.quickActionsRightRail ? "right" : "bottom", (value) => this.updateSettings({quickActionsRightRail: value === "right"}))),
            this.settingItem(this.i18n.quickDisplayDesktop, this.i18n.quickDisplayTip,
                this.select(displayOptions, settings.quickActionsDisplayDesktop, (value) => this.updateSettings({quickActionsDisplayDesktop: value as QuickActionDisplay}))),
            this.settingItem(this.i18n.quickDisplaySidebar, this.i18n.quickDisplayTip,
                this.select(displayOptions, settings.quickActionsDisplaySidebar, (value) => this.updateSettings({quickActionsDisplaySidebar: value as QuickActionDisplay}))),
            this.settingItem(this.i18n.quickDisplayMobile, this.i18n.quickDisplayTip,
                this.select(displayOptions, settings.quickActionsDisplayMobile, (value) => this.updateSettings({quickActionsDisplayMobile: value as QuickActionDisplay}))),
            this.settingItem(this.i18n.quickTransfer, this.i18n.quickTransferTip, this.buildQuickActionsTransferControls(render), true),
        );
        return wrapper;
    }

    private buildQuickActionsTransferControls(onImported: () => void): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__quick-transfer";
        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.className = "b3-button b3-button--text";
        exportButton.textContent = this.i18n.quickExport;
        exportButton.addEventListener("click", () => {
            const blob = new Blob([JSON.stringify(this.getQuickActions(), null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "siyuan-speed-switch-quick-actions.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
        });
        const importButton = document.createElement("button");
        importButton.type = "button";
        importButton.className = "b3-button b3-button--text";
        importButton.textContent = this.i18n.quickImport;
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "application/json,.json";
        fileInput.className = "fn__none";
        importButton.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                const parsed = JSON.parse(await file.text());
                const result = sanitizeQuickActions(parsed, QUICK_ACTIONS_MAX);
                // An empty array is a valid intentional configuration: it
                // lets users clear all custom quick actions and start over.
                if (!Array.isArray(parsed)) {
                    showMessage(this.i18n.quickImportFailed);
                    return;
                }
                this.saveQuickActions(result.items);
                onImported();
                showMessage(this.i18n.quickImportDone);
            } catch (error) {
                logger.warn("import quick actions fail", error);
                showMessage(this.i18n.quickImportFailed);
            } finally {
                fileInput.value = "";
            }
        });
        box.append(exportButton, importButton, fileInput);
        return box;
    }

    private getDocSearchSession(scrollElement: HTMLElement): ISearchSession<IDocSearchResult[]> {
        let session = this.docSearchSessions.get(scrollElement);
        if (!session) {
            session = createSearchSession<IDocSearchResult[]>(DOC_SEARCH_CACHE_LIMIT);
            this.docSearchSessions.set(scrollElement, session);
            this.activeDocSearchSessions.add(session);
        }
        return session;
    }

    private disposeDocSearchSession(scrollElement: HTMLElement) {
        const session = this.docSearchSessions.get(scrollElement);
        if (!session) {
            return;
        }
        disposeSearchSession(session);
        this.activeDocSearchSessions.delete(session);
        this.docSearchSessions.delete(scrollElement);
    }

    // 鍏ㄥ簱鏂囨。鎼滅储杩滅▼璇锋眰锛氭瘡涓晫闈細璇濈嫭绔嬪彇娑堝苟涓㈠純杩囨湡鍝嶅簲
    private async runDocSearchFetch(
        scrollElement: HTMLElement,
        searchInput: HTMLInputElement,
        keyword: string,
        version: number,
        onClose: IOverlayClose,
    ) {
        const session = this.getDocSearchSession(scrollElement);
        // 鏈熼棿鍏抽敭璇嶅凡鍙樺寲鎴栧鍣ㄥ凡閿€姣佸垯鏀惧純鏈缁撴灉
        if (version !== session.version || !scrollElement.isConnected) {
            if (!scrollElement.isConnected) {
                this.disposeDocSearchSession(scrollElement);
            }
            return;
        }
        if (searchInput.value.trim() === "") {
            this.renderDocResults(scrollElement, null, onClose);
            return;
        }
        let controller: AbortController | null = null;
        try {
            controller = new AbortController();
            session.controller = controller;
            const response = await fetch("/api/filetree/searchDocs", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({k: keyword}),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`searchDocs HTTP ${response.status}`);
            }
            const json = await response.json();
            if (version !== session.version || !scrollElement.isConnected || searchInput.value.trim() !== keyword) {
                return;
            }
            let docs: IDocSearchResult[] = Array.isArray(json?.data)
                ? json.data.filter((doc: unknown): doc is IDocSearchResult => Boolean(doc) && typeof doc === "object")
                : [];
            // Keep title search as the fast path. Only ask the native block
            // endpoint when it found no documents, preserving existing
            // ordering and request cost for the common case.
            if (docs.length === 0) {
                docs = await this.runFullTextSearchFallback(keyword, controller.signal);
            }
            cacheSearchResult(session, keyword, docs);
            this.renderDocResults(scrollElement, docs, onClose);
        } catch (e) {
            // 涓诲姩鍙栨秷鐨勮姹備笉绠楀紓甯?
if ((e as DOMException)?.name !== "AbortError") {
                logger.warn("search docs fail", e);
                if (version === session.version && scrollElement.isConnected && searchInput.value.trim() === keyword) {
                    this.renderDocResults(scrollElement, [], onClose, "error");
                }
            }
        } finally {
            if (controller && session.controller === controller) {
                session.controller = null;
            }
            if (!scrollElement.isConnected) {
                this.disposeDocSearchSession(scrollElement);
            }
        }
    }

    // 娓叉煋鍏ㄥ簱鏂囨。鎼滅储缁撴灉鍒嗙粍锛坉ocs 涓?null 琛ㄧず闅愯棌锛夛紱宸叉墦寮€鐨勬枃妗ｄ笉鍐嶉噸澶嶅垪鍑?
    private async runFullTextSearchFallback(keyword: string, signal: AbortSignal): Promise<IDocSearchResult[]> {
        const request = buildFullTextSearchRequest({
            query: keyword,
            method: "keyword",
            groupBy: "document",
            pageSize: Math.max(DOC_RESULT_LIMIT * 2, 24),
        });
        if (!request) {
            return [];
        }
        try {
            const response = await fetch(request.endpoint, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(request.body),
                signal,
            });
            if (!response.ok) {
                throw new Error(`full text search HTTP ${response.status}`);
            }
            const payload = await response.json();
            const aggregate = aggregateSearchResults(extractSearchRecords(payload), {
                source: "global",
                documents: DOC_RESULT_LIMIT,
                snippets: 2,
                blockIds: 8,
            });
            return aggregate.cards.map((card) => ({
                id: card.rootId,
                rootId: card.rootId,
                name: card.title,
                title: card.title,
                path: card.path,
                hPath: card.path,
                snippets: card.snippets,
                source: "global",
            }));
        } catch (error) {
            if ((error as DOMException)?.name === "AbortError") {
                throw error;
            }
            // Full-text search is optional. Older SiYuan versions keep the
            // title-search empty state when this endpoint is unavailable.
            logger.warn("full text search fallback unavailable", error);
            return [];
        }
    }

    private renderDocResults(
        scrollElement: HTMLElement,
        docs: IDocSearchResult[] | null,
        onClose: IOverlayClose,
        state: DocSearchRenderState = "results",
    ) {
        const box = this.ensureDocResultsBox(scrollElement, docs);
        if (!box) {
            return;
        }
        if (state !== "results") {
            this.appendDocSearchStatus(box, state);
            return;
        }
        // 鎺掗櫎褰撳墠宸叉墦寮€鐨勬枃妗ｏ紙涓婂崐閮ㄥ垎宸叉湁瀵瑰簲鍗＄墖锛夛紱鎵嬫満绔?getAllTabs() 鎭掍负绌猴紝闇€鐢?MobileTabs 鏁版嵁婧?
const openRootIds = this.collectOpenRootIds();

        if (docs.length === 0) {
            this.appendDocResultsEmpty(box);
            return;
        }

        const grid = document.createElement("div");
        grid.className = "sw__doc-grid";
        const appendedIds = new Set<string>();
        for (const doc of docs) {
            const id = this.docSearchResultId(doc);
            if (!id || openRootIds.has(id) || appendedIds.has(id)) {
                continue;
            }
            appendedIds.add(id);
            grid.appendChild(this.buildDocResultItem(doc, id, onClose));
            if (appendedIds.size >= DOC_RESULT_LIMIT) {
                break;
            }
        }
        if (grid.childElementCount === 0) {
            this.appendDocResultsEmpty(box);
            return;
        }
        const label = box.querySelector<HTMLElement>(".sw__window-label");
        if (label) {
            label.textContent = `${this.i18n.docSearchResults} 路 ${grid.childElementCount}`;
        }
        box.appendChild(grid);
    }

    // 澶嶇敤鐜版湁 .sw__doc-results 瀹瑰櫒锛沝ocs===null 鏃剁洿鎺ョЩ闄ゅ苟杩斿洖 null
    private ensureDocResultsBox(scrollElement: HTMLElement, docs: IDocSearchResult[] | null): HTMLElement | null {
        let box = scrollElement.querySelector<HTMLElement>(".sw__doc-results");
        if (docs === null) {
            box?.remove();
            return null;
        }
        if (!box) {
            box = document.createElement("div");
            box.className = "sw__doc-results sw__group";
            scrollElement.appendChild(box);
        }
        // 鍏滃簳绉婚櫎鍙兘娈嬬暀鐨勯殣钘忕被锛堝巻鍙?bug 闃插尽锛夛紝纭繚鏂囨。鍖哄缁堝彲瑙?
        box.classList.remove("fn__none");

        const label = document.createElement("div");
        label.className = "sw__window-label";
        label.textContent = this.i18n.docSearchResults;
        box.innerHTML = "";
        box.appendChild(label);
        return box;
    }

    // 褰撳墠宸叉墦寮€椤电鐨?rootId 闆嗗悎锛堝幓閲嶏級锛涙墜鏈虹璧?MobileTabs锛屾闈㈢璧?getAllTabs
    private collectOpenRootIds(): Set<string> {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        return new Set(
            opened.map((tab) => this.rootIdOf(tab)).filter(Boolean) as string[],
        );
    }

    // 绌烘€侊細鏃犲彲鏄剧ず鐨勬悳绱㈢粨鏋?
    private appendDocResultsEmpty(box: HTMLElement) {
        const empty = document.createElement("div");
        empty.className = "sw__doc-status sw__doc-status--empty";
        empty.textContent = this.i18n.noDocResults;
        box.appendChild(empty);
    }

    private appendDocSearchStatus(box: HTMLElement, state: Exclude<DocSearchRenderState, "results">) {
        const status = document.createElement("div");
        status.className = `sw__doc-status sw__doc-status--${state}`;
        status.setAttribute("role", "status");
        if (state === "loading") {
            status.setAttribute("aria-live", "polite");
            status.innerHTML = '<svg class="sw__spin" aria-hidden="true"><use xlink:href="#iconRefresh"></use></svg>';
            const text = document.createElement("span");
            text.textContent = this.i18n.docSearchLoading;
            status.appendChild(text);
        } else {
            status.textContent = this.i18n.docSearchFailed;
        }
        box.appendChild(status);
    }

    private docSearchResultId(doc: IDocSearchResult): string {
        const rootId = String(doc.rootId || "");
        if (BLOCK_ID_RE.test(rootId)) {
            return rootId;
        }
        const directId = String(doc.id || "");
        if (BLOCK_ID_RE.test(directId)) {
            return directId;
        }
        // searchDocs 鐨勬枃妗ｈ矾寰勪互 rootID 鍛藉悕锛?notebook/rootID.sy
        const pathId = String(doc.path || "").split("/").pop()?.replace(/\.sy$/, "") || "";
        return BLOCK_ID_RE.test(pathId) ? pathId : "";
    }

    // 鍗曚釜鏂囨。鎼滅储缁撴灉鍗＄墖锛堝浘鏍?+ 鏍囬 + 璺緞锛夛紱鐐瑰嚮鐩村紑鏂囨。锛堟墜鏈虹璧?MobileTabs.open锛?
private buildDocResultItem(doc: IDocSearchResult, id: string, onClose: IOverlayClose): HTMLButtonElement {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sw__doc-item";
        const icon = document.createElement("span");
        icon.className = "sw__doc-icon";
        icon.innerHTML = '<svg aria-hidden="true"><use xlink:href="#iconFile"></use></svg>';
        const copy = document.createElement("span");
        copy.className = "sw__doc-copy";
        const title = document.createElement("span");
        title.className = "sw__doc-title";
        const hPath = String(doc.hPath || "");
        const docTitle = hPath.split("/").filter(Boolean).pop() || String(doc.title || doc.name || "") || id;
        title.textContent = docTitle;
        const snippets = Array.isArray(doc.snippets)
            ? doc.snippets.map((snippet) => String(snippet?.text || "").trim()).filter(Boolean).join(" · ")
            : "";
        if (snippets) {
            const snippet = document.createElement("span");
            snippet.className = "sw__doc-snippet";
            snippet.textContent = snippets;
            copy.appendChild(snippet);
        }
        const path = document.createElement("span");
        path.className = "sw__doc-path";
        path.textContent = hPath || docTitle;
        copy.appendChild(title);
        copy.appendChild(path);
        item.appendChild(icon);
        item.appendChild(copy);
        item.title = hPath || docTitle;
        item.setAttribute("aria-label", hPath || docTitle);
        item.addEventListener("click", () => {
            onClose();
            if (this.isMobile) {
                // openTab 鍦ㄦ墜鏈虹鏄┖瀹炵幇锛岃蛋 MobileTabs.open
                this.mobileOpenDoc(id);
            } else {
                openTab({
                    app: this.app,
                    doc: {id},
                });
            }
        });
        return item;
    }

    // 銆屾渶杩戠紪杈戙€嶆帓搴忕殑 SQL 缁撴灉鐭紦瀛橈細鎺掑簭鏂瑰紡鏉ュ洖鍒囨崲 / 鍒楄〃閲嶆覆鏌撴椂涓嶉噸澶嶆墦鍐呮牳
    private updatedMapCache: {key: string, ts: number, map: {[rootId: string]: string}} | null = null;

    // 鏌ヨ褰撳墠鎵撳紑鏂囨。鐨勬洿鏂版椂闂达紙鐢ㄤ簬銆屾渶杩戠紪杈戙€嶆帓搴忥級锛岃繑鍥?rootID 鈫?updated 鏄犲皠
    private async loadUpdatedMap(tabs: Tab[]): Promise<{[rootId: string]: string}> {
        // 鐧藉悕鍗曞噣鍖栵細浠呬繚鐣欐爣鍑嗘枃妗?ID锛堟椂闂存埑-7浣嶏級骞跺幓閲嶏紝闈炲父瑙勫€间笉杩?SQL锛堥槻娉ㄥ叆/闃茬粨鏋勭牬鍧忥級
        const ids = sanitizeDocIds(tabs.map((tab) => this.rootIdOf(tab)));
        if (ids.length === 0) {
            return {};
        }
        // 鎵撳紑鐨勬枃妗ｉ泦鍚堟病鍙樹笖缂撳瓨鏈繃鏈熸椂鐩存帴澶嶇敤锛堣繑鍥炲壇鏈槻澶栭儴璇敼锛?
        const key = [...ids].sort().join(",");
        if (this.updatedMapCache && this.updatedMapCache.key === key
            && Date.now() - this.updatedMapCache.ts < UPDATED_CACHE_MS) {
            return {...this.updatedMapCache.map};
        }
        try {
            const response = await fetch("/api/query/sql", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({query: `SELECT root_id, updated FROM blocks WHERE type='d' AND root_id IN ('${ids.join("','")}')`}),
            });
            if (!response.ok) {
                throw new Error(`query/sql HTTP ${response.status}`);
            }
            const json = await response.json();
            const map: {[rootId: string]: string} = {};
            (json?.data || []).forEach((row: any) => {
                map[row.root_id] = row.updated;
            });
            this.updatedMapCache = {key, ts: Date.now(), map};
            return map;
        } catch (e) {
            logger.warn("query updated fail", e);
            return {};
        }
    }

    // 鑾峰彇褰撳墠娲诲姩椤电锛堝彲鑳戒负 undefined锛?
    private getActiveTab(): Tab | undefined {
        try {
            return getActiveTab() || undefined;
        } catch (e) {
            logger.warn("get active tab fail", e);
        }
        return undefined;
    }

    // 鎸夊叧閿瓧杩囨护鍗＄墖锛屾暣缁勬棤鍖归厤鏃堕殣钘忓垎缁勶紱杩斿洖鍙鍗＄墖鏁?
    private filterCards(scrollElement: HTMLElement, keyword: string): number {
        const kw = keyword.trim().toLowerCase();
        let visible = 0;
        scrollElement.querySelectorAll<HTMLElement>(".sw__card").forEach((card) => {
            const title = (card.dataset.title || "").toLowerCase();
            const match = !kw || title.includes(kw);
            card.classList.toggle("fn__none", !match);
            if (match) {
                visible++;
            }
        });
        // 鍙鐞嗛〉绛惧崱鐗囧垎缁勶紱鍏ㄥ簱鏂囨。缁撴灉鍖猴紙.sw__doc-results锛夊唴閮ㄦ棤鍗＄墖锛?
        // 璇垽涓虹┖缁勪細瀵艰嚧缁х画杈撳叆鏃舵枃妗ｅ尯琚?fn__none 姘镐箙闅愯棌
        scrollElement.querySelectorAll<HTMLElement>(".sw__group:not(.sw__doc-results)").forEach((group) => {
            const count = group.querySelectorAll(".sw__card:not(.fn__none)").length;
            group.classList.toggle("fn__none", count === 0);
        });
        return visible;
    }

    // 娓叉煋宸︿晶渚ц竟鏍忛潰鏉垮垪琛紙鏂囨。鏍?澶х翰/涔︾/鍙嶉摼/鍏崇郴鍥剧瓑锛屽惈鍏朵粬鎻掍欢娉ㄥ唽鐨勯潰鏉匡級
    // mode锛歨idden 瀹屽叏闅愯棌锛堜繚鎸?fn__none锛屽唴瀹瑰尯鍗犳弧鍏ㄥ锛? collapsed 鎶樺彔鍥炬爣鏉?/ full 瀹屾暣鍒楄〃
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

        // 鎶樺彔 鈬?瀹屾暣 鍒囨崲鎸夐挳锛氬脊绐楀唴鍗虫椂鍒囨崲锛堜笉鍐欏洖璁剧疆锛岃缃彧鍐冲畾鍒濆褰㈡€侊級
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

    // 鏋勫缓涓€涓潰鏉垮垪琛ㄩ」锛堝浘鏍?+ 鍚嶇О锛夛紝鐐瑰嚮鍗虫縺娲昏闈㈡澘
    private createDockItem(panel: IDockPanel, dialog: Dialog): HTMLElement {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sw__dock-item";
        item.dataset.dockType = panel.type;

        // 闈㈡澘褰撳墠宸插睍寮€鏃堕珮浜爣璇?
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
        // 鎶樺彔妯″紡涓?hover 娴嚭鐨勯潰鏉垮悕绉帮紙瀹屾暣妯″紡鐢?CSS 闅愯棌锛?
        const flyout = document.createElement("span");
        flyout.className = "sw__dock-flyout";
        flyout.textContent = panel.title;
        item.appendChild(flyout);

        item.addEventListener("click", () => this.activateDock(panel.type, dialog));
        return item;
    }

    // 婵€娲讳晶杈规爮闈㈡澘骞跺叧闂垏鎹㈠櫒
    private activateDock(type: string, dialog: Dialog) {
        try {
            const dock = this.getDockByType(type);
            if (dock) {
                // 涓庢€濇簮 Ctrl+Tab 鍒囨崲闈㈡澘涓€鑷达細show=true 琛ㄧず鑱氱劍/灞曞紑璇ラ潰鏉?
                dock.toggleModel(type, true);
            }
        } catch (e) {
            logger.warn("switch dock fail", e);
        }
        dialog.destroy();
    }

    // 璇诲彇甯冨眬閰嶇疆涓殑鍏ㄩ儴闈㈡澘锛堝乏/鍙?涓嬩笁渚?dock锛夛紝鍙繚鐣欏綋鍓嶇湡瀹炲瓨鍦ㄧ殑闈㈡澘
    private getDockPanels(): IDockPanel[] {
        const panels: IDockPanel[] = [];
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
                        if (item?.type && this.getDockByType(item.type)) {
                            panels.push({
                                type: item.type,
                                title: item.title || item.type,
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

    // 鎸?type 鏌ユ壘闈㈡澘鎵€灞炵殑 Dock锛堝乏渚?鍙充晶/搴曢儴锛夛紝涓庢€濇簮 getDockByType 琛屼负涓€鑷?
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

    // 椤电鏍囬锛堜紭鍏堝彇椤电澶村凡娓叉煋鏂囨湰锛?
    private titleOf(tab: Tab): string {
        return tab.headElement?.querySelector(".item__text")?.textContent?.trim() || tab.title || tab.id;
    }

    // 姣忔璇诲彇褰撳墠妯″瀷锛岄伩鍏嶅悓涓€椤电瀵艰埅鍒版柊鏂囨。鍚庣户缁娇鐢ㄦ棫 rootID銆?
private rootIdOf(tab: Tab): string | null {
        return resolveTabRootId(tab as unknown as {model?: IProtyleTabModel, headElement?: HTMLElement});
    }

    // 缃《閿細鏂囨。椤电鐢ㄥ叾 rootID锛堣法浼氳瘽绋冲畾锛岄噸寮€鍚屼竴鏂囨。缃《鐘舵€佷繚鐣欙級锛屽叾浣欓€€鍥為〉绛?id
    private pinKeyOf(tab: Tab): string {
        return this.rootIdOf(tab) || tab.id;
    }

    // 璇诲彇缃《鍒楄〃
    private getPinned(): string[] {
        const data = this.data[PINNED_KEY];
        return Array.isArray(data) ? (data as string[]) : [];
    }

    // 鍒囨崲缃《鐘舵€侊紝杩斿洖鍒囨崲鍚庢槸鍚︿负缃《
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
        this.data[PINNED_KEY] = list;
        this.saveDataDebounced(PINNED_KEY);
        return true;
    }

    // ==================== 鏀惰棌 ====================

    // 璇诲彇鏀惰棌鍒楄〃锛堟渶杩戞敹钘忓湪鍓嶏級
    private getFavorites(): IFavoriteItem[] {
        const data = this.data[FAV_KEY];
        return Array.isArray(data) ? (data as IFavoriteItem[]) : [];
    }

    private saveFavorites(list: IFavoriteItem[]) {
        this.data[FAV_KEY] = list;
        this.saveDataDebounced(FAV_KEY);
    }

    // 鍒囨崲鏀惰棌鐘舵€侊紝杩斿洖鍒囨崲鍚庢槸鍚︿负宸叉敹钘?
    private toggleFavorite(tab: Tab): boolean {
        const list = this.getFavorites();
        const rootId = this.rootIdOf(tab);
        if (!rootId) {
            // 鏈В鏋愰〉绛撅紙鎳掑姞杞芥湭婵€娲伙級锛歬ey 浼氶€€鍖栦负涓€娆℃€?tab.id锛屾敹钘忓悗蹇呯劧鏃犳硶璺宠浆锛?
            // 鏄熸爣杩樹細鍦ㄩ〉绛炬縺娲诲悗閿欎贡寮曞彂閲嶅鏀惰棌銆傛澶勪粎鍏佽绉婚櫎鍚岄敭鍘嗗彶鑴忔暟鎹紝鎷掔粷鏂板
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

    // 杩佺Щ鍘嗗彶鑴忔敹钘忔潯鐩細鏃х増鏈浘鎶婃湭瑙ｆ瀽椤电鐨?tab.id锛圲UID锛夊綋浣滄敹钘?key锛?
    // 姝ょ被鏉＄洰 rootId 涓虹┖銆佽烦杞繀鐒跺け鏁堛€傞〉绛炬縺娲昏В鏋愬嚭 rootId 鍚庡皢鍏舵敼鍐欎负绋冲畾閿紱
    // 鑻ュ悓鏂囨。宸插瓨鍦ㄦ甯告潯鐩垯鑴忔潯鐩睘浜庡巻鍙查噸澶嶏紝鐩存帴绉婚櫎銆傝繑鍥炴槸鍚﹀彂鐢熶簡杩佺Щ
    private migrateFavoriteKey(list: IFavoriteItem[], tab: Tab, rootId: string): boolean {
        const index = list.findIndex((item) => item.key === tab.id && item.key !== rootId);
        if (index < 0) {
            return false;
        }
        if (list.some((item) => item.key === rootId)) {
            list.splice(index, 1);
        } else {
            list[index] = {...list[index], key: rootId, rootId};
        }
        this.saveFavorites(list);
        return true;
    }

    private removeFavorite(key: string) {
        this.saveFavorites(this.getFavorites().filter((item) => item.key !== key));
    }

    // ==================== 鏀惰棌鍒嗙粍鎶樺彔鐘舵€佹寔涔呭寲 ====================
    // 鍒嗙粍鎶樺彔鍋忓ソ姝ゅ墠鏄細璇濈骇鐨勶紙閲嶅惎鍗冲叏閮ㄥ睍寮€锛夛紱鏀逛负鎸佷箙鍖栵紝閲嶅惎鍚庝繚鎸佺敤鎴蜂笂娆＄殑灞曞紑/鎶樺彔涔犳儻

    // 浠庢寔涔呭寲鏁版嵁鍒濆鍖?favCollapsed 闆嗗悎
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
    private setupOpenHistoryDropdown(container: HTMLElement | null, onClose: IOverlayClose) {
        if (!container) return;
        container.innerHTML = `<button type="button" class="sw__history-trigger" aria-label="${this.i18n.openHistory}">
    <svg><use xlink:href="#iconClock"></use></svg><span class="sw__history-trigger-text">${this.i18n.openHistory}</span><span class="sw__history-badge"></span>
</button><div class="sw__history-panel fn__none" role="menu"></div>`;
        const trigger = container.querySelector<HTMLElement>(".sw__history-trigger");
        const panel = container.querySelector<HTMLElement>(".sw__history-panel");
        if (!trigger || !panel) return;
        let outsideHandler: ((event: PointerEvent) => void) | null = null;
        let resizeHandler: (() => void) | null = null;
        const close = () => {
            panel.classList.add("fn__none");
            if (outsideHandler) document.removeEventListener("pointerdown", outsideHandler, true);
            if (resizeHandler) window.removeEventListener("resize", resizeHandler);
            outsideHandler = null;
            resizeHandler = null;
        };
        trigger.addEventListener("click", () => {
            if (!panel.classList.contains("fn__none")) { close(); return; }
            this.renderOpenHistoryPanel(panel, (entry) => {
                close();
                onClose();
                void this.openHistoryEntry(entry);
            });
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

    private renderOpenHistoryPanel(panel: HTMLElement, onPick: (entry: IOpenHistoryEntry) => void) {
        panel.innerHTML = "";
        const entries = this.getOpenHistory();
        if (entries.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__history-empty";
            empty.textContent = this.i18n.noOpenHistory;
            panel.appendChild(empty);
            return;
        }
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const openedKeys = new Set(opened.map((tab) => this.pinKeyOf(tab)));
        entries.forEach((entry) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "sw__history-item";
            item.setAttribute("role", "menuitem");
            item.innerHTML = `<svg><use xlink:href="#iconFile"></use></svg><span class="sw__history-copy"><span class="sw__history-title"></span><span class="sw__history-meta"></span></span>`;
            item.querySelector<HTMLElement>(".sw__history-title")!.textContent = entry.title;
            item.querySelector<HTMLElement>(".sw__history-meta")!.textContent = openedKeys.has(entry.key) ? this.i18n.historyOpen : this.i18n.historyClosed;
            item.title = entry.title;
            item.addEventListener("click", () => onPick(entry));
            panel.appendChild(item);
        });
    }

    private async openHistoryEntry(entry: IOpenHistoryEntry) {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const current = opened.find((tab) => this.pinKeyOf(tab) === entry.key);
        if (current) { this.activateTab(current); return; }
        if (!entry.rootId || !BLOCK_ID_RE.test(entry.rootId)) { showMessage(this.i18n.historyInvalid); return; }
        if (this.isMobile) {
            await this.mobileOpenDoc(entry.rootId);
        } else {
            try { await openTab({app: this.app, doc: {id: entry.rootId}}); }
            catch (e) { logger.warn("open history entry fail", e); showMessage(this.i18n.openDocFailed); }
        }
    }

    private refreshOpenHistoryDropdowns() {
        document.querySelectorAll<HTMLElement>(".sw__history-dd").forEach((container) => this.refreshOpenHistoryDropdown(container));
    }

    private refreshOpenHistoryDropdown(container: HTMLElement) {
        const badge = container.querySelector<HTMLElement>(".sw__history-badge");
        if (badge) {
            const count = this.getOpenHistory().length;
            badge.textContent = String(count);
            badge.classList.toggle("fn__none", count === 0);
        }
        container.querySelector<HTMLElement>(".sw__history-panel")?.classList.add("fn__none");
    }

    // ==================== 鏀惰棌涓嬫媺缁勪欢 ====================
    // 鍘熺敓 select 鐨?optgroup 鏃犳硶鎶樺彔涓旀牱寮忕畝闄嬶紝鏀逛负鑷畾涔変笅鎷夛細
    // 瑙﹀彂鎸夐挳锛堟槦鏍?+ 鏁伴噺寰芥爣锛? 娴眰闈㈡澘锛堝垎缁勬爣棰樺彲鎶樺彔/灞曞紑锛岀粍鍐呴」鐐瑰嚮璺宠浆锛?

    // 鍒濆鍖栦竴涓敹钘忎笅鎷夌粍浠讹紙寮圭獥涓庝晶杈规爮鍚勪竴浠斤級
    // onClose锛氶€夋嫨鏀惰棌椤瑰悗鐨勬敹灏撅紙寮圭獥閿€姣?/ 渚ц竟鏍忓埛鏂帮級锛岀粍浠跺唴閮ㄨ繕浼氬悓鏃舵敹璧烽潰鏉?
    private setupFavDropdown(container: HTMLElement, onClose: IOverlayClose, onChanged: IOverlayClose = () => undefined) {
        container.innerHTML = `<button type="button" class="sw__fav-trigger">
    <svg><use xlink:href="#iconStar"></use></svg>
    <span class="sw__fav-trigger-text">${this.i18n.favorites}</span>
    <span class="sw__fav-badge fn__none"></span>
</button>
<div class="sw__fav-panel fn__none"></div>`;

        const trigger = container.querySelector<HTMLElement>(".sw__fav-trigger");
        const panel = container.querySelector<HTMLElement>(".sw__fav-panel");

        // 闈㈡澘鎵撳紑鏈熼棿鎵嶇洃鍚?DOM 鍙樺寲锛氬鍣ㄨ绉婚櫎锛堝脊绐楅攢姣?渚ц竟鏍忛噸娓叉煋锛夋椂瑙ｇ粦鍏ㄥ眬鐩戝惉锛?
        // 闈㈡澘鍏抽棴鍗?disconnect锛岄伩鍏?body 绾?MutationObserver 闅忕紪杈戞搷浣滃叏灞€甯搁┗
        const observer = new MutationObserver(() => {
            if (!container.isConnected) {
                unbindGlobal();
            }
        });
        const unbindGlobal = () => {
            document.removeEventListener("pointerdown", onDocPointerDown, true);
            window.removeEventListener("resize", onReposition);
            document.removeEventListener("scroll", onReposition, true);
            observer.disconnect();
        };
        // 鏀惰捣闈㈡澘骞跺仠姝?DOM 瑙傚療锛堜笁鏉℃敹璧疯矾寰勫叡鐢細鍐嶆鐐瑰嚮瑙﹀彂鍣?/ 鐐瑰嚮澶栭儴 / 閫変腑鏀惰棌椤癸級
        const closePanel = () => {
            panel.classList.add("fn__none");
            // 鍏ㄥ眬鐩戝惉浠呭湪闈㈡澘灞曞紑鏈熼棿瀛樺湪锛屽叧闂悗绔嬪嵆閲婃斁銆?            unbindGlobal();
        };
        // 鐐瑰嚮澶栭儴鏀惰捣闈㈡澘锛涢潰鏉垮叧闂湡闂?MutationObserver 宸插仠姝紝
        // 瀹夸富瀹瑰櫒琚Щ闄ゅ悗鐢辫繖娆″叏灞€鐐瑰嚮鍏滃簳瑙ｇ粦鍏ㄩ儴鐩戝惉
        const onDocPointerDown = (event: PointerEvent) => {
            if (!container.isConnected) {
                unbindGlobal();
                return;
            }
            if (!container.contains(event.target as Node)) {
                closePanel();
            }
        };
        // 瑙嗗彛灏哄/婊氬姩鍙樺寲鏃堕噸鏂拌创浣嶏紙fixed 瀹氫綅涓嶉殢鏂囨。娴佺Щ鍔級
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
                observer.observe(document.body, {childList: true, subtree: true});
            } else {
                closePanel();
            }
        });

        this.refreshFavDropdown(container);
    }

    // 璁＄畻鏀惰棌涓嬫媺闈㈡澘鍧愭爣锛歠ixed 瀹氫綅鑴辩渚ц竟鏍?寮圭獥鐨?overflow 瑁佸壀锛?
    // 瀹藉害鎸夊涓伙紙鍒囨崲鍣ㄥ脊绐楁垨渚ц竟鏍忛潰鏉匡級涓庤鍙ｇ殑鍙敤绌洪棿鏀剁缉锛?
    // 浼樺厛涓庤Е鍙戝櫒鍙冲榻愩€佸嚭鐜板湪涓嬫柟锛涘乏渚ц秺鐣岃创瀹夸富宸︾紭锛屼笅鏂圭┖闂翠笉瓒崇炕杞埌涓婃柟
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
        // 瀹藉害锛氱悊鎯?FAV_PANEL_WIDTH_PX锛屾寜瀹夸富/瑙嗗彛鍙敤绌洪棿鏀剁缉锛岀‘淇濅笉瓒呭嚭渚ц竟鏍?
        const avail = Math.max(0, maxRight - minLeft);
        const width = Math.min(FAV_PANEL_WIDTH_PX, avail);
        let left = Math.min(Math.max(rect.right - width, minLeft), maxRight - width);
        // 鍨傜洿锛氶粯璁ゅ湪瑙﹀彂鍣ㄤ笅鏂癸紝鍓╀綑绌洪棿涓嶈冻鏃剁炕杞埌瑙﹀彂鍣ㄤ笂鏂?
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

    // 娓叉煋涓嬫媺闈㈡澘鍐呭锛氬垎缁勬爣棰橈紙鐐瑰嚮鎶樺彔/灞曞紑锛? 缁勫唴鏀惰棌椤癸紙鐐瑰嚮璺宠浆锛?
    private renderFavPanel(panel: HTMLElement, onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        panel.innerHTML = "";
        const favorites = this.getFavorites();
        const groupNames = this.getFavoriteGroupNames();

        // 鏃㈡棤鏀惰棌涔熸棤鍒嗙粍鎵嶆彁绀虹┖鎬侊紱浠呮湁绌哄垎缁勬椂浠嶅睍绀哄垎缁勶紙鏁伴噺 0锛夛紝涓庤缃〉淇濇寔涓€鑷?
        if (favorites.length === 0 && groupNames.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__fav-empty";
            empty.textContent = this.i18n.noFavorites;
            panel.appendChild(empty);
            return;
        }

        // 鎸夊垎缁勫綊绫伙紙鍒嗙粍椤哄簭 = 娉ㄥ唽琛ㄦ柊寤洪『搴忓湪鍓嶏紱娉ㄥ唽琛ㄤ腑鐨勭┖鍒嗙粍涔熷崰浣嶏紝鏁伴噺鏄剧ず 0锛?
        const groups = groupFavoritesByGroup(favorites, groupNames);

        // 鏈夊垎缁勬椂鏈垎缁勭殑缃簳鏄剧ず涓恒€屾湭鍒嗙粍銆嶏紱鏃犱换浣曞垎缁勬椂骞抽摵涓嶆樉绀虹粍澶?
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
    }

    // 娓叉煋鍗曚釜鏀惰棌鍒嗙粍锛氬彲鎶樺彔缁勫ご锛堝彸閿脊鍑轰竴閿紑/鍏宠彍鍗曪級+ 缁勫唴椤瑰垪琛?
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
        // 鍙抽敭寮瑰嚭銆屼竴閿紑鍚?鍏抽棴缁勫唴椤电銆嶈彍鍗曪紝涓?v0.14.0 changelog 鎻忚堪瀵归綈
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

    // 鏃犱换浣曞垎缁勬椂鐨勫钩閾哄垪琛紙涓嶆樉绀虹粍澶达級
    private appendFavFlatList(panel: HTMLElement, items: IFavoriteItem[], onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        const list = document.createElement("div");
        list.className = "sw__fav-items sw__fav-items--flat";
        items.forEach((fav) => {
            list.appendChild(this.makeFavItem(panel, fav, onPick, onChanged));
        });
        panel.appendChild(list);
    }

    // 鐢熸垚鍗曚釜鏀惰棌椤规寜閽細鐐瑰嚮璺宠浆锛涘彸閿脊鍑烘搷浣滆彍鍗曪紙绉诲姩鑷冲垎缁?/ 鍙栨秷鏀惰棌锛?
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

    // 鍒锋柊鍗曚釜涓嬫媺缁勪欢鐨勮Е鍙戞寜閽窘鏍囷紱闈㈡澘灞曞紑涓垯鏀惰捣锛堝唴瀹瑰湪涓嬫鎵撳紑鏃堕噸寤猴級
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

    // 淇敼鏀惰棌椤圭殑鍒嗙粍锛坓roup 涓虹┖琛ㄧず绉诲嚭鍒嗙粍锛?
    private setFavoriteGroup(key: string, group: string) {
        const list = this.getFavorites();
        const item = list.find((fav) => fav.key === key);
        if (!item) {
            return;
        }
        item.group = group.trim();
        this.saveFavorites(list);
        this.refreshFavSelects();
    }

    // 鏀惰棌椤电鍒版寚瀹氬垎缁勶紙宸叉敹钘忓垯浠呰皟鏁村垎缁勶級锛岀敤浜庤彍鍗曞揩閫熸敹钘忓埌缁?
    private addFavoriteToGroup(tab: Tab, group: string) {
        const list = this.getFavorites();
        const rootId = this.rootIdOf(tab);
        if (!rootId) {
            // 涓?toggleFavorite 涓€鑷达細鏈В鏋愰〉绛炬嫆缁濆叆缁勶紝閬垮厤浜х敓鏃犳硶璺宠浆鐨勮剰鏉＄洰
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

    // 鍒嗙粍娉ㄥ唽琛紙鍏佽瀛樺湪绌哄垎缁勶細璁剧疆椤垫柊寤哄悗灏氭湭鏀惰棌浠讳綍椤电鐨勫垎缁勶級
    private getFavGroupRegistry(): string[] {
        const data = this.data[FAV_GROUPS_KEY];
        return Array.isArray(data) ? (data as unknown[]).filter((name): name is string => typeof name === "string" && !!name) : [];
    }

    private saveFavGroupRegistry(names: string[]) {
        this.data[FAV_GROUPS_KEY] = names;
        this.saveDataDebounced(FAV_GROUPS_KEY);
    }

    // 鍏ㄩ儴鍒嗙粍鍚嶏細娉ㄥ唽琛ㄥ湪鍓嶄繚鎸佹柊寤洪『搴忥紝鍐嶅苟鍏ユ敹钘忛」涓婂嚭鐜拌繃鐨勫垎缁勫悕锛屽幓閲?
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

    // 鏂板缓鍒嗙粍锛堥噸鍚嶇洿鎺ュ拷鐣ワ紝杩斿洖鏄惁鍒涘缓鎴愬姛锛?
    private createFavoriteGroup(name: string): boolean {
        const trimmed = name.trim();
        if (!trimmed || this.getFavoriteGroupNames().includes(trimmed)) {
            return false;
        }
        this.saveFavGroupRegistry(this.getFavGroupRegistry().concat(trimmed));
        return true;
    }

    // 鍒犻櫎鍒嗙粍锛氭敞鍐岃〃绉婚櫎锛岀粍鍐呮敹钘忛」绉诲嚭鍒版湭鍒嗙粍
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
        // 鍒嗙粍琚垹鍚庢竻鐞嗗叾鎶樺彔鐘舵€?
        if (this.favCollapsed.delete(name)) {
            this.saveFavCollapsed();
        }
        this.refreshFavSelects();
    }

    // 閲嶅懡鍚嶅垎缁勶細璇ョ粍鍏ㄩ儴鏀惰棌椤硅縼绉诲埌鏂板悕绉帮紝娉ㄥ唽琛ㄥ悓姝ユ敼鍚嶏紙绌哄垎缁勪篃鍙噸鍛藉悕锛?
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
        // 鍒嗙粍閲嶅懡鍚嶅悗鍚屾杩佺Щ鍏舵姌鍙犵姸鎬?
        if (this.favCollapsed.delete(from)) {
            this.favCollapsed.add(to);
            this.saveFavCollapsed();
        }
        this.refreshFavSelects();
    }

    // 鍒锋柊鍗＄墖鏀惰棌鐘舵€佹爣璇嗭紙瀹炲績/绌哄績鏄熶笌鎻愮ず鏂囨锛?
    private refreshCardFavState(tab: Tab, card: HTMLElement) {
        const isFaved = this.getFavorites().some((item) => item.key === this.pinKeyOf(tab));
        card.classList.toggle("sw__faved", isFaved);
        const favoriteButton = card.querySelector<HTMLElement>(".sw__fav-btn");
        const label = isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab;
        favoriteButton?.setAttribute("aria-label", label);
        favoriteButton?.setAttribute("title", label);
    }

    // 鏄熸爣鐐瑰嚮鑿滃崟锛氭湭鏀惰棌鏃堕€夋嫨鏀惰棌鏂瑰紡锛堝揩閫熸敹钘?/ 鏀惰棌鍒板垎缁?/ 鏂板缓鍒嗙粍鏀惰棌锛夛紝
    // 宸叉敹钘忔椂绠＄悊鍒嗙粍锛堝垏鎹㈠垎缁?/ 绉诲嚭鍒嗙粍 / 鍙栨秷鏀惰棌锛?
    private openFavMenu(tab: Tab, card: HTMLElement, event: MouseEvent) {
        const key = this.pinKeyOf(tab);
        const favorite = this.getFavorites().find((item) => item.key === key);
        const groupNames = this.getFavoriteGroupNames();
        const menu = new Menu("swFavMenu");

        // 鏈敹钘?/ 宸叉敹钘忎袱濂楄彍鍗曢」锛屽垎鏀樊寮傚緢澶ф晠鎷嗗紑鍚勮嚜鏋勫缓
        if (!favorite) {
            this.buildFavMenuUnfavorited(menu, tab, card, groupNames);
        } else {
            this.buildFavMenuFavorited(menu, tab, card, key, favorite, groupNames);
        }
        menu.open({x: event.clientX, y: event.clientY});
    }

    // 鏈敹钘忚彍鍗曪細鍏堟敹钘忥紙鏃犲垎缁勶級锛屽啀鍒楀凡鏈夊垎缁勫彲鐩存帴褰掑叆锛屾渶鍚庢柊寤哄垎缁?
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

    // 宸叉敹钘忚彍鍗曪細鍒嗙粍鍒楄〃锛堝綋鍓嶅垎缁勬墦鍕撅級+ 绉诲嚭鍒嗙粍 + 鏂板缓鍒嗙粍 + 鍙栨秷鏀惰棌
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

    // 鏀惰棌鍒嗙粍鍙抽敭鑿滃崟锛氫竴閿紑鍚?鍏抽棴缁勫唴椤电
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

    // 鏀惰棌涓嬫媺椤瑰彸閿彍鍗曪細绉诲姩鍒版棦鏈夊垎缁勶紙瀛愯彍鍗曪紝褰撳墠鍒嗙粍鍕鹃€夛級/ 鍙栨秷鏀惰棌銆?
    // 鎿嶄綔鍚庝繚鎸侀潰鏉垮睍寮€骞跺氨鍦伴噸寤猴紝鏂逛究杩炵画澶勭悊澶氫釜鏀惰棌椤广€?
    private openFavItemMenu(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void, event: MouseEvent, onChanged: IOverlayClose = () => undefined) {
        const menu = new Menu("swFavItemMenu");
        const moveSub = [{checked: !fav.group, label: this.escapeAttr(this.i18n.ungrouped),
            click: () => this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, ""), panel, onPick, onChanged)}];
        this.getFavoriteGroupNames().forEach((name) => {
            moveSub.push({checked: fav.group === name, label: this.escapeAttr(name),
                click: () => this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, name), panel, onPick, onChanged)});
        });
        menu.addItem({type: "submenu", label: this.i18n.moveToGroup, icon: "iconFolder", submenu: moveSub});
        // 鏂板缓鍒嗙粍骞剁Щ鍔細寮圭獥杈撳叆鍒嗙粍鍚嶏紙鏂板悕绉拌嚜鍔ㄦ柊寤猴紝鐣欑┖绉诲嚭鍒嗙粍锛?
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

    // 鎵ц鏀惰棌椤瑰彉鏇达細鍏堣惤鐩樺苟鍚屾鎵€鏈変笅鎷夌殑寰芥爣锛坮efreshFavSelects 浼氭敹璧峰睍寮€涓殑闈㈡澘锛夛紝
    // 鍐嶈褰撳墠闈㈡澘淇濇寔灞曞紑骞跺氨鍦伴噸寤猴紝鏈€鍚庢寜鏂板唴瀹归珮搴﹂噸鏂拌创浣?
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

    // 杞箟 HTML 灞炴€у€硷紙鍒嗙粍鍚嶇瓑鐢ㄦ埛杈撳叆鎷煎叆妯℃澘鏃堕槻娉ㄥ叆锛汳enu label 涓?innerHTML 浜﹂渶杞箟锛?
    private escapeAttr(text: string): string {
        return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // 寮圭獥璁剧疆鏀惰棌椤圭殑鍒嗙粍锛氳緭鍏ュ垎缁勫悕锛堢暀绌虹Щ鍑哄垎缁勶級锛宒atalist 鍒楀嚭宸叉湁鍒嗙粍渚夸簬蹇€熼€夋嫨锛?
    // 鏈敹钘忕殑椤电纭鍚庤嚜鍔ㄦ敹钘忓埌璇ュ垎缁?
    private openGroupDialog(tab: Tab, card?: HTMLElement) {
        const key = this.pinKeyOf(tab);
        const favorite = this.getFavorites().find((item) => item.key === key);
        const groupNames = this.getFavoriteGroupNames();
        const dialog = new Dialog({
            title: `${this.i18n.setGroup} 路 ${this.escapeAttr(this.titleOf(tab))}`,
            content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block sw__group-input" placeholder="${this.i18n.groupName}" list="sw__group-list" value="${this.escapeAttr(favorite?.group || "")}" />
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
            // 鏈敹钘忔椂涓€骞舵敹钘忥紱宸叉敹钘忔椂浠呰皟鏁村垎缁勶紙鐣欑┖绉诲嚭鍒嗙粍锛?
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

    // 鏀惰棌涓嬫媺椤癸細鏂板缓鍒嗙粍骞剁Щ鍔ㄣ€傚脊绐楄緭鍏ュ垎缁勫悕锛堟柊鍚嶇О鑷姩鏂板缓锛岀暀绌虹Щ鍑哄垎缁勶級锛?
    // datalist 鍒楀嚭鏃㈡湁鍒嗙粍渚夸簬蹇€熼€夋嫨锛涚‘璁ゅ悗灏卞湴鍒锋柊涓嬫媺闈㈡澘
    private openFavoriteGroupDialog(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void, onChanged: IOverlayClose = () => undefined) {
        const groupNames = this.getFavoriteGroupNames();
        const dialog = new Dialog({
            title: `${this.i18n.setGroup} 路 ${this.escapeAttr(fav.title)}`,
            content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block sw__group-input" placeholder="${this.i18n.groupName}" list="sw__group-list" value="${this.escapeAttr(fav.group || "")}" />
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

    // 鏀惰棌鏉＄洰鐨勫彲璺宠浆 rootId锛氫紭鍏堝彇 rootId 瀛楁锛岀己澶辨椂鍥為€€ key锛涗袱鑰呴兘蹇呴』鏄?
    // 鍧?ID 鏍煎紡鈥斺€斿巻鍙茶剰鏉＄洰鐨?key 鏄竴娆℃€?tab.id锛圲UID锛夛紝openTab 鏃犳硶瑙ｆ瀽鍙細闈欓粯澶辫触
    private resolveFavRootId(favorite: IFavoriteItem): string {
        if (favorite.rootId && BLOCK_ID_RE.test(favorite.rootId)) {
            return favorite.rootId;
        }
        return BLOCK_ID_RE.test(favorite.key) ? favorite.key : "";
    }

    // 璺宠浆鍒版敹钘忛」锛氶〉绛惧凡寮€鍒欏垏鎹㈣繃鍘伙紱椤电宸插叧闂垯鎸?rootId 閲嶅紑銆?
    // 鏀惰棌椤规案涔呯暀瀛橈紙鐩村埌鐢ㄦ埛涓诲姩鍒犻櫎锛夛細鏃犳硶瀹氫綅鏂囨。鐨勫巻鍙茶剰鏉＄洰浠呮彁绀恒€佷笉鑷姩娓呯悊锛?
    // 鐢ㄦ埛鎵撳紑瀵瑰簲椤电鍚庢槦鏍囨搷浣滀細鑷姩灏嗗叾杩佺Щ淇
    private async jumpToFavorite(favorite: IFavoriteItem, onClose: IOverlayClose) {
        // 鎵嬫満绔?getAllTabs() 鎭掍负绌猴紝闇€鐢?MobileTabs 鏁版嵁婧?
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const tab = opened.find((item) => this.pinKeyOf(item) === favorite.key);
        if (tab) {
            this.activateTab(tab, onClose);
            return;
        }
        const rootId = this.resolveFavRootId(favorite);
        if (!rootId) {
            showMessage(this.i18n.favInvalidEntry);
            return;
        }
        onClose();
        if (this.isMobile) {
            // openTab 鍦ㄦ墜鏈虹鏄┖瀹炵幇锛岃蛋 MobileTabs.open
            const ok = await this.mobileOpenDoc(rootId);
            if (!ok) {
                showMessage(this.i18n.openDocFailed);
            }
        } else {
            openTab({
                app: this.app,
                doc: {id: rootId},
            });
        }
    }

    // 涓€閿紑鍚粍鍐呭叏閮ㄩ〉绛撅細鎵撳紑鏈墦寮€鐨勬敹钘忥紙rootId 鏍￠獙涓?jumpToFavorite 涓€鑷达紝
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
        const plan = planGroupOpenFavorites(items, openedKeys, (favorite) => this.resolveFavRootId(favorite));
        let failed = plan.invalid;
        const attempted: string[] = [];
        for (const {favorite: fav, rootId} of plan.targets) {
            if (this.isMobile) {
                // openTab 鍦ㄦ墜鏈虹鏄┖瀹炵幇锛屼覆琛岀瓑寰?mobileOpenDoc 瀹屾垚锛岄伩鍏嶅苟鍙戜涪璋冪敤锛?
                // 鎸夎繑鍥炵粨鏋滆鏁帮紙鏂囨。宸插垹闄ょ瓑澶辫触涓嶈鍏ワ紝涓嶈櫄鎶ユ彁绀猴級
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
                // 妗岄潰绔繛缁?openTab 鏃剁◢浣滅瓑寰咃紝璁╂€濇簮瀹屾垚椤电鍒涘缓涓庣姸鎬佹洿鏂?
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

    // 涓€閿叧闂粍鍐呭凡鎵撳紑鐨勯〉绛撅細鎸?pinKey 鍖归厤褰撳墠鎵撳紑椤电锛岃繑鍥炲疄闄呭叧闂暟
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
        const keys = new Set(items.map((fav) => this.resolveFavRootId(fav)).filter(Boolean));
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const targets = opened.filter((tab) => keys.has(this.pinKeyOf(tab)));
        let failed = 0;
        const attempted: string[] = [];
        for (const tab of targets) {
            // 浠呯粺璁＄湡姝ｅ叧闂垚鍔熺殑椤电锛屽け璐ヤ笉璁″叆鎻愮ず鏁?
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

    // 缁勫唴鎺掑簭锛氱疆椤堕〉绛惧浐瀹氬湪鏈€鍓嶏紝鍏朵綑鎸夋墍閫夋柟寮忔帓搴?
    private sortItems(items: IGroupedTab[], sortBy: SortBy, mru: string[], updatedMap: {[rootId: string]: string}) {
        if (sortBy === "titleAsc" || sortBy === "titleDesc") {
            items.sort((a, b) => {
                const result = this.titleOf(a.tab).localeCompare(this.titleOf(b.tab), undefined, {numeric: true});
                return sortBy === "titleAsc" ? result : -result;
            });
        } else if (sortBy === "layoutDesc") {
            items.reverse(); // 鎵撳紑椤哄簭鍊掑簭锛氬弽杞?getAllTabs 鐨勫竷灞€椤哄簭
        } else if (sortBy === "updatedDesc") {
            // 鏈€杩戠紪杈戯細鎸夋枃妗?updated 鏃堕棿鍊掑簭锛屾棤鏁版嵁鐨勬帓鍚庨潰
            items.sort((a, b) => {
                const ua = updatedMap[this.rootIdOf(a.tab) || ""] || "";
                const ub = updatedMap[this.rootIdOf(b.tab) || ""] || "";
                return ua < ub ? 1 : ua > ub ? -1 : 0;
            });
        } else if (sortBy === "mru") {
            // MRU 涓秺闈犲墠瓒婃柊锛涗笉鍦ㄨ褰曚腑鐨勯〉绛炬寜鎵撳紑椤哄簭鎺掑湪鍚庨潰銆?
            // 鎸?pinKey锛堟枃妗ｉ〉绛句负 rootID锛夊尮閰嶏紝涓?activateTab 鐨勮褰曢敭涓€鑷达紝鎵嬫満绔?妗岄潰绔叡鐢ㄥ悓涓€浠?MRU
            items.sort((a, b) => {
                const ra = mru.indexOf(this.pinKeyOf(a.tab));
                const rb = mru.indexOf(this.pinKeyOf(b.tab));
                return (ra < 0 ? Number.MAX_SAFE_INTEGER : ra) - (rb < 0 ? Number.MAX_SAFE_INTEGER : rb);
            });
        }
        // layout锛氫繚鎸?getAllTabs 杩斿洖鐨勫竷灞€椤哄簭锛屾棤闇€澶勭悊
    }

    // 鎸夌獥鍙ｅ垎缁勫苟娓叉煋鍏ㄩ儴椤电
    // onOverlayClose锛氭縺娲婚〉绛?鎵撳紑鏂囨。鍚庣殑鏀跺熬锛堝脊绐楅攢姣侊紱渚ц竟鏍忓埛鏂帮級
    // onTabsChanged锛氬叧闂〉绛惧悗鐨勬敹灏撅紙寮圭獥淇濇寔鎵撳紑锛涗晶杈规爮鍒锋柊锛?
    private renderList(scrollElement: HTMLElement, tabs: Tab[], activeTab: Tab | undefined,
                       opts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
                       sortBy: SortBy, updatedMap: {[rootId: string]: string} = {}) {
        // 娓呯┖鍓嶆敹闆嗘棫鍗＄墖锛氭帓搴忓垏鎹?鍒楄〃鍒锋柊鏃跺悓椤电鍗＄墖鐩存帴澶嶇敤锛堢Щ鍔?DOM 鑰岄潪閲嶅缓锛夛紝
        // 宸叉覆鏌撶殑缂╃暐鍥惧師鏍蜂繚鐣欙紝閲嶆帓鐬椂瀹屾垚
        const reusable = new Map<string, HTMLElement>();
        scrollElement.querySelectorAll<HTMLElement>(".sw__card").forEach((card) => {
            if (card.dataset.tabId) {
                reusable.set(card.dataset.tabId, card);
            }
        });
        scrollElement.innerHTML = "";
        const settings = this.getSettings();
        scrollElement.style.setProperty("--sw-thumb-height", `${settings.thumbHeight}px`);

        const activeTabId = activeTab?.id;
        const mru = this.getMru();
        const pinned = new Set(this.getPinned());
        const favorites = new Set(this.getFavorites().map((item) => item.key));

        // 鎸?parent锛圵nd锛夊垎鏍忓垎缁勶紝淇濇寔 getAllTabs 鐨勫竷灞€鏍戦『搴?
        const groups = buildTabGroupsByParent(tabs, scrollElement);
        const ctx: ITabGroupRenderCtx = {reusable, activeTabId, pinned, favorites, mru, settings, opts};

        const all: IGroupedTab[] = [];
        const focusState: {defaultFocusIndex: number} = {defaultFocusIndex: 0};
        groups.forEach((group) => {
            const ordered = this.sortGroupItems(group, sortBy, mru, pinned, updatedMap);
            this.renderTabGroup(scrollElement, ordered, ctx, all, focusState);
        });

        if (all.length === 0) {
            scrollElement.appendChild(this.buildEmptyState());
            return;
        }

        // 鍒濆鐒︾偣
        this.focusCard(all[focusState.defaultFocusIndex]?.card);

        // 瑙嗗彛鎳掓覆鏌撶缉鐣ュ浘锛氬鐢ㄥ崱鐗囪烦杩囷紝鏂板崱鐗囨粴鍏ュ彲瑙嗗尯鏃舵墠鐢熸垚
        this.renderThumbnails(all, scrollElement, THUMB_BATCH);
    }

    // 鍗曚竴鍒嗙粍鎺掑簭锛氱疆椤堕〉绛惧浐瀹氬湪鍓嶏紝鍏朵綑鎸?sortBy 鎺掑垪锛坮estItems 鍐呴儴 sort 璧?stable 鎺掑簭锛?
    private sortGroupItems(
        group: IGroupedTab[],
        sortBy: SortBy,
        mru: string[],
        pinned: Set<string>,
        updatedMap: {[rootId: string]: string},
    ): IGroupedTab[] {
        const pinnedItems = group.filter((item) => pinned.has(this.pinKeyOf(item.tab)));
        const restItems = group.filter((item) => !pinned.has(this.pinKeyOf(item.tab)));
        this.sortItems(restItems, sortBy, mru, updatedMap);
        return [...pinnedItems, ...restItems];
    }

    // 娓叉煋鍗曚竴鍒嗙粍锛歭abel + grid + 鍚勫崱鐗囷紱鍗＄墖鑾峰彇濮旀墭 acquireGroupCard锛涚疮绉?defaultFocusIndex
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
            // 榛樿鑱氱劍 MRU 閲屾渶杩戜娇鐢ㄧ殑锛堥潪褰撳墠娲诲姩锛夐〉绛撅紝鏇磋创杩?win+tab 浣撻獙
            // MRU 鎸?pinKey锛堟枃妗ｉ〉绛句负 rootID锛夎褰曪紝闇€鍚岄敭鍖归厤
            if (item.tab.id !== ctx.activeTabId && ctx.mru.indexOf(this.pinKeyOf(item.tab)) === 0) {
                focusState.defaultFocusIndex = all.length - 1;
            }
        });
        groupEl.appendChild(grid);
        scrollElement.appendChild(groupEl);
    }

    // 鍙栧緱鍒嗙粍鍐呭崟寮犲崱鐗囷細浼樺厛澶嶇敤鏃у崱鐗囷紙鍚屾鐘舵€佺被/鍥炬爣/鏍囬锛岀缉鐣ュ浘涓嶅姩锛屼簨浠舵部鏃ч棴鍖咃級锛屽惁鍒欐柊寤猴紱
    // 鍙岀鍒嗙粍娓叉煋鍏辩敤锛坮enderTabGroup/renderMobileCardsInGroup锛夛紝鎵嬫満绔拷鍔?sw__mobile-card 淇グ绫?
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

    // 鏋勯€犲垎缁勫崱鐗囩綉鏍硷紱渚ц竟鏍忕敱涓撶敤璁剧疆 sidebarLayout 鎺у埗鍒楁暟锛圕SS 鑷姩鍝嶅簲瀹藉害锛夛紝寮圭獥浠嶇敤鍏ㄥ眬 columns
    private buildTabGroupGrid(scrollElement: HTMLElement, count: number, settings: ISwSettings): HTMLElement {
        const grid = document.createElement("div");
        grid.className = "sw__grid";
        const isSidebar = !!scrollElement.closest(".sw--sidebar");
        if (!isSidebar && settings.columns >= 2) {
            grid.style.gridTemplateColumns = `repeat(${settings.columns}, 1fr)`;
        }
        return grid;
    }

    // 澶嶇敤鏃у崱鐗囨椂鍚屾鐘舵€侊細缃《/鏀惰棌/婵€娲荤被鍚嶄笌鍥炬爣銆佹爣棰樻枃鏈?
    private syncCardState(card: HTMLElement, tab: Tab, isActive: boolean, isPinned: boolean, isFaved: boolean) {
        this.cardTabs.set(card, tab);
        const previousRootId = card.dataset.rootId || "";
        const rootId = this.rootIdOf(tab) || "";
        card.className = "sw__card"
            + (isActive ? " sw__active" : "")
            + (isPinned ? " sw__pinned" : "")
            + (isFaved ? " sw__faved" : "");
        const title = this.titleOf(tab);
        card.dataset.title = title;
        card.dataset.rootId = rootId;
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

    // 绌烘€侊細涓绘枃妗?+ 寮曞鍓枃妗堬紙鎻愮ず鍙悳绱㈠叏搴撴枃妗ｏ級
    private buildEmptyState(): HTMLElement {
        const empty = document.createElement("div");
        empty.className = "sw__empty";
        empty.innerHTML = `<div class="sw__empty-title"></div><div class="sw__empty-sub"></div>`;
        empty.querySelector(".sw__empty-title")!.textContent = this.i18n.noOpenedTabs;
        empty.querySelector(".sw__empty-sub")!.textContent = this.i18n.emptyHint;
        return empty;
    }

    // 缃《/鍙栨秷缃《锛氭洿鏂扮姸鎬併€佸浘鏍囦笌鎻愮ず鏂囨锛屽苟璋冩暣鍗＄墖浣嶇疆锛堢疆椤剁Щ鍔ㄥ埌鏈粍鏈€鍓嶏級
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

    // 鏀惰棌/鍙栨秷鏀惰棌锛堝彸閿彍鍗曞叆鍙ｏ級锛氭洿鏂板崱鐗囨爣璇嗕笌鎻愮ず鏂囨锛屽苟鍒锋柊椤舵爮鏀惰棌涓嬫媺
    private handleToggleFav(tab: Tab, card: HTMLElement) {
        this.toggleFavorite(tab);
        this.refreshCardFavState(tab, card);
        this.refreshFavSelects();
    }

    // 鎸夊弻绔€傞厤鍏抽棴鍗曚釜椤电锛堜粎鍏抽棴鍔ㄤ綔鏈韩锛屼笉鍚崱鐗囩Щ闄?鍒楄〃鍒锋柊绛夋敹灏撅級锛?
    // 杩斿洖鏄惁鐪熸鍏抽棴鎴愬姛锛屼緵鎵归噺鍏抽棴鍑嗙‘璁℃暟
    private async closeTabQuietly(tab: Tab): Promise<boolean> {
        if (this.isMobile) {
            // 鎵嬫満绔細MobileTabs.close 鍏抽棴椤电锛涘繀椤讳繚鎸佸涓诲璞¤皟鐢紙瑁歌皟鐢ㄤ涪 this锛夛紝
            // await 杩斿洖鍊间互渚挎壒閲忓叧闂椂涓茶绛夊緟锛屽畬鎴愬悗缁欑姸鎬佷竴灏忔娌夐檷鏃堕棿
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

    // 鍦ㄧ粺涓€鏃堕棿绐楀唴鏍稿鏁寸粍缁撴灉锛岄伩鍏嶉€愰」绛夊緟瀵艰嚧鎵归噺鎿嶄綔闅忛〉绛炬暟绾挎€у彉鎱€?
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

    // 灏忕潯宸ュ叿锛氭壒閲忓紑/鍏抽〉绛炬椂閬垮厤绔炴€?
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    // 鍏抽棴椤电锛氱Щ闄ら〉绛句笌鍗＄墖锛涗晶杈规爮妯″紡涓嬫暣鍒楄〃鍒锋柊锛堝脊绐椾繚鎸佹墦寮€锛?
    private async handleCloseTab(tab: Tab, card: HTMLElement, onTabsChanged: IOverlayClose) {
        // 绛夊緟椤电鐪熸鍏抽棴鍚庡啀绉婚櫎鍗＄墖锛屼繚璇?onTabsChanged锛堜晶杈规爮鍒锋柊锛夎Е鍙戞椂璇诲埌鏈€鏂板垪琛?
        const closed = await this.closeTabQuietly(tab);
        if (!closed) {
            showMessage(this.i18n.closeTabFailed, MESSAGE_DEFAULT_MS, "error");
            return;
        }
        // 鍏堝彇寮曠敤鍐嶇Щ闄ゅ崱鐗囷紙remove 鍚?closest 杩斿洖 null锛?
        const group = card.closest(".sw__group");
        const scroll = card.closest(".sw__scroll");
        card.remove();
        // 鍚屾鎵€鍦ㄥ垎缁勶細鏇存柊璁℃暟锛岀粍鍐呮竻绌哄垯绉婚櫎鍒嗙粍瀹瑰櫒锛堝脊绐楁ā寮忎笉鏁村垪琛ㄩ噸寤猴級
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
        // 鍏ㄩ儴椤电鍏抽棴鍚庡睍绀虹┖鎬侊紙寮圭獥淇濇寔鎵撳紑锛岀敤鎴峰彲鎼滅储鍏ㄥ簱鏂囨。鎵撳紑鏂扮殑锛?
        if (scroll && scroll.querySelectorAll(".sw__card").length === 0 && !scroll.querySelector(".sw__doc-results")) {
            scroll.appendChild(this.buildEmptyState());
        }
        onTabsChanged();
    }

    // 鏋勫缓涓€寮犻〉绛惧崱鐗囷紙缂╃暐鍥惧尯鍩?+ 搴曢儴淇℃伅 + 缃《/鏀惰棌/鍏抽棴鎸夐挳 + 鍙抽敭鑿滃崟锛?
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

        card.appendChild(this.buildCardThumb());
        card.appendChild(this.buildCardMeta(tab));
        card.appendChild(this.buildCardActions(tab, card, isPinned, isFaved, handlers));
        item.card = card;

        // 妗岄潰鍙抽敭 / 鎵嬫満闀挎寜锛氬潎寮瑰悓涓€鎿嶄綔鑿滃崟锛坧in / fav / 鍒嗙粍 / close锛?
        card.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openCardMenu(this.cardTabs.get(card) || tab, card, handlers, event.clientX, event.clientY);
        });
        if (this.isMobile) {
            this.bindCardLongPress(card, tab, handlers);
        }

        // 鐐瑰嚮鏁村崱鍒囨崲鍒拌椤电锛沵ouseenter 鐢ㄤ簬閿洏瀵艰埅鐨勬偓娴仛鐒?
        card.addEventListener("click", () => handlers.onActivate(this.cardTabs.get(card) || tab));
        card.addEventListener("mouseenter", () => this.focusCard(card));
        return card;
    }

    // 缂╃暐鍥惧崰浣嶏紙鍐呭鐢?renderThumbnails 鍒嗘壒濉叆锛?
    private buildCardThumb(): HTMLElement {
        const thumb = document.createElement("div");
        thumb.className = "sw__thumb";
        const loading = document.createElement("div");
        loading.className = "sw__thumb-loading";
        loading.innerHTML = `<svg class="sw__spin"><use xlink:href="#iconRefresh"></use></svg><span>${this.i18n.loadingThumbnail}</span>`;
        thumb.appendChild(loading);
        return thumb;
    }

    // 搴曢儴锛氬浘鏍?+ 鏍囬锛涘浘鏍囧鐢ㄩ〉绛惧ご宸叉覆鏌撳ソ鐨勫唴瀹癸紝淇濊瘉涓庣湡瀹為〉绛句竴鑷?
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

    // 鍗＄墖鍥炬爣锛氭€濇簮 svg sprite > emoji 瀛楃 > tab.icon 鍏滃簳
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
            // 鍏滃簳锛氭€濇簮鍥炬爣鍚嶈蛋 svg use锛沞moji 瀛楃锛堟墜鏈虹鏂囨。鑷畾涔夊浘鏍囷級鎸夋枃鏈覆鏌?
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

    // 瑙掓爣鎸夐挳锛堢疆椤?+ 鏀惰棌 + 鍏抽棴锛夛紝缁熶竴杩斿洖 Fragment 渚夸簬涓€娆℃€ф彃鍏?
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

        // 缃《鎸夐挳锛堝乏涓婅锛夛細宸茬疆椤舵樉绀哄疄蹇冨浘閽夛紝tooltip 鎻愮ず褰撳墠鍙墽琛岀殑鎿嶄綔
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

        // 鏀惰棌鎸夐挳锛堝乏涓婅锛岀揣閭荤疆椤讹級锛氭湭鏀惰棌绌哄績鏄熴€佸凡鏀惰棌瀹炲績鏄燂紙CSS 鍙橀噺 --b3-icon-star-fill 鍒囨崲濉厖锛?
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "sw__fav-btn";
        favBtn.setAttribute("aria-label", isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab);
        favBtn.title = isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab;
        favBtn.innerHTML = '<svg><use xlink:href="#iconStar"></use></svg>';
        favBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            // 鐐瑰嚮鏄熸爣寮瑰嚭鍒嗙粍鑿滃崟锛氭敹钘忔椂鍙洿鎺ラ€夊垎缁?鏂板缓鍒嗙粍锛屽凡鏀惰棌鏃跺彲鍒囨崲鍒嗙粍鎴栧彇娑堟敹钘?
            this.openFavMenu(this.cardTabs.get(card) || tab, card, event);
        });
        frag.appendChild(favBtn);

        // 鍏抽棴鎸夐挳锛堝彸涓婅锛?
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

    // 鎵嬫満绔暱鎸夛紙鈮?00ms锛夊脊鍑轰笌妗岄潰鍙抽敭涓€鑷寸殑鎿嶄綔鑿滃崟锛?
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
                // 闃绘闀挎寜缁撴潫鍚庡悎鎴?click 瑙﹀彂椤电鍒囨崲
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

    // 鍗＄墖鎿嶄綔鑿滃崟锛堟闈㈠彸閿?/ 鎵嬫満闀挎寜鍏辩敤锛夛細缃《 / 鏀惰棌 / 鍒嗙粍 / 鍏抽棴
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
        // 鍒嗙粍绠＄悊锛氬凡鏀惰棌鏃跺揩閫熺Щ鍔ㄨ嚦鍒嗙粍锛堝瓙鑿滃崟锛屽綋鍓嶅垎缁勫嬀閫夛級+ 鏂板缓鍒嗙粍骞剁Щ鍔紱
        // 鏈敹钘忔椂鏀惰繘鏀惰棌骞堕€夋嫨鍒嗙粍
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
    // 缂撳瓨鎸夋枃妗?rootID 绱㈠紩锛氬彧瑕佽鏂囨。椤电杩樺紑鐫€锛堝摢鎬曢噸鍚?閲嶇疆甯冨眬鍚庨噸鏂版仮澶嶏級锛?
    // 缂撳瓨灏变繚鐣欏苟鍦ㄩ〉绛?DOM 鏈氨缁椂鐩存帴娓叉煋锛涢〉绛惧叧闂悗鐢?pruneThumbCache 娓呴櫎銆?

    private getThumbCache(): IThumbCache {
        const data = this.data[THUMB_CACHE_KEY];
        return data && typeof data === "object" ? data as IThumbCache : {};
    }

    private saveThumbCache(cache: IThumbCache) {
        this.data[THUMB_CACHE_KEY] = cache;
        this.saveDataDebounced(THUMB_CACHE_KEY);
    }

    // 鍐欏叆涓€鏉＄紦瀛橈紙瀹炴椂 DOM 浼樺厛鏇存柊锛夛紝瓒呰繃涓婇檺鏃舵寜鏈€鏃ф窐姹帮紱涓嶇珛鍗冲啓鐩橈紝鐢辫皟鐢ㄦ柟鎵归噺 flush
    private setThumbCache(cache: IThumbCache, rootId: string, title: string, html: string) {
        // 鎵嬫満绔娇鐢ㄦ洿淇濆畧鐨勭紦瀛樹笂闄愶紙瀛樺偍/鍐呭瓨鏇寸揣寮狅級
        const htmlMax = this.isMobile ? THUMB_HTML_MAX_MOBILE : THUMB_HTML_MAX;
        const cacheMax = this.isMobile ? THUMB_CACHE_MAX_MOBILE : THUMB_CACHE_MAX;
        if (html.length > htmlMax) {
            return;
        }
        cache[rootId] = {title, html, ts: Date.now()};
        // 瀹归噺鎺у埗锛氳秴鍑轰笂闄愭椂鍒犳渶鏃х殑鏉＄洰锛涚敤绋冲畾鎺掑簭璁?ts 鐩稿悓鏃舵寜鎻掑叆椤哄簭娣樻卑锛岃涓哄彲棰勬祴
        const keys = Object.keys(cache);
        if (keys.length > cacheMax) {
            const sorted = stableSortBy(keys, (k) => cache[k].ts);
            sorted.slice(0, sorted.length - cacheMax).forEach((key) => delete cache[key]);
        }
    }

    // 娓呯悊缂撳瓨涓凡鏃犲搴旀墦寮€椤电鐨勫鍎挎潯鐩紙椤电鍏抽棴鍗冲け鏁堬級
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

    // ==================== 缂╃暐鍥炬覆鏌?====================

    // 娓叉煋鍗曚釜椤电缂╃暐鍥撅細瀹炴椂 DOM 鍏嬮殕 鈫?鎸佷箙鍖栫紦瀛?鈫?鍐呮牳 API 鍥炴簮锛堝甫骞跺彂闂搁棬锛?
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
            // 瀹炴椂 DOM 鍙敤锛氬埛鏂拌鏂囨。鐨勭紦瀛樺揩鐓э紙涓嬫閲嶅惎/鍚庡彴鏈覆鏌撴椂鐩存帴鍛戒腑锛?
            if (rootId) {
                const cache = this.getThumbCache();
                this.setThumbCache(cache, rootId, title, source.innerHTML);
                this.saveThumbCache(cache);
            }
            return;
        }
        // 鏃犲疄鏃?DOM锛氬皾璇曞懡涓寔涔呭寲缂撳瓨锛堣法閲嶅惎/閲嶇疆淇濈暀锛?
        const cache = this.getThumbCache();
        const cached = rootId ? cache[rootId] : undefined;
        if (cached) {
            const wrap = document.createElement("div");
            wrap.className = "protyle-wysiwyg";
            wrap.innerHTML = cached.html;
            this.applyThumbContent(thumb, wrap, title);
            return;
        }
        // 缂撳瓨涔熸湭鍛戒腑锛氬厛鍗犱綅锛屽啀閫氳繃鍐呮牳 API 璇诲彇鏂囨。鍐呭锛堟垚鍔熷悗鍐欏叆缂撳瓨锛?
        const placeholder = document.createElement("div");
        placeholder.className = "sw__thumb-placeholder";
        placeholder.textContent = title || item.tab.id;
        thumb.appendChild(placeholder);
        this.fillThumbByApi(item.tab, thumb);
    }

    // 瑙嗗彛鎳掓覆鏌擄細鍙粰婊氬姩鍒板彲瑙嗗尯锛堝惈 240px 棰勮浇杈硅窛锛夌殑鍗＄墖鐢熸垚缂╃暐鍥撅紝
    // 瑙嗗彛澶栦繚鎸佸姞杞藉崰浣嶃€傛墦寮€鍒囨崲鍣ㄤ粠"鍏ㄩ噺鍏嬮殕"闄嶄负"棣栧睆鍏嬮殕"锛屽ぇ鍒楄〃绉掑紑
    private renderThumbnails(list: IGroupedTab[], scrollElement: HTMLElement, batch: number) {
        // 鍚屼竴瀹瑰櫒閲嶅娓叉煋鏃讹紙鎺掑簭鍒囨崲/鍒楄〃鍒锋柊锛夊厛鏂紑鏃ц瀵熷櫒锛岄槻姝㈡硠婕忎笌閲嶅娓叉煋
        // 鐢?WeakMap 鎶?IntersectionObserver 缁戝湪鍏冪礌涓婏紝鏇夸唬 (el as any).__swThumbObserver 鐨勮嚜鎸傜鏈夊睘鎬у啓娉?
        const prev = thumbObserverCache.get(scrollElement);
        if (prev) {
            prev.disconnect();
            thumbObserverCache.delete(scrollElement);
        }

        // 鐜涓嶆敮鎸?IntersectionObserver 鏃堕€€鍥炲師鍒嗘壒鍏ㄩ噺娓叉煋锛堟€濇簮鍐呮牳鍧囦负 Chromium锛屼粎闃插尽锛?
        if (typeof IntersectionObserver === "undefined") {
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
            // 澶嶇敤鐨勬棫鍗＄墖宸叉覆鏌撹繃锛堟棤鍔犺浇鍗犱綅锛夛細璺宠繃瑙傚療锛岄伩鍏嶉噸鍏嬮殕
            if (!thumb.querySelector(".sw__thumb-loading")) {
                return;
            }
            thumbItems.set(thumb, item);
            observer.observe(thumb);
        });
    }

    // 鍒嗘壒鍏ㄩ噺娓叉煋锛圛ntersectionObserver 涓嶅彲鐢ㄦ椂鐨勫厹搴曡矾寰勶級
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
                requestAnimationFrame(runBatch);
            } else if (dirty) {
                this.saveThumbCache(cache);
            }
        };
        requestAnimationFrame(runBatch);
    }

    // 灏嗗厠闅嗗唴瀹硅杩涚缉鐣ュ浘妗嗗苟鎸夊搴︾缉鏀?
    private applyThumbContent(thumb: HTMLElement, source: HTMLElement, title: string) {
        const content = document.createElement("div");
        content.className = "sw__thumb-content";
        content.appendChild(source);
        thumb.appendChild(content);
        // 渚濇嵁鐩掑瓙瀹為檯瀹藉害璁＄畻缂╂斁姣斾緥锛涘鍣ㄥ皻鏈畬鎴愬竷灞€锛堝搴︿负 0锛夋椂绛変笅涓€甯ч噸绠楋紝
        // 鍚庣画灏哄鍙樺寲鐢变晶杈规爮鐨?ResizeObserver 鍏滃簳閲嶇畻
        content.style.visibility = "hidden";
        const syncScale = (attempt: number) => {
            if (!thumb.isConnected) return;
            const width = thumb.clientWidth || thumb.getBoundingClientRect().width;
            if (width > 0) {
                content.style.transform = `scale(${(width / CONTENT_WIDTH_PX).toFixed(3)})`;
                content.style.visibility = "visible";
                return;
            }
            if (attempt < 5) requestAnimationFrame(() => syncScale(attempt + 1));
            else content.style.visibility = "visible";
        };
        syncScale(0);
        content.setAttribute("aria-label", title);
    }

    // getDoc 鍥炴簮骞跺彂闂搁棬锛氳鍙ｆ噿娓叉煋涓嬩粛鍙兘鍚屾椂鏆撮湶澶氬紶缂哄浘鍗＄墖锛?
    // 闄愬埗鍚屾椂鍦ㄩ€旇姹傛暟锛屾墜鏈虹鏇翠繚瀹堬紝閬垮厤鎵撳紑鐬棿鎵撶垎鍐呮牳/缃戠粶
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

    // 椤电 DOM 涓殏鏃犲唴瀹癸紙濡傚悗鍙版湭娓叉煋瀹岋級鏃讹紝閫氳繃鍐呮牳 API 璇诲彇鏂囨。 HTML 浣滀负缂╃暐鍐呭锛屽苟鍐欏叆缂撳瓨
    private async fillThumbByApi(tab: Tab, thumb: HTMLElement) {
        const rootId = this.rootIdOf(tab);
        if (!rootId) {
            return; // 闈炴枃妗ｉ〉绛撅紝淇濇寔鍗犱綅
        }
        await this.acquireThumbApi();
        try {
            // size=32锛氱缉鐣ュ浘鍙渶棣栧睆鍐呭锛屽噺灏忓搷搴斾綋涓庤В鏋愬紑閿€
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
            // 寮圭獥宸插叧闂垨鍐呭鏃犳晥鏃舵斁寮?
            if (!thumb.isConnected || !html) {
                return;
            }
            const wrap = document.createElement("div");
            wrap.className = "protyle-wysiwyg";
            wrap.innerHTML = html;
            thumb.innerHTML = "";
            this.applyThumbContent(thumb, wrap, tab.title || "");
            // API 璇诲彇鎴愬姛锛氬啓鍏ョ紦瀛橈紝涓嬫锛堝惈閲嶅惎鍚庯級鐩存帴鍛戒腑
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

    // 瑁佸壀鍏嬮殕鍐呭锛氬彧淇濈暀鍓?max 涓瓙鍧椼€傜缉鐣ュ浘浠呮樉绀烘枃妗ｉ灞忥紝
    // 澶ф枃妗ｆ暣绡?cloneNode 鏄垏鎹㈠櫒鎵撳紑鍗￠】鐨勪富鍥狅紝瑁佸壀鍚庡厠闅嗛噺涓庢枃妗ｅぇ灏忚В鑰?
    private limitCloneChildren(clone: HTMLElement, max: number) {
        while (clone.children.length > max) {
            clone.removeChild(clone.lastChild as ChildNode);
        }
    }

    // 鑾峰彇鍙厠闅嗙殑缂╃暐鍥惧唴瀹规簮锛涙枃妗ｉ〉绛句紭鍏堝彇鍏?WYSIWYG 鍐呭
    // 娉ㄦ剰锛氭瘡娆℃墦寮€鍒囨崲鍣ㄩ兘浼氶噸鏂拌皟鐢ㄦ湰鏂规硶鍏嬮殕瀹炴椂 DOM锛屼繚璇佺缉鐣ュ浘灞曠ず鐨勬槸椤电褰撳墠鏈€鏂扮姸鎬?
    private getThumbSource(tab: Tab): HTMLElement | null {
        try {
            // Editor 妯″瀷鐨?.editor 鍗?Protyle 瀹炰緥锛屽叾 wysiwyg.element 涓哄疄鏃舵枃妗?DOM
            const model = (tab as unknown as { model?: IProtyleTabModel }).model;
            const wysiwyg = model?.editor?.wysiwyg?.element;
            if (wysiwyg && wysiwyg.childElementCount > 0) {
                const clone = wysiwyg.cloneNode(true) as HTMLElement;
                this.limitCloneChildren(clone, THUMB_CLONE_MAX);
                return clone;
            }
            // 鍏滃簳锛氫粠闈㈡澘瀹瑰櫒閲岀洿鎺ユ壘 WYSIWYG 鍐呭锛堜笉渚濊禆 model 鍐呴儴缁撴瀯锛?
            const panelWysiwyg = tab.panelElement?.querySelector<HTMLElement>(".protyle-wysiwyg");
            if (panelWysiwyg && panelWysiwyg.childElementCount > 0) {
                const clone = panelWysiwyg.cloneNode(true) as HTMLElement;
                this.limitCloneChildren(clone, THUMB_CLONE_MAX);
                return clone;
            }
            // 鏈€鍚庡啀閫€鍥炴暣涓潰鏉垮唴瀹?
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

    // 閿洏瀵艰埅锛氭柟鍚戦敭 / Tab 绉诲姩锛孍nter 鍒囨崲锛孍sc 鍏抽棴锛堜粎寮圭獥妯″紡浣跨敤锛?
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

            // 璇诲彇缃戞牸鐪熷疄鍒楁暟鐢ㄤ簬涓婁笅瀵艰埅锛堣缃垪鏁版垨鑷姩鏃跺潎鍑嗙‘锛?
            const grid = scrollElement.querySelector(".sw__grid") as HTMLElement | null;
            let colCount = 1;
            if (grid) {
                const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").filter((c) => c && c !== "none");
                if (cols.length > 0) {
                    colCount = cols.length;
                }
            }

            let next = -1;
            if (key === "ArrowRight" || (key === "Tab" && !event.shiftKey)) {
                event.preventDefault();
                next = (focusIndex + 1) % cards.length;
            } else if (key === "ArrowLeft" || (key === "Tab" && event.shiftKey)) {
                event.preventDefault();
                next = (focusIndex - 1 + cards.length) % cards.length;
            } else if (key === "ArrowDown") {
                event.preventDefault();
                next = Math.min(focusIndex + colCount, cards.length - 1);
            } else if (key === "ArrowUp") {
                event.preventDefault();
                next = Math.max(focusIndex - colCount, 0);
            } else if (key === "Enter") {
                event.preventDefault();
                const target = cards[focusIndex];
                const tabId = target?.dataset.tabId;
                const tab = this.cardTabs.get(target) || (this.isMobile
                    ? this.getMobileTabs().find((item) => item.id === tabId)
                    : getAllTabs().find((item) => item.id === tabId));
                if (tab) {
                    this.activateTab(tab, closeOverlay);
                }
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

    // 鍒囨崲鍒扮洰鏍囬〉绛撅紱寮圭獥妯″紡闅忓悗閿€姣佸脊绐楋紝渚ц竟鏍忔ā寮忛殢鍚庡埛鏂板垪琛?
    private activateTab(tab: Tab, onClose?: IOverlayClose) {
        // 璁板綍 MRU锛氭寜 pinKey锛堟枃妗ｉ〉绛句负 rootID锛夎褰曪紝鎵嬫満绔笌妗岄潰绔娇鐢ㄥ悓涓€浠?MRU 鏁版嵁锛?
        // 閫氳繃鎻掍欢鏁版嵁鍚屾鍚庝袱绔€屾渶杩戜娇鐢ㄣ€嶄繚鎸佷竴鑷?
        const key = this.pinKeyOf(tab);
        const mru = this.getMru();
        const list = mru.filter((id) => id !== key);
        list.unshift(key);
        // 涓婇檺鏀舵暃锛氳秴鍑?MRU_MAX 浠庡熬閮ㄤ涪寮冩渶鏃ф潯鐩紝闃叉鎻掍欢鏁版嵁闅忎娇鐢ㄦ棤闄愯啫鑳€
        this.data[MRU_KEY] = capMru(list, MRU_MAX);
        this.saveDataDebounced(MRU_KEY);
        this.recordOpenHistory(tab);

        if (this.isMobile) {
            // 鎵嬫満绔細MobileTabs.switchTo 鍒囨崲椤电
            try {
                getSiyuan()?.mobile?.tabs?.switchTo?.(tab.id);
            } catch (e) {
                logger.warn("mobile switch tab fail", e);
            }
            onClose?.();
            return;
        }

        // 绛変环浜庣偣鍑昏椤电锛氬唴閮ㄤ細鍒囧埌鐩爣椤电锛屽苟閫氳繃 setPanelFocus 婵€娲诲叾鎵€鍦ㄧ獥鍙ｏ紙鏀寔鍒嗘爮锛?
        try {
            tab.parent.switchTab(tab.headElement, true);
            // 鍋跺彂鍦烘櫙涓?showHeading 涓嶆槸蹇呮毚闇茬殑鏂规硶锛屾€濇簮鍘嗗彶鐗堟湰涓嶄竴瀹氬瓨鍦紝鍋氳兘鍔涙娴?
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

    // 鎵嬫満绔暟鎹簮閫傞厤锛氭€濇簮 getAllTabs() 鍦ㄦ墜鏈虹锛圡OBILE 鏋勫缓锛夋亽杩斿洖绌烘暟缁勶紝
    // 椤电鏁版嵁闇€浠?window.siyuan.mobile.tabs锛堟€濇簮 3.8+ MobileTabs锛夎鍙栵紝
    // 鍖呰鎴愪笌妗岄潰绔?Tab 鍏煎鐨勪吉 Tab锛屼娇 rootIdOf/titleOf/pinKeyOf/createCard 绛夌洿鎺ュ鐢?
    private getMobileTabs(): Tab[] {
        const state = getSiyuan()?.mobile?.tabs?.state;
        if (!state?.tabs) {
            return [];
        }
        return state.tabs
            .filter((t) => t.current?.rootID)
            .map((t) => ({
                id: t.id,                       // MobileTabs 椤电 id锛坰witchTo/close 浣跨敤锛?
                title: t.current!.title,
                // 鎵嬫満绔〉绛惧浘鏍囧彲鑳藉湪 t.icon 鎴?t.current.icon锛屼紭鍏?t.icon锛堟€濇簮涓嶅悓鐗堟湰瀛楁涓嶅悓锛?
                icon: (t as unknown as {icon?: string}).icon || t.current!.icon || "",
                // 鍏煎 rootIdOf()锛氱洿鎺ュ懡涓?model.editor.block.rootID 鍒嗘敮
                model: {editor: {block: {rootID: t.current!.rootID}}},
            } as unknown as Tab));
    }

    // 鎵嬫満绔?MobileTabs 鐘舵€佹槸鍚﹀彲鐢紙鎬濇簮 3.8+ 鎵嶆湁锛涙棫鐗堟墜鏈虹鏃犲椤电姒傚康锛?
    private hasMobileTabsApi(): boolean {
        return !!getSiyuan()?.mobile?.tabs?.state;
    }

    // 鎵嬫満绔綋鍓嶆縺娲婚〉绛?id锛堟棤婵€娲绘椂杩斿洖 undefined锛?
    private getMobileActiveTabId(): string | undefined {
        return getSiyuan()?.mobile?.tabs?.state?.activeTabID;
    }

    // 鎵嬫満绔墦寮€鏂囨。锛堟€濇簮 plugin API openTab 鍦ㄧЩ鍔ㄧ鏄┖瀹炵幇锛夛紝杩斿洖鏄惁鎴愬姛锛?
    // 1) 浼樺厛 MobileTabs.open(rootID)锛堟€濇簮 3.8+锛夛細蹇呴』淇濇寔瀹夸富瀵硅薄璋冪敤锛堟娊鎴愯８鍑芥暟璋冪敤浼氫涪 this锛?
    //    鍐呴儴 abortController/navigationEpoch 璁块棶鐩存帴鎶涢敊锛夛紝await 杩斿洖鍊煎垽鏂粨鏋滆€岄潪鍥哄畾寤舵椂杞锛?
    //    open 鏄庣‘杩斿洖澶辫触锛坕nvalid/cancelled/failed锛夋椂涓嶉檷绾р€斺€攐penTab 鍦ㄧЩ鍔ㄧ鏄┖瀹炵幇锛岄檷绾ф棤鎰忎箟锛?
    // 2) 浠呭綋 MobileTabs API 涓嶅瓨鍦紙鎬濇簮 <3.8锛夋墠闄嶇骇鍒?plugin.openTab 鍏滃簳閫氶亾
    private async mobileOpenDoc(rootId: string): Promise<boolean> {
        const tabs = getSiyuan()?.mobile?.tabs;

        // 璺緞 1锛歁obileTabs.open锛堟棫鐗堟湰鏃犺繑鍥炲€兼椂涓?undefined锛岃浣滃凡鐢熸晥锛涙柊鐗堟湰 "success" 鎵嶇畻鎴愬姛锛?
        if (typeof tabs?.open === "function") {
            try {
                const result = await tabs.open(rootId);
                if (result === undefined || result === "success") {
                    return true;
                }
                logger.warn("mobile open doc non-success result", result);
                return false;
            } catch (e) {
                logger.warn("mobile open doc fail (path 1)", e);
                return false;
            }
        }

        // 璺緞 2锛氭棫鐗堟€濇簮锛堟棤 MobileTabs API锛夐檷绾у埌 plugin openTab锛堢Щ鍔ㄧ绌哄疄鐜帮紝闈欓粯杩斿洖锛?
        try {
            await openTab({app: this.app, doc: {id: rootId}});
            return true;
        } catch (e) {
            logger.warn("mobile open doc fail (path 2)", e);
            showMessage(this.i18n.openDocFailed);
            return false;
        }
    }

    // 鎵嬫満绔垏鎹㈠櫒锛氬叏灞忚鐩栧脊绐楋紝绠€鍖栧伐鍏锋爮锛屽崟鍒?鍙屽垪鍗＄墖锛岀函瑙︽懜鎿嶄綔
    private showMobileSwitcher() {
        const tabs = this.getMobileTabs();
        if (tabs.length === 0) {
            // 鎵嬫満绔?WebView 浼氭嫤鎴師鐢?alert锛屽繀椤荤敤鎬濇簮 showMessage 鎵嶆湁鍙鍙嶉锛?
            // 鏃х増鎬濇簮锛?3.8锛夋棤 MobileTabs API锛岄渶鎻愮ず鍗囩骇鑰屼笉鏄鎶?鏃犻〉绛?
            showMessage(this.hasMobileTabsApi() ? this.i18n.noOpenedTabs : this.i18n.mobileNeedsNewer);
            return;
        }
        this.openMobileSwitcherDialog(tabs);
    }

    // 鎵撳紑鎵嬫満绔垏鎹㈠櫒 Dialog锛氳閰嶉《鏍忋€佸垪琛ㄣ€佹悳绱€丗AB 闅愯棌绛?
    private openMobileSwitcherDialog(tabs: Tab[]) {
        const settings = this.getSettings();
        // 鎵嬫満绔綋鍓嶉〉绛鹃珮浜細MobileTabs 鐨?activeTabID锛坮enderMobileList 浠呰鍙栧叾 id锛?
        const activeTab: Tab | undefined = this.isMobile
            ? ({id: this.getMobileActiveTabId()} as Tab)
            : this.getActiveTab();

        const dialog = this.createMobileSwitcherDialog();
        this.suspendFABForDialog(dialog);
        const mobileBody = dialog.element.querySelector<HTMLElement>(".sw__mobile");
        let readyFrame: number | null = null;
        let revealCancelled = false;
        let rendered = false;
        let stableFrames = 0;
        let previousWidth = 0;
        let previousHeight = 0;
        const revealWhenReady = (attempt = 0) => {
            if (revealCancelled || !mobileBody?.isConnected) return;
            const bodyRect = mobileBody.getBoundingClientRect();
            const toolbar = mobileBody.querySelector<HTMLElement>(".sw__mobile-toolbar");
            const scroll = mobileBody.querySelector<HTMLElement>(".sw__scroll");
            const toolbarRect = toolbar?.getBoundingClientRect();
            const icon = mobileBody.querySelector<SVGElement>(".sw__search-icon");
            const iconRect = icon?.getBoundingClientRect();
            const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
            const hasStableGeometry = rendered
                && bodyRect.width > 0 && bodyRect.height > 0
                && !!toolbarRect && toolbarRect.width > 0
                && toolbarStyle?.display === "flex"
                && !!iconRect && iconRect.width > 0 && iconRect.width <= 32
                && iconRect.height > 0 && iconRect.height <= 32
                && (!scroll || scroll.clientWidth > 0)
                && toolbarRect.width <= bodyRect.width + 2;
            if (hasStableGeometry && Math.abs(bodyRect.width - previousWidth) < 1 && Math.abs(bodyRect.height - previousHeight) < 1) {
                stableFrames += 1;
            } else {
                stableFrames = 0;
            }
            previousWidth = bodyRect.width;
            previousHeight = bodyRect.height;
            if (stableFrames >= 2 || attempt >= 30) {
                mobileBody.classList.remove("sw__mobile--initializing");
                mobileBody.style.removeProperty("visibility");
                mobileBody.style.removeProperty("opacity");
                mobileBody.style.removeProperty("pointer-events");
                if (!hasStableGeometry && attempt >= 30) {
                    logger.warn("mobile switcher revealed after layout timeout", {width: bodyRect.width, height: bodyRect.height});
                }
                readyFrame = null;
                return;
            }
            readyFrame = requestAnimationFrame(() => revealWhenReady(attempt + 1));
        };
        readyFrame = requestAnimationFrame(() => revealWhenReady());
        const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        // 鍏抽敭淇锛欴ialog 鍏堟妸鍏冪礌鎸傚埌 DOM锛宐3-dialog--open 绫昏绛?50ms 瓒呮椂鎵嶈ˉ涓婏紝
        // 鏈熼棿瀹瑰櫒澶勪簬 transform: scale(.8) 杩囨浮鎬侊紱鎵嬫満 WebView 涓甫 backdrop-filter 鐨?
        // 瀛愬厓绱犲湪璇ュ姩鐢荤獥鍙ｅ唴浼氭覆鏌撻敊涔憋紙鍥炬爣宸ㄥぇ/浣嶇疆閿欎綅锛夛紝鍔ㄧ敾缁撴潫鍙堣嚜鎰堚€斺€?
        // 鍗?鍒氭墦寮€闂竴涓嬮敊涔?鐨勬牴鍥犮€傜鐢ㄥ姩鐢昏瀹瑰櫒鍚屾杩涘叆鏈€缁堟€侊紝褰诲簳娑堥櫎璇ョ獥鍙?
        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }

        // 娓呯悊缂╃暐鍥剧紦瀛樹腑宸叉棤瀵瑰簲鎵撳紑椤电鐨勫鍎挎潯鐩?
        this.pruneThumbCache(tabs);

        let unregisterRefresh: () => void = () => undefined;
        // 閽╀綇 Dialog.destroy锛圗scape/鐐瑰嚮澶栭儴/绋嬪簭璋冪敤锛夋墍鏈夊叧闂矾寰勯兘鎭㈠ FAB
        const origDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            revealCancelled = true;
            if (readyFrame !== null) cancelAnimationFrame(readyFrame);
            readyFrame = null;
            unregisterRefresh();
            if (scrollElement) {
                this.disposeDocSearchSession(scrollElement);
            }
            origDestroy();
        };
        const closeOverlay = () => dialog.destroy();

        // 瑁呴厤宸ュ叿鏍忎笌鍒楄〃娓叉煋
        if (!searchInput || !sortSelect || !scrollElement) {
            showMessage(this.i18n.mobileLayoutFailed, MESSAGE_DEFAULT_MS, "error");
            dialog.destroy();
            return;
        }
        // 鍏堣閰嶅垪琛ㄦ嬁鍒?renderMobileList锛屽啀缁戝畾宸ュ叿鏍忥紙鎺掑簭鍒囨崲澶嶇敤瑁呴厤鏈?renderMobileList锛夛紱
        // 鍒楄〃棣栨覆鏌撳彧渚濊禆 sortSelect 鍊硷紝涓嶄緷璧栧伐鍏锋爮缁戝畾锛屽璋冨畨鍏?
        sortSelect.value = settings.sortBy;
        const {renderMobileList} = this.renderMobileSwitcherList(dialog, scrollElement, sortSelect, settings);
        const refreshMobileSurface = () => {
            renderMobileList();
            this.renderQuickActions(dialog.element, "mobile", searchInput, closeOverlay);
        };
        unregisterRefresh = this.registerSwitcherRefresh(refreshMobileSurface);
        this.bindMobileSwitcherToolbarActions(dialog, searchInput, sortSelect, scrollElement, closeOverlay, renderMobileList);
        this.renderQuickActions(dialog.element, "mobile", searchInput, closeOverlay);
        rendered = true;

        // 鎶?FAB 鍏抽棴鏃剁殑 FAB 鎭㈠浼樺厛绾ф彃鍦?destroy 涔嬪悗锛涗繚璇佹墦寮€鏀惰棌寮圭獥鍏抽棴鍚庝細鍥炲埌鍒楄〃
        dialog.element.querySelector(".sw__mobile-fav-btn")?.addEventListener("click", () => {
            this.showMobileFavSheet(dialog, closeOverlay, () => renderMobileList());
        });
        // 鎵嬫満绔笉鑷姩鑱氱劍鎼滅储妗嗭細閬垮厤涓€鎵撳紑灏卞脊鍑鸿緭鍏ユ硶锛岄渶瑕佹悳绱㈡椂鐐瑰嚮杈撳叆妗?
    }

    // 鏋勯€犳墜鏈虹鍒囨崲鍣?Dialog锛堟瀬绠€锛氭悳绱?+ 鎺掑簭 + 鏀惰棌 + 鏃ヨ + 璁剧疆 + 婊氬姩鍖猴級
    private createMobileSwitcherDialog(): Dialog {
        return new Dialog({
            title: "",
            content: this.buildMobileSwitcherHtml(),
            width: "92vw",
            height: "85vh",
            disableAnimation: true,
        });
    }

    private buildMobileSwitcherHtml(): string {
        return `<div class="speed-switch sw__body sw__mobile sw__mobile--initializing" style="visibility:hidden;opacity:0;pointer-events:none">
    <div class="sw__toolbar sw__mobile-toolbar">
        <div class="sw__search-wrap">
            <svg class="sw__search-icon"><use xlink:href="#iconSearch"></use></svg>
            <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" autocomplete="off" spellcheck="false" />
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
        <span class="b3-button b3-button--text sw__icon-btn sw__mobile-fav-btn" aria-label="${this.i18n.favorites}">
            <svg><use xlink:href="#iconStar"></use></svg>
        </span>
        <span class="b3-button b3-button--text sw__icon-btn sw__journal-btn" aria-label="${this.i18n.journalBtn}">
                    <svg><use xlink:href="#iconCalendar"></use></svg>
                </span>
                <span class="b3-button b3-button--text sw__icon-btn sw__settings-btn" aria-label="${this.i18n.settings}">
                    <svg><use xlink:href="#iconSettings"></use></svg>
                </span>
            </div>
    <div class="sw__scroll" tabindex="0"></div>
    <div class="sw__quick-actions" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
</div>`;
    }

    // 鎵嬫満绔《鏍忔寜閽細璁剧疆 / 鏃ヨ + 鎺掑簭鍒囨崲锛堟帓搴忓垏鎹㈠鐢ㄨ閰嶆湡 renderMobileList 涓?updatedMap锛?
    private bindMobileSwitcherToolbarActions(
        dialog: Dialog,
        searchInput: HTMLInputElement,
        sortSelect: HTMLSelectElement,
        scrollElement: HTMLDivElement,
        closeOverlay: () => void,
        renderMobileList: () => void,
    ) {
        // 闅愯棌 FAB 鎺ㄨ繜鍒版寜閽?click 澶勬槸鍥犱负 openSetting 鍙兘涔熷叧闂師 dialog
        dialog.element.querySelector(".sw__settings-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.openSetting();
        });
        // 椤舵爮鏃ヨ鎸夐挳锛氭墦寮€/鏂板缓褰撴棩鏃ヨ锛堝叧闂脊绐楀苟鎭㈠ FAB锛屾湭璁鹃粯璁ゆ棩璁版湰鏃堕娆＄偣鍑诲脊鍑洪€夋嫨锛?
        dialog.element.querySelector(".sw__journal-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.fabElement?.classList.remove("sw__fab--hidden");
            this.openJournal();
        });
        const sortButton = dialog.element.querySelector<HTMLButtonElement>(".sw__sort-btn");
        const sortLabels: Record<string, string> = {
            mru: this.i18n.sortMru,
            layout: this.i18n.sortLayout,
            layoutDesc: this.i18n.sortLayoutDesc,
            updatedDesc: this.i18n.sortUpdatedDesc,
            titleAsc: this.i18n.sortTitleAsc,
            titleDesc: this.i18n.sortTitleDesc,
        };
        const updateSortButton = () => {
            if (!sortButton) return;
            const label = sortLabels[sortSelect.value] || this.i18n.sortMru;
            sortButton.innerHTML = '<svg><use xlink:href="#iconSort"></use></svg>';
            sortButton.title = label;
            sortButton.setAttribute("aria-label", `${this.i18n.setSortBy}: ${label}`);
        };
        updateSortButton();
        sortButton?.addEventListener("click", () => {
            document.querySelector(".sw__mobile-sort-overlay")?.remove();
            const overlay = document.createElement("div");
            overlay.className = "sw__mobile-sort-overlay";
            // WebView 里的思源 Dialog 可能建立新的 stacking context，内联层级作为最后一道兜底。
            overlay.style.position = "fixed";
            overlay.style.inset = "0";
            overlay.style.zIndex = "2147483000";
            const sheet = document.createElement("div");
            sheet.className = "sw__mobile-sort-sheet";
            sheet.setAttribute("role", "dialog");
            sheet.setAttribute("aria-modal", "true");
            sheet.innerHTML = `<div class="sw__mobile-sheet-handle"></div><div class="sw__mobile-sheet-title">${this.i18n.setSortBy}</div>`;
            const list = document.createElement("div");
            list.className = "sw__mobile-sort-list";
            Object.entries(sortLabels).forEach(([value, label]) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sw__mobile-sort-option";
                item.setAttribute("role", "menuitemradio");
                item.setAttribute("aria-checked", String(value === sortSelect.value));
                item.innerHTML = `<span>${label}</span>${value === sortSelect.value ? '<svg><use xlink:href="#iconCheck"></use></svg>' : ""}`;
                item.addEventListener("click", () => {
                    sortSelect.value = value;
                    overlay.remove();
                    sortSelect.dispatchEvent(new Event("change"));
                });
                list.appendChild(item);
            });
            sheet.appendChild(list);
            overlay.appendChild(sheet);
            document.body.appendChild(overlay);
            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) overlay.remove();
            });
            requestAnimationFrame(() => sheet.classList.add("sw__mobile-sort-sheet--open"));
        });
        sortSelect.addEventListener("change", () => {
            sortSelect.size = 0;
            sortSelect.classList.add("fn__none");
            sortSelect.style.removeProperty("position");
            sortSelect.style.removeProperty("left");
            sortSelect.style.removeProperty("top");
            sortSelect.style.removeProperty("z-index");
            updateSortButton();
            this.updateSettings({sortBy: sortSelect.value as SortBy});
            // 鎺掑簭鍒囨崲锛氬鐢ㄨ閰嶆湡 renderMobileList锛堥噸璇绘渶鏂板垪琛?+ 鍏变韩 updatedMap锛夛紝鍐嶆竻鎼滅储璇嶉噸杩囨护
            renderMobileList();
            searchInput.value = "";
            this.filterCards(scrollElement, searchInput.value);
        });
        searchInput.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });
    }

    // 瑁呴厤鎵嬫満绔垪琛ㄦ覆鏌擄細杩斿洖 renderMobileList 鍑芥暟浠ヤ究鏀惰棌寮圭獥鐨?onTabsChanged 鍥炶皟瑙﹀彂鍒锋柊
    private renderMobileSwitcherList(
        dialog: Dialog,
        scrollElement: HTMLDivElement,
        sortSelect: HTMLSelectElement,
        settings: ISwSettings,
    ) {
        const listOpts = {
            onOverlayClose: () => dialog.destroy(),
            onTabsChanged: () => renderMobileList(),
        };
        let updatedMap: {[rootId: string]: string} = {};
        const renderMobileList = () => {
            this.renderMobileList(scrollElement, this.getMobileTabs(),
                {id: this.getMobileActiveTabId()} as Tab, listOpts, sortSelect.value as SortBy, updatedMap);
        };
        renderMobileList();
        // 銆屾渶杩戠紪杈戙€嶆帓搴忛渶瑕佹枃妗ｆ洿鏂版椂闂达細鍚庡彴鏌ヨ涓€娆★紝瀹屾垚鍚庤嫢浠嶅浜庤鎺掑簭鍒欓噸鎺?
        const mergedMap = updatedMap;
        this.loadUpdatedMap(this.getMobileTabs()).then((map) => {
            Object.assign(mergedMap, map);
            if (dialog.element.isConnected && sortSelect.value === "updatedDesc") {
                renderMobileList();
            }
        });
        return {renderMobileList};
    }

    // 鎵嬫満绔覆鏌撻〉绛惧崱鐗囧垪琛?
    private renderMobileList(scrollElement: HTMLElement, tabs: Tab[], activeTab: Tab | undefined,
                             opts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
                             sortBy: SortBy, updatedMap: {[rootId: string]: string} = {}) {
        // 澶嶇敤鏃у崱鐗囷紙鍚?renderList锛夛細鍏抽棴椤电/鎺掑簭鍒囨崲鍚庨噸鎺掍笉閲嶅缓缂╃暐鍥?
        const reusable = new Map<string, HTMLElement>();
        scrollElement.querySelectorAll<HTMLElement>(".sw__card").forEach((card) => {
            if (card.dataset.tabId) {
                reusable.set(card.dataset.tabId, card);
            }
        });
        scrollElement.innerHTML = "";
        const settings = this.getSettings();
        scrollElement.style.setProperty("--sw-thumb-height", `${settings.mobileThumbHeight}px`);

        const activeTabId = activeTab?.id;
        const mru = this.getMru();
        const pinned = new Set(this.getPinned());
        const favorites = new Set(this.getFavorites().map((item) => item.key));

        // 鎵嬫満绔笉鍒嗙獥鍙ｅ垎缁勶紝鍏ㄩ儴鎵佸钩鍖?
        const items: IGroupedTab[] = tabs.map((tab) => ({tab}));
        const ordered = this.sortGroupItems(items, sortBy, mru, pinned, updatedMap);

        const groupEl = document.createElement("div");
        groupEl.className = "sw__group";
        const grid = this.buildMobileGroupGrid(settings);
        const ctx: ITabGroupRenderCtx = {reusable, activeTabId, pinned, favorites, mru, settings, opts};
        const all: IGroupedTab[] = this.renderMobileCardsInGroup(grid, ordered, ctx);

        groupEl.appendChild(grid);
        scrollElement.appendChild(groupEl);

        if (all.length === 0) {
            scrollElement.appendChild(this.buildEmptyState());
            return;
        }

        // 鎵嬫満绔缉鐣ュ浘锛氳鍙ｆ噿娓叉煋 + 鏇翠繚瀹堢殑鍥炴簮骞跺彂
        this.renderThumbnails(all, scrollElement, THUMB_BATCH_MOBILE);
    }

    // 鏋勯€犳墜鏈虹鍒嗙粍鍗＄墖缃戞牸锛氭牴鎹?settings.mobileColumns 鍐冲畾鍗曞垪/鍙屽垪/鑷€傚簲
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

    // 鎵嬫満绔垎缁勫崱鐗囨覆鏌擄細濮旀墭 acquireGroupCard锛坢obile=true 闄勫甫 sw__mobile-card锛夛紱杩斿洖 all 鍒楄〃渚涚缉鐣ュ浘鎳掓覆鏌?
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

    // 鎵嬫満绔敹钘忓簳閮ㄥ脊绐楋紱onTabsChanged锛氱粍鍐呴〉绛炬壒閲忓紑/鍏冲悗鍒锋柊鑳屽悗鐨勫垏鎹㈠櫒鍒楄〃
    private showMobileFavSheet(dialog: Dialog, closeOverlay: IOverlayClose, onTabsChanged?: () => void) {
        const favorites = this.getFavorites();
        const groupNames = this.getFavoriteGroupNames();

        if (favorites.length === 0 && groupNames.length === 0) {
            // 鏃犱换浣曟敹钘忔椂缁欏嚭鍙嶉鑰岄潪闈欓粯鏃犲搷搴?
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

        // 鍔ㄧ敾锛氫笅涓€甯ф粦鍏?
        requestAnimationFrame(() => sheet.classList.add("sw__mobile-sheet--open"));
        // 鐐瑰嚮鑳屾櫙鍏抽棴
        this.bindMobileFavSheetBackdropClose(overlay, sheet);
    }

    // 鏀惰棌搴曢儴寮圭獥 DOM 楠ㄦ灦锛氭娊灞?+ 鎷栨妸鏌?+ 鏍囬 + 鍐呭瀹瑰櫒
    private buildMobileFavSheetHtml(): string {
        return `<div class="sw__mobile-sheet" role="dialog" aria-modal="true" aria-label="${this.escapeAttr(this.i18n.mobileFavTitle)}">
    <div class="sw__mobile-sheet-handle"></div>
    <div class="sw__mobile-sheet-title">${this.i18n.mobileFavTitle}</div>
    <div class="sw__mobile-sheet-body"></div>
</div>`;
    }

    // 娓叉煋鏀惰棌鍐呭锛氬垎缁勶紙甯?鈰?鎵归噺鎸夐挳锛? 鍗曞垪琛紙鏃犲垎缁勫懡鍚嶇┖闂存椂锛? 绌烘€?
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
            empty.textContent = this.i18n.mobileNoFav;
            body.appendChild(empty);
        }
    }

    // 娓叉煋鍗曚釜鍒嗙粍鍖哄潡锛氭爣棰橈紙缁勫悕 + 鏁伴噺 + 鈰級+ 椤瑰垪琛?
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
        // 鈰?鎸夐挳锛氳Е鍙戠粍鍐呮壒閲忓紑/鍏筹紙宓屽搴曢儴寮圭獥锛?
        header.innerHTML = `<span>${this.escapeAttr(name)}</span>
<span class="sw__mobile-sheet-count">${items.length}</span>
<button type="button" class="sw__mobile-sheet-more" aria-label="${this.escapeAttr(this.i18n.favGroupTip)}">
    <svg><use xlink:href="#iconMore"></use></svg>
</button>`;
        const moreBtn = header.querySelector<HTMLButtonElement>(".sw__mobile-sheet-more");
        moreBtn?.addEventListener("click", (event) => {
            event.stopPropagation();
            // 鎵归噺鎿嶄綔瀹屾垚鍚庯細鍏抽棴宓屽寮圭獥 鈫?鍏抽棴鏀惰棌寮圭獥 鈫?鍒锋柊鑳屽悗鍒囨崲鍣ㄥ垪琛?
            const onNestedClosed = () => {
                document.querySelectorAll(".sw__mobile-sheet-overlay--nested").forEach((el) => el.remove());
                overlay.remove();
                onTabsChanged?.();
            };
            this.openMobileGroupActions(name, items, onNestedClosed);
        });
        section.appendChild(header);
        section.appendChild(this.buildMobileFavSheetList(items, overlay, closeOverlay));
        body.appendChild(section);
    }

    // 鍗曞垪琛細姣忛」鏄枃浠跺浘鏍?+ 鏍囬锛岀偣鍑诲叧闂脊绐楀苟璺宠浆
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

    // 鐐瑰嚮鑳屾櫙鍏抽棴锛氭娊灞変笅婊?+ 閬僵娣″嚭锛?50ms 鍚庣Щ闄?
    private bindMobileFavSheetBackdropClose(overlay: HTMLElement, sheet: HTMLElement) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                sheet.classList.remove("sw__mobile-sheet--open");
                overlay.style.opacity = "0";
                setTimeout(() => overlay.remove(), FAB_HIDE_DELAY_MS);
            }
        });
    }

    // 鎵嬫満绔垎缁勬壒閲忔搷浣滃崟锛堝祵濂椾簬鏀惰棌寮圭獥涔嬩笂銆佸眰绾ф洿楂橈級锛氫竴閿紑鍚?鍏抽棴缁勫唴椤电
    private openMobileGroupActions(groupName: string, items: IFavoriteItem[], onChanged: () => void) {
        const overlay = document.createElement("div");
        overlay.className = "sw__mobile-sheet-overlay sw__mobile-sheet-overlay--nested";
        overlay.innerHTML = `<div class="sw__mobile-sheet" role="dialog" aria-modal="true" aria-label="${this.escapeAttr(groupName)}">
    <div class="sw__mobile-sheet-handle"></div>
    <div class="sw__mobile-sheet-title">${this.escapeAttr(groupName)}</div>
    <div class="sw__mobile-sheet-body"></div>
</div>`;
        document.body.appendChild(overlay);

        const sheet = overlay.querySelector<HTMLElement>(".sw__mobile-sheet");
        const body = overlay.querySelector<HTMLElement>(".sw__mobile-sheet-body");
        if (!sheet || !body) {
            overlay.remove();
            return;
        }

        // 涓庢敹钘忓脊绐椾竴鑷寸殑涓嬫粦鏀惰捣鍔ㄧ敾
        const closeSelf = () => {
            sheet.classList.remove("sw__mobile-sheet--open");
            overlay.style.opacity = "0";
            setTimeout(() => overlay.remove(), FAB_HIDE_DELAY_MS);
        };

        const appendAction = (label: string, action: () => Promise<number>) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "sw__mobile-sheet-item";
            item.textContent = label;
            item.addEventListener("click", async () => {
                if (overlay.dataset.busy === "true") {
                    return;
                }
                overlay.dataset.busy = "true";
                body.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
                    button.disabled = true;
                });
                try {
                    const count = await action();
                    closeSelf();
                    // 浠呭湪纭疄鍙戠敓鍙樻洿鏃跺埛鏂拌儗鍚庣殑鍒囨崲鍣ㄥ垪琛?
if (count > 0) {
                        onChanged();
                    }
                } finally {
                    delete overlay.dataset.busy;
                    if (overlay.isConnected) {
                        body.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
                            button.disabled = false;
                        });
                    }
                }
            });
            body.appendChild(item);
        };

        appendAction(this.i18n.openGroupTabs, () => this.openGroupTabs(items));
        appendAction(this.i18n.closeGroupTabs, () => this.closeGroupTabs(items));

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "sw__mobile-sheet-item sw__mobile-sheet-item--cancel";
        cancel.textContent = this.i18n.cancel;
        cancel.addEventListener("click", closeSelf);
        body.appendChild(cancel);

        // 鍔ㄧ敾锛氫笅涓€甯ф粦鍏?
        requestAnimationFrame(() => {
            sheet.classList.add("sw__mobile-sheet--open");
        });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeSelf();
            }
        });
    }

    // ==================== 鎵嬫満绔偓娴寜閽紙FAB锛変笌椤舵爮鍏ュ彛 ====================

    private createFAB() {
        // 宸插湪鏂囨。涓垯璺宠繃锛涗粎瀛樺湪寮曠敤浣嗗凡鑴辨寕锛堣澶栭儴绉婚櫎锛夋椂閲嶅缓
        if (this.fabElement?.isConnected) {
            return;
        }
        this.fabElement?.remove();
        this.fabElement = document.createElement("div");
        this.fabElement.className = "sw__fab";
        this.fabElement.setAttribute("role", "button");
        this.fabElement.setAttribute("aria-label", this.i18n.switchTabs);
        this.fabElement.tabIndex = 0;
        this.fabElement.innerHTML = `<svg><use xlink:href="#iconLayout"></use></svg>`;
        this.fabElement.addEventListener("click", () => {
            this.showSwitcher();
        });
        this.fabElement.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            this.showSwitcher();
        });
        document.body.appendChild(this.fabElement);
        this.bindFABScrollGesture();
    }

    private suspendFABForDialog(dialog: Dialog, onDestroy?: () => void) {
        if (!this.isMobile) return;
        this.fabModalDepth += 1;
        this.fabElement?.classList.add("sw__fab--hidden");
        const originalDestroy = dialog.destroy.bind(dialog);
        let destroyed = false;
        dialog.destroy = () => {
            if (destroyed) return;
            destroyed = true;
            this.fabModalDepth = Math.max(0, this.fabModalDepth - 1);
            originalDestroy();
            onDestroy?.();
            if (this.fabModalDepth === 0) {
                this.fabElement?.classList.remove("sw__fab--hidden", "sw__fab--scroll-hidden");
            }
        };
    }

    // 婊氬姩鎵嬪娍鎺у埗 FAB 鏄鹃殣锛堜笌鎬濇簮鎵嬫満绔簳閮ㄥ伐鍏锋潯琛屼负涓€鑷达級锛?
    // 鎵嬫寚涓婃粦锛堝唴瀹瑰悜涓嬫粴锛夐殣钘忋€佷笅婊戝嚭鐜般€傜敤鐙珛绫?sw__fab--scroll-hidden锛?
    // 涓庢墦寮€鍒囨崲鍣ㄦ椂鐨?sw__fab--hidden 浜掍笉骞叉壈
    private bindFABScrollGesture() {
        if (this.fabGestureBound) {
            return;
        }
        this.fabGestureBound = true;
        const THRESHOLD = 12; // 浣嶇Щ瓒呰繃璇ュ€兼墠鍒ゅ畾鏂瑰悜锛岄伩鍏嶆姈鍔ㄨ瑙﹀彂
        let startX = 0;
        let startY = 0;
        this.fabGestureHandlers = {
            touchstart: (event: TouchEvent) => {
                startX = event.touches[0]?.clientX ?? 0;
                startY = event.touches[0]?.clientY ?? 0;
            },
            touchmove: (event: TouchEvent) => {
                if (!this.fabElement || this.fabModalDepth > 0 || event.touches.length !== 1) {
                    return;
                }
                // 瑙︾偣钀藉湪 FAB 鑷韩涓婁笉澶勭悊锛堢偣鍑绘寜閽椂涓嶅簲瑙﹀彂闅愯棌锛?
                if (this.fabElement.contains(event.target as Node)) {
                    return;
                }
                const x = event.touches[0].clientX;
                const y = event.touches[0].clientY;
                const deltaX = x - startX;
                const deltaY = y - startY;
                // 浠呭瀭鐩翠富瀵肩殑婊戝姩鎵嶈Е鍙戞樉闅愶紝妯悜婊戝姩锛堝鏌ョ湅瀹借〃鏍硷級涓嶈瑙?
                if (Math.abs(deltaY) < THRESHOLD || Math.abs(deltaY) <= Math.abs(deltaX)) {
                    return;
                }
                startY = y; // 閲嶇疆璧风偣锛岃繛缁粦鍔ㄥ彲澶氭瑙﹀彂
                if (deltaY < 0) {
                    // 鎵嬫寚涓婃粦 鈫?闅愯棌
                    this.fabElement.classList.add("sw__fab--scroll-hidden");
                } else {
                    // 鎵嬫寚涓嬫粦 鈫?鍑虹幇
                    this.fabElement.classList.remove("sw__fab--scroll-hidden");
                }
            },
        };
        document.addEventListener("touchstart", this.fabGestureHandlers.touchstart, {passive: true});
        document.addEventListener("touchmove", this.fabGestureHandlers.touchmove, {passive: true});
    }

    private updateFABVisibility() {
        const settings = this.getSettings();
        if (this.isMobile && settings.fabEnabled) {
            this.createFAB();
            this.fabElement?.classList.toggle("sw__fab--hidden", this.fabModalDepth > 0);
        } else {
            this.fabElement?.remove();
            this.fabElement = null;
        }
    }

    // 鎵嬫満绔《鏍忓叆鍙ｆ寜閽細鎬濇簮 3.8.x 鎵嬫満绔?addTopBar 鍙細杩涘彸渚ц彍鍗?鎵╁睍"鍒嗙粍锛?
    // 杩欓噷鐩存帴鎻掑叆 mobileTopBar锛堟棫鐗堟棤姝ゅ厓绱犳椂闈欓粯璺宠繃锛屼笉褰卞搷鍏朵粬鍏ュ彛锛夈€?
    // 鍒囨崲鍣ㄥ叆鍙?+ 鏃ヨ鍏ュ彛鍚勮嚜鐙珛娉ㄥ叆锛屽父瑙勮繍琛屾瘡涓湪棣栨鏃舵彃鍏ヤ竴娆″嵆鍙€?
    private ensureMobileTopBarButton() {
        const topBar = document.getElementById("mobileTopBar") || document.getElementById("toolbar");
        if (!topBar) {
            return;
        }
        // 鍒囨崲鍣ㄥ叆鍙ｏ紙澶栭儴鍙湁涓€涓叆鍙ｆ寜閽紱鏃ヨ鎸夐挳浣嶄簬鍒囨崲鍣ㄥ脊绐楅《鏍忓唴锛?
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
    }

    // ==================== 渚ц竟鏍忔ā寮?====================

    // 鍦?dock 闈㈡澘鍐呮覆鏌撶揣鍑戠増鍒囨崲鍣紙鍗曞垪鍗＄墖锛屽父椹讳晶杈规爮渚夸簬蹇€熷垏鎹級
    private renderSidebarPanel(element: HTMLElement) {
        if (!element) {
            return;
        }
        const previousScrollElement = element.querySelector<HTMLElement>(".sw__scroll");
        if (previousScrollElement) {
            this.disposeDocSearchSession(previousScrollElement);
        }
        this.sidebarElement = element;
        element.classList.add("speed-switch", "sw__body", "sw--sidebar");
        // 渚ц竟鏍忕缉鐣ュ浘甯冨眬锛歟nlarge锛堥粯璁わ級鏀惧ぇ濉弧鏍忓锛沜olumns 鎸夊搴﹁嚜鍔ㄥ鍔犲垪鏁?
        element.classList.toggle("sw--sidebar-columns", this.getSettings().sidebarLayout === "columns");
        element.innerHTML = this.buildSidebarHtml();

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
        this.renderList(scrollElement, tabs, activeTab, listOpts, this.getSettings().sortBy, updatedMap);

        // 銆屾渶杩戠紪杈戙€嶆帓搴忛渶瑕佹枃妗ｆ洿鏂版椂闂达細鍚庡彴鏌ヨ涓€娆★紝瀹屾垚鍚庤嫢浠嶅浜庤鎺掑簭涓旀湭鎼滅储鍒欓噸鎺?
        this.loadUpdatedMap(tabs).then((map) => {
            Object.assign(updatedMap, map);
            const sortSelect = element.querySelector<HTMLSelectElement>(".sw__sort");
            const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
            if (element.isConnected && sortSelect?.value === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
            }
        });

        // 闈㈡澘灏哄鍙樺寲鏃朵粎閲嶇畻缂╃暐鍥剧缉鏀炬瘮渚嬶紙ResizeObserver 瑕嗙洊鎷栧姩鍒嗛殧鏉＄瓑鎵€鏈夊満鏅級
        this.observeSidebarResize(element);
        // 椤舵爮浜や簰锛氭悳绱?/ 鏀惰棌涓嬫媺 / 鎺掑簭 / 璁剧疆 / 鍥炲埌椤堕儴
        this.bindSidebarToolbarEvents(element, scrollElement, refresh);
        this.renderQuickActions(element, "sidebar", element.querySelector<HTMLInputElement>(".sw__search"), refresh);
    }

    // 渚ц竟鏍?DOM 楠ㄦ灦锛氭悳绱?+ 鏀惰棌涓嬫媺 + 鎺掑簭 + 璁剧疆 + 婊氬姩鍖?+ 鍥炲埌椤堕儴
    private buildSidebarHtml(): string {
        return `<div class="sw__content">
    <div class="sw__toolbar">
        <div class="sw__search-wrap">
            <svg class="sw__search-icon"><use xlink:href="#iconSearch"></use></svg>
            <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" />
        </div>
        <div class="sw__select-wrap">
            <span class="sw__select-label">${this.i18n.favorites}</span>
            <div class="sw__fav-dd"></div>
        </div>
        <div class="sw__select-wrap">
            <span class="sw__select-label">${this.i18n.sortLabel}</span>
            <select class="b3-select sw__sort b3-tooltips b3-tooltips__s" aria-label="${this.i18n.setSortBy}">
                <option value="mru">${this.i18n.sortMru}</option>
                <option value="layout">${this.i18n.sortLayout}</option>
                <option value="layoutDesc">${this.i18n.sortLayoutDesc}</option>
                <option value="updatedDesc">${this.i18n.sortUpdatedDesc}</option>
                <option value="titleAsc">${this.i18n.sortTitleAsc}</option>
                <option value="titleDesc">${this.i18n.sortTitleDesc}</option>
            </select>
        </div>
        <span class="b3-button b3-button--text sw__icon-btn sw__settings-btn b3-tooltips b3-tooltips__s" aria-label="${this.i18n.settings}">
            <svg><use xlink:href="#iconSettings"></use></svg>
        </span>
    </div>
    <div class="sw__scroll" tabindex="0"></div>
    <div class="sw__quick-actions" role="toolbar" aria-label="${this.i18n.quickActions}"></div>
    <span class="sw__back-top b3-tooltips b3-tooltips__n" aria-label="${this.i18n.backTop}">
        <svg><use xlink:href="#iconUp"></use></svg>
    </span>
</div>`;
    }

    // 渚ц竟鏍忓昂瀵哥洃鍚細鎷栧姩鍒嗛殧鏉＄瓑鍦烘櫙鍙噸绠楃缉鐣ュ浘缂╂斁锛屼笉閲嶅缓 DOM
    private observeSidebarResize(element: HTMLElement) {
        if (this.sidebarResizeObserver) {
            this.sidebarResizeObserver.disconnect();
        }
        this.sidebarResizeObserver = new ResizeObserver(() => this.rescaleThumbs(element));
        this.sidebarResizeObserver.observe(element);
    }

    // 渚ц竟鏍忛《鏍忎簨浠讹細鎼滅储 / 鏀惰棌涓嬫媺 / 鎺掑簭鍒囨崲 / 璁剧疆 / 鍥炲埌椤堕儴
    private bindSidebarToolbarEvents(element: HTMLElement, scrollElement: HTMLDivElement, refresh: IOverlayClose) {
        // 鎼滅储锛氫笌寮圭獥涓€鑷达紝椤电鍖归厤鍦ㄤ笂銆佸叏搴撴枃妗ｅ湪涓?
        const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
        searchInput.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, refresh);
        });

        // 鏀惰棌涓嬫媺缁勪欢锛氭槦鏍囪Е鍙?+ 鍒嗙粍闈㈡澘锛堜晶杈规爮璺宠浆鍚庝粎鍒锋柊鍒楄〃锛?
        const favDd = element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, refresh, refresh);

        // 鎺掑簭鍒囨崲锛氭寔涔呭寲璁剧疆骞堕噸娓叉煋鍒楄〃
        const sortSelect = element.querySelector<HTMLSelectElement>(".sw__sort");
        sortSelect.value = this.getSettings().sortBy;
        sortSelect.addEventListener("change", () => {
            this.updateSettings({sortBy: sortSelect.value as SortBy});
            this.refreshSidebar();
        });

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
    }

    // 閲嶇畻瀹瑰櫒鍐呭叏閮ㄧ缉鐣ュ浘鐨勭缉鏀炬瘮渚嬶紙渚ц竟鏍忓昂瀵稿彉鍖栨椂璋冪敤锛屽唴瀹归殢闈㈡澘瀹藉害鑷姩浼哥缉锛?
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

    // 鍒锋柊渚ц竟鏍忓垪琛紙闈㈡澘浠嶈繛鎺ュ湪 DOM 涓婃椂锛?
    private refreshSidebar() {
        if (this.sidebarElement?.isConnected) {
            this.renderSidebarPanel(this.sidebarElement);
        }
    }

    // 杞婚噺鍒锋柊锛氫粎鏇存柊渚ц竟鏍忓崱鐗囩殑褰撳墠椤电楂樹寒锛坰witch-protyle 楂橀瑙﹀彂锛岄伩鍏嶉噸寤哄垪琛級
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

    // 璇诲彇 MRU 璁板綍锛涢槻寰℃€ф敹鏁涳紙杩囨护闈炲瓧绗︿覆/鍘婚噸/鎴柇锛夛紝鍏煎鍘嗗彶宸茶啫鑳€鐨勫瓨閲忔暟鎹?
    private getMru(): string[] {
        const data = this.data[MRU_KEY];
        return capMru(Array.isArray(data) ? data : [], MRU_MAX);
    }

    private sanitizeOpenHistory(value: unknown): {items: IOpenHistoryEntry[], changed: boolean} {
        if (!Array.isArray(value)) {
            return {items: [], changed: value !== undefined};
        }
        const items: IOpenHistoryEntry[] = [];
        const seen = new Set<string>();
        for (const raw of value) {
            if (!raw || typeof raw !== "object") continue;
            const item = raw as Partial<IOpenHistoryEntry>;
            const key = typeof item.key === "string" ? item.key.trim() : "";
            if (!key || seen.has(key)) continue;
            const rootId = typeof item.rootId === "string" && BLOCK_ID_RE.test(item.rootId) ? item.rootId : null;
            const title = typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 200) : key;
            const ts = typeof item.ts === "number" && Number.isFinite(item.ts) ? item.ts : 0;
            seen.add(key);
            items.push({key, rootId, title, ts});
            if (items.length >= HISTORY_MAX) break;
        }
        const changed = items.length !== value.length || items.some((item, index) => JSON.stringify(item) !== JSON.stringify(value[index]));
        return {items, changed};
    }

    private getOpenHistory(): IOpenHistoryEntry[] {
        return this.sanitizeOpenHistory(this.data[HISTORY_KEY]).items;
    }

    private recordOpenHistory(tab: Tab) {
        const key = this.pinKeyOf(tab);
        if (!key) return;
        const rootId = this.rootIdOf(tab);
        const title = this.titleOf(tab) || key;
        const history = this.getOpenHistory().filter((item) => item.key !== key);
        history.unshift({key, rootId, title: title.slice(0, 200), ts: Date.now()});
        this.data[HISTORY_KEY] = history.slice(0, HISTORY_MAX);
        this.saveDataDebounced(HISTORY_KEY);
        this.refreshOpenHistoryDropdowns();
    }
}
