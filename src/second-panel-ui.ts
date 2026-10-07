// 小驴雷切 —— 第二面板（组件面板）装配链路（P1-1b 自 index.ts 原样搬移，ADR 0052）
// 本方法以 this 参数模式运行：调用方式 openSecondPanel.call(host)。
// host 契约见 SecondPanelUiHost；方法体内的局部闭包（renderPanel 与时钟/生活两条心跳、
// 拖拽排序、IntersectionObserver 懒读调度）是一个自洽运行时，本批保持原样不拆——
// 拆它属于后续批次（与 P1-2 样式层「先原样搬、再逐块治理」同一取向）。
// 注意：下列签名是从迁移前 index.ts 的类声明逐项同步而来，改宿主实现时此处须同步。
import {Dialog, showMessage} from "siyuan";
import type {EventBus, TEventBus} from "siyuan";
import {HOME_WIDGET_SIZES, PANEL_SCALE_DEFAULT, PANEL_SIZE_MIN_PX} from "./constants";
import type {HomeSizeMode, HomeWidgetSize} from "./constants";
import {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures, summarizeHomeRefreshFailures, selectHomeRefreshRetryEntries, buildHomeHealthReport, buildHomeDiagnosticSummary, formatHealthTime} from "./home-controller";
import {resolveMobileHomeSize, resolveHomeTileMaterial, enforceHomeHeroConstraint, moveLayoutEntry, moveLayoutEntryByOffset, computeEdgeScrollDelta, resolveHomeTileDefaultSize, LIFE_HEARTBEAT_MODULE_IDS} from "./home-model";
import {createHomeRuntime} from "./home-runtime";
import {createLayoutHistory, layoutSnapshotOf, pushLayoutHistory, undoLayoutHistory, redoLayoutHistory, canUndoLayoutHistory, canRedoLayoutHistory, peekUndoLabel, peekRedoLabel, reconcileLayoutSnapshot} from "./home-layout-history";
import {openHomeConfigForm} from "./home-config-form";
import {openHomeWidgetStore} from "./home-store-ui";
import {millisecondsToNextMinute, millisecondsToNextSecond} from "./local-time-model";
import {encodeSurfaceFocusSource, projectWidgetObject} from "./platform-surface-model";
import {resolvePanelSize} from "./settings-model";
import {clampOversizedIcons} from "./util";
import {mountPlatformDialogCloseHint} from "./platform-dom";
import type {ISwSettings, PlatformSurface, PlatformSurfaceChromeOptions, PlatformSurfaceContext, PlatformSurfaceLabels} from "./index";

// 空工作台只给出少量稳定、无需理解组件生态的默认入口；其余组件仍由商店按需添加。
// 这个清单同时作为“恢复默认”范围，避免把整个目录误当成默认布局。
const EMPTY_WORKBENCH_DEFAULT_IDS = ["recent-documents", "today-journal", "today-tasks"] as const;

export interface SecondPanelUiHost {
    i18n: Record<string, string>;
    isMobile: boolean;
    // T-6975：日记月探测（快跳）只读 SQL 查询
    fetchKernelJson: (url: string, options?: Record<string, unknown>) => Promise<{data?: Array<Record<string, unknown>>} | null>;
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
    openSetting(initialPanel?: string, returnTo?: PlatformSurface | null, returnContext?: PlatformSurfaceContext | null): void;
    handleHomeItemAction(item: { label?: string; value?: string; href?: string; command?: string }, close: () => void): void;
    migrateHomeLayoutSize(entry: {w?: number; h?: number; size?: string}, sizes: string[]): string;
    openHomeSizeMenu(anchor: HTMLElement, supported: string[], current: string, onPick: (size: string) => void): void;
    openPlatformSurface?(surface: PlatformSurface, returnTo?: PlatformSurface, context?: PlatformSurfaceContext | null): void;
    getAvailablePlatformSurfaces?(): PlatformSurface[];
    getPlatformSurfaceLabels?(): PlatformSurfaceLabels;
    mountPlatformChrome?(root: HTMLElement, options: PlatformSurfaceChromeOptions): HTMLElement;
    // T-6869：工作台单例守卫字段 + 跨表面导航的编辑现场 + 会话级表面记录钩子
    workbenchDialog: Dialog | null;
    workbenchResumeEditing: boolean;
    notePlatformSurfaceOpened?(surface: PlatformSurface, context?: PlatformSurfaceContext | null): void;
    removeHomeInstance(instanceId: string): void;
    renderQuickActions(container: HTMLElement, surface: "desktop" | "sidebar" | "mobile",
        searchInput: HTMLInputElement | null, close: () => void, selector?: string): void;
    resolvePanelDialogSize(settings: ISwSettings, fullscreen: boolean): {width: number; height: number};
    saveHomeState(state: { schemaVersion: number; instances: unknown[]; layouts: Record<string, unknown[]> }): void;
    toggleHomeTaskBlock(item: { value?: string; done?: boolean }): Promise<boolean>;
}

