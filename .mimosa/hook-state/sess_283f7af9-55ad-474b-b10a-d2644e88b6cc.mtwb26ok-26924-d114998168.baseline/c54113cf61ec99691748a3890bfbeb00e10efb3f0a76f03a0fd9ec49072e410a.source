// 思源全局对象 window.siyuan 的类型定义（仅覆盖本插件实际访问到的字段）
// 注意：思源没有官方公开发布 .d.ts，部分字段来自反推 / 社区插件沉淀。
// 类型尽量写成"宽进宽出"的反推形式，避免 TypeScript 把 callSite 与实际签名不一致时硬性报错。

// ── MobileTabs（思源 3.8+ Mobile 端新增） ──
export interface IMobileTabEntry {
    id: string;
    rootID: string;
    notebookID: string;
    path: string;
    title: string;
    icon?: string;
}

export interface IMobileTabsState {
    version: number;
    activeTabID?: string;
    tabs: Array<{ id: string; current?: IMobileTabEntry; activeAt: number }>;
}

// open/close 实际返回 Promise（结果：success/cancelled/invalid/failed）；旧版本可能同步无返回，
// 按本文件"宽进宽出"约定写成联合签名，调用方对结果做 undefined 兜底
export type IMobileTabsResult = "success" | "cancelled" | "invalid" | "failed";

export interface IMobileTabsAPI {
    state?: IMobileTabsState;
    open?: (rootId: string) => Promise<IMobileTabsResult> | void;
    close?: (tabId: string) => Promise<IMobileTabsResult> | void;
    switchTo?: (tabId: string) => void;
}

// ── 思源 layout ──
// 思源不同版本 dock.toggleModel 签名有变化（带 type / 不带 type），这里用宽松的可选签名兜底
export interface ISiyuanLayoutDockToggleModel {
    (type?: string, show?: boolean, close?: boolean, hide?: boolean, isSaveLayout?: boolean): void;
    (...args: unknown[]): void;
}

export interface ISiyuanLayoutDock {
    data?: Record<string, unknown>;
    toggleModel?: ISiyuanLayoutDockToggleModel;
}

export interface ISiyuanLayoutDockEntry {
    type?: string;
    title?: string;
    icon?: string;
}

export interface ISiyuanLayout {
    center?: { children?: Array<{ children?: Array<{ type?: string }> }> };
    leftDock?: ISiyuanLayoutDock;
    rightDock?: ISiyuanLayoutDock;
    bottomDock?: ISiyuanLayoutDock;
    left?: { children?: Array<ISiyuanLayoutDockEntry> };
    right?: { children?: Array<ISiyuanLayoutDockEntry> };
    bottom?: { children?: Array<ISiyuanLayoutDockEntry> };
}

// ── 思源配置（keymap/uiLayout） ──
export interface ISiyuanKeymapEntry {
    custom?: string;
}

export interface ISiyuanKeymap {
    plugin?: Record<string, Record<string, ISiyuanKeymapEntry>>;
}

export interface ISiyuanUiLayoutSides {
    data?: unknown[];
}

export interface ISiyuanUiLayout {
    hideDock?: boolean;
    left?: ISiyuanUiLayoutSides;
    right?: ISiyuanUiLayoutSides;
    bottom?: ISiyuanUiLayoutSides;
}

export interface ISiyuanConfig {
    keymap?: ISiyuanKeymap;
    uiLayout?: ISiyuanUiLayout;
}

export interface ISiyuanMobile {
    tabs?: IMobileTabsAPI;
}

export interface ISiyuanGlobal {
    config?: ISiyuanConfig;
    layout?: ISiyuanLayout;
    mobile?: ISiyuanMobile;
}

// ── 懒挂在 window 上的 ElementStorage，给 dock 回调使用 ──
export interface IElementStorage {
    [key: string]: HTMLElement | undefined;
}

// ── 思源 Protyle Tab 懒挂的 model 结构（懒加载的反推最小集） ──
export interface IProtyleWysiwyg {
    element?: HTMLElement;
}

export interface IProtyleBlock {
    rootID?: string;
}

export interface IProtyleEditor {
    block?: IProtyleBlock;
    protyle?: {
        block?: IProtyleBlock;
    };
    wysiwyg?: IProtyleWysiwyg;
}

export interface IProtyleTabModel {
    editor?: IProtyleEditor;
}

// ── 缩略图 IntersectionObserver 反挂标记（避免重复挂载） ──
// 通用 helper：从 window 安全读取思源全局（避免每次写 (window as any).siyuan）
export function getSiyuan(): ISiyuanGlobal | undefined {
    // 用 unknown 双步收窄，避开 Window 全局类型与自定义字段类型冲突
    const w = window as unknown as { siyuan?: ISiyuanGlobal };
    return w.siyuan;
}
