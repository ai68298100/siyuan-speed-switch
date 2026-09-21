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
        getQuickActionSupport: (action, surface) => resolveQuickActionSupport(action.kind, action.value, surface, action.declaredTargets ?? action.targets),
        getQuickActionPickerCandidates: () => catalog,
        executeQuickAction: (...args) => executions.push(args),
        executeFloatingBallSurfaceAction: (...args) => executions.push(args),
        showSwitcher: (...args) => executions.push(args),
    };
    const constants = compile(readSourceFile("src/constants.ts"), "constants.ts", srcRequire);
    const module = compile(readSourceFile("src/settings-sections.ts"), "settings-sections.ts", (name) => {
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
    return {root, window, document, host, messages, patches, saves, executions, confirmations,
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
    assert.deepEqual(rowIds(ui.root), ["journal", "search", "settings"]);
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
