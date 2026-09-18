// T-6321~T-6325、T-6328 内核数据组件投影模型契约。
// 全部针对 kernel-widget-model.js 的真实行为：响应形状容错、有界截断、去重、
// 双层信封失败归一、点击语义（value=块 ID 由面板直接打开）。
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/kernel-widget-model.js');

const NOW = 1725696000000;
const OK = {title: "T"};

const okResponse = (data) => ({code: 0, msg: "", data});

// ---------- T-6321 置顶文档 ----------
test('pinned docs project valid docs, skip unavailable and invalid ids', () => {
    const payload = okResponse([
        {id: "20260917120000-abcdef", name: "日记", subFileCount: 2},
        {id: "20260917120001-abcdef", unavailable: true, name: "已失效"},
        {id: "not-a-block-id", name: "坏 ID"},
        {id: "20260917120002-abcdef", name: "  "},
    ]);
    const snapshot = model.buildPinnedDocsSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "日记");
    assert.equal(snapshot.items[0].value, "20260917120000-abcdef", "value=块 ID，面板点击直接打开");
    assert.equal(snapshot.emptyHint, "");
});

test('pinned docs clamp limit and default blank names to the id', () => {
    const docs = Array.from({length: 10}, (_, index) => ({id: `202609171200${String(10 + index)}-abcdef`, name: `n${index}`}));
    const snapshot = model.buildPinnedDocsSnapshot(okResponse(docs), {limit: 3}, OK, NOW);
    assert.equal(snapshot.items.length, 3);
    const blank = model.buildPinnedDocsSnapshot(okResponse([{id: "20260917120000-abcdef", name: ""}]), {}, OK, NOW);
    assert.equal(blank.items[0].label, "20260917120000-abcdef");
});

test('pinned docs rejects malformed payloads', () => {
    assert.equal(model.buildPinnedDocsSnapshot(null, {}, OK), null);
    assert.equal(model.buildPinnedDocsSnapshot({code: -1, msg: "x"}, {}, OK), null);
    assert.equal(model.buildPinnedDocsSnapshot({data: "not-an-array"}, {}, OK), null);
});

// ---------- T-6322 收集箱（云端双层信封） ----------
const inboxPayload = (inner) => ({code: 0, msg: "", data: inner});
const inboxPage = (shorthands) => inboxPayload({code: 0, msg: "", data: {shorthands, pagination: {}}});

test('inbox projects shorthand titles with http links only', () => {
    const snapshot = model.buildInboxSnapshot(inboxPage([
        {oId: "1", shorthandTitle: "文章", shorthandURL: "https://a.example/x"},
        {oId: "2", shorthandContent: "只有正文的速记", shorthandURL: "javascript:alert(1)"},
        {oId: "3", shorthandTitle: "  ", shorthandContent: "  "},
    ]), {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].href, "https://a.example/x");
    assert.equal(snapshot.items[1].href, undefined, "非 http(s) 链接交给渲染层白名单过滤");
    assert.equal(snapshot.items[1].label, "只有正文的速记", "无标题时回退正文");
});

test('inbox failures at either envelope resolve to null for a determined empty state', () => {
    assert.equal(model.buildInboxSnapshot({code: -1, msg: "未登录"}, {}, OK), null, "内核层失败");
    assert.equal(model.buildInboxSnapshot(inboxPayload({code: 1, msg: "cloud down"}), {}, OK), null, "云端层失败");
    assert.equal(model.buildInboxSnapshot(inboxPayload({code: 0, data: {}}), {}, OK), null, "缺 shorthands 字段");
    assert.equal(model.buildInboxSnapshot(inboxPage([]), {}, OK, NOW).items.length, 0, "空列表是有效空态");
});

// ---------- T-6323 最近更新 ----------
test('recent updates project block content with root doc jump targets', () => {
    const payload = okResponse([
        {id: "20260917120100-abcdef", rootID: "20260917120000-abcdef", content: "更新的段落", hPath: "/日记/2026-09-17"},
        {id: "20260917120101-abcdef", rootID: "20260917120000-abcdef", fcontent: "同文档另一段", hPath: "/日记/2026-09-17"},
        {id: "20260917120102-abcdef", rootID: "", content: "无根 ID"},
    ]);
    const snapshot = model.buildRecentUpdatesSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 3, "rootID 缺失回退自身块 ID（面板按块 ID 打开）");
    assert.equal(snapshot.items[0].value, "20260917120000-abcdef", "value=rootID，点击打开所在文档");
    assert.equal(snapshot.items[1].label, "同文档另一段", "fcontent 优先于 content");
    assert.equal(snapshot.items[0].secondary, "/日记/2026-09-17");
});

