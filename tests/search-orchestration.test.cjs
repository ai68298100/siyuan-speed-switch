const test = require("node:test");
const assert = require("node:assert/strict");
const {
    aggregateSearchResults,
    buildOpenedDocumentSearchRequests,
    extractSearchRecords,
    mergeSearchLayers,
    normalizeTitleSearchDocuments,
} = require("../src/search-model.js");

const ROOT_A = "20260906120000-aaaaaaa";
const ROOT_B = "20260906120001-bbbbbbb";
const ROOT_C = "20260906120002-ccccccc";

function response(data) {
    return {ok: true, json: async () => data};
}

function tab(rootId, path) {
    return {rootId, path, notebookId: "box-a"};
}

/** A transport-only harness for the intended title -> opened -> global flow. */
async function runOrchestration({title = [], opened = [], global = [], rejectAt = ""} = {}) {
    const calls = [];
    const fetchMock = async (endpoint) => {
        calls.push(endpoint);
        if (endpoint === "title") {
            if (rejectAt === endpoint) throw new DOMException("Aborted", "AbortError");
            return response({data: title});
        }
        if (rejectAt === endpoint) throw new DOMException("Aborted", "AbortError");
        return response({data: endpoint === "opened" ? opened : global});
    };
    try {
        const titleResponse = await fetchMock("title");
        const titleRecords = normalizeTitleSearchDocuments(extractSearchRecords(await titleResponse.json()));
        if (titleRecords.length > 0) {
            return {calls, titleRecords};
        }
        const openedRequests = buildOpenedDocumentSearchRequests(
            [tab(ROOT_A, "box-a/project.sy"), tab(ROOT_B, "box-a/meeting.sy")],
            "项目",
            {maxDocuments: 2},
        );
        const openedRecords = [];
        for (const request of openedRequests) {
            const openedResponse = await fetchMock("opened");
            openedRecords.push(...extractSearchRecords(await openedResponse.json()));
        }
        let globalRecords = [];
        if (openedRecords.length === 0) {
            const globalResponse = await fetchMock("global");
            globalRecords = extractSearchRecords(await globalResponse.json());
        }
        return {calls, result: mergeSearchLayers({query: "项目", tabs: [], opened: openedRecords, global: globalRecords})};
    } catch (error) {
        if (error?.name === "AbortError") return {calls, aborted: true};
        throw error;
    }
}

test("search orchestration: title hit short-circuits opened and global requests", async () => {
    const output = await runOrchestration({title: [{id: ROOT_A, root_id: ROOT_A, name: "项目文档", hPath: "work/project"}]});
    assert.deepEqual(output.calls, ["title"]);
    assert.equal(output.titleRecords.length, 1);
    assert.equal(output.titleRecords[0].rootId, ROOT_A);
});

test("search orchestration: empty title follows opened before global fallback", async () => {
    const output = await runOrchestration({global: [{id: ROOT_C, root_id: ROOT_C, name: "项目全库", hPath: "work/project"}]});
    assert.deepEqual(output.calls, ["title", "opened", "opened", "global"]);
    assert.equal(output.result.cards[0].rootId, ROOT_C);
});

test("search orchestration: AbortError is a silent cancellation", async () => {
    const output = await runOrchestration({rejectAt: "title"});
    assert.deepEqual(output.calls, ["title"]);
    assert.equal(output.aborted, true);
});

test("search orchestration: duplicate roots are removed before the document cap", () => {
    const aggregate = aggregateSearchResults([
        {id: ROOT_A, rootId: ROOT_A, title: "A"},
        {id: ROOT_A, rootId: ROOT_A, title: "A duplicate"},
        {id: ROOT_B, rootId: ROOT_B, title: "B"},
        {id: ROOT_C, rootId: ROOT_C, title: "C"},
    ], {documents: 2});
    const merged = mergeSearchLayers({query: "项目", tabs: [], opened: aggregate.cards, limits: {documents: 2}});
    assert.deepEqual(merged.cards.map((card) => card.rootId), [ROOT_A, ROOT_B]);
    assert.equal(new Set(merged.cards.map((card) => card.rootId)).size, merged.cards.length);
});
