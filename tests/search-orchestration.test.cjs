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

/** A transport-only harness for the intended tabs -> opened -> title/global flow. */
async function runOrchestration({title = [], opened = [], global = [], rejectAt = "", titleFailure = false} = {}) {
    const calls = [];
    const fetchMock = async (endpoint) => {
        calls.push(endpoint);
        if (endpoint === "title") {
            if (rejectAt === endpoint) throw new DOMException("Aborted", "AbortError");
            if (titleFailure) throw new Error("searchDocs unavailable");
            return response({data: title});
        }
        if (rejectAt === endpoint) throw new DOMException("Aborted", "AbortError");
        return response({data: endpoint === "opened" ? opened : global});
    };
    try {
        let titleRecords = [];
        try {
            const titleResponse = await fetchMock("title");
            titleRecords = normalizeTitleSearchDocuments(extractSearchRecords(await titleResponse.json()));
        } catch (error) {
            if (error?.name === "AbortError") throw error;
            // A title endpoint failure is compatible with the same fallback
            // sequence used for an empty title result.
        }
        if (titleRecords.length > 0) {
            // The UI probes bounded opened-document content in parallel even
            // when the title fast path has results, so matching tabs whose
            // body contains the query are restored immediately.
            const openedRequests = buildOpenedDocumentSearchRequests(
                [tab(ROOT_A, "box-a/project.sy"), tab(ROOT_B, "box-a/meeting.sy")],
                "项目",
                {maxDocuments: 2},
            );
            for (const _request of openedRequests) {
                await fetchMock("opened");
            }
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

test("search orchestration: title hit still probes opened content before global fallback", async () => {
    const output = await runOrchestration({title: [{id: ROOT_A, root_id: ROOT_A, name: "项目文档", hPath: "work/project"}]});
    assert.deepEqual(output.calls, ["title", "opened", "opened"]);
    assert.equal(output.titleRecords.length, 1);
    assert.equal(output.titleRecords[0].rootId, ROOT_A);
});

test("search orchestration: empty title follows opened before global fallback", async () => {
    const output = await runOrchestration({global: [{id: ROOT_C, root_id: ROOT_C, name: "项目全库", hPath: "work/project"}]});
    assert.deepEqual(output.calls, ["title", "opened", "opened", "global"]);
    assert.equal(output.result.cards[0].rootId, ROOT_C);

    const unavailable = await runOrchestration({
        titleFailure: true,
        global: [{id: ROOT_C, root_id: ROOT_C, name: "项目全库", hPath: "work/project"}],
    });
    assert.deepEqual(unavailable.calls, ["title", "opened", "opened", "global"]);
    assert.equal(unavailable.result.cards[0].rootId, ROOT_C);
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

test("search orchestration: opened-content probes honor notebook and path scope before requests", () => {
    const requests = buildOpenedDocumentSearchRequests([
        tab(ROOT_A, "box-a/project.sy"),
        tab(ROOT_B, "box-a/notes/other.sy"),
        tab(ROOT_C, "box-a/notes/target.sy"),
    ], "项目", {
        maxDocuments: 6,
        filters: {notebook: "box-a", paths: ["box-a/notes"]},
    });
    assert.deepEqual(requests.map((request) => request.scope.rootId), [ROOT_B, ROOT_C]);
    assert.ok(requests.every((request) => request.scope.path.startsWith("box-a/notes/")));
});

test("search orchestration: scope filters are normalized once before bounded fan-out", () => {
    const requests = buildOpenedDocumentSearchRequests([
        tab(ROOT_A, "box-a/work/a.sy"),
        tab(ROOT_B, "box-a/work/b.sy"),
        tab(ROOT_C, "box-a/other/c.sy"),
    ], "项目", {
        maxDocuments: 2,
        filters: {notebook: " box-a ", paths: ["box-a/work", "box-a/work", "../ignored"]},
    });
    assert.deepEqual(requests.map((request) => request.scope.rootId), [ROOT_A, ROOT_B]);
});
