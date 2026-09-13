"use strict";

const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;
const NOTEBOOK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PATH_ITEMS = 100;

function safeText(value, maxLength) {
    if (typeof value !== "string") return "";
    return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
        .slice(0, maxLength)
        .join("");
}

function normalizeTreePath(value) {
    const path = safeText(value || "/", 1024).replace(/\\/g, "/");
    if (path === "/") return path;
    if (!path.startsWith("/") || path.endsWith("/") || path.includes("//")) return "";
    const parts = path.slice(1).split("/");
    if (!parts.every((part) => part.toLowerCase().endsWith(".sy") && BLOCK_ID_RE.test(part.slice(0, -3)))) return "";
    return `/${parts.join("/")}`;
}

function buildPathFilterListRequest(input = {}) {
    const notebook = safeText(input.notebook, 64);
    const path = normalizeTreePath(input.path);
    if (!NOTEBOOK_ID_RE.test(notebook) || !path) return null;
    const limit = Math.min(MAX_PATH_ITEMS, Math.max(1, Number.isFinite(input.limit) ? Math.floor(input.limit) : MAX_PATH_ITEMS));
    return {
        endpoint: "/api/filetree/listDocsByPath",
        body: {notebook, path, maxListCount: limit + 1},
        limit,
    };
}

function normalizePathFilterListResponse(payload, input = {}) {
    const request = buildPathFilterListRequest(input);
    if (!request) return {ok: false, reason: "invalid", items: [], truncated: false};
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "code")
        && Number(payload.code) !== 0) {
        return {ok: false, reason: "failed", items: [], truncated: false};
    }
    const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
        ? payload.data
        : payload;
    if (!data || typeof data !== "object" || data.box !== request.body.notebook || typeof data.path !== "string"
        || normalizeTreePath(data.path) !== request.body.path || !Array.isArray(data.files)) {
        return {ok: false, reason: "mismatch", items: [], truncated: false};
    }

    const items = [];
    const seen = new Set();
    let truncated = false;
    for (const file of data.files.slice(0, request.limit + 1)) {
        if (!file || typeof file !== "object") continue;
        const id = safeText(file.id, 64);
        const path = normalizeTreePath(file.path);
        if (!BLOCK_ID_RE.test(id) || !path || path.split("/").pop() !== `${id}.sy` || seen.has(path)) continue;
        seen.add(path);
        if (items.length >= request.limit) {
            truncated = true;
            break;
        }
        items.push({
            id,
            title: safeText(file.name, 128) || id,
            path,
            searchPath: `${request.body.notebook}${path}`,
            hasChildren: Number.isFinite(Number(file.subFileCount)) && Number(file.subFileCount) > 0,
        });
    }
    return {ok: true, reason: "ready", items, truncated};
}

function normalizePathFilterProbeOutcome(outcome = {}, input = {}) {
    if (!buildPathFilterListRequest(input)) return {ok: false, reason: "invalid", items: [], truncated: false};
    switch (outcome && outcome.kind) {
        case "response":
            return normalizePathFilterListResponse(outcome.payload, input);
        case "unavailable":
            return {ok: false, reason: "unavailable", items: [], truncated: false};
        case "http": {
            const status = Number(outcome.status);
            return {ok: false, reason: [404, 405, 501].includes(status) ? "unavailable" : "failed", items: [], truncated: false};
        }
        case "timeout":
            return {ok: false, reason: "timeout", items: [], truncated: false};
        case "cancelled":
            return {ok: false, reason: "cancelled", items: [], truncated: false};
        default:
            return {ok: false, reason: "failed", items: [], truncated: false};
    }
}

module.exports = {MAX_PATH_ITEMS, buildPathFilterListRequest, normalizePathFilterListResponse, normalizePathFilterProbeOutcome};
