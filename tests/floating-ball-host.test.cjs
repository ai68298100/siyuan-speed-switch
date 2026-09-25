const test = require("node:test");
const assert = require("node:assert/strict");
const {createRequire} = require("node:module");
const ts = require("typescript");
const {JSDOM} = require("jsdom");
const {readSourceFile} = require("./source-scan.cjs");
const {createDefaultFloatingBallConfig, selectFloatingBallFirstLayer, resolveFloatingBallClickAction} = require("../src/floating-ball-model.js");
const {createFloatingBallActionExecutor} = require("../src/floating-ball-actions.js");
const {selectFloatingBallMoreActions, createFloatingBallPanelController: createRealPanel} = require("../src/floating-ball-panel.js");
const {createQuickActionRegistry, resolveQuickActionSupport, resolveQuickActionLabel} = require("../src/quick-actions.js");
const i18n = require("../src/i18n/zh-CN.json");

// Run the actual host methods, keeping imports for unrelated plugin features out
// of this harness. AST member boundaries survive formatting and nested closures.
const indexSource = readSourceFile("src/index.ts");
const sourceFile = ts.createSourceFile("index.ts", indexSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const pluginClass = sourceFile.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "SpeedSwitchPlugin");
assert.ok(pluginClass, "production plugin class must be found");
const methodNames = [
    "createFloatingBallSurface", "destroyFloatingBallSurface", "persistFloatingBallPosition",
    "suspendFABForDialog", "updateFloatingBallVisibility", "executeFloatingBallSurfaceAction", "getFloatingBallActions",
    "refreshFloatingBallPanels",
    // T-6869：悬浮球 onSwitcher 恢复链依赖的平台路由方法（openPlatformFromBall →
    // openPlatformSurface → notePlatformSurface / getAvailablePlatformSurfaces）。
    "openPlatformFromBall", "openPlatformSurface", "notePlatformSurface", "getAvailablePlatformSurfaces",
];
const methods = methodNames.map((name) => {
    const matches = pluginClass.members.filter((node) => ts.isMethodDeclaration(node) && node.name?.getText(sourceFile) === name);
    assert.equal(matches.length, 1, `production host method ${name} must have one implementation`);
    return matches[0].getText(sourceFile);
});
function compileHost(transform = (source) => source) {
    return ts.transpileModule(transform(`class FloatingBallHost {${methods.join("\n")}}`), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
        fileName: "floating-ball-host.ts",
    }).outputText;
}

