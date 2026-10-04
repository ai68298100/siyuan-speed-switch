"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    GIST_FILE_MAX_BYTES, GIST_REMOTE_RESPONSE_MAX_BYTES, buildGistDescription, buildGistFileName,
    buildGistImportDraft, buildGistPublishBody, buildGistRequest, buildGistImportPreview, fetchGistPreview,
    maskGistToken, normalizeGistSettings, parseGistUrl, publishGist, rememberGistLink,
} = require("../src/snippet-gist.js");

const snippet = {id: "20260925120000-aaaaaaa", name: "Focus / layout", type: "css", content: "p { color: red; }"};
const filename = "siyuan-snippet-20260925120000-aaaaaaa.css";
const webUrl = "https://gist.github.com/user/abcdef123456";
const payload = (files = {[filename]: {filename, content: "p{}"}}, extra = {}) => ({
    id: "abcdef123456", html_url: webUrl, description: "Remote", files, ...extra,
});
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers});

test("gist URLs accept complete canonical HTTPS links and reject authority or path tricks", () => {
    assert.deepEqual(parseGistUrl(webUrl), {id: "abcdef123456", url: webUrl, apiUrl: "https://api.github.com/gists/abcdef123456"});
    assert.equal(parseGistUrl(" https://gist.github.com/ABCDEF12/ ").url, "https://gist.github.com/ABCDEF12");
    for (const url of [
        "http://gist.github.com/abcdef12", "https://evil.example/abcdef12", "https://gist.github.com@evil.example/abcdef12",
        "https://user:secret@gist.github.com/abcdef12", "https://gist.github.com:443/abcdef12",
        webUrl + "?token=secret", webUrl + "#file", webUrl + "/raw", "https://gist.github.com/%61bcdef12",
        "https://gist.github.com/zyxwvuts", "https://gist.github.com/abcdef1", "https://gist.github.com/" + "a".repeat(65),
    ]) assert.equal(parseGistUrl(url), null, url);
});

test("gist request confines token to Authorization and disables credentials, redirects and referrers", () => {
    const init = buildGistRequest({token: "ghp_secret", method: "POST", body: {description: "safe"}});
    assert.equal(init.headers.Authorization, "Bearer ghp_secret");
    assert.equal(init.body, '{"description":"safe"}');
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(buildGistRequest().headers.Authorization, undefined);
    for (const token of ["a b", "abc\n", "x".repeat(513)]) assert.throws(() => buildGistRequest({token}), /gist-token-invalid/);
    assert.throws(() => buildGistRequest({method: "POST"}), /gist-token-required/);
    assert.throws(() => buildGistRequest({method: "DELETE"}), /gist-request-invalid/);
});

test("gist settings bound links, reject invalid tokens without truncation and mask saved credentials", () => {
    const normalized = normalizeGistSettings({token: "  ghp_secret  ", links: {[snippet.id]: webUrl, bad: "https://gist.github.com/nope"}});
    assert.equal(normalized.token, "ghp_secret");
    assert.deepEqual(normalized.links, {[snippet.id]: webUrl});
    assert.equal(maskGistToken(normalized.token), "••••cret");
    assert.equal(maskGistToken("tiny"), "••••");
    assert.equal(normalizeGistSettings({token: "x".repeat(513)}).token, "");
    assert.equal(normalizeGistSettings({token: "a\nb"}).token, "");
    const entries = Object.fromEntries(Array.from({length: 300}, (_, index) => ["20260925120000-" + String(index).padStart(7, "0"), webUrl]));
    const bounded = normalizeGistSettings({links: entries});
    assert.equal(Object.keys(bounded.links).length, 256);
    const updated = rememberGistLink(bounded, snippet.id, webUrl);
    assert.equal(Object.keys(updated.links).length, 256);
    assert.equal(updated.links[snippet.id], webUrl);
    assert.equal(updated.links["20260925120000-0000000"], undefined);
});

