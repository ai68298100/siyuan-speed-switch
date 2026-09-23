"use strict";

// T-6824 可迁移配置包（表面迁移批，D15）：把用户可迁移的配置面（设置白名单
// 子集 + 文档集）打包为一个版本化 JSON，导入时先整体校验再原子应用。
// 本模块只做构造与校验；文件读写、确认弹窗与落盘由调用方负责。

const CONFIG_PACK_SCHEMA_VERSION = 1;
const CONFIG_PACK_NOTE_MAX = 200;

// 设置白名单：只允许明确可迁移的键（与 storage-migration 的 13 key 对齐子集）。
// 黑名单思路不安全，这里走白名单——新增可迁移键时必须显式登记。
const CONFIG_PACK_SETTINGS_KEYS = [
    "density",
    "pinyinMatch",
    "reuseOpenTabs",
    "skin",
    "savedSearches",
    "favoriteSmartGroups",
    "documentSetEssentials",
    "floatingBall",
    "journalNotebook",
];

function buildConfigPack(source, options = {}) {
    const settings = source && typeof source === "object" ? source : {};
    const note = typeof options.note === "string" ? options.note.trim().slice(0, CONFIG_PACK_NOTE_MAX) : "";
    return {
        schemaVersion: CONFIG_PACK_SCHEMA_VERSION,
        generatedAt: Number.isFinite(options.now) && options.now > 0 ? Math.floor(options.now) : Date.now(),
        app: "siyuan-speed-switch",
        ...(note ? {note} : {}),
        settings: Object.fromEntries(CONFIG_PACK_SETTINGS_KEYS
            .filter((key) => settings[key] !== undefined)
            .map((key) => [key, settings[key]])),
        documentSets: source?.documentSets ?? null,
    };
}

/**
 * 导入校验：整体合法才返回 ok（原子应用的前置）。settings 只保留白名单键；
 * documentSets 必须是 null（不迁移）或 {schemaVersion, sets} 形态——深校验
 * 交给调用方既有的 normalizeDocumentSets（导入合并/迁移门禁在那里执行）。
 */
function normalizeConfigPackImport(payload) {
    if (!payload || typeof payload !== "object") return {ok: false, reason: "invalid"};
    if (payload.app !== "siyuan-speed-switch") return {ok: false, reason: "foreign"};
    if (!Number.isFinite(payload.schemaVersion) || payload.schemaVersion < 1 || payload.schemaVersion > CONFIG_PACK_SCHEMA_VERSION) {
        return {ok: false, reason: "unsupported-version"};
    }
    if (!payload.settings || typeof payload.settings !== "object") return {ok: false, reason: "invalid"};
    const ds = payload.documentSets;
    if (ds !== null && ds !== undefined && (typeof ds !== "object" || !Array.isArray(ds.sets))) {
        return {ok: false, reason: "invalid"};
    }
    const settings = {};
    for (const key of CONFIG_PACK_SETTINGS_KEYS) {
        if (payload.settings[key] !== undefined) settings[key] = payload.settings[key];
    }
    return {
        ok: true,
        settings,
        documentSets: ds ?? null,
        schemaVersion: payload.schemaVersion,
        generatedAt: Number.isFinite(payload.generatedAt) ? payload.generatedAt : 0,
        note: typeof payload.note === "string" ? payload.note.slice(0, CONFIG_PACK_NOTE_MAX) : "",
    };
}

module.exports = {
    CONFIG_PACK_SCHEMA_VERSION,
    CONFIG_PACK_SETTINGS_KEYS,
    buildConfigPack,
    normalizeConfigPackImport,
};