function mount(t, options = {}) {
    const dom = new JSDOM("<!doctype html><body><aside><input class='sw__search'></aside></body>");
    const {document} = dom.window;
    t.after(() => dom.window.close());
    const calls = {created: [], panels: [], switcher: [], settings: [], home: [], messages: [], warnings: []};
    let settings = {floatingBall: options.config || createDefaultFloatingBallConfig()};
    const createFloatingBallUi = (config) => {
        const root = document.createElement("div");
        root.dataset.surface = config.surface;
        let state = "docked";
        const controller = {
            config, patches: [], suspended: false, destroyed: false, mountCount: 0, restoreCount: 0, executionCount: 0,
            update(patch) { this.patches.push(patch); },
            mount() { this.mountCount += 1; document.body.appendChild(root); return root; },
            getElement() { return this.destroyed ? null : root; },
            setSuspended(value) { this.suspended = value; },
            setState(value) { state = value; },
            getState() { return state; },
            beginExecution() { this.executionCount += 1; return () => { this.restoreCount += 1; }; },
            destroy() { this.destroyed = true; root.remove(); },
        };
        calls.created.push(controller);
        return controller;
    };
    const createFloatingBallPanelController = (config) => {
        if (options.realPanels) {
            const panel = (options.createRealPanel || createRealPanel)(config);
            calls.panels.push(panel);
            t.after(() => panel.destroy());
            return panel;
        }
        const panel = {
            config, closeCount: 0, openCount: 0, destroyed: false,
            mount() {}, update(next) { this.config = {...this.config, ...next}; },
            openMore() { this.openCount += 1; this.config.onOpenMore(); },
            closeMore() { this.closeCount += 1; this.config.onCloseMore(); },
            destroy() { this.destroyed = true; },
        };
        calls.panels.push(panel);
        return panel;
    };
    const dependencies = {
        window: dom.window, document, createFloatingBallUi, createFloatingBallPanelController, createFloatingBallActionExecutor,
        resolveFloatingBallClickAction, resolveQuickActionLabel,
        // T-6869：openPlatformSurface/notePlatformSurface/getAvailablePlatformSurfaces
        // 提取自生产类，其引用的平台模型导入与模块常量需在桩作用域提供。
        ...require("../src/platform-surface-model.js"),
        PLATFORM_SURFACES: ["switcher", "workbench", "studio"],
        openSecondPanel() { calls.home.push(this); },
        showMessage: (...args) => calls.messages.push(args),
        MESSAGE_DEFAULT_MS: 2500,
        logger: {warn: (...args) => calls.warnings.push(args)},
    };
    const compiled = compileHost(options.transformSource);
    const Host = new Function(...Object.keys(dependencies), `${compiled}\nreturn FloatingBallHost;`)(...Object.values(dependencies));
    const host = new Host();
    Object.assign(host, {
        floatingBallUis: new Map(), floatingBallPanels: new Map(), fabModalDepth: 0,
        floatingBallUi: null, fabElement: null,
        isMobile: options.mobile === true, sidebarElement: document.querySelector("aside"),
        app: {plugins: []}, quickActionAdapters: new Map(), quickActionRegistry: null,
        i18n: {...i18n, switchTabs: "Switcher", floatingBallMore: "More", close: "Close", quickActionUnavailable: "Unavailable", quickActionFailed: "Failed"},
        getSettings: () => settings,
        updateSettings(patch) { settings = {...settings, ...patch}; },
        getFloatingBallActions: () => [], getQuickActionSupport: () => "supported", getQuickActionDeclaredTargets: () => undefined,
        getDockByType: () => null, openJournal() {},
        showSwitcher: (...args) => calls.switcher.push(args),
        openSetting: (...args) => calls.settings.push(args),
    });
    return {host, calls, document, get config() { return settings.floatingBall; }};
}

const settleAction = () => new Promise((resolve) => setImmediate(resolve));

function assertConfiguredClickRouting(t, options = {}) {
    const {host, config, calls} = mount(t, options);
    const routed = [];
    host.executeFloatingBallSurfaceAction = (surface, action) => routed.push([surface, action.id]);
    host.getFloatingBallActions = () => [
        {id: "search", kind: "builtin", value: "search", enabled: true},
        {id: "home", kind: "builtin", value: "home", enabled: true},
    ];
    config.clickAction = {desktop: "search", sidebar: "home", mobile: "__floating-ball-more__"};
    const desktop = host.createFloatingBallSurface("desktop");
    const sidebar = host.createFloatingBallSurface("sidebar");
    const mobile = host.createFloatingBallSurface("mobile");
    desktop.config.onOpenSwitcher();
    sidebar.config.onOpenSwitcher();
    mobile.config.onOpenSwitcher();
    assert.deepEqual(routed, [["desktop", "search"], ["sidebar", "home"]], "each click reads its selected surface action");
    assert.equal(calls.panels[2].openCount, 1, "More opens the mobile panel without dispatching a command");
    config.clickAction.desktop = "home";
    desktop.config.onOpenSwitcher();
    assert.deepEqual(routed.at(-1), ["desktop", "home"], "mounted controllers read the latest selection");
}

test("floating ball host primary click uses each surface selection and live changes", (t) => {
    assertConfiguredClickRouting(t);
});

test("floating ball host primary click falls back for missing, disabled and unavailable actions", (t) => {
    const {host, config} = mount(t);
    const routed = [];
    host.executeFloatingBallSurfaceAction = (_surface, action) => routed.push(action.id);
    const candidate = {id: "external", kind: "command", value: "plugin::run", enabled: true, available: true};
    host.getFloatingBallActions = () => [candidate];
    const controller = host.createFloatingBallSurface("desktop");
    config.clickAction.desktop = "missing";
    controller.config.onOpenSwitcher();
    config.clickAction.desktop = "external";
    candidate.available = false;
    controller.config.onOpenSwitcher();
    candidate.available = true;
    candidate.enabled = false;
    controller.config.onOpenSwitcher();
    candidate.enabled = true;
    config.actions.desktop = [{actionId: "external", enabled: false, firstLayer: false, order: 10}];
    controller.config.onOpenSwitcher();
    config.actions.desktop[0].enabled = true;
    host.getQuickActionSupport = () => "unsupported";
    controller.config.onOpenSwitcher();
    assert.deepEqual(routed, ["switcher", "switcher", "switcher", "switcher", "switcher"]);
});

