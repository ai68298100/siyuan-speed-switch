"use strict";

// The floating ball stores only small, serialisable descriptors.  DOM nodes,
// callbacks and provider instances stay in the host layer.  Keeping this
// module dependency-free (apart from the existing quick-action capability
// helper) makes migration and geometry safe to exercise in isolation.
const {resolveQuickActionSupport} = require("./quick-actions.js");

const FLOATING_BALL_SCHEMA_VERSION = 1;
const FLOATING_BALL_SURFACES = ["desktop", "sidebar", "mobile"];
const FLOATING_BALL_EDGES = ["left", "right"];
const FLOATING_BALL_FIRST_LAYER_LIMIT = 6;
const FLOATING_BALL_ACTION_LIMIT = 64;
const FLOATING_BALL_MORE_ACTION_ID = "__floating-ball-more__";
const FLOATING_BALL_SWITCHER_ACTION_ID = "switcher";
const FLOATING_BALL_SETTINGS_ACTION_ID = "settings";

const DEFAULT_POSITION = {edge: "right", yRatio: 0.72};
const DEFAULT_ACTION_IDS = ["journal", "search", "home", "settings"];

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function bool(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}

function normalizeSurface(value, fallback = "desktop") {
    return FLOATING_BALL_SURFACES.includes(value) ? value : fallback;
}

function normalizeEdge(value, fallback = DEFAULT_POSITION.edge) {
    return FLOATING_BALL_EDGES.includes(value) ? value : fallback;
}

function normalizeYRatio(value, fallback = DEFAULT_POSITION.yRatio) {
    return Math.round(clamp(value, 0, 1, fallback) * 1000000) / 1000000;
}

function normalizeActionId(value) {
    if (typeof value !== "string") return "";
    // IDs are supplied by providers, so retain ':' and '.' while removing
    // control characters and bounding the persisted value.
    return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 128);
}

function createDefaultFloatingBallActions() {
    return DEFAULT_ACTION_IDS.map((actionId, index) => ({
        actionId,
        enabled: true,
        firstLayer: true,
        order: (index + 1) * 10,
    }));
}

function createDefaultFloatingBallConfig() {
    const positions = {};
    const actions = {};
    FLOATING_BALL_SURFACES.forEach((surface) => {
        positions[surface] = {...DEFAULT_POSITION};
        actions[surface] = createDefaultFloatingBallActions();
    });
    return {
        schemaVersion: FLOATING_BALL_SCHEMA_VERSION,
        enabled: {desktop: false, sidebar: false, mobile: false},
        position: positions,
        appearance: {
            size: 48,
            marginPx: 8,
            idleOpacity: 0.4,
            halfHide: true,
            idleDelayMs: 5000,
        },
        behavior: {
            snap: true,
            hideOnScroll: true,
            hideOnFullscreen: true,
            yieldToModals: true,
            touchSlopPx: 8,
        },
        actions,
    };
}

function normalizeFloatingBallPosition(value, fallback = DEFAULT_POSITION) {
    const source = isRecord(value) ? value : {};
    const base = isRecord(fallback) ? fallback : DEFAULT_POSITION;
    return {
        edge: normalizeEdge(source.edge, normalizeEdge(base.edge)),
        yRatio: normalizeYRatio(source.yRatio, normalizeYRatio(base.yRatio)),
        ...(typeof source.xRatio === "number" && Number.isFinite(source.xRatio)
            ? {xRatio: normalizeYRatio(source.xRatio, 0.5)} : {}),
    };
}

