"use strict";

const {normalizeSnippetGistSettings, normalizeSnippetGistUrl} = require("./settings-model.js");
const {parseSnippetImport} = require("./snippet-studio-model.js");

const GIST_API_ORIGIN = "https://api.github.com";
const GIST_WEB_ORIGIN = "https://gist.github.com";
const GIST_TOKEN_MAX = 512;
const GIST_DESCRIPTION_MAX = 256;
const GIST_REMOTE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const GIST_FILE_MAX_BYTES = 64 * 1024;
const GIST_FILE_COUNT_MAX = 32;
const GIST_LINKS_MAX = 256;
const GIST_ID_RE = /^[a-f0-9]{8,64}$/i;
const GIST_SNIPPET_ID_RE = /^\d{14}-[a-z0-9]{7}$/i;
const encoder = new TextEncoder();

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function parseGistUrl(value) {
    const url = normalizeSnippetGistUrl(value);
    if (!url) return null;
    const id = url.split("/").pop();
    return {id, url, apiUrl: GIST_API_ORIGIN + "/gists/" + id};
}

function maskGistToken(value) {
    return typeof value === "string" && value ? "••••" + (value.length > 8 ? value.slice(-4) : "") : "";
}

function rememberGistLink(value, snippetId, url) {
    const settings = normalizeSnippetGistSettings(value);
    const normalized = normalizeSnippetGistUrl(url);
    if (!GIST_SNIPPET_ID_RE.test(String(snippetId || "")) || !normalized) return settings;
    const entries = Object.entries(settings.links).filter(([id]) => id !== snippetId);
    return {...settings, links: Object.fromEntries([...entries, [snippetId, normalized]].slice(-GIST_LINKS_MAX))};
}

function buildGistFileName(snippet) {
    if (!GIST_SNIPPET_ID_RE.test(String(snippet?.id || "")) || !["css", "js"].includes(snippet?.type)) throw new Error("gist-snippet-invalid");
    return "siyuan-snippet-" + snippet.id + "." + snippet.type;
}

function parseSnippetIdFromGistFileName(filename) {
    const match = typeof filename === "string" ? filename.match(/^siyuan-snippet-(\d{14}-[a-z0-9]{7})(?:-.*)?\.(?:css|js)$/i) : null;
    return match ? match[1] : "";
}

function buildGistDescription(description) {
    return cleanText(description, GIST_DESCRIPTION_MAX);
}

