"use strict";

// T-6972：片段分组只保存插件侧元数据。原生片段仍由思源维护，分组数据只
// 记录稳定 id、折叠状态、视图偏好和片段归属，不复制正文、不改原生开关。
const SNIPPET_GROUPS_SCHEMA_VERSION = 1;
const SNIPPET_GROUPS_MAX = 64;
const SNIPPET_GROUP_ASSIGNMENTS_MAX = 256;
const SNIPPET_GROUP_NAME_MAX = 64;
const SNIPPET_GROUP_ID_MAX = 64;
const SNIPPET_GROUP_VIEW_MODES = Object.freeze(["tree", "flat"]);
const GROUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function emptySnippetGroupStore() {
    return Object.freeze({
        version: SNIPPET_GROUPS_SCHEMA_VERSION,
        groups: Object.freeze([]),
        assignments: Object.freeze([]),
        view: "tree",
        showUngrouped: true,
    });
}

function normalizeSnippetGroupStore(value) {
    if (!isRecord(value) || value.version !== SNIPPET_GROUPS_SCHEMA_VERSION) return emptySnippetGroupStore();
    const groups = [];
    const groupIds = new Set();
    const groupNames = new Set();
    for (const raw of Array.isArray(value.groups) ? value.groups : []) {
        if (!isRecord(raw)) continue;
        const id = cleanText(raw.id, SNIPPET_GROUP_ID_MAX);
        const name = cleanText(raw.name, SNIPPET_GROUP_NAME_MAX);
        const nameKey = name.toLocaleLowerCase();
        if (!GROUP_ID_RE.test(id) || !name || groupIds.has(id) || groupNames.has(nameKey)) continue;
        groupIds.add(id);
        groupNames.add(nameKey);
        groups.push({id, name, collapsed: raw.collapsed === true});
        if (groups.length >= SNIPPET_GROUPS_MAX) break;
    }
    const assignments = [];
    const assigned = new Set();
    for (const raw of Array.isArray(value.assignments) ? value.assignments : []) {
        if (!isRecord(raw)) continue;
        const snippetId = cleanText(raw.snippetId, SNIPPET_GROUP_ID_MAX * 2);
        const groupId = cleanText(raw.groupId, SNIPPET_GROUP_ID_MAX);
        if (!snippetId || !GROUP_ID_RE.test(groupId) || !groupIds.has(groupId) || assigned.has(snippetId)) continue;
        assigned.add(snippetId);
        assignments.push({snippetId, groupId});
        if (assignments.length >= SNIPPET_GROUP_ASSIGNMENTS_MAX) break;
    }
    return Object.freeze({
        version: SNIPPET_GROUPS_SCHEMA_VERSION,
        groups: Object.freeze(groups.map((group) => Object.freeze(group))),
        assignments: Object.freeze(assignments.map((assignment) => Object.freeze(assignment))),
        view: SNIPPET_GROUP_VIEW_MODES.includes(value.view) ? value.view : "tree",
        showUngrouped: value.showUngrouped !== false,
        ...(value.metadata?.version === 1 && Array.isArray(value.metadata.entries) ? {
            metadata: Object.freeze({version: 1, entries: Object.freeze(normalizeSnippetMetadata(value.metadata.entries))}),
        } : {}),
    });
}

function normalizeSnippetMetadata(entries) {
    const seen = new Set();
    const result = [];
    for (const raw of entries) {
        if (!isRecord(raw)) continue;
        const snippetId = cleanText(raw.snippetId, 128);
        if (!snippetId || seen.has(snippetId)) continue;
        seen.add(snippetId);
        const tags = [...new Set((Array.isArray(raw.tags) ? raw.tags.slice(0, 32) : []).map((tag) => cleanText(tag, 32)).filter(Boolean))].slice(0, 8);
        result.push(Object.freeze({snippetId, alias: cleanText(raw.alias, 64), summary: cleanText(raw.summary, 256),
            tags: Object.freeze(tags), pinned: raw.pinned === true,
            modifiedAt: Number.isSafeInteger(raw.modifiedAt) && raw.modifiedAt > 0 && raw.modifiedAt <= 8640000000000000 ? raw.modifiedAt : 0}));
        if (result.length >= SNIPPET_GROUP_ASSIGNMENTS_MAX) break;
    }
    return result;
}

