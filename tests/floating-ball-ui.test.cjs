const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const {JSDOM} = require("jsdom");
const {readSourceFile} = require("./source-scan.cjs");

// Load the production TypeScript module itself instead of a hand-written test
// double.  The UI module is intentionally dependency-free, so transpileModule
// is enough and keeps these lifecycle tests independent from webpack.
const source = readSourceFile("src/floating-ball-ui.ts");
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
    },
    fileName: "floating-ball-ui.ts",
}).outputText;
const floatingBallModule = {exports: {}};
new Function("require", "module", "exports", transpiled)((id) => id.startsWith("./floating-ball-")
    ? require(`../src/${id.slice(2)}`) : require(id), floatingBallModule, floatingBallModule.exports);
const {createFloatingBallUi} = floatingBallModule.exports;

function waitForMutation() {
    return new Promise((resolve) => setTimeout(resolve, 12));
}

function pointerEvent(window, type, values = {}) {
    const event = new window.Event(type, {bubbles: true, cancelable: true});
    Object.assign(event, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        button: 0,
        ...values,
    });
    return event;
}

function mount(document, options = {}) {
    const controller = createFloatingBallUi({
        document,
        surface: "mobile",
        observeHost: true,
        ...options,
    });
    const root = controller.mount();
    assert.ok(root, "controller should create a portal root");
    const trigger = root.querySelector("button");
    assert.ok(trigger, "portal should contain a real button trigger");
    return {controller, root, trigger};
}

test("floating ball mounts one portal per document surface and recovers after host redraw", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const first = mount(dom.window.document);
    const second = mount(dom.window.document);

    assert.equal(dom.window.document.querySelectorAll(".sw-fab-root[data-sw-floating-ball='mobile']").length, 1);
    assert.equal(first.controller.getElement(), null, "the previous controller is destroyed by the singleton mount");
    assert.equal(second.root.dataset.state, "docked");
    assert.equal(second.root.classList.contains("sw__fab"), true, "legacy FAB class remains available during migration");

    second.root.remove();
    await waitForMutation();
    assert.equal(second.root.isConnected, true, "body redraw should restore the same portal node");
    assert.equal(dom.window.document.querySelectorAll(".sw-fab-root[data-sw-floating-ball='mobile']").length, 1);
    second.controller.destroy();
    dom.window.close();
});

test("floating ball keeps desktop, sidebar, and mobile portals independent", () => {
    const dom = new JSDOM("<!doctype html><body><aside id='sidebar'></aside></body>");
    const surfaces = ["desktop", "sidebar", "mobile"];
    const controllers = surfaces.map((surface) => createFloatingBallUi({
        document: dom.window.document,
        surface,
        host: surface === "sidebar" ? dom.window.document.getElementById("sidebar") : dom.window.document.body,
        position: {edge: surface === "sidebar" ? "left" : "right", yRatio: surface === "mobile" ? 0.2 : 0.7},
    }));
    controllers.forEach((controller) => controller.mount());
    assert.equal(dom.window.document.querySelectorAll(".sw-fab-root[data-sw-floating-ball]").length, 3);
    assert.deepEqual(controllers.map((controller) => controller.getPosition()), [
        {edge: "right", yRatio: 0.7},
        {edge: "left", yRatio: 0.7},
        {edge: "right", yRatio: 0.2},
    ]);
    controllers.forEach((controller) => controller.destroy());
    assert.equal(dom.window.document.querySelectorAll(".sw-fab-root[data-sw-floating-ball]").length, 0);
    dom.window.close();
});

