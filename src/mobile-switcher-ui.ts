// 小驴速切 —— 移动端切换器 UI 链路（P1-1a 自 index.ts 原样搬移，ADR 0048）
// 本群以 this 参数模式运行：调用方式 renderMobileList.call(host, ...)。
// host 契约见 MobileSwitcherUiHost；群内互调在本模块内直接 .call(this)，
// 留宿主的成员保持 this.xxx。
// 注意：下列签名是从迁移前 index.ts 的类声明逐项同步而来，改宿主实现时此处须同步。
import {Dialog, Menu, getFrontend, getAllTabs, showMessage} from "siyuan";
import type {IMenu} from "siyuan";
import {MESSAGE_DEFAULT_MS} from "./constants";
import type {TabGroupMode} from "./constants";
import {logger} from "./logger";
import {clampOversizedIcons} from "./util";
import {bindDocSearchFilter, disposeDocSearchSession, hasDocSearchFilter} from "./doc-search-ui";
import {groupTabsByMode} from "./util";
import {resolveSearchNotebookId} from "./search-model";
import {FAB_HIDE_DELAY_MS, THUMB_BATCH_MOBILE} from "./constants";
import type {
    IFavoriteItem, IGroupedTab, IOverlayClose, ISwSettings,
    ITabGroupRenderCtx, SortBy,
} from "./index";

type Tab = ReturnType<typeof getAllTabs>[number];

export interface MobileSwitcherUiHost {
    i18n: Record<string, string>;
    isMobile: boolean;
    groupCollapseState: Set<string>;
    rootIdOf(tab: Tab): string | null;
    applySearch(scrollElement: HTMLElement, searchInput: HTMLInputElement, onClose: IOverlayClose): void;
    bindSearchInputComposition(input: HTMLInputElement, onTrigger: () => void): void;
    buildEmptyState(): HTMLElement;
    buildMobileGroupGrid(settings: ISwSettings): HTMLElement;
    closeGroupTabs(items: IFavoriteItem[]): Promise<number>;
    createMobileSwitcherDialog(release: {fn: () => void}): Dialog;
    escapeAttr(text: string): string;
    getActiveTab(): Tab | undefined;
    getFavGroupRegistry(): string[];
    getFavorites(): IFavoriteItem[];
    getMobileActiveTabId(): string | undefined;
    getMru(): string[];
    getPinned(): string[];
    getSettings(): ISwSettings;
    loadNotebooks(): Promise<Array<{id: string, name: string}>>;
    loadUpdatedMap(tabs: Tab[]): Promise<{[rootId: string]: string}>;
    openGroupTabs(items: IFavoriteItem[]): Promise<number>;
    openJournal(preferredNotebook?: string): Promise<void>;
    openSetting(initialPanel?: string): void;
    pinKeyOf(tab: Tab): string;
    pruneThumbCache(tabs: Tab[]): void;
    registerSwitcherRefresh(callback: () => void): () => void;
    renderMobileCardsInGroup(grid: HTMLElement, ordered: IGroupedTab[], ctx: ITabGroupRenderCtx): IGroupedTab[];
    renderMobileSwitcherList(dialog: Dialog, scrollElement: HTMLDivElement,
        sortSelect: HTMLSelectElement, settings: ISwSettings): {renderMobileList: () => void};
    renderQuickActions(container: HTMLElement, surface: "desktop" | "sidebar" | "mobile",
        searchInput: HTMLInputElement | null, close: () => void, selector?: string): void;
    renderThumbnails(list: IGroupedTab[], scrollElement: HTMLElement, batch: number): void;
    scheduleAnimationFrame(callback: FrameRequestCallback): number;
    setupOpenHistoryDropdown(container: HTMLElement | null, onClose: IOverlayClose): () => void;
    showMobileFavSheet(dialog: Dialog, closeOverlay: IOverlayClose, onTabsChanged?: () => void): void;
    sortGroupItems(group: IGroupedTab[], sortBy: SortBy, mru: string[],
        pinned: Set<string>, updatedMap: {[rootId: string]: string}): IGroupedTab[];
    suspendFABForDialog(onDestroy?: () => void): () => void;
    updateSettings(patch: Partial<ISwSettings>): void;
    fabElement: HTMLElement | null;
    notebookListCache: Array<{id: string; name: string}> | null;
    createdByIdCache: {[rootId: string]: string};
}

