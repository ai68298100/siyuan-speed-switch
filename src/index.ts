import {Plugin, Dialog, Menu, getFrontend, getAllTabs, getActiveTab, openTab, showMessage} from "siyuan";
import "./index.scss";
import {logger} from "./logger";
import {clampNum, stableSortBy, normalizeSortBy, groupFavoritesByGroup, resolveIconFallback, buildTabGroupsByParent, resolveTabRootId, planGroupOpenFavorites, sanitizeDocIds, capMru, sanitizeFavorites, sanitizeStringList, isSuccessfulMobileTabsResult} from "./util";
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
    BLOCK_ID_RE,
    FAV_PANEL_WIDTH_PX,
    FAV_PANEL_MAX_HEIGHT_PX,
    FAV_PANEL_MIN_HEIGHT_PX,
    MRU_KEY,
    PINNED_KEY,
    FAV_KEY,
    FAV_GROUPS_KEY,
    SETTINGS_KEY,
    THUMB_CACHE_KEY,
    FAV_COLLAPSED_KEY,
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
    // 让 TS 仍能从 ./util.js 拿到函数签名；运行时 import.js 走 Node CJS
    export function clampNum(value: unknown, min: number, max: number, fallback: number): number;
    export function stableSortBy<T>(arr: T[], keyFn: (item: T) => string | number): T[];
    export function normalizeSortBy(value: unknown, allowed: readonly string[], fallback: string): string;
    export function groupFavoritesByGroup<T extends {group?: string}>(favorites: T[], groupNames: string[]): Map<string, T[]>;
    export function resolveIconFallback(raw: string): {type: "svg", value: string} | {type: "emoji", value: string};
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
}

// 卡片三按钮所需图标 symbol（与官方 litheness sprite 同名同形）：
// 手机端模板不含内联 symbol，官方 sprite 由 loadAssets 异步注入且依赖 App 版本，
// 首帧 <use> 引用到空 symbol 时按钮渲染为空白（三按钮"隐形"根因），插件须自带兜底
const CARD_ICON_SPRITE =
    '<symbol id="iconUnpin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/></symbol>' +
    '<symbol id="iconPin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></symbol>' +
    '<symbol id="iconStar" viewBox="0 0 24 24" fill="var(--b3-icon-star-fill, none)" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></symbol>' +
    '<symbol id="iconClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>';

// 单分组渲染上下文：避免 renderTabGroup 形参列表爆炸，所有共享字段打包到一个对象
interface ITabGroupRenderCtx {
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

// IMobileTabEntry / IMobileTabsState 已迁移至 ./types.ts（思源全局对象的相关结构）
// 页签排序方式：mru=最近使用 layout=打开顺序 layoutDesc=打开倒序 titleAsc/titleDesc=标题升降序 updatedDesc=最近编辑

// addDock 回调里的 this 类型（思源把面板元素挂到回调自身的 .element 上）
interface IDockHandlerSelf {
    element?: HTMLElement;
}
type SortBy = "mru" | "layout" | "layoutDesc" | "titleAsc" | "titleDesc" | "updatedDesc";
const SORT_BY_LIST: SortBy[] = ["mru", "layout", "layoutDesc", "titleAsc", "titleDesc", "updatedDesc"];
// 页签卡片操作完成后的收尾动作（弹窗模式销毁弹窗，侧边栏模式刷新列表）
type IOverlayClose = () => void;

// 存储 key / dock type / 快捷键等注册常量已集中到 ./constants.ts（ADR-0002 遗留闭环，v0.16.5）

// 默认设置（可被用户设置覆盖）
const DEFAULT_SETTINGS: ISwSettings = {
    dialogWidth: 880,      // 切换器弹窗宽度 px
    dialogHeight: 600,     // 切换器弹窗高度 px
    columns: 0,            // 缩略图列数，0=自动
    thumbHeight: 128,      // 缩略图高度 px
    sortBy: "mru",         // 页签排序方式
    excludedDocks: [],     // 不显示在左侧列表的面板类型
    dockDisplay: "full",   // 左侧面板显示方式：hidden 隐藏 / collapsed 折叠图标条 / full 完整列表
    fullscreen: false,     // 全屏模式：切换器铺满整个窗口，按 Esc 退出
    sidebarLayout: "enlarge", // 侧边栏缩略图布局：enlarge 放大填满栏宽（默认）/ columns 按宽度自动加列
    fabEnabled: false,     // 手机端悬浮按钮默认关闭，需要的用户在设置中打开
    mobileColumns: MOBILE_COLUMNS_AUTO, // 默认自动（竖屏单列，横屏双列）
    mobileThumbHeight: 80, // 手机端缩略图高度
    journalNotebook: "",   // 默认日记笔记本 id，空=未设置（首次点击日记按钮时弹出选择）
    lastSettingsTab: "appearance", // 设置面板上次所在标签页（打开时直接跳转，提升反复进入设置的操作效率）
};

// 左侧面板显示方式
type DockDisplay = "hidden" | "collapsed" | "full";
const DOCK_DISPLAY_LIST: DockDisplay[] = ["hidden", "collapsed", "full"];
// 侧边栏缩略图布局：enlarge 放大填满栏宽（默认） / columns 按宽度自动增加列数
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
    fullscreen: boolean;       // 全屏模式：切换器铺满整个窗口，Esc 退出
    sidebarLayout: SidebarLayout; // 侧边栏缩略图布局：enlarge 放大 / columns 自动加列
    // 手机端
    fabEnabled: boolean;       // 是否启用悬浮按钮
    mobileColumns: number;     // 0=单列 1=双列 2=自动
    mobileThumbHeight: number; // 手机端缩略图高度
    journalNotebook: string;   // 默认日记笔记本 id，空=未设置
    lastSettingsTab: string;   // 设置面板上次所在标签页（appearance/behavior/panels/favorites/journal/mobile）
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

// 缩略图缓存条目：文档 rootID → 内容快照
interface IThumbCache {
    [rootId: string]: { title: string, html: string, ts: number };
}

// 模块级 WeakMap：滚动容器 → 已挂的 IntersectionObserver，避免在 HTMLElement 上自挂私有属性
const thumbObserverCache = new WeakMap<HTMLElement, IntersectionObserver>();

// 收藏条目：文档页签存 rootId（关闭后仍可重开）；非文档页签仅存页签 id。
// 收藏项永久留存直到用户主动删除；rootId 缺失时跳转/批量打开用 key 兜底（见 jumpToFavorite）
interface IFavoriteItem {
    key: string;       // pinKeyOf：rootId || tab.id
    title: string;
    rootId: string | null;
    group: string;     // 分组名，空字符串表示未分组（旧数据无此字段按未分组处理）
}

export default class SpeedSwitchPlugin extends Plugin {
    private isMobile = false;
    private searchSeq = 0;   // 文档搜索请求序号，用于丢弃过期响应
    private docSearchCache = new Map<string, any[]>(); // 关键词 → 全库文档结果缓存（删除重输等场景秒出）
    private docSearchAbort: AbortController | null = null; // 进行中的文档搜索请求（新请求发起前取消旧的）
    private docSearchTimer: number | null = null; // 搜索防抖定时器（新一轮输入前清掉旧回调，避免过期请求空打内核）
    private sidebarElement: HTMLElement | null = null; // 侧边栏 dock 面板内容元素
    private sidebarResizeObserver: ResizeObserver | null = null; // 侧边栏尺寸监听，变化时重算缩略图缩放
    private saveTimers = new Map<string, number>(); // 去抖写盘定时器：MRU/置顶/收藏等高频数据合并落盘
    private saveChains = new Map<string, Promise<void>>(); // 同一 key 的写入严格串行，避免旧请求覆盖新数据
    private favCollapsed = new Set<string>(); // 收藏下拉中已折叠的分组名（已持久化，重启后恢复）
    private fabElement: HTMLElement | null = null; // 手机端悬浮按钮
    private mobileTopBarButton: HTMLElement | null = null; // 手机端顶栏切换器入口按钮（自行注入 mobileTopBar）
    private fabGestureBound = false; // FAB 滚动手势监听是否已绑定（document 级，只绑一次）
    private fabGestureHandlers: {touchstart: (e: TouchEvent) => void, touchmove: (e: TouchEvent) => void} | null = null;
    private cardTabs = new WeakMap<HTMLElement, Tab>(); // 复用卡片始终指向最新的 Tab 对象
    private groupOperationBusy = false;