function assertMobileClickOptIn(t, options = {}) {
    const {host, config} = mount(t, {...options, mobile: true});
    const routed = [];
    const candidate = {id: "external", kind: "command", value: "plugin::run", enabled: true, available: true};
    host.executeFloatingBallSurfaceAction = (_surface, action) => routed.push(action.id);
    host.getFloatingBallActions = () => [candidate];
    host.getQuickActionSupport = () => "unknown";
    config.clickAction.mobile = "external";
    config.actions.mobile = [{actionId: "external", enabled: true, firstLayer: false, order: 10}];
    const controller = host.createFloatingBallSurface("mobile");
    controller.config.onOpenSwitcher();
    assert.equal(routed.at(-1), "switcher", "unknown capabilities stay conservative before opt-in");
    config.actions.mobile[0].mobileOverride = true;
    controller.config.onOpenSwitcher();
    assert.equal(routed.at(-1), "external", "explicit opt-in reaches the executor");
    candidate.available = false;
    controller.config.onOpenSwitcher();
    assert.equal(routed.at(-1), "switcher", "provider loss is never overridden");
    candidate.available = true;
    host.getQuickActionSupport = () => "unsupported";
    controller.config.onOpenSwitcher();
    assert.equal(routed.at(-1), "switcher", "explicit unsupported metadata is never overridden");
}

test("floating ball host primary mobile click tries unknown actions only after explicit opt-in", (t) => {
    assertMobileClickOptIn(t);
});

test("floating ball host click contracts reject fixed routing and removed opt-in in memory", (t) => {
    const original = methods.join("\n");
    for (const [target, replacement, contract, failure] of [
        ['current.clickAction?.[surface] || "switcher"', '"switcher"', assertConfiguredClickRouting, "each click reads its selected surface action"],
        ['                        descriptor,', '                        descriptor: undefined,', assertMobileClickOptIn, "explicit opt-in reaches the executor"],
    ]) {
        assert.equal(original.split(target).length - 1, 1, `mutation target exists exactly once: ${target}`);
        const transformSource = (source) => source.replace(target, replacement);
        assert.throws(() => contract(t, {transformSource}), (error) => error instanceof assert.AssertionError && error.message.includes(failure),
            `the production mutation must violate its named behavioral contract: ${target}`);
    }
});

function assertRealMobilePanel(t, options = {}) {
    const {host, config} = mount(t, {...options, realPanels: true, mobile: true});
    const routed = [];
    const external = {id: "external", kind: "command", value: "plugin::run", targets: ["desktop", "sidebar"], enabled: true, available: true, label: "External"};
    host.getFloatingBallActions = () => [external, {id: "search", kind: "builtin", value: "search", label: "搜索", icon: "iconSearch", enabled: true}];
    host.getQuickActionSupport = (action, surface) => resolveQuickActionSupport(action.kind, action.value, surface, action.declaredTargets);
    host.executeFloatingBallSurfaceAction = (_surface, action) => routed.push(action.id);
    config.actions.mobile = [
        {actionId: "external", enabled: true, firstLayer: true, order: 10, mobileOverride: true},
        {actionId: "search", enabled: true, firstLayer: true, order: 20, label: "我的查找", icon: "🚀"},
    ];
    const controller = host.createFloatingBallSurface("mobile");
    const panel = host.floatingBallPanels.get("mobile");
    const root = panel.getElement();
    const first = (id) => root.querySelector(`.sw__floating-ball-first-layer [data-action-id='${id}']`);
    assert.ok(first("external"), "manual mobile opt-in reaches the real panel through the host support callback");
    assert.equal(first("external").disabled, false, "the unverified warning does not disable an opted-in action");
    first("external").click();
    assert.deepEqual(routed, ["external"]);
    assert.equal(first("search").querySelector(".sw__floating-ball-action-label").textContent, "我的查找", "a custom builtin label wins over localization");
    assert.equal(first("search").querySelector(".sw__floating-ball-action-icon").textContent, "🚀");
    external.available = false;
    external.providerMissing = true;
    controller.config.onBeforeTargeting();
    assert.equal(first("external"), null);
    const unavailable = root.querySelector(".sw__floating-ball-more-list [data-action-id='external']");
    assert.ok(unavailable, "missing providers retain a recovery row");
    assert.equal(unavailable.disabled, true, "mobile opt-in cannot override provider loss");
    unavailable.click();
    assert.deepEqual(routed, ["external"], "a missing provider is never dispatched");
}