test("floating ball keeps a tap as a switcher click and suppresses the synthetic click after drag slop", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let opened = 0;
    let moved = 0;
    const {controller, trigger} = mount(dom.window.document, {
        touchSlopPx: 9,
        onOpenSwitcher: () => { opened += 1; },
        onPositionChange: () => { moved += 1; },
    });

    trigger.dispatchEvent(pointerEvent(dom.window, "pointerdown", {pointerId: 1, clientX: 80, clientY: 120}));
    trigger.dispatchEvent(pointerEvent(dom.window, "pointermove", {pointerId: 1, clientX: 86, clientY: 120}));
    assert.equal(controller.getState(), "docked", "sub-threshold movement stays a click candidate");
    trigger.dispatchEvent(pointerEvent(dom.window, "pointerup", {pointerId: 1, clientX: 80, clientY: 120}));
    trigger.click();
    assert.equal(opened, 1, "a tap remains the stable switcher route");

    trigger.dispatchEvent(pointerEvent(dom.window, "pointerdown", {pointerId: 2, clientX: 80, clientY: 120}));
    trigger.dispatchEvent(pointerEvent(dom.window, "pointermove", {pointerId: 2, clientX: 101, clientY: 120}));
    assert.equal(controller.getState(), "dragging");
    trigger.dispatchEvent(pointerEvent(dom.window, "pointerup", {pointerId: 2, clientX: 101, clientY: 120}));
    trigger.click();
    assert.equal(opened, 1, "a drag must not fall through to the button click");
    assert.equal(moved, 1, "drag release persists one final position");
    assert.equal(controller.getState(), "docked");

    controller.destroy();
    dom.window.close();
});

test("suspend blocks activation and destroy releases observers and listeners", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let opened = 0;
    const {controller, root, trigger} = mount(dom.window.document, {
        onOpenSwitcher: () => { opened += 1; },
    });

    controller.setSuspended(true);
    assert.equal(controller.getState(), "suspended");
    trigger.click();
    assert.equal(opened, 0);
    controller.setSuspended(false);
    trigger.click();
    assert.equal(opened, 1);

    controller.destroy();
    assert.equal(root.isConnected, false);
    // A later body mutation must not resurrect a destroyed portal.
    dom.window.document.body.appendChild(dom.window.document.createElement("div"));
    await waitForMutation();
    assert.equal(dom.window.document.querySelector(".sw-fab-root"), null);
    trigger.click();
    assert.equal(opened, 1, "destroy removes the trigger listener");
    dom.window.close();
});

test("idle presentation fades after the configured delay and wakes on focus", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const {controller, root, trigger} = mount(dom.window.document, {
        idleDelayMs: 8,
        idleOpacity: 0.55,
        halfHide: true,
    });
    assert.equal(root.dataset.idle, "false");
    assert.equal(root.dataset.halfHide, "true");
    assert.equal(root.style.getPropertyValue("--sw-fab-idle-opacity"), "0.55");
    await new Promise((resolve) => setTimeout(resolve, 16));
    assert.equal(root.dataset.idle, "true");
    trigger.dispatchEvent(new dom.window.Event("focus"));
    assert.equal(root.dataset.idle, "false");
    controller.destroy();
    dom.window.close();
});

test("idle timer is cancelled while suspended and resumes after release", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const {controller, root} = mount(dom.window.document, {idleDelayMs: 8});
    controller.setSuspended(true);
    await new Promise((resolve) => setTimeout(resolve, 16));
    assert.equal(root.dataset.idle, "false");
    controller.setSuspended(false);
    await new Promise((resolve) => setTimeout(resolve, 16));
    assert.equal(root.dataset.idle, "true");
    controller.destroy();
    dom.window.close();
});

test("suspended and hidden states are removed from the accessibility tree", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const {controller, root, trigger} = mount(dom.window.document);
    trigger.focus();
    assert.equal(dom.window.document.activeElement, trigger);

    controller.setSuspended(true);
    assert.equal(root.getAttribute("aria-hidden"), "true");
    assert.equal(trigger.tabIndex, -1);
    assert.notEqual(dom.window.document.activeElement, trigger);

    controller.setSuspended(false);
    assert.equal(root.getAttribute("aria-hidden"), "false");
    assert.equal(trigger.tabIndex, 0);

    trigger.focus();
    controller.setHidden(true);
    assert.equal(root.getAttribute("aria-hidden"), "true");
    assert.equal(trigger.tabIndex, -1);
    assert.notEqual(dom.window.document.activeElement, trigger);
    controller.setHidden(false);
    assert.equal(root.getAttribute("aria-hidden"), "false");
    assert.equal(trigger.tabIndex, 0);

    controller.destroy();
    dom.window.close();
});

