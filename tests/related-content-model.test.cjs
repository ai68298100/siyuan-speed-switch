// T-6814 关联内容只读模型：投影/去重/限额/畸形输入安全 + 会话缓存有效性。
// 数据源契约见 v3.8.5 apicontract/ref_list.go（getBacklink2）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {projectRelatedContent, isRelatedCacheHit, RELATED_ITEM_MAX, normalizeRelatedSwrStore, buildRelatedSwrStore, RELATED_SWR_VERSION, RELATED_SWR_MAX_ENTRIES, RELATED_SWR_MAX_AGE_MS} = require("../src/related-content-model.js");

const validId = (seed) => `20260924000000-${seed}`;

test("related content: backlinks outrank mentions with dedupe and bounded projection", () => {
    const payload = {
        backlinks: [
            {id: validId("aaaaaaa"), name: "引用者甲", hPath: "/项目/引用者甲", box: "box-a"},
            {id: validId("bbbbbbb"), name: "引用者乙", hPath: "/项目/引用者乙"},
        ],
        backmentions: [
            {id: validId("bbbbbbb"), name: "重复项应去重", hPath: "/项目/引用者乙"},
            {id: validId("ccccccc"), name: "提及者丙", hPath: "/项目/提及者丙"},
        ],
        linkRefsCount: 12,
        mentionsCount: 5,
    };
    const projection = projectRelatedContent(payload, {limit: 3});
    assert.deepEqual(projection.items.map((item) => item.id), [
        validId("aaaaaaa"), validId("bbbbbbb"), validId("ccccccc"),
    ], "反链优先、跨类去重、限额生效");
    assert.equal(projection.items[2].source, "mention");
    assert.equal(projection.truncated, true, "内核总量大于投影数时必须标注截断");
    assert.deepEqual(projection.counts, {backlinks: 12, mentions: 5, shown: 3});
});

test("related content: malformed payload and invalid ids are dropped safely", () => {
    assert.deepEqual(projectRelatedContent(null).items, []);
    assert.deepEqual(projectRelatedContent("bad").items, []);
    assert.deepEqual(projectRelatedContent({}).items, [], "空载荷安全");
    const projection = projectRelatedContent({
        backlinks: [
            {id: "not-an-id", name: "非法 id"},
            {id: validId("ddddddd")}, // 无名称：回落 hPath，再回落 id
        ],
    });
    assert.equal(projection.items.length, 1);
    assert.equal(projection.items[0].title, validId("ddddddd"), "无名称无路径时以 id 兜底");
    assert.equal(projection.truncated, false);
});

test("related content: cache hit binds to rootId and respects ttl", () => {
    const entry = {rootId: validId("eeeeeee"), at: 1000, projection: {items: []}};
    assert.equal(isRelatedCacheHit(entry, validId("eeeeeee"), 1000 + 59999), true);
    assert.equal(isRelatedCacheHit(entry, validId("eeeeeee"), 1000 + 60001), false, "过期失效");
    assert.equal(isRelatedCacheHit(entry, validId("ffffff0"), 1500), false, "跨文档串味防护");
    assert.equal(isRelatedCacheHit(null, validId("eeeeeee"), 1500), false);
    assert.equal(isRelatedCacheHit({rootId: validId("eeeeeee"), at: "bad"}, validId("eeeeeee"), 1500), false);
});

test("related content: default limit stays within the audited cap", () => {
    const backlinks = Array.from({length: 30}, (_, index) => ({id: validId(`f${String(index).padStart(6, "0")}`)}));
    const projection = projectRelatedContent({backlinks});
    assert.equal(projection.items.length, RELATED_ITEM_MAX);
    assert.equal(RELATED_ITEM_MAX, 8);
});

test("related swr store: normalizes persisted entries with version, bounds and dedupe (T-6840)", () => {
    const now = 1_800_000_000_000;
    const projection = projectRelatedContent({backlinks: [{id: validId("aaaaaaa"), name: "引用者甲", hPath: "/项目/甲"}]});
    const store = normalizeRelatedSwrStore({
        version: RELATED_SWR_VERSION,
        entries: [
            {rootId: validId("1000000"), at: now - 1000, projection},
            {rootId: validId("2000000"), at: now - 2000, projection},
            {rootId: validId("1000000"), at: now - 500, projection}, // 重复 rootId → 保留最新
        ],
    }, {nowMs: now});
    assert.equal(store.version, RELATED_SWR_VERSION);
    assert.equal(store.entries.length, 2);
    assert.equal(store.entries[0].rootId, validId("1000000")); // at 降序：最新在前
    assert.equal(store.entries[0].projection.items[0].title, "引用者甲");
});

test("related swr store: drops malformed, stale and over-cap entries (T-6840)", () => {
    const now = 1_800_000_000_000;
    const fresh = now - 1000;
    const stale = now - RELATED_SWR_MAX_AGE_MS - 1;
    const projection = projectRelatedContent({backlinks: [{id: validId("aaaaaaa")}]});
    const good = {rootId: validId("3000000"), at: fresh, projection};
    const store = normalizeRelatedSwrStore({
        version: 99, // 未知版本整体拒绝
        entries: [good],
    }, {nowMs: now});
    assert.equal(store.entries.length, 0, "未知版本必须整体拒绝");

    const store2 = normalizeRelatedSwrStore({
        version: RELATED_SWR_VERSION,
        entries: [
            good,
            {rootId: validId("4000000"), at: stale, projection}, // 过龄剔除
            {rootId: "坏 id", at: fresh, projection},             // rootId 形态非法
            {rootId: validId("5000000"), at: fresh, projection: {items: "bad"}}, // 投影畸形
            {rootId: validId("6000000"), at: now + 5000, projection}, // 未来时间戳拒绝
            null,
        ],
    }, {nowMs: now});
    assert.equal(store2.entries.length, 1);
    assert.equal(store2.entries[0].rootId, validId("3000000"));
});

test("related swr store: bounded to 8 entries sorted by recency (T-6840)", () => {
    const now = 1_800_000_000_000;
    const projection = projectRelatedContent({backlinks: [{id: validId("aaaaaaa")}]});
    const entries = Array.from({length: 12}, (_, index) => ({
        rootId: validId(String(index + 10).padStart(7, "0")),
        at: now - index * 1000,
        projection,
    }));
    const store = normalizeRelatedSwrStore({version: RELATED_SWR_VERSION, entries}, {nowMs: now});
    assert.equal(store.entries.length, RELATED_SWR_MAX_ENTRIES);
    assert.ok(store.entries.every((entry, index) => index === 0 || store.entries[index - 1].at >= entry.at));
});

test("related swr store: roundtrip via buildRelatedSwrStore stays normalized (T-6840)", () => {
    const projection = projectRelatedContent({backlinks: [{id: validId("aaaaaaa"), name: "甲"}]});
    const store = buildRelatedSwrStore([{rootId: validId("7000000"), at: Date.now() - 10, projection}, {rootId: "junk"}]);
    assert.equal(store.entries.length, 1);
    // roundtrip：序列化结果再 normalize 幂等（同一默认时钟）
    const again = normalizeRelatedSwrStore(store);
    assert.deepEqual(again, store);
});