test('recent updates dedupe by root+content and clamp the list', () => {
    // 同一块被反复更新时内核会返回多条同 root+content 记录：只保留一条。
    const repeated = {id: "20260917120100-abcdef", rootID: "20260917120000-abcdef", content: "反复更新", hPath: ""};
    const blocks = [repeated, repeated, repeated];
    for (let index = 0; index < 10; index += 1) {
        blocks.push({id: `2026091712${String(200 + index)}-abcdef`, rootID: `202609171200${String(20 + index)}-abcdef`, content: `独立段落${index}`, hPath: ""});
    }
    const snapshot = model.buildRecentUpdatesSnapshot(okResponse(blocks), {limit: 5}, OK, NOW);
    assert.equal(snapshot.items.length, 5);
    assert.equal(snapshot.items[0].label, "反复更新", "同键重复只保留一条");
    assert.equal(snapshot.items.filter((item) => item.label === "反复更新").length, 1);
});

// ---------- T-6324 数据健康 ----------
test('data health counts missing assets with a bounded list and stat', () => {
    const payload = okResponse([
        {item: "assets/a.png", name: "a.png", path: "assets/a.png"},
        {item: "assets/b.png", name: "b.png"},
        {item: "assets/a.png", name: "a.png"},
        {item: "", name: "  "},
    ]);
    const snapshot = model.buildDataHealthSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.stat.value, "2");
    assert.equal(snapshot.stat.label, "缺失资源");
    assert.equal(snapshot.emptyHint, "");
});

test('data health cap annotates the stat with a plus suffix', () => {
    const assets = Array.from({length: 10}, (_, index) => ({item: `assets/${index}.png`, name: `${index}.png`}));
    const snapshot = model.buildDataHealthSnapshot(okResponse(assets), {limit: 5}, OK, NOW);
    assert.equal(snapshot.items.length, 5);
    assert.equal(snapshot.stat.value, "5+");
});

test('data health zero state reports a clean workspace', () => {
    const snapshot = model.buildDataHealthSnapshot(okResponse([]), {}, OK, NOW);
    assert.equal(snapshot.items.length, 0);
    assert.equal(snapshot.emptyHint, "未发现缺失资源");
});

// ---------- T-6325 原生最近文档 ----------
test('host recent docs dedupe by root id keeping the latest stamp', () => {
    const payload = okResponse([
        {rootID: "20260917120000-abcdef", title: "日记", viewedAt: 100},
        {rootID: "20260917120000-abcdef", title: "日记", viewedAt: 900},
        {rootID: "20260917120001-abcdef", title: "随笔", openAt: 500},
        {rootID: "bad-id", title: "坏 ID"},
    ]);
    const snapshot = model.buildHostRecentDocsSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "日记", "按最近时间戳排序");
    assert.equal(snapshot.items[0].value, "20260917120000-abcdef");
});

test('host recent docs clamp and fall back titles to ids', () => {
    const docs = Array.from({length: 10}, (_, index) => ({rootID: `202609171200${String(10 + index)}-abcdef`, title: "", viewedAt: index}));
    const snapshot = model.buildHostRecentDocsSnapshot(okResponse(docs), {limit: 4}, OK, NOW);
    assert.equal(snapshot.items.length, 4);
    assert.equal(snapshot.items[0].label, "20260917120019-abcdef", "无标题回退 ID 且最新在前");
});

// ---------- T-6328 数据库导航 ----------
test('database list projects av blocks with click-to-open values', () => {
    const rows = [
        {id: "20260917120200-abcdef", content: "阅读清单", hpath: "/读书/阅读清单"},
        {id: "20260917120200-abcdef", content: "重复行"},
        {id: "bad", content: "坏 ID"},
        {id: "20260917120201-abcdef", content: ""},
    ];
    const snapshot = model.buildDatabaseListSnapshot(rows, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "阅读清单");
    assert.equal(snapshot.items[1].label, "20260917120201-abcdef", "无标题数据库回退 hpath 已空再用 ID");
    assert.equal(model.buildDatabaseListSnapshot("not-an-array", {}, OK), null);
});

// ---------- 通用边界 ----------
test('every builder clamps limits into 1..12 and tolerates non-object configs', () => {
    assert.equal(model.normalizePinnedDocsConfig({limit: 99}).limit, 12);
    assert.equal(model.normalizePinnedDocsConfig(null).limit, 8);
    assert.equal(model.normalizeInboxConfig({page: -2}).page, 1);
    assert.equal(model.normalizeRecentUpdatesConfig({limit: 0}).limit, 1);
    assert.equal(model.normalizeDataHealthConfig({}).limit, 8);
    assert.equal(model.normalizeHostRecentDocsConfig({limit: "x"}).limit, 8);
    assert.equal(model.normalizeDatabaseListConfig({}).limit, 8);
});

test('health status passthrough only accepts the known trio', () => {
    const payload = okResponse([]);
    assert.equal(model.buildPinnedDocsSnapshot(payload, {}, OK, NOW, "stale").sourceHealth, "stale");
    assert.equal(model.buildPinnedDocsSnapshot(payload, {}, OK, NOW, "bogus").sourceHealth, "fresh");
    assert.equal(model.buildInboxSnapshot(inboxPage([]), {}, OK, NOW, "cached").sourceHealth, "cached");
});
