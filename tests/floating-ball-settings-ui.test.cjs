const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {createRequire} = require("node:module");
const ts = require("typescript");
const {JSDOM} = require("jsdom");
const {readSourceFile} = require("./source-scan.cjs");
const {createDefaultFloatingBallConfig} = require("../src/floating-ball-model.js");
const {getBuiltinQuickActions, resolveQuickActionSupport} = require("../src/quick-actions.js");
const {FLOATING_BALL_SETTINGS_MAX_BYTES, serializeFloatingBallSettings} = require("../src/floating-ball-settings-model.js");
const i18n = require("../src/i18n/zh-CN.json");

const srcRequire = createRequire(path.resolve(__dirname, "../src/settings-sections.ts"));

function compile(source, filename, requireImpl, globals = {}) {
    const output = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
        fileName: filename,
    }).outputText;
    const module = {exports: {}};
    new Function("require", "module", "exports", ...Object.keys(globals), output)(
        requireImpl, module, module.exports, ...Object.values(globals),
    );
    return module.exports;
}

// Exercise the real production TS builder and its real JS model dependencies.
// Only the SiYuan host boundary and reusable host control constructors are
// mocked; no rendering/event handler or import behavior is reimplemented here.
function mount(t, options = {}) {
    const dom = new JSDOM("<!doctype html><body></body>", {url: "https://settings.test"});
    const {window} = dom;
    const {document} = window;
    t.after(() => window.close());
    const messages = [];
    const patches = [];
    const saves = [];
    const executions = [];
    const confirmations = [];
    const iconPickers = [];
    const defaults = createDefaultFloatingBallConfig();
    let state = {floatingBall: options.config || defaults, fabEnabled: false};
    let currentQuickActions = options.quickActions || getBuiltinQuickActions();
    const catalog = options.catalog || getBuiltinQuickActions();
    const controls = {
        settingItem(title, _description, control) {
            const row = document.createElement("label");
            row.dataset.setting = title;
            row.append(document.createTextNode(title), control);
            return row;
        },
        switcher(checked, onChange) {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = checked;
            input.addEventListener("change", () => onChange(input.checked));
            return input;
        },
        select(items, value, onChange) {
            const input = document.createElement("select");
            items.forEach((item) => input.appendChild(new window.Option(item.label, item.value)));
            input.value = String(value);
            input.addEventListener("change", () => onChange(input.value));
            return input;
        },
        num(value, min, max, step, _unit, onChange, label) {
            const input = document.createElement("input");
            input.type = "number";
            Object.assign(input, {value: String(value), min: String(min), max: String(max), step: String(step)});
            if (label) input.setAttribute("aria-label", label);
            input.addEventListener("change", () => onChange(Number(input.value)));
            return input;
        },
    };
    const host = {
        ...controls,
        i18n,
        isMobile: false,
        isUnloading: false,
        getSettings: () => state,
        updateSettings(patch) { patches.push(patch); state = {...state, ...patch}; },
        updateFABVisibility() {},
        getQuickActions: () => currentQuickActions,
        saveQuickActions(actions) { saves.push(actions); currentQuickActions = actions; },
        getFloatingBallActions: () => catalog,
        getQuickActionSupport: (action, surface) => resolveQuickActionSupport(action.kind, action.value, surface,
            action.kind === "command" ? action.declaredTargets : (action.declaredTargets ?? action.targets)),
        getQuickActionPickerCandidates: () => catalog,
        executeQuickAction: (...args) => executions.push(args),
        executeFloatingBallSurfaceAction: (...args) => executions.push(args),
        showSwitcher: (...args) => executions.push(args),
        openQuickActionIconPicker(action, onSelect) { iconPickers.push({action, onSelect}); },
    };
    const constants = compile(readSourceFile("src/constants.ts"), "constants.ts", srcRequire);
    const builderSource = readSourceFile("src/settings-sections.ts");
    const module = compile(options.transformSource ? options.transformSource(builderSource) : builderSource, "settings-sections.ts", (name) => {
        if (name === "siyuan") return {showMessage: (text) => messages.push(text)};
        if (name === "./logger") return {logger: {warn() {}}};
        if (name === "./constants") return constants;
        return srcRequire(name);
    }, {
        window, document, Option: window.Option, Blob: window.Blob, URL: window.URL,
        confirm(message) { confirmations.push(message); return options.confirm !== false; },
    });
    const root = options.transferOnly
        ? module.buildQuickActionsTransferControls.call(host, () => {}, false)
        : module.buildSettingsFloatingBall.call(host, state);
    document.body.appendChild(root);
    return {root, window, document, host, messages, patches, saves, executions, confirmations, iconPickers,
        get state() { return state; }, set state(value) { state = value; }};
}

