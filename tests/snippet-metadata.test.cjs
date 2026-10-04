const test = require("node:test");
const assert = require("node:assert/strict");
const {normalizeSnippetGroupStore, setSnippetMetadata, snippetMetadataSignature, projectSnippetMetadata, reconcileSnippetGroups} = require("../src/snippet-groups.js");
const {filterSnippetCatalog} = require("../src/snippet-studio-model.js");

test("snippet metadata cleans bounded sidecar fields without duplicating native state", () => {
    const entries = Array.from({length: 300}, (_, index) => ({snippetId: `s-${index}`, alias: "A".repeat(100),
        summary: "B".repeat(400), tags: Array.from({length: 50}, (_, tag) => `tag-${tag}`), pinned: true,
        modifiedAt: Infinity, content: "secret", enabled: true}));
    const store = normalizeSnippetGroupStore({version: 1, metadata: {version: 1, entries}});
    assert.equal(store.metadata.entries.length, 256);
    const entry = store.metadata.entries[0];
    assert.equal(entry.alias.length, 64);
    assert.equal(entry.summary.length, 256);
    assert.equal(entry.tags.length, 8);
    assert.equal(entry.modifiedAt, 0);
    assert.equal(Object.hasOwn(entry, "content"), false);
    assert.equal(Object.hasOwn(entry, "enabled"), false);
    assert.ok(Object.isFrozen(entry.tags));
    assert.equal(normalizeSnippetGroupStore({version: 1, metadata: {version: 9, entries}}).metadata, undefined);
});

test("snippet metadata updates by id and removes deleted native orphans", () => {
    let store = setSnippetMetadata(null, "kept", {alias: "old", tags: [" Work ", "Work", null], pinned: true});
    store = setSnippetMetadata(store, "kept", {alias: "new", summary: "Safe <img>", modifiedAt: 100});
    store = setSnippetMetadata(store, "deleted", {alias: "gone"});
    assert.equal(store.metadata.entries.length, 2);
    const native = [{id: "kept", content: ".real{}", enabled: false}];
    const result = reconcileSnippetGroups(store, native);
    assert.equal(result.changed, true);
    assert.deepEqual(result.orphaned, ["deleted"]);
    assert.deepEqual(result.store.metadata.entries.map((entry) => entry.snippetId), ["kept"]);
    const projected = projectSnippetMetadata(result.store, native);
    assert.equal(projected[0].alias, "new");
    assert.equal(projected[0].content, ".real{}");
    assert.equal(projected[0].enabled, false);
    assert.equal(native[0].alias, undefined);
});

test("snippet metadata search and sorting use aliases tags summaries and local timestamps", () => {
    const catalog = [
        {id: "one", name: "Z", type: "css", source: "native", alias: "Alpha", tags: ["work"], summary: "focus", modifiedAt: 20},
        {id: "two", name: "B", type: "css", source: "native", pinned: true, modifiedAt: 1},
        {id: "three", name: "C", type: "js", source: "native", modifiedAt: 30},
    ];
    for (const query of ["alpha", "work", "focus"]) assert.deepEqual(filterSnippetCatalog(catalog, {query}).map((entry) => entry.id), ["one"]);
    assert.deepEqual(filterSnippetCatalog(catalog, {sort: "modified"}).map((entry) => entry.id), ["two", "three", "one"]);
    assert.deepEqual(filterSnippetCatalog(catalog, {sort: "name"}).map((entry) => entry.id), ["two", "one", "three"]);
});

test("snippet metadata signatures compare bounded fields without native ids or timestamps", () => {
    assert.equal(snippetMetadataSignature(undefined), snippetMetadataSignature({alias: " ", summary: "", tags: [], pinned: false}));
    assert.equal(snippetMetadataSignature({snippetId: "old", modifiedAt: 1, alias: " Review ", tags: ["work", "work", " "]}),
        snippetMetadataSignature({snippetId: "new", modifiedAt: 100, alias: "Review", tags: ["work"]}));
    for (const value of [{alias: "new"}, {summary: "new"}, {tags: ["new"]}, {pinned: true}]) {
        assert.notEqual(snippetMetadataSignature(value), snippetMetadataSignature(null));
    }
});
