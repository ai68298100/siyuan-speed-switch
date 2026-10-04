const {readNativeSnippetResponse, buildSnippetMutation, projectSnippetListForWire, normalizeSnippetSnapshot, snippetSnapshotSignature} = require("./snippet-studio-model.js");

const SNIPPET_ENDPOINTS = new Set([
    "/api/snippet/getSnippet",
    "/api/snippet/setSnippet",
    "/api/setting/setSnippet",
]);

// One instance per open studio. The UI is a singleton, so local writes serialize.
// SiYuan exposes whole-list replacement, not compare-and-swap: re-read immediately
// before mutation and compare the selected row; never claim cross-plugin atomicity.
function createSnippetStore({fetchImpl = fetch, timeoutMs = 10000,
    getSnippetSettings = () => globalThis.window?.siyuan?.config?.snippet,
    getWindow = () => globalThis.window} = {}) {
    let disposed = false;
    let tail = Promise.resolve();
    // The native endpoint may persist a setting before the host-side config
    // object is refreshed. Keep the latest confirmed write locally so a
    // subsequent whole-list mutation cannot overwrite it with stale flags.
    let settingsShadow = null;
    const controllers = new Set();
    const subscriptions = new Set();
    async function request(path, body) {
        if (disposed) throw new Error("disposed");
        if (!SNIPPET_ENDPOINTS.has(path)) throw new Error("unsupported");
        const controller = new AbortController();
        controllers.add(controller);
        let timedOut = false;
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error("timeout")); }, timeoutMs);
        });
        try {
            const wireBody = path === "/api/snippet/setSnippet" && Array.isArray(body?.snippets)
                ? {...body, snippets: projectSnippetListForWire(body.snippets)}
                : body;
            const init = {method: "POST", credentials: "same-origin", headers: {"Content-Type": "application/json"}, body: JSON.stringify(wireBody), signal: controller.signal};
            const operation = (async () => {
                const response = await fetchImpl(path, init);
                if (!response.ok) throw new Error(response.status === 404 ? "unsupported" : "request_failed");
                const value = await response.json();
                if (disposed || controller.signal.aborted) throw new Error("disposed");
                if (value?.code !== 0) throw new Error("request_failed");
                return value;
            })();
            return await Promise.race([operation, timeout]);
        } catch (error) {
            if (timedOut) throw new Error("timeout");
            throw error;
        } finally {
            clearTimeout(timer);
            controllers.delete(controller);
        }
    }
    const read = async () => readNativeSnippetResponse(await request("/api/snippet/getSnippet", {type: "all", enabled: 2}));
    const readSnapshot = async () => ({snippets: await read(), settings: readSnippetFlags()});
    const readSnippetFlags = () => {
        const settings = getSnippetSettings();
        if (typeof settings?.enabledCSS !== "boolean" || typeof settings?.enabledJS !== "boolean") {
            if (settingsShadow) return {...settingsShadow};
            throw new Error("snippet-config-unavailable");
        }
        return settingsShadow
            ? {...settings, ...settingsShadow}
            : {enabledCSS: settings.enabledCSS, enabledJS: settings.enabledJS};
    };
    return {
        read,
        readSnapshot,
        readSettings() { return readSnippetFlags(); },
        subscribe(callback) {
            const target = getWindow();
            if (!target || typeof callback !== "function" || typeof target.addEventListener !== "function") return () => {};
            const refresh = (event) => {
                if (disposed) return;
                Promise.resolve(callback({reason: event?.type || "external"})).catch(() => undefined);
            };
            const events = ["focus", "storage", "visibilitychange", "sw-snippet-changed"];
            events.forEach((event) => target.addEventListener(event, refresh));
            const unsubscribe = () => events.forEach((event) => target.removeEventListener(event, refresh));
            subscriptions.add(unsubscribe);
            return () => { unsubscribe(); subscriptions.delete(unsubscribe); };
        },
        setMaster(type, enabled) {
            if (type !== "css" && type !== "js") return Promise.reject(new Error("snippet-invalid-master"));
            const run = tail.catch(() => undefined).then(async () => {
                const flags = readSnippetFlags();
                const next = {
                    ...flags,
                    [type === "css" ? "enabledCSS" : "enabledJS"]: Boolean(enabled),
                };
                await request("/api/setting/setSnippet", next);
                settingsShadow = next;
                return {...next};
            });
            tail = run;
            return run;
        },
        mutate(baseline, action, draft) {
            const run = tail.catch(() => undefined).then(async () => {
                // Fail before the whole-list write when the host cannot expose
                // the native master flags. A missing config after the write is
                // still reported as a residual upstream race in ADR 0078.
                readSnippetFlags();
                const latest = await read();
                const next = buildSnippetMutation(latest, baseline, action, draft);
                // T-7045：列表写入之后的任何失败（通知/回读/校验的超时或异常）都带
                // writeLanded 标——写入可能已生效，UI 必须只读核对而不是伪报普通失败；
                // snippet-conflict 保留既有可决策语义，不打标。
                const tagLanded = (error) => {
                    if (String(error?.message || "") !== "snippet-conflict") error.writeLanded = true;
                    throw error;
                };
                try {
                    await request("/api/snippet/setSnippet", {snippets: next});
                    // Read the flags after the whole-list write so a concurrent
                    // settings change is less likely to be overwritten by this
                    // refresh notification. The endpoint still has no CAS; ADR
                    // 0078 records that final read/write window explicitly.
                    const flags = readSnippetFlags();
                    // SiYuan's native UI follows the list write with this endpoint.
                    // It broadcasts setSnippet so every window runs renderSnippet.
                    await request("/api/setting/setSnippet", flags);
                    settingsShadow = flags;
                    const confirmed = await read();
                    const expected = JSON.stringify(projectSnippetListForWire(next));
                    const actual = JSON.stringify(projectSnippetListForWire(confirmed));
                    if (actual !== expected) throw new Error("snippet-conflict");
                    return confirmed;
                } catch (error) { tagLanded(error); }
            });
            tail = run;
            return run;
        },
        restoreSnapshot(expectedSignature, nextSnapshot) {
            const run = tail.catch(() => undefined).then(async () => {
                const current = await readSnapshot();
                if (expectedSignature && snippetSnapshotSignature(current) !== expectedSignature) {
                    throw new Error("snippet-conflict");
                }
                const normalized = normalizeSnippetSnapshot(nextSnapshot);
                let landed = false;
                try {
                    await request("/api/snippet/setSnippet", {snippets: normalized.snippets});
                    landed = true;
                    await request("/api/setting/setSnippet", normalized.settings);
                    settingsShadow = normalized.settings;
                    const confirmed = await readSnapshot();
                    if (snippetSnapshotSignature(confirmed) !== snippetSnapshotSignature(normalized)) {
                        const error = new Error("snippet-restore-unverified");
                        error.writeLanded = true;
                        throw error;
                    }
                    return confirmed;
                } catch (error) {
                    if (landed && String(error?.message || "") !== "snippet-conflict") error.writeLanded = true;
                    throw error;
                }
            });
            tail = run;
            return run;
        },
        dispose() {
            disposed = true;
            subscriptions.forEach((unsubscribe) => unsubscribe());
            subscriptions.clear();
            controllers.forEach((controller) => controller.abort());
            controllers.clear();
        },
    };
}

