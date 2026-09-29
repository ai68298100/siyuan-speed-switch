// SiYuan 宿主最小桩（面板互切 CDP 复现专用）：模拟宿主 Dialog 的 DOM 结构、
// zIndex 递增（window.siyuan.zIndex += 2）与同步 destroy；其余 API 为空实现。
export class Dialog {
    element: HTMLElement;
    constructor(options: {title?: string; content?: string; width?: string; height?: string; disableClose?: boolean; destroyCallback?: () => void}) {
        (globalThis as any).siyuan.zIndex += 2;
        const z = (globalThis as any).siyuan.zIndex;
        this.element = document.createElement("div");
        this.element.className = "b3-dialog";
        this.element.style.zIndex = String(z - 1);
        const container = document.createElement("div");
        container.className = "b3-dialog__container";
        container.style.zIndex = String(z);
        if (options.width) container.style.width = options.width;
        if (options.height) container.style.height = options.height;
        const content = document.createElement("div");
        content.className = "b3-dialog__content";
        const body = document.createElement("div");
        body.className = "b3-dialog__body";
        if (options.content) body.innerHTML = options.content;
        content.appendChild(body);
        container.appendChild(content);
        this.element.appendChild(container);
        (this.element as any).__destroyCallback = options.destroyCallback;
        document.body.appendChild(this.element);
    }
    destroy() {
        const cb = (this.element as any).__destroyCallback;
        this.element.remove();
        if (cb) cb();
    }
}

export function showMessage() {}
export function getAllTabs() { return []; }
export function getActiveTab() { return undefined; }
export function openTab() {}
export function getFrontend() { return "desktop"; }
export function Menu() {}

export class Plugin {
    i18n: Record<string, string> = ((globalThis as any).__stubI18n || {}) as Record<string, string>;
    data: Record<string, unknown> = {};
    eventBus = {on() {}, off() {}, emit() {}};
    addIcons() {}
    addTopBar() {}
    addDock() { return {}; }
    async loadData(_key?: string) { return null; }
    async saveData(_key: string, _value: unknown) {}
}
