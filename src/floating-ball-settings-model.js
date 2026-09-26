"use strict";

// Pure settings helpers for the floating-ball editor.  The editor deliberately
// stores only descriptors and delegates action metadata/capabilities to the
// quick-action registry.  Keeping this module DOM-free makes import, restore
// and migration safe to test in both Node and the host WebView.
const {
    FLOATING_BALL_SCHEMA_VERSION,
    FLOATING_BALL_SURFACES,
    createDefaultFloatingBallConfig,
    normalizeFloatingBallConfig,
    normalizeFloatingBallActionList,
    normalizeFloatingBallDigitSlot,
    resolveFloatingActionAvailability,
} = require("./floating-ball-model.js");
const {sanitizeQuickActions, getDefaultQuickActions} = require("./quick-actions.js");

const FLOATING_BALL_SETTINGS_SCHEMA_VERSION = 1;
const FLOATING_BALL_SETTINGS_MAX_BYTES = 512 * 1024;
const SURFACES = new Set(FLOATING_BALL_SURFACES);

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function surfaceOf(value) {
    return SURFACES.has(value) ? value : null;
}

function clone(value) {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function byteLength(value) {
    const text = String(value);
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    // WebView versions without TextEncoder are still covered by this UTF-8
    // approximation.  encodeURIComponent throws only for malformed surrogates;
    // replace those with the Unicode replacement character in that case.
    try {
        return unescape(encodeURIComponent(text)).length; // eslint-disable-line no-undef
    } catch {
        return unescape(encodeURIComponent(text.replace(/[\uD800-\uDFFF]/g, "�"))).length; // eslint-disable-line no-undef
    }
}

function normalizeSurfaceActions(config, surface) {
    const normalized = normalizeFloatingBallConfig(config);
    const target = surfaceOf(surface);
    if (!target) return [];
    return normalized.actions[target].map((item, index) => ({
        ...item,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
        __sourceIndex: index,
    })).sort((left, right) => left.order - right.order || left.__sourceIndex - right.__sourceIndex)
        .map(({__sourceIndex, ...item}) => item);
}

function withSurfaceActions(config, surface, actions) {
    const normalized = normalizeFloatingBallConfig(config);
    const target = surfaceOf(surface);
    if (!target) return normalized;
    normalized.actions[target] = normalizeFloatingBallActionList(actions, []);
    normalized.actions[target].forEach((item, index) => { item.order = (index + 1) * 10; });
    return normalized;
}

/** Update a configured action while preserving unknown provider metadata. */
function updateFloatingBallAction(config, surface, actionId, patch = {}) {
    const target = surfaceOf(surface);
    const id = typeof actionId === "string" ? actionId.trim() : "";
    if (!id) return normalizeFloatingBallConfig(config);
    const actions = normalizeSurfaceActions(config, target);
    const next = actions.map((entry) => entry.actionId === id
        ? {
            ...entry,
            ...(isRecord(patch) ? patch : {}),
            actionId: entry.actionId,
            enabled: typeof patch?.enabled === "boolean" ? patch.enabled : entry.enabled,
            firstLayer: typeof patch?.firstLayer === "boolean" ? patch.firstLayer : entry.firstLayer,
        }
        : entry);
    return withSurfaceActions(config, target, next);
}

/** Move one action by a bounded delta and rewrite stable order values. */
function moveFloatingBallAction(config, surface, actionId, delta) {
    const target = surfaceOf(surface);
    const actions = normalizeSurfaceActions(config, target);
    const from = actions.findIndex((entry) => entry.actionId === actionId);
    if (from < 0) return normalizeFloatingBallConfig(config);
    const amount = Math.trunc(Number(delta));
    const to = Math.max(0, Math.min(actions.length - 1, from + (Number.isFinite(amount) ? amount : 0)));
    if (from !== to) {
        const [entry] = actions.splice(from, 1);
        actions.splice(to, 0, entry);
    }
    return withSurfaceActions(config, target, actions);
}

function removeFloatingBallAction(config, surface, actionId) {
    const target = surfaceOf(surface);
    const actions = normalizeSurfaceActions(config, target).filter((entry) => entry.actionId !== actionId);
    return withSurfaceActions(config, target, actions);
}

/** Replace only one surface's actions with the current safe default preset. */
function restoreFloatingBallDefaults(config, surface) {
    const target = surfaceOf(surface);
    const defaults = createDefaultFloatingBallConfig();
    return withSurfaceActions(config, target, defaults.actions[target]);
}

function actionIdOf(action) {
    return typeof action?.id === "string" && action.id.trim()
        ? action.id.trim()
        : (typeof action?.actionId === "string" ? action.actionId.trim() : "");
}

/**
 * Join descriptors with the registry snapshot for rendering the settings
 * rows. Missing actions remain visible as unavailable instead of being
 * silently deleted; this lets a provider recover after it is loaded again.
 */
function buildFloatingBallSettingsRows(config, surface, catalog = [], options = {}) {
    const target = surfaceOf(surface);
    if (!target) return [];
    const descriptors = normalizeSurfaceActions(config, target);
    const byId = new Map((Array.isArray(catalog) ? catalog : [])
        .map((action) => [actionIdOf(action), action])
        .filter(([id]) => Boolean(id)));
    const rows = descriptors.map((descriptor) => {
        const action = byId.get(descriptor.actionId) || null;
        const availability = action
            ? resolveFloatingActionAvailability(
                descriptor.mobileOverride === true ? {...action, mobileOverride: true} : action,
                target,
                options,
            )
            : {status: "unavailable", reason: "not-loaded"};
        const displayAvailability = descriptor.mobileOverride === true && target === "mobile"
            && availability.reason === "manual-mobile-override"
            ? {status: "unknown", reason: "manual-mobile-override"}
            : availability;
        return {
            actionId: descriptor.actionId,
            descriptor: {...descriptor},
            action: action ? {...action} : null,
            label: descriptor.label || action?.label || descriptor.actionId,
            icon: descriptor.icon || action?.icon || "iconHelp",
            kind: action?.kind || "unknown",
            status: displayAvailability.status,
            reason: displayAvailability.reason,
            enabled: descriptor.enabled,
            firstLayer: descriptor.firstLayer,
            mobileOverride: descriptor.mobileOverride === true,
            order: descriptor.order,
        };
    });
    // Catalog entries not yet configured are useful in the editor's add list,
    // but are deliberately not included in rows (the row list is persisted
    // state; callers can render `options.available` from the catalog).
    // `normalizeSurfaceActions` already provides a stable order tie-breaker
    // based on persisted position. Do not sort by action ID here: doing so
    // would make the rows disagree with the exact sequence used by move().
    return rows;
}

function exportFloatingBallSettings(config, quickActions = []) {
    const normalized = normalizeFloatingBallConfig(config);
    const sanitizedQuickActions = sanitizeQuickActions(quickActions, 12).items;
    // Position is intentionally omitted: it is viewport-specific and must not
    // jump when a user imports the file on another device/window.
    return {
        schemaVersion: FLOATING_BALL_SETTINGS_SCHEMA_VERSION,
        quickActions: clone(sanitizedQuickActions),
        floatingBall: {
            schemaVersion: FLOATING_BALL_SCHEMA_VERSION,
            enabled: clone(normalized.enabled),
            appearance: clone(normalized.appearance),
            clickAction: clone(normalized.clickAction),
            behavior: clone(normalized.behavior),
            digitSlots: clone(normalized.digitSlots),
            actions: clone(normalized.actions),
        },
    };
}

function serializeFloatingBallSettings(config, quickActions = []) {
    return JSON.stringify(exportFloatingBallSettings(config, quickActions), null, 2);
}

/**
 * Check the complete export envelope before a settings editor commits a large
 * icon or label.  The import limit applies to the combined quick-action and
 * floating-ball payload, so checking only one action would let a later import
 * fail after the UI already reported success.
 */
function checkFloatingBallSettingsBudget(config, quickActions = []) {
    try {
        const serialized = serializeFloatingBallSettings(config, quickActions);
        const bytes = byteLength(serialized);
        return {ok: bytes <= FLOATING_BALL_SETTINGS_MAX_BYTES, bytes, maxBytes: FLOATING_BALL_SETTINGS_MAX_BYTES};
    } catch {
        return {ok: false, bytes: Number.POSITIVE_INFINITY, maxBytes: FLOATING_BALL_SETTINGS_MAX_BYTES};
    }
}

function currentImportState(currentConfig, currentQuickActions) {
    let config;
    try {
        config = normalizeFloatingBallConfig(currentConfig);
    } catch {
        config = createDefaultFloatingBallConfig();
    }
    let quickActions;
    try {
        quickActions = sanitizeQuickActions(
            Array.isArray(currentQuickActions) ? currentQuickActions : getDefaultQuickActions(),
            12,
        ).items;
    } catch {
        // A corrupt current snapshot must never make an import throw.  The
        // failed import result remains safe and leaves the host's persisted
        // value untouched; the next settings read will perform normal repair.
        quickActions = [];
    }
    return {config, quickActions};
}

function parseSchemaVersion(value, max = FLOATING_BALL_SETTINGS_SCHEMA_VERSION) {
    // Missing versions are the explicitly supported v0 migration shape. Once
    // a version key is present it must be a finite integer, never a numeric
    // string, decimal, negative value, or future version.
    if (value === undefined) return {ok: true, version: 0, missing: true};
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
        return {ok: false, version: null, missing: false};
    }
    return {ok: true, version: value, missing: false};
}

