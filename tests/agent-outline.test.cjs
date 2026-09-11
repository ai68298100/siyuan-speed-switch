const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    AGENT_CAPABILITY_SPECS,
    flattenOutline,
} = require('../src/agent-capabilities.js');

test("outline capability spec is read-only, bounded and requires a document id", () => {
    const spec = AGENT_CAPABILITY_SPECS.outline;
    assert.equal(spec.name, "get-document-outline");
    assert.deepEqual(spec.inputSchema.required, ["id"]);
    assert.equal(spec.inputSchema.properties.limit.maximum, 48);
    assert.equal(spec.outputSchema.properties.headings.maxItems, 48);
    assert.match(spec.description, /只读/);
});

test("flattenOutline flattens nested headings with depth and bounds", () => {
    const nested = [
        {id: "20260101000001-aaaaaaa", name: "第一章", depth: 0, blocks: [
            {id: "20260101000002-bbbbbbb", name: "1.1 小节", depth: 1, blocks: [
                {id: "20260101000003-ccccccc", name: "1.1.1 细节", depth: 2},
            ]},
        ]},
        {id: "20260101000004-ddddddd", name: "第二章", depth: 0},
    ];
    const flat = flattenOutline(nested, 48);
    assert.deepEqual(flat.map((item) => item.title), ["第一章", "1.1 小节", "1.1.1 细节", "第二章"]);
    assert.deepEqual(flat.map((item) => item.depth), [0, 1, 2, 0]);
});

test("flattenOutline respects the limit and skips malformed nodes", () => {
    const nodes = Array.from({length: 20}, (_, i) => ({id: `2026010100000${String(i).padStart(2, "0")}-aaaaaaa`, name: `标题 ${i}`, depth: 0}));
    assert.equal(flattenOutline(nodes, 5).length, 5);
    // 缺 id / 缺标题 / 非对象节点被跳过
    const messy = [
        {name: "无 id"},
        {id: "20260101000001-aaaaaaa"},
        null,
        {id: "20260101000002-bbbbbbb", name: "有效"},
    ];
    assert.deepEqual(flattenOutline(messy, 48).map((item) => item.title), ["有效"]);
    assert.deepEqual(flattenOutline("bad", 48), []);
    // 超深层级被钳制到 8
    assert.equal(flattenOutline([{id: "20260101000003-ccccccc", name: "深", depth: 99}], 48)[0].depth, 8);
});
