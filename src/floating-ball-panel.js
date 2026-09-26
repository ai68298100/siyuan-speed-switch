"use strict";

// B2 action panel boundary.  The floating-ball lifecycle controller owns the
// portal and pointer gestures; this module owns only action selection and the
// small first-layer/more-actions DOM subtree.  Keeping the two boundaries
// independent makes the panel usable by desktop, sidebar and mobile hosts.
const {FLOATING_BALL_MORE_ACTION_ID, FLOATING_BALL_FIRST_LAYER_LIMIT,
    normalizeFloatingBallDigitSlots} = require("./floating-ball-model.js");
const {getBuiltinQuickActions, createQuickActionRegistry} = require("./quick-actions.js");
const {
    normalizeFloatingBallConfig,
    resolveFloatingActionAvailability,
    selectFloatingBallFirstLayer,
    makeFloatingBallMoreAction,
    makeFloatingBallSwitcherAction,
    applyFloatingBallActionPresentation,
} = require("./floating-ball-model.js");
const {normalizeCustomIcon, isImageIconReference} = require("./util.js");

const DEFAULT_LABELS = Object.freeze({
    more: "更多动作",
    close: "关闭",
    unavailable: "当前端不可用",
    empty: "暂无可用动作",
    search: "搜索名称、动作 ID 或来源",
    noResults: "没有匹配的动作",
    builtin: "内置",
    component: "组件面板",
    plugin: "插件动作",
    other: "其他",
    unknown: "当前端能力尚未确认",
    providerMissing: "提供此动作的插件尚未加载",
    disabled: "已停用",
    enabled: "启用",
    manage: "管理快捷动作",
    toggleFailed: "未能保存，请重试",
    savedSearches: "保存的搜索",
    configureDigitSlot: "长按或右键配置数字槽",
});

function actionIdOf(action) {
    const id = action?.actionId ?? action?.id ?? action?.value;
    return typeof id === "string" ? id.trim() : "";
}

function actionKey(action) {
    const kind = typeof action?.kind === "string" ? action.kind : "builtin";
    return `${kind}:${String(action?.value ?? actionIdOf(action))}`;
}

function normalizeAction(action) {
    if (!action || typeof action !== "object") return null;
    const actionId = actionIdOf(action);
    if (!actionId) return null;
    return {
        ...action,
        actionId,
        id: typeof action.id === "string" && action.id.trim() ? action.id : actionId,
        label: typeof action.label === "string" && action.label.trim() ? action.label.trim() : actionId,
        icon: typeof action.icon === "string" && action.icon.trim() ? action.icon.trim() : "iconPlugin",
        enabled: action.enabled !== false,
    };
}

function resolveActionLabel(action, labels = {}, options = {}) {
    if (action?.labelOverride) return action.labelOverride;
    const id = actionIdOf(action);
    const value = typeof action?.value === "string" ? action.value.trim() : "";
    const maps = [];
    if (action?.kind === "builtin") {
        maps.push(options.builtinLabels, labels.builtins);
    }
    maps.push(options.actionLabels, labels.actions, options.fallbackLabels, labels.fallbacks);
    for (const map of maps) {
        if (!map || typeof map !== "object") continue;
        for (const key of [id, value]) {
            if (key && typeof map[key] === "string" && map[key].trim()) return map[key].trim();
        }
    }
    return typeof action?.label === "string" && action.label.trim() ? action.label.trim() : (id || value || "动作");
}

function localizeAction(action, labels, options) {
    const normalized = normalizeAction(action);
    return normalized ? {...normalized, label: resolveActionLabel(normalized, labels, options)} : null;
}

/**
 * Merge core builtins and provider actions into a deterministic, de-duplicated
 * list. Registry providers are intentionally optional: tests and lightweight
 * hosts can pass a plain array without constructing a registry.
 */
function collectFloatingBallActions(options = {}) {
    const list = [];
    const seen = new Set();
    const add = (raw) => {
        const action = normalizeAction(raw);
        if (!action) return;
        const key = actionKey(action);
        if (seen.has(key)) return;
        seen.add(key);
        list.push(action);
    };
    if (options.includeBuiltins !== false) getBuiltinQuickActions().forEach(add);
    const registry = options.registry;
    if (registry && typeof registry.list === "function") {
        registry.list(Number.isFinite(options.registryLimit) ? options.registryLimit : 64).forEach(add);
    }
    (Array.isArray(options.actions) ? options.actions : []).forEach(add);
    return list;
}

function configEntries(config, surface) {
    const normalized = normalizeFloatingBallConfig(config);
    return Array.isArray(normalized.actions?.[surface]) ? normalized.actions[surface] : [];
}

/**
 * Return actions for the expanded panel. Unsupported actions are omitted;
 * actions whose capability is unknown remain visible but disabled so users
 * can understand why an entry cannot be run on the current surface.
 */
