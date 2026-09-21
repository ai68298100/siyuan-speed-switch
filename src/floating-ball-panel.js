"use strict";

// B2 action panel boundary.  The floating-ball lifecycle controller owns the
// portal and pointer gestures; this module owns only action selection and the
// small first-layer/more-actions DOM subtree.  Keeping the two boundaries
// independent makes the panel usable by desktop, sidebar and mobile hosts.
const {FLOATING_BALL_MORE_ACTION_ID, FLOATING_BALL_FIRST_LAYER_LIMIT} = require("./floating-ball-model.js");
const {getBuiltinQuickActions, createQuickActionRegistry} = require("./quick-actions.js");
const {
    normalizeFloatingBallConfig,
    resolveFloatingActionAvailability,
    selectFloatingBallFirstLayer,
    makeFloatingBallMoreAction,
    makeFloatingBallSwitcherAction,
} = require("./floating-ball-model.js");

const DEFAULT_LABELS = Object.freeze({
    more: "更多动作",
    close: "关闭",
    unavailable: "当前端不可用",
    empty: "暂无可用动作",
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
    const id = actionIdOf(action);
    const value = typeof action?.value === "string" ? action.value.trim() : "";
    const maps = [];
    if (action?.kind === "builtin") {
        maps.push(options.builtinLabels, labels.builtins);
    }
    maps.push(options.actionLabels, labels.actions, options.fallbackLabels, labels.fallbacks);
    maps.push(labels);
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

function descriptorForAction(entries, action) {
    const id = actionIdOf(action);
    return entries.find((entry) => actionIdOf(entry) === id) || null;
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
        .filter((entry) => entry.enabled !== false && !firstIds.has(actionIdOf(entry)))
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
            const availability = action.providerMissing
                ? {status: "unknown", reason: "provider-missing"}
                : resolveFloatingActionAvailability(action, normalizedSurface, options);
            if (availability.status === "unsupported" || availability.status === "unavailable") return;
            seen.add(id);
            const normalized = normalizeAction(action);
            result.push({...normalized, actionId: id, availability, firstLayer: false});
        });
    // If a caller supplies provider actions not persisted yet, keep them out
    // of the panel. The settings picker remains the explicit registration
    // route, avoiding a surprise action on first render.
    return result;
}

function safeIconId(raw, fallback = "iconPlugin") {
    const value = typeof raw === "string" ? raw.trim() : "";
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value) ? value : fallback;
}

function appendActionIcon(documentRef, host, action) {
    const icon = safeIconId(action?.icon);
    const svg = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = documentRef.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${icon}`);
    use.setAttribute("xlink:href", `#${icon}`);
    svg.appendChild(use);
    host.appendChild(svg);
}