function normalizeFloatingBallActionList(value, fallback = createDefaultFloatingBallActions()) {
    if (!Array.isArray(value)) return fallback.map((item) => ({...item}));
    const seen = new Set();
    const result = [];
    value.forEach((raw, index) => {
        if (result.length >= FLOATING_BALL_ACTION_LIMIT) return;
        if (!isRecord(raw)) return;
        const actionId = normalizeActionId(raw.actionId ?? raw.id ?? raw.value);
        if (!actionId || seen.has(actionId)) return;
        seen.add(actionId);
        const order = Number(raw.order);
        result.push({
            actionId,
            enabled: bool(raw.enabled, true),
            firstLayer: bool(raw.firstLayer, false),
            order: Number.isFinite(order) ? order : (index + 1) * 10,
        });
    });
    return result;
}

function normalizeFloatingBallConfig(input, options = {}) {
    const defaults = createDefaultFloatingBallConfig();
    // Settings integrations may pass the full settings object.  Accepting the
    // nested form here makes the migration boundary difficult to misuse.
    const outer = isRecord(input) ? input : {};
    const source = isRecord(outer.floatingBall) ? outer.floatingBall : outer;
    const config = {
        schemaVersion: FLOATING_BALL_SCHEMA_VERSION,
        enabled: {},
        position: {},
        appearance: {},
        behavior: {},
        actions: {},
    };

    const sourceEnabled = isRecord(source.enabled) ? source.enabled : {};
    FLOATING_BALL_SURFACES.forEach((surface) => {
        config.enabled[surface] = bool(sourceEnabled[surface], defaults.enabled[surface]);
    });
    // Sidebar follows desktop for a newly introduced config when no explicit
    // sidebar switch exists.  Once persisted, its value remains independent.
    if (!Object.prototype.hasOwnProperty.call(sourceEnabled, "sidebar")
        && Object.prototype.hasOwnProperty.call(sourceEnabled, "desktop")) {
        config.enabled.sidebar = config.enabled.desktop;
    }
    const legacyFab = typeof options.legacyFabEnabled === "boolean"
        ? options.legacyFabEnabled
        : (typeof outer.fabEnabled === "boolean" ? outer.fabEnabled : null);
    // A schema-less/older floatingBall object is not authoritative yet.  This
    // matters for interrupted writes where `mobile: false` can coexist with
    // the still-valid legacy flag.
    const currentSchema = source.schemaVersion === FLOATING_BALL_SCHEMA_VERSION;
    if (legacyFab !== null && (!currentSchema || !Object.prototype.hasOwnProperty.call(sourceEnabled, "mobile"))) {
        config.enabled.mobile = legacyFab;
    }

    const sourcePosition = isRecord(source.position) ? source.position
        : (isRecord(source.positions) ? source.positions : {});
    FLOATING_BALL_SURFACES.forEach((surface) => {
        config.position[surface] = normalizeFloatingBallPosition(sourcePosition[surface], defaults.position[surface]);
    });

    const appearance = isRecord(source.appearance) ? source.appearance : {};
    config.appearance.size = Math.round(clamp(appearance.size, 44, 64, defaults.appearance.size));
    config.appearance.marginPx = Math.round(clamp(appearance.marginPx, 0, 32, defaults.appearance.marginPx));
    config.appearance.idleOpacity = Math.round(clamp(appearance.idleOpacity, 0.4, 1, defaults.appearance.idleOpacity) * 100) / 100;
    config.appearance.halfHide = bool(appearance.halfHide, defaults.appearance.halfHide);
    config.appearance.idleDelayMs = Math.round(clamp(appearance.idleDelayMs, 3000, 8000, defaults.appearance.idleDelayMs));

    const behavior = isRecord(source.behavior) ? source.behavior : {};
    config.behavior.snap = bool(behavior.snap, defaults.behavior.snap);
    config.behavior.hideOnScroll = bool(behavior.hideOnScroll, defaults.behavior.hideOnScroll);
    config.behavior.hideOnFullscreen = bool(behavior.hideOnFullscreen, defaults.behavior.hideOnFullscreen);
    config.behavior.yieldToModals = bool(behavior.yieldToModals, defaults.behavior.yieldToModals);
    config.behavior.touchSlopPx = Math.round(clamp(behavior.touchSlopPx, 8, 12, defaults.behavior.touchSlopPx));

    const sourceActions = isRecord(source.actions) ? source.actions : {};
    FLOATING_BALL_SURFACES.forEach((surface) => {
        // An explicit empty array is meaningful: the selector will add only
        // its non-destructive safety entries at render time.
        config.actions[surface] = normalizeFloatingBallActionList(
            Object.prototype.hasOwnProperty.call(sourceActions, surface) ? sourceActions[surface] : undefined,
            defaults.actions[surface],
        );
    });
    return config;
}

