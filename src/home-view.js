"use strict";

const MAX_ITEMS = 24;
const MAX_TEXT = 256;
const STATUSES = new Set(["loading", "ready", "empty", "error"]);
let renderSequence = 0;

function instanceHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function text(value, max = MAX_TEXT) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function formatUpdatedAt(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return "";
    const timestamp = raw < 100000000000 ? raw * 1000 : raw;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(undefined, {month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"}).format(date);
    } catch (_) {
        return "";
    }
}

function renderModuleIcon(doc, value) {
    const icon = text(value, 64);
    if (!doc || typeof doc.createElement !== "function") return null;
    if (/^icon[A-Za-z][A-Za-z0-9_-]*$/.test(icon)) {
        const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "sw__home-module-icon");
        svg.setAttribute("aria-hidden", "true");
        const use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `#${icon}`);
        use.setAttribute("xlink:href", `#${icon}`);
        svg.appendChild(use);
        return svg;
    }
    if (icon && Array.from(icon).length <= 2) {
        const label = doc.createElement("span");
        label.className = "sw__home-module-icon sw__home-module-icon--text";
        label.setAttribute("aria-hidden", "true");
        label.textContent = icon;
        return label;
    }
    return null;
}

function normalizeHomeViewResult(value, options = {}) {
    const source = value && typeof value === "object" ? value : {};
    const rawSnapshot = source.snapshot && typeof source.snapshot === "object" ? source.snapshot : {};
    const rawItems = Array.isArray(rawSnapshot.items) ? rawSnapshot.items : [];
    const items = rawItems.slice(0, MAX_ITEMS).map((item) => {
        const entry = {
            label: text(item?.label),
            value: text(item?.value),
            href: text(item?.href, 512),
            command: text(item?.command, 128),
        };
        const secondary = text(item?.secondary, 32);
        if (secondary) entry.secondary = secondary;
        if (typeof item?.done === "boolean") entry.done = item.done;
        if (Number.isFinite(item?.count) && item.count >= 0) entry.count = Math.trunc(item.count);
        return entry;
    }).filter((item) => options.keepEmptyItems === true || item.label || item.value || item.href);
    const explicitStatus = STATUSES.has(source.status) ? source.status : "";
    const status = explicitStatus || (source.loading === true ? "loading" : source.ok === false ? "error" : items.length ? "ready" : "empty");
    return {
        status,
        cached: source.cached === true,
        reason: text(source.reason, 32),
        title: text(rawSnapshot.title, 64),
        updatedAt: Number.isFinite(rawSnapshot.updatedAt) ? rawSnapshot.updatedAt : 0,
        stat: rawSnapshot.stat && typeof rawSnapshot.stat === "object"
            ? (() => {
                const stat = {
                    value: text(rawSnapshot.stat.value, 32),
                    label: text(rawSnapshot.stat.label, 32),
                    progress: Number.isFinite(rawSnapshot.stat.progress) ? Math.min(100, Math.max(0, rawSnapshot.stat.progress)) : null,
                };
                const arc = rawSnapshot.stat.arc && typeof rawSnapshot.stat.arc === "object" ? rawSnapshot.stat.arc : null;
                const max = arc && Number.isFinite(arc.max) ? Math.min(1000000, Math.max(0, arc.max)) : 0;
                const value = arc && Number.isFinite(arc.value) ? Math.min(max, Math.max(0, arc.value)) : -1;
                if (max > 0 && value >= 0) stat.arc = {value, max};
                return stat;
            })()
            : null,
        items,
    };
}

function buildHomeModuleView(module, result, options = {}) {
    const definition = module && typeof module === "object" ? module : {};
    const moduleId = text(definition.moduleId, 64);
    if (!moduleId) return null;
    const normalized = normalizeHomeViewResult(result, {keepEmptyItems: definition.viewType === "calendar"});
    return {
        moduleId,
        title: text(definition.title, 64) || moduleId,
        icon: text(definition.icon, 64) || "iconFile",
        category: text(definition.category, 32) || "custom",
        configurable: Array.isArray(definition.configSchema) && definition.configSchema.length > 0,
        viewType: definition.viewType === "calendar" ? "calendar" : (definition.viewType === "weekdays" ? "weekdays" : ""),
        status: normalized.status,
        stat: normalized.stat,
        cached: normalized.cached,
        reason: normalized.reason,
        updatedAt: normalized.updatedAt,
        items: normalized.items,
        collapsed: options.collapsed === true,
        role: "region",
        ariaBusy: normalized.status === "loading",
    };
}

