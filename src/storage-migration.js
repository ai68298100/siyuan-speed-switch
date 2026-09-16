// 存储版本迁移与损坏恢复报告（v0.20 数据连续性第一批，D-386）。
//
// 定位：**演练优先**。runStorageMigration 是纯函数——输入模拟 loadData 的
// 全量 payload，输出迁移后的数据与有界恢复报告，绝不触碰真实存储。onload
// 接线（用本管道替换 sanitizePersistentData 的静默修复）在演练证据齐全后
// 单独批次执行；本模块先作为离线演练与契约测试的事实来源。
//
// 原则：
// 1) 复用既有清洗：per-key 处理器全部委托 sanitize 家族（util.js /
//    recent-closed.js / quick-actions.js / document-sets.js），本模块只做
//    编排、分类与报告，不复制清洗规则——演练结果与宿主 sanitizePersistentData
//    天然同源，由契约测试锁定这一关系。
// 2) 报告有界：每个 key 一条固定记录，note 文本有界、无时间戳、无原始数据
//    回显，可安全进入日志或未来的 Agent 只读快照。
// 3) 对象类 key 逐个毕业：settings/home_state 仍是形状分类（inspect），深度
//    迁移随宿主接线批次注册；thumb_cache 已在 D-392 批次毕业为实处理
//    （读取侧归一化与宿主 setThumbCache 镜像），因为它是三者中唯一存在真实
//    数据完整性缺口的 key——超限/损坏条目原本永远不会被清理。
const {capMru, sanitizeStringList, sanitizeFavorites, sanitizeOpenHistory, normalizeThumbCache} = require("./util.js");
const {normalizeClosedEntries} = require("./recent-closed.js");
const {sanitizeQuickActions, migrateQuickActionDefaults, QUICK_ACTION_DEFAULTS_VERSION} = require("./quick-actions.js");
const {normalizeDocumentSets} = require("./document-sets.js");

// 与 constants.ts 的上限保持一致（一致性由 storage-migration 契约测试锁定）。
const DEFAULT_LIMITS = Object.freeze({
    mru: 200,             // MRU_MAX
    history: 50,          // HISTORY_MAX
    closedHistory: 50,    // HISTORY_MAX（最近关闭共用）
    pinned: 64,           // PINNED_MAX
    favorites: 512,       // FAVORITES_MAX
    favGroups: 64,        // FAVORITE_GROUPS_MAX
    favCollapsed: 64,     // 与分组注册表同界
    quickActions: 12,     // QUICK_ACTIONS_MAX
    thumbCache: 40,       // THUMB_CACHE_MAX（手机端由调用方以 limits 覆盖为 30）
    thumbHtml: 200 * 1024, // THUMB_HTML_MAX（手机端 80 KiB）
});

const STORAGE_SCHEMA_VERSION = 1;

const HANDLED_KEYS = Object.freeze([
    "sw_mru",
    "sw_open_history",
    "sw_closed_history",
    "sw_pinned",
    "sw_favorites",
    "sw_fav_groups",
    "sw_fav_collapsed",
    "sw_quick_actions",
    "sw_quick_actions_defaults",
    "sw_document_sets",
    "sw_thumb_cache",
]);

const INSPECTED_KEYS = Object.freeze([
    "sw_settings",
    "sw_home_state",
]);

// KEY_ORDER 由两个分类集拼接而来（总数恒为 13，与 agent-capabilities 的
// 计数上限同源）。拼接保证了「分类集与报告 key 集合不可能漂移」——这是有意
// 的：sw_thumb_cache 从 inspect 毕业到 handled 时，报告里它的位置随之从第 13
// 位移到第 11 位（遵循 handled 分组），但 key 集合与总数完全不变，totals
// 结构也不变，所以下游只读快照无需改动。
const KEY_ORDER = Object.freeze([...HANDLED_KEYS, ...INSPECTED_KEYS]);

const NOTE_MAX = 80;

function boundNote(text) {
    const raw = typeof text === "string" ? text : "";
    return raw.length > NOTE_MAX ? raw.slice(0, NOTE_MAX) : raw;
}