test("suspension and hidden reasons remain independent", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const {controller, root, trigger} = mount(dom.window.document);
    controller.setSuspended(true);
    controller.setHidden(true);
    controller.setSuspended(false);
    assert.equal(controller.getState(), "hidden");
    assert.equal(root.getAttribute("aria-hidden"), "true");
    controller.setHidden(false);
    assert.equal(controller.getState(), "docked");
    assert.equal(root.getAttribute("aria-hidden"), "false");

    controller.setHidden(true);
    controller.setState("docked");
    assert.equal(controller.getState(), "hidden", "panel cleanup must not clear an external hidden reason");
    controller.setHidden(false);
    controller.destroy();
    dom.window.close();
});

test("unavailable trigger cannot be focused or activated", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let opened = 0;
    const {controller, root, trigger} = mount(dom.window.document, {
        available: false,
        onOpenSwitcher: () => { opened += 1; },
    });
    assert.equal(root.getAttribute("aria-hidden"), "false");
    assert.equal(trigger.disabled, true);
    assert.equal(trigger.getAttribute("aria-hidden"), null);
    controller.focus();
    assert.notEqual(dom.window.document.activeElement, trigger);
    trigger.click();
    assert.equal(opened, 0);
    trigger.dispatchEvent(new dom.window.MouseEvent("contextmenu", {bubbles: true, cancelable: true}));
    trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "ContextMenu", bubbles: true, cancelable: true}));
    assert.equal(opened, 0);
    controller.destroy();
    dom.window.close();
});

test("fullscreen and visibility listeners hide without leaving stale listeners", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const {controller, root} = mount(dom.window.document, {hideOnFullscreen: true});
    Object.defineProperty(dom.window.document, "fullscreenElement", {configurable: true, value: dom.window.document.body});
    dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    assert.equal(controller.getState(), "hidden");
    Object.defineProperty(dom.window.document, "fullscreenElement", {configurable: true, value: null});
    dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    assert.equal(controller.getState(), "docked");
    controller.destroy();
    dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    assert.equal(root.isConnected, false);
    dom.window.close();
});

test("scroll visibility follows each surface scroll target and cleans up when disabled", () => {
    const dom = new JSDOM("<!doctype html><body><main id='scroll-host'></main></body>", {pretendToBeVisual: true});
    const host = dom.window.document.getElementById("scroll-host");
    const {controller, root} = mount(dom.window.document, {
        surface: "desktop",
        host,
        hideOnScroll: false,
    });
    host.scrollTop = 10;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    host.scrollTop = 20;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    assert.equal(controller.getState(), "docked", "disabled scroll hiding must not bind a listener");

    controller.update({hideOnScroll: true});
    host.scrollTop = 30;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    host.scrollTop = 50;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    assert.equal(controller.getState(), "hidden", "downward host scrolling hides the ball");
    assert.equal(root.getAttribute("aria-hidden"), "true");

    controller.setSuspended(true);
    host.scrollTop = 10;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    assert.equal(controller.getState(), "suspended", "suspension remains independent from scroll hidden");
    controller.setSuspended(false);
    assert.equal(controller.getState(), "docked", "upward scroll clears the scroll reason");

    controller.update({hideOnScroll: false});
    host.scrollTop = 80;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    assert.equal(controller.getState(), "docked", "turning the setting off clears the reason and listener");
    controller.destroy();
    host.scrollTop = 100;
    host.dispatchEvent(new dom.window.Event("scroll", {bubbles: true}));
    assert.equal(root.isConnected, false);
    dom.window.close();
});

