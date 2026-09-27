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

// T-6961：导入前差异与分组选择应用。组粒度 = 设置（白名单键逐行明细）与
// 文档集（整组替换语义，不暗示逐项智能合并）；动作只有 新增/替换/保持 三种。
// 不支持秘密值预览——行明细只呈现键名与动作，不展开值内容。
function sameJson(left, right) {
    return JSON.stringify(left === undefined ? null : left) === JSON.stringify(right === undefined ? null : right);
}

function diffConfigPackGroups(normalized, current, options = {}) {
    const currentSettings = current && typeof current.settings === "object" ? current.settings : {};
    const currentSets = current && current.documentSets && typeof current.documentSets === "object" ? current.documentSets : null;
    const groups = [];
    const settingsRows = [];
    if (normalized?.settings && typeof normalized.settings === "object") {
        for (const key of CONFIG_PACK_SETTINGS_KEYS) {
            if (!Object.hasOwn(normalized.settings, key)) continue;
            const inCurrent = Object.hasOwn(currentSettings, key);
            const same = inCurrent && sameJson(currentSettings[key], normalized.settings[key]);
            settingsRows.push({
                key,
                kind: !inCurrent ? "add" : same ? "keep" : "replace",
                ...(inCurrent ? {} : {}),
            });
        }
    }
    // 组动作标签优先级：替换 > 新增 > 保持（混合差异以更显著的"替换"表达）
    const hasReplace = settingsRows.some((row) => row.kind === "replace");
    const hasAdd = settingsRows.some((row) => row.kind === "add");
    const settingsAction = settingsRows.length === 0 ? "" : hasReplace ? "replace" : hasAdd ? "add" : "keep";
    if (settingsAction) groups.push({id: "settings", action: settingsAction, rows: settingsRows});

    if (normalized?.documentSets) {
        const sets = Array.isArray(normalized.documentSets.sets) ? normalized.documentSets.sets : [];
        const currentSetsList = currentSets && Array.isArray(currentSets.sets) ? currentSets.sets : null;
        const same = currentSetsList !== null && sameJson(currentSetsList, sets);
        groups.push({
            id: "documentSets",
            action: currentSetsList === null ? "add" : same ? "keep" : "replace",
            rows: [{key: "documentSets", kind: currentSetsList === null ? "add" : same ? "keep" : "replace", count: sets.length}],
        });
    }
    return groups;
}

// 按勾选的组产出应持久化的补丁：未勾选的组不出现在结果里（保持现状）；
// 未知组 id 忽略。settings 只含白名单键，documentSets 原样传递（深校验在调用方）。
function mergeConfigPackSelection(normalized, selectedGroups) {
    const selected = new Set(Array.isArray(selectedGroups) ? selectedGroups : []);
    const patch = {};
    if (selected.has("settings") && normalized?.settings && typeof normalized.settings === "object") {
        patch.settings = {...normalized.settings};
    }
    if (selected.has("documentSets") && normalized?.documentSets) {
        patch.documentSets = normalized.documentSets;
    }
    return patch;
}

// 并发防护：打开预览与点击确认之间当前态若已变化，返回 false（调用方刷新差异，
// 不应用旧预览）。以轻量 JSON 签名比较，不引入持久化。
function configPackBaselineSignature(current) {
    return JSON.stringify({settings: current?.settings ?? null, documentSets: current?.documentSets ?? null});
}

module.exports = {
    CONFIG_PACK_SCHEMA_VERSION,
    CONFIG_PACK_SETTINGS_KEYS,
    buildConfigPack,
    normalizeConfigPackImport,
    diffConfigPackGroups,
    mergeConfigPackSelection,
    configPackBaselineSignature,
};
