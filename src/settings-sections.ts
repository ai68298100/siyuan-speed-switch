// 设置页各分节的 UI 构建函数（R4 重构 D-376：自 index.ts 外迁）。
// 16 个 buildSettings*/buildFavGroupRowActions/buildQuickActionsTransferControls
// 构建函数按字节原样搬移（缩进保持类内原样）：宿主通过 this 绑定提供 i18n、
// DOM 构建器（settingItem/select/num 等）与数据访问方法，签名见 SettingsSectionsHost。
// 分节内的相互调用改为同模块直接调用（.call(this)），不再绕道宿主。
// ISwSettings/IFavoriteItem 等类型经 import type 引用（编译期擦除，无运行时循环依赖）。
import {getAllTabs, openTab, showMessage} from "siyuan";
import {logger} from "./logger";
import {DIALOG_WIDTH_MIN_PX, DIALOG_WIDTH_MAX_PX, DIALOG_HEIGHT_MIN_PX, DIALOG_HEIGHT_MAX_PX, PANEL_SCALE_MIN, PANEL_SCALE_MAX, THUMB_HEIGHT_MIN_PX, THUMB_HEIGHT_MAX_PX, MOBILE_COLUMNS_SINGLE, MOBILE_COLUMNS_DOUBLE, MOBILE_COLUMNS_AUTO, DOCUMENT_SETS_KEY, DOCUMENT_SET_IMPORT_MAX_BYTES, QUICK_ACTIONS_MAX, MRU_KEY, HISTORY_KEY, CLOSED_HISTORY_KEY, PINNED_KEY, FAV_KEY, FAV_GROUPS_KEY, SETTINGS_KEY, QUICK_ACTIONS_KEY, QUICK_ACTIONS_DEFAULTS_KEY, HOME_STATE_KEY, THUMB_CACHE_KEY, FAV_COLLAPSED_KEY} from "./constants";
import {formatStorageBytes, buildStorageUsageSummary} from "./settings-model";
import {createDocumentSet, upsertDocumentSet, removeDocumentSet, mergeDocumentSets, normalizeDocumentSets, planDocumentSetRestore, summarizeDocumentSetRestore, runDocumentSetRestore, buildDocumentSetRestoreReport} from "./document-sets";
import {mountQuickActionPicker} from "./quick-actions-ui";
import {appendQuickAction, sanitizeQuickActions} from "./quick-actions";
import {createDefaultFloatingBallConfig, normalizeFloatingBallConfig, selectFloatingBallFirstLayer, applyFloatingBallPreset, saveFloatingBallPreset, removeFloatingBallPreset, FLOATING_BALL_UI_SURFACES, FLOATING_BALL_ACTION_LIMIT, FLOATING_BALL_FIRST_LAYER_LIMIT} from "./floating-ball-model";
import {selectFloatingBallMoreActions} from "./floating-ball-panel";
import {FLOATING_BALL_SETTINGS_MAX_BYTES, buildFloatingBallSettingsRows, updateFloatingBallAction, moveFloatingBallAction, removeFloatingBallAction, restoreFloatingBallDefaults, serializeFloatingBallSettings, importFloatingBallSettings, checkFloatingBallSettingsBudget} from "./floating-ball-settings-model";
import type {PanelSizeMode, HomeSizeMode} from "./constants";
import type {ISwSettings, IFavoriteItem, IQuickAction, IQuickActionPickerCandidate, QuickActionSupport, QuickActionTarget, SortBy, QuickActionDisplay, HomePalette, DockDisplay, SidebarLayout} from "./index";
declare module "./document-sets" {
    export function normalizeDocumentSets(value: unknown, max?: number): {schemaVersion: number; sets: unknown[]; changed: boolean};
    export function createDocumentSet(name: string, entries: unknown[], options?: Record<string, unknown>): any;
    export function upsertDocumentSet(value: unknown, candidate: unknown, options?: Record<string, unknown>): any;
    export function removeDocumentSet(value: unknown, setId: string, options?: Record<string, unknown>): any;
    export function mergeDocumentSets(value: unknown, incoming: unknown, options?: Record<string, unknown>): any;
    export function planDocumentSetRestore(value: unknown, openedRootIds?: unknown, availableRootIds?: unknown, max?: number): any;
    export function summarizeDocumentSetRestore(plan: unknown, probe: unknown, execution?: {succeeded?: number; failed?: number; cancelled?: boolean}): {succeeded: number; failed: number; skipped: number; missing: number; unknown: number; available: number; cancelled: boolean; attempted: number};
    export function runDocumentSetRestore(entries: Array<{rootId: string}>, openRoot: (rootId: string, entry: unknown) => Promise<unknown> | unknown, options?: {signal?: AbortSignal; shouldContinue?: () => boolean}): Promise<{succeeded: number; failed: number; attempted: number; cancelled: boolean; results: Array<{rootId: string; ok: boolean; error?: string}>}>;
    export interface DocumentSetRestoreReportEntry {
        rootId: string;
        title: string;
        status: "opened" | "restored" | "failed" | "missing" | "pending";
        error?: string;
    }
    export interface DocumentSetRestoreReport {
        schemaVersion: number;
        generatedAt: number;
        setId: string;
        setName: string;
        counts: {succeeded: number; failed: number; skipped: number; missing: number; unknown: number; available: number; cancelled: boolean; attempted: number};
        entries: DocumentSetRestoreReportEntry[];
    }
    export function buildDocumentSetRestoreReport(plan: unknown, probe: unknown, execution?: {succeeded?: number; failed?: number; cancelled?: boolean; results?: Array<{rootId: string; ok: boolean; error?: string}>}, options?: {now?: number}): DocumentSetRestoreReport;
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

export interface SettingsSectionsHost {
    // 宿主字段
    i18n: Record<string, string>;
    isMobile: boolean;
    isUnloading: boolean;
    favCollapsed: Set<string>;
    activeDocumentSetRestoreControllers: Set<AbortController>;
    app: any;            // 思源 Plugin 基类成员，仅透传给 openTab
    data: any;
    // DOM 构建器（宿主方法，设置页与其他面板共用）
    settingItem(title: string, description: string | undefined, action: HTMLElement, column?: boolean): HTMLElement;
    select(options: Array<{value: string, label: string}>, value: string, onChange: (v: string) => void): HTMLElement;
    num(value: number, min: number, max: number, step: number, unit: string, onChange: (v: number) => void, label?: string): HTMLElement;
    notebookSelect(current: string, onPick: (id: string) => void): HTMLElement;
    switcher(checked: boolean, onChange: (v: boolean) => void): HTMLElement;
    // 行为与数据访问（宿主方法）
    clampNum(value: any, min: number, max: number, fallback: number): number;
    updateSettings(patch: Partial<ISwSettings>): void;
    getSettings(): ISwSettings;
    getDockPanels(): Array<{type: string; title: string; icon: string}>;
    getFavoriteGroupNames(): string[];
    getFavorites(): IFavoriteItem[];
    createFavoriteGroup(name: string): boolean;
    deleteFavoriteGroup(name: string): void;
    renameFavoriteGroup(from: string, to: string): void;
    reorderFavoriteGroups(source: string, target: string): void;
    reorderFavoritesInGroup(group: string, sourceKey: string, targetKey: string): void;
    saveFavCollapsed(): void;
    setFavoriteGroup(key: string, group: string): void;
    updateFABVisibility(): void;
    getQuickActions(): IQuickAction[];
    saveQuickActions(actions: IQuickAction[]): void;
    getFloatingBallActions(): IQuickAction[];
    getQuickActionSupport(action: IQuickAction, target: QuickActionTarget): QuickActionSupport;
    getQuickActionPickerCandidates(actions: IQuickAction[]): IQuickActionPickerCandidate[];
    openQuickActionIconPicker(action: IQuickAction, onPick: (icon: string) => void): void;
    renderQuickActionIconButton(button: HTMLButtonElement, icon: string): void;
    mobileOpenDoc(rootId: string): Promise<boolean>;
    getDocumentSets(): any[];
    currentDocumentSetEntries(): Array<{rootId: string; title: string}>;
    saveDocumentSet(candidate: unknown): boolean;
    probeDocumentSetEntries(entries: Array<{rootId: string; title: string}>, signal?: AbortSignal): Promise<{available: Array<{rootId: string; title: string}>; missing: Array<{rootId: string; title: string}>; unknown: Array<{rootId: string; title: string}>}>;
    saveDataDebounced(key: string): void;
    // T-6463 存储用量透明化
    measureStorageUsage(): Promise<Array<{key: string, bytes: number}>>;
}
    // ===== 设置页 · 外观：弹窗宽高、缩略图列数与高度 =====
export function buildSettingsAppearance(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        const sizeModeOptions: Array<{value: PanelSizeMode, label: string}> = [
            {value: "adaptive", label: this.i18n.panelSizeModeAdaptive},
            {value: "custom", label: this.i18n.panelSizeModeCustom},
            {value: "fullscreen", label: this.i18n.panelSizeModeFullscreen},
        ];
        wrapper.append(
            this.settingItem(this.i18n.panelSizeMode, this.i18n.panelSizeModeTip,
                this.select(sizeModeOptions, s.panelSizeMode, (v) => this.updateSettings({panelSizeMode: v as PanelSizeMode}))),
            this.settingItem(this.i18n.panelScale, this.i18n.panelScaleTip,
                this.num(s.panelScale, PANEL_SCALE_MIN, PANEL_SCALE_MAX, 5, "%", (v) => this.updateSettings({panelScale: v}), this.i18n.panelScale)),
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
export function buildSettingsBehavior(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
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
        // T-6692b Agent 受控动作灰度开关：关闭后受控写入/批量动作与执行链一并停用
        wrapper.append(this.settingItem(this.i18n.agentActionsEnabled, this.i18n.agentActionsEnabledTip,
            this.switcher(s.agentActionsEnabled, (v) => {
                this.updateSettings({agentActionsEnabled: v});
            })));
        return wrapper;
    }

    // ===== 璁剧疆椤?路 闈㈡澘锛氭樉绀烘柟寮忋€佷晶杈规爮甯冨眬銆佸悇 dock 闈㈡澘寮€鍏?=====
export function buildSettingsPanels(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
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
                })),
            this.settingItem(this.i18n.setDocks, this.i18n.setDocksTip, buildSettingsDockToggles.call(this, s), true),
        );
        return wrapper;
    }

    // dock 面板开关列表：勾选的面板出现在切换器左侧，取消的隐藏