test("viewport changes re-apply the portal position and clean listeners on destroy", () => {
    const dom = new JSDOM("<!doctype html><body></body>", {pretendToBeVisual: true});
    const {controller, root} = mount(dom.window.document, {position: {edge: "left", yRatio: 0.3}});
    const before = root.style.top;
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(root.style.top, before);
    controller.destroy();
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(root.isConnected, false);
    dom.window.close();
});

test("sidebar bounds keep the portal inside a narrow host and follow resize", () => {
    const dom = new JSDOM("<!doctype html><body><aside id='sidebar'></aside></body>", {
        pretendToBeVisual: true,
    });
    const sidebar = dom.window.document.getElementById("sidebar");
    let bounds = {left: 700, right: 980, top: 80, bottom: 680};
    const {controller, root} = mount(dom.window.document, {
        surface: "sidebar",
        host: sidebar,
        resolveHost: () => sidebar,
        resolveBounds: () => bounds,
        position: {edge: "right", yRatio: 0.5},
    });

    assert.equal(root.style.top, "380px");
    assert.equal(root.style.right, "52px");
    assert.equal(root.style.left, "auto");
    assert.equal(root.style.getPropertyValue("--sw-fab-host-width"), "280px");

    bounds = {left: 12, right: 196, top: 20, bottom: 420};
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(root.style.top, "220px");
    assert.equal(root.style.right, "836px");
    assert.equal(root.style.getPropertyValue("--sw-fab-host-width"), "184px");

    controller.destroy();
    dom.window.close();
});

test("size, margins and free placement update geometry and persist through resize", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let saved;
    const {controller, root, trigger} = mount(dom.window.document, {
        surface: "desktop", size: 64, marginPx: 16, snap: false,
        position: {edge: "right", yRatio: 0}, onPositionChange: (next) => { saved = next; },
    });
    assert.equal(root.style.getPropertyValue("--sw-fab-size"), "64px");
    assert.equal(parseFloat(root.style.top), 48, "top edge retains a whole hit target");
    trigger.dispatchEvent(pointerEvent(dom.window, "pointerdown"));
    trigger.dispatchEvent(pointerEvent(dom.window, "pointermove", {clientX: 500, clientY: 300}));
    trigger.dispatchEvent(pointerEvent(dom.window, "pointerup", {clientX: 500, clientY: 300}));
    assert.ok(saved.xRatio > 0.4 && saved.xRatio < 0.6, "snap=false preserves free horizontal placement");
    assert.equal(parseFloat(root.style.left), 468);
    assert.equal(parseFloat(root.style.top), 300);
    dom.window.innerWidth = 800;
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    assert.ok(parseFloat(root.style.left) > 300 && parseFloat(root.style.left) < 400);
    controller.update({size: 44, snap: true, position: {edge: "left", yRatio: 1}});
    assert.equal(root.style.getPropertyValue("--sw-fab-size"), "44px");
    assert.equal(parseFloat(root.style.left), 16);
    assert.equal(parseFloat(root.style.top), 768 - 16 - 22);
    controller.destroy();
    dom.window.close();
});

test("mobile safe bounds follow keyboard viewport and safe area insets", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const viewport = new dom.window.EventTarget();
    Object.assign(viewport, {width: 390, height: 500, offsetTop: 25, offsetLeft: 0});
    Object.defineProperty(dom.window, "visualViewport", {value: viewport, configurable: true});
    const {controller, root} = mount(dom.window.document, {position: {edge: "right", yRatio: 1}});
    root.style.setProperty("--sw-fab-safe-bottom", "20px");
    root.style.setProperty("--sw-fab-safe-top", "18px");
    viewport.dispatchEvent(new dom.window.Event("resize"));
    assert.equal(parseFloat(root.style.top), 25 + 500 - 20 - 48 - 8 - 24);
    controller.update({position: {edge: "left", yRatio: 0}});
    assert.equal(parseFloat(root.style.top), 25 + 18 + 8 + 24);
    controller.destroy();
    viewport.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(root.isConnected, false);
    dom.window.close();
});