function rowIds(root) {
    return [...root.querySelectorAll(".sw-floating-ball-settings__row")].map((row) => row.dataset.actionId);
}

function row(root, id) {
    const result = [...root.querySelectorAll(".sw-floating-ball-settings__row")].find((entry) => entry.dataset.actionId === id);
    assert.ok(result, `configured action ${id} must have a rendered row`);
    return result;
}

function buttonByLabel(root, text) {
    const button = [...root.querySelectorAll("button")].find((entry) => entry.getAttribute("aria-label") === text || entry.textContent === text);
    assert.ok(button, `button must exist: ${text}`);
    return button;
}

function firstCheckbox(root, id) {
    const checkboxes = row(root, id).querySelectorAll("input[type=checkbox]");
    assert.equal(checkboxes.length, 2, "each action has enabled and first-layer controls");
    return checkboxes[1];
}

function selectSurface(ui, value) {
    const select = ui.root.querySelector(".sw-floating-ball-settings__surface select");
    assert.ok(select);
    select.value = value;
    select.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
}

function importFile(ui, file) {
    const input = ui.root.querySelector("input[type=file]");
    assert.ok(input, "shared transfer controls provide a file input");
    Object.defineProperty(input, "files", {configurable: true, value: [file]});
    input.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
}

function settle() {
    return new Promise((resolve) => setImmediate(resolve));
}

function action(id) {
    return {id, value: `provider/${id}`, kind: "adapter", label: id, icon: "iconPlugin", targets: ["desktop", "sidebar", "mobile"], enabled: true};
}

function assertClickActionSettings(t, options = {}) {
    const ui = mount(t, options);
    const select = ui.root.querySelector('[data-control="clickAction"]');
    assert.ok(select, "real settings expose the primary click selector");
    const set = (value) => {
        select.value = value;
        assert.equal(select.value, value, "the requested action exists in the selector");
        select.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
    };
    set("search");
    selectSurface(ui, "sidebar");
    assert.equal(select.value, "switcher");
    set("__floating-ball-more__");
    selectSurface(ui, "mobile");
    set("home");
    assert.deepEqual(ui.state.floatingBall.clickAction, {desktop: "search", sidebar: "__floating-ball-more__", mobile: "home"}, "click settings are surface-independent");
    selectSurface(ui, "desktop");
    assert.equal(select.value, "search", "returning to a surface restores its saved choice");
}

test("floating settings primary click selector persists each surface independently", (t) => {
    assertClickActionSettings(t);
});

function assertPresentationSettings(t, options = {}) {
    const ui = mount(t, options);
    const sourceActions = JSON.stringify(ui.host.getQuickActions());
    const mobileActions = JSON.stringify(ui.state.floatingBall.actions.mobile);
    const label = row(ui.root, "search").querySelector(".sw-floating-ball-settings__label");
    label.value = "我的查找";
    label.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
    assert.equal(ui.state.floatingBall.actions.desktop.find((item) => item.actionId === "search").label, "我的查找", "label override persists");
    assert.equal(ui.root.querySelector('.sw-floating-ball-settings__preview [data-action-id="search"]').textContent, "我的查找");
    row(ui.root, "search").querySelector(".sw-floating-ball-settings__icon").click();
    assert.equal(ui.iconPickers.length, 1, "the icon button opens the host picker");
    ui.iconPickers[0].onSelect("🚀");
    assert.equal(ui.state.floatingBall.actions.desktop.find((item) => item.actionId === "search").icon, "🚀", "icon override persists");
    assert.equal(row(ui.root, "search").querySelector(".sw-floating-ball-settings__icon").textContent, "🚀");
    row(ui.root, "search").querySelector(".sw-floating-ball-settings__icon").click();
    assert.equal(ui.iconPickers[1].action.icon, "🚀", "reopening the picker uses the visible override");
    assert.equal(ui.iconPickers[1].action.label, "我的查找");
    assert.equal(JSON.stringify(ui.state.floatingBall.actions.mobile), mobileActions);
    assert.equal(JSON.stringify(ui.host.getQuickActions()), sourceActions, "display overrides never mutate the shared action registry");
    assert.equal(ui.saves.length, 0);
}

