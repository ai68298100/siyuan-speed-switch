'use strict';

// ==================== T-7340 Action Palette 面板 DOM 模型层 ====================
// 目标：为次级动作画板提供声明式 DOM 结构与无障碍契约的纯模型层。
// 借鉴 Raycast / Alfred 命令面板：
//   - 不创建真实 DOM 节点（纯描述结构），由调用方按结构创建节点；
//   - 跨桌面/侧栏/移动三端单一结构，差异只体现在 className 字典；
//   - 强制 a11y 契约：role=dialog、aria-modal、aria-label、aria-activedescendant；
//   - 锚定键盘导航契约：唯一 action-id 命名、item role、selected 标记等。

const PANEL_SECTION_ORDER = Object.freeze(["open", "copy", "manage"]);

const PANEL_CLASSNAMES = Object.freeze({
    desktop: "sw__palette sw__palette--desktop",
    sidebar: "sw__palette sw__palette--sidebar",
    mobile: "sw__palette sw__palette--mobile",
});

const PANEL_LABELS = Object.freeze({
    title: "动作画板",
    search: "搜索动作",
    empty: "无可用动作",
    hint: "↑↓ 选择 · Enter 执行 · Esc 关闭",
});

/**
 * 构造画板面板的声明式 DOM 模型。
 *
 * @param {object} state 由 dispatchPaletteKey / createPaletteNavigationState 输出的状态
 * @param {object} [options] 包含 platform, inputId, listId, itemIdPrefix
 * @returns {object} 声明式结构 { root, header, search, list, items, attrs }
 */
function buildActionPalettePanelModel(state, options = {}) {
    if (!state || typeof state !== "object") {
        throw new TypeError("buildActionPalettePanelModel: 状态对象不可为空");
    }
    const platform = options.platform || "desktop";
    if (!Object.prototype.hasOwnProperty.call(PANEL_CLASSNAMES, platform)) {
        throw new RangeError("buildActionPalettePanelModel: 不支持的端侧 " + platform);
    }
    const safeId = boundedText(options.idSuffix, 12) || "palette";
    const rootId = `sw-palette-${safeId}-root`;
    const searchId = `sw-palette-${safeId}-search`;
    const listId = `sw-palette-${safeId}-list`;
    const activeDescendantId = state.selectedIndex >= 0
        ? `sw-palette-${safeId}-item-${state.selectedIndex}`
        : "";
    const isModal = platform !== "mobile";

    // 按 section 分组过滤后的动作
    const sections = PANEL_SECTION_ORDER.map((sectionKey) => {
        const items = state.filteredActions
            .map((action, index) => ({action, index}))
            .filter((entry) => entry.action.section === sectionKey);
        return {key: sectionKey, items};
    }).filter((section) => section.items.length > 0);

    return {
        attrs: {
            root: {
                "data-palette-root": safeId,
                "data-platform": platform,
                role: "dialog",
                "aria-modal": (platform !== "mobile") ? "true" : "false",
                "aria-label": boundedText(options.title, 64) || PANEL_LABELS.title,
                "aria-describedby": searchId,
                id: rootId,
                className: PANEL_CLASSNAMES[platform],
                tabindex: "-1",
            },
            search: {
                id: searchId,
                type: "search",
                role: "searchbox",
                placeholder: boundedText(options.searchPlaceholder, 64) || PANEL_LABELS.search,
                "aria-controls": listId,
                "aria-activedescendant": activeDescendantId,
                value: state.query || "",
                autocomplete: "off",
                spellcheck: "false",
                className: `sw__palette-search`,
            },
            list: {
                id: listId,
                role: "listbox",
                "aria-label": "可用动作",
                className: "sw__palette-list",
            },
        },
        sections: sections.map((section) => ({
            key: section.key,
            attrs: {
                role: "group",
                "aria-label": labelOfSection(section.key),
                className: `sw__palette-section sw__palette-section--${section.key}`,
            },
            items: section.items.map((entry) => buildItemModel(entry.action, entry.index, safeId, state.selectedIndex === entry.index)),
        })),
        hint: PANEL_LABELS.hint,
        emptyHint: state.filteredActions.length === 0
            ? (boundedText(options.emptyHint, 64) || PANEL_LABELS.empty)
            : "",
        empty: state.filteredActions.length === 0,
        platform,
    };
}

function buildItemModel(action, index, safeId, isSelected) {
    return {
        id: `sw-palette-${safeId}-item-${index}`,
        attrs: {
            id: `sw-palette-${safeId}-item-${index}`,
            role: "option",
            "aria-selected": String(Boolean(isSelected)),
            "data-action-id": String(action.id || ""),
            "data-section": String(action.section || ""),
            "data-is-destructive": String(Boolean(action.isDestructive)),
            className: `sw__palette-item${isSelected ? " is-selected" : ""}${action.isDestructive ? " is-destructive" : ""}`,
            tabindex: isSelected ? "0" : "-1",
        },
        text: boundedText(action.label, 96),
        icon: boundedText(action.icon, 32),
        shortcut: boundedText(action.shortcut, 32),
    };
}

function labelOfSection(key) {
    if (key === "open") return "打开类动作";
    if (key === "copy") return "复制类动作";
    if (key === "manage") return "管理类动作";
    return key;
}

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

/**
 * 验证面板模型的最少必要契约：用于声明式 UI 装配的 smoke 验证。
 *
 * @param {object} panelModel buildActionPalettePanelModel 输出
 * @returns {boolean} 是否通过契约
 */
function assertActionPalettePanelContract(panelModel) {
    if (!panelModel || typeof panelModel !== "object") return false;
    if (!panelModel.attrs || !panelModel.attrs.root || !panelModel.attrs.search) return false;
    if (panelModel.attrs.root.role !== "dialog") return false;
    if (!panelModel.attrs.search["aria-controls"]) return false;
    if (!panelModel.attrs.list || panelModel.attrs.list.role !== "listbox") return false;
    if (!Array.isArray(panelModel.sections)) return false;
    if (typeof panelModel.empty !== "boolean") return false;
    if (!panelModel.platform) return false;
    return true;
}

module.exports = {
    PANEL_SECTION_ORDER,
    PANEL_CLASSNAMES,
    PANEL_LABELS,
    buildActionPalettePanelModel,
    assertActionPalettePanelContract,
};
