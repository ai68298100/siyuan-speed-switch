"use strict";

const HOME_SCHEMA_VERSION = 1;
const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const DEFAULT_LAYOUT = Object.freeze({x: 0, y: 0, w: 1, h: 1, collapsed: false});

const DEFAULT_MODULES = Object.freeze([
    {moduleId: "recent-documents", title: "近期文档", icon: "iconHistory", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide", "large", "full"]},
    {moduleId: "today-journal", title: "今日日记", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small"]},
    {moduleId: "today-tasks", title: "今日待办", icon: "iconCheck", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "tall", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
        {key: "allDocuments", label: "扫描全部文档", type: "select", options: ["否", "是"], defaults: "否"},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
        {key: "showCompleted", label: "显示已完成", type: "select", options: ["否", "是"], defaults: "否"},
        {key: "days", label: "时间范围（天）", type: "number", min: 7, max: 365, defaults: 30},
    ]},
    {moduleId: "fixed-document", title: "指定文档", icon: "iconFile", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"], protocolVersion: 2, configSchema: [
        {key: "docId", label: "文档 ID", type: "text", defaults: ""},
        {key: "title", label: "显示名称", type: "text", defaults: ""},
    ]},
    {moduleId: "favorites", title: "收藏", icon: "iconStar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide", "large", "full"]},
    {moduleId: "document-sets", title: "文档集", icon: "iconLayout", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "tall", "large"]},
    {moduleId: "tags", title: "标签", icon: "iconTags", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"]},
    {moduleId: "bookmarks", title: "书签", icon: "iconBookmark", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium"]},
    {moduleId: "journal-monthly", title: "本月日记", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"]},
    {moduleId: "note-stats", title: "笔记统计", icon: "iconChart", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium"], protocolVersion: 2, configSchema: []},
    {moduleId: "year-progress", title: "年度进度", icon: "iconRefresh", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small"]},
    {moduleId: "recent-edits", title: "近期编辑", icon: "iconEdit", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"]},
    {moduleId: "flashcard-due", title: "闪卡待复习", icon: "iconRiff", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"], protocolVersion: 2, configSchema: [
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
        {moduleId: "plugin-commands", title: "插件命令", icon: "iconPlugin", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
        {key: "filter", label: "关键词过滤", type: "text", defaults: ""},
    ]},
    {moduleId: "checkin-summary", title: "打卡摘要", icon: "iconCalendar", category: "plugin", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"]},
]);

function text(value, max = 128) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function normalizeConfig(value, depth = 0) {
    if (depth > 3 || !value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    Object.keys(value).slice(0, 32).forEach((key) => {
        if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key)) return;
        const item = value[key];
        if (typeof item === "string") result[key] = item.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 512);
        else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
        else if (typeof item === "boolean") result[key] = item;
        else if (item && typeof item === "object" && !Array.isArray(item)) result[key] = normalizeConfig(item, depth + 1);
    });
    return result;
}

function normalizeDevice(value) {
    return DEVICES.includes(value) ? value : "desktop";
}

function normalizeLayout(value) {
    const source = value && typeof value === "object" ? value : {};
    const number = (key, fallback, max) => {
        const n = Number(source[key]);
        return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : fallback;
    };
    const size = ["small", "medium", "wide", "large"].includes(source.size) ? source.size : "";
    return {x: number("x", 0, 99), y: number("y", 0, 999), w: Math.max(1, number("w", 1, 12)), h: Math.max(1, number("h", 1, 12)), collapsed: source.collapsed === true, size};
}


// 协议 v2 字段归一化
const PROTOCOL_VERSIONS = [1, 2];
const REFRESH_EVENTS = ["switch-protyle", "loaded-protyle", "destroy-protyle"];
const CONFIG_FIELD_TYPES = ["text", "number", "select", "notebook"];

function normalizeProtocolVersion(value) {
    return PROTOCOL_VERSIONS.includes(value) ? value : 1;
}

function normalizeClickCommand(value) {
    const raw = text(value, 128);
    return /^[A-Za-z0-9_-]{1,64}::[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : "";
}

function normalizeHomepage(value) {
    const raw = text(value, 256);
    if (!raw) return "";
    try {
        const url = new URL(raw);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
        return "";
    }
}

function normalizeRefreshOn(value) {
    return Array.isArray(value)
        ? REFRESH_EVENTS.filter((event) => value.includes(event)).slice(0, 3)
        : [];
}

function normalizeConfigSchema(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 8).reduce((fields, raw) => {
        if (!raw || typeof raw !== "object") return fields;
        const key = typeof raw.key === "string" ? raw.key.replace(/[^A-Za-z0-9_-]/g, "") : "";
        const label = text(raw.label, 32);
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key) || !label) return fields;
        const type = CONFIG_FIELD_TYPES.includes(raw.type) ? raw.type : "text";
        const field = {key, label, type};
        if (type === "number") {
            const rawMin = Number.isFinite(raw.min) ? Math.trunc(raw.min) : 0;
            const rawMax = Number.isFinite(raw.max) ? Math.trunc(raw.max) : 100;
            field.min = Math.min(rawMin, rawMax);
            field.max = Math.max(rawMin, rawMax);
            if (Number.isFinite(raw.defaults)) field.defaults = Math.max(field.min, Math.min(field.max, Math.trunc(raw.defaults)));
        } else if (type === "select") {
            const options = (Array.isArray(raw.options) ? raw.options : []).slice(0, 12)
                .map((option) => text(typeof option === "object" ? option?.label : option, 32)).filter(Boolean);
            field.options = [...new Set(options)].slice(0, 12);
            if (field.options.length === 0) return fields;
            const selected = text(raw.defaults, 32);
            field.defaults = field.options.includes(selected) ? selected : field.options[0];
        } else if (type === "notebook") {
            // 选项由宿主渲染时用思源笔记本列表动态填充
        } else {
            field.defaults = text(raw.defaults, 128);
        }
        fields.push(field);
        return fields;
    }, []);
}

function normalizeModuleDefinition(value) {
    if (!value || typeof value !== "object") return null;
    const moduleId = text(value.moduleId, 64).replace(/[^A-Za-z0-9._:-]/g, "");
    const title = text(value.title, 64);
    if (!moduleId || !title) return null;
    const supportedDevices = Array.isArray(value.supportedDevices)
        ? DEVICES.filter((device) => value.supportedDevices.includes(device))
        : ["desktop"];
    if (supportedDevices.length === 0) return null;
    const sizeKeys = ["xs", "small", "medium", "tall", "wide", "large", "full"];
    const sizes = Array.isArray(value.sizes) ? sizeKeys.filter((key) => value.sizes.includes(key)) : [];
    return {
        moduleId, title,
        icon: text(value.icon, 64) || "iconFile",
        category: text(value.category, 32) || "custom",
        supportedDevices,
        readOnly: value.readOnly !== false,
        sizes: sizes.length > 0 ? sizes : ["medium"],
        description: text(value.description, 96),
        protocolVersion: normalizeProtocolVersion(value.protocolVersion),
        author: text(value.author, 64),
        homepage: normalizeHomepage(value.homepage),
        clickCommand: normalizeClickCommand(value.clickCommand),
        configSchema: normalizeConfigSchema(value.configSchema),
        refreshOn: normalizeRefreshOn(value.refreshOn),
    };
}

function registerModules(definitions = []) {
    const map = new Map();
    [...DEFAULT_MODULES, ...(Array.isArray(definitions) ? definitions : [])].forEach((item) => {
        const normalized = normalizeModuleDefinition(item);
        if (normalized) map.set(normalized.moduleId, normalized);
    });
    return [...map.values()];
}

function modulesForDevice(definitions, device) {
    const target = normalizeDevice(device);
    return registerModules(definitions).filter((module) => module.supportedDevices.includes(target));
}

function normalizeInstances(value, definitions = DEFAULT_MODULES) {
    const known = new Map(registerModules(definitions).map((item) => [item.moduleId, item]));
    const seen = new Set();
    const seenInstanceIds = new Set();
    return (Array.isArray(value) ? value : []).reduce((items, item) => {
        if (!item || typeof item !== "object") return items;
        const moduleId = text(item.moduleId, 64);
        if (!known.has(moduleId) || seen.has(moduleId)) return items;
        const instanceId = text(item.instanceId, 64) || moduleId;
        if (seenInstanceIds.has(instanceId)) return items;
        seen.add(moduleId);
        seenInstanceIds.add(instanceId);
        items.push({instanceId, moduleId, enabled: item.enabled !== false, config: normalizeConfig(item.config)});
        return items;
    }, []);
}

function normalizeHomeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const instances = normalizeInstances(source.instances);
    const layouts = {};
    DEVICES.forEach((device) => {
        const entries = source.layouts?.[device];
        layouts[device] = Array.isArray(entries) ? entries.slice(0, 64).map((entry) => ({instanceId: text(entry?.instanceId, 64), ...normalizeLayout(entry)})).filter((entry) => entry.instanceId) : [];
    });
    const activeIds = new Set(instances.map((item) => item.instanceId));
    DEVICES.forEach((device) => {
        const occupied = new Set();
        layouts[device] = layouts[device].filter((entry) => {
            if (!activeIds.has(entry.instanceId) || occupied.has(entry.instanceId)) return false;
            occupied.add(entry.instanceId);
            return true;
        });
    });
    return {schemaVersion: HOME_SCHEMA_VERSION, instances, layouts};
}

function migrateHomeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const migrated = normalizeHomeState({
        instances: source.instances || source.widgets || [],
        layouts: source.layouts || {desktop: source.layout || []},
    });
    return migrated;
}

function resolveLayoutConflicts(layouts, instances = []) {
    const allowed = new Set((Array.isArray(instances) ? instances : []).map((item) => text(item?.instanceId, 64)).filter(Boolean));
    const result = {};
    DEVICES.forEach((device) => {
        const occupied = new Set();
        result[device] = (Array.isArray(layouts?.[device]) ? layouts[device] : []).map((entry) => ({
            instanceId: text(entry?.instanceId, 64), ...normalizeLayout(entry),
        })).filter((entry) => {
            if (!allowed.has(entry.instanceId) || occupied.has(entry.instanceId)) return false;
            occupied.add(entry.instanceId);
            return true;
        });
    });
    return result;
}

function getModuleDefinition(definitions, moduleId) {
    return registerModules(definitions).find((item) => item.moduleId === text(moduleId, 64)) || null;
}

module.exports = {HOME_SCHEMA_VERSION, DEVICES, DEFAULT_LAYOUT, DEFAULT_MODULES, normalizeProtocolVersion, normalizeClickCommand, normalizeHomepage, normalizeRefreshOn, normalizeConfigSchema, normalizeModuleDefinition, registerModules, modulesForDevice, getModuleDefinition, normalizeInstances, normalizeLayout, normalizeHomeState, migrateHomeState, resolveLayoutConflicts};
