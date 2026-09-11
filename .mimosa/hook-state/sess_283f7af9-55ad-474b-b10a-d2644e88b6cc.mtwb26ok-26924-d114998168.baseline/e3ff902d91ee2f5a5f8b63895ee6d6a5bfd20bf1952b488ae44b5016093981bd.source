"use strict";

// 文档集只保存可稳定恢复的根文档信息；布局字段保持最小且可迁移。
const DOCUMENT_SET_SCHEMA_VERSION = 1;
const DOCUMENT_SET_MAX = 24;
const DOCUMENT_SET_ENTRY_MAX = 40;
const DOCUMENT_SET_NAME_MAX = 80;
const DOCUMENT_SET_TITLE_MAX = 200;
const DOCUMENT_SET_GROUP_MAX = 64;

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
    return {setId, name, entries, createdAt, updatedAt};
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
    const next = {...normalized, createdAt: existingIndex >= 0 ? state[existingIndex].createdAt : (normalized.createdAt || now), updatedAt: now};
    const sets = state.slice();
    if (existingIndex >= 0) sets[existingIndex] = next;
    else sets.unshift(next);
    const bounded = normalizeDocumentSets({schemaVersion: DOCUMENT_SET_SCHEMA_VERSION, sets}, options.max);
    return {state: bounded, changed: true, item: next};
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

module.exports = {
    DOCUMENT_SET_SCHEMA_VERSION,
    DOCUMENT_SET_MAX,
    DOCUMENT_SET_ENTRY_MAX,
    normalizeDocumentSets,
    createDocumentSet,
    upsertDocumentSet,
    removeDocumentSet,
    mergeDocumentSets,
    planDocumentSetRestore,
    summarizeDocumentSetRestore,
    runDocumentSetRestore,
};