    async onload() {
        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

        // 尽早注入卡片按钮图标：官方 sprite 为异步注入，首帧渲染的三按钮可能引用到空 symbol
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

        // 注册侧边栏 dock 面板（桌面）与手机端入口（顶栏 + FAB），互斥
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

    // 预加载 7 个持久化 key：loadData 写入 this.data，让 getMru 等能读到旧值
    private async initPersistentData() {
        await Promise.all([
            this.loadData(MRU_KEY),
            this.loadData(PINNED_KEY),
            this.loadData(FAV_KEY),
            this.loadData(FAV_GROUPS_KEY),
            this.loadData(FAV_COLLAPSED_KEY),
            this.loadData(SETTINGS_KEY),
            this.loadData(THUMB_CACHE_KEY),
        ]).catch((e) => logger.warn("load data fail", e));
        // 加载期 sanitize：清理历史脏数据（0.16.5），仅在确实变化时回写，避免每次启动重写文件
        this.sanitizePersistentData();
        // 收藏分组折叠状态：从持久化数据初始化（旧版本无此数据时为默认展开）
        this.initFavCollapsed();
    }

    // 加载期数据净化：收藏列表结构校验/按 key 去重，置顶与分组注册表过滤非法字符串
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
        this.eventBus.on("switch-protyle", () => {
            this.refreshSidebarActive();
            if (this.isMobile) {
                this.ensureMobileTopBarButton();
            }
        });
        // 页签增减（文档打开/关闭）时全量刷新侧边栏列表
        this.eventBus.on("loaded-protyle-static", () => this.refreshSidebar());
        this.eventBus.on("destroy-protyle", () => this.refreshSidebar());
    }

    // 布局就绪后再次确认手机端入口：部分机型上 onload 执行时顶栏尚未构建完成，
    // 插件按钮会插入失败；这里兜底重试一次
    onLayoutReady() {
        if (this.isMobile) {
            this.ensureMobileTopBarButton();
            this.updateFABVisibility();
        }
    }

    async onunload() {
        const pendingSaves = this.flushPendingSaves();
        this.docSearchAbort?.abort();
        this.docSearchAbort = null;
        this.docSearchCache.clear();
        this.sidebarResizeObserver?.disconnect();
        this.sidebarResizeObserver = null;
        this.removeDock(SIDEBAR_DOCK_TYPE);
        this.sidebarElement = null;
        this.fabElement?.remove();
        this.fabElement = null;
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

    // ==================== 持久化性能 ====================

    // 去抖写盘：高频数据（MRU/置顶/收藏）每次操作只更新内存，合并后延迟落盘，
    // 避免连续收藏/置顶/切换页签时每个动作都触发一次内核文件写入（交互卡顿的根因）
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
    private getSettings(): ISwSettings {
        // 磁盘读取的是 unknown，老版本/异常数据字段可能缺失，全部按字段逐一降级到默认值。
        // 用 Partial<ISwSettings> 把整个 saved 一次性收窄，后续字段访问就不再需要每行断言。
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
        };
    }

