// 快捷入口配置的纯函数层：持久化数据不可信，所有字段在进入 UI 前统一清理。
const {normalizeQuickActionText, graphemeLength, graphemeSlice, normalizeCustomIcon} = require("./util.js");
const QUICK_ACTION_KINDS = new Set(["builtin", "dock", "adapter", "command", "global"]);
const QUICK_ACTION_TARGETS = ["desktop", "sidebar", "mobile"];
const BUILTIN_VALUES = new Set([
    "switcher", "search", "journal", "settings", "home",
    "snippet-studio",
    "quick-capture", "previous-tab", "next-tab", "scroll-top", "scroll-bottom",
    "sync-now", "insert-template", "cycle-doc-set", "cycle-ball-preset",
    "throw-window", "hide-keyboard", "jump-back", "jump-forward",
    "mark-set", "mark-jump", "clipboard", "close-tab",
]);
// T-6789/T-6790（§8.0.11）：宿主命令动作目录。targets 按思源源码证据声明：
// global.ts 的 MOBILE 分支（v3.8.1+ 源码核对）仅支持 fileTree/outline/bookmark/
// tag/inbox/backlinks/mainMenu/globalSearch/recentDocs；riffCard/recentClosed/
// editReadonly 只在桌面分支。能力检测（globalCommand 是否存在）由宿主层负责。
const GLOBAL_QUICK_ACTIONS = [
    {id: "global-outline", label: "大纲", langKey: "actionOutline", icon: "iconList", kind: "global", value: "outline", targets: ["desktop", "mobile"], order: 10, enabled: true},
    {id: "global-bookmark", label: "书签", langKey: "actionBookmark", icon: "iconBookmark", kind: "global", value: "bookmark", targets: ["desktop", "mobile"], order: 20, enabled: true},
    {id: "global-tag", label: "标签", langKey: "actionTag", icon: "iconTags", kind: "global", value: "tag", targets: ["desktop", "mobile"], order: 30, enabled: true},
    {id: "global-inbox", label: "收集箱", langKey: "actionInbox", icon: "iconInbox", kind: "global", value: "inbox", targets: ["desktop", "mobile"], order: 40, enabled: true},
    {id: "global-backlinks", label: "反链", langKey: "actionBacklinks", icon: "iconBacklink", kind: "global", value: "backlinks", targets: ["desktop", "mobile"], order: 50, enabled: true},
    {id: "global-recent-docs", label: "最近文档", langKey: "actionRecentDocs", icon: "iconHistory", kind: "global", value: "recentDocs", targets: ["desktop", "mobile"], order: 60, enabled: true},
    {id: "global-recent-closed", label: "最近关闭", langKey: "actionRecentClosed", icon: "iconClose", kind: "global", value: "recentClosed", targets: ["desktop"], order: 70, enabled: true},
    {id: "global-riff-card", label: "闪卡复习", langKey: "actionRiffCard", icon: "iconRiff", kind: "global", value: "riffCard", targets: ["desktop"], order: 80, enabled: true},
    {id: "global-edit-readonly", label: "编辑只读", langKey: "actionEditReadonly", icon: "iconLock", kind: "global", value: "editReadonly", targets: ["desktop"], order: 90, enabled: true},
    {id: "global-file-tree", label: "文档树", langKey: "actionFileTree", icon: "iconFiles", kind: "global", value: "fileTree", targets: ["desktop", "mobile"], order: 100, enabled: true},
    {id: "global-main-menu", label: "主菜单", langKey: "actionMainMenu", icon: "iconMenu", kind: "global", value: "mainMenu", targets: ["desktop", "mobile"], order: 110, enabled: true},
    {id: "global-search", label: "全局搜索", langKey: "actionGlobalSearch", icon: "iconSearch", kind: "global", value: "globalSearch", targets: ["desktop", "mobile"], order: 120, enabled: true},
];
function getGlobalQuickActions() {
    return GLOBAL_QUICK_ACTIONS.map((item) => ({...item}));
}
const BUILTIN_QUICK_ACTIONS = [
    {id: "switcher", label: "切换", langKey: "actionSwitcher", icon: "iconLayout", kind: "builtin", value: "switcher", targets: ["desktop", "sidebar", "mobile"], order: 10, enabled: true},
    {id: "search", label: "搜索", langKey: "actionSearch", icon: "iconSearch", kind: "builtin", value: "search", targets: ["desktop", "sidebar", "mobile"], order: 20, enabled: true},
    {id: "journal", label: "日记", langKey: "actionJournal", icon: "iconCalendar", kind: "builtin", value: "journal", targets: ["desktop", "sidebar", "mobile"], order: 10, enabled: true},
    {id: "settings", label: "设置", langKey: "actionSettings", icon: "iconSettings", kind: "builtin", value: "settings", targets: ["desktop", "sidebar", "mobile"], order: 20, enabled: true},
    {id: "home", label: "组件面板", langKey: "actionHome", icon: "iconLayoutHome", kind: "builtin", value: "home", targets: ["desktop", "sidebar", "mobile"], order: 30, enabled: true},
    {id: "snippet-studio", label: "片段实验室", langKey: "platformStudio", icon: "iconCode", kind: "builtin", value: "snippet-studio", targets: ["desktop"], order: 35, enabled: true},
    {id: "quick-capture", label: "快速记录", langKey: "actionQuickCapture", icon: "iconAdd", kind: "builtin", value: "quick-capture", targets: ["desktop", "sidebar", "mobile"], order: 40, enabled: true, mobileSafe: true},
    {id: "previous-tab", label: "上一个页签", langKey: "actionPreviousTab", icon: "iconLeft", kind: "builtin", value: "previous-tab", targets: ["desktop", "sidebar", "mobile"], order: 50, enabled: true, mobileSafe: true},
    {id: "next-tab", label: "下一个页签", langKey: "actionNextTab", icon: "iconRight", kind: "builtin", value: "next-tab", targets: ["desktop", "sidebar", "mobile"], order: 60, enabled: true, mobileSafe: true},
    {id: "scroll-top", label: "滚动到顶部", langKey: "actionScrollTop", icon: "iconUp", kind: "builtin", value: "scroll-top", targets: ["desktop", "sidebar", "mobile"], order: 70, enabled: true, mobileSafe: true},
    {id: "scroll-bottom", label: "滚动到底部", langKey: "actionScrollBottom", icon: "iconDown", kind: "builtin", value: "scroll-bottom", targets: ["desktop", "sidebar", "mobile"], order: 80, enabled: true, mobileSafe: true},
    {id: "sync-now", label: "同步", langKey: "actionSyncNow", icon: "iconSync", kind: "builtin", value: "sync-now", targets: ["desktop", "sidebar", "mobile"], order: 90, enabled: true, mobileSafe: true},
    {id: "insert-template", label: "插入模板", langKey: "actionInsertTemplate", icon: "iconMarkdown", kind: "builtin", value: "insert-template", targets: ["desktop", "mobile"], order: 100, enabled: true, mobileSafe: true},
    {id: "cycle-doc-set", label: "切换文档集", langKey: "actionCycleDocSet", icon: "iconRefresh", kind: "builtin", value: "cycle-doc-set", targets: ["desktop", "mobile"], order: 110, enabled: true, mobileSafe: true},
    {id: "cycle-ball-preset", label: "切换球预设", langKey: "actionCycleBallPreset", icon: "iconComposition", kind: "builtin", value: "cycle-ball-preset", targets: ["desktop", "mobile"], order: 120, enabled: true, mobileSafe: true},
    {id: "throw-window", label: "抛独立窗口", langKey: "actionThrowWindow", icon: "iconOpen", kind: "builtin", value: "throw-window", targets: ["desktop"], order: 130, enabled: true},
    {id: "hide-keyboard", label: "收起键盘", langKey: "actionHideKeyboard", icon: "iconDown", kind: "builtin", value: "hide-keyboard", targets: ["mobile"], order: 140, enabled: true, mobileSafe: true},
    {id: "jump-back", label: "跳转后退", langKey: "actionJumpBack", icon: "iconLeft", kind: "builtin", value: "jump-back", targets: ["desktop", "mobile"], order: 150, enabled: true, mobileSafe: true},
    {id: "jump-forward", label: "跳转前进", langKey: "actionJumpForward", icon: "iconRight", kind: "builtin", value: "jump-forward", targets: ["desktop", "mobile"], order: 160, enabled: true, mobileSafe: true},
    {id: "mark-set", label: "标记位置", langKey: "actionMarkSet", icon: "iconBookmark", kind: "builtin", value: "mark-set", targets: ["desktop", "mobile"], order: 170, enabled: true, mobileSafe: true},
    {id: "mark-jump", label: "跳回标记", langKey: "actionMarkJump", icon: "iconHandbook", kind: "builtin", value: "mark-jump", targets: ["desktop", "mobile"], order: 180, enabled: true, mobileSafe: true},
    {id: "clipboard", label: "剪贴板入口", langKey: "actionClipboard", icon: "iconCopy", kind: "builtin", value: "clipboard", targets: ["desktop", "mobile"], order: 190, enabled: true, mobileSafe: true},
    {id: "close-tab", label: "关闭当前页签", langKey: "actionCloseTab", icon: "iconClose", kind: "builtin", value: "close-tab", targets: ["desktop", "sidebar"], order: 200, enabled: true},
];
// Keep a deliberately small first-run workspace. External providers remain
// available from “Add action” and must never occupy the bar automatically.
const DEFAULT_QUICK_ACTIONS = BUILTIN_QUICK_ACTIONS.filter((item) =>
    item.value === "journal" || item.value === "settings" || item.value === "search");