test("drag targets stay anchored, use expanded hit areas and execute only once", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let executions = 0;
    let moves = 0;
    let clicks = 0;
    const {controller, root, trigger} = mount(dom.window.document, {
        surface: "desktop", position: {edge: "right", yRatio: 0.5},
        onActionTarget: () => { executions += 1; }, onPositionChange: () => { moves += 1; },
        onOpenSwitcher: () => { clicks += 1; },
    });
    const {createFloatingBallPanelController} = require("../src/floating-ball-panel.js");
    const panel = createFloatingBallPanelController({document: dom.window.document, container: root,
        config: {actions: {desktop: [{actionId: "search", firstLayer: true}]}}, surface: "desktop"});
    panel.mount();
    const original = controller.getPosition();
    for (let i = 0; i < 100; i += 1) {
        trigger.dispatchEvent(pointerEvent(dom.window, "pointerdown", {clientX: 992, clientY: 384}));
        trigger.dispatchEvent(pointerEvent(dom.window, "pointermove", {clientX: 980, clientY: 384}));
        const action = root.querySelector('.sw__floating-ball-first-layer [data-action-id="search"]');
        const left = action.style.left;
        const x = 968 + parseFloat(left);
        const y = 360 + parseFloat(action.style.top);
        trigger.dispatchEvent(pointerEvent(dom.window, "pointermove", {clientX: x, clientY: y}));
        assert.equal(action.style.left, left, "action geometry does not chase the pointer");
        assert.equal(controller.getState(), "targeting");
        assert.ok(action.classList.contains("is-targeted"));
        trigger.dispatchEvent(pointerEvent(dom.window, "pointerup", {clientX: x, clientY: y}));
        trigger.click();
    }
    assert.equal(executions, 100);
    assert.equal(moves, 0, "action selection preserves the parked position");
    assert.equal(clicks, 0, "captured drag never clicks through to switcher");
    assert.deepEqual(controller.getPosition(), original);
    panel.destroy();
    controller.destroy();
    dom.window.close();
});

test("pointer cancellation, lost capture and window blur restore the parked position", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let moves = 0;
    const {controller, trigger} = mount(dom.window.document, {onPositionChange: () => { moves += 1; }});
    const original = controller.getPosition();
    for (const kind of ["pointercancel", "lostpointercapture", "blur"]) {
        trigger.dispatchEvent(pointerEvent(dom.window, "pointerdown"));
        trigger.dispatchEvent(pointerEvent(dom.window, "pointermove", {clientX: 220, clientY: 80}));
        if (kind === "blur") dom.window.dispatchEvent(new dom.window.Event("blur"));
        else trigger.dispatchEvent(pointerEvent(dom.window, kind));
        assert.equal(controller.getState(), "docked");
        assert.deepEqual(controller.getPosition(), original);
    }
    assert.equal(moves, 0);
    controller.destroy();
    dom.window.close();
});

test("scroll hosts are isolated and the recovery handle yields to modal reasons", () => {
    const dom = new JSDOM("<!doctype html><body><main></main><aside></aside></body>");
    const main = dom.window.document.querySelector("main");
    const sidebar = dom.window.document.querySelector("aside");
    const desk = mount(dom.window.document, {surface: "desktop", excludeScrollTarget: (target) => sidebar.contains(target)});
    const side = mount(dom.window.document, {surface: "sidebar", host: sidebar, resolveScrollTarget: () => sidebar});
    const scroll = (host, top) => { host.scrollTop = top; host.dispatchEvent(new dom.window.Event("scroll")); };
    scroll(main, 10); scroll(main, 30);
    assert.equal(desk.controller.getState(), "hidden");
    assert.equal(side.controller.getState(), "docked");
    const recovery = dom.window.document.querySelector('.sw-fab-recovery[data-surface="desktop"]');
    assert.equal(recovery.hidden, false);
    desk.controller.setSuspended(true);
    assert.equal(recovery.hidden, true);
    desk.controller.setSuspended(false);
    recovery.click();
    assert.equal(desk.controller.getState(), "docked");
    assert.equal(dom.window.document.activeElement, desk.trigger);
    scroll(sidebar, 10); scroll(sidebar, 40);
    assert.equal(side.controller.getState(), "hidden");
    assert.equal(desk.controller.getState(), "docked");
    desk.controller.destroy(); side.controller.destroy();
    assert.equal(dom.window.document.querySelectorAll(".sw-fab-recovery").length, 0);
    dom.window.close();
});

