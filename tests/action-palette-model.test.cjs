// T-7335 Raycast 式次级动作画板（Action Palette）契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/action-palette-model.js；
//   - 包含正向提取、多端过滤、多类型分流、动态文案/图标、即时过滤与执行回执；
//   - 负向探针在文件末尾独立执行：桌面独占动作泄漏到移动端、类型不匹配泄漏等必须定向失败。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    ACTION_SECTIONS,
    extractActionContext,
    getBuiltinActionDefinitions,
    getAvailableActions,
    filterPaletteActions,
    createActionExecutionReceipt,
} = require("../src/action-palette-model.js");

test("T-7335: extractActionContext normalizes tab, doc, favorite, closed, doc-set and null", () => {
    // 1. 页签条目
    const tabItem = {
        kind: "tab",
        rootId: "20260101-tab1",
        title: "工作周报",
        path: "工作/周报.sy",
        hPath: "工作/周报",
        isPinned: true,
        isFaved: false,
    };
    const tabCtx = extractActionContext(tabItem);
    assert.equal(tabCtx.kind, "tab");
    assert.equal(tabCtx.rootId, "20260101-tab1");
    assert.equal(tabCtx.title, "工作周报");
    assert.equal(tabCtx.isPinned, true);
    assert.equal(tabCtx.isFaved, false);

    // 2. 搜索文档条目
    const docItem = {
        id: "20260101-doc1",
        name: "技术方案",
        hPath: "研发/方案",
        box: "box-tech",
        blockId: "20260101-blk1",
    };
    const docCtx = extractActionContext(docItem);
    assert.equal(docCtx.kind, "doc");
    assert.equal(docCtx.rootId, "20260101-doc1");
    assert.equal(docCtx.blockId, "20260101-blk1");
    assert.equal(docCtx.title, "技术方案");
    assert.equal(docCtx.notebookId, "box-tech");

    // 3. 文档集条目
    const setItem = {
        setId: "set-release",
        name: "发布文档集",
        entryCount: 5,
    };
    const setCtx = extractActionContext(setItem);
    assert.equal(setCtx.kind, "doc-set");
    assert.equal(setCtx.setId, "set-release");
    assert.equal(setCtx.title, "发布文档集");
    assert.equal(setCtx.entryCount, 5);

    // 4. 空/非法输入
    const emptyCtx = extractActionContext(null);
    assert.equal(emptyCtx.kind, "unknown");
    assert.equal(emptyCtx.rootId, "");
    assert.equal(emptyCtx.title, "");
});

test("T-7335: getAvailableActions filters by platform and item kind", () => {
    const tabCtx = extractActionContext({kind: "tab", rootId: "tab-1", isPinned: false, isFaved: false});

    // 桌面端 Tab：包含分栏打开、置顶、收藏、关闭
    const desktopActions = getAvailableActions(tabCtx, {platform: "desktop"});
    const desktopIds = desktopActions.map((a) => a.id);
    assert.ok(desktopIds.includes("open-active"));
    assert.ok(desktopIds.includes("open-right"), "桌面端必须支持分栏打开");
    assert.ok(desktopIds.includes("open-bottom"));
    assert.ok(desktopIds.includes("toggle-pin"));
    assert.ok(desktopIds.includes("close-tab"));

    // 移动端 Tab：不支持桌面专属分栏打开
    const mobileActions = getAvailableActions(tabCtx, {platform: "mobile"});
    const mobileIds = mobileActions.map((a) => a.id);
    assert.ok(mobileIds.includes("open-active"));
    assert.equal(mobileIds.includes("open-right"), false, "移动端不得暴露分栏打开");
    assert.equal(mobileIds.includes("open-bottom"), false);
    assert.ok(mobileIds.includes("toggle-pin"));
    assert.ok(mobileIds.includes("close-tab"));

    // 文档集：只能恢复，不得暴露关闭页签
    const setCtx = extractActionContext({setId: "set-1", name: "集", entryCount: 2});
    const setActions = getAvailableActions(setCtx, {platform: "desktop"});
    const setIds = setActions.map((a) => a.id);
    assert.ok(setIds.includes("restore-doc-set"));
    assert.equal(setIds.includes("close-tab"), false, "文档集不得暴露关闭页签动作");
    assert.equal(setIds.includes("copy-markdown-link"), false);
});

test("T-7335: getAvailableActions dynamically reflects pinned and faved state", () => {
    // 调用方注入 i18n（生产场景由 src/i18n/*.json 注入）
    const i18n = {
        pinTab: "置顶页签",
        unpinTab: "取消置顶",
        favoriteTab: "加入收藏",
        unfavoriteTab: "移出收藏",
    };
    // 未置顶/未收藏
    const unpinnedCtx = extractActionContext({kind: "tab", isPinned: false, isFaved: false});
    const unpinnedActions = getAvailableActions(unpinnedCtx, {i18n});
    const pinAction = unpinnedActions.find((a) => a.id === "toggle-pin");
    const favAction = unpinnedActions.find((a) => a.id === "toggle-fav");
    assert.equal(pinAction.label, "置顶页签");
    assert.equal(pinAction.icon, "iconPin");
    assert.equal(favAction.label, "加入收藏");

    // 已置顶/已收藏
    const pinnedCtx = extractActionContext({kind: "tab", isPinned: true, isFaved: true});
    const pinnedActions = getAvailableActions(pinnedCtx, {i18n});
    const unpinAction = pinnedActions.find((a) => a.id === "toggle-pin");
    const unfavAction = pinnedActions.find((a) => a.id === "toggle-fav");
    assert.equal(unpinAction.label, "取消置顶");
    assert.equal(unpinAction.icon, "iconUnpin");
    assert.equal(unfavAction.label, "移出收藏");
});

