/**
 * 小驴雷切对外服务窗口桥（小驴生态协商协议 v1）
 *
 * 挂载点：
 *   - window.siyuanSpeedSwitch（向后兼容已有 E2E、探针与插件调用）
 *   - window.xiaolvSpeedSwitch / window.xiaolvRaikiri / window.lvRaikiri（小驴生态统一前缀）
 *
 * 职责边界：
 *   1. 遵循 ADR-0013 严格安全边界，仅暴露导航工作面呼叫、工作区上下文检索与只读搜索；
 *   2. 不暴露任何破坏性私有数据、密钥或配置写回能力；
 *   3. 统一使用 ActionResult<T> 规范信封；
 *   4. 首实例优先（First-Instance-Wins）防重挂载与安全卸载解绑。
 */

export const RAIKIRI_BRIDGE_PROTOCOL = 1;
export const RAIKIRI_BRIDGE_NAME = "siyuan-speed-switch" as const;

export const RAIKIRI_CAPABILITIES = Object.freeze([
    "whenReady",
    "openSwitcher",
    "openWorkbench",
    "openStudio",
    "getNavigationContext",
    "getWorkspaceStats",
    "searchDocuments",
    "registerHomeModule",
]);

export interface ActionResult<T = unknown> {
    ok: boolean;
    data?: T;
    code?: string;
    message?: string;
}

export interface RaikiriNavigationTab {
    id: string;
    rootId?: string;
    title: string;
    path?: string;
    notebookId?: string;
    source: string;
}

export interface RaikiriNavigationContext {
    device: "desktop" | "mobile";
    activeDocument?: { id: string; title: string };
    openTabs: RaikiriNavigationTab[];
    closedTabs: Array<{ id: string; rootId: string; title: string; ts?: number }>;
    documentSets: Array<{ name: string; count: number }>;
    availableSurfaces: Array<"switcher" | "workbench" | "studio">;
    syncing: boolean;
}

export interface RaikiriWorkspaceStats {
    openTabCount: number;
    closedTabCount: number;
    documentSetCount: number;
    availableSurfaces: string[];
    isMobile: boolean;
}

export interface RaikiriSearchArgs {
    query: string;
    notebook?: string;
    paths?: string[];
    method?: "keyword" | "query" | "regexp";
    orderBy?: "relevanceDesc" | "updatedDesc" | "createdDesc" | "content";
    type?: "document" | "heading" | "paragraph" | "codeBlock";
    subType?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "o" | "u" | "t";
    limit?: number;
    offset?: number;
}

export interface RaikiriBridgeApi {
    readonly protocol: number;
    readonly protocolName: string;
    readonly capabilities: readonly string[];
    whenReady(): boolean;
    openSwitcher(focusSearch?: boolean): ActionResult<boolean>;
    openWorkbench(options?: { tab?: string; entry?: string }): ActionResult<boolean>;
    openStudio(options?: { objectId?: string; query?: string; entry?: string }): ActionResult<boolean>;
    getNavigationContext(): ActionResult<RaikiriNavigationContext>;
    getWorkspaceStats(): ActionResult<RaikiriWorkspaceStats>;
    searchDocuments(args: RaikiriSearchArgs): Promise<ActionResult<unknown>>;
    registerHomeModule?(options: any): (() => void) | { unregister?: () => void };
}

export interface RaikiriNavigatedEventDetail {
    plugin: "siyuan-speed-switch";
    v: 1;
    ts: number;
    surface: "switcher" | "workbench" | "studio";
    action: "open" | "navigate" | "close";
    entry?: string;
    occurredAt: string;
    idempotencyKey: string;
}

/**
 * 跨插件广播工作面切换事件（CustomEvent 旁路解耦）
 */
export function dispatchRaikiriNavigatedEvent(detail: {
    surface: "switcher" | "workbench" | "studio";
    action: "open" | "navigate" | "close";
    entry?: string;
    ts?: number;
}): void {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    try {
        const ts = detail.ts ?? Date.now();
        const fullDetail: RaikiriNavigatedEventDetail = {
            plugin: "siyuan-speed-switch",
            v: 1,
            ts,
            surface: detail.surface,
            action: detail.action,
            entry: detail.entry,
            occurredAt: new Date(ts).toISOString(),
            idempotencyKey: `${detail.surface}:${detail.action}:${ts}`,
        };
        window.dispatchEvent(new CustomEvent("lv-raikiri:navigated", { detail: fullDetail }));
    } catch {
        /* 事件旁路广播静默防护 */
    }
}

export interface RaikiriBridgeHandlers {
    openSwitcher: (focusSearch?: boolean) => void;
    openWorkbench: (context?: { tab?: string; entry?: string }) => void;
    openStudio: (context?: { objectId?: string; query?: string; entry?: string }) => void;
    getNavigationContext: () => RaikiriNavigationContext;
    getWorkspaceStats: () => RaikiriWorkspaceStats;
    searchDocuments: (args: RaikiriSearchArgs) => Promise<unknown>;
    registerHomeModule?: (options: any) => (() => void) | { unregister?: () => void };
}

/**
 * 第三方小组件安全读取器：800ms 超时熔断 + 3s 快照缓存 + 全链路单向异常隔离
 */