test("floating ball real panel honors mobile opt-in, custom builtin labels and provider loss", (t) => {
    assertRealMobilePanel(t);
});

test("floating ball real panel contracts reject warning-based disabling and lost builtin overrides in memory", (t) => {
    const original = readSourceFile("src/floating-ball-panel.js");
    for (const [target, replacement, failure] of [
        ['if (action.availability && action.availability.status !== "supported")', 'if (reason)', "the unverified warning does not disable an opted-in action"],
        ['if (action?.labelOverride) return action.labelOverride;', '', "a custom builtin label wins over localization"],
    ]) {
        assert.equal(original.split(target).length - 1, 1, `mutation target exists exactly once: ${target}`);
        const module = {exports: {}};
        const requirePanel = createRequire(require.resolve("../src/floating-ball-panel.js"));
        new Function("require", "module", "exports", original.replace(target, replacement))(requirePanel, module, module.exports);
        assert.throws(() => assertRealMobilePanel(t, {createRealPanel: module.exports.createFloatingBallPanelController}),
            (error) => error instanceof assert.AssertionError && error.message.includes(failure),
            `the actual panel mutation must violate its named behavioral contract: ${target}`);
    }
});

test("floating ball host forwards size, margin and snap on creation and live configuration updates", (t) => {
    const {host, calls, config} = mount(t);
    Object.assign(config.appearance, {size: 64, marginPx: 20});
    config.behavior.snap = false;
    const desktop = host.createFloatingBallSurface("desktop");
    assert.equal(desktop.config.size, 64);
    assert.equal(desktop.config.marginPx, 20);
    assert.equal(desktop.config.snap, false);
    Object.assign(config.appearance, {size: 52, marginPx: 14});
    config.behavior.snap = true;
    assert.equal(host.createFloatingBallSurface("desktop"), desktop);
    assert.equal(calls.created.length, 1, "settings changes must reuse the mounted controller");
    assert.equal(desktop.patches.at(-1).size, 52);
    assert.equal(desktop.patches.at(-1).marginPx, 14);
    assert.equal(desktop.patches.at(-1).snap, true);
    const sidebar = host.createFloatingBallSurface("sidebar");
    assert.equal(sidebar.config.size, undefined, "sidebar uses its compact controller default");
    host.sidebarElement.getBoundingClientRect = () => ({left: 500, right: 740, top: 80, bottom: 780});
    assert.deepEqual(sidebar.config.resolveBounds(), {left: 500, right: 740, top: 80, bottom: 780});
    assert.equal(sidebar.config.resolveHost(), host.sidebarElement);
    const nextPosition = {edge: "left", yRatio: 0.25, xRatio: 0.32};
    desktop.config.onPositionChange(nextPosition);
    assert.deepEqual(host.getSettings().floatingBall.position.desktop, nextPosition);
    assert.deepEqual(host.getSettings().floatingBall.position.mobile, {edge: "right", yRatio: 0.72});
});

test("floating ball host honors yieldToModals off and releases each dialog callback once", (t) => {
    const {host, calls, config} = mount(t, {mobile: true});
    config.enabled.mobile = true;
    config.behavior.yieldToModals = false;
    host.updateFloatingBallVisibility();
    const controller = host.floatingBallUis.get("mobile");
    let released = 0;
    const release = host.suspendFABForDialog(() => { released += 1; });
    assert.equal(host.fabModalDepth, 1);
    assert.equal(controller.suspended, false);
    assert.equal(host.fabElement.classList.contains("sw__fab--hidden"), false);
    controller.config.onOpenSwitcher();
    assert.equal(calls.switcher.length, 1, "yield disabled must also permit the switcher callback");
    assert.ok(calls.panels[0].closeCount > 0, "dialog still closes the action panel");
    release();
    release();
    assert.equal(released, 1);
    assert.equal(host.fabModalDepth, 0);
});

