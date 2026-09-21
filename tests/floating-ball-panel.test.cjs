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
    assert.deepEqual([...panel.getElement().querySelectorAll(".sw__floating-ball-more-list [data-action-id]")].map((item) => item.dataset.actionId), ["provider-b"]);
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
