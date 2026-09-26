"use strict";

// The floating ball stores only small, serialisable descriptors.  DOM nodes,
// callbacks and provider instances stay in the host layer.  Keeping this
// module dependency-free (apart from the existing quick-action capability
// helper) makes migration and geometry safe to exercise in isolation.
const {resolveQuickActionSupport} = require("./quick-actions.js");
const {normalizeCustomIcon} = require("./util.js");

const FLOATING_BALL_SCHEMA_VERSION = 1;
const FLOATING_BALL_SURFACES = ["desktop", "sidebar", "mobile"];
// ADR 0072：挂载与设置入口仅桌面/移动两端（schema 仍容忍 sidebar 字段）。
const FLOATING_BALL_UI_SURFACES = ["desktop", "mobile"];
const FLOATING_BALL_EDGES = ["left", "right"];
const FLOATING_BALL_FIRST_LAYER_LIMIT = 6;
const FLOATING_BALL_ACTION_LIMIT = 64;
const FLOATING_BALL_DIGIT_SLOT_COUNT = 9;
const FLOATING_BALL_MORE_ACTION_ID = "__floating-ball-more__";
const FLOATING_BALL_SWITCHER_ACTION_ID = "switcher";
const FLOATING_BALL_SETTINGS_ACTION_ID = "settings";

const DEFAULT_POSITION = {edge: "right", yRatio: 0.72};
const DEFAULT_ACTION_IDS = ["journal", "search", "home", "settings"];
const DEFAULT_CLICK_ACTION = "switcher";

function cleanDisplayText(value, max = 80) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function cleanDisplayIcon(value) {
    return normalizeCustomIcon(value) || "";
}

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

function normalizeFloatingBallDigitSlot(value) {
    if (!isRecord(value)) return null;
    const kind = value.kind === "saved-search" ? "saved-search" : value.kind === "action" ? "action" : "";
    if (kind === "action") {
        const actionId = normalizeActionId(value.actionId);
        return actionId ? {kind, actionId} : null;
    }
    if (kind === "saved-search") {
        const searchId = normalizeActionId(value.searchId);
        return searchId ? {kind, searchId} : null;
    }
    return null;
}

function normalizeFloatingBallDigitSlots(value, fallback = {}) {
    const source = isRecord(value) ? value : {};
    const base = isRecord(fallback) ? fallback : {};
    return Object.fromEntries(FLOATING_BALL_SURFACES.map((surface) => {
        const incoming = Array.isArray(source[surface]) ? source[surface] : null;
        const defaults = Array.isArray(base[surface]) ? base[surface] : [];
        const slots = Array.from({length: FLOATING_BALL_DIGIT_SLOT_COUNT}, (_, index) => {
            const raw = incoming ? incoming[index] : defaults[index];
            return normalizeFloatingBallDigitSlot(raw);
        });
        return [surface, slots];
    }));
}

function setFloatingBallDigitSlot(config, surface, index, value) {
    const normalized = normalizeFloatingBallConfig(config);
    if (!FLOATING_BALL_SURFACES.includes(surface)) return normalized;
    const slot = Number(index);
    if (!Number.isInteger(slot) || slot < 0 || slot >= FLOATING_BALL_DIGIT_SLOT_COUNT) return normalized;
    normalized.digitSlots[surface][slot] = normalizeFloatingBallDigitSlot(value);
    return normalized;
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
        clickAction: Object.fromEntries(FLOATING_BALL_SURFACES.map((surface) => [surface, DEFAULT_CLICK_ACTION])),
        behavior: {
            snap: true,
            hideOnScroll: true,
            hideOnFullscreen: true,
            yieldToModals: true,
            touchSlopPx: 8,
            edgeAvoidMobile: false,
            // T-6886（T-6858 第一批）：四向快滑动作绑定（上=更多面板保留 P6 语义）
            flickActions: {up: "more", down: "quick-capture", left: "previous-tab", right: "next-tab"},
        },
        digitSlots: Object.fromEntries(FLOATING_BALL_SURFACES.map((surface) => [surface,
            Array.from({length: FLOATING_BALL_DIGIT_SLOT_COUNT}, () => null)])),
        actions,
        presets: [],
        currentPresetId: "",
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
            ...(cleanDisplayText(raw.label) ? {label: cleanDisplayText(raw.label)} : {}),
            ...(cleanDisplayIcon(raw.icon) ? {icon: cleanDisplayIcon(raw.icon)} : {}),
            ...(raw.mobileOverride === true ? {mobileOverride: true} : {}),
        });
    });
    return result;
}