function sanitizeFloatingBallConfig(value, options = {}) {
    const source = isRecord(value) ? value : {};
    const nested = isRecord(source.floatingBall) ? source.floatingBall : source;
    const config = normalizeFloatingBallConfig(value, options);
    const legacy = typeof options.legacyFabEnabled === "boolean"
        || typeof source.fabEnabled === "boolean"
        || (isRecord(nested.enabled) && nested.schemaVersion !== FLOATING_BALL_SCHEMA_VERSION);
    let changed = false;
    try {
        changed = JSON.stringify(config) !== JSON.stringify(nested);
    } catch {
        changed = true;
    }
    return {config, changed, migrated: legacy || nested.schemaVersion !== FLOATING_BALL_SCHEMA_VERSION};
}

function migrateFloatingBallConfig(value, options = {}) {
    return normalizeFloatingBallConfig(value, options);
}

function positionMetrics(viewport = {}, options = {}) {
    const width = Math.max(0, Number(viewport.width) || 0);
    const height = Math.max(0, Number(viewport.height) || 0);
    const size = clamp(options.size, 44, 128, 48);
    const margin = clamp(options.margin ?? options.edgeMargin, 0, 64, 8);
    const safeTop = Math.max(margin, Number(options.safeTop) || 0);
    const safeBottomInset = Math.max(margin, Number(options.safeBottom) || 0);
    const safeBottom = Math.max(safeTop, height - safeBottomInset);
    const minY = safeTop + size / 2;
    const maxY = Math.max(minY, safeBottom - size / 2);
    return {width, height, size, margin, safeTop, safeBottom, minY, maxY, usableHeight: Math.max(0, maxY - minY)};
}

/**
 * Clamp a persisted or pointer-derived position into the viewport.  `x` and
 * `y` are interpreted as the ball centre when supplied; persisted positions
 * use `edge` and `yRatio` and are independent of viewport pixels.
 */
function clampFloatingBallPosition(position, viewport = {}, options = {}) {
    const source = isRecord(position) ? position : {};
    const metrics = positionMetrics(viewport, options);
    const edge = normalizeEdge(source.edge, Number.isFinite(Number(source.x)) && metrics.width > 0
        ? (Number(source.x) <= metrics.width / 2 ? "left" : "right") : DEFAULT_POSITION.edge);
    const horizontal = typeof source.xRatio === "number" && Number.isFinite(source.xRatio)
        ? {xRatio: normalizeYRatio(source.xRatio, 0.5)} : {};
    if (!metrics.height) return {edge, yRatio: normalizeYRatio(source.yRatio), ...horizontal};
    // Persisted ratios describe the ball centre within the safe vertical
    // travel range. Keep their exact bounded value; pointer-derived y
    // coordinates below are the path that needs pixel clamping.
    if (!Number.isFinite(Number(source.y))) return {edge, yRatio: normalizeYRatio(source.yRatio), ...horizontal};
    const fallbackY = metrics.minY + normalizeYRatio(source.yRatio) * metrics.usableHeight;
    const rawY = Number.isFinite(Number(source.y)) ? Number(source.y) : fallbackY;
    const y = Math.min(metrics.maxY, Math.max(metrics.minY, rawY));
    const denominator = Math.max(1, metrics.usableHeight);
    return {edge, yRatio: normalizeYRatio((y - metrics.minY) / denominator), ...horizontal};
}

