'use strict';

// ==================== T-7339 Action Palette 键盘导航状态机 ====================
// 目标：为次级动作画板提供纯函数式键盘交互状态机（Tab/⌘K 唤出、上下导航、Enter 执行与 Escape 退出）。
// 借鉴 Raycast / Alfred：
//   - 零 DOM、零事件监听副作用、纯状态驱动；
//   - 键盘调度解耦：外部捕获原生 keydown 后转为标准化按键对象；
//   - 状态机输出确定的动作意图（"noop" | "execute" | "close" | "toggle" | "query" | "navigate"）；
//   - 选择光标始终处于安全边界 [0, filteredActions.length - 1] 内，支持循环循环滚动（wrap）。

const {filterPaletteActions} = require("./action-palette-model.js");

const PALETTE_KEY_ACTIONS = Object.freeze({
    NOOP: "noop",
    TOGGLE: "toggle",
    CLOSE: "close",
    NAVIGATE: "navigate",
    EXECUTE: "execute",
    QUERY: "query",
});

/**
 * 创建画板导航的初始状态。
 *
 * @param {Array<object>} actions 可用动作列表
 * @param {object} [options] 包含 targetContext, initialQuery 等
 * @returns {object} 初始导航状态对象
 */
function createPaletteNavigationState(actions = [], options = {}) {
    const safeActions = Array.isArray(actions) ? actions : [];
    const query = typeof options.query === "string" ? options.query.trim() : "";
    const recentActionIds = Array.isArray(options.recentActionIds) ? options.recentActionIds : [];
    const filtered = filterPaletteActions(safeActions, query, {recentActionIds});
    const selectedIndex = filtered.length > 0 ? 0 : -1;
    const isOpen = Boolean(options.isOpen);
    const targetContext = options.targetContext && typeof options.targetContext === "object"
        ? options.targetContext
        : null;

    return {
        isOpen,
        query,
        allActions: safeActions,
        filteredActions: filtered,
        selectedIndex,
        targetContext,
        recentActionIds,
    };
}

/**
 * 处理画板内部的搜索词更新，重新过滤动作并重置选择光标。
 *
 * @param {object} state 当前导航状态
 * @param {string} newQuery 新的过滤搜索词
 * @returns {object} 新的导航状态
 */
function updatePaletteQuery(state, newQuery) {
    const raw = typeof newQuery === "string" ? newQuery : "";
    const filtered = filterPaletteActions(state.allActions, raw, {
        recentActionIds: state.recentActionIds,
    });
    const selectedIndex = filtered.length > 0 ? 0 : -1;
    return {
        ...state,
        query: raw,
        filteredActions: filtered,
        selectedIndex,
    };
}

/**
 * 调整选择光标位置（支持循环滚动）。
 *
 * @param {object} state 当前导航状态
 * @param {number} delta 移动偏移（+1 或 -1）
 * @returns {object} 新的导航状态
 */
function movePaletteSelection(state, delta) {
    const total = state.filteredActions.length;
    if (total <= 0) {
        return {...state, selectedIndex: -1};
    }
    const current = state.selectedIndex >= 0 ? state.selectedIndex : 0;
    // 循环包裹（wrap-around）
    const next = (current + delta + total) % total;
    return {
        ...state,
        selectedIndex: next,
    };
}

/**
 * 核心调度函数：输入当前状态与按键描述，输出新状态与执行意图。
 *
 * @param {object} state 当前状态
 * @param {object} event 标准化按键描述 { key, ctrlKey, metaKey, shiftKey, altKey }
 * @returns {{ state: object, intent: string, payload?: any }}
 */
function dispatchPaletteKey(state, event) {
    if (!state || typeof state !== "object") {
        return {state: createPaletteNavigationState(), intent: PALETTE_KEY_ACTIONS.NOOP};
    }
    if (event && (event.isComposing || event.keyCode === 229)) {
        return {state, intent: PALETTE_KEY_ACTIONS.NOOP};
    }
    const key = event && typeof event.key === "string" ? event.key : "";
    const ctrlOrMeta = Boolean(event && (event.ctrlKey || event.metaKey));
    const shiftKey = Boolean(event && event.shiftKey);

    // 1. 唤出 / 收起快捷键：Tab 或 ⌘+K / ⌃+K
    if ((key === "k" && ctrlOrMeta) || (key === "Tab" && !shiftKey && !state.isOpen)) {
        const nextOpen = !state.isOpen;
        return {
            state: {
                ...state,
                isOpen: nextOpen,
                query: "",
                filteredActions: filterPaletteActions(state.allActions, ""),
                selectedIndex: state.allActions.length > 0 ? 0 : -1,
            },
            intent: PALETTE_KEY_ACTIONS.TOGGLE,
            payload: {isOpen: nextOpen},
        };
    }

    // 画板未打开时，其余内部按键一律不拦截
    if (!state.isOpen) {
        return {state, intent: PALETTE_KEY_ACTIONS.NOOP};
    }

    // 2. 关闭画板：Escape 或在画板打开时按 Tab
    if (key === "Escape" || (key === "Tab" && !shiftKey)) {
        return {
            state: {
                ...state,
                isOpen: false,
            },
            intent: PALETTE_KEY_ACTIONS.CLOSE,
        };
    }

    // 3. 向下移动光标：ArrowDown / ⌃+N
    if (key === "ArrowDown" || (key === "n" && ctrlOrMeta)) {
        const nextState = movePaletteSelection(state, 1);
        return {
            state: nextState,
            intent: PALETTE_KEY_ACTIONS.NAVIGATE,
            payload: {selectedIndex: nextState.selectedIndex},
        };
    }

    // 4. 向上移动光标：ArrowUp / ⌃+P / Shift+Tab
    if (key === "ArrowUp" || (key === "p" && ctrlOrMeta) || (key === "Tab" && shiftKey)) {
        const nextState = movePaletteSelection(state, -1);
        return {
            state: nextState,
            intent: PALETTE_KEY_ACTIONS.NAVIGATE,
            payload: {selectedIndex: nextState.selectedIndex},
        };
    }

    // 5. 执行当前选中动作：Enter
    if (key === "Enter") {
        const targetAction = state.selectedIndex >= 0 && state.selectedIndex < state.filteredActions.length
            ? state.filteredActions[state.selectedIndex]
            : null;
        if (!targetAction) {
            return {state, intent: PALETTE_KEY_ACTIONS.NOOP};
        }
        return {
            state: {
                ...state,
                isOpen: false,
            },
            intent: PALETTE_KEY_ACTIONS.EXECUTE,
            payload: {
                action: targetAction,
                targetContext: state.targetContext,
            },
        };
    }

    return {state, intent: PALETTE_KEY_ACTIONS.NOOP};
}

module.exports = {
    PALETTE_KEY_ACTIONS,
    createPaletteNavigationState,
    updatePaletteQuery,
    movePaletteSelection,
    dispatchPaletteKey,
};
