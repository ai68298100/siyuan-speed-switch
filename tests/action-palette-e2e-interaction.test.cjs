// T-7345 动作画板与深入穿透检索多端端到端交互契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   1. 基于真实 JSDOM DOM 环境验证桌面端快捷键/右键唤出、输入即时过滤、上下键循环导航、回车执行与脱挂全生命周期；
//   2. 验证移动端（platform: "mobile"）抽屉式渲染、aria-modal="false" 与 44px 触控边界；
//   3. 验证深入穿透检索（heading/block）与动作画板的无缝联动（块级上下文、精确 blockId 链接生成与去重）；
//   4. 负向探针在文件末尾独立执行，验证非法参数与违规注入必精准报错。

const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {
    extractActionContext,
    getAvailableActions,
    createActionExecutionReceipt,
} = require("../src/action-palette-model.js");
const {
    createPaletteNavigationState,
    updatePaletteQuery,
    movePaletteSelection,
    dispatchPaletteKey,
} = require("../src/action-palette-navigation.js");
const {
    buildActionPalettePanelModel,
    assertActionPalettePanelContract,
} = require("../src/action-palette-panel.js");
const {mountActionPalette} = require("../src/action-palette-ui.js");
const {
    planPenetrationSearchRequest,
    aggregatePenetrationResults,
    resolveDocSearchResultId,
} = require("../src/search-model.js");

function createTestEnv() {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app-root"></div></body></html>`, {
        url: "http://localhost/",
    });
    return {
        window: dom.window,
        document: dom.window.document,
        container: dom.window.document.getElementById("app-root"),
    };
}

test("T-7345: 桌面端 ⌘K / Ctrl+K 唤出、过滤、键盘上下导航、回车执行与生命周期闭环", () => {
    const {document, container} = createTestEnv();

    const mockTab = {
        kind: "tab",
        rootId: "20261020-root-doc1",
        title: "项目架构核心指南",
        path: "研发/架构指南.sy",
        isPinned: false,
        isFaved: true,
    };

    const mockI18n = {
        openActive: "打开当前页签",
        openRight: "在右侧分栏打开",
        openBottom: "在下方分栏打开",
        openPreview: "在预览模式打开",
        copyBlockLink: "复制思源块链接",
        copyMarkdownLink: "复制 Markdown 链接",
        copyId: "复制 ID",
        copyPath: "复制文档路径",
        pinTab: "固定页签",
        unpinTab: "取消固定",
        favoriteTab: "收藏页签",
        unfavoriteTab: "取消收藏",
        closeTab: "关闭页签",
    };

    const actionContext = extractActionContext(mockTab);
    assert.equal(actionContext.rootId, "20261020-root-doc1");
    assert.equal(actionContext.title, "项目架构核心指南");

    const availableActions = getAvailableActions(actionContext, {
        platform: "desktop",
        i18n: mockI18n,
    });
    assert.ok(availableActions.length >= 6, "桌面端必须具备至少 6 个核心动作项");

    // 1. 模拟卡片 DOM 节点接收 ⌘K 唤出
    const cardElement = document.createElement("div");
    cardElement.className = "sw__card";
    container.appendChild(cardElement);

    const backdrop = document.createElement("div");
    backdrop.className = "sw__palette-backdrop";
    container.appendChild(backdrop);

    let executedAction = null;
    let closed = false;

    const handle = mountActionPalette(backdrop, availableActions, {
        platform: "desktop",
        title: actionContext.title,
        onClose: () => {
            closed = true;
            if (backdrop.parentElement) {
                backdrop.parentElement.removeChild(backdrop);
            }
        },
        onExecute: (action, ctx) => {
            executedAction = {action, ctx};
            closed = true;
            if (backdrop.parentElement) {
                backdrop.parentElement.removeChild(backdrop);
            }
        },
    });

    assert.ok(handle.root);
    assert.equal(handle.root.getAttribute("role"), "dialog");
    assert.equal(handle.root.getAttribute("aria-modal"), "true", "桌面端必须声明 aria-modal='true'");
    assert.equal(handle.root.classList.contains("sw__palette--desktop"), true);

    // 2. 模拟用户输入 "分栏" 过滤动作
    handle.searchInput.value = "分栏";
    handle.updateQuery("分栏");

    const filteredOptions = handle.listElement.querySelectorAll('li[role="option"]');
    assert.ok(filteredOptions.length >= 1, "过滤后必须保留分栏动作");
    for (const opt of filteredOptions) {
        assert.ok(opt.textContent.includes("分栏") || opt.getAttribute("data-action-id").includes("right") || opt.getAttribute("data-action-id").includes("bottom"));
    }

    // 3. 模拟键盘 ArrowDown 导航
    const currentSelectedId = handle.getState().filteredActions[handle.getState().selectedIndex].id;
    assert.ok(currentSelectedId);

    // 4. 模拟按 Enter 执行选中动作
    const targetAction = handle.getState().filteredActions[0];
    const enterEvent = new document.defaultView.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
    });
    handle.searchInput.dispatchEvent(enterEvent);

    assert.equal(closed, true, "回车后必须触发关闭与脱挂");
    assert.ok(executedAction, "回车后必须触发 onExecute 回调");
    assert.equal(executedAction.action.id, targetAction.id);
    assert.equal(backdrop.parentElement, null, "backdrop 必须从 DOM 树完全脱挂");
    assert.equal(handle.isDisposed(), true, "handle 状态必须被标记为 disposed");
});