/** Snap a pointer position to the nearest horizontal edge, then clamp y. */
function snapFloatingBallPosition(position, viewport = {}, options = {}) {
    const source = isRecord(position) ? position : {};
    const width = Math.max(0, Number(viewport.width) || 0);
    const edge = width > 0 && Number.isFinite(Number(source.x))
        ? (Number(source.x) <= width / 2 ? "left" : "right")
        : normalizeEdge(source.edge);
    return clampFloatingBallPosition({...source, edge, xRatio: undefined}, viewport, options);
}

/** Convert normalized edge/yRatio data to a centre point for rendering. */
function resolveFloatingBallPosition(position, viewport = {}, options = {}) {
    const metrics = positionMetrics(viewport, options);
    const normalized = clampFloatingBallPosition(position, viewport, options);
    const usableHeight = metrics.usableHeight;
    const y = metrics.height
        ? metrics.minY + normalized.yRatio * usableHeight
        : normalized.yRatio;
    const minX = metrics.margin + metrics.size / 2;
    const maxX = Math.max(minX, metrics.width - metrics.margin - metrics.size / 2);
    const x = metrics.width
        ? minX + (maxX - minX) * (normalized.xRatio ?? (normalized.edge === "left" ? 0 : 1))
        : (normalized.edge === "left" ? metrics.margin : 0);
    return {x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, edge: normalized.edge, yRatio: normalized.yRatio};
}

function actionIdOf(action) {
    return normalizeActionId(action?.actionId ?? action?.id ?? action?.value);
}

function findFloatingAction(actions, actionId) {
    const id = normalizeActionId(actionId);
    return (Array.isArray(actions) ? actions : []).find((action) => actionIdOf(action) === id) || null;
}

function resolveFloatingActionAvailability(action, surface, options = {}) {
    const normalizedSurface = normalizeSurface(surface);
    if (!action || action.enabled === false) return {status: "unavailable", reason: "disabled"};
    if (action.available === false) return {status: "unavailable", reason: action.reason || "unavailable"};
    if (typeof options.resolveSupport === "function") {
        const resolved = options.resolveSupport(action, normalizedSurface);
        if (resolved === "supported" || resolved === "unknown" || resolved === "unsupported") {
            return {status: resolved, reason: resolved};
        }
    }
    const status = resolveQuickActionSupport(action.kind, action.value, normalizedSurface,
        action.declaredTargets ?? action.supportedSurfaces ?? action.targets);
    if (status === "supported" || status === "unknown") return {status, reason: status};
    return {status: "unsupported", reason: "unsupported"};
}

function makeFloatingBallMoreAction() {
    return {
        id: FLOATING_BALL_MORE_ACTION_ID,
        actionId: FLOATING_BALL_MORE_ACTION_ID,
        value: "more",
        label: "更多动作",
        icon: "iconMore",
        kind: "more",
        enabled: true,
        firstLayer: true,
        fallback: true,
    };
}

function makeFloatingBallSwitcherAction() {
    return {
        id: FLOATING_BALL_SWITCHER_ACTION_ID,
        actionId: FLOATING_BALL_SWITCHER_ACTION_ID,
        value: "switcher",
        label: "切换",
        icon: "iconLayout",
        kind: "builtin",
        enabled: true,
        firstLayer: true,
        fallback: true,
    };
}

/**
 * Select configured, currently-supported first-layer actions.  The final
 * slot is always the synthetic "more" action.  If no configured action can
 * be rendered, a switcher safety entry is inserted before it.
 */
