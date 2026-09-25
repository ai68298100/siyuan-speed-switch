"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SNIPPET_CODE_MAX, parseSnippetImport, readNativeSnippetResponse,
    buildSnippetMutation, projectSnippetListForWire, BUILTIN_SNIPPETS, filterSnippetCatalog,
} = require("../src/snippet-studio-model.js");

const native = (suffix = "aaaaaaa", overrides = {}) => ({
    id: `20260925120000-${suffix}`, name: "Local CSS", type: "css", content: "p { color: red; }", enabled: false, ...overrides,
});
const response = (snippets) => ({code: 0, data: {snippets}});

test("snippet import: CSS/JS files become disabled drafts without executing code", () => {
    assert.deepEqual(parseSnippetImport("C:\\drafts\\Spacious.CSS", "\uFEFFp { margin: 1em; }"), {
        name: "Spacious", type: "css", content: "p { margin: 1em; }", enabled: false,
    });
    const source = "globalThis.__swssSnippetShouldNeverExecute = true;";
    assert.deepEqual(parseSnippetImport("/drafts/sample.js", source), {name: "sample", type: "js", content: source, enabled: false});
    assert.equal(globalThis.__swssSnippetShouldNeverExecute, undefined);
});

test("snippet import: rejects unsupported filenames, empty code and invalid types", () => {
    for (const name of ["sample.json", "sample.css.txt", ".css", "bad\u0000.js"]) {
        assert.throws(() => parseSnippetImport(name, "/* draft */"));
    }
    for (const code of ["", "  \n ", "p\u0000 {}", null, 1]) assert.throws(() => parseSnippetImport("sample.css", code));
    assert.throws(() => parseSnippetImport(null, "p {}"));
});

test("snippet import: enforces 65536 UTF-8 bytes including multibyte characters", () => {
    assert.equal(SNIPPET_CODE_MAX, 65536);
    assert.equal(parseSnippetImport("ascii.js", "x".repeat(65536)).content.length, 65536);
    assert.throws(() => parseSnippetImport("ascii.js", "x".repeat(65537)), /snippet-code-too-large/);
    assert.equal(parseSnippetImport("chinese.css", "字".repeat(21845) + "x").content.length, 21846);
    assert.throws(() => parseSnippetImport("chinese.css", "字".repeat(21846)), /snippet-code-too-large/);
    assert.throws(() => parseSnippetImport("emoji.js", "😀".repeat(16385)), /snippet-code-too-large/);
});

test("native snippet response: empty success is distinct from unreadable data", () => {
    assert.deepEqual(readNativeSnippetResponse(response([])), []);
    for (const payload of [null, [], {}, {code: 1, data: {snippets: []}}, {code: "0", data: {snippets: []}}, {code: 0}, {code: 0, data: {}}, response(null)]) {
        assert.throws(() => readNativeSnippetResponse(payload));
    }
});

test("native snippet response: validates every row and rejects duplicate IDs", () => {
    for (const invalid of [null, {}, native("aaaaaaa", {id: ""}), native("aaaaaaa", {id: "bad\n"}), native("aaaaaaa", {name: 3}), native("aaaaaaa", {content: null}), native("aaaaaaa", {type: "html"}), native("aaaaaaa", {enabled: "true"}), native("aaaaaaa", {disabledInPublish: 1})]) {
        assert.throws(() => readNativeSnippetResponse(response([native("bbbbbbb"), invalid])), /snippet-invalid-data/);
    }
    assert.throws(() => readNativeSnippetResponse(response([native(), native()])), /snippet-duplicate-id/);
});

test("native snippet response: preserves legacy IDs, big content and unknown fields without aliases", () => {
    const original = native("aaaaaaa", {id: "legacy-snippet", content: "x".repeat(70000), disabledInPublish: true, future: {values: [1, "x"]}});
    const output = readNativeSnippetResponse(response([original]));
    assert.deepEqual(output, [original]);
    output[0].future.values.push(2);
    assert.deepEqual(original.future.values, [1, "x"]);
    assert.throws(() => readNativeSnippetResponse(response([native("aaaaaaa", {future: () => 1})])), /snippet-invalid-data/);
});