function hasFloatingBallPayload(value) {
    if (!isRecord(value)) return false;
    const defaults = createDefaultFloatingBallConfig();
    return ["enabled", "appearance", "clickAction", "behavior", "digitSlots", "actions"].some((section) => isRecord(value[section])
        && Object.keys(defaults[section]).some((key) => Object.prototype.hasOwnProperty.call(value[section], key)));
}

function validFloatingBallSections(value) {
    const defaults = createDefaultFloatingBallConfig();
    return ["enabled", "appearance", "clickAction", "behavior", "digitSlots", "actions"].every((section) => {
        if (!Object.prototype.hasOwnProperty.call(value, section)) return true;
        const supplied = value[section];
        if (!isRecord(supplied)) return false;
        if (section === "digitSlots") {
            // A slot array is a bounded positional list. Null explicitly
            // clears a slot; every non-null entry must be a descriptor the
            // model can retain. Reject malformed entries before normalization
            // so a bad import cannot silently erase a neighboring binding.
            return Object.keys(supplied).every((surface) => {
                if (!Object.prototype.hasOwnProperty.call(defaults.digitSlots, surface)) return true;
                const slots = supplied[surface];
                if (!Array.isArray(slots)) return false;
                return slots.every((slot) => slot === null || normalizeFloatingBallDigitSlot(slot));
            });
        }
        return Object.keys(defaults[section]).every((key) => {
            if (!Object.prototype.hasOwnProperty.call(supplied, key)) return true;
            if (section === "actions") {
                if (!Array.isArray(supplied[key])) return false;
                // Explicit [] clears one surface; a nonempty list containing
                // no valid descriptor is malformed, not a request to erase it.
                return supplied[key].length === 0 || normalizeFloatingBallActionList(supplied[key], []).length > 0;
            }
            const expectedType = typeof defaults[section][key];
            return typeof supplied[key] === expectedType
                && (expectedType !== "number" || Number.isFinite(supplied[key]));
        });
    });
}

