"use strict";

const {buildHomeModuleView, renderHomeModuleView} = require("./home-view.js");

function createHomeModuleController(options = {}) {
    const documentRef = options.document;
    const container = options.container;
    const module = options.module && typeof options.module === "object" ? options.module : null;
    const read = typeof options.read === "function" ? options.read : null;
    if (!documentRef || !container || !module?.moduleId || !read) return null;
    let generation = 0;
    let disposed = false;
    let activeController = null;
    let pendingFocusKey = null;
    let currentView = buildHomeModuleView(module, {loading: true}, {collapsed: options.collapsed === true});

    function toggle() {
        if (disposed) return currentView;
        const nextView = {...currentView, collapsed: currentView?.collapsed !== true};
        const element = render(nextView);
        if (element && typeof options.onToggle === "function") options.onToggle(nextView);
        return nextView;
    }

    function render(view) {
        if (disposed || !view) return null;
        const active = documentRef.activeElement;
        const containsActive = typeof container.contains === "function" && container.contains(active);
        if (active && containsActive && active.dataset?.focusKey) {
            pendingFocusKey = active.dataset.focusKey;
        }
        const element = renderHomeModuleView(documentRef, view, {
            labels: options.labels,
            onItem: options.onItem,
            onToggle: () => toggle(),
            onRetry: () => refresh(),
        });
        if (!element) return null;
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(element);
        if (pendingFocusKey) {
            const focusTarget = Array.from(element.querySelectorAll("[data-focus-key]"))
                .find((candidate) => candidate.dataset.focusKey === pendingFocusKey);
            if (focusTarget && typeof focusTarget.focus === "function") {
                try {
                    focusTarget.focus({preventScroll: true});
                } catch (_) {
                    focusTarget.focus();
                }
                pendingFocusKey = null;
            }
            // Keep the key through the transient loading view, but do not
            // let a removed item leak into a later unrelated refresh.
            if (view.status !== "loading") pendingFocusKey = null;
        }
        currentView = view;
        return element;
    }

    async function refresh(config = options.config || {}, readOptions = {}) {
        if (disposed) return {ok: false, reason: "disposed", view: currentView};
        const token = ++generation;
        if (activeController) activeController.abort();
        const externalSignal = readOptions && typeof readOptions.signal === "object" ? readOptions.signal : null;
        if (externalSignal?.aborted) {
            activeController = null;
            return {ok: false, reason: "aborted", view: currentView};
        }
        activeController = typeof AbortController === "function" ? new AbortController() : null;
        const requestController = activeController;
        let externalAbortHandler = null;
        if (requestController && typeof externalSignal?.addEventListener === "function") {
            externalAbortHandler = () => requestController.abort();
            externalSignal.addEventListener("abort", externalAbortHandler, {once: true});
        }
        render(buildHomeModuleView(module, {loading: true}, {collapsed: currentView?.collapsed === true}));
        try {
            if (requestController?.signal.aborted) return {ok: false, reason: "aborted", view: currentView};
            const result = await read(config, {...readOptions, signal: requestController?.signal || externalSignal});
            if (disposed || token !== generation) return {ok: false, reason: "stale", view: currentView};
            const view = buildHomeModuleView(module, result, {collapsed: currentView?.collapsed === true});
            render(view);
            return {ok: result?.ok !== false, reason: result?.reason || "", view};
        } catch (error) {
            if (disposed || token !== generation) return {ok: false, reason: "stale", view: currentView};
            if (error?.message === "aborted") return {ok: false, reason: "aborted", view: currentView};
            const view = buildHomeModuleView(module, {ok: false, reason: error?.message || "failed"}, {collapsed: currentView?.collapsed === true});
            render(view);
            return {ok: false, reason: "failed", view};
        } finally {
            if (externalSignal && externalAbortHandler && typeof externalSignal.removeEventListener === "function") {
                externalSignal.removeEventListener("abort", externalAbortHandler);
            }
            if (token === generation) activeController = null;
        }
    }

    function mount() {
        if (disposed) return null;
        return render(currentView);
    }

    function showError(reason = "failed") {
        if (disposed) return currentView;
        generation += 1;
        activeController?.abort();
        activeController = null;
        const view = buildHomeModuleView(module, {ok: false, reason}, {collapsed: currentView?.collapsed === true});
        render(view);
        return view;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        generation += 1;
        activeController?.abort();
        activeController = null;
        while (container.firstChild) container.removeChild(container.firstChild);
    }

    return {mount, refresh, toggle, showError, dispose, getView: () => currentView};
}

module.exports = {createHomeModuleController};
