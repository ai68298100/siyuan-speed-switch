"use strict";

// 文档集只保存可稳定恢复的根文档信息；布局字段保持最小且可迁移。
const DOCUMENT_SET_SCHEMA_VERSION = 1;
const DOCUMENT_SET_MAX = 24;
const DOCUMENT_SET_ENTRY_MAX = 40;
const DOCUMENT_SET_NAME_MAX = 80;
const DOCUMENT_SET_TITLE_MAX = 200;
const DOCUMENT_SET_GROUP_MAX = 64;
// T-6829 版本历史：覆盖保存时自动留前一版（FIFO 有界），回滚可逆
const DOCUMENT_SET_VERSION_MAX = 3;

function cleanText(value, max) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max)
        : "";
}

function normalizeRootId(value) {
    const rootId = cleanText(value, 128);
    return rootId && !/[\s]/.test(rootId) ? rootId : "";
}

function normalizeIndex(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(999, Math.floor(number))) : fallback;
}

function normalizeEntry(value, index = 0) {
    if (!value || typeof value !== "object") return null;
    const rootId = normalizeRootId(value.rootId);
    if (!rootId) return null;
    const layout = value.layout && typeof value.layout === "object" ? value.layout : {};
    return {
        rootId,
        title: cleanText(value.title, DOCUMENT_SET_TITLE_MAX) || rootId,
        group: cleanText(layout.group ?? value.group, DOCUMENT_SET_GROUP_MAX),
        index: normalizeIndex(layout.index ?? value.index, index),
    };
}

// 版本快照条目与正文条目同一清洗规则；空版本无意义，直接丢弃
function normalizeVersions(value) {
    const versions = [];
    for (const raw of Array.isArray(value) ? value : []) {
        if (versions.length >= DOCUMENT_SET_VERSION_MAX) break;
        if (!raw || typeof raw !== "object") continue;
        const savedAt = Number.isFinite(raw.savedAt) && raw.savedAt > 0 ? raw.savedAt : 0;
        const entries = [];
        const seen = new Set();
        for (const rawEntry of Array.isArray(raw.entries) ? raw.entries : []) {
            if (entries.length >= DOCUMENT_SET_ENTRY_MAX) break;
            const entry = normalizeEntry(rawEntry, entries.length);
            if (!entry || seen.has(entry.rootId)) continue;
            seen.add(entry.rootId);
            entries.push(entry);
        }
        if (entries.length === 0) continue;
        if (versions.some((version) => version.savedAt === savedAt
            && JSON.stringify(version.entries) === JSON.stringify(entries))) continue;
        versions.push({savedAt, entries});
    }
    return versions;
}

function normalizeSet(value, index = 0) {
    if (!value || typeof value !== "object") return null;
    const entries = [];
    const seen = new Set();
    for (const raw of Array.isArray(value.entries) ? value.entries : []) {
        if (entries.length >= DOCUMENT_SET_ENTRY_MAX) break;
        const entry = normalizeEntry(raw, entries.length);
        if (!entry || seen.has(entry.rootId)) continue;
        seen.add(entry.rootId);
        entries.push(entry);
    }
    const name = cleanText(value.name, DOCUMENT_SET_NAME_MAX);
    if (!name || entries.length === 0) return null;
    const setId = cleanText(value.setId, 96).replace(/[^A-Za-z0-9._:-]/g, "") || `set-${index + 1}`;
    const createdAt = Number.isFinite(value.createdAt) && value.createdAt > 0 ? value.createdAt : 0;
    const updatedAt = Number.isFinite(value.updatedAt) && value.updatedAt > 0 ? value.updatedAt : createdAt;
    // T-6815 分层快照：集内固化的悬浮球场景预设（可选；字符集与 setId 同规）
    const presetId = cleanText(value.presetId, 96).replace(/[^A-Za-z0-9._:-]/g, "");
    return {setId, name, entries, createdAt, updatedAt, versions: normalizeVersions(value.versions), ...(presetId ? {presetId} : {})};
}

function normalizeDocumentSets(value, max = DOCUMENT_SET_MAX) {
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : DOCUMENT_SET_MAX;
    const source = Array.isArray(value) ? value : (value && Array.isArray(value.sets) ? value.sets : []);
    const sets = [];
    const ids = new Set();
    let changed = !Array.isArray(value) && !(value && Array.isArray(value.sets));
    source.forEach((raw, index) => {
        if (sets.length >= limit) { changed = true; return; }
        const item = normalizeSet(raw, index);
        if (!item || ids.has(item.setId)) { changed = true; return; }
        ids.add(item.setId);
        sets.push(item);
        if (JSON.stringify(item) !== JSON.stringify(raw)) changed = true;
    });
    if (sets.length !== source.length) changed = true;
    return {schemaVersion: DOCUMENT_SET_SCHEMA_VERSION, sets, changed};
}