function renderHomeModuleView(doc, view, options = {}) {
    if (!doc || typeof doc.createElement !== "function" || !view || typeof view !== "object" || !view.moduleId) return null;
    const labels = {
        loading: "加载中…",
        empty: "暂无内容",
        error: "暂时无法加载",
        retry: "重试",
        collapse: "收起",
        expand: "展开",
        cached: "缓存",
        updated: "更新",
        ...(options.labels && typeof options.labels === "object" ? options.labels : {}),
    };
    const root = doc.createElement("section");
    root.className = "sw__home-module";
    root.dataset.moduleId = view.moduleId;
    root.dataset.status = view.status || "empty";
    root.setAttribute("role", view.role || "region");
    root.setAttribute("aria-busy", view.ariaBusy === true ? "true" : "false");
    renderSequence = (renderSequence + 1) % 1000000000;
    const instanceKey = `${instanceHash(view.moduleId)}-${renderSequence}`;
    const titleId = `sw-home-title-${instanceKey}`;
    root.setAttribute("aria-labelledby", titleId);
    const heading = doc.createElement("div");
    heading.className = "sw__home-module-header";
    const bodyId = `sw-home-body-${instanceKey}`;
    const icon = renderModuleIcon(doc, view.icon);
    if (icon) heading.appendChild(icon);
    const title = doc.createElement("h3");
    title.className = "sw__home-module-title";
    title.id = titleId;
    title.textContent = view.title || view.moduleId;
    heading.appendChild(title);
    const updatedAt = formatUpdatedAt(view.updatedAt);
    if (view.cached || updatedAt) {
        const meta = doc.createElement("span");
        meta.className = "sw__home-module-meta";
        const parts = [];
        if (view.cached) parts.push(labels.cached || "Cached");
        if (updatedAt) parts.push(`${labels.updated || "Updated"} ${updatedAt}`);
        meta.textContent = parts.join(" · ");
        meta.setAttribute("aria-label", meta.textContent);
        heading.appendChild(meta);
    }
    if (view.configurable && options.onConfig) {
        const configButton = doc.createElement("button");
        configButton.type = "button";
        configButton.className = "sw__home-module-toggle b3-button b3-button--outline";
        configButton.dataset.focusKey = "config";
        configButton.textContent = labels.config || "Configure";
        configButton.addEventListener("click", () => options.onConfig(view));
        heading.appendChild(configButton);
    }
    if (options.onToggle) {
        const toggle = doc.createElement("button");
        toggle.type = "button";
        toggle.className = "sw__home-module-toggle b3-button b3-button--text sw__home-module-fold";
        toggle.dataset.focusKey = "toggle";
        toggle.setAttribute("aria-expanded", view.collapsed === true ? "false" : "true");
        toggle.setAttribute("aria-controls", bodyId);
        toggle.setAttribute("aria-label", view.collapsed === true ? labels.expand : labels.collapse);
        toggle.setAttribute("title", view.collapsed === true ? labels.expand : labels.collapse);
        // 紧凑箭头图标替代文字按钮，减少头部常驻文字
        toggle.innerHTML = '<svg><use xlink:href="#' + (view.collapsed === true ? "iconRight" : "iconDown") + '"></use></svg>';
        toggle.addEventListener("click", () => options.onToggle(view));
        heading.appendChild(toggle);
    }
    root.appendChild(heading);
    const body = doc.createElement("div");
    body.className = "sw__home-module-body";
    root.setAttribute("aria-expanded", view.collapsed === true ? "false" : "true");
    body.setAttribute("aria-hidden", view.collapsed === true ? "true" : "false");
    body.id = bodyId;
    if (view.collapsed === true) {
        body.hidden = true;
    }
    if (view.stat && view.stat.value) {
        const hero = doc.createElement("div");
        hero.className = "sw__home-stat";
        const copy = doc.createElement("span");
        copy.className = "sw__home-stat-copy";
        const value = doc.createElement("span");
        value.className = "sw__home-stat-value";
        value.textContent = view.stat.value;
        const label = doc.createElement("span");
        label.className = "sw__home-stat-label";
        label.textContent = view.stat.label || "";
        copy.append(value, label);
        hero.appendChild(copy);
        if (view.stat.arc && Number.isFinite(view.stat.arc.value) && Number.isFinite(view.stat.arc.max) && view.stat.arc.max > 0) {
            const arc = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
            const ratio = Math.min(1, Math.max(0, view.stat.arc.value / view.stat.arc.max));
            const percent = Math.round(ratio * 100);
            arc.classList.add("sw__home-stat-arc");
            arc.setAttribute("viewBox", "0 0 40 40");
            arc.setAttribute("role", "progressbar");
            arc.setAttribute("aria-valuenow", String(percent));
            arc.setAttribute("aria-valuemin", "0");
            arc.setAttribute("aria-valuemax", "100");
            arc.setAttribute("aria-label", `${view.stat.label || "Progress"} ${percent}%`);
            const track = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
            track.classList.add("sw__home-stat-arc-track");
            track.setAttribute("cx", "20");
            track.setAttribute("cy", "20");
            track.setAttribute("r", "16");
            track.setAttribute("pathLength", "100");
            const fill = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
            fill.classList.add("sw__home-stat-arc-fill");
            fill.setAttribute("cx", "20");
            fill.setAttribute("cy", "20");
            fill.setAttribute("r", "16");
            fill.setAttribute("pathLength", "100");
            fill.setAttribute("stroke-dasharray", `${percent} ${100 - percent}`);
            arc.append(track, fill);
            hero.appendChild(arc);
        }
        body.appendChild(hero);
        if (Number.isFinite(view.stat.progress)) {
            const bar = doc.createElement("div");
            bar.className = "sw__home-progress";
            bar.setAttribute("role", "progressbar");
            bar.setAttribute("aria-valuenow", String(Math.round(view.stat.progress)));
            bar.setAttribute("aria-valuemin", "0");
            bar.setAttribute("aria-valuemax", "100");
            const fill = doc.createElement("div");
            fill.className = "sw__home-progress-fill";
            fill.style.width = Math.min(100, Math.max(0, view.stat.progress)) + "%";
            bar.appendChild(fill);
            body.appendChild(bar);
        }
    }
    if (view.status === "ready" && view.viewType === "weekdays") {
        // 周打卡行（Duolingo 式）：7 个圆点；条目约定 label=星期字、done=当天已完成
        const row = doc.createElement("div");
        row.className = "sw__home-weekdays";
        row.setAttribute("role", "list");
        (Array.isArray(view.items) ? view.items : []).slice(0, 7).forEach((item) => {
            const cell = doc.createElement("div");
            cell.className = "sw__home-weekday" + (item.done === true ? " is-done" : "");
            cell.setAttribute("role", "listitem");
            cell.setAttribute("aria-label", `${item.label || ""}${item.done === true ? " ✓" : ""}`);
            const dot = doc.createElement("span");
            dot.className = "sw__home-weekday-dot";
            if (item.done === true) {
                dot.innerHTML = '<svg><use xlink:href="#iconCheck"></use></svg>';
            }
            const label = doc.createElement("span");
            label.className = "sw__home-weekday-label";
            label.textContent = (item.label || "").slice(0, 1);
            cell.append(dot, label);
            row.appendChild(cell);
        });
        body.appendChild(row);
        root.appendChild(body);
        return root;
    }
    if (view.status === "ready" && view.viewType === "calendar") {
        // 日历月视图：7 列网格；条目约定 label=日期数字、value=文档 ID（可点击）、done=今天
        const grid = doc.createElement("div");
        grid.className = "sw__home-calendar";
        grid.setAttribute("role", "grid");
        const weekdayLabels = typeof options.calendarWeekdays === "string" && options.calendarWeekdays.length >= 7
            ? options.calendarWeekdays
            : "一二三四五六日";
        weekdayLabels.slice(0, 7).split("").forEach((label) => {
            const head = doc.createElement("span");
            head.className = "sw__home-calendar-head";
            head.textContent = label;
            grid.appendChild(head);
        });
        (Array.isArray(view.items) ? view.items : []).forEach((item) => {
            const clickable = Boolean(item.value) && typeof options.onItem === "function";
            const cell = doc.createElement(clickable ? "button" : "span");
            cell.className = "sw__home-calendar-cell"
                + (item.value ? " has-journal" : "")
                + (item.done === true ? " is-today" : "");
            const primary = doc.createElement("span");
            primary.className = "sw__home-calendar-primary";
            primary.textContent = item.label || "";
            cell.appendChild(primary);
            if (item.secondary) {
                const secondary = doc.createElement("small");
                secondary.className = "sw__home-calendar-secondary";
                secondary.textContent = item.secondary;
                cell.appendChild(secondary);
            }
            if (clickable) cell.addEventListener("click", () => options.onItem(item, view));
            grid.appendChild(cell);
        });
        body.appendChild(grid);
        root.appendChild(body);
        return root;
    }
    if (view.status === "ready") {
        const list = doc.createElement("ul");
        list.className = "sw__home-module-list";
        list.setAttribute("role", "list");
        const focusKeys = new Map();
        const usedFocusKeys = new Set();
        const canToggle = typeof options.onToggleItem === "function";
        const countValues = (Array.isArray(view.items) ? view.items : []).filter((item) => Number.isFinite(item.count) && item.count > 0).map((item) => item.count);
        const maxCount = countValues.length > 0 ? Math.max(...countValues) : 0;
        (Array.isArray(view.items) ? view.items : []).forEach((item) => {
            const row = doc.createElement("li");
            row.className = "sw__home-module-item";
            const button = doc.createElement("button");
            button.type = "button";
            button.className = "sw__home-module-item-action";
            const focusBase = item.value || item.label || item.href || "item";
            let focusIndex = focusKeys.get(focusBase) || 0;
            let focusKey = focusIndex ? `${focusBase}-${focusIndex}` : focusBase;
            while (usedFocusKeys.has(focusKey)) {
                focusIndex += 1;
                focusKey = `${focusBase}-${focusIndex}`;
            }
            focusKeys.set(focusBase, focusIndex + 1);
            usedFocusKeys.add(focusKey);
            button.dataset.focusKey = focusKey;
            button.dataset.value = item.value || "";
            if (item.href) button.dataset.href = item.href;
            if (item.command) button.dataset.command = item.command;
            button.classList.toggle("is-done", item.done === true);
            button.textContent = item.label || item.value || item.href || "";
            if (canToggle && typeof item.done === "boolean") {
                const check = doc.createElement("button");
                check.type = "button";
                check.className = "sw__home-module-item-check" + (item.done ? " is-done" : "");
                check.setAttribute("aria-label", item.done ? "标记未完成" : "标记完成");
                check.setAttribute("aria-pressed", String(item.done));
                check.innerHTML = item.done ? '<svg><use xlink:href="#iconCheck"></use></svg>' : "";
                check.addEventListener("click", (event) => {
                    event.stopPropagation();
                    options.onToggleItem(item, view);
                });
                row.appendChild(check);
            }
            if (options.onItem) button.addEventListener("click", () => options.onItem(item, view));
            if (Number.isFinite(item.count) && item.count > 0 && maxCount > 0) {
                const barWrap = doc.createElement("span");
                barWrap.className = "sw__home-item-bar";
                const barFill = doc.createElement("span");
                barFill.className = "sw__home-item-bar-fill";
                barFill.style.width = Math.min(100, Math.round(item.count / maxCount * 100)) + "%";
                barWrap.appendChild(barFill);
                row.appendChild(barWrap);
            }
            row.appendChild(button);
            list.appendChild(row);
        });
        body.appendChild(list);
    } else {
        const status = doc.createElement("p");
        status.className = `sw__home-module-status sw__home-module-status--${view.status || "empty"}`;
        status.setAttribute("role", view.status === "error" ? "alert" : "status");
        status.setAttribute("aria-live", view.status === "error" ? "assertive" : "polite");
        // Keep a generic fallback for older hosts, while allowing the host
        // adapter to surface a stable reason such as timeout/unsupported in a
        // localized way without exposing raw exception text.
        const reasonCode = view.status === "error" && view.reason && !labels[view.reason] ? ` · ${view.reason}` : "";
        status.textContent = (labels[view.reason] || labels[view.status] || labels.empty) + reasonCode;
        body.appendChild(status);
        if (view.status === "error" && options.onRetry) {
            const retry = doc.createElement("button");
            retry.type = "button";
            retry.className = "sw__home-module-retry b3-button b3-button--outline";
            retry.dataset.focusKey = "retry";
            retry.textContent = labels.retry;
            retry.addEventListener("click", () => options.onRetry(view));
            body.appendChild(retry);
        }
    }
    root.appendChild(body);
    return root;
}

module.exports = {MAX_ITEMS, MAX_TEXT, normalizeHomeViewResult, buildHomeModuleView, renderHomeModuleView, renderModuleIcon, formatUpdatedAt};
