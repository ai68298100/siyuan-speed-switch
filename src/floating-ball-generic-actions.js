"use strict";

// P1 generic actions stay host-neutral: this module only resolves an adjacent
// tab or a bounded scroll target. The plugin class supplies the actual tab
// list and keeps document mutations behind its existing lifecycle boundary.

const SCROLL_SELECTORS = [
    ".protyle-content",
    ".protyle-wysiwyg",
    ".b3-dialog__content",
    ".sw__scroll",
];

function selectAdjacentTab(tabs, activeId, offset) {
    if (!Array.isArray(tabs) || tabs.length < 2) return null;
    const step = Number(offset) < 0 ? -1 : 1;
    const currentIndex = tabs.findIndex((tab) => tab && tab.id === activeId);
    const base = currentIndex >= 0 ? currentIndex : (step > 0 ? -1 : 0);
    return tabs[(base + step + tabs.length) % tabs.length] || null;
}

function isScrollCandidate(value) {
    return Boolean(value && typeof value === "object"
        && typeof value.scrollTop === "number"
        && (typeof value.scrollTo === "function" || typeof value.scrollHeight === "number"));
}

function isScrollable(value) {
    return isScrollCandidate(value)
        && Number(value.scrollHeight) > Number(value.clientHeight || 0);
}

function scrollElementTo(element, edge, behavior = "smooth") {
    if (!isScrollCandidate(element)) return {ok: false, reason: "invalid-scroll-target"};
    const maxTop = Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0));
    const top = edge === "bottom" ? maxTop : 0;
    if (typeof element.scrollTo === "function") {
        element.scrollTo({top, behavior});
    } else {
        element.scrollTop = top;
    }
    return {ok: true, top};
}

function collectScrollCandidates(documentRef, surface, sidebarElement, preferredElements = []) {
    const result = [];
    const seen = new Set();
    const add = (value) => {
        if (!isScrollCandidate(value) || seen.has(value)) return;
        seen.add(value);
        result.push(value);
    };
    (Array.isArray(preferredElements) ? preferredElements : []).forEach(add);
    if (surface === "sidebar") {
        add(sidebarElement?.querySelector?.(".sw__scroll"));
        add(sidebarElement);
    }
    const active = documentRef?.activeElement;
    if (active?.closest) {
        SCROLL_SELECTORS.forEach((selector) => add(active.closest(selector)));
    }
    SCROLL_SELECTORS.forEach((selector) => add(documentRef?.querySelector?.(selector)));
    add(documentRef?.scrollingElement);
    return result;
}

function scrollSurfaceTo(documentRef, surface, sidebarElement, edge, options = {}) {
    const candidates = collectScrollCandidates(documentRef, surface, sidebarElement, options.preferredElements);
    const target = candidates.find(isScrollable) || candidates[0];
    if (target) return scrollElementTo(target, edge, options.behavior || "smooth");
    const view = documentRef?.defaultView;
    if (typeof view?.scrollTo === "function") {
        view.scrollTo({top: edge === "bottom" ? Number(view.document?.documentElement?.scrollHeight || 0) : 0,
            behavior: options.behavior || "smooth"});
        return {ok: true, window: true};
    }
    return {ok: false, reason: "no-scroll-target"};
}

module.exports = {selectAdjacentTab, scrollElementTo, collectScrollCandidates, scrollSurfaceTo};
