const test = require("node:test");
const assert = require("node:assert/strict");
const {
    FLOATING_BALL_SETTINGS_SCHEMA_VERSION,
    FLOATING_BALL_SETTINGS_MAX_BYTES,
    byteLength,
    updateFloatingBallAction,
    moveFloatingBallAction,
    removeFloatingBallAction,
    restoreFloatingBallDefaults,
    buildFloatingBallSettingsRows,
    exportFloatingBallSettings,
    serializeFloatingBallSettings,
    importFloatingBallSettings,
} = require("../src/floating-ball-settings-model.js");
const {
    createDefaultFloatingBallConfig,
} = require("../src/floating-ball-model.js");

function configWithActions() {
    const config = createDefaultFloatingBallConfig();
    config.position.desktop = {edge: "left", yRatio: 0.17};
    config.position.mobile = {edge: "right", yRatio: 0.93};
    config.enabled.desktop = true;
    config.actions.desktop = [
        {actionId: "search", enabled: true, firstLayer: true, order: 20},
        {actionId: "journal", enabled: true, firstLayer: false, order: 10},
    ];
    return config;
}

const quickActions = [
    {id: "search", label: "搜索", icon: "iconSearch", kind: "builtin", value: "search", targets: ["desktop", "sidebar"], enabled: true, order: 20},
    {id: "journal", label: "日记", icon: "iconCalendar", kind: "builtin", value: "journal", targets: ["desktop", "mobile"], enabled: true, order: 10},
];

test("floating-ball settings export is versioned and excludes viewport/runtime state", () => {
    const config = configWithActions();
    // These fields model ephemeral DOM/session state and must never cross devices.
    config.position.desktop.x = 12;
    config.position.mobile.dragging = true;
    config.expanded = true;
    const exported = exportFloatingBallSettings(config, quickActions);

    assert.equal(exported.schemaVersion, FLOATING_BALL_SETTINGS_SCHEMA_VERSION);
    assert.equal(exported.floatingBall.schemaVersion, 1);
    assert.equal("position" in exported.floatingBall, false);
    assert.equal("expanded" in exported.floatingBall, false);
    assert.equal("position" in exported, false);
    assert.deepEqual(exported.quickActions.map((item) => item.id), ["search", "journal"]);
    assert.deepEqual(exported.floatingBall.enabled, config.enabled);
    assert.notStrictEqual(exported.floatingBall.actions, config.actions);
});

test("floating-ball settings serialization round-trips through the versioned envelope", () => {
    const text = serializeFloatingBallSettings(configWithActions(), quickActions);
    assert.equal(typeof text, "string");
    assert.ok(byteLength(text) <= FLOATING_BALL_SETTINGS_MAX_BYTES);
    const imported = importFloatingBallSettings(text, createDefaultFloatingBallConfig(), []);
    assert.equal(imported.ok, true);
    assert.equal(imported.reason, "imported");
    assert.equal(imported.migrated, false);
    assert.deepEqual(imported.config.position, createDefaultFloatingBallConfig().position,
        "positions come from the active device, never from an import");
    assert.deepEqual(imported.config.enabled, configWithActions().enabled);
    assert.deepEqual(imported.quickActions.map((item) => item.id), ["search", "journal"]);
});

test("import preserves current positions and rejects oversize payloads atomically", () => {
    const currentConfig = configWithActions();
    const currentQuickActions = quickActions.map((item) => ({...item}));
    const beforeConfig = JSON.parse(JSON.stringify(currentConfig));
    const beforeActions = JSON.parse(JSON.stringify(currentQuickActions));
    const oversized = JSON.stringify({
        schemaVersion: FLOATING_BALL_SETTINGS_SCHEMA_VERSION,
        floatingBall: {},
        quickActions: [],
        padding: "x".repeat(FLOATING_BALL_SETTINGS_MAX_BYTES),
    });
    assert.ok(byteLength(oversized) > FLOATING_BALL_SETTINGS_MAX_BYTES);
    const result = importFloatingBallSettings(oversized, currentConfig, currentQuickActions);
    assert.deepEqual({ok: result.ok, reason: result.reason}, {ok: false, reason: "too-large"});
    assert.deepEqual(result.config, beforeConfig);
    assert.deepEqual(result.quickActions, beforeActions);
});