function selectFloatingBallMoreActions(config, surface, availableActions = [], options = {}) {
    const normalizedSurface = ["desktop", "sidebar", "mobile"].includes(surface) ? surface : "desktop";
    const entries = configEntries(config, normalizedSurface);
    const available = (Array.isArray(availableActions) ? availableActions : [])
        .map(normalizeAction)
        .filter(Boolean);
    const byId = new Map(available.map((action) => [actionIdOf(action), action]));
    const firstIds = new Set(selectFloatingBallFirstLayer(config, normalizedSurface, available, options).map(actionIdOf));
    const result = [];
    const seen = new Set();
    entries
        // An action promoted to the first layer must not be duplicated in the
        // expanded list.  Provider-missing entries remain visible as unknown
        // rows so the user can understand and recover the configuration.
        .filter((entry) => (entry.enabled !== false || typeof options.onToggleAction === "function")
            && !firstIds.has(actionIdOf(entry)))
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .forEach((entry) => {
            const id = actionIdOf(entry);
            if (!id || id === FLOATING_BALL_MORE_ACTION_ID || seen.has(id)) return;
            // Keep a configured action visible when its provider disappeared.
            // The disabled/unknown row gives users a recoverable explanation
            // instead of silently rewriting their persisted action list.
            const action = byId.get(id) || {
                id,
                actionId: id,
                value: id,
                label: id,
                icon: "iconPlugin",
                kind: "adapter",
                targets: [normalizedSurface],
                providerMissing: true,
            };
            const presented = applyFloatingBallActionPresentation(action, entry);
            if (!presented.providerMissing && resolveFloatingActionAvailability({...presented, enabled: true, available: true},
                normalizedSurface, options).status === "unsupported") return;
            let availability = presented.providerMissing
                ? {status: "unknown", reason: "provider-missing"}
                : resolveFloatingActionAvailability(presented, normalizedSurface, options);
            if (availability.status === "unsupported") return;
            if (entry.enabled === false) availability = {status: "unavailable", reason: "disabled"};
            seen.add(id);
            const normalized = localizeAction(presented, options.labels, options);
            result.push({...normalized, actionId: id, availability, firstLayer: false, configuredEnabled: entry.enabled !== false});
        });
    // If a caller supplies provider actions not persisted yet, keep them out
    // of the panel. The settings picker remains the explicit registration
    // route, avoiding a surprise action on first render.
    return result;
}

function collectSavedSearches(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const searches = [];
    for (const raw of value) {
        if (searches.length >= 16) break;
        if (!raw || typeof raw !== "object") continue;
        const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 64) : "";
        const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
        const query = typeof raw.query === "string" ? raw.query.trim().slice(0, 120) : "";
        if (!id || !name || !query || seen.has(id)) continue;
        seen.add(id);
        searches.push({id, name, query,
            ...(typeof raw.notebook === "string" && raw.notebook.trim()
                ? {notebook: raw.notebook.trim().slice(0, 64)} : {})});
    }
    return searches;
}

function digitReferenceKey(reference) {
    if (reference?.kind === "action" && typeof reference.actionId === "string" && reference.actionId) {
        return `action:${reference.actionId}`;
    }
    if (reference?.kind === "saved-search" && typeof reference.searchId === "string" && reference.searchId) {
        return `saved-search:${reference.searchId}`;
    }
    return "";
}

/** Fixed bindings reserve their digit even when the target disappeared, is disabled, or is filtered out. */
function resolveFloatingBallDigitTargets(config, surface, candidates = []) {
    const slots = normalizeFloatingBallDigitSlots(config?.digitSlots)[surface] || [];
    const available = (Array.isArray(candidates) ? candidates : [])
        .filter((candidate) => candidate?.visible !== false && candidate?.enabled !== false
            && digitReferenceKey(candidate.reference));
    const byKey = new Map(available.map((candidate) => [digitReferenceKey(candidate.reference), candidate]));
    const used = new Set();
    const targets = slots.map((reference) => {
        const key = digitReferenceKey(reference);
        if (!key) return {reference: null, candidate: null, fixed: false};
        const candidate = used.has(key) ? null : (byKey.get(key) || null);
        if (candidate) used.add(key);
        return {reference, candidate, fixed: true};
    });
    let cursor = 0;
    targets.forEach((target, index) => {
        if (target.fixed) return;
        while (cursor < available.length && used.has(digitReferenceKey(available[cursor].reference))) cursor += 1;
        const candidate = available[cursor++] || null;
        if (candidate) used.add(digitReferenceKey(candidate.reference));
        targets[index] = {reference: candidate?.reference || null, candidate, fixed: false};
    });
    return targets;
}

function safeIconId(raw, fallback = "iconPlugin") {
    const value = typeof raw === "string" ? raw.trim() : "";
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value) ? value : fallback;
}

function appendActionIcon(documentRef, host, action) {
    const raw = typeof action?.icon === "string" ? action.icon.trim() : "";
    const image = normalizeCustomIcon(raw);
    if (image && isImageIconReference(image)) {
        const img = documentRef.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.src = image;
        img.className = "sw__floating-ball-action-image";
        img.addEventListener("error", () => {
            if (img.parentNode !== host) return;
            img.remove();
            host.classList.remove("is-image-icon");
            appendActionIcon(documentRef, host, {icon: "iconPlugin"});
        }, {once: true});
        host.appendChild(img);
        host.classList.add("is-image-icon");
        return;
    }
    const isTextIcon = image && !/^(?:icon[A-Za-z0-9_-]+|lucide-|siyuan-)/.test(image);
    if (isTextIcon) {
        host.textContent = raw;
        host.classList.add("is-text-icon");
        return;
    }
    const icon = safeIconId(raw);
    const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = documentRef.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${icon}`);
    use.setAttribute("xlink:href", `#${icon}`);
    svg.appendChild(use);
    host.appendChild(svg);
}

