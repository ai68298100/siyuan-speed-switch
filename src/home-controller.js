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
    let pendingScrollTop = null;
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
        if (Number.isFinite(container.scrollTop) && container.scrollTop > 0) {
            pendingScrollTop = container.scrollTop;
        }
        const containsActive = typeof container.contains === "function" && container.contains(active);
        if (active && containsActive && active.dataset?.focusKey) {
            pendingFocusKey = active.dataset.focusKey;
        }
        const element = renderHomeModuleView(documentRef, view, {
            labels: options.labels,
            calendarWeekdays: options.calendarWeekdays,
            onItem: options.onItem,
            onCalendarNavigate: options.onCalendarNavigate,
            onToggleItem: options.onToggleItem,
            onConfig: options.onConfig,
            onToggle: () => toggle(),
            onRetry: () => refresh(),
        });
        if (!element) return null;
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(element);
        if (pendingScrollTop !== null) {
            try { container.scrollTop = pendingScrollTop; } catch (_) { /* minimal host container */ }
            pendingScrollTop = null;
        }
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

    function setRefreshing(active) {
        const element = container.firstElementChild;
        if (!element || !element.classList?.contains("sw__home-module")) return false;
        element.classList.toggle("is-refreshing", active === true);
        element.setAttribute("aria-busy", active === true ? "true" : "false");
        const header = element.querySelector(".sw__home-module-header");
        if (!header) return false;
        let indicator = header.querySelector(".sw__home-module-refreshing");
        if (active === true && !indicator) {
            indicator = documentRef.createElement("span");
            indicator.className = "sw__home-module-refreshing";
            indicator.setAttribute("role", "status");
            indicator.setAttribute("aria-live", "polite");
            indicator.textContent = options.labels?.refreshing || "更新中…";
            header.appendChild(indicator);
        } else if (active !== true) {
            indicator?.remove();
        }
        return true;
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
        const retained = currentView?.status === "ready" && setRefreshing(true);
        if (!retained) render(buildHomeModuleView(module, {loading: true}, {collapsed: currentView?.collapsed === true}));
        try {
            if (requestController?.signal.aborted) return {ok: false, reason: "aborted", view: currentView};
            const result = await read(config, {...readOptions, signal: requestController?.signal || externalSignal});
            if (disposed || token !== generation) return {ok: false, reason: "stale", view: currentView};
            // 读取失败但上一次的好数据还在（如同步高峰期超时）：继续展示陈旧快照并
            // 标注"缓存"，不清成错误页——数据陈旧可见比整块报错更有用
            const stale = result?.ok === false
                && result?.snapshot && Array.isArray(result.snapshot.items) && result.snapshot.items.length > 0;
            const view = buildHomeModuleView(
                module,
                stale ? {ok: true, cached: true, snapshot: result.snapshot} : result,
                {collapsed: currentView?.collapsed === true},
            );
            render(view);
            return {ok: stale ? true : result?.ok !== false, reason: result?.reason || "", view};
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
            if (token === generation) setRefreshing(false);
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

async function refreshHomeModules(entries, options = {}) {
    const queue = Array.isArray(entries) ? entries.filter((entry) => typeof entry?.refresh === "function") : [];
    if (queue.length === 0) return [];
    const signal = options && typeof options.signal === "object" ? options.signal : null;
    const requested = Math.trunc(Number(options.concurrency));
    const concurrency = Math.min(4, Math.max(1, Number.isFinite(requested) && requested > 0 ? requested : 2));
    const results = new Array(queue.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < queue.length) {
            const index = nextIndex++;
            if (signal?.aborted) {
                results[index] = {ok: false, reason: "aborted"};
                continue;
            }
            try {
                results[index] = await queue[index].refresh(undefined, {force: true, signal});
            } catch (_) {
                results[index] = {ok: false, reason: "failed"};
            }
        }
    }
    await Promise.all(Array.from({length: Math.min(concurrency, queue.length)}, worker));
    return results;
}

function countHomeRefreshFailures(results) {
    if (!Array.isArray(results)) return 0;
    return Math.min(64, results.reduce((count, result) => count + (result?.ok === false && !["aborted", "disposed", "stale"].includes(result?.reason) ? 1 : 0), 0));
}

module.exports = {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures};
