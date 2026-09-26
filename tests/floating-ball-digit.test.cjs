// T-6884（T-6857）悬浮球更多面板数字直达：面板打开时 1-9 直达第 n 个可见动作行。
// 真实面板控制器 + jsdom 行为测试（键位分发、搜索框让路、移动端不标注、销毁解绑）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {createDefaultFloatingBallConfig} = require("../src/floating-ball-model.js");
const {createFloatingBallPanelController, resolveFloatingBallDigitTargets} = require("../src/floating-ball-panel.js");

function setup(t, {surface = "desktop"} = {}) {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    const activated = [];
    const activatedActions = [];
    const config = createDefaultFloatingBallConfig();
    config.actions.desktop = [
        {actionId: "a1", enabled: true, firstLayer: true, order: 10},
        {actionId: "a2", enabled: true, firstLayer: true, order: 20},
        {actionId: "a3", enabled: true, firstLayer: true, order: 30},
    ];
    const panel = createFloatingBallPanelController({
        document: dom.window.document,
        container,
        surface,
        config,
        includeBuiltins: false,
        actions: [
            {id: "a1", kind: "command", value: "plugin-a::run", targets: ["desktop"], enabled: true, label: "Alpha"},
            {id: "a2", kind: "command", value: "plugin-b::run", targets: ["desktop"], enabled: true, label: "Beta"},
            {id: "a3", kind: "command", value: "plugin-c::run", targets: ["desktop"], enabled: true, label: "Gamma"},
        ],
        onAction: (action) => { activated.push(action.id); activatedActions.push(action); },
    });
    t.after(() => {
        panel.destroy();
        dom.window.close();
    });
    panel.mount();
    return {dom, panel, config, activated, activatedActions, window: dom.window, document: dom.window.document};
}

test("fixed digit resolver reserves stale slots and fills only empty slots from available rows (T-6891)", () => {
    const config = createDefaultFloatingBallConfig();
    config.digitSlots.desktop[0] = {kind: "saved-search", searchId: "saved-1"};
    config.digitSlots.desktop[1] = {kind: "action", actionId: "missing"};
    config.digitSlots.desktop[3] = {kind: "action", actionId: "disabled"};
    config.digitSlots.desktop[4] = {kind: "action", actionId: "a2"};
    const candidates = [
        {reference: {kind: "action", actionId: "a1"}, marker: "a1"},
        {reference: {kind: "action", actionId: "a2"}, marker: "a2"},
        {reference: {kind: "action", actionId: "disabled"}, enabled: false},
        {reference: {kind: "saved-search", searchId: "saved-1"}, marker: "saved"},
        {reference: {kind: "action", actionId: "hidden"}, visible: false},
    ];
    const targets = resolveFloatingBallDigitTargets(config, "desktop", candidates);
    assert.deepEqual(targets.slice(0, 5).map(({candidate}) => candidate?.marker || null),
        ["saved", null, "a1", null, "a2"]);
    assert.deepEqual(targets.slice(0, 5).map(({fixed}) => fixed), [true, true, false, true, true]);
    assert.equal(targets[5].candidate, null, "bound rows may not be reused by dynamic fallback");
});

test("more panel: digits 1-9 activate the nth visible row (T-6884)", (t) => {
    const {panel, activated, document, window} = setup(t);
    panel.openMore();
    // openMore 自动聚焦搜索框（既有设计）：焦点离开搜索框后数字直达生效
    document.activeElement?.blur?.();
    assert.equal(activated.length, 0, "打开面板本身不触发动作");
    const press = (key) => document.dispatchEvent(new window.KeyboardEvent("keydown", {key, bubbles: true}));
    press("2");
    assert.deepEqual(activated, ["a2"], "数字 2 直达第二个可见动作");
    // 激活动作后面板关闭（既有语义）：后续数字不再触发
    press("1");
    assert.deepEqual(activated, ["a2"], "激活后面板关闭，后续数字不再触发（关闭语义）");
});

test("more panel: search input focus lets digits through as query text (T-6884)", (t) => {
    const {panel, activated, document, window} = setup(t);
    panel.openMore();
    const input = document.querySelector(".sw__floating-ball-more-search");
    input.focus();
    document.dispatchEvent(new window.KeyboardEvent("keydown", {key: "1", bubbles: true}));
    assert.equal(activated.length, 0, "搜索框聚焦时数字直达必须让路");
    panel.closeMore({restoreFocus: false});
    document.dispatchEvent(new window.KeyboardEvent("keydown", {key: "1", bubbles: true}));
    assert.equal(activated.length, 0, "面板关闭后数字直达不再生效");
});

