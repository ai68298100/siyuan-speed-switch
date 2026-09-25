"use strict";

// T-6871 平台 UI 原语 DOM 构造助手（RZ-1，ADR 0079）。
// 只产出 sw-platform-* class 的元素（样式见 _platform-shell.scss），不持有业务状态；
// document 由调用方注入（缺省取全局 document），便于 jsdom 单测与宿主装配模块复用。

const PLATFORM_STATUS_STATES = Object.freeze(["ready", "loading", "stale", "dirty", "blocked", "error"]);

function normalizePlatformStatusState(value) {
    return PLATFORM_STATUS_STATES.includes(value) ? value : "";
}

function createPlatformElement(doc, tag, className, text) {
    const element = (doc || document).createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
}

/**
 * 六态状态徽标（ready/loading/stale/dirty/blocked/error）。
 * 非法状态回落中性徽标——不猜测为 ready（诚实呈现受限/未知）。
 */
function createPlatformStatus(doc, state, label) {
    const status = createPlatformElement(doc, "span", "sw-platform-status");
    const normalized = normalizePlatformStatusState(state);
    if (normalized) status.dataset.state = normalized;
    if (label !== undefined && label !== null) status.textContent = String(label);
    return status;
}

/** 键位提示芯片（如 Tab / 1-9 / Enter）。 */
function createPlatformKbd(doc, text) {
    return createPlatformElement(doc, "span", "sw-platform-kbd", text === undefined || text === null ? "" : String(text));
}

/**
 * 分段控件：items = [{value, label}]，仅合法（非空字符串 value）项入列；
 * active 命中才高亮（非法 active 无高亮项，不猜默认值）。点击切换高亮并回调
 * onChange(value)；同值重复点击不重复回调。aria=radiogroup/radio/aria-checked。
 */
function createPlatformSegmented(doc, options = {}) {
    const seg = createPlatformElement(doc, "div", "sw-platform-seg");
    seg.setAttribute("role", "radiogroup");
    if (options.ariaLabel) seg.setAttribute("aria-label", String(options.ariaLabel));
    const items = Array.isArray(options.items) ? options.items : [];
    let active = typeof options.active === "string" ? options.active : "";
    const buttons = [];
    items.forEach((item) => {
        if (!item || typeof item.value !== "string" || !item.value) return;
        const button = createPlatformElement(doc, "button", "sw-platform-seg__item", item.label === undefined || item.label === null ? item.value : String(item.label));
        button.type = "button";
        button.dataset.value = item.value;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(item.value === active));
        if (item.value === active) button.classList.add("is-active");
        button.addEventListener("click", () => {
            if (active === item.value) return;
            active = item.value;
            buttons.forEach((candidate) => {
                const on = candidate.dataset.value === active;
                candidate.classList.toggle("is-active", on);
                candidate.setAttribute("aria-checked", String(on));
            });
            if (typeof options.onChange === "function") options.onChange(item.value);
        });
        buttons.push(button);
        seg.appendChild(button);
    });
    return seg;
}

/**
 * 胶囊动作按钮：soft=true 为次级（主色软底），默认主色实底；
 * onClick 缺省时仍产出可用按钮（调用方自行绑定）。
 */
function createPlatformPillAction(doc, options = {}) {
    const button = createPlatformElement(doc, "button", "sw-platform-action sw-platform-action--pill", options.label === undefined || options.label === null ? "" : String(options.label));
    button.type = "button";
    if (options.soft) button.classList.add("sw-platform-action--soft");
    if (typeof options.onClick === "function") button.addEventListener("click", options.onClick);
    return button;
}

module.exports = {
    PLATFORM_STATUS_STATES,
    normalizePlatformStatusState,
    createPlatformStatus,
    createPlatformKbd,
    createPlatformSegmented,
    createPlatformPillAction,
};
