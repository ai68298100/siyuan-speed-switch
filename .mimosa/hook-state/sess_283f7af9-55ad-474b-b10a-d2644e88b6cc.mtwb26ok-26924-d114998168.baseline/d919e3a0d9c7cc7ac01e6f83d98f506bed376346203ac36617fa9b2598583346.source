"use strict";

const {createHomeModuleController} = require("./home-controller.js");

const MAX_MODULES = 8;
const MAX_CONCURRENT_READS = 3;

function createHomePanelController(options = {}) {
    const documentRef = options.document;
    const container = options.container;
    const seenModuleIds = new Set();
    const modules = [];
    (Array.isArray(options.modules) ? options.modules : []).some((module) => {
        if (!module || typeof module !== "object" || typeof module.moduleId !== "string") return false;
        const moduleId = module.moduleId.trim();
        if (!moduleId || seenModuleIds.has(moduleId)) return false;
        seenModuleIds.add(moduleId);
        modules.push({...module, moduleId});
        return modules.length >= MAX_MODULES;
    });
    const read = typeof options.read === "function" ? options.read : null;
    if (!documentRef || !container || !read) return null;
    let disposed = false;
    let mounted = false;
    let panel = null;
    let refreshGeneration = 0;
    const controllers = new Map();

    function mount() {
        if (disposed) return null;
        if (mounted) return panel;
        panel = documentRef.createElement("div");
        panel.className = "sw__home-panel";
        panel.setAttribute("role", "region");
        panel.setAttribute("aria-label", options.title || "Home");
        if (modules.length === 0) {
            const empty = documentRef.createElement("p");
            empty.className = "sw__home-panel-empty";
            empty.setAttribute("role", "status");
            empty.setAttribute("aria-live", "polite");
            empty.textContent = options.labels?.emptyPanel || "暂无可用模块";
            panel.appendChild(empty);
        }
        modules.forEach((module) => {
            const host = documentRef.createElement("div");
            host.className = "sw__home-panel-module";
            host.dataset.moduleId = module.moduleId;
            const controller = createHomeModuleController({
                document: documentRef,
                container: host,
                module,
                collapsed: module.collapsed === true,
                labels: options.labels,
                onItem: options.onItem,
                onToggleItem: options.onToggleItem,
                onToggle: options.onToggle,
                read: (config, readOptions) => read(module, config, readOptions),
            });
            if (!controller) return;
            controllers.set(module.moduleId, controller);
            panel.appendChild(host);
            controller.mount();
        });
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(panel);
        mounted = true;
        return panel;
    }

    async function refresh(config = {}, readOptions = {}) {
        if (disposed) return {ok: false, reason: "disposed", results: []};
        mount();
        const generation = ++refreshGeneration;
        if (panel) panel.setAttribute("aria-busy", "true");
        const entries = [...controllers.entries()];
        const results = new Array(entries.length);
        let next = 0;
        const worker = async () => {
            while (next < entries.length) {
                const index = next++;
                const [moduleId, controller] = entries[index];
                try {
                    const moduleConfig = typeof config === "function" ? config(moduleId) : config?.[moduleId] || config;
                    results[index] = await controller.refresh(moduleConfig, readOptions);
                } catch (_) {
                    // Keep one malformed module configuration from rejecting
                    // the whole panel contract. The module controller remains
                    // available for a later retry.
                    const view = typeof controller.showError === "function"
                        ? controller.showError("failed") : controller.getView();
                    results[index] = {ok: false, reason: "failed", view};
                }
            }
        };
        try {
            await Promise.all(Array.from({length: Math.min(MAX_CONCURRENT_READS, Math.max(1, entries.length))}, () => worker()));
            const reason = results.some((result) => result?.reason === "stale")
                ? "stale"
                : results.some((result) => result?.reason === "aborted") ? "aborted"
                    : results.some((result) => result?.reason === "disposed") ? "disposed"
                        : results.some((result) => result?.ok === false) ? "failed" : "";
            return {ok: results.every((result) => result?.ok !== false), reason, results};
        } finally {
            if (!disposed && generation === refreshGeneration && panel) panel.setAttribute("aria-busy", "false");
        }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        refreshGeneration += 1;
        controllers.forEach((controller) => controller.dispose());
        controllers.clear();
        panel = null;
        mounted = false;
        while (container.firstChild) container.removeChild(container.firstChild);
    }

    function toggle(moduleId) {
        const controller = controllers.get(String(moduleId || ""));
        return controller && typeof controller.toggle === "function" ? controller.toggle() : null;
    }

    return {
        mount,
        refresh,
        toggle,
        dispose,
        listModules: () => modules.map((module) => ({...module})),
        getViews: () => [...controllers.entries()].map(([moduleId, controller]) => ({moduleId, view: controller.getView()})),
    };
}

module.exports = {MAX_MODULES, MAX_CONCURRENT_READS, createHomePanelController};
