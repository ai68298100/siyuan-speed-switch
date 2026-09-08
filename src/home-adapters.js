"use strict";

const {DEVICES, getModuleDefinition, normalizeConfig} = (() => {
    const model = require("./home-model.js");
    // normalizeConfig is intentionally kept private in the model; adapters
    // receive already bounded config and only expose bounded snapshots.
    return {...model, normalizeConfig: (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        const result = {};
        Object.keys(value).slice(0, 32).forEach((key) => {
            if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key)) return;
            const item = value[key];
            if (typeof item === "string") result[key] = item.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 512);
            else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
            else if (typeof item === "boolean") result[key] = item;
        });
        return result;
    }};
})();

const MAX_SNAPSHOT_ITEMS = 24;
const MAX_TEXT = 256;

function safeText(value, max = MAX_TEXT) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function normalizeAdapter(adapter) {
    if (!adapter || typeof adapter !== "object") return null;
    const moduleId = safeText(adapter.moduleId, 64);
    if (!moduleId || typeof adapter.read !== "function") return null;
    const supportedDevices = Array.isArray(adapter.supportedDevices)
        ? DEVICES.filter((device) => adapter.supportedDevices.includes(device)) : [];
    if (!supportedDevices.length) return null;
    return {moduleId, supportedDevices, read: adapter.read};
}

function registerHomeAdapters(adapters = []) {
    const result = new Map();
    (Array.isArray(adapters) ? adapters : []).forEach((raw) => {
        const adapter = normalizeAdapter(raw);
        if (adapter) result.set(adapter.moduleId, adapter);
    });
    return result;
}

function canReadAdapter(adapter, device) {
    return !!adapter && DEVICES.includes(device) && adapter.supportedDevices.includes(device);
}

function normalizeSnapshot(value) {
    if (!value || typeof value !== "object") return {title: "", items: [], updatedAt: 0};
    const rawItems = Array.isArray(value.items) ? value.items : [];
    const items = rawItems.slice(0, MAX_SNAPSHOT_ITEMS).map((item) => {
        if (!item || typeof item !== "object") return null;
        return {label: safeText(item.label), value: safeText(item.value), href: safeText(item.href, 512)};
    }).filter(Boolean);
    return {title: safeText(value.title, 64), items, updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0};
}

async function readHomeModule(adapters, moduleId, device, config = {}) {
    const map = adapters instanceof Map ? adapters : registerHomeAdapters(adapters);
    const adapter = map.get(safeText(moduleId, 64));
    if (!canReadAdapter(adapter, device)) return {ok: false, reason: "unsupported", snapshot: normalizeSnapshot(null)};
    try {
        const value = await Promise.resolve(adapter.read(normalizeConfig(config), device));
        return {ok: true, snapshot: normalizeSnapshot(value)};
    } catch (error) {
        return {ok: false, reason: "failed", snapshot: normalizeSnapshot(null)};
    }
}

module.exports = {MAX_SNAPSHOT_ITEMS, registerHomeAdapters, canReadAdapter, normalizeSnapshot, readHomeModule};