test("floating ball host tracks nested dialogs while surfaces are enabled and modal preference changes", (t) => {
    const {host, calls, config} = mount(t, {mobile: true});
    const outer = host.suspendFABForDialog();
    assert.equal(host.fabModalDepth, 1, "dialogs count before any surface is mounted");
    config.enabled.mobile = true;
    host.updateFloatingBallVisibility();
    const controller = host.floatingBallUis.get("mobile");
    assert.equal(controller.suspended, true);
    assert.equal(host.fabElement.classList.contains("sw__fab--hidden"), true);
    controller.config.onOpenSwitcher();
    assert.equal(calls.switcher.length, 0);
    const inner = host.suspendFABForDialog();
    config.behavior.yieldToModals = false;
    host.updateFloatingBallVisibility();
    assert.equal(controller.suspended, false);
    assert.equal(host.fabElement.classList.contains("sw__fab--hidden"), false);
    controller.config.onOpenSwitcher();
    assert.equal(calls.switcher.length, 1);
    config.behavior.yieldToModals = true;
    host.updateFloatingBallVisibility();
    assert.equal(controller.suspended, true);
    outer();
    assert.equal(host.fabModalDepth, 1);
    assert.equal(controller.suspended, true, "one remaining dialog still owns suspension");
    config.enabled.mobile = false;
    host.updateFloatingBallVisibility();
    assert.equal(controller.destroyed, true);
    config.enabled.mobile = true;
    host.updateFloatingBallVisibility();
    const replacement = host.floatingBallUis.get("mobile");
    assert.notEqual(replacement, controller);
    assert.equal(replacement.suspended, true);
    inner();
    assert.equal(host.fabModalDepth, 0);
    assert.equal(replacement.suspended, false, "release applies to current controllers, including replacements");
    assert.equal(host.fabElement.classList.contains("sw__fab--hidden"), false);
    outer();
    inner();
    assert.equal(host.fabModalDepth, 0);
});

test("floating ball host mounts desktop and mobile only after sidebar withdrawal", (t) => {
    const {host, config} = mount(t);
    Object.assign(config.enabled, {desktop: true, sidebar: true, mobile: true});
    host.updateFloatingBallVisibility();
    assert.equal(host.floatingBallUis.has("sidebar"), false, "ADR 0072: the sidebar portal is withdrawn");
    const desktop = host.floatingBallUis.get("desktop");
    assert.ok(desktop);
    host.isMobile = true;
    host.updateFloatingBallVisibility();
    assert.equal(desktop.destroyed, true);
    assert.deepEqual([...host.floatingBallUis.keys()], ["mobile"]);
    assert.equal(host.floatingBallUi, host.floatingBallUis.get("mobile"));
});

test("floating ball host executes Home through the shared executor and restores busy state", async (t) => {
    const {host, calls} = mount(t);
    const controller = host.createFloatingBallSurface("desktop");
    host.executeFloatingBallSurfaceAction("desktop", {id: "home", kind: "builtin", value: "home"});
    await settleAction();
    assert.equal(calls.home.length, 1, "component panel must open exactly once");
    assert.equal(calls.home[0], host, "component panel receives the actual plugin host");
    assert.equal(controller.executionCount, 1);
    assert.equal(controller.restoreCount, 1);
    assert.ok(calls.panels[0].closeCount > 0);
    assert.deepEqual(calls.messages, []);
});