test("native write projection sends only fields accepted by the 3.8.5 kernel", () => {
    const row = native("aaaaaaa", {future: {mode: 2}, disabledInPublish: true});
    const legacy = native("bbbbbbb", {future: "future metadata"});
    assert.deepEqual(projectSnippetListForWire([row, legacy]), [
        {id: row.id, name: row.name, type: row.type, content: row.content, enabled: row.enabled, disabledInPublish: true},
        {id: legacy.id, name: legacy.name, type: legacy.type, content: legacy.content, enabled: legacy.enabled, disabledInPublish: false},
    ]);
    assert.equal(row.future.mode, 2);
});

test("snippet save: merges only the selected row into freshly read native data", () => {
    const baseline = native("aaaaaaa", {disabledInPublish: true, future: {color: "blue"}});
    const other = native("bbbbbbb", {name: "Changed elsewhere", content: "div {}", enabled: true});
    const latest = [other, baseline, native("ccccccc")];
    const snapshot = structuredClone(latest);
    const updated = buildSnippetMutation(latest, baseline, "save", {...baseline, name: "Edited", content: "p { color: blue; }", future: {color: "ignored"}});
    assert.deepEqual(updated.map((item) => item.id), latest.map((item) => item.id));
    assert.deepEqual(updated[0], other);
    assert.deepEqual(updated[2], latest[2]);
    assert.equal(updated[1].name, "Edited");
    assert.equal(updated[1].content, "p { color: blue; }");
    assert.equal(updated[1].disabledInPublish, true);
    assert.deepEqual(updated[1].future, {color: "blue"});
    assert.deepEqual(latest, snapshot);
    updated[1].future.color = "green";
    assert.equal(baseline.future.color, "blue");
});

test("snippet mutations: reject external target edits for save, toggle and delete", () => {
    const baseline = native("aaaaaaa", {future: {revision: 1}});
    const changes = [{name: "Renamed externally"}, {content: "div {}"}, {enabled: true}, {disabledInPublish: true}, {future: {revision: 2}}];
    for (const action of ["save", "toggle", "delete"]) {
        for (const change of changes) {
            assert.throws(() => buildSnippetMutation([{...baseline, ...change}], baseline, action, {...baseline, enabled: true}), /snippet-conflict/);
        }
        assert.throws(() => buildSnippetMutation([], baseline, action, baseline), /snippet-conflict/);
    }
});

test("snippet mutations: object key order changes do not create false conflicts", () => {
    const baseline = native("aaaaaaa", {future: {one: 1, two: 2}});
    const reordered = {future: {two: 2, one: 1}, enabled: baseline.enabled, content: baseline.content, type: baseline.type, name: baseline.name, id: baseline.id};
    assert.equal(buildSnippetMutation([reordered], baseline, "toggle", {enabled: true})[0].enabled, true);
});

test("snippet toggle: changes only enabled and preserves all unrelated content", () => {
    const baseline = native("aaaaaaa", {content: "x".repeat(70000), disabledInPublish: true, future: {mode: 2}});
    const latest = [native("bbbbbbb"), baseline];
    const result = buildSnippetMutation(latest, baseline, "toggle", {enabled: true, content: "ignored"});
    assert.deepEqual(result[0], latest[0]);
    assert.deepEqual(result[1], {...baseline, enabled: true});
    assert.equal(baseline.enabled, false);
    assert.throws(() => buildSnippetMutation(latest, baseline, "toggle", {enabled: 1}), /snippet-invalid-draft/);
    assert.throws(() => buildSnippetMutation(latest, baseline, "toggle", {enabled: true, id: "other"}), /snippet-id-mismatch/);
});

test("snippet delete: removes exactly the selected row and leaves original array intact", () => {
    const baseline = native("bbbbbbb");
    const latest = [native("aaaaaaa"), baseline, native("ccccccc")];
    assert.deepEqual(buildSnippetMutation(latest, baseline, "delete"), [latest[0], latest[2]]);
    assert.equal(latest.length, 3);
});

