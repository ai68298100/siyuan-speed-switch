const test = require("node:test");
const assert = require("node:assert/strict");
const {
    projectRelatedContent,
    normalizeRelatedSwrStore,
    mergeRelatedSwrEntry,
    beginRelatedContentRequest,
    isRelatedContentRequestCurrent,
    finishRelatedContentRequest,
    RELATED_SWR_VERSION,
    RELATED_SWR_MAX_ENTRIES,
} = require("../src/related-content-model.js");

const validId = (seed) => `20260924000000-${seed}`;
const now = 1_800_000_000_000;
const orderCases = [
    "old-new",
    "new-old",
    "filler-old-new",
    "old-filler-new",
];
const projectionCases = [
    {oldTitle: "旧标题", newTitle: "新标题"},
    {oldTitle: "old", newTitle: "new"},
    {oldTitle: "旧标题 / A", newTitle: "新标题 / A"},
    {oldTitle: "stale", newTitle: "fresh"},
];
const jitterCases = [0, 17, 83, 149];
const fillerCounts = [0, 3, 7, 12];

function projection(title, seed) {
    return projectRelatedContent({
        backlinks: [{id: validId(seed), name: title, hPath: `/项目/${title}`}],
    });
}

function buildDuplicateEntries(orderCase, duplicateSeed, titles, jitter, fillerCount) {
    const duplicateRootId = validId(duplicateSeed);
    const oldProjection = projection(titles.oldTitle, `a${String(jitter).padStart(6, "0")}`);
    const newProjection = projection(titles.newTitle, `b${String(jitter).padStart(6, "0")}`);
    const oldEntry = {rootId: duplicateRootId, at: now - 5000 - jitter, projection: oldProjection};
    const newEntry = {rootId: duplicateRootId, at: now - 1000 - jitter, projection: newProjection};
    const fillers = Array.from({length: fillerCount}, (_, index) => ({
        rootId: validId(`${String(2000000 + index).padStart(7, "0")}`),
        at: now - 2000 - index * 100 - jitter,
        projection: projection(`填充-${index}`, `c${String(index).padStart(6, "0")}`),
    }));
    if (orderCase === "new-old") return [newEntry, oldEntry, ...fillers];
    if (orderCase === "filler-old-new") return [...fillers, oldEntry, newEntry];
    if (orderCase === "old-filler-new") return [oldEntry, ...fillers, newEntry];
    return [oldEntry, newEntry, ...fillers];
}

let matrixCase = 0;
for (const orderCase of orderCases) {
    for (const titles of projectionCases) {
        for (const jitter of jitterCases) {
            for (const fillerCount of fillerCounts) {
                const caseNumber = ++matrixCase;
                test(`SWR recency matrix ${caseNumber}: ${orderCase}/${titles.newTitle}/${jitter}/${fillerCount}`, () => {
                    const duplicateSeed = `${String(1000000 + caseNumber).padStart(7, "0")}`;
                    const entries = buildDuplicateEntries(orderCase, duplicateSeed, titles, jitter, fillerCount);
                    const store = normalizeRelatedSwrStore({version: RELATED_SWR_VERSION, entries}, {nowMs: now});
                    const duplicate = store.entries.find((entry) => entry.rootId === validId(duplicateSeed));
                    assert.ok(duplicate, "最新重复根文档必须保留");
                    assert.equal(duplicate.projection.items[0].title, titles.newTitle, "乱序输入也必须保留最新投影");
                    assert.ok(store.entries.length <= RELATED_SWR_MAX_ENTRIES, "SWR 存储必须有界");
                    assert.ok(store.entries.every((entry, index) => index === 0 || store.entries[index - 1].at >= entry.at), "输出必须按 at 降序");
                });
            }
        }
    }
}

test("SWR merge: same rootId is replaced by the newest valid entry", () => {
    const rootId = validId("9000000");
    const older = {rootId, at: now - 3000, projection: projection("旧", "d000000")};
    const newer = {rootId, at: now - 1000, projection: projection("新", "e000000")};
    const merged = mergeRelatedSwrEntry([newer, older], {rootId, at: now - 500, projection: projection("更新", "f000000")}, {nowMs: now});
    assert.equal(merged.entries.length, 1);
    assert.equal(merged.entries[0].projection.items[0].title, "更新");
});

test("SWR request generation: stale completion cannot finish the newer request", () => {
    const requests = new Map();
    const first = beginRelatedContentRequest(requests, validId("9100000"));
    const second = beginRelatedContentRequest(requests, validId("9100000"));
    assert.equal(first, 1);
    assert.equal(second, 2);
    assert.equal(isRelatedContentRequestCurrent(requests, validId("9100000"), first), false);
    assert.equal(finishRelatedContentRequest(requests, validId("9100000"), first), false);
    assert.equal(isRelatedContentRequestCurrent(requests, validId("9100000"), second), true);
    assert.equal(finishRelatedContentRequest(requests, validId("9100000"), second), true);
    assert.equal(requests.has(validId("9100000")), false);
});

test("SWR request generation: roots have independent monotonic sequences", () => {
    const requests = new Map();
    const rootA = validId("9200000");
    const rootB = validId("9300000");
    const generationA = beginRelatedContentRequest(requests, rootA);
    const generationB = beginRelatedContentRequest(requests, rootB);
    assert.equal(generationA, 1);
    assert.equal(generationB, 1);
    assert.equal(isRelatedContentRequestCurrent(requests, rootA, generationA), true);
    assert.equal(isRelatedContentRequestCurrent(requests, rootB, generationB), true);
    assert.equal(finishRelatedContentRequest(requests, rootA, generationA), true);
    assert.equal(isRelatedContentRequestCurrent(requests, rootB, generationB), true);
});

test("SWR request generation: invalid roots do not create a request slot", () => {
    const requests = new Map();
    assert.equal(beginRelatedContentRequest(requests, ""), 0);
    assert.equal(beginRelatedContentRequest(null, validId("9400000")), 0);
    assert.equal(requests.size, 0);
});

assert.equal(matrixCase, 256, "矩阵必须保持不少于 200 个独立场景");
