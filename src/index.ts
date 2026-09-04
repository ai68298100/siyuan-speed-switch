import {Plugin, Dialog, Menu, getFrontend, getAllTabs, getActiveTab, openTab, showMessage} from "siyuan";
import "./index.scss";

// siyuan 包未将 Tab 作为顶层命名导出，这里从 getAllTabs 返回类型推导
type Tab = ReturnType<typeof getAllTabs>[number];

// 手机端 MobileTabs 状态（思源 3.8+，window.siyuan.mobile.tabs.state）
interface IMobileTabEntry {
    id: string;
    rootID: string;
    notebookID: string;
    path: string;
    title: string;
    icon?: string;
}
interface IMobileTabsState {
    version: number;
    activeTabID?: string;
    tabs: Array<{id: string; current?: IMobileTabEntry; activeAt: number}>;
}
// 页签排序方式：mru=最近使用 layout=打开顺序 layoutDesc=打开倒序 titleAsc/titleDesc=标题升降序 updatedDesc=最近编辑
type SortBy = "mru" | "layout" | "layoutDesc" | "titleAsc" | "titleDesc" | "updatedDesc";
const SORT_BY_LIST: SortBy[] = ["mru", "layout", "layoutDesc", "titleAsc", "titleDesc", "updatedDesc"];
// 页签卡片操作完成后的收尾动作（弹窗模式销毁弹窗，侧边栏模式刷新列表）
type IOverlayClose = () => void;

const MRU_KEY = "sw_mru";            // 最近使用页签记录，数组按最近在前排列
const PINNED_KEY = "sw_pinned";      // 置顶页签记录（优先存文档 rootID，跨会话稳定）
const FAV_KEY = "sw_favorites";      // 收藏页签记录（文档用 rootID 跨会话稳定，收藏后即使关闭也可从收藏栏快速重开）
const FAV_GROUPS_KEY = "sw_fav_groups"; // 收藏分组注册表：设置页新建的分组（允许暂无收藏项的空分组）
const SETTINGS_KEY = "sw_settings";  // 插件设置
const THUMB_CACHE_KEY = "sw_thumb_cache"; // 缩略图缓存：rootID → 文档 HTML 快照，页签关闭前一直保留
const SIDEBAR_DOCK_TYPE = "sidebar"; // 侧边栏 dock 的 type（实际注册为 插件名+type）
const CONTENT_WIDTH = 800;           // 缩略图内容的模拟宽度（px），用于计算缩放比例
const THUMB_BATCH = 4;               // 批量渲染缩略图的并发数量（IntersectionObserver 不可用时的兜底路径）
const THUMB_CACHE_MAX = 40;          // 缓存最多保留的文档数（超出按最旧淘汰）
const THUMB_HTML_MAX = 200 * 1024;   // 单条缓存 HTML 上限，避免持久化文件膨胀
const THUMB_BATCH_MOBILE = 2;        // 手机端并发渲染数（性能更弱）
const THUMB_CACHE_MAX_MOBILE = 30;   // 手机端缓存上限
const THUMB_HTML_MAX_MOBILE = 80 * 1024; // 手机端单条缓存上限
const THUMB_CLONE_MAX = 30;          // 缩略图克隆块数上限：只取文档首屏内容，避免大文档整篇克隆卡顿
const THUMB_API_MAX = 4;             // getDoc 回源并发上限（桌面端）
const THUMB_API_MAX_MOBILE = 2;      // getDoc 回源并发上限（手机端，弱网弱机保护）
const UPDATED_CACHE_MS = 3000;       // 「最近编辑」排序 SQL 结果的短缓存有效期
const ROOT_ID_CACHE_MAX = 512;       // rootId 映射缓存上限（超出整体清空，页签 id 稳定重复率高）
// 默认快捷键 Alt+Shift+S。思源的 matchHotKey 对修饰键顺序有要求：⌥ 必须在 ⇧ 之前，
// 写成 "⇧⌥S" 时永远无法匹配（按键无反应），务必保持 "⌥⇧S" 顺序。
const DEFAULT_HOTKEY = "⌥⇧S";
const LEGACY_HOTKEY = "⇧⌥S";         // 旧版本写入的无法匹配的顺序，需在加载时迁移

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
    mobileColumns: 2,      // 2=自动（竖屏单列，横屏双列），默认自动
    mobileThumbHeight: 80, // 手机端缩略图高度
    journalNotebook: "",   // 默认日记笔记本 id，空=未设置（首次点击日记按钮时弹出选择）
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

