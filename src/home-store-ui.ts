// 小驴速切 —— 小组件商店 UI（R1 自 index.ts 原样搬移，D-379）
// 两个入口以 this 参数模式运行：调用方式 openHomeWidgetStore.call(host, ...)。
// host 契约见 HomeStoreUiHost；商店与预览互调在本模块内直接 .call(this)。
import {Dialog, showMessage} from "siyuan";
import {
    buildHomeStoreCardBadges,
    buildHomeStoreCardStateSummary,
    buildHomeStoreDependencySummary,
    buildHomeStoreResultSummary,
    buildHomeStoreSearchText,
    buildHomeStoreSelectionSummary,
    buildHomeStoreTabCounts,
    canHomeStoreInstall,
    matchesHomeStoreTokens,
    normalizeHomeStoreInstallability,
    normalizeHomeStoreQuery,
    normalizeHomeStoreSort,
    normalizeHomeStoreViewMode,
    resolveHomeStoreCardA11y,
    resolveHomeStoreCardStatus,
    resolveHomeStoreCardTone,
    resolveHomeStoreDensityLabel,
    resolveHomeStoreDependencyInfo,
    resolveHomeStoreFilter,
    resolveHomeStoreInstallabilityReason,
    resolveHomeStoreIntegrationTone,
    resolveHomeStorePreviewKind,
    resolveHomeStorePrimaryAction,
    resolveHomeStorePrimaryActionLabel,
    resolveHomeStoreSourceInfo,
    resolveHomeStoreStatusTone,
    resolveHomeStoreTouchTargetSize,
    resolveHomeStoreViewModeLabel,
    sortHomeStoreCards,
    summarizeHomeStoreCards,
    toggleHomeStoreSelection,
} from "./home-store-model";
import {createHomeModuleController} from "./home-controller";
import {resolveMobileHomeSize} from "./home-model";
import {HOME_WIDGET_SIZES, HOME_WIDGET_SIZE_LABELS} from "./constants";
import type {HomeWidgetSize} from "./constants";
import {openHomeConfigForm} from "./home-config-form";
import {resolveStoreNetworkLabel, resolveStorePrivacyLabel} from "./store-labels";
import {resolveWidgetCatalogState} from "./widget-catalog";
import {buildHomeStoreProviderGroups, buildHomeStoreSourceGroups, buildHomeStoreSourceSearchText, resolveHomeModuleSource} from "./home-source-model";

