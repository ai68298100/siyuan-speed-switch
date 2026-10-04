"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");

function createHarness(t, fetchImpl) {
    const dom = new JSDOM("<!doctype html><body><div id=\"root\"></div></body>", {url: "https://localhost"});
    dom.window.fetch = fetchImpl;
    global.window = dom.window;
    global.document = dom.window.document;
    global.HTMLElement = dom.window.HTMLElement;
    const originalNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
    Object.defineProperty(global, "navigator", {value: dom.window.navigator, configurable: true});
    global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
    const Module = require("node:module");
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === "siyuan") return {Dialog: class {constructor() { this.element = dom.window.document.createElement("div"); } destroy() {}}, showMessage: () => {}};
        return originalLoad.apply(this, arguments);
    };
    t.after(() => {
        Module._load = originalLoad;
        delete global.window;
        delete global.document;
        delete global.HTMLElement;
        if (originalNavigator) Object.defineProperty(global, "navigator", originalNavigator);
        else delete global.navigator;
        delete global.requestAnimationFrame;
        dom.window.close();
    });
    delete require.cache[require.resolve("../src/snippet-studio-ui.js")];
    return {dom, document: dom.window.document, mountSnippetStudio: require("../src/snippet-studio-ui.js").mountSnippetStudio, i18n: require("../src/i18n/zh-CN.json")};
}

test("studio Gist controls save a masked token, publish with a full link, and remember the snippet mapping", async (t) => {
    const calls = [];
    const {dom, document, mountSnippetStudio, i18n} = createHarness(t, async (url, init) => {
        calls.push({url, init});
        return new Response(JSON.stringify({id: "abcdef123456", html_url: "https://gist.github.com/user/abcdef123456", description: "saved"}), {status: 200});
    });
    let gistState = null;
    const native = {id: "20260925120000-aaaaaaa", name: "Local", type: "css", content: "p{}", enabled: false, disabledInPublish: false};
    const controller = mountSnippetStudio(document.getElementById("root"), {
        i18n,
        objectId: native.id,
        getConfig: () => ({snippet: {enabledCSS: true, enabledJS: true}}),
        store: {read: async () => [native], readSettings: () => ({enabledCSS: true, enabledJS: true}), mutate: async () => [native], dispose: () => {}},
        gist: {load: () => gistState, save: (next) => { gistState = next; }},
    });
    await controller.ready;
    await new Promise((resolve) => setImmediate(resolve));
    const token = document.querySelector(`[aria-label="${i18n.snippetGistToken}"]`);
    const saveToken = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === i18n.snippetGistSaveToken);
    token.value = "ghp_secret";
    saveToken.click();
    assert.equal(gistState.token, "ghp_secret");
    assert.equal(token.value, "", "the persisted token must not remain in the input value");
    const publish = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === i18n.snippetGistPublish);
    publish.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.github.com/gists");
    assert.equal(calls[0].init.headers.Authorization, "Bearer ghp_secret");
    assert.equal(calls[0].init.body.includes("ghp_secret"), false);
    assert.equal(gistState.links[native.id], "https://gist.github.com/user/abcdef123456");
    controller.dispose();
});

const flush = () => new Promise((resolve) => setImmediate(resolve));
const nativeSnippet = {id: "20260925120000-aaaaaaa", name: "Local", type: "css", content: "p{}", enabled: true, disabledInPublish: false};
const remoteUrl = "https://gist.github.com/user/abcdef123456";
const remoteFilename = "siyuan-snippet-" + nativeSnippet.id + ".css";
const remotePayload = (extraFiles = {}) => ({
    id: "abcdef123456", html_url: remoteUrl, description: "Remote description",
    files: {[remoteFilename]: {filename: remoteFilename, content: "p{color:red}"}, ...extraFiles},
});

async function studio(t, fetchImpl, initial = {token: "", links: {}}, session = {}) {
    const harness = createHarness(t, fetchImpl);
    let settings = initial;
    let snippets = [{...nativeSnippet}];
    let writes = 0;
    const controller = harness.mountSnippetStudio(harness.document.getElementById("root"), {
        i18n: harness.i18n, objectId: session.draft ? "" : nativeSnippet.id, session,
        getConfig: () => ({snippet: {enabledCSS: true, enabledJS: true}}),
        store: {
            read: async () => snippets, readSettings: () => ({enabledCSS: true, enabledJS: true}),
            mutate: async (_previous, _action, input) => { writes += 1; snippets = [...snippets, input]; return snippets; },
            dispose: () => {},
        },
        gist: {load: () => settings, save: (next) => { settings = next; }},
    });
    t.after(() => controller.dispose());
    await controller.ready;
    await flush();
    const section = harness.document.querySelector(".sw-studio__gist");
    section.open = true;
    const button = (key) => Array.from(section.querySelectorAll("button")).find((entry) => entry.textContent === harness.i18n[key]);
    const input = (key) => section.querySelector('[aria-label="' + harness.i18n[key] + '"]');
    function enterUrl() {
        const entry = input("snippetGistUrl");
        entry.value = remoteUrl;
        entry.dispatchEvent(new harness.dom.window.Event("input", {bubbles: true}));
    }
    return {...harness, controller, session, section, button, input, enterUrl,
        get settings() { return settings; }, get snippets() { return snippets; }, get writes() { return writes; }};
}