test("floating settings label and icon overrides update preview and preserve shared actions", (t) => {
    assertPresentationSettings(t);
});

function assertMobileTrySettings(t, options = {}) {
    const config = createDefaultFloatingBallConfig();
    const command = {id: "external", value: "plugin::run", kind: "command", label: "External", icon: "iconPlugin", targets: ["desktop", "sidebar"], enabled: true};
    config.actions.mobile = [{actionId: "external", enabled: true, firstLayer: true, order: 10}];
    const ui = mount(t, {...options, config, catalog: [command]});
    assert.equal(ui.root.querySelector('[data-control="mobileOverride"]'), null);
    selectSurface(ui, "mobile");
    const tryControl = () => row(ui.root, "external").querySelector('[data-control="mobileOverride"]');
    assert.ok(tryControl(), "unknown mobile commands have an explicit try control");
    assert.equal(tryControl().checked, false);
    assert.equal(ui.root.querySelector('.sw-floating-ball-settings__preview [data-action-id="external"]'), null);
    tryControl().click();
    assert.equal(ui.state.floatingBall.actions.mobile[0].mobileOverride, true, "mobile opt-in persists");
    assert.equal(tryControl().checked, true, "the opt-in remains reversible after rerender");
    assert.ok(row(ui.root, "external").querySelector(".is-unknown"), "an opt-in never claims verified mobile capability");
    assert.ok(ui.root.querySelector('.sw-floating-ball-settings__preview [data-action-id="external"]'), "preview reflects mobile opt-in through the host support callback");
    tryControl().click();
    assert.equal(ui.state.floatingBall.actions.mobile[0].mobileOverride, undefined);
    assert.equal(tryControl().checked, false);
    assert.equal(ui.executions.length, 0, "editing capability preferences does not execute actions");
}

test("floating settings mobile try control remains explicit, reversible and unverified", (t) => {
    assertMobileTrySettings(t);
});

test("floating settings contracts reject lost per-surface writes, presentation and opt-in in memory", (t) => {
    const original = readSourceFile("src/settings-sections.ts");
    for (const [target, replacement, contract, failure] of [
        ['next.clickAction[surface] = clickActionSelect.value', 'next.clickAction.desktop = clickActionSelect.value', assertClickActionSettings, "click settings are surface-independent"],
        ['{label: title.value}', '{label: ""}', assertPresentationSettings, "label override persists"],
        ['{icon}));', '{icon: "iconPlugin"}));', assertPresentationSettings, "icon override persists"],
        ['{mobileOverride: mobileTry.checked}', '{mobileOverride: false}', assertMobileTrySettings, "mobile opt-in persists"],
    ]) {
        assert.equal(original.split(target).length - 1, 1, `mutation target exists exactly once: ${target}`);
        const transformSource = (source) => source.replace(target, replacement);
        assert.throws(() => contract(t, {transformSource}), (error) => error instanceof assert.AssertionError && error.message.includes(failure),
            `the production mutation must violate its named behavioral contract: ${target}`);
    }
});

test("floating settings UI toggles three surfaces independently and reads latest config", (t) => {
    const ui = mount(t);
    const switches = [...ui.root.querySelectorAll(".sw-floating-ball-settings__toggles input[type=checkbox]")];
    assert.equal(switches.length, 3);
    // Simulate a position write arriving after the settings DOM was created.
    ui.state = {
        ...ui.state,
        floatingBall: {
            ...ui.state.floatingBall,
            position: {...ui.state.floatingBall.position, mobile: {edge: "left", yRatio: 0.11}},
        },
    };
    switches[0].click();
    assert.deepEqual(ui.state.floatingBall.enabled, {desktop: true, sidebar: false, mobile: false});
    switches[1].click();
    switches[2].click();
    switches[0].click();
    assert.deepEqual(ui.state.floatingBall.enabled, {desktop: false, sidebar: true, mobile: true});
    assert.deepEqual(ui.state.floatingBall.position.mobile, {edge: "left", yRatio: 0.11});
    assert.equal(ui.state.fabEnabled, true, "legacy mobile projection remains in sync");
    assert.equal(ui.patches.length, 4);
});

