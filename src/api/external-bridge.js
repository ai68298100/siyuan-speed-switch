"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAIKIRI_CAPABILITIES = exports.RAIKIRI_BRIDGE_NAME = exports.RAIKIRI_BRIDGE_PROTOCOL = exports.GLOBAL_BRIDGE_ALIASES = void 0;
exports.dispatchRaikiriNavigatedEvent = dispatchRaikiriNavigatedEvent;
exports.mountRaikiriBridge = mountRaikiriBridge;
exports.RAIKIRI_BRIDGE_PROTOCOL = 1;
exports.RAIKIRI_BRIDGE_NAME = "siyuan-speed-switch";
exports.RAIKIRI_CAPABILITIES = Object.freeze([
    "whenReady",
    "openSwitcher",
    "openWorkbench",
    "openStudio",
    "getNavigationContext",
    "getWorkspaceStats",
    "searchDocuments",
]);
/**
 * 跨插件广播工作面切换事件（CustomEvent 旁路解耦）
 */
function dispatchRaikiriNavigatedEvent(detail) {
    var _a;
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function")
        return;
    try {
        const ts = (_a = detail.ts) !== null && _a !== void 0 ? _a : Date.now();
        const fullDetail = {
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
    }
    catch (_b) {
        /* 事件旁路广播静默防护 */
    }
}
const GLOBAL_BRIDGE_ALIASES = [
    "siyuanSpeedSwitch",
    "xiaolvSpeedSwitch",
    "xiaolvRaikiri",
    "lvRaikiri",
];
exports.GLOBAL_BRIDGE_ALIASES = GLOBAL_BRIDGE_ALIASES;
/**
 * 挂载对外服务桥。
 * @param handlers 宿主方法实现
 * @param legacyTarget 已挂载的旧版对象引用（可选，用于在原有对象上叠加新能力并维持旧对象引用不变）
 * @returns 销毁函数
 */
function mountRaikiriBridge(handlers, legacyTarget) {
    if (typeof window === "undefined") {
        return () => { };
    }
    const host = window;
    const bridge = {
        protocol: exports.RAIKIRI_BRIDGE_PROTOCOL,
        protocolName: exports.RAIKIRI_BRIDGE_NAME,
        capabilities: exports.RAIKIRI_CAPABILITIES,
        whenReady: () => true,
        openSwitcher: (focusSearch = true) => {
            try {
                handlers.openSwitcher(focusSearch);
                dispatchRaikiriNavigatedEvent({ surface: "switcher", action: "open", entry: "bridge" });
                return { ok: true, data: true };
            }
            catch (err) {
                return { ok: false, code: "SWITCHER_OPEN_FAILED", message: String(err) };
            }
        },
        openWorkbench: (options) => {
            try {
                handlers.openWorkbench(options);
                dispatchRaikiriNavigatedEvent({ surface: "workbench", action: "open", entry: (options === null || options === void 0 ? void 0 : options.entry) || "bridge" });
                return { ok: true, data: true };
            }
            catch (err) {
                return { ok: false, code: "WORKBENCH_OPEN_FAILED", message: String(err) };
            }
        },
        openStudio: (options) => {
            try {
                handlers.openStudio(options);
                dispatchRaikiriNavigatedEvent({ surface: "studio", action: "open", entry: (options === null || options === void 0 ? void 0 : options.entry) || "bridge" });
                return { ok: true, data: true };
            }
            catch (err) {
                return { ok: false, code: "STUDIO_OPEN_FAILED", message: String(err) };
            }
        },
        getNavigationContext: () => {
            try {
                const data = handlers.getNavigationContext();
                return { ok: true, data };
            }
            catch (err) {
                return { ok: false, code: "NAV_CONTEXT_FAILED", message: String(err) };
            }
        },
        getWorkspaceStats: () => {
            try {
                const data = handlers.getWorkspaceStats();
                return { ok: true, data };
            }
            catch (err) {
                return { ok: false, code: "WORKSPACE_STATS_FAILED", message: String(err) };
            }
        },
        searchDocuments: async (args) => {
            try {
                const res = await handlers.searchDocuments(args);
                if (res && typeof res === "object" && "error" in res) {
                    return { ok: false, code: "SEARCH_FAILED", message: String(res.error) };
                }
                return { ok: true, data: res };
            }
            catch (err) {
                return { ok: false, code: "SEARCH_EXCEPTION", message: String(err) };
            }
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
        if (disposed)
            return;
        disposed = true;
        for (const alias of GLOBAL_BRIDGE_ALIASES) {
            if (host[alias] === activeTarget || host[alias] === legacyTarget) {
                delete host[alias];
            }
        }
    };
}