export function openSecondPanel(this: SecondPanelUiHost, context?: PlatformSurfaceContext | null) {
        if (this.getSettings().moduleVisibility?.workbench === false) {
            showMessage((this.i18n.moduleDisabledReceipt || "{x} is disabled").replace("{x}", this.i18n.moduleWorkbench || this.i18n.secondPanel || "Workbench"));
            return;
        }
        const settings = this.getSettings();
        // T-6869 单例守卫：工具栏/悬浮球/表面导航等重复入口不再叠出多个工作台，
        // 先销毁旧实例（其 destroyCallback 串行释放组件心跳与 FAB 挂起），再开新实例。
        if (this.workbenchDialog?.element.isConnected) this.workbenchDialog.destroy();
        // T-6869：会话级最近表面记录（悬浮球"恢复上次表面"数据来源）；钩子缺失时静默跳过。
        this.notePlatformSurfaceOpened?.("workbench", context);
        // T-6869 编辑现场：仅当上次经表面导航离开时是编辑态才恢复，普通打开保持查看态。
        let editing = this.workbenchResumeEditing === true;
        this.workbenchResumeEditing = false;
        const resumeEditToggleFocus = editing;
        // T-6953：布局撤销/重做——编辑会话内历史（退出编辑即释放，不新增持久化真源）。
        // layoutOpLabel 由各操作点在 renderPanel 前写入，作为压栈的操作名（按钮可读出）。
        let layoutHistory: ReturnType<typeof createLayoutHistory> | null = null;
        let layoutOpLabel = "";
        let suppressLayoutHistoryPush = false;
        const prepareLayoutMutation = () => {
            if (!layoutHistory) layoutHistory = createLayoutHistory(layoutSnapshotOf(this.getHomeState()));
        };
        const commitLayoutMutation = (next: any) => {
            prepareLayoutMutation();
            layoutHistory = pushLayoutHistory(layoutHistory!, layoutSnapshotOf(next), this.i18n.homeHistoryUpdate);
        };
        const applyLayoutSnapshot = (snapshot: any) => {
            const current = this.getHomeState();
            const next = reconcileLayoutSnapshot(snapshot, current);
            const known = new Set(this.homeRuntime.listModules(device).map((m: any) => m.moduleId));
            const gone = (next.instances as Array<any>).filter((inst: any) => !known.has(inst.moduleId));
            if (gone.length > 0) {
                const goneIds = new Set(gone.map((inst: any) => inst.instanceId));
                next.instances = (next.instances as Array<any>).filter((inst: any) => known.has(inst.moduleId));
                Object.keys(next.layouts).forEach((key) => {
                    next.layouts[key] = (next.layouts[key] as Array<any>).filter((entry: any) => !goneIds.has(entry.instanceId));
                });
            }
            this.saveHomeState(next);
            if (gone.length > 0) {
                showMessage(this.i18n.homeHistoryProviderGone.replace("{x}", String(gone.length)));
            }
            suppressLayoutHistoryPush = true;
            renderPanel();
            suppressLayoutHistoryPush = false;
        };
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
        // T-6481：面板资源释放挂宿主 destroyCallback（构造与装配同函数，用可变 holder 前置声明）。
        let releasePanel: () => void = () => undefined;
        const dialogHolder: {dialog: Dialog | null} = {dialog: null};
        const dialog = new Dialog({
            title: "",
            content: '<div class="speed-switch sw-home sw-platform-surface sw-platform-surface--workbench" data-sw-surface="workbench"></div>',
            width: `${size.width}px`,
            height: `${size.height}px`,
            destroyCallback: () => {
                if (this.workbenchDialog === dialogHolder.dialog) this.workbenchDialog = null;
                releasePanel();
            },
        });
        dialogHolder.dialog = dialog;
        this.workbenchDialog = dialog;
        dialog.element.querySelector<HTMLElement>(".b3-dialog__container")?.classList.add("sw-platform-dialog", "sw-platform-dialog--workbench");
        if (fullscreenMode) {
            dialog.element.querySelector(".b3-dialog__container")?.classList.add("sw-dialog--fullscreen");
        }
        const root = dialog.element.querySelector<HTMLElement>(".sw-home");
        if (!root) return;
        root.dataset.swSurface = "workbench";
        // T-7012：只消费进入工作台时携带的稳定对象描述符；离开时不复用旧焦点。
        const focusObjectId = context?.objectKind === "widget"
            ? context.objectId || ""
            : (context?.focusSource || "").startsWith("object:")
                ? context.focusSource.slice("object:".length)
                : "";
        const platformLabels = this.getPlatformSurfaceLabels?.();
        const navigatePlatformSurface = this.openPlatformSurface
            ? (surface: PlatformSurface) => {
                if (!dialog.element.isConnected) return;
                // T-6869 编辑现场：经表面导航离开时记录编辑态，返回工作台时恢复。
                this.workbenchResumeEditing = editing;
                const activeElement = dialog.element.ownerDocument?.activeElement as HTMLElement | null;
                const activeCell = activeElement?.closest<HTMLElement>(".sw__home__cell, .sw-home__cell");
                const focusedWidgetId = activeCell && root.contains(activeCell) ? activeCell.dataset.swObjectId || "" : "";
                dialog.destroy();
                this.openPlatformSurface?.(surface, "workbench", {
                    entry: "surface-nav",
                    ...(focusedWidgetId ? {objectKind: "widget", objectId: focusedWidgetId} : {}),
                    ...(context?.query ? {query: context.query} : {}),
                });
            }
            : undefined;
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
        // 面板闭包持有当前渲染的控制器列表，工具栏"刷新全部"可跨渲染访问
        // T-6954：健康详情——控制器附带实例 ID 与可取得的成功/尝试时间（内存态，未知即缺省）
        const homeControllers: Array<{ moduleId: string; instanceId?: string; refresh: (config?: Record<string, unknown>, readOptions?: Record<string, unknown>) => Promise<unknown>; dispose: () => void; cell: HTMLElement; clockSeconds?: boolean; health?: { lastAttemptAt?: number; lastOkAt?: number; lastFailReason?: string } }> = [];
        const homeRefreshTimers: number[] = [];
        let homeClockTimer = 0;
        let homeSecondsTimer = 0;
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
            if (homeSecondsTimer) window.clearTimeout(homeSecondsTimer);
            homeSecondsTimer = 0;
            if (homeLifeTimer) window.clearTimeout(homeLifeTimer);
            homeLifeTimer = 0;
        };

        const renderPanel = () => {
            // T-7010 重绘事务（捕获段）：重建前记录滚动锚与聚焦现场（组件卡按
            // data-sw-object-id、工具栏按钮按 data-home-action）；挂载后恢复，
            // 编辑开关/刷新全部/配置保存等整面板重绘不再跳顶丢焦点。
            const activeBefore = document.activeElement;
            const activeInside = activeBefore instanceof HTMLElement && root.contains(activeBefore) ? activeBefore : null;
            const capturedCell = activeInside?.closest<HTMLElement>(".sw-home__cell") || null;
            const capturedBarAction = activeInside?.closest<HTMLElement>("button[data-home-action]")?.dataset.homeAction || "";
            const capture = activeInside ? {
                scrollTop: root.scrollTop,
                bodyScrollTop: root.closest<HTMLElement>(".b3-dialog__body")?.scrollTop ?? -1,
                cellId: capturedCell?.dataset.swObjectId || "",
                barAction: capturedBarAction,
            } : null;
            homeRefreshBatchController?.abort();
            homeRefreshBatchController = null;
            homeControllers.splice(0).forEach((entry) => entry.dispose());
            // T-6879（T-6874b）：回执条聚合——ok/total 正常 + 失败计数；
            // 单元健康由 refresh 包装器写回 data-sw-health，此处只读 DOM 聚合。
            // T-6975：从当前偏移按 step（±1 月）向外查找最近有日记的月份（±24 钳制内），
            // 命中即应用并强制刷新；找不到给诚实回执。探测 SQL 与主读取同条件（含
            // dailynote 属性或标题前缀两种日记形态），缺失日记绝不创建。
            const jumpToNearestJournalMonth = async (targetInst: {config: Record<string, unknown>; instanceId: string}, targetController: {refresh: (config: unknown, options?: {force: boolean}) => Promise<unknown>} | null, step: number) => {
                const current = Math.trunc(Number(targetInst.config?.monthOffset) || 0);
                const stepDirection = step < 0 ? -1 : 1;
                for (let offset = current + stepDirection; offset * stepDirection <= 24; offset += stepDirection) {
                    const now = new Date();
                    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
                    const prefix = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-`;
                    const attrPrefix = `custom-dailynote-${base.getFullYear()}${String(base.getMonth() + 1).padStart(2, "0")}`;
                    try {
                        const json = await this.fetchKernelJson("/api/query/sql", {
                            stmt: `SELECT b.id FROM blocks b LEFT JOIN attributes a ON a.block_id=b.id AND a.name GLOB '${attrPrefix}[0-3][0-9]' WHERE b.type='d' AND (a.name IS NOT NULL OR b.content LIKE '${prefix}%') LIMIT 1`,
                        });
                        if ((json?.data || []).length > 0) {
                            applyJournalMonthOffset(targetInst, targetController, offset);
                            return;
                        }
                    } catch (_) {
                        break;
                    }
                }
                showMessage(this.i18n.homeCalendarJumpNone, 3000, "info");
            };
            const applyJournalMonthOffset = (targetInst: {config: Record<string, unknown>; instanceId: string}, targetController: {refresh: (config: unknown, options?: {force: boolean}) => Promise<unknown>} | null, offset: number) => {
                const next = Math.min(24, Math.max(-24, Math.trunc(Number(offset) || 0)));
                targetInst.config = {...(targetInst.config || {}), monthOffset: next};
                const persisted = this.getHomeState();
                const target = (persisted.instances as Array<any>).find((candidate) => candidate.instanceId === targetInst.instanceId);
                if (target) {
                    target.config = {...(target.config || {}), monthOffset: next};
                    this.saveHomeState(persisted);
                }
                void targetController?.refresh(targetInst.config, {force: true});
            };
            const updateWorkbenchReceipt = () => {
                const receipt = root.querySelector<HTMLElement>(".sw-home__receipt");
                if (!receipt) return;
                const cells = Array.from(root.querySelectorAll<HTMLElement>(".sw-home__cell"));
                if (cells.length === 0) {
                    receipt.remove();
                    return;
                }
                const unavailable = cells.filter((c) => c.classList.contains("sw-home__cell--unavailable")).length;
                const availableCells = cells.filter((c) => !c.classList.contains("sw-home__cell--unavailable"));
                const ok = availableCells.filter((c) => c.dataset.swHealth === "ok").length;
                const failed = availableCells.filter((c) => c.dataset.swHealth === "failed").length;
                const stale = availableCells.filter((c) => c.dataset.swHealth === "stale").length;
                const pending = availableCells.length - ok - failed - stale;
                receipt.dataset.state = failed ? "error" : pending ? "loading" : unavailable ? "blocked" : "ready";
                receipt.firstChild!.textContent = this.i18n.homeReceiptSummary
                    .replace("{ok}", String(ok))
                    .replace("{total}", String(availableCells.length))
                    + (failed > 0 ? " · " + this.i18n.homeReceiptFailed.replace("{x}", String(failed)) : "")
                    + (stale > 0 ? " · " + this.i18n.homeReceiptStale.replace("{x}", String(stale)) : "")
                    + (pending > 0 ? " · " + this.i18n.homeLoading + " " + pending : "")
                    + (unavailable > 0 ? " · " + this.i18n.homeReceiptUnavailable.replace("{x}", String(unavailable)) : "");
            };
            panelEventCleanup?.();
            panelEventCleanup = null;
            clearDeferredRefreshes();
            root.innerHTML = "";
            if (this.mountPlatformChrome && platformLabels) this.mountPlatformChrome(root, {
                surface: "workbench",
                labels: platformLabels,
                available: this.getAvailablePlatformSurfaces?.() || (this.isMobile ? ["switcher", "workbench"] : ["switcher", "workbench", "studio"]),
                context: context || null,
                status: {state: "ready", label: this.i18n.platformConnected || "Kernel connected"},
                onSettings: () => {
                    if (!dialog.element.isConnected) return;
                    const focusSource = encodeSurfaceFocusSource(dialog.element.ownerDocument?.activeElement || null);
                    dialog.destroy();
                    this.openSetting(undefined, "workbench", {
                        entry: "back", ...(context?.objectKind ? {objectKind: context.objectKind} : {}),
                        ...(context?.objectId ? {objectId: context.objectId} : {}), ...(context?.query ? {query: context.query} : {}),
                        ...(focusSource ? {focusSource} : {}),
                    });
                },
                settingsLabel: this.i18n.settings || "Settings",
                closeHint: this.i18n.platformCloseHint || "退出",
                onNavigate: navigatePlatformSurface,
                onClose: () => dialog.destroy(),
                closeLabel: this.i18n.close,
            });
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
            // T-6969 Slice 3：X 英雄位约束——每面板至多 1 个 full 档，超出降级 large
            const heroCheck = enforceHomeHeroConstraint(layoutList);
            // T-7032：当前帧必须渲染约束后的列表——写回 state 只保证下一帧，
            // 继续遍历旧引用会让本次渲染仍出现重复英雄位。
            const renderLayoutList = heroCheck.demoted > 0 ? heroCheck.list : layoutList;
            if (heroCheck.demoted > 0) {
                state.layouts[device] = heroCheck.list;
                this.saveHomeState(state);
            }
            const byId = new Map(state.instances.map((inst: any) => [inst.instanceId, inst]));
            const cells: Array<{ inst: any; layout: any }> = [];
            renderLayoutList.forEach((entry) => {
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
            // T-7010：重绘事务用 data-home-action 在重建后找回同一工具栏按钮。
            editToggle.dataset.homeAction = "edit";
            editToggle.setAttribute("aria-pressed", String(editing));
            editToggle.textContent = editing ? this.i18n.homeDone : this.i18n.homeEditLayout;
            editToggle.addEventListener("click", () => {
                editing = !editing;
                if (!editing) {
                    // T-6953：退出编辑会话释放历史
                    layoutHistory = null;
                    layoutOpLabel = "";
                }
                renderPanel();
            });
            bar.appendChild(editToggle);
            // 查看态的空态推荐/恢复同样可撤销；按钮留在工具栏，避免用户必须进入编辑态才能找回布局。
            if (!editing && layoutHistory && (canUndoLayoutHistory(layoutHistory) || canRedoLayoutHistory(layoutHistory))) {
                if (canUndoLayoutHistory(layoutHistory)) {
                    const undoButton = document.createElement("button");
                    undoButton.type = "button";
                    undoButton.className = "b3-button b3-button--text sw-home__history sw-home__history--view";
                    undoButton.dataset.homeAction = "undo";
                    undoButton.textContent = this.i18n.homeUndo;
                    const undoTarget = peekUndoLabel(layoutHistory) || this.i18n.homeHistoryUpdate;
                    undoButton.setAttribute("aria-label", this.i18n.homeUndoLabel.replace("{x}", undoTarget));
                    undoButton.title = this.i18n.homeUndoLabel.replace("{x}", undoTarget);
                    undoButton.addEventListener("click", () => {
                        const result = undoLayoutHistory(layoutHistory!);
                        if (!result.snapshot) return;
                        layoutHistory = result.history;
                        applyLayoutSnapshot(result.snapshot);
                    });
                    bar.appendChild(undoButton);
                }
                if (canRedoLayoutHistory(layoutHistory)) {
                    const redoButton = document.createElement("button");
                    redoButton.type = "button";
                    redoButton.className = "b3-button b3-button--text sw-home__history sw-home__history--view";
                    redoButton.dataset.homeAction = "redo";
                    redoButton.textContent = this.i18n.homeRedo;
                    const redoTarget = peekRedoLabel(layoutHistory) || this.i18n.homeHistoryUpdate;
                    redoButton.setAttribute("aria-label", this.i18n.homeRedoLabel.replace("{x}", redoTarget));
                    redoButton.title = this.i18n.homeRedoLabel.replace("{x}", redoTarget);
                    redoButton.addEventListener("click", () => {
                        const result = redoLayoutHistory(layoutHistory!);
                        if (!result.snapshot) return;
                        layoutHistory = result.history;
                        applyLayoutSnapshot(result.snapshot);
                    });
                    bar.appendChild(redoButton);
                }
            }
            // 一键强制刷新全部组件（绕过 3s 缓存与失败退避）；空面板时无意义，隐藏
            if (cells.length > 0) {
                const refreshAllButton = document.createElement("button");
                refreshAllButton.type = "button";
                refreshAllButton.className = "b3-button b3-button--text sw-home__refresh";
                refreshAllButton.dataset.homeAction = "refresh-all";
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
            if (editing) {
                // T-6874（RZ-4）：编辑横幅——编辑态现场可感知（拖动提示+完成按钮），
                // 完成按钮直接退出编辑态并重渲染，与工具栏开关同一状态源。
                const banner = document.createElement("div");
                banner.className = "sw-home__edit-banner";
                const bannerHint = document.createElement("span");
                bannerHint.textContent = this.i18n.homeEditingHint;
                const bannerDone = document.createElement("button");
                bannerDone.type = "button";
                bannerDone.className = "b3-button b3-button--text sw-home__edit-done";
                bannerDone.textContent = this.i18n.homeDone;
                bannerDone.addEventListener("click", () => {
                    layoutOpLabel = "";
                    editing = false;
                    layoutHistory = null;
                    renderPanel();
                });
                banner.appendChild(bannerHint);
                if (layoutHistory && canUndoLayoutHistory(layoutHistory)) {
                    const undoButton = document.createElement("button");
                    undoButton.type = "button";
                    undoButton.className = "b3-button b3-button--text sw-home__history";
                    undoButton.textContent = this.i18n.homeUndo;
                    const undoTarget = peekUndoLabel(layoutHistory) || this.i18n.homeHistoryUpdate;
                    undoButton.setAttribute("aria-label", this.i18n.homeUndoLabel.replace("{x}", undoTarget));
                    undoButton.title = this.i18n.homeUndoLabel.replace("{x}", undoTarget);
                    undoButton.addEventListener("click", () => {
                        const result = undoLayoutHistory(layoutHistory!);
                        if (!result.snapshot) return;
                        layoutHistory = result.history;
                        applyLayoutSnapshot(result.snapshot);
                    });
                    banner.appendChild(undoButton);
                }
                if (layoutHistory && canRedoLayoutHistory(layoutHistory)) {
                    const redoButton = document.createElement("button");
                    redoButton.type = "button";
                    redoButton.className = "b3-button b3-button--text sw-home__history";
                    redoButton.textContent = this.i18n.homeRedo;
                    const redoTarget = peekRedoLabel(layoutHistory) || this.i18n.homeHistoryUpdate;
                    redoButton.setAttribute("aria-label", this.i18n.homeRedoLabel.replace("{x}", redoTarget));
                    redoButton.title = this.i18n.homeRedoLabel.replace("{x}", redoTarget);
                    redoButton.addEventListener("click", () => {
                        const result = redoLayoutHistory(layoutHistory!);
                        if (!result.snapshot) return;
                        layoutHistory = result.history;
                        applyLayoutSnapshot(result.snapshot);
                    });
                    banner.appendChild(redoButton);
                }
                banner.append(bannerDone);
                mountFragment.appendChild(banner);
            }

            const body = document.createElement("div");
            body.className = "sw-home__body";
            const grid = document.createElement("div");
            grid.className = "sw-home__grid";
            // T-6969 Slice 3：编辑态抖动 chrome 的作用域类
            grid.classList.toggle("sw-home__grid--editing", editing);
            if (cells.length === 0) {
                const empty = document.createElement("div");
                empty.className = "sw-home__empty";
                empty.setAttribute("role", "status");
                // T-7033：空态分层——(a) 无任何组件源；(b) 有源未添加（推荐+恢复默认+说明）。
                const hasSources = defs.size > 0;
                const emptyText = document.createElement("p");
                emptyText.textContent = hasSources ? this.i18n.homeEmpty : this.i18n.homeEmptyNoSource;
                empty.append(emptyText);
                if (hasSources) {
                    // 默认材质/档位由组件目录声明（ADR 0091 语言指针，非第二套视觉）
                    const tierHint = document.createElement("p");
                    tierHint.className = "sw-home__hint";
                    tierHint.textContent = this.i18n.homeEmptyTierHint;
                    empty.append(tierHint);
                    const existingModules = new Set((this.getHomeState().instances as Array<any>).map((candidate: any) => candidate.moduleId));
                    const candidates = EMPTY_WORKBENCH_DEFAULT_IDS
                        .filter((moduleId) => defs.has(moduleId) && !existingModules.has(moduleId));
                    if (candidates.length > 0) {
                        const recRow = document.createElement("div");
                        recRow.className = "sw-home__empty-recs";
                        const recLabel = document.createElement("p");
                        recLabel.className = "sw-home__empty-recs-label";
                        recLabel.textContent = this.i18n.homeEmptyRecommended;
                        recRow.append(recLabel);
                        candidates.forEach((moduleId) => {
                            const candidateDef = defs.get(moduleId)!;
                            const add = document.createElement("button");
                            add.type = "button";
                            add.className = "b3-button b3-button--outline sw-home__empty-rec";
                            const candidateTitle = candidateDef.title || moduleId;
                            const availability = candidateDef.availability === "conditional" || candidateDef.availability === "external"
                                ? candidateDef.availability
                                : "ready";
                            const availabilityLabel = availability === "external"
                                ? this.i18n.homeStoreAvailabilityExternal
                                : availability === "conditional"
                                    ? this.i18n.homeStoreAvailabilityConditional
                                    : this.i18n.homeStoreAvailabilityReady;
                            add.dataset.availability = availability;
                            add.setAttribute("aria-label", `${candidateTitle} · ${availabilityLabel}`);
                            const title = document.createElement("span");
                            title.className = "sw-home__empty-rec-title";
                            title.textContent = candidateTitle;
                            const state = document.createElement("span");
                            state.className = `sw-home__empty-rec-state sw-home__empty-rec-state--${availability}`;
                            state.textContent = availabilityLabel;
                            add.append(title, state);
                            add.addEventListener("click", () => {
                                const impact = this.i18n.homeEmptyRecommendedConfirm
                                    .replace("{x}", candidateTitle)
                                    .replace("{availability}", availabilityLabel);
                                if (!confirm(impact)) return;
                                // 可取消/可回退：保留已有布局，在当前设备布局末尾添加一个默认档实例。
                                prepareLayoutMutation();
                                const next = this.getHomeState();
                                const layoutList = (next.layouts[device] || []) as Array<any>;
                                const supported: string[] = Array.isArray(candidateDef.sizes) && candidateDef.sizes.length > 0 ? candidateDef.sizes : ["medium"];
                                const sizeKey = resolveHomeTileDefaultSize(moduleId, supported, "medium");
                                const preset2 = HOME_WIDGET_SIZES[(sizeKey || "medium") as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
                                (next.instances as Array<any>).push({instanceId: moduleId, moduleId, config: {}, enabled: true});
                                layoutList.push({instanceId: moduleId, x: 0, y: 0, w: preset2.w, h: preset2.h, collapsed: false, size: sizeKey});
                                next.layouts[device] = layoutList;
                                this.saveHomeState(next);
                                commitLayoutMutation(next);
                                layoutOpLabel = this.i18n.homeHistoryUpdate;
                                renderPanel();
                            });
                            recRow.append(add);
                        });
                        empty.append(recRow);
                    }
                    // 恢复默认布局：仅补齐精选默认组件，保留当前设备已有布局；
                    // 执行前明确影响，避免把整个目录静默写入工作台。
                    const restore = document.createElement("button");
                    restore.type = "button";
                    restore.className = "b3-button b3-button--outline sw-home__empty-restore";
                    restore.textContent = this.i18n.homeEmptyRestoreDefault;
                    restore.addEventListener("click", () => {
                        const next = this.getHomeState();
                        const layoutList: Array<any> = [...((next.layouts[device] || []) as Array<any>)];
                        const instancesByModule = new Map<string, any>();
                        (next.instances as Array<any>).forEach((candidate: any) => {
                            if (!instancesByModule.has(candidate.moduleId)) instancesByModule.set(candidate.moduleId, candidate);
                        });
                        const isLaidOut = (instanceId: string) => layoutList.some((entry) => entry.instanceId === instanceId);
                        const candidates = EMPTY_WORKBENCH_DEFAULT_IDS.map((moduleId) => ({moduleId, def: defs.get(moduleId)}))
                            .filter((candidate) => candidate.def);
                        const missing = candidates.filter((candidate) => {
                            const existing = instancesByModule.get(candidate.moduleId);
                            return !existing || !isLaidOut(existing.instanceId);
                        });
                        if (missing.length === 0) {
                            showMessage(this.i18n.homeEmptyRestoreNothing);
                            return;
                        }
                        const impact = this.i18n.homeEmptyRestoreConfirm
                            .replace("{count}", String(missing.length))
                            .replace("{existing}", String(layoutList.length));
                        if (!confirm(impact)) return;
                        prepareLayoutMutation();
                        candidates.forEach(({moduleId, def: candidateDef}) => {
                            if (!candidateDef) return;
                            const existing = instancesByModule.get(moduleId);
                            const targetInstanceId = existing?.instanceId || moduleId;
                            if (isLaidOut(targetInstanceId)) return;
                            const supported: string[] = Array.isArray(candidateDef.sizes) && candidateDef.sizes.length > 0 ? candidateDef.sizes : ["medium"];
                            const sizeKey = resolveHomeTileDefaultSize(moduleId, supported, "medium");
                            const preset2 = HOME_WIDGET_SIZES[(sizeKey || "medium") as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
                            if (!existing) {
                                const restored = {instanceId: moduleId, moduleId, config: {}, enabled: true};
                                (next.instances as Array<any>).push(restored);
                                instancesByModule.set(moduleId, restored);
                            }
                            layoutList.push({instanceId: targetInstanceId, x: 0, y: 0, w: preset2.w, h: preset2.h, collapsed: false, size: sizeKey});
                        });
                        next.layouts[device] = layoutList;
                        this.saveHomeState(next);
                        commitLayoutMutation(next);
                        layoutOpLabel = this.i18n.homeHistoryUpdate;
                        renderPanel();
                    });
                    empty.append(restore);
                }
                const openStore = document.createElement("button");
                openStore.type = "button";
                openStore.className = "b3-button b3-button--outline sw-home__empty-store";
                openStore.textContent = this.i18n.homeEmptyOpenStore;
                openStore.addEventListener("click", () => openHomeWidgetStore.call(this, device, renderPanel));
                empty.append(openStore);
                grid.appendChild(empty);
            }
            const controllers = homeControllers;
            controllers.length = 0;

            cells.forEach(({inst, layout}) => {
                const def = defs.get(inst.moduleId);
                // T-7031（ADR 0101 期审计批）：provider 已卸载 = 不可用占位而非静默
                // 消失——布局条目保留（重装后原位恢复），编辑态提供移除出口。
                if (!def) {
                    const ghost = document.createElement("div");
                    ghost.className = "sw-home__cell sw-home__cell--unavailable";
                    ghost.dataset.instanceId = inst.instanceId;
                    ghost.style.gridColumn = `span min(${layout.w || 4}, 12)`;
                    const ghostTitle = document.createElement("strong");
                    ghostTitle.className = "sw-home__unavailable-title";
                    ghostTitle.textContent = this.i18n.homeCellUnavailableTitle || this.i18n.homeCellUnavailable;
                    const ghostLabel = document.createElement("p");
                    ghostLabel.className = "sw-home__hint";
                    ghostLabel.textContent = this.i18n.homeCellUnavailable;
                    ghost.append(ghostTitle, ghostLabel);
                    if (editing) {
                        const ghostRemove = document.createElement("button");
                        ghostRemove.type = "button";
                        ghostRemove.className = "b3-button b3-button--text sw-home__tool";
                        ghostRemove.textContent = this.i18n.homeRemove;
                        ghostRemove.addEventListener("click", () => {
                            this.removeHomeInstance(inst.instanceId);
                            layoutOpLabel = this.i18n.homeHistoryRemove;
                            renderPanel();
                        });
                        ghost.appendChild(ghostRemove);
                    }
                    mountFragment.appendChild(ghost);
                    return;
                }
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
                // T-6969（ADR 0091）：材质底色——目录声明的展示层属性，只换底色与文字色
                cell.classList.add(`mat-${resolveHomeTileMaterial(inst.moduleId)}`);
                cell.tabIndex = 0;
                cell.dataset.size = sizeKey;
                cell.dataset.moduleId = inst.moduleId;
                cell.dataset.swObjectId = inst.instanceId;
                cell.style.gridColumn = this.isMobile ? "1 / -1" : `span ${Math.min(12, preset.w)}`;
                cell.style.gridRow = this.isMobile ? "auto" : `span ${Math.max(1, preset.h)}`;
                // 强调色：按 moduleId 稳定散列到调色板，iPad 小组件的多彩感
                if (homePalette === "auto") {
                    cell.style.setProperty("--sw-home-accent", this.homeAccents[[...inst.moduleId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % this.homeAccents.length]);
                }
                const body = document.createElement("div");
                body.className = "sw-home__cell-body";
                cell.appendChild(body);
                // T-6890：对象描述携带实例 id、来源、说明、能力和实时健康。
                // 描述只供展示；刷新/配置/打开仍由原组件控制器执行。
                const updateCellDescription = () => {
                    const descriptor = projectWidgetObject(inst, def, cell.dataset.swHealth, this.homeModuleOpens.has(inst.moduleId));
                    if (!descriptor) return;
                    cell.dataset.swObjectStatus = descriptor.status;
                    const healthLabel = descriptor.status === "error" ? this.i18n.homeHealthFailed
                        : descriptor.status === "ready" ? this.i18n.homeHealthOk : this.i18n.homeLoading;
                    cell.setAttribute("aria-label", `${this.i18n.homeObjectTitle} · ${descriptor.title} · ${healthLabel}`);
                    const source = descriptor.source === "siyuan" ? this.i18n.homeStoreBuiltInSource
                        : descriptor.source === "plugin" ? this.i18n.homeStoreTabPlugin
                            : this.i18n.homeStorePluginSource.replace("{source}", descriptor.source);
                    const capabilities = [
                        descriptor.capabilities.includes("configure") ? this.i18n.homeConfig : "",
                        descriptor.capabilities.includes("open") ? this.i18n.homeOpenPlugin : "",
                    ].filter(Boolean);
                    const detail = [source, descriptor.subtitle, ...capabilities].filter(Boolean).join(" · ");
                    cell.setAttribute("aria-description", detail);
                    cell.title = detail;
                };
                updateCellDescription();

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
                        timeout: this.i18n.homeReasonTimeout,
                        unsupported: this.i18n.homeReasonUnsupported,
                        unregistered: this.i18n.homeReasonUnregistered,
                        backoff: this.i18n.homeReasonBackoff,
                        blocked: this.i18n.homeBlocked,
                        retry: this.i18n.homeRetry,
                        collapse: this.i18n.homeCollapse,
                        expand: this.i18n.homeExpand,
                        cached: this.i18n.homeCached,
                        staleRefreshFailed: this.i18n.homeStaleRefreshFailed,
                        updated: this.i18n.homeUpdated,
                        sourceFresh: this.i18n.homeSourceFresh,
                        sourceCached: this.i18n.homeSourceCached,
                        sourceStale: this.i18n.homeSourceStale,
                        previousMonth: this.i18n.homeCalendarPreviousMonth,
                        nextMonth: this.i18n.homeCalendarNextMonth,
                        today: this.i18n.homeCalendarToday,
                        hasJournal: this.i18n.homeCalendarHasJournal,
                        milestoneImminent: this.i18n.homeMilestoneImminent,
                        milestoneMonth: this.i18n.homeMilestoneMonth,
                        milestoneHundred: this.i18n.homeMilestoneHundred,
                        previousJournal: this.i18n.homeCalendarJumpPrev,
                        nextJournal: this.i18n.homeCalendarJumpNext,
                        periodPicker: this.i18n.homeCalendarPeriodPicker,
                        tagVirtual: this.i18n.homeTagVirtual,
                    },
                    calendarWeekdays: this.i18n.homeCalendarWeekdays,
                    onItem: (item: { label?: string; value?: string; href?: string }) => this.handleHomeItemAction(item, () => dialog.destroy()),
                    onCalendarJump: (step: number) => { void jumpToNearestJournalMonth(inst, controller, step); },
                    onCalendarPeriod: (offset: number) => { applyJournalMonthOffset(inst, controller, offset); },
                    calendarPeriodOptions: (() => {
                        const now = new Date();
                        return Array.from({length: 49}, (_unused, index) => {
                            const offset = index - 24;
                            const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
                            return {offset, label: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`};
                        });
                    })(),
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
                const health: { lastAttemptAt?: number; lastOkAt?: number; lastFailReason?: string } = {};
                controllers.push({
                    moduleId: inst.moduleId,
                    instanceId: inst.instanceId,
                    health,
                    // T-6879（T-6874b）：刷新结果回写单元健康标记（data-sw-health），
                    // 回执条据此聚合"ok/total 正常 · 失败 n"；失败单元描红边。
                    // T-6880（P2 第二批）：失败两通道——错误色边框（颜色）+ 文字 chip
                    // （attr() 渲染），并维护对象描述 aria 语义。
                    refresh: async (config?: Record<string, unknown>, readOptions?: Record<string, unknown>) => {
                        health.lastAttemptAt = Date.now();
                        cell.dataset.swHealth = "loading";
                        updateCellDescription();
                        updateWorkbenchReceipt();
                        const result = await controller.refresh(config, readOptions);
                        const ok = result?.ok === true;
                        if (ok) health.lastOkAt = health.lastAttemptAt;
                        else health.lastFailReason = String(result?.reason || "failed");
                        const stale = !ok && (result as {view?: {stale?: boolean}} | null)?.view?.stale === true;
                        cell.dataset.swHealth = ok ? "ok" : stale ? "stale" : "failed";
                        if (ok) {
                            delete cell.dataset.swHealthText;
                        } else {
                            cell.dataset.swHealthText = stale ? this.i18n.homeHealthStale : this.i18n.homeHealthFailed;
                        }
                        updateCellDescription();
                        updateWorkbenchReceipt();
                        return result;
                    },
                    dispose: () => controller.dispose(),
                    cell,
                    clockSeconds: inst.moduleId === "external-local-time" && (inst.config as Record<string, unknown> | undefined)?.showSeconds === "是",
                });
                grid.appendChild(cell);

                if (editing) {
                    // T-7030：实例标识供拖拽落点/键盘重排/重绘回焦寻址
                    cell.dataset.instanceId = inst.instanceId;
                    const commitMove = (result: {list: Array<any>; moved: boolean}) => {
                        if (!result.moved) return;
                        const next = this.getHomeState();
                        next.layouts[device] = result.list;
                        this.saveHomeState(next);
                        layoutOpLabel = this.i18n.homeHistoryMove;
                        renderPanel();
                        const fresh = root.querySelector<HTMLElement>(`.sw-home__cell[data-instance-id="${inst.instanceId}"]`);
                        fresh?.focus({preventScroll: false});
                    };
                    // 全端 Pointer 拖拽（把手触发）+落点虚影+Esc 取消+边缘自动滚动+防误触
                    // 声明——替换 HTML5 DnD；键盘重排仅桌面（手机无物理键盘）。
                    if (!this.isMobile) {
                        cell.tabIndex = 0;


                        // T-7030 切片②：键盘重排——Ctrl/Cmd+方向键移动当前卡，重绘后回焦
                        cell.addEventListener("keydown", (key) => {
                            if (!(key.ctrlKey || key.metaKey)) return;
                            const delta = key.key === "ArrowLeft" || key.key === "ArrowUp" ? -1 : key.key === "ArrowRight" || key.key === "ArrowDown" ? 1 : 0;
                            if (!delta) return;
                            key.preventDefault();
                            commitMove(moveLayoutEntryByOffset((this.getHomeState().layouts[device] || []) as Array<any>, inst.instanceId, delta));
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
                                layoutOpLabel = this.i18n.homeHistoryConfig;
                                renderPanel();
                            });
                        });
                        toolsChildren.push(configButton);
                    }
                        const dragHandle = tool(this.i18n.homeDragMove, () => undefined);
                        dragHandle.classList.add("sw-home__tool--drag");
                        toolsChildren.unshift(dragHandle);
                        let dragCleanup: (() => void) | null = null;
                        // T-7068：拖拽启动器——把手直拉与单元格长按两个入口共用同一管线
                        // （落点虚影/Escape 取消/防误触/贴缘自动滚动，均沿用 T-7030 既有契约）。
                        const beginDrag = (event: {button: number; clientX: number; clientY: number; preventDefault: () => void}) => {
                            if (dragCleanup || event.button !== 0) return;
                            event.preventDefault();
                            const startX = event.clientX;
                            const startY = event.clientY;
                            let active = false;
                            let hoverId: string | null = null;
                            let lastKnownX = startX;
                            let lastClientY = startY;
                            let edgeFrame = 0;
                            const clearDropHint = () => grid.querySelectorAll<HTMLElement>(".sw-home__cell--dragover").forEach((el) => el.classList.remove("sw-home__cell--dragover"));
                            const updateHover = (clientX: number, clientY: number) => {
                                cell.classList.add("sw-home__cell--dragging");
                                const hovered = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".sw-home__cell");
                                clearDropHint();
                                hoverId = hovered && hovered !== cell ? hovered.dataset.instanceId || null : null;
                                if (hoverId) hovered!.classList.add("sw-home__cell--dragover");
                            };
                            // T-7030 切片④：拖拽期间声明防误触（宿主左滑/右滑手势 L1 契约，
                            // 与悬浮球 data-prevent-swipe 同一语义），结束/取消即摘除。
                            const setSwipeGuard = (on: boolean) => {
                                if (on) cell.setAttribute("data-prevent-swipe", "true");
                                else cell.removeAttribute("data-prevent-swipe");
                            };
                            // T-7030 切片③：指针贴滚动容器上/下缘时逐帧自动滚动，滚动后按
                            // 最后指针位置重算落点虚影（增量计算在 home-model 纯函数）。
                            const scrollContainer = (() => {
                                let node: HTMLElement | null = grid.parentElement;
                                while (node) {
                                    if (node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0) return node;
                                    node = node.parentElement;
                                }
                                return null;
                            })();
                            const applyEdgeScroll = () => {
                                edgeFrame = 0;
                                if (!dragCleanup || !scrollContainer) return;
                                const rect = scrollContainer.getBoundingClientRect();
                                const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
                                const delta = computeEdgeScrollDelta(lastClientY - rect.top, rect.height, scrollContainer.scrollTop, maxScrollTop);
                                if (delta === 0) return;
                                scrollContainer.scrollTop += delta;
                                updateHover(lastKnownX, lastClientY);
                                if (computeEdgeScrollDelta(lastClientY - rect.top, rect.height, scrollContainer.scrollTop, maxScrollTop) !== 0) {
                                    edgeFrame = window.requestAnimationFrame(applyEdgeScroll);
                                }
                            };
                            const ensureEdgeLoop = () => {
                                if (!edgeFrame && scrollContainer) edgeFrame = window.requestAnimationFrame(applyEdgeScroll);
                            };
                            const onMove = (move: PointerEvent) => {
                                lastKnownX = move.clientX;
                                lastClientY = move.clientY;
                                if (!active && Math.hypot(move.clientX - startX, move.clientY - startY) < 6) return;
                                if (!active) setSwipeGuard(true);
                                active = true;
                                updateHover(move.clientX, move.clientY);
                                ensureEdgeLoop();
                            };
                            const finish = (commit: boolean) => {
                                window.removeEventListener("pointermove", onMove);
                                window.removeEventListener("pointerup", onUp);
                                window.removeEventListener("pointercancel", onCancel);
                                window.removeEventListener("keydown", onKey, true);
                                if (edgeFrame) window.cancelAnimationFrame(edgeFrame);
                                edgeFrame = 0;
                                clearDropHint();
                                cell.classList.remove("sw-home__cell--dragging");
                                cell.removeAttribute("data-prevent-swipe");
                                dragCleanup = null;
                                if (commit && active && hoverId && hoverId !== inst.instanceId) {
                                    commitMove(moveLayoutEntry((this.getHomeState().layouts[device] || []) as Array<any>, inst.instanceId, hoverId));
                                }
                            };
                            const onUp = () => finish(true);
                            const onCancel = () => finish(false);
                            const onKey = (key: KeyboardEvent) => {
                                if (key.key !== "Escape") return;
                                key.preventDefault();
                                key.stopPropagation();
                                finish(false);
                            };
                            window.addEventListener("pointermove", onMove);
                            window.addEventListener("pointerup", onUp);
                            window.addEventListener("pointercancel", onCancel);
                            window.addEventListener("keydown", onKey, true);
                            dragCleanup = () => finish(false);
                        };
                        dragHandle.addEventListener("pointerdown", beginDrag);
                        // T-7068：移动端长按单元格任意处进入拖拽——520ms 静置且位移 ≤6px
                        // 才触发；鼠标走把手不抢选择，工具按钮不抢点击；触发即摘除按压态。
                        let holdTimer = 0;
                        let holdOrigin: {x: number; y: number} | null = null;
                        cell.addEventListener("pointerdown", (event) => {
                            if (dragCleanup || holdTimer) return;
                            if (event.pointerType === "mouse") return;
                            if ((event.target as HTMLElement | null)?.closest(".sw-home__tool")) return;
                            holdOrigin = {x: event.clientX, y: event.clientY};
                            cell.classList.add("sw-home__cell--hold");
                            const cancelHold = () => {
                                if (!holdTimer) return;
                                window.clearTimeout(holdTimer);
                                holdTimer = 0;
                                cell.classList.remove("sw-home__cell--hold");
                                window.removeEventListener("pointermove", onHoldMove);
                                window.removeEventListener("pointerup", onHoldUp);
                                window.removeEventListener("pointercancel", onHoldUp);
                            };
                            const onHoldMove = (move: PointerEvent) => {
                                if (holdOrigin && Math.hypot(move.clientX - holdOrigin.x, move.clientY - holdOrigin.y) > 6) cancelHold();
                            };
                            const onHoldUp = () => cancelHold();
                            window.addEventListener("pointermove", onHoldMove);
                            window.addEventListener("pointerup", onHoldUp);
                            window.addEventListener("pointercancel", onHoldUp);
                            holdTimer = window.setTimeout(() => {
                                const origin = holdOrigin;
                                cancelHold();
                                if (!origin) return;
                                beginDrag({button: 0, clientX: origin.x, clientY: origin.y, preventDefault: () => undefined});
                            }, 520);
                        });
                    const sizeButton = tool(this.i18n.homeSize, () => undefined);
                    sizeButton.addEventListener("click", () => {
                        this.openHomeSizeMenu(sizeButton, supported, sizeKey, (picked) => {
                            const preset2 = HOME_WIDGET_SIZES[picked as HomeWidgetSize] || HOME_WIDGET_SIZES.medium;
                            layoutOpLabel = this.i18n.homeHistorySize;
                            persistLayout({size: picked, w: preset2.w, h: preset2.h});
                            renderPanel();
                        });
                    });
                    tools.append(
                        ...toolsChildren,
                        sizeButton,
                        tool(this.i18n.homeMoveUp, () => {
                            // T-7030：按钮/键盘/拖拽共用同一重排纯模型
                            const next = this.getHomeState();
                            const result = moveLayoutEntryByOffset((next.layouts[device] || []) as Array<any>, inst.instanceId, -1);
                            if (result.moved) {
                                next.layouts[device] = result.list;
                                this.saveHomeState(next);
                                layoutOpLabel = this.i18n.homeHistoryMove;
                                renderPanel();
                            }
                        }),
                        tool(this.i18n.homeMoveDown, () => {
                            const next = this.getHomeState();
                            const result = moveLayoutEntryByOffset((next.layouts[device] || []) as Array<any>, inst.instanceId, 1);
                            if (result.moved) {
                                next.layouts[device] = result.list;
                                this.saveHomeState(next);
                                layoutOpLabel = this.i18n.homeHistoryMove;
                                renderPanel();
                            }
                        }),
                        tool(this.i18n.homeRemove, () => {
                            this.removeHomeInstance(inst.instanceId);
                            layoutOpLabel = this.i18n.homeHistoryRemove;
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
                    const refreshHandle = window.setTimeout(() => {
                        const position = homeRefreshTimers.indexOf(refreshHandle);
                        if (position >= 0) homeRefreshTimers.splice(position, 1);
                        homeFlushRefresh();
                    }, 500);
                    homeRefreshTimer = refreshHandle;
                    // 与首开延迟刷新共用统一的待取消句柄；面板重绘或销毁时，
                    // releasePanel 必须让这条事件防抖回调一起失效，避免迟到回调
                    // 触碰已经 dispose 的 controller。
                    homeRefreshTimers.push(refreshHandle);
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
            // 开启秒显示的本地时钟实例改走独立的秒级心跳，只刷新这些实例，避免整组时钟每秒重绘。
            const clockModuleIds = new Set(["external-local-time", "external-world-clock", "external-quote-daily"]);
            const clockEntries = controllers.filter((entry) => clockModuleIds.has(entry.moduleId));
            const secondsClockEntries = clockEntries.filter((entry) => entry.clockSeconds === true);
            const slowClockEntries = clockEntries.filter((entry) => entry.clockSeconds !== true);
            const isPanelVisible = () => document.visibilityState !== "hidden";
            if (clockEntries.length > 0) {
                const refreshEntries = (entries: typeof clockEntries) => entries
                    .forEach((entry) => { void entry.refresh(undefined, {force: true}); });
                const scheduleClock = () => {
                    if (!root.isConnected || homeClockTimer || slowClockEntries.length === 0) return;
                    homeClockTimer = window.setTimeout(() => {
                        homeClockTimer = 0;
                        if (isPanelVisible()) refreshEntries(slowClockEntries);
                        scheduleClock();
                    }, millisecondsToNextMinute());
                };
                const scheduleSeconds = () => {
                    if (!root.isConnected || homeSecondsTimer || secondsClockEntries.length === 0) return;
                    homeSecondsTimer = window.setTimeout(() => {
                        homeSecondsTimer = 0;
                        if (isPanelVisible()) refreshEntries(secondsClockEntries);
                        scheduleSeconds();
                    }, millisecondsToNextSecond());
                };
                const handleVisibility = () => {
                    if (!isPanelVisible()) return;
                    refreshEntries(slowClockEntries);
                    refreshEntries(secondsClockEntries);
                };
                document.addEventListener("visibilitychange", handleVisibility);
                const previousCleanup = panelEventCleanup;
                panelEventCleanup = () => {
                    previousCleanup?.();
                    document.removeEventListener("visibilitychange", handleVisibility);
                };
                scheduleClock();
                scheduleSeconds();
            }

            // 联网生活组件采用独立低频心跳；天气最多每 15 分钟、每日放送最多每 30 分钟更新一次，切回前台时
            // 先经过 adapter/cache 判定，隐藏页面不会产生后台请求。
            // T-6971 批次⑥：列表流五组件同属 15 分钟心跳族（RSS 订阅此前漏登记）。
            // T-6967 S2：成员清单上收到 external-widget-model（商店详情「刷新」行同源消费）。
            const lifeModuleIds = new Set(LIFE_HEARTBEAT_MODULE_IDS);
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

            mountFragment.appendChild(body);
            root.appendChild(mountFragment);

            // T-7010 重绘事务（恢复段）：滚动锚立即复位；若重建吞掉了 DOM 焦点
            // （清空 innerHTML 后 activeElement 落到 body），按捕获的现场找回
            // 同一组件卡或工具栏按钮；目标已不存在时诚实放弃，不猜焦点。
            if (capture) {
                root.scrollTop = capture.scrollTop;
                const dialogBody = root.closest<HTMLElement>(".b3-dialog__body");
                if (dialogBody && capture.bodyScrollTop >= 0) dialogBody.scrollTop = capture.bodyScrollTop;
                const focusNow = document.activeElement;
                if (!(focusNow instanceof HTMLElement && root.contains(focusNow))) {
                    let restoreTarget: HTMLElement | null = null;
                    if (capture.cellId) {
                        const cellsNow = root.querySelectorAll<HTMLElement>(".sw-home__cell[data-sw-object-id]");
                        for (const candidate of cellsNow) {
                            if (candidate.dataset.swObjectId === capture.cellId) {
                                restoreTarget = candidate;
                                break;
                            }
                        }
                    } else if (capture.barAction) {
                        restoreTarget = root.querySelector<HTMLElement>(`.sw-home__bar button[data-home-action="${capture.barAction}"]`);
                    }
                    restoreTarget?.focus({preventScroll: true});
                }
            }

            // T-6953：编辑会话历史压栈——进入编辑建基线；此后每次渲染若状态有变则压入
            //（去重防刷屏），操作名来自 layoutOpLabel；撤销/重做应用时抑制压栈；
            // 刷新/读取不改变布局状态，不会污染历史。退出编辑整体释放。
            if (editing) {
                if (!layoutHistory) {
                    layoutHistory = createLayoutHistory(layoutSnapshotOf(this.getHomeState()));
                } else if (!suppressLayoutHistoryPush) {
                    layoutHistory = pushLayoutHistory(layoutHistory, layoutSnapshotOf(this.getHomeState()), layoutOpLabel || this.i18n.homeHistoryUpdate);
                }
            }
            layoutOpLabel = "";

            const quickHost = document.createElement("div");
            quickHost.className = "sw-home__quick-actions sw__quick-actions";
            root.appendChild(quickHost);
            this.renderQuickActions(dialog.element, this.isMobile ? "mobile" : "desktop", null, () => dialog.destroy(), ".sw-home__quick-actions");
            quickHost.classList.add("sw__quick-actions--icons");
            // T-6879（T-6874b）：底部回执条（ok/total 正常 · 失败 n），随刷新实时聚合
            const receipt = document.createElement("div");
            receipt.className = "sw-home__receipt";
            receipt.setAttribute("role", "status");
            receipt.appendChild(document.createElement("span"));
            // T-6954：健康详情入口——从汇总到具体组件的明细路径（复用控制器结果，零新增探测）
            const receiptDetails = document.createElement("button");
            receiptDetails.type = "button";
            receiptDetails.className = "b3-button b3-button--text sw-home__receipt-details";
            receiptDetails.textContent = this.i18n.homeReceiptDetails;
            receiptDetails.setAttribute("aria-label", this.i18n.homeHealthDetailsTitle);
            receiptDetails.addEventListener("click", () => {
                openHomeHealthDetails(receiptDetails);
            });
            receipt.appendChild(receiptDetails);
            root.appendChild(receipt);
            updateWorkbenchReceipt();

        // T-6954：健康详情弹窗——按 失败/加载中/正常 分组；定位/单项重试/复制脱敏摘要；
        // 只读控制器与单元 DOM 现状，不增加探测请求或自动重试频率。
        const openHomeHealthDetails = (returnFocus: HTMLElement | null) => {
            const diagLabels = {
                head: this.i18n.homeHealthDetailsTitle,
                instance: this.i18n.homeHealthInstance,
                status: this.i18n.homeHealthStatus,
                cached: this.i18n.homeHealthCached,
                cachedShown: this.i18n.homeHealthCachedShown,
                noCache: "——",
                lastAttempt: this.i18n.homeHealthLastAttempt,
                lastOk: this.i18n.homeHealthLastOk,
                unknown: this.i18n.homeHealthUnknown,
                failed: this.i18n.homeHealthGroupFailed,
                loading: this.i18n.homeHealthGroupLoading,
                ok: this.i18n.homeHealthGroupOk,
            };
            const dialog = new Dialog({
                title: this.i18n.homeHealthDetailsTitle,
                content: '<div class="sw-home-health"></div>',
                width: this.isMobile ? "min(560px, 94vw)" : "520px",
                destroyCallback: () => {
                    if (returnFocus?.isConnected) {
                        try {
                            returnFocus.focus({preventScroll: true});
                        } catch (_) {
                            returnFocus.focus();
                        }
                    }
                },
            });
            mountPlatformDialogCloseHint(dialog.element, this.i18n.platformCloseHint || "to close");
            const listRoot = dialog.element.querySelector<HTMLElement>(".sw-home-health");
            if (!listRoot) return;
            const collectRows = () => homeControllers.map((entry) => {
                const def = defs.get(entry.moduleId);
                return {
                    instanceId: entry.instanceId || entry.cell.dataset.swObjectId || "",
                    moduleId: entry.moduleId,
                    title: (def as any)?.title || entry.moduleId,
                    health: (entry.cell.dataset.swHealth || "loading") as "ok" | "failed" | "stale" | "loading",
                    cached: this.homePanelSnapshots.has(entry.instanceId || ""),
                    reason: entry.health?.lastFailReason || "",
                    lastAttemptAt: entry.health?.lastAttemptAt,
                    lastOkAt: entry.health?.lastOkAt,
                };
            });
            const scrollCellIntoView = (cell: HTMLElement) => {
                let scroller = cell.parentElement;
                while (scroller && scroller.scrollHeight <= scroller.clientHeight + 4 && scroller !== root) {
                    scroller = scroller.parentElement;
                }
                if (scroller && scroller !== root) {
                    const scrollerRect = scroller.getBoundingClientRect();
                    const cellRect = cell.getBoundingClientRect();
                    scroller.scrollTop = Math.max(0, scroller.scrollTop + (cellRect.top - scrollerRect.top) - scrollerRect.height / 2);
                }
            };
            // T-7011：单项重试在途登记——在途行渲染为 busy（按钮禁用+行 aria-busy），
            // 双击防护不重复触发；settle 后从集合移除并重绘列表（行落回真实分组=结果）。
            const inFlightRetries = new Set<string>();
            const renderHealthList = (): void => {
                const report = buildHomeHealthReport(collectRows());
                listRoot.textContent = "";
                const groupLabels: Record<string, string> = {
                    failed: this.i18n.homeHealthGroupFailed,
                    stale: this.i18n.homeHealthStale,
                    loading: this.i18n.homeHealthGroupLoading,
                    ok: this.i18n.homeHealthGroupOk,
                };
                (["failed", "stale", "loading", "ok"] as const).forEach((group) => {
                    const rows = report[group];
                    if (rows.length === 0) return;
                    const groupTitle = document.createElement("h4");
                    groupTitle.className = `sw-home-health__group sw-home-health__group--${group}`;
                    groupTitle.textContent = `${groupLabels[group]} · ${rows.length}`;
                    listRoot.appendChild(groupTitle);
                    rows.forEach((row) => {
                        const line = document.createElement("div");
                        line.className = `sw-home-health__row sw-home-health__row--${row.health}`;
                        const info = document.createElement("div");
                        info.className = "sw-home-health__info";
                        const name = document.createElement("span");
                        name.className = "sw-home-health__name";
                        name.textContent = row.title;
                        const meta = document.createElement("span");
                        meta.className = "sw-home-health__meta";
                        meta.textContent = [
                            row.health === "failed" && row.reasonClass ? row.reasonClass : "",
                            row.cached ? this.i18n.homeHealthCachedShown : "",
                            `${this.i18n.homeHealthLastAttempt}: ${formatHealthTime(row.lastAttemptAt, this.i18n.homeHealthUnknown)}`,
                            `${this.i18n.homeHealthLastOk}: ${formatHealthTime(row.lastOkAt, this.i18n.homeHealthUnknown)}`,
                        ].filter(Boolean).join(" · ");
                        info.append(name, meta);
                        const actions = document.createElement("div");
                        actions.className = "sw-home-health__actions";
                        const smallButton = (label: string, onClick: () => void) => {
                            const button = document.createElement("button");
                            button.type = "button";
                            button.className = "b3-button b3-button--text";
                            button.textContent = label;
                            button.setAttribute("aria-label", label);
                            button.addEventListener("click", onClick);
                            return button;
                        };
                        actions.appendChild(smallButton(this.i18n.homeHealthLocate, () => {
                            dialog.destroy();
                            const controller = homeControllers.find((c) => c.instanceId === row.instanceId);
                            const cell = controller?.cell;
                            if (!cell?.isConnected) return;
                            scrollCellIntoView(cell);
                            cell.classList.add("sw-home__cell--locate");
                            try {
                                cell.focus({preventScroll: true});
                            } catch (_) {
                                cell.focus();
                            }
                            window.setTimeout(() => cell.classList.remove("sw-home__cell--locate"), 1600);
                        }));
                        if (row.health !== "ok" && this.getSettings().homeStore?.retryFailed !== false) {
                            const retryButton = smallButton(this.i18n.homeHealthRetryOne, () => {
                                // T-7011：双击防护——在途重试不重复触发（不重复写入、不重复请求）
                                if (inFlightRetries.has(row.instanceId)) return;
                                const controller = homeControllers.find((c) => c.instanceId === row.instanceId);
                                if (!controller) return;
                                inFlightRetries.add(row.instanceId);
                                retryButton.disabled = true;
                                retryButton.textContent = this.i18n.homeRefreshing;
                                retryButton.setAttribute("aria-busy", "true");
                                line.setAttribute("aria-busy", "true");
                                void controller.refresh(undefined, {force: true})
                                    .catch((): undefined => undefined)
                                    .then((): void => {
                                        inFlightRetries.delete(row.instanceId);
                                        // settle 后重绘：行按最新健康状态落回 失败/正常 分组 = 单项结果
                                        renderHealthList();
                                    });
                            });
                            if (inFlightRetries.has(row.instanceId)) {
                                // 「刷新列表」等重绘通道也要如实呈现在途行
                                retryButton.disabled = true;
                                retryButton.textContent = this.i18n.homeRefreshing;
                                retryButton.setAttribute("aria-busy", "true");
                                line.setAttribute("aria-busy", "true");
                            }
                            actions.appendChild(retryButton);
                        }
                        actions.appendChild(smallButton(this.i18n.homeHealthCopySummary, () => {
                            const summary = buildHomeDiagnosticSummary(row, diagLabels);
                            const copied = () => showMessage(this.i18n.homeHealthCopied);
                            const failedToCopy = () => showMessage(this.i18n.homeHealthCopyFailed);
                            if (navigator.clipboard?.writeText) {
                                navigator.clipboard.writeText(summary).then(copied, failedToCopy);
                            } else {
                                failedToCopy();
                            }
                        }));
                        line.appendChild(actions);
                        listRoot.appendChild(line);
                    });
                });
                const refreshListButton = document.createElement("button");
                refreshListButton.type = "button";
                refreshListButton.className = "b3-button b3-button--text sw-home-health__refresh";
                refreshListButton.textContent = this.i18n.homeHealthRefreshList;
                refreshListButton.addEventListener("click", () => renderHealthList());
                listRoot.appendChild(refreshListButton);
            };
            renderHealthList();
        };
        };

        const handleModuleChange = () => {
            if (root.isConnected) renderPanel();
        };
        this.homeModuleChangeListeners.add(handleModuleChange);

        let panelReleased = false;
        releasePanel = () => {
            if (panelReleased) return;
            panelReleased = true;
            clearDeferredRefreshes();
            iconObserver?.disconnect();
            if (iconClampFrame) cancelAnimationFrame(iconClampFrame);
            homeRefreshBatchController?.abort();
            homeRefreshBatchController = null;
            homeControllers.splice(0).forEach((entry) => entry.dispose());
            panelEventCleanup?.();
            panelEventCleanup = null;
            this.homeModuleChangeListeners.delete(handleModuleChange);
        };
        renderPanel();
        scheduleIconClamp();
        // T-7012：widget 对象与 focusSource 的 object:<id> 形式都可作为回跳目标。
        const targetWidget = focusObjectId
            ? Array.from(root.querySelectorAll<HTMLElement>(".sw-home__cell"))
                .find((cell) => cell.dataset.swObjectId === focusObjectId)
            : null;
        if (targetWidget) {
            targetWidget.focus({preventScroll: true});
            targetWidget.scrollIntoView?.({block: "nearest"});
        } else if (resumeEditToggleFocus || context?.entry === "back") {
            // 对象被删或布局变化时回退到工作台工具栏；编辑现场仍优先恢复。
            root.querySelector<HTMLElement>(".sw-home__bar button")?.focus({preventScroll: true});
        }
}
