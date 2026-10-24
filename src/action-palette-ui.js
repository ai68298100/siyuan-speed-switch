'use strict';

// ==================== T-7341 Action Palette 真实 DOM 装配层 ====================
// 目标：基于 T-7335 / T-7339 / T-7340 纯领域模型，将声明式面板结构装配为原生 HTMLElement。
// 契约与特性：
//   - 零 Dialog 包装耦合：只负责将声明式 panel 结构装配为原生 DOM 树并挂载；
//   - Disposer 模式：集中管理所有 listener，dispose() 一键清理，绝不泄漏至全局；
//   - 键盘/点击事件经由 dispatchPaletteKey 状态机调度，执行动作后触发回调；
//   - 支持 jsdom / 真实浏览器环境下的无缝运行与测试。

const {
    buildActionPalettePanelModel,
    assertActionPalettePanelContract,
} = require("./action-palette-panel.js");
const {
    createPaletteNavigationState,
    updatePaletteQuery,
    movePaletteSelection,
    dispatchPaletteKey,
    PALETTE_KEY_ACTIONS,
} = require("./action-palette-navigation.js");

/**
 * 将 Action Palette 装配为实际的 DOM 结构并绑定键盘/输入/点击事件。
 *
 * @param {HTMLElement} container 目标挂载容器（可以为 Dialog 内容区、浮层或 body）
 * @param {Array<object>} actions 当前上下文可用动作列表
 * @param {object} [options] 装配选项与生命周期回调
 * @returns {object} 包含控制方法与一键销毁的 handle 对象
 */
