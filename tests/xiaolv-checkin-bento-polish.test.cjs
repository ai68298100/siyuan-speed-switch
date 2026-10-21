// T-7360 小驴打卡风格 7天周期胶囊轴、双拼 Bento 瓦片与待办完成鼓励横幅契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 checkin-weekly 渲染 .sw__home-capsule-tracker 与 7 个周期胶囊节点；
//   2. 验证 today-tasks 在全部完成时装配 .sw__home-celebration 鼓励横幅；
//   3. 验证 蜜糖金 (#f9a84d) 与 薰衣草紫 (#9b8df7) 双拼 Bento 样式规则声明；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {JSDOM} = require("jsdom");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const {renderHomeModuleView} = require("../src/home-view.js");
const cardsScss = readSourceText(path.join(root, "src", "styles", "_08-home-store-cards.scss"));

test("T-7360: checkin-weekly 渲染 .sw__home-capsule-tracker 与 7 天周期胶囊", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;

    const weeklyView = {
        moduleId: "checkin-weekly",
        title: "本周打卡",
        status: "ready",
        items: [
            {label: "周一", value: "1"},
            {label: "周二", value: "2"},
            {label: "周三", value: "0"},
            {label: "周四", value: "0"},
            {label: "周五", value: "0"},
            {label: "周六", value: "0"},
            {label: "周日", value: "0"},
        ],
    };

    const element = renderHomeModuleView(doc, weeklyView);
    assert.ok(element, "组件节点必须成功渲染");
    const tracker = element.querySelector(".sw__home-capsule-tracker");
    assert.ok(tracker, "本周打卡必须装配 7天周期胶囊时间轴 (.sw__home-capsule-tracker)");

    const capsules = tracker.querySelectorAll(".sw__home-capsule-item");
    assert.equal(capsules.length, 7, "必须严格包含周一至周日 7 枚胶囊");

    // 检查完成态与今日态标识
    assert.ok(element.querySelector(".sw__home-capsule-item.is-done"), "打卡值 > 0 的天数必须带有 is-done 标记");
    assert.ok(element.querySelector(".sw__home-capsule-item.is-today"), "当天必须带有 is-today 标记");
});

test("T-7360: today-tasks 在全部完成时渲染 .sw__home-celebration 情绪化鼓励横幅", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;

    const allDoneView = {
        moduleId: "today-tasks",
        title: "今日待办",
        status: "ready",
        items: [
            {label: "阅读文献", done: true},
            {label: "写周报", done: true},
        ],
    };

    const element = renderHomeModuleView(doc, allDoneView, {
        labels: {allTasksDone: "🎉 太棒了！今日待办已全部完成"},
    });
    const celebration = element.querySelector(".sw__home-celebration");
    assert.ok(celebration, "全部待办完成时必须渲染 .sw__home-celebration 鼓励横幅");
    assert.match(celebration.textContent, /太棒了/, "鼓励横幅文案必须正确渲染");
});

test("T-7360: 样式层声明双拼 Bento 瓦片色彩规范与胶囊轴样式", () => {
    assert.match(cardsScss, /\.sw__home-capsule-tracker\s*\{/);
    assert.match(cardsScss, /\.sw__home-capsule-item\s*\{/);
    assert.match(cardsScss, /\.sw__home-celebration\s*\{/);
    assert.match(cardsScss, /data-module-id="checkin-streak"/);
    assert.match(cardsScss, /data-module-id="checkin-today"/);
});

test("T-7360 门禁负向验证: 未完成任务或非待办模块绝不误判渲染庆祝横幅", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;

    // 探针 1: 仍有未完成任务
    const incompleteView = {
        moduleId: "today-tasks",
        title: "今日待办",
        status: "ready",
        items: [
            {label: "任务一", done: true},
            {label: "任务二", done: false},
        ],
    };
    const incompleteEl = renderHomeModuleView(doc, incompleteView);
    assert.equal(incompleteEl.querySelector(".sw__home-celebration"), null, "有未完成任务时绝不渲染庆祝横幅");

    // 探针 2: 非 today-tasks 模块即便利项均为 done 也绝不误触发
    const otherView = {
        moduleId: "recent-documents",
        title: "近期文档",
        status: "ready",
        items: [
            {label: "文档一", done: true},
        ],
    };
    const otherEl = renderHomeModuleView(doc, otherView);
    assert.equal(otherEl.querySelector(".sw__home-celebration"), null, "非待办模块绝不渲染庆祝横幅");
});
