"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {createSnippetStore} = require("../src/snippet-studio-host.js");

const row = (id = "20260925120000-aaaaaaa", extra = {}) => ({
    id, name: "Local CSS", type: "css", content: "p { color: red; }", enabled: false, ...extra,
});
const success = (snippets) => ({ok: true, code: 0, data: {snippets}});
const response = (value) => new Response(JSON.stringify(value), {headers: {"Content-Type": "application/json"}});

test("snippet store uses native list/config endpoints and projects strict wire fields", async () => {
    const baseline = row("20260925120000-aaaaaaa", {future: {revision: 1}});
    let current = [baseline];
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({url, body: JSON.parse(init.body)});
        if (url === "/api/snippet/getSnippet") return response(success(current));
        if (url === "/api/snippet/setSnippet") {
            current = JSON.parse(init.body).snippets;
            return response({ok: true, code: 0, data: null});
        }
        if (url === "/api/setting/setSnippet") return response({ok: true, code: 0, data: null});
        throw new Error(`unexpected ${url}`);
    };
    const store = createSnippetStore({fetchImpl, getSnippetSettings: () => ({enabledCSS: true, enabledJS: false})});
    const initial = await store.read();
    const next = await store.mutate(initial[0], "save", {...initial[0], name: "Edited"});
    assert.equal(next[0].name, "Edited");
    assert.deepEqual(calls.map((call) => call.url), [
        "/api/snippet/getSnippet", "/api/snippet/getSnippet", "/api/snippet/setSnippet",
        "/api/setting/setSnippet", "/api/snippet/getSnippet",
    ]);
    const write = calls.find((call) => call.url === "/api/snippet/setSnippet");
    assert.deepEqual(write.body.snippets[0], {
        id: baseline.id, name: "Edited", type: "css", content: baseline.content,
        enabled: false, disabledInPublish: false,
    });
    assert.deepEqual(calls.find((call) => call.url === "/api/setting/setSnippet").body, {enabledCSS: true, enabledJS: false});
    store.dispose();
});

test("snippet store turns an uncooperative request into a timeout error", async () => {
    const store = createSnippetStore({timeoutMs: 10, fetchImpl: () => new Promise(() => {})});
    await assert.rejects(store.read(), (error) => error.message === "timeout");
    store.dispose();
});

test("snippet store refuses a mutation before writing when native flags are unavailable", async () => {
    let writes = 0;
    const fetchImpl = async (url) => {
        if (url === "/api/snippet/setSnippet") writes += 1;
        return response(success([row()]));
    };
    const store = createSnippetStore({fetchImpl, getSnippetSettings: () => ({})});
    const baseline = row();
    await assert.rejects(store.mutate(baseline, "save", {...baseline, name: "Edited"}),
        (error) => error.message === "snippet-config-unavailable");
    assert.equal(writes, 0);
    store.dispose();
});