test("floating settings UI sorting follows rendered order and leaves other surfaces intact", (t) => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [
        {actionId: "search", enabled: true, firstLayer: true, order: 20},
        {actionId: "settings", enabled: true, firstLayer: true, order: 30},
        {actionId: "journal", enabled: true, firstLayer: false, order: 10},
    ];
    const mobileBefore = JSON.stringify(config.actions.mobile);
    const ui = mount(t, {config});
    assert.deepEqual(rowIds(ui.root), ["journal", "search", "settings"]);
    buttonByLabel(row(ui.root, "search"), i18n.floatingBallMoveUp).click();
    assert.deepEqual(rowIds(ui.root), ["search", "journal", "settings"]);
    firstCheckbox(ui.root, "journal").click();
    assert.equal(ui.state.floatingBall.actions.desktop.find((entry) => entry.actionId === "journal").firstLayer, true);
    assert.equal(JSON.stringify(ui.state.floatingBall.actions.mobile), mobileBefore);
    selectSurface(ui, "mobile");
    assert.deepEqual(rowIds(ui.root), ["journal", "search", "home", "settings"]);
});

test("floating settings sliders preview without writes and commit once on change", (t) => {
    const ui = mount(t);
    const size = ui.root.querySelector('[data-control="size"]');
    const previewBall = () => ui.root.querySelector(".sw-floating-ball-settings__preview-ball");
    assert.equal(size.getAttribute("aria-label"), i18n.floatingBallSize);
    assert.equal(size.labels.length, 1, "the visible label is associated with the range");
    size.value = "60";
    size.dispatchEvent(new ui.window.Event("input", {bubbles: true}));
    size.value = "64";
    size.dispatchEvent(new ui.window.Event("input", {bubbles: true}));
    assert.equal(previewBall().style.width, "64px", "the draft immediately changes real preview geometry");
    assert.equal(size.getAttribute("aria-valuetext"), "64 px");
    assert.equal(size.closest("label").querySelector("output").value, "64 px");
    assert.equal(ui.state.floatingBall.appearance.size, 48, "input does not persist the draft");
    assert.equal(ui.patches.length, 0, "pointer frames must not rerender the full plugin");
    size.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
    assert.equal(ui.patches.length, 1);
    assert.equal(ui.state.floatingBall.appearance.size, 64);
    selectSurface(ui, "sidebar");
    assert.equal(size.disabled, true);
    assert.equal(size.value, "44");
    assert.equal(previewBall().style.width, "44px", "narrow sidebars retain their dedicated size");
    selectSurface(ui, "mobile");
    assert.equal(size.disabled, false);
    assert.equal(size.value, "64", "desktop and mobile use the saved shared size");
    const opacity = ui.root.querySelector('[data-control="idleOpacity"]');
    opacity.value = "0.75";
    opacity.dispatchEvent(new ui.window.Event("input", {bubbles: true}));
    assert.equal(previewBall().style.opacity, "0.75");
    assert.equal(ui.patches.length, 1);
    opacity.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
    assert.equal(ui.state.floatingBall.appearance.idleOpacity, 0.75);
    assert.equal(ui.patches.length, 2);
});