// 收藏条目：文档页签存 rootId（关闭后仍可重开），非文档页签仅存页签 id（关闭后失效自动清理）
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
    private sidebarElement: HTMLElement | null = null; // 侧边栏 dock 面板内容元素
    private sidebarResizeObserver: ResizeObserver | null = null; // 侧边栏尺寸监听，变化时重算缩略图缩放
    private saveTimers = new Map<string, number>(); // 去抖写盘定时器：MRU/置顶/收藏等高频数据合并落盘
    private favCollapsed = new Set<string>(); // 收藏下拉中已折叠的分组名（会话级，重启后默认展开）
    private fabElement: HTMLElement | null = null; // 手机端悬浮按钮
    private mobileTopBarButton: HTMLElement | null = null; // 手机端顶栏切换器入口按钮（自行注入 mobileTopBar）
    private fabGestureBound = false; // FAB 滚动手势监听是否已绑定（document 级，只绑一次）
    private fabGestureHandlers: {touchstart: (e: TouchEvent) => void, touchmove: (e: TouchEvent) => void} | null = null;

    async onload() {
        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

        this.fixLegacyHotkey();

        // 预加载持久化数据（loadData 会写入 this.data，之后 getMru 等才能读到旧值）
        await Promise.all([
            this.loadData(MRU_KEY),
            this.loadData(PINNED_KEY),
            this.loadData(FAV_KEY),
            this.loadData(FAV_GROUPS_KEY),
            this.loadData(SETTINGS_KEY),
            this.loadData(THUMB_CACHE_KEY),
        ]).catch((e) => console.warn("[speed-switch] load data fail", e));

        this.addTopBar({
            icon: "iconLayout",
            title: this.i18n.switchTabs,
            position: "right",
            callback: () => {
                this.showSwitcher();
            },
        });

        // 注册侧边栏 dock 面板：与切换器同样的卡片列表，常驻侧边栏便于快速切换
        const self = this;
        if (!this.isMobile) {
            this.addDock({
                config: {
                    position: "RightBottom",
                    size: {width: 340, height: 0},
                    icon: "iconLayout",
                    title: this.i18n.switchTabs,
                    show: false,
                },
                data: {},
                type: SIDEBAR_DOCK_TYPE,
                init() {
                    self.renderSidebarPanel((this as any).element as HTMLElement);
                },
                resize() {
                    // 面板尺寸变化时仅重算缩略图缩放比例，不重建列表（避免闪烁与滚动位置丢失）
                    const element = (this as any).element as HTMLElement;
                    if (element?.isConnected) {
                        self.rescaleThumbs(element);
                    }
                },
            });
        }

        // 手机端初始化入口：顶栏按钮（常驻）+ 悬浮按钮（可选）。
        // 思源 3.8.x 手机端不向插件开放顶栏（addTopBar 只进右侧菜单"扩展"分组，不易发现），
        // 因此自行把入口按钮插入 mobileTopBar，保证一眼可见
        if (this.isMobile) {
            this.ensureMobileTopBarButton();
            this.updateFABVisibility();
        }

        // 文档切换时仅更新侧边栏卡片高亮（高频事件，避免整列表重建导致闪烁与滚动位置丢失）；
        // 手机端顺带确认入口按钮仍在（内核个别场景会重建顶栏 DOM）
        this.eventBus.on("switch-protyle", () => {
            this.refreshSidebarActive();
            if (this.isMobile) {
                this.ensureMobileTopBarButton();
            }
        });
        // 页签增减（文档打开/关闭）时全量刷新侧边栏列表
        this.eventBus.on("loaded-protyle-static", () => this.refreshSidebar());
        this.eventBus.on("destroy-protyle", () => this.refreshSidebar());

        this.addCommand({
            langKey: "switchTabs",
            hotkey: DEFAULT_HOTKEY,
            callback: () => {
                this.showSwitcher();
            },
        });
    }

    // 布局就绪后再次确认手机端入口：部分机型上 onload 执行时顶栏尚未构建完成，
    // 插件按钮会插入失败；这里兜底重试一次
    onLayoutReady() {
        if (this.isMobile) {
            this.ensureMobileTopBarButton();
            this.updateFABVisibility();
        }
    }

    onunload() {
        this.flushPendingSaves();
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
            this.saveData(key, this.data[key]).catch((e) => console.warn("[speed-switch] save data fail", e));
        }, 500));
    }

    // 立即落盘全部待写数据（卸载时调用，避免丢失最近一次去抖窗口内的改动）
    private flushPendingSaves() {
        this.saveTimers.forEach((timer, key) => {
            clearTimeout(timer);
            this.saveData(key, this.data[key]).catch((e) => console.warn("[speed-switch] save data fail", e));
        });
        this.saveTimers.clear();
    }

    // 旧版本默认快捷键 "⇧⌥S" 无法被思源热键匹配命中，且可能已持久化到快捷键配置中，
    // 加载时将其修正为可匹配的 "⌥⇧S"（组合键不变，仍是 Alt+Shift+S）
    private fixLegacyHotkey() {
        try {
            const keymapItem = (window as any).siyuan?.config?.keymap?.plugin?.[this.name]?.switchTabs;
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
        const saved = this.data[SETTINGS_KEY];
        if (!saved || typeof saved !== "object") {
            return {...DEFAULT_SETTINGS};
        }
        return {
            dialogWidth: this.clampNum((saved as any).dialogWidth, 480, 1920, DEFAULT_SETTINGS.dialogWidth),
            dialogHeight: this.clampNum((saved as any).dialogHeight, 360, 1280, DEFAULT_SETTINGS.dialogHeight),
            columns: this.clampNum((saved as any).columns, 0, 8, DEFAULT_SETTINGS.columns),
            thumbHeight: this.clampNum((saved as any).thumbHeight, 72, 360, DEFAULT_SETTINGS.thumbHeight),
            sortBy: (SORT_BY_LIST.includes((saved as any).sortBy)
                ? (saved as any).sortBy : DEFAULT_SETTINGS.sortBy) as SortBy,
            excludedDocks: Array.isArray((saved as any).excludedDocks)
                ? (saved as any).excludedDocks.filter((t: any) => typeof t === "string")
                : [],
            dockDisplay: (DOCK_DISPLAY_LIST.includes((saved as any).dockDisplay)
                ? (saved as any).dockDisplay : DEFAULT_SETTINGS.dockDisplay) as DockDisplay,
            sidebarLayout: (SIDEBAR_LAYOUT_LIST.includes((saved as any).sidebarLayout)
                ? (saved as any).sidebarLayout : DEFAULT_SETTINGS.sidebarLayout) as SidebarLayout,
            fullscreen: typeof (saved as any).fullscreen === "boolean"
                ? (saved as any).fullscreen : DEFAULT_SETTINGS.fullscreen,
            fabEnabled: typeof (saved as any).fabEnabled === "boolean"
                ? (saved as any).fabEnabled : DEFAULT_SETTINGS.fabEnabled,
            mobileColumns: this.clampNum((saved as any).mobileColumns, 0, 2, DEFAULT_SETTINGS.mobileColumns),
            mobileThumbHeight: this.clampNum((saved as any).mobileThumbHeight, 48, 200, DEFAULT_SETTINGS.mobileThumbHeight),
            journalNotebook: typeof (saved as any).journalNotebook === "string"
                ? (saved as any).journalNotebook : DEFAULT_SETTINGS.journalNotebook,
        };
    }

    private updateSettings(patch: Partial<ISwSettings>) {
        const settings = {...this.getSettings(), ...patch};
        this.data[SETTINGS_KEY] = settings;
        this.saveData(SETTINGS_KEY, settings).catch((e) => console.warn("[speed-switch] save settings fail", e));
    }

    private clampNum(value: any, min: number, max: number, fallback: number): number {
        const num = typeof value === "number" ? value : parseInt(value, 10);
        if (Number.isNaN(num)) {
            return fallback;
        }
        return Math.min(max, Math.max(min, num));
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
        try {
            const response = await fetch("/api/notebook/lsNotebooks", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: "{}",
            });
            const json = await response.json();
            const notebooks = (json?.data?.notebooks ?? []) as Array<{id: string, name: string, closed?: number}>;
            return notebooks
                .filter((nb) => nb && nb.id && !nb.closed)
                .map((nb) => ({id: nb.id, name: nb.name}));
        } catch (e) {
            console.warn("[speed-switch] load notebooks fail", e);
            return [];
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
            showMessage(this.i18n.journalFailed, 3000, "error");
            return;
        }
        if (this.isMobile) {
            // openTab 在手机端是空实现，走 MobileTabs.open
            this.mobileOpenDoc(id);
        } else {
            openTab({app: (this as any).app, doc: {id}});
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
            const json = await response.json();
            if (json?.code === 0 && json?.data?.id) {
                return json.data.id;
            }
            console.warn("[speed-switch] createDailyNote fail", json);
            return null;
        } catch (e) {
            console.warn("[speed-switch] createDailyNote fail", e);
            return null;
        }
    }

    // 首次点击日记按钮：弹窗选择默认日记笔记本，选择后保存并返回
    private promptJournalNotebook(): Promise<string> {
        return new Promise((resolve) => {
            const dialog = new Dialog({
                title: this.i18n.journalChoose,
                content: `<div class="b3-dialog__content sw-journal-prompt">
    <div class="b3-label__text sw-journal-prompt__tip">${this.i18n.journalChooseTip}</div>
    <div class="sw-journal-prompt__sel"></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${this.i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text sw-journal-prompt__confirm">${this.i18n.confirm}</button>
</div>`,
                width: "min(460px, 90vw)",
            });
            const selBox = dialog.element.querySelector<HTMLElement>(".sw-journal-prompt__sel");
            const confirmBtn = dialog.element.querySelector<HTMLButtonElement>(".sw-journal-prompt__confirm");
            const sel = document.createElement("select");
            sel.className = "b3-select fn__flex-center fn__block";
            sel.disabled = true;
            sel.appendChild(new Option(this.i18n.notebookLoading, ""));
            selBox?.appendChild(sel);
            confirmBtn && (confirmBtn.disabled = true);

            this.loadNotebooks().then((notebooks) => {
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
            });

            const apply = () => {
                const picked = sel.value;
                if (!picked) {
                    return;
                }
                this.updateSettings({journalNotebook: picked});
                dialog.destroy();
                resolve(picked);
            };
            confirmBtn?.addEventListener("click", apply);
            dialog.element.querySelector(".b3-button--cancel")?.addEventListener("click", () => {
                dialog.destroy();
                resolve("");
            });
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

        // 切换分组：仅激活对应标签与面板，同步 aria-selected 供读屏感知
        const activate = (key: string) => {
            tabs.querySelectorAll<HTMLElement>(".sw-settings__tab").forEach((tab) => {
                const active = tab.dataset.panel === key;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", active ? "true" : "false");
            });
            panels.querySelectorAll<HTMLElement>(".sw-settings__panel").forEach((p) => {
                p.classList.toggle("is-active", p.dataset.panel === key);
            });
        };

        // ===== 外观 =====
        const buildAppearance = () => {
            const wrapper = document.createElement("div");
            wrapper.append(
                this.settingItem(this.i18n.setWidth, this.i18n.setWidthTip,
                    this.num(s.dialogWidth, 480, 1920, 40, this.i18n.unitPx, (v) => this.updateSettings({dialogWidth: v}), this.i18n.setWidth)),
                this.settingItem(this.i18n.setHeight, this.i18n.setHeightTip,
                    this.num(s.dialogHeight, 360, 1280, 40, this.i18n.unitPx, (v) => this.updateSettings({dialogHeight: v}), this.i18n.setHeight)),
                this.settingItem(this.i18n.setColumns, this.i18n.setColumnsTip,
                    this.select([{value: "0", label: this.i18n.columnsAuto}].concat(
                        [2, 3, 4, 5, 6, 7, 8].map((n) => ({value: String(n), label: String(n)})),
                    ), String(s.columns), (v) => this.updateSettings({columns: this.clampNum(v, 0, 8, s.columns)}))),
                this.settingItem(this.i18n.setThumbHeight, this.i18n.setThumbHeightTip,
                    this.num(s.thumbHeight, 72, 360, 8, this.i18n.unitPx, (v) => this.updateSettings({thumbHeight: v}), this.i18n.setThumbHeight)),
            );
            return wrapper;
        };

        // ===== 行为 =====
        const buildBehavior = () => {
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
        };

        // ===== 面板 =====
        const buildPanels = () => {
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

            // 面板显示设置：勾选的面板出现在切换器左侧，取消的隐藏（原 createActionElement 逻辑原样搬移）
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
                this.settingItem(this.i18n.setDocks, this.i18n.setDocksTip, box, true),
            );
            return wrapper;
        };

        // ===== 收藏 =====
        const buildFavorites = () => {
            // 收藏管理：新建分组、分组重命名/删除、调整收藏项所属分组（原收藏管理盒逻辑原样搬移）
            const box = document.createElement("div");
            box.className = "sw-setting__favs";
            const render = () => {
                const favorites = this.getFavorites();
                const groupNames = this.getFavoriteGroupNames();
                box.innerHTML = "";

                // 新建分组：输入名称即创建（空分组保留，收藏时可选用）
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
                box.appendChild(createRow);

                // 分组列表：每个分组一行（名称 + 收藏数 + 重命名 + 删除）
                if (groupNames.length > 0) {
                    const groupList = document.createElement("div");
                    groupList.className = "sw-setting__group-list";
                    groupNames.forEach((name) => {
                        const row = document.createElement("div");
                        row.className = "sw-setting__group-row";

                        const label = document.createElement("span");
                        label.className = "sw-setting__group-name";
                        label.textContent = name;
                        label.title = name;

                        const count = document.createElement("span");
                        count.className = "sw-setting__group-count";
                        count.textContent = String(favorites.filter((fav) => fav.group === name).length);
                        count.title = this.i18n.groupCountTip;

                        // 重命名：行内切换为输入框，确认后整组迁移
                        const renameBtn = document.createElement("button");
                        renameBtn.type = "button";
                        renameBtn.className = "b3-button b3-button--small sw-setting__group-btn";
                        renameBtn.textContent = this.i18n.rename;
                        renameBtn.addEventListener("click", () => {
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
                        row.appendChild(count);
                        row.appendChild(renameBtn);
                        row.appendChild(deleteBtn);
                        groupList.appendChild(row);
                    });
                    box.appendChild(groupList);
                }

                // 收藏列表：每行标题 + 分组下拉（改动即保存）
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
            };
            render();
            return this.settingItem(this.i18n.manageFavorites, this.i18n.manageFavoritesTip, box, true);
        };

        // ===== 手机端 =====
        const buildMobile = () => {
            const wrapper = document.createElement("div");
            wrapper.append(
                this.settingItem(this.i18n.fabEnabled, this.i18n.fabEnabledTip,
                    this.switcher(s.fabEnabled, (v) => {
                        this.updateSettings({fabEnabled: v});
                        this.updateFABVisibility();
                    })),
                this.settingItem(this.i18n.mobileLayout, this.i18n.mobileLayoutTip,
                    this.select([
                        {value: "0", label: this.i18n.mobileSingle},
                        {value: "1", label: this.i18n.mobileDouble},
                        {value: "2", label: this.i18n.mobileAuto},
                    ], String(s.mobileColumns), (v) => this.updateSettings({mobileColumns: parseInt(v, 10)}))),
            );
            return wrapper;
        };

        // ===== 日记 =====
        const buildJournal = () => {
            const wrapper = document.createElement("div");
            wrapper.append(
                this.settingItem(this.i18n.journalNotebook, this.i18n.journalNotebookTip,
                    this.notebookSelect(s.journalNotebook, (id) => this.updateSettings({journalNotebook: id}))),
            );
            return wrapper;
        };

        const builders: Record<string, () => HTMLElement> = {
            appearance: buildAppearance,
            behavior: buildBehavior,
            panels: buildPanels,
            favorites: buildFavorites,
            journal: buildJournal,
            mobile: buildMobile,
        };

        // 构建标签栏与分组面板
        panelKeys.forEach((key) => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "sw-settings__tab";
            tab.setAttribute("role", "tab");
            tab.dataset.panel = key;
            tab.textContent = panelLabels[key];
            tab.addEventListener("click", () => activate(key));
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

        // 默认激活第一个标签（外观）
        activate(panelKeys[0]);
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

        const dialog = new Dialog({
            // 极简：隐藏原生标题栏，顶栏内置于内容区最上方
            title: "",
            content: `<div class="speed-switch sw__body${fullscreen ? " sw--fullscreen" : ""}">
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
                    <svg><use xlink:href="#iconDate"></use></svg>
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
</div>`,
            width: fullscreen ? "100vw" : `${settings.dialogWidth}px`,
            height: fullscreen ? "100vh" : `${settings.dialogHeight}px`,
        });

        // 全屏模式下给弹窗容器加类：去掉圆角/边框/最大宽度限制，真正铺满视口
        if (fullscreen) {
            dialog.element.querySelector(".b3-dialog__container")?.classList.add("sw-dialog--fullscreen");
        }

        // 全屏 ⇄ 普通 原地切换：直接改容器 inline 尺寸与类，不重建弹窗（缩略图/搜索状态全保留）。
        // 初始模式仍由设置项决定，按钮只作用于本次会话
        let isFullscreen = fullscreen;
        const fsBtn = dialog.element.querySelector<HTMLElement>(".sw__fullscreen-btn");
        const swBody = dialog.element.querySelector<HTMLElement>(".sw__body");
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

        // 思源 .b3-dialog__body 默认 overflow:auto，内容一高就会整体滚动把工具栏滚走，
        // 加类锁定它（配套 SCSS 规则见 .sw-scroll-locked），保证只有 .sw__scroll 滚动、顶栏始终固定
        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }

        // 左侧侧边栏面板列表（与思源 Ctrl+Tab 切换面板一致），按设置排除与显示方式渲染，无可面板时自动隐藏
        const dockElement = dialog.element.querySelector<HTMLDivElement>(".sw__dock");
        this.renderDockList(dockElement, dialog, settings.excludedDocks, settings.dockDisplay);

        // 清理缩略图缓存中已无对应打开页签的孤儿条目（页签关闭即失效）
        this.pruneThumbCache(tabs);

        // 工具栏：搜索过滤 + 收藏快速跳转 + 排序切换（持久化）+ 侧边栏/设置入口
        const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const closeOverlay = () => dialog.destroy();
        const listOpts = {onOverlayClose: closeOverlay, onTabsChanged: () => undefined};
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
        // 收藏下拉组件：星标触发 + 分组面板（分组可折叠/展开，项点击跳转）
        const favDd = dialog.element.querySelector<HTMLElement>(".sw__fav-dd");
        this.setupFavDropdown(favDd, closeOverlay);
        sortSelect.value = settings.sortBy;
        sortSelect.addEventListener("change", () => {
            this.updateSettings({sortBy: sortSelect.value as SortBy});
            // 弹窗存活期间页签可能已增减，重取最新列表
            this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, sortSelect.value as SortBy, updatedMap);
            searchInput.value = "";
            this.applySearch(scrollElement, searchInput, closeOverlay);
            scrollElement.focus();
        });

        // 右侧页签缩略图网格：每次打开都重新克隆渲染，展示各页签的最新状态
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        let updatedMap: {[rootId: string]: string} = {};
        this.renderList(scrollElement, tabs, activeTab, listOpts, settings.sortBy, updatedMap);
        this.bindKeydown(scrollElement, closeOverlay);

        // 「最近编辑」排序需要文档更新时间：后台查询一次，完成后若仍处于该排序则重排
        this.loadUpdatedMap(tabs).then((map) => {
            updatedMap = map;
            if (dialog.element.isConnected && sortSelect.value === "updatedDesc" && searchInput.value.trim() === "") {
                // 弹窗存活期间页签可能已增减，重取最新列表
                this.renderList(scrollElement, getAllTabs(), this.getActiveTab(), listOpts, "updatedDesc", updatedMap);
            }
        });

        // 搜索：已打开页签匹配显示在上半部分，同时全库文档结果显示在下半部分
        searchInput.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });

        // 让滚动区域获得焦点以接收键盘导航
        scrollElement.focus();

        // 回到顶部按钮：下拉超过一屏左右时淡入，点击平滑回顶
        const backTopBtn = dialog.element.querySelector<HTMLElement>(".sw__back-top");
        if (backTopBtn) {
            scrollElement.addEventListener("scroll", () => {
                backTopBtn.classList.toggle("sw__show", scrollElement.scrollTop >= 240);
            });
            backTopBtn.addEventListener("click", () => {
                scrollElement.scrollTo({top: 0, behavior: "smooth"});
            });
        }
    }

    // 执行搜索：已打开页签匹配卡片显示在上半部分，同时（防抖）搜索全库文档标题显示在下半部分
    private applySearch(scrollElement: HTMLElement, searchInput: HTMLInputElement, onClose: IOverlayClose) {
        const keyword = searchInput.value.trim();
        this.filterCards(scrollElement, searchInput.value);

        // 关键词为空：隐藏文档结果，恢复纯列表
        if (keyword === "") {
            this.renderDocResults(scrollElement, null, onClose);
            return;
        }
        // 命中缓存直接渲染（已打开文档在渲染时排除，缓存结果可安全复用）
        const cached = this.docSearchCache.get(keyword);
        if (cached) {
            this.renderDocResults(scrollElement, cached.slice(0, 12), onClose);
            return;
        }
        // 延迟 180ms 再请求全库文档（防抖），避免每个按键都打内核
        const seq = ++this.searchSeq;
        window.setTimeout(async () => {
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
                const json = await response.json();
                if (seq !== this.searchSeq || !scrollElement.isConnected) {
                    return;
                }
                const docs: any[] = Array.isArray(json?.data) ? json.data : [];
                // 简单容量控制：超 50 条整体清空（关键词极少复现，无需严格 LRU）
                if (this.docSearchCache.size > 50) {
                    this.docSearchCache.clear();
                }
                this.docSearchCache.set(keyword, docs);
                this.renderDocResults(scrollElement, docs.slice(0, 12), onClose);
            } catch (e) {
                // 主动取消的请求不算异常
                if ((e as DOMException)?.name !== "AbortError") {
                    console.warn("[speed-switch] search docs fail", e);
                }
            }
        }, 180);
    }

    // 渲染全库文档搜索结果分组（docs 为 null 表示隐藏）；已打开的文档不再重复列出
    private renderDocResults(scrollElement: HTMLElement, docs: any[] | null, onClose: IOverlayClose) {
        let box = scrollElement.querySelector<HTMLElement>(".sw__doc-results");
        if (docs === null) {
            box?.remove();
            return;
        }
        if (!box) {
            box = document.createElement("div");
            box.className = "sw__doc-results sw__group";
            scrollElement.appendChild(box);
        }
        // 兜底移除可能残留的隐藏类（历史 bug 防御），确保文档区始终可见
        box.classList.remove("fn__none");
        box.innerHTML = "";

        const label = document.createElement("div");
        label.className = "sw__window-label";
        label.textContent = this.i18n.docSearchResults;
        box.appendChild(label);

        // 排除当前已打开的文档（上半部分已有对应卡片）；手机端 getAllTabs() 恒为空，需用 MobileTabs 数据源
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const openRootIds = new Set(
            opened.map((tab) => this.rootIdOf(tab)).filter(Boolean) as string[],
        );

        if (docs.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__empty";
            empty.textContent = this.i18n.noDocResults;
            box.appendChild(empty);
            return;
        }

        docs.forEach((doc) => {
            // 思源文档路径以块 id 命名：/ notebook / rootID .sy
            const id = String(doc.path || "").split("/").pop()?.replace(/\.sy$/, "");
            if (!id || openRootIds.has(id)) {
                return;
            }
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
                        app: (this as any).app,
                        doc: {id},
                    });
                }
            });
            box!.appendChild(item);
        });
    }

    // 「最近编辑」排序的 SQL 结果短缓存：排序方式来回切换 / 列表重渲染时不重复打内核
    private updatedMapCache: {key: string, ts: number, map: {[rootId: string]: string}} | null = null;

    // 查询当前打开文档的更新时间（用于「最近编辑」排序），返回 rootID → updated 映射
    private async loadUpdatedMap(tabs: Tab[]): Promise<{[rootId: string]: string}> {
        const ids = tabs.map((tab) => this.rootIdOf(tab)).filter(Boolean) as string[];
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
            const json = await response.json();
            const map: {[rootId: string]: string} = {};
            (json?.data || []).forEach((row: any) => {
                map[row.root_id] = row.updated;
            });
            this.updatedMapCache = {key, ts: Date.now(), map};
            return map;
        } catch (e) {
            console.warn("[speed-switch] query updated fail", e);
            return {};
        }
    }

    // 获取当前活动页签（可能为 undefined）
    private getActiveTab(): Tab | undefined {
        try {
            return getActiveTab() || undefined;
        } catch (e) {
            console.warn("[speed-switch] get active tab fail", e);
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
            console.warn("[speed-switch] switch dock fail", e);
        }
        dialog.destroy();
    }

    // 读取布局配置中的全部面板（左/右/下三侧 dock），只保留当前真实存在的面板
    private getDockPanels(): IDockPanel[] {
        const panels: IDockPanel[] = [];
        try {
            const uiLayout = (window as any).siyuan?.config?.uiLayout;
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
            console.warn("[speed-switch] get dock panels fail", e);
        }
        return panels;
    }

    // 按 type 查找面板所属的 Dock（左侧/右侧/底部），与思源 getDockByType 行为一致
    private getDockByType(type: string): any {
        const layout = (window as any).siyuan?.layout;
        if (!layout) {
            return undefined;
        }
        for (const key of ["leftDock", "rightDock", "bottomDock"]) {
            const dock = layout[key];
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

    // 文档页签的 rootID（非文档页签返回空）
    // rootId 映射会话级缓存：懒加载页签每次解析 data-initdata 都要 JSON.parse，
    // 渲染/排序/MRU/收藏多处高频调用，按页签 id 缓存后只解析一次
    private rootIdCache = new Map<string, string | null>();

    private rootIdOf(tab: Tab): string | null {
        const cached = this.rootIdCache.get(tab.id);
        if (cached !== undefined) {
            return cached;
        }
        const rootId = this.computeRootId(tab);
        if (this.rootIdCache.size >= ROOT_ID_CACHE_MAX) {
            // 页签 id 在一次会话内稳定，整体清空代价可忽略
            this.rootIdCache.clear();
        }
        this.rootIdCache.set(tab.id, rootId);
        return rootId;
    }

    private computeRootId(tab: Tab): string | null {
        const model: any = (tab as any).model;
        if (model?.editor?.block?.rootID) {
            return model.editor.block.rootID;
        }
        // 重启/重置布局后，未激活页签的 model 是懒加载的（切换到该页签才创建）：
        // 思源把 Editor 初始化数据存在 headElement 的 data-initdata 属性中（含 rootId）
        try {
            const initData = tab.headElement?.getAttribute("data-initdata");
            if (initData) {
                const json = JSON.parse(initData);
                if (json?.instance === "Editor" && json.rootId) {
                    return json.rootId;
                }
            }
        } catch (e) {
            // 解析失败忽略
        }
        return null;
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
        const key = this.pinKeyOf(tab);
        const list = this.getFavorites();
        const index = list.findIndex((item) => item.key === key);
        if (index >= 0) {
            list.splice(index, 1);
            this.saveFavorites(list);
            return false;
        }
        list.unshift({key, title: this.titleOf(tab), rootId: this.rootIdOf(tab), group: ""});
        this.saveFavorites(list);
        return true;
    }

    private removeFavorite(key: string) {
        this.saveFavorites(this.getFavorites().filter((item) => item.key !== key));
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

        // 点击外部收起面板
        const onDocPointerDown = (event: PointerEvent) => {
            if (!container.contains(event.target as Node)) {
                panel.classList.add("fn__none");
            }
        };
        document.addEventListener("pointerdown", onDocPointerDown, true);
        // 视口尺寸/滚动变化时重新贴位（fixed 定位不随文档流移动）
        const onReposition = () => {
            if (!panel.classList.contains("fn__none") && container.isConnected) {
                this.positionFavPanel(trigger, panel);
            }
        };
        window.addEventListener("resize", onReposition);
        document.addEventListener("scroll", onReposition, true);
        // 容器从 DOM 移除时解绑全局监听（弹窗销毁/侧边栏重渲染都会移除旧容器）
        const observer = new MutationObserver(() => {
            if (!container.isConnected) {
                document.removeEventListener("pointerdown", onDocPointerDown, true);
                window.removeEventListener("resize", onReposition);
                document.removeEventListener("scroll", onReposition, true);
                observer.disconnect();
            }
        });
        observer.observe(document.body, {childList: true, subtree: true});

        trigger.addEventListener("click", () => {
            const willOpen = panel.classList.contains("fn__none");
            if (willOpen) {
                this.renderFavPanel(panel, () => {
                    panel.classList.add("fn__none");
                    onClose();
                });
                panel.classList.remove("fn__none");
                this.positionFavPanel(trigger, panel);
            } else {
                panel.classList.add("fn__none");
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
        // 宽度：理想 248px，按宿主/视口可用空间收缩；宿主过窄（<180px）时随宿主收窄，确保不超出侧边栏
        const avail = Math.max(0, maxRight - minLeft);
        const width = Math.max(Math.min(180, avail), Math.min(248, avail));
        let left = Math.min(Math.max(rect.right - width, minLeft), maxRight - width);
        // 垂直：默认在触发器下方，剩余空间不足时翻转到触发器上方
        let top = rect.bottom + margin;
        let maxHeight = window.innerHeight - margin - top;
        if (maxHeight < 180) {
            const over = Math.min(320, rect.top - margin * 2);
            top = Math.max(margin, rect.top - margin - over);
            maxHeight = rect.top - margin - top;
        }
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
        panel.style.maxHeight = `${Math.max(140, Math.round(maxHeight))}px`;
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
        const groups = new Map<string, IFavoriteItem[]>();
        groupNames.forEach((name) => groups.set(name, []));
        favorites.forEach((fav) => {
            const name = fav.group || "";
            if (!groups.has(name)) {
                groups.set(name, []);
            }
            groups.get(name)!.push(fav);
        });

        const appendGroup = (name: string, items: IFavoriteItem[]) => {
            const groupEl = document.createElement("div");
            groupEl.className = "sw__fav-group" + (this.favCollapsed.has(name) ? " sw__fav-collapsed" : "");

            const head = document.createElement("button");
            head.type = "button";
            head.className = "sw__fav-group-head";
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
            });
            groupEl.appendChild(head);

            const list = document.createElement("div");
            list.className = "sw__fav-items";
            items.forEach((fav) => {
                list.appendChild(this.makeFavItem(panel, fav, onPick));
            });
            groupEl.appendChild(list);
            panel.appendChild(groupEl);
        };

        // 有分组时未分组的置底显示为「未分组」；无任何分组时平铺不显示组头
        const groupedNames = Array.from(groups.keys()).filter((name) => name !== "");
        const ungrouped = groups.get("") || [];
        if (!groupedNames.length) {
            const list = document.createElement("div");
            list.className = "sw__fav-items sw__fav-items--flat";
            ungrouped.forEach((fav) => {
                list.appendChild(this.makeFavItem(panel, fav, onPick));
            });
            panel.appendChild(list);
        } else {
            groupedNames.forEach((name) => appendGroup(name, groups.get(name)!));
            if (ungrouped.length > 0) {
                appendGroup(this.i18n.ungrouped, ungrouped);
            }
        }
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
        const key = this.pinKeyOf(tab);
        const list = this.getFavorites();
        const item = list.find((fav) => fav.key === key);
        if (item) {
            item.group = group.trim();
        } else {
            list.unshift({key, title: this.titleOf(tab), rootId: this.rootIdOf(tab), group: group.trim()});
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
        this.refreshFavSelects();
    }

    // 刷新卡片收藏状态标识（实心/空心星与提示文案）
    private refreshCardFavState(tab: Tab, card: HTMLElement) {
        const isFaved = this.getFavorites().some((item) => item.key === this.pinKeyOf(tab));
        card.classList.toggle("sw__faved", isFaved);
        card.querySelector<HTMLElement>(".sw__fav-btn")
            ?.setAttribute("aria-label", isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab);
    }

    // 星标点击菜单：未收藏时选择收藏方式（快速收藏 / 收藏到分组 / 新建分组收藏），
    // 已收藏时管理分组（切换分组 / 移出分组 / 取消收藏）
    private openFavMenu(tab: Tab, card: HTMLElement, event: MouseEvent) {
        const key = this.pinKeyOf(tab);
        const favorite = this.getFavorites().find((item) => item.key === key);
        const groupNames = this.getFavoriteGroupNames();
        const menu = new Menu("swFavMenu");

        if (!favorite) {
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
        } else {
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
        return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

    // 跳转到收藏项：页签已开则切换过去；文档已收藏但页签关闭则重新打开；非文档页签已失效则移除收藏
    private jumpToFavorite(favorite: IFavoriteItem, onClose: IOverlayClose) {
        // 手机端 getAllTabs() 恒为空，需用 MobileTabs 数据源
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const tab = opened.find((item) => this.pinKeyOf(item) === favorite.key);
        if (tab) {
            this.activateTab(tab, onClose);
            return;
        }
        if (favorite.rootId) {
            onClose();
            if (this.isMobile) {
                // openTab 在手机端是空实现，走 MobileTabs.open
                this.mobileOpenDoc(favorite.rootId);
            } else {
                openTab({
                    app: (this as any).app,
                    doc: {id: favorite.rootId},
                });
            }
            return;
        }
        // 非文档页签已关闭：收藏失效，清理并刷新下拉
        this.removeFavorite(favorite.key);
        this.refreshFavSelects();
    }

    // 一键开启组内全部页签：仅打开可重开（rootId 非空）且未打开的收藏，返回实际打开数
    private openGroupTabs(items: IFavoriteItem[]): number {
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const openedKeys = new Set(opened.map((tab) => this.pinKeyOf(tab)));
        let count = 0;
        const seen = new Set<string>();
        items.forEach((fav) => {
            if (seen.has(fav.key)) {
                return;
            }
            seen.add(fav.key);
            if (!fav.rootId || openedKeys.has(fav.key)) {
                return;
            }
            if (this.isMobile) {
                // openTab 在手机端是空实现，走 MobileTabs.open
                this.mobileOpenDoc(fav.rootId);
            } else {
                openTab({
                    app: (this as any).app,
                    doc: {id: fav.rootId},
                });
            }
            count++;
        });
        if (count > 0) {
            showMessage(this.i18n.groupTabsOpened.replace("{x}", String(count)));
        }
        return count;
    }

    // 一键关闭组内已打开的页签：按 pinKey 匹配当前打开页签，返回实际关闭数
    private closeGroupTabs(items: IFavoriteItem[]): number {
        const keys = new Set(items.map((fav) => fav.key));
        const opened = this.isMobile ? this.getMobileTabs() : getAllTabs();
        const targets = opened.filter((tab) => keys.has(this.pinKeyOf(tab)));
        targets.forEach((tab) => {
            this.closeTabQuietly(tab);
        });
        if (targets.length > 0) {
            showMessage(this.i18n.groupTabsClosed.replace("{x}", String(targets.length)));
        }
        return targets.length;
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
        const groups = new Map<HTMLElement, IGroupedTab[]>();
        tabs.forEach((tab) => {
            const key: HTMLElement = tab.parent?.element || tab.parent?.headersElement || scrollElement;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push({tab});
        });
        const grouped: IGroupedTab[][] = Array.from(groups.values());

        // 扁平化，用于键盘导航的顺序集合
        const all: IGroupedTab[] = [];
        let defaultFocusIndex = 0;

        grouped.forEach((group) => {
            // 置顶页签固定在前，其余按排序方式排列
            const pinnedItems = group.filter((item) => pinned.has(this.pinKeyOf(item.tab)));
            const restItems = group.filter((item) => !pinned.has(this.pinKeyOf(item.tab)));
            this.sortItems(restItems, sortBy, mru, updatedMap);
            const ordered = [...pinnedItems, ...restItems];

            const groupEl = document.createElement("div");
            groupEl.className = "sw__group";

            const label = document.createElement("div");
            label.className = "sw__window-label";
            label.textContent = `${this.i18n.currentWindow} · ${ordered.length}`;
            groupEl.appendChild(label);

            const grid = document.createElement("div");
            grid.className = "sw__grid";
            // 侧边栏由专用设置 sidebarLayout 控制列数（CSS 自动响应宽度）；弹窗仍用全局 columns 设置
            const isSidebar = !!scrollElement.closest(".sw--sidebar");
            if (!isSidebar && settings.columns >= 2) {
                grid.style.gridTemplateColumns = `repeat(${settings.columns}, 1fr)`;
            }

            ordered.forEach((item) => {
                const isPinned = pinned.has(this.pinKeyOf(item.tab));
                const isFaved = favorites.has(this.pinKeyOf(item.tab));
                let card = reusable.get(item.tab.id);
                if (card) {
                    // 复用旧卡片：同步状态类/图标/标题（缩略图不动），事件沿旧闭包（同页签等价对象）
                    this.syncCardState(card, item.tab, item.tab.id === activeTabId, isPinned, isFaved);
                    reusable.delete(item.tab.id);
                } else {
                    card = this.createCard(item, item.tab.id === activeTabId, isPinned, isFaved, {
                        onActivate: (tab) => this.activateTab(tab, opts.onOverlayClose),
                        onTogglePin: (tab, cardEl) => this.handleTogglePin(tab, cardEl),
                        onToggleFav: (tab, cardEl) => this.handleToggleFav(tab, cardEl),
                        onCloseTab: (tab, cardEl) => this.handleCloseTab(tab, cardEl, opts.onTabsChanged),
                    });
                }
                grid.appendChild(card);
                item.card = card;
                all.push(item);
                // 默认聚焦 MRU 里最近使用的（非当前活动）页签，更贴近 win+tab 体验
                // MRU 按 pinKey（文档页签为 rootID）记录，需同键匹配
                if (item.tab.id !== activeTabId && mru.indexOf(this.pinKeyOf(item.tab)) === 0) {
                    defaultFocusIndex = all.length - 1;
                }
            });
            groupEl.appendChild(grid);
            scrollElement.appendChild(groupEl);
        });

        if (all.length === 0) {
            scrollElement.appendChild(this.buildEmptyState());
            return;
        }

        // 初始焦点
        this.focusCard(all[defaultFocusIndex]?.card);

        // 视口懒渲染缩略图：复用卡片跳过，新卡片滚入可视区时才生成
        this.renderThumbnails(all, scrollElement, THUMB_BATCH);
    }

    // 复用旧卡片时同步状态：置顶/收藏/激活类名与图标、标题文本
    private syncCardState(card: HTMLElement, tab: Tab, isActive: boolean, isPinned: boolean, isFaved: boolean) {
        card.className = "sw__card"
            + (isActive ? " sw__active" : "")
            + (isPinned ? " sw__pinned" : "")
            + (isFaved ? " sw__faved" : "");
        const title = this.titleOf(tab);
        card.dataset.title = title;
        card.querySelector<HTMLElement>(".sw__title")!.textContent = title;
        const iconUse = card.querySelector<SVGElement>(".sw__pin use");
        if (iconUse) {
            iconUse.setAttribute("xlink:href", isPinned ? "#iconPin" : "#iconUnpin");
        }
        card.querySelector<HTMLElement>(".sw__pin")
            ?.setAttribute("aria-label", isPinned ? this.i18n.unpinTab : this.i18n.pinTab);
        card.querySelector<HTMLElement>(".sw__fav-btn")
            ?.setAttribute("aria-label", isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab);
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
        card.querySelector<HTMLElement>(".sw__pin")
            ?.setAttribute("aria-label", isPinned ? this.i18n.unpinTab : this.i18n.pinTab);
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

    // 按双端适配关闭单个页签（仅关闭动作本身，不含卡片移除/列表刷新等收尾）
    private closeTabQuietly(tab: Tab) {
        if (this.isMobile) {
            // 手机端：MobileTabs.close 关闭页签，随后由 onTabsChanged 整列表重渲染
            try {
                (window as any).siyuan?.mobile?.tabs?.close(tab.id);
            } catch (e) {
                console.warn("[speed-switch] mobile close tab fail", e);
            }
            return;
        }
        try {
            tab.parent.removeTab(tab.id);
        } catch (e) {
            console.warn("[speed-switch] close tab fail", e);
        }
    }

    // 关闭页签：移除页签与卡片；侧边栏模式下整列表刷新（弹窗保持打开）
    private handleCloseTab(tab: Tab, card: HTMLElement, onTabsChanged: IOverlayClose) {
        this.closeTabQuietly(tab);
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
        card.className = "sw__card"
            + (isActive ? " sw__active" : "")
            + (isPinned ? " sw__pinned" : "")
            + (isFaved ? " sw__faved" : "");
        card.dataset.tabId = tab.id;
        card.dataset.title = this.titleOf(tab);

        // 缩略图占位（内容由 renderThumbnails 分批填入）
        const thumb = document.createElement("div");
        thumb.className = "sw__thumb";
        const loading = document.createElement("div");
        loading.className = "sw__thumb-loading";
        loading.innerHTML = `<svg class="sw__spin"><use xlink:href="#iconRefresh"></use></svg><span>${this.i18n.loadingThumbnail}</span>`;
        thumb.appendChild(loading);
        card.appendChild(thumb);
        item.card = card;

        // 底部：图标 + 标题
        // 图标与标题：直接复用思源页签头已渲染好的内容，保证与真实页签一致
        const meta = document.createElement("div");
        meta.className = "sw__meta";
        const iconBox = document.createElement("span");
        iconBox.className = "sw__icon";
        const graphic = tab.headElement?.querySelector<SVGElement>(".item__graphic use");
        const emoji = tab.headElement?.querySelector(".item__icon");
        if (graphic) {
            const href = graphic.getAttribute("xlink:href");
            iconBox.innerHTML = href ? `<svg><use xlink:href="${href}"></use></svg>` : "";
        } else if (emoji) {
            iconBox.textContent = emoji.textContent || "";
            iconBox.classList.add("sw__icon-emoji");
        } else {
            // 兜底图标：思源图标名走 svg use；emoji 字符（手机端文档自定义图标）按文本渲染
            const fallback = tab.icon || "";
            if (fallback && !fallback.startsWith("icon")) {
                iconBox.textContent = fallback;
                iconBox.classList.add("sw__icon-emoji");
            } else {
                iconBox.innerHTML = `<svg><use xlink:href="#${fallback || "iconFile"}"></use></svg>`;
            }
        }
        const titleEl = document.createElement("span");
        titleEl.className = "sw__title";
        titleEl.textContent = this.titleOf(tab);
        meta.appendChild(iconBox);
        meta.appendChild(titleEl);
        card.appendChild(meta);

        // 置顶按钮（左上角）：已置顶显示实心图钉，tooltip 提示当前可执行的操作
        const pinBtn = document.createElement("div");
        pinBtn.className = "sw__pin b3-tooltips b3-tooltips__s";
        pinBtn.setAttribute("aria-label", isPinned ? this.i18n.unpinTab : this.i18n.pinTab);
        pinBtn.innerHTML = `<svg><use xlink:href="${isPinned ? "#iconPin" : "#iconUnpin"}"></use></svg>`;
        pinBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            handlers.onTogglePin(tab, card);
        });
        card.appendChild(pinBtn);

        // 收藏按钮（左上角，紧邻置顶）：未收藏空心星、已收藏实心星（CSS 变量 --b3-icon-star-fill 切换填充）
        const favBtn = document.createElement("div");
        favBtn.className = "sw__fav-btn b3-tooltips b3-tooltips__s";
        favBtn.setAttribute("aria-label", isFaved ? this.i18n.unfavoriteTab : this.i18n.favoriteTab);
        favBtn.innerHTML = '<svg><use xlink:href="#iconStar"></use></svg>';
        favBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            // 点击星标弹出分组菜单：收藏时可直接选分组/新建分组，已收藏时可切换分组或取消收藏
            this.openFavMenu(tab, card, event);
        });
        card.appendChild(favBtn);

        // 关闭按钮（右上角）
        const closeBtn = document.createElement("div");
        closeBtn.className = "sw__close b3-tooltips b3-tooltips__s";
        closeBtn.setAttribute("aria-label", this.i18n.close);
        closeBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg>';
        closeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            handlers.onCloseTab(tab, card);
        });
        card.appendChild(closeBtn);

        // 右键菜单：置顶 / 收藏 / 关闭
        card.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openCardMenu(tab, card, handlers, event.clientX, event.clientY);
        });

        // 手机端长按（≈500ms）弹出与桌面右键一致的操作菜单；
        // 拦截 click 必须注册在 activate 之前（目标节点按注册顺序触发）
        if (this.isMobile) {
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
                    this.openCardMenu(tab, card, handlers, menuX, menuY);
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

        // 点击整卡切换到该页签
        card.addEventListener("click", () => handlers.onActivate(tab));
        card.addEventListener("mouseenter", () => {
            this.focusCard(card);
        });
        return card;
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
        this.saveData(THUMB_CACHE_KEY, cache).catch((e) => console.warn("[speed-switch] save thumb cache fail", e));
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
        // 容量控制：超出上限时删最旧的条目
        const keys = Object.keys(cache);
        if (keys.length > cacheMax) {
            keys.sort((a, b) => cache[a].ts - cache[b].ts);
            keys.slice(0, keys.length - cacheMax).forEach((key) => delete cache[key]);
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
        const prev = (scrollElement as any).__swThumbObserver as IntersectionObserver | undefined;
        if (prev) {
            prev.disconnect();
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
        (scrollElement as any).__swThumbObserver = observer;

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
            content.style.transform = `scale(${(width / CONTENT_WIDTH).toFixed(3)})`;
        } else {
            requestAnimationFrame(() => {
                if (thumb.isConnected && thumb.clientWidth > 0) {
                    content.style.transform = `scale(${(thumb.clientWidth / CONTENT_WIDTH).toFixed(3)})`;
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
            console.warn("[speed-switch] fetch doc content fail", e);
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
            const model: any = (tab as any).model;
            const wysiwyg: HTMLElement | undefined = model?.editor?.wysiwyg?.element;
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
            console.warn("[speed-switch] build thumbnail fail", e);
        }
        return null;
    }

    // 键盘导航：方向键 / Tab 移动，Enter 切换，Esc 关闭（仅弹窗模式使用）
    private bindKeydown(scrollElement: HTMLElement, closeOverlay: IOverlayClose) {
        scrollElement.addEventListener("keydown", (event) => {
            const key = event.key;
            const cards = Array.from(scrollElement.querySelectorAll<HTMLElement>(".sw__card"));
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
                const tab = getAllTabs().find((item) => item.id === tabId);
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
        const container = card.parentElement;
        if (container) {
            container.querySelectorAll(".sw__card").forEach((el) => el.classList.remove("sw__focused"));
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
        this.data[MRU_KEY] = list;
        this.saveDataDebounced(MRU_KEY);

        if (this.isMobile) {
            // 手机端：MobileTabs.switchTo 切换页签
            try {
                (window as any).siyuan?.mobile?.tabs?.switchTo(tab.id);
            } catch (e) {
                console.warn("[speed-switch] mobile switch tab fail", e);
            }
            onClose?.();
            return;
        }

        // 等价于点击该页签：内部会切到目标页签，并通过 setPanelFocus 激活其所在窗口（支持分栏）
        try {
            tab.parent.switchTab(tab.headElement, true);
            if (typeof (tab.parent as any).showHeading === "function") {
                (tab.parent as any).showHeading();
            }
        } catch (e) {
            console.warn("[speed-switch] switch tab fail", e);
        }
        onClose?.();
    }

    // ==================== 手机端 ====================

    // 手机端数据源适配：思源 getAllTabs() 在手机端（MOBILE 构建）恒返回空数组，
    // 页签数据需从 window.siyuan.mobile.tabs（思源 3.8+ MobileTabs）读取，
    // 包装成与桌面端 Tab 兼容的伪 Tab，使 rootIdOf/titleOf/pinKeyOf/createCard 等直接复用
    private getMobileTabs(): Tab[] {
        const state = (window as any).siyuan?.mobile?.tabs?.state as IMobileTabsState | undefined;
        if (!state?.tabs) {
            return [];
        }
        return state.tabs
            .filter((t) => t.current?.rootID)
            .map((t) => ({
                id: t.id,                       // MobileTabs 页签 id（switchTo/close 使用）
                title: t.current!.title,
                icon: t.current!.icon || "",
                // 兼容 rootIdOf()：直接命中 model.editor.block.rootID 分支
                model: {editor: {block: {rootID: t.current!.rootID}}},
            } as unknown as Tab));
    }

    // 手机端 MobileTabs 状态是否可用（思源 3.8+ 才有；旧版手机端无多页签概念）
    private hasMobileTabsApi(): boolean {
        return !!(window as any).siyuan?.mobile?.tabs?.state;
    }

    // 手机端当前激活页签 id（无激活时返回 undefined）
    private getMobileActiveTabId(): string | undefined {
        return (window as any).siyuan?.mobile?.tabs?.state?.activeTabID as string | undefined;
    }

    // 手机端打开文档：openTab 插件 API 在手机端是空实现（TODO: Mobile），
    // 需调用 MobileTabs.open(rootID)
    private mobileOpenDoc(rootId: string) {
        try {
            (window as any).siyuan?.mobile?.tabs?.open(rootId);
        } catch (e) {
            console.warn("[speed-switch] mobile open doc fail", e);
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

        const settings = this.getSettings();
        // 手机端当前页签高亮：MobileTabs 的 activeTabID（renderMobileList 仅读取其 id）
        const activeTab = this.isMobile
            ? ({id: this.getMobileActiveTabId()} as Tab)
            : this.getActiveTab();

        const dialog = new Dialog({
            title: "",
            content: `<div class="speed-switch sw__body sw__mobile">
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
            <svg><use xlink:href="#iconDate"></use></svg>
        </span>
        <span class="b3-button b3-button--text sw__icon-btn sw__settings-btn" aria-label="${this.i18n.settings}">
            <svg><use xlink:href="#iconSettings"></use></svg>
        </span>
    </div>
    <div class="sw__scroll" tabindex="0"></div>
</div>`,
            width: "92vw",
            height: "85vh",
            // 关键修复：思源 Dialog 先把元素挂到 DOM，b3-dialog--open 类要等 50ms 超时才补上，
            // 期间容器处于 transform: scale(.8) 过渡态；手机 WebView 中带 backdrop-filter 的
            // 子元素在该动画窗口内会渲染错乱（图标巨大/位置错位），动画结束又自愈——
            // 即"刚打开闪一下错乱"的根因。禁用动画让容器同步进入最终态，彻底消除该窗口
            disableAnimation: true,
        });

        const dialogBody = dialog.element.querySelector<HTMLElement>(".b3-dialog__body");
        if (dialogBody) {
            dialogBody.classList.add("sw-scroll-locked");
        }

        // 清理缩略图缓存中已无对应打开页签的孤儿条目
        this.pruneThumbCache(tabs);

        const searchInput = dialog.element.querySelector<HTMLInputElement>(".sw__search");
        const sortSelect = dialog.element.querySelector<HTMLSelectElement>(".sw__sort");
        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        // 隐藏 FAB 避免遮挡弹窗
        this.fabElement?.classList.add("sw__fab--hidden");

        // 统一恢复 FAB 的函数
        const restoreFAB = () => {
            this.fabElement?.classList.remove("sw__fab--hidden");
        };

        const closeOverlay = () => {
            restoreFAB();
            dialog.destroy();
        };

        // 钩住 Dialog 的 destroy 方法，确保无论何种方式关闭（Escape/点击外部/程序调用）都恢复 FAB
        const origDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            restoreFAB();
            origDestroy();
        };

        // 设置按钮
        dialog.element.querySelector(".sw__settings-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.fabElement?.classList.remove("sw__fab--hidden");
            this.openSetting();
        });

        // 收藏按钮 → 底部弹窗
        dialog.element.querySelector(".sw__mobile-fav-btn")?.addEventListener("click", () => {
            this.showMobileFavSheet(dialog, closeOverlay);
        });

        // 顶栏日记按钮：打开/新建当日日记（关闭弹窗并恢复 FAB，未设默认日记本时首次点击弹出选择）
        dialog.element.querySelector(".sw__journal-btn")?.addEventListener("click", () => {
            dialog.destroy();
            this.fabElement?.classList.remove("sw__fab--hidden");
            this.openJournal();
        });

        sortSelect.value = settings.sortBy;
        // 手机端关闭页签后整列表重渲染（数据源是 MobileTabs 状态，需重新读取）
        const listOpts = {onOverlayClose: closeOverlay, onTabsChanged: () => renderMobileList()};
        let updatedMap: {[rootId: string]: string} = {};

        const renderMobileList = () => {
            this.renderMobileList(scrollElement, this.getMobileTabs(),
                {id: this.getMobileActiveTabId()} as Tab, listOpts, sortSelect.value as SortBy, updatedMap);
        };

        renderMobileList();
        // 手机端不自动聚焦搜索框：避免一打开就弹出输入法，需要搜索时点击输入框

        // 排序切换
        sortSelect.addEventListener("change", () => {
            this.updateSettings({sortBy: sortSelect.value as SortBy});
            renderMobileList();
            searchInput.value = "";
            this.filterCards(scrollElement, searchInput.value);
        });

        // 搜索
        searchInput.addEventListener("input", () => {
            this.applySearch(scrollElement, searchInput, closeOverlay);
        });

        // 最近编辑排序
        this.loadUpdatedMap(tabs).then((map) => {
            updatedMap = map;
            if (dialog.element.isConnected && sortSelect.value === "updatedDesc" && searchInput.value.trim() === "") {
                renderMobileList();
            }
        });
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
        const pinnedItems = items.filter((item) => pinned.has(this.pinKeyOf(item.tab)));
        const restItems = items.filter((item) => !pinned.has(this.pinKeyOf(item.tab)));
        this.sortItems(restItems, sortBy, mru, updatedMap);
        const ordered = [...pinnedItems, ...restItems];

        const groupEl = document.createElement("div");
        groupEl.className = "sw__group";

        const grid = document.createElement("div");
        grid.className = "sw__grid sw__mobile-grid";
        if (settings.mobileColumns === 1) {
            grid.classList.add("sw__mobile-grid--double");
        } else if (settings.mobileColumns === 2) {
            // auto: portrait=single, landscape=double (handled by CSS media query)
            grid.classList.add("sw__mobile-grid--auto");
        }

        const all: IGroupedTab[] = [];
        ordered.forEach((item) => {
            const isPinned = pinned.has(this.pinKeyOf(item.tab));
            const isFaved = favorites.has(this.pinKeyOf(item.tab));
            let card = reusable.get(item.tab.id);
            if (card) {
                this.syncCardState(card, item.tab, item.tab.id === activeTabId, isPinned, isFaved);
                card.classList.add("sw__mobile-card");
                reusable.delete(item.tab.id);
            } else {
                card = this.createCard(item, item.tab.id === activeTabId, isPinned, isFaved, {
                    onActivate: (tab) => this.activateTab(tab, opts.onOverlayClose),
                    onTogglePin: (tab, cardEl) => this.handleTogglePin(tab, cardEl),
                    onToggleFav: (tab, cardEl) => this.handleToggleFav(tab, cardEl),
                    onCloseTab: (tab, cardEl) => this.handleCloseTab(tab, cardEl, opts.onTabsChanged),
                });
                card.classList.add("sw__mobile-card");
            }
            grid.appendChild(card);
            item.card = card;
            all.push(item);
        });

        groupEl.appendChild(grid);
        scrollElement.appendChild(groupEl);

        if (all.length === 0) {
            scrollElement.appendChild(this.buildEmptyState());
            return;
        }

        // 手机端缩略图：视口懒渲染 + 更保守的回源并发
        this.renderThumbnails(all, scrollElement, THUMB_BATCH_MOBILE);
    }

    // 手机端收藏底部弹窗；onTabsChanged：组内页签批量开/关后刷新背后的切换器列表
    private showMobileFavSheet(dialog: Dialog, closeOverlay: IOverlayClose, onTabsChanged?: () => void) {
        const favorites = this.getFavorites();
        const groupNames = this.getFavoriteGroupNames();

        if (favorites.length === 0 && groupNames.length === 0) {
            return;
        }

        // 构建底部弹窗
        const overlay = document.createElement("div");
        overlay.className = "sw__mobile-sheet-overlay";
        overlay.innerHTML = `<div class="sw__mobile-sheet" role="dialog" aria-modal="true" aria-label="${this.escapeAttr(this.i18n.mobileFavTitle)}">
    <div class="sw__mobile-sheet-handle"></div>
    <div class="sw__mobile-sheet-title">${this.i18n.mobileFavTitle}</div>
    <div class="sw__mobile-sheet-body"></div>
</div>`;
        document.body.appendChild(overlay);

        const sheet = overlay.querySelector<HTMLElement>(".sw__mobile-sheet");
        const body = overlay.querySelector<HTMLElement>(".sw__mobile-sheet-body");

        // 渲染收藏内容（复用分组逻辑）
        const groups = new Map<string, IFavoriteItem[]>();
        groupNames.forEach((name) => groups.set(name, []));
        favorites.forEach((fav) => {
            const name = fav.group || "";
            if (!groups.has(name)) {
                groups.set(name, []);
            }
            groups.get(name)!.push(fav);
        });

        const groupedNames = Array.from(groups.keys()).filter((name) => name !== "");
        const ungrouped = groups.get("") || [];

        if (groupedNames.length === 0) {
            const list = document.createElement("div");
            list.className = "sw__mobile-sheet-list";
            ungrouped.forEach((fav) => {
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
            body.appendChild(list);
        } else {
            groupedNames.forEach((name) => {
                const items = groups.get(name) || [];
                const section = document.createElement("div");
                section.className = "sw__mobile-sheet-section";
                const header = document.createElement("div");
                header.className = "sw__mobile-sheet-section-header";
                header.innerHTML = `<span>${this.escapeAttr(name)}</span><span class="sw__mobile-sheet-count">${items.length}</span>`;
                section.appendChild(header);
                const list = document.createElement("div");
                list.className = "sw__mobile-sheet-list";
                items.forEach((fav) => {
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
                section.appendChild(list);
                body.appendChild(section);
            });
            if (ungrouped.length > 0) {
                const section = document.createElement("div");
                section.className = "sw__mobile-sheet-section";
                const header = document.createElement("div");
                header.className = "sw__mobile-sheet-section-header";
                header.innerHTML = `<span>${this.escapeAttr(this.i18n.ungrouped)}</span><span class="sw__mobile-sheet-count">${ungrouped.length}</span>`;
                section.appendChild(header);
                const list = document.createElement("div");
                list.className = "sw__mobile-sheet-list";
                ungrouped.forEach((fav) => {
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
                section.appendChild(list);
                body.appendChild(section);
            }
        }

        if (favorites.length === 0) {
            const empty = document.createElement("div");
            empty.className = "sw__mobile-sheet-empty";
            empty.textContent = this.i18n.mobileNoFav;
            body.appendChild(empty);
        }

        // 动画：下一帧滑入
        requestAnimationFrame(() => {
            sheet.classList.add("sw__mobile-sheet--open");
        });

        // 点击背景关闭（sheet 下滑 + 遮罩淡出后再移除）
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                sheet.classList.remove("sw__mobile-sheet--open");
                overlay.style.opacity = "0";
                setTimeout(() => overlay.remove(), 250);
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

        // 与收藏弹窗一致的下滑收起动画
        const closeSelf = () => {
            sheet.classList.remove("sw__mobile-sheet--open");
            overlay.style.opacity = "0";
            setTimeout(() => overlay.remove(), 250);
        };

        const appendAction = (label: string, action: () => number) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "sw__mobile-sheet-item";
            item.textContent = label;
            item.addEventListener("click", () => {
                const count = action();
                closeSelf();
                // 仅在确实发生变更时刷新背后的切换器列表
                if (count > 0) {
                    onChanged();
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
        element.innerHTML = `<div class="sw__content">
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

        const tabs = getAllTabs();
        this.pruneThumbCache(tabs);
        const activeTab = this.getActiveTab();
        const refresh = () => this.refreshSidebar();
        const scrollElement = element.querySelector<HTMLDivElement>(".sw__scroll");
        this.renderList(scrollElement, tabs, activeTab, {onOverlayClose: refresh, onTabsChanged: refresh}, this.getSettings().sortBy, {});

        // 面板尺寸变化时仅重算缩略图缩放比例（ResizeObserver 覆盖拖动分隔条等所有场景）
        if (this.sidebarResizeObserver) {
            this.sidebarResizeObserver.disconnect();
        }
        this.sidebarResizeObserver = new ResizeObserver(() => this.rescaleThumbs(element));
        this.sidebarResizeObserver.observe(element);

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
            backTopBtn?.classList.toggle("sw__show", scrollElement.scrollTop >= 240);
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
                content.style.transform = `scale(${(width / CONTENT_WIDTH).toFixed(3)})`;
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
            console.warn("[speed-switch] toggle sidebar fail", e);
        }
    }

    // 读取 MRU 记录
    private getMru(): string[] {
        const data = this.data[MRU_KEY];
        return Array.isArray(data) ? (data as string[]) : [];
    }
}
