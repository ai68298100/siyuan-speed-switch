// 快捷入口配置的纯函数层：持久化数据不可信，所有字段在进入 UI 前统一清理。
const QUICK_ACTION_KINDS = new Set(["builtin", "dock", "adapter", "command"]);
const BUILTIN_VALUES = new Set(["switcher", "search", "journal", "settings"]);
const DEFAULT_QUICK_ACTIONS = [
    {id: "switcher", label: "切换", icon: "iconLayout", kind: "builtin", value: "switcher", targets: ["desktop", "sidebar", "mobile"], order: 10, enabled: true},
    {id: "search", label: "搜索", icon: "iconSearch", kind: "builtin", value: "search", targets: ["desktop", "sidebar", "mobile"], order: 20, enabled: true},
    {id: "journal", label: "日记", icon: "iconCalendar", kind: "builtin", value: "journal", targets: ["desktop", "mobile"], order: 30, enabled: true},
    {id: "settings", label: "设置", icon: "iconSettings", kind: "builtin", value: "settings", targets: ["desktop", "sidebar", "mobile"], order: 40, enabled: true},
];

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
    value.slice(0, max).forEach((raw, index) => {
        if (!raw || typeof raw !== "object") { changed = true; return; }
        const kind = QUICK_ACTION_KINDS.has(raw.kind) ? raw.kind : "builtin";
        const valueId = typeof raw.value === "string" ? raw.value : "";
        const validValue = kind === "dock" || kind === "adapter" || kind === "command"
            ? valueId.length > 0 : BUILTIN_VALUES.has(valueId);
        const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]+$/.test(raw.id) ? raw.id : `${kind}-${valueId || index}`;
        if (!validValue || seen.has(id)) { changed = true; return; }
        seen.add(id);
        const targets = Array.isArray(raw.targets) ? raw.targets.filter((target) => ["desktop", "sidebar", "mobile"].includes(target)) : ["desktop"];
        const item = {
            id,
            label: normalizeLabel(raw.label),
            icon: normalizeIcon(raw.icon, kind === "dock" || kind === "command" ? "iconDock" : "iconCommand"),
            kind,
            value: valueId,
            targets: targets.length > 0 ? targets : ["desktop"],
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
    return DEFAULT_QUICK_ACTIONS.map((item) => ({...item}));
}

module.exports = {sanitizeQuickActions, getDefaultQuickActions, graphemeLength};