test("floating settings positions edit only the selected surface and redock free positions", (t) => {
    const config = createDefaultFloatingBallConfig();
    config.behavior.snap = false;
    config.position.desktop = {edge: "left", xRatio: 0.35, yRatio: 0.2};
    config.position.mobile = {edge: "right", xRatio: 0.7, yRatio: 0.8};
    const ui = mount(t, {config});
    const edge = ui.root.querySelector('[data-control="edge"]');
    const vertical = ui.root.querySelector('[data-control="yRatio"]');
    const stage = ui.root.querySelector(".sw-floating-ball-settings__preview-stage");
    const ball = () => stage.querySelector(".sw-floating-ball-settings__preview-ball");
    assert.equal(stage.dataset.direction, "right");
    assert.match(ball().style.left, /35%/, "free horizontal position is represented in the preview");
    edge.value = "right";
    edge.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
    assert.deepEqual(ui.state.floatingBall.position.desktop, {edge: "right", yRatio: 0.2});
    assert.deepEqual(ui.state.floatingBall.position.mobile, {edge: "right", xRatio: 0.7, yRatio: 0.8});
    assert.equal(stage.dataset.direction, "left", "targets expand inward after changing edges");
    assert.match(ball().style.left, /100%/);
    const oldTop = ball().style.top;
    vertical.value = "55";
    vertical.dispatchEvent(new ui.window.Event("input", {bubbles: true}));
    assert.notEqual(ball().style.top, oldTop);
    assert.equal(ui.patches.length, 1);
    vertical.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
    assert.equal(ui.state.floatingBall.position.desktop.yRatio, 0.55);
    selectSurface(ui, "mobile");
    assert.equal(vertical.value, "80");
    assert.match(ball().style.left, /70%/);
});

test("floating settings restore appearance and behavior without replacing positions or actions", (t) => {
    const config = createDefaultFloatingBallConfig();
    config.enabled.desktop = true;
    config.position.desktop = {edge: "left", yRatio: 0.11};
    config.actions.desktop = [{actionId: "search", enabled: false, firstLayer: false, order: 10}];
    const ui = mount(t, {config});
    const rangeValues = {marginPx: "24", idleDelayMs: "7500", touchSlopPx: "12"};
    for (const [key, value] of Object.entries(rangeValues)) {
        const input = ui.root.querySelector(`[data-control="${key}"]`);
        input.value = value;
        input.dispatchEvent(new ui.window.Event("change", {bubbles: true}));
        assert.ok(input.getAttribute("aria-valuetext"), `${key} exposes its value with units`);
    }
    for (const key of ["halfHide", "snap", "hideOnScroll", "hideOnFullscreen", "yieldToModals"]) {
        const input = ui.root.querySelector(`[data-control="${key}"]`);
        assert.ok(input.getAttribute("aria-label"));
        input.click();
        assert.equal(ui.state.floatingBall[key === "halfHide" ? "appearance" : "behavior"][key], false);
    }
    assert.equal(ui.state.floatingBall.appearance.marginPx, 24);
    assert.equal(ui.state.floatingBall.appearance.idleDelayMs, 7500);
    assert.equal(ui.state.floatingBall.behavior.touchSlopPx, 12);
    assert.equal(ui.root.querySelector("details").open, false, "advanced threshold stays out of the main flow");
    const positions = JSON.stringify(ui.state.floatingBall.position);
    const actions = JSON.stringify(ui.state.floatingBall.actions);
    buttonByLabel(ui.root, i18n.floatingBallRestoreAppearance).click();
    assert.equal(ui.confirmations.at(-1), i18n.floatingBallRestoreAppearanceConfirm);
    assert.deepEqual(ui.state.floatingBall.appearance, createDefaultFloatingBallConfig().appearance);
    assert.deepEqual(ui.state.floatingBall.behavior, createDefaultFloatingBallConfig().behavior);
    assert.equal(JSON.stringify(ui.state.floatingBall.position), positions);
    assert.equal(JSON.stringify(ui.state.floatingBall.actions), actions);
    assert.equal(ui.state.floatingBall.enabled.desktop, true);
    assert.equal(ui.root.querySelector('[data-control="marginPx"]').value, "8");
    assert.equal(ui.root.querySelector('[data-control="hideOnScroll"]').checked, true);
    assert.equal(ui.document.activeElement, buttonByLabel(ui.root, i18n.floatingBallRestoreAppearance));
});

