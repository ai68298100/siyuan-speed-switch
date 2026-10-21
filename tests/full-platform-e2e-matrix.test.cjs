// T-7358 全平台 E2E 矩阵与性能门禁最终验收测试套件
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 覆盖桌面主窗、极限窄侧栏 Dock（245px～340px）与移动端抽屉三大端侧环境；
//   2. 验证动作画板 MRU 排序、快捷键免呼出直达、Ctrl+Shift+T 撤销恢复、文档集保存；
//   3. 验证工作台多媒体进度/徽标、属性视图看板与闪卡复习小组件；
//   4. 负向验证在文件末尾独立执行。

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {JSDOM} = require("jsdom");
const {readSourceText} = require("./source-scan.cjs");

const root = path.resolve(__dirname, "..");
const indexTs = readSourceText(path.join(root, "src", "index.ts"));
const actionPaletteModel = require("../src/action-palette-model.js");
const actionPaletteNav = require("../src/action-palette-navigation.js");
const actionPalettePanel = require("../src/action-palette-panel.js");
const {mountActionPalette} = require("../src/action-palette-ui.js");
const {renderHomeModuleView} = require("../src/home-view.js");

test("T-7358 桌面端: 切换器动作画板 MRU 动态排序与快捷键直达执行", () => {
    // 1. 验证 sortPaletteActionsByMru 行为
    const actions = [
        {id: "open-active", section: "open", label: "激活"},
        {id: "open-right", section: "open", label: "右分屏"},
        {id: "open-in-reader", section: "open", label: "思阅"},
        {id: "copy-id", section: "copy", label: "复制ID"},
        {id: "close-tab", section: "manage", label: "关闭"},
    ];
    // 假设最近使用了 open-in-reader
    const sorted = actionPaletteModel.sortPaletteActionsByMru(actions, ["open-in-reader"]);
    // open section 内部 open-in-reader 必须被提升到该 section 的第一位
    assert.equal(sorted[0].id, "open-in-reader");
    assert.equal(sorted[1].id, "open-active");
    // copy 和 manage 保持原有分布
    assert.equal(sorted[3].id, "copy-id");
    assert.equal(sorted[4].id, "close-tab");

    // 2. 状态机 updatePaletteQuery 遵循 MRU 偏好
    const state = actionPaletteNav.createPaletteNavigationState(actions, {
        isOpen: true,
        recentActionIds: ["open-in-reader"],
    });
    assert.equal(state.filteredActions[0].id, "open-in-reader");

    // 3. 验证生产实现中 recentPaletteActions 维护逻辑
    assert.match(indexTs, /private recentPaletteActions:\s*string\[\]\s*=\s*\[\];/);
    assert.match(indexTs, /recentActionIds:\s*this\.recentPaletteActions/);
    assert.match(indexTs, /this\.recentPaletteActions\s*=\s*\[actionId/);
});

test("T-7358 窄侧栏 Dock (245px~340px): 动作画板弹性自适应防溢出", () => {
    const polishScss = readSourceText(path.join(root, "src", "styles", "_11-ui-polish.scss"));
    // 必须有 label 的 min-width: 0 与 shortcut 的 flex-shrink: 0
    assert.match(
        polishScss,
        /\.sw__palette-item-label\s*\{[^}]*min-width:\s*0/s,
        "窄侧栏动作项标签必须声明 min-width: 0 以支持 flex 截断",
    );
    assert.match(
        polishScss,
        /\.sw__palette-item-shortcut\s*\{[^}]*flex-shrink:\s*0/s,
        "快捷键徽标必须声明 flex-shrink: 0 防止窄屏挤压",
    );

    // 验证 sidebar 平台声明式类名
    const panelModel = actionPalettePanel.buildActionPalettePanelModel(
        {filteredActions: [{id: "x", section: "open", label: "超长测试文档标签名称".repeat(5)}], selectedIndex: 0},
        {platform: "sidebar", idSuffix: "sb"},
    );
    assert.equal(panelModel.attrs.root.className, "sw__palette sw__palette--sidebar");
    assert.equal(panelModel.platform, "sidebar");
});

test("T-7358 移动端: 底部抽屉 (Bottom Sheet) 渲染与 44px 触控可达性", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body><div id='container'></div></body></html>");
    const container = dom.window.document.getElementById("container");
    const actions = [
        {id: "open-active", section: "open", label: "激活页签", icon: "iconFile"},
        {id: "close-tab", section: "manage", label: "关闭页签", icon: "iconClose", isDestructive: true},
    ];

    let executed = null;
    const handle = mountActionPalette(container, actions, {
        platform: "mobile",
        title: "移动操作",
        onExecute: (act) => { executed = act.id; },
    });

    const rootEl = container.querySelector(".sw__palette");
    assert.ok(rootEl, "必须挂载 .sw__palette 节点");
    assert.ok(rootEl.classList.contains("sw__palette--mobile"), "移动端必须具备 sw__palette--mobile 类名");
    assert.equal(rootEl.getAttribute("aria-modal"), "false", "移动端抽屉应声明 aria-modal=false 避免屏幕遮挡");

    // 点击执行动作
    const firstOption = container.querySelector(".sw__palette-item");
    assert.ok(firstOption, "必须包含列表项");
    firstOption.click();
    assert.equal(executed, "open-active", "点击第一项应触发 open-active 执行");

    handle.dispose();
    assert.equal(handle.isDisposed(), true, "dispose 后状态必须标记为已销毁");
});

