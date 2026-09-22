const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {
    createFloatingBallPanelController,
    collectFloatingBallActions,
    selectFloatingBallMoreActions,
} = require("../src/floating-ball-panel.js");
const {
    createDefaultFloatingBallConfig,
} = require("../src/floating-ball-model.js");
const {createQuickActionRegistry} = require("../src/quick-actions.js");

function action(id, extra = {}) {
    return {
        id,
        actionId: id,
        value: id,
        label: id,
        icon: "iconPlugin",
        kind: "adapter",
        targets: ["desktop", "sidebar", "mobile"],
        ...extra,
    };
}

test("collectFloatingBallActions merges builtins and registry providers once", () => {
    const registry = createQuickActionRegistry();
    registry.register({
        id: "demo",
        name: "Demo",
        targets: ["desktop"],
        actions: [{value: "run", label: "运行", kind: "adapter", icon: "iconPlugin"}],
    });
    const actions = collectFloatingBallActions({registry});
    assert.ok(actions.some((item) => item.actionId === "search"));
    assert.ok(actions.some((item) => item.actionId === "run" || item.value === "run"));
    assert.equal(new Set(actions.map((item) => `${item.kind}:${item.value}`)).size, actions.length);
});

test("more selector excludes first layer and unsupported entries", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [
        {actionId: "journal", enabled: true, firstLayer: true, order: 10},
        {actionId: "provider-a", enabled: true, firstLayer: false, order: 20},
        {actionId: "provider-b", enabled: true, firstLayer: false, order: 30},
        {actionId: "missing", enabled: true, firstLayer: false, order: 40},
    ];
    const result = selectFloatingBallMoreActions(config, "desktop", [
        action("journal", {kind: "builtin", value: "journal", targets: ["desktop"]}),
        action("provider-a", {targets: ["desktop"]}),
        action("provider-b", {targets: ["mobile"]}),
    ]);
    assert.deepEqual(result.map((item) => item.actionId), ["provider-a", "missing"]);
    assert.equal(result[1].availability.status, "unknown");
});

test("unknown-capability actions stay visible but disabled", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.mobile = [
        {actionId: "command-x", enabled: true, firstLayer: false, order: 10},
    ];
    const result = selectFloatingBallMoreActions(config, "mobile", [
        action("command-x", {kind: "command", value: "x", targets: ["mobile"]}),
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].availability.status, "unknown");
});

test("mobile unknown actions require an explicit try flag while keeping custom presentation", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.mobile = [{
        actionId: "command-x", enabled: true, firstLayer: false, order: 10,
        label: "移动命令", icon: "🚀", mobileOverride: true,
    }];
    const result = selectFloatingBallMoreActions(config, "mobile", [
        action("command-x", {kind: "command", value: "plugin::x", targets: ["desktop", "sidebar"]}),
    ]);
    assert.equal(result[0].availability.status, "supported");
    assert.equal(result[0].label, "移动命令");
    assert.equal(result[0].icon, "🚀");
});

test("panel renders a custom short text icon without creating an SVG reference", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [{actionId: "rocket", enabled: true, firstLayer: true, order: 1, label: "火箭", icon: "🚀"}];
    const {dom, panel, root} = setupPanel([action("rocket", {label: "Rocket", icon: "iconPlugin"})], {config});
    const icon = root.querySelector('[data-action-id="rocket"] .sw__floating-ball-action-icon');
    assert.equal(icon.textContent, "🚀");
    assert.equal(icon.classList.contains("is-text-icon"), true);
    assert.equal(icon.querySelector("svg"), null);
    panel.destroy();
    dom.window.close();
});

test("panel renders a safe image icon as a bounded image rather than markup", () => {
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [{actionId: "image", enabled: true, firstLayer: true, order: 1,
        icon: "https://cdn.example.com/icon.png"}];
    const {dom, panel, root} = setupPanel([action("image")], {config});
    const icon = root.querySelector('[data-action-id="image"] .sw__floating-ball-action-icon');
    const image = icon.querySelector("img");
    assert.ok(image);
    assert.equal(image.src, "https://cdn.example.com/icon.png");
    assert.equal(image.referrerPolicy, "no-referrer");
    assert.equal(image.alt, "");
    assert.equal(icon.querySelector("svg"), null);
    image.dispatchEvent(new dom.window.Event("error"));
    assert.equal(icon.querySelector("img"), null);
    assert.equal(icon.querySelector("use").getAttribute("href"), "#iconPlugin");
    panel.destroy();
    dom.window.close();
});