function actionReason(action, labels) {
    const {status, reason} = action.availability || {};
    if (reason === "manual-mobile-override") return labels.mobileTry || labels.unknown;
    if (status !== "unknown" && status !== "unavailable") return "";
    if (labels.reasons?.[reason]) return labels.reasons[reason];
    if (reason === "provider-missing") return labels.providerMissing;
    if (reason === "disabled") return labels.disabled;
    return status === "unknown" ? labels.unknown : labels.unavailable;
}

function actionGroup(action) {
    if (["builtin", "component", "plugin", "other"].includes(action.group)) return action.group;
    if (action.kind === "builtin" && action.value === "home") return "component";
    if (action.kind === "builtin") return "builtin";
    if (action.kind === "dock") return "component";
    if (!action.providerMissing && (action.kind === "command" || action.kind === "adapter")) return "plugin";
    return "other";
}

function actionSource(action, labels) {
    const value = typeof action.value === "string" ? action.value : "";
    const provider = action.providerName || action.providerId || action.pluginName
        || (action.kind === "command" && value.includes("::") ? value.split("::")[0] : "");
    return typeof provider === "string" && provider.trim() ? provider.trim() : labels[actionGroup(action)];
}

function makeActionButton(documentRef, action, onActivate, labels, extraClass = "") {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = `sw__floating-ball-action ${extraClass}`.trim();
    button.dataset.actionId = actionIdOf(action);
    const reason = actionReason(action, labels);
    const source = extraClass === "is-more-item" ? actionSource(action, labels) : "";
    const description = [action.label, source, reason].filter(Boolean).join(" · ");
    button.setAttribute("aria-label", description);
    button.title = description;
    const iconHost = documentRef.createElement("span");
    iconHost.className = "sw__floating-ball-action-icon";
    appendActionIcon(documentRef, iconHost, action);
    const label = documentRef.createElement("span");
    label.className = "sw__floating-ball-action-label";
    label.textContent = action.label;
    button.append(iconHost, label);
    if (source || reason) {
        const details = documentRef.createElement("span");
        details.className = "sw__floating-ball-action-details";
        details.textContent = [source, reason].filter(Boolean).join(" · ");
        button.appendChild(details);
    }
    if (action.availability && action.availability.status !== "supported") {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.classList.add("is-unavailable");
    } else {
        button.addEventListener("click", () => onActivate(action));
    }
    return button;
}

function makeSavedSearchButton(documentRef, saved, onActivate, labels, enabled) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "sw__floating-ball-action is-more-item";
    button.dataset.savedSearchId = saved.id;
    button.setAttribute("aria-label", `${saved.name} · ${labels.savedSearches} · ${saved.query}`);
    button.title = `${saved.name} · ${saved.query}`;
    const icon = documentRef.createElement("span");
    icon.className = "sw__floating-ball-action-icon";
    appendActionIcon(documentRef, icon, {icon: "iconSearch"});
    const label = documentRef.createElement("span");
    label.className = "sw__floating-ball-action-label";
    label.textContent = saved.name;
    const details = documentRef.createElement("span");
    details.className = "sw__floating-ball-action-details";
    details.textContent = saved.query;
    button.append(icon, label, details);
    if (enabled) button.addEventListener("click", () => onActivate(saved));
    else {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.classList.add("is-unavailable");
    }
    return button;
}

function isEditableTarget(target) {
    let element = target?.nodeType === 1 ? target : target?.parentElement;
    while (element) {
        const tag = element.tagName?.toLowerCase();
        if (["input", "textarea", "select"].includes(tag) || element.isContentEditable === true
            || element.getAttribute?.("role") === "textbox") return true;
        const editable = element.getAttribute?.("contenteditable");
        if (editable !== null && editable !== "false") return true;
        element = element.parentElement || element.getRootNode?.()?.host || null;
    }
    return false;
}

/**
 * Mount a first-layer strip and an expandable more-actions drawer.
 *
 * The returned controller deliberately has no dependency on FloatingBallUi;
 * hosts can call `openMore` from a right-click/keyboard gesture or render the
 * panel beside any other trigger. `onAction` receives only capability-
 * supported actions, while the more action is handled internally.
 */