function buildGistRequest({token = "", method = "GET", body, signal} = {}) {
    if (!["GET", "POST", "PATCH"].includes(method)) throw new Error("gist-request-invalid");
    if (typeof token !== "string" || token.length > GIST_TOKEN_MAX || /\s|[\u0000-\u001f\u007f]/.test(token)) {
        throw new Error("gist-token-invalid");
    }
    if (method !== "GET" && !token) throw new Error("gist-token-required");
    const headers = {Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"};
    if (token) headers.Authorization = "Bearer " + token;
    const init = {method, headers, signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer"};
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
    }
    return init;
}

function cancelGistBody(body) {
    try { Promise.resolve(body?.cancel()).catch(() => undefined); } catch (_) {}
}

async function readJsonResponse(response, signal) {
    if (signal.aborted) {
        cancelGistBody(response?.body);
        throw new Error("gist-cancelled");
    }
    if (!response?.ok) {
        cancelGistBody(response?.body);
        const code = response?.status === 401 ? "gist-auth-failed"
            : response?.status === 403 || response?.status === 429 ? "gist-access-denied"
                : response?.status === 404 ? "gist-not-found" : "gist-request-failed";
        throw new Error(code);
    }
    const declaredSize = Number(response.headers?.get?.("Content-Length"));
    if (declaredSize > GIST_REMOTE_RESPONSE_MAX_BYTES) {
        cancelGistBody(response.body);
        throw new Error("gist-response-too-large");
    }
    if (!response.body?.getReader) throw new Error("gist-invalid-response");
    const reader = response.body.getReader();
    const abortReader = () => cancelGistBody(reader);
    signal.addEventListener("abort", abortReader, {once: true});
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    try {
        while (true) {
            const chunk = await reader.read();
            if (signal.aborted) throw new Error("gist-cancelled");
            if (chunk.done) break;
            received += chunk.value.byteLength;
            if (received > GIST_REMOTE_RESPONSE_MAX_BYTES) {
                cancelGistBody(reader);
                throw new Error("gist-response-too-large");
            }
            text += decoder.decode(chunk.value, {stream: true});
        }
        text += decoder.decode();
    } finally {
        signal.removeEventListener("abort", abortReader);
        reader.releaseLock();
    }
    try { return JSON.parse(text); } catch (_) { throw new Error("gist-invalid-response"); }
}

function normalizeGistFile(file) {
    const filename = typeof file?.filename === "string" ? file.filename : "";
    const match = filename.match(/\.(css|js)$/i);
    const type = match ? match[1].toLowerCase() : "";
    const content = typeof file?.content === "string" ? file.content : "";
    const size = encoder.encode(content).byteLength;
    let imported = null;
    let reason = !type ? "unsupported-type" : file?.truncated === true ? "remote-truncated"
        : size > GIST_FILE_MAX_BYTES || Number(file?.size) > GIST_FILE_MAX_BYTES ? "too-large" : "invalid";
    if (type && filename.length <= 120 && !/[\u0000-\u001f\u007f/\\]/.test(filename)
        && file?.truncated !== true && size <= GIST_FILE_MAX_BYTES && Number(file?.size || 0) <= GIST_FILE_MAX_BYTES) {
        try {
            imported = parseSnippetImport(filename, content);
            reason = "ready";
        } catch (_) { reason = "invalid"; }
    }
    return {filename: cleanText(filename, 120), type, size, content: imported?.content || "",
        name: imported?.name || "", remoteId: parseSnippetIdFromGistFileName(filename), parseable: Boolean(imported), reason};
}

function buildGistImportPreview(payload) {
    if (!isRecord(payload) || typeof payload.id !== "string" || !GIST_ID_RE.test(payload.id) || !isRecord(payload.files)) throw new Error("gist-invalid-response");
    const url = normalizeSnippetGistUrl(payload.html_url);
    if (!url || parseGistUrl(url).id.toLowerCase() !== payload.id.toLowerCase()) throw new Error("gist-invalid-response");
    const values = Object.values(payload.files);
    if (!values.length || values.length > GIST_FILE_COUNT_MAX) throw new Error("gist-invalid-response");
    const files = values.map(normalizeGistFile);
    const name = buildGistDescription(payload.description);
    const parseable = files.filter((file) => file.parseable);
    if (parseable.length === 1 && name && parseable[0].remoteId) parseable[0].name = cleanText(name, 120);
    const snapshot = JSON.stringify([payload.description, payload.updated_at, payload.history?.[0]?.version,
        Object.entries(payload.files).sort(([left], [right]) => left.localeCompare(right)).map(([key, file]) =>
            [key, file?.filename, file?.content, file?.size, file?.truncated])]);
    return {id: payload.id, url, description: name, snapshot, files, parseable};
}

function buildGistImportDraft(preview, index = 0) {
    const file = preview?.parseable?.[index];
    if (!file?.parseable) throw new Error("gist-file-not-parseable");
    return {name: file.name, type: file.type, content: file.content, enabled: false,
        disabledInPublish: false, sourceUrl: preview.url, remoteId: file.remoteId};
}

function buildGistPublishBody(snippet, description) {
    if (!isRecord(snippet) || (snippet.type !== "css" && snippet.type !== "js")
        || typeof snippet.content !== "string" || !snippet.content.trim() || snippet.content.includes("\u0000")) {
        throw new Error("gist-snippet-invalid");
    }
    if (encoder.encode(snippet.content).byteLength > GIST_FILE_MAX_BYTES) throw new Error("gist-file-too-large");
    return {description: buildGistDescription(description), public: false,
        files: {[buildGistFileName(snippet)]: {content: snippet.content}}};
}

async function requestGist(url, {token, method = "GET", body, fetchImpl = fetch, timeoutMs = 10000, signal} = {}) {
    const controller = new AbortController();
    const init = buildGistRequest({token, method, body, signal: controller.signal});
    let timeoutId;
    let abortListener;
    const interrupted = new Promise((_resolve, reject) => {
        abortListener = () => { controller.abort(); reject(new Error("gist-cancelled")); };
        timeoutId = setTimeout(() => { reject(new Error("gist-timeout")); controller.abort(); },
            Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30000) : 10000);
    });
    signal?.addEventListener("abort", abortListener, {once: true});
    if (signal?.aborted) abortListener();
    try {
        const operation = (async () => {
            if (controller.signal.aborted) throw new Error("gist-cancelled");
            const response = await fetchImpl(url, init);
            const payload = await readJsonResponse(response, controller.signal);
            if (controller.signal.aborted) throw new Error("gist-cancelled");
            return payload;
        })();
        return await Promise.race([operation, interrupted]);
    } catch (error) {
        if (["gist-cancelled", "gist-timeout", "gist-auth-failed", "gist-access-denied", "gist-not-found",
            "gist-request-failed", "gist-invalid-response", "gist-response-too-large", "gist-token-invalid",
            "gist-token-required", "gist-request-invalid"].includes(error?.message)) throw new Error(error.message);
        throw new Error("gist-request-failed");
    } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", abortListener);
    }
}