function describeShape(value) {
    if (value === undefined || value === null) return "missing";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    return typeof value === "string" ? "string" : "primitive";
}

// 统一的列表处理器包装：把 sanitize 家族的 {items, changed} 翻译成迁移语义
// —— 非数组输入视为整体重置（reset），changed 视为清洗（cleaned），其余直通。
function listHandler(sanitize, limitName, emptyNote, resetNote) {
    return (value, limits) => {
        if (!Array.isArray(value)) {
            const fallback = sanitize(undefined, limits[limitName]);
            return {value: fallback.items, status: "reset", kept: fallback.items.length, removed: 0, note: boundNote(resetNote)};
        }
        const result = sanitize(value, limits[limitName]);
        if (!result.changed) {
            return {value: result.items, status: "kept", kept: result.items.length, removed: 0, note: ""};
        }
        return {
            value: result.items,
            status: "cleaned",
            kept: result.items.length,
            removed: Array.isArray(value) ? value.length - result.items.length : 0,
            note: boundNote(emptyNote),
        };
    };
}

const HANDLERS = {
    "sw_mru": (value, limits) => {
        // capMru 直接返回数组，没有 changed 标记；用长度与引用比较区分 kept/cleaned。
        if (!Array.isArray(value)) {
            return {value: [], status: "reset", kept: 0, removed: 0, note: boundNote("non-array MRU reset to empty")};
        }
        const items = capMru(value, limits.mru);
        const removed = value.length - items.length;
        const dirty = removed > 0 || items.some((item, index) => value[index] !== item);
        return dirty
            ? {value: items, status: "cleaned", kept: items.length, removed, note: boundNote("mru deduplicated or clamped")}
            : {value: items, status: "kept", kept: items.length, removed: 0, note: ""};
    },
    "sw_open_history": listHandler(sanitizeOpenHistory, "history", "open history entries sanitized", "non-array open history reset to empty"),
    "sw_closed_history": listHandler(normalizeClosedEntries, "closedHistory", "closed history entries sanitized", "non-array closed history reset to empty"),
    "sw_pinned": listHandler(sanitizeStringList, "pinned", "pinned list sanitized", "non-array pinned list reset to empty"),
    "sw_favorites": listHandler(sanitizeFavorites, "favorites", "favorites sanitized", "non-array favorites reset to empty"),
    "sw_fav_groups": listHandler(sanitizeStringList, "favGroups", "favorite groups sanitized", "non-array favorite groups reset to empty"),
    "sw_fav_collapsed": listHandler(sanitizeStringList, "favCollapsed", "collapsed group names sanitized", "non-array collapsed names reset to empty"),
    "sw_quick_actions": (value, limits) => {
        // sanitizeQuickActions 对非数组输入返回完整默认集且 changed=false；
        // 这在迁移语义里是 reset（恢复默认）而非 kept。
        if (!Array.isArray(value)) {
            const fallback = sanitizeQuickActions(undefined, limits.quickActions);
            return {value: fallback.items, status: "reset", kept: fallback.items.length, removed: 0, note: boundNote("non-array quick actions reset to defaults")};
        }
        const result = sanitizeQuickActions(value, limits.quickActions);
        if (!result.changed) {
            return {value: result.items, status: "kept", kept: result.items.length, removed: 0, note: ""};
        }
        return {
            value: result.items,
            status: "cleaned",
            kept: result.items.length,
            removed: value.length - result.items.length,
            note: boundNote("quick actions sanitized"),
        };
    },
    "sw_quick_actions_defaults": (value) => {
        // 该 key 存的是默认值迁移版本标记：等于当前版本 → kept；缺失 →
        // reset（宿主将执行一次性默认集迁移）；其他任何值 → reset 同义。
        if (value === QUICK_ACTION_DEFAULTS_VERSION) {
            return {value, status: "kept", kept: 1, removed: 0, note: ""};
        }
        return {
            value: null,
            status: "reset",
            kept: 0,
            removed: 0,
            note: boundNote("defaults marker missing or stale; one-time migration will run"),
        };
    },
    "sw_document_sets": (value) => {
        const result = normalizeDocumentSets(value);
        const legacyShape = !Array.isArray(value) && !(value && typeof value === "object" && Array.isArray(value.sets));
        const staleVersion = !legacyShape && value && typeof value === "object" && value.schemaVersion !== result.schemaVersion;
        const status = legacyShape ? "migrated" : (staleVersion ? "migrated" : (result.changed ? "cleaned" : "kept"));
        const kept = result.sets.length;
        const removed = legacyShape ? 0 : (Array.isArray(value) ? value.length : (Array.isArray(value?.sets) ? value.sets.length : 0)) - kept;
        return {
            value: {schemaVersion: result.schemaVersion, sets: result.sets},
            status: status === "kept" && removed > 0 ? "cleaned" : status,
            kept,
            removed: Math.max(0, removed),
            note: boundNote(status === "migrated" ? "document sets migrated to current schema version" : ""),
        };
    },
    "sw_thumb_cache": (value, limits) => {
        // 读取侧归一化（D-392）：清洗规则全部由 normalizeThumbCache 提供，与宿主
        // setThumbCache 的写入侧上限镜像，本模块不复制规则。非对象输入（数组/
        // 字符串/primitive/null）在迁移语义里是 reset，与 listHandler 一致。
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return {value: {}, status: "reset", kept: 0, removed: 0, note: boundNote("non-object thumb cache reset to empty")};
        }
        const result = normalizeThumbCache(value, {max: limits.thumbCache, htmlMax: limits.thumbHtml});
        if (!result.changed) {
            return {value: result.cache, status: "kept", kept: result.kept, removed: 0, note: ""};
        }
        return {
            value: result.cache,
            status: "cleaned",
            kept: result.kept,
            removed: result.removed,
            note: boundNote("thumb cache entries evicted or repaired"),
        };
    },
};