test("public Gist preview shows file states and a local diff without requiring a token", async (t) => {
    const calls = [];
    const view = await studio(t, async (_url, init) => {
        calls.push(init);
        return new Response(JSON.stringify(remotePayload({"note.md": {filename: "note.md", content: "<img src=x onerror=alert(1)>"}})));
    });
    view.enterUrl();
    view.button("snippetGistImportPreview").click();
    await flush();
    assert.equal(calls[0].headers.Authorization, undefined);
    assert.equal(view.section.querySelectorAll(".sw-studio__gist-row.is-ready").length, 1);
    assert.equal(view.section.querySelectorAll(".sw-studio__gist-row.is-muted").length, 1);
    assert.ok(view.section.querySelector(".sw-studio__gist-diff"));
    assert.equal(view.section.querySelectorAll("img").length, 0);
    assert.equal(view.writes, 0);
});

test("importing a same-ID Gist creates a separate disabled draft and remembers the new ID only after saving", async (t) => {
    const view = await studio(t, async () => new Response(JSON.stringify(remotePayload())));
    view.enterUrl();
    view.button("snippetGistImportPreview").click();
    await flush();
    view.button("snippetGistImport").click();
    assert.equal(view.session.draft.id, "");
    assert.equal(view.session.draft.enabled, false);
    assert.equal(view.session.draft.content, "p{color:red}");
    assert.equal(view.snippets[0].enabled, true);
    assert.equal(view.writes, 0);
    assert.deepEqual(view.settings.links, {});
    const save = Array.from(view.document.querySelectorAll("button")).find((entry) => entry.textContent === view.i18n.snippetSaveDisabled);
    save.click();
    await flush();
    assert.equal(view.writes, 1);
    assert.equal(view.snippets.length, 2);
    const saved = view.snippets[1];
    assert.notEqual(saved.id, nativeSnippet.id);
    assert.equal(saved.enabled, false);
    assert.equal(view.settings.links[saved.id], remoteUrl);
    assert.equal(view.settings.links[nativeSnippet.id], undefined);
});

test("Gist update first reads and prefills description, then rechecks before one PATCH", async (t) => {
    const methods = [];
    const view = await studio(t, async (_url, init) => {
        methods.push(init.method);
        if (init.method === "PATCH") assert.equal(JSON.parse(init.body).description, "Remote description");
        return new Response(JSON.stringify(remotePayload()));
    }, {token: "token", links: {[nativeSnippet.id]: remoteUrl}});
    assert.equal(view.input("snippetGistUrl").value, remoteUrl);
    assert.equal(view.input("snippetGistToken").value, "");
    assert.equal(view.input("snippetGistToken").parentElement.hidden, true);
    view.button("snippetGistPrepareUpdate").click();
    await flush();
    assert.deepEqual(methods, ["GET"]);
    assert.equal(view.input("snippetGistDescription").value, "Remote description");
    view.button("snippetGistPublishUpdate").click();
    await flush();
    assert.deepEqual(methods, ["GET", "GET", "PATCH"]);
});

test("a late Gist read cannot replace a draft edited during the request", async (t) => {
    let resolveFetch;
    const view = await studio(t, () => new Promise((resolve) => { resolveFetch = resolve; }));
    view.enterUrl();
    view.button("snippetGistImportPreview").click();
    const editor = view.document.querySelector(".sw-studio__editor");
    editor.value = "p{color:blue}";
    editor.dispatchEvent(new view.dom.window.Event("input", {bubbles: true}));
    resolveFetch(new Response(JSON.stringify(remotePayload())));
    await flush();
    assert.equal(view.session.draft.content, "p{color:blue}");
    assert.equal(view.section.querySelectorAll(".sw-studio__gist-row").length, 0);
    assert.equal(view.section.querySelector(".sw-studio__gist-preview").textContent, "");
    assert.match(view.document.querySelector(".sw-studio__status").textContent, /读取/);
});

test("cancelled or disposed Gist requests discard late responses and release busy state", async (t) => {
    let resolveFetch;
    const view = await studio(t, () => new Promise((resolve) => { resolveFetch = resolve; }));
    view.enterUrl();
    view.button("snippetGistImportPreview").click();
    view.button("snippetAICancel").click();
    assert.equal(view.document.querySelector(".sw-studio__layout").getAttribute("aria-busy"), "false");
    resolveFetch(new Response(JSON.stringify(remotePayload())));
    await flush();
    assert.equal(view.section.querySelectorAll(".sw-studio__gist-row").length, 0);
    view.button("snippetGistImportPreview").click();
    view.controller.dispose();
    resolveFetch(new Response(JSON.stringify(remotePayload())));
    await flush();
    assert.equal(view.writes, 0);
    assert.equal(view.section.querySelectorAll(".sw-studio__gist-row").length, 0);
});

test("a cancelled Gist publish reports uncertain remote state and never saves a late mapping", async (t) => {
    let resolveFetch;
    const view = await studio(t, () => new Promise((resolve) => { resolveFetch = resolve; }), {token: "token", links: {}});
    view.button("snippetGistPublish").click();
    view.button("snippetAICancel").click();
    assert.equal(view.document.querySelector(".sw-studio__status").textContent, view.i18n.snippetGistPending);
    resolveFetch(new Response(JSON.stringify(remotePayload())));
    await flush();
    assert.deepEqual(view.settings.links, {});
});

test("restored imported sessions keep their source link and Gist token clearing leaves links intact", async (t) => {
    const view = await studio(t, async () => { throw new Error("unexpected request"); },
        {token: "token", links: {[nativeSnippet.id]: remoteUrl}},
        {draft: {name: "Imported", type: "css", content: "p{}", enabled: false}, gistSourceUrl: remoteUrl});
    assert.equal(view.input("snippetGistUrl").value, remoteUrl);
    view.button("snippetGistClearToken").click();
    assert.equal(view.settings.token, "");
    assert.equal(view.settings.links[nativeSnippet.id], remoteUrl);
    assert.equal(view.input("snippetGistToken").parentElement.hidden, false);
});