test("busy watchdog releases at 1500ms and stale completion cannot unlock a newer action", (t) => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const pending = new Map();
    const originalSetTimeout = dom.window.setTimeout.bind(dom.window);
    const originalClearTimeout = dom.window.clearTimeout.bind(dom.window);
    let sequence = -1;
    dom.window.setTimeout = (callback, delay) => {
        if (delay !== 1500) return originalSetTimeout(callback, delay);
        pending.set(sequence, callback);
        return sequence--;
    };
    dom.window.clearTimeout = (id) => { pending.delete(id); originalClearTimeout(id); };
    const {controller, trigger} = mount(dom.window.document);
    t.after(() => { controller.destroy(); dom.window.close(); });
    const finishFirst = controller.beginExecution();
    assert.equal(trigger.disabled, true);
    assert.equal(pending.size, 1, "watchdog must be scheduled for 1500 ms");
    pending.get(-1)();
    assert.equal(controller.getState(), "docked");
    const finishSecond = controller.beginExecution();
    finishFirst();
    assert.equal(controller.getState(), "executing");
    finishSecond();
    assert.equal(trigger.disabled, false);
    controller.beginExecution();
    controller.destroy();
    assert.equal(pending.size, 0);
    dom.window.close();
});

test("keyboard menu opens without a pointer gesture and host layer stays lower", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let opens = 0;
    const {controller, root, trigger} = mount(dom.window.document, {resolveLayer: () => 50, onOpenMore: () => { opens += 1; }});
    assert.equal(root.style.zIndex, "49");
    trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "F10", shiftKey: true, bubbles: true, cancelable: true}));
    assert.equal(controller.getState(), "more");
    assert.equal(opens, 1);
    controller.setState("docked");
    trigger.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "ContextMenu", bubbles: true, cancelable: true}));
    assert.equal(opens, 2);
    controller.destroy();
    dom.window.close();
});

test("environment hiding closes the drawer and restores a consistent gesture state", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    let panel;
    const {controller, root} = mount(dom.window.document, {surface: "desktop",
        onDismissOverlays: () => panel?.closeMore({restoreFocus: false}),
    });
    const {createFloatingBallPanelController} = require("../src/floating-ball-panel.js");
    panel = createFloatingBallPanelController({document: dom.window.document, container: root,
        onOpenMore: () => controller.setState("more"),
        onCloseMore: () => { if (controller.getState() === "more") controller.setState("docked"); },
    });
    panel.mount(); panel.openMore();
    assert.equal(controller.getState(), "more");
    Object.defineProperty(dom.window.document, "fullscreenElement", {value: dom.window.document.body, configurable: true});
    dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    assert.equal(panel.isMoreOpen(), false);
    assert.equal(controller.getState(), "hidden");
    Object.defineProperty(dom.window.document, "fullscreenElement", {value: null, configurable: true});
    dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    assert.equal(controller.getState(), "docked");
    assert.equal(root.querySelector(".sw__floating-ball-first-layer").hidden, false);
    assert.equal(root.querySelector(".sw-fab-trigger").getAttribute("aria-expanded"), "false");
    panel.destroy(); controller.destroy(); dom.window.close();
});