// CSS only, after the kernel confirms persistence. Never run arbitrary JS here.
function applyNativeSnippetCss(document, previous, next, enabledCSS) {
    if (previous?.type === "css" && (!next || next.type !== "css")) {
        document.getElementById(`snippetCSS${previous.id}`)?.remove();
    }
    if (next?.type !== "css") return;
    const id = `snippetCSS${next.id}`;
    let style = document.getElementById(id);
    if (!next.enabled || enabledCSS !== true) { style?.remove(); return; }
    if (!style) { style = document.createElement("style"); style.id = id; document.head.appendChild(style); }
    style.textContent = next.content;
}

// The native endpoint replaces the whole list. Rebuild the studio-owned CSS
// styles in native list order after a confirmed read/write so a newly-created
// rule does not accidentally acquire a different cascade position.
function syncNativeSnippetCss(document, snippets, enabledCSS) {
    const rows = Array.isArray(snippets) ? snippets : [];
    const keep = new Set();
    if (enabledCSS === true) {
        for (const snippet of rows) {
            if (snippet?.type !== "css" || snippet.enabled !== true || typeof snippet.id !== "string") continue;
            const id = `snippetCSS${snippet.id}`;
            let style = document.getElementById(id);
            if (!style) {
                style = document.createElement("style");
                style.id = id;
            }
            style.textContent = snippet.content;
            document.head.appendChild(style);
            keep.add(id);
        }
    }
    document.querySelectorAll("style[id^='snippetCSS']").forEach((style) => {
        if (!keep.has(style.id)) style.remove();
    });
}

module.exports = {createSnippetStore, applyNativeSnippetCss, syncNativeSnippetCss};
