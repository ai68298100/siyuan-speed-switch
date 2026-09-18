// 小驴速切 —— 第二面板（组件面板）装配链路（P1-1b 自 index.ts 原样搬移，ADR 0052）
// 本方法以 this 参数模式运行：调用方式 openSecondPanel.call(host)。
// host 契约见 SecondPanelUiHost；方法体内的局部闭包（renderPanel 与时钟/生活两条心跳、
// 拖拽排序、IntersectionObserver 懒读调度）是一个自洽运行时，本批保持原样不拆——
// 拆它属于后续批次（与 P1-2 样式层「先原样搬、再逐块治理」同一取向）。
// 注意：下列签名是从迁移前 index.ts 的类声明逐项同步而来，改宿主实现时此处须同步。
import {Dialog, showMessage} from "siyuan";
import type {EventBus, TEventBus} from "siyuan";
import {HOME_WIDGET_SIZES, PANEL_SCALE_DEFAULT, PANEL_SIZE_MIN_PX} from "./constants";
import type {HomeSizeMode, HomeWidgetSize} from "./constants";
import {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures, summarizeHomeRefreshFailures, selectHomeRefreshRetryEntries} from "./home-controller";
import {resolveMobileHomeSize} from "./home-model";
import {createHomeRuntime} from "./home-runtime";
import {openHomeConfigForm} from "./home-config-form";
import {openHomeWidgetStore} from "./home-store-ui";
import {millisecondsToNextMinute} from "./local-time-model";
import {resolvePanelSize} from "./settings-model";
import {clampOversizedIcons} from "./util";
import type {ISwSettings} from "./index";

export interface SecondPanelUiHost {
    i18n: Record<string, string>;
    isMobile: boolean;
    // 类静态 HOME_ACCENTS 不进入 this 参数模式，由宿主以实例字段转发
    homeAccents: readonly string[];
    homeRuntime: ReturnType<typeof createHomeRuntime>;
    homePanelSnapshots: Map<string, {snapshot: any; at: number}>;
    eventBus: EventBus;
    homeModuleChangeListeners: Set<() => void>;
    homeBuiltinAdapterIds: Set<string>;
    homeModuleOpens: Map<string, () => void>;
    homeThirdPartyIds: Set<string>;
    executeHomeCommand(command: string, close: () => void): boolean;
    getHomeState(): {schemaVersion: number; instances: Array<{instanceId: string; moduleId: string; enabled: boolean; config: Record<string, unknown>}>; layouts: Record<string, Array<{instanceId: string; x: number; y: number; w: number; h: number; collapsed: boolean}>>};
    getSettings(): ISwSettings;
    handleHomeItemAction(item: { label?: string; value?: string; href?: string; command?: string }, close: () => void): void;
    migrateHomeLayoutSize(entry: {w?: number; h?: number; size?: string}, sizes: string[]): string;
    openHomeSizeMenu(anchor: HTMLElement, supported: string[], current: string, onPick: (size: string) => void): void;
    removeHomeInstance(instanceId: string): void;
    renderQuickActions(container: HTMLElement, surface: "desktop" | "sidebar" | "mobile",
        searchInput: HTMLInputElement | null, close: () => void, selector?: string): void;
    resolvePanelDialogSize(settings: ISwSettings, fullscreen: boolean): {width: number; height: number};
    saveHomeState(state: { schemaVersion: number; instances: unknown[]; layouts: Record<string, unknown[]> }): void;
    toggleHomeTaskBlock(item: { value?: string; done?: boolean }): Promise<boolean>;
}

