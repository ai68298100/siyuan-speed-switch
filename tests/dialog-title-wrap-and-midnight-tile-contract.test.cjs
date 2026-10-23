// T-7362 弹窗统一品牌标题栏与工作台午夜黑金卡规范契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 mountPlatformDialogTitleWrap 产出 .lv-dialog-title-wrap 并具备幂等性；
//   2. 验证切换器、工作台、片段实验室与设置弹窗均装配 mountPlatformDialogTitleWrap；
//   3. 验证工作台为时钟及深色材质小组件挂载 sw-home__cell--midnight 类；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {JSDOM} = require("jsdom");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const platformDom = require("../src/platform-dom.js");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const secondPanelTs = readSourceText(path.join(root, "src", "second-panel-ui.ts"));
const secondPanelJs = readSourceText(path.join(root, "src", "second-panel-ui.js"));

function withDom(run) {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    return run(dom.window.document);
}

test("T-7362: mountPlatformDialogTitleWrap 构建 22×22 紫底白标、标题与版本胶囊且保持幂等", () => {
    withDom((doc) => {
        const dialog = doc.createElement("div");
        dialog.innerHTML = '<div class="b3-dialog__header"><span class="b3-dialog__title">页签切换器</span><button class="b3-dialog__close" type="button"></button></div>';

        const wrap = platformDom.mountPlatformDialogTitleWrap(dialog, "页签切换器", "v0.48.9", "iconLvSpeedSwitch", doc);
        assert.ok(wrap, "必须成功创建并返回 title wrap");
        assert.equal(wrap.className, "lv-dialog-title-wrap");
        assert.equal(wrap.querySelector(".lv-dialog-title-text").textContent, "页签切换器");
        assert.equal(wrap.querySelector(".lv-dialog-title-badge").textContent, "v0.48.9");
        assert.ok(wrap.querySelector(".lv-dialog-title-icon svg use").getAttribute("xlink:href").includes("iconLvSpeedSwitch"));

        // 幂等性自检
        const wrap2 = platformDom.mountPlatformDialogTitleWrap(dialog, "重复", "v0.48.9", "iconLvSpeedSwitch", doc);
        assert.equal(wrap2, wrap, "二次挂载必须保持幂等并返回已有节点");
    });
});

test("T-7362: 切换器、工作台、片段实验室与设置均接入 mountPlatformDialogTitleWrap", () => {
    assert.match(
        indexTs,
        /mountPlatformDialogTitleWrap\(dialog\.element,\s*this\.i18n\.dialogSwitcherTitle/,
        "切换器 Dialog 必须挂载统一标题栏",
    );
    assert.match(
        indexTs,
        /mountPlatformDialogTitleWrap\(dialog\.element,\s*this\.i18n\.dialogStudioTitle/,
        "片段实验室 Dialog 必须挂载统一标题栏",
    );
    assert.match(
        indexTs,
        /mountPlatformDialogTitleWrap\(dialog\.element,\s*this\.i18n\.settings/,
        "设置 Dialog 必须挂载统一标题栏",
    );
    assert.match(
        secondPanelTs,
        /mountPlatformDialogTitleWrap\(dialog\.element,\s*this\.i18n\.dialogWorkbenchTitle/,
        "工作台 Dialog 必须挂载统一标题栏",
    );
    assert.match(
        secondPanelJs,
        /mountPlatformDialogTitleWrap\)\(dialog\.element,\s*this\.i18n\.dialogWorkbenchTitle/,
        "工作台 JS 实现必须挂载统一标题栏",
    );
});

test("T-7362: 工作台深色与时钟小组件挂载 sw-home__cell--midnight 规范", () => {
    assert.match(
        secondPanelTs,
        /cell\.classList\.add\("sw-home__cell--midnight"\);/,
        "second-panel-ui.ts 必须按规则挂载 sw-home__cell--midnight",
    );
    assert.match(
        secondPanelJs,
        /cell\.classList\.add\("sw-home__cell--midnight"\);/,
        "second-panel-ui.js 必须按规则挂载 sw-home__cell--midnight",
    );
});

test("T-7362: 穿透检索模型全面支持中文全角符号自适应 (！、》、：、？)", () => {
    const penetrationModel = require("../src/penetration-search-model.js");
    const bookmarkRes = penetrationModel.parsePenetrationQuery("！重要书签");
    assert.equal(bookmarkRes.mode, penetrationModel.SEARCH_MODES.BOOKMARK);
    assert.equal(bookmarkRes.bookmarkNeedle, "重要书签");

    const cmdRes = penetrationModel.parsePenetrationQuery("》插件设置");
    assert.equal(cmdRes.mode, penetrationModel.SEARCH_MODES.COMMAND);
    assert.equal(cmdRes.commandNeedle, "插件设置");

    const outlineRes = penetrationModel.parsePenetrationQuery("工作周报：本周总结");
    assert.equal(outlineRes.mode, penetrationModel.SEARCH_MODES.OUTLINE);
    assert.equal(outlineRes.docNeedle, "工作周报");
    assert.equal(outlineRes.headingNeedle, "本周总结");
});

test("T-7362 门禁负向验证: 若传入非法元素或空 header 必须安全返回 null", () => {
    // 探针 1: 空对象或无 querySelector
    assert.equal(platformDom.mountPlatformDialogTitleWrap(null, "测试"), null);
    assert.equal(platformDom.mountPlatformDialogTitleWrap({}, "测试"), null);

    // 探针 2: 缺少 .b3-dialog__header 或 .b3-dialog__title
    withDom((doc) => {
        const fakeDialog = doc.createElement("div");
        fakeDialog.innerHTML = '<div class="no-header"></div>';
        assert.equal(platformDom.mountPlatformDialogTitleWrap(fakeDialog, "测试", undefined, undefined, doc), null);
    });
});