function setSnippetMetadata(store, snippetId, value) {
    const current = normalizeSnippetGroupStore(store);
    const entry = normalizeSnippetMetadata([{...value, snippetId}])[0];
    if (!entry) return current;
    const entries = (current.metadata?.entries || []).filter((item) => item.snippetId !== entry.snippetId);
    entries.unshift(entry);
    return normalizeSnippetGroupStore({...current, metadata: {version: 1, entries}});
}

function snippetMetadataSignature(value) {
    const entry = normalizeSnippetMetadata([{...value, snippetId: "draft"}])[0];
    return JSON.stringify([entry.alias, entry.summary, entry.tags, entry.pinned]);
}

function projectSnippetMetadata(store, snippets) {
    const entries = new Map((normalizeSnippetGroupStore(store).metadata?.entries || []).map((entry) => [entry.snippetId, entry]));
    return snippets.map((snippet) => ({...snippet, ...entries.get(snippet.id)}));
}

function createSnippetGroupId(now = Date.now(), suffix = 0) {
    const stamp = Number.isFinite(Number(now)) && Number(now) > 0 ? Math.floor(Number(now)).toString(36) : "group";
    const tail = Math.max(0, Math.trunc(Number(suffix) || 0)).toString(36);
    return `g-${stamp}-${tail}`.slice(0, SNIPPET_GROUP_ID_MAX);
}

function updateStore(store, updater) {
    const current = normalizeSnippetGroupStore(store);
    const next = updater(current);
    return normalizeSnippetGroupStore(next);
}