function createFloatingBallPanelController(options = {}) {
    const documentRef = options.document || options.container?.ownerDocument;
    const container = options.container;
    if (!documentRef || !container || typeof container.appendChild !== "function") return null;
    let disposed = false;
    let mounted = false;
    let open = false;
    let root = null;
    let firstLayerHost = null;
    let moreHost = null;
    let searchInput = null;
    let listHost = null;
    let emptyHost = null;
    let manageButton = null;
    let searchQuery = "";
    let rows = [];
    let digitTargets = [];
    let configureTimer = null;
    let lastFocusedElement = null;
    let lastFocusedActionId = null;
    let config = options.config;
    let surface = options.surface || "desktop";
    let availableActions = collectFloatingBallActions(options);
    let labels = {...DEFAULT_LABELS, ...(options.labels || {})};

    const onDocumentPointerDown = (event) => {
        if (!open || !root) return;
        const target = event.target;
        if (target && root.contains(target)) return;
        closeMore({restoreFocus: false});
    };
    documentRef.addEventListener?.("pointerdown", onDocumentPointerDown, true);

    function canFocus(element) {
        if (!element?.isConnected || element.disabled
            || element.closest?.('[hidden], [inert], [aria-hidden="true"]')) return false;
        const ball = element.closest?.(".sw-fab-root");
        if (element.closest?.(".sw__floating-ball-first-layer") && ball
            && !["dragging", "targeting", "more"].includes(ball.dataset.state)) return false;
        return true;
    }

    function activateAction(item) {
        // Closing first is essential: onAction can synchronously enter an
        // executing/suspended state which onCloseMore must not overwrite.
        closeMore({restoreFocus: false});
        options.onAction?.(item);
    }

    function activateSavedSearch(saved) {
        closeMore({restoreFocus: false});
        options.onSavedSearch?.({searchId: saved.id}, surface);
    }

    function clearConfigureTimer() {
        if (configureTimer !== null) clearTimeout(configureTimer);
        configureTimer = null;
    }

    function configuredSlotIndex(reference) {
        const key = digitReferenceKey(reference);
        if (!key) return null;
        const slots = normalizeFloatingBallDigitSlots(config?.digitSlots)[surface] || [];
        const index = slots.findIndex((slot) => digitReferenceKey(slot) === key);
        return index < 0 ? null : index;
    }

    function configureDigitSlot(reference) {
        if (typeof options.onConfigureDigitSlot !== "function") return;
        const index = configuredSlotIndex(reference);
        closeMore({restoreFocus: false});
        options.onConfigureDigitSlot(index, reference, surface);
    }

    function attachConfigurationGesture(row, button, reference) {
        if (typeof options.onConfigureDigitSlot !== "function") return;
        button.title = [button.title, labels.configureDigitSlot].filter(Boolean).join(" · ");
        button.setAttribute("aria-description", labels.configureDigitSlot);
        let suppressClick = false;
        let longPressAt = 0;
        let start = null;
        row.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            clearConfigureTimer();
            if (Date.now() - longPressAt < 1200) return;
            configureDigitSlot(reference);
        });
        row.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || !button.contains(event.target)) return;
            clearConfigureTimer();
            suppressClick = false;
            longPressAt = 0;
            start = {x: event.clientX, y: event.clientY};
            configureTimer = setTimeout(() => {
                configureTimer = null;
                if (!open || disposed || !row.isConnected) return;
                suppressClick = true;
                longPressAt = Date.now();
                configureDigitSlot(reference);
            }, 550);
        });
        row.addEventListener("pointermove", (event) => {
            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
                start = null;
                clearConfigureTimer();
            }
        });
        row.addEventListener("pointerleave", () => {
            start = null;
            clearConfigureTimer();
        });
        const endPointer = () => {
            start = null;
            clearConfigureTimer();
            if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
        };
        row.addEventListener("pointerup", endPointer);
        row.addEventListener("pointercancel", endPointer);
        row.addEventListener("click", (event) => {
            if (!suppressClick) return;
            suppressClick = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    }

    function syncFirstLayerVisibility() {
        if (!firstLayerHost) return;
        firstLayerHost.hidden = open;
        firstLayerHost.setAttribute("aria-hidden", String(open));
        if (open) firstLayerHost.setAttribute("inert", "");
        else firstLayerHost.removeAttribute("inert");
        firstLayerHost.querySelectorAll("button").forEach((button) => { button.tabIndex = open ? -1 : 0; });
    }

    function filterRows() {
        const query = searchQuery.trim().toLocaleLowerCase();
        let visible = 0;
        rows.forEach(({row, search}) => {
            row.hidden = Boolean(query && !search.includes(query));
            if (!row.hidden) visible += 1;
        });
        listHost?.querySelectorAll(".sw__floating-ball-more-group").forEach((group) => {
            group.hidden = ![...group.querySelectorAll(".sw__floating-ball-more-row")].some((row) => !row.hidden);
        });
        if (emptyHost) {
            emptyHost.hidden = visible > 0;
            emptyHost.textContent = query ? labels.noResults : labels.empty;
        }
        refreshDigitHints();
    }

    // Fixed bindings and empty-slot fallback share one resolved mapping for
    // key dispatch and desktop hints. Hidden/disabled rows never receive a hint.
    function refreshDigitHints() {
        if (!listHost) return;
        digitTargets = resolveFloatingBallDigitTargets(config, surface, rows.map(({row, button, reference}) => ({
            row, button, reference, visible: !row.hidden, enabled: !button.disabled,
        })));
        rows.forEach(({row}) => { delete row.dataset.digit; });
        digitTargets.forEach(({candidate}, index) => {
            if (surface !== "mobile" && candidate) candidate.row.dataset.digit = String(index + 1);
        });
    }

    // Fixed slots and visible-row fallback use the same resolver as the hints.
    // Editable targets, including hosts outside the drawer, keep their digits.
    function onMorePanelKeydown(event) {
        if (!open || disposed) return;
        if (isEditableTarget(event.target) || isEditableTarget(documentRef.activeElement)) return;
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing) return;
        if (!/^[1-9]$/.test(event.key)) return;
        const target = digitTargets[Number(event.key) - 1];
        if (target?.fixed && !target.candidate) {
            event.preventDefault();
            options.onUnavailable?.(target.reference, surface);
            return;
        }
        const button = target?.candidate?.button;
        if (!button?.isConnected || button.disabled) return;
        event.preventDefault();
        button.click();
    }

    function positionMore() {
        if (!open || !moreHost) return;
        const view = documentRef.defaultView;
        const viewport = view?.visualViewport;
        let left = viewport?.offsetLeft || 0;
        let top = viewport?.offsetTop || 0;
        let right = left + (viewport?.width || view?.innerWidth || 1);
        let bottom = top + (viewport?.height || view?.innerHeight || 1);
        if (surface === "mobile") {
            // A mobile keyboard and pinch zoom change the visual viewport,
            // while CSS fixed/bottom/vh still use the larger layout viewport.
            // Keep this bottom sheet entirely inside the area users can see.
            const style = view?.getComputedStyle(container);
            const inset = (key) => Math.max(0, parseFloat(style?.getPropertyValue(key) || "0") || 0);
            left += inset("--sw-fab-safe-left");
            right -= inset("--sw-fab-safe-right");
            top += inset("--sw-fab-safe-top");
            bottom -= inset("--sw-fab-safe-bottom");
            const width = Math.max(1, Math.min(520, right - left - 16));
            const maxHeight = Math.max(1, Math.min(520, (bottom - top) * 0.7, bottom - top - 16));
            moreHost.style.width = `${width}px`;
            moreHost.style.maxHeight = `${maxHeight}px`;
            const height = Math.min(moreHost.getBoundingClientRect().height || maxHeight, maxHeight);
            moreHost.style.left = `${left + Math.max(8, (right - left - width) / 2)}px`;
            moreHost.style.top = `${Math.max(top + 8, bottom - 8 - height)}px`;
            moreHost.style.right = "auto";
            moreHost.style.bottom = "auto";
            return;
        }
        if (surface === "sidebar") {
            const host = container.parentElement?.getBoundingClientRect();
            if (host?.width > 0 && host?.height > 0) {
                left = Math.max(left, host.left);
                right = Math.min(right, host.right);
                top = Math.max(top, host.top);
                bottom = Math.min(bottom, host.bottom);
            }
        }
        const bounds = container.getBoundingClientRect();
        const width = Math.max(1, Math.min(320, right - left - 16));
        const maxHeight = Math.max(1, bottom - top - 16);
        moreHost.style.width = `${width}px`;
        moreHost.style.maxHeight = `${Math.min(520, maxHeight)}px`;
        const height = Math.min(moreHost.getBoundingClientRect().height || 520, maxHeight);
        const preferredLeft = container.dataset.edge === "left" ? bounds.right + 10 : bounds.left - width - 10;
        const targetLeft = Math.max(left + 8, Math.min(preferredLeft, right - width - 8));
        const targetTop = Math.max(top + 8, Math.min(bounds.bottom - height, bottom - height - 8));
        // The ball is transformed, so a fixed descendant would still use its
        // containing block. Convert the viewport clamp into local coordinates.
        moreHost.style.left = `${targetLeft - bounds.left}px`;
        moreHost.style.top = `${targetTop - bounds.top}px`;
        moreHost.style.right = "auto";
        moreHost.style.bottom = "auto";
    }

    function render() {
        if (disposed || !root || !firstLayerHost || !moreHost) return;
        clearConfigureTimer();
        const active = documentRef.activeElement;
        const focusedId = active?.getAttribute?.("data-action-id");
        const focusedSearchId = active?.getAttribute?.("data-saved-search-id");
        const focusedToggleId = active?.getAttribute?.("data-toggle-action-id");
        const ownedFocus = root.contains(active);
        const scrollTop = moreHost.scrollTop;
        // Avoid replaceChildren(): older embedded Android WebViews used by
        // SiYuan may not expose it even though append/remove are available.
        while (firstLayerHost.firstChild) firstLayerHost.removeChild(firstLayerHost.firstChild);
        while (listHost.firstChild) listHost.removeChild(listHost.firstChild);
        root.dataset.surface = surface;
        const firstLayer = selectFloatingBallFirstLayer(config, surface, availableActions, options);
        firstLayer.forEach((raw) => {
            const action = localizeAction(raw, labels, options);
            if (action.actionId === FLOATING_BALL_MORE_ACTION_ID) action.label = labels.more;
            const className = action.actionId === FLOATING_BALL_MORE_ACTION_ID ? "is-more" : "";
            const button = makeActionButton(documentRef, action, (item) => {
                if (item.actionId === FLOATING_BALL_MORE_ACTION_ID) {
                    openMore();
                    return;
                }
                activateAction(item);
            }, labels, className);
            if (action.actionId === FLOATING_BALL_MORE_ACTION_ID) {
                button.setAttribute("aria-haspopup", "dialog");
                button.setAttribute("aria-expanded", String(open));
            }
            firstLayerHost.appendChild(button);
        });
        syncFirstLayerVisibility();
        // The drawer is the keyboard equivalent of the drag targets. Move
        // first-layer actions into its single visible list while it is open;
        // retain the public overflow selector's existing meaning for callers.
        const descriptors = configEntries(config, surface);
        const drawerActions = new Map();
        firstLayer.filter((action) => action.actionId !== FLOATING_BALL_MORE_ACTION_ID).forEach((raw) => {
            const descriptor = descriptors.find((entry) => entry.actionId === raw.actionId);
            drawerActions.set(raw.actionId, {...localizeAction(raw, labels, options),
                configuredEnabled: descriptor?.enabled !== false, canToggle: Boolean(descriptor) && !raw.fallback});
        });
        selectFloatingBallMoreActions(config, surface, availableActions, {...options, labels}).forEach((action) => {
            if (!drawerActions.has(action.actionId)) drawerActions.set(action.actionId, {...action, canToggle: true});
        });
        // A fixed slot may point at any current catalog action, including one
        // not placed in config.actions. Resolve it live and show a recoverable
        // disabled row when its provider or surface capability disappeared.
        (normalizeFloatingBallDigitSlots(config?.digitSlots)[surface] || []).forEach((reference) => {
            if (reference?.kind !== "action" || drawerActions.has(reference.actionId)) return;
            const raw = availableActions.find((item) => actionIdOf(item) === reference.actionId);
            const descriptor = descriptors.find((item) => item.actionId === reference.actionId);
            const presented = raw ? applyFloatingBallActionPresentation(raw, descriptor) : {
                id: reference.actionId, actionId: reference.actionId, value: reference.actionId,
                label: reference.actionId, icon: "iconPlugin", kind: "adapter", providerMissing: true,
            };
            let availability = raw
                ? resolveFloatingActionAvailability(presented, surface, options)
                : {status: "unknown", reason: "provider-missing"};
            if (availability.status === "unsupported") availability = {status: "unavailable", reason: "unsupported"};
            if (descriptor?.enabled === false) availability = {status: "unavailable", reason: "disabled"};
            drawerActions.set(reference.actionId, {...localizeAction(presented, labels, options),
                availability, configuredEnabled: descriptor?.enabled !== false, canToggle: Boolean(descriptor)});
        });
        const moreActions = [...drawerActions.values()];
        const savedSearches = collectSavedSearches(options.savedSearches);
        rows = [];
        ["builtin", "component", "plugin", "savedSearches", "other"].forEach((groupName) => {
            const groupActions = groupName === "savedSearches" ? savedSearches
                : moreActions.filter((action) => actionGroup(action) === groupName);
            if (!groupActions.length) return;
            const group = documentRef.createElement("section");
            group.className = "sw__floating-ball-more-group";
            group.dataset.group = groupName;
            group.setAttribute("aria-label", labels[groupName]);
            const heading = documentRef.createElement("h3");
            heading.className = "sw__floating-ball-more-group-title";
            heading.textContent = labels[groupName];
            group.appendChild(heading);
            groupActions.forEach((action) => {
                const row = documentRef.createElement("div");
                row.className = "sw__floating-ball-more-row";
                if (groupName === "savedSearches") {
                    const saved = action;
                    const button = makeSavedSearchButton(documentRef, saved, activateSavedSearch, labels,
                        typeof options.onSavedSearch === "function");
                    const reference = {kind: "saved-search", searchId: saved.id};
                    row.appendChild(button);
                    attachConfigurationGesture(row, button, reference);
                    group.appendChild(row);
                    rows.push({row, button, reference,
                        search: [saved.name, saved.id, saved.query, saved.notebook]
                            .filter(Boolean).join(" ").toLocaleLowerCase()});
                    return;
                }
                const reference = {kind: "action", actionId: action.actionId};
                const button = makeActionButton(documentRef, action, (item) => activateAction(
                    configuredSlotIndex(reference) === null ? item : {...item, digitSlotBound: true}),
                labels, "is-more-item");
                row.appendChild(button);
                attachConfigurationGesture(row, button, reference);
                if (typeof options.onToggleAction === "function" && action.canToggle) {
                    const toggleLabel = documentRef.createElement("label");
                    toggleLabel.className = "sw__floating-ball-more-toggle";
                    const toggle = documentRef.createElement("input");
                    toggle.type = "checkbox";
                    toggle.dataset.toggleActionId = action.actionId;
                    toggle.checked = action.configuredEnabled;
                    toggle.setAttribute("aria-label", `${labels.enabled} · ${action.label}`);
                    toggle.addEventListener("change", async () => {
                        const previous = action.configuredEnabled;
                        toggle.disabled = true;
                        toggle.setAttribute("aria-busy", "true");
                        try {
                            await options.onToggleAction(action.actionId, toggle.checked, surface);
                        } catch {
                            toggle.checked = previous;
                            if (!disposed) {
                                emptyHost.hidden = false;
                                emptyHost.textContent = labels.toggleFailed;
                            }
                        } finally {
                            toggle.disabled = false;
                            toggle.removeAttribute("aria-busy");
                        }
                    });
                    toggleLabel.appendChild(toggle);
                    row.appendChild(toggleLabel);
                }
                group.appendChild(row);
                rows.push({row, button, reference, search: [action.label, action.actionId, action.value,
                    action.providerId, action.providerName, actionSource(action, labels)]
                    .filter(Boolean).join(" ").toLocaleLowerCase()});
            });
            listHost.appendChild(group);
        });
        searchInput.setAttribute("aria-label", labels.search);
        searchInput.placeholder = labels.search;
        root.setAttribute("aria-label", labels.more);
        moreHost.setAttribute("aria-label", labels.more);
        moreHost.querySelector(".sw__floating-ball-more-title").textContent = labels.more;
        moreHost.querySelector(".sw__floating-ball-more-close").setAttribute("aria-label", labels.close);
        manageButton.textContent = labels.manage;
        manageButton.hidden = typeof options.onManageSettings !== "function";
        filterRows();
        moreHost.hidden = !open;
        moreHost.setAttribute("aria-hidden", String(!open));
        const moreButton = firstLayerHost.querySelector(`[data-action-id="${FLOATING_BALL_MORE_ACTION_ID}"]`);
        moreButton?.setAttribute("aria-expanded", String(open));
        moreHost.scrollTop = scrollTop;
        if (ownedFocus && active !== searchInput && !active?.isConnected) {
            const key = focusedToggleId ? "data-toggle-action-id"
                : focusedSearchId ? "data-saved-search-id" : "data-action-id";
            const id = focusedToggleId || focusedSearchId || focusedId;
            const target = id ? [...root.querySelectorAll(`[${key}]`)]
                .find((item) => item.getAttribute(key) === id && canFocus(item)) : null;
            if (canFocus(target)) target.focus({preventScroll: true});
            else if (open && canFocus(searchInput)) searchInput.focus({preventScroll: true});
        }
        positionMore();
    }

    function focusMoreEntry() {
        if (!open || !moreHost) return;
        if (canFocus(searchInput)) searchInput.focus({preventScroll: true});
    }

    function mount() {
        if (disposed) return null;
        if (mounted) return root;
        root = documentRef.createElement("section");
        root.className = "sw__floating-ball-panel";
        root.dataset.surface = surface;
        root.setAttribute("role", "group");
        root.setAttribute("aria-label", labels.more);
        firstLayerHost = documentRef.createElement("div");
        firstLayerHost.className = "sw__floating-ball-first-layer";
        moreHost = documentRef.createElement("div");
        moreHost.className = "sw__floating-ball-more";
        moreHost.setAttribute("role", "dialog");
        moreHost.setAttribute("aria-modal", "false");
        const heading = documentRef.createElement("div");
        heading.className = "sw__floating-ball-more-heading";
        const title = documentRef.createElement("span");
        title.className = "sw__floating-ball-more-title";
        title.textContent = labels.more;
        heading.appendChild(title);
        const close = documentRef.createElement("button");
        close.type = "button";
        close.className = "sw__floating-ball-more-close";
        close.setAttribute("aria-label", labels.close);
        close.textContent = "×";
        close.addEventListener("click", () => closeMore());
        heading.appendChild(close);
        searchInput = documentRef.createElement("input");
        searchInput.type = "search";
        searchInput.className = "sw__floating-ball-more-search";
        searchInput.addEventListener("input", () => {
            searchQuery = searchInput.value;
            filterRows();
        });
        listHost = documentRef.createElement("div");
        listHost.className = "sw__floating-ball-more-list";
        emptyHost = documentRef.createElement("p");
        emptyHost.className = "sw__floating-ball-more-empty";
        emptyHost.setAttribute("role", "status");
        manageButton = documentRef.createElement("button");
        manageButton.type = "button";
        manageButton.className = "sw__floating-ball-more-manage";
        manageButton.addEventListener("click", () => {
            closeMore({restoreFocus: false});
            options.onManageSettings?.(surface);
        });
        moreHost.append(heading, searchInput, listHost, emptyHost, manageButton);
        root.append(firstLayerHost, moreHost);
        container.appendChild(root);
        mounted = true;
        documentRef.defaultView?.addEventListener("resize", positionMore);
        documentRef.defaultView?.visualViewport?.addEventListener("resize", positionMore);
        documentRef.defaultView?.visualViewport?.addEventListener("scroll", positionMore);
        // T-6884（T-6857）：数字直达键盘监听（面板打开时才生效；销毁时解绑）
        documentRef.addEventListener?.("keydown", onMorePanelKeydown);
        render();
        return root;
    }

    function openMore() {
        if (disposed || open) return;
        if (!mounted) mount();
        if (!open) {
            const active = documentRef.activeElement;
            const fallback = firstLayerHost?.querySelector(`[data-action-id="${FLOATING_BALL_MORE_ACTION_ID}"]`);
            lastFocusedElement = active && container.contains(active) ? active : fallback;
            lastFocusedActionId = lastFocusedElement?.getAttribute?.("data-action-id") || FLOATING_BALL_MORE_ACTION_ID;
        }
        open = true;
        options.onOpenMore?.();
        render();
        focusMoreEntry();
    }

    function closeMore(closeOptions = {}) {
        if (disposed || !open) return;
        clearConfigureTimer();
        const restore = lastFocusedElement;
        const shouldRestore = closeOptions.restoreFocus !== false && moreHost?.contains(documentRef.activeElement);
        open = false;
        moreHost.hidden = true;
        moreHost.setAttribute("aria-hidden", "true");
        syncFirstLayerVisibility();
        firstLayerHost?.querySelector(`[data-action-id="${FLOATING_BALL_MORE_ACTION_ID}"]`)?.setAttribute("aria-expanded", "false");
        options.onCloseMore?.({restoreFocus: shouldRestore});
        let focusTarget = canFocus(restore) && !moreHost?.contains(restore) ? restore : null;
        if (!focusTarget && lastFocusedActionId && firstLayerHost) {
            focusTarget = [...firstLayerHost.querySelectorAll("[data-action-id]")]
                .find((item) => item.getAttribute("data-action-id") === lastFocusedActionId) || null;
        }
        if (!canFocus(focusTarget)) focusTarget = container.querySelector?.(".sw-fab-trigger");
        if (shouldRestore && canFocus(focusTarget)) focusTarget.focus({preventScroll: true});
        if (moreHost?.contains(documentRef.activeElement)) documentRef.activeElement?.blur?.();
        lastFocusedElement = null;
        lastFocusedActionId = null;
    }

    function update(patch = {}) {
        if (disposed) return;
        options = {...options, ...patch};
        labels = {...DEFAULT_LABELS, ...(options.labels || {})};
        if (patch.config !== undefined) config = patch.config;
        if (patch.surface) surface = patch.surface;
        if (Object.prototype.hasOwnProperty.call(patch, "actions")
            || Object.prototype.hasOwnProperty.call(patch, "registry")) {
            availableActions = collectFloatingBallActions({...options, ...patch});
        }
        render();
    }

    function destroy() {
        if (disposed) return;
        clearConfigureTimer();
        const activeInside = root?.contains(documentRef.activeElement);
        const fallback = canFocus(lastFocusedElement) && !root?.contains(lastFocusedElement)
            ? lastFocusedElement : container.querySelector?.(".sw-fab-trigger");
        disposed = true;
        open = false;
        documentRef.removeEventListener?.("keydown", onMorePanelKeydown);
        documentRef.defaultView?.removeEventListener("resize", positionMore);
        documentRef.defaultView?.visualViewport?.removeEventListener("resize", positionMore);
        documentRef.defaultView?.visualViewport?.removeEventListener("scroll", positionMore);
        if (activeInside && canFocus(fallback)) fallback.focus({preventScroll: true});
        else if (activeInside) documentRef.activeElement?.blur?.();
        root?.remove();
        root = null;
        firstLayerHost = null;
        moreHost = null;
        searchInput = null;
        listHost = null;
        emptyHost = null;
        manageButton = null;
        rows = [];
        digitTargets = [];
        mounted = false;
    }

    function handleKeydown(event) {
        if (event.key === "Escape" && open) {
            event.preventDefault();
            closeMore();
            return;
        }
        if (event.key !== "Tab" || !open || !moreHost) return;
        const focusable = [...moreHost.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
            .filter(canFocus);
        if (focusable.length === 0) return;
        const active = documentRef.activeElement;
        const index = focusable.indexOf(active);
        const next = event.shiftKey
            ? (index <= 0 ? focusable.length - 1 : index - 1)
            : (index < 0 || index === focusable.length - 1 ? 0 : index + 1);
        event.preventDefault();
        focusable[next]?.focus?.();
    }
    container.addEventListener?.("keydown", handleKeydown);

    return {
        mount,
        update,
        openMore,
        closeMore,
        toggleMore: () => (open ? closeMore() : openMore()),
        destroy: () => {
            container.removeEventListener?.("keydown", handleKeydown);
            documentRef.removeEventListener?.("pointerdown", onDocumentPointerDown, true);
            destroy();
        },
        getElement: () => root,
        getFirstLayerActions: () => selectFloatingBallFirstLayer(config, surface, availableActions, options),
        getMoreActions: () => selectFloatingBallMoreActions(config, surface, availableActions, options),
        isMoreOpen: () => open,
    };
}

module.exports = {
    DEFAULT_LABELS,
    collectFloatingBallActions,
    resolveFloatingBallDigitTargets,
    selectFloatingBallMoreActions,
    createFloatingBallPanelController,
    makeFloatingBallMoreAction,
    makeFloatingBallSwitcherAction,
    createQuickActionRegistry,
    FLOATING_BALL_FIRST_LAYER_LIMIT,
};