test("more selector preserves first-layer overflow and unverified first-layer entries", () => {
    const config = createDefaultFloatingBallConfig();
    const actions = Array.from({length: 7}, (_, index) => action(`provider-${index}`));
    actions.push(action("unverified", {kind: "command"}));
    config.actions.mobile = actions.map((item, index) => ({actionId: item.id, enabled: true, firstLayer: true, order: index}));
    const result = selectFloatingBallMoreActions(config, "mobile", actions);
    assert.deepEqual(result.map((item) => item.actionId), ["provider-5", "provider-6", "unverified"]);
    assert.equal(result.at(-1).availability.status, "unknown");
});

test("open panel refresh keeps the drawer open and uses current action configuration", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [{actionId: "provider-a", enabled: true, firstLayer: false, order: 10}];
    const panel = createFloatingBallPanelController({document: dom.window.document, container: dom.window.document.body,
        config, surface: "desktop", actions: [action("provider-a"), action("provider-b")], includeBuiltins: false});
    panel.openMore();
    config.actions.desktop = [{actionId: "provider-b", enabled: true, firstLayer: false, order: 10}];
    panel.update({config});
    assert.equal(panel.isMoreOpen(), true);
    assert.equal(panel.getElement().querySelector(".sw__floating-ball-more").hidden, false);
    assert.deepEqual([...panel.getElement().querySelectorAll(".sw__floating-ball-more-list [data-action-id]")].map((item) => item.dataset.actionId), ["switcher", "provider-b"]);
    panel.destroy();
    dom.window.close();
});

test("panel mounts first layer, opens more drawer and invokes supported actions", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [
        {actionId: "search", enabled: true, firstLayer: true, order: 10},
        {actionId: "provider-a", enabled: true, firstLayer: false, order: 20},
    ];
    const calls = [];
    const controller = createFloatingBallPanelController({
        document: dom.window.document,
        container: dom.window.document.body,
        surface: "desktop",
        config,
        actions: [
            action("search", {kind: "builtin", value: "search", targets: ["desktop"]}),
            action("provider-a"),
        ],
        onAction: (item) => calls.push(item.actionId),
    });
    const root = controller.mount();
    assert.ok(root);
    assert.equal(root.querySelectorAll(".sw__floating-ball-first-layer [data-action-id]").length, 2);
    const more = root.querySelector("[data-action-id='__floating-ball-more__']");
    assert.ok(more);
    more.click();
    assert.equal(controller.isMoreOpen(), true);
    assert.equal(root.querySelector(".sw__floating-ball-more").hidden, false);
    dom.window.document.body.dispatchEvent(new dom.window.Event("pointerdown", {bubbles: true}));
    assert.equal(controller.isMoreOpen(), false);
    more.click();
    root.querySelector(".sw__floating-ball-more-list [data-action-id='provider-a']").click();
    assert.deepEqual(calls, ["provider-a"]);
    assert.equal(controller.isMoreOpen(), false);
    controller.destroy();
    assert.equal(dom.window.document.querySelector(".sw__floating-ball-panel"), null);
    dom.window.close();
});

test("empty action configuration keeps a safe switcher and more entry", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [];
    const controller = createFloatingBallPanelController({
        document: dom.window.document,
        container: dom.window.document.body,
        surface: "desktop",
        config,
        actions: [],
    });
    controller.mount();
    assert.deepEqual(controller.getFirstLayerActions().map((item) => item.actionId), ["switcher", "__floating-ball-more__"]);
    controller.openMore();
    assert.equal(controller.getElement().querySelector(".sw__floating-ball-more-empty").textContent, "暂无可用动作");
    controller.destroy();
    dom.window.close();
});

test("more panel focuses an entry, traps Tab, and restores the trigger focus", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [{actionId: "provider-a", enabled: true, firstLayer: false, order: 10}];
    const controller = createFloatingBallPanelController({
        document: dom.window.document,
        container: dom.window.document.body,
        surface: "desktop",
        config,
        actions: [action("provider-a")],
    });
    const root = controller.mount();
    const trigger = root.querySelector("[data-action-id='__floating-ball-more__']");
    trigger.focus();
    controller.openMore();
    const searchInput = root.querySelector(".sw__floating-ball-more-search");
    const switcherButton = root.querySelector(".sw__floating-ball-more-list [data-action-id='switcher']");
    const actionButton = root.querySelector(".sw__floating-ball-more-list [data-action-id='provider-a']");
    assert.equal(dom.window.document.activeElement, searchInput);
    searchInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}));
    assert.equal(dom.window.document.activeElement, switcherButton);
    switcherButton.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}));
    assert.equal(dom.window.document.activeElement, actionButton);
    controller.closeMore();
    const restoredTrigger = root.querySelector("[data-action-id='__floating-ball-more__']");
    assert.equal(dom.window.document.activeElement, restoredTrigger);
    controller.destroy();
    dom.window.close();
});

