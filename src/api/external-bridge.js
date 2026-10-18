"use strict";

const RAIKIRI_BRIDGE_PROTOCOL = 1;
const RAIKIRI_BRIDGE_NAME = "siyuan-speed-switch";

const RAIKIRI_CAPABILITIES = Object.freeze([
    "whenReady",
    "openSwitcher",
    "openWorkbench",
    "openStudio",
    "getNavigationContext",
    "getWorkspaceStats",
    "searchDocuments",
]);

const GLOBAL_BRIDGE_ALIASES = Object.freeze([
    "siyuanSpeedSwitch",
    "xiaolvSpeedSwitch",
    "xiaolvRaikiri",
    "lvRaikiri",
]);

function dispatchRaikiriNavigatedEvent(detail) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    try {
        const ts = (detail && typeof detail.ts === "number") ? detail.ts : Date.now();
        const surface = detail?.surface || "switcher";
        const action = detail?.action || "navigate";
        const fullDetail = {
            plugin: RAIKIRI_BRIDGE_NAME,
            v: 1,
            ts,
            surface,
            action,
            entry: detail?.entry,
            occurredAt: new Date(ts).toISOString(),
            idempotencyKey: `${surface}:${action}:${ts}`,
        };
        window.dispatchEvent(new CustomEvent("lv-raikiri:navigated", { detail: fullDetail }));
    } catch {
        /* 事件旁路隔离 */
    }
}

function mountRaikiriBridge(handlers, legacyTarget) {
    if (typeof window === "undefined") {
        return () => {};
    }

    const host = window;

    const bridge = {
        protocol: RAIKIRI_BRIDGE_PROTOCOL,
        protocolName: RAIKIRI_BRIDGE_NAME,
        capabilities: RAIKIRI_CAPABILITIES,
        whenReady: () => true,
        openSwitcher: (focusSearch = true) => {
            try {
                if (typeof handlers?.openSwitcher === "function") {
                    handlers.openSwitcher(focusSearch);
                }
                dispatchRaikiriNavigatedEvent({ surface: "switcher", action: "open", entry: "bridge" });
                return { ok: true, data: true };
            } catch (err) {
                return { ok: false, code: "SWITCHER_OPEN_FAILED", message: String(err) };
            }
        },
        openWorkbench: (options) => {
            try {
                if (typeof handlers?.openWorkbench === "function") {
                    handlers.openWorkbench(options);
                }
                dispatchRaikiriNavigatedEvent({ surface: "workbench", action: "open", entry: options?.entry || "bridge" });
                return { ok: true, data: true };
            } catch (err) {
                return { ok: false, code: "WORKBENCH_OPEN_FAILED", message: String(err) };
            }
        },
        openStudio: (options) => {
            try {
                if (typeof handlers?.openStudio === "function") {
                    handlers.openStudio(options);
                }
                dispatchRaikiriNavigatedEvent({ surface: "studio", action: "open", entry: options?.entry || "bridge" });
                return { ok: true, data: true };
            } catch (err) {
                return { ok: false, code: "STUDIO_OPEN_FAILED", message: String(err) };
            }
        },
        getNavigationContext: () => {
            try {
                const data = typeof handlers?.getNavigationContext === "function"
                    ? handlers.getNavigationContext()
                    : null;
                return { ok: true, data };
            } catch (err) {
                return { ok: false, code: "NAV_CONTEXT_FAILED", message: String(err) };
            }
        },
        getWorkspaceStats: () => {
            try {
                const data = typeof handlers?.getWorkspaceStats === "function"
                    ? handlers.getWorkspaceStats()
                    : null;
                return { ok: true, data };
            } catch (err) {
                return { ok: false, code: "WORKSPACE_STATS_FAILED", message: String(err) };
            }
        },
        searchDocuments: async (args) => {
            try {
                const res = typeof handlers?.searchDocuments === "function"
                    ? await handlers.searchDocuments(args)
                    : null;
                if (res && typeof res === "object" && "error" in res) {
                    return { ok: false, code: "SEARCH_FAILED", message: String(res.error) };
                }
                return { ok: true, data: res };
            } catch (err) {
                return { ok: false, code: "SEARCH_EXCEPTION", message: String(err) };
            }
        },
    };

    const activeTarget = legacyTarget ? Object.assign(legacyTarget, bridge) : bridge;

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

module.exports = {
    RAIKIRI_BRIDGE_PROTOCOL,
    RAIKIRI_BRIDGE_NAME,
    RAIKIRI_CAPABILITIES,
    GLOBAL_BRIDGE_ALIASES,
    dispatchRaikiriNavigatedEvent,
    mountRaikiriBridge,
};