test("floating ball host routes management to its settings tab and builtins to host settings/search", async (t) => {
    const {host, calls, document} = mount(t);
    host.createFloatingBallSurface("desktop");
    host.createFloatingBallSurface("sidebar");
    calls.panels[0].config.onManageSettings();
    assert.deepEqual(calls.settings, [["floatingBall"]]);
    host.executeFloatingBallSurfaceAction("desktop", {kind: "builtin", value: "settings"});
    host.executeFloatingBallSurfaceAction("desktop", {kind: "builtin", value: "search"});
    await settleAction();
    assert.deepEqual(calls.settings, [["floatingBall"], []]);
    assert.deepEqual(calls.switcher, [[true]]);
    host.executeFloatingBallSurfaceAction("sidebar", {kind: "builtin", value: "search"});
    await settleAction();
    assert.equal(document.activeElement, host.sidebarElement.querySelector(".sw__search"));
    assert.equal(calls.switcher.length, 1, "sidebar search focuses its existing surface");
});

test("floating ball host reports unavailable and failed actions and releases busy state", async (t) => {
    const {host, calls} = mount(t);
    const controller = host.createFloatingBallSurface("desktop");
    host.executeFloatingBallSurfaceAction("desktop", {kind: "adapter", value: "missing/action"});
    await settleAction();
    host.quickActionAdapters.set("broken", async () => { throw new Error("provider failed"); });
    host.executeFloatingBallSurfaceAction("desktop", {kind: "adapter", value: "broken/action"});
    await settleAction();
    assert.deepEqual(calls.messages.map((entry) => [entry[0], entry[2]]), [["Unavailable", "error"], ["Failed", "error"]]);
    assert.equal(controller.executionCount, 2);
    assert.equal(controller.restoreCount, 2);
});

test("floating ball host catalogue follows provider unload/reload and command/dock availability without losing configuration", (t) => {
    const {host, config} = mount(t);
    // This case uses the production prototype catalogue rather than the small
    // empty catalogue stub used by the independent lifecycle scenarios above.
    delete host.getFloatingBallActions;
    const saved = [
        {id: "registered-adapter", label: "Saved adapter", kind: "adapter", value: "demo/run", declaredTargets: ["desktop"]},
        {id: "plugin-command", label: "Saved command", kind: "command", value: "demo-plugin::run"},
        {id: "plugin-dock", label: "Saved dock", kind: "dock", value: "demo-dock"},
    ];
    host.getQuickActions = () => saved;
    host.getQuickActionPickerCandidates = () => [
        {action: {...saved[0], id: "duplicate-picker-candidate"}},
        {action: {id: "home", label: "Home", kind: "builtin", value: "home"}},
    ];
    host.quickActionRegistry = createQuickActionRegistry();
    const provider = {id: "demo", name: "Demo provider", targets: ["desktop"], actions: [{value: "demo/run", label: "Run"}]};
    host.quickActionRegistry.register(provider, () => {});
    config.actions.desktop = saved.map((action, index) => ({actionId: action.id, enabled: true, firstLayer: true, order: index * 10}));
    const originalConfig = JSON.parse(JSON.stringify(config.actions.desktop));
    const firstIds = (catalogue) => selectFloatingBallFirstLayer(config, "desktop", catalogue).map((action) => action.actionId);
    const moreRows = (catalogue) => selectFloatingBallMoreActions(config, "desktop", catalogue);

    let catalogue = host.getFloatingBallActions();
    assert.deepEqual(catalogue.map((action) => action.id), [...saved.map((action) => action.id), "home"], "saved identities win over duplicate picker candidates");
    assert.equal(catalogue[0].available, true);
    assert.equal(catalogue[0].providerName, "Demo provider");
    assert.equal(catalogue[1].available, false, "an absent plugin command cannot enter the first layer");
    assert.equal(catalogue[2].available, false, "an absent dock cannot enter the first layer");
    assert.deepEqual(firstIds(catalogue), ["registered-adapter", "__floating-ball-more__"]);
    assert.deepEqual(moreRows(catalogue).map((action) => [action.actionId, action.availability.status, action.availability.reason]), [
        ["plugin-command", "unknown", "provider-missing"], ["plugin-dock", "unknown", "provider-missing"],
    ]);

    host.quickActionRegistry.unregister("demo");
    catalogue = host.getFloatingBallActions();
    assert.equal(catalogue[0].available, false, "provider unregister invalidates the saved adapter immediately");
    assert.equal(catalogue[0].providerMissing, true);
    assert.deepEqual(firstIds(catalogue), ["switcher", "__floating-ball-more__"]);
    assert.deepEqual(moreRows(catalogue).map((action) => [action.actionId, action.availability.status]), [
        ["registered-adapter", "unknown"], ["plugin-command", "unknown"], ["plugin-dock", "unknown"],
    ]);

    host.quickActionRegistry.register(provider, () => {});
    catalogue = host.getFloatingBallActions();
    assert.deepEqual(firstIds(catalogue), ["registered-adapter", "__floating-ball-more__"]);
    assert.equal(catalogue[0].providerMissing, undefined, "reloading a provider must clear its missing marker");
    host.app.plugins = [{name: "demo-plugin", commands: [{langKey: "run", callback() {}}]}];
    host.getDockByType = (type) => type === "demo-dock" ? {toggleModel() {}} : null;
    catalogue = host.getFloatingBallActions();
    assert.deepEqual(firstIds(catalogue), ["registered-adapter", "plugin-command", "plugin-dock", "__floating-ball-more__"]);
    assert.deepEqual(moreRows(catalogue), []);
    assert.deepEqual(config.actions.desktop, originalConfig, "availability changes never remove or reorder user descriptors");
    assert.equal(saved.some((action) => Object.hasOwn(action, "providerMissing")), false, "catalogue status does not mutate persisted actions");
});