test("512 KiB limit is measured in UTF-8 bytes and accepts the exact boundary", () => {
    const make = (size) => JSON.stringify({schemaVersion: 1, quickActions: [], padding: "x".repeat(size)});
    let low = 0;
    let high = FLOATING_BALL_SETTINGS_MAX_BYTES + 1;
    // Find the largest padding whose serialized UTF-8 payload is within the
    // limit. This avoids relying on JSON punctuation length when the limit
    // changes in a future schema.
    while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2);
        if (byteLength(make(mid)) <= FLOATING_BALL_SETTINGS_MAX_BYTES) low = mid;
        else high = mid;
    }
    const boundary = make(low);
    assert.equal(byteLength(boundary), FLOATING_BALL_SETTINGS_MAX_BYTES);
    assert.equal(importFloatingBallSettings(boundary, createDefaultFloatingBallConfig(), []).ok, true);
    const unicode = JSON.stringify({schemaVersion: 1, padding: "界".repeat(200000)});
    assert.ok(byteLength(unicode) > unicode.length, "UTF-8 byte accounting must include multibyte text");
});

test("invalid JSON, schema and action shapes never overwrite current settings", () => {
    const currentConfig = configWithActions();
    const currentQuickActions = quickActions.map((item) => ({...item}));
    const cases = [
        ["{not-json", "invalid-json"],
        [JSON.stringify({schemaVersion: 99}), "invalid-schema"],
        [JSON.stringify({schemaVersion: 1, quickActions: {}}), "invalid-actions"],
        [JSON.stringify({schemaVersion: 1, floatingBall: {actions: []}}), "invalid-floating-ball"],
        [{schemaVersion: 1, quickActions: [null, {id: "", value: ""}]}, "invalid-actions"],
    ];
    for (const [input, reason] of cases) {
        const result = importFloatingBallSettings(input, currentConfig, currentQuickActions);
        assert.equal(result.ok, false, reason);
        assert.equal(result.reason, reason);
        assert.deepEqual(result.config, currentConfig, `${reason}: config must remain untouched`);
        assert.deepEqual(result.quickActions, currentQuickActions, `${reason}: actions must remain untouched`);
    }
});

test("settings editor rejects unknown surfaces instead of falling back to desktop", () => {
    const original = configWithActions();
    const baseline = JSON.parse(JSON.stringify(original));
    assert.deepEqual(updateFloatingBallAction(original, "tablet", "search", {enabled: false}), baseline);
    assert.deepEqual(moveFloatingBallAction(original, "tablet", "search", 1), baseline);
    assert.deepEqual(removeFloatingBallAction(original, "tablet", "search"), baseline);
    assert.deepEqual(restoreFloatingBallDefaults(original, "tablet"), baseline);
    assert.deepEqual(buildFloatingBallSettingsRows(original, "tablet", []), []);
});

test("surface action order is stable by order then original position", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [
        {actionId: "third", enabled: true, firstLayer: false, order: 20},
        {actionId: "second", enabled: true, firstLayer: false, order: 10},
        {actionId: "first", enabled: true, firstLayer: false, order: 10},
    ];
    assert.deepEqual(buildFloatingBallSettingsRows(config, "desktop").map((row) => row.actionId), ["second", "first", "third"]);
    const moved = moveFloatingBallAction(config, "desktop", "second", 1);
    assert.deepEqual(moved.actions.desktop.map((entry) => entry.actionId), ["first", "second", "third"]);
    assert.deepEqual(moved.actions.desktop.map((entry) => entry.order), [10, 20, 30]);
});

test("envelopes require a valid section and reject illegal top or nested schemas", () => {
    const currentConfig = configWithActions();
    const currentQuickActions = quickActions.map((item) => ({...item}));
    const invalid = [
        [{}, "invalid-envelope"],
        [{schemaVersion: 1}, "invalid-envelope"],
        [{schemaVersion: 1, floatingBall: {schemaVersion: 1}}, "invalid-envelope"],
        [{schemaVersion: 1, floatingBall: {schemaVersion: 2, enabled: {desktop: true}}}, "invalid-schema"],
        [{schemaVersion: "1", quickActions: []}, "invalid-schema"],
        [{schemaVersion: 1, floatingBall: {}, quickActions: []}, "invalid-envelope"],
        [{schemaVersion: 1, floatingBall: {enabled: {hologram: true}}}, "invalid-envelope"],
        [{schemaVersion: 1, floatingBall: {enabled: {mobile: "true"}}}, "invalid-floating-ball"],
        [{schemaVersion: 1, floatingBall: {appearance: {size: null}}}, "invalid-floating-ball"],
        [{schemaVersion: 1, floatingBall: {behavior: []}}, "invalid-floating-ball"],
        [{schemaVersion: 1, floatingBall: {actions: {desktop: {}}}}, "invalid-floating-ball"],
        [{schemaVersion: 1, floatingBall: {actions: {desktop: [null, {}]}}}, "invalid-floating-ball"],
    ];
    [-1, 0.5, null, "1", true, NaN, Infinity].forEach((schemaVersion) => {
        invalid.push([{schemaVersion, quickActions: []}, "invalid-schema"]);
        invalid.push([{schemaVersion: 1, floatingBall: {schemaVersion, enabled: {desktop: true}}}, "invalid-schema"]);
    });
    invalid.forEach(([input, reason]) => {
        const result = importFloatingBallSettings(input, currentConfig, currentQuickActions);
        assert.equal(result.ok, false, reason);
        assert.equal(result.reason, reason);
        assert.deepEqual(result.config, currentConfig);
        assert.deepEqual(result.quickActions, currentQuickActions);
    });
});