// ==================== T-6803 场景预设（命名动作布局快照） ====================
// 场景 = {点击动作 + 各端动作列表} 的命名快照；外观/行为不进入场景
// （它们是全局观感，不是场景差异）。有界：最多 8 个，同名覆盖。

const FLOATING_BALL_PRESET_MAX = 8;
const FLOATING_BALL_PRESET_NAME_MAX = 24;

function normalizeFloatingBallPresets(value, max = FLOATING_BALL_PRESET_MAX) {
    const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : FLOATING_BALL_PRESET_MAX;
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const presets = [];
    for (const raw of value) {
        if (presets.length >= cap) break;
        if (!isRecord(raw)) continue;
        const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 64) : "";
        const name = typeof raw.name === "string" ? raw.name.trim().slice(0, FLOATING_BALL_PRESET_NAME_MAX) : "";
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        const sourceActions = isRecord(raw.actions) ? raw.actions : {};
        const sourceClick = isRecord(raw.clickAction) ? raw.clickAction : {};
        presets.push({
            id,
            name,
            savedAt: Number.isFinite(raw.savedAt) && raw.savedAt > 0 ? raw.savedAt : 0,
            clickAction: Object.fromEntries(FLOATING_BALL_SURFACES.map((surface) => [surface,
                normalizeActionId(sourceClick[surface]) || DEFAULT_CLICK_ACTION])),
            actions: Object.fromEntries(FLOATING_BALL_SURFACES.map((surface) => [surface,
                normalizeFloatingBallActionList(sourceActions[surface], [])])),
        });
    }
    return presets;
}

function saveFloatingBallPreset(config, name, now = Date.now()) {
    const source = normalizeFloatingBallConfig(config);
    const cleanName = typeof name === "string" ? name.trim().slice(0, FLOATING_BALL_PRESET_NAME_MAX) : "";
    if (!cleanName) return {config: source, preset: null};
    const presets = normalizeFloatingBallPresets(source.presets);
    const stamp = Math.floor(Number(now) || Date.now());
    const existing = presets.find((preset) => preset.name === cleanName);
    const snapshotActions = (surface) => source.actions[surface].map((item) => ({...item}));
    const preset = {
        id: existing ? existing.id : `preset-${stamp}`,
        name: cleanName,
        savedAt: stamp,
        clickAction: {desktop: source.clickAction.desktop, mobile: source.clickAction.mobile},
        actions: {desktop: snapshotActions("desktop"), mobile: snapshotActions("mobile")},
    };
    const next = existing
        ? presets.map((item) => (item.id === existing.id ? preset : item))
        : [...presets, preset].slice(-FLOATING_BALL_PRESET_MAX);
    return {config: {...source, presets: next}, preset};
}

function applyFloatingBallPreset(config, presetId) {
    const source = normalizeFloatingBallConfig(config);
    const preset = normalizeFloatingBallPresets(source.presets).find((item) => item.id === presetId);
    if (!preset) return {config: source, preset: null};
    const next = {
        ...source,
        clickAction: {...preset.clickAction},
        actions: {
            desktop: preset.actions.desktop.map((item) => ({...item})),
            mobile: preset.actions.mobile.map((item) => ({...item})),
        },
        currentPresetId: preset.id,
    };
    return {config: next, preset};
}

function removeFloatingBallPreset(config, presetId) {
    const source = normalizeFloatingBallConfig(config);
    const presets = normalizeFloatingBallPresets(source.presets).filter((item) => item.id !== presetId);
    const currentPresetId = source.currentPresetId === presetId ? "" : source.currentPresetId;
    return {config: {...source, presets, currentPresetId}, removed: true};
}

