// 快捷入口配置的纯函数层：持久化数据不可信，所有字段在进入 UI 前统一清理。
const QUICK_ACTION_KINDS = new Set(["builtin", "dock", "adapter", "command"]);
const QUICK_ACTION_TARGETS = ["desktop", "sidebar", "mobile"];
const BUILTIN_VALUES = new Set(["switcher", "search", "journal", "settings"]);
const BUILTIN_QUICK_ACTIONS = [
    {id: "switcher", label: "切换", icon: "iconLayout", kind: "builtin", value: "switcher", targets: ["desktop", "sidebar", "mobile"], order: 10, enabled: true},
    {id: "search", label: "搜索", icon: "iconSearch", kind: "builtin", value: "search", targets: ["desktop", "sidebar", "mobile"], order: 20, enabled: true},
    {id: "journal", label: "日记", icon: "iconCalendar", kind: "builtin", value: "journal", targets: ["desktop", "mobile"], order: 10, enabled: true},
    {id: "settings", label: "设置", icon: "iconSettings", kind: "builtin", value: "settings", targets: ["desktop", "sidebar", "mobile"], order: 20, enabled: true},
];
const DEFAULT_QUICK_ACTIONS = BUILTIN_QUICK_ACTIONS.filter((item) => item.value === "journal" || item.value === "settings");

function normalizeTargets(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((target) => QUICK_ACTION_TARGETS.includes(target))));
}

/**
 * Returns whether an action is known to work on a surface. Third-party
 * commands have no mobile capability metadata in SiYuan's command API, so
 * mobile remains "unknown" instead of being guessed from the callback shape.
 */
function resolveQuickActionSupport(kind, value, target, declaredTargets) {
    if (!QUICK_ACTION_TARGETS.includes(target)) return "unsupported";
    if (kind === "builtin") {
        const builtin = BUILTIN_QUICK_ACTIONS.find((item) => item.value === value);
        return builtin?.targets.includes(target) ? "supported" : "unsupported";
    }
    if (kind === "dock") return target === "mobile" ? "unsupported" : "supported";
    if (kind === "command") return target === "mobile" ? "unknown" : "supported";
    if (kind === "adapter") {
        if (Array.isArray(declaredTargets)) {
            return normalizeTargets(declaredTargets).includes(target) ? "supported" : "unsupported";
        }
        return target === "mobile" ? "unknown" : "supported";
    }
    return "unsupported";
}

function getDefaultQuickActionTargets(kind, value, declaredTargets) {
    if (Array.isArray(declaredTargets)) return normalizeTargets(declaredTargets);
    if (kind === "builtin") {
        const builtin = BUILTIN_QUICK_ACTIONS.find((item) => item.value === value);
        return builtin ? [...builtin.targets] : ["desktop"];
    }
    // Dock panels and ordinary plugin commands are not guaranteed to exist in
    // the Android WebView. Providers can opt in to mobile via declaredTargets.
    return ["desktop", "sidebar"];
}

function shouldRenderQuickAction(action, surface, context = "switcher", declaredTargets) {
    if (!action || action.enabled === false || !normalizeTargets(action.targets).includes(surface)) return false;
    if (resolveQuickActionSupport(action.kind, action.value, surface, declaredTargets) === "unsupported") return false;
    // The switcher already is the switching/search surface. Keeping these two
    // buttons in its desktop/mobile footer duplicates controls without adding a
    // useful action. Preserve their stored config for sidebar/legacy use.
    if (context === "switcher" && action.kind === "builtin"
        && (action.value === "switcher" || action.value === "search")
        && (surface === "desktop" || surface === "mobile")) return false;
    return true;
}

function appendQuickAction(actions, candidate, max = 12) {
    const current = Array.isArray(actions) ? actions.map((item) => ({...item, targets: normalizeTargets(item.targets)})) : [];
    if (!candidate || current.length >= max) return {items: current, added: false, reason: "full"};
    if (current.some((item) => item.kind === candidate.kind && item.value === candidate.value)) {
        return {items: current, added: false, reason: "duplicate"};
    }
    const targets = Array.isArray(candidate.targets)
        ? normalizeTargets(candidate.targets)
        : getDefaultQuickActionTargets(candidate.kind, candidate.value, candidate.declaredTargets);
    const next = {
        ...candidate,
        targets,
        order: (current.length + 1) * 10,
        enabled: candidate.enabled !== false,
    };
    delete next.declaredTargets;
    return {items: [...current, next], added: true, reason: "added"};
}

function graphemeLength(value) {
    const text = String(value ?? "");
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
        return [...new Intl.Segmenter().segment(text)].length;
    }
    return Array.from(text).length;
}

function normalizeLabel(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
        return [...new Intl.Segmenter().segment(text)].slice(0, 4).map((part) => part.segment).join("");
    }
    return Array.from(text).slice(0, 4).join("");
}

function normalizeIcon(value, fallback) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "iconCommand") return fallback;
    if (/^icon[A-Za-z0-9_-]+$/.test(text)) return text;
    if (graphemeLength(text) === 1) return text;
    return fallback;
}

function sanitizeQuickActions(value, max = 12) {
    if (!Array.isArray(value)) {
        return {items: DEFAULT_QUICK_ACTIONS.map((item) => ({...item})), changed: false};
    }
    const seen = new Set();
    const items = [];
    let changed = false;
    value.forEach((raw, index) => {
        if (items.length >= max) { changed = true; return; }
        if (!raw || typeof raw !== "object") { changed = true; return; }
        const kind = QUICK_ACTION_KINDS.has(raw.kind) ? raw.kind : "builtin";
        const valueId = typeof raw.value === "string" ? raw.value : "";
        const validValue = kind === "dock" || kind === "adapter" || kind === "command"
            ? valueId.length > 0 : BUILTIN_VALUES.has(valueId);
        const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]+$/.test(raw.id) ? raw.id : `${kind}-${valueId || index}`;
        if (!validValue || seen.has(id)) { changed = true; return; }
        seen.add(id);
        const targets = Array.isArray(raw.targets) ? normalizeTargets(raw.targets) : ["desktop"];
        const label = normalizeLabel(raw.label) || normalizeLabel(valueId);
        const item = {
            id,
            label,
            icon: normalizeIcon(raw.icon, kind === "dock" ? "iconDock" : (kind === "command" || kind === "adapter" ? "iconPlugin" : "iconLayout")),
            kind,
            value: valueId,
            // An explicit empty list means the action is configured but not
            // currently placed on any surface. Only legacy missing data falls
            // back to desktop.
            targets,
            order: Number.isFinite(raw.order) ? raw.order : (index + 1) * 10,
            enabled: raw.enabled !== false,
        };
        if (graphemeLength(String(raw.label ?? "")) > 4 || JSON.stringify(item) !== JSON.stringify(raw)) changed = true;
        items.push(item);
    });
    if (items.length === 0 && value.length > 0) changed = true;
    return {items, changed};
}

function getDefaultQuickActions() {
    return DEFAULT_QUICK_ACTIONS.map((item) => ({...item, targets: [...item.targets]}));
}

function getBuiltinQuickActions() {
    return BUILTIN_QUICK_ACTIONS.map((item) => ({...item, targets: [...item.targets]}));
}

module.exports = {
    sanitizeQuickActions,
    getDefaultQuickActions,
    getBuiltinQuickActions,
    getDefaultQuickActionTargets,
    resolveQuickActionSupport,
    shouldRenderQuickAction,
    appendQuickAction,
    graphemeLength,
};