function createDocumentSet(name, entries, options = {}) {
    const now = Number.isFinite(options.now) && options.now > 0 ? options.now : Date.now();
    const normalized = normalizeSet({
        setId: options.setId,
        name,
        entries,
        createdAt: now,
        updatedAt: now,
    }, 0);
    return normalized ? normalized : null;
}

function upsertDocumentSet(value, candidate, options = {}) {
    const state = normalizeDocumentSets(value, options.max).sets;
    const normalized = normalizeSet(candidate, state.length);
    if (!normalized) return {state: normalizeDocumentSets(value, options.max), changed: false, item: null};
    const now = Number.isFinite(options.now) && options.now > 0 ? options.now : Date.now();
    const existingIndex = state.findIndex((item) => item.setId === normalized.setId);
    let versions = normalized.versions;
    if (existingIndex >= 0) {
        const previous = state[existingIndex];
        // T-6829 覆盖保存自动留版：把被覆盖内容压入版本栈（内容未变化则不产生噪音版本）
        const identical = JSON.stringify(previous.entries) === JSON.stringify(normalized.entries);
        versions = identical ? previous.versions
            : [{savedAt: previous.updatedAt || now, entries: previous.entries}, ...previous.versions].slice(0, DOCUMENT_SET_VERSION_MAX);
        // T-6815：候选未携带场景固化时保留上一版的 presetId（分层不因覆盖丢失）
        if (!normalized.presetId && previous.presetId) normalized.presetId = previous.presetId;
    }
    const next = {...normalized, createdAt: existingIndex >= 0 ? state[existingIndex].createdAt : (normalized.createdAt || now), updatedAt: now, versions};
    const sets = state.slice();
    if (existingIndex >= 0) sets[existingIndex] = next;
    else sets.unshift(next);
    const bounded = normalizeDocumentSets({schemaVersion: DOCUMENT_SET_SCHEMA_VERSION, sets}, options.max);
    return {state: bounded, changed: true, item: next};
}

/**
 * T-6829 回滚到最近一个版本：当前内容压回版本栈（回滚可逆），版本栈其余顺延。
 * 无版本可回滚时返回 changed: false；纯函数，now 由调用方注入以便测试。
 */
function rollbackDocumentSet(value, setId, options = {}) {
    const state = normalizeDocumentSets(value, options.max).sets;
    const now = Number.isFinite(options.now) && options.now > 0 ? options.now : Date.now();
    const index = state.findIndex((item) => item.setId === cleanText(setId, 96));
    if (index < 0) return {state: normalizeDocumentSets(value, options.max), changed: false, item: null};
    const item = state[index];
    const target = (item.versions || [])[0];
    if (!target) return {state: normalizeDocumentSets(value, options.max), changed: false, item};
    const versions = [
        {savedAt: now, entries: item.entries},
        ...item.versions.slice(1),
    ].slice(0, DOCUMENT_SET_VERSION_MAX);
    const next = {...item, entries: target.entries, updatedAt: now, versions};
    const sets = state.slice();
    sets[index] = next;
    const bounded = normalizeDocumentSets({schemaVersion: DOCUMENT_SET_SCHEMA_VERSION, sets}, options.max);
    return {state: bounded, changed: true, item: bounded.sets[index] || next};
}

function removeDocumentSet(value, setId, options = {}) {
    const normalized = normalizeDocumentSets(value, options.max);
    const id = cleanText(setId, 96);
    const sets = normalized.sets.filter((item) => item.setId !== id);
    return {state: {schemaVersion: DOCUMENT_SET_SCHEMA_VERSION, sets}, changed: sets.length !== normalized.sets.length};
}

function mergeDocumentSets(value, incoming, options = {}) {
    let state = normalizeDocumentSets(value, options.max);
    const imported = normalizeDocumentSets(incoming, options.max).sets;
    const now = Number.isFinite(options.now) && options.now > 0 ? options.now : Date.now();
    imported.forEach((item) => {
        state = upsertDocumentSet(state, item, {max: options.max, now}).state;
    });
    return {state, imported: imported.length, changed: imported.length > 0};
}

