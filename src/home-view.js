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

function normalizeHomeViewResult(value) {
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
        if (typeof item?.done === "boolean") entry.done = item.done;
        if (Number.isFinite(item?.count) && item.count >= 0) entry.count = Math.trunc(item.count);
        return entry;
    }).filter((item) => item.label || item.value || item.href);
    const explicitStatus = STATUSES.has(source.status) ? source.status : "";
    const status = explicitStatus || (source.loading === true ? "loading" : source.ok === false ? "error" : items.length ? "ready" : "empty");
    return {
        status,
        cached: source.cached === true,
        reason: text(source.reason, 32),
        title: text(rawSnapshot.title, 64),
        updatedAt: Number.isFinite(rawSnapshot.updatedAt) ? rawSnapshot.updatedAt : 0,
        stat: rawSnapshot.stat && typeof rawSnapshot.stat === "object"
            ? {
                value: text(rawSnapshot.stat.value, 32),
                label: text(rawSnapshot.stat.label, 32),
                progress: Number.isFinite(rawSnapshot.stat.progress) ? Math.min(100, Math.max(0, rawSnapshot.stat.progress)) : null,
            }
            : null,
        items,
    };
}

function buildHomeModuleView(module, result, options = {}) {
    const definition = module && typeof module === "object" ? module : {};
    const moduleId = text(definition.moduleId, 64);
    if (!moduleId) return null;
    const normalized = normalizeHomeViewResult(result);
    return {
        moduleId,
        title: text(definition.title, 64) || moduleId,
        icon: text(definition.icon, 64) || "iconFile",
        category: text(definition.category, 32) || "custom",
        configurable: Array.isArray(definition.configSchema) && definition.configSchema.length > 0,
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
        toggle.className = "sw__home-module-toggle b3-button b3-button--outline";
        toggle.dataset.focusKey = "toggle";
        toggle.setAttribute("aria-expanded", view.collapsed === true ? "false" : "true");
        toggle.setAttribute("aria-controls", bodyId);
        toggle.setAttribute("aria-label", view.collapsed === true ? labels.expand : labels.collapse);
        toggle.textContent = view.collapsed === true ? labels.expand : labels.collapse;
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
        const value = doc.createElement("span");
        value.className = "sw__home-stat-value";
        value.textContent = view.stat.value;
        const label = doc.createElement("span");
        label.className = "sw__home-stat-label";
        label.textContent = view.stat.label || "";
        hero.append(value, label);
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