// v2 (0.16.11): the stored action bar used to be machine-written from older
// default sets (auto-registered provider entries included), so pre-marker
// configs are reset to the new defaults exactly once. After the marker is
// written, user curation is never touched again.
const QUICK_ACTION_DEFAULTS_VERSION = 2;

function migrateQuickActionDefaults(stored, storedVersion) {
    if (storedVersion === QUICK_ACTION_DEFAULTS_VERSION) {
        return {items: null, migrated: false};
    }
    return {items: getDefaultQuickActions(), migrated: true};
}

const QUICK_ACTION_PROVIDER_PROTOCOL_VERSION = 1;

/**
 * T-6819 provider 协议（D6）：第三方提供方元数据的单一事实来源。
 * 字段白名单：version（协议版本，只读回显）；动作级 description（≤200，
 * 展示与执行分离——描述进 picker/文档，不改变执行能力）。
 */
function describeProviderProtocol() {
    return {
        protocolVersion: QUICK_ACTION_PROVIDER_PROTOCOL_VERSION,
        fields: {
            id: "string (required, charset A-Za-z0-9._:-)",
            name: "string (required, ≤80)",
            targets: "string[] (surfaces; execution still gated by capability)",
            version: "string (optional, ≤32)",
            actions: [{
                value: "string (required)",
                label: "string",
                icon: "string (optional svg id)",
                description: "string (optional, ≤200, display-only)",
            }],
        },
        guarantees: [
            "display and execution remain separated",
            "unregister restores the pre-registration state",
            "unknown providers stay visible with kind=adapter",
        ],
    };
}

