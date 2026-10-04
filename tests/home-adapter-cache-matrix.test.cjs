const test = require("node:test");
const assert = require("node:assert/strict");
const adapters = require("../src/home-adapters.js");

const DEVICES = ["desktop", "mobile"];
const CONFIG_CASES = [
    {
        name: "same-order",
        first: {alpha: "base", beta: 1},
        second: {alpha: "base", beta: 1},
        sameIdentity: true,
    },
    {
        name: "reversed-order",
        first: {alpha: "base", beta: 1},
        second: {beta: 1, alpha: "base"},
        sameIdentity: true,
    },
    {
        name: "ignored-field",
        first: {alpha: "base", beta: 1},
        second: {alpha: "base", beta: 1, "bad key!": "ignored"},
        sameIdentity: true,
    },
    {
        name: "distinct-field",
        first: {alpha: "base", beta: 1},
        second: {alpha: "base", beta: 1, gamma: true},
        sameIdentity: false,
    },
];
const EXECUTION_CASES = [
    {name: "sequential", dedupe: true},
    {name: "parallel-dedupe", dedupe: true},
    {name: "parallel-no-dedupe", dedupe: false},
    {name: "force-refresh", dedupe: true},
];
const CACHE_CASES = [
    {name: "ttl", cacheTtlMs: 1000},
    {name: "disabled", cacheTtlMs: 0},
];
const SNAPSHOT_CASES = [
    {name: "items", empty: false, sourceHealth: "fresh", stat: null, emptyHint: ""},
    {name: "empty", empty: true, sourceHealth: "stale", stat: null, emptyHint: "No rows"},
    {name: "rich-items", empty: false, sourceHealth: "cached", stat: {value: "3", label: "queue", progress: 75}, emptyHint: ""},
    {name: "rich-empty", empty: true, sourceHealth: "stale", stat: null, emptyHint: "Nothing scheduled"},
];

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let matrixIndex = 0;
for (const device of DEVICES) {
    for (const configCase of CONFIG_CASES) {
        for (const execution of EXECUTION_CASES) {
            for (const cacheCase of CACHE_CASES) {
                for (const snapshotCase of SNAPSHOT_CASES) {
                    const caseId = matrixIndex++;
                    test(`home adapter cache matrix ${caseId + 1}: ${device}/${configCase.name}/${execution.name}/${cacheCase.name}/${snapshotCase.name}`, async () => {
                        const moduleId = `cache-matrix-${caseId}`;
                        let reads = 0;
                        const map = adapters.registerHomeAdapters([{
                            moduleId,
                            supportedDevices: [device],
                            read: async (config) => {
                                const call = ++reads;
                                if (execution.name === "parallel-no-dedupe") await wait(call === 1 ? 8 : 1);
                                return {
                                    title: `${snapshotCase.name}-${config.gamma === true ? "distinct" : "base"}-${call}`,
                                    items: snapshotCase.empty ? [] : [{label: "row"}],
                                    sourceHealth: snapshotCase.sourceHealth,
                                    stat: snapshotCase.stat,
                                    emptyHint: snapshotCase.emptyHint,
                                    updatedAt: call,
                                };
                            },
                        }]);
                        const options = {cacheTtlMs: cacheCase.cacheTtlMs, dedupe: execution.dedupe};
                        const read = (config, extra = {}) => adapters.readHomeModule(map, moduleId, device, config, {...options, ...extra});
                        const firstConfig = configCase.first;
                        const secondConfig = configCase.second;
                        const firstCacheKey = adapters.buildHomeAdapterCacheKey(moduleId, device, adapters.normalizeHomeAdapterConfig(firstConfig));
                        const secondCacheKey = adapters.buildHomeAdapterCacheKey(moduleId, device, adapters.normalizeHomeAdapterConfig(secondConfig));
                        if (configCase.sameIdentity) {
                            assert.equal(firstCacheKey, secondCacheKey, "equivalent configs must share a cache identity");
                        } else {
                            assert.notEqual(firstCacheKey, secondCacheKey, "distinct configs must not share a cache identity");
                        }
                        let results;
                        if (execution.name === "sequential") {
                            results = [await read(firstConfig), await read(secondConfig)];
                        } else if (execution.name === "force-refresh") {
                            results = [await read(firstConfig), await read(secondConfig, {force: true})];
                        } else {
                            results = await Promise.all([read(firstConfig), read(secondConfig)]);
                        }
                        assert.equal(results.every((result) => result.ok === true), true);
                        assert.equal(results.every((result) => result.snapshot.empty === snapshotCase.empty), true);
                        assert.equal(results.every((result) => result.snapshot.sourceHealth === snapshotCase.sourceHealth), true);
                        assert.equal(results.every((result) => (result.snapshot.emptyHint || "") === snapshotCase.emptyHint), true);
                        if (snapshotCase.stat) {
                            assert.deepEqual(results[0].snapshot.stat, snapshotCase.stat);
                        } else {
                            assert.equal(results.every((result) => result.snapshot.stat === null), true);
                        }
                        const expectedReads = execution.name === "sequential"
                            ? (configCase.sameIdentity && cacheCase.cacheTtlMs > 0 ? 1 : 2)
                            : execution.name === "parallel-dedupe"
                                ? (configCase.sameIdentity ? 1 : 2)
                                : 2;
                        assert.equal(reads, expectedReads);
                        if (cacheCase.cacheTtlMs > 0) {
                            const beforeProbe = reads;
                            const probe = await read(firstConfig);
                            assert.equal(probe.ok, true);
                            assert.equal(probe.cached, true, "a successful read must remain reusable after the transaction");
                            assert.equal(reads, beforeProbe);
                        }
                        adapters.unregisterHomeAdapter(map, moduleId);
                    });
                }
            }
        }
    }
}

test("home adapter cache matrix generated the required 256 cases", () => {
    assert.equal(matrixIndex, 256);
});

test("home adapter config normalization keeps accepted values bounded and canonical", () => {
    const normalized = adapters.normalizeHomeAdapterConfig({beta: 1, alpha: "base", "bad key!": "ignored", list: [1, 2], nested: {x: 1}});
    assert.deepEqual(normalized, {alpha: "base", beta: 1});
});