function pickNextFloatingBallPreset(presets, currentPresetId) {
    const list = normalizeFloatingBallPresets(presets);
    if (list.length < 2) return null;
    const index = list.findIndex((item) => item.id === currentPresetId);
    return list[(index + 1 + list.length) % list.length] || list[0];
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
        clickAction: {},
        behavior: {},
        digitSlots: {},
        actions: {},
        presets: [],
        currentPresetId: "",
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

    const sourceClickAction = isRecord(source.clickAction) ? source.clickAction : {};
    FLOATING_BALL_SURFACES.forEach((surface) => {
        config.clickAction[surface] = normalizeActionId(sourceClickAction[surface]) || defaults.clickAction[surface];
    });

    const behavior = isRecord(source.behavior) ? source.behavior : {};
    config.behavior.snap = bool(behavior.snap, defaults.behavior.snap);
    config.behavior.hideOnScroll = bool(behavior.hideOnScroll, defaults.behavior.hideOnScroll);
    config.behavior.hideOnFullscreen = bool(behavior.hideOnFullscreen, defaults.behavior.hideOnFullscreen);
    config.behavior.yieldToModals = bool(behavior.yieldToModals, defaults.behavior.yieldToModals);
    // T-6784/P6 手机端离边停靠：球体离开边缘 12px 侧滑激活条（默认关）
    config.behavior.edgeAvoidMobile = bool(behavior.edgeAvoidMobile, defaults.behavior.edgeAvoidMobile === true);
    config.behavior.touchSlopPx = Math.round(clamp(behavior.touchSlopPx, 8, 12, defaults.behavior.touchSlopPx));
    // T-6886（T-6858 第一批）：四向快滑动作绑定归一化——每方向有界字符串（≤48），
    // 缺失回落默认；未知动作值留待执行时按不可用处理（目录是动态的，归一化不猜）。
    const flickSource = isRecord(behavior.flickActions) ? behavior.flickActions : {};
    const flickDefaults = defaults.behavior && defaults.behavior.flickActions ? defaults.behavior.flickActions : {};
    config.behavior.flickActions = ["up", "down", "left", "right"].reduce((acc, direction) => {
        const raw = flickSource[direction];
        acc[direction] = typeof raw === "string"
            ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 48)
            : String(flickDefaults[direction] || "");
        return acc;
    }, {up: "", down: "", left: "", right: ""});

    const sourceActions = isRecord(source.actions) ? source.actions : {};
    FLOATING_BALL_SURFACES.forEach((surface) => {
        // An explicit empty array is meaningful: the selector will add only
        // its non-destructive safety entries at render time.
        config.actions[surface] = normalizeFloatingBallActionList(
            Object.prototype.hasOwnProperty.call(sourceActions, surface) ? sourceActions[surface] : undefined,
            defaults.actions[surface],
        );
    });
    config.digitSlots = normalizeFloatingBallDigitSlots(source.digitSlots, defaults.digitSlots);
    // T-6803 场景预设：命名保存的动作布局快照（含端侧主点击）。有界、
    // 可选字段；旧版本读到此字段会安全忽略，新版本对旧数据补空数组。
    config.presets = normalizeFloatingBallPresets(source.presets);
    config.currentPresetId = typeof source.currentPresetId === "string"
        ? source.currentPresetId.trim().slice(0, 64) : "";
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

function applyFloatingBallActionPresentation(action, descriptor) {
    if (!action || !descriptor) return action;
    return {
        ...action,
        ...(cleanDisplayText(descriptor.label) ? {label: cleanDisplayText(descriptor.label), labelOverride: cleanDisplayText(descriptor.label)} : {}),
        ...(cleanDisplayIcon(descriptor.icon) ? {icon: cleanDisplayIcon(descriptor.icon)} : {}),
        ...(descriptor.mobileOverride === true ? {mobileOverride: true} : {}),
    };
}