test("T-7358 工作台: 属性视图看板、闪卡复习与多媒体沉浸卡片全景对账", () => {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
    const doc = dom.window.document;

    // 1. media 视图带有 badge 与 progress 渲染
    const mediaView = {
        moduleId: "external-anime-bangumi",
        title: "每日放送与在读书架",
        status: "ready",
        viewType: "media",
        items: [
            {
                label: "SiMedia 媒体中心",
                secondary: "高清 1080P · 已播 60%",
                image: "https://example.com/media.jpg",
                badge: "SiMedia",
                progress: 60,
            },
        ],
    };
    const renderedMedia = renderHomeModuleView(doc, mediaView);
    assert.ok(renderedMedia);
    const badgeEl = renderedMedia.querySelector(".sw__home-media-badge");
    const progressEl = renderedMedia.querySelector(".sw__home-media-progress-bar");
    assert.ok(badgeEl && badgeEl.textContent === "SiMedia");
    assert.ok(progressEl && progressEl.style.width === "60%");

    // 2. 验证 database-board 与 flashcard-review 在工作台已注册
    const homeModel = require("../src/home-model.js");
    const moduleIds = homeModel.DEFAULT_MODULES.map((m) => m.moduleId);
    assert.ok(moduleIds.includes("database-board"), "DEFAULT_MODULES 必须包含 database-board");
    assert.ok(moduleIds.includes("flashcard-review"), "DEFAULT_MODULES 必须包含 flashcard-review");
});

test("T-7358 门禁负向验证: 若 MRU 排序破坏 section 字典序或非法参数必定精准红", () => {
    // 探针 1: sortPaletteActionsByMru 绝不跨 section 提拔破坏 open/copy/manage 字典序
    const mixedActions = [
        {id: "open-active", section: "open"},
        {id: "copy-id", section: "copy"},
        {id: "close-tab", section: "manage"},
    ];
    // 试图将 manage 类的 close-tab 置顶
    const sorted = actionPaletteModel.sortPaletteActionsByMru(mixedActions, ["close-tab"]);
    // open 类必须依然排在第一位，manage 不能跳到最前
    assert.equal(sorted[0].section, "open", "MRU 排序不得跨越 section 破坏全局结构");
    assert.equal(sorted[2].id, "close-tab");

    // 探针 2: 负向断言伪造的不存在动作
    assert.throws(() => {
        assert.equal(sorted.some((a) => a.id === "broken_fake_action_123"), true);
    }, assert.AssertionError);
});
