// 日记宿主动作：只负责调用思源日记 API，UI 选择与打开由调用方管理。
// T-7263：创建是写入，必须把“明确失败”和“结果待核实”分开；查询则复用
// 共享 deadline/去重/有限重试，避免每个入口各自维护一套 fetch 计时器。
const {buildRequestKey, createRequestService} = require("./request-service.js");

const journalRequests = createRequestService();
const DEFAULT_TIMEOUT_MS = 5000;
const UNKNOWN_WRITE_KINDS = new Set(["aborted", "timeout", "network", "server", "invalid_response", "failed"]);

/** Normalize a host-provided document id before it crosses into open commands. */
function normalizeJournalDocumentId(value) {
    const id = typeof value === "string" ? value.trim() : "";
    return /^\d{14}-[0-9a-z]{7}$/i.test(id) ? id : "";
}

function validNotebook(value) {
    return typeof value === "string" && /^[0-9]{14}-[0-9a-z]+$/i.test(value.trim());
}

function requestOutcome(result, {write = false} = {}) {
    if (result?.ok) return {ok: true, value: result.value, attempts: result.attempts};
    const kind = result?.error?.kind || "failed";
    return {
        ok: false,
        error: result?.error || {kind},
        attempts: result?.attempts || 0,
        // A write may already have reached the host before its response was lost.
        outcome: write && UNKNOWN_WRITE_KINDS.has(kind) ? "unknown" : "failed",
    };
}

function parseJournalCreate(value, logger) {
    if (!value || typeof value !== "object" || typeof value.code !== "number") {
        logger?.warn?.("createDailyNote returned an invalid result", value);
        return {ok: false, error: {kind: "invalid_response"}, outcome: "unknown"};
    }
    if (value.code !== 0) {
        logger?.warn?.("createDailyNote returned a host error", value);
        return {ok: false, error: {kind: "server"}, outcome: "failed"};
    }
    const id = normalizeJournalDocumentId(value?.data?.id);
    if (id) return {ok: true, id};
    logger?.warn?.("createDailyNote returned an invalid result", value);
    return {ok: false, error: {kind: "invalid_response"}, outcome: "unknown"};
}

function parseJournalRows(value) {
    if (value?.code !== 0 || !Array.isArray(value?.data)) return {ok: false, error: {kind: "invalid_response"}, outcome: "failed"};
    for (const row of value.data) {
        const id = normalizeJournalDocumentId(row?.id);
        if (id) return {ok: true, id};
    }
    return {ok: true, id: null, empty: true};
}

/**
 * Structured create result used by write-capable callers.
 * @param {{notebook: string, fetchImpl?: typeof fetch, logger?: {warn?: (...args: unknown[]) => void}, timeoutMs?: number, signal?: AbortSignal, requestJson?: (endpoint: string, body: Record<string, unknown>, options: {dedupe?: boolean, latestKey?: string, signal?: AbortSignal, timeoutMs?: number}) => Promise<unknown>}} options
 */
async function ensureTodayJournalOutcome({notebook, fetchImpl = globalThis.fetch, logger, timeoutMs = DEFAULT_TIMEOUT_MS, signal, requestJson} = {}) {
    if (typeof notebook !== "string" || !notebook.trim() || typeof fetchImpl !== "function") {
        return {ok: false, error: {kind: "invalid_input"}, attempts: 0, outcome: "failed"};
    }
    const body = {notebook: notebook.trim()};
    const result = await runJournalRequest({
        endpoint: "/api/filetree/createDailyNote", body, fetchImpl, requestJson,
        key: buildRequestKey("/api/filetree/createDailyNote", body), dedupe: true,
        signal, timeoutMs, maxRetries: 0,
    });
    const classified = requestOutcome(result, {write: true});
    if (!classified.ok) {
        logger?.warn?.("createDailyNote request failed", classified.error);
        return classified;
    }
    return parseJournalCreate(classified.value, logger);
}

async function runJournalRequest({endpoint, body, fetchImpl, requestJson: sharedRequest, key, dedupe, latestKey = "", signal, timeoutMs, maxRetries}) {
    if (typeof sharedRequest === "function") {
        return sharedRequest(endpoint, body, {dedupe, latestKey, signal, timeoutMs});
    }
    return journalRequests.request({
        key, dedupe, latestKey, signal, timeoutMs, maxRetries,
        execute: async (requestSignal) => {
            const response = await fetchImpl(endpoint, {
                method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
                ...(requestSignal ? {signal: requestSignal} : {}),
            });
            if (!response?.ok) throw Object.assign(new Error("journal_request_http"), {status: response?.status});
            return response.json();
        },
    });
}

/**
 * Create or reuse today's journal document in a notebook.
 * @param {{notebook: string, fetchImpl?: Function, logger?: {warn?: (...args: unknown[]) => void}}}
 * @returns {Promise<string|null>}
 */
async function ensureTodayJournal({notebook, fetchImpl = globalThis.fetch, logger, requestJson}) {
    const result = await ensureTodayJournalOutcome({notebook, fetchImpl, logger, requestJson});
    return result.ok ? result.id : null;
}

/**
 * Structured read result used by callers that need an actionable error kind.
 * @param {{notebook: string, fetchImpl?: typeof fetch, logger?: {warn?: (...args: unknown[]) => void}, now?: Date, timeoutMs?: number, signal?: AbortSignal, requestJson?: (endpoint: string, body: Record<string, unknown>, options: {dedupe?: boolean, latestKey?: string, signal?: AbortSignal, timeoutMs?: number}) => Promise<unknown>}} options
 */
async function findTodayJournalOutcome({notebook, fetchImpl = globalThis.fetch, logger, now = new Date(), timeoutMs = DEFAULT_TIMEOUT_MS, signal, requestJson} = {}) {
    if (!validNotebook(notebook) || typeof fetchImpl !== "function") {
        return {ok: false, error: {kind: "invalid_input"}, attempts: 0, outcome: "failed"};
    }
    const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const attribute = `custom-dailynote-${ymd.replace(/-/g, "")}`;
    const stmt = `SELECT b.id FROM blocks AS b LEFT JOIN attributes AS a ON a.block_id=b.id AND a.name='${attribute}' WHERE b.type='d' AND b.box='${notebook}' AND (a.name IS NOT NULL OR b.content LIKE '${ymd}%') ORDER BY b.created DESC, b.id DESC LIMIT 1`;
    const body = {stmt};
    const result = await runJournalRequest({
        endpoint: "/api/query/sql", body, fetchImpl, requestJson,
        key: buildRequestKey("/api/query/sql", body), dedupe: true,
        latestKey: `journal:${notebook}:${ymd}`, signal, timeoutMs, maxRetries: 1,
    });
    const classified = requestOutcome(result);
    if (!classified.ok) {
        logger?.warn?.("find today's journal request failed", classified.error);
        return classified;
    }
    return parseJournalRows(classified.value);
}

/**
 * Find today's journal without creating a document.
 * @param {{notebook: string, fetchImpl?: Function, logger?: {warn?: (...args: unknown[]) => void}, now?: Date}}
 * @returns {Promise<string|null>}
 */
async function findTodayJournal({notebook, fetchImpl = globalThis.fetch, logger, now = new Date(), requestJson}) {
    const result = await findTodayJournalOutcome({notebook, fetchImpl, logger, now, requestJson});
    return result.ok ? result.id : null;
}

module.exports = {normalizeJournalDocumentId, ensureTodayJournal, ensureTodayJournalOutcome, findTodayJournal, findTodayJournalOutcome};
