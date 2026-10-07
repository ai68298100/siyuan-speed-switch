"use strict";

const {DEVICES, registerModules, modulesForDevice, normalizeModuleDefinition} = require("./home-model.js");
const {registerHomeAdapters, unregisterHomeAdapter, readHomeModule, getHomeAdapterDiagnostics, getHomeAdapterResourceStats} = require("./home-adapters.js");

function createHomeRuntime(definitions = []) {
    const baseDefinitions = registerModules(definitions);
    let moduleDefinitions = baseDefinitions;
    let adapters = new Map();
    const registrations = new Map();
    const builtinRegistrations = new Map();
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
        const isBuiltin = raw?.builtin === true;
        const previous = registrations.get(moduleId);
        if (isBuiltin) {
            const previousBuiltin = builtinRegistrations.get(moduleId);
            if (previousBuiltin) previousBuiltin.unregister();
            if (previous?.builtin === true) {
                registrations.delete(moduleId);
                unregisterHomeAdapter(adapters, moduleId);
            }
        } else {
            if (previous?.builtin !== true) registrations.delete(moduleId);
            unregisterHomeAdapter(adapters, moduleId);
        }
        const token = Symbol(moduleId);
        // The public home-module boundary is intentionally read-only. Ignore
        // caller metadata that attempts to advertise a writable module.
        // Keep the public metadata in the normalized definition so the store,
        // Agent discovery and host integrations see the same bounded contract.
        // The adapter's executable read function is kept separately and never
        // becomes part of persisted or Agent-facing metadata.
        // When the adapter omits `sizes`, inherit the builtin default so the
        // registration override does not collapse the size menu to "medium".
        // Built-in adapters are executable overrides of a catalog definition.
        // Preserve the catalog's presentation/protocol metadata when the
        // adapter only supplies runtime fields (read/title/icon/etc.).  The
        // old code inherited sizes alone, which silently dropped viewType
        // (calendar/weekday rendering) and configSchema from every built-in
        // adapter registration.
        const base = moduleDefinitions.find((item) => item && item.moduleId === moduleId);
        const inherited = base ? {
            viewType: base.viewType,
            protocolVersion: base.protocolVersion,
            configSchema: base.configSchema,
            refreshOn: base.refreshOn,
            sizes: base.sizes,
        } : {};
        const definition = normalizeModuleDefinition({
            ...inherited,
            ...raw,
            moduleId,
            title: raw?.title || moduleId,
            supportedDevices: raw?.supportedDevices || candidate.supportedDevices,
            readOnly: true,
        });
        if (!definition) return {registered: false, reason: "invalid", unregister: () => undefined};
        const unregister = () => {
            if (isBuiltin) {
                if (builtinRegistrations.get(moduleId)?.token !== token) return false;
                builtinRegistrations.delete(moduleId);
                if (registrations.get(moduleId)?.token === token) {
                    registrations.delete(moduleId);
                    unregisterHomeAdapter(adapters, moduleId);
                    rebuildDefinitions();
                }
                return true;
            }
            if (registrations.get(moduleId)?.token !== token) return false;
            registrations.delete(moduleId);
            unregisterHomeAdapter(adapters, moduleId);
            const fallback = builtinRegistrations.get(moduleId);
            if (fallback) {
                registrations.set(moduleId, fallback);
                adapters.set(moduleId, fallback.adapter);
            }
            rebuildDefinitions();
            return true;
        };
        const entry = {token, unregister, definition, adapter: candidate, builtin: isBuiltin};
        if (isBuiltin) {
            builtinRegistrations.set(moduleId, entry);
            if (!previous || previous.builtin === true) {
                adapters.set(moduleId, candidate);
                registrations.set(moduleId, entry);
            }
        } else {
            adapters.set(moduleId, candidate);
            registrations.set(moduleId, entry);
        }
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
        [...builtinRegistrations.values()].forEach((registration) => registration.unregister());
        registrations.clear();
        builtinRegistrations.clear();
        adapters = new Map();
    }
    return {registerAdapter, unregister, listModules, read, diagnostics: getHomeAdapterDiagnostics, resourceStats: getHomeAdapterResourceStats, dispose};
}

module.exports = {createHomeRuntime};