export function wrapEcosystemModuleRead(
    rawRead: (config: any, device: string, options?: any) => Promise<any> | any,
    timeoutMs = 800,
    cacheTtlMs = 3000,
): (config: any, device: string, options?: any) => Promise<any> {
    const cache = new Map<string, { data: any; ts: number }>();
    const inFlight = new Map<string, Promise<any>>();

    return async (config: any, device: string, options?: any) => {
        let serializedConfig = "";
        try {
            serializedConfig = JSON.stringify(config || {});
        } catch {
            serializedConfig = String(config || "");
        }
        const cacheKey = `${device}:${serializedConfig}`;
        const cached = cache.get(cacheKey);
        const now = Date.now();
        if (cached && now - cached.ts < cacheTtlMs) {
            return cached.data;
        }

        if (inFlight.has(cacheKey)) {
            return inFlight.get(cacheKey)!;
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        const task = (async () => {
            try {
                const readPromise = Promise.resolve(rawRead(config, device, options));
                const timeoutPromise = new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("ECOSYSTEM_MODULE_TIMEOUT")), timeoutMs);
                });
                const res = await Promise.race([readPromise, timeoutPromise]);
                const payload = res && typeof res === "object" ? res : { items: [] };
                cache.set(cacheKey, { data: payload, ts: Date.now() });
                return payload;
            } catch (err) {
                console.warn("[小驴生态联邦] 第三方小组件读取熔断或异常，触发单向隔离:", err);
                return {
                    items: [],
                    emptyHint: "📦 数据暂未返回，点击重试",
                    status: "ready",
                    retryable: true,
                };
            } finally {
                if (timer) {
                    clearTimeout(timer);
                    timer = undefined;
                }
                inFlight.delete(cacheKey);
            }
        })();

        inFlight.set(cacheKey, task);
        return task;
    };
}

const GLOBAL_BRIDGE_ALIASES = [
    "siyuanSpeedSwitch",
    "xiaolvSpeedSwitch",
    "xiaolvRaikiri",
    "lvRaikiri",
] as const;

/**
 * 挂载对外服务桥。
 * @param handlers 宿主方法实现
 * @param legacyTarget 已挂载的旧版对象引用（可选，用于在原有对象上叠加新能力并维持旧对象引用不变）
 * @returns 销毁函数
 */
export function mountRaikiriBridge(
    handlers: RaikiriBridgeHandlers,
    legacyTarget?: Record<string, unknown>,
): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    const host = window as unknown as Record<string, unknown>;

    const bridge: RaikiriBridgeApi = {
        protocol: RAIKIRI_BRIDGE_PROTOCOL,
        protocolName: RAIKIRI_BRIDGE_NAME,
        capabilities: RAIKIRI_CAPABILITIES,
        whenReady: () => true,
        openSwitcher: (focusSearch = true) => {
            try {
                handlers.openSwitcher(focusSearch);
                dispatchRaikiriNavigatedEvent({ surface: "switcher", action: "open", entry: "bridge" });
                return { ok: true, data: true };
            } catch (err: unknown) {
                return { ok: false, code: "SWITCHER_OPEN_FAILED", message: String(err) };
            }
        },
        openWorkbench: (options) => {
            try {
                handlers.openWorkbench(options);
                dispatchRaikiriNavigatedEvent({ surface: "workbench", action: "open", entry: options?.entry || "bridge" });
                return { ok: true, data: true };
            } catch (err: unknown) {
                return { ok: false, code: "WORKBENCH_OPEN_FAILED", message: String(err) };
            }
        },
        openStudio: (options) => {
            try {
                handlers.openStudio(options);
                dispatchRaikiriNavigatedEvent({ surface: "studio", action: "open", entry: options?.entry || "bridge" });
                return { ok: true, data: true };
            } catch (err: unknown) {
                return { ok: false, code: "STUDIO_OPEN_FAILED", message: String(err) };
            }
        },
        getNavigationContext: () => {
            try {
                const data = handlers.getNavigationContext();
                return { ok: true, data };
            } catch (err: unknown) {
                return { ok: false, code: "NAV_CONTEXT_FAILED", message: String(err) };
            }
        },
        getWorkspaceStats: () => {
            try {
                const data = handlers.getWorkspaceStats();
                return { ok: true, data };
            } catch (err: unknown) {
                return { ok: false, code: "WORKSPACE_STATS_FAILED", message: String(err) };
            }
        },
        searchDocuments: async (args) => {
            try {
                const res = await handlers.searchDocuments(args);
                if (res && typeof res === "object" && "error" in res) {
                    return { ok: false, code: "SEARCH_FAILED", message: String((res as { error?: unknown }).error) };
                }
                return { ok: true, data: res };
            } catch (err: unknown) {
                return { ok: false, code: "SEARCH_EXCEPTION", message: String(err) };
            }
        },
        registerHomeModule: (options) => {
            if (typeof handlers.registerHomeModule === "function") {
                const safeOptions = {
                    ...options,
                    read: typeof options?.read === "function" ? wrapEcosystemModuleRead(options.read, 800, 3000) : options?.read,
                };
                return handlers.registerHomeModule(safeOptions);
            }
            return () => {};
        },
    };

    // 若传入了 legacyTarget，将 bridge 的能力属性全部合并至 legacyTarget 上
    const activeTarget = legacyTarget ? Object.assign(legacyTarget, bridge) : bridge;

    // 首实例优先：挂载到各全局别名
    for (const alias of GLOBAL_BRIDGE_ALIASES) {
        if (!host[alias] || host[alias] === legacyTarget) {
            host[alias] = activeTarget;
        }
    }

    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        for (const alias of GLOBAL_BRIDGE_ALIASES) {
            if (host[alias] === activeTarget || host[alias] === legacyTarget) {
                delete host[alias];
            }
        }
    };
}
