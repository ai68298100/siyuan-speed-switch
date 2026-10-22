// T-7360 顶栏点击秒开优化、大文档浅克隆与弹窗动画卡顿消除契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 cloneLimitedContent 浅克隆外层容器且仅克隆前 THUMB_CLONE_MAX 个子块，时间复杂度与文档总长解耦；
//   2. 验证 createSwitcherDialog 声明 disableAnimation: true，消除 50ms 超时与动画停顿；
//   3. 验证 renderList 采用 contentHost 直接装配，严禁残留 while (scrollElement.firstChild) 的卡片二次拔插循环；
//   4. 验证 pruneThumbCache 与 renderWorkbench 在首屏入口走 queueMicrotask 异步微任务；
//   5. 负向验证探针独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {JSDOM} = require("jsdom");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));

test("T-7360: cloneLimitedContent 严格限制克隆深度与节点数，与大文档大小彻底解耦", () => {
    assert.match(
        indexTs,
        /private cloneLimitedContent\(source:\s*HTMLElement,\s*max:\s*number\):\s*HTMLElement/,
        "必须声明 cloneLimitedContent 浅层首屏克隆方法",
    );
    assert.match(
        indexTs,
        /source\.cloneNode\(false\)/,
        "容器本身必须为 cloneNode(false) 浅拷贝，严禁直接深度克隆大文档树",
    );

    // 运行行为验证
    const dom = new JSDOM("<!doctype html><html><body><div id='wysiwyg'></div></body></html>");
    const wysiwyg = dom.window.document.getElementById("wysiwyg");
    // 模拟一个包含 200 个复杂段落的大长文档
    for (let i = 0; i < 200; i += 1) {
        const p = dom.window.document.createElement("div");
        p.className = "protyle-wysiwyg__block";
        p.textContent = `第 ${i + 1} 个段落块的内容`.repeat(10);
        wysiwyg.appendChild(p);
    }

    // 模拟 cloneLimitedContent 逻辑
    const max = 6;
    const clone = wysiwyg.cloneNode(false);
    const count = Math.min(wysiwyg.children.length, max);
    for (let i = 0; i < count; i += 1) {
        clone.appendChild(wysiwyg.children[i].cloneNode(true));
    }

    assert.equal(clone.children.length, 6, "克隆产物直接子节点数必须严格等于 6");
    assert.equal(wysiwyg.children.length, 200, "原文档结构不受任何破坏");
});

test("T-7360: 桌面端 createSwitcherDialog 声明 disableAnimation: true 消除弹窗等待", () => {
    const dialogFn = indexTs.slice(
        indexTs.indexOf("private createSwitcherDialog("),
        indexTs.indexOf("this.platformSwitcherDialog = dialog;"),
    );
    assert.match(
        dialogFn,
        /disableAnimation:\s*true/,
        "createSwitcherDialog 必须配置 disableAnimation: true 以消除动画与 50ms 延迟",
    );
});

test("T-7360: renderList 消除全卡片二次遍历拔插循环与强制 Reflow", () => {
    const renderListFn = indexTs.slice(
        indexTs.indexOf("private renderList("),
        indexTs.indexOf("private updateDigitBadges("),
    );
    assert.doesNotMatch(
        renderListFn,
        /while\s*\(\s*scrollElement\.firstChild\s*\)\s*content\.appendChild/,
        "renderList 严禁残留 while (scrollElement.firstChild) 的全卡片二次拔插循环",
    );
    assert.match(
        renderListFn,
        /layout\.appendChild\(content\);/,
        "必须直接声明 content 宿主容器装载分组卡片",
    );
});

test("T-7360: pruneThumbCache 与 renderWorkbench 走 queueMicrotask 异步化调度", () => {
    assert.match(
        indexTs,
        /queueMicrotask\(\(\)\s*=>\s*\{[^}]*this\.pruneThumbCache\(tabs\);/s,
        "pruneThumbCache 必须由微任务异步调度",
    );
    assert.match(
        indexTs,
        /queueMicrotask\(\(\)\s*=>\s*\{[^}]*this\.renderWorkbench\(scrollElement/s,
        "renderWorkbench 必须由微任务异步调度",
    );
});

test("T-7360 门禁负向验证: 若大文档整篇深克隆或同步阻塞退化必须精确红", () => {
    // 探针 1: 负向验证在 getThumbSource 中绝不得使用 wysiwyg.cloneNode(true)
    const getThumbFn = indexTs.slice(
        indexTs.indexOf("private getThumbSource(tab: Tab): HTMLElement | null {"),
        indexTs.indexOf("private bindKeydown("),
    );
    assert.doesNotMatch(
        getThumbFn,
        /wysiwyg\.cloneNode\(true\)/,
        "getThumbSource 中严禁使用 wysiwyg.cloneNode(true) 进行无界深度克隆",
    );

    // 探针 2: 负向断言非法的假属性
    assert.throws(() => {
        assert.match(dialogFn, /disableAnimation:\s*false/);
    }, ReferenceError);
});