export function openMobileSwitcherDialog(this: MobileSwitcherUiHost, tabs: Tab[]) {
        const settings = this.getSettings();
        // 手机端当前页签高亮：MobileTabs 的 activeTabID（renderMobileList 仅读取其 id）
        const activeTab: Tab | undefined = this.isMobile
            ? ({id: this.getMobileActiveTabId()} as Tab)
            : this.getActiveTab();

        // T-6481：destroyCallback 在构造期就要成型，而资源在后面才创建，故用 holder 传递；
        // FAB 恢复并入同一个释放入口，不再覆写 dialog.destroy。
        const switcherRelease: {fn: () => void} = {fn: () => undefined};
        const dialog = this.createMobileSwitcherDialog(switcherRelease);
        const releaseFab = this.suspendFABForDialog();
        dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.classList.add("sw-mobile-switcher-dialog");
        const mobileBody = dialog.element.querySelector<HTMLElement>(".sw__mobile");
        let readyFrame: number | null = null;
        let readyFrameCancel: (() => void) | null = null;
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
            // Never reveal a zero-sized or structurally collapsed dialog.  The
            // bounded retry is only a last-resort guard for WebViews that do
            // not deliver a second animation frame; it still requires the
            // body/toolbar geometry to be usable.
            const hasFallbackGeometry = bodyRect.width > 0 && bodyRect.height > 0
                && !!toolbarRect && toolbarRect.width > 0
                && toolbarStyle?.display === "flex"
                && (!scroll || scroll.clientWidth > 0)
                && toolbarRect.width <= bodyRect.width + 2;
            if (stableFrames >= 2 || (attempt >= 30 && hasFallbackGeometry)) {
                // 图标尺寸兜底：symbol 有了 CARD_ICON_SPRITE 兜底，**尺寸**此前仍完全依赖
                // 插件 CSS。手机 WebView 首开（同步占用主线程时更慢）会让裸 <svg> 退回
                // 浏览器默认 300×150，把顶栏撑成"巨型图标 + 控件竖排"——即"刚进去出现
                // 大图标"。这里在可见前扫一遍容器，只修正实测已异常的图标，
                // 正常路径一个节点都不碰，因此不带来任何视觉回归。
                const clamped = clampOversizedIcons(mobileBody);
                if (clamped > 0) {
                    logger.warn("mobile switcher icon size fallback applied", {count: clamped});
                }
                mobileBody.classList.remove("sw__mobile--initializing");
                mobileBody.style.removeProperty("visibility");
                mobileBody.style.removeProperty("opacity");
                mobileBody.style.removeProperty("pointer-events");
                if (!hasStableGeometry && attempt >= 30) {
                    logger.warn("mobile switcher revealed after layout timeout", {width: bodyRect.width, height: bodyRect.height});
                }
                readyFrame = null;
                readyFrameCancel = null;
                return;
            }
            if (typeof requestAnimationFrame === "function") {
                const frame = requestAnimationFrame(() => revealWhenReady(attempt + 1));
                readyFrame = frame;
                readyFrameCancel = () => cancelAnimationFrame(frame);
            } else {
                const timer = window.setTimeout(() => revealWhenReady(attempt + 1), 16);
                readyFrame = timer;
                readyFrameCancel = () => window.clearTimeout(timer);
            }
        };
        if (typeof requestAnimationFrame === "function") {
            const frame = requestAnimationFrame(() => revealWhenReady());
            readyFrame = frame;
            readyFrameCancel = () => cancelAnimationFrame(frame);
        } else {
            const timer = window.setTimeout(() => revealWhenReady(), 16);
            readyFrame = timer;
            readyFrameCancel = () => window.clearTimeout(timer);
        }
        const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        // 关键修复：Dialog 先把元素挂到 DOM，b3-dialog--open 类要等 50ms 超时才补上，
        // 期间容器处于 transform: scale(.8) 过渡态；手机 WebView 中带 backdrop-filter 的
        // 瀛愬厓绱犲湪璇ュ姩鐢荤獥鍙ｅ唴浼氭覆鏌撻敊涔憋紙鍥炬爣宸ㄥぇ/浣嶇疆閿欎綅锛夛紝鍔ㄧ敾缁撴潫鍙堣嚜鎰堚€斺€?
        // 即"刚打开闪一下错乱"的根因。禁用动画让容器同步进入最终态，彻底消除该窗口
        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }

        // 清理缩略图缓存中已无对应打开页签的孤儿条目
        this.pruneThumbCache(tabs);

        let unregisterRefresh: () => void = () => undefined;
        let disposeMobileToolbar: () => void = () => undefined;
        let disposeHistoryDropdown: () => void = () => undefined;
        // 释放入口：宿主 destroyCallback（Escape/点击外部/程序调用）统一收敛到这里。
        let mobileReleased = false;
        switcherRelease.fn = () => {
            if (mobileReleased) return;
            mobileReleased = true;
            revealCancelled = true;
            readyFrameCancel?.();
            readyFrame = null;
            readyFrameCancel = null;
            // Sorting is rendered in a body-level portal so it can escape the
            // host Dialog's clipping/stacking context.  Always tear that
            // portal down with its owner, including Escape and route changes.
            document.querySelectorAll<HTMLElement>(".sw__mobile-sort-overlay").forEach((overlay) => overlay.remove());
            disposeMobileToolbar();
            disposeHistoryDropdown();
            unregisterRefresh();
            if (scrollElement) {
                disposeDocSearchSession.call(this, scrollElement);
            }
            releaseFab();
        };
        const closeOverlay = () => dialog.destroy();

        // 瑁呴厤宸ュ叿鏍忎笌鍒楄〃娓叉煋
        if (!searchInput || !sortSelect || !scrollElement) {
            showMessage(this.i18n.mobileLayoutFailed, MESSAGE_DEFAULT_MS, "error");
            dialog.destroy();
            return;
        }
        // 先装配列表拿到 renderMobileList，再绑定工具栏（排序切换复用装配期 renderMobileList）；
        // 列表首渲染只依赖 sortSelect 值，不依赖工具栏绑定，对调安全
        sortSelect.value = settings.sortBy;
        const {renderMobileList} = this.renderMobileSwitcherList(dialog, scrollElement, sortSelect, settings);
        const refreshMobileSurface = () => {
            renderMobileList();
            if (searchInput.value.trim() !== "" || hasDocSearchFilter.call(this, scrollElement)) {
                this.applySearch(scrollElement, searchInput, closeOverlay);
            }
            this.renderQuickActions(dialog.element, "mobile", searchInput, closeOverlay);
        };
        unregisterRefresh = this.registerSwitcherRefresh(refreshMobileSurface);
        disposeMobileToolbar = bindMobileSwitcherToolbarActions.call(this, dialog, searchInput, sortSelect, scrollElement, closeOverlay, renderMobileList);
        disposeHistoryDropdown = this.setupOpenHistoryDropdown(dialog.element.querySelector<HTMLElement>(".sw__history-dd"), closeOverlay);
        this.renderQuickActions(dialog.element, "mobile", searchInput, closeOverlay);
        rendered = true;

        // 把 FAB 关闭时的 FAB 恢复优先级插在 destroy 之后；保证打开收藏弹窗关闭后会回到列表
        dialog.element.querySelector(".sw__mobile-fav-btn")?.addEventListener("click", () => {
            this.showMobileFavSheet(dialog, closeOverlay, () => renderMobileList());
        });
        // 手机端不自动聚焦搜索框：避免一打开就弹出输入法，需要搜索时点击输入框
    }

    // 构造手机端切换器 Dialog（极简：搜索 + 排序 + 收藏 + 日记 + 设置 + 滚动区）