test("partial envelopes have an explicit non-destructive merge policy", () => {
    const currentConfig = configWithActions();
    const currentQuickActions = quickActions.map((item) => ({...item}));
    const quickOnly = importFloatingBallSettings({schemaVersion: 1, quickActions: []}, currentConfig, currentQuickActions);
    assert.equal(quickOnly.ok, true);
    assert.deepEqual(quickOnly.config, currentConfig, "quick-only imports preserve all floating-ball settings");
    assert.deepEqual(quickOnly.quickActions, [], "an explicit empty quick-action list clears the list");
    const ballOnly = importFloatingBallSettings({schemaVersion: 1, floatingBall: {enabled: {desktop: false}}}, currentConfig, currentQuickActions);
    assert.equal(ballOnly.ok, true);
    assert.equal(ballOnly.config.enabled.desktop, false);
    assert.deepEqual(ballOnly.quickActions, currentQuickActions, "floating-ball-only imports preserve quick actions");
    assert.deepEqual(ballOnly.config.position, currentConfig.position, "partial imports preserve viewport positions");
    assert.deepEqual(ballOnly.config.actions, currentConfig.actions, "omitted action surfaces remain unchanged");
    assert.deepEqual(ballOnly.config.appearance, currentConfig.appearance);
    assert.deepEqual(ballOnly.config.behavior, currentConfig.behavior);
    assert.equal(ballOnly.config.enabled.sidebar, currentConfig.enabled.sidebar);
    assert.equal(ballOnly.config.enabled.mobile, currentConfig.enabled.mobile);
    const cleared = importFloatingBallSettings({schemaVersion: 1, floatingBall: {schemaVersion: 1, actions: {mobile: []}}}, currentConfig, currentQuickActions);
    assert.equal(cleared.ok, true);
    assert.deepEqual(cleared.config.actions.mobile, []);
    assert.deepEqual(cleared.config.actions.desktop, currentConfig.actions.desktop);
    assert.deepEqual(cleared.config.actions.sidebar, currentConfig.actions.sidebar);
    assert.deepEqual(currentConfig, configWithActions(), "successful partial imports also leave their inputs untouched");
});

test("versionless and v0 envelopes migrate while emitting current config schema", () => {
    for (const input of [
        {floatingBall: {enabled: {mobile: true}}},
        {schemaVersion: 0, floatingBall: {schemaVersion: 0, enabled: {mobile: true}}},
        {schemaVersion: 1, floatingBall: {enabled: {mobile: true}}},
    ]) {
        const result = importFloatingBallSettings(input, configWithActions(), quickActions);
        assert.equal(result.ok, true);
        assert.equal(result.migrated, true);
        assert.equal(result.reason, "migrated");
        assert.equal(result.config.schemaVersion, 1);
        assert.equal(result.config.enabled.mobile, true);
    }
});

test("failure results and parsed-object capacity guards are detached and atomic", () => {
    const currentConfig = configWithActions();
    const currentQuickActions = JSON.parse(JSON.stringify(quickActions));
    const beforeConfig = JSON.parse(JSON.stringify(currentConfig));
    const beforeQuick = JSON.parse(JSON.stringify(currentQuickActions));
    const result = importFloatingBallSettings({schemaVersion: 1, quickActions: [], padding: "界".repeat(200000)}, currentConfig, currentQuickActions);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "too-large");
    assert.deepEqual(result.config, beforeConfig);
    assert.deepEqual(result.quickActions, beforeQuick);
    result.config.actions.desktop[0].enabled = false;
    result.quickActions[0].targets.push("mobile");
    assert.deepEqual(currentConfig, beforeConfig);
    assert.deepEqual(currentQuickActions, beforeQuick);
});

