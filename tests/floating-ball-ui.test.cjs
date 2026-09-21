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
new Function("require", "module", "exports", transpiled)(require, floatingBallModule, floatingBallModule.exports);
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
