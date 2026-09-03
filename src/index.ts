import {Plugin, Dialog, getFrontend, getAllTabs, getActiveTab} from "siyuan";
import "./index.scss";

// siyuan 包未将 Tab 作为顶层命名导出，这里从 getAllTabs 返回类型推导
type Tab = ReturnType<typeof getAllTabs>[number];

const MRU_KEY = "sw_mru";            // 最近使用页签记录，数组按最近在前排列
const CONTENT_WIDTH = 800;           // 缩略图内容的模拟宽度（px），用于计算缩放比例
const THUMB_BATCH = 4;               // 批量渲染缩略图的并发数量，避免一次克隆大量 DOM 卡住界面
const DEFAULT_HOTKEY = "⇧⌥S";        // 默认快捷键 Shift+Alt+S

interface IGroupedTab {
    tab: Tab;
    card?: HTMLElement;
}

export default class SpeedSwitchPlugin extends Plugin {
    private isMobile = false;

    onload() {
        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

        this.addTopBar({
            icon: "iconLayout",
            title: this.i18n.switchTabs,
            position: "right",
            callback: () => {
                this.showSwitcher();
            },
        });

        this.addCommand({
            langKey: "switchTabs",
            hotkey: DEFAULT_HOTKEY,
            callback: () => {
                this.showSwitcher();
            },
        });
    }

    // 打开页签切换器
    private showSwitcher() {
        // 移动端不支持 centerLayout，页签切换在移动端无意义，直接提示后返回
        if (this.isMobile) {
            alert(this.i18n.switchTabs + ": " + this.i18n.noOpenedTabs);
            return;
        }

        const tabs = getAllTabs();
        if (tabs.length === 0) {
            alert(this.i18n.noOpenedTabs);
            return;
        }

        const activeTab = this.getActiveTab();

        const dialog = new Dialog({
            title: this.i18n.switchTabs,
            content: `<div class="speed-switch sw__body">
    <div class="sw__hint">${this.i18n.keyboardHintNavigation}</div>
    <div class="sw__scroll" tabindex="0"></div>
</div>`,
            width: this.isMobile ? "92vw" : "880px",
            height: this.isMobile ? "78vh" : "72vh",
        });

        const scrollElement = dialog.element.querySelector<HTMLDivElement>(".sw__scroll");
        this.renderList(scrollElement, tabs, activeTab, dialog);
        this.bindKeydown(scrollElement, dialog);

        // 让滚动区域获得焦点以接收键盘导航
        scrollElement.focus();
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

    // 按窗口分组并渲染全部页签
    private renderList(scrollElement: HTMLElement, tabs: Tab[], activeTab: Tab | undefined, dialog: Dialog) {
        const activeTabId = activeTab?.id;
        const mru = this.getMru();

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
            const label = document.createElement("div");
            label.className = "sw__window-label";
            label.textContent = `${this.i18n.currentWindow} · ${group.length}`;
            scrollElement.appendChild(label);

            const grid = document.createElement("div");
            grid.className = "sw__grid";

            group.forEach((item, index) => {
                const card = this.createCard(item, item.tab.id === activeTabId, (tab) => {
                    this.activateTab(tab, dialog);
                });
                grid.appendChild(card);
                item.card = card;
                all.push(item);
                // 默认聚焦 MRU 里最近使用的（非当前活动）页签，更贴近 win+tab 体验
                if (item.tab.id !== activeTabId && mru.indexOf(item.tab.id) === 0) {
                    defaultFocusIndex = all.length - 1;
                }
            });
            scrollElement.appendChild(grid);
        });

        if (all.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = this.i18n.noOpenedTabs;
            scrollElement.appendChild(empty);
            return;
        }

        // 初始焦点
        this.focusCard(all[defaultFocusIndex]?.card);

