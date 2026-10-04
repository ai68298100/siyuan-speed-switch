"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {createSnippetStore} = require("../src/snippet-studio-host.js");
const {snippetSnapshotSignature} = require("../src/snippet-studio-model.js");

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

test("snippet store exposes direct native master switch controls without rewriting the list", async () => {
    let flags = {enabledCSS: true, enabledJS: false};
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({url, body: JSON.parse(init.body)});
        if (url === "/api/setting/setSnippet") {
            flags = JSON.parse(init.body);
            return response({ok: true, code: 0, data: null});
        }
        throw new Error(`unexpected ${url}`);
    };
    const store = createSnippetStore({fetchImpl, getSnippetSettings: () => flags});
    assert.deepEqual(store.readSettings(), {enabledCSS: true, enabledJS: false});
    assert.deepEqual(await store.setMaster("css", false), {enabledCSS: false, enabledJS: false});
    assert.deepEqual(store.readSettings(), {enabledCSS: false, enabledJS: false});
    assert.deepEqual(await store.setMaster("js", true), {enabledCSS: false, enabledJS: true});
    assert.deepEqual(calls.map((call) => call.url), [
        "/api/setting/setSnippet", "/api/setting/setSnippet",
    ]);
    await assert.rejects(store.setMaster("html", true), (error) => error.message === "snippet-invalid-master");
    store.dispose();
});

test("snippet store restores the whole snapshot in list-then-settings order and verifies read-back", async () => {
    let current = [row("20260925120000-aaaaaaa")];
    let flags = {enabledCSS: true, enabledJS: false};
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({url, body: JSON.parse(init.body)});
        if (url === "/api/snippet/getSnippet") return response(success(current));
        if (url === "/api/snippet/setSnippet") {
            current = JSON.parse(init.body).snippets;
            return response({ok: true, code: 0, data: null});
        }
        if (url === "/api/setting/setSnippet") {
            flags = JSON.parse(init.body);
            return response({ok: true, code: 0, data: null});
        }
        throw new Error(`unexpected ${url}`);
    };
    const store = createSnippetStore({fetchImpl, getSnippetSettings: () => flags});
    const initial = await store.readSnapshot();
    const next = {
        snippets: [row(initial.snippets[0].id, {name: "Restored", content: "p { color: blue; }", disabledInPublish: false})],
        settings: {enabledCSS: false, enabledJS: true},
    };
    const confirmed = await store.restoreSnapshot(snippetSnapshotSignature(initial), next);
    assert.deepEqual(confirmed, next);
    assert.deepEqual(calls.map((call) => call.url), [
        "/api/snippet/getSnippet", "/api/snippet/getSnippet", "/api/snippet/setSnippet",
        "/api/setting/setSnippet", "/api/snippet/getSnippet",
    ]);
    store.dispose();
});

test("snippet store rejects a stale restore signature before any write", async () => {
    let writes = 0;
    const fetchImpl = async (url) => {
        if (url === "/api/snippet/setSnippet" || url === "/api/setting/setSnippet") writes += 1;
        return response(success([row()]));
    };
    const store = createSnippetStore({fetchImpl, getSnippetSettings: () => ({enabledCSS: true, enabledJS: false})});
    await assert.rejects(
        store.restoreSnapshot("stale-signature", {snippets: [row("new")], settings: {enabledCSS: true, enabledJS: false}}),
        (error) => error.message === "snippet-conflict",
    );
    assert.equal(writes, 0);
    store.dispose();
});

test("snippet store marks a restore as landed when read-back verification diverges", async () => {
    let readCount = 0;
    let current = [row()];
    const fetchImpl = async (url, init) => {
        if (url === "/api/snippet/getSnippet") {
            readCount += 1;
            return response(success(readCount >= 2 ? [row("different")] : current));
        }
        if (url === "/api/snippet/setSnippet") {
            current = JSON.parse(init.body).snippets;
            return response({ok: true, code: 0, data: null});
        }
        if (url === "/api/setting/setSnippet") return response({ok: true, code: 0, data: null});
        throw new Error(`unexpected ${url}`);
    };
    const store = createSnippetStore({fetchImpl, getSnippetSettings: () => ({enabledCSS: true, enabledJS: false})});
    await assert.rejects(
        store.restoreSnapshot(snippetSnapshotSignature({snippets: current, settings: {enabledCSS: true, enabledJS: false}}), {
            snippets: [row("restored")], settings: {enabledCSS: true, enabledJS: false},
        }),
        (error) => error.message === "snippet-restore-unverified" && error.writeLanded === true,
    );
    store.dispose();
});

test("snippet store subscriptions are bounded to the returned unsubscribe", async () => {
    const target = new EventTarget();
    const reasons = [];
    const store = createSnippetStore({getWindow: () => target});
    const unsubscribe = store.subscribe(({reason}) => reasons.push(reason));
    target.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setImmediate(resolve));
    unsubscribe();
    target.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(reasons, ["focus"]);
    store.dispose();
});