test("Gist credentials and links are excluded from configuration export and import", () => {
    const {buildConfigPack, normalizeConfigPackImport} = require("../src/config-pack-model.js");
    const snippetGist = {token: "ghp_secret", links: {[snippet.id]: webUrl}};
    const exported = buildConfigPack({snippetGist, density: "compact"});
    assert.equal(JSON.stringify(exported).includes("ghp_secret"), false);
    assert.equal(Object.hasOwn(exported.settings, "snippetGist"), false);
    const imported = normalizeConfigPackImport({...exported, settings: {...exported.settings, snippetGist}});
    assert.equal(Object.hasOwn(imported.settings, "snippetGist"), false);
});

test("publish body uses stable filenames and explicit unlisted visibility", () => {
    assert.equal(buildGistFileName(snippet), filename);
    assert.deepEqual(buildGistPublishBody(snippet, "My note"), {
        description: "My note", public: false, files: {[filename]: {content: snippet.content}},
    });
    assert.equal(buildGistFileName({...snippet, name: "Renamed"}), filename);
    assert.equal(buildGistDescription("x".repeat(1000)).length, 256);
    assert.equal(buildGistDescription(" hello\nworld "), "hello world");
    for (const bad of [{...snippet, type: "html"}, {...snippet, id: "../oops"}, {...snippet, content: ""}, {...snippet, content: "\0"}]) {
        assert.throws(() => buildGistPublishBody(bad), /gist-snippet-invalid/);
    }
    assert.throws(() => buildGistPublishBody({...snippet, content: "界".repeat(GIST_FILE_MAX_BYTES / 3 + 1)}), /gist-file-too-large/);
});

test("gist preview imports a new disabled draft even when the remote ID is local and enabled", () => {
    const preview = buildGistImportPreview(payload());
    const draft = buildGistImportDraft(preview);
    assert.deepEqual(draft, {name: "Remote", type: "css", content: "p{}", enabled: false,
        disabledInPublish: false, sourceUrl: webUrl, remoteId: snippet.id});
    assert.equal(Object.hasOwn(draft, "id"), false);
    const withNotes = buildGistImportPreview(payload({[filename]: {filename, content: "p{}"}, notes: {filename: "notes.md", content: "info"}}));
    assert.equal(buildGistImportDraft(withNotes).name, "Remote");
    assert.throws(() => buildGistImportDraft(preview, 1), /gist-file-not-parseable/);
});

test("gist file acceptance matrix covers type, UTF-8 size, metadata size, truncation and invalid contents", () => {
    const cases = [
        {content: "p{}", parseable: true}, {content: "", parseable: false},
        {content: "p\0{}", parseable: false}, {content: "p{}", truncated: true, parseable: false},
        {content: "p{}", size: GIST_FILE_MAX_BYTES + 1, parseable: false},
        {content: "界".repeat(22000), parseable: false},
        {content: "x".repeat(GIST_FILE_MAX_BYTES), parseable: true},
        {content: "x".repeat(GIST_FILE_MAX_BYTES + 1), parseable: false},
    ];
    let checked = 0;
    for (const type of ["css", "js", "CSS", "JS"]) {
        for (const prefix of ["plain", "中文", "siyuan-snippet-20260925120000-aaaaaaa", "siyuan-snippet-20260925120000-aaaaaaa-old",
            "a".repeat(110), "file/name", "bad\nname", "file\\name"]) {
            for (const scenario of cases) {
                const name = prefix + "." + type;
                const preview = buildGistImportPreview(payload({[name]: {filename: name, ...scenario}}));
                const validName = name.length <= 120 && !/[\n/\\]/.test(prefix);
                assert.equal(preview.files[0].parseable, scenario.parseable && validName, name + " " + JSON.stringify({truncated: scenario.truncated, size: scenario.size, length: scenario.content.length}));
                if (preview.parseable.length) {
                    const draft = buildGistImportDraft(preview);
                    assert.equal(draft.enabled, false);
                    assert.equal(draft.id, undefined);
                    assert.equal(draft.type, type.toLowerCase());
                }
                checked += 1;
            }
        }
    }
    assert.equal(checked, 256);
});