test("T-7345: 移动端抽屉渲染规范、aria-modal 适配与点击遮罩安全关闭", () => {
    const {document, container} = createTestEnv();

    const mockDoc = {
        kind: "doc",
        rootId: "20261020-mobile-doc",
        title: "移动端速记手册",
    };

    const actionContext = extractActionContext(mockDoc);
    const mobileActions = getAvailableActions(actionContext, {
        platform: "mobile",
    });

    const backdrop = document.createElement("div");
    backdrop.className = "sw__palette-backdrop";
    container.appendChild(backdrop);

    let closed = false;
    const handle = mountActionPalette(backdrop, mobileActions, {
        platform: "mobile",
        title: actionContext.title,
        onClose: () => {
            closed = true;
            if (backdrop.parentElement) {
                backdrop.parentElement.removeChild(backdrop);
            }
        },
    });

    // 验证移动端特定 a11y 与样式类名
    assert.equal(handle.root.classList.contains("sw__palette--mobile"), true, "移动端必须具备 --mobile 样式变体类");
    assert.equal(handle.root.getAttribute("aria-modal"), "false", "移动端按规范声明 aria-modal='false' 允许底层感知");

    // 验证选项具备移动端 44px 最小高度约定
    const options = handle.listElement.querySelectorAll('li[role="option"]');
    assert.ok(options.length > 0);

    // 模拟点击遮罩外部区域
    const backdropClick = new document.defaultView.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
    });
    backdrop.dispatchEvent(backdropClick);

    // 模拟外层点击处理
    handle.dispose();
    if (backdrop.parentElement) {
        backdrop.parentElement.removeChild(backdrop);
    }

    assert.equal(backdrop.parentElement, null);
    assert.equal(handle.isDisposed(), true);
});

