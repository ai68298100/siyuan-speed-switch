// T-7341 Action Palette 真实 DOM 装配层契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 基于 JSDOM 真实 DOM 环境测试 src/action-palette-ui.js 的装配与交互；
//   - 覆盖 DOM 树结构、a11y 属性、搜索输入过滤、键盘导航、回车执行、Escape 退出与 disposer 模式；
//   - 负向探针在文件末尾独立执行：非法容器拒绝、disposed 状态锁定、DOM 彻底解挂与空列表渲染防线。
const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {mountActionPalette} = require("../src/action-palette-ui.js");

const MOCK_ACTIONS = [
    {id: "open-right", section: "open", label: "右侧分栏打开", icon: "iconLayoutRight", shortcut: "⌘↵"},
    {id: "copy-id", section: "copy", label: "复制 ID", icon: "iconCopy", shortcut: "⌥C"},
    {id: "close-tab", section: "manage", label: "关闭页签", icon: "iconClose", shortcut: "⌘W", isDestructive: true},
];

function createDomEnv() {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="container"></div></body></html>`);
    return {
        window: dom.window,
        document: dom.window.document,
        container: dom.window.document.getElementById("container"),
    };
}

test("T-7341: mountActionPalette creates accessible DOM tree with proper roles and attributes", () => {
    const {container} = createDomEnv();
    const handle = mountActionPalette(container, MOCK_ACTIONS, {
        platform: "desktop",
        title: "动作画板",
    });

    assert.ok(handle.root);
    assert.equal(handle.root.getAttribute("role"), "dialog");
    assert.equal(handle.root.getAttribute("aria-modal"), "true");
    assert.equal(handle.root.getAttribute("aria-label"), "动作画板");
    assert.equal(handle.root.className, "sw__palette sw__palette--desktop");

    // 搜索框
    assert.ok(handle.searchInput);
    assert.equal(handle.searchInput.getAttribute("role"), "searchbox");
    assert.equal(handle.searchInput.getAttribute("type"), "search");
    assert.ok(handle.searchInput.getAttribute("aria-controls"));

    // 列表区与选项
    assert.ok(handle.listElement);
    assert.equal(handle.listElement.getAttribute("role"), "listbox");

    const options = handle.listElement.querySelectorAll('li[role="option"]');
    assert.equal(options.length, 3, "必须渲染 3 个可用动作项");
    assert.equal(options[0].getAttribute("aria-selected"), "true", "首项默认选中");
    assert.equal(options[0].getAttribute("data-action-id"), "open-right");
    assert.equal(options[2].getAttribute("data-is-destructive"), "true");

    handle.dispose();
});

test("T-7341: updateQuery re-filters items and updates aria-activedescendant", () => {
    const {container} = createDomEnv();
    const handle = mountActionPalette(container, MOCK_ACTIONS, {idSuffix: "q"});

    assert.equal(handle.listElement.querySelectorAll('li[role="option"]').length, 3);
    assert.equal(handle.searchInput.getAttribute("aria-activedescendant"), "sw-palette-q-item-0");

    // 更新查询为 "复制"
    handle.updateQuery("复制");
    const filteredOptions = handle.listElement.querySelectorAll('li[role="option"]');
    assert.equal(filteredOptions.length, 1);
    assert.equal(filteredOptions[0].getAttribute("data-action-id"), "copy-id");
    assert.equal(handle.searchInput.getAttribute("aria-activedescendant"), "sw-palette-q-item-0");

    // 更新查询为不匹配内容 -> 展示空态提示
    handle.updateQuery("完全不匹配的输入xyz");
    assert.equal(handle.listElement.querySelectorAll('li[role="option"]').length, 0);
    const emptyEl = handle.listElement.querySelector(".sw__palette-empty");
    assert.ok(emptyEl);
    assert.equal(emptyEl.textContent, "无可用动作");

    handle.dispose();
});

test("T-7341: keyboard navigation moves cursor and updates selection", () => {
    const {container} = createDomEnv();
    let stateChanges = 0;
    const handle = mountActionPalette(container, MOCK_ACTIONS, {
        idSuffix: "nav",
        onStateChange: () => { stateChanges += 1; },
    });

    // 触发 ArrowDown
    const downEvent = new container.ownerDocument.defaultView.KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
    });
    handle.root.dispatchEvent(downEvent);

    assert.equal(handle.getState().selectedIndex, 1);
    const options = handle.listElement.querySelectorAll('li[role="option"]');
    assert.equal(options[1].getAttribute("aria-selected"), "true");
    assert.equal(options[0].getAttribute("aria-selected"), "false");
    assert.equal(handle.searchInput.getAttribute("aria-activedescendant"), "sw-palette-nav-item-1");
    assert.ok(stateChanges >= 1);

    handle.dispose();
});

test("T-7341: Enter key executes selected action and triggers disposer", () => {
    const {container} = createDomEnv();
    let executedAction = null;
    let closed = false;

    const handle = mountActionPalette(container, MOCK_ACTIONS, {
        targetContext: {kind: "tab", rootId: "tab-888"},
        onExecute: (action) => { executedAction = action; },
        onClose: () => { closed = true; },
    });

    const enterEvent = new container.ownerDocument.defaultView.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
    });
    handle.root.dispatchEvent(enterEvent);

    assert.ok(executedAction);
    assert.equal(executedAction.id, "open-right");
    assert.equal(handle.isDisposed(), true, "执行动作后必须自动销毁");
    assert.equal(container.contains(handle.root), false, "销毁后必须从 DOM 树移除");
});

test("T-7341: Escape key closes palette and triggers onClose", () => {
    const {container} = createDomEnv();
    let closed = false;

    const handle = mountActionPalette(container, MOCK_ACTIONS, {
        onClose: () => { closed = true; },
    });

    const escEvent = new container.ownerDocument.defaultView.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
    });
    handle.root.dispatchEvent(escEvent);

    assert.equal(closed, true);
    assert.equal(handle.isDisposed(), true);
    assert.equal(container.contains(handle.root), false);
});

test("T-7341: clicking an option executes the action", () => {
    const {container} = createDomEnv();
    let executedAction = null;

    const handle = mountActionPalette(container, MOCK_ACTIONS, {
        onExecute: (action) => { executedAction = action; },
    });

    const copyOption = handle.listElement.querySelector('li[data-action-id="copy-id"]');
    assert.ok(copyOption);

    const clickEvent = new container.ownerDocument.defaultView.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
    });
    copyOption.dispatchEvent(clickEvent);

    assert.ok(executedAction);
    assert.equal(executedAction.id, "copy-id");
    assert.equal(handle.isDisposed(), true);
});

// ==================== 负向探针（门禁自查 §核心原则） ====================
test("T-7341 negative probes: container bounds and disposer isolation", () => {
    // 探针 1：非法 container 必须抛出 TypeError
    let containerError = false;
    try {
        mountActionPalette(null, MOCK_ACTIONS);
    } catch (err) {
        if (err instanceof TypeError) containerError = true;
    }
    assert.equal(containerError, true, "负向探针 1 失败：非法 container 未抛出 TypeError");

    // 探针 2：dispose 之后 isDisposed 必须为 true，且后续调用安全无副作用
    const {container} = createDomEnv();
    const handle = mountActionPalette(container, MOCK_ACTIONS);
    assert.equal(handle.isDisposed(), false);
    handle.dispose();
    assert.equal(handle.isDisposed(), true);

    // 重复 dispose 不报错
    handle.dispose();
    assert.equal(handle.isDisposed(), true);

    // disposed 后调用 updateQuery 不崩溃且不更新
    handle.updateQuery("test");
    assert.equal(handle.isDisposed(), true);

    // 探针 3：销毁后 root 必须从父节点完全脱挂
    assert.equal(container.contains(handle.root), false,
        "负向探针 3 失败：销毁后 root 仍残留于父节点中");

    // 探针 4：空动作列表挂载正常显示空态，不发生越界或运行时崩溃
    const emptyHandle = mountActionPalette(container, []);
    assert.equal(emptyHandle.listElement.querySelectorAll('li[role="option"]').length, 0);
    assert.ok(emptyHandle.listElement.querySelector(".sw__palette-empty"));
    emptyHandle.dispose();
});