function normalizeProvider(provider) {
    if (!provider || typeof provider !== "object") return null;
    const id = normalizeQuickActionText(provider.id, 64).replace(/[^A-Za-z0-9._:-]/g, "");
    const name = normalizeQuickActionText(provider.name || provider.id, 80);
    if (!id || !name) return null;
    const version = normalizeQuickActionText(provider.version, 32);
    const targets = normalizeTargets(provider.targets || provider.supportedSurfaces || provider.supportedDevices);
    const actions = Array.isArray(provider.actions) ? provider.actions
        .map((action) => {
            const base = {value: action?.value, label: action?.label, icon: action?.icon, kind: action?.kind || "adapter", providerId: id};
            // T-6819：动作级展示描述（≤200），可缺省
            const description = normalizeQuickActionText(action?.description, 200);
            return description ? {...base, description} : base;
        })
        .filter((action) => typeof action.value === "string" && action.value.trim()) : [];
    return {id, name, ...(version ? {version} : {}), targets, actions};
}

function createQuickActionRegistry() {
    const providers = new Map();
    const handlers = new Map();
    return {
        register(provider, handler) {
            const normalized = normalizeProvider(provider);
            if (!normalized) return {registered: false, reason: "invalid"};
            const existing = providers.get(normalized.id);
            if (existing && JSON.stringify(existing) === JSON.stringify(normalized)) {
                if (typeof handler === "function") handlers.set(normalized.id, handler);
                return {registered: true, provider: existing, unchanged: true};
            }
            providers.set(normalized.id, normalized);
            if (typeof handler === "function") handlers.set(normalized.id, handler);
            return {registered: true, provider: normalized};
        },
        unregister(providerId) {
            const id = normalizeQuickActionText(providerId, 64);
            handlers.delete(id);
            return providers.delete(id);
        },
        list(max = 64) {
            const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 64;
            return [...providers.values()].flatMap((provider) => provider.actions.map((action) => ({...action, declaredTargets: [...provider.targets]}))).slice(0, limit);
        },
        snapshot() { return [...providers.values()].map((provider) => ({...provider, targets: [...provider.targets], actions: provider.actions.map((action) => ({...action}))})); },
        invoke(action, context) {
            const providerId = normalizeQuickActionText(action?.providerId, 64);
            const handler = handlers.get(providerId);
            if (!handler || !providers.has(providerId)) return {ok: false, reason: "unavailable"};
            try {
                const result = handler(action, context);
                return {ok: true, result};
            } catch {
                return {ok: false, reason: "failed"};
            }
        },
    };
}

