// 小驴雷切 —— 预览窗格内查找（T-6950，2026-09-27 计划阶段 A）。
// 只在本窗格已渲染的有界正文中做纯文本定位：不重新取全文、不支持正则、
// 不拼接任何 HTML——命中一律用 DOM 文本节点切分 + <mark> 包裹实现，清除后
// normalize() 可完整复原原文结构。故意的约定：大小写不敏感（CJK 无影响）。
"use strict";

const HIT_CLASS = "sw__doc-preview-hit";
// 小写化在个别 Unicode 字符上会改变长度（如 İ）；按节点整体小写后用 indexOf
// 定位是务实标准做法，长度漂移仅影响该极端字符附近的切点，属可接受误差。
function isBlank(query) {
    return typeof query !== "string" || query.trim() === "";
}

// 在 root 内高亮全部命中，返回命中总数；查询为空/空白时只清除并返回 0。
function applyPreviewFind(root, rawQuery) {
    if (!root) return 0;
    clearPreviewFind(root);
    if (isBlank(rawQuery)) return 0;
    const query = rawQuery.trim();
    const needle = query.toLocaleLowerCase();
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
        acceptNode: (node) => (node.nodeValue && node.nodeValue.trim()
            ? 1 /* FILTER_ACCEPT */
            : 2 /* FILTER_REJECT */),
    });
    const textNodes = [];
    let current = walker.nextNode();
    while (current) {
        textNodes.push(current);
        current = walker.nextNode();
    }
    let total = 0;
    for (const node of textNodes) {
        const text = node.nodeValue;
        const haystack = text.toLocaleLowerCase();
        let pos = haystack.indexOf(needle);
        if (pos < 0) continue;
        const fragment = doc.createDocumentFragment();
        let cursor = 0;
        while (pos >= 0) {
            if (pos > cursor) fragment.appendChild(doc.createTextNode(text.slice(cursor, pos)));
            const mark = doc.createElement("mark");
            mark.className = HIT_CLASS;
            mark.textContent = text.slice(pos, pos + needle.length);
            fragment.appendChild(mark);
            cursor = pos + needle.length;
            pos = haystack.indexOf(needle, cursor);
            total++;
        }
        if (cursor < text.length) fragment.appendChild(doc.createTextNode(text.slice(cursor)));
        node.parentNode.replaceChild(fragment, node);
    }
    return total;
}

// 清除全部命中标记并合并相邻文本节点，恢复原文结构（元素树不变）。
function clearPreviewFind(root) {
    if (!root) return;
    const marks = root.querySelectorAll(`mark.${HIT_CLASS}`);
    marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(root.ownerDocument.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
    });
}

// 命中循环：上一处/下一处越界回绕；无命中时恒为 0。
function nextHitIndex(total, current, delta) {
    if (!Number.isInteger(total) || total <= 0) return 0;
    const base = Number.isInteger(current) ? current : 0;
    return ((base + delta) % total + total) % total;
}

// 命中滚入正文视口的目标 scrollTop：尽量居中，夹在 [0, 可滚动最大值]。
function clampScrollTop(value, maxScrollTop) {
    const max = Number.isFinite(maxScrollTop) && maxScrollTop > 0 ? maxScrollTop : 0;
    const target = Number.isFinite(value) ? value : 0;
    return Math.min(Math.max(target, 0), max);
}

module.exports = {HIT_CLASS, applyPreviewFind, clearPreviewFind, nextHitIndex, clampScrollTop};