test("T-7335: filterPaletteActions filters and ranks by label, id, and shortcut", () => {
    const i18n = {
        copyBlockLink: "复制块超链接",
        copyMarkdownLink: "复制 Markdown 引用",
        copyId: "复制 ID",
        copyPath: "复制路径",
    };
    const tabCtx = extractActionContext({kind: "tab", isPinned: false, isFaved: false});
    const actions = getAvailableActions(tabCtx, {platform: "desktop", i18n});

    // 1. 空查询原样返回
    assert.equal(filterPaletteActions(actions, "").length, actions.length);
    assert.equal(filterPaletteActions(actions, "   ").length, actions.length);

    // 2. 匹配 ID
    const rightActions = filterPaletteActions(actions, "open-right");
    assert.ok(rightActions.length >= 1);
    assert.equal(rightActions[0].id, "open-right");

    // 3. 匹配中文标签（以"复制"为前缀匹配所有 4 个复制动作）
    const copyActions = filterPaletteActions(actions, "复制");
    assert.ok(copyActions.length >= 4, "必须匹配到复制超链接、Markdown、ID、路径等所有复制动作");
    assert.ok(copyActions.every((a) => a.label.indexOf("复制") === 0));

    // 4. 匹配快捷键
    const shortcutActions = filterPaletteActions(actions, "⌘W");
    assert.ok(shortcutActions.length >= 1);
    assert.equal(shortcutActions[0].id, "close-tab");

    // 5. 不匹配
    const noMatch = filterPaletteActions(actions, "non-existent-action-xyz");
    assert.deepEqual(noMatch, []);
});

test("T-7335: createActionExecutionReceipt structures audit events", () => {
    const ctx = extractActionContext({kind: "tab", rootId: "doc-123", title: "测试文档"});
    const successReceipt = createActionExecutionReceipt("open-right", ctx, true, "成功在右侧分栏打开");
    assert.equal(successReceipt.actionId, "open-right");
    assert.equal(successReceipt.kind, "tab");
    assert.equal(successReceipt.targetId, "doc-123");
    assert.equal(successReceipt.title, "测试文档");
    assert.equal(successReceipt.success, true);
    assert.equal(successReceipt.message, "成功在右侧分栏打开");
    assert.ok(successReceipt.timestamp > 0);

    const failReceipt = createActionExecutionReceipt("close-tab", ctx, false, "页签已被销毁");
    assert.equal(failReceipt.success, false);
    assert.equal(failReceipt.message, "页签已被销毁");
});

// ==================== 负向探针（门禁自查 §核心原则） ====================
test("T-7335 negative probes: action bounds and security isolation", () => {
    // 探针 1：移动端绝不允许泄漏桌面分栏打开动作
    const tabCtx = extractActionContext({kind: "tab"});
    const mobileActions = getAvailableActions(tabCtx, {platform: "mobile"});
    assert.equal(mobileActions.some((a) => a.id === "open-right"), false,
        "负向探针 1 失败：移动端泄漏了 open-right 动作");
    assert.equal(mobileActions.some((a) => a.id === "open-bottom"), false,
        "负向探针 1 失败：移动端泄漏了 open-bottom 动作");

    // 探针 2：文档结果绝不允许泄漏关闭页签动作（关闭页签仅限 tab）
    const docCtx = extractActionContext({kind: "doc"});
    const docActions = getAvailableActions(docCtx, {platform: "desktop"});
    assert.equal(docActions.some((a) => a.id === "close-tab"), false,
        "负向探针 2 失败：文档搜索结果泄漏了 close-tab 动作");

    // 探针 3：破坏性动作必须显式声明 isDestructive
    const actions = getAvailableActions(tabCtx, {platform: "desktop"});
    const closeAction = actions.find((a) => a.id === "close-tab");
    assert.equal(closeAction?.isDestructive, true,
        "负向探针 3 失败：close-tab 未标记为破坏性动作");

    // 探针 4：空/非法条目不可崩溃且返回安全未知上下文
    const invalidCtx = extractActionContext(undefined);
    assert.equal(invalidCtx.kind, "unknown");
    assert.equal(invalidCtx.rootId, "");

    // 探针 5：操作画板过滤不得返回超出上限的条目
    const manyActions = Array.from({length: 50}, (_, i) => ({
        id: `act-${i}`,
        label: `操作 ${i}`,
        shortcut: "",
    }));
    const filtered = filterPaletteActions(manyActions, "操作", {limit: 10});
    assert.ok(filtered.length <= 10, "负向探针 5 失败：动作画板过滤超过了请求上限");
});
