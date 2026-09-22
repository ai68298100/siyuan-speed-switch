// Floating-ball action execution adapter.
//
// The switcher currently owns the concrete UI callbacks, while the floating
// ball needs to execute the same persisted quick-action records without
// importing the plugin class.  This module keeps that boundary small and
// deterministic: callers provide host capabilities, and every invocation is
// reduced to {ok:true} or a safe {ok:false, reason} result.

const {getQuickActionCommandTargets, resolveQuickActionSupport} = require("./quick-actions.js");

function success(result) {
    return result === undefined ? {ok: true} : {ok: true, result};
}

function unavailable() {
    return {ok: false, reason: "unavailable"};
}

function failed() {
    return {ok: false, reason: "failed"};
}

function callbackOf(options, name) {
    return typeof options?.[name] === "function" ? options[name] : null;
}

function findAdapter(options, providerId) {
    const adapters = options?.adapters;
    if (adapters instanceof Map) return adapters.get(providerId);
    if (adapters && typeof adapters === "object") return adapters[providerId];
    return undefined;
}

function findPlugins(options) {
    if (Array.isArray(options?.plugins)) return options.plugins;
    const plugins = options?.app?.plugins;
    return Array.isArray(plugins) ? plugins : [];
}

function actionValue(action) {
    return typeof action?.value === "string" ? action.value.trim() : "";
}

function invokeClose(options) {
    const close = callbackOf(options, "close");
    if (!close) return;
    // Closing a host dialog must not prevent the action itself from running.
    try { close(); } catch { /* host teardown is best effort */ }
}

async function invokeAdapter(action, options) {
    const value = actionValue(action);
    const declaredProvider = typeof action?.providerId === "string" ? action.providerId.trim() : "";
    const slash = value.indexOf("/");
    const providerId = declaredProvider || (slash > 0 ? value.slice(0, slash) : value);
    if (!providerId) return unavailable();
    const payload = slash > 0 && value.startsWith(`${providerId}/`)
        ? value.slice(providerId.length + 1) : value;
    const handler = findAdapter(options, providerId);
    if (typeof handler === "function") {
        invokeClose(options);
        return success(await handler(payload, action));
    }
    const registry = options?.registry;
    if (!registry || typeof registry.invoke !== "function") return unavailable();
    const result = registry.invoke({providerId, value, kind: "adapter"}, options.context);
    const resolved = await Promise.resolve(result);
    if (!resolved?.ok) return resolved?.reason === "failed" ? failed() : unavailable();
    invokeClose(options);
    // Registry handlers may return a promise inside the envelope. Await it so
    // provider rejections are normalized to `failed` instead of becoming an
    // unhandled rejection after the executor has already reported success.
    return success(await Promise.resolve(resolved.result));
}

async function invokeDock(action, options) {
    const getDock = callbackOf(options, "getDockByType");
    if (!getDock) return unavailable();
    const dock = getDock(actionValue(action));
    if (!dock || typeof dock.toggleModel !== "function") return unavailable();
    try {
        dock.toggleModel(actionValue(action), true);
        invokeClose(options);
        return success();
    } catch {
        return failed();
    }
}

async function invokeCommand(action, options) {
    const value = actionValue(action);
    const separator = value.indexOf("::");
    if (separator <= 0 || separator >= value.length - 2) return unavailable();
    const pluginName = value.slice(0, separator);
    const commandKey = value.slice(separator + 2);
    const plugin = findPlugins(options).find((candidate) => candidate?.name === pluginName);
    const command = plugin?.commands?.find((candidate) => candidate?.langKey === commandKey);
    const callback = command?.callback || command?.globalCallback;
    if (typeof callback !== "function") return unavailable();
    const surface = String(options.context?.surface || "").replace(/^floating-ball:/, "");
    if (["desktop", "sidebar", "mobile"].includes(surface)) {
        const support = resolveQuickActionSupport("command", value, surface,
            getQuickActionCommandTargets(findPlugins(options), value));
        if (support === "unsupported" || (support === "unknown" && action.mobileOverride !== true)) return unavailable();
    }
    invokeClose(options);
    let timer;
    try {
        const timeoutMs = Math.min(60000, Math.max(1, Number(options.commandTimeoutMs) || 30000));
        const result = await Promise.race([
            Promise.resolve().then(() => callback.call(plugin)),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("command-timeout")), timeoutMs); }),
        ]);
        if (result === false || result?.ok === false) return failed();
        return success(result);
    } catch {
        return failed();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Execute one persisted quick action using host callbacks supplied by the
 * current surface.  The function is intentionally async so adapter and
 * plugin-command failures are observed instead of becoming unhandled
 * rejections.  Unknown/unsupported records are safe no-ops.
 */
async function executeFloatingBallAction(action, options = {}) {
    if (!action || typeof action !== "object") return unavailable();
    const kind = typeof action.kind === "string" ? action.kind : "builtin";
    try {
        if (kind === "adapter") return await invokeAdapter(action, options);
        if (kind === "dock") return await invokeDock(action, options);
        if (kind === "command") return await invokeCommand(action, options);
        switch (actionValue(action)) {
            case "switcher": {
                const callback = callbackOf(options, "onSwitcher");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "search": {
                const callback = callbackOf(options, "onSearch");
                return callback ? success(await callback(action)) : unavailable();
            }
            case "journal": {
                const callback = callbackOf(options, "onJournal");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "settings": {
                const callback = callbackOf(options, "onSettings");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "home": {
                const callback = callbackOf(options, "onHome");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "quick-capture": {
                const callback = callbackOf(options, "onQuickCapture");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "previous-tab": {
                const callback = callbackOf(options, "onPreviousTab");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "next-tab": {
                const callback = callbackOf(options, "onNextTab");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "scroll-top": {
                const callback = callbackOf(options, "onScrollTop");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            case "scroll-bottom": {
                const callback = callbackOf(options, "onScrollBottom");
                if (!callback) return unavailable();
                invokeClose(options);
                return success(await callback(action));
            }
            default:
                return unavailable();
        }
    } catch {
        return failed();
    }
}

function createFloatingBallActionExecutor(options = {}) {
    return (action) => executeFloatingBallAction(action, options);
}

module.exports = {
    executeFloatingBallAction,
    createFloatingBallActionExecutor,
};