test("floating settings refresh and imports synchronize controls and preview", async (t) => {
    const ui = mount(t);
    const refreshed = createDefaultFloatingBallConfig();
    refreshed.appearance.size = 60;
    refreshed.appearance.marginPx = 18;
    refreshed.position.desktop = {edge: "left", yRatio: 0.4};
    ui.state = {...ui.state, floatingBall: refreshed};
    ui.root.dispatchEvent(new ui.window.Event("sw-floating-ball-refresh"));
    assert.equal(ui.root.querySelector('[data-control="size"]').value, "60");
    assert.equal(ui.root.querySelector('[data-control="marginPx"]').value, "18");
    assert.equal(ui.root.querySelector('[data-control="edge"]').value, "left");
    assert.equal(ui.root.querySelector('[data-control="yRatio"]').value, "40");
    assert.equal(ui.root.querySelector(".sw-floating-ball-settings__preview-ball").style.width, "60px");
    const incoming = createDefaultFloatingBallConfig();
    incoming.appearance.size = 56;
    incoming.appearance.marginPx = 12;
    incoming.behavior.hideOnFullscreen = false;
    importFile(ui, {size: 64, text: async () => serializeFloatingBallSettings(incoming, getBuiltinQuickActions())});
    await settle();
    assert.equal(ui.root.querySelector('[data-control="size"]').value, "56");
    assert.equal(ui.root.querySelector('[data-control="marginPx"]').value, "12");
    assert.equal(ui.root.querySelector('[data-control="hideOnFullscreen"]').checked, false);
    assert.equal(ui.root.querySelector(".sw-floating-ball-settings__preview-ball").style.width, "56px");
    assert.equal(ui.root.querySelector('[data-control="yRatio"]').value, "40", "imports preserve local position controls");
});

test("floating settings UI reserves More by limiting first-layer controls to five actions", (t) => {
    const catalog = Array.from({length: 6}, (_, index) => action(`action-${index}`));
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = catalog.map((item, index) => ({actionId: item.id, enabled: true, firstLayer: index < 5, order: index * 10}));
    const ui = mount(t, {config, catalog});
    const sixth = firstCheckbox(ui.root, "action-5");
    assert.equal(sixth.disabled, true, "a sixth configured action would take the reserved More slot");
    sixth.click();
    assert.equal(ui.patches.length, 0, "disabled control cannot promote the sixth action");
    firstCheckbox(ui.root, "action-0").click();
    assert.equal(firstCheckbox(ui.root, "action-5").disabled, false);
    firstCheckbox(ui.root, "action-5").click();
    assert.equal(ui.state.floatingBall.actions.desktop.filter((entry) => entry.enabled && entry.firstLayer).length, 5);
});

test("floating settings UI adds through the shared picker and removes only selected action", (t) => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [{actionId: "search", enabled: true, firstLayer: true, order: 10}];
    const ui = mount(t, {config});
    const add = ui.root.querySelector("button.sw-floating-ball-settings__add");
    assert.ok(add, "add action uses the shared searchable picker");
    add.click();
    const picker = ui.root.querySelector(".sw-setting__quick-picker");
    assert.ok(picker, "picker must mount after the add button is clicked");
    assert.ok(picker.querySelector("input"), "picker provides search");
    const candidate = picker.querySelector('[data-candidate-id="settings"]');
    assert.ok(candidate);
    candidate.click();
    assert.deepEqual(rowIds(ui.root), ["search", "settings"]);
    buttonByLabel(row(ui.root, "settings"), i18n.quickRemove).click();
    assert.deepEqual(rowIds(ui.root), ["search"]);
    assert.deepEqual(ui.state.floatingBall.actions.desktop.map((entry) => entry.actionId), ["search"]);
});

test("floating settings UI rejects oversized files before reading their text", async (t) => {
    const ui = mount(t);
    let reads = 0;
    importFile(ui, {size: FLOATING_BALL_SETTINGS_MAX_BYTES + 1, async text() { reads += 1; return "[]"; }});
    await settle();
    assert.equal(reads, 0, "oversized files must be rejected before allocating/parsing their text");
    assert.equal(ui.patches.length, 0);
    assert.equal(ui.saves.length, 0);
    assert.equal(ui.messages.at(-1), i18n.floatingBallImportFailed);
});