function setupPanel(actions, extra = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="host"></div><button id="outside">Outside</button></body>');
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = actions.map((item, index) => ({actionId: item.actionId, enabled: true, firstLayer: false, order: index}));
    const panel = createFloatingBallPanelController({document: dom.window.document,
        container: dom.window.document.querySelector("#host"), config, surface: "desktop", actions,
        includeBuiltins: false, ...extra});
    panel.mount();
    return {dom, config, panel, root: panel.getElement()};
}

test("search matches labels, IDs and provider names without replacing controls or losing focus", () => {
    const {dom, config, panel, root} = setupPanel([
        action("weather-now", {label: "Weather", providerId: "sky", providerName: "Forecast Kit"}),
        action("notes", {label: "Journal", providerId: "notebook"}),
    ]);
    panel.openMore();
    const input = root.querySelector("input[type=search]");
    const weather = root.querySelector('[data-action-id="weather-now"]');
    for (const query of ["WEATHER", "weather-now", "forecast kit", "sky"]) {
        input.value = query;
        input.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
        assert.equal(root.querySelector("input[type=search]"), input);
        assert.equal(root.querySelector('[data-action-id="weather-now"]'), weather);
        assert.equal(dom.window.document.activeElement, input);
        assert.equal(weather.closest(".sw__floating-ball-more-row").hidden, false);
        assert.equal(root.querySelector('[data-action-id="notes"]').closest(".sw__floating-ball-more-row").hidden, true);
    }
    panel.update({config});
    assert.equal(root.querySelector("input[type=search]"), input);
    assert.equal(input.value, "sky");
    assert.equal(dom.window.document.activeElement, input);
    input.value = "absent";
    input.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(root.querySelector(".sw__floating-ball-more-empty").textContent, "没有匹配的动作");
    assert.equal(panel.isMoreOpen(), true);
    panel.destroy();
    dom.window.close();
});

test("more panel groups action sources and exposes disabled reasons while hiding unsupported actions", () => {
    const {dom, panel, root} = setupPanel([
        action("search", {kind: "builtin", value: "search"}),
        action("dock", {kind: "dock"}),
        action("plugin", {kind: "command", value: "demo::run", available: false}),
        action("mobile-only", {targets: ["mobile"], available: false}),
    ]);
    panel.openMore();
    assert.deepEqual([...root.querySelectorAll("[data-group]")].map((group) => group.dataset.group), ["builtin", "component", "plugin"]);
    const unavailable = root.querySelector('[data-action-id="plugin"]');
    assert.equal(unavailable.disabled, true);
    assert.match(unavailable.textContent, /demo.*当前端不可用/);
    assert.match(unavailable.getAttribute("aria-label"), /demo.*当前端不可用/);
    assert.equal(root.querySelector('[data-action-id="mobile-only"]'), null);
    assert.equal(root.querySelector('[role="dialog"]').getAttribute("aria-label"), "更多动作");
    panel.destroy();
    dom.window.close();
});

test("missing provider remains a recoverable disabled row with a visible explanation", () => {
    const {dom, config, panel, root} = setupPanel([]);
    config.actions.desktop = [{actionId: "missing", enabled: true, firstLayer: false, order: 1}];
    panel.update({config});
    panel.openMore();
    const row = root.querySelector('[data-action-id="missing"]');
    assert.equal(row.disabled, true);
    assert.match(row.textContent, /插件尚未加载/);
    assert.match(row.getAttribute("aria-label"), /插件尚未加载/);
    panel.destroy();
    dom.window.close();
});

