"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    buildSearchDocumentFilterMatcher,
    filterOpenTabs,
    filterSearchDocuments,
    normalizeSearchDocumentFilters,
} = require("../src/search-model.js");

const NOTEBOOK_ID = "20261002090000-box0001";
const OTHER_NOTEBOOK_ID = "20261002090001-box0002";
const ROOT_ID = "20261002090002-root0001";

const DOCUMENT_SHAPES = [
    {
        name: "direct-notebookId",
        build: (pathField, pathValue) => ({[pathField]: pathValue, notebookId: NOTEBOOK_ID}),
    },
    {
        name: "direct-box",
        build: (pathField, pathValue) => ({[pathField]: pathValue, box: NOTEBOOK_ID}),
    },
    {
        name: "nested-data-box",
        build: (pathField, pathValue) => ({[pathField]: pathValue, data: {box: NOTEBOOK_ID}}),
    },
    {
        name: "nested-root-notebook",
        build: (pathField, pathValue) => ({[pathField]: pathValue, root: {notebookId: NOTEBOOK_ID}}),
    },
];

const NOTEBOOK_FILTERS = [
    {name: "none", value: ""},
    {name: "matching", value: NOTEBOOK_ID},
    {name: "mismatch", value: OTHER_NOTEBOOK_ID},
];

const PATH_FILTERS = [
    {name: "none", value: []},
    {name: "matching", value: [`${NOTEBOOK_ID}/work`]},
    {name: "mismatch", value: [`${NOTEBOOK_ID}/archive`]},
];

const PATH_STYLES = [
    {name: "qualified", value: `${NOTEBOOK_ID}/work/project.sy`},
    {name: "relative", value: "work/project.sy"},
    {name: "backslash", value: "\\work\\project.sy"},
];

const PATH_FIELDS = ["path", "hPath"];

for (const shape of DOCUMENT_SHAPES) {
    for (const notebookFilter of NOTEBOOK_FILTERS) {
        for (const pathFilter of PATH_FILTERS) {
            for (const pathStyle of PATH_STYLES) {
                for (const pathField of PATH_FIELDS) {
                    const caseName = [shape.name, notebookFilter.name, pathFilter.name, pathStyle.name, pathField].join("/");
                    test(`search document filter matrix: ${caseName}`, () => {
                        const document = shape.build(pathField, pathStyle.value);
                        const filters = {notebook: notebookFilter.value, paths: pathFilter.value};
                        const expected = notebookFilter.name !== "mismatch" && pathFilter.name !== "mismatch";
                        const hasFilters = Boolean(notebookFilter.value) || pathFilter.value.length > 0;
                        const matcher = buildSearchDocumentFilterMatcher(filters);

                        assert.equal(matcher(document), expected);
                        assert.deepEqual(
                            filterSearchDocuments([document, null, "invalid"], filters),
                            !hasFilters ? [document, null, "invalid"] : (expected ? [document] : []),
                        );
                    });
                }
            }
        }
    }
}

test("search document filter matrix: normalization is bounded and source data stays unchanged", () => {
    const filters = {
        notebook: ` ${NOTEBOOK_ID} `,
        paths: [`${NOTEBOOK_ID}/work`, `${NOTEBOOK_ID}/work`, "../unsafe", ""],
    };
    const before = JSON.stringify(filters);
    const normalized = normalizeSearchDocumentFilters(filters);
    assert.deepEqual(normalized, {notebook: NOTEBOOK_ID, paths: [`${NOTEBOOK_ID}/work`]});
    assert.equal(JSON.stringify(filters), before);
});

test("search document filter matrix: local tabs and remote cards share scope semantics", () => {
    const tab = {
        id: "tab-1",
        rootId: ROOT_ID,
        title: "项目文档",
        notebookId: NOTEBOOK_ID,
        path: "work/project.sy",
    };
    const filters = {notebook: NOTEBOOK_ID, paths: [`${NOTEBOOK_ID}/work`]};
    const remote = {rootId: ROOT_ID, notebookId: NOTEBOOK_ID, path: "work/project.sy"};
    assert.equal(filterOpenTabs([tab], "项目", filters).length, 1);
    assert.deepEqual(filterSearchDocuments([remote], filters), [remote]);
    assert.equal(filterOpenTabs([tab], "项目", {paths: [`${NOTEBOOK_ID}/archive`]}).length, 0);
    assert.deepEqual(filterSearchDocuments([remote], {paths: [`${NOTEBOOK_ID}/archive`]}), []);
});