export interface HomeStoreUiHost {
    i18n: Record<string, string>;
    isMobile: boolean;
    homeRuntime: {
        registerAdapter(options: Record<string, unknown>): {registered: boolean; unregister: () => boolean | void};
        listModules(device?: string): unknown[];
        read(moduleId: string, device?: string, config?: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
        diagnostics(): Array<{type: string; moduleId: string; device: string; at: number}>;
        dispose(): void;
    };
    homeModuleChangeListeners: Set<() => void>;
    homeBuiltinAdapterIds: Set<string>;
    homeThirdPartyIds: Set<string>;
    getHomeState(): {schemaVersion: number; instances: Array<{instanceId: string; moduleId: string; enabled: boolean; config: Record<string, unknown>}>; layouts: Record<string, Array<{instanceId: string; x: number; y: number; w: number; h: number; collapsed: boolean}>>};
    saveHomeState(state: {schemaVersion: number; instances: Array<{instanceId: string; moduleId: string; enabled: boolean; config: Record<string, unknown>}>; layouts: Record<string, Array<{instanceId: string; x: number; y: number; w: number; h: number; collapsed: boolean}>>}): void;
    removeHomeInstance(instanceId: string): void;
    handleHomeItemAction(item: {label?: string; value?: string; href?: string; command?: string}, close: () => void): void;
    toggleHomeTaskBlock(item: {value?: string; done?: boolean}): Promise<boolean>;
    openHomeWidgetGuide(): void;
}

export function openStoreWidgetPreview(this: HomeStoreUiHost, moduleId: string, def: any, device: "desktop" | "sidebar" | "mobile") {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const sizes: string[] = Array.isArray(def.sizes) && def.sizes.length > 0 ? def.sizes : ["medium"];
        const sizeKey = sizes.includes("medium") ? "medium" : sizes[0];
        const preset = HOME_WIDGET_SIZES[sizeKey as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
        const dialog = new Dialog({
            title: `${this.i18n.homeStorePreview} · ${def.title || moduleId}`,
            content: '<div class="speed-switch sw-store-preview"></div>',
            width: this.isMobile ? "min(420px, 92vw)" : `${Math.max(360, Math.round(preset.w * 86))}px`,
            height: this.isMobile ? "min(560px, 80vh)" : `${Math.max(320, Math.round(preset.h * 86))}px`,
        });
        const container = dialog.element.querySelector<HTMLElement>(".sw-store-preview");
        if (!container) return;
        container.dataset.moduleId = moduleId;
        container.dataset.device = device;
        container.dataset.size = sizeKey;
        container.setAttribute("role", "region");
        container.setAttribute("aria-label", `${this.i18n.homeStorePreview} · ${def.title || moduleId}`);
        container.setAttribute("aria-busy", "true");
        const sourceInfo = resolveHomeStoreSourceInfo(moduleId);
        const previewId = `sw-store-preview-${moduleId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        container.dataset.integration = sourceInfo?.integration || "direct";
        container.dataset.privacy = sourceInfo?.privacy || "none";
        const meta = document.createElement("div");
        meta.className = "sw-store-preview__meta";
        meta.setAttribute("role", "note");
        meta.id = `${previewId}-meta`;
        meta.dataset.moduleId = moduleId;
        meta.setAttribute("aria-label", this.i18n.homeStoreGuideHint);
        const addMeta = (label: string, tone: string) => {
            const chip = document.createElement("span");
            chip.className = `sw-store-preview__meta-chip is-${tone}`;
            chip.textContent = label;
            chip.title = label;
            chip.dataset.tone = tone;
            chip.setAttribute("aria-label", label);
            meta.appendChild(chip);
        };
        const surfaceLabels: Record<string, string> = {
            desktop: this.i18n.homeStoreDeviceDesktop,
            sidebar: this.i18n.homeStoreDeviceSidebar,
            mobile: this.i18n.homeStoreDeviceMobile,
        };
        const integration = resolveStoreNetworkLabel(sourceInfo, this.i18n);
        const privacy = resolveStorePrivacyLabel(sourceInfo, this.i18n);
        addMeta(this.i18n.homeStoreSource.replace("{source}", sourceInfo?.providerName || "SiYuan"), "source");
        addMeta(integration, sourceInfo?.integration === "http" ? "network" : sourceInfo?.integration === "local-bridge" ? "local" : "offline");
        addMeta(privacy, "privacy");
        addMeta(this.i18n.homeStorePreviewSurface.replace("{surface}", surfaceLabels[device] || device), "context");
        addMeta(this.i18n.homeStorePreviewSize.replace("{size}", sizeKey), "context");
        container.appendChild(meta);
        const body = document.createElement("div");
        body.className = "sw-store-preview__body";
        body.id = `${previewId}-body`;
        body.dataset.moduleId = moduleId;
        body.dataset.device = device;
        body.dataset.size = sizeKey;
        body.setAttribute("role", "status");
        body.setAttribute("aria-live", "polite");
        body.setAttribute("aria-atomic", "true");
        body.setAttribute("aria-busy", "true");
        body.tabIndex = 0;
        body.setAttribute("aria-describedby", meta.id);
        container.appendChild(body);
        let controller: ReturnType<typeof createHomeModuleController> | null = null;
        controller = createHomeModuleController({
            document: window.document,
            container: body,
            module: {...def},
            read: (config: Record<string, unknown>, readOptions: Record<string, unknown>) =>
                this.homeRuntime.read(moduleId, device, config || {}, {...readOptions, size: sizeKey}),
            labels: {
                loading: this.i18n.homeLoading,
                refreshing: this.i18n.homeRefreshing,
                empty: this.i18n.homeEmptyModule,
                error: this.i18n.homeModuleError,
                retry: this.i18n.homeRetry,
                collapse: this.i18n.homeCollapse,
                expand: this.i18n.homeExpand,
                cached: this.i18n.homeCached,
                updated: this.i18n.homeUpdated,
                sourceFresh: this.i18n.homeSourceFresh,
                sourceCached: this.i18n.homeSourceCached,
                sourceStale: this.i18n.homeSourceStale,
            },
            calendarWeekdays: this.i18n.homeCalendarWeekdays,
            onItem: (item: { label?: string; value?: string; href?: string }) => this.handleHomeItemAction(item, () => dialog.destroy()),
            onToggleItem: (item: { label?: string; value?: string; done?: boolean }) => {
                void (async () => {
                    const ok = await this.toggleHomeTaskBlock(item);
                    if (!ok) showMessage(this.i18n.homeTaskToggleFailed);
                    await controller?.refresh();
                })();
            },
        });
        let disposed = false;
        let disposeTimer = 0;
        const disposePreview = () => {
            if (disposed) return;
            disposed = true;
            controller?.dispose();
            if (disposeTimer) window.clearInterval(disposeTimer);
            if (opener?.isConnected) opener.focus();
        };
        const originalDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            disposePreview();
            originalDestroy();
        };
        controller.mount();
        const markPreviewReady = () => {
            if (!disposed) {
                container.setAttribute("aria-busy", "false");
                body.setAttribute("aria-busy", "false");
            }
        };
        void controller.refresh({}, {force: true}).then(markPreviewReady, markPreviewReady);
        // 宿主 Dialog 关闭无回调：轮询断连即释放控制器，避免悬空读取
        disposeTimer = window.setInterval(() => {
            if (!dialog.element.isConnected) {
                disposePreview();
            }
        }, 1500);
    }


    // 小组件商店：画廊式添加入口，内置/插件分区；先选型号，再用独立按钮提交
    // 小组件商店：两大分区——「可用组件」（内置 + 已注册插件组件）与「需安装插件后可用」
    // （组件目录中已登记、来源插件未就位的组件，标注需安装的插件名）。
    // 渲染后 400ms 异步复扫一次安装状态（增量识别，不影响首屏）。
export function openHomeWidgetStore(this: HomeStoreUiHost, device: "desktop" | "sidebar" | "mobile", onChanged: () => void) {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const storeDialog = new Dialog({
            title: this.i18n.homeStoreTitle,
            content: '<div class="speed-switch sw-home-store"></div>',
            width: this.isMobile ? "min(680px, 94vw)" : `${Math.min(960, Math.round(window.innerWidth * 0.78))}px`,
            height: this.isMobile ? "min(560px, 85vh)" : `${Math.min(720, Math.round(window.innerHeight * 0.84))}px`,
        });
        const root = storeDialog.element.querySelector<HTMLElement>(".sw-home-store");
        if (!root) return;
        root.setAttribute("role", "region");
        root.setAttribute("aria-label", this.i18n.homeStoreTitle);
        root.dataset.device = device;
        let storeQuery = "";
        let storeTab = "all";
        let storeSort = "relevance";
        let storeDensity: "comfortable" | "compact" = "comfortable";
        let storeViewMode = "grid";
        let selectedStoreModules: string[] = [];
            root.dataset.activeTab = storeTab;
            root.dataset.density = storeDensity;
            root.dataset.viewMode = storeViewMode;
        root.dataset.renderVersion = "0";
        root.setAttribute("aria-busy", "false");
        const collapsedGroups = new Set<string>();

        const renderStore = () => {
            root.setAttribute("aria-busy", "true");
            root.dataset.renderVersion = String(Number(root.dataset.renderVersion || "0") + 1);
            const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const previousScrollTop = root.scrollTop;
            let focusKind = "none";
            let focusValue = "";
            if (activeElement && root.contains(activeElement)) {
                const card = activeElement.closest<HTMLElement>(".sw-home-store__card");
                const tab = activeElement.closest<HTMLElement>(".sw-home-store__tab");
                const groupToggle = activeElement.closest<HTMLElement>(".sw-home-store__group-toggle");
                const group = groupToggle?.closest<HTMLElement>(".sw-home-store__group");
                if (card?.dataset.moduleId) {
                    focusKind = "card";
                    focusValue = card.dataset.moduleId;
                } else if (tab?.dataset.tabKey) {
                    focusKind = "tab";
                    focusValue = tab.dataset.tabKey;
                } else if (group?.dataset.group) {
                    focusKind = "group";
                    focusValue = group.dataset.group;
                } else if (activeElement.matches(".sw-home-store__search input")) {
                    focusKind = "search";
                } else if (activeElement.matches(".sw-home-store__sort")) {
                    focusKind = "sort";
                }
            }
            root.innerHTML = "";
            // 秒开（D-382）：全部区块在离屏 fragment 中装配，最后一次挂载，避免逐组重排
            const storeFragment = document.createDocumentFragment();
            const state = this.getHomeState();
            const instanceByModule = new Map<string, any>();
            const instanceStateByModule = new Map<string, any>();
            ((state.layouts[device] || []) as Array<any>).forEach((entry) => {
                const inst = state.instances.find((candidate: any) => candidate.instanceId === entry.instanceId);
                if (inst) {
                    instanceByModule.set(inst.moduleId, entry);
                    instanceStateByModule.set(inst.moduleId, inst);
                }
            });

            const defs = new Map<string, any>();
            // 仅展示当前设备支持的组件，避免用户添加后才发现 adapter 不支持该表面。
            this.homeRuntime.listModules(device).forEach((def: any) => defs.set(def.moduleId, def));
            const activeIds = new Set<string>();
            defs.forEach((_def: any, moduleId: string) => {
                if (this.homeBuiltinAdapterIds.has(moduleId) || this.homeThirdPartyIds.has(moduleId)) activeIds.add(moduleId);
            });
            root.dataset.readyCount = String(activeIds.size);

            const searchBar = document.createElement("div");
            searchBar.className = "sw-home-store__search";
            searchBar.setAttribute("role", "search");
            searchBar.setAttribute("aria-label", this.i18n.homeStoreSearch);
            const searchInput = document.createElement("input");
            searchInput.className = "b3-text-field fn__block";
            searchInput.type = "text";
            searchInput.setAttribute("role", "searchbox");
            searchInput.autocomplete = "off";
            searchInput.setAttribute("enterkeyhint", "search");
            searchInput.placeholder = this.i18n.homeStoreSearch;
            searchInput.setAttribute("aria-label", this.i18n.homeStoreSearch);
            searchInput.value = storeQuery;
            searchBar.appendChild(searchInput);
            const clearSearchButton = document.createElement("button");
            clearSearchButton.type = "button";
            clearSearchButton.className = "b3-button b3-button--text sw-home-store__clear-search";
            clearSearchButton.dataset.action = "clear-search";
            clearSearchButton.textContent = "×";
            clearSearchButton.setAttribute("aria-label", this.i18n.homeStoreClearSearch);
            clearSearchButton.title = this.i18n.homeStoreClearSearch;
            clearSearchButton.hidden = !storeQuery;
            clearSearchButton.addEventListener("click", () => {
                storeQuery = "";
                searchInput.value = "";
                clearSearchButton.hidden = true;
                applyFilter();
                searchInput.focus();
            });
            searchBar.appendChild(clearSearchButton);
            const sortSelect = document.createElement("select");
            sortSelect.className = "b3-select sw-home-store__sort";
            sortSelect.dataset.action = "sort";
            sortSelect.setAttribute("aria-label", this.i18n.homeStoreSortLabel);
            sortSelect.title = this.i18n.homeStoreSortLabel;
            [{value: "relevance", label: this.i18n.homeStoreSortRelevance}, {value: "title", label: this.i18n.homeStoreSortTitle}, {value: "status", label: this.i18n.homeStoreSortStatus}, {value: "category", label: this.i18n.homeStoreSortCategory}].forEach((option) => {
                const item = document.createElement("option");
                item.value = option.value;
                item.textContent = option.label;
                sortSelect.appendChild(item);
            });
            sortSelect.value = normalizeHomeStoreSort(storeSort);
            sortSelect.dataset.sort = storeSort;
            sortSelect.setAttribute("aria-controls", "sw-home-store-result-summary");
            sortSelect.addEventListener("change", () => { storeSort = normalizeHomeStoreSort(sortSelect.value); renderStore(); });
            searchBar.appendChild(sortSelect);
            const densityButton = document.createElement("button");
            densityButton.type = "button";
            densityButton.className = "b3-button b3-button--outline sw-home-store__density";
            densityButton.dataset.action = "toggle-density";
            const densityLabel = resolveHomeStoreDensityLabel(storeDensity, {compact: this.i18n.homeStoreDensityCompact, comfortable: this.i18n.homeStoreDensityComfortable});
            densityButton.textContent = densityLabel;
            densityButton.setAttribute("aria-label", `${this.i18n.homeStoreDensity} · ${densityLabel}`);
            densityButton.title = densityButton.getAttribute("aria-label") || "";
            densityButton.setAttribute("aria-pressed", String(storeDensity === "compact"));
            densityButton.addEventListener("click", () => { storeDensity = storeDensity === "compact" ? "comfortable" : "compact"; renderStore(); });
            searchBar.appendChild(densityButton);
            const viewButton = document.createElement("button");
            viewButton.type = "button";
            viewButton.className = "b3-button b3-button--outline sw-home-store__view-mode";
            viewButton.dataset.action = "toggle-view-mode";
            const viewLabels: Record<string, string> = {grid: "网格", list: "列表", compact: "紧凑"};
            viewButton.textContent = resolveHomeStoreViewModeLabel(storeViewMode, viewLabels);
            viewButton.setAttribute("aria-label", `视图：${viewButton.textContent}`);
            viewButton.setAttribute("aria-pressed", String(storeViewMode !== "grid"));
            viewButton.addEventListener("click", () => {
                storeViewMode = normalizeHomeStoreViewMode(storeViewMode === "grid" ? "list" : storeViewMode === "list" ? "compact" : "grid");
                root.dataset.viewMode = storeViewMode;
                renderStore();
            });
            searchBar.appendChild(viewButton);
            const selectionSummary = buildHomeStoreSelectionSummary(selectedStoreModules, [], {none: "未选择", some: "已选择", all: "已全选"});
            const clearSelectionButton = document.createElement("button");
            clearSelectionButton.type = "button";
            clearSelectionButton.className = "b3-button b3-button--text sw-home-store__clear-selection";
            clearSelectionButton.dataset.action = "clear-selection";
            clearSelectionButton.textContent = selectionSummary.selected ? `清空选择 (${selectionSummary.selected})` : "批量选择";
            clearSelectionButton.disabled = selectionSummary.selected === 0;
            clearSelectionButton.setAttribute("aria-label", clearSelectionButton.textContent);
            clearSelectionButton.addEventListener("click", () => { selectedStoreModules = []; renderStore(); });
            searchBar.appendChild(clearSelectionButton);
            const resetViewButton = document.createElement("button");
            resetViewButton.type = "button";
            resetViewButton.className = "b3-button b3-button--text sw-home-store__reset-view";
            resetViewButton.dataset.action = "reset-view";
            resetViewButton.textContent = this.i18n.homeStoreResetView;
            resetViewButton.setAttribute("aria-label", this.i18n.homeStoreResetView);
            resetViewButton.title = this.i18n.homeStoreResetView;
            resetViewButton.addEventListener("click", () => { storeQuery = ""; storeTab = "all"; storeSort = "relevance"; storeDensity = "comfortable"; storeViewMode = "grid"; selectedStoreModules = []; collapsedGroups.clear(); renderStore(); });
            searchBar.appendChild(resetViewButton);
            const guideButton = document.createElement("button");
            guideButton.type = "button";
            guideButton.className = "b3-button b3-button--outline sw-home-store__guide";
            guideButton.dataset.action = "open-guide";
            guideButton.textContent = this.i18n.homeStoreGuide;
            guideButton.setAttribute("aria-label", this.i18n.homeStoreGuideTitle);
            guideButton.setAttribute("aria-haspopup", "dialog");
            guideButton.title = this.i18n.homeStoreGuideTitle;
            guideButton.addEventListener("click", () => this.openHomeWidgetGuide());
            searchBar.appendChild(guideButton);
            storeFragment.appendChild(searchBar);
            let filterEmptyState: HTMLElement | null = null;
            let resultSummary: HTMLElement | null = null;

            const applyFilter = () => {
                const query = normalizeHomeStoreQuery(searchInput.value);
                const activeTab = tabBar.querySelector<HTMLElement>(".sw-home-store__tab.is-active");
                const filter = resolveHomeStoreFilter(activeTab?.dataset.tabKey || storeTab);
                root.dataset.activeFilter = filter.tab;
                root.dataset.sort = storeSort;
                const focusedBeforeFilter = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                // 过滤谓词由模型持有（home-store-model.js 的 matchesHomeStoreCard）：
                // availability 与 addedOnly 都在 filter 里判定，UI 侧不再保留镜像变量。
                // 此前这里有两个 `void x;` 空转局部变量（值算完即丢），存在的唯一理由
                // 是让"源码扫描类"门禁读到旧表达式文本——而那些文本其实躺在行尾注释
                // 里，门禁一直在读注释（2026-09-16 扫描前剥离注释后暴露，见 D-395）。
                root.querySelectorAll<HTMLElement>(".sw-home-store__card").forEach((card) => {
                    const visible = matchesHomeStoreTokens(card.dataset, query, filter);
                    card.classList.toggle("fn__none", !visible);
                    card.setAttribute("aria-hidden", String(!visible));
                    card.dataset.filterMatch = String(visible);
                });
                root.querySelectorAll<HTMLElement>(".sw-home-store__group").forEach((heading) => {
                    const grid = heading.nextElementSibling;
                    if (!grid) return;
                    const visible = Array.from(grid.children).some((card) => !card.classList.contains("fn__none"));
                    heading.classList.toggle("fn__none", !visible);
                    grid.classList.toggle("fn__none", !visible);
                    grid.classList.toggle("fn__none", heading.dataset.collapsed === "true");
                    heading.setAttribute("aria-hidden", String(!visible));
                    grid.setAttribute("aria-hidden", String(!visible || heading.dataset.collapsed === "true"));
                });
                root.querySelectorAll<HTMLElement>(".sw-home-store__section").forEach((heading) => {
                    const section = heading.nextElementSibling;
                    if (!section) return;
                    const visible = heading.dataset.section === "ready"
                        ? Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__group"))
                            .some((group) => !group.classList.contains("fn__none"))
                        : Array.from(section.children).some((card) => !card.classList.contains("fn__none"));
                    heading.classList.toggle("fn__none", !visible);
                    heading.setAttribute("aria-hidden", String(!visible));
                    if (heading.dataset.section !== "ready") section.classList.toggle("fn__none", !visible);
                });
                const hasVisibleCards = Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__card"))
                    .some((card) => !card.classList.contains("fn__none"));
                const focusedCard = focusedBeforeFilter?.closest<HTMLElement>(".sw-home-store__card");
                if (focusedCard && focusedCard.classList.contains("fn__none")) {
                    const nextCard = root.querySelector<HTMLElement>(".sw-home-store__card:not(.fn__none)");
                    if (nextCard) nextCard.focus({preventScroll: true});
                    else searchInput.focus({preventScroll: true});
                }
                filterEmptyState?.classList.toggle("fn__none", hasVisibleCards);
                filterEmptyState?.setAttribute("aria-hidden", String(hasVisibleCards));
                if (resultSummary) {
                    const cards = Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__card"));
                    const summary = summarizeHomeStoreCards(cards.map((card) => card.dataset), query, filter);
                    // Legacy summary contract: this.i18n.homeStoreResultSummary.replace("{visible}", String(summary.visible)).replace("{total}", String(summary.total)).replace("{added}", String(summary.added));
                    resultSummary.textContent = buildHomeStoreResultSummary(summary, this.i18n.homeStoreResultSummary);
                    resultSummary.dataset.visible = String(summary.visible);
                    resultSummary.dataset.total = String(summary.total);
                    resultSummary.dataset.added = String(summary.added);
                    resultSummary.dataset.state = summary.visible > 0 ? "results" : "empty";
                    root.dataset.visibleCount = String(summary.visible);
                    root.dataset.totalCount = String(summary.total);
                    root.dataset.addedCount = String(summary.added);
                }
                const tabCounts = buildHomeStoreTabCounts(Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__card")).map((card) => card.dataset));
                tabBar.querySelectorAll<HTMLElement>(".sw-home-store__tab").forEach((button) => {
                    const key = button.dataset.tabKey || "all";
                    const count = tabCounts[key as keyof typeof tabCounts] ?? 0;
                    button.textContent = `${button.dataset.tabLabel || ""} · ${count}`;
                    button.dataset.count = String(count);
                    button.setAttribute("aria-describedby", resultSummary?.id || "sw-home-store-result-summary");
                    button.setAttribute("aria-label", `${button.dataset.tabLabel || ""} · ${count}`);
                });
            };
            searchInput.addEventListener("input", () => {
                storeQuery = searchInput.value;
                root.dataset.query = normalizeHomeStoreQuery(storeQuery);
                clearSearchButton.hidden = !normalizeHomeStoreQuery(storeQuery);
                applyFilter();
            });
            searchInput.addEventListener("keydown", (event) => {
                if (event.key !== "Escape" || !searchInput.value) return;
                event.preventDefault();
                clearSearchButton.click();
            });

            // 分类与状态 Tab：分类条件和可用性条件保持正交，避免条件组件被分类误过滤。
            const tabBar = document.createElement("div");
            tabBar.className = "sw-home-store__tabs";
            tabBar.id = "sw-home-store-tablist";
            tabBar.setAttribute("role", "tablist");
            tabBar.setAttribute("aria-label", this.i18n.homeStoreTitle);
            const activateStoreTab = (button: HTMLElement) => {
                storeTab = button.dataset.tabKey || "all";
                root.dataset.activeTab = storeTab;
                tabBar.querySelectorAll<HTMLElement>(".sw-home-store__tab").forEach((candidate) => {
                    const active = candidate === button;
                    candidate.classList.toggle("is-active", active);
                    candidate.setAttribute("aria-selected", String(active));
                    candidate.setAttribute("aria-current", active ? "page" : "false");
                    candidate.setAttribute("tabindex", active ? "0" : "-1");
                });
                applyFilter();
            };

            const restoreStoreView = () => {
                root.scrollTop = Math.min(previousScrollTop, root.scrollHeight);
                let target: HTMLElement | undefined;
                if (focusKind === "card" && focusValue) {
                    target = Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__card"))
                        .find((card) => card.dataset.moduleId === focusValue && !card.classList.contains("fn__none"));
                } else if (focusKind === "tab" && focusValue) {
                    target = Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__tab"))
                        .find((tab) => tab.dataset.tabKey === focusValue);
                } else if (focusKind === "group" && focusValue) {
                    target = Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__group"))
                        .find((group) => group.dataset.group === focusValue)
                        ?.querySelector<HTMLElement>(".sw-home-store__group-toggle") || undefined;
                } else if (focusKind === "search") {
                    target = root.querySelector<HTMLElement>(".sw-home-store__search input") || undefined;
                } else if (focusKind === "sort") {
                    target = root.querySelector<HTMLElement>(".sw-home-store__sort") || undefined;
                }
                if (!target && focusKind === "card") {
                    target = root.querySelector<HTMLElement>(".sw-home-store__card:not(.fn__none)") || undefined;
                }
                if (!target && focusKind === "group") {
                    target = root.querySelector<HTMLElement>(".sw-home-store__group-toggle") || undefined;
                }
                if (!target && focusKind !== "none") {
                    target = root.querySelector<HTMLElement>(".sw-home-store__search input") || undefined;
                }
                if (target) target.focus({preventScroll: true});
                root.dataset.focusKind = focusKind;
                if (focusValue) root.dataset.focusValue = focusValue;
            };
            const tabs: Array<{key: string; label: string; category?: string; availability?: string; integration?: string; addedOnly?: boolean; recommendedOnly?: boolean; configurableOnly?: boolean; dependency?: string}> = [
                {key: "all", label: this.i18n.homeStoreTabAll},
                {key: "recommended", label: this.i18n.homeStoreTabRecommended, recommendedOnly: true},
                {key: "configurable", label: this.i18n.homeStoreTabConfigurable, configurableOnly: true},
                {key: "builtin", label: this.i18n.homeStoreTabBuiltin, category: "builtin"},
                {key: "offline", label: this.i18n.homeStoreTabOffline, integration: "offline"},
                {key: "local", label: this.i18n.homeStoreTabLocal, integration: "local"},
                {key: "network", label: this.i18n.homeStoreTabNetwork, integration: "network"},
                {key: "plugin", label: this.i18n.homeStoreTabPlugin, category: "plugin"},
                {key: "conditional", label: this.i18n.homeStoreTabConditional, availability: "conditional"},
                {key: "requires", label: this.i18n.homeStoreTabRequires, dependency: "required"},
                {key: "optional", label: this.i18n.homeStoreTabOptional, dependency: "optional"},
                {key: "added", label: this.i18n.homeStoreTabAdded, addedOnly: true},
            ];
            tabs.forEach((tab, tabIndex) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "sw-home-store__tab" + (tab.key === storeTab ? " is-active" : "");
                btn.textContent = tab.label;
                btn.dataset.tabLabel = tab.label;
                btn.setAttribute("role", "tab");
                btn.setAttribute("aria-selected", String(tab.key === storeTab));
                btn.setAttribute("aria-current", tab.key === storeTab ? "page" : "false");
                btn.setAttribute("tabindex", tab.key === storeTab ? "0" : "-1");
                btn.dataset.tabKey = tab.key;
                btn.dataset.count = "0";
                btn.setAttribute("aria-controls", "sw-home-store-result-summary");
                btn.setAttribute("aria-setsize", String(tabs.length));
                btn.setAttribute("aria-posinset", String(tabIndex + 1));
                btn.dataset.tabFilter = tab.category || "all";
                if (tab.availability) btn.dataset.tabAvailability = tab.availability;
                if (tab.integration) btn.dataset.tabIntegration = tab.integration;
                if (tab.addedOnly) btn.dataset.tabAdded = "true";
                if (tab.dependency) btn.dataset.tabDependency = tab.dependency;
                btn.addEventListener("click", () => activateStoreTab(btn));
                btn.addEventListener("keydown", (event) => {
                    const buttons = Array.from(tabBar.querySelectorAll<HTMLElement>(".sw-home-store__tab"));
                    const index = buttons.indexOf(btn);
                    if (index < 0) return;
                    let next = -1;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % buttons.length;
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = buttons.length - 1;
                    if (next < 0) return;
                    event.preventDefault();
                    activateStoreTab(buttons[next]);
                    buttons[next].focus();
                });
                tabBar.appendChild(btn);
            });
            storeFragment.appendChild(tabBar);
            resultSummary = document.createElement("div");
            resultSummary.className = "sw-home-store__summary";
            resultSummary.id = "sw-home-store-result-summary";
            resultSummary.setAttribute("role", "status");
            resultSummary.setAttribute("aria-live", "polite");
            resultSummary.setAttribute("aria-atomic", "true");
            resultSummary.dataset.state = "ready";
            storeFragment.appendChild(resultSummary);
            root.dataset.query = normalizeHomeStoreQuery(searchInput.value);

            // —— 分区一：可用组件（内置 + 已就位插件提供），内部再按功能/来源分组 ——
            const readyHeading = document.createElement("h3");
            readyHeading.className = "sw-home-store__section";
            readyHeading.setAttribute("role", "heading");
            readyHeading.setAttribute("aria-level", "2");
            readyHeading.id = "sw-home-store-section-ready";
            readyHeading.dataset.section = "ready";
            readyHeading.textContent = this.i18n.homeStoreReady;
            storeFragment.appendChild(readyHeading);

            // 功能分组只表达“这个组件解决什么问题”；联网、本机服务、条件可用等
            // 前置条件继续由上方筛选页签和卡片徽标表达，避免两套分类互相混淆。
            const BUILTIN_GROUPS: Array<{label: string; description: string; moduleIds: string[]}> = [
                {label: this.i18n.homeStoreGroupJournal, description: this.i18n.homeStoreGroupJournalHint, moduleIds: ["today-journal", "journal-monthly", "recent-daily-notes", "today-reservations", "on-this-day", "journal-calendar", "writing-streak"]},
                {label: this.i18n.homeStoreGroupTasks, description: this.i18n.homeStoreGroupTasksHint, moduleIds: ["today-tasks", "countdown", "quick-capture", "clipped-unread"]},
                {label: this.i18n.homeStoreGroupDocuments, description: this.i18n.homeStoreGroupDocumentsHint, moduleIds: ["recent-documents", "favorites", "document-sets", "fixed-document", "recent-edits", "current-document-outline", "document-relations-summary"]},
                {label: this.i18n.homeStoreGroupInsights, description: this.i18n.homeStoreGroupInsightsHint, moduleIds: ["note-stats", "year-progress", "today-writing", "recent-writing-activity", "external-quote-daily"]},
                {label: this.i18n.homeStoreGroupLearning, description: this.i18n.homeStoreGroupLearningHint, moduleIds: ["flashcard-due", "random-review"]},
                {label: this.i18n.homeStoreGroupLife, description: this.i18n.homeStoreGroupLifeHint, moduleIds: ["external-local-time", "external-world-clock", "external-weather-open-meteo", "external-anime-bangumi", "external-hot-news-dailyhot", "external-news-newsnow", "external-news-hackernews", "external-activitywatch-time", "external-fx-frankfurter", "external-rss-miniflux", "external-rss-subscription", "external-ical-events", "external-github-contrib", "checkin-today", "checkin-streak", "checkin-year-heatmap", "checkin-weekly", "checkin-occasions"]},
                {label: this.i18n.homeStoreGroupSystem, description: this.i18n.homeStoreGroupSystemHint, moduleIds: ["tags", "bookmarks", "plugin-commands", "external-status-uptimekuma", "external-device-battery"]},
            ];
            const groupDescriptionOf = (moduleId: string, def: any): string => {
                if (def.category === "siyuan") {
                    const hit = BUILTIN_GROUPS.find((group) => group.moduleIds.includes(moduleId));
                    return hit?.description || this.i18n.homeStoreGroupOtherHint;
                }
                return this.i18n.homeStoreGroupPluginHint;
            };
            // 来源分组优先于功能分组：同一插件提供的多个组件收敛进一个来源组，
            // 组头再补来源图标、已添加计数与「全选本组」，让用户按插件整组取舍。
            const sourceOf = (def: any) => resolveHomeModuleSource(def);
            const groupOf = (moduleId: string, def: any): string => {
                const source = sourceOf(def);
                if (source.kind === "plugin") return source.label;
                if (def.category === "siyuan") {
                    const hit = BUILTIN_GROUPS.find((group) => group.moduleIds.includes(moduleId));
                    return hit ? hit.label : this.i18n.homeStoreGroupOther;
                }
                return def.author
                    ? this.i18n.homeStoreGroupPluginAuthor.replace("{author}", def.author)
                    : this.i18n.homeStoreGroupPlugin;
            };

            // 可用与待安装卡片共享同一套键盘焦点模型：卡片本身只作为
            // 可编程焦点锚点，不抢占内部按钮的 Enter/Space 语义。
            const bindStoreCardKeyboard = (card: HTMLElement) => {
                card.tabIndex = -1;
                card.setAttribute("role", "group");
                card.addEventListener("keydown", (event) => {
                    const cards = Array.from(root.querySelectorAll<HTMLElement>(".sw-home-store__card:not(.fn__none)"));
                    const index = cards.indexOf(card);
                    if (index < 0) return;
                    let next = -1;
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % cards.length;
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + cards.length) % cards.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = cards.length - 1;
                    if (next < 0) return;
                    event.preventDefault();
                    cards[next].focus();
                });
            };

            const ready = sortHomeStoreCards([...activeIds].map((moduleId) => ({moduleId, def: defs.get(moduleId), search: `${defs.get(moduleId)?.title || moduleId}`, category: defs.get(moduleId)?.category === "siyuan" ? "builtin" : "plugin", availability: defs.get(moduleId)?.availability || "ready", added: instanceByModule.has(moduleId)})), storeSort)
                .filter((item) => !!item.def);

            const buildReadyCard = (moduleId: string, def: any) => {
                const externalInfo = resolveHomeStoreSourceInfo(moduleId);
                const dependencyInfo = resolveHomeStoreDependencyInfo(moduleId);
                const dependencySummary = buildHomeStoreDependencySummary(moduleId, {
                    required: "需前置依赖", optional: "可选数据源", none: "无额外依赖",
                });
                const card = document.createElement("section");
                card.className = "sw-home-store__card";
                bindStoreCardKeyboard(card);
                card.dataset.moduleId = moduleId;
                const selectButton = document.createElement("button");
                selectButton.type = "button";
                selectButton.className = "b3-button b3-button--text sw-home-store__select";
                selectButton.dataset.action = "toggle-selection";
                selectButton.dataset.moduleId = moduleId;
                const selected = selectedStoreModules.includes(moduleId);
                selectButton.setAttribute("aria-pressed", String(selected));
                selectButton.textContent = selected ? "已选" : "选择";
                selectButton.title = `${selectButton.textContent} ${def.title || moduleId}`;
                selectButton.addEventListener("click", () => {
                    selectedStoreModules = toggleHomeStoreSelection(selectedStoreModules, moduleId);
                    renderStore();
                });
                card.appendChild(selectButton);
                card.dataset.search = `${buildHomeStoreSearchText(def, moduleId)} ${externalInfo?.providerName || ""} ${buildHomeStoreSourceSearchText(def)}`.toLowerCase();
                card.dataset.category = def.category === "siyuan" ? "builtin" : "plugin";
                card.dataset.availability = def.availability || "ready";
                card.dataset.integration = externalInfo?.integration === "http" ? "network"
                    : externalInfo?.integration === "local-bridge" ? "local"
                        : externalInfo?.integration === "direct" || def.category === "siyuan" ? "offline" : "unknown";
                const supported: string[] = Array.isArray(def.sizes) && def.sizes.length > 0 ? def.sizes : ["medium"];
                const added = instanceByModule.get(moduleId);
                const addedInstance = instanceStateByModule.get(moduleId);
                card.dataset.supportedSizes = supported.join(",");
                card.dataset.currentSize = added?.size || "";
                card.dataset.added = added ? "true" : "false";
                card.dataset.statusTone = resolveHomeStoreStatusTone(card.dataset);
                card.dataset.integrationTone = resolveHomeStoreIntegrationTone(card.dataset);
                card.dataset.cardTone = resolveHomeStoreCardTone(card.dataset);
                card.dataset.configurable = String(Array.isArray(def.configSchema) && def.configSchema.length > 0);
                card.dataset.recommended = String(def.category === "siyuan" && !externalInfo && (def.availability || "ready") === "ready");
                card.dataset.dependency = dependencySummary.state;
                card.dataset.dependencyName = dependencySummary.name;
                card.dataset.dependencySetup = dependencySummary.setup;
                const installability = normalizeHomeStoreInstallability(undefined, {added: !!added, availability: def.availability || "ready"});
                card.dataset.installability = installability;
                card.dataset.installHint = resolveHomeStoreInstallabilityReason(installability);
                card.dataset.primaryAction = resolveHomeStorePrimaryAction(card.dataset);
                card.setAttribute("aria-label", resolveHomeStoreCardA11y(card.dataset, {title: def.title || moduleId, added: this.i18n.homeStoreStatusAdded, notAdded: this.i18n.homeStoreStatusNotAdded}));
                const head = document.createElement("div");
                head.className = "sw-home-store__card-head";
                const icon = document.createElement("svg");
                icon.innerHTML = `<use xlink:href="#${def.icon || "iconPlugin"}"></use>`;
                icon.setAttribute("viewBox", "0 0 24 24");
                icon.setAttribute("aria-hidden", "true");
                const copy = document.createElement("div");
                const title = document.createElement("strong");
                title.textContent = def.title || moduleId;
                title.id = `sw-home-store-title-${moduleId}`;
                card.setAttribute("aria-labelledby", title.id);
                const availability = def.availability === "conditional" || def.availability === "external" ? def.availability : "";
                if (availability) {
                    const badge = document.createElement("em");
                    badge.className = `sw-home-store__availability sw-home-store__availability--${availability}`;
                    badge.textContent = availability === "external" ? this.i18n.homeStoreAvailabilityExternal : this.i18n.homeStoreAvailabilityConditional;
                    badge.setAttribute("aria-label", badge.textContent);
                    badge.title = badge.textContent;
                    title.appendChild(document.createTextNode(" "));
                    title.appendChild(badge);
                }
                const desc = document.createElement("span");
                desc.textContent = def.description || "";
                const supportedDevices = Array.isArray(def.supportedDevices) ? def.supportedDevices : [device];
                const deviceLabels: Record<string, string> = {
                    desktop: this.i18n.homeStoreDeviceDesktop,
                    sidebar: this.i18n.homeStoreDeviceSidebar,
                    mobile: this.i18n.homeStoreDeviceMobile,
                };
                const support = document.createElement("small");
                support.className = "sw-home-store__support";
                support.setAttribute("aria-label", this.i18n.homeStoreSupportedSurfaces);
                const surfaceText = supportedDevices.map((item: string) => deviceLabels[item] || item).filter(Boolean).join("、");
                support.textContent = this.i18n.homeStoreSupportedSurfaces.replace("{surfaces}", surfaceText);
                support.title = support.textContent;
                const status = document.createElement("small");
                status.className = "sw-home-store__status" + (added ? " is-added" : "");
                status.id = `sw-home-store-status-${moduleId}`;
                status.dataset.state = added ? "added" : "available";
                status.setAttribute("aria-live", "polite");
                status.setAttribute("aria-atomic", "true");
                card.setAttribute("aria-describedby", status.id);
                const cardStatus = resolveHomeStoreCardStatus(!!added, added?.size, supported);
                status.textContent = cardStatus.added
                    ? `${this.i18n.homeStoreStatusAdded} · ${this.i18n.homeStoreStatusCurrent.replace("{size}", HOME_WIDGET_SIZE_LABELS[cardStatus.sizeKey as HomeWidgetSize] || cardStatus.sizeKey)}`
                    : this.i18n.homeStoreStatusNotAdded;
                copy.append(title, status, desc, support);
                const sourceMeta = document.createElement("div");
                sourceMeta.className = "sw-home-store__source-meta";
                sourceMeta.setAttribute("role", "note");
                sourceMeta.setAttribute("aria-label", this.i18n.homeStoreGuideHint);
                const addChip = (label: string, kind: string) => {
                    if (!label) return;
                    const chip = document.createElement("span");
                    chip.className = `sw-home-store__source-chip is-${kind}`;
                    chip.textContent = label;
                    chip.title = label;
                    chip.dataset.kind = kind;
                    chip.setAttribute("aria-label", label);
                    sourceMeta.appendChild(chip);
                };
                if (externalInfo) {
                    addChip(this.i18n.homeStoreSource.replace("{source}", externalInfo.providerName), "source");
                    const integrationKind = externalInfo.integration;
                    const privacyKind = externalInfo.privacy;
                    const networkLabel = integrationKind === "direct"
                        ? this.i18n.homeStoreNetworkOffline
                        : integrationKind === "local-bridge"
                            ? this.i18n.homeStoreNetworkLocal
                            : this.i18n.homeStoreNetworkOnline;
                    addChip(networkLabel, integrationKind === "direct" ? "offline" : integrationKind === "local-bridge" ? "local" : "online");
                    const privacyLabel = privacyKind === "location-only"
                        ? this.i18n.homeStorePrivacyLocation
                        : privacyKind === "local-only"
                            ? this.i18n.homeStorePrivacyLocal
                            : privacyKind === "endpoint-only"
                                ? this.i18n.homeStorePrivacyEndpoint
                                : this.i18n.homeStorePrivacyNone;
                    addChip(privacyLabel, "privacy");
                } else if (def.category !== "siyuan") {
                    addChip(this.i18n.homeStorePluginSource.replace("{source}", def.author || this.i18n.homeStoreTabPlugin), "plugin");
                } else {
                    addChip(this.i18n.homeStoreBuiltInSource, "offline");
                }
                if (dependencyInfo) {
                    const dependencyChip = document.createElement("span");
                    dependencyChip.className = `sw-home-store__source-chip is-dependency sw-home-store__dependency-${dependencyInfo.kind}`;
                    dependencyChip.textContent = dependencySummary.label;
                    dependencyChip.title = dependencyInfo.setup;
                    dependencyChip.setAttribute("aria-label", `${dependencyInfo.name}：${dependencyInfo.setup}`);
                    sourceMeta.appendChild(dependencyChip);
                    if (dependencyInfo.installUrl) {
                        const dependencyLink = document.createElement("a");
                        dependencyLink.className = "sw-home-store__dependency-link";
                        dependencyLink.href = dependencyInfo.installUrl;
                        dependencyLink.target = "_blank";
                        dependencyLink.rel = "noopener noreferrer";
                        dependencyLink.textContent = "安装地址";
                        dependencyLink.title = `${dependencyInfo.name} 安装地址`;
                        sourceMeta.appendChild(dependencyLink);
                    }
                }
                addChip(Array.isArray(def.configSchema) && def.configSchema.length > 0 ? this.i18n.homeStoreConfigReady : this.i18n.homeStoreConfigNone, "config");
                buildHomeStoreCardBadges(card.dataset, {recommended: this.i18n.homeStoreTabRecommended, configurable: this.i18n.homeStoreConfigReady, added: this.i18n.homeStoreStatusAdded})
                    .filter((label) => label !== this.i18n.homeStoreConfigReady)
                    .forEach((label) => addChip(label, label === this.i18n.homeStoreTabRecommended ? "recommended" : label === this.i18n.homeStoreStatusAdded ? "added" : "config"));
                if (sourceMeta.childElementCount > 0) copy.appendChild(sourceMeta);
                head.append(icon, copy);
                card.appendChild(head);
                // 迷你预览：骨架示意 + 各档尺寸按 12 列比例的整体效果
                // PREVIEW_KINDS is centralized in home-store-model.js.
                const kind = resolveHomeStorePreviewKind(moduleId, def.category === "siyuan" ? "builtin" : "plugin");
                const preview = document.createElement("div");
                preview.className = "sw-home-store__preview";
                preview.dataset.kind = kind;
                preview.dataset.moduleId = moduleId;
                preview.setAttribute("aria-hidden", "true");
                if (kind === "calendar") {
                    preview.innerHTML = `<span class="p-calendar-grid">${Array.from({length: 28}, () => "<i></i>").join("")}</span>`;
                } else if (kind === "weather") {
                    preview.innerHTML = '<span class="p-weather-temp">21°</span><span class="p-weather-icon">⛅</span>';
                } else if (kind === "media") {
                    preview.innerHTML = '<span class="p-media-grid"><i></i><i></i><i></i><i></i></span>';
                } else if (kind === "feed") {
                    preview.innerHTML = '<span class="p-feed-list"><i><b>1</b><em></em></i><i><b>2</b><em></em></i><i><b>3</b><em></em></i></span>';
                } else if (kind === "activity") {
                    preview.innerHTML = '<span class="p-activity-total">4h 18m</span><span class="p-activity-bars"><i style="--p:88%"></i><i style="--p:62%"></i><i style="--p:37%"></i></span>';
                } else if (kind === "tasks") {
                    preview.innerHTML = `<span class="p-task-list"><i></i><i></i><i></i></span>`;
                } else if (kind === "outline" || kind === "documents") {
                    preview.innerHTML = `<i class="p-line w1"></i><i class="p-line w2"></i><i class="p-line w3"></i><i class="p-line w2"></i>`;
                } else if (kind === "chart" || kind === "progress") {
                    preview.innerHTML = `<span class="p-bars"><i></i><i></i><i></i><i></i><i></i></span>`;
                } else if (kind === "countdown" || kind === "stat") {
                    const hero = document.createElement("i");
                    hero.className = "p-hero";
                    preview.appendChild(hero);
                    ["w1", "w2"].forEach((w) => { const line = document.createElement("i"); line.className = `p-line ${w}`; preview.appendChild(line); });
                } else {
                    ["w1", "w2", "w3"].forEach((w) => { const line = document.createElement("i"); line.className = `p-line ${w}`; preview.appendChild(line); });
                }
                // 各档尺寸的整体效果：按 w/12 比例宽度的成比例缩略框
                const declaredSizes: string[] = Array.isArray(def.sizes) && def.sizes.length > 0 ? def.sizes : ["medium"];
                const supportedSizes: string[] = device === "mobile" ? [resolveMobileHomeSize(declaredSizes)] : declaredSizes;
                const sizesRow = document.createElement("div");
                sizesRow.className = "sw-home-store__preview-sizes";
                sizesRow.setAttribute("role", "presentation");
                supportedSizes.forEach((sizeKey) => {
                    const sizePreset = HOME_WIDGET_SIZES[sizeKey as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
                    const box = document.createElement("i");
                    box.className = "p-size" + (added && added.size === sizeKey ? " is-current" : "");
                    box.dataset.size = sizeKey;
                    box.style.width = `${Math.max(9, Math.round(sizePreset.w / 12 * 100))}%`;
                    box.title = HOME_WIDGET_SIZE_LABELS[sizeKey as HomeWidgetSize] || sizeKey;
                    sizesRow.appendChild(box);
                });
                preview.appendChild(sizesRow);
                card.appendChild(preview);
                const tiles = document.createElement("div");
                tiles.className = "sw-home-store__sizes";
                tiles.setAttribute("role", "group");
                tiles.setAttribute("aria-orientation", "horizontal");
                tiles.dataset.moduleId = moduleId;
                tiles.dataset.selectedSize = added?.size || supported[0];
                const actionId = `sw-home-store-action-${moduleId}`;
                const sizeLabel = document.createElement("span");
                sizeLabel.className = "sw-home-store__choose-size";
                sizeLabel.id = `sw-home-store-size-label-${moduleId}`;
                sizeLabel.textContent = this.i18n.homeStoreChooseSize;
                tiles.appendChild(sizeLabel);
                tiles.setAttribute("aria-labelledby", sizeLabel.id);
                let selectedTile: HTMLButtonElement | undefined;
                supported.forEach((sizeKey, sizeIndex) => {
                    const tile = document.createElement("button");
                    tile.type = "button";
                    tile.className = "sw-home-store__size";
                    tile.dataset.size = sizeKey;
                    tile.dataset.selected = String(sizeKey === (added?.size || supported[0]));
                    tile.textContent = HOME_WIDGET_SIZE_LABELS[sizeKey as HomeWidgetSize] || sizeKey;
                    tile.setAttribute("aria-label", this.i18n.homeStoreSizeHint.replace("{size}", tile.textContent || ""));
                    tile.setAttribute("aria-controls", actionId);
                    tile.title = tile.getAttribute("aria-label") || "";
                    if (sizeKey === (added?.size || supported[0])) {
                        selectedTile = tile;
                        tile.classList.add("is-selected");
                    }
                    tile.setAttribute("aria-pressed", String(tile === selectedTile));
                    tile.setAttribute("aria-setsize", String(supported.length));
                    tile.setAttribute("aria-posinset", String(sizeIndex + 1));
                    tile.onclick = () => {
                        selectedTile?.classList.remove("is-selected");
                        selectedTile?.setAttribute("aria-pressed", "false");
                        if (selectedTile) selectedTile.dataset.selected = "false";
                        selectedTile = tile;
                        tile.classList.add("is-selected");
                        tile.setAttribute("aria-pressed", "true");
                        tile.dataset.selected = "true";
                        tiles.dataset.selectedSize = sizeKey;
                        addButton.dataset.selectedSize = sizeKey;
                        addButton.setAttribute("aria-label", `${added ? this.i18n.homeStoreApplySize : this.i18n.homeStoreAdd} · ${def.title || moduleId} · ${tile.textContent || sizeKey}`);
                    };
                    tile.addEventListener("keydown", (event) => {
                        const tilesForCard = Array.from(tiles.querySelectorAll<HTMLButtonElement>(".sw-home-store__size"));
                        const index = tilesForCard.indexOf(tile);
                        if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tilesForCard.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tilesForCard.length) % tilesForCard.length;
                        tilesForCard[nextIndex]?.focus();
                    });
                    tiles.appendChild(tile);
                });
                tiles.insertAdjacentHTML("beforeend", `<button class="b3-button b3-button--outline sw-home-store__add">${added ? this.i18n.homeStoreApplySize : this.i18n.homeStoreAdd}</button>`);
                const addButton = tiles.lastElementChild as HTMLButtonElement;
                addButton.type = "button";
                addButton.id = actionId;
                addButton.dataset.action = added ? "apply-size" : "add";
                addButton.dataset.moduleId = moduleId;
                addButton.dataset.selectedSize = selectedTile?.dataset.size || supported[0];
                addButton.textContent = added ? this.i18n.homeStoreApplySize : this.i18n.homeStoreAdd;
                if (!added && def.availability === "external") {
                    addButton.textContent = resolveHomeStorePrimaryActionLabel(card.dataset, {guide: this.i18n.homeStoreGuide || "查看说明"});
                    addButton.dataset.action = "guide";
                }
                const stateSummary = buildHomeStoreCardStateSummary(card.dataset, {conditional: this.i18n.homeStoreAvailabilityConditional, external: this.i18n.homeStoreAvailabilityExternal});
                addButton.dataset.stateSummary = stateSummary.text;
                addButton.setAttribute("aria-describedby", sizeLabel.id);
                addButton.setAttribute("aria-label", `${added ? this.i18n.homeStoreApplySize : this.i18n.homeStoreAdd} · ${def.title || moduleId} · ${selectedTile?.textContent || supported[0]}`);
                addButton.title = addButton.getAttribute("aria-label") || "";
                addButton.dataset.installability = installability;
                if (!added && !canHomeStoreInstall(card.dataset, {installability})) {
                    addButton.disabled = true;
                    addButton.title = resolveHomeStoreInstallabilityReason(installability);
                    addButton.setAttribute("aria-label", `${resolveHomeStoreInstallabilityReason(installability)} 路 ${def.title || moduleId}`);
                }
                addButton.style.minHeight = `${resolveHomeStoreTouchTargetSize(device)}px`;
                addButton.onclick = () => {
                    const sizeKey = selectedTile!.dataset.size;
                    const {w, h} = HOME_WIDGET_SIZES[sizeKey as HomeWidgetSize]!;
                    const next = this.getHomeState();
                    const layoutList = (next.layouts[device] || []) as Array<any>;
                    const entry = added && layoutList.find((candidate) => candidate.instanceId === added.instanceId);
                    let createdInstance: {instanceId: string; moduleId: string; config: Record<string, unknown>} | null = null;
                    if (entry) {
                        Object.assign(entry, {size: sizeKey, w, h});
                    } else {
                        createdInstance = {instanceId: moduleId, moduleId, config: {}};
                        (next.instances as Array<any>).push({...createdInstance, enabled: true});
                        layoutList.push({instanceId: moduleId, x: 0, y: 0, w, h, collapsed: false, size: sizeKey});
                    }
                    next.layouts[device] = layoutList;
                    this.saveHomeState(next);
                    if (!added && def.availability === "conditional") {
                        showMessage(`${def.title || moduleId}：${this.i18n.homeStoreConditionalHint}`);
                    }
                    renderStore();
                    onChanged();
                    if (createdInstance && Array.isArray(def.configSchema) && def.configSchema.length > 0) {
                        openHomeConfigForm.call(this, createdInstance, def.configSchema, () => {
                            renderStore();
                            onChanged();
                        });
                    }
                };
                // The add action is inserted above so legacy host selectors that
                // inspect the final size-row child continue to work.
                if (addedInstance && Array.isArray(def.configSchema) && def.configSchema.length > 0) {
                    const configButton = document.createElement("button");
                    configButton.type = "button";
                    configButton.className = "b3-button b3-button--text sw-home-store__configure";
                    configButton.dataset.action = "configure";
                    configButton.textContent = this.i18n.homeConfig;
                    configButton.setAttribute("aria-label", `${this.i18n.homeConfig} · ${def.title || moduleId}`);
                    configButton.setAttribute("aria-haspopup", "dialog");
                    configButton.title = configButton.getAttribute("aria-label") || "";
                    configButton.onclick = () => {
                        openHomeConfigForm.call(this, addedInstance, def.configSchema, () => {
                            renderStore();
                            onChanged();
                        });
                    };
                    tiles.appendChild(configButton);
                }
                if (added) {
                    const removeButton = document.createElement("button");
                    removeButton.type = "button";
                    removeButton.className = "b3-button b3-button--text sw-home-store__remove";
                    removeButton.dataset.action = "remove";
                    removeButton.textContent = this.i18n.homeStoreRemove;
                    removeButton.setAttribute("aria-label", `${this.i18n.homeStoreRemove} · ${def.title || moduleId}`);
                    removeButton.title = removeButton.getAttribute("aria-label") || "";
                    removeButton.onclick = () => { this.removeHomeInstance(added.instanceId); renderStore(); onChanged(); };
                    tiles.appendChild(removeButton);
                }
                const previewButton = document.createElement("button");
                previewButton.type = "button";
                previewButton.className = "sw-home-store__size sw-home-store__preview-btn";
                previewButton.dataset.action = "preview";
                previewButton.textContent = this.i18n.homeStorePreview;
                previewButton.setAttribute("aria-label", `${this.i18n.homeStorePreview} · ${def.title || moduleId}`);
                previewButton.setAttribute("aria-haspopup", "dialog");
                previewButton.title = previewButton.getAttribute("aria-label") || "";
                previewButton.onclick = () => openStoreWidgetPreview.call(this, moduleId, def, device);
                tiles.appendChild(previewButton);
                card.appendChild(tiles);
                return card;
            };

            // 按组渲染：组头（含数量）+ 组内网格；搜索过滤沿用卡片隐藏逻辑
            const readyGroups = new Map<string, Array<{moduleId: string; card: HTMLElement}>>();
            const readyGroupDescriptions = new Map<string, string>();
            ready.forEach(({moduleId, def}) => {
                const label = groupOf(moduleId, def);
                if (!readyGroups.has(label)) readyGroups.set(label, []);
                if (!readyGroupDescriptions.has(label)) readyGroupDescriptions.set(label, groupDescriptionOf(moduleId, def));
                readyGroups.get(label)!.push({moduleId, card: buildReadyCard(moduleId, def)});
            });
            // 来源组的附加信息（图标/已添加计数/成员）来自纯模型，渲染层只负责呈现。
            const readyGroupSources = new Map<string, any>();
            buildHomeStoreSourceGroups(ready.map(({moduleId, def, added}) => ({moduleId, def, added}))).forEach((group: any) => {
                readyGroupSources.set(group.label, group);
            });
            const extraGroupLabels = [...readyGroups.keys()].filter((label) => !BUILTIN_GROUPS.some((group) => group.label === label));
            extraGroupLabels.sort((a, b) => {
                const left = readyGroups.get(a)?.length || 0;
                const right = readyGroups.get(b)?.length || 0;
                return left === right ? a.localeCompare(b) : right - left;
            });
            const orderedGroups = [
                ...BUILTIN_GROUPS.map((group) => group.label).filter((label) => readyGroups.has(label)),
                ...extraGroupLabels,
            ];
            orderedGroups.forEach((label) => {
                const groupEntries = readyGroups.get(label)!;
                const groupCount = groupEntries.length;
                const groupHeading = document.createElement("h3");
                groupHeading.className = "sw-home-store__group";
                groupHeading.setAttribute("role", "heading");
                groupHeading.setAttribute("aria-level", "3");
                groupHeading.id = `sw-home-store-group-heading-${orderedGroups.indexOf(label)}`;
                groupHeading.dataset.group = label;
                groupHeading.dataset.collapsed = String(collapsedGroups.has(label));
                groupHeading.setAttribute("aria-label", `${label} · ${groupCount}`);
                const descriptionId = `sw-home-store-group-description-${orderedGroups.indexOf(label)}`;
                groupHeading.setAttribute("aria-describedby", descriptionId);
                const groupLabel = document.createElement("span");
                groupLabel.className = "sw-home-store__group-label";
                groupLabel.textContent = `${label} · ${groupCount}`;
                const groupDescription = document.createElement("span");
                groupDescription.className = "sw-home-store__group-description";
                groupDescription.id = descriptionId;
                groupDescription.textContent = readyGroupDescriptions.get(label) || this.i18n.homeStoreGroupOtherHint;
                const groupToggle = document.createElement("button");
                groupToggle.type = "button";
                groupToggle.className = "sw-home-store__group-toggle";
                groupToggle.textContent = collapsedGroups.has(label) ? "＋" : "－";
                groupToggle.setAttribute("aria-label", collapsedGroups.has(label) ? this.i18n.homeStoreExpandGroup : this.i18n.homeStoreCollapseGroup);
                groupToggle.setAttribute("aria-expanded", String(!collapsedGroups.has(label)));
                groupToggle.dataset.group = label;
                groupToggle.title = groupToggle.getAttribute("aria-label") || "";
                groupToggle.onclick = () => { if (collapsedGroups.has(label)) collapsedGroups.delete(label); else collapsedGroups.add(label); renderStore(); };
                const sourceMeta = readyGroupSources.get(label);
                // 来源组的组内顺序由纯模型决定（source.order 升序）。映射结果与组内
                // 数量不一致时回退原顺序：不同来源可能撞同一个展示名（label 键相同），
                // 宁可不排序，也不能让卡片在渲染中消失。
                const orderedCards = sourceMeta && sourceMeta.moduleIds.length
                    ? sourceMeta.moduleIds
                        .map((id: string) => groupEntries.find((item: any) => item.moduleId === id))
                        .filter(Boolean)
                        .map((item: any) => item.card)
                    : [];
                const cards: HTMLElement[] = orderedCards.length === groupEntries.length
                    ? orderedCards
                    : groupEntries.map((item: any) => item.card);
                if (sourceMeta?.icon) {
                    const groupIcon = document.createElement("svg");
                    groupIcon.className = "sw-home-store__group-icon";
                    groupIcon.innerHTML = `<use xlink:href="#${sourceMeta.icon}"></use>`;
                    groupIcon.setAttribute("viewBox", "0 0 24 24");
                    groupIcon.setAttribute("aria-hidden", "true");
                    groupHeading.appendChild(groupIcon);
                }
                groupHeading.appendChild(groupLabel);
                if (sourceMeta) {
                    const groupProgress = document.createElement("span");
                    groupProgress.className = "sw-home-store__group-progress";
                    groupProgress.textContent = this.i18n.homeStoreGroupAdded
                        .replace("{added}", String(sourceMeta.addedCount))
                        .replace("{total}", String(sourceMeta.count));
                    groupHeading.appendChild(groupProgress);
                }
                groupHeading.appendChild(groupDescription);
                if (sourceMeta && sourceMeta.moduleIds.length > 1) {
                    const groupSelected = sourceMeta.moduleIds.every((id: string) => selectedStoreModules.includes(id));
                    const groupSelect = document.createElement("button");
                    groupSelect.type = "button";
                    groupSelect.className = "sw-home-store__group-select";
                    groupSelect.dataset.action = "toggle-group-selection";
                    groupSelect.dataset.group = label;
                    groupSelect.textContent = groupSelected ? this.i18n.homeStoreClearGroup : this.i18n.homeStoreSelectGroup;
                    groupSelect.setAttribute("aria-pressed", String(groupSelected));
                    groupSelect.setAttribute("aria-label", `${groupSelect.textContent} · ${label}`);
                    groupSelect.title = groupSelect.getAttribute("aria-label") || "";
                    groupSelect.onclick = () => {
                        selectedStoreModules = groupSelected
                            ? selectedStoreModules.filter((id: string) => !sourceMeta.moduleIds.includes(id))
                            : [...new Set([...selectedStoreModules, ...sourceMeta.moduleIds])];
                        renderStore();
                    };
                    groupHeading.appendChild(groupSelect);
                }
                groupHeading.appendChild(groupToggle);
                storeFragment.appendChild(groupHeading);
                const groupGrid = document.createElement("div");
                groupGrid.className = "sw-home-store__grid";
                groupGrid.dataset.viewMode = storeViewMode;
                const groupId = `sw-home-store-group-${orderedGroups.indexOf(label)}`;
                groupGrid.id = groupId;
                groupGrid.setAttribute("role", "group");
                groupGrid.dataset.group = label;
                groupGrid.setAttribute("aria-labelledby", groupHeading.id);
                groupToggle.setAttribute("aria-controls", groupId);
                cards.forEach((card) => groupGrid.appendChild(card));
                storeFragment.appendChild(groupGrid);
            });

            // —— 分区二：需安装插件后可用（目录中登记、来源插件未就位） ——
            const pending = resolveWidgetCatalogState([...activeIds], [...instanceByModule.keys()])
                .filter((item: any) => item.status !== "ready");
            root.dataset.pendingCount = String(pending.length);
            if (pending.length > 0) {
                const pendingHeading = document.createElement("h3");
                pendingHeading.className = "sw-home-store__section";
                pendingHeading.setAttribute("role", "heading");
                pendingHeading.setAttribute("aria-level", "2");
                pendingHeading.id = "sw-home-store-section-pending";
                pendingHeading.dataset.section = "pending";
                pendingHeading.textContent = this.i18n.homeStorePending;
                pendingHeading.setAttribute("aria-label", this.i18n.homeStorePending);
                storeFragment.appendChild(pendingHeading);
                const pendingGrid = document.createElement("div");
                pendingGrid.className = "sw-home-store__grid";
                pendingGrid.dataset.viewMode = storeViewMode;
                pendingGrid.id = "sw-home-store-pending-grid";
                pendingGrid.setAttribute("role", "group");
                pendingGrid.setAttribute("aria-labelledby", pendingHeading.id);
                const pendingProviders = buildHomeStoreProviderGroups(pending);
                const needsProviderHeading = pendingProviders.length > 1 || (pendingProviders[0]?.count || 0) > 1;
                const renderedProviders = new Set<string>();
                pending.forEach(({entry, status}: any) => {
                    const providerId = String(entry?.providerPlugin || entry?.providerName || "");
                    if (needsProviderHeading && providerId && !renderedProviders.has(providerId)) {
                        renderedProviders.add(providerId);
                        const providerLabel = document.createElement("h4");
                        providerLabel.className = "sw-home-store__provider";
                        providerLabel.setAttribute("role", "heading");
                        providerLabel.setAttribute("aria-level", "3");
                        providerLabel.dataset.provider = providerId;
                        providerLabel.textContent = this.i18n.homeStoreProviderGroup.replace("{name}", String(entry?.providerName || providerId));
                        pendingGrid.appendChild(providerLabel);
                    }
                    const unavailable = status === "unavailable";
                    const card = document.createElement("section");
                    card.className = "sw-home-store__card sw-home-store__card--pending"
                        + (unavailable ? " sw-home-store__card--unavailable" : "");
                    bindStoreCardKeyboard(card);
                    card.dataset.moduleId = entry.moduleId;
                    card.dataset.search = `${entry.title} ${entry.description} ${entry.providerName}`.toLowerCase();
                    card.dataset.category = "plugin";
                    card.dataset.availability = "external";
                    card.dataset.integration = "unknown";
                    card.dataset.added = unavailable ? "true" : "false";
                    card.dataset.statusTone = unavailable ? "warning" : "info";
                    card.dataset.status = unavailable ? "unavailable" : "requires-provider";
                    card.setAttribute("aria-label", `${entry.title} · ${unavailable ? this.i18n.homeStoreProviderUnavailable : this.i18n.homeStoreRequires}`);
                    const head = document.createElement("div");
                    head.className = "sw-home-store__card-head";
                    const icon = document.createElement("svg");
                    icon.innerHTML = `<use xlink:href="#${entry.icon || "iconPlugin"}"></use>`;
                    icon.setAttribute("viewBox", "0 0 24 24");
                    icon.setAttribute("aria-hidden", "true");
                    const copy = document.createElement("div");
                    const title = document.createElement("strong");
                    title.textContent = entry.title;
                    title.id = `sw-home-store-title-${entry.moduleId}`;
                    card.setAttribute("aria-labelledby", title.id);
                    const desc = document.createElement("span");
                    desc.textContent = entry.description;
                    copy.append(title, desc);
                    head.append(icon, copy);
                    card.appendChild(head);
                    const requireNote = document.createElement("p");
                    requireNote.className = "sw-home-store__require";
                    requireNote.textContent = (unavailable ? this.i18n.homeStoreProviderUnavailable : this.i18n.homeStoreRequires)
                        .replace("{plugin}", entry.providerName);
                    card.appendChild(requireNote);
                    if (unavailable) {
                        const removeButton = document.createElement("button");
                        removeButton.type = "button";
                        removeButton.className = "b3-button b3-button--text sw-home-store__remove-unavailable";
                        removeButton.dataset.action = "remove-unavailable";
                        removeButton.textContent = this.i18n.homeStoreRemoveUnavailable;
                        removeButton.setAttribute("aria-label", `${this.i18n.homeStoreRemoveUnavailable} · ${entry.title}`);
                        removeButton.title = removeButton.getAttribute("aria-label") || "";
                        removeButton.addEventListener("click", () => {
                            const instance = instanceStateByModule.get(entry.moduleId);
                            if (!instance) return;
                            this.removeHomeInstance(instance.instanceId);
                            renderStore();
                            onChanged();
                        });
                        card.appendChild(removeButton);
                    }
                    pendingGrid.appendChild(card);
                });
                storeFragment.appendChild(pendingGrid);
            }

            if (ready.length === 0 && pending.length === 0) {
                root.dataset.readyCount = "0";
                root.dataset.pendingCount = "0";
                root.textContent = this.i18n.homeNoMoreModules;
                restoreStoreView();
                root.setAttribute("aria-busy", "false");
                return;
            }
            filterEmptyState = document.createElement("p");
            filterEmptyState.className = "sw-home-store__filter-empty fn__none";
            filterEmptyState.dataset.state = "empty-filter";
            filterEmptyState.setAttribute("role", "status");
            filterEmptyState.setAttribute("aria-live", "polite");
            filterEmptyState.setAttribute("aria-atomic", "true");
            const emptyText = document.createElement("span");
            emptyText.textContent = this.i18n.homeStoreNoResults;
            const clearFilters = document.createElement("button");
            clearFilters.type = "button";
            clearFilters.className = "b3-button b3-button--text sw-home-store__clear-filters";
            clearFilters.dataset.action = "clear-filters";
            clearFilters.textContent = this.i18n.homeStoreClearFilters;
            clearFilters.setAttribute("aria-label", this.i18n.homeStoreClearFilters);
            clearFilters.title = this.i18n.homeStoreClearFilters;
            clearFilters.addEventListener("click", () => {
                storeQuery = "";
                storeTab = "all";
                root.dataset.query = "";
                root.dataset.activeTab = "all";
                searchInput.value = "";
                clearSearchButton.hidden = true;
                sortSelect.value = normalizeHomeStoreSort(storeSort);
                tabBar.querySelectorAll<HTMLElement>(".sw-home-store__tab").forEach((button) => {
                    const active = button.dataset.tabKey === "all";
                    button.classList.toggle("is-active", active);
                    button.setAttribute("aria-selected", String(active));
                    button.setAttribute("aria-current", active ? "page" : "false");
                    button.setAttribute("tabindex", active ? "0" : "-1");
                });
                applyFilter();
                searchInput.focus();
            });
            filterEmptyState.append(emptyText, clearFilters);
            storeFragment.appendChild(filterEmptyState);
            root.appendChild(storeFragment);
            applyFilter();
            restoreStoreView();
            root.setAttribute("aria-busy", "false");
        };

        renderStore();
        const handleModuleChange = () => {
            if (!root.isConnected) return;
            renderStore();
            onChanged();
        };
        this.homeModuleChangeListeners.add(handleModuleChange);
        // 缓冲识别：插件启停后 400ms 复扫一次安装状态（增量，不影响首屏）
        const rescanTimer = window.setTimeout(() => {
            if (root.isConnected) renderStore();
        }, 400);
        const originalDestroy = storeDialog.destroy.bind(storeDialog);
        storeDialog.destroy = () => {
            window.clearTimeout(rescanTimer);
            this.homeModuleChangeListeners.delete(handleModuleChange);
            originalDestroy();
            if (opener?.isConnected) opener.focus();
        };
    }