function normalizeTargets(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((target) => QUICK_ACTION_TARGETS.includes(target))));
}

// Read capability claims only from the live provider, never from saved user
// placement. No declaration (or a broken/unknown version) remains unknown.
function getQuickActionCommandTargets(plugins, value) {
    if (!Array.isArray(plugins) || typeof value !== "string") return undefined;
    const separator = value.indexOf("::");
    if (separator <= 0) return undefined;
    const plugin = plugins.find((item) => item?.name === value.slice(0, separator));
    if (typeof plugin?.getQuickActionCapabilities !== "function") return undefined;
    try {
        const metadata = plugin.getQuickActionCapabilities();
        const key = value.slice(separator + 2);
        if (metadata?.version !== 1 || !metadata.commands
            || !Object.prototype.hasOwnProperty.call(metadata.commands, key)) return undefined;
        const targets = metadata.commands[key];
        return Array.isArray(targets) ? normalizeTargets(targets) : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Returns whether an action is known to work on a surface. Third-party
 * commands without the optional plugin capability declaration remain
 * "unknown" on mobile instead of being guessed from the callback shape.
 */
function resolveQuickActionSupport(kind, value, target, declaredTargets) {
    if (!QUICK_ACTION_TARGETS.includes(target)) return "unsupported";
    if (kind === "builtin") {
        const builtin = BUILTIN_QUICK_ACTIONS.find((item) => item.value === value);
        return builtin?.targets.includes(target) ? "supported" : "unsupported";
    }
    if (kind === "dock") return target === "mobile" ? "unsupported" : "supported";
    if (kind === "global") {
        // Declared targets carry the source-verified surface set. Without a
        // declaration stay conservative: mobile is unknown until the provider
        // proves it, matching the command-kind contract.
        if (Array.isArray(declaredTargets)) return normalizeTargets(declaredTargets).includes(target) ? "supported" : "unsupported";
        return target === "mobile" ? "unknown" : "supported";
    }
    if (kind === "command") {
        if (Array.isArray(declaredTargets)) return normalizeTargets(declaredTargets).includes(target) ? "supported" : "unsupported";
        return target === "mobile" ? "unknown" : "supported";
    }
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
        && action.value === "switcher"
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
        label: normalizeLabel(candidate.label) || normalizeLabel(candidate.value),
        icon: normalizeIcon(candidate.icon, candidate.kind === "dock" ? "iconDock" : (candidate.kind === "command" || candidate.kind === "adapter" ? "iconPlugin" : "iconLayout")),
        targets,
        order: (current.length + 1) * 10,
        enabled: candidate.enabled !== false,
    };
    delete next.declaredTargets;
    return {items: [...current, next], added: true, reason: "added"};
}

function normalizeLabel(value) {
    return graphemeSlice(normalizeQuickActionText(value, 80), 4);
}

function normalizeIcon(value, fallback) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "iconCommand") return fallback;
    // SiYuan core icons use the `icon*` convention, while several plugins
    // register `lucide-*` or `siyuan-*-icon` symbols. Keep those serializable
    // identifiers so the renderer can resolve them when the plugin is loaded;
    // an unavailable symbol still falls back visually at render time.
    return normalizeCustomIcon(text) || fallback;
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
        const validValue = kind === "dock" || kind === "adapter" || kind === "command" || kind === "global"
            ? valueId.length > 0 : BUILTIN_VALUES.has(valueId);
        const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]+$/.test(raw.id) ? raw.id : `${kind}-${valueId || index}`;
        if (!validValue || seen.has(id)) { changed = true; return; }
        seen.add(id);
        const targets = Array.isArray(raw.targets) ? normalizeTargets(raw.targets) : ["desktop"];
        const label = normalizeLabel(raw.label) || normalizeLabel(valueId);
        // T-6845：langKey 是受控字段（i18n 键名），合法则随条目持久化保留——
        // 剥离会破坏 sanitize 不动点（默认目录带 langKey，二遍清洗恒 changed）
        const langKey = typeof raw.langKey === "string" && /^[A-Za-z0-9_]{1,64}$/.test(raw.langKey)
            ? raw.langKey : "";
        const item = {
            id,
            label,
            ...(langKey ? {langKey} : {}),
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
        const rawHasLangKey = typeof raw.langKey === "string" && raw.langKey !== "";
        if (graphemeLength(String(raw.label ?? "")) > 4 || rawHasLangKey !== Boolean(langKey) || JSON.stringify(item) !== JSON.stringify(raw)) changed = true;
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

// T-6845：目录标签 i18n 解析。catalog 里的 label 是中文兜底（sanitize 持久化
// 只留 id/value 等核心字段，langKey 不进存储）；展示时按 id 回查目录拿 langKey，
// 经宿主 i18n 翻译，缺键回退 catalog 中文——三端消费面（底栏/球面板/命令模式）
// 全部经此函数出标签，界面语言与宿主设置一致。
function resolveQuickActionLabel(action, translations) {
    if (!action || typeof action !== "object") return "";
    if (typeof translations !== "object" || !translations) return action.label || "";
    const catalog = action.kind === "global" ? GLOBAL_QUICK_ACTIONS : BUILTIN_QUICK_ACTIONS;
    const entry = catalog.find((item) => item.id === action.id && item.kind === action.kind);
    const langKey = entry?.langKey || action.langKey;
    if (langKey && typeof translations[langKey] === "string" && translations[langKey]) {
        return translations[langKey];
    }
    return action.label || "";
}

module.exports = {
    getQuickActionCommandTargets,
    normalizeProvider,
    describeProviderProtocol,
    QUICK_ACTION_PROVIDER_PROTOCOL_VERSION,
    createQuickActionRegistry,
    sanitizeQuickActions,
    getDefaultQuickActions,
    getBuiltinQuickActions,
    getGlobalQuickActions,
    resolveQuickActionLabel,
    getDefaultQuickActionTargets,
    resolveQuickActionSupport,
    shouldRenderQuickAction,
    appendQuickAction,
    migrateQuickActionDefaults,
    QUICK_ACTION_DEFAULTS_VERSION,
    graphemeLength,
};