async function fetchGistPreview(url, options = {}) {
    const parsed = parseGistUrl(url);
    if (!parsed) throw new Error("gist-url-invalid");
    const preview = buildGistImportPreview(await requestGist(parsed.apiUrl, {...options, method: "GET", body: undefined}));
    if (preview.id.toLowerCase() !== parsed.id.toLowerCase()) throw new Error("gist-invalid-response");
    return preview;
}

async function publishGist({token, snippet, gistUrl = "", description = "", expected = null, ...options} = {}) {
    const parsed = gistUrl ? parseGistUrl(gistUrl) : null;
    if (gistUrl && !parsed) throw new Error("gist-url-invalid");
    const body = buildGistPublishBody(snippet, description);
    if (parsed) {
        const current = await fetchGistPreview(gistUrl, {...options, token});
        if (!expected || expected.id !== current.id || expected.snapshot !== current.snapshot) throw new Error("gist-conflict");
        const owned = current.files.filter((file) => file.remoteId === snippet.id && file.type === snippet.type);
        if (owned.length !== 1 || !owned[0].parseable) throw new Error("gist-file-not-owned");
        const filename = buildGistFileName(snippet);
        if (owned[0].filename !== filename) body.files[owned[0].filename] = null;
        delete body.public;
    }
    const payload = await requestGist(parsed ? parsed.apiUrl : GIST_API_ORIGIN + "/gists",
        {...options, token, method: parsed ? "PATCH" : "POST", body});
    if (!isRecord(payload) || typeof payload.id !== "string" || !GIST_ID_RE.test(payload.id)) throw new Error("gist-invalid-response");
    const url = normalizeSnippetGistUrl(payload.html_url);
    if (!url || parseGistUrl(url).id.toLowerCase() !== payload.id.toLowerCase()
        || (parsed && parsed.id.toLowerCase() !== payload.id.toLowerCase())) throw new Error("gist-invalid-response");
    return {id: payload.id, url, description: buildGistDescription(payload.description), mode: parsed ? "update" : "create"};
}

module.exports = {GIST_API_ORIGIN, GIST_WEB_ORIGIN, GIST_TOKEN_MAX, GIST_DESCRIPTION_MAX,
    GIST_FILE_MAX_BYTES, GIST_FILE_COUNT_MAX, GIST_REMOTE_RESPONSE_MAX_BYTES,
    parseGistUrl, normalizeGistUrl: normalizeSnippetGistUrl, maskGistToken,
    normalizeGistSettings: normalizeSnippetGistSettings, rememberGistLink, buildGistFileName,
    parseSnippetIdFromGistFileName, buildGistDescription, buildGistRequest, normalizeGistFile,
    buildGistImportPreview, buildGistImportDraft, buildGistPublishBody, fetchGistPreview, publishGist};