    private updateSettings(patch: Partial<ISwSettings>) {
        const settings = {...this.getSettings(), ...patch};
        this.data[SETTINGS_KEY] = settings;
        this.saveDataDebounced(SETTINGS_KEY);
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
            onChange(this.clampNum(input.value, min, max, value));
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

    // 开关（b3-switch + 插件自建 sw-switch 强化两态对比）
    private switcher(checked: boolean, onChange: (v: boolean) => void): HTMLElement {
        const label = document.createElement("label");
        label.className = "b3-switch sw-switch";
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
    private async openJournal() {
        let notebook = this.getSettings().journalNotebook;
        if (!notebook) {
            notebook = await this.promptJournalNotebook();
            if (!notebook) {
                return; // 用户取消选择
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

    // 首次点击日记按钮：弹窗选择默认日记笔记本，选择后保存并返回
    private promptJournalNotebook(): Promise<string> {
        return new Promise((resolve) => {
            const dialog = new Dialog({
                title: this.i18n.journalChoose,
                content: this.buildJournalPromptHtml(),
                width: "min(460px, 90vw)",
            });
            const sel = dialog.element.querySelector<HTMLSelectElement>(".sw-journal-prompt__sel > select")
                ?? this.createJournalSelect(dialog);
            const confirmBtn = dialog.element.querySelector<HTMLButtonElement>(".sw-journal-prompt__confirm");
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            this.loadNotebooks().then((notebooks) => {
                this.populateJournalNotebookSelect(sel, confirmBtn, notebooks);
            });
            this.bindJournalPromptEvents(dialog, sel, confirmBtn, resolve);
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
            dialog.destroy();
            resolve(picked);
        });
        dialog.element.querySelector(".b3-button--cancel")?.addEventListener("click", () => {
            dialog.destroy();
            resolve("");
        });
    }

    // 插件设置页（设置 → 插件 → 小驴速切 → 设置图标）
    // 布局：左侧标签栏（外观/行为/面板/收藏/手机端）+ 右侧分组面板，点击标签切换
    openSetting() {
        const s = this.getSettings();
        const panelKeys = ["appearance", "behavior", "panels", "favorites", "journal", "mobile"] as const;
        const panelLabels: Record<string, string> = {
            appearance: this.i18n.secAppearance,
            behavior: this.i18n.secBehavior,
            panels: this.i18n.secPanels,
            favorites: this.i18n.secFavorites,
            journal: this.i18n.secJournal,
            mobile: this.i18n.secMobile,
        };

        const dialog = new Dialog({
            title: this.i18n.settings,
            content: '<div class="sw-settings"></div>',
            // 桌面 720×560；手机端（含横屏矮视口）按视口收缩，避免溢出屏幕
            width: "min(720px, 88vw)",
            height: "min(560px, 85vh)",
        });

        const root = dialog.element.querySelector<HTMLElement>(".sw-settings");
        if (!root) {
            return;
        }

        const tabs = document.createElement("div");
        tabs.className = "sw-settings__tabs";
        tabs.setAttribute("role", "tablist");
        const panels = document.createElement("div");
        panels.className = "sw-settings__panels";

        // 切换分组：仅激活对应标签与面板，同步 aria-selected 供读屏感知；
        // persist=true 时记录最近选中的标签页（仅用户主动点击时写盘，避免打开设置就产生一次无效写入）
        const activate = (key: string, persist = false) => {
            tabs.querySelectorAll<HTMLElement>(".sw-settings__tab").forEach((tab) => {
                const active = tab.dataset.panel === key;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", active ? "true" : "false");
            });
            panels.querySelectorAll<HTMLElement>(".sw-settings__panel").forEach((p) => {
                p.classList.toggle("is-active", p.dataset.panel === key);
            });
            if (persist) {
                this.updateSettings({lastSettingsTab: key});
            }
        };

        const builders: Record<string, () => HTMLElement> = {
            appearance: () => this.buildSettingsAppearance(s),
            behavior: () => this.buildSettingsBehavior(s),
            panels: () => this.buildSettingsPanels(s),
            favorites: () => this.buildSettingsFavorites(),
            journal: () => this.buildSettingsJournal(s),
            mobile: () => this.buildSettingsMobile(s),
        };

        // 构建标签栏与分组面板
        panelKeys.forEach((key) => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "sw-settings__tab";
            tab.setAttribute("role", "tab");
            tab.dataset.panel = key;
            tab.textContent = panelLabels[key];
            tab.addEventListener("click", () => activate(key, true));
            tabs.appendChild(tab);

            const panelEl = document.createElement("div");
            panelEl.className = "sw-settings__panel";
            panelEl.setAttribute("role", "tabpanel");
            panelEl.dataset.panel = key;
            panelEl.appendChild(builders[key]());
            panels.appendChild(panelEl);
        });

        root.appendChild(tabs);
        root.appendChild(panels);

        // 打开时直接跳转到上次所在的标签页（默认外观）；activate 内部会记录切换，下次进入保持
        const lastTab = this.getSettings().lastSettingsTab;
        const panelKeysArr: string[] = [...panelKeys];
        const initial = panelKeysArr.includes(lastTab) ? lastTab : panelKeys[0];
        activate(initial);
        if (initial !== panelKeys[0]) {
            // 非默认时需要滚动到选中标签可见（连续打开时标签栏不会滚动错位）
            tabs.querySelector<HTMLElement>(`.sw-settings__tab[data-panel="${initial}"]`)?.scrollIntoView({block: "nearest"});
        }
    }

    // ===== 设置页 · 外观：弹窗宽高、缩略图列数与高度 =====
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

    // ===== 设置页 · 行为：默认排序、全屏模式 =====
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
        wrapper.append(
            this.settingItem(this.i18n.setSortBy, this.i18n.setSortByTip,
                this.select(sortOptions, s.sortBy, (v) => this.updateSettings({sortBy: v as SortBy}))),
            // 全屏模式：切换器铺满整个窗口，按 Esc 退出（开启时给出提示）
            this.settingItem(this.i18n.fullScreen, this.i18n.fullScreenTip,
                this.switcher(s.fullscreen, (v) => {
                    this.updateSettings({fullscreen: v});
                    if (v) {
                        showMessage(this.i18n.fullScreenOn);
                    }
                })),
        );
        return wrapper;
    }

    // ===== 设置页 · 面板：显示方式、侧边栏布局、各 dock 面板开关 =====
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
            // 侧边栏缩略图布局：拉伸放大填满栏宽，或按宽度自动增加列数
            this.settingItem(this.i18n.sidebarLayout, this.i18n.sidebarLayoutTip,
                this.select(sidebarOptions, s.sidebarLayout, (v) => {
                    this.updateSettings({sidebarLayout: v as SidebarLayout});
                    // 侧边栏开着时即时刷新，让布局立即生效
                    if (this.sidebarElement?.isConnected) {
                        this.refreshSidebar();
                    }
                })),
            this.settingItem(this.i18n.setDocks, this.i18n.setDocksTip, this.buildSettingsDockToggles(s), true),
        );
        return wrapper;
    }

    // dock 面板开关列表：勾选的面板出现在切换器左侧，取消的隐藏
    private buildSettingsDockToggles(s: ISwSettings): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__docks b3-label__text";
        const dockPanels = this.getDockPanels();
        const excluded = new Set(s.excludedDocks);
        dockPanels.forEach((panel) => {
            // 行容器用 div：开关本身是 label（b3-switch 标准结构 input+span），label 不可嵌套
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

    // ===== 设置页 · 手机端：悬浮按钮开关、卡片布局 =====
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

    // ===== 设置页 · 日记：默认日记笔记本 =====
    private buildSettingsJournal(s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.append(
            this.settingItem(this.i18n.journalNotebook, this.i18n.journalNotebookTip,
                this.notebookSelect(s.journalNotebook, (id) => this.updateSettings({journalNotebook: id}))),
        );
        return wrapper;
    }

    // ===== 设置页 · 收藏：新建分组、分组重命名/删除、调整收藏项所属分组 =====
    // 内容随增删实时重建，故 render 回调在内部定义后传给各渲染 helper
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
            this.appendSettingsFavItems(box, favorites, groupNames, render);
        };
        render();
        return this.settingItem(this.i18n.manageFavorites, this.i18n.manageFavoritesTip, box, true);
    }

    // 新建分组行：输入名称即创建（空分组保留，收藏时可选用）
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

    // 分组列表：每行 名称 + 收藏数 + 行内重命名 + 删除（组内收藏项移出到未分组）
    private buildSettingsFavGroupList(groupNames: string[], favorites: IFavoriteItem[], render: () => void): HTMLElement {
        const groupList = document.createElement("div");
        groupList.className = "sw-setting__group-list";
        groupNames.forEach((name) => {
            const count = favorites.filter((fav) => fav.group === name).length;
            groupList.appendChild(this.buildFavGroupRow(name, count, render));
        });
        return groupList;
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
    private showSwitcher() {
        // 手机端走独立适配
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
        // 全屏模式：切换器铺满整个窗口（Esc 退出由思源 Dialog 默认行为提供）
        const fullscreen = settings.fullscreen;

        const dialog = this.createSwitcherDialog(settings, fullscreen);
        // 工具栏/列表/回到顶部/缩略图懒加载 等子模块装配
        this.assembleSwitcherParts(dialog, settings, fullscreen, tabs, activeTab);
    }

    // 构造桌面端切换器 Dialog（内容 HTML + 尺寸），外部只关心装配顺序，不关心 DOM 结构细节
    private createSwitcherDialog(settings: ISwSettings, fullscreen: boolean): Dialog {
        return new Dialog({
            // 极简：隐藏原生标题栏，顶栏内置于内容区最上方
            title: "",
            content: this.buildSwitcherHtml(fullscreen),
            width: fullscreen ? "100vw" : `${settings.dialogWidth}px`,
            height: fullscreen ? "100vh" : `${settings.dialogHeight}px`,
        });
    }

    // 切换器主体 HTML 字符串（结构：顶栏搜索/收藏下拉/排序/全屏按钮 + 滚动区 + 回到顶部）
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
                <span class="b3-button b3-button--text sw__icon-btn sw__fullscreen-btn b3-tooltips b3-tooltips__s" aria-label="${fullscreen ? this.i18n.exitFullscreen : this.i18n.enterFullscreen}">
                    <svg class="sw__fs-enter" viewBox="0 0 24 24"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <svg class="sw__fs-exit" viewBox="0 0 24 24"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span class="b3-button b3-button--text sw__icon-btn sw__sidebar-btn b3-tooltips b3-tooltips__s" aria-label="${this.i18n.openSidebar}">
                    <svg><use xlink:href="#iconLayoutRight"></use></svg>
                </span>
                <span class="b3-button b3-button--text sw__icon-btn sw__journal-btn b3-tooltips b3-tooltips__s" aria-label="${this.i18n.journalBtn}">
                    <svg><use xlink:href="#iconCalendar"></use></svg>
                </span>
                <span class="b3-button b3-button--text sw__icon-btn sw__settings-btn b3-tooltips b3-tooltips__s" aria-label="${this.i18n.settings}">
                    <svg><use xlink:href="#iconSettings"></use></svg>
                </span>
            </div>
            <div class="sw__scroll" tabindex="0"></div>
            <span class="sw__back-top b3-tooltips b3-tooltips__n" aria-label="${this.i18n.backTop}">
                <svg><use xlink:href="#iconUp"></use></svg>
            </span>
        </div>
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
    ) {
        this.prepareSwitcherChrome(dialog, fullscreen);

        // 左侧侧边栏面板列表（与思源 Ctrl+Tab 切换面板一致），按设置排除与显示方式渲染，无可面板时自动隐藏
        const dockElement = dialog.element.querySelector<HTMLDivElement>(".sw__dock");
        this.renderDockList(dockElement, dialog, settings.excludedDocks, settings.dockDisplay);

        // 清理缩略图缓存中已无对应打开页签的孤儿条目（页签关闭即失效）
        this.pruneThumbCache(tabs);

        // 工具栏引用
        const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const closeOverlay = () => dialog.destroy();
        const listOpts = {onOverlayClose: closeOverlay, onTabsChanged: (): void => undefined};
        // 列表区与工具栏排序切换共享的「最近编辑」更新时间映射（loadUpdatedMap 异步回填）
        const updatedMap: {[rootId: string]: string} = {};

        this.bindSwitcherFullscreenToggle(dialog, settings, fullscreen);
        this.bindSwitcherToolbarActions(dialog, searchInput, sortSelect, listOpts, closeOverlay, updatedMap);

        // 收藏下拉组件：星标触发 + 分组面板（分组可折叠/展开，项点击跳转）
        const favDd = dialog.element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, closeOverlay);
        if (sortSelect) {
            sortSelect.value = settings.sortBy;
        }

        // 右侧页签缩略图网格：每次打开都重新克隆渲染，展示各页签的最新状态
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        if (!scrollElement) {
            return;
        }
        this.bindSwitcherListArea(dialog, scrollElement, tabs, activeTab, listOpts, settings, searchInput, sortSelect, closeOverlay, updatedMap);

        // 让滚动区域获得焦点以接收键盘导航
        scrollElement.focus();

        // 回到顶部按钮
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
        searchInput?.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
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
                container.style.width = `${settings.dialogWidth}px`;
                container.style.height = `${settings.dialogHeight}px`;
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
        dialog.element.querySelector(".sw__sidebar-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.toggleSidebar();
        });
        // 顶栏日记按钮：打开/新建当日日记（未设默认日记本时首次点击弹出选择）
        dialog.element.querySelector(".sw__journal-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.openJournal();
        });
        sortSelect?.addEventListener("change", () => {
            const nextSort = sortSelect.value as SortBy;
            this.updateSettings({sortBy: nextSort});
            const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
            // 弹窗存活期间页签可能已增减，重取最新列表；沿用共享 updatedMap，已回源的更新时间不丢
            if (scrollElement) {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, nextSort, updatedMap);
            }
            // 排序切换时文档可能又有更新：补查一次更新时间，仍在「最近编辑」排序且未搜索时重排
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

    // 执行搜索：已打开页签匹配卡片显示在上半部分，同时（防抖）搜索全库文档标题显示在下半部分
    private applySearch(scrollElement: HTMLElement, searchInput: HTMLInputElement, onClose: IOverlayClose) {
        const keyword = searchInput.value.trim();
        this.filterCards(scrollElement, searchInput.value);

        // 关键词为空：隐藏文档结果，恢复纯列表（同时取消尚未触发的防抖请求）
        if (keyword === "") {
            this.clearDocSearchTimer();
            this.renderDocResults(scrollElement, null, onClose);
            return;
        }
        // 命中缓存直接渲染（已打开文档在渲染时排除，缓存结果可安全复用）
        const cached = this.docSearchCache.get(keyword);
        if (cached) {
            this.clearDocSearchTimer();
            this.renderDocResults(scrollElement, cached.slice(0, DOC_RESULT_LIMIT), onClose);
            return;
        }
        // 延迟 180ms 再请求全库文档（防抖），避免每个按键都打内核；
        // 定时器保存到字段，新一轮输入/清空时清掉旧回调
        const seq = ++this.searchSeq;
        this.clearDocSearchTimer();
        this.docSearchTimer = window.setTimeout(() => {
            this.docSearchTimer = null;
            this.runDocSearchFetch(scrollElement, searchInput, keyword, seq, onClose);
        }, SEARCH_DEBOUNCE_MS);
    }

    // 取消尚未触发的搜索防抖回调（若已触发则为空操作）
    private clearDocSearchTimer() {
        if (this.docSearchTimer !== null) {
            window.clearTimeout(this.docSearchTimer);
            this.docSearchTimer = null;
        }
    }

    // 全库文档搜索远程请求：带取消、防过期、AbortController 复用 searchSeq
    private async runDocSearchFetch(
        scrollElement: HTMLElement,
        searchInput: HTMLInputElement,
        keyword: string,
        seq: number,
        onClose: IOverlayClose,
    ) {
        // 期间关键词已变化或容器已销毁则放弃本次结果
        if (seq !== this.searchSeq || !scrollElement.isConnected) {
            return;
        }
        if (searchInput.value.trim() === "") {
            this.renderDocResults(scrollElement, null, onClose);
            return;
        }
        try {
            // 取消上一次仍在进行的请求，避免过期请求占用内核
            this.docSearchAbort?.abort();
            const controller = new AbortController();
            this.docSearchAbort = controller;
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
            if (seq !== this.searchSeq || !scrollElement.isConnected) {
                return;
            }
            const docs: any[] = Array.isArray(json?.data) ? json.data : [];
            // 简单容量控制：超 50 条整体清空（关键词极少复现，无需严格 LRU）
            if (this.docSearchCache.size > DOC_SEARCH_CACHE_LIMIT) {
                this.docSearchCache.clear();
            }
            this.docSearchCache.set(keyword, docs);
            this.renderDocResults(scrollElement, docs.slice(0, DOC_RESULT_LIMIT), onClose);
        } catch (e) {
            // 主动取消的请求不算异常
            if ((e as DOMException)?.name !== "AbortError") {
                logger.warn("search docs fail", e);
            }
        }
    }

    // 渲染全库文档搜索结果分组（docs 为 null 表示隐藏）；已打开的文档不再重复列出
    private renderDocResults(scrollElement: HTMLElement, docs: any[] | null, onClose: IOverlayClose) {
        const box = this.ensureDocResultsBox(scrollElement, docs);
        if (!box) {
            return;
        }
        // 排除当前已打开的文档（上半部分已有对应卡片）；手机端 getAllTabs() 恒为空，需用 MobileTabs 数据源
        const openRootIds = this.collectOpenRootIds();

        if (docs.length === 0) {
            this.appendDocResultsEmpty(box);
            return;
        }

        docs.forEach((doc) => {
            // 思源文档路径以块 id 命名：/ notebook / rootID .sy
            const id = String(doc.path || "").split("/").pop()?.replace(/\.sy$/, "");
            if (!id || openRootIds.has(id)) {
                return;
            }
            box.appendChild(this.buildDocResultItem(doc, id, onClose));
        });
    }

    // 复用现有 .sw__doc-results 容器；docs===null 时直接移除并返回 null
    private ensureDocResultsBox(scrollElement: HTMLElement, docs: any[] | null): HTMLElement | null {
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
        // 兜底移除可能残留的隐藏类（历史 bug 防御），确保文档区始终可见
        box.classList.remove("fn__none");

        const label = document.createElement("div");
        label.className = "sw__window-label";
        label.textContent = this.i18n.docSearchResults;
        box.innerHTML = "";
        box.appendChild(label);
        return box;
    }

    // 当前已打开页签的 rootId 集合（去重）；手机端走 MobileTabs，桌面端走 getAllTabs
    private collectOpenRootIds(): Set<string> {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        return new Set(
            opened.map((tab) => this.rootIdOf(tab)).filter(Boolean) as string[],
        );
    }

    // 空态：无可显示的搜索结果
    private appendDocResultsEmpty(box: HTMLElement) {
        const empty = document.createElement("div");
        empty.className = "sw__empty";
        empty.textContent = this.i18n.noDocResults;
        box.appendChild(empty);
    }

    // 单个文档搜索结果按钮（图标 + 标题 + 路径）；点击直开文档（手机端走 MobileTabs.open）
    private buildDocResultItem(doc: any, id: string, onClose: IOverlayClose): HTMLButtonElement {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "sw__doc-item";
        const icon = document.createElement("span");
        icon.className = "sw__dock-icon";
        icon.innerHTML = '<svg><use xlink:href="#iconFile"></use></svg>';
        const title = document.createElement("span");
        title.className = "sw__doc-title";
        title.textContent = String(doc.hPath || "").split("/").pop() || "";
        const path = document.createElement("span");
        path.className = "sw__doc-path";
        path.textContent = doc.hPath || "";
        item.appendChild(icon);
        item.appendChild(title);
        item.appendChild(path);
        item.addEventListener("click", () => {
            onClose();
            if (this.isMobile) {
                // openTab 在手机端是空实现，走 MobileTabs.open
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

    // 「最近编辑」排序的 SQL 结果短缓存：排序方式来回切换 / 列表重渲染时不重复打内核
    private updatedMapCache: {key: string, ts: number, map: {[rootId: string]: string}} | null = null;

    // 查询当前打开文档的更新时间（用于「最近编辑」排序），返回 rootID → updated 映射
    private async loadUpdatedMap(tabs: Tab[]): Promise<{[rootId: string]: string}> {
        // 白名单净化：仅保留标准文档 ID（时间戳-7位）并去重，非常规值不进 SQL（防注入/防结构破坏）
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

    // 获取当前活动页签（可能为 undefined）
    private getActiveTab(): Tab | undefined {
        try {
            return getActiveTab() || undefined;
        } catch (e) {
            logger.warn("get active tab fail", e);
        }
        return undefined;
    }

    // 按关键字过滤卡片，整组无匹配时隐藏分组；返回可见卡片数
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
            // 忽略高亮检测失败
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
        return Array.isArray(data) ? (data as string[]) : [];
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
        this.data[PINNED_KEY] = list;
        this.saveDataDebounced(PINNED_KEY);
        return true;
    }

    // ==================== 收藏 ====================

    // 读取收藏列表（最近收藏在前）
    private getFavorites(): IFavoriteItem[] {
        const data = this.data[FAV_KEY];
        return Array.isArray(data) ? (data as IFavoriteItem[]) : [];
    }

    private saveFavorites(list: IFavoriteItem[]) {
        this.data[FAV_KEY] = list;
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

    // 折叠/展开状态变化后去抖写入持久化
    private saveFavCollapsed() {
        this.data[FAV_COLLAPSED_KEY] = Array.from(this.favCollapsed);
        this.saveDataDebounced(FAV_COLLAPSED_KEY);
    }

    // ==================== 收藏下拉组件 ====================
    // 原生 select 的 optgroup 无法折叠且样式简陋，改为自定义下拉：
    // 触发按钮（星标 + 数量徽标）+ 浮层面板（分组标题可折叠/展开，组内项点击跳转）

    // 初始化一个收藏下拉组件（弹窗与侧边栏各一份）
    // onClose：选择收藏项后的收尾（弹窗销毁 / 侧边栏刷新），组件内部还会同时收起面板
    private setupFavDropdown(container: HTMLElement, onClose: IOverlayClose) {
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
        // 收起面板并停止 DOM 观察（三条收起路径共用：再次点击触发器 / 点击外部 / 选中收藏项）
        const closePanel = () => {
            panel.classList.add("fn__none");
            // 全局监听仅在面板展开期间存在，关闭后立即释放。
            unbindGlobal();
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
                });
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
    private renderFavPanel(panel: HTMLElement, onPick: () => void) {
        panel.innerHTML = "";
        const favorites = this.getFavorites();
        const groupNames = this.getFavoriteGroupNames();

        // 既无收藏也无分组才提示空态；仅有空分组时仍展示分组（数量 0），与设置页保持一致
        if (favorites.length === 0 && groupNames.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__fav-empty";
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
            this.appendFavFlatList(panel, ungrouped, onPick);
        } else {
            groupedNames.forEach((name) => this.appendFavGroup(panel, name, groups.get(name) || [], onPick));
            if (ungrouped.length > 0) {
                this.appendFavGroup(panel, this.i18n.ungrouped, ungrouped, onPick);
            }
        }
    }

    // 渲染单个收藏分组：可折叠组头（右键弹出一键开/关菜单）+ 组内项列表
    private appendFavGroup(panel: HTMLElement, name: string, items: IFavoriteItem[], onPick: () => void) {
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
            this.openFavGroupMenu(items, event);
        });
        groupEl.appendChild(head);

        const list = document.createElement("div");
        list.className = "sw__fav-items";
        items.forEach((fav) => {
            list.appendChild(this.makeFavItem(panel, fav, onPick));
        });
        groupEl.appendChild(list);
        panel.appendChild(groupEl);
    }

    // 无任何分组时的平铺列表（不显示组头）
    private appendFavFlatList(panel: HTMLElement, items: IFavoriteItem[], onPick: () => void) {
        const list = document.createElement("div");
        list.className = "sw__fav-items sw__fav-items--flat";
        items.forEach((fav) => {
            list.appendChild(this.makeFavItem(panel, fav, onPick));
        });
        panel.appendChild(list);
    }

    // 生成单个收藏项按钮：点击跳转；右键弹出操作菜单（移动至分组 / 取消收藏）
    private makeFavItem(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void): HTMLButtonElement {
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
            this.openFavItemMenu(panel, fav, onPick, event);
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

    // 刷新所有收藏下拉组件（弹窗与侧边栏）的徽标与面板
    private refreshFavSelects() {
        document.querySelectorAll<HTMLElement>(".sw__fav-dd").forEach((container) => {
            this.refreshFavDropdown(container);
        });
    }

    // 修改收藏项的分组（group 为空表示移出分组）
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
        return Array.isArray(data) ? (data as unknown[]).filter((name): name is string => typeof name === "string" && !!name) : [];
    }

    private saveFavGroupRegistry(names: string[]) {
        this.data[FAV_GROUPS_KEY] = names;
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
    private openFavGroupMenu(items: IFavoriteItem[], event: MouseEvent) {
        const menu = new Menu("swFavGroupMenu");
        menu.addItem({
            label: this.i18n.openGroupTabs,
            icon: "iconAdd",
            click: async () => {
                await this.openGroupTabs(items);
            },
        });
        menu.addItem({
            label: this.i18n.closeGroupTabs,
            icon: "iconClose",
            click: async () => {
                await this.closeGroupTabs(items);
            },
        });
        menu.open({x: event.clientX, y: event.clientY});
    }

    // 收藏下拉项右键菜单：移动到既有分组（子菜单，当前分组勾选）/ 取消收藏。
    // 操作后保持面板展开并就地重建，方便连续处理多个收藏项。
    private openFavItemMenu(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void, event: MouseEvent) {
        const menu = new Menu("swFavItemMenu");
        const moveSub = [{checked: !fav.group, label: this.escapeAttr(this.i18n.ungrouped),
            click: () => this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, ""), panel, onPick)}];
        this.getFavoriteGroupNames().forEach((name) => {
            moveSub.push({checked: fav.group === name, label: this.escapeAttr(name),
                click: () => this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, name), panel, onPick)});
        });
        menu.addItem({type: "submenu", label: this.i18n.moveToGroup, icon: "iconFolder", submenu: moveSub});
        // 新建分组并移动：弹窗输入分组名（新名称自动新建，留空移出分组）
        menu.addItem({
            label: this.i18n.newGroupFav,
            icon: "iconAdd",
            click: () => this.openFavoriteGroupDialog(panel, fav, onPick),
        });
        menu.addSeparator();
        menu.addItem({
            label: this.i18n.unfavoriteTab,
            icon: "iconClose",
            click: () => this.applyFavItemChange(() => this.removeFavorite(fav.key), panel, onPick),
        });
        menu.open({x: event.clientX, y: event.clientY});
    }

    // 执行收藏项变更：先落盘并同步所有下拉的徽标（refreshFavSelects 会收起展开中的面板），
    // 再让当前面板保持展开并就地重建，最后按新内容高度重新贴位
    private applyFavItemChange(mutate: () => void, panel: HTMLElement, onPick: () => void) {
        mutate();
        this.refreshFavSelects();
        panel.classList.remove("fn__none");
        this.renderFavPanel(panel, onPick);
        const dd = panel.closest<HTMLElement>(".sw__fav-dd");
        const trigger = dd?.querySelector<HTMLElement>(".sw__fav-trigger");
        if (dd && trigger) {
            this.positionFavPanel(trigger, panel);
        }
    }

    // 转义 HTML 属性值（分组名等用户输入拼入模板时防注入；Menu label 为 innerHTML 亦需转义）
    private escapeAttr(text: string): string {
        return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // 弹窗设置收藏项的分组：输入分组名（留空移出分组），datalist 列出已有分组便于快速选择；
    // 未收藏的页签确认后自动收藏到该分组
    private openGroupDialog(tab: Tab, card?: HTMLElement) {
        const key = this.pinKeyOf(tab);
        const favorite = this.getFavorites().find((item) => item.key === key);
        const groupNames = this.getFavoriteGroupNames();
        const dialog = new Dialog({
            title: `${this.i18n.setGroup} · ${this.escapeAttr(this.titleOf(tab))}`,
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
    private openFavoriteGroupDialog(panel: HTMLElement, fav: IFavoriteItem, onPick: () => void) {
        const groupNames = this.getFavoriteGroupNames();
        const dialog = new Dialog({
            title: `${this.i18n.setGroup} · ${this.escapeAttr(fav.title)}`,
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
            this.applyFavItemChange(() => this.setFavoriteGroup(fav.key, input.value), panel, onPick);
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
    private resolveFavRootId(favorite: IFavoriteItem): string {
        if (favorite.rootId && BLOCK_ID_RE.test(favorite.rootId)) {
            return favorite.rootId;
        }
        return BLOCK_ID_RE.test(favorite.key) ? favorite.key : "";
    }

    // 跳转到收藏项：页签已开则切换过去；页签已关闭则按 rootId 重开。
    // 收藏项永久留存（直到用户主动删除）：无法定位文档的历史脏条目仅提示、不自动清理，
    // 用户打开对应页签后星标操作会自动将其迁移修复
    private async jumpToFavorite(favorite: IFavoriteItem, onClose: IOverlayClose) {
        // 手机端 getAllTabs() 恒为空，需用 MobileTabs 数据源
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
            // openTab 在手机端是空实现，走 MobileTabs.open
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

    // 一键开启组内全部页签：打开未打开的收藏（rootId 校验与 jumpToFavorite 一致，
    // 无效历史条目跳过），返回实际打开数
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
        const keys = new Set(items.map((fav) => this.resolveFavRootId(fav)).filter(Boolean));
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

    // 组内排序：置顶页签固定在最前，其余按所选方式排序
    private sortItems(items: IGroupedTab[], sortBy: SortBy, mru: string[], updatedMap: {[rootId: string]: string}) {
        if (sortBy === "titleAsc" || sortBy === "titleDesc") {
            items.sort((a, b) => {
                const result = this.titleOf(a.tab).localeCompare(this.titleOf(b.tab), undefined, {numeric: true});
                return sortBy === "titleAsc" ? result : -result;
            });
        } else if (sortBy === "layoutDesc") {
            items.reverse(); // 打开顺序倒序：反转 getAllTabs 的布局顺序
        } else if (sortBy === "updatedDesc") {
            // 最近编辑：按文档 updated 时间倒序，无数据的排后面
            items.sort((a, b) => {
                const ua = updatedMap[this.rootIdOf(a.tab) || ""] || "";
                const ub = updatedMap[this.rootIdOf(b.tab) || ""] || "";
                return ua < ub ? 1 : ua > ub ? -1 : 0;
            });
        } else if (sortBy === "mru") {
            // MRU 中越靠前越新；不在记录中的页签按打开顺序排在后面。
            // 按 pinKey（文档页签为 rootID）匹配，与 activateTab 的记录键一致，手机端/桌面端共用同一份 MRU
            items.sort((a, b) => {
                const ra = mru.indexOf(this.pinKeyOf(a.tab));
                const rb = mru.indexOf(this.pinKeyOf(b.tab));
                return (ra < 0 ? Number.MAX_SAFE_INTEGER : ra) - (rb < 0 ? Number.MAX_SAFE_INTEGER : rb);
            });
        }
        // layout：保持 getAllTabs 返回的布局顺序，无需处理
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

        const activeTabId = activeTab?.id;
        const mru = this.getMru();
        const pinned = new Set(this.getPinned());
        const favorites = new Set(this.getFavorites().map((item) => item.key));

        // 按 parent（Wnd）分栏分组，保持 getAllTabs 的布局树顺序
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
        const pinnedItems = group.filter((item) => pinned.has(this.pinKeyOf(item.tab)));
        const restItems = group.filter((item) => !pinned.has(this.pinKeyOf(item.tab)));
        this.sortItems(restItems, sortBy, mru, updatedMap);
        return [...pinnedItems, ...restItems];
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
        label.textContent = `${this.i18n.currentWindow} · ${ordered.length}`;
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

    // 空态：主文案 + 引导副文案（提示可搜索全库文档）
    private buildEmptyState(): HTMLElement {
        const empty = document.createElement("div");
        empty.className = "sw__empty";
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
            // 连续 removeTab 时给思源 DOM/状态一帧沉降时间，降低漏关概率
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

    // 小睡工具：批量开/关页签时避免竞态
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
                    label.textContent = `${this.i18n.currentWindow} · ${count}`;
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
    // 拦截 click 必须注册在 activate 之前（目标节点按注册顺序触发）
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

    // ==================== 缩略图缓存 ====================
    // 缓存按文档 rootID 索引：只要该文档页签还开着（哪怕重启/重置布局后重新恢复），
    // 缓存就保留并在页签 DOM 未就绪时直接渲染；页签关闭后由 pruneThumbCache 清除。

    private getThumbCache(): IThumbCache {
        const data = this.data[THUMB_CACHE_KEY];
        return data && typeof data === "object" ? data as IThumbCache : {};
    }

    private saveThumbCache(cache: IThumbCache) {
        this.data[THUMB_CACHE_KEY] = cache;
        this.saveDataDebounced(THUMB_CACHE_KEY);
    }

    // 写入一条缓存（实时 DOM 优先更新），超过上限时按最旧淘汰；不立即写盘，由调用方批量 flush
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
    // 视口外保持加载占位。打开切换器从"全量克隆"降为"首屏克隆"，大列表秒开
    private renderThumbnails(list: IGroupedTab[], scrollElement: HTMLElement, batch: number) {
        // 同一容器重复渲染时（排序切换/列表刷新）先断开旧观察器，防止泄漏与重复渲染
        // 用 WeakMap 把 IntersectionObserver 绑在元素上，替代 (el as any).__swThumbObserver 的自挂私有属性写法
        const prev = thumbObserverCache.get(scrollElement);
        if (prev) {
            prev.disconnect();
            thumbObserverCache.delete(scrollElement);
        }

        // 环境不支持 IntersectionObserver 时退回原分批全量渲染（思源内核均为 Chromium，仅防御）
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
                requestAnimationFrame(runBatch);
            } else if (dirty) {
                this.saveThumbCache(cache);
            }
        };
        requestAnimationFrame(runBatch);
    }

    // 将克隆内容装进缩略图框并按宽度缩放
    private applyThumbContent(thumb: HTMLElement, source: HTMLElement, title: string) {
        const content = document.createElement("div");
        content.className = "sw__thumb-content";
        content.appendChild(source);
        thumb.appendChild(content);
        // 依据盒子实际宽度计算缩放比例；容器尚未完成布局（宽度为 0）时等下一帧重算，
        // 后续尺寸变化由侧边栏的 ResizeObserver 兜底重算
        const width = thumb.clientWidth;
        if (width > 0) {
            content.style.transform = `scale(${(width / CONTENT_WIDTH_PX).toFixed(3)})`;
        } else {
            requestAnimationFrame(() => {
                if (thumb.isConnected && thumb.clientWidth > 0) {
                    content.style.transform = `scale(${(thumb.clientWidth / CONTENT_WIDTH_PX).toFixed(3)})`;
                }
            });
        }
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
            return; // 非文档页签，保持占位
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
            // 读取失败保持占位即可
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

    // ==================== 手机端 ====================

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
                // 手机端页签图标可能在 t.icon 或 t.current.icon，优先 t.icon（思源不同版本字段不同）
                icon: (t as unknown as {icon?: string}).icon || t.current!.icon || "",
                // 兼容 rootIdOf()：直接命中 model.editor.block.rootID 分支
                model: {editor: {block: {rootID: t.current!.rootID}}},
            } as unknown as Tab));
    }

    // 手机端 MobileTabs 状态是否可用（思源 3.8+ 才有；旧版手机端无多页签概念）
    private hasMobileTabsApi(): boolean {
        return !!getSiyuan()?.mobile?.tabs?.state;
    }

    // 手机端当前激活页签 id（无激活时返回 undefined）
    private getMobileActiveTabId(): string | undefined {
        return getSiyuan()?.mobile?.tabs?.state?.activeTabID;
    }

    // 手机端打开文档（思源 plugin API openTab 在移动端是空实现），返回是否成功：
    // 1) 优先 MobileTabs.open(rootID)（思源 3.8+）：必须保持宿主对象调用（抽成裸函数调用会丢 this，
    //    内部 abortController/navigationEpoch 访问直接抛错），await 返回值判断结果而非固定延时轮询；
    //    open 明确返回失败（invalid/cancelled/failed）时不降级——openTab 在移动端是空实现，降级无意义；
    // 2) 仅当 MobileTabs API 不存在（思源 <3.8）才降级到 plugin.openTab 兜底通道
    private async mobileOpenDoc(rootId: string): Promise<boolean> {
        const tabs = getSiyuan()?.mobile?.tabs;

        // 路径 1：MobileTabs.open（旧版本无返回值时为 undefined，视作已生效；新版本 "success" 才算成功）
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

        // 路径 2：旧版思源（无 MobileTabs API）降级到 plugin openTab（移动端空实现，静默返回）
        try {
            await openTab({app: this.app, doc: {id: rootId}});
            return true;
        } catch (e) {
            logger.warn("mobile open doc fail (path 2)", e);
            showMessage(this.i18n.openDocFailed);
            return false;
        }
    }

    // 手机端切换器：全屏覆盖弹窗，简化工具栏，单列/双列卡片，纯触摸操作
    private showMobileSwitcher() {
        const tabs = this.getMobileTabs();
        if (tabs.length === 0) {
            // 手机端 WebView 会拦截原生 alert，必须用思源 showMessage 才有可见反馈；
            // 旧版思源（<3.8）无 MobileTabs API，需提示升级而不是误报"无页签"
            showMessage(this.hasMobileTabsApi() ? this.i18n.noOpenedTabs : this.i18n.mobileNeedsNewer);
            return;
        }
        this.openMobileSwitcherDialog(tabs);
    }

    // 打开手机端切换器 Dialog：装配顶栏、列表、搜索、FAB 隐藏等
    private openMobileSwitcherDialog(tabs: Tab[]) {
        const settings = this.getSettings();
        // 手机端当前页签高亮：MobileTabs 的 activeTabID（renderMobileList 仅读取其 id）
        const activeTab: Tab | undefined = this.isMobile
            ? ({id: this.getMobileActiveTabId()} as Tab)
            : this.getActiveTab();

        const dialog = this.createMobileSwitcherDialog();
        // 关键修复：Dialog 先把元素挂到 DOM，b3-dialog--open 类要等 50ms 超时才补上，
        // 期间容器处于 transform: scale(.8) 过渡态；手机 WebView 中带 backdrop-filter 的
        // 子元素在该动画窗口内会渲染错乱（图标巨大/位置错位），动画结束又自愈——
        // 即"刚打开闪一下错乱"的根因。禁用动画让容器同步进入最终态，彻底消除该窗口
        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }

        // 清理缩略图缓存中已无对应打开页签的孤儿条目
        this.pruneThumbCache(tabs);

        // 隐藏 FAB 避免遮挡弹窗；任何关闭路径都需要恢复 FAB
        this.fabElement?.classList.add("sw__fab--hidden");
        const restoreFAB = () => this.fabElement?.classList.remove("sw__fab--hidden");
        const closeOverlay = () => {
            restoreFAB();
            dialog.destroy();
        };
        // 钩住 Dialog.destroy（Escape/点击外部/程序调用）所有关闭路径都恢复 FAB
        const origDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            restoreFAB();
            origDestroy();
        };

        // 装配工具栏与列表渲染
        const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        if (!searchInput || !sortSelect || !scrollElement) {
            return;
        }
        // 先装配列表拿到 renderMobileList，再绑定工具栏（排序切换复用装配期 renderMobileList）；
        // 列表首渲染只依赖 sortSelect 值，不依赖工具栏绑定，对调安全
        sortSelect.value = settings.sortBy;
        const {renderMobileList} = this.renderMobileSwitcherList(dialog, scrollElement, sortSelect, settings);
        this.bindMobileSwitcherToolbarActions(dialog, searchInput, sortSelect, scrollElement, closeOverlay, renderMobileList);

        // 把 FAB 关闭时的 FAB 恢复优先级插在 destroy 之后；保证打开收藏弹窗关闭后会回到列表
        dialog.element.querySelector(".sw__mobile-fav-btn")?.addEventListener("click", () => {
            this.showMobileFavSheet(dialog, closeOverlay, () => renderMobileList());
        });
        // 手机端不自动聚焦搜索框：避免一打开就弹出输入法，需要搜索时点击输入框
    }

    // 构造手机端切换器 Dialog（极简：搜索 + 排序 + 收藏 + 日记 + 设置 + 滚动区）
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
        return `<div class="speed-switch sw__body sw__mobile">
    <div class="sw__toolbar sw__mobile-toolbar">
        <div class="sw__search-wrap">
            <svg class="sw__search-icon"><use xlink:href="#iconSearch"></use></svg>
            <input class="b3-text-field sw__search" placeholder="${this.i18n.searchTabs}" autocomplete="off" spellcheck="false" />
        </div>
        <select class="b3-select sw__sort" aria-label="${this.i18n.setSortBy}">
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
</div>`;
    }

    // 手机端顶栏按钮：设置 / 日记 + 排序切换（排序切换复用装配期 renderMobileList 与 updatedMap）
    private bindMobileSwitcherToolbarActions(
        dialog: Dialog,
        searchInput: HTMLInputElement,
        sortSelect: HTMLSelectElement,
        scrollElement: HTMLDivElement,
        closeOverlay: () => void,
        renderMobileList: () => void,
    ) {
        // 隐藏 FAB 推迟到按钮 click 处是因为 openSetting 可能也关闭原 dialog
        dialog.element.querySelector(".sw__settings-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.fabElement?.classList.remove("sw__fab--hidden");
            this.openSetting();
        });
        // 顶栏日记按钮：打开/新建当日日记（关闭弹窗并恢复 FAB，未设默认日记本时首次点击弹出选择）
        dialog.element.querySelector(".sw__journal-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.fabElement?.classList.remove("sw__fab--hidden");
            this.openJournal();
        });
        sortSelect.addEventListener("change", () => {
            this.updateSettings({sortBy: sortSelect.value as SortBy});
            // 排序切换：复用装配期 renderMobileList（重读最新列表 + 共享 updatedMap），再清搜索词重过滤
            renderMobileList();
            searchInput.value = "";
            this.filterCards(scrollElement, searchInput.value);
        });
        searchInput.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });
    }

    // 装配手机端列表渲染：返回 renderMobileList 函数以便收藏弹窗的 onTabsChanged 回调触发刷新
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
        // 「最近编辑」排序需要文档更新时间：后台查询一次，完成后若仍处于该排序则重排
        const mergedMap = updatedMap;
        this.loadUpdatedMap(this.getMobileTabs()).then((map) => {
            Object.assign(mergedMap, map);
            if (dialog.element.isConnected && sortSelect.value === "updatedDesc") {
                renderMobileList();
            }
        });
        return {renderMobileList};
    }

    // 手机端渲染页签卡片列表
    private renderMobileList(scrollElement: HTMLElement, tabs: Tab[], activeTab: Tab | undefined,
                             opts: {onOverlayClose: IOverlayClose, onTabsChanged: IOverlayClose},
                             sortBy: SortBy, updatedMap: {[rootId: string]: string} = {}) {
        // 复用旧卡片（同 renderList）：关闭页签/排序切换后重排不重建缩略图
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

        // 手机端不分窗口分组，全部扁平化
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

        // 手机端缩略图：视口懒渲染 + 更保守的回源并发
        this.renderThumbnails(all, scrollElement, THUMB_BATCH_MOBILE);
    }

    // 构造手机端分组卡片网格：根据 settings.mobileColumns 决定单列/双列/自适应
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

        // 构建底部弹窗
        const overlay = document.createElement("div");
        overlay.className = "sw__mobile-sheet-overlay";
        overlay.innerHTML = this.buildMobileFavSheetHtml();
        document.body.appendChild(overlay);

        const sheet = overlay.querySelector<HTMLElement>(".sw__mobile-sheet");
        const body = overlay.querySelector<HTMLElement>(".sw__mobile-sheet-body");
        if (!sheet || !body) {
            // 骨架异常时不能把空遮罩留在 body 上挡住整屏交互
            overlay.remove();
            return;
        }

        // 渲染分组/单列表/空态
        this.renderMobileFavSheetBody(body, favorites, groupNames, closeOverlay, onTabsChanged, overlay);

        // 动画：下一帧滑入
        requestAnimationFrame(() => sheet.classList.add("sw__mobile-sheet--open"));
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

        // favorites 为空（仅有空分组注册）时追加空态
        if (favorites.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__mobile-sheet-empty";
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
            this.openMobileGroupActions(name, items, onNestedClosed);
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

        // 与收藏弹窗一致的下滑收起动画
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
                    // 仅在确实发生变更时刷新背后的切换器列表
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

        // 动画：下一帧滑入
        requestAnimationFrame(() => {
            sheet.classList.add("sw__mobile-sheet--open");
        });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeSelf();
            }
        });
    }

    // ==================== 手机端悬浮按钮（FAB）与顶栏入口 ====================

    private createFAB() {
        // 已在文档中则跳过；仅存在引用但已脱挂（被外部移除）时重建
        if (this.fabElement?.isConnected) {
            return;
        }
        this.fabElement?.remove();
        this.fabElement = document.createElement("div");
        this.fabElement.className = "sw__fab";
        this.fabElement.setAttribute("role", "button");
        this.fabElement.setAttribute("aria-label", this.i18n.switchTabs);
        this.fabElement.innerHTML = `<svg><use xlink:href="#iconLayout"></use></svg>`;
        this.fabElement.addEventListener("click", () => {
            this.showSwitcher();
        });
        document.body.appendChild(this.fabElement);
        this.bindFABScrollGesture();
    }

    // 滚动手势控制 FAB 显隐（与思源手机端底部工具条行为一致）：
    // 手指上滑（内容向下滚）隐藏、下滑出现。用独立类 sw__fab--scroll-hidden，
    // 与打开切换器时的 sw__fab--hidden 互不干扰
    private bindFABScrollGesture() {
        if (this.fabGestureBound) {
            return;
        }
        this.fabGestureBound = true;
        const THRESHOLD = 12; // 位移超过该值才判定方向，避免抖动误触发
        let startX = 0;
        let startY = 0;
        this.fabGestureHandlers = {
            touchstart: (event: TouchEvent) => {
                startX = event.touches[0]?.clientX ?? 0;
                startY = event.touches[0]?.clientY ?? 0;
            },
            touchmove: (event: TouchEvent) => {
                if (!this.fabElement || event.touches.length !== 1) {
                    return;
                }
                // 触点落在 FAB 自身上不处理（点击按钮时不应触发隐藏）
                if (this.fabElement.contains(event.target as Node)) {
                    return;
                }
                const x = event.touches[0].clientX;
                const y = event.touches[0].clientY;
                const deltaX = x - startX;
                const deltaY = y - startY;
                // 仅垂直主导的滑动才触发显隐，横向滑动（如查看宽表格）不误触
                if (Math.abs(deltaY) < THRESHOLD || Math.abs(deltaY) <= Math.abs(deltaX)) {
                    return;
                }
                startY = y; // 重置起点，连续滑动可多次触发
                if (deltaY < 0) {
                    // 手指上滑 → 隐藏
                    this.fabElement.classList.add("sw__fab--scroll-hidden");
                } else {
                    // 手指下滑 → 出现
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
        } else {
            this.fabElement?.remove();
            this.fabElement = null;
        }
    }

    // 手机端顶栏入口按钮：思源 3.8.x 手机端 addTopBar 只会进右侧菜单"扩展"分组，
    // 这里直接插入 mobileTopBar（旧版无此元素时静默跳过，不影响其他入口）。
    // 切换器入口 + 日记入口各自独立注入，常规运行每个在首次时插入一次即可。
    private ensureMobileTopBarButton() {
        const topBar = document.getElementById("mobileTopBar") || document.getElementById("toolbar");
        if (!topBar) {
            return;
        }
        // 切换器入口（外部只有一个入口按钮；日记按钮位于切换器弹窗顶栏内）
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

    // ==================== 侧边栏模式 ====================

    // 在 dock 面板内渲染紧凑版切换器（单列卡片，常驻侧边栏便于快速切换）
    private renderSidebarPanel(element: HTMLElement) {
        if (!element) {
            return;
        }
        this.sidebarElement = element;
        element.classList.add("speed-switch", "sw__body", "sw--sidebar");
        // 侧边栏缩略图布局：enlarge（默认）放大填满栏宽；columns 按宽度自动增加列数
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

        // 「最近编辑」排序需要文档更新时间：后台查询一次，完成后若仍处于该排序且未搜索则重排
        this.loadUpdatedMap(tabs).then((map) => {
            Object.assign(updatedMap, map);
            const sortSelect = element.querySelector<HTMLSelectElement>(".sw__sort");
            const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
            if (element.isConnected && sortSelect?.value === "updatedDesc" && searchInput && searchInput.value.trim() === "") {
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
            }
        });

        // 面板尺寸变化时仅重算缩略图缩放比例（ResizeObserver 覆盖拖动分隔条等所有场景）
        this.observeSidebarResize(element);
        // 顶栏交互：搜索 / 收藏下拉 / 排序 / 设置 / 回到顶部
        this.bindSidebarToolbarEvents(element, scrollElement, refresh);
    }

    // 侧边栏 DOM 骨架：搜索 + 收藏下拉 + 排序 + 设置 + 滚动区 + 回到顶部
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
    <span class="sw__back-top b3-tooltips b3-tooltips__n" aria-label="${this.i18n.backTop}">
        <svg><use xlink:href="#iconUp"></use></svg>
    </span>
</div>`;
    }

    // 侧边栏尺寸监听：拖动分隔条等场景只重算缩略图缩放，不重建 DOM
    private observeSidebarResize(element: HTMLElement) {
        if (this.sidebarResizeObserver) {
            this.sidebarResizeObserver.disconnect();
        }
        this.sidebarResizeObserver = new ResizeObserver(() => this.rescaleThumbs(element));
        this.sidebarResizeObserver.observe(element);
    }

    // 侧边栏顶栏事件：搜索 / 收藏下拉 / 排序切换 / 设置 / 回到顶部
    private bindSidebarToolbarEvents(element: HTMLElement, scrollElement: HTMLDivElement, refresh: IOverlayClose) {
        // 搜索：与弹窗一致，页签匹配在上、全库文档在下
        const searchInput = element.querySelector<HTMLInputElement>(".sw__search");
        searchInput.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, refresh);
        });

        // 收藏下拉组件：星标触发 + 分组面板（侧边栏跳转后仅刷新列表）
        const favDd = element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, refresh);

        // 排序切换：持久化设置并重渲染列表
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

    // 重算容器内全部缩略图的缩放比例（侧边栏尺寸变化时调用，内容随面板宽度自动伸缩）
    private rescaleThumbs(container: HTMLElement) {
        container.querySelectorAll<HTMLElement>(".sw__thumb").forEach((thumb) => {
            const content = thumb.querySelector<HTMLElement>(".sw__thumb-content");
            const width = thumb.clientWidth;
            if (content && width > 0) {
                content.style.transform = `scale(${(width / CONTENT_WIDTH_PX).toFixed(3)})`;
            }
        });
    }

    // 刷新侧边栏列表（面板仍连接在 DOM 上时）
    private refreshSidebar() {
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

    // 打开（或聚焦已打开的）侧边栏面板
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
}
