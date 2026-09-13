const test = require("node:test");
const assert = require("node:assert/strict");
const {MAX_PATH_ITEMS, buildPathFilterListRequest, normalizePathFilterListResponse} = require("../src/path-filter-model");

const notebook = "20260913120000-boxabc";
const rootId = "20260913120100-rootabc";
const childId = "20260913120200-childab";

test("path filter model builds a bounded native list request", () => {
    assert.deepEqual(buildPathFilterListRequest({notebook}), {
        endpoint: "/api/filetree/listDocsByPath",
        body: {notebook, path: "/", maxListCount: MAX_PATH_ITEMS + 1},
        limit: MAX_PATH_ITEMS,
    });
    assert.equal(buildPathFilterListRequest({notebook, path: "/../secret"}), null);
    assert.equal(buildPathFilterListRequest({notebook: "bad box", path: "/"}), null);
});

test("path filter model normalizes only matching safe document entries", () => {
    const result = normalizePathFilterListResponse({code: 0, data: {
        box: notebook,
        path: `/${rootId}.sy`,
        files: [
            {id: childId, name: "  子文档\u0000  ", path: `/${rootId}.sy/${childId}.sy`, subFileCount: 2},
            {id: childId, name: "duplicate", path: `/${rootId}.sy/${childId}.sy`, subFileCount: 0},
            {id: "unsafe", name: "bad", path: "/../bad.sy"},
        ],
    }}, {notebook, path: `/${rootId}.sy`});
    assert.deepEqual(result, {ok: true, reason: "ready", truncated: false, items: [{
        id: childId,
        title: "子文档",
        path: `/${rootId}.sy/${childId}.sy`,
        searchPath: `${notebook}/${rootId}.sy/${childId}.sy`,
        hasChildren: true,
    }]});
});

test("path filter model isolates mismatched responses and caps large lists", () => {
    assert.equal(normalizePathFilterListResponse({code: -1}, {notebook}).reason, "failed");
    assert.equal(normalizePathFilterListResponse({code: 0, data: {box: "other", path: "/", files: []}}, {notebook}).reason, "mismatch");
    const files = Array.from({length: 4}, (_, index) => {
        const id = `20260913120${index + 3}00-nodeabc`;
        return {id, name: `Doc ${index}`, path: `/${id}.sy`, subFileCount: 0};
    });
    const result = normalizePathFilterListResponse({code: 0, data: {box: notebook, path: "/", files}}, {notebook, limit: 2});
    assert.equal(result.items.length, 2);
    assert.equal(result.truncated, true);
});