export function buildSettingsDockToggles(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
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
export function buildSettingsHomePanel(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        const paletteOptions: Array<{value: HomePalette, label: string}> = [
            {value: "auto", label: this.i18n.setHomePaletteAuto},
            {value: "soft", label: this.i18n.setHomePaletteSoft},
            {value: "mono", label: this.i18n.setHomePaletteMono},
        ];
        const paletteRow = this.settingItem(this.i18n.setHomePalette, this.i18n.setHomePaletteTip,
            this.select(paletteOptions, s.homePalette, (v) => this.updateSettings({homePalette: v as HomePalette})));
        const modeOptions: Array<{value: HomeSizeMode, label: string}> = [
            {value: "follow", label: this.i18n.setHomeSizeModeFollow},
            {value: "adaptive", label: this.i18n.setHomeSizeModeAdaptive},
            {value: "custom", label: this.i18n.setHomeSizeModeCustom},
            {value: "fullscreen", label: this.i18n.setHomeSizeModeFullscreen},
        ];
        const modeRow = this.settingItem(this.i18n.setHomeSizeMode, this.i18n.setHomeSizeModeTip,
            this.select(modeOptions, s.homeSizeMode, (v) => this.updateSettings({homeSizeMode: v as HomeSizeMode})));
        const widthRow = this.settingItem(this.i18n.setHomeWidth, this.i18n.setHomeWidthTip,
            this.num(s.homeWidth, 480, 1920, 20, this.i18n.unitPx, (v) => this.updateSettings({homeWidth: v}), this.i18n.setHomeWidth));
        const heightRow = this.settingItem(this.i18n.setHomeHeight, this.i18n.setHomeHeightTip,
            this.num(s.homeHeight, 360, 1280, 20, this.i18n.unitPx, (v) => this.updateSettings({homeHeight: v}), this.i18n.setHomeHeight));
        wrapper.append(paletteRow, modeRow);
        if (s.homeSizeMode === "custom") {
            wrapper.append(widthRow, heightRow);
        }
        return wrapper;
    }

export function buildSettingsMobile(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        const panelNote = document.createElement("p");
        panelNote.className = "sw-settings__tip sw-settings__mobile-home-note";
        panelNote.textContent = this.i18n.mobileHomePanelFixed;
        panelNote.setAttribute("role", "note");
        wrapper.append(
            panelNote,
            this.settingItem(this.i18n.fabEnabled, this.i18n.fabEnabledTip,
                this.switcher(s.floatingBall?.enabled?.mobile ?? s.fabEnabled, (v) => {
                    const floatingBall = this.getSettings().floatingBall || {};
                    this.updateSettings({
                        fabEnabled: v,
                        floatingBall: {
                            ...floatingBall,
                            enabled: {
                                ...(floatingBall.enabled || {}),
                                mobile: v,
                            },
                        },
                    });
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
export function buildSettingsJournal(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.append(
            this.settingItem(this.i18n.journalNotebook, this.i18n.journalNotebookTip,
                this.notebookSelect(s.journalNotebook, (id) => this.updateSettings({journalNotebook: id}))),
        );
        return wrapper;
    }

    // ===== 璁剧疆椤?路 鏀惰棌锛氭柊寤哄垎缁勩€佸垎缁勯噸鍛藉悕/鍒犻櫎銆佽皟鏁存敹钘忛」鎵€灞炲垎缁?=====
    // 内容随增删实时重建，故 render 回调在内部定义后传给各渲染 helper
export function buildSettingsFavorites(this: SettingsSectionsHost, ): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__favs";
        const render = () => {
            const favorites = this.getFavorites();
            const groupNames = this.getFavoriteGroupNames();
            box.innerHTML = "";
            box.appendChild(buildSettingsFavCreateRow.call(this, render));
            if (groupNames.length > 0) {
                box.appendChild(buildSettingsFavGroupList.call(this, groupNames, favorites, render));
            }
            const ungrouped = favorites.filter((favorite) => !favorite.group);
            if (ungrouped.length > 0) {
                box.appendChild(buildSettingsFavSection.call(this, this.i18n.ungrouped, ungrouped, groupNames, render, false));
            }
        };
        render();
        return this.settingItem(this.i18n.manageFavorites, this.i18n.manageFavoritesTip, box, true);
    }

    // 鏂板缓鍒嗙粍琛岋細杈撳叆鍚嶇О鍗冲垱寤猴紙绌哄垎缁勪繚鐣欙紝鏀惰棌鏃跺彲閫夌敤锛?
export function buildSettingsFavCreateRow(this: SettingsSectionsHost, render: () => void): HTMLElement {
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
export function buildSettingsFavGroupList(this: SettingsSectionsHost, groupNames: string[], favorites: IFavoriteItem[], render: () => void): HTMLElement {
        const groupList = document.createElement("div");
        groupList.className = "sw-setting__group-list";
        groupNames.forEach((name, index) => {
            groupList.appendChild(buildSettingsFavSection.call(this, name, favorites.filter((fav) => fav.group === name), groupNames, render, true, index));
        });
        return groupList;
    }

export function buildSettingsFavSection(this: SettingsSectionsHost, name: string, items: IFavoriteItem[], groupNames: string[], render: () => void, canManage: boolean, groupIndex = -1): HTMLElement {
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
            header.append(buildFavGroupRowActions.call(this, name, render, groupNames, groupIndex));
        }
        section.appendChild(header);
        if (!collapsed) {
            const list = document.createElement("div");
            list.className = "sw-setting__fav-section-items";
            items.forEach((favorite, index) => list.appendChild(buildSettingsFavItemRow.call(this, favorite, index, items.length, groupNames, render)));
            if (items.length === 0) {
                const empty = document.createElement("div");
                empty.className = "sw-setting__fav-empty";
                empty.setAttribute("role", "status");
                empty.textContent = this.i18n.noFavorites;
                list.appendChild(empty);
            }
            section.appendChild(list);
        }
        return section;
    }

export function buildFavGroupRowActions(this: SettingsSectionsHost, name: string, render: () => void, groupNames: string[] = [], groupIndex = -1): HTMLElement {
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

export function buildSettingsFavItemRow(this: SettingsSectionsHost, favorite: IFavoriteItem, index: number, count: number, groupNames: string[], render: () => void): HTMLElement {
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

export function buildSettingsQuickActions(this: SettingsSectionsHost, ): HTMLElement {
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
            this.settingItem(this.i18n.quickTransfer, this.i18n.quickTransferTip, buildQuickActionsTransferControls.call(this, render), true),
        );
        return wrapper;
    }

export function buildQuickActionsTransferControls(this: SettingsSectionsHost, onImported: () => void, floatingBall = false): HTMLElement {
        const box = document.createElement("div");
        box.className = "sw-setting__quick-transfer";
        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.className = "b3-button b3-button--text";
        exportButton.textContent = floatingBall ? this.i18n.floatingBallExport : this.i18n.quickExport;
        exportButton.addEventListener("click", () => {
            const payload = floatingBall
                ? serializeFloatingBallSettings(this.getSettings().floatingBall, this.getQuickActions())
                : JSON.stringify(this.getQuickActions(), null, 2);
            const blob = new Blob([payload], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = floatingBall ? "siyuan-speed-switch-floating-ball.json" : "siyuan-speed-switch-quick-actions.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
        });
        const importButton = document.createElement("button");
        importButton.type = "button";
        importButton.className = "b3-button b3-button--text";
        importButton.textContent = floatingBall ? this.i18n.floatingBallImport : this.i18n.quickImport;
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "application/json,.json";
        fileInput.className = "fn__none";
        let importing = false;
        importButton.addEventListener("click", () => { if (!importing) fileInput.click(); });
        fileInput.addEventListener("change", async () => {
            const file = fileInput.files?.[0];
            if (!file || importing || this.isUnloading || !box.isConnected) return;
            importing = true;
            importButton.disabled = true;
            importButton.setAttribute("aria-busy", "true");
            try {
                if (floatingBall && Number.isFinite(file.size) && file.size > FLOATING_BALL_SETTINGS_MAX_BYTES) {
                    showMessage(this.i18n.floatingBallImportFailed);
                    return;
                }
                const text = await file.text();
                if (this.isUnloading || !box.isConnected) return;
                const parsed = JSON.parse(text);
                const result = importFloatingBallSettings(parsed, this.getSettings().floatingBall, this.getQuickActions());
                if (!result.ok) {
                    showMessage(floatingBall ? this.i18n.floatingBallImportFailed : this.i18n.quickImportFailed);
                    return;
                }
                const hasFloatingBall = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)
                    && Object.prototype.hasOwnProperty.call(parsed, "floatingBall"));
                if (result.reason === "legacy-quick-actions") {
                    this.saveQuickActions(result.quickActions as IQuickAction[]);
                    onImported();
                    showMessage(this.i18n.quickImportDone);
                    return;
                }
                if (hasFloatingBall) {
                    if (!confirm(this.i18n.floatingBallImportConfirm)) return;
                    this.updateSettings({floatingBall: result.config, fabEnabled: (result.config as any).enabled.mobile});
                }
                this.saveQuickActions(result.quickActions as IQuickAction[]);
                onImported();
                showMessage(hasFloatingBall ? this.i18n.floatingBallImportDone : this.i18n.quickImportDone);
            } catch (error) {
                logger.warn("import action settings fail", error);
                if (box.isConnected && !this.isUnloading) showMessage(floatingBall ? this.i18n.floatingBallImportFailed : this.i18n.quickImportFailed);
            } finally {
                importing = false;
                fileInput.value = "";
                importButton.disabled = false;
                importButton.removeAttribute("aria-busy");
            }
        });
        box.append(exportButton, importButton, fileInput);
        return box;
    }


export function buildSettingsDocumentSets(this: SettingsSectionsHost, ): HTMLElement {
        const wrapper = document.createElement("div");
        const guide = document.createElement("section");
        guide.className = "sw-document-set-guide";
        const guideTitle = document.createElement("strong");
        guideTitle.textContent = this.i18n.documentSetsGuideTitle;
        const guidePurpose = document.createElement("p");
        guidePurpose.textContent = this.i18n.documentSetsGuidePurpose;
        const guideSteps = document.createElement("ol");
        [
            this.i18n.documentSetsGuideStep1,
            this.i18n.documentSetsGuideStep2,
            this.i18n.documentSetsGuideStep3,
        ].forEach((text) => {
            const item = document.createElement("li");
            item.textContent = text;
            guideSteps.appendChild(item);
        });
        const guideNote = document.createElement("p");
        guideNote.className = "sw-document-set-guide__note";
        guideNote.textContent = this.i18n.documentSetsGuideNote;
        guide.append(guideTitle, guidePurpose, guideSteps, guideNote);
        const hint = document.createElement("p");
        hint.className = "sw-settings__hint";
        hint.textContent = this.i18n.documentSetsTip;
        const form = document.createElement("div");
        form.className = "sw-setting__document-set-form";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "b3-text-field fn__block";
        input.placeholder = this.i18n.documentSetNamePlaceholder;
        input.maxLength = 80;
        const save = document.createElement("button");
        save.type = "button";
        save.className = "b3-button b3-button--text";
        save.textContent = this.i18n.documentSetSave;
        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.className = "b3-button b3-button--text";
        exportButton.textContent = this.i18n.documentSetExport;
        exportButton.addEventListener("click", () => {
            const blob = new Blob([JSON.stringify({schemaVersion: 1, sets: this.getDocumentSets()}, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "siyuan-speed-switch-document-sets.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
        });
        const importButton = document.createElement("button");
        importButton.type = "button";
        importButton.className = "b3-button b3-button--text";
        importButton.textContent = this.i18n.documentSetImport;
        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = "application/json,.json";
        importInput.className = "fn__none";
        importButton.addEventListener("click", () => importInput.click());
        importInput.addEventListener("change", async () => {
            const file = importInput.files?.[0];
            if (!file) return;
            importButton.disabled = true;
            importButton.setAttribute("aria-busy", "true");
            try {
                if (Number.isFinite(file.size) && file.size > DOCUMENT_SET_IMPORT_MAX_BYTES) {
                    showMessage(this.i18n.documentSetImportFailed);
                    return;
                }
                const parsed = JSON.parse(await file.text());
                const normalized = normalizeDocumentSets(parsed);
                if (!normalized.sets.length) {
                    showMessage(this.i18n.documentSetImportFailed);
                    return;
                }
                const importConfirm = this.i18n.documentSetImportConfirm.replace("{x}", String(normalized.sets.length));
                if (!confirm(importConfirm)) return;
                const merged = mergeDocumentSets(this.data[DOCUMENT_SETS_KEY], normalized, {now: Date.now()});
                this.data[DOCUMENT_SETS_KEY] = merged.state;
                if (merged.changed) this.saveDataDebounced(DOCUMENT_SETS_KEY);
                render();
                showMessage(this.i18n.documentSetImportDone);
            } catch (error) {
                logger.warn("import document sets fail", error);
                showMessage(this.i18n.documentSetImportFailed);
            } finally {
                importInput.value = "";
                importButton.disabled = false;
                importButton.removeAttribute("aria-busy");
            }
        });
        const list = document.createElement("div");
        list.className = "sw-setting__document-sets";
        let editingSetId: string | null = null;
        const focusRenameAction = (setId: string) => {
            window.setTimeout(() => {
                const button = Array.from(list.querySelectorAll<HTMLButtonElement>("[data-document-set-rename]"))
                    .find((candidate) => candidate.dataset.documentSetRename === setId);
                if (!button || button.disabled) return;
                try {
                    button.focus({preventScroll: true});
                } catch (_) {
                    button.focus();
                }
            }, 0);
        };
        const render = () => {
            list.innerHTML = "";
            const items = this.getDocumentSets();
            if (items.length === 0) {
                list.textContent = this.i18n.documentSetEmpty;
                return;
            }
            items.forEach((item: any) => {
                const row = document.createElement("div");
                row.className = "sw-setting__document-set";
                const copy = document.createElement("div");
                copy.className = "sw-setting__document-set-copy";
                const title = document.createElement("strong");
                title.textContent = item.name;
                const meta = document.createElement("span");
                meta.textContent = `${item.entries.length} ${this.i18n.documentSetItems}`;
                if (editingSetId === item.setId) {
                    const edit = document.createElement("input");
                    edit.type = "text";
                    edit.className = "b3-text-field fn__block";
                    edit.value = item.name;
                    edit.maxLength = 80;
                    edit.setAttribute("aria-label", this.i18n.documentSetRename);
                    copy.append(edit, meta);
                    window.setTimeout(() => edit.focus(), 0);
                    const editActions = document.createElement("div");
                    editActions.className = "sw-setting__document-set-actions";
                    const finishRename = (saveChanges: boolean) => {
                        if (saveChanges) {
                            const name = edit.value.trim();
                            if (!name) {
                                edit.focus();
                                return;
                            }
                            this.saveDocumentSet({...item, name});
                        }
                        editingSetId = null;
                        render();
                        focusRenameAction(item.setId);
                    };
                    const apply = document.createElement("button");
                    apply.type = "button";
                    apply.className = "b3-button b3-button--text";
                    apply.textContent = this.i18n.confirm;
                    apply.addEventListener("click", () => finishRename(true));
                    const cancel = document.createElement("button");
                    cancel.type = "button";
                    cancel.className = "b3-button b3-button--text";
                    cancel.textContent = this.i18n.cancel;
                    cancel.addEventListener("click", () => finishRename(false));
                    edit.addEventListener("keydown", (event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            finishRename(true);
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            finishRename(false);
                        }
                    });
                    editActions.append(apply, cancel);
                    row.append(copy, editActions);
                    list.appendChild(row);
                    return;
                }
                copy.append(title, meta);
                const actions = document.createElement("div");
                actions.className = "sw-setting__document-set-actions";
                const rename = document.createElement("button");
                rename.type = "button";
                rename.className = "b3-button b3-button--text";
                rename.textContent = this.i18n.documentSetRename;
                rename.dataset.documentSetRename = item.setId;
                rename.setAttribute("aria-label", `${this.i18n.documentSetRename}: ${item.name}`);
                rename.addEventListener("click", () => { editingSetId = item.setId; render(); });
                // 恢复报告只在"确实执行过一次恢复"之后才可导出：按钮默认禁用，
                // 免得用户对着空报告点导出。报告只活在本次设置页渲染的闭包里，
                // 关闭设置页即丢弃——不落盘、不进插件数据，避免扩大持久化数据面。
                let lastRestoreReport: ReturnType<typeof buildDocumentSetRestoreReport> | null = null;
                const exportReport = document.createElement("button");
                exportReport.type = "button";
                exportReport.className = "b3-button b3-button--text";
                exportReport.textContent = this.i18n.documentSetRestoreReport;
                exportReport.disabled = true;
                exportReport.addEventListener("click", () => {
                    if (!lastRestoreReport) {
                        showMessage(this.i18n.documentSetRestoreReportNone);
                        return;
                    }
                    const blob = new Blob([JSON.stringify(lastRestoreReport, null, 2)], {type: "application/json"});
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `siyuan-speed-switch-restore-report-${lastRestoreReport.setId || "set"}.json`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 0);
                    showMessage(this.i18n.documentSetRestoreReportExported);
                });
                const restore = document.createElement("button");
                restore.type = "button";
                restore.className = "b3-button b3-button--text";
                restore.textContent = this.i18n.documentSetRestore;
                let restoreController: AbortController | null = null;
                restore.addEventListener("click", async () => {
                    if (restoreController) {
                        restoreController.abort();
                        return;
                    }
                    const opened = new Set(this.currentDocumentSetEntries().map((entry) => entry.rootId));
                    const plan = planDocumentSetRestore(item, opened, null);
                    if (!plan.pending.length) {
                        showMessage(this.i18n.documentSetRestoreNone);
                        return;
                    }
                    restore.setAttribute("aria-busy", "true");
                    restoreController = typeof AbortController === "function" ? new AbortController() : null;
                    if (restoreController) this.activeDocumentSetRestoreControllers.add(restoreController);
                    if (restoreController) restore.textContent = this.i18n.documentSetCancel;
                    else restore.disabled = true;
                    const signal = restoreController?.signal;
                    const probe = await this.probeDocumentSetEntries(plan.pending, signal);
                    if (this.isUnloading || !restore.isConnected) {
                        if (restoreController) this.activeDocumentSetRestoreControllers.delete(restoreController);
                        restoreController = null;
                        return;
                    }
                    const candidates = [...probe.available, ...probe.unknown];
                    if (!candidates.length) {
                        if (restoreController) this.activeDocumentSetRestoreControllers.delete(restoreController);
                        restoreController = null;
                        restore.textContent = this.i18n.documentSetRestore;
                        restore.disabled = false;
                        restore.removeAttribute("aria-busy");
                        showMessage(signal?.aborted ? this.i18n.documentSetRestoreCancelled : this.i18n.documentSetNoAvailable);
                        return;
                    }
                    const confirmations: string[] = [];
                    if (probe.missing.length > 0) {
                        confirmations.push(`${this.i18n.documentSetMissingConfirm} (${probe.missing.length})`);
                    }
                    if (probe.unknown.length > 0) {
                        confirmations.push(`${this.i18n.documentSetUnknownConfirm} (${probe.unknown.length})`);
                    }
                    const confirmation = confirmations.length > 0 ? confirmations.join("\n") : this.i18n.documentSetRestoreConfirm;
                    if (!confirm(confirmation)) {
                        if (restoreController) this.activeDocumentSetRestoreControllers.delete(restoreController);
                        restoreController = null;
                        restore.textContent = this.i18n.documentSetRestore;
                        restore.disabled = false;
                        restore.removeAttribute("aria-busy");
                        return;
                    }
                    const execution = await runDocumentSetRestore(candidates, async (rootId) => {
                        if (this.isUnloading || !restore.isConnected) return false;
                        return this.isMobile
                            ? await this.mobileOpenDoc(rootId)
                            : (await openTab({app: this.app, doc: {id: rootId}}), true);
                    }, {signal, shouldContinue: () => !this.isUnloading && restore.isConnected});
                    execution.results.filter((item) => !item.ok && item.error).forEach((item) => logger.warn("restore document set entry fail", item.error));
                    const cancelled = execution.cancelled || this.isUnloading || !restore.isConnected;
                    if (this.isUnloading || !restore.isConnected) {
                        if (restoreController) this.activeDocumentSetRestoreControllers.delete(restoreController);
                        restoreController = null;
                        return;
                    }
                    if (restoreController) this.activeDocumentSetRestoreControllers.delete(restoreController);
                    restoreController = null;
                    restore.textContent = this.i18n.documentSetRestore;
                    restore.disabled = false;
                    restore.removeAttribute("aria-busy");
                    const counts = summarizeDocumentSetRestore(plan, probe, {succeeded: execution.succeeded, failed: execution.failed, cancelled});
                    // 与 showMessage 同源：计数与逐项明细取自同一次执行结果，不会互相矛盾。
                    // 取消/中断同样产出报告——那正是最需要复核"哪些没走完"的场景。
                    lastRestoreReport = buildDocumentSetRestoreReport(plan, probe, {...execution, cancelled}, {now: Date.now()});
                    exportReport.disabled = false;
                    const summary = `${this.i18n.documentSetRestoreDone}: ${counts.succeeded}, ${this.i18n.documentSetRestoreFailed}: ${counts.failed}, `
                        + `${this.i18n.documentSetRestoreSkipped}: ${counts.skipped}, ${this.i18n.documentSetRestoreMissing}: ${counts.missing}`;
                    showMessage(counts.cancelled ? `${this.i18n.documentSetRestoreCancelled}: ${summary}` : summary);
                });
                const preview = document.createElement("button");
                preview.type = "button";
                preview.className = "b3-button b3-button--text";
                preview.textContent = this.i18n.documentSetPreview;
                preview.addEventListener("click", () => {
                    const opened = new Set(this.currentDocumentSetEntries().map((entry) => entry.rootId));
                    const plan = planDocumentSetRestore(item, opened, null);
                    showMessage(`${this.i18n.documentSetPreview}: ${plan.pending.length} ${this.i18n.documentSetPending}, ${plan.opened.length} ${this.i18n.documentSetOpened}`);
                });
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "b3-button b3-button--text";
                remove.textContent = this.i18n.documentSetDelete;
                remove.addEventListener("click", () => {
                    if (!confirm(this.i18n.documentSetDeleteConfirm)) return;
                    const result = removeDocumentSet(this.data[DOCUMENT_SETS_KEY], item.setId);
                    this.data[DOCUMENT_SETS_KEY] = result.state;
                    if (result.changed) this.saveDataDebounced(DOCUMENT_SETS_KEY);
                    render();
                });
                actions.append(rename, restore, exportReport, preview, remove);
                row.append(copy, actions);
                list.appendChild(row);
            });
        };
        save.addEventListener("click", () => {
            const name = input.value.trim();
            const entries = this.currentDocumentSetEntries();
            if (!entries.length) {
                showMessage(this.i18n.documentSetNoTabs);
                return;
            }
            if (!name) {
                input.focus();
                return;
            }
            const existing = this.getDocumentSets().find((item: any) => item.name === name);
            const candidate = createDocumentSet(name, entries, {setId: existing?.setId});
            if (this.saveDocumentSet(candidate)) {
                input.value = "";
                render();
                showMessage(this.i18n.documentSetSaved);
            }
        });
        form.append(input, save, exportButton, importButton, importInput);
        // 说明放操作按钮下方：先操作与列表，长说明作为随选随读的辅助内容收尾
        wrapper.append(hint, form, list, guide);
        render();
        return wrapper;
    }

    // v0.18 路径筛选（T-103）：只读列目录，供搜索筛选选择路径前缀。
    // 内核辅助函数在守卫失败、超时、非 2xx 时统一返回 null，无法区分"端点不存在"
    // 与"网络失败"，故一律按 unavailable 降级提示，且不阻塞其他筛选维度。
    // 取消通过代际标记实现：请求发出前后各比对一次，过期结果直接丢弃。
    // 真实宿主行为见 docs/path-filter-host-evidence.md（D-365）——包括"不存在的
    // 路径返回空列表而非错误"，因此无需为已删除的路径前缀设计专门分支。

// ===== T-6463 设置页 · 存储用量：各持久化 key 的近似占用（Tabliss 显式化思路） =====
const STORAGE_USAGE_KEYS: ReadonlyArray<{key: string, label: string}> = Object.freeze([
    {key: MRU_KEY, label: "最近使用页签"},
    {key: HISTORY_KEY, label: "最近打开文档"},
    {key: CLOSED_HISTORY_KEY, label: "最近关闭文档"},
    {key: PINNED_KEY, label: "置顶页签"},
    {key: FAV_KEY, label: "收藏"},
    {key: FAV_GROUPS_KEY, label: "收藏分组"},
    {key: SETTINGS_KEY, label: "插件设置"},
    {key: QUICK_ACTIONS_KEY, label: "快捷入口"},
    {key: QUICK_ACTIONS_DEFAULTS_KEY, label: "快捷入口默认值标记"},
    {key: DOCUMENT_SETS_KEY, label: "文档集"},
    {key: HOME_STATE_KEY, label: "第二面板布局"},
    {key: THUMB_CACHE_KEY, label: "缩略图缓存"},
    {key: FAV_COLLAPSED_KEY, label: "收藏分组折叠状态"},
]);

export function buildSettingsStorage(this: SettingsSectionsHost): HTMLElement {
    const root = document.createElement("div");
    root.className = "sw-settings__storage";
    const rows = document.createElement("div");
    rows.className = "sw-settings__storage-rows";
    const note = document.createElement("p");
    note.className = "sw-settings__storage-note";
    note.textContent = this.i18n.setStorageMeasuring || "统计中…";
    root.append(rows, note);
    void this.measureStorageUsage().then((entries) => {
        const summary = buildStorageUsageSummary(entries);
        rows.textContent = "";
        const totalValue = document.createElement("strong");
        totalValue.textContent = formatStorageBytes(summary.total);
        rows.appendChild(this.settingItem(
            this.i18n.setStorageTotal || "合计",
            this.i18n.setStorageApprox || "近似 UTF-8 字节数",
            totalValue,
        ));
        for (const row of summary.rows) {
            const known = STORAGE_USAGE_KEYS.find((item) => item.key === row.key);
            const value = document.createElement("span");
            value.textContent = formatStorageBytes(row.bytes);
            rows.appendChild(this.settingItem(known ? known.label : row.key, row.key, value));
        }
        note.textContent = "";
    }).catch(() => {
        note.textContent = this.i18n.homeModuleError || "统计失败";
    });
    return root;
}

/**
 * Floating-ball settings are intentionally kept beside the shared quick-action
 * editor, but use their own surface/action projection.  The persisted value is
 * always replaced with the model's normalized config so partially written
 * settings cannot leak into the runtime controllers.
 */
export function buildSettingsFloatingBall(this: SettingsSectionsHost, s: ISwSettings): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "sw-floating-ball-settings";
    const note = document.createElement("p");
    note.className = "sw-settings__hint sw-floating-ball-settings__note";
    note.textContent = this.i18n.floatingBallSettingsTip;
    wrapper.appendChild(note);

    const persist = (next: unknown) => {
        const config: any = normalizeFloatingBallConfig(next);
        if (!checkFloatingBallSettingsBudget(config, this.getQuickActions()).ok) {
            showMessage(this.i18n.floatingBallImportFailed);
            return false;
        }
        this.updateSettings({
            floatingBall: config,
            // Keep the old mobile flag in sync for installations upgraded from
            // the pre-B0 mobile-only FAB setting.
            fabEnabled: config.enabled.mobile,
        });
        return true;
    };
    const initial: any = normalizeFloatingBallConfig(s.floatingBall);
    const surfaceLabels: Record<string, string> = {
        desktop: this.i18n.floatingBallDesktop,
        sidebar: this.i18n.floatingBallSidebar,
        mobile: this.i18n.floatingBallMobile,
    };
    const toggleBox = document.createElement("div");
    toggleBox.className = "sw-floating-ball-settings__toggles";
    const toggles = new Map<string, HTMLInputElement>();
    // ADR 0072: the sidebar portal is withdrawn — settings expose desktop and
    // mobile only; legacy sidebar fields stay tolerated in the stored config.
    FLOATING_BALL_UI_SURFACES.forEach((surface) => {
        const label = surfaceLabels[surface] || surface;
        const toggle = this.switcher(Boolean(initial.enabled[surface]), (checked) => {
            const next: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
            next.enabled[surface] = checked;
            persist(next);
            renderActions();
        });
        const input = toggle.querySelector<HTMLInputElement>("input");
        if (input) {
            input.setAttribute("aria-label", label);
            input.dataset.surface = surface;
            toggles.set(surface, input);
        }
        toggleBox.appendChild(this.settingItem(
            label,
            this.i18n.floatingBallSurfaceTip,
            toggle,
        ));
    });
    wrapper.appendChild(toggleBox);

    const surfaceSelectRow = document.createElement("div");
    surfaceSelectRow.className = "sw-floating-ball-settings__surface";
    const surfaceLabel = document.createElement("span");
    surfaceLabel.className = "sw-settings__item-title";
    surfaceLabel.textContent = this.i18n.floatingBallEditSurface;
    const surfaceSelect = document.createElement("select");
    surfaceSelect.className = "b3-select fn__flex-center";
    FLOATING_BALL_UI_SURFACES.forEach((surface) => surfaceSelect.appendChild(new Option(surfaceLabels[surface] || surface, surface)));
    surfaceSelect.value = this.isMobile ? "mobile" : "desktop";
    surfaceSelect.setAttribute("aria-label", this.i18n.floatingBallEditSurface);
    surfaceSelectRow.append(surfaceLabel, surfaceSelect);
    wrapper.appendChild(surfaceSelectRow);

    const clickActionRow = document.createElement("div");
    clickActionRow.className = "sw-floating-ball-settings__click-action";
    const clickActionTitle = document.createElement("span");
    clickActionTitle.className = "sw-settings__item-title";
    clickActionTitle.textContent = this.i18n.floatingBallClickAction;
    const clickActionSelect = document.createElement("select");
    clickActionSelect.className = "b3-select";
    clickActionSelect.dataset.control = "clickAction";
    clickActionSelect.setAttribute("aria-label", this.i18n.floatingBallClickAction);
    const clickActionHint = document.createElement("span");
    clickActionHint.className = "sw-settings__hint";
    clickActionHint.textContent = this.i18n.floatingBallClickActionTip;
    clickActionRow.append(clickActionTitle, clickActionSelect, clickActionHint);
    wrapper.appendChild(clickActionRow);

    const controlsSection = document.createElement("section");
    controlsSection.className = "sw-floating-ball-settings__controls-panel";
    const controlsHeading = document.createElement("strong");
    controlsHeading.textContent = this.i18n.floatingBallAppearance;
    controlsSection.appendChild(controlsHeading);
    const controlsHint = document.createElement("p");
    controlsHint.className = "sw-settings__hint";
    controlsHint.textContent = this.i18n.floatingBallAppearanceTip;
    controlsSection.appendChild(controlsHint);
    const controlsGrid = document.createElement("div");
    controlsGrid.className = "sw-floating-ball-settings__controls-grid";
    controlsSection.appendChild(controlsGrid);
    wrapper.appendChild(controlsSection);

    const controlValues = new Map<HTMLInputElement, {output: HTMLOutputElement; format: (value: number) => string}>();
    const controlLabel = (text: string, control: HTMLElement, hint?: string, format?: (value: number) => string, host: HTMLElement = controlsGrid) => {
        const label = document.createElement("label");
        label.className = "sw-floating-ball-settings__control";
        label.classList.toggle("is-toggle", control.getAttribute("type") === "checkbox");
        const title = document.createElement("span");
        title.className = "sw-settings__item-title";
        title.textContent = text;
        label.appendChild(title);
        control.setAttribute("aria-label", text);
        if (hint) {
            const small = document.createElement("span");
            small.className = "sw-settings__hint";
            small.textContent = hint;
            label.appendChild(small);
        }
        label.appendChild(control);
        if (format) {
            const output = document.createElement("output");
            output.className = "sw-floating-ball-settings__value";
            output.setAttribute("aria-hidden", "true");
            label.appendChild(output);
            controlValues.set(control as HTMLInputElement, {output, format});
        }
        host.appendChild(label);
    };
    const edgeSelect = document.createElement("select");
    edgeSelect.className = "b3-select";
    edgeSelect.dataset.control = "edge";
    edgeSelect.append(new Option(this.i18n.floatingBallEdgeLeft, "left"), new Option(this.i18n.floatingBallEdgeRight, "right"));
    const vertical = document.createElement("input");
    vertical.type = "range";
    vertical.min = "0";
    vertical.max = "100";
    vertical.step = "1";
    vertical.dataset.control = "yRatio";
    const size = document.createElement("input");
    size.type = "range";
    size.min = "44";
    size.max = "64";
    size.step = "1";
    size.dataset.control = "size";
    const margin = document.createElement("input");
    margin.type = "range";
    margin.min = "0";
    margin.max = "32";
    margin.step = "1";
    margin.dataset.control = "marginPx";
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0.4";
    opacity.max = "1";
    opacity.step = "0.05";
    opacity.dataset.control = "idleOpacity";
    const delay = document.createElement("input");
    delay.type = "range";
    delay.min = "3000";
    delay.max = "8000";
    delay.step = "500";
    delay.dataset.control = "idleDelayMs";
    const checkbox = (key: string) => {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.control = key;
        return input;
    };
    const halfHide = checkbox("halfHide");
    const snap = checkbox("snap");
    const hideOnScroll = checkbox("hideOnScroll");
    const hideOnFullscreen = checkbox("hideOnFullscreen");
    const yieldToModals = checkbox("yieldToModals");
    const touchSlop = document.createElement("input");
    touchSlop.type = "range";
    touchSlop.min = "8";
    touchSlop.max = "12";
    touchSlop.step = "1";
    touchSlop.dataset.control = "touchSlopPx";
    const pixels = (value: number) => `${value} ${this.i18n.unitPx}`;
    controlLabel(this.i18n.floatingBallEdge, edgeSelect);
    controlLabel(this.i18n.floatingBallVertical, vertical, undefined, (value) => `${value}%`);
    controlLabel(this.i18n.floatingBallSize, size, this.i18n.floatingBallSizeTip, pixels);
    controlLabel(this.i18n.floatingBallMargin, margin, this.i18n.floatingBallMarginTip, pixels);
    controlLabel(this.i18n.floatingBallIdleOpacity, opacity, undefined, (value) => `${Math.round(value * 100)}%`);
    controlLabel(this.i18n.floatingBallIdleDelay, delay, undefined, (value) => `${value / 1000} ${this.i18n.floatingBallSeconds}`);
    controlLabel(this.i18n.floatingBallHalfHide, halfHide);
    controlLabel(this.i18n.floatingBallSnap, snap, this.i18n.floatingBallSnapTip);
    controlLabel(this.i18n.floatingBallHideOnScroll, hideOnScroll);
    controlLabel(this.i18n.floatingBallHideOnFullscreen, hideOnFullscreen);
    controlLabel(this.i18n.floatingBallYieldToModals, yieldToModals);
    const advanced = document.createElement("details");
    advanced.className = "sw-floating-ball-settings__advanced";
    const advancedSummary = document.createElement("summary");
    advancedSummary.textContent = this.i18n.floatingBallAdvanced;
    advanced.appendChild(advancedSummary);
    controlLabel(this.i18n.floatingBallTouchSlop, touchSlop, undefined, pixels, advanced);
    controlsSection.appendChild(advanced);

    let renderControls: () => void = () => undefined;
    let renderPreview: (config?: any) => void = () => undefined;
    const clickActionLabel = (action: any, config: any, surface: string) => {
        const descriptor = config.actions?.[surface]?.find((entry: any) => entry.actionId === action.id);
        if (descriptor?.label) return descriptor.label;
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
            outline: this.i18n.quickGlobalOutline,
            bookmark: this.i18n.quickGlobalBookmark,
            tag: this.i18n.quickGlobalTag,
            inbox: this.i18n.quickGlobalInbox,
            backlinks: this.i18n.quickGlobalBacklinks,
            recentDocs: this.i18n.quickGlobalRecentDocs,
            recentClosed: this.i18n.quickGlobalRecentClosed,
            riffCard: this.i18n.quickGlobalRiffCard,
            editReadonly: this.i18n.quickGlobalEditReadonly,
            "sync-now": this.i18n.quickBuiltinSyncNow,
            "insert-template": this.i18n.quickBuiltinInsertTemplate,
            "cycle-doc-set": this.i18n.quickBuiltinCycleDocSet,
            "cycle-ball-preset": this.i18n.quickBuiltinCycleBallPreset,
        };
        return builtinLabels[action.value] || action.label || action.id;
    };
    const renderClickActionOptions = (config: any, surface: string) => {
        const current = config.clickAction?.[surface] || "switcher";
        const catalog = this.getFloatingBallActions();
        const options: Array<{value: string; label: string}> = [
            {value: "switcher", label: this.i18n.floatingBallClickSwitcher},
            {value: "__floating-ball-more__", label: this.i18n.floatingBallClickMore},
        ];
        const seen = new Set(options.map((option) => option.value));
        catalog.forEach((action: any) => {
            if (!action?.id || seen.has(action.id)) return;
            if (this.getQuickActionSupport(action, surface as QuickActionTarget) === "unsupported") return;
            seen.add(action.id);
            options.push({value: action.id, label: clickActionLabel(action, config, surface)});
        });
        if (!seen.has(current)) {
            const descriptor = config.actions?.[surface]?.find((entry: any) => entry.actionId === current);
            options.push({value: current, label: descriptor?.label || current});
        }
        clickActionSelect.innerHTML = "";
        options.forEach((option) => clickActionSelect.appendChild(new Option(option.label, option.value)));
        clickActionSelect.value = current;
    };
    const renderControlValues = () => controlValues.forEach(({output, format}, input) => {
        const text = format(Number(input.value));
        output.value = text;
        input.setAttribute("aria-valuetext", text);
    });
    const updateControlConfig = (mutate: (next: any, surface: "desktop" | "sidebar" | "mobile") => void) => {
        const current: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
        mutate(current, surfaceSelect.value as "desktop" | "sidebar" | "mobile");
        persist(current);
        renderControls();
        renderActions();
    };
    edgeSelect.addEventListener("change", () => updateControlConfig((next, surface) => {
        next.position[surface].edge = edgeSelect.value;
        delete next.position[surface].xRatio;
    }));
    const rangeControl = (input: HTMLInputElement, mutate: (next: any, surface: "desktop" | "sidebar" | "mobile") => void) => {
        input.addEventListener("input", () => {
            if (input.disabled) return;
            const draft: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
            mutate(draft, surfaceSelect.value as "desktop" | "sidebar" | "mobile");
            renderControlValues();
            renderPreview(normalizeFloatingBallConfig(draft));
        });
        input.addEventListener("change", () => { if (!input.disabled) updateControlConfig(mutate); });
    };
    rangeControl(vertical, (next, surface) => { next.position[surface].yRatio = Number(vertical.value) / 100; });
    rangeControl(size, (next) => { next.appearance.size = Number(size.value); });
    rangeControl(margin, (next) => { next.appearance.marginPx = Number(margin.value); });
    rangeControl(opacity, (next) => { next.appearance.idleOpacity = Number(opacity.value); });
    rangeControl(delay, (next) => { next.appearance.idleDelayMs = Number(delay.value); });
    rangeControl(touchSlop, (next) => { next.behavior.touchSlopPx = Number(touchSlop.value); });
    halfHide.addEventListener("change", () => updateControlConfig((next) => { next.appearance.halfHide = halfHide.checked; }));
    snap.addEventListener("change", () => updateControlConfig((next) => { next.behavior.snap = snap.checked; }));
    hideOnScroll.addEventListener("change", () => updateControlConfig((next) => { next.behavior.hideOnScroll = hideOnScroll.checked; }));
    hideOnFullscreen.addEventListener("change", () => updateControlConfig((next) => { next.behavior.hideOnFullscreen = hideOnFullscreen.checked; }));
    yieldToModals.addEventListener("change", () => updateControlConfig((next) => { next.behavior.yieldToModals = yieldToModals.checked; }));
    clickActionSelect.addEventListener("change", () => updateControlConfig((next, surface) => {
        next.clickAction[surface] = clickActionSelect.value;
    }));
    const restoreAppearance = document.createElement("button");
    restoreAppearance.type = "button";
    restoreAppearance.className = "b3-button b3-button--text sw-floating-ball-settings__restore-appearance";
    restoreAppearance.textContent = this.i18n.floatingBallRestoreAppearance;
    restoreAppearance.addEventListener("click", () => {
        if (!confirm(this.i18n.floatingBallRestoreAppearanceConfirm)) return;
        const defaults = createDefaultFloatingBallConfig();
        updateControlConfig((next) => {
            next.appearance = defaults.appearance;
            next.behavior = defaults.behavior;
        });
        restoreAppearance.focus();
    });
    controlsSection.appendChild(restoreAppearance);

    const preview = document.createElement("section");
    preview.className = "sw-floating-ball-settings__preview";
    preview.setAttribute("aria-label", this.i18n.floatingBallPreview);
    const previewTitle = document.createElement("strong");
    previewTitle.textContent = this.i18n.floatingBallPreview;
    const previewSurfaceChip = document.createElement("span");
    previewSurfaceChip.className = "sw-floating-ball-settings__surface-chip";
    previewSurfaceChip.setAttribute("aria-hidden", "true");
    const previewStage = document.createElement("div");
    previewStage.className = "sw-floating-ball-settings__preview-stage";
    const previewStatus = document.createElement("p");
    previewStatus.className = "sw-settings__hint";
    previewStatus.setAttribute("role", "status");
    previewStatus.setAttribute("aria-live", "polite");
    previewStatus.textContent = this.i18n.floatingBallPreviewTip;
    const previewMoreSummary = document.createElement("span");
    previewMoreSummary.className = "sw-settings__hint";
    preview.append(previewTitle, previewSurfaceChip, previewStage, previewMoreSummary, previewStatus);
    wrapper.insertBefore(preview, controlsSection);

    const actionSection = document.createElement("section");
    actionSection.className = "sw-floating-ball-settings__actions";
    const actionHeading = document.createElement("div");
    actionHeading.className = "sw-floating-ball-settings__actions-heading";
    const heading = document.createElement("strong");
    heading.textContent = this.i18n.floatingBallActions;
    actionHeading.appendChild(heading);
    const actionHint = document.createElement("span");
    actionHint.className = "sw-settings__hint";
    actionHint.textContent = this.i18n.floatingBallActionsTip;
    actionHeading.appendChild(actionHint);
    actionSection.appendChild(actionHeading);
    const actionList = document.createElement("div");
    actionList.className = "sw-floating-ball-settings__list";
    actionSection.appendChild(actionList);
    wrapper.appendChild(actionSection);

    // T-6803 场景预设：命名保存当前动作布局与主点击，一键应用/删除/循环
    const presetSection = document.createElement("section");
    presetSection.className = "sw-floating-ball-settings__presets";
    const presetHeading = document.createElement("strong");
    presetHeading.textContent = this.i18n.floatingBallPresets;
    const presetHint = document.createElement("p");
    presetHint.className = "sw-settings__hint";
    presetHint.textContent = this.i18n.floatingBallPresetsTip;
    const presetRow = document.createElement("div");
    presetRow.className = "sw-floating-ball-settings__preset-row";
    const presetName = document.createElement("input");
    presetName.type = "text";
    presetName.className = "b3-text-field";
    presetName.maxLength = 24;
    presetName.placeholder = this.i18n.floatingBallPresetName;
    presetName.setAttribute("aria-label", this.i18n.floatingBallPresetName);
    const presetSave = document.createElement("button");
    presetSave.type = "button";
    presetSave.className = "b3-button b3-button--text";
    presetSave.textContent = this.i18n.floatingBallPresetSave;
    presetRow.append(presetName, presetSave);
    const presetList = document.createElement("div");
    presetList.className = "sw-floating-ball-settings__preset-list";
    presetSection.append(presetHeading, presetHint, presetRow, presetList);
    wrapper.appendChild(presetSection);

    const renderPresets = () => {
        const config: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
        presetList.textContent = "";
        const presets: any[] = Array.isArray(config.presets) ? config.presets : [];
        if (!presets.length) {
            const empty = document.createElement("p");
            empty.className = "sw-settings__hint";
            empty.textContent = this.i18n.floatingBallPresetEmpty;
            presetList.appendChild(empty);
            return;
        }
        presets.forEach((preset: any) => {
            const row = document.createElement("div");
            row.className = "sw-floating-ball-settings__preset-item" + (preset.id === config.currentPresetId ? " is-current" : "");
            const name = document.createElement("span");
            name.className = "sw-floating-ball-settings__preset-name";
            name.textContent = preset.name;
            const apply = document.createElement("button");
            apply.type = "button";
            apply.className = "b3-button b3-button--text";
            apply.textContent = this.i18n.floatingBallPresetApply;
            apply.addEventListener("click", () => {
                const result = applyFloatingBallPreset(this.getSettings().floatingBall, preset.id);
                if (!result.preset) return;
                if (persist(result.config)) {
                    renderActions();
                    renderPresets();
                }
            });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "b3-button b3-button--text";
            remove.textContent = this.i18n.floatingBallPresetDelete;
            remove.addEventListener("click", () => {
                const result = removeFloatingBallPreset(this.getSettings().floatingBall, preset.id);
                if (persist(result.config)) {
                    renderActions();
                    renderPresets();
                }
            });
            row.append(name, apply, remove);
            presetList.appendChild(row);
        });
    };
    presetSave.addEventListener("click", () => {
        const result = saveFloatingBallPreset(this.getSettings().floatingBall, presetName.value);
        if (!result.preset) return;
        if (persist(result.config)) {
            presetName.value = "";
            renderActions();
            renderPresets();
        }
    });

    renderPreview = (draft?: any) => {
        const surface = surfaceSelect.value as "desktop" | "sidebar" | "mobile";
        const config: any = draft || normalizeFloatingBallConfig(this.getSettings().floatingBall);
        const catalog = this.getFloatingBallActions();
        const support = {resolveSupport: (action: IQuickAction, target: string) => this.getQuickActionSupport(action, target as QuickActionTarget)};
        const position = config.position[surface];
        const sizePx = surface === "sidebar" ? 44 : config.appearance.size;
        const marginPx = config.appearance.marginPx ?? 8;
        const xRatio = !config.behavior.snap && typeof position.xRatio === "number" ? position.xRatio : position.edge === "left" ? 0 : 1;
        const direction = xRatio <= 0.5 ? "right" : "left";
        // Resolve proportional coordinates without measuring layout on each input.
        const coordinate = (ratio: number, extra = 0) => `calc(${ratio * 100}% + ${(1 - 2 * ratio) * (marginPx + sizePx / 2) + extra}px)`;
        previewStage.innerHTML = "";
        previewSurfaceChip.textContent = surfaceLabels[surface] || surface;
        previewStage.dataset.surface = surface;
        previewStage.dataset.edge = position.edge;
        previewStage.dataset.direction = direction;
        previewStage.dataset.snap = String(config.behavior.snap);
        previewStage.dataset.halfHide = String(config.appearance.halfHide && (config.behavior.snap || position.xRatio === undefined));
        previewStage.classList.toggle("is-disabled", !config.enabled[surface]);
        const makePreviewButton = (action: {actionId?: string; id?: string; label?: string}, ball = false) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = ball ? "sw-floating-ball-settings__preview-ball" : "b3-button b3-button--outline";
            button.dataset.actionId = action.actionId || action.id;
            button.textContent = action.label;
            button.setAttribute("aria-label", action.label);
            button.title = action.label;
            button.addEventListener("click", () => {
                previewStatus.textContent = this.i18n.floatingBallPreviewResult.replace("{x}", action.label);
            });
            return button;
        };
        const previewActions = document.createElement("div");
        previewActions.className = "sw-floating-ball-settings__preview-actions";
        const ball = makePreviewButton({id: "switcher", label: this.i18n.quickBuiltinSwitcher}, true);
        ball.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use href="#iconLayout"></use></svg>';
        ball.style.width = `${sizePx}px`;
        ball.style.height = `${sizePx}px`;
        ball.style.left = coordinate(xRatio);
        ball.style.top = coordinate(position.yRatio);
        ball.style.opacity = String(config.appearance.idleOpacity);
        const firstLayer = selectFloatingBallFirstLayer(config, surface, catalog, support);
        // The simulated ball already supplies the switcher path, including the
        // empty-config fallback. Do not display a second switcher in its targets.
        const targets = firstLayer.filter((action: any) => action.id !== "switcher");
        targets.forEach((action: any) => previewActions.appendChild(makePreviewButton({
            ...action, label: action.kind === "more" ? this.i18n.floatingBallMore : action.label,
        })));
        previewActions.style.left = coordinate(xRatio, (sizePx / 2 + 8) * (direction === "right" ? 1 : -1));
        const targetsHeight = targets.length * 44 + Math.max(0, targets.length - 1) * 6;
        previewActions.style.top = `clamp(8px, ${coordinate(position.yRatio, -targetsHeight / 2)}, calc(100% - ${targetsHeight + 8}px))`;
        const more = selectFloatingBallMoreActions(config, surface, catalog, support);
        previewMoreSummary.textContent = this.i18n.floatingBallMoreCount.replace("{x}", String(more.length));
        previewStage.append(ball, previewActions);
    };

    const renderActions = (focusId?: string, focusKind?: string) => {
        const surface = surfaceSelect.value as "desktop" | "sidebar" | "mobile";
        const config: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
        const catalog = this.getFloatingBallActions();
        toggles.forEach((input, target) => { input.checked = config.enabled[target]; });
        const support = {resolveSupport: (action: IQuickAction, target: string) => this.getQuickActionSupport(action, target as QuickActionTarget)};
        const rows: any[] = buildFloatingBallSettingsRows(config, surface, catalog, support);
        renderPreview(config);
        actionList.innerHTML = "";
        if (rows.length === 0) {
            const empty = document.createElement("p");
            empty.className = "sw-settings__hint";
            empty.textContent = this.i18n.floatingBallNoActions;
            actionList.appendChild(empty);
        }
        const firstLayerCount = rows.filter((row) => row.firstLayer).length;
        rows.forEach((row, index) => {
            const item = document.createElement("div");
            item.className = "sw-floating-ball-settings__row";
            item.dataset.actionId = row.actionId;
            const order = document.createElement("span");
            order.className = "sw-floating-ball-settings__order";
            order.textContent = String(index + 1);
            const title = document.createElement("input");
            title.type = "text";
            title.className = "b3-text-field sw-floating-ball-settings__label";
            title.value = row.label;
            title.maxLength = 80;
            title.dataset.control = "label";
            title.setAttribute("aria-label", `${this.i18n.floatingBallCustomLabel}: ${row.actionId}`);
            title.title = row.actionId;
            title.addEventListener("change", () => {
                persist(updateFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId, {label: title.value}));
                renderActions(row.actionId, "label");
            });
            const iconButton = document.createElement("button");
            iconButton.type = "button";
            iconButton.className = "b3-button b3-button--text sw-floating-ball-settings__icon";
            iconButton.setAttribute("aria-label", `${this.i18n.floatingBallCustomIcon}: ${row.label}`);
            iconButton.title = this.i18n.floatingBallCustomIcon;
            iconButton.dataset.control = "icon";
            if (typeof (this as any).renderQuickActionIconButton === "function") {
                this.renderQuickActionIconButton(iconButton, row.icon);
            } else {
                iconButton.textContent = row.icon;
            }
            iconButton.addEventListener("click", () => {
                const action = row.action ? {...row.action, label: row.label, icon: row.icon} : {
                    id: row.actionId,
                    label: row.label,
                    icon: row.icon,
                    kind: row.kind === "unknown" ? "adapter" : row.kind,
                    value: row.actionId,
                    targets: [surface],
                    enabled: row.enabled,
                    order: row.order,
                } as IQuickAction;
                this.openQuickActionIconPicker(action, (icon) => {
                    persist(updateFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId, {icon}));
                    renderActions(row.actionId, "icon");
                });
            });
            const status = document.createElement("span");
            status.className = `sw-floating-ball-settings__status is-${row.status}`;
            status.textContent = row.status === "supported"
                ? this.i18n.floatingBallStatusReady
                : row.status === "unknown" ? this.i18n.floatingBallStatusUnknown
                    : row.status === "unsupported" ? this.i18n.floatingBallStatusUnsupported
                        : this.i18n.floatingBallStatusUnavailable;
            status.title = row.status === "supported" ? this.i18n.floatingBallStatusReady
                : row.status === "unsupported" ? this.i18n.quickSupportUnsupported
                    : row.status === "unknown" ? this.i18n.quickSupportUnknown
                        : this.i18n.quickActionUnavailable;
            const enabledLabel = document.createElement("label");
            enabledLabel.className = "sw-floating-ball-settings__check";
            const enabled = document.createElement("input");
            enabled.type = "checkbox";
            enabled.checked = row.enabled;
            // Configuration remains editable while a provider is absent.
            enabled.dataset.control = "enabled";
            enabled.setAttribute("aria-label", `${this.i18n.floatingBallEnableAction}: ${row.label}`);
            enabled.addEventListener("change", () => {
                persist(updateFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId, {enabled: enabled.checked}));
                renderActions(row.actionId, "enabled");
            });
            enabledLabel.append(enabled, document.createTextNode(this.i18n.floatingBallEnabled));
            const firstLabel = document.createElement("label");
            firstLabel.className = "sw-floating-ball-settings__check";
            const first = document.createElement("input");
            first.type = "checkbox";
            first.checked = row.firstLayer;
            // The sixth first-layer slot is reserved for the synthetic More
            // entry, so at most five configured actions can be promoted.
            first.disabled = !row.firstLayer && firstLayerCount >= FLOATING_BALL_FIRST_LAYER_LIMIT - 1;
            first.dataset.control = "first";
            first.setAttribute("aria-label", `${this.i18n.floatingBallFirstLayer}: ${row.label}`);
            first.addEventListener("change", () => {
                persist(updateFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId, {firstLayer: first.checked}));
                renderActions(row.actionId, "first");
            });
            firstLabel.append(first, document.createTextNode(this.i18n.floatingBallFirstLayer));
            let mobileTryLabel: HTMLLabelElement | null = null;
            if (surface === "mobile" && row.status === "unknown") {
                mobileTryLabel = document.createElement("label");
                mobileTryLabel.className = "sw-floating-ball-settings__check is-warning";
                const mobileTry = document.createElement("input");
                mobileTry.type = "checkbox";
                mobileTry.checked = row.mobileOverride;
                mobileTry.dataset.control = "mobileOverride";
                mobileTry.setAttribute("aria-label", `${this.i18n.floatingBallMobileTry}: ${row.label}`);
                mobileTry.addEventListener("change", () => {
                    persist(updateFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId, {mobileOverride: mobileTry.checked}));
                    renderActions(row.actionId, "mobileOverride");
                });
                mobileTryLabel.append(mobileTry, document.createTextNode(this.i18n.floatingBallMobileTry));
            }
            const controls = document.createElement("span");
            controls.className = "sw-floating-ball-settings__controls";
            const moveButton = (icon: string, label: string, delta: number) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "b3-button b3-button--text";
                button.title = label;
                button.setAttribute("aria-label", label);
                button.dataset.control = delta < 0 ? "up" : "down";
                button.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;
                button.disabled = (delta < 0 && index === 0) || (delta > 0 && index === rows.length - 1);
                button.addEventListener("click", () => {
                    persist(moveFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId, delta));
                    renderActions(row.actionId, delta < 0 ? "up" : "down");
                });
                return button;
            };
            controls.append(moveButton("iconUp", this.i18n.floatingBallMoveUp, -1), moveButton("iconDown", this.i18n.floatingBallMoveDown, 1));
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "b3-button b3-button--text";
            remove.textContent = this.i18n.quickRemove;
            remove.setAttribute("aria-label", `${this.i18n.quickRemove}: ${row.label}`);
            remove.addEventListener("click", () => {
                persist(removeFloatingBallAction(this.getSettings().floatingBall, surface, row.actionId));
                renderActions(rows[index + 1]?.actionId || rows[index - 1]?.actionId, "enabled");
            });
            controls.appendChild(remove);
            item.draggable = !this.isMobile;
            if (!this.isMobile) {
                item.addEventListener("dragstart", (event) => event.dataTransfer?.setData("application/x-sw-floating-action", row.actionId));
                item.addEventListener("dragover", (event) => event.preventDefault());
                item.addEventListener("drop", (event) => {
                    event.preventDefault();
                    const id = event.dataTransfer?.getData("application/x-sw-floating-action");
                    const from = rows.findIndex((candidate) => candidate.actionId === id);
                    if (from < 0 || from === index) return;
                    persist(moveFloatingBallAction(this.getSettings().floatingBall, surface, id, index - from));
                    renderActions(id, "enabled");
                });
            }
            const metadata = document.createElement("div");
            metadata.className = "sw-floating-ball-settings__metadata";
            metadata.append(status, enabledLabel, firstLabel, ...(mobileTryLabel ? [mobileTryLabel] : []));
            item.append(order, title, iconButton, metadata, controls);
            actionList.appendChild(item);
        });

        const available = catalog.filter((action) => !rows.some((row) => row.actionId === action.id) && this.getQuickActionSupport(action, surface as QuickActionTarget) !== "unsupported");
        if (available.length > 0 && rows.length < FLOATING_BALL_ACTION_LIMIT) {
            const add = document.createElement("button");
            add.type = "button";
            add.className = "b3-button b3-button--outline sw-floating-ball-settings__add";
            add.textContent = this.i18n.floatingBallAddAction;
            add.addEventListener("click", () => mountQuickActionPicker({
                trigger: add, host: actionList,
                candidates: available.map((action) => ({...action, label: action.label || action.value, group: action.kind})),
                searchPlaceholder: this.i18n.quickPickerSearch,
                emptyText: this.i18n.quickPickerEmpty,
                onSelect: (selected: IQuickAction) => {
                    const current: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
                    const entries: any[] = current.actions[surface];
                    if (entries.some((entry) => entry.actionId === selected.id) || entries.length >= FLOATING_BALL_ACTION_LIMIT) return;
                    entries.push({actionId: selected.id, enabled: true, firstLayer: false, order: Math.max(0, ...entries.map((entry) => entry.order)) + 10});
                    persist(current);
                    renderActions(selected.id, "enabled");
                },
            }));
            actionList.appendChild(add);
        }
        if (focusId) {
            const targetRow = Array.from(actionList.querySelectorAll<HTMLElement>("[data-action-id]")).find((item) => item.dataset.actionId === focusId);
            const target = targetRow?.querySelector<HTMLInputElement | HTMLButtonElement>(`[data-control="${focusKind}"]`);
            (target && !target.disabled ? target : targetRow?.querySelector<HTMLInputElement>("[data-control='enabled']"))?.focus();
        }
    };
    renderControls = () => {
        const config: any = normalizeFloatingBallConfig(this.getSettings().floatingBall);
        const surface = surfaceSelect.value as "desktop" | "sidebar" | "mobile";
        renderClickActionOptions(config, surface);
        edgeSelect.value = config.position[surface].edge;
        vertical.value = String(Math.round(config.position[surface].yRatio * 100));
        size.disabled = surface === "sidebar";
        size.value = String(surface === "sidebar" ? 44 : config.appearance.size);
        margin.value = String(config.appearance.marginPx ?? 8);
        opacity.value = String(config.appearance.idleOpacity);
        delay.value = String(config.appearance.idleDelayMs);
        touchSlop.value = String(config.behavior.touchSlopPx);
        halfHide.checked = config.appearance.halfHide;
        snap.checked = config.behavior.snap;
        hideOnScroll.checked = config.behavior.hideOnScroll;
        hideOnFullscreen.checked = config.behavior.hideOnFullscreen;
        yieldToModals.checked = config.behavior.yieldToModals;
        renderControlValues();
    };
    surfaceSelect.addEventListener("change", () => { renderControls(); renderActions(); });
    wrapper.addEventListener("sw-floating-ball-refresh", () => { renderControls(); renderActions(); });
    renderControls();
    renderActions();
    renderPresets();

    const footer = document.createElement("div");
    footer.className = "sw-floating-ball-settings__footer";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "b3-button b3-button--text";
    restore.textContent = this.i18n.floatingBallRestoreDefaults;
    restore.addEventListener("click", () => {
        if (!confirm(this.i18n.floatingBallRestoreConfirm)) return;
        persist(restoreFloatingBallDefaults(this.getSettings().floatingBall, surfaceSelect.value));
        renderActions();
        restore.focus();
    });
    footer.append(restore, buildQuickActionsTransferControls.call(this, () => { renderControls(); renderActions(); }, true));
    wrapper.appendChild(footer);
    return wrapper;
}