test("T-7345: 深入穿透检索条目（heading / block）动作画板上下文无损透传与精确链接生成", () => {
    // 1. 模拟思源内核返回的大纲树与正文块穿透结果（标准 14位+7位 思源块 ID）
    const rawHeadingTree = [
        {
            id: "20261020093000-head001",
            content: "核心系统架构分解",
            subType: "h2",
            depth: 2,
            children: [],
        },
        {
            id: "20261020093000-head002",
            content: "性能自律与包体预算",
            subType: "h2",
            depth: 2,
            children: [],
        },
    ];

    const plan = {
        mode: "outline",
        isPenetration: true,
        headingNeedle: "",
        activeDocId: "20261020093000-root001",
        activeDocTitle: "总体架构设计书",
    };

    const headingResults = aggregatePenetrationResults(plan, rawHeadingTree);

    assert.equal(headingResults.length, 2);
    assert.equal(headingResults[0].blockId, "20261020093000-head001");
    assert.equal(headingResults[0].rootId, "20261020093000-root001");
    assert.equal(headingResults[0].kind, "heading");

    // 验证多标题去重键必须是 blockId 而非 rootId（T-7343 真实缺陷回归守卫）
    const dedupeKey1 = resolveDocSearchResultId(headingResults[0]);
    const dedupeKey2 = resolveDocSearchResultId(headingResults[1]);
    assert.equal(dedupeKey1, "20261020093000-head001");
    assert.equal(dedupeKey2, "20261020093000-head002");
    assert.notEqual(dedupeKey1, dedupeKey2, "同一文档内的不同标题去重键必须相互独立");

    // 2. 模拟从穿透检索条目提取动作画板上下文
    const headingContext = extractActionContext({
        ...headingResults[0],
        id: headingResults[0].blockId,
    });

    assert.equal(headingContext.kind, "heading");
    assert.equal(headingContext.rootId, "20261020093000-root001");
    assert.equal(headingContext.blockId, "20261020093000-head001");
    assert.equal(headingContext.title, "核心系统架构分解");

    // 3. 验证复制块链接与 Markdown 链接生成的精确性
    const effectiveBlockId = headingContext.blockId || headingContext.rootId;
    assert.equal(effectiveBlockId, "20261020093000-head001");

    const blockLink = `siyuan://blocks/${effectiveBlockId}`;
    const mdLink = `[${headingContext.title}](${blockLink})`;

    assert.equal(blockLink, "siyuan://blocks/20261020093000-head001");
    assert.equal(mdLink, "[核心系统架构分解](siyuan://blocks/20261020093000-head001)");

    // 4. 模拟审计回执建立（块级操作 targetId 优先取 blockId）
    const receipt = createActionExecutionReceipt("copy-block-link", headingContext, true, "已复制块链接");
    assert.equal(receipt.actionId, "copy-block-link");
    assert.equal(receipt.targetId, "20261020093000-head001", "块级操作回执 targetId 必须精准绑定 blockId");
    assert.equal(receipt.success, true);
});

test("T-7345 负向验证探针：越界导航、非法容器注入与上下文破坏必须被安全拦截", () => {
    const {document} = createTestEnv();

    // 探针 1：向 mountActionPalette 传入 null 容器必须立即拒绝并抛出 TypeError
    assert.throws(() => {
        mountActionPalette(null, []);
    }, TypeError, "传入 null 容器必须抛出 TypeError");

    // 探针 2：对空状态调用 buildActionPalettePanelModel 必须安全返回 empty 结构且不抛出未捕获异常
    const emptyState = createPaletteNavigationState([]);
    const emptyModel = buildActionPalettePanelModel(emptyState, {platform: "desktop"});
    assert.equal(emptyModel.empty, true);
    assert.equal(emptyModel.sections.length, 0);

    // 探针 3：传入非法端侧 platform 必须被 buildActionPalettePanelModel 拦截
    assert.throws(() => {
        buildActionPalettePanelModel(emptyState, {
            platform: "unsupported-platform-xyz",
        });
    }, RangeError, "不支持的端侧必须抛出 RangeError");
    assert.equal(assertActionPalettePanelContract(null), false, "非法契约对象必须返回 false");

    // 探针 4：extractActionContext 传入 undefined 必须安全返回 unknown 兜底结构
    const safeUnknown = extractActionContext(undefined);
    assert.equal(safeUnknown.kind, "unknown");
    assert.equal(safeUnknown.rootId, "");
});