test("management remains available in an empty drawer and closes before opening settings", () => {
    const calls = [];
    const {dom, panel, root} = setupPanel([], {onCloseMore: () => calls.push("close"),
        onManageSettings: (surface) => calls.push(`manage:${surface}`)});
    panel.openMore();
    const manage = root.querySelector(".sw__floating-ball-more-manage");
    assert.equal(manage.hidden, false);
    manage.click();
    assert.deepEqual(calls, ["close", "manage:desktop"]);
    assert.equal(panel.isMoreOpen(), false);
    panel.destroy();
    dom.window.close();
});

test("toggle delegates to shared configuration, keeps disabled rows recoverable and supports failed saves", async () => {
    const calls = [];
    const {dom, config, panel, root} = setupPanel([action("a")]);
    panel.openMore();
    assert.equal(root.querySelector("input[type=checkbox]"), null);
    panel.update({onToggleAction: async (...args) => {
        calls.push(args);
        throw new Error("save failed");
    }});
    const toggle = root.querySelector("input[type=checkbox]");
    toggle.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [["a", false, "desktop"]]);
    assert.equal(config.actions.desktop[0].enabled, true);
    assert.equal(toggle.checked, true);
    assert.equal(toggle.disabled, false);
    assert.equal(root.querySelector(".sw__floating-ball-more-empty").textContent, "未能保存，请重试");
    config.actions.desktop[0].enabled = false;
    panel.update({config});
    assert.equal(root.querySelector('[data-action-id="a"]').disabled, true);
    assert.equal(root.querySelector("input[type=checkbox]").checked, false);
    panel.destroy();
    dom.window.close();
});

test("refresh preserves a focused action and filtered Tab navigation excludes hidden rows", () => {
    const {dom, config, panel, root} = setupPanel([action("a"), action("b")]);
    panel.openMore();
    root.querySelector('[data-action-id="b"]').focus();
    panel.update({config});
    assert.equal(dom.window.document.activeElement.dataset.actionId, "b");
    const search = root.querySelector("input[type=search]");
    search.focus();
    search.value = "a";
    search.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    search.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}));
    assert.equal(dom.window.document.activeElement.dataset.actionId, "a");
    dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}));
    assert.equal(dom.window.document.activeElement.className, "sw__floating-ball-more-close");
    panel.destroy();
    dom.window.close();
});

test("closing is idempotent and action dispatch follows close without overwriting execution state", () => {
    const calls = [];
    let state = "docked";
    const {dom, panel, root} = setupPanel([action("run")], {
        onCloseMore: () => { calls.push("close"); state = "docked"; },
        onAction: () => { calls.push("run"); state = "executing"; },
    });
    panel.closeMore();
    assert.deepEqual(calls, []);
    panel.openMore();
    root.querySelector('[data-action-id="run"]').click();
    panel.closeMore();
    assert.deepEqual(calls, ["close", "run"]);
    assert.equal(state, "executing");
    assert.notEqual(dom.window.document.activeElement.closest(".sw__floating-ball-more"), root.querySelector(".sw__floating-ball-more"));
    panel.destroy();
    dom.window.close();
});

test("outside clicks preserve external focus and Escape restores the visible ball instead of hidden first-layer buttons", () => {
    const {dom, panel, root} = setupPanel([action("run")]);
    const host = dom.window.document.querySelector("#host");
    host.className = "sw-fab-root";
    host.dataset.state = "docked";
    const ball = dom.window.document.createElement("button");
    ball.className = "sw-fab-trigger";
    host.prepend(ball);
    panel.update({onOpenMore: () => { host.dataset.state = "more"; },
        onCloseMore: () => { host.dataset.state = "docked"; }});
    panel.openMore();
    root.querySelector("input[type=search]").dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    assert.equal(dom.window.document.activeElement, ball);
    panel.openMore();
    const outside = dom.window.document.querySelector("#outside");
    outside.focus();
    outside.dispatchEvent(new dom.window.Event("pointerdown", {bubbles: true}));
    assert.equal(dom.window.document.activeElement, outside);
    panel.openMore();
    host.setAttribute("inert", "");
    host.setAttribute("aria-hidden", "true");
    panel.closeMore();
    assert.equal(dom.window.document.activeElement, dom.window.document.body);
    panel.destroy();
    dom.window.close();
});

test("destroy returns owned focus to the visible host trigger and removes resize work", () => {
    const {dom, panel} = setupPanel([action("run")]);
    const host = dom.window.document.querySelector("#host");
    const ball = dom.window.document.createElement("button");
    ball.className = "sw-fab-trigger";
    host.prepend(ball);
    let measures = 0;
    host.getBoundingClientRect = () => { measures += 1; return {left: 970, top: 8, right: 1018, bottom: 56}; };
    panel.openMore();
    panel.destroy();
    assert.equal(dom.window.document.activeElement, ball);
    const before = measures;
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(measures, before);
    panel.destroy();
    dom.window.close();
});