        // 分批渲染缩略图
        this.renderThumbnails(all, THUMB_BATCH);
    }

    // 构建一张页签卡片（缩略图区域 + 底部信息）
    private createCard(item: IGroupedTab, isActive: boolean, onActivate: (tab: Tab) => void): HTMLElement {
        const tab = item.tab;
        const card = document.createElement("div");
        card.className = "sw__card" + (isActive ? " sw__active" : "");
        card.dataset.tabId = tab.id;

        // 缩略图占位（内容由 renderThumbnails 分批填入）
        const thumb = document.createElement("div");
        thumb.className = "sw__thumb";
        const loading = document.createElement("div");
        loading.className = "sw__thumb-loading";
        loading.textContent = this.i18n.loadingThumbnail;
        thumb.appendChild(loading);
        card.appendChild(thumb);
        item.card = card;

        // 底部：图标 + 标题
        const meta = document.createElement("div");
        meta.className = "sw__meta";
        const iconBox = document.createElement("span");
        iconBox.className = "sw__icon";
        iconBox.innerHTML = `<svg><use xlink:href="#${tab.icon || "iconFile"}"></use></svg>`;
        const titleEl = document.createElement("span");
        titleEl.className = "sw__title";
        titleEl.textContent = tab.docIcon || tab.title || tab.id;
        meta.appendChild(iconBox);
        meta.appendChild(titleEl);
        card.appendChild(meta);

        // 关闭按钮
        const closeBtn = document.createElement("div");
        closeBtn.className = "sw__close";
        closeBtn.innerHTML = '<svg><use xlink:href="#iconClose"></use></svg>';
        closeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            tab.parent.removeTab(tab.id);
            card.remove();
        });
        card.appendChild(closeBtn);

        // 点击整卡切换到该页签
        card.addEventListener("click", () => onActivate(tab));
        card.addEventListener("mouseenter", () => {
            this.focusCard(card);
        });
        return card;
    }

    // 分批克隆真实内容生成缩略图
    private renderThumbnails(list: IGroupedTab[], batch: number) {
        let index = 0;
        const runBatch = () => {
            const end = Math.min(index + batch, list.length);
            for (; index < end; index++) {
                const item = list[index];
                const thumb = item.card?.querySelector<HTMLElement>(".sw__thumb");
                if (!thumb) {
                    continue;
                }
                const source = this.getThumbSource(item.tab);
                if (!source) {
                    const loading = thumb.querySelector(".sw__thumb-loading");
                    if (loading) {
                        loading.textContent = "";
                    }
                    continue;
                }
                const content = document.createElement("div");
                content.className = "sw__thumb-content";
                content.appendChild(source);
                // 清空 loading 占位
                thumb.innerHTML = "";
                thumb.appendChild(content);
                // 依据盒子实际宽度计算缩放比例
                const width = thumb.clientWidth || CONTENT_WIDTH;
                content.style.transform = `scale(${(width / CONTENT_WIDTH).toFixed(3)})`;
                content.setAttribute("aria-label", `${item.tab.title || ""}`);
            }
            if (index < list.length) {
                requestAnimationFrame(runBatch);
            }
        };
        requestAnimationFrame(runBatch);
    }

    // 获取可克隆的缩略图内容源；文档页签优先取其 WYSIWYG 内容
    private getThumbSource(tab: Tab): HTMLElement | null {
        try {
            const model: any = (tab as any).model;
            const wysiwyg: HTMLElement | undefined = model?.editor?.protyle?.wysiwyg?.element;
            if (wysiwyg && wysiwyg.childElementCount > 0) {
                return wysiwyg.cloneNode(true) as HTMLElement;
            }
            if (tab.panelElement && tab.panelElement.childElementCount > 0) {
                return tab.panelElement.cloneNode(true) as HTMLElement;
            }
        } catch (e) {
            console.warn("[speed-switch] build thumbnail fail", e);
        }
        return null;
    }

    // 键盘导航：方向键 / Tab 移动，Enter 切换，Esc 关闭
    private bindKeydown(scrollElement: HTMLElement, dialog: Dialog) {
        scrollElement.addEventListener("keydown", (event) => {
            const key = event.key;
            const cards = Array.from(scrollElement.querySelectorAll<HTMLElement>(".sw__card"));
            if (cards.length === 0) {
                return;
            }
            const current = cards.findIndex((el) => el.classList.contains("sw__focused"));
            const focusIndex = current >= 0 ? current : 0;

            // 估算网格列数用于上下导航
            const grid = scrollElement.querySelector(".sw__grid") as HTMLElement | null;
            const colCount = grid ? Math.max(1, Math.floor(grid.clientWidth / 230)) : 1;

            let next = -1;
            if (key === "ArrowRight" || key === "Tab") {
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
                    this.activateTab(tab, dialog);
                }
                return;
            } else if (key === "Escape") {
                event.stopPropagation();
                dialog.destroy();
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

    // 切换到目标页签并关闭切换器
    private activateTab(tab: Tab, dialog: Dialog) {
        // 记录 MRU
        const mru = this.getMru();
        const list = mru.filter((id) => id !== tab.id);
        list.unshift(tab.id);
        this.saveData(MRU_KEY, list).catch((e) => console.warn("[speed-switch] save mru fail", e));

        // 等价于点击该页签：内部会切到目标页签，并通过 setPanelFocus 激活其所在窗口（支持分栏）
        try {
            tab.parent.switchTab(tab.headElement, true);
            if (typeof (tab.parent as any).showHeading === "function") {
                (tab.parent as any).showHeading();
            }
        } catch (e) {
            console.warn("[speed-switch] switch tab fail", e);
        }
        dialog.destroy();
    }

    // 读取 MRU 记录
    private getMru(): string[] {
        const data = this.data[MRU_KEY];
        return Array.isArray(data) ? (data as string[]) : [];
    }
}