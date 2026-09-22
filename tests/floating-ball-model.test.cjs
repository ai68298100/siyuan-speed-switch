const test = require("node:test");
const assert = require("node:assert/strict");
const {
    FLOATING_BALL_MORE_ACTION_ID,
    createDefaultFloatingBallConfig,
    normalizeFloatingBallConfig,
    sanitizeFloatingBallConfig,
    normalizeFloatingBallActionList,
    FLOATING_BALL_ACTION_LIMIT,
    clampFloatingBallPosition,
    snapFloatingBallPosition,
    resolveFloatingBallPosition,
    selectFloatingBallFirstLayer,
    resolveFloatingBallClickAction,
} = require("../src/floating-ball-model.js");

test("floating ball config: defaults are bounded, independent and cloned", () => {
    const config = createDefaultFloatingBallConfig();
    assert.equal(config.schemaVersion, 1);
    assert.deepEqual(config.position.mobile, {edge: "right", yRatio: 0.72});
    assert.equal(config.appearance.size, 48);
    assert.equal(config.behavior.touchSlopPx, 8);
    config.position.mobile.yRatio = 0;
    config.actions.mobile[0].actionId = "changed";
    const again = createDefaultFloatingBallConfig();
    assert.equal(again.position.mobile.yRatio, 0.72);
    assert.equal(again.actions.mobile[0].actionId, "journal");
});

test("free position and margin migrate additively and stay local during transfer", () => {
    const {serializeFloatingBallSettings, importFloatingBallSettings} = require("../src/floating-ball-settings-model.js");
    const config = normalizeFloatingBallConfig({position: {mobile: {xRatio: 0.45, edge: "left", yRatio: 0.2}}, appearance: {marginPx: 0}});
    assert.equal(config.position.mobile.xRatio, 0.45);
    assert.equal(config.appearance.marginPx, 0);
    assert.deepEqual(normalizeFloatingBallConfig({position: {mobile: {xRatio: NaN}}}).position.mobile, {edge: "right", yRatio: 0.72});
    assert.equal(normalizeFloatingBallConfig({appearance: {marginPx: 800}}).appearance.marginPx, 32);
    const exported = serializeFloatingBallSettings(config, []);
    assert.equal(exported.includes("xRatio"), false);
    const current = normalizeFloatingBallConfig({position: {mobile: {edge: "left", yRatio: 0.6, xRatio: 0.8}}});
    const imported = importFloatingBallSettings(exported, current, []);
    assert.equal(imported.ok, true);
    assert.deepEqual(imported.config.position, current.position);
    assert.equal(imported.config.appearance.marginPx, 0);
    assert.equal(resolveFloatingBallPosition({edge: "left", yRatio: 0.5, xRatio: 0.5}, {width: 400, height: 800}).x, 200);
});

test("floating ball config: legacy fabEnabled migrates only mobile and sidebar follows desktop", () => {
    const result = normalizeFloatingBallConfig({fabEnabled: true, enabled: {desktop: true}});
    assert.deepEqual(result.enabled, {desktop: true, sidebar: true, mobile: true});
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.appearance.size, 48);
});

test("floating ball config: legacy flag wins over an interrupted pre-v1 mobile write", () => {
    const result = normalizeFloatingBallConfig({
        fabEnabled: true,
        floatingBall: {schemaVersion: 0, enabled: {mobile: false}},
    });
    assert.equal(result.enabled.mobile, true);
});

test("floating ball config: malformed values are clamped, unknown fields removed and action ids deduped", () => {
    const result = normalizeFloatingBallConfig({
        schemaVersion: 0,
        enabled: {desktop: "yes", mobile: false, unknown: true},
        position: {desktop: {edge: "middle", yRatio: 8}},
        appearance: {size: 999, idleOpacity: 0.1, idleDelayMs: 99},
        behavior: {touchSlopPx: 99},
        actions: {
            desktop: [
                {actionId: "plugin::open", firstLayer: true, order: 2},
                {actionId: "plugin::open", firstLayer: true, order: 1},
                {actionId: "\u0000bad", firstLayer: true},
            ],
        },
        dangerous: "discard me",
    });
    assert.equal(result.enabled.desktop, false);
    assert.equal(result.position.desktop.edge, "right");
    assert.equal(result.position.desktop.yRatio, 1);
    assert.equal(result.appearance.size, 64);
    assert.equal(result.appearance.idleOpacity, 0.4);
    assert.equal(result.appearance.idleDelayMs, 3000);
    assert.equal(result.behavior.touchSlopPx, 12);
    assert.deepEqual(result.actions.desktop.map((entry) => entry.actionId), ["plugin::open", "bad"]);
    assert.equal(Object.hasOwn(result, "dangerous"), false);
});