test("desktop and sidebar drawers stay within viewport and host bounds near top and bottom edges", () => {
    const {dom, config, panel, root} = setupPanel([action("run")]);
    const host = dom.window.document.querySelector("#host");
    let ballBounds = {left: 970, top: 0, right: 1018, bottom: 48};
    host.getBoundingClientRect = () => ballBounds;
    const drawer = root.querySelector(".sw__floating-ball-more");
    drawer.getBoundingClientRect = () => ({height: 400});
    panel.openMore();
    assert.equal(ballBounds.top + parseFloat(drawer.style.top), 8);
    assert.equal(ballBounds.left + parseFloat(drawer.style.left) + parseFloat(drawer.style.width) <= 1016, true);
    ballBounds = {left: 970, top: 728, right: 1018, bottom: 776};
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(ballBounds.top + parseFloat(drawer.style.top) + 400 <= 760, true);
    dom.window.document.body.getBoundingClientRect = () => ({left: 600, right: 784, top: 100, bottom: 650, width: 184, height: 550});
    ballBounds = {left: 732, right: 776, top: 610, bottom: 654};
    config.actions.sidebar = config.actions.desktop;
    panel.update({surface: "sidebar", config});
    assert.equal(parseFloat(drawer.style.width), 168);
    assert.equal(ballBounds.left + parseFloat(drawer.style.left), 608);
    assert.equal(ballBounds.top + parseFloat(drawer.style.top) + 400 <= 642, true);
    panel.update({surface: "mobile"});
    assert.equal(parseFloat(drawer.style.left) >= 8, true);
    assert.equal(parseFloat(drawer.style.top) + 400 <= 760, true);
    assert.equal(parseFloat(drawer.style.width), 520);
    panel.destroy();
    dom.window.close();
});

test("mobile drawer follows visual viewport size, offsets and safe insets without resize listeners after destroy", () => {
    const {dom, panel, root} = setupPanel([action("run")]);
    const host = dom.window.document.querySelector("#host");
    const viewport = new dom.window.EventTarget();
    Object.assign(viewport, {width: 260, height: 562.67, offsetLeft: 20, offsetTop: 30});
    Object.defineProperty(dom.window, "visualViewport", {value: viewport, configurable: true});
    // Recreate after installing visualViewport so its native listeners are bound.
    panel.destroy();
    const mobile = createFloatingBallPanelController({document: dom.window.document, container: host, surface: "mobile"});
    const mobileRoot = mobile.mount();
    const drawer = mobileRoot.querySelector(".sw__floating-ball-more");
    host.style.setProperty("--sw-fab-safe-bottom", "20px");
    host.style.setProperty("--sw-fab-safe-top", "10px");
    host.style.setProperty("--sw-fab-safe-left", "4px");
    host.style.setProperty("--sw-fab-safe-right", "6px");
    let measurements = 0;
    drawer.getBoundingClientRect = () => { measurements += 1; return {height: 480}; };
    const assertInside = () => {
        assert.ok(parseFloat(drawer.style.left) >= viewport.offsetLeft + 4 + 8);
        assert.ok(parseFloat(drawer.style.left) + parseFloat(drawer.style.width) <= viewport.offsetLeft + viewport.width - 6 - 8);
        assert.ok(parseFloat(drawer.style.top) >= viewport.offsetTop + 10 + 8);
        assert.ok(parseFloat(drawer.style.top) + parseFloat(drawer.style.maxHeight) <= viewport.offsetTop + viewport.height - 20 - 8 + 0.001);
        assert.equal(drawer.style.right, "auto");
        assert.equal(drawer.style.bottom, "auto");
    };
    mobile.openMore();
    assertInside();
    viewport.height = 310;
    viewport.offsetTop = 130;
    viewport.dispatchEvent(new dom.window.Event("resize"));
    assertInside();
    viewport.offsetLeft = 45;
    viewport.offsetTop = 150;
    viewport.dispatchEvent(new dom.window.Event("scroll"));
    assertInside();
    assert.equal(measurements, 3);
    mobile.destroy();
    const before = measurements;
    viewport.dispatchEvent(new dom.window.Event("scroll"));
    viewport.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(measurements, before);
    assert.equal(root.isConnected, false);
    dom.window.close();
});

