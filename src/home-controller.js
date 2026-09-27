"use strict";

const {buildHomeModuleView, renderHomeModuleView, formatUpdatedAt} = require("./home-view.js");

const HOME_CLOCK_MODULE_IDS = new Set(["external-local-time", "external-world-clock", "external-quote-daily"]);
const CLOCK_PATCH_FIELDS = ["label", "href", "command", "secondary", "done", "weekend", "outside", "holiday", "count", "level", "rank"];

function sameClockStatShape(previous, next) {
    const previousVisible = Boolean(previous && previous.value);
    const nextVisible = Boolean(next && next.value);
    if (previousVisible !== nextVisible) return false;
    if (!previousVisible) return true;
    if (previous.label !== next.label || previous.emphasis !== next.emphasis) return false;
    const previousProgress = Number.isFinite(previous.progress);
    const nextProgress = Number.isFinite(next.progress);
    if (previousProgress !== nextProgress) return false;
    const previousArc = previous.arc && typeof previous.arc === "object";
    const nextArc = next.arc && typeof next.arc === "object";
    if (previousArc !== nextArc) return false;
    if (previousArc && previous.arc.max !== next.arc.max) return false;
    return true;
}

function sameClockRowShape(previous, next) {
    if (!previous || !next) return false;
    if (Boolean(previous.value) !== Boolean(next.value)) return false;
    return CLOCK_PATCH_FIELDS.every((field) => previous[field] === next[field]);
}

function clockPatchLabels(labels = {}) {
    return {
        cached: labels.cached || "缓存",
        updated: labels.updated || "更新",
        sourceFresh: labels.sourceFresh || "实时",
        sourceCached: labels.sourceCached || "缓存源",
        sourceStale: labels.sourceStale || "过期缓存",
    };
}

function buildClockPatchPlan(root, previous, next) {
    if (!root || !previous || !next || !HOME_CLOCK_MODULE_IDS.has(next.moduleId)) return null;
    if (previous.moduleId !== next.moduleId || previous.status !== "ready" || next.status !== "ready") return null;
    if (previous.viewType || next.viewType || previous.collapsed !== next.collapsed) return null;
    if (!sameClockStatShape(previous.stat, next.stat)) return null;
    const previousItems = Array.isArray(previous.items) ? previous.items : [];
    const nextItems = Array.isArray(next.items) ? next.items : [];
    if (previousItems.length !== nextItems.length) return null;
    if (root.dataset.moduleId !== next.moduleId || root.dataset.status !== "ready") return null;
    const rows = Array.from(root.querySelectorAll("[data-sw-row]"));
    if (rows.length !== nextItems.length) return null;
    for (let index = 0; index < nextItems.length; index += 1) {
        const row = rows[index];
        const label = row.querySelector(".sw__home-module-item-label");
        const value = row.querySelector("[data-sw-row-value]");
        const rendersValue = Boolean(nextItems[index].label && nextItems[index].value);
        if (!label || !sameClockRowShape(previousItems[index], nextItems[index])
            || label.textContent !== (previousItems[index].label || previousItems[index].value || previousItems[index].href || "")
            || Boolean(value) !== rendersValue) return null;
    }
    const previousMeta = Boolean(previous.cached || formatUpdatedAt(previous.updatedAt));
    const nextMeta = Boolean(next.cached || formatUpdatedAt(next.updatedAt));
    if (previousMeta !== nextMeta) return null;
    if (previousMeta && !root.querySelector(".sw__home-module-meta")) return null;
    const previousHealth = Boolean(previous.sourceHealth);
    const nextHealth = Boolean(next.sourceHealth);
    if (previousHealth !== nextHealth) return null;
    if (previousHealth && !root.querySelector(".sw__home-source-health")) return null;
    return {rows, nextItems, hasStat: Boolean(next.stat && next.stat.value), hasMeta: nextMeta, hasHealth: nextHealth};
}