function selectFloatingBallFirstLayer(config, surface, availableActions = [], options = {}) {
    const normalizedSurface = normalizeSurface(surface);
    const source = isRecord(config) ? config : {};
    const descriptors = Array.isArray(source.actions?.[normalizedSurface])
        ? source.actions[normalizedSurface]
        : (Array.isArray(config) ? config : []);
    const available = Array.isArray(availableActions) ? availableActions : [];
    const max = Math.max(2, Math.min(FLOATING_BALL_FIRST_LAYER_LIMIT, Math.trunc(Number(options.max) || FLOATING_BALL_FIRST_LAYER_LIMIT)));
    const selected = [];
    const seen = new Set();
    descriptors
        .filter((entry) => isRecord(entry) && entry.enabled !== false && entry.firstLayer === true)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .forEach((entry) => {
            if (selected.length >= max - 1) return;
            const action = findFloatingAction(available, entry.actionId);
            if (!action || seen.has(actionIdOf(action))) return;
            const availability = resolveFloatingActionAvailability(action, normalizedSurface, options);
            if (availability.status !== "supported") return;
            seen.add(actionIdOf(action));
            selected.push({...action, actionId: actionIdOf(action), firstLayer: true, availability});
        });
    if (selected.length === 0) {
        const switcher = findFloatingAction(available, FLOATING_BALL_SWITCHER_ACTION_ID);
        if (switcher && resolveFloatingActionAvailability(switcher, normalizedSurface, options).status === "supported") {
            selected.push({...switcher, actionId: actionIdOf(switcher), fallback: true, firstLayer: true});
        } else {
            selected.push(makeFloatingBallSwitcherAction());
        }
    }
    selected.push(makeFloatingBallMoreAction());
    return selected.slice(0, max);
}

/** Resolve the click target, preserving a safe switcher/settings route. */
function resolveFloatingBallClickAction(requested, availableActions = [], surface = "desktop", options = {}) {
    const available = Array.isArray(availableActions) ? availableActions : [];
    const normalizedSurface = normalizeSurface(surface);
    const candidate = isRecord(requested) ? requested : findFloatingAction(available, requested);
    if (candidate && resolveFloatingActionAvailability(candidate, normalizedSurface, options).status === "supported") {
        return {action: candidate, fallback: false, reason: "ready"};
    }
    const switcher = findFloatingAction(available, FLOATING_BALL_SWITCHER_ACTION_ID);
    if (switcher && resolveFloatingActionAvailability(switcher, normalizedSurface, options).status === "supported") {
        return {action: switcher, fallback: true, reason: "switcher"};
    }
    // The ball's primary click contract is deliberately stable: even when a
    // provider has disappeared, it still yields a switcher route rather than
    // silently changing the user's tap into a settings navigation.
    return {action: makeFloatingBallSwitcherAction(), fallback: true, reason: "safe-switcher"};
}

module.exports = {
    FLOATING_BALL_SCHEMA_VERSION,
    FLOATING_BALL_SURFACES,
    FLOATING_BALL_EDGES,
    FLOATING_BALL_FIRST_LAYER_LIMIT,
    FLOATING_BALL_ACTION_LIMIT,
    FLOATING_BALL_MORE_ACTION_ID,
    FLOATING_BALL_SWITCHER_ACTION_ID,
    FLOATING_BALL_SETTINGS_ACTION_ID,
    DEFAULT_ACTION_IDS,
    createDefaultFloatingBallConfig,
    getDefaultFloatingBallConfig: createDefaultFloatingBallConfig,
    normalizeFloatingBallConfig,
    sanitizeFloatingBallConfig,
    migrateFloatingBallConfig,
    normalizeFloatingBallPosition,
    normalizeFloatingBallActionList,
    clampFloatingBallPosition,
    snapFloatingBallPosition,
    resolveFloatingBallPosition,
    resolveFloatingActionAvailability,
    selectFloatingBallFirstLayer,
    selectFirstLayerActions: selectFloatingBallFirstLayer,
    resolveFloatingBallClickAction,
    resolveFloatingBallAction: resolveFloatingBallClickAction,
    makeFloatingBallMoreAction,
    makeFloatingBallSwitcherAction,
};