function planDocumentSetRestore(value, openedRootIds, availableRootIds, max = DOCUMENT_SET_ENTRY_MAX) {
    const item = normalizeSet(value, 0);
    if (!item) return {set: null, opened: [], pending: [], missing: [], canRestore: false};
    const opened = openedRootIds instanceof Set ? openedRootIds : new Set(Array.isArray(openedRootIds) ? openedRootIds : []);
    const available = availableRootIds instanceof Set ? availableRootIds : null;
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : DOCUMENT_SET_ENTRY_MAX;
    const openedEntries = [];
    const pendingEntries = [];
    const missingEntries = [];
    item.entries.slice(0, limit)
        .map((entry, index) => ({entry, index}))
        .sort((left, right) => left.entry.index - right.entry.index || left.index - right.index)
        .forEach(({entry}) => {
        if (opened.has(entry.rootId)) openedEntries.push(entry);
        else if (available && !available.has(entry.rootId)) missingEntries.push(entry);
        else pendingEntries.push(entry);
        });
    return {set: item, opened: openedEntries, pending: pendingEntries, missing: missingEntries, canRestore: pendingEntries.length > 0};
}

/** Normalize restore execution counters into one stable UI/report contract. */
function summarizeDocumentSetRestore(plan, probe, execution = {}) {
    const safePlan = plan && typeof plan === "object" ? plan : {};
    const safeProbe = probe && typeof probe === "object" ? probe : {};
    const succeeded = Number.isFinite(execution.succeeded) ? Math.max(0, Math.floor(execution.succeeded)) : 0;
    const failed = Number.isFinite(execution.failed) ? Math.max(0, Math.floor(execution.failed)) : 0;
    const skipped = Array.isArray(safePlan.opened) ? safePlan.opened.length : 0;
    const missing = Array.isArray(safeProbe.missing) ? safeProbe.missing.length : (Array.isArray(safePlan.missing) ? safePlan.missing.length : 0);
    const unknown = Array.isArray(safeProbe.unknown) ? safeProbe.unknown.length : 0;
    const available = Array.isArray(safeProbe.available) ? safeProbe.available.length : 0;
    return {succeeded, failed, skipped, missing, unknown, available, cancelled: execution.cancelled === true, attempted: succeeded + failed};
}

/** Execute restore candidates sequentially with cancellation and failure isolation. */
async function runDocumentSetRestore(entries, openRoot, options = {}) {
    const source = Array.isArray(entries) ? entries.slice(0, DOCUMENT_SET_ENTRY_MAX) : [];
    const signal = options.signal;
    const results = [];
    for (const entry of source) {
        if (signal?.aborted || options.shouldContinue && options.shouldContinue() === false) break;
        try {
            const value = await openRoot(entry.rootId, entry);
            results.push({rootId: entry.rootId, ok: value !== false});
        } catch (error) {
            results.push({rootId: entry.rootId, ok: false, error: error instanceof Error ? error.message : String(error)});
        }
    }
    return {
        succeeded: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
        attempted: results.length,
        cancelled: Boolean(signal?.aborted) || options.shouldContinue && options.shouldContinue() === false,
        results,
    };
}

const DOCUMENT_SET_RESTORE_REPORT_VERSION = 1;
const DOCUMENT_SET_REPORT_ERROR_MAX = 160;

// 逐项状态的稳定枚举。UI 文案由 i18n 决定，这里只做可序列化的语义分类，
// 因此导出文件不依赖任何界面语言。
const DOCUMENT_SET_RESTORE_STATUS = Object.freeze({
    opened: "opened",       // 恢复前已打开，按计划跳过
    restored: "restored",   // 本次成功打开
    failed: "failed",       // 尝试过但失败
    missing: "missing",     // 预检明确不存在
    pending: "pending",     // 未尝试（取消、中断或不在候选集内）
});

function collectRootIds(value) {
    const ids = new Set();
    (Array.isArray(value) ? value : []).forEach((item) => {
        const rootId = item && typeof item === "object" ? normalizeRootId(item.rootId) : "";
        if (rootId) ids.add(rootId);
    });
    return ids;
}