function inspectHandler(value) {
    return {value: null, status: "inspect", kept: 0, removed: 0, note: boundNote(`shape=${describeShape(value)}; deep migration delegated`)};
}

// 执行演练迁移：payloads 为 {key: value}（模拟 loadData 汇总），返回
// {fromVersion, toVersion, report, data}。
// - data 仅包含被处理且输入存在的 key（missing 不产出；inspect 类不产出）；
//   调用方应以宿主默认值补齐缺失 key。
// - report.keys 与 KEY_ORDER 一一对应，顺序稳定便于 diff。
function runStorageMigration(payloads, options = {}) {
    const source = payloads && typeof payloads === "object" && !Array.isArray(payloads) ? payloads : {};
    const limits = {...DEFAULT_LIMITS, ...(options.limits && typeof options.limits === "object" ? options.limits : {})};
    const fromVersion = Number.isFinite(options.fromVersion) ? Math.floor(options.fromVersion) : 0;
    const toVersion = STORAGE_SCHEMA_VERSION;
    const data = {};
    const keys = [];
    const totals = {kept: 0, cleaned: 0, migrated: 0, reset: 0, inspect: 0, missing: 0};
    for (const key of KEY_ORDER) {
        const present = Object.prototype.hasOwnProperty.call(source, key);
        const value = source[key];
        let entry;
        if (!present || value === undefined) {
            entry = {key, status: "missing", kept: 0, removed: 0, note: boundNote("absent; host default applies")};
        } else if (INSPECTED_KEYS.includes(key)) {
            entry = {key, ...inspectHandler(value)};
        } else {
            const handled = HANDLERS[key](value, limits);
            entry = {key, ...handled};
            if (handled.value !== null && handled.value !== undefined) {
                data[key] = handled.value;
            }
        }
        if (totals[entry.status] !== undefined) {
            totals[entry.status] += 1;
        }
        keys.push(entry);
    }
    return {
        fromVersion,
        toVersion,
        data,
        report: {version: toVersion, totals, keys},
    };
}

module.exports = {
    STORAGE_SCHEMA_VERSION,
    DEFAULT_LIMITS,
    KEY_ORDER,
    HANDLED_KEYS,
    INSPECTED_KEYS,
    describeShape,
    runStorageMigration,
};