export function bindMobileSwitcherToolbarActions(this: MobileSwitcherUiHost, 
        dialog: Dialog,
        searchInput: HTMLInputElement,
        sortSelect: HTMLSelectElement,
        scrollElement: HTMLDivElement,
        closeOverlay: () => void,
        renderMobileList: () => void,
    ): () => void {
        const disposeSearchFilter = bindDocSearchFilter.call(this, dialog.element, scrollElement, searchInput, closeOverlay);
        let activeSortOverlay: HTMLElement | null = null;
        const closeSortOverlay = () => {
            activeSortOverlay?.remove();
            activeSortOverlay = null;
        };
        const onDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !activeSortOverlay) return;
            event.preventDefault();
            event.stopPropagation();
            closeSortOverlay();
        };
        document.addEventListener("keydown", onDocumentKeyDown, true);
        // 隐藏 FAB 推迟到按钮 click 处是因为 openSetting 可能也关闭原 dialog
        dialog.element.querySelector(".sw__settings-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.openSetting();
        });
        dialog.element.querySelector(".sw__mobile-close-btn")?.addEventListener("click", () => dialog.destroy());
        // 顶栏日记按钮：打开/新建当日日记（关闭弹窗并恢复 FAB，未设默认日记本时首次点击弹出选择）
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
            // 显式尺寸兜底：与 buildMobileSwitcherHtml 同因（样式未就绪时裸 svg 会退回 300×150）
            sortButton.innerHTML = '<svg width="18" height="18"><use xlink:href="#iconSort"></use></svg>';
            sortButton.title = label;
            sortButton.setAttribute("aria-label", `${this.i18n.setSortBy}: ${label}`);
        };
        updateSortButton();
        sortButton?.addEventListener("click", () => {
            closeSortOverlay();
            const overlay = document.createElement("div");
            overlay.className = "sw__mobile-sort-overlay";
            // WebView 里的思源 Dialog 可能建立新的 stacking context，内联层级作为最后一道兜底。
            overlay.style.position = "fixed";
            overlay.style.inset = "0";
            overlay.style.zIndex = "2147483647";
            const sheet = document.createElement("div");
            sheet.className = "sw__mobile-sort-sheet";
            sheet.setAttribute("role", "dialog");
            sheet.setAttribute("aria-modal", "true");
            sheet.innerHTML = `<div class="sw__mobile-sheet-handle"></div><div class="sw__mobile-sheet-title">${this.i18n.setSortBy}</div>`;
            const list = document.createElement("div");
            list.className = "sw__mobile-sort-list";
            list.setAttribute("role", "menu");
            list.setAttribute("aria-label", this.i18n.setSortBy);
            // 分组方式区：与桌面一体化菜单同语义（分组在前，组内排序在后）
            const groupTitle = document.createElement("div");
            groupTitle.className = "sw__mobile-sheet-section";
            groupTitle.textContent = this.i18n.groupModeTitle;
            sheet.appendChild(groupTitle);
            const groupList = document.createElement("div");
            groupList.className = "sw__mobile-sort-list";
            groupList.setAttribute("role", "menu");
            groupList.setAttribute("aria-label", this.i18n.groupModeTitle);
            const groupOptions: Array<{value: TabGroupMode, label: string}> = [
                {value: "notebook", label: this.i18n.groupNotebook},
                {value: "favorites", label: this.i18n.groupFavorites},
                {value: "createdMonth", label: this.i18n.groupCreatedMonth},
                {value: "none", label: this.i18n.groupNone},
            ];
            const currentGroup = this.getSettings().groupBy;
            groupOptions.forEach(({value, label}) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sw__mobile-sort-option";
                item.setAttribute("role", "menuitemradio");
                item.setAttribute("aria-checked", String(value === currentGroup));
                item.innerHTML = '<span>' + label + '</span>' + (value === currentGroup ? '<svg><use xlink:href="#iconCheck"></use></svg>' : '');
                item.addEventListener("click", () => {
                    this.updateSettings({groupBy: value});
                    closeSortOverlay();
                    renderMobileList();
                    const searchEl = dialog.element.querySelector<HTMLInputElement>(".sw__search");
                    if (searchEl) {
                        searchEl.value = "";
                        this.applySearch(scrollElement, searchEl, closeOverlay);
                    }
                });
                groupList.appendChild(item);
            });
            sheet.appendChild(groupList);
            const sortTitle = document.createElement("div");
            sortTitle.className = "sw__mobile-sheet-section";
            sortTitle.textContent = this.i18n.groupSortTitle;
            sheet.appendChild(sortTitle);
            Object.entries(sortLabels).forEach(([value, label]) => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "sw__mobile-sort-option";
                item.setAttribute("role", "menuitemradio");
                item.tabIndex = value === sortSelect.value ? 0 : -1;
                item.setAttribute("aria-checked", String(value === sortSelect.value));
                item.innerHTML = `<span>${label}</span>${value === sortSelect.value ? '<svg><use xlink:href="#iconCheck"></use></svg>' : ""}`;
                item.addEventListener("click", () => {
                    sortSelect.value = value;
                    closeSortOverlay();
                    sortSelect.dispatchEvent(new Event("change"));
                });
                item.addEventListener("keydown", (event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    const options = Array.from(list.querySelectorAll<HTMLButtonElement>(".sw__mobile-sort-option"));
                    const index = options.indexOf(item);
                    const next = options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
                    options.forEach((option) => option.tabIndex = option === next ? 0 : -1);
                    next.focus();
                });
                list.appendChild(item);
            });
            sheet.appendChild(list);
            overlay.appendChild(sheet);
            document.body.appendChild(overlay);
            activeSortOverlay = overlay;
            overlay.addEventListener("click", (event) => {
                if (event.target === overlay) closeSortOverlay();
            });
            // Android back/Escape should close only the transient sort sheet;
            // do not leave a body-level portal intercepting later taps.
            overlay.addEventListener("keydown", (event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                closeSortOverlay();
            });
            overlay.tabIndex = -1;
            this.scheduleAnimationFrame(() => { if (overlay.isConnected) overlay.focus({preventScroll: true}); });
            this.scheduleAnimationFrame(() => { if (sheet.isConnected) sheet.classList.add("sw__mobile-sort-sheet--open"); });
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
            // 排序切换：复用装配期 renderMobileList（重读最新列表 + 共享 updatedMap），再清搜索词重过滤
            renderMobileList();
            searchInput.value = "";
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });
        this.bindSearchInputComposition(searchInput, () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });
        return () => {
            disposeSearchFilter();
            document.removeEventListener("keydown", onDocumentKeyDown, true);
            closeSortOverlay();
        };
    }

    // 装配手机端列表渲染：返回 renderMobileList 函数以便收藏弹窗的 onTabsChanged 回调触发刷新