test("cyclic import payloads fail safely and do not overwrite current state", () => {
    const currentConfig = configWithActions();
    const currentQuickActions = quickActions.map((item) => ({...item}));
    const cyclic = {schemaVersion: 1, quickActions: []};
    cyclic.loop = cyclic;
    assert.doesNotThrow(() => {
        const result = importFloatingBallSettings(cyclic, currentConfig, currentQuickActions);
        assert.equal(result.ok, false);
        assert.equal(result.reason, "invalid-shape");
        assert.deepEqual(result.config, currentConfig);
        assert.deepEqual(result.quickActions, currentQuickActions);
    });
    const cyclicActions = [];
    cyclicActions.push(cyclicActions);
    const result = importFloatingBallSettings(cyclicActions, currentConfig, currentQuickActions);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid-shape");
    assert.deepEqual(result.config, currentConfig);
    assert.deepEqual(result.quickActions, currentQuickActions);
});

test("legacy bare quick-action arrays migrate without changing floating-ball config", () => {
    const currentConfig = configWithActions();
    const result = importFloatingBallSettings([
        {id: "search", label: "搜索", kind: "builtin", value: "search", targets: ["desktop"]},
    ], currentConfig, quickActions);
    assert.equal(result.ok, true);
    assert.equal(result.reason, "legacy-quick-actions");
    assert.equal(result.migrated, true);
    assert.deepEqual(result.config, currentConfig);
    assert.deepEqual(result.quickActions.map((item) => item.id), ["search"]);
});

test("import normalizes duplicate/invalid action descriptors and unknown surfaces", () => {
    const input = {
        schemaVersion: 1,
        floatingBall: {
            enabled: {desktop: true, hologram: true},
            position: {desktop: {edge: "left", yRatio: 0.01}},
            actions: {
                desktop: [
                    {actionId: "alpha", firstLayer: true, order: 20},
                    {actionId: "alpha", firstLayer: true, order: 10},
                    {actionId: "\u0000beta", firstLayer: true},
                    {actionId: 123, firstLayer: true},
                ],
                hologram: [{actionId: "must-not-leak"}],
            },
        },
    };
    const result = importFloatingBallSettings(input, createDefaultFloatingBallConfig(), []);
    assert.equal(result.ok, true);
    assert.deepEqual(result.config.actions.desktop.map((entry) => entry.actionId), ["alpha", "beta"]);
    assert.equal(Object.hasOwn(result.config.actions, "hologram"), false);
    assert.equal(result.config.enabled.desktop, true);
    assert.equal(result.config.position.desktop.edge, "right",
        "viewport-specific imported positions must be ignored");
});

test("action editor updates, moves, removes and restores one surface only", () => {
    const original = configWithActions();
    const updated = updateFloatingBallAction(original, "desktop", "search", {
        enabled: false,
        firstLayer: false,
        actionId: "journal",
    });
    const updatedSearch = updated.actions.desktop.find((entry) => entry.actionId === "search");
    assert.equal(updatedSearch.actionId, "search", "patch cannot rewrite identity");
    assert.equal(updatedSearch.enabled, false);
    assert.equal(updatedSearch.firstLayer, false);
    const moved = moveFloatingBallAction(updated, "desktop", "journal", -1);
    assert.deepEqual(moved.actions.desktop.map((item) => item.actionId), ["journal", "search"]);
    assert.deepEqual(moved.actions.desktop.map((item) => item.order), [10, 20]);
    const removed = removeFloatingBallAction(moved, "desktop", "search");
    assert.deepEqual(removed.actions.desktop.map((item) => item.actionId), ["journal"]);
    assert.deepEqual(removed.actions.mobile, original.actions.mobile,
        "editing desktop must not mutate another surface");
    const restored = restoreFloatingBallDefaults(removed, "desktop");
    assert.deepEqual(restored.actions.desktop.map((item) => item.actionId), ["journal", "search", "settings"]);
    assert.deepEqual(restored.position, original.position, "restore defaults does not move the ball");
});

test("settings rows expose supported, unsupported and not-loaded action states", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.mobile = [
        {actionId: "search", enabled: true, firstLayer: true, order: 20},
        {actionId: "dock-outline", enabled: true, firstLayer: true, order: 10},
        {actionId: "plugin-later", enabled: true, firstLayer: false, order: 30},
    ];
    const rows = buildFloatingBallSettingsRows(config, "mobile", [
        {id: "search", label: "搜索", icon: "iconSearch", kind: "builtin", value: "search"},
        {id: "dock-outline", label: "大纲", icon: "iconList", kind: "dock", value: "outline"},
    ]);
    assert.deepEqual(rows.map((row) => [row.actionId, row.status]), [
        ["dock-outline", "unsupported"],
        ["search", "supported"],
        ["plugin-later", "unavailable"],
    ]);
    assert.equal(rows[0].reason, "unsupported");
    assert.equal(rows[2].reason, "not-loaded");
    assert.equal(rows[2].kind, "unknown");
});