test("floating settings UI rejects an icon that would exceed the combined export budget", (t) => {
    const dataIcon = (size) => `data:image/png;base64,${"A".repeat(size)}`;
    const config = createDefaultFloatingBallConfig();
    config.actions.sidebar[0].icon = dataIcon(180000);
    config.actions.mobile[0].icon = dataIcon(180000);
    const ui = mount(t, {config});
    const baseline = JSON.stringify(ui.state.floatingBall);
    row(ui.root, "search").querySelector('[data-control="icon"]').click();
    assert.equal(ui.iconPickers.length, 1);
    ui.iconPickers[0].onSelect(dataIcon(180000));
    assert.equal(ui.patches.length, 0, "a candidate that makes the complete transfer exceed 512 KiB is rejected");
    assert.equal(JSON.stringify(ui.state.floatingBall), baseline, "rejected icon keeps the prior presentation");
    assert.equal(ui.messages.at(-1), i18n.floatingBallImportFailed, "the existing bounded-transfer message is reused");
});

test("floating settings UI import stays busy and ignores duplicate requests", async (t) => {
    const ui = mount(t);
    const nextConfig = createDefaultFloatingBallConfig();
    nextConfig.enabled.mobile = true;
    let release;
    let reads = 0;
    const pending = new Promise((resolve) => { release = resolve; });
    const file = {size: 32, text() { reads += 1; return pending; }};
    importFile(ui, file);
    const importButton = buttonByLabel(ui.root, i18n.floatingBallImport);
    assert.equal(importButton.disabled, true);
    assert.equal(importButton.getAttribute("aria-busy"), "true");
    importFile(ui, file);
    assert.equal(reads, 1, "a repeated input event while parsing must not start a second read");
    ui.state = {
        ...ui.state,
        floatingBall: {
            ...ui.state.floatingBall,
            position: {...ui.state.floatingBall.position, mobile: {edge: "left", yRatio: 0.32}},
        },
    };
    release(serializeFloatingBallSettings(nextConfig, getBuiltinQuickActions()));
    await settle();
    assert.equal(ui.saves.length, 1);
    assert.equal(ui.state.floatingBall.enabled.mobile, true);
    assert.deepEqual(ui.state.floatingBall.position.mobile, {edge: "left", yRatio: 0.32}, "import reads current local positions after its asynchronous file read");
    assert.equal(importButton.disabled, false);
    assert.notEqual(importButton.getAttribute("aria-busy"), "true");
});

for (const condition of ["removed", "unloading"]) {
    test(`floating settings UI import does not write after settings ${condition}`, async (t) => {
        const ui = mount(t);
        const nextConfig = createDefaultFloatingBallConfig();
        nextConfig.enabled.desktop = true;
        let release;
        const pending = new Promise((resolve) => { release = resolve; });
        importFile(ui, {size: 32, text: () => pending});
        assert.equal(buttonByLabel(ui.root, i18n.floatingBallImport).disabled, true);
        if (condition === "removed") ui.root.remove();
        else ui.host.isUnloading = true;
        release(serializeFloatingBallSettings(nextConfig, getBuiltinQuickActions()));
        await settle();
        assert.equal(ui.patches.length, 0, "late import cannot mutate settings after its owner is gone");
        assert.equal(ui.saves.length, 0, "late import cannot overwrite the action registry");
        assert.equal(ui.messages.length, 0, "detached UI must not emit a stale success message");
    });
}

test("floating settings UI preview is live but never executes production actions", (t) => {
    const ui = mount(t);
    const preview = ui.root.querySelector(".sw-floating-ball-settings__preview");
    assert.ok(preview, "settings expose a real preview element");
    const buttons = [...preview.querySelectorAll("button")];
    assert.ok(buttons.length > 0, "preview contains simulated action controls");
    assert.ok(preview.querySelector('[data-action-id="search"]'), "preview includes the configured search action");
    buttons.forEach((button) => button.click());
    const search = preview.querySelector('[data-action-id="search"]');
    search.click();
    assert.equal(preview.querySelector('[role="status"]').textContent,
        i18n.floatingBallPreviewResult.replace("{x}", search.textContent), "click simulates an accessible result");
    assert.equal(ui.executions.length, 0, "preview must not execute host/navigation actions");
    assert.equal(ui.patches.length, 0, "simulation must not write settings");
    assert.equal(ui.saves.length, 0, "simulation must not overwrite quick actions");
    firstCheckbox(ui.root, "search").click();
    assert.equal(preview.querySelector('[data-action-id="search"]'), null, "preview immediately reflects a changed first-layer configuration");
    selectSurface(ui, "mobile");
    assert.ok(preview.querySelector('[data-action-id="search"]'), "switching surfaces displays its independent configuration");
});

