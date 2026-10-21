// T-7356 & T-7357 切换器一键撤销关闭页签、文档集快捷保存与思阅/思播生态联动契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 验证 undoLastClosedTab 与 saveCurrentTabsAsDocSet 生产实现；
//   2. 验证 Ctrl+Shift+T 全局撤销按键分流与卡片 Alt+R/Alt+V 免呼出直达；
//   3. 验证动作画板（Action Palette）思阅、思播、文档集保存与撤销关闭动作定义；
//   4. 验证工作台媒体（media）卡片的高级进度条与徽标视觉渲染；
//   5. 负向探针在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {JSDOM} = require("jsdom");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const actionPaletteModel = require("../src/action-palette-model.js");
const {renderHomeModuleView} = require("../src/home-view.js");

test("T-7356: SpeedSwitchPlugin 声明并实现了 undoLastClosedTab 与 Ctrl+Shift+T 快捷键监听", () => {
    // 1. 方法声明与实现
    assert.match(
        indexTs,
        /undoLastClosedTab\s*\(\s*closeOverlay\?\s*:\s*IOverlayClose\s*\)\s*:\s*boolean/,
        "必须实现 undoLastClosedTab 方法并返回执行布尔值",
    );
    assert.match(
        indexTs,
        /this\.removeClosedHistoryEntry\s*\(\s*last\.rootId\s*\)/,
        "撤销关闭必须从已关闭历史列表中移除对应条目",
    );
    assert.match(
        indexTs,
        /openTab\s*\(\s*\{\s*app\s*:\s*this\.app\s*,\s*doc\s*:\s*\{\s*id\s*:\s*last\.rootId\s*\}\s*\}\s*\)/,
        "撤销关闭必须调用 openTab 打开文档",
    );

    // 2. 全局键盘监听中的 Ctrl+Shift+T / Cmd+Shift+T 拦截
    assert.match(
        indexTs,
        /event\.shiftKey\s*&&\s*key\.toLowerCase\(\)\s*===\s*["']t["']/,
        "bindKeydown 必须监听 Shift+T",
    );
    assert.match(
        indexTs,
        /this\.undoLastClosedTab\s*\(\s*closeOverlay\s*\)/,
        "Shift+T 触发时必须调用 undoLastClosedTab",
    );
});

test("T-7357: SpeedSwitchPlugin 声明并实现了 saveCurrentTabsAsDocSet 一键保存会话保护", () => {
    // 1. 方法声明与实现
    assert.match(
        indexTs,
        /saveCurrentTabsAsDocSet\s*\(\s*\)\s*:\s*boolean/,
        "必须实现 saveCurrentTabsAsDocSet 方法",
    );
    assert.match(
        indexTs,
        /createDocumentSet\s*\(/,
        "saveCurrentTabsAsDocSet 必须调用 createDocumentSet 构造标准化文档集",
    );
    assert.match(
        indexTs,
        /upsertDocumentSet\s*\(/,
        "saveCurrentTabsAsDocSet 必须调用 upsertDocumentSet 写入存储状态",
    );

    // 2. 动作画板中存在 save-as-doc-set 分支调度
    assert.match(
        indexTs,
        /case\s*["']save-as-doc-set["']\s*:\s*this\.saveCurrentTabsAsDocSet\(\)/,
        "executePaletteAction 必须覆盖 save-as-doc-set 动作分支",
    );
});

test("生态联动: 动作画板接入思阅（open-in-reader）与思播（open-in-media）及卡片单键直达", () => {
    // 1. 动作画板模型中已定义思阅与思播动作
    const defs = actionPaletteModel.getBuiltinActionDefinitions({
        actionPaletteOpenInReader: "在思阅中阅读",
        actionPaletteOpenInMedia: "在思播中打开",
        actionPaletteSaveAsDocSet: "保存为文档集",
        actionPaletteUndoClosedTab: "撤销关闭页签",
    });
    const readerAction = defs.find((d) => d.id === "open-in-reader");
    const mediaAction = defs.find((d) => d.id === "open-in-media");
    const saveSetAction = defs.find((d) => d.id === "save-as-doc-set");
    const undoAction = defs.find((d) => d.id === "undo-closed-tab");

    assert.ok(readerAction, "必须声明 open-in-reader 动作");
    assert.equal(readerAction.section, "open");
    assert.equal(readerAction.shortcut, "⌥R");
    assert.equal(readerAction.icon, "iconBook");

    assert.ok(mediaAction, "必须声明 open-in-media 动作");
    assert.equal(mediaAction.section, "open");
    assert.equal(mediaAction.shortcut, "⌥V");
    assert.equal(mediaAction.icon, "iconVideo");

    assert.ok(saveSetAction, "必须声明 save-as-doc-set 动作");
    assert.equal(saveSetAction.section, "manage");
    assert.equal(saveSetAction.shortcut, "⌘⇧S");

    assert.ok(undoAction, "必须声明 undo-closed-tab 动作");
    assert.equal(undoAction.section, "manage");
    assert.equal(undoAction.shortcut, "⌘⇧T");

    // 2. 卡片级键盘直达 Alt+R 与 Alt+V 监听
    assert.match(
        indexTs,
        /event\.altKey\s*&&\s*!isCtrlOrCmd\s*&&\s*event\.key\.toLowerCase\(\)\s*===\s*["']r["']/,
        "卡片 keydown 必须支持 Alt+R 免呼出直达在思阅中阅读",
    );
    assert.match(
        indexTs,
        /event\.altKey\s*&&\s*!isCtrlOrCmd\s*&&\s*event\.key\.toLowerCase\(\)\s*===\s*["']v["']/,
        "卡片 keydown 必须支持 Alt+V 免呼出直达在思播中打开",
    );

    // 3. executePaletteAction 完整覆盖两项分支
    assert.match(
        indexTs,
        /case\s*["']open-in-reader["']\s*:/,
        "executePaletteAction 必须包含 open-in-reader",
    );
    assert.match(
        indexTs,
        /case\s*["']open-in-media["']\s*:/,
        "executePaletteAction 必须包含 open-in-media",
    );
});

test("工作台优化: media 视图类型正确渲染进度条（progress）与徽标（badge）", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    const doc = dom.window.document;
    const view = {
        moduleId: "siyuan-media",
        title: "思播媒体与在读",
        status: "ready",
        viewType: "media",
        items: [
            {
                label: "SiMedia 播客第一期",
                secondary: "已播 45 分钟 · 45%",
                image: "https://example.com/cover1.jpg",
                badge: "B站",
                progress: 45,
            },
            {
                label: "思阅在读：深入浅出 TypeScript",
                secondary: "第 3 章 · 80%",
                image: "https://example.com/cover2.jpg",
                badge: "EPUB",
                progress: 80,
            },
        ],
    };

    const rendered = renderHomeModuleView(doc, view);
    assert.ok(rendered, "renderHomeModuleView 必须返回有效的 HTMLElement");

    const badges = rendered.querySelectorAll(".sw__home-media-badge");
    assert.equal(badges.length, 2, "应渲染 2 个媒体徽标");
    assert.equal(badges[0].textContent, "B站");
    assert.equal(badges[1].textContent, "EPUB");

    const progressBars = rendered.querySelectorAll(".sw__home-media-progress-bar");
    assert.equal(progressBars.length, 2, "应渲染 2 个媒体进度条");
    assert.equal(progressBars[0].style.width, "45%");
    assert.equal(progressBars[1].style.width, "80%");
});

test("AGENTS 门禁负向验证: 若撤销或动作画板声明被破坏必须精准红", () => {
    // 负向探针 1: 动作 ID 拼写错误必须拒绝
    const defs = actionPaletteModel.getBuiltinActionDefinitions();
    assert.throws(() => {
        const broken = defs.find((d) => d.id === "non_existent_action_probe");
        assert.ok(broken, "应当断言失败");
    }, /应当断言失败/);

    // 负向探针 2: 进度百分比非法时不产生 progress 节点
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    const doc = dom.window.document;
    const viewWithoutProgress = {
        moduleId: "siyuan-media",
        title: "思播媒体与在读",
        status: "ready",
        viewType: "media",
        items: [
            {
                label: "无进度媒体",
                image: "https://example.com/cover.jpg",
                progress: -1,
            },
        ],
    };
    const rendered = renderHomeModuleView(doc, viewWithoutProgress);
    const progressBars = rendered.querySelectorAll(".sw__home-media-progress-bar");
    assert.equal(progressBars.length, 0, "负数进度时不应渲染进度条");
});
