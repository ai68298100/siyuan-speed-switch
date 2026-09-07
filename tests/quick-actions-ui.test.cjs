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

test("quick action picker resolves plugin symbols and ignores non-symbol ids", () => {
    const dom = new JSDOM(`
        <svg aria-hidden="true"><symbol id="iconFile"></symbol><symbol id="iconPlugin"></symbol><symbol id="siyuan-media-player-icon"></symbol></svg>
        <div id="siyuan-reader-icon">not an svg icon</div>
        <button id="add"></button><div id="host"></div>
    `);
    const document = dom.window.document;
    const trigger = document.querySelector("#add");
    const host = document.querySelector("#host");
    mountQuickActionPicker({
        trigger,
        host,
        candidates: [
            {id: "media", label: "思播", icon: "siyuan-media-player-icon", fallbackIcon: ["iconPlugin", "iconFile"]},
            {id: "reader", label: "思阅", icon: "siyuan-reader-icon", fallbackIcon: ["iconPlugin", "iconFile"]},
        ],
        onSelect: () => undefined,
    });
    const items = Array.from(host.querySelectorAll("[data-candidate-id]"));
    assert.equal(items.length, 2);
    assert.equal(items[0].querySelector("use").getAttribute("href"), "#siyuan-media-player-icon");
    assert.equal(items[1].querySelector("use").getAttribute("href"), "#iconPlugin");
    assert.equal(items[1].textContent.includes("not an svg icon"), false);
});
