"use strict";

const HOME_SCHEMA_VERSION = 1;
const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const DEFAULT_LAYOUT = Object.freeze({x: 0, y: 0, w: 1, h: 1, collapsed: false});

const DEFAULT_MODULES = Object.freeze([
    {moduleId: "recent-documents", title: "近期文档", icon: "iconHistory", category: "siyuan", supportedDevices: DEVICES, readOnly: true},
    {moduleId: "today-journal", title: "今日日记", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true},
    {moduleId: "today-tasks", title: "今日待办", icon: "iconCheck", category: "siyuan", supportedDevices: DEVICES, readOnly: true},
    {moduleId: "fixed-document", title: "指定文档", icon: "iconFile", category: "siyuan", supportedDevices: DEVICES, readOnly: true},
    {moduleId: "checkin-summary", title: "打卡摘要", icon: "iconCalendar", category: "plugin", supportedDevices: DEVICES, readOnly: true},
]);

function text(value, max = 128) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
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
    return {x: number("x", 0, 99), y: number("y", 0, 999), w: Math.max(1, number("w", 1, 12)), h: Math.max(1, number("h", 1, 12)), collapsed: source.collapsed === true};
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
    return {moduleId, title, icon: text(value.icon, 64) || "iconFile", category: text(value.category, 32) || "custom", supportedDevices, readOnly: value.readOnly !== false};
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
    return (Array.isArray(value) ? value : []).reduce((items, item) => {
        if (!item || typeof item !== "object") return items;
        const moduleId = text(item.moduleId, 64);
        if (!known.has(moduleId) || seen.has(moduleId)) return items;
        seen.add(moduleId);
        items.push({instanceId: text(item.instanceId, 64) || moduleId, moduleId, enabled: item.enabled !== false, config: item.config && typeof item.config === "object" ? item.config : {}});
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
    return {schemaVersion: HOME_SCHEMA_VERSION, instances, layouts};
}

function migrateHomeState(value) {
    const source = value && typeof value === "object" ? value : {};
    return normalizeHomeState({
        instances: source.instances || source.widgets || [],
        layouts: source.layouts || {desktop: source.layout || []},
    });
}

module.exports = {HOME_SCHEMA_VERSION, DEVICES, DEFAULT_LAYOUT, DEFAULT_MODULES, normalizeModuleDefinition, registerModules, modulesForDevice, normalizeInstances, normalizeLayout, normalizeHomeState, migrateHomeState};