test("panel applies localized builtins, fallbacks and accessible group labels on refresh", () => {
    const {dom, config, panel, root} = setupPanel([action("search", {kind: "builtin", value: "search"})], {
        labels: {more: "More actions", search: "Find action", builtin: "Built-in", builtins: {search: "Search", switcher: "Switcher"}},
    });
    panel.openMore();
    assert.equal(root.querySelector('[data-action-id="search"] .sw__floating-ball-action-label').textContent, "Search");
    assert.equal(root.querySelector('[data-action-id="switcher"] .sw__floating-ball-action-label').textContent, "Switcher");
    assert.equal(root.querySelector('[data-group="builtin"]').getAttribute("aria-label"), "Built-in");
    panel.update({config, labels: {more: "Actions", close: "Close", search: "Find"}});
    assert.equal(root.querySelector(".sw__floating-ball-more-title").textContent, "Actions");
    assert.equal(root.querySelector(".sw__floating-ball-more-close").getAttribute("aria-label"), "Close");
    assert.equal(root.querySelector("input[type=search]").getAttribute("aria-label"), "Find");
    panel.destroy();
    dom.window.close();
});

test("search field copy never overrides builtin action names and explicit action labels still apply", () => {
    const {dom, panel, root} = setupPanel([], {includeBuiltins: true,
        config: {actions: {desktop: [{actionId: "search", enabled: true, firstLayer: true, order: 1}]}},
        labels: {search: "Find action by name or source"}});
    panel.openMore();
    const actionLabel = () => root.querySelector('.sw__floating-ball-more [data-action-id="search"] .sw__floating-ball-action-label').textContent;
    assert.equal(root.querySelector("input[type=search]").placeholder, "Find action by name or source");
    assert.equal(actionLabel(), "搜索");
    panel.update({labels: {search: "Filter actions", builtins: {search: "Search documents"}}});
    assert.equal(actionLabel(), "Search documents");
    panel.update({labels: {search: "Filter actions", actions: {search: "Find documents"}}});
    assert.equal(actionLabel(), "Find documents");
    panel.destroy();
    dom.window.close();
});

test("keyboard drawer exposes default first-layer actions once and restores drag targets on close", () => {
    const config = createDefaultFloatingBallConfig();
    const calls = [];
    const {dom, panel, root} = setupPanel([], {config, includeBuiltins: true,
        onAction: (item) => calls.push(item.actionId)});
    for (const id of ["journal", "search"]) {
        panel.openMore();
        const first = root.querySelector(".sw__floating-ball-first-layer");
        const drawer = root.querySelector(".sw__floating-ball-more");
        assert.equal(first.hidden, true);
        assert.equal(first.getAttribute("aria-hidden"), "true");
        assert.equal(first.hasAttribute("inert"), true);
        assert.ok([...first.querySelectorAll("button")].every((button) => button.tabIndex === -1));
        assert.equal(drawer.querySelectorAll(`[data-action-id="${id}"]`).length, 1);
        const target = drawer.querySelector(`[data-action-id="${id}"]`);
        for (let step = 0; step < 10 && dom.window.document.activeElement !== target; step += 1) {
            dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
                key: "Tab", bubbles: true, cancelable: true,
            }));
            assert.equal(first.contains(dom.window.document.activeElement), false);
        }
        assert.equal(dom.window.document.activeElement, target);
        panel.update({config});
        const refreshed = drawer.querySelector(`[data-action-id="${id}"]`);
        assert.equal(dom.window.document.activeElement, refreshed);
        assert.equal(refreshed.tagName, "BUTTON");
        refreshed.click(); // Native button activation is shared by Enter/Space and click.
        assert.equal(panel.isMoreOpen(), false);
        assert.equal(first.hidden, false);
        assert.equal(first.hasAttribute("inert"), false);
        assert.ok([...first.querySelectorAll("button")].every((button) => button.tabIndex === 0));
    }
    assert.deepEqual(calls, ["journal", "search"]);
    panel.openMore();
    const home = root.querySelector('.sw__floating-ball-more [data-action-id="home"]');
    assert.equal(home.closest("[data-group]").dataset.group, "component");
    assert.equal(root.querySelectorAll('.sw__floating-ball-more [data-action-id="home"]').length, 1);
    panel.destroy();
    dom.window.close();
});
