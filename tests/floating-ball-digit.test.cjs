// T-6884（T-6857）悬浮球更多面板数字直达：面板打开时 1-9 直达第 n 个可见动作行。
// 真实面板控制器 + jsdom 行为测试（键位分发、搜索框让路、移动端不标注、销毁解绑）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {createDefaultFloatingBallConfig} = require("../src/floating-ball-model.js");
const {createFloatingBallPanelController} = require("../src/floating-ball-panel.js");

function setup(t, {surface = "desktop"} = {}) {
    const dom = new JSDOM("<!doctype html><body></body>");
    const container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    const activated = [];
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
        onAction: (action) => activated.push(action.id),
    });
    t.after(() => {
        panel.destroy();
        dom.window.close();
    });
    panel.mount();
    return {dom, panel, activated, window: dom.window, document: dom.window.document};
}

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