function mountActionPalette(container, actions = [], options = {}) {
    if (!container || typeof container.appendChild !== "function") {
        throw new TypeError("mountActionPalette: container 必须为有效的 HTMLElement");
    }

    const doc = container.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") {
        throw new Error("mountActionPalette: 未找到可用的 document 实例");
    }

    let disposed = false;
    let state = createPaletteNavigationState(actions, {
        isOpen: true,
        query: options.initialQuery || "",
        targetContext: options.targetContext || null,
        recentActionIds: Array.isArray(options.recentActionIds) ? options.recentActionIds : [],
    });

    const platform = options.platform || "desktop";
    const idSuffix = options.idSuffix || "live";

    // 1. 生成初始声明式模型并校验最小契约
    const initialModel = buildActionPalettePanelModel(state, {
        platform,
        idSuffix,
        title: options.title,
        searchPlaceholder: options.searchPlaceholder,
        emptyHint: options.emptyHint,
    });
    if (!assertActionPalettePanelContract(initialModel)) {
        throw new Error("mountActionPalette: 初始声明式面板模型未通过最小契约");
    }

    // 2. 创建真实 DOM 节点树
    const root = doc.createElement("div");
    applyAttrs(root, initialModel.attrs.root);

    const searchWrapper = doc.createElement("div");
    searchWrapper.className = "sw__palette-search-wrap";

    const searchInput = doc.createElement("input");
    applyAttrs(searchInput, initialModel.attrs.search);
    searchWrapper.appendChild(searchInput);

    const hintEl = doc.createElement("div");
    hintEl.className = "sw__palette-hint";
    hintEl.textContent = initialModel.hint;
    searchWrapper.appendChild(hintEl);

    const listElement = doc.createElement("ul");
    applyAttrs(listElement, initialModel.attrs.list);

    root.appendChild(searchWrapper);
    root.appendChild(listElement);

    // 3. 渲染列表项
    function renderList() {
        listElement.innerHTML = "";
        const panelModel = buildActionPalettePanelModel(state, {
            platform,
            idSuffix,
            title: options.title,
            searchPlaceholder: options.searchPlaceholder,
            emptyHint: options.emptyHint,
        });

        // 同步 search 上的 aria-activedescendant
        searchInput.setAttribute(
            "aria-activedescendant",
            panelModel.attrs.search["aria-activedescendant"] || ""
        );

        if (panelModel.empty) {
            const emptyEl = doc.createElement("li");
            emptyEl.className = "sw__palette-empty";
            emptyEl.setAttribute("role", "presentation");
            emptyEl.textContent = panelModel.emptyHint;
            listElement.appendChild(emptyEl);
            return;
        }

        panelModel.sections.forEach((sectionModel) => {
            const groupEl = doc.createElement("li");
            groupEl.setAttribute("role", "presentation");
            groupEl.className = "sw__palette-section-wrap";

            const groupHeader = doc.createElement("div");
            groupHeader.className = "sw__palette-section-header";
            groupHeader.textContent = sectionModel.attrs["aria-label"];
            groupEl.appendChild(groupHeader);

            const groupUl = doc.createElement("ul");
            groupUl.setAttribute("role", "group");
            groupUl.setAttribute("aria-label", sectionModel.attrs["aria-label"]);
            groupUl.className = sectionModel.attrs.className;

            sectionModel.items.forEach((itemModel) => {
                const li = doc.createElement("li");
                applyAttrs(li, itemModel.attrs);

                const iconSpan = doc.createElement("span");
                iconSpan.className = "sw__palette-item-icon";
                if (itemModel.icon) {
                    iconSpan.innerHTML = `<svg><use xlink:href="#${itemModel.icon}"></use></svg>`;
                }

                const labelSpan = doc.createElement("span");
                labelSpan.className = "sw__palette-item-label";
                labelSpan.textContent = itemModel.text;

                const shortcutSpan = doc.createElement("kbd");
                shortcutSpan.className = "sw__palette-item-shortcut";
                shortcutSpan.textContent = itemModel.shortcut;

                li.appendChild(iconSpan);
                li.appendChild(labelSpan);
                if (itemModel.shortcut) {
                    li.appendChild(shortcutSpan);
                }

                // 点击执行该动作
                li.addEventListener("click", (e) => {
                    e.stopPropagation();
                    executeAction(itemModel.attrs["data-action-id"]);
                });

                groupUl.appendChild(li);
            });

            groupEl.appendChild(groupUl);
            listElement.appendChild(groupEl);
        });

        scrollActiveIntoView();
    }

    function scrollActiveIntoView() {
        const activeId = searchInput.getAttribute("aria-activedescendant");
        if (!activeId) return;
        const activeEl = listElement.querySelector(`#${activeId}`);
        if (activeEl && typeof activeEl.scrollIntoView === "function") {
            activeEl.scrollIntoView({block: "nearest"});
        }
    }

    function executeAction(actionId) {
        if (disposed) return;
        const target = state.filteredActions.find((a) => a.id === actionId);
        if (!target) return;
        try {
            if (typeof options.onExecute === "function") {
                options.onExecute(target, state.targetContext);
            }
        } finally {
            closePalette();
        }
    }

    function closePalette() {
        if (disposed) return;
        try {
            if (typeof options.onClose === "function") {
                options.onClose();
            }
        } finally {
            dispose();
        }
    }

    // 4. 事件监听与状态驱动
    const cleanups = [];

    // (1) 输入实时过滤
    const onInput = () => {
        if (disposed) return;
        state = updatePaletteQuery(state, searchInput.value);
        renderList();
        if (typeof options.onStateChange === "function") {
            options.onStateChange(state);
        }
    };
    searchInput.addEventListener("input", onInput);
    cleanups.push(() => searchInput.removeEventListener("input", onInput));

    // (2) 键盘导航调度
    const onKeydown = (e) => {
        if (disposed) return;
        if (e.isComposing || e.keyCode === 229) {
            return;
        }
        const res = dispatchPaletteKey(state, {
            key: e.key,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            isComposing: e.isComposing,
            keyCode: e.keyCode,
        });

        if (res.intent === PALETTE_KEY_ACTIONS.NOOP) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (res.intent === PALETTE_KEY_ACTIONS.NAVIGATE) {
            state = res.state;
            renderList();
            if (typeof options.onStateChange === "function") {
                options.onStateChange(state);
            }
        } else if (res.intent === PALETTE_KEY_ACTIONS.EXECUTE && res.payload && res.payload.action) {
            executeAction(res.payload.action.id);
        } else if (res.intent === PALETTE_KEY_ACTIONS.CLOSE) {
            closePalette();
        }
    };
    root.addEventListener("keydown", onKeydown);
    cleanups.push(() => root.removeEventListener("keydown", onKeydown));

    // 5. 初始挂载与自动聚焦
    renderList();
    container.appendChild(root);

    let focusTimer = null;
    if (typeof searchInput.focus === "function") {
        focusTimer = setTimeout(() => {
            if (!disposed && searchInput.isConnected) {
                searchInput.focus();
            }
        }, 0);
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        if (focusTimer) {
            clearTimeout(focusTimer);
            focusTimer = null;
        }
        cleanups.forEach((fn) => {
            try { fn(); } catch (_) { /* ignore */ }
        });
        cleanups.length = 0;
        if (root.parentElement) {
            root.parentElement.removeChild(root);
        }
    }

    return {
        root,
        element: root,
        searchInput,
        searchEl: searchInput,
        listElement,
        listEl: listElement,
        getState: () => state,
        updateQuery: (newQuery) => {
            if (disposed) return;
            searchInput.value = newQuery;
            onInput();
        },
        selectIndex: (index) => {
            if (disposed) return;
            if (index >= 0 && index < state.filteredActions.length) {
                state = {...state, selectedIndex: index};
                renderList();
                if (typeof options.onStateChange === "function") {
                    options.onStateChange(state);
                }
            }
        },
        dispose,
        isDisposed: () => disposed,
    };
}

function applyAttrs(el, attrs) {
    if (!el || !attrs) return;
    Object.keys(attrs).forEach((key) => {
        const val = attrs[key];
        if (val === undefined) return;
        if (key === "className") {
            el.className = String(val);
        } else if (key === "value" && el.tagName === "INPUT") {
            el.value = String(val);
        } else {
            el.setAttribute(key, String(val));
        }
    });
}

module.exports = {
    mountActionPalette,
};