test("more panel: digit hints only on desktop and cleared when rows filter out (T-6884)", (t) => {
    const {panel, document, window} = setup(t);
    panel.openMore();
    const digitRows = () => [...document.querySelectorAll(".sw__floating-ball-more-row[data-digit]")];
    assert.equal(digitRows().length, 3, "桌面端前 9 个可见行全部带数字芯片");
    assert.deepEqual(digitRows().map((r) => r.dataset.digit), ["1", "2", "3"]);
    const mobile = setup(t, {surface: "mobile"});
    mobile.panel.openMore();
    assert.equal(mobile.document.querySelectorAll(".sw__floating-ball-more-row[data-digit]").length, 0,
        "移动端无键盘，不渲染数字芯片");
});

test("fixed slots keep their digit after filtering and saved-search rows replay through their own callback (T-6891)", (t) => {
    const {panel, config, activated, document, window} = setup(t);
    const replayed = [];
    const unavailable = [];
    const saved = {id: "saved-1", name: "Project notes", query: "alpha", notebook: "nb1"};
    config.digitSlots.desktop[0] = {kind: "saved-search", searchId: saved.id};
    config.digitSlots.desktop[1] = {kind: "action", actionId: "a3"};
    config.digitSlots.desktop[2] = {kind: "action", actionId: "deleted-action"};
    panel.update({config, savedSearches: [saved], onSavedSearch: (item, surface) => replayed.push([item, surface]),
        onUnavailable: (reference, surface) => unavailable.push([reference, surface])});
    panel.openMore();
    assert.equal(document.querySelector('[data-saved-search-id="saved-1"]').closest("[data-group]").dataset.group, "savedSearches");
    assert.equal(document.querySelector('[data-saved-search-id="saved-1"]').closest("[data-digit]").dataset.digit, "1");
    assert.equal(document.querySelector('.sw__floating-ball-more [data-action-id="a3"]').closest("[data-digit]").dataset.digit, "2");
    assert.equal(document.querySelector('.sw__floating-ball-more [data-action-id="a1"]').closest("[data-digit]").dataset.digit, "4",
        "slot 3 stays reserved for the deleted action");
    document.activeElement.blur();
    const press = (key) => document.dispatchEvent(new window.KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}));
    press("3");
    assert.equal(panel.isMoreOpen(), true, "missing fixed action does not execute or close the panel");
    assert.deepEqual(activated, []);
    assert.deepEqual(unavailable, [[{kind: "action", actionId: "deleted-action"}, "desktop"]]);
    const search = document.querySelector(".sw__floating-ball-more-search");
    search.value = "project";
    search.dispatchEvent(new window.Event("input", {bubbles: true}));
    assert.equal(document.querySelector('[data-saved-search-id="saved-1"]').closest("[data-digit]").dataset.digit, "1");
    assert.equal(document.querySelector('.sw__floating-ball-more [data-action-id="a3"]').closest(".sw__floating-ball-more-row").hidden, true);
    document.activeElement.blur();
    press("2");
    assert.deepEqual(activated, [], "filtered fixed action does not execute");
    assert.deepEqual(unavailable[1], [{kind: "action", actionId: "a3"}, "desktop"]);
    press("1");
    assert.deepEqual(replayed, [[{searchId: saved.id}, "desktop"]]);
    assert.deepEqual(activated, [], "saved search must not enter the quick-action executor");
    assert.equal(panel.isMoreOpen(), false);
    panel.update({savedSearches: []});
    panel.openMore();
    document.activeElement.blur();
    press("1");
    assert.equal(panel.isMoreOpen(), true, "deleted search keeps its fixed digit reserved");
    assert.equal(replayed.length, 1);
    assert.deepEqual(unavailable[2], [{kind: "saved-search", searchId: saved.id}, "desktop"]);
});

