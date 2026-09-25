// T-6869 统一平台 SurfaceContext（P1-c，ADR 0079）：表面白名单、跨表面上下文
// 归一化、悬浮球"恢复上次表面"的安全回退与 ContextBar 文案投影的纯函数测试。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    PLATFORM_SURFACE_IDS,
    PLATFORM_SURFACE_ENTRIES,
    PLATFORM_OBJECT_KINDS,
    normalizeSurfaceId,
    normalizeSurfaceContext,
    resolveSurfaceReturnTarget,
    buildSurfaceContextCaption,
    projectSnippetObjects,
} = require("../src/platform-surface-model.js");

test("surface ids: canonical whitelist is frozen and normalize falls back (T-6869)", () => {
    assert.deepEqual([...PLATFORM_SURFACE_IDS], ["switcher", "workbench", "studio"]);
    assert.equal(Object.isFrozen(PLATFORM_SURFACE_IDS), true, "表面清单必须冻结（防运行时篡改）");
    assert.equal(normalizeSurfaceId("workbench"), "workbench");
    assert.equal(normalizeSurfaceId("bogus"), "switcher", "非法表面回落切换器");
    assert.equal(normalizeSurfaceId("", ""), "", "fallback 可传空串用于探测非法值");
    assert.equal(normalizeSurfaceId(undefined), "switcher");
});

test("surface context: normalizes entry/objectId/query with bounds", () => {
    const context = normalizeSurfaceContext({entry: "surface-nav", objectId: " 20260101120000-abc1234 ", query: "  产品路线图  "});
    assert.deepEqual(context, {entry: "surface-nav", objectId: "20260101120000-abc1234", query: "产品路线图"});
    assert.equal(normalizeSurfaceContext({entry: "hacked"}), null, "入口非法且无有效字段时返回 null");
    assert.equal(normalizeSurfaceContext({entry: "hacked", query: "x"}).entry, "unknown", "入口不在白名单归 unknown");
    assert.equal(normalizeSurfaceContext(null), null, "无上下文返回 null");
    assert.equal(normalizeSurfaceContext("query"), null, "非对象入参返回 null");
    assert.equal(normalizeSurfaceContext({}), null, "全空上下文返回 null（调用方不必挂空对象）");
    assert.equal(normalizeSurfaceContext({entry: "fab", query: "x".repeat(500)}).query.length, 120, "查询词钳制 120");
    assert.equal(normalizeSurfaceContext({objectId: "id".repeat(200)}).objectId.length, 128, "对象 id 钳制 128");
    assert.equal(
        normalizeSurfaceContext({query: "a\u0000b"}).query,
        "a b",
        "控制字符清洗为空格",
    );
    assert.ok(PLATFORM_SURFACE_ENTRIES.includes("fab") && PLATFORM_SURFACE_ENTRIES.includes("surface-nav"));
});

test("surface return target: restores last surface only while it stays available", () => {
    assert.equal(resolveSurfaceReturnTarget("workbench", ["switcher", "workbench"]), "workbench");
    assert.equal(
        resolveSurfaceReturnTarget("studio", ["switcher", "workbench"]),
        "switcher",
        "桌面专属片段实验室在移动端回退切换器",
    );
    assert.equal(resolveSurfaceReturnTarget("bogus", ["switcher", "workbench", "studio"]), "switcher", "非法值回退");
    assert.equal(resolveSurfaceReturnTarget(undefined, ["switcher"]), "switcher", "无会话记录回退");
    assert.equal(
        resolveSurfaceReturnTarget("studio", ["switcher", "workbench", "studio"]),
        "studio",
        "桌面端完整恢复",
    );
    assert.equal(
        resolveSurfaceReturnTarget("workbench", []),
        "switcher",
        "可用清单缺失时不猜表面",
    );
    assert.equal(
        resolveSurfaceReturnTarget("workbench", ["switcher", "workbench"], "studio"),
        "workbench",
        "自定义 fallback 仅在不可恢复时生效",
    );
});

test("surface caption: object stays the surface name; hint shows live query when present", () => {
    const labels = {
        surfaces: {switcher: "切换器", workbench: "工作台", studio: "片段实验室"},
        hints: {switcher: "查找、预览和打开内容", workbench: "编排信息组件", studio: "安全编辑"},
    };
    const plain = buildSurfaceContextCaption({surface: "switcher", labels});
    assert.equal(plain.object, "切换器");
    assert.equal(plain.hint, "查找、预览和打开内容");
    assert.equal(plain.hasQuery, false);
    const queried = buildSurfaceContextCaption({surface: "workbench", context: {entry: "fab", query: " 报销 流程 "}, labels});
    assert.equal(queried.object, "工作台", "对象位不因查询词改变");
    assert.equal(queried.hint, "报销 流程", "提示位显示查询现场（有界清洗）");
    assert.equal(queried.hasQuery, true);
    const missing = buildSurfaceContextCaption({surface: "studio"});
    assert.equal(missing.object, "studio", "缺 labels 时回落表面 id，不抛错");
    assert.equal(missing.hint, "");
});

test("snippet objects: bounded projection from the native getSnippet payload (T-6878)", () => {
    const payload = {
        code: 0,
        data: {snippets: [
            {id: "20260901120000-aaaaaaa", name: "卡片悬浮阴影", type: "css", enabled: true, content: "a\nb\nc"},
            {id: "20260901120001-bbbbbbb", name: "快捷导出助手", type: "js", enabled: false, content: "x"},
            {id: "", name: "无 id", type: "css", enabled: true, content: "z"},
            {id: "20260901120002-ccccccc", name: "", type: "css", enabled: true, content: "z"},
            {id: "20260901120003-ddddddd", name: "怪类型", type: "ts", enabled: true, content: "z"},
            {id: "20260901120000-aaaaaaa", name: "重复 id", type: "css", enabled: false, content: "y"},
        ]},
    };
    const items = projectSnippetObjects(payload, {limit: 6});
    assert.equal(items.length, 2, "无 id/无名/怪类型/重复 id 一律不投影");
    assert.deepEqual(items[0], {id: "20260901120000-aaaaaaa", name: "卡片悬浮阴影", type: "css", enabled: true, lines: 3});
    assert.equal(items[1].enabled, false);
});

test("snippet objects: query filter, limit clamp and malformed payloads", () => {
    const snippets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
        id: "id-" + n, name: "片段" + n, type: n % 2 ? "css" : "js", enabled: true, content: "",
    }));
    const payload = {code: 0, data: {snippets}};
    assert.equal(projectSnippetObjects(payload).length, 6, "默认上限 6");
    assert.equal(projectSnippetObjects(payload, {limit: 99}).length, 8, "硬上限 8");
    const filtered = projectSnippetObjects(payload, {query: "片段1"});
    assert.equal(filtered.length, 2, "名称子串过滤命中 片段1/片段10");
    assert.equal(projectSnippetObjects(payload, {query: "js"})[0].type, "js", "类型可作过滤词");
    assert.deepEqual(projectSnippetObjects({code: 1}, {}), [], "非 0 响应返回空");
    assert.deepEqual(projectSnippetObjects(null, {}), [], "空载荷返回空");
    assert.deepEqual(projectSnippetObjects({code: 0, data: {}}, {}), [], "缺 snippets 返回空");
});

test("snippet objects: kinds whitelist is frozen (T-6878)", () => {
    assert.deepEqual([...PLATFORM_OBJECT_KINDS], ["content", "action", "workspace", "widget", "snippet"]);
    assert.equal(Object.isFrozen(PLATFORM_OBJECT_KINDS), true);
});