function resolveFloatingActionAvailability(action, surface, options = {}) {
    const normalizedSurface = normalizeSurface(surface);
    if (!action || action.enabled === false) return {status: "unavailable", reason: "disabled"};
    if (action.available === false) return {status: "unavailable", reason: action.reason || "unavailable"};
    let status;
    if (typeof options.resolveSupport === "function") {
        const resolved = options.resolveSupport(action, normalizedSurface);
        if (resolved === "supported" || resolved === "unknown" || resolved === "unsupported") {
            status = resolved;
        }
    }
    status = status || resolveQuickActionSupport(action.kind, action.value, normalizedSurface,
        action.kind === "command" ? action.declaredTargets : (action.declaredTargets ?? action.supportedSurfaces ?? action.targets));
    if (status === "unknown" && normalizedSurface === "mobile" && action.mobileOverride === true) {
        return {status: "supported", reason: "manual-mobile-override"};
    }
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
            const presented = applyFloatingBallActionPresentation(action, entry);
            const availability = resolveFloatingActionAvailability(presented, normalizedSurface, options);
            if (availability.status !== "supported") return;
            seen.add(actionIdOf(action));
            selected.push({...presented, actionId: actionIdOf(action), firstLayer: true, availability});
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
    const raw = isRecord(requested) ? requested : findFloatingAction(available, requested);
    const candidate = applyFloatingBallActionPresentation(raw, options.descriptor);
    if (candidate && options.descriptor?.enabled !== false
        && resolveFloatingActionAvailability(candidate, normalizedSurface, options).status === "supported") {
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

// T-6886（T-6858 第一批）：四向快滑方向分类——主轴位移 ≥24px 且严格大于横轴、
// 横轴 ≤12px、主轴速度 ≥0.5px/ms；不满足返回 ""（不够格不猜方向）。
// 上方向即 P6 上滑呼出的既有判定（dy≤-24、|dx|≤12、dy/dt≤-0.5 的超集等价）。
function classifyFlickDirection(dx, dy, dt) {
    const time = Number(dt);
    if (!Number.isFinite(time) || time <= 0) return "";
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return "";
    if (Math.abs(dy) >= 24 && Math.abs(dy) > Math.abs(dx)) {
        const speed = dy / time;
        if (speed <= -0.5) return "up";
        if (speed >= 0.5) return "down";
        return "";
    }
    if (Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy)) {
        const speed = dx / time;
        if (speed <= -0.5) return "left";
        if (speed >= 0.5) return "right";
        return "";
    }
    return "";
}

module.exports = {
    FLOATING_BALL_SCHEMA_VERSION,
    FLOATING_BALL_SURFACES,
    FLOATING_BALL_PRESET_MAX,
    // ADR 0072: the sidebar portal is withdrawn from the product (it overlapped
    // the desktop-window ball on the same host window). The schema-level
    // FLOATING_BALL_SURFACES above still normalizes legacy sidebar fields so
    // old configs and imports stay valid; only mounting and settings entry
    // shrink to these two surfaces.
    FLOATING_BALL_UI_SURFACES,
    FLOATING_BALL_EDGES,
    FLOATING_BALL_FIRST_LAYER_LIMIT,
    FLOATING_BALL_ACTION_LIMIT,
    FLOATING_BALL_MORE_ACTION_ID,
    FLOATING_BALL_SWITCHER_ACTION_ID,
    FLOATING_BALL_SETTINGS_ACTION_ID,
    FLOATING_BALL_DIGIT_SLOT_COUNT,
    DEFAULT_ACTION_IDS,
    createDefaultFloatingBallConfig,
    getDefaultFloatingBallConfig: createDefaultFloatingBallConfig,
    normalizeFloatingBallConfig,
    sanitizeFloatingBallConfig,
    migrateFloatingBallConfig,
    normalizeFloatingBallPosition,
    normalizeFloatingBallActionList,
    normalizeFloatingBallDigitSlot,
    normalizeFloatingBallDigitSlots,
    setFloatingBallDigitSlot,
    clampFloatingBallPosition,
    snapFloatingBallPosition,
    resolveFloatingBallPosition,
    resolveFloatingActionAvailability,
    selectFloatingBallFirstLayer,
    selectFirstLayerActions: selectFloatingBallFirstLayer,
    resolveFloatingBallClickAction,
    classifyFlickDirection,
    resolveFloatingBallAction: resolveFloatingBallClickAction,
    normalizeFloatingBallPresets,
    saveFloatingBallPreset,
    applyFloatingBallPreset,
    removeFloatingBallPreset,
    pickNextFloatingBallPreset,
    applyFloatingBallActionPresentation,
    DEFAULT_CLICK_ACTION,
    makeFloatingBallMoreAction,
    makeFloatingBallSwitcherAction,
};