export function renderMobileList(this: MobileSwitcherUiHost, scrollElement: HTMLElement, tabs: Tab[], activeTab: Tab | undefined,
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
        const ctx: ITabGroupRenderCtx = {reusable, activeTabId, pinned, favorites, mru, settings, opts};
        const all: IGroupedTab[] = [];
        const groupMode = settings.groupBy;

        const renderMobileNamedGroup = (label: string, icon: string, key: string, count: number, ordered: IGroupedTab[]) => {
            const collapsed = this.groupCollapseState.has(key);
            const groupEl = document.createElement("div");
            groupEl.className = "sw__group sw__group--named" + (collapsed ? " sw__group--collapsed" : "");
            const header = document.createElement("button");
            header.type = "button";
            header.className = "sw__group-header";
            header.setAttribute("aria-expanded", collapsed ? "false" : "true");
            header.innerHTML = '<svg class="sw__group-chevron"><use xlink:href="#' + (collapsed ? "iconRight" : "iconDown") + '"></use></svg>'
                + '<svg class="sw__group-icon"><use xlink:href="#' + (icon || "iconFile") + '"></use></svg>'
                + '<span class="sw__group-title"></span>'
                + '<span class="sw__group-count">' + count + '</span>';
            header.querySelector<HTMLElement>(".sw__group-title")!.textContent = label;
            header.addEventListener("click", () => {
                const nextCollapsed = !this.groupCollapseState.has(key);
                if (nextCollapsed) this.groupCollapseState.add(key); else this.groupCollapseState.delete(key);
                groupEl.classList.toggle("sw__group--collapsed", nextCollapsed);
                header.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
                header.querySelector<SVGUseElement>(".sw__group-chevron use")?.setAttribute("xlink:href", "#" + (nextCollapsed ? "iconRight" : "iconDown"));
            });
            groupEl.appendChild(header);
            const groupGrid = this.buildMobileGroupGrid(settings);
            this.renderMobileCardsInGroup(groupGrid, ordered, ctx).forEach((item) => all.push(item));
            groupEl.appendChild(groupGrid);
            scrollElement.appendChild(groupEl);
        };

        if (groupMode === "none") {
            const items: IGroupedTab[] = tabs.map((tab) => ({tab}));
            const ordered = this.sortGroupItems(items, sortBy, mru, pinned, updatedMap);
            renderMobileNamedGroup("", "", "all", ordered.length, ordered);
        } else {
            const favoriteGroupByKey = new Map<string, string>();
            this.getFavorites().forEach((fav) => favoriteGroupByKey.set(fav.key, fav.group || ""));
            const notebookMap = new Map((this.notebookListCache || []).map((nb) => [nb.id, nb.name]));
            const defs = groupTabsByMode(tabs, groupMode, {
                pinKeyOf: (tab: Tab) => this.pinKeyOf(tab),
                isFavorite: (key: string) => favorites.has(key),
                favoriteGroupOf: (key: string) => favoriteGroupByKey.get(key) || "",
                favoriteGroupOrder: this.getFavGroupRegistry(),
                notebookIdOf: (tab: Tab) => resolveSearchNotebookId(tab as unknown) || "",
                notebookNameOf: (id: string) => notebookMap.get(id) || "",
                notebookOrder: (this.notebookListCache || []).map((nb) => nb.id),
                createdOf: (key: string) => this.createdByIdCache[key] || "",
                labels: {
                    unknownNotebook: this.i18n.groupUnknownNotebook,
                    ungroupedFavorite: this.i18n.groupUngroupedFavorite,
                    unfavorited: this.i18n.groupUnfavorited,
                    unknownMonth: this.i18n.groupUnknownMonth,
                },
            });
            defs.forEach((def) => {
                const ordered = this.sortGroupItems(def.items.map((tab: Tab) => ({tab})), sortBy, mru, pinned, updatedMap);
                renderMobileNamedGroup(def.label, def.icon, def.key, ordered.length, ordered);
            });
            if (groupMode === "createdMonth" && tabs.some((tab) => {
                const rootId = this.rootIdOf(tab);
                return !!rootId && !(rootId in this.createdByIdCache);
            })) {
                void this.loadUpdatedMap(tabs).then(() => {
                    tabs.forEach((tab) => {
                        const rootId = this.rootIdOf(tab);
                        if (rootId && !(rootId in this.createdByIdCache)) this.createdByIdCache[rootId] = "";
                    });
                    if (scrollElement.isConnected) renderMobileList.call(this, scrollElement, tabs, activeTab, opts, sortBy, updatedMap);
                });
            } else if (groupMode === "notebook" && this.notebookListCache === null) {
                void this.loadNotebooks().then((notebooks) => {
                    this.notebookListCache = notebooks;
                    if (!scrollElement.isConnected || notebooks.length === 0) return;
                    renderMobileList.call(this, scrollElement, tabs, activeTab, opts, sortBy, updatedMap);
                });
            }
        }

        if (all.length === 0) {
            scrollElement.appendChild(this.buildEmptyState());
            return;
        }

        // 手机端缩略图：视口懒渲染 + 更保守的回源并发
        this.renderThumbnails(all, scrollElement, THUMB_BATCH_MOBILE);
    }

    // 构造手机端分组卡片网格：根据 settings.mobileColumns 决定单列/双列/自适应

export function openMobileGroupActions(this: MobileSwitcherUiHost, groupName: string, items: IFavoriteItem[], onChanged: () => void) {
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

        // 鍔ㄧ敾锛氫笅涓€甯ф粦鍏?
        this.scheduleAnimationFrame(() => {
            if (sheet.isConnected) sheet.classList.add("sw__mobile-sheet--open");
        });
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeSelf();
            }
        });
    }

    // ==================== 手机端悬浮按钮（FAB）与顶栏入口 ====================

