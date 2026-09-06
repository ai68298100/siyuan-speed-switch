const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {mountQuickActionPicker} = require("../src/quick-actions-ui.js");

test("quick action picker opens inline and selects one candidate", () => {
    const dom = new JSDOM('<button id="add" aria-expanded="false">Add</button><div id="host"></div>');
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    const selected = [];
    trigger.addEventListener("click", () => mountQuickActionPicker({
        trigger,
        host,
        candidates: [{id: "clock", label: "打卡", icon: "iconPlugin", group: "插件", secondary: "电脑、侧栏"}],
        searchPlaceholder: "搜索入口",
        emptyText: "无结果",
        onSelect: (candidate) => selected.push(candidate.id),
    }));

    trigger.click();
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.ok(host.querySelector(".sw-setting__quick-picker"));
    host.querySelector('[data-candidate-id="clock"]').click();
    assert.deepEqual(selected, ["clock"]);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(host.querySelector(".sw-setting__quick-picker"), null);
});

test("quick action picker filters candidates and can be toggled closed", () => {
    const dom = new JSDOM('<button id="add"></button><div id="host"></div>');
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    const options = {
        trigger,
        host,
        candidates: [
            {id: "journal", label: "日记", icon: "iconCalendar", group: "内置"},
            {id: "clock", label: "打卡", icon: "iconPlugin", group: "插件"},
        ],
        searchPlaceholder: "搜索入口",
        emptyText: "无结果",
        onSelect: () => undefined,
    };
    mountQuickActionPicker(options);
    const search = host.querySelector("input");
    search.value = "打卡";
    search.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    assert.equal(host.querySelectorAll("[data-candidate-id]").length, 1);
    assert.equal(host.querySelector("[data-candidate-id]").dataset.candidateId, "clock");
    mountQuickActionPicker(options);
    assert.equal(host.querySelector(".sw-setting__quick-picker"), null);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
});