function addSnippetGroup(store, name, options = {}) {
    const current = normalizeSnippetGroupStore(store);
    const cleanName = cleanText(name, SNIPPET_GROUP_NAME_MAX);
    if (!cleanName || current.groups.length >= SNIPPET_GROUPS_MAX) return {store: current, changed: false};
    if (current.groups.some((group) => group.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return {store: current, changed: false};
    let id = cleanText(options.id, SNIPPET_GROUP_ID_MAX) || createSnippetGroupId(options.now, options.suffix);
    if (!GROUP_ID_RE.test(id) || current.groups.some((group) => group.id === id)) return {store: current, changed: false};
    return {
        store: normalizeSnippetGroupStore({...current, groups: [...current.groups, {id, name: cleanName, collapsed: false}]}),
        changed: true,
    };
}

function renameSnippetGroup(store, groupId, name) {
    const current = normalizeSnippetGroupStore(store);
    const id = cleanText(groupId, SNIPPET_GROUP_ID_MAX);
    const cleanName = cleanText(name, SNIPPET_GROUP_NAME_MAX);
    if (!cleanName || current.groups.some((group) => group.id !== id && group.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return {store: current, changed: false};
    let changed = false;
    const groups = current.groups.map((group) => {
        if (group.id !== id || group.name === cleanName) return group;
        changed = true;
        return {...group, name: cleanName};
    });
    return {store: changed ? normalizeSnippetGroupStore({...current, groups}) : current, changed};
}

function setSnippetGroupCollapsed(store, groupId, collapsed) {
    const current = normalizeSnippetGroupStore(store);
    let changed = false;
    const groups = current.groups.map((group) => {
        if (group.id !== groupId || group.collapsed === collapsed) return group;
        changed = true;
        return {...group, collapsed: collapsed === true};
    });
    return {store: changed ? normalizeSnippetGroupStore({...current, groups}) : current, changed};
}

function removeSnippetGroup(store, groupId) {
    const current = normalizeSnippetGroupStore(store);
    const groups = current.groups.filter((group) => group.id !== groupId);
    if (groups.length === current.groups.length) return {store: current, changed: false};
    return {
        store: normalizeSnippetGroupStore({
            ...current,
            groups,
            assignments: current.assignments.filter((assignment) => assignment.groupId !== groupId),
        }),
        changed: true,
    };
}

function moveSnippetToGroup(store, snippetId, groupId = null) {
    const current = normalizeSnippetGroupStore(store);
    const cleanSnippetId = cleanText(snippetId, SNIPPET_GROUP_ID_MAX * 2);
    const cleanGroupId = groupId === null ? null : cleanText(groupId, SNIPPET_GROUP_ID_MAX);
    if (!cleanSnippetId || (cleanGroupId !== null && !current.groups.some((group) => group.id === cleanGroupId))) return {store: current, changed: false};
    const assignments = current.assignments.filter((assignment) => assignment.snippetId !== cleanSnippetId);
    if (cleanGroupId) assignments.push({snippetId: cleanSnippetId, groupId: cleanGroupId});
    const changed = JSON.stringify(assignments) !== JSON.stringify(current.assignments);
    return {store: changed ? normalizeSnippetGroupStore({...current, assignments}) : current, changed};
}

function setSnippetGroupView(store, view) {
    const current = normalizeSnippetGroupStore(store);
    const nextView = SNIPPET_GROUP_VIEW_MODES.includes(view) ? view : "tree";
    if (current.view === nextView) return {store: current, changed: false};
    return {store: normalizeSnippetGroupStore({...current, view: nextView}), changed: true};
}

function setSnippetGroupShowUngrouped(store, visible) {
    const current = normalizeSnippetGroupStore(store);
    const next = visible !== false;
    if (current.showUngrouped === next) return {store: current, changed: false};
    return {store: normalizeSnippetGroupStore({...current, showUngrouped: next}), changed: true};
}

function reconcileSnippetGroups(store, snippets) {
    const current = normalizeSnippetGroupStore(store);
    const native = Array.isArray(snippets) ? snippets.filter((snippet) => isRecord(snippet) && typeof snippet.id === "string") : [];
    const nativeIds = new Set(native.map((snippet) => snippet.id));
    const validAssignments = current.assignments.filter((assignment) => nativeIds.has(assignment.snippetId));
    const orphaned = current.assignments.filter((assignment) => !nativeIds.has(assignment.snippetId)).map((assignment) => assignment.snippetId);
    const metadata = current.metadata?.entries || [];
    const validMetadata = metadata.filter((entry) => nativeIds.has(entry.snippetId));
    orphaned.push(...metadata.filter((entry) => !nativeIds.has(entry.snippetId)).map((entry) => entry.snippetId));
    const next = validAssignments.length === current.assignments.length && validMetadata.length === metadata.length
        ? current
        : normalizeSnippetGroupStore({...current, assignments: validAssignments,
            ...(current.metadata ? {metadata: {version: 1, entries: validMetadata}} : {})});
    const assignmentBySnippet = new Map(next.assignments.map((assignment) => [assignment.snippetId, assignment.groupId]));
    const groups = next.groups.map((group) => ({
        ...group,
        items: native.filter((snippet) => assignmentBySnippet.get(snippet.id) === group.id),
    }));
    const ungrouped = native.filter((snippet) => !assignmentBySnippet.has(snippet.id));
    return {store: next, groups, ungrouped, orphaned: [...new Set(orphaned)].slice(0, SNIPPET_GROUP_ASSIGNMENTS_MAX), changed: next !== current};
}

module.exports = {
    SNIPPET_GROUPS_SCHEMA_VERSION,
    SNIPPET_GROUPS_MAX,
    SNIPPET_GROUP_ASSIGNMENTS_MAX,
    SNIPPET_GROUP_NAME_MAX,
    SNIPPET_GROUP_ID_MAX,
    SNIPPET_GROUP_VIEW_MODES,
    emptySnippetGroupStore,
    normalizeSnippetGroupStore,
    createSnippetGroupId,
    addSnippetGroup,
    renameSnippetGroup,
    setSnippetGroupCollapsed,
    removeSnippetGroup,
    moveSnippetToGroup,
    setSnippetGroupView,
    setSnippetGroupShowUngrouped,
    reconcileSnippetGroups,
    setSnippetMetadata,
    snippetMetadataSignature,
    projectSnippetMetadata,
};
