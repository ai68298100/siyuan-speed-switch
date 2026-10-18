const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildRequestKey,
    createRequestService,
    normalizeRequestError,
    MAX_RETRIES,
    REQUEST_KINDS,
} = require("../src/request-service.js");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("request keys are stable across object property order", () => {
    assert.equal(buildRequestKey("/api/query/sql", {stmt: "SELECT 1", limit: 2}),
        buildRequestKey("/api/query/sql", {limit: 2, stmt: "SELECT 1"}));
    assert.notEqual(buildRequestKey("/api/query/sql", {stmt: "SELECT 1"}),
        buildRequestKey("/api/query/sql", {stmt: "SELECT 2"}));
});

test("buildRequestKey gracefully handles depth overflow and non-objects", () => {
    assert.equal(buildRequestKey(null, {}), "");
    assert.equal(buildRequestKey("", {}), "");
    assert.equal(buildRequestKey("/api/test", null), "");
    assert.equal(buildRequestKey("/api/test", "not-an-object"), "");

    let deep = {val: 1};
    for (let i = 0; i < 20; i++) deep = {nested: deep};
    assert.equal(buildRequestKey("/api/deep", deep), "", "depth > 16 should return empty string without throw");
});

test("normalizeRequestError classifies status codes and error types correctly", () => {
    assert.deepEqual(normalizeRequestError({status: 401}), {kind: "unauthorized", status: 401});
    assert.deepEqual(normalizeRequestError({status: 403}), {kind: "forbidden", status: 403});
    assert.deepEqual(normalizeRequestError({status: 502}), {kind: "server", status: 502});
    assert.deepEqual(normalizeRequestError({status: 503}), {kind: "server", status: 503});
    assert.deepEqual(normalizeRequestError({status: 404}), {kind: "http", status: 404});
    assert.deepEqual(normalizeRequestError({status: 422}), {kind: "http", status: 422});
    assert.deepEqual(normalizeRequestError(new SyntaxError("Unexpected token")), {kind: "invalid_response", status: undefined});
    assert.deepEqual(normalizeRequestError(new Error("invalid_json")), {kind: "invalid_response", status: undefined});
    assert.deepEqual(normalizeRequestError(new TypeError("Failed to fetch")), {kind: "network", status: undefined});
    assert.deepEqual(normalizeRequestError(null, false, true), {kind: "aborted", status: undefined});
    assert.deepEqual(normalizeRequestError(null, true, false), {kind: "timeout", status: undefined});
    assert.deepEqual(normalizeRequestError({kind: "stale"}), {kind: "stale", status: undefined});
    assert.deepEqual(normalizeRequestError(new Error("opaque")), {kind: "failed", status: undefined});
});

test("same-key reads share an in-flight request only within the same cancellation context", async () => {
    const service = createRequestService();
    let resolve;
    let calls = 0;
    const execute = () => {
        calls += 1;
        return new Promise((done) => { resolve = done; });
    };
    const first = service.request({key: "read:a", dedupe: true, execute});
    const shared = service.request({key: "read:a", dedupe: true, execute});
    await delay(0);
    assert.equal(calls, 1);
    resolve({items: [1]});
    assert.deepEqual(await first, {ok: true, value: {items: [1]}, attempts: 1});
    assert.deepEqual(await shared, {ok: true, value: {items: [1]}, attempts: 1});
    assert.equal(service.snapshot().inFlight, 0);
});

test("deduplicated requests clear inFlight tracking on failure", async () => {
    const service = createRequestService();
    let reject;
    const execute = () => new Promise((_, rej) => { reject = rej; });
    const first = service.request({key: "read:fail", dedupe: true, execute});
    assert.equal(service.snapshot().inFlight, 1);
    await delay(0);
    reject(new Error("fail"));
    const result = await first;
    assert.equal(result.ok, false);
    assert.equal(service.snapshot().inFlight, 0);
});

test("latest request result wins for an explicitly shared scope", async () => {
    const service = createRequestService();
    let resolveOld;
    const oldRequest = service.request({latestKey: "search:surface-a", execute: () => new Promise((resolve) => { resolveOld = resolve; })});
    const latest = await service.request({latestKey: "search:surface-a", execute: async () => ["new"]});
    resolveOld(["old"]);
    const stale = await oldRequest;
    assert.deepEqual(latest, {ok: true, value: ["new"], attempts: 1});
    assert.equal(stale.ok, false);
    assert.equal(stale.error.kind, "stale");
});

test("invalidate scope marks pending requests as stale", async () => {
    const service = createRequestService();
    let resolveInFlight;
    const inFlight = service.request({
        latestKey: "search:scope-b",
        execute: () => new Promise((resolve) => { resolveInFlight = resolve; }),
    });
    await delay(0);
    service.invalidate("search:scope-b");
    resolveInFlight(["data"]);
    const result = await inFlight;
    assert.equal(result.ok, false);
    assert.equal(result.error.kind, "stale");
});

test("transient read failures retry only within the configured limit", async () => {
    const service = createRequestService();
    let calls = 0;
    const result = await service.request({
        execute: async () => {
            calls += 1;
            if (calls === 1) throw new TypeError("network disconnected");
            return {code: 0};
        },
        maxRetries: 1,
        retryIf: (error) => ["network", "timeout", "server"].includes(error.kind),
    });
    assert.deepEqual(result, {ok: true, value: {code: 0}, attempts: 2});
    assert.equal(calls, 2);
});

test("maxRetries is clamped to MAX_RETRIES (2)", async () => {
    const service = createRequestService();
    let calls = 0;
    const result = await service.request({
        execute: async () => {
            calls += 1;
            throw new TypeError("persistent failure");
        },
        maxRetries: 10,
    });
    assert.equal(result.ok, false);
    assert.equal(result.attempts, MAX_RETRIES + 1, "maxRetries clamped at 2 gives 3 total attempts");
    assert.equal(calls, 3);
});

test("permission responses are classified and never retried as transient failures", async () => {
    const service = createRequestService();
    let calls = 0;
    const result = await service.request({
        execute: async () => { calls += 1; throw Object.assign(new Error("http_error"), {status: 403}); },
        maxRetries: 2,
    });
    assert.deepEqual(result, {ok: false, error: {kind: "forbidden", status: 403}, attempts: 1});
    assert.equal(calls, 1);
});

test("request deadline settles even when AbortController is unavailable", async () => {
    const service = createRequestService();
    const original = global.AbortController;
    try {
        global.AbortController = undefined;
        const startedAt = Date.now();
        const result = await service.request({execute: () => new Promise(() => {}), timeoutMs: 10});
        assert.equal(result.ok, false);
        assert.equal(result.error.kind, "timeout");
        assert.ok(Date.now() - startedAt < 250, "timeout must settle without relying on request abort support");
    } finally {
        global.AbortController = original;
    }
});

test("aborted requests are not retried", async () => {
    const service = createRequestService();
    const controller = new AbortController();
    let calls = 0;
    const pending = service.request({
        signal: controller.signal,
        execute: () => new Promise(() => { calls += 1; }),
        maxRetries: 2,
    });
    await delay(0);
    controller.abort();
    const result = await pending;
    assert.equal(result.error.kind, "aborted");
    assert.equal(calls, 1);
});
