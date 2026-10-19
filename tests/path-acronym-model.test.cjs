// T-7334 路径首字母模糊加速（Path Acronym Scoring）契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/path-acronym-model.js 与 search-model 导出；
//   - 负向探针在文件末尾独立执行：注入违规（顺序跨越/中文查询/集合被增删）必须定向失败；
//   - 不复用被测实现自建正则做判定，命中与顺序断言均由生产函数返回值驱动。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    splitPathSegments,
    segmentInitials,
    isAcronymQuery,
    scorePathAcronym,
    rankByPathAcronym,
    ACRONYM_MIN_BYTES,
    ACRONYM_MAX_BYTES,
} = require("../src/path-acronym-model.js");
const {rankDocumentsByPathAcronym} = require("../src/search-model.js");

const DEEP_PATH = "思源库/研发/小驴雷切";

test("T-7334: acronym query gate accepts only short ascii needles", () => {
    assert.equal(isAcronymQuery("syk"), true);
    assert.equal(isAcronymQuery("s"), false, "单字符拒绝：误命中率过高");
    assert.equal(isAcronymQuery(""), false);
    assert.equal(isAcronymQuery("思源"), false, "中文查询交给既有子串/拼音链路");
    assert.equal(isAcronymQuery("sy k"), false, "含空格非缩写");
    assert.equal(isAcronymQuery("sy-k"), false, "含标点非缩写");
    assert.equal(isAcronymQuery("a".repeat(ACRONYM_MAX_BYTES)), true);
    assert.equal(isAcronymQuery("a".repeat(ACRONYM_MAX_BYTES + 1)), false, "超限拒绝");
    assert.equal(isAcronymQuery("a".repeat(ACRONYM_MIN_BYTES - 1)), false);
});

test("T-7334: path segments split on slash and drop .sy suffix", () => {
    assert.deepEqual(splitPathSegments(DEEP_PATH), ["思源库", "研发", "小驴雷切"]);
    assert.deepEqual(splitPathSegments("研发/小驴雷切.sy"), ["研发", "小驴雷切"]);
    assert.deepEqual(splitPathSegments("a\\b\\c"), ["a", "b", "c"], "反斜杠同样按路径分隔");
    assert.deepEqual(splitPathSegments(""), []);
    assert.deepEqual(splitPathSegments(null), []);
    assert.deepEqual(splitPathSegments("///"), []);
    // 段数上限：超长路径被截断，避免打分退化为线性大扫描
    const many = Array.from({length: 40}, (_, i) => `s${i}`).join("/");
    assert.ok(splitPathSegments(many).length <= 8);
});

test("T-7334: segment initials cover hanzi, latin and digits", () => {
    assert.equal(segmentInitials("研发"), "yf");
    assert.equal(segmentInitials("小驴雷切"), "xllq");
    assert.equal(segmentInitials("思源库"), "syk");
    assert.equal(segmentInitials("raika"), "raika", "纯拉丁段逐字符入列");
    assert.equal(segmentInitials("v2"), "v2");
    assert.equal(segmentInitials(""), "");
});

test("T-7334: acronym scoring consumes query across segments in order", () => {
    // 正向：syk → 思源库(sy-k 的 sy) + ... 逐段消费
    assert.equal(scorePathAcronym(DEEP_PATH, "syk"), 3, "全量消费查询字符");
    assert.equal(scorePathAcronym(DEEP_PATH, "sy"), 2);
    assert.equal(scorePathAcronym(DEEP_PATH, "syx"), 3, "跨段：思源库(sy) + 小驴雷切(x)");
    assert.equal(scorePathAcronym(DEEP_PATH, "syf"), 3, "跨段：思源库(sy) + 研发(f)");
    assert.equal(scorePathAcronym("研发/小驴雷切", "syk"), 0, "缺首段则无法起头");
    assert.equal(scorePathAcronym(DEEP_PATH, "xfy"), 0, "不可乱序");
    assert.equal(scorePathAcronym(DEEP_PATH, "zzz"), 0);
    assert.equal(scorePathAcronym(DEEP_PATH, "思源"), 0, "中文不参与缩写打分");
    assert.equal(scorePathAcronym("", "syk"), 0);
    assert.equal(scorePathAcronym(DEEP_PATH, ""), 0);
});

test("T-7334: acronym never matches inside a single segment out of order", () => {
    // 段内也必须按序：'发研'(fy) 不能被 'yf' 命中
    assert.equal(scorePathAcronym("发研/甲", "yf"), 0);
    assert.equal(scorePathAcronym("研发/甲", "yf"), 2);
    // 段内取前缀而非任意子序列：'xq' 不能跳过 'll'
    assert.equal(scorePathAcronym("小驴雷切", "xq"), 0);
    assert.equal(scorePathAcronym("小驴雷切", "xl"), 2);
});

