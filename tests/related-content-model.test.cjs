// T-6814 关联内容只读模型：投影/去重/限额/畸形输入安全 + 会话缓存有效性。
// 数据源契约见 v3.8.5 apicontract/ref_list.go（getBacklink2）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {projectRelatedContent, isRelatedCacheHit, RELATED_ITEM_MAX} = require("../src/related-content-model.js");

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