/**
 * 构建一次恢复的结构化报告（纯函数，不触碰 DOM 与存储）。
 *
 * 为什么需要它：恢复结果目前只经过 `showMessage` 一闪即逝，用户既无法复核
 * "哪几篇失败了、失败原因是什么"，也无法把现场留给后续排查。本函数产出可
 * 直接序列化导出的有界快照；逐项明细沿用 `planDocumentSetRestore` 的排序
 * （按持久化 index，再按数组位置），因此报告读起来与真实尝试顺序一致，
 * 且同一份计划无论是否被取消，条目集合与顺序都稳定。
 *
 * 与 storage-migration 的恢复报告刻意不同：那份是 Agent 只读投影，必须确定、
 * 因此不含时间戳；本报告是用户主动导出的本地文件，时间戳正是其价值所在。
 * `now` 仍由调用方注入，便于测试构造确定性快照。
 */
function buildDocumentSetRestoreReport(plan, probe, execution = {}, options = {}) {
    const safePlan = plan && typeof plan === "object" ? plan : {};
    const set = safePlan.set && typeof safePlan.set === "object" ? safePlan.set : null;
    const safeExecution = execution && typeof execution === "object" ? execution : {};
    const now = Number.isFinite(options.now) && options.now > 0 ? Math.floor(options.now) : Date.now();
    const openedIds = collectRootIds(safePlan.opened);
    const missingIds = collectRootIds(probe && typeof probe === "object" ? probe.missing : null);
    // 同一 rootId 只认首条结果：执行器可能因重试产出重复项，报告不应因此膨胀或自相矛盾
    const resultByRootId = new Map();
    (Array.isArray(safeExecution.results) ? safeExecution.results : []).forEach((item) => {
        if (!item || typeof item !== "object") return;
        const rootId = normalizeRootId(item.rootId);
        if (rootId && !resultByRootId.has(rootId)) resultByRootId.set(rootId, item);
    });
    const entries = (set && Array.isArray(set.entries) ? set.entries : [])
        .slice(0, DOCUMENT_SET_ENTRY_MAX)
        .map((entry, position) => ({entry, position}))
        .sort((left, right) => left.entry.index - right.entry.index || left.position - right.position)
        .map(({entry}) => {
            const result = resultByRootId.get(entry.rootId);
            let status = DOCUMENT_SET_RESTORE_STATUS.pending;
            if (openedIds.has(entry.rootId)) status = DOCUMENT_SET_RESTORE_STATUS.opened;
            else if (result) status = result.ok ? DOCUMENT_SET_RESTORE_STATUS.restored : DOCUMENT_SET_RESTORE_STATUS.failed;
            else if (missingIds.has(entry.rootId)) status = DOCUMENT_SET_RESTORE_STATUS.missing;
            const record = {rootId: entry.rootId, title: entry.title, status};
            if (status === DOCUMENT_SET_RESTORE_STATUS.failed) {
                // 异常文本可能很长且带控制字符，导出前统一裁剪清洗
                record.error = typeof result.error === "string" ? cleanText(result.error, DOCUMENT_SET_REPORT_ERROR_MAX) : "";
            }
            return record;
        });
    return {
        schemaVersion: DOCUMENT_SET_RESTORE_REPORT_VERSION,
        generatedAt: now,
        setId: set ? set.setId : "",
        setName: set ? set.name : "",
        counts: summarizeDocumentSetRestore(safePlan, probe, safeExecution),
        entries,
    };
}

// T-6800 工作区切换：循环切换目标选取。仅有一个集合或空列表时返回 null
// （无意义切换）；当前集不在列表中时回到第一个，形成稳定环绕。
function pickNextDocumentSet(sets, currentSetId) {
    const list = (Array.isArray(sets) ? sets : []).filter((item) => item && typeof item.setId === "string" && item.setId);
    if (list.length < 2) return null;
    const index = list.findIndex((item) => item.setId === currentSetId);
    return list[(index + 1 + list.length) % list.length] || list[0];
}

module.exports = {
    DOCUMENT_SET_SCHEMA_VERSION,
    DOCUMENT_SET_MAX,
    DOCUMENT_SET_ENTRY_MAX,
    DOCUMENT_SET_VERSION_MAX,
    DOCUMENT_SET_RESTORE_REPORT_VERSION,
    DOCUMENT_SET_RESTORE_STATUS,
    normalizeDocumentSets,
    createDocumentSet,
    upsertDocumentSet,
    removeDocumentSet,
    rollbackDocumentSet,
    mergeDocumentSets,
    planDocumentSetRestore,
    summarizeDocumentSetRestore,
    runDocumentSetRestore,
    buildDocumentSetRestoreReport,
    pickNextDocumentSet,
};