test("floating ball host refreshes real first-layer and More buttons before drag/open and dismisses overlays", (t) => {
    const {host, config} = mount(t, {realPanels: true});
    delete host.getFloatingBallActions;
    const saved = [
        {id: "adapter", label: "Adapter", kind: "adapter", value: "demo/run", declaredTargets: ["desktop"]},
        {id: "command", label: "Command", kind: "command", value: "external::open"},
    ];
    host.getQuickActions = () => saved;
    host.getQuickActionPickerCandidates = () => [];
    host.quickActionRegistry = createQuickActionRegistry();
    const provider = {id: "demo", name: "Demo", targets: ["desktop"], actions: [{value: "demo/run", label: "Run"}]};
    const plugin = {name: "external", commands: [{langKey: "open", callback() {}}]};
    host.quickActionRegistry.register(provider, () => {});
    host.app.plugins = [plugin];
    config.actions.desktop = saved.map((action, index) => ({actionId: action.id, enabled: true, firstLayer: true, order: index * 10}));
    const controller = host.createFloatingBallSurface("desktop");
    const panel = host.floatingBallPanels.get("desktop");
    const root = panel.getElement();
    const firstIds = () => [...root.querySelectorAll(".sw__floating-ball-first-layer [data-action-id]")].map((button) => button.dataset.actionId);
    const moreButton = (id) => root.querySelector(`.sw__floating-ball-more-list [data-action-id='${id}']`);
    assert.deepEqual(firstIds(), ["adapter", "command", "__floating-ball-more__"]);

    // Commands can disappear without a registry broadcast. The next gesture
    // must refresh both catalogue metadata and the already mounted real panel.
    host.quickActionRegistry.unregister("demo");
    host.app.plugins = [];
    controller.config.onBeforeTargeting();
    assert.deepEqual(firstIds(), ["switcher", "__floating-ball-more__"]);
    for (const id of ["adapter", "command"]) {
        assert.equal(moreButton(id).disabled, true);
        assert.equal(moreButton(id).getAttribute("aria-disabled"), "true");
        assert.ok(moreButton(id).getAttribute("aria-label").includes(i18n.floatingBallProviderMissing));
    }

    host.quickActionRegistry.register(provider, () => {});
    host.app.plugins = [plugin];
    controller.config.onOpenMore();
    assert.equal(panel.isMoreOpen(), true);
    assert.equal(root.querySelector(".sw__floating-ball-first-layer").hidden, true);
    assert.deepEqual(firstIds(), ["adapter", "command", "__floating-ball-more__"]);
    for (const id of ["adapter", "command"]) {
        assert.equal(moreButton(id).disabled, false, "reloaded action regains a keyboard-equivalent More button");
        assert.equal(moreButton(id).getAttribute("aria-disabled"), null);
    }
    controller.config.onDismissOverlays();
    assert.equal(panel.isMoreOpen(), false);
    assert.equal(controller.getState(), "docked");
    assert.deepEqual(config.actions.desktop.map((action) => action.actionId), ["adapter", "command"]);
});