function patchClockView(root, previous, next, labels) {
    const plan = buildClockPatchPlan(root, previous, next);
    if (!plan) return false;
    const patchLabels = clockPatchLabels(labels);
    if (plan.hasStat) {
        const statValue = root.querySelector(".sw__home-stat-value");
        if (statValue) statValue.textContent = next.stat.value;
    }
    plan.rows.forEach((row, index) => {
        const item = plan.nextItems[index];
        const button = row.querySelector(".sw__home-module-item-action");
        const value = row.querySelector("[data-sw-row-value]");
        if (button) {
            button.dataset.value = item.value || "";
            button.setAttribute("aria-label", [item.label || item.value || item.href || "", item.label && item.value ? item.value : "", item.secondary].filter(Boolean).join(" · "));
        }
        if (value) value.textContent = item.value;
    });
    if (plan.hasMeta) {
        const meta = root.querySelector(".sw__home-module-meta");
        const updatedAt = formatUpdatedAt(next.updatedAt);
        const metaText = [next.cached ? patchLabels.cached : "", updatedAt].filter(Boolean).join(" · ");
        meta.textContent = metaText;
        meta.setAttribute("title", `${patchLabels.updated} ${metaText}`);
    }
    if (plan.hasHealth) {
        const health = root.querySelector(".sw__home-source-health");
        health.classList.remove("is-fresh", "is-cached", "is-stale");
        health.classList.add(`is-${next.sourceHealth}`);
        health.dataset.health = next.sourceHealth;
        health.textContent = next.sourceHealth === "fresh" ? patchLabels.sourceFresh : next.sourceHealth === "cached" ? patchLabels.sourceCached : patchLabels.sourceStale;
    }
    root.dataset.status = next.status;
    root.setAttribute("aria-busy", next.ariaBusy === true ? "true" : "false");
    return true;
}

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
    // 秒开（D-382）：宿主若提供了上一次的好快照，首帧直接以"缓存"态渲染内容，
    // 随后的 refresh 走既有的 retained + 更新中指示器路径，不再闪 loading 骨架。
    const initialSnapshot = options.initialSnapshot && typeof options.initialSnapshot === "object"
        && Array.isArray(options.initialSnapshot.items) && options.initialSnapshot.items.length > 0
        ? options.initialSnapshot : null;
    let currentView = initialSnapshot
        ? buildHomeModuleView(module, {ok: true, cached: true, snapshot: initialSnapshot}, {collapsed: options.collapsed === true})
        : buildHomeModuleView(module, {loading: true}, {collapsed: options.collapsed === true});

    function toggle() {
        if (disposed) return currentView;
        const nextView = {...currentView, collapsed: currentView?.collapsed !== true};
        const element = render(nextView);
        if (element && typeof options.onToggle === "function") options.onToggle(nextView);
        return nextView;
    }

    function render(view) {
        if (disposed || !view) return null;
        const existing = container.firstElementChild;
        if (patchClockView(existing, currentView, view, options.labels)) {
            currentView = view;
            pendingFocusKey = null;
            pendingScrollTop = null;
            return existing;
        }
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

function summarizeHomeRefreshFailures(results) {
    const summary = {timeout: 0, failed: 0, other: 0};
    if (!Array.isArray(results)) return summary;
    results.forEach((result) => {
        if (result?.ok !== false || ["aborted", "disposed", "stale"].includes(result?.reason)) return;
        if (result.reason === "timeout") summary.timeout = Math.min(64, summary.timeout + 1);
        else if (result.reason === "failed" || !result.reason) summary.failed = Math.min(64, summary.failed + 1);
        else summary.other = Math.min(64, summary.other + 1);
    });
    return summary;
}

function selectHomeRefreshRetryEntries(entries, results) {
    if (!Array.isArray(entries) || !Array.isArray(results)) return [];
    return entries.filter((_, index) => {
        const result = results[index];
        return result?.ok === false && !["aborted", "disposed", "stale"].includes(result.reason);
    });
}

module.exports = {createHomeModuleController, refreshHomeModules, countHomeRefreshFailures, summarizeHomeRefreshFailures, selectHomeRefreshRetryEntries};