test("gist previews show unsupported files but reject malformed payloads or excessive file counts", () => {
    const preview = buildGistImportPreview(payload({"notes.md": {filename: "notes.md", content: "text"}}));
    assert.equal(preview.files[0].reason, "unsupported-type");
    assert.equal(preview.parseable.length, 0);
    for (const extra of [{files: null}, {files: {}}, {id: "not-a-gist"}, {html_url: "https://evil.example/abcdef123456"},
        {html_url: "https://gist.github.com/abcdef12"}, {files: Array(3)}]) {
        assert.throws(() => buildGistImportPreview(payload(undefined, extra)), /gist-invalid-response/);
    }
    const files = Object.fromEntries(Array.from({length: 33}, (_, index) => ["file" + index, {filename: "file.css", content: "p{}"}]));
    assert.throws(() => buildGistImportPreview(payload(files)), /gist-invalid-response/);
});

test("unauthenticated public gist reads force GET and reject mismatched remote identities", async () => {
    const preview = await fetchGistPreview(webUrl, {method: "POST", body: {bad: true}, fetchImpl: async (url, init) => {
        assert.equal(url, "https://api.github.com/gists/abcdef123456");
        assert.equal(init.method, "GET");
        assert.equal(init.body, undefined);
        assert.equal(init.headers.Authorization, undefined);
        return response(payload());
    }});
    assert.equal(preview.url, webUrl);
    await assert.rejects(fetchGistPreview(webUrl, {fetchImpl: async () => response(payload(undefined, {id: "abcdef12", html_url: "https://gist.github.com/abcdef12"}))}), /gist-invalid-response/);
});

test("updates re-read the expected snapshot and patch only the matching snippet file", async () => {
    const oldName = "siyuan-snippet-" + snippet.id + "-Old.css";
    const remote = payload({[oldName]: {filename: oldName, content: "p{}"}, "notes.md": {filename: "notes.md", content: "other"}});
    const expected = buildGistImportPreview(remote);
    const calls = [];
    const result = await publishGist({token: "ghp_secret", snippet, gistUrl: webUrl, description: "Saved", expected, fetchImpl: async (url, init) => {
        calls.push({url, init});
        return response(init.method === "GET" ? remote : {id: remote.id, html_url: webUrl, description: "Saved"});
    }});
    assert.deepEqual(calls.map((call) => call.init.method), ["GET", "PATCH"]);
    assert.equal(calls[1].url, "https://api.github.com/gists/abcdef123456");
    assert.deepEqual(JSON.parse(calls[1].init.body), {description: "Saved", files: {[filename]: {content: snippet.content}, [oldName]: null}});
    assert.equal(calls[1].init.headers.Authorization, "Bearer ghp_secret");
    assert.equal(calls[1].init.body.includes("ghp_secret"), false);
    assert.equal(result.mode, "update");
    assert.equal(result.url, webUrl);
});

test("updates accept file key reordering but reject any intervening remote content change", async () => {
    const files = {[filename]: {filename, content: "p{}"}, "note.txt": {filename: "note.txt", content: "old"}};
    const expected = buildGistImportPreview(payload(files));
    await publishGist({token: "token", snippet, gistUrl: webUrl, expected, fetchImpl: async (_url, init) =>
        response(init.method === "GET" ? payload(Object.fromEntries(Object.entries(files).reverse())) : payload())});
    for (const remote of [payload({...files, "note.txt": {filename: "note.txt", content: "changed"}}),
        payload(files, {description: "changed"}), payload(files, {updated_at: "later"})]) {
        const methods = [];
        await assert.rejects(publishGist({token: "token", snippet, gistUrl: webUrl, expected, fetchImpl: async (_url, init) => {
            methods.push(init.method); return response(remote);
        }}), /gist-conflict/);
        assert.deepEqual(methods, ["GET"]);
    }
});