test("floating ball config: explicit empty action lists survive normalization", () => {
    const result = normalizeFloatingBallConfig({actions: {mobile: []}});
    assert.deepEqual(result.actions.mobile, []);
    assert.equal(sanitizeFloatingBallConfig({fabEnabled: true}).migrated, true);
    assert.deepEqual(normalizeFloatingBallActionList(undefined).map((entry) => entry.actionId), ["journal", "search", "home", "settings"]);
    assert.equal(normalizeFloatingBallActionList(Array.from({length: FLOATING_BALL_ACTION_LIMIT + 5}, (_, index) => ({actionId: `a-${index}`}))).length, FLOATING_BALL_ACTION_LIMIT);
});

test("floating ball geometry clamps ratio and pointer y into safe viewport", () => {
    assert.deepEqual(clampFloatingBallPosition({edge: "left", yRatio: 9}, {width: 1000, height: 800}, {size: 48, margin: 8}), {
        edge: "left", yRatio: 1,
    });
    assert.deepEqual(clampFloatingBallPosition({x: 3, y: -100}, {width: 1000, height: 800}, {size: 48, margin: 8}), {
        edge: "left", yRatio: 0,
    });
    assert.deepEqual(resolveFloatingBallPosition({edge: "right", yRatio: 0.72}, {width: 1000, height: 800}, {size: 48, margin: 8}), {
        x: 968, y: 561.92, edge: "right", yRatio: 0.72,
    });
});

test("floating ball geometry snaps to nearest edge while retaining vertical position", () => {
    assert.deepEqual(snapFloatingBallPosition({x: 900, y: 400}, {width: 1000, height: 800}, {size: 48, margin: 8}), {
        edge: "right", yRatio: 0.5,
    });
    assert.deepEqual(snapFloatingBallPosition({x: 100, y: 400}, {width: 1000, height: 800}, {size: 48, margin: 8}), {
        edge: "left", yRatio: 0.5,
    });
});

const available = [
    {id: "journal", value: "journal", kind: "builtin", targets: ["desktop", "mobile"]},
    {id: "search", value: "search", kind: "builtin", targets: ["desktop", "sidebar", "mobile"]},
    {id: "settings", value: "settings", kind: "builtin", targets: ["desktop", "sidebar", "mobile"]},
    {id: "mobile-only", value: "mobile-only", kind: "adapter", declaredTargets: ["mobile"]},
];

test("floating ball first layer: filters unsupported/disabled actions, caps six and reserves more", () => {
    const entries = Array.from({length: 8}, (_, index) => ({actionId: index === 0 ? "journal" : `missing-${index}`, enabled: true, firstLayer: true, order: index}));
    const result = selectFloatingBallFirstLayer({actions: {desktop: entries}}, "desktop", available);
    assert.equal(result.length, 2);
    assert.equal(result[0].actionId, "journal");
    assert.equal(result.at(-1).actionId, FLOATING_BALL_MORE_ACTION_ID);
    assert.equal(result.at(-1).kind, "more");
});

test("floating ball first layer: empty or unavailable config keeps switcher safety path", () => {
    const result = selectFloatingBallFirstLayer({actions: {mobile: [{actionId: "mobile-only", enabled: true, firstLayer: true}]}}, "mobile", available);
    assert.deepEqual(result.map((item) => item.actionId), ["mobile-only", FLOATING_BALL_MORE_ACTION_ID]);
    const empty = selectFloatingBallFirstLayer({actions: {desktop: []}}, "desktop", []);
    assert.deepEqual(empty.map((item) => item.actionId), ["switcher", FLOATING_BALL_MORE_ACTION_ID]);
});

test("floating ball click: unavailable requested action falls back to switcher safely", () => {
    const requested = {id: "missing", value: "missing", kind: "builtin"};
    const switcherResult = resolveFloatingBallClickAction(requested, available, "desktop");
    assert.equal(switcherResult.action.id, "switcher");
    assert.equal(switcherResult.fallback, true);
    const safeResult = resolveFloatingBallClickAction(requested, [available[2]], "desktop");
    assert.equal(safeResult.action.id, "switcher");
    assert.equal(safeResult.reason, "safe-switcher");
});

test("floating ball click actions are per-surface and default to the switcher", () => {
    const defaults = createDefaultFloatingBallConfig();
    assert.deepEqual(defaults.clickAction, {desktop: "switcher", sidebar: "switcher", mobile: "switcher"});
    const normalized = normalizeFloatingBallConfig({clickAction: {desktop: "search", mobile: "\u0000bad"}});
    assert.equal(normalized.clickAction.desktop, "search");
    assert.equal(normalized.clickAction.sidebar, "switcher");
    assert.equal(normalized.clickAction.mobile, "bad");
});

