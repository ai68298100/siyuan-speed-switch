const assert = require("node:assert/strict");
const test = require("node:test");

const {
    aggregateSearchResults,
    normalizeSearchResult,
} = require("../src/search-model.js");

const SHAPES = ["flat", "nested"];
const ROOT_COUNTS = [1, 2, 12];
const HITS_PER_ROOT = [1, 4];
const SNIPPET_MODES = ["none", "unique", "duplicate"];
const ALIAS_MODES = ["canonical", "legacy"];
const LIMIT_MODES = ["default", "zero", "tight"];

function makeRootId(rootIndex) {
    return `20261002090000-${rootIndex.toString(16).padStart(8, "0")}`;
}

function makeBlockId(rootIndex, hitIndex) {
    return `2026100209${String(rootIndex).padStart(2, "0")}${String(hitIndex).padStart(2, "0")}-hit${rootIndex}${hitIndex}`;
}

function makeSnippet(rootIndex, hitIndex, mode) {
    if (mode === "none") return "";
    if (mode === "duplicate") return `重复片段-${rootIndex}`;
    return `唯一片段-${rootIndex}-${hitIndex}`;
}

function makeRawHit(shape, aliasMode, rootIndex, hitIndex, snippetMode) {
    const rootId = makeRootId(rootIndex);
    const blockId = makeBlockId(rootIndex, hitIndex);
    const title = `矩阵文档-${rootIndex}`;
    const path = `工作/矩阵/${title}`;
    const snippet = makeSnippet(rootIndex, hitIndex, snippetMode);
    const score = rootIndex + hitIndex / 10;
    const updated = `2026100209${String(rootIndex).padStart(2, "0")}${String(hitIndex).padStart(2, "0")}`;
    const notebookId = `notebook-${rootIndex}`;
    const type = "d";
    const subType = "h1";

    if (shape === "flat" && aliasMode === "canonical") {
        return {
            rootId,
            blockId,
            title,
            path,
            snippet,
            updated,
            notebookId,
            type,
            subType,
            score,
            source: "global",
        };
    }
    if (shape === "flat") {
        return {
            root_id: rootId,
            id: blockId,
            name: title,
            hPath: path,
            content: snippet,
            updated_at: updated,
            box: notebookId,
            type,
            subtype: subType,
            relevance: score,
            source: "global",
        };
    }
    if (aliasMode === "canonical") {
        return {
            root: {id: rootId, name: title},
            block: {id: blockId, content: snippet},
            hPath: path,
            updated,
            notebookId,
            type,
            subType,
            score,
            source: "global",
        };
    }
    return {
        root: {id: rootId, name: title},
        block: {id: blockId, content: snippet},
        hPath: path,
        updated_at: updated,
        box: notebookId,
        type,
        subtype: subType,
        relevance: score,
        source: "global",
    };
}

function makeLimits(mode) {
    if (mode === "zero") return {snippets: 0, blockIds: 0};
    if (mode === "tight") return {snippets: 1, blockIds: 1};
    return {};
}

function expectedSnippetCount(mode, hitsPerRoot, limitMode) {
    if (mode === "none") return 0;
    const uniqueCount = mode === "duplicate" ? 1 : hitsPerRoot;
    if (limitMode === "zero") return 0;
    if (limitMode === "tight") return Math.min(1, uniqueCount);
    return Math.min(2, uniqueCount);
}

function expectedSnippetTruncated(mode, hitsPerRoot, limitMode) {
    if (mode === "none") return false;
    const uniqueCount = mode === "duplicate" ? 1 : hitsPerRoot;
    const limit = limitMode === "zero" ? 0 : limitMode === "tight" ? 1 : 2;
    return uniqueCount > limit;
}