function makeActionButton(documentRef, action, onActivate, labels, extraClass = "") {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = `sw__floating-ball-action ${extraClass}`.trim();
    button.dataset.actionId = actionIdOf(action);
    button.setAttribute("aria-label", action.label);
    button.title = action.availability?.status === "unknown"
        ? `${action.label}（${labels.unavailable}）` : action.label;
    const iconHost = documentRef.createElement("span");
    iconHost.className = "sw__floating-ball-action-icon";
    appendActionIcon(documentRef, iconHost, action);
    const label = documentRef.createElement("span");
    label.className = "sw__floating-ball-action-label";
    label.textContent = action.label;
    button.append(iconHost, label);
    if (action.availability?.status === "unknown") {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.classList.add("is-unavailable");
    } else {
        button.addEventListener("click", () => onActivate(action));
    }
    return button;
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
    let lastFocusedElement = null;
    let lastFocusedActionId = null;
    let config = options.config;
    let surface = options.surface || "desktop";
    let availableActions = collectFloatingBallActions(options);
    const labels = {...DEFAULT_LABELS, ...(options.labels || {})};
    const onAction = typeof options.onAction === "function" ? options.onAction : () => undefined;

    const onDocumentPointerDown = (event) => {
        if (!open || !root) return;
        const target = event.target;
        if (target && root.contains(target)) return;
        closeMore();
    };
    documentRef.addEventListener?.("pointerdown", onDocumentPointerDown, true);

    function render() {
        if (disposed || !root || !firstLayerHost || !moreHost) return;
        // Avoid replaceChildren(): older embedded Android WebViews used by
        // SiYuan may not expose it even though append/remove are available.
        while (firstLayerHost.firstChild) firstLayerHost.removeChild(firstLayerHost.firstChild);
        while (moreHost.firstChild) moreHost.removeChild(moreHost.firstChild);
        const firstLayer = selectFloatingBallFirstLayer(config, surface, availableActions, options);
        firstLayer.forEach((action) => {
            const className = action.actionId === FLOATING_BALL_MORE_ACTION_ID ? "is-more" : "";
            const button = makeActionButton(documentRef, action, (item) => {
                if (item.actionId === FLOATING_BALL_MORE_ACTION_ID) {
                    openMore();
                    return;
                }
                onAction(item);
            }, labels, className);
            if (action.actionId === FLOATING_BALL_MORE_ACTION_ID) {
                button.setAttribute("aria-haspopup", "dialog");
                button.setAttribute("aria-expanded", String(open));
            }
            firstLayerHost.appendChild(button);
        });
        const moreActions = selectFloatingBallMoreActions(config, surface, availableActions, options);
        const heading = documentRef.createElement("div");
        heading.className = "sw__floating-ball-more-heading";
        heading.textContent = labels.more;
        const close = documentRef.createElement("button");
        close.type = "button";
        close.className = "sw__floating-ball-more-close";
        close.setAttribute("aria-label", labels.close);
        close.textContent = "×";
        close.addEventListener("click", closeMore);
        heading.appendChild(close);
        moreHost.appendChild(heading);
        if (moreActions.length === 0) {
            const empty = documentRef.createElement("p");
            empty.className = "sw__floating-ball-more-empty";
            empty.setAttribute("role", "status");
            empty.textContent = labels.empty;
            moreHost.appendChild(empty);
        } else {
            const list = documentRef.createElement("div");
            list.className = "sw__floating-ball-more-list";
            moreActions.forEach((action) => list.appendChild(makeActionButton(documentRef, action, (item) => {
                onAction(item);
                closeMore();
            }, labels, "is-more-item")));
            moreHost.appendChild(list);
        }
        moreHost.hidden = !open;
        moreHost.setAttribute("aria-hidden", String(!open));
        const moreButton = firstLayerHost.querySelector(`[data-action-id="${FLOATING_BALL_MORE_ACTION_ID}"]`);
        moreButton?.setAttribute("aria-expanded", String(open));
    }

    function focusMoreEntry() {
        if (!open || !moreHost) return;
        const target = moreHost.querySelector("button:not([disabled])");
        target?.focus?.();
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
        root.append(firstLayerHost, moreHost);
        container.appendChild(root);
        mounted = true;
        render();
        return root;
    }

    function openMore() {
        if (disposed) return;
        if (!mounted) mount();
        if (!open) {
            const active = documentRef.activeElement;
            const fallback = firstLayerHost?.querySelector(`[data-action-id="${FLOATING_BALL_MORE_ACTION_ID}"]`);
            lastFocusedElement = active && root?.contains(active) ? active : fallback;
            lastFocusedActionId = lastFocusedElement?.getAttribute?.("data-action-id") || FLOATING_BALL_MORE_ACTION_ID;
        }
        open = true;
        render();
        focusMoreEntry();
        options.onOpenMore?.();
    }

    function closeMore() {
        if (disposed) return;
        const restore = lastFocusedElement;
        open = false;
        render();
        options.onCloseMore?.();
        let focusTarget = restore && restore.isConnected && !moreHost?.contains(restore) ? restore : null;
        if (!focusTarget && lastFocusedActionId && firstLayerHost) {
            focusTarget = [...firstLayerHost.querySelectorAll("[data-action-id]")]
                .find((item) => item.getAttribute("data-action-id") === lastFocusedActionId) || null;
        }
        focusTarget?.focus?.({preventScroll: true});
        lastFocusedElement = null;
        lastFocusedActionId = null;
    }

    function update(patch = {}) {
        if (disposed) return;
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
        disposed = true;
        root?.remove();
        root = null;
        firstLayerHost = null;
        moreHost = null;
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
            .filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-hidden") !== "true");
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
    selectFloatingBallMoreActions,
    createFloatingBallPanelController,
    makeFloatingBallMoreAction,
    makeFloatingBallSwitcherAction,
    createQuickActionRegistry,
    FLOATING_BALL_FIRST_LAYER_LIMIT,
};