test("fixed action slots resolve live catalog entries outside the configured action list (T-6891)", (t) => {
    const {panel, config, activated, activatedActions, document, window} = setup(t);
    const base = ["a1", "a2", "a3"].map((id) => ({id, kind: "adapter", value: id,
        targets: ["desktop"], label: id}));
    const bound = {id: "catalog-only", kind: "adapter", value: "catalog-only",
        targets: ["desktop"], label: "Catalog only"};
    config.digitSlots.desktop[0] = {kind: "action", actionId: bound.id};
    assert.equal(config.actions.desktop.some((entry) => entry.actionId === bound.id), false);
    const unavailable = [];
    panel.update({config, actions: [...base, {...bound, targets: ["mobile"]}],
        onUnavailable: (reference) => unavailable.push(reference)});
    panel.openMore();
    const findBound = () => document.querySelector('.sw__floating-ball-more [data-action-id="catalog-only"]');
    assert.equal(findBound().disabled, true, "unavailable catalog action remains visible for recovery");
    assert.equal(document.querySelector('.sw__floating-ball-more [data-action-id="a1"]').closest("[data-digit]").dataset.digit, "2");
    document.activeElement.blur();
    document.dispatchEvent(new window.KeyboardEvent("keydown", {key: "1", bubbles: true}));
    assert.deepEqual(activated, [], "unavailable fixed action cannot run");
    assert.deepEqual(unavailable, [{kind: "action", actionId: bound.id}], "unsupported capability reports unavailable");
    panel.update({actions: [...base, {...bound, available: false}]});
    assert.equal(findBound().disabled, true, "catalog availability is rechecked on refresh");
    panel.update({actions: [...base, bound]});
    assert.equal(findBound().closest("[data-digit]").dataset.digit, "1");
    document.dispatchEvent(new window.KeyboardEvent("keydown", {key: "1", bubbles: true}));
    assert.deepEqual(activated, ["catalog-only"], "the current catalog action executes without a config.actions placement");
    assert.equal(activatedActions[0].digitSlotBound, true, "host must recheck a fixed action by id before dispatch");
});

test("digit dispatch yields to all editable targets and modifier keys (T-6891)", (t) => {
    const {panel, activated, document, window} = setup(t);
    panel.openMore();
    const editable = ["input", "textarea", "select"].map((tag) => document.body.appendChild(document.createElement(tag)));
    const rich = document.body.appendChild(document.createElement("div"));
    rich.setAttribute("contenteditable", "true");
    const nested = rich.appendChild(document.createElement("span"));
    editable.push(nested);
    for (const target of editable) {
        target.focus?.();
        const event = new window.KeyboardEvent("keydown", {key: "1", bubbles: true, cancelable: true});
        target.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, `${target.tagName} owns its digit`);
    }
    assert.deepEqual(activated, []);
    document.activeElement.blur();
    for (const modifier of ["ctrlKey", "altKey", "metaKey", "shiftKey"]) {
        const event = new window.KeyboardEvent("keydown", {key: "1", [modifier]: true, bubbles: true, cancelable: true});
        document.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, `${modifier} keeps the host shortcut`);
    }
    assert.deepEqual(activated, []);
    document.dispatchEvent(new window.KeyboardEvent("keydown", {key: "1", bubbles: true, cancelable: true}));
    assert.deepEqual(activated, ["a1"], "plain digit still activates a resolved row");
});

test("context menu and long press configure the bound row without activating it (T-6891)", async (t) => {
    const {panel, config, activated, document, window} = setup(t);
    const configured = [];
    config.digitSlots.desktop[0] = {kind: "action", actionId: "a2"};
    panel.update({config, onConfigureDigitSlot: (...args) => configured.push(args)});
    panel.openMore();
    const row = document.querySelector('.sw__floating-ball-more [data-action-id="a2"]').closest(".sw__floating-ball-more-row");
    const menu = new window.MouseEvent("contextmenu", {bubbles: true, cancelable: true});
    row.dispatchEvent(menu);
    assert.equal(menu.defaultPrevented, true);
    assert.deepEqual(configured, [[0, {kind: "action", actionId: "a2"}, "desktop"]]);
    assert.deepEqual(activated, []);
    panel.openMore();
    const dynamic = document.querySelector('.sw__floating-ball-more [data-action-id="a1"]').closest(".sw__floating-ball-more-row");
    const button = dynamic.querySelector("button");
    button.dispatchEvent(new window.PointerEvent("pointerdown", {button: 0, clientX: 10, clientY: 10, bubbles: true}));
    await new Promise((resolve) => setTimeout(resolve, 580));
    button.dispatchEvent(new window.PointerEvent("pointerup", {button: 0, clientX: 10, clientY: 10, bubbles: true}));
    dynamic.dispatchEvent(new window.MouseEvent("contextmenu", {bubbles: true, cancelable: true}));
    button.click();
    assert.deepEqual(configured[1], [null, {kind: "action", actionId: "a1"}, "desktop"]);
    assert.equal(configured.length, 2, "a synthesized context menu after long press cannot configure twice");
    assert.deepEqual(activated, [], "long press must not fall through to the action click");
});