test("updates refuse arbitrary, ambiguous or truncated matching files with zero writes", async () => {
    for (const files of [
        {"plain.css": {filename: "plain.css", content: "p{}"}},
        {[filename]: {filename, content: "p{}", truncated: true}},
        {[filename]: {filename, content: "p{}"}, old: {filename: "siyuan-snippet-" + snippet.id + "-old.css", content: "p{}"}},
    ]) {
        const remote = payload(files);
        const methods = [];
        await assert.rejects(publishGist({token: "token", snippet, gistUrl: webUrl, expected: buildGistImportPreview(remote), fetchImpl: async (_url, init) => {
            methods.push(init.method); return response(remote);
        }}), /gist-file-not-owned/);
        assert.deepEqual(methods, ["GET"]);
    }
});

test("new gist publishing returns the complete link and never retries an uncertain write", async () => {
    let calls = 0;
    const created = await publishGist({token: "token", snippet, fetchImpl: async (url, init) => {
        assert.equal(url, "https://api.github.com/gists");
        assert.equal(init.method, "POST");
        return response(payload());
    }});
    assert.equal(created.mode, "create");
    await assert.rejects(publishGist({token: "token", snippet, fetchImpl: async () => {
        calls += 1; throw new Error("gist-ghp-secret");
    }}), /^Error: gist-request-failed$/);
    assert.equal(calls, 1);
});

for (const [status, code] of [[401, "gist-auth-failed"], [403, "gist-access-denied"], [429, "gist-access-denied"], [404, "gist-not-found"], [500, "gist-request-failed"]]) {
    test("HTTP " + status + " returns a fixed redacted Gist error", async () => {
        await assert.rejects(fetchGistPreview(webUrl, {fetchImpl: async () => response({message: "secret"}, status)}), new RegExp("^Error: " + code + "$"));
    });
}

test("declared and streamed response limits cancel the body before importing", async () => {
    let declaredCancelled = false;
    await assert.rejects(fetchGistPreview(webUrl, {fetchImpl: async () => new Response(new ReadableStream({
        cancel() { declaredCancelled = true; },
    }), {headers: {"Content-Length": String(GIST_REMOTE_RESPONSE_MAX_BYTES + 1)}})}), /gist-response-too-large/);
    assert.equal(declaredCancelled, true);
    let streamCancelled = false;
    await assert.rejects(fetchGistPreview(webUrl, {fetchImpl: async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(GIST_REMOTE_RESPONSE_MAX_BYTES + 1)); },
        cancel() { streamCancelled = true; },
    }))}), /gist-response-too-large/);
    assert.equal(streamCancelled, true);
});

test("request timeout cancels stalled body reads and suppresses ignored late fetch responses", async () => {
    let bodyCancelled = false;
    await assert.rejects(fetchGistPreview(webUrl, {timeoutMs: 15, fetchImpl: async () => new Response(new ReadableStream({
        cancel() { bodyCancelled = true; },
    }))}), /gist-timeout/);
    assert.equal(bodyCancelled, true);
    let resolveFetch;
    let lateCancelled = false;
    const result = fetchGistPreview(webUrl, {timeoutMs: 15, fetchImpl: () => new Promise((resolve) => { resolveFetch = resolve; })});
    await assert.rejects(result, /gist-timeout/);
    resolveFetch(new Response(new ReadableStream({cancel() { lateCancelled = true; }})));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(lateCancelled, true);
});

test("caller cancellation aborts both fetch and body with no subsequent work", async () => {
    const controller = new AbortController();
    let called = false;
    controller.abort();
    await assert.rejects(fetchGistPreview(webUrl, {signal: controller.signal, fetchImpl: async () => { called = true; return response(payload()); }}), /gist-cancelled/);
    assert.equal(called, false);
    const active = new AbortController();
    let bodyCancelled = false;
    const pending = fetchGistPreview(webUrl, {signal: active.signal, fetchImpl: async () => new Response(new ReadableStream({cancel() { bodyCancelled = true; }}))});
    await new Promise((resolve) => setImmediate(resolve));
    active.abort();
    await assert.rejects(pending, /gist-cancelled/);
    assert.equal(bodyCancelled, true);
});

test("invalid JSON is rejected without returning raw server text", async () => {
    await assert.rejects(fetchGistPreview(webUrl, {fetchImpl: async () => new Response("token=secret")}), /^Error: gist-invalid-response$/);
});