export function openSecondPanel(this: SecondPanelUiHost) {
        const settings = this.getSettings();
        const viewport = {width: window.innerWidth, height: window.innerHeight, minWidth: PANEL_SIZE_MIN_PX, minHeight: PANEL_SIZE_MIN_PX};
        // 组件面板独立尺寸模式：follow=跟随第一面板；adaptive=独立 90% 自适应；custom=固定尺寸；fullscreen=全屏
        const mode: HomeSizeMode = settings.homeSizeMode || "follow";
        const size = mode === "fullscreen"
            ? {width: viewport.width, height: viewport.height}
            : mode === "adaptive"
                ? resolvePanelSize({...settings, panelSizeMode: "adaptive", panelScale: PANEL_SCALE_DEFAULT}, viewport)
                : mode === "custom"
                    ? resolvePanelSize({...settings, panelSizeMode: "custom", dialogWidth: settings.homeWidth, dialogHeight: settings.homeHeight}, viewport)
                    : this.resolvePanelDialogSize(settings, settings.fullscreen);
        const fullscreenMode = mode === "fullscreen" || (mode === "follow" && settings.panelSizeMode === "fullscreen");
        const dialog = new Dialog({
            title: this.i18n.secondPanel,
            content: '<div class="speed-switch sw-home"></div>',
            width: `${size.width}px`,
            height: `${size.height}px`,
        });
        if (fullscreenMode) {
            dialog.element.querySelector(".b3-dialog__container")?.classList.add("sw-dialog--fullscreen");
        }
        const root = dialog.element.querySelector<HTMLElement>(".sw-home");
        if (!root) return;
        let iconClampFrame = 0;
        const scheduleIconClamp = () => {
            if (iconClampFrame || !root.isConnected) return;
            iconClampFrame = requestAnimationFrame(() => {
                iconClampFrame = 0;
                if (root.isConnected) clampOversizedIcons(root);
            });
        };
        const iconObserver = typeof MutationObserver === "function" ? new MutationObserver(scheduleIconClamp) : null;
        iconObserver?.observe(root, {childList: true, subtree: true});
        const homePalette = settings.homePalette || "auto";
        root.classList.add(`sw-home--palette-${homePalette}`);
        // 手机端强制单列堆叠（12 列网格在窄屏会把小组件压成窄条）
        if (this.isMobile) root.classList.add("sw-home--mobile");
        const device = this.isMobile ? "mobile" : "desktop";
        let editing = false;
        // 面板闭包持有当前渲染的控制器列表，工具栏"刷新全部"可跨渲染访问
        const homeControllers: Array<{ moduleId: string; refresh: (config?: Record<string, unknown>, readOptions?: Record<string, unknown>) => Promise<unknown>; dispose: () => void; cell: HTMLElement }> = [];
        const homeRefreshTimers: number[] = [];
        let homeClockTimer = 0;
        let homeLifeTimer = 0;
        const homeRefreshObservers: IntersectionObserver[] = [];
        let homeRefreshBatchController: AbortController | null = null;
        let panelEventCleanup: (() => void) | null = null;
        const clearDeferredRefreshes = () => {
            homeRefreshTimers.splice(0).forEach((handle) => {
                const cancelIdle = (window as any).cancelIdleCallback;
                if (typeof cancelIdle === "function") cancelIdle(handle);
                window.clearTimeout(handle);
            });
            homeRefreshObservers.splice(0).forEach((observer) => observer.disconnect());
            if (homeClockTimer) window.clearTimeout(homeClockTimer);
            homeClockTimer = 0;
            if (homeLifeTimer) window.clearTimeout(homeLifeTimer);
            homeLifeTimer = 0;
        };

        const renderPanel = () => {
            homeRefreshBatchController?.abort();
            homeRefreshBatchController = null;
            homeControllers.splice(0).forEach((entry) => entry.dispose());
            panelEventCleanup?.();
            panelEventCleanup = null;
            clearDeferredRefreshes();
            root.innerHTML = "";
            const defs = new Map<string, any>();
            this.homeRuntime.listModules("desktop").concat(this.homeRuntime.listModules("mobile"))
                .concat(this.homeRuntime.listModules("sidebar"))
                .forEach((def: any) => defs.set(def.moduleId, def));
            const catalogIds = new Set<string>();
            defs.forEach((_def, moduleId) => {
                if (this.homeBuiltinAdapterIds.has(moduleId) || this.homeThirdPartyIds.has(moduleId)) catalogIds.add(moduleId);
            });
            const state = this.getHomeState();
            const layoutList = (state.layouts[device] || []) as Array<any>;
            const byId = new Map(state.instances.map((inst: any) => [inst.instanceId, inst]));
            const cells: Array<{ inst: any; layout: any }> = [];
            layoutList.forEach((entry) => {
                const inst = byId.get(entry.instanceId);
                if (inst) cells.push({inst, layout: entry});
            });

            // 秒开（D-382）：工具栏/问候/网格在离屏 fragment 中装配，一次挂载避免多轮重排
            const mountFragment = document.createDocumentFragment();
            const bar = document.createElement("div");
            bar.className = "sw-home__bar";
            const editToggle = document.createElement("button");
            editToggle.type = "button";
            editToggle.className = "b3-button b3-button--text";
            editToggle.textContent = editing ? this.i18n.homeDone : this.i18n.homeEditLayout;
            editToggle.addEventListener("click", () => {
                editing = !editing;
                renderPanel();
            });
            bar.appendChild(editToggle);
            // 一键强制刷新全部组件（绕过 3s 缓存与失败退避）；空面板时无意义，隐藏
            if (cells.length > 0) {
                const refreshAllButton = document.createElement("button");
                refreshAllButton.type = "button";
                refreshAllButton.className = "b3-button b3-button--text sw-home__refresh";
                refreshAllButton.setAttribute("aria-label", this.i18n.homeRefreshAll);
                refreshAllButton.innerHTML = '<svg><use xlink:href="#iconRefresh"></use></svg><span>' + this.i18n.homeRefreshAll + '</span>';
                let retryEntries: typeof homeControllers | null = null;
                refreshAllButton.addEventListener("click", async () => {
                    if (refreshAllButton.disabled) return;
                    const preserveRefreshFocus = document.activeElement === refreshAllButton;
                    refreshAllButton.disabled = true;
                    refreshAllButton.setAttribute("aria-busy", "true");
                    const batchController = typeof AbortController === "function" ? new AbortController() : null;
                    homeRefreshBatchController = batchController;
                    try {
                        const targets = retryEntries || homeControllers;
                        const results = await refreshHomeModules(targets, {concurrency: 2, signal: batchController?.signal});
                        const failureCount = countHomeRefreshFailures(results);
                        if (failureCount > 0) {
                            const summary = summarizeHomeRefreshFailures(results);
                            retryEntries = selectHomeRefreshRetryEntries(targets, results) as typeof homeControllers;
                            const label = refreshAllButton.querySelector("span");
                            if (label) label.textContent = this.i18n.homeRetry;
                            refreshAllButton.setAttribute("aria-label", this.i18n.homeRetry);
                            showMessage(this.i18n.homeRefreshFailed
                                .replace("{count}", String(failureCount))
                                .replace("{timeout}", String(summary.timeout))
                                .replace("{failed}", String(summary.failed))
                                .replace("{other}", String(summary.other)));
                        } else {
                            retryEntries = null;
                            const label = refreshAllButton.querySelector("span");
                            if (label) label.textContent = this.i18n.homeRefreshAll;
                            refreshAllButton.setAttribute("aria-label", this.i18n.homeRefreshAll);
                        }
                    } finally {
                        if (homeRefreshBatchController === batchController) homeRefreshBatchController = null;
                        if (refreshAllButton.isConnected) {
                            refreshAllButton.disabled = false;
                            refreshAllButton.setAttribute("aria-busy", "false");
                            if (preserveRefreshFocus && document.activeElement !== refreshAllButton) {
                                refreshAllButton.focus({preventScroll: true});
                            }
                        }
                    }
                });
                bar.appendChild(refreshAllButton);
            }
            // 组件商店常驻右上角（与编辑布局并列），不再要求先进编辑态
            {
                const addButton = document.createElement("button");
                addButton.type = "button";
                addButton.className = "b3-button b3-button--text sw-home__add";
                addButton.innerHTML = '<svg><use xlink:href="#iconAdd"></use></svg><span>' + this.i18n.homeStoreTitle + '</span>';
                addButton.addEventListener("click", () => {
                    openHomeWidgetStore.call(this, device, renderPanel);
                });
                bar.appendChild(addButton);
            }
            mountFragment.appendChild(bar);

            // 时间感知问候头：让面板更有"个人主页"温度
            const now = new Date();
            const hour = now.getHours();
            const greeting = hour < 5 ? this.i18n.homeGreetingNight
                : hour < 12 ? this.i18n.homeGreetingMorning
                : hour < 14 ? this.i18n.homeGreetingNoon
                : hour < 18 ? this.i18n.homeGreetingAfternoon
                : this.i18n.homeGreetingEvening;
            const greetingEl = document.createElement("div");
            greetingEl.className = "sw-home__greeting";
            greetingEl.textContent = `${greeting}，${this.i18n.homeGreetingSuffix}`;
            mountFragment.appendChild(greetingEl);

            const body = document.createElement("div");
            body.className = "sw-home__body";
            const grid = document.createElement("div");
            grid.className = "sw-home__grid";
            if (cells.length === 0) {
                const empty = document.createElement("div");
                empty.className = "sw-home__empty";
                empty.setAttribute("role", "status");
                const emptyText = document.createElement("p");
                emptyText.textContent = this.i18n.homeEmpty;
                const openStore = document.createElement("button");
                openStore.type = "button";
                openStore.className = "b3-button b3-button--outline sw-home__empty-store";
                openStore.textContent = this.i18n.homeEmptyOpenStore;
                openStore.addEventListener("click", () => openHomeWidgetStore.call(this, device, renderPanel));
                empty.append(emptyText, openStore);
                grid.appendChild(empty);
            }
            const controllers = homeControllers;
            controllers.length = 0;

            cells.forEach(({inst, layout}) => {
                const def = defs.get(inst.moduleId);
                if (!def) return;
                // 型号迁移与解析：旧宽度档就近映射，再限定到该模块声明的型号集合
                const supported: string[] = Array.isArray(def.sizes) && def.sizes.length > 0 ? def.sizes : ["medium"];
                const sizeKey = this.isMobile ? resolveMobileHomeSize(supported) : this.migrateHomeLayoutSize(layout, supported);
                const preset = HOME_WIDGET_SIZES[sizeKey as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
                if (layout.size !== sizeKey || layout.w !== preset.w || layout.h !== preset.h) {
                    layout.size = sizeKey;
                    layout.w = preset.w;
                    layout.h = preset.h;
                    const persist = this.getHomeState();
                    const target = ((persist.layouts[device] || []) as Array<any>).find((candidate) => candidate.instanceId === inst.instanceId);
                    if (target) {
                        Object.assign(target, {size: sizeKey, w: preset.w, h: preset.h});
                        this.saveHomeState(persist);
                    }
                }

                const cell = document.createElement("section");
                cell.className = "sw-home__cell";
                cell.dataset.size = sizeKey;
                cell.dataset.moduleId = inst.moduleId;
                cell.style.gridColumn = this.isMobile ? "1 / -1" : `span ${Math.min(12, preset.w)}`;
                cell.style.gridRow = this.isMobile ? "auto" : `span ${Math.max(1, preset.h)}`;
                // 强调色：按 moduleId 稳定散列到调色板，iPad 小组件的多彩感
                if (homePalette === "auto") {
                    cell.style.setProperty("--sw-home-accent", this.homeAccents[[...inst.moduleId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % this.homeAccents.length]);
                }
                const body = document.createElement("div");
                body.className = "sw-home__cell-body";
                cell.appendChild(body);

                const controller = createHomeModuleController({
                    document: window.document,
                    container: body,
                    module: {...def},
                    collapsed: layout.collapsed === true,
                    // 秒开（D-382）：上次会话的好快照直出"缓存"态，refresh 静默更新
                    initialSnapshot: this.homePanelSnapshots.get(inst.instanceId)?.snapshot,
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
                        previousMonth: this.i18n.homeCalendarPreviousMonth,
                        nextMonth: this.i18n.homeCalendarNextMonth,
                        today: this.i18n.homeCalendarToday,
                        hasJournal: this.i18n.homeCalendarHasJournal,
                    },
                    calendarWeekdays: this.i18n.homeCalendarWeekdays,
                    onItem: (item: { label?: string; value?: string; href?: string }) => this.handleHomeItemAction(item, () => dialog.destroy()),
                    onCalendarNavigate: (direction: number) => {
                        const current = Math.trunc(Number(inst.config?.monthOffset) || 0);
                        const next = direction === 0 ? 0 : Math.min(24, Math.max(-24, current + (direction < 0 ? -1 : 1)));
                        if (next === current) return;
                        inst.config = {...(inst.config || {}), monthOffset: next};
                        const persisted = this.getHomeState();
                        const target = (persisted.instances as Array<any>).find((candidate) => candidate.instanceId === inst.instanceId);
                        if (target) {
                            target.config = {...(target.config || {}), monthOffset: next};
                            this.saveHomeState(persisted);
                        }
                        void controller?.refresh(inst.config, {force: true});
                    },
                    onToggle: () => {
                        const next = this.getHomeState();
                        const entry = ((next.layouts[device] || []) as Array<any>).find((candidate) => candidate.instanceId === inst.instanceId);
                        if (entry) {
                            entry.collapsed = !(layout.collapsed === true);
                            layout.collapsed = entry.collapsed;
                            this.saveHomeState(next);
                        }
                    },
                    read: (config: Record<string, unknown>, readOptions: Record<string, unknown>) => {
                        // 附带当前型号（尺寸感知接口）：适配器可据此裁剪条目数
                        const result = this.homeRuntime.read(inst.moduleId, device, inst.config || {}, {...readOptions, size: sizeKey});
                        // 秒开快照（D-382）：捕获最后一次好数据，面板重开时直出"缓存"态内容
                        void Promise.resolve(result).then((r: any) => {
                            const items = r?.snapshot?.items;
                            if (Array.isArray(items) && items.length > 0) {
                                this.homePanelSnapshots.set(inst.instanceId, {snapshot: r.snapshot, at: Date.now()});
                            }
                        }).catch((): undefined => undefined);
                        return result;
                    },
                    onConfig: editing ? undefined : () => {
                        // 配置即将变更：旧配置下的快照不再代表新配置的输出
                        this.homePanelSnapshots.delete(inst.instanceId);
                        openHomeConfigForm.call(this, inst, def.configSchema || [], () => renderPanel());
                    },
                    onToggleItem: (item: { label?: string; value?: string; done?: boolean }) => {
                        void (async () => {
                            const ok = await this.toggleHomeTaskBlock(item);
                            if (!ok) showMessage(this.i18n.homeTaskToggleFailed);
                            await controller.refresh(inst.config || {}, {force: true});
                        })();
                    },
                });
                if (!controller) return;
                controllers.push({moduleId: inst.moduleId, refresh: (config?: Record<string, unknown>, readOptions?: Record<string, unknown>) => controller.refresh(config, readOptions), dispose: () => controller.dispose(), cell});
                grid.appendChild(cell);

                if (editing) {
                    // 桌面端拖拽排序（dense 布局自动归位）；手机端用上移/下移按钮
                    if (!this.isMobile) {
                        cell.draggable = true;
                        cell.addEventListener("dragstart", (event) => {
                            event.dataTransfer?.setData("text/sw-home-instance", inst.instanceId);
                            event.dataTransfer!.effectAllowed = "move";
                            cell.classList.add("sw-home__cell--dragging");
                        });
                        cell.addEventListener("dragend", () => cell.classList.remove("sw-home__cell--dragging"));
                        cell.addEventListener("dragover", (event) => {
                            event.preventDefault();
                            event.dataTransfer!.dropEffect = "move";
                            cell.classList.add("sw-home__cell--dragover");
                        });
                        cell.addEventListener("dragleave", () => cell.classList.remove("sw-home__cell--dragover"));
                        cell.addEventListener("drop", (event) => {
                            event.preventDefault();
                            cell.classList.remove("sw-home__cell--dragover");
                            const draggedId = event.dataTransfer?.getData("text/sw-home-instance");
                            if (!draggedId || draggedId === inst.instanceId) return;
                            const next = this.getHomeState();
                            const list = (next.layouts[device] || []) as Array<any>;
                            const from = list.findIndex((candidate) => candidate.instanceId === draggedId);
                            const to = list.findIndex((candidate) => candidate.instanceId === inst.instanceId);
                            if (from < 0 || to < 0) return;
                            const [moved] = list.splice(from, 1);
                            list.splice(to, 0, moved);
                            next.layouts[device] = list;
                            this.saveHomeState(next);
                            renderPanel();
                        });
                    }
                    const persistLayout = (patch: Record<string, unknown>) => {
                        const next = this.getHomeState();
                        const entry = ((next.layouts[device] || []) as Array<any>).find((candidate) => candidate.instanceId === inst.instanceId);
                        if (entry) {
                            Object.assign(entry, patch);
                            next.layouts[device] = (next.layouts[device] || []) as Array<any>;
                            this.saveHomeState(next);
                        }
                    };
                    const tools = document.createElement("div");
                    tools.className = "sw-home__cell-tools";
                    const tool = (label: string, onClick: () => void) => {
                        const button = document.createElement("button");
                        button.type = "button";
                        button.className = "b3-button b3-button--text sw-home__tool";
                        button.textContent = label;
                        button.setAttribute("aria-label", label);
                        button.addEventListener("click", onClick);
                        return button;
                    };
                    const configSchema = Array.isArray(def.configSchema) ? def.configSchema : [];
                    const toolsChildren: HTMLElement[] = [];
                    if (configSchema.length > 0) {
                        const configButton = tool(this.i18n.homeConfig, () => undefined);
                        configButton.addEventListener("click", () => {
                            openHomeConfigForm.call(this, inst, configSchema, () => {
                                renderPanel();
                            });
                        });
                        toolsChildren.push(configButton);
                    }
                    const sizeButton = tool(this.i18n.homeSize, () => undefined);
                    sizeButton.addEventListener("click", () => {
                        this.openHomeSizeMenu(sizeButton, supported, sizeKey, (picked) => {
                            const preset2 = HOME_WIDGET_SIZES[picked as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
                            persistLayout({size: picked, w: preset2.w, h: preset2.h});
                            renderPanel();
                        });
                    });
                    tools.append(
                        ...toolsChildren,
                        sizeButton,
                        tool(this.i18n.homeMoveUp, () => {
                            const next = this.getHomeState();
                            const list = (next.layouts[device] || []) as Array<any>;
                            const index = list.findIndex((candidate) => candidate.instanceId === inst.instanceId);
                            if (index > 0) {
                                const [moved] = list.splice(index, 1);
                                list.splice(index - 1, 0, moved);
                                next.layouts[device] = list;
                                this.saveHomeState(next);
                                renderPanel();
                            }
                        }),
                        tool(this.i18n.homeMoveDown, () => {
                            const next = this.getHomeState();
                            const list = (next.layouts[device] || []) as Array<any>;
                            const index = list.findIndex((candidate) => candidate.instanceId === inst.instanceId);
                            if (index >= 0 && index < list.length - 1) {
                                const [moved] = list.splice(index, 1);
                                list.splice(index + 1, 0, moved);
                                next.layouts[device] = list;
                                this.saveHomeState(next);
                                renderPanel();
                            }
                        }),
                        tool(this.i18n.homeRemove, () => {
                            this.removeHomeInstance(inst.instanceId);
                            renderPanel();
                        }),
                    );
                    cell.appendChild(tools);
                }
            });

            body.appendChild(grid);

            // 首次打开播种默认实例（最近打开 + 收藏，中号），之后删除即保留删除
            if (state.instances.length === 0 && !editing) {
                const seeded = this.getHomeState();
                ["recent-documents", "favorites"].forEach((moduleId) => {
                    if (!catalogIds.has(moduleId)) return;
                    (seeded.instances as Array<any>).push({instanceId: moduleId, moduleId, enabled: true, config: {}});
                    ((seeded.layouts[device] || []) as Array<any>).push({instanceId: moduleId, x: 0, y: 0, w: 4, h: 4, collapsed: false, size: "medium"});
                });
                if ((seeded.instances as Array<any>).length > 0) {
                    this.saveHomeState(seeded);
                    renderPanel();
                    return;
                }
            }

            // 协议 v2 refreshOn：事件触发时只刷新订阅了该事件的组件（500ms 防抖；仅面板存活期）
            const eventModuleIds = new Map<TEventBus, Set<string>>();
            controllers.forEach((entry) => {
                const def = defs.get(entry.moduleId);
                (Array.isArray(def?.refreshOn) ? def.refreshOn : []).forEach((event: TEventBus) => {
                    if (!eventModuleIds.has(event)) eventModuleIds.set(event, new Set());
                    eventModuleIds.get(event)!.add(entry.moduleId);
                });
            });
            let homeRefreshTimer = 0;
            const pendingModules = new Set<string>();
            const homeFlushRefresh = () => {
                homeRefreshTimer = 0;
                if (!root.isConnected || pendingModules.size === 0) { pendingModules.clear(); return; }
                const ids = [...pendingModules];
                pendingModules.clear();
                controllers.forEach((entry) => {
                    if (ids.includes(entry.moduleId)) void entry.refresh();
                });
            };
            const homeRefreshCleanupFns: Array<() => void> = [];
            eventModuleIds.forEach((moduleIds, event) => {
                const handler = () => {
                    moduleIds.forEach((id) => pendingModules.add(id));
                    if (homeRefreshTimer) return;
                    homeRefreshTimer = window.setTimeout(homeFlushRefresh, 500);
                };
                this.eventBus.on(event as TEventBus, handler);
                homeRefreshCleanupFns.push(() => this.eventBus.off(event as TEventBus, handler));
            });
            if (homeRefreshCleanupFns.length > 0) {
                panelEventCleanup = () => homeRefreshCleanupFns.forEach((fn) => fn());
            }

            // 首开延迟首读：前两个可见候选立即读取，其余交给空闲时段；旧 WebView
            // 没有 requestIdleCallback 时回退到 80ms 阶梯，且销毁弹窗时统一清理。
            const scheduleRefresh = (entry: typeof controllers[number], index: number) => {
                const run = async () => {
                    if (!dialog.element.isConnected) return;
                    const result = await entry.refresh() as { ok?: boolean } | undefined;
                    // 协议 v2：无 open 回调时可用声明式 clickCommand（"插件名::命令key"）
                    const clickCommand = defs.get(entry.moduleId)?.clickCommand || "";
                    const open = this.homeModuleOpens.get(entry.moduleId)
                        || (clickCommand ? () => this.executeHomeCommand(clickCommand, () => undefined) : null);
                    const existing = entry.cell.querySelector(".sw-home__open");
                    if (result && result.ok === false && open) {
                        if (!existing) {
                            const button = document.createElement("button");
                            button.type = "button";
                            button.className = "b3-button b3-button--text sw-home__open";
                            button.textContent = this.i18n.homeOpenPlugin;
                            button.addEventListener("click", () => {
                                dialog.destroy();
                                open();
                            });
                            entry.cell.appendChild(button);
                        }
                    } else {
                        existing?.remove();
                    }
                };
                if (index < 2) {
                    void run();
                    return;
                }
                if (typeof IntersectionObserver === "function") {
                    const observer = new IntersectionObserver((entries, currentObserver) => {
                        if (!entries.some((candidate) => candidate.isIntersecting)) return;
                        currentObserver.disconnect();
                        const position = homeRefreshObservers.indexOf(currentObserver);
                        if (position >= 0) homeRefreshObservers.splice(position, 1);
                        void run();
                    }, {root: body, rootMargin: "120px"});
                    observer.observe(entry.cell);
                    homeRefreshObservers.push(observer);
                    return;
                }
                const idle = (window as any).requestIdleCallback;
                if (typeof idle === "function") {
                    const handle = idle((): void => { void run(); }, {timeout: 500});
                    homeRefreshTimers.push(handle);
                } else {
                    const handle = window.setTimeout((): void => { void run(); }, index * 80);
                    homeRefreshTimers.push(handle);
                }
            };
            controllers.forEach(scheduleRefresh);

            // 同一面板只建立一个对齐分钟边界的心跳；只刷新本地时钟与世界时钟，不触发网络组件。
            const clockModuleIds = new Set(["external-local-time", "external-world-clock", "external-quote-daily"]);
            if (controllers.some((entry) => clockModuleIds.has(entry.moduleId))) {
                const refreshClock = () => controllers.filter((entry) => clockModuleIds.has(entry.moduleId))
                    .forEach((entry) => { void entry.refresh(undefined, {force: true}); });
                const scheduleClock = () => {
                    if (!root.isConnected || homeClockTimer) return;
                    homeClockTimer = window.setTimeout(() => {
                        homeClockTimer = 0;
                        if (document.visibilityState !== "hidden") refreshClock();
                        scheduleClock();
                    }, millisecondsToNextMinute());
                };
                const handleVisibility = () => {
                    if (document.visibilityState !== "hidden") refreshClock();
                };
                document.addEventListener("visibilitychange", handleVisibility);
                const previousCleanup = panelEventCleanup;
                panelEventCleanup = () => {
                    previousCleanup?.();
                    document.removeEventListener("visibilitychange", handleVisibility);
                };
                scheduleClock();
            }

            // 联网生活组件采用独立低频心跳；天气最多每 15 分钟、每日放送最多每 30 分钟更新一次，切回前台时
            // 先经过 adapter/cache 判定，隐藏页面不会产生后台请求。
            const lifeModuleIds = new Set(["external-weather-open-meteo", "external-anime-bangumi", "external-hot-news-dailyhot", "external-news-newsnow", "external-news-hackernews", "external-activitywatch-time", "external-status-uptimekuma", "external-fx-frankfurter", "external-rss-miniflux"]);
            if (controllers.some((entry) => lifeModuleIds.has(entry.moduleId))) {
                const refreshLife = (force = false) => controllers.filter((entry) => lifeModuleIds.has(entry.moduleId))
                    .forEach((entry) => { void entry.refresh(undefined, force ? {force: true} : {}); });
                const scheduleLife = () => {
                    if (!root.isConnected || homeLifeTimer) return;
                    homeLifeTimer = window.setTimeout(() => {
                        homeLifeTimer = 0;
                        if (document.visibilityState !== "hidden") refreshLife(true);
                        scheduleLife();
                    }, 15 * 60 * 1000);
                };
                const handleLifeVisibility = () => {
                    if (document.visibilityState !== "hidden") refreshLife(false);
                };
                document.addEventListener("visibilitychange", handleLifeVisibility);
                const previousCleanup = panelEventCleanup;
                panelEventCleanup = () => {
                    previousCleanup?.();
                    document.removeEventListener("visibilitychange", handleLifeVisibility);
                };
                scheduleLife();
            }

            // 提示条随内容滚动；快捷入口栏固定底端（图标展示，与第一面板同步配置）
            const hint = document.createElement("div");
            hint.className = "sw-home__hint";
            const hintText = document.createElement("span");
            hintText.textContent = this.i18n.homeHintText;
            const hintLink = document.createElement("a");
            hintLink.className = "sw-home__hint-link";
            hintLink.href = "https://github.com/ai68298100/siyuan-speed-switch/blob/main/docs/widget-protocol.md";
            hintLink.target = "_blank";
            hintLink.rel = "noopener";
            hintLink.textContent = this.i18n.homeHintLink;
            hint.append(hintText, hintLink);
            body.appendChild(hint);
            mountFragment.appendChild(body);
            root.appendChild(mountFragment);

            const quickHost = document.createElement("div");
            quickHost.className = "sw-home__quick-actions sw__quick-actions";
            root.appendChild(quickHost);
            this.renderQuickActions(dialog.element, this.isMobile ? "mobile" : "desktop", null, () => dialog.destroy(), ".sw-home__quick-actions");
            quickHost.classList.add("sw__quick-actions--icons");
        };

        const handleModuleChange = () => {
            if (root.isConnected) renderPanel();
        };
        this.homeModuleChangeListeners.add(handleModuleChange);

        const originalDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            clearDeferredRefreshes();
            iconObserver?.disconnect();
            if (iconClampFrame) cancelAnimationFrame(iconClampFrame);
            homeRefreshBatchController?.abort();
            homeRefreshBatchController = null;
            homeControllers.splice(0).forEach((entry) => entry.dispose());
            panelEventCleanup?.();
            panelEventCleanup = null;
            this.homeModuleChangeListeners.delete(handleModuleChange);
            originalDestroy();
        };
        renderPanel();
        scheduleIconClamp();
}