test("T-7334: ranking promotes acronym hits without changing the result set", () => {
    const docs = [
        {rootId: "20260101000000-aaaaaaa", title: "无关文档", hPath: "其他/无关文档"},
        {rootId: "20260101000000-bbbbbbb", title: "小驴雷切", hPath: DEEP_PATH},
        {rootId: "20260101000000-ccccccc", title: "另外一篇", hPath: "别的库/另外一篇"},
    ];
    const ranked = rankByPathAcronym(docs, "syk", {pathOf: (doc) => doc.hPath});
    assert.equal(ranked.length, docs.length, "重排不得增删条目");
    assert.equal(ranked[0].rootId, "20260101000000-bbbbbbb", "缩写命中被前置");
    assert.deepEqual(new Set(ranked.map((doc) => doc.rootId)), new Set(docs.map((doc) => doc.rootId)),
        "集合内容保持一致");
    // 同分与非命中项保持原有相对顺序（稳定性）
    assert.equal(ranked[1].rootId, "20260101000000-aaaaaaa");
    assert.equal(ranked[2].rootId, "20260101000000-ccccccc");
});

test("T-7334: ranking is a no-op for non-acronym queries", () => {
    const docs = [
        {rootId: "a", hPath: "其他/无关文档"},
        {rootId: "b", hPath: DEEP_PATH},
    ];
    assert.deepEqual(rankByPathAcronym(docs, "思源", {pathOf: (d) => d.hPath}).map((d) => d.rootId), ["a", "b"]);
    assert.deepEqual(rankByPathAcronym(docs, "", {pathOf: (d) => d.hPath}).map((d) => d.rootId), ["a", "b"]);
    assert.deepEqual(rankByPathAcronym(docs, "z", {pathOf: (d) => d.hPath}).map((d) => d.rootId), ["a", "b"]);
    assert.deepEqual(rankByPathAcronym([], "syk"), []);
    assert.deepEqual(rankByPathAcronym(null, "syk"), []);
});

test("T-7334: search-model wrapper ranks documents by hPath then path", () => {
    const docs = [
        {rootId: "1", path: "其他/无关"},
        {rootId: "2", hPath: DEEP_PATH},
        {rootId: "3", path: "思源库/随手"},
    ];
    const ranked = rankDocumentsByPathAcronym(docs, "syk");
    assert.equal(ranked.length, 3, "包装层同样只重排");
    assert.equal(ranked[0].rootId, "2", "hPath 优先");
    assert.equal(ranked[1].rootId, "3", "回退取 path 仍能命中笔记本首字母");
    assert.equal(ranked[2].rootId, "1");
    // 非缩写查询原样返回
    assert.deepEqual(rankDocumentsByPathAcronym(docs, "思源").map((d) => d.rootId), ["1", "2", "3"]);
});

test("T-7334: bounded inputs — long path and oversized list stay safe", () => {
    const longPath = Array.from({length: 60}, (_, i) => `第${i}层`).join("/");
    assert.equal(scorePathAcronym(longPath, "zzzz"), 0, "超长路径安全返回");
    const huge = Array.from({length: 900}, (_, i) => ({rootId: String(i), hPath: DEEP_PATH}));
    const ranked = rankByPathAcronym(huge, "syk", {pathOf: (d) => d.hPath});
    assert.equal(ranked.length, 900, "候选上限只限制参与重排，不丢弃条目");
    assert.equal(ranked[0].hPath, DEEP_PATH);
});

// ==================== 负向探针（门禁自查 §核心原则） ====================
// 这些断言在被注入违规时必须失败；它们守护的是"缩写打分不得越界"。
test("T-7334 negative probes: acronym scoring must not over-match", () => {
    // 探针 1：顺序约束被旁路（允许乱序）会让 'xfy' 命中——生产必须拒绝。
    assert.equal(scorePathAcronym(DEEP_PATH, "xfy"), 0,
        "乱序命中必须仍为 0，否则顺序约束被破坏");
    // 探针 2：跨段约束被旁路（允许段内任意子序列）会让 'xq' 命中。
    assert.equal(scorePathAcronym("小驴雷切", "xq"), 0,
        "段内跳字命中必须仍为 0，否则段内前缀约束被破坏");
    // 探针 3：中文查询被误纳入缩写打分。
    assert.equal(isAcronymQuery("思源库"), false,
        "中文查询不得进入缩写链路");
    // 探针 4：重排不得改变集合大小。
    const sample = [{rootId: "1", hPath: DEEP_PATH}, {rootId: "2", hPath: "其他"}];
    const rankedSample = rankByPathAcronym(sample, "syk", {pathOf: (d) => d.hPath});
    assert.equal(rankedSample.length, sample.length, "重排不得增删条目");
    assert.notEqual(rankedSample.length, sample.length + 1);
    // 探针 5：极短查询不得启用加速（1 字符）。
    assert.equal(isAcronymQuery("s"), false, "单字符不得启用，否则误命中率失控");
    assert.equal(scorePathAcronym(DEEP_PATH, "s"), 0);
});
