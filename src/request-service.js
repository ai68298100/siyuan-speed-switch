"use strict";

const REQUEST_KINDS = Object.freeze([
    "aborted", "timeout", "unauthorized", "forbidden", "http", "server",
    "network", "invalid_response", "stale", "failed",
]);
const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 5000;

function finiteBoundedInteger(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

function stableSerialize(value, depth = 0) {
    if (depth > 16) throw new Error("request_key_too_deep");
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item, depth + 1)).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], depth + 1)}`).join(",")}}`;
}

function buildRequestKey(endpoint, body) {
    if (typeof endpoint !== "string" || !endpoint || !body || typeof body !== "object") return "";
    try { return `${endpoint}\n${stableSerialize(body)}`; } catch (_) { return ""; }
}

function normalizeRequestError(error, timedOut = false, externallyAborted = false) {
    const status = Number.isFinite(Number(error?.status)) ? Math.trunc(Number(error.status)) : 0;
    let kind = "failed";
    if (externallyAborted || error?.name === "AbortError" || error?.message === "aborted") kind = "aborted";
    else if (timedOut || error?.message === "timeout") kind = "timeout";
    else if (status === 401) kind = "unauthorized";
    else if (status === 403) kind = "forbidden";
    else if (status >= 500) kind = "server";
    else if (status >= 400) kind = "http";
    else if (error?.message === "invalid_json" || error instanceof SyntaxError) kind = "invalid_response";
    else if (error?.name === "TypeError") kind = "network";
    else if (REQUEST_KINDS.includes(error?.kind)) kind = error.kind;
    return Object.freeze({kind, status: status || undefined});
}

function isTransientRequestError(error) {
    return error?.kind === "network" || error?.kind === "timeout" || error?.kind === "server";
}

function runAttempt(execute, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(Object.assign(new Error("aborted"), {name: "AbortError"}));
            return;
        }
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        let settled = false;
        let timedOut = false;
        let timer = null;
        let abortHandler = null;
        const cleanup = () => {
            if (timer !== null) clearTimeout(timer);
            if (signal && abortHandler && typeof signal.removeEventListener === "function") {
                signal.removeEventListener("abort", abortHandler);
            }
        };
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        abortHandler = () => {
            controller?.abort();
            finish(reject, Object.assign(new Error("aborted"), {name: "AbortError"}));
        };
        if (signal && typeof signal.addEventListener === "function") {
            signal.addEventListener("abort", abortHandler, {once: true});
        }
        timer = setTimeout(() => {
            timedOut = true;
            controller?.abort();
            finish(reject, Object.assign(new Error("timeout"), {requestTimedOut: true}));
        }, timeoutMs);
        Promise.resolve().then(() => execute(controller?.signal || signal || undefined)).then(
            (value) => finish(resolve, value),
            (error) => {
                if (settled) return;
                if (timedOut) finish(reject, Object.assign(new Error("timeout"), {requestTimedOut: true}));
                else if (signal?.aborted) finish(reject, Object.assign(new Error("aborted"), {name: "AbortError"}));
                else finish(reject, error);
            },
        );
    });
}

function createRequestService() {
    const inFlight = new Map();
    const generations = new Map();

    function request(options = {}) {
        if (typeof options.execute !== "function") {
            return Promise.resolve({ok: false, error: Object.freeze({kind: "failed"}), attempts: 0});
        }
        const signal = options.signal && typeof options.signal === "object" ? options.signal : null;
        const key = typeof options.key === "string" ? options.key : "";
        const dedupe = options.dedupe === true && Boolean(key);
        if (dedupe) {
            const shared = inFlight.get(key);
            if (shared && shared.signal === signal) return shared.promise;
        }

        const latestKey = typeof options.latestKey === "string" ? options.latestKey : "";
        const generation = latestKey ? (generations.get(latestKey) || 0) + 1 : 0;
        if (latestKey) generations.set(latestKey, generation);
        const timeoutMs = finiteBoundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 120000);
        const maxRetries = finiteBoundedInteger(options.maxRetries, 0, 0, MAX_RETRIES);
        const retryIf = typeof options.retryIf === "function" ? options.retryIf : isTransientRequestError;

        const operation = (async () => {
            let attempts = 0;
            while (attempts <= maxRetries) {
                if (signal?.aborted) {
                    return {ok: false, error: normalizeRequestError(null, false, true), attempts};
                }
                attempts += 1;
                try {
                    const value = await runAttempt(options.execute, signal, timeoutMs);
                    if (latestKey && generations.get(latestKey) !== generation) {
                        return {ok: false, error: Object.freeze({kind: "stale"}), attempts};
                    }
                    return {ok: true, value, attempts};
                } catch (error) {
                    const normalized = normalizeRequestError(error, error?.requestTimedOut === true, signal?.aborted === true);
                    const result = {ok: false, error: normalized, attempts};
                    if (attempts > maxRetries || !retryIf(normalized, error, attempts)) {
                        if (latestKey && generations.get(latestKey) !== generation) {
                            return {ok: false, error: Object.freeze({kind: "stale"}), attempts};
                        }
                        return result;
                    }
                }
            }
            return {ok: false, error: Object.freeze({kind: "failed"}), attempts};
        })();

        if (dedupe) inFlight.set(key, {promise: operation, signal});
        return operation.finally(() => {
            if (dedupe && inFlight.get(key)?.promise === operation) inFlight.delete(key);
        });
    }

    return Object.freeze({
        request,
        invalidate(key) {
            if (typeof key !== "string" || !key) return false;
            generations.set(key, (generations.get(key) || 0) + 1);
            return true;
        },
        clear() {
            inFlight.clear();
            generations.clear();
        },
        snapshot() { return Object.freeze({inFlight: inFlight.size, latestScopes: generations.size}); },
    });
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    MAX_RETRIES,
    REQUEST_KINDS,
    buildRequestKey,
    createRequestService,
    normalizeRequestError,
};