test("snippet create: rejects collisions and requires a new host-shaped ID", () => {
    assert.throws(() => buildSnippetMutation([native()], null, "save", native()), /snippet-conflict/);
    for (const id of ["legacy", "swss-builtin-font", "20260925120000-ABCDE12", "20260925120000-aaaaaa"]) {
        assert.throws(() => buildSnippetMutation([], null, "save", native("aaaaaaa", {id})), /snippet-invalid-new-id/);
    }
    const created = buildSnippetMutation([], null, "save", native("aaaaaaa", {disabledInPublish: true, source: "import"}));
    assert.deepEqual(created, [native("aaaaaaa", {disabledInPublish: true})]);
});

test("snippet create: preserves native ordering while inserting CSS and JS partitions", () => {
    const css = native("aaaaaaa");
    const js = native("bbbbbbb", {type: "js", content: "console.log(1)"});
    const newCss = native("ccccccc");
    const newJs = native("ddddddd", {type: "js", content: "console.log(2)"});
    assert.deepEqual(buildSnippetMutation([css, js], null, "save", newCss).map((item) => item.id), [newCss.id, css.id, js.id]);
    assert.deepEqual(buildSnippetMutation([css, js], null, "save", newJs).map((item) => item.id), [css.id, newJs.id, js.id]);
    assert.deepEqual(buildSnippetMutation([css], null, "save", newJs).map((item) => item.id), [css.id, newJs.id]);
});

test("snippet save: rejects oversized drafts, ID substitution and malformed mutation inputs", () => {
    const baseline = native();
    assert.throws(() => buildSnippetMutation([baseline], baseline, "save", {...baseline, content: "字".repeat(21846)}), /snippet-code-too-large/);
    assert.throws(() => buildSnippetMutation([baseline], baseline, "save", native("bbbbbbb")), /snippet-id-mismatch/);
    assert.throws(() => buildSnippetMutation([baseline], baseline, "save", null), /snippet-invalid-draft/);
    assert.throws(() => buildSnippetMutation([baseline], baseline, "activate", baseline), /snippet-invalid-action/);
    assert.throws(() => buildSnippetMutation([], null, "delete"), /snippet-missing-baseline/);
    assert.throws(() => buildSnippetMutation(null, null, "save", native()), /snippet-invalid-data/);
});

test("snippet catalog: ships five inert original CSS examples with complete categories", () => {
    assert.equal(BUILTIN_SNIPPETS.length, 5);
    assert.equal(new Set(BUILTIN_SNIPPETS.map((entry) => entry.id)).size, 5);
    assert.deepEqual(BUILTIN_SNIPPETS.map((entry) => entry.category), ["typography", "table", "focus", "code", "font"]);
    for (const entry of BUILTIN_SNIPPETS) {
        assert.equal(entry.type, "css");
        assert.equal(entry.source, "builtin");
        assert.equal(typeof entry.nameKey, "string");
        assert.equal(typeof entry.descriptionKey, "string");
        assert.equal(parseSnippetImport(`${entry.id}.css`, entry.content).enabled, false);
        assert.equal(Object.isFrozen(entry), true);
        assert.ok(entry.content.includes(".protyle-wysiwyg"));
    }
    assert.equal(Object.isFrozen(BUILTIN_SNIPPETS), true);
});

test("snippet catalog: combines localized keyword, source, type and category filters", () => {
    const catalog = [...BUILTIN_SNIPPETS, {id: "local-one", name: "CUSTOM 字体", description: "Test description", content: "console.log(1)", category: "font", type: "js", source: "native"}];
    assert.equal(filterSnippetCatalog(catalog).length, 6);
    assert.deepEqual(filterSnippetCatalog(catalog, {source: "native", type: "js", category: "font", query: "custom 字体"}).map((item) => item.id), ["local-one"]);
    assert.deepEqual(filterSnippetCatalog(catalog, {source: "builtin", type: "css", category: "font"}).map((item) => item.id), ["swss-builtin-font"]);
    assert.equal(filterSnippetCatalog(catalog, {query: " GEORGIA ", source: "builtin"}).length, 1);
    assert.equal(filterSnippetCatalog(catalog, {query: "unfindable"}).length, 0);
    assert.equal(filterSnippetCatalog(catalog, {source: "all", type: "all", category: "all"}).length, 6);
    assert.deepEqual(filterSnippetCatalog(null), []);
});
