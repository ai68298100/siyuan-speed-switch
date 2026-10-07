/*
 * T-7153 diagnostic probe. Load before the page scripts in an isolated
 * Playwright context. This records observed API activity from installation
 * onward; it does not claim to discover registrations made before installation
 * or prove a leak. Keep the probe out of production bundles.
 */
(function installSwssResourceTrendProbe() {
    if (typeof window !== "object" || window.__swssResourceTrendProbe) return;

    const startedAt = window.performance?.now?.() ?? 0;
    const counters = {
        listenersAdded: 0,
        listenersRemoved: 0,
        storeRenderListenersAdded: 0,
        storeRenderListenersRemoved: 0,
        timersScheduled: 0,
        timersFired: 0,
        timersCancelled: 0,
        framesScheduled: 0,
        framesFired: 0,
        framesCancelled: 0,
        fetchStarted: 0,
        fetchSettled: 0,
        fetchFailed: 0,
    };
    const pendingTimers = new Map();
    const pendingFrames = new Set();
    const listenerTargets = new WeakMap();
    const listenerObjects = new WeakMap();
    const activeListeners = new Map();
    let listenerTargetId = 0;
    let listenerObjectId = 0;
    const restores = [];

    function wrap(object, key, factory) {
        if (!object || typeof object[key] !== "function") return;
        const original = object[key];
        const wrapped = factory(original);
        try {
            object[key] = wrapped;
            if (object[key] === wrapped) restores.push(() => {
                if (object[key] === wrapped) object[key] = original;
            });
        } catch (_) {
            // Some host objects expose non-writable methods; leave them alone.
        }
    }

    const eventTarget = window.EventTarget?.prototype;
    function isStoreRenderTarget(target) {
        return typeof target?.className === "string"
            && target.className.split(/\s+/).some((className) => className.startsWith("sw-home-store__"));
    }
    function listenerKey(target, type, listener, options) {
        if ((typeof target !== "object" && typeof target !== "function")
            || (typeof listener !== "object" && typeof listener !== "function")) return null;
        if (!listenerTargets.has(target)) listenerTargets.set(target, ++listenerTargetId);
        if (!listenerObjects.has(listener)) listenerObjects.set(listener, ++listenerObjectId);
        const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
        return `${listenerTargets.get(target)}:${String(type)}:${listenerObjects.get(listener)}:${capture ? 1 : 0}`;
    }
    wrap(eventTarget, "addEventListener", (original) => function (...args) {
        const result = original.apply(this, args);
        const key = listenerKey(this, args[0], args[1], args[2]);
        if (key && !activeListeners.has(key)) {
            // WeakRef avoids turning the diagnostic probe into a retention root:
            // detached DOM nodes may be collected after a render replaces them.
            activeListeners.set(key, {target: new WeakRef(this), type: String(args[0])});
            counters.listenersAdded += 1;
            if (isStoreRenderTarget(this)) counters.storeRenderListenersAdded += 1;
        }
        return result;
    });
    wrap(eventTarget, "removeEventListener", (original) => function (...args) {
        const result = original.apply(this, args);
        const key = listenerKey(this, args[0], args[1], args[2]);
        if (key && activeListeners.delete(key)) {
            counters.listenersRemoved += 1;
            if (isStoreRenderTarget(this)) counters.storeRenderListenersRemoved += 1;
        }
        return result;
    });

    for (const kind of ["setTimeout", "setInterval"]) {
        wrap(window, kind, (original) => function (callback, delay, ...args) {
            if (typeof callback !== "function") return original.call(this, callback, delay, ...args);
            let handle;
            const observedCallback = function (...callbackArgs) {
                if (kind === "setTimeout") pendingTimers.delete(handle);
                counters.timersFired += 1;
                return callback.apply(this, callbackArgs);
            };
            handle = original.call(this, observedCallback, delay, ...args);
            pendingTimers.set(handle, kind);
            counters.timersScheduled += 1;
            return handle;
        });
    }
    for (const kind of ["clearTimeout", "clearInterval"]) {
        wrap(window, kind, (original) => function (handle) {
            if (pendingTimers.delete(handle)) counters.timersCancelled += 1;
            return original.call(this, handle);
        });
    }

    wrap(window, "requestAnimationFrame", (original) => function (callback) {
        let handle;
        handle = original.call(this, (timestamp) => {
            pendingFrames.delete(handle);
            counters.framesFired += 1;
            callback(timestamp);
        });
        pendingFrames.add(handle);
        counters.framesScheduled += 1;
        return handle;
    });
    wrap(window, "cancelAnimationFrame", (original) => function (handle) {
        if (pendingFrames.delete(handle)) counters.framesCancelled += 1;
        return original.call(this, handle);
    });

    wrap(window, "fetch", (original) => function (...args) {
        counters.fetchStarted += 1;
        let request;
        try {
            request = original.apply(this, args);
        } catch (error) {
            counters.fetchSettled += 1;
            counters.fetchFailed += 1;
            throw error;
        }
        // Attach observers without returning a replacement Promise, preserving
        // the original fetch promise identity and response/error behavior.
        Promise.resolve(request).then(
            () => { counters.fetchSettled += 1; },
            () => { counters.fetchSettled += 1; counters.fetchFailed += 1; },
        );
        return request;
    });

    let disposed = false;
    function connectedListenerCount() {
        let connected = 0;
        for (const [key, entry] of activeListeners) {
            const target = entry.target.deref();
            if (!target) {
                activeListeners.delete(key);
                continue;
            }
            if (target === window || target === document || target?.isConnected === true) connected += 1;
        }
        return connected;
    }
    function targetDescriptor(target) {
        if (target === window) return "window";
        if (target === document) return "document";
        if (!target || typeof target !== "object") return "other";
        const tag = String(target.tagName || "node").toLowerCase();
        const classes = typeof target.className === "string"
            ? target.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")
            : "";
        return `${tag}${classes ? `.${classes}` : ""}`;
    }
    function listenerBreakdown() {
        const breakdown = {};
        for (const [key, entry] of activeListeners) {
            const target = entry.target.deref();
            if (!target) {
                activeListeners.delete(key);
                continue;
            }
            const {type} = entry;
            const targetKind = target === window ? "window" : target === document ? "document" : target?.isConnected === true ? "connected-node" : "detached-node";
            const key = `${targetKind}:${targetDescriptor(target)}:${type}`;
            breakdown[key] = (breakdown[key] || 0) + 1;
        }
        return breakdown;
    }
    const probe = {
        sample(label = "", options = {}) {
            const activeConnectedRegistrations = connectedListenerCount();
            const includeListenerBreakdown = options?.includeListenerBreakdown === true;
            const memory = window.performance?.memory;
            const memorySnapshot = memory && Number.isFinite(memory.usedJSHeapSize)
                ? {
                    usedJSHeapSize: memory.usedJSHeapSize,
                    totalJSHeapSize: Number.isFinite(memory.totalJSHeapSize) ? memory.totalJSHeapSize : null,
                    jsHeapSizeLimit: Number.isFinite(memory.jsHeapSizeLimit) ? memory.jsHeapSizeLimit : null,
                }
                : null;
            return {
                label: String(label),
                elapsedMs: Math.round((window.performance?.now?.() ?? startedAt) - startedAt),
                listenerActivity: {
                    added: counters.listenersAdded,
                    removed: counters.listenersRemoved,
                    activeObservedRegistrations: activeListeners.size,
                    activeConnectedRegistrations,
                    detachedObservedRegistrations: Math.max(0, activeListeners.size - activeConnectedRegistrations),
                    breakdown: includeListenerBreakdown ? listenerBreakdown() : {},
                    netObservedRegistrations: counters.listenersAdded - counters.listenersRemoved,
                    note: "observed registrations only; listeners installed before probe or auto-removed by once/signal are outside this count",
                },
                storeRenderListenerActivity: {
                    added: counters.storeRenderListenersAdded,
                    removed: counters.storeRenderListenersRemoved,
                    active: Math.max(0, counters.storeRenderListenersAdded - counters.storeRenderListenersRemoved),
                    note: "explicit add/remove calls observed on sw-home-store__ render nodes; auto-removal is outside this count",
                },
                timers: {
                    scheduled: counters.timersScheduled,
                    fired: counters.timersFired,
                    cancelled: counters.timersCancelled,
                    pendingObserved: pendingTimers.size,
                    pendingTimeouts: [...pendingTimers.values()].filter((kind) => kind === "setTimeout").length,
                    pendingIntervals: [...pendingTimers.values()].filter((kind) => kind === "setInterval").length,
                },
                animationFrames: {
                    scheduled: counters.framesScheduled,
                    fired: counters.framesFired,
                    cancelled: counters.framesCancelled,
                    pendingObserved: pendingFrames.size,
                },
                fetch: {
                    started: counters.fetchStarted,
                    settled: counters.fetchSettled,
                    failed: counters.fetchFailed,
                    inFlightObserved: Math.max(0, counters.fetchStarted - counters.fetchSettled),
                },
                dom: {elementCount: window.document?.getElementsByTagName("*").length ?? null},
                memory: memorySnapshot,
            };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            while (restores.length) restores.pop()();
            if (window.__swssResourceTrendProbe === probe) delete window.__swssResourceTrendProbe;
        },
    };
    window.__swssResourceTrendProbe = probe;
})();