for (const shape of SHAPES) {
    for (const rootCount of ROOT_COUNTS) {
        for (const hitsPerRoot of HITS_PER_ROOT) {
            for (const snippetMode of SNIPPET_MODES) {
                for (const aliasMode of ALIAS_MODES) {
                    for (const limitMode of LIMIT_MODES) {
                        const name = [shape, `${rootCount}roots`, `${hitsPerRoot}hits`, snippetMode, aliasMode, limitMode]
                            .join("/");
                        test(`search aggregation matrix: ${name}`, () => {
                            const raw = [];
                            for (let rootIndex = 0; rootIndex < rootCount; rootIndex++) {
                                for (let hitIndex = 0; hitIndex < hitsPerRoot; hitIndex++) {
                                    raw.push(makeRawHit(shape, aliasMode, rootIndex, hitIndex, snippetMode));
                                }
                            }
                            const aggregate = aggregateSearchResults(raw, {
                                source: "global",
                                ...makeLimits(limitMode),
                            });

                            assert.equal(aggregate.rawCount, raw.length);
                            assert.equal(aggregate.rawTruncated, false);
                            assert.equal(aggregate.totalDocuments, rootCount);
                            assert.equal(aggregate.cards.length, rootCount);
                            assert.deepEqual(aggregate.cards.map((card) => card.rootId),
                                Array.from({length: rootCount}, (_, index) => makeRootId(index)));

                            aggregate.cards.forEach((card, rootIndex) => {
                                assert.equal(card.hitCount, hitsPerRoot);
                                assert.equal(card.title, `矩阵文档-${rootIndex}`);
                                assert.equal(card.path, `工作/矩阵/矩阵文档-${rootIndex}`);
                                assert.equal(card.updated,
                                    `2026100209${String(rootIndex).padStart(2, "0")}00`);
                                assert.equal(card.notebookId, `notebook-${rootIndex}`);
                                assert.equal(card.type, "d");
                                assert.equal(card.subType, "h1");
                                assert.equal(card.score, rootIndex + (hitsPerRoot - 1) / 10);
                                assert.equal(card.blockIds.length,
                                    limitMode === "zero" ? 0 : limitMode === "tight" ? Math.min(1, hitsPerRoot) : hitsPerRoot);
                                assert.equal(card.snippets.length,
                                    expectedSnippetCount(snippetMode, hitsPerRoot, limitMode));
                                assert.equal(card.blockIdsTruncated,
                                    hitsPerRoot > (limitMode === "zero" ? 0 : limitMode === "tight" ? 1 : 50));
                                assert.equal(card.truncated,
                                    expectedSnippetTruncated(snippetMode, hitsPerRoot, limitMode));
                            });
                        });
                    }
                }
            }
        }
    }
}

test("search aggregation matrix: flat fast path matches nested fallback output", () => {
    const flat = makeRawHit("flat", "canonical", 3, 2, "unique");
    const nested = makeRawHit("nested", "canonical", 3, 2, "unique");
    assert.deepEqual(normalizeSearchResult(flat, "global"), normalizeSearchResult(nested, "global"));
});

test("search aggregation matrix: invalid direct root falls back to path-derived root", () => {
    const rootId = makeRootId(20);
    const result = normalizeSearchResult({
        rootId: "not-a-root",
        path: `工作/矩阵/${rootId}.sy`,
        title: "路径文档",
        content: "路径片段",
    }, "global");
    assert.equal(result.rootId, rootId);
    assert.equal(result.title, "路径文档");
});

test("search aggregation matrix: document records remain accepted without root alias", () => {
    const rootId = makeRootId(21);
    const result = normalizeSearchResult({
        id: rootId,
        type: "d",
        title: "文档记录",
        path: "工作/矩阵/文档记录",
    }, "global");
    assert.equal(result.rootId, rootId);
    assert.equal(result.blockId, rootId);
    assert.equal(result.type, "d");
});

test("search aggregation matrix: nested root precedence is preserved", () => {
    const directRootId = makeRootId(22);
    const nestedRootId = makeRootId(23);
    const result = normalizeSearchResult({
        rootId: directRootId,
        root: {id: nestedRootId, name: "嵌套优先"},
        block: {id: makeBlockId(23, 0), content: "片段"},
    }, "global");
    assert.equal(result.rootId, nestedRootId);
    assert.equal(result.title, "嵌套优先");
});
