// T-6310 路径筛选模型加固契约：只补 path-filter-model.test.cjs 未覆盖的真实边界。
// 不重复既有断言（请求形状、安全条目、mismatch、探测矩阵、超限已由原套件钉住）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {MAX_PATH_ITEMS, buildPathFilterListRequest, normalizePathFilterListResponse, normalizePathFilterProbeOutcome} = require("../src/path-filter-model.js");

const notebook = "20260913120000-boxabc";
const rootId = "20260913120100-rootabc";
const childId = "20260913120200-childab";

test("windows backslash paths normalize before validation", () => {
    const request = buildPathFilterListRequest({notebook, path: `\\${rootId}.sy\\${childId}.sy`});
    assert.ok(request, "反斜杠路径归一后必须放行");
    assert.equal(request.body.path, `/${rootId}.sy/${childId}.sy`);
    const mixed = buildPathFilterListRequest({notebook, path: `/${rootId}.sy\\${childId}.sy\\`});
    assert.equal(mixed, null, "归一后仍以 / 结尾的路径必须拒绝");
});

test("path grammar rejects trailing slash, double slash and non-document parts", () => {
    assert.equal(buildPathFilterListRequest({notebook, path: `/${rootId}.sy/`}), null);
    assert.equal(buildPathFilterListRequest({notebook, path: `/${rootId}.sy//child.sy`}), null);
    assert.equal(buildPathFilterListRequest({notebook, path: "/readme.md"}), null, "仅放行 .sy 文档");
    assert.equal(buildPathFilterListRequest({notebook, path: "/short.sy"}), null, "文档名必须形如块 ID");
    const upper = buildPathFilterListRequest({notebook, path: `/${rootId}.SY`});
    assert.ok(upper, "后缀判定大小写不敏感，.SY 与 .sy 等价");
    assert.equal(upper.body.path, `/${rootId}.SY`, "归一不改写宿主原始大小写");
});

test("limit clamps into [1, MAX] with sentinel following", () => {
    const zero = buildPathFilterListRequest({notebook, limit: 0});
    assert.equal(zero.limit, 1);
    assert.equal(zero.body.maxListCount, 2);
    const negative = buildPathFilterListRequest({notebook, limit: -5});
    assert.equal(negative.limit, 1);
    const fractional = buildPathFilterListRequest({notebook, limit: 3.9});
    assert.equal(fractional.limit, 3, "小数向下取整");
    const huge = buildPathFilterListRequest({notebook, limit: 100000});
    assert.equal(huge.limit, MAX_PATH_ITEMS);
});

test("title falls back to the document id when the host name is blank", () => {
    const result = normalizePathFilterListResponse({code: 0, data: {
        box: notebook,
        path: `/${rootId}.sy`,
        files: [{id: childId, name: "   ", path: `/${rootId}.sy/${childId}.sy`, subFileCount: 0}],
    }}, {notebook, path: `/${rootId}.sy`});
    assert.equal(result.items[0].title, childId, "空白文件名回退为块 ID");
});

test("oversized titles are bounded to 128 characters", () => {
    const result = normalizePathFilterListResponse({code: 0, data: {
        box: notebook,
        path: `/${rootId}.sy`,
        files: [{id: childId, name: `${"长".repeat(300)}.sy`, path: `/${rootId}.sy/${childId}.sy`, subFileCount: 0}],
    }}, {notebook, path: `/${rootId}.sy`});
    assert.ok(result.items[0].title.length <= 128);
});

test("hasChildren treats zero and missing subFileCount identically as false", () => {
    const result = normalizePathFilterListResponse({code: 0, data: {
        box: notebook,
        path: `/${rootId}.sy`,
        files: [
            {id: childId, name: "a", path: `/${rootId}.sy/${childId}.sy`, subFileCount: 0},
            {id: "20260913120300-childab", name: "b", path: `/${rootId}.sy/20260913120300-childab.sy`},
            {id: "20260913120400-childab", name: "c", path: `/${rootId}.sy/20260913120400-childab.sy`, subFileCount: -3},
        ],
    }}, {notebook, path: `/${rootId}.sy`});
    assert.deepEqual(result.items.map((item) => item.hasChildren), [false, false, false]);
});

test("http 405 and 501 map to unavailable while 403 stays a failure", () => {
    assert.equal(normalizePathFilterProbeOutcome({kind: "http", status: 405}, {notebook}).reason, "unavailable", "405 = 宿主无此路由");
    assert.equal(normalizePathFilterProbeOutcome({kind: "http", status: 501}, {notebook}).reason, "unavailable", "501 = 内核版本过旧");
    assert.equal(normalizePathFilterProbeOutcome({kind: "http", status: 403}, {notebook}).reason, "failed", "403 属鉴权/权限失败而非能力缺失");
});