/**
 * Parse and validate an exported settings file.  On every failure the return
 * value contains the normalized current state, so callers can assign the
 * result without accidentally wiping settings.
 */
function importFloatingBallSettings(input, currentConfig, currentQuickActions = []) {
    const current = currentImportState(currentConfig, currentQuickActions);
    let parsed = input;
    if (typeof input === "string") {
        if (byteLength(input) > FLOATING_BALL_SETTINGS_MAX_BYTES) {
            return {ok: false, reason: "too-large", ...current, migrated: false};
        }
        try { parsed = JSON.parse(input); } catch {
            return {ok: false, reason: "invalid-json", ...current, migrated: false};
        }
    } else {
        // Callers in tests and host adapters may already have parsed JSON.
        // Apply the same byte budget before accepting that representation; a
        // file-size check alone would otherwise be bypassed by a large object.
        try {
            if (byteLength(JSON.stringify(input)) > FLOATING_BALL_SETTINGS_MAX_BYTES) {
                return {ok: false, reason: "too-large", ...current, migrated: false};
            }
        } catch {
            return {ok: false, reason: "invalid-shape", ...current, migrated: false};
        }
    }
    // The legacy quick-action transfer exported a bare array. Keep accepting it
    // for backwards compatibility while leaving floating-ball state untouched.
    if (Array.isArray(parsed)) {
        const quick = sanitizeQuickActions(parsed, 12);
        if (!quick.items.length && parsed.length > 0) return {ok: false, reason: "invalid-actions", ...current, migrated: false};
        return {ok: true, reason: "legacy-quick-actions", config: current.config, quickActions: quick.items, migrated: true};
    }
    if (!isRecord(parsed)) return {ok: false, reason: "invalid-shape", ...current, migrated: false};
    const topSchema = parseSchemaVersion(parsed.schemaVersion);
    if (!topSchema.ok) return {ok: false, reason: "invalid-schema", ...current, migrated: false};
    const hasFloatingBallKey = Object.prototype.hasOwnProperty.call(parsed, "floatingBall");
    if (hasFloatingBallKey && !isRecord(parsed.floatingBall)) {
        return {ok: false, reason: "invalid-floating-ball", ...current, migrated: false};
    }
    const importedBall = hasFloatingBallKey ? parsed.floatingBall : null;
    const hasQuick = Object.prototype.hasOwnProperty.call(parsed, "quickActions");
    if (hasQuick && !Array.isArray(parsed.quickActions)) {
        return {ok: false, reason: "invalid-actions", ...current, migrated: false};
    }
    const nestedSchema = importedBall ? parseSchemaVersion(importedBall.schemaVersion) : null;
    if (nestedSchema && !nestedSchema.ok) return {ok: false, reason: "invalid-schema", ...current, migrated: false};
    if (importedBall && !validFloatingBallSections(importedBall)) {
        return {ok: false, reason: "invalid-floating-ball", ...current, migrated: false};
    }
    // Object envelopes must carry at least one valid section. This rejects {}
    // and schema-only objects, but intentionally accepts partial imports such
    // as `{floatingBall:{enabled:{desktop:true}}}` or `{quickActions:[]}`.
    if (importedBall && !hasFloatingBallPayload(importedBall)) {
        return {ok: false, reason: "invalid-envelope", ...current, migrated: false};
    }
    if (!importedBall && !hasQuick) {
        return {ok: false, reason: "invalid-envelope", ...current, migrated: false};
    }
    // Partial imports merge only explicitly present supported keys, preserving
    // all omitted sections/fields and other surfaces. Per-surface action arrays
    // replace that surface (including explicit []); quickActions replaces only
    // when its key is present. Normalization still strips unknown keys/clamps.
    const merge = {...current.config};
    if (importedBall) {
        ["enabled", "appearance", "clickAction", "behavior", "digitSlots", "actions"].forEach((section) => {
            merge[section] = {...current.config[section], ...importedBall[section]};
        });
    }
    const imported = normalizeFloatingBallConfig(merge);
    // Keep viewport-specific positions from the active device.  This also
    // protects against older exports that accidentally included `position`.
    imported.position = clone(current.config.position);
    const quick = hasQuick ? sanitizeQuickActions(parsed.quickActions, 12) : {items: current.quickActions};
    if (hasQuick && !quick.items.length && parsed.quickActions.length > 0) {
        return {ok: false, reason: "invalid-actions", ...current, migrated: false};
    }
    const migrated = topSchema.version !== FLOATING_BALL_SETTINGS_SCHEMA_VERSION
        || Boolean(nestedSchema && nestedSchema.version !== FLOATING_BALL_SCHEMA_VERSION);
    return {
        ok: true,
        reason: migrated ? "migrated" : "imported",
        config: imported,
        quickActions: clone(quick.items),
        migrated,
    };
}

module.exports = {
    FLOATING_BALL_SETTINGS_SCHEMA_VERSION,
    FLOATING_BALL_SETTINGS_MAX_BYTES,
    updateFloatingBallAction,
    moveFloatingBallAction,
    removeFloatingBallAction,
    restoreFloatingBallDefaults,
    buildFloatingBallSettingsRows,
    exportFloatingBallSettings,
    serializeFloatingBallSettings,
    checkFloatingBallSettingsBudget,
    importFloatingBallSettings,
    byteLength,
};