test("floating settings preview renders the fallback switcher only once", (t) => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [];
    const ui = mount(t, {config});
    const switchers = ui.root.querySelectorAll('.sw-floating-ball-settings__preview [data-action-id="switcher"]');
    assert.equal(switchers.length, 1, "empty configurations use one model-provided fallback switcher");

    const configured = createDefaultFloatingBallConfig();
    configured.actions.desktop = [{actionId: "switcher", enabled: true, firstLayer: true, order: 10}];
    const configuredUi = mount(t, {config: configured});
    assert.equal(
        configuredUi.root.querySelectorAll('.sw-floating-ball-settings__preview [data-action-id="switcher"]').length,
        1,
        "an explicitly configured switcher is not duplicated by the preview shell",
    );
});

test("floating settings UI import and restore respect cancelled confirmations", async (t) => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [{actionId: "search", enabled: true, firstLayer: true, order: 10}];
    const ui = mount(t, {config, confirm: false});
    const before = JSON.stringify(ui.state);
    buttonByLabel(ui.root, i18n.floatingBallRestoreDefaults).click();
    assert.equal(ui.confirmations.at(-1), i18n.floatingBallRestoreConfirm);
    buttonByLabel(ui.root, i18n.floatingBallRestoreAppearance).click();
    assert.equal(ui.confirmations.at(-1), i18n.floatingBallRestoreAppearanceConfirm);
    const incoming = createDefaultFloatingBallConfig();
    incoming.enabled.mobile = true;
    importFile(ui, {size: 32, text: async () => serializeFloatingBallSettings(incoming, getBuiltinQuickActions())});
    await settle();
    assert.equal(ui.confirmations.at(-1), i18n.floatingBallImportConfirm);
    assert.equal(ui.patches.length, 0);
    assert.equal(ui.saves.length, 0);
    assert.equal(JSON.stringify(ui.state), before, "cancelling either replace operation preserves configuration");
});

test("quick-action settings shared transfer accepts the floating-ball envelope", async (t) => {
    const ui = mount(t, {transferOnly: true});
    assert.ok(ui.root.matches(".sw-setting__quick-transfer"));
    assert.ok(buttonByLabel(ui.root, i18n.quickImport));
    const incoming = createDefaultFloatingBallConfig();
    incoming.enabled.sidebar = true;
    incoming.actions.sidebar = [];
    importFile(ui, {size: 64, text: async () => serializeFloatingBallSettings(incoming, [getBuiltinQuickActions()[1]])});
    await settle();
    assert.equal(ui.patches.length, 1);
    assert.equal(ui.saves.length, 1);
    assert.equal(ui.state.floatingBall.enabled.sidebar, true);
    assert.deepEqual(ui.state.floatingBall.actions.sidebar, []);
    assert.deepEqual(ui.saves[0].map((entry) => entry.id), ["search"]);
    assert.equal(ui.messages.at(-1), i18n.floatingBallImportDone);
});

test("quick-action settings legacy array transfer preserves floating-ball configuration", async (t) => {
    const config = createDefaultFloatingBallConfig();
    config.enabled.desktop = true;
    config.position.desktop = {edge: "left", yRatio: 0.22};
    config.actions.desktop = [{actionId: "search", enabled: true, firstLayer: false, order: 10}];
    const before = JSON.stringify(config);
    const ui = mount(t, {config, transferOnly: true});
    const incoming = [getBuiltinQuickActions()[3]];
    importFile(ui, {size: 64, text: async () => JSON.stringify(incoming)});
    await settle();
    assert.equal(ui.saves.length, 1);
    assert.deepEqual(ui.saves[0].map((entry) => entry.id), ["settings"]);
    assert.equal(JSON.stringify(ui.state.floatingBall), before,
        "legacy transfer only changes the shared action catalog, not floating-ball switches/positions/descriptors");
});