test("floating ball action presentation stays bounded and can opt an unknown action into mobile", () => {
    const config = normalizeFloatingBallConfig({actions: {mobile: [
        {actionId: "mobile-plugin", firstLayer: true, label: "  手机入口  ", icon: "🚀", mobileOverride: true},
        {actionId: "unsafe", firstLayer: true, label: "<bad>", icon: "<svg onload=x>"},
    ]}});
    const catalog = [
        {id: "mobile-plugin", value: "plugin::mobile", kind: "command", targets: ["desktop", "sidebar"]},
        {id: "unsafe", value: "plugin::unsafe", kind: "command", targets: ["desktop", "sidebar"]},
    ];
    const selected = selectFloatingBallFirstLayer(config, "mobile", catalog);
    assert.equal(selected[0].label, "手机入口");
    assert.equal(selected[0].icon, "🚀");
    assert.equal(selected[0].mobileOverride, true);
    assert.equal(selected.some((item) => item.actionId === "unsafe"), false);
    assert.equal(config.actions.mobile[1].label, "<bad>");
    assert.equal(Object.hasOwn(config.actions.mobile[1], "icon"), false);
});

test("floating ball action presentation accepts safe custom image icons", () => {
    const data = `data:image/png;base64,${"A".repeat(32)}`;
    const config = normalizeFloatingBallConfig({actions: {desktop: [
        {actionId: "image", firstLayer: true, icon: data},
        {actionId: "credentialed", firstLayer: true, icon: "https://user:pass@example.com/icon.png"},
        {actionId: "oversize", firstLayer: true, icon: "data:image/png;base64," + "A".repeat(240001)},
        {actionId: "symbol", firstLayer: true, icon: "siyuan-some-long-plugin-action-icon"},
    ]}});
    assert.equal(config.actions.desktop[0].icon, data);
    assert.equal(Object.hasOwn(config.actions.desktop[1], "icon"), false);
    assert.equal(Object.hasOwn(config.actions.desktop[2], "icon"), false);
    assert.equal(config.actions.desktop[3].icon, "siyuan-some-long-plugin-action-icon");
});

test("floating ball presets: normalize bounds and drops malformed entries", () => {
    const {normalizeFloatingBallPresets, saveFloatingBallPreset, applyFloatingBallPreset, removeFloatingBallPreset, pickNextFloatingBallPreset, createDefaultFloatingBallConfig} = require("../src/floating-ball-model.js");
    const base = createDefaultFloatingBallConfig();
    // 保存两个场景
    const first = saveFloatingBallPreset(base, "阅读", 1000);
    assert.ok(first.preset, "valid save returns the preset");
    const second = saveFloatingBallPreset(first.config, "写作", 2000);
    assert.equal(second.config.presets.length, 2);
    // 同名覆盖不新增
    const overwrite = saveFloatingBallPreset(second.config, "阅读", 3000);
    assert.equal(overwrite.config.presets.length, 2);
    assert.equal(overwrite.config.presets.find((p) => p.name === "阅读").savedAt, 3000);
    // 应用：拷贝动作布局与主点击，外观保持
    const marked = {...second.config, appearance: {...second.config.appearance, size: 60}};
    const applied = applyFloatingBallPreset(marked, "preset-2000");
    assert.equal(applied.preset.name, "写作");
    assert.equal(applied.config.currentPresetId, "preset-2000");
    assert.equal(applied.config.appearance.size, 60, "appearance stays global, not part of a scene");
    applied.config.actions.mobile.length >= 1;
    // 删除：连带清掉 current 指向
    const removed = removeFloatingBallPreset(applied.config, "preset-2000");
    assert.equal(removed.config.presets.length, 1);
    assert.equal(removed.config.currentPresetId, "");
    // 循环：环绕 + 单集/空拒绝（在删除前用双预设列表断言环绕）
    const cycleList = second.config.presets;
    assert.equal(pickNextFloatingBallPreset(cycleList, "preset-1000")?.id, "preset-2000");
    assert.equal(pickNextFloatingBallPreset(cycleList, "preset-2000")?.id, "preset-1000", "wraps from last to first");
    assert.equal(pickNextFloatingBallPreset([], ""), null);
    assert.equal(pickNextFloatingBallPreset([{id: "only", name: "only"}], ""), null);
});

test("floating ball presets: normalize caps at eight and drops garbage", () => {
    const {normalizeFloatingBallPresets} = require("../src/floating-ball-model.js");
    const nine = Array.from({length: 9}, (_, index) => ({
        id: `p${index}`, name: `场景${index}`, savedAt: index,
        clickAction: {desktop: "switcher", mobile: "switcher"},
        actions: {desktop: [], mobile: []},
    }));
    const presets = normalizeFloatingBallPresets(nine);
    assert.equal(presets.length, 8, "only the newest eight survive");
    assert.equal(normalizeFloatingBallPresets([{id: "", name: "broken"}, null, "x"]).length, 0);
    const kept = normalizeFloatingBallPresets(nine).every((preset) => preset.actions.desktop.length === 0);
    assert.equal(kept, true);
});
