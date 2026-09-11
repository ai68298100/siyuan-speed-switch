"use strict";

const {DEVICES, registerModules, modulesForDevice, normalizeModuleDefinition} = require("./home-model.js");
const {registerHomeAdapters, unregisterHomeAdapter, readHomeModule, clearHomeSnapshotCache, getHomeAdapterDiagnostics} = require("./home-adapters.js");

function createHomeRuntime(definitions = []) {
    const baseDefinitions = registerModules(definitions);
    let moduleDefinitions = baseDefinitions;
    let adapters = new Map();
    const registrations = new Map();
    function rebuildDefinitions() {
        moduleDefinitions = registerModules([
            ...baseDefinitions,
            ...[...registrations.values()].map((registration) => registration.definition),
        ]);
    }
    function registerAdapter(raw) {
        const candidate = registerHomeAdapters([raw]).get(String(raw?.moduleId || ""));
        if (!candidate) return {registered: false, reason: "invalid", unregister: () => undefined};
        const moduleId = candidate.moduleId;
        const previous = registrations.get(moduleId);
        if (previous) previous.unregister();
        const token = Symbol(moduleId);
        // The public home-module boundary is intentionally read-only. Ignore
        // caller metadata that attempts to advertise a writable module.
        // Keep the public metadata in the normalized definition so the store,
        // Agent discovery and host integrations see the same bounded contract.
        // The adapter's executable read function is kept separately and never
        // becomes part of persisted or Agent-facing metadata.
        // When the adapter omits `sizes`, inherit the builtin default so the
        // registration override does not collapse the size menu to "medium".
        const inherited = Array.isArray(raw?.sizes) && raw.sizes.length > 0 ? {} : (() => {
            const base = moduleDefinitions.find((item) => item && item.moduleId === moduleId);
            return base && Array.isArray(base.sizes) && base.sizes.length > 0 ? {sizes: base.sizes} : {};
        })();
        const definition = normalizeModuleDefinition({
            ...raw,
            ...inherited,
            moduleId,
            title: raw?.title || moduleId,
            supportedDevices: raw?.supportedDevices || candidate.supportedDevices,
            readOnly: true,
        });
        if (!definition) return {registered: false, reason: "invalid", unregister: () => undefined};
        adapters.set(moduleId, candidate);
        const unregister = () => {
            if (registrations.get(moduleId)?.token !== token) return false;
            registrations.delete(moduleId);
            unregisterHomeAdapter(adapters, moduleId);
            rebuildDefinitions();
            return true;
        };
        registrations.set(moduleId, {token, unregister, definition});
        rebuildDefinitions();
        return {registered: true, moduleId, unregister};
    }
    function unregister(moduleId) {
        const registration = registrations.get(String(moduleId || ""));
        return registration ? registration.unregister() : false;
    }
    function listModules(device = "desktop") {
        return modulesForDevice(moduleDefinitions, DEVICES.includes(device) ? device : "desktop");
    }
    async function read(moduleId, device = "desktop", config = {}, options = {}) {
        return readHomeModule(adapters, moduleId, DEVICES.includes(device) ? device : "desktop", config, options);
    }
    function dispose() {
        [...registrations.values()].forEach((registration) => registration.unregister());
        registrations.clear();
        adapters = new Map();
        clearHomeSnapshotCache();
    }
    return {registerAdapter, unregister, listModules, read, diagnostics: getHomeAdapterDiagnostics, dispose};
}

module.exports = {createHomeRuntime};
