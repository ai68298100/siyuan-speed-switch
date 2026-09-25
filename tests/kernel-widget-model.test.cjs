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
test('pinned docs project valid docs, expose unavailable targets, and skip malformed ids', () => {
    const payload = okResponse([
        {id: "20260917120000-abcdef", name: "日记", subFileCount: 2},
        {id: "20260917120001-abcdef", unavailable: true, name: "已失效"},
        {id: "not-a-block-id", name: "坏 ID"},
        {id: "20260917120002-abcdef", name: "  "},
    ]);
    const snapshot = model.buildPinnedDocsSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 3);
    assert.equal(snapshot.items[0].label, "日记");
    assert.equal(snapshot.items[0].value, "20260917120000-abcdef", "value=块 ID，面板点击直接打开");
    assert.equal(snapshot.items[0].secondary, "2 个子文档");
    assert.equal(snapshot.items[0].rank, undefined, "默认不显示无额外含义的序号");
    assert.equal(snapshot.items[1].value, "", "不可用条目只展示状态，不能继续触发打开");
    assert.equal(snapshot.emptyHint, "");
});

test('pinned docs clamp limit and default blank names to the id', () => {
    const docs = Array.from({length: 10}, (_, index) => ({id: `202609171200${String(10 + index)}-abcdef`, name: `n${index}`}));
    const snapshot = model.buildPinnedDocsSnapshot(okResponse(docs), {limit: 3}, OK, NOW);
    assert.equal(snapshot.items.length, 3);
    const blank = model.buildPinnedDocsSnapshot(okResponse([{id: "20260917120000-abcdef", name: ""}]), {}, OK, NOW);
    assert.equal(blank.items[0].label, "20260917120000-abcdef");
});

test('pinned docs support path, child-count, rank, and unavailable visibility settings', () => {
    const payload = okResponse([
        {id: "20260917120000-abcdef", name: "项目", hpath: "/工作/项目", subFileCount: 4},
        {id: "20260917120001-abcdef", name: "失效", unavailable: true},
    ]);
    const snapshot = model.buildPinnedDocsSnapshot(payload, {
        showPath: "是", showChildCount: "是", showRank: "是", showUnavailable: "否",
    }, {children: "个子文档", stat: "条置顶"}, NOW);
    assert.deepEqual(snapshot.items, [{
        label: "项目", value: "20260917120000-abcdef", secondary: "/工作/项目 · 4 个子文档", rank: 1,
    }]);
    assert.deepEqual(snapshot.stat, {value: "1/2", label: "条置顶 · 1 不可用"});
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

test('inbox supports cloud pages, local filtering, previews, hosts, and optional ranks', () => {
    const payload = inboxPayload({code: 0, data: {
        shorthands: [
            {shorthandTitle: '性能文章', shorthandContent: '关于缓存的正文', shorthandURL: 'https://example.com/cache'},
            {shorthandTitle: '生活记录', shorthandContent: '散步'},
        ],
        pagination: {total: 23},
    }});
    const snapshot = model.buildInboxSnapshot(payload, {page: 2, query: '缓存', showRank: '是'}, {page: '页'}, NOW);
    assert.deepEqual(snapshot.items, [{
        label: '性能文章', value: 'https://example.com/cache', href: 'https://example.com/cache',
        secondary: '关于缓存的正文 · example.com', rank: 1,
    }]);
    assert.deepEqual(snapshot.stat, {value: '1/23', label: '页 2'});
    assert.deepEqual(model.normalizeInboxConfig({page: 999, showPreview: '否', showLinkHost: false}), {
        page: 100, limit: 8, query: '', showPreview: false, showLinkHost: false, showRank: false,
    });
});

test('reservations project overdue and today status with filtering and stable sorting', () => {
    const now = new Date(2026, 8, 18, 12).getTime();
    const rows = [
        {id: '20260918121000-reservaa', content: '今天提交', hpath: '/项目/A', date: '20260918', updated: '20260918110000'},
        {id: '20260918121001-reservbb', content: '昨天回访', hpath: '/客户/B', date: '20260917', updated: '20260918120000'},
        {id: '20260918121002-reservcc', content: '明天检查', hpath: '/项目/C', date: '20260919', updated: '20260917120000'},
    ];
    const snapshot = model.buildTodayReservationsSnapshot(rows, {query: '项目', showRank: '是'}, {
        today: '今天', overdue: '已过期', stat: '预约',
    }, now);
    assert.deepEqual(snapshot.items, [
        {label: '今天提交', value: '20260918121000-reservaa', secondary: '2026-09-18 · 今天 · /项目/A', rank: 1},
        {label: '明天检查', value: '20260918121002-reservcc', secondary: '2026-09-19 · /项目/C', rank: 2},
    ]);
    assert.deepEqual(snapshot.stat, {value: '2', label: '预约'});
    const recent = model.buildTodayReservationsSnapshot(rows, {sortBy: '最近更新', showDate: '否', showPath: '否'}, {}, now);
    assert.deepEqual(recent.items.map((item) => item.label), ['昨天回访', '今天提交', '明天检查']);
    assert.equal(recent.items[0].secondary, '已过期');
});

// ---------- T-6323 最近更新 ----------
test('recent updates project block content with root doc jump targets', () => {
    const payload = okResponse([
        {id: "20260917120100-abcdef", rootID: "20260917120000-abcdef", content: "更新的段落", hPath: "/日记/2026-09-17"},
        {id: "20260917120101-abcdef", rootID: "20260917120000-abcdef", fcontent: "同文档另一段", hPath: "/日记/2026-09-17"},
        {id: "20260917120102-abcdef", rootID: "", content: "无根 ID"},
    ]);
    const snapshot = model.buildRecentUpdatesSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2, "默认按 rootID 聚合同一文档，rootID 缺失回退自身块 ID");
    assert.equal(snapshot.items[0].value, "20260917120000-abcdef", "value=rootID，点击打开所在文档");
    assert.equal(snapshot.items[0].label, "更新的段落", "聚合后保留内核最近顺序里的首个摘要");
    assert.equal(snapshot.items[0].secondary, "/日记/2026-09-17 · 2 个更新块");
    assert.equal(snapshot.stat.value, "2");
});

test('recent updates expose aggregation, time, path and rank controls', () => {
    const payload = okResponse([
        {id: "20260917120100-abcdef", rootID: "20260917120000-abcdef", content: "段落 A", hPath: "/项目/A", updated: "20260918131415"},
        {id: "20260917120101-abcdef", rootID: "20260917120000-abcdef", fcontent: "段落 B", hPath: "/项目/A", updated: "20260918130000"},
    ]);
    const flat = model.buildRecentUpdatesSnapshot(payload, {groupByDocument: "否", showPath: "否", showUpdated: "是", showRank: "是"}, {blocks: "块"}, NOW);
    assert.equal(flat.items.length, 2);
    assert.equal(flat.items[0].secondary, "2026-09-18 13:14");
    assert.equal(flat.items[0].rank, 1);
    assert.equal(flat.stat.value, "2");
    assert.equal(flat.stat.label, "块", "平铺模式的统计单位随投影语义切换");
    assert.deepEqual(model.normalizeRecentUpdatesConfig({showPath: "否", showUpdated: false}), {
        limit: 8, groupByDocument: true, showPath: false, showUpdated: false, showRank: false,
    });
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

test('data health cap reports shown over filtered total', () => {
    const assets = Array.from({length: 10}, (_, index) => ({item: `assets/${index}.png`, name: `${index}.png`}));
    const snapshot = model.buildDataHealthSnapshot(okResponse(assets), {limit: 5}, OK, NOW);
    assert.equal(snapshot.items.length, 5);
    // T-6434 起“N+”升级为准确的“已显示/总数”，全量计数有 512 条扫描上限
    assert.equal(snapshot.stat.value, "5/10");
});

test('data health zero state reports a clean workspace', () => {
    const snapshot = model.buildDataHealthSnapshot(okResponse([]), {}, OK, NOW);
    assert.equal(snapshot.items.length, 0);
    assert.equal(snapshot.emptyHint, "未发现缺失资源");
});

// ---------- T-6325 原生最近文档 ----------
test('host recent docs dedupe by root id keeping the latest stamp', () => {
    const payload = okResponse([
        {rootID: "20260917120000-abcdef", title: "日记", hPath: "/日记/2026", viewedAt: 100},
        {rootID: "20260917120000-abcdef", title: "", viewedAt: 900},
        {rootID: "20260917120001-abcdef", title: "随笔", openAt: 500},
        {rootID: "bad-id", title: "坏 ID"},
    ]);
    const snapshot = model.buildHostRecentDocsSnapshot(payload, {limit: 8}, OK, NOW);
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].label, "日记", "较新的空标题不能覆盖有效标题");
    assert.equal(snapshot.items[0].value, "20260917120000-abcdef");
    assert.equal(snapshot.items[0].secondary, "/日记/2026", "重复记录应保留可读路径");
    assert.equal(snapshot.items[0].rank, undefined, "默认不显示没有额外含义的序号");
    assert.deepEqual(snapshot.stat, {value: "2", label: "篇文档"});
});

test('host recent docs clamp and fall back titles to ids', () => {
    const docs = Array.from({length: 10}, (_, index) => ({rootID: `202609171200${String(10 + index)}-abcdef`, title: "", viewedAt: index}));
    const snapshot = model.buildHostRecentDocsSnapshot(okResponse(docs), {limit: 4}, OK, NOW);
    assert.equal(snapshot.items.length, 4);
    assert.equal(snapshot.items[0].label, "20260917120019-abcdef", "无标题回退 ID 且最新在前");
});

test('host recent docs display options hide paths and opt into ranking', () => {
    const payload = okResponse([
        {rootID: "20260917120000-abcdef", title: "日记", hpath: "/日记/2026"},
        {rootID: "20260917120001-abcdef", title: "随笔", hPath: "/随笔"},
    ]);
    const snapshot = model.buildHostRecentDocsSnapshot(payload, {showPath: "否", showRank: "是"}, OK, NOW);
    assert.deepEqual(snapshot.items.map(({label, secondary, rank}) => ({label, secondary, rank})), [
        {label: "日记", secondary: undefined, rank: 1},
        {label: "随笔", secondary: undefined, rank: 2},
    ]);
});

test('host recent docs preserve official order when timestamps are unavailable', () => {
    const payload = okResponse([
        {rootID: "20260917120002-abcdef", title: "第一项"},
        {rootID: "20260917120001-abcdef", title: "第二项"},
    ]);
    const snapshot = model.buildHostRecentDocsSnapshot(payload, {}, OK, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["第一项", "第二项"]);
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

test('database list filters, sorts and reports the server total with configurable metadata', () => {
    const rows = [
        {id: "20260917120200-abcdef", content: "Beta", hpath: "/工作/Beta", updated: "20260918120000", total_count: 9},
        {id: "20260917120201-abcdef", content: "Alpha", hpath: "/工作/Alpha", updated: "20260917120000", total_count: 9},
    ];
    const snapshot = model.buildDatabaseListSnapshot(rows, {query: "工作", sortBy: "名称", showUpdated: "是", showRank: "是"}, {stat: "库"}, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["Alpha", "Beta"]);
    assert.equal(snapshot.items[0].secondary, "/工作/Alpha · 2026-09-17 12:00");
    assert.equal(snapshot.items[0].rank, 1);
    assert.deepEqual(snapshot.stat, {value: "2/9", label: "库"});
    assert.equal(model.buildDatabaseListSnapshot(rows, {query: "无匹配"}, {emptyFiltered: "无结果"}, NOW).emptyHint, "无结果");
});

test('recent edits model bounds time scope, filters rows, and formats paths and timestamps', () => {
    assert.deepEqual(model.normalizeRecentEditsConfig({days: 0, limit: 99, query: "a%'_", showPath: "否", showRank: true}), {
        limit: 12, notebook: "", days: 1, query: "a", showPath: false, showUpdated: true, showRank: true,
    });
    const rows = [
        {id: "20260917120200-abcdef", content: "旧标题", hpath: "/旧", updated: "20260917120000", total_count: 7},
        {id: "20260917120201-abcdef", content: "新标题", hpath: "/新", updated: "20260918131415", total_count: 7},
    ];
    const snapshot = model.buildRecentEditsSnapshot(rows, {query: "标题", showRank: "是"}, {stat: "文档"}, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["新标题", "旧标题"]);
    assert.equal(snapshot.items[0].secondary, "/新 · 2026-09-18 13:14");
    assert.equal(snapshot.items[0].rank, 1);
    assert.deepEqual(snapshot.stat, {value: "2/7", label: "文档"});
    assert.equal(model.buildRecentEditsSnapshot("bad", {}, {}, NOW), null);
});

// ---------- T-6373 随机回顾 ----------
test('random review config bounds age, batch size, scope, and path display', () => {
    assert.deepEqual(model.normalizeRandomReviewConfig({
        days: 1, limit: 99, notebook: "box-a", parentDocument: "bad", showPath: "否",
    }), {days: 7, limit: 6, notebook: "box-a", parentDocument: "", showPath: false});
    assert.deepEqual(model.normalizeRandomReviewConfig({
        days: 120, limit: 2, parentDocument: "20260917120000-parenta",
    }), {days: 120, limit: 2, notebook: "", parentDocument: "20260917120000-parenta", showPath: true});
});

test('random review snapshot reports candidate total, dedupes, and optionally shows paths', () => {
    const payload = okResponse([
        {id: "20260917121000-childaa", content: "旧笔记 A", hpath: "/项目/旧笔记 A", total_count: 18},
        {id: "20260917121000-childaa", content: "重复", hpath: "/重复", total_count: 18},
        {id: "20260917121001-childbb", content: "旧笔记 B", hpath: "/项目/旧笔记 B", total_count: 18},
    ]);
    const snapshot = model.buildRandomReviewSnapshot(payload, {limit: 2}, {title: "回顾", stat: "候选"}, NOW);
    assert.deepEqual(snapshot.items.map((item) => item.label), ["旧笔记 A", "旧笔记 B"]);
    assert.equal(snapshot.items[0].secondary, "/项目/旧笔记 A");
    assert.deepEqual(snapshot.stat, {value: "18", label: "候选"});
    const hidden = model.buildRandomReviewSnapshot(payload, {limit: 1, showPath: "否"}, {}, NOW);
    assert.equal(Object.hasOwn(hidden.items[0], "secondary"), false);
});

test('random review uses a scoped empty hint for an empty parent document', () => {
    const scoped = model.buildRandomReviewSnapshot(okResponse([]), {
        parentDocument: "20260917120000-parenta",
    }, {emptyScoped: "这个范围没有子文档"}, NOW);
    assert.equal(scoped.emptyHint, "这个范围没有子文档");
    assert.deepEqual(scoped.stat, {value: "0", label: "候选文档"});
    assert.equal(model.buildRandomReviewSnapshot({code: 0, data: null}, {}, {}), null);
});

// ---------- T-6392~T-6399 文档导航组件 ----------
test('outline widget filters by title and depth while preserving heading navigation', () => {
    const headings = [
        {id: '20260918120000-outline', title: '项目总览', depth: 0},
        {id: '20260918120001-outline', title: '项目计划', depth: 1},
        {id: '20260918120002-outline', title: '深层项目', depth: 2},
        {id: 'bad', title: '坏标题', depth: 0},
    ];
    const snapshot = model.buildOutlineWidgetSnapshot(headings, {
        query: '项目', maxDepth: 2, limit: 1, showRank: '是',
    }, {title: '大纲', stat: '标题', level: 'H{level}'}, NOW, 'fresh', '项目文档');
    assert.equal(snapshot.title, '大纲 · 项目文档');
    assert.deepEqual(snapshot.items, [{label: '项目总览', value: '20260918120000-outline', secondary: 'H1', rank: 1}]);
    assert.deepEqual(snapshot.stat, {value: '1/2', label: '标题'});
    assert.equal(model.buildOutlineWidgetSnapshot(headings, {query: '无结果'}, {emptyFiltered: '筛选为空'}, NOW).emptyHint, '筛选为空');
});

test('relations widget dedupes references, exposes type details, and applies relation filters', () => {
    const rows = [
        {id: '20260918120100-refaaaa', target_id: '20260918120000-docaaaa', content: '提到项目', relation: 'reference'},
        {id: '20260918120101-refbbbb', target_id: '20260918120000-docaaaa', content: '再次提到', relation: 'reference'},
        {id: '20260918120200-childaa', target_id: '20260918120200-childaa', content: '第一节', relation: 'child'},
    ];
    const all = model.buildDocumentRelationsSnapshot(rows, {limit: 8}, {
        reference: '引用', child: '子块', referenceCount: '{count} 处引用', stat: '关系',
    }, NOW);
    assert.equal(all.items.length, 2);
    assert.equal(all.items[0].secondary, '引用 · 2 处引用');
    const children = model.buildDocumentRelationsSnapshot(rows, {relation: '子块', showType: '否'}, {}, NOW);
    assert.deepEqual(children.items, [{label: '第一节', value: '20260918120200-childaa'}]);
});

test('tag widget flattens hierarchy and supports count or name sorting', () => {
    const tags = [
        {name: '工作', count: 2, children: [{name: '项目A', count: 7}]},
        {name: '生活', count: 4},
    ];
    const byCount = model.buildTagListSnapshot(tags, {limit: 2}, {blocks: '块', stat: '标签'}, NOW);
    assert.deepEqual(byCount.items.map((item) => [item.label, item.secondary]), [['工作/项目A', '7 块'], ['生活', '4 块']]);
    assert.deepEqual(byCount.stat, {value: '2/3', label: '标签'});
    const searched = model.buildTagListSnapshot(tags, {query: '项目', showHierarchy: '否', sortBy: '名称'}, {}, NOW);
    assert.equal(searched.items[0].label, '项目A');
    assert.equal(searched.items[0].value, 'tag:工作/项目A');
});

test('bookmark widget reports empty entries and can hide them', () => {
    const bookmarks = [
        {name: '稍后读', blocks: [{}, {}]},
        {name: '空分组', count: 0},
        {name: '稍后读', count: 1},
    ];
    const snapshot = model.buildBookmarkListSnapshot(bookmarks, {}, {blocks: '块', emptyEntry: '空书签', stat: '书签'}, NOW);
    assert.deepEqual(snapshot.items.map((item) => [item.label, item.secondary]), [['稍后读', '2 块'], ['空分组', '空书签']]);
    const hidden = model.buildBookmarkListSnapshot(bookmarks, {showEmpty: '否', query: '空'}, {emptyFiltered: '无结果'}, NOW);
    assert.equal(hidden.items.length, 0);
    assert.equal(hidden.emptyHint, '无结果');
});

// ---------- T-6401~T-6408 日期与剪藏入口 ----------
test('clipped unread projection dedupes roots, reports totals, and formats path/time', () => {
    const rows = [
        {root_id: '20260918130000-clipaaa', title: '阅读 A', hpath: '/剪藏/阅读 A', latest: '20260918123000', total_count: 3},
        {root_id: '20260918130000-clipaaa', title: '重复', latest: '20260918120000', total_count: 3},
        {root_id: '20260918130001-clipbbb', title: '阅读 B', hpath: '/剪藏/阅读 B', latest: '20260917120000', total_count: 3},
    ];
    const snapshot = model.buildClippedUnreadSnapshot(rows, {limit: 1, showRank: '是'}, {stat: '待读'}, NOW);
    assert.deepEqual(snapshot.items, [{label: '阅读 A', value: '20260918130000-clipaaa', secondary: '/剪藏/阅读 A · 2026-09-18 12:30', rank: 1}]);
    assert.deepEqual(snapshot.stat, {value: '1/3', label: '待读'});
    assert.equal(model.normalizeClippedUnreadConfig({tag: '', limit: 99}).limit, 12);
});

test('on-this-day projection excludes current and out-of-range years with stable sort', () => {
    const rows = [
        {id: '20260918130100-memoryaa', content: '2025-09-18 · 去年', hpath: '/日记/2025'},
        {id: '20260918130101-memorybb', content: '2020-09-18 · 旧记录', hpath: '/日记/2020'},
        {id: '20260918130102-memorycc', content: '2026-09-18 · 今天'},
        {id: '20260918130103-memorydd', content: '2010-09-18 · 太旧'},
    ];
    const snapshot = model.buildOnThisDaySnapshot(rows, {yearRange: 5, showPath: '否', showRank: '是'}, {stat: '记录'}, Date.UTC(2026, 8, 18));
    assert.deepEqual(snapshot.items, [{label: '2025-09-18 · 去年', value: '20260918130100-memoryaa', secondary: '2025', rank: 1}]);
    assert.equal(snapshot.stat.value, '1');
    assert.equal(model.normalizeOnThisDayConfig({yearRange: 0}).yearRange, 1);
});

test('recent daily notes projection excludes future dates and reports filtered totals', () => {
    const rows = [
        {id: '20260918130200-dailyaaa', root_id: '20260918130200-dailyaaa', content: '2026-09-18', hpath: '/日记/2026-09-18', updated: '20260918100000', total_count: 2},
        {id: '20260918130201-dailybbb', root_id: '20260918130201-dailybbb', content: '2026-09-17', hpath: '/日记/2026-09-17', updated: '20260917100000', total_count: 2},
        {id: '20260918130202-dailyccc', root_id: '20260918130202-dailyccc', content: '2026-09-19', updated: '20260919100000', total_count: 3},
    ];
    const snapshot = model.buildRecentDailyNotesSnapshot(rows, {days: 7, limit: 1, showUpdated: '是'}, {stat: '日记'}, Date.UTC(2026, 8, 18));
    assert.deepEqual(snapshot.items.map((item) => item.label), ['2026-09-18']);
    assert.equal(snapshot.items[0].secondary, '/日记/2026-09-18 · 2026-09-18 10:00');
    assert.deepEqual(snapshot.stat, {value: '1/2', label: '日记'});
});

// ---------- T-6409~T-6416 月度日记、今日待办、闪卡与日历配置 ----------
test('monthly journal projection accepts official attributes, browses months, and keeps document totals', () => {
    const now = new Date(2026, 8, 18, 12).getTime();
    const rows = [
        {id: '20260918140000-monthaaa', root_id: '20260918140000-monthaaa', content: '2026-08-21 周记', hpath: '/日记/八月', updated: '20260821130000', total_count: 2},
        {id: '20260918140001-monthbbb', root_id: '20260918140001-monthbbb', content: '非日期标题', daily_attr: 'custom-dailynote-20260803', hpath: '/日记/八月', updated: '20260803100000', total_count: 2},
        {id: '20260918140002-monthccc', content: '2026-09-01'},
    ];
    const snapshot = model.buildJournalMonthlySnapshot(rows, {monthOffset: -1, limit: 1, showRank: '是'}, {monthTitle: '{year}年{month}月', stat: '篇日记'}, now);
    assert.equal(snapshot.title, '2026年8月');
    assert.deepEqual(snapshot.items, [{label: '2026-08-21 周记', value: '20260918140000-monthaaa', secondary: '/日记/八月', rank: 1}]);
    assert.deepEqual(snapshot.stat, {value: '1/2', label: '篇日记'});
    assert.equal(model.normalizeJournalMonthlyConfig({monthOffset: 99, limit: 99}).monthOffset, 24);
});

test('today tasks projection filters content and source, formats metadata, and preserves checkbox state', () => {
    const rows = [
        {id: '20260918140100-taskaaaa', content: '提交发布稿', markdown: '* [ ] 提交发布稿', document_title: '发布计划', hpath: '/项目/发布计划', updated: '20260918120000'},
        {id: '20260918140101-taskbbbb', content: '完成旧任务', markdown: '* [x] 完成旧任务', document_title: '归档', updated: '20260917120000'},
        {id: 'bad', content: '坏数据', markdown: '* [ ] 坏数据'},
    ];
    const snapshot = model.buildTodayTasksSnapshot({data: rows, total: 1}, {query: '发布', showRank: '是', showPath: '是'}, {stat: '条待办'}, NOW);
    assert.deepEqual(snapshot.items, [{label: '提交发布稿', value: '20260918140100-taskaaaa', done: false, secondary: '发布计划 · /项目/发布计划', rank: 1}]);
    assert.deepEqual(snapshot.stat, {value: '1', label: '条待办'});
    assert.equal(model.normalizeTodayTasksConfig({days: 1, limit: 99}).days, 7);
});

test('flashcard projection preserves due order for cards and sorts notebook summaries by count', () => {
    const cards = model.buildFlashcardDueSnapshot({mode: 'cards', total: 3, notebookName: '知识库', data: [
        {id: '20260918140200-cardaaaa', root_id: '20260918140210-docaaaaa', content: '什么是 ADR？', hpath: '/工程/ADR'},
    ]}, {showPath: '是', showRank: '是'}, {stat: '张待复习'}, NOW);
    assert.deepEqual(cards.items, [{label: '什么是 ADR？', value: '20260918140210-docaaaaa', secondary: '知识库 · /工程/ADR', rank: 1}]);
    assert.equal(cards.stat.value, '3');
    const notebooks = model.buildFlashcardDueSnapshot({mode: 'notebooks', data: [
        {id: 'a', label: 'A', count: 2}, {id: 'b', label: 'B', count: 5},
    ], total: 7}, {limit: 1}, {stat: '张待复习'}, NOW);
    assert.deepEqual(notebooks.items, [{label: 'B', value: '', count: 5}]);
    assert.equal(model.normalizeFlashcardDueConfig({limit: 0}).limit, 1);
});

test('journal calendar config bounds navigation and display controls', () => {
    assert.deepEqual(model.normalizeJournalCalendarConfig({monthOffset: -99, weekStart: '周日', showAdjacent: '否', showLunar: '是'}), {
        monthOffset: -24, weekStart: '周日', showAdjacent: false, showLunar: true, showHolidays: false, notebook: '',
    });
});

// ---------- T-6425~T-6432 写作统计与目标 ----------
test('note stats projects a selectable primary metric and adjacent-window trend', () => {
    const snapshot = model.buildNoteStatsSnapshot({
        docs: 120, chars: 34567, created: 4, updated: 6, previousCreated: 2, previousUpdated: 3,
    }, {days: 14, primaryMetric: '估算字数'}, {
        documents: '文档数', characters: '估算字数', created: '新建', updated: '修订', trendUp: '环比 +{value}%',
    }, NOW);
    assert.equal(snapshot.stat.value.replace(/\D/g, ''), '34567');
    assert.equal(snapshot.stat.label, '估算字数');
    assert.deepEqual(snapshot.items.slice(0, 3).map((item) => item.label), ['文档数 · 120', '新建 · 4', '修订 · 6']);
    assert.equal(snapshot.items[3].label, '环比 +100%');
    assert.equal(model.normalizeNoteStatsConfig({days: 999}).days, 90);
});

test('note stats strength metric is opt-in, bounded, and smoothing-stable (T-6682)', () => {
    const payload = {
        docs: 120, chars: 34567, created: 4, updated: 6, previousCreated: 2, previousUpdated: 3,
        daily: [
            {day: '20260912', created: 1, updated: 2},
            {day: '20260910', created: 0, updated: 0},
            {day: '20260914', created: 2, updated: 1},
        ],
    };
    // 关闭（默认）：零强度条目，payload.daily 被忽略
    const off = model.buildNoteStatsSnapshot(payload, {days: 14, primaryMetric: '估算字数'}, {}, NOW);
    assert.equal(off.items.some((item) => item.label === '写作强度'), false);
    // 开启：乱序 daily 行按日期升序平滑，输出百分数与半衰期说明
    const on = model.buildNoteStatsSnapshot(payload, {days: 14, primaryMetric: '估算字数', showStrength: '是'}, {
        strength: '写作强度', strengthHalfLife: '半衰期',
    }, NOW);
    const strengthItem = on.items.find((item) => item.label === '写作强度');
    assert.ok(strengthItem, 'strength item is appended when opted in');
    assert.match(strengthItem.value, /^[0-9]+%$/);
    assert.match(strengthItem.secondary, /14/);
    // 乱序与升序必须同结果（模型内部排序，不信任上游顺序）
    const reordered = model.buildNoteStatsSnapshot({...payload, daily: [...payload.daily].reverse()}, {days: 14, primaryMetric: '估算字数', showStrength: '是'}, {strength: '写作强度'}, NOW);
    assert.equal(reordered.items.find((item) => item.label === '写作强度').value, strengthItem.value);
    // 全空活动 → 强度 0%
    const zero = model.buildNoteStatsSnapshot({...payload, daily: [{day: '20260910', created: 0, updated: 0}]}, {days: 14, primaryMetric: '估算字数', showStrength: true}, {strength: '写作强度'}, NOW);
    assert.equal(zero.items.find((item) => item.label === '写作强度').value, '0%');
    assert.equal(model.normalizeNoteStatsConfig({showStrength: true}).showStrength, true);
    assert.equal(model.normalizeNoteStatsConfig({}).showStrength, false);
});

test('today writing exposes zero-safe details and clamps goal progress', () => {
    const snapshot = model.buildTodayWritingSnapshot({chars: 1500, blocks: 12, createdDocs: 2, updatedDocs: 3}, {goal: 1000}, {
        characters: '新增字符', blocks: '新增内容块', createdDocs: '新建文档', updatedDocs: '修订文档',
    }, NOW);
    assert.equal(snapshot.stat.value.replace(/\D/g, ''), '1500');
    assert.equal(snapshot.stat.progress, 100);
    assert.deepEqual(snapshot.stat.arc, {value: 1000, max: 1000});
    assert.equal(snapshot.items.length, 3);
    assert.equal(model.normalizeTodayWritingConfig({goal: -1}).goal, 0);
});

test('recent writing activity fills zero days and compacts long windows into bounded buckets', () => {
    const now = new Date(2026, 8, 18, 12).getTime();
    const daily = model.buildRecentWritingActivitySnapshot([
        {day: '20260918', blocks: 3, chars: 120},
        {day: '20260916', blocks: 2, chars: 80},
        {day: '20990101', blocks: 99, chars: 99},
    ], {days: 7, metric: '内容块', showZero: '是'}, {blocks: '块', average: '日均 {value}'}, now);
    assert.equal(daily.items.length, 7);
    assert.equal(daily.stat.value, '5');
    assert.match(daily.stat.label, /日均 1/);
    const compact = model.buildRecentWritingActivitySnapshot([], {days: 90, density: '紧凑', showZero: '是'}, {}, now);
    assert.ok(compact.items.length <= 14);
    assert.equal(model.normalizeRecentWritingActivityConfig({days: 2}).days, 7);
});

test('writing streak applies daily goals, grace today, gap state, and week start', () => {
    const now = new Date(2026, 8, 18, 12).getTime();
    const snapshot = model.buildWritingStreakSnapshot([
        {day: '20260918', chars: 50, blocks: 1},
        {day: '20260917', chars: 120, blocks: 2},
        {day: '20260916', chars: 140, blocks: 2},
    ], {metric: '新增字符', dailyGoal: 100, todayGrace: '是', weekStart: '周日'}, {
        weekdays: '一二三四五六日', streak: '天连续', pending: '天连续 · 今日待完成', gap: '已中断 {value} 天',
    }, now);
    assert.equal(snapshot.stat.value, '2');
    assert.equal(snapshot.stat.label, '天连续 · 今日待完成');
    assert.equal(snapshot.items[0].label, '日');
    assert.equal(snapshot.items.filter((item) => item.done).length, 2);
    const broken = model.buildWritingStreakSnapshot([], {todayGrace: '否'}, {gap: '已中断 {value} 天'}, now);
    assert.match(broken.stat.label, /已中断/);
    assert.equal(model.normalizeWritingStreakConfig({windowDays: 9999}).windowDays, 365);
});

test('writing streak weekly n/m quota, rest-day exemption, and legacy parity (T-6681)', () => {
    // 2026-09-18 是周五。窗口内：周三/周四达标，周五（今天）未达标；
    // 上一周（9/7~9/13，周一起始）有 3 天达标 → 周口径连击 = 1
    const now = new Date(2026, 8, 18, 12).getTime();
    const rows = [
        {day: '20260918', chars: 10},            // 周五（今天）未达标
        {day: '20260917', chars: 200},           // 周四达标
        {day: '20260916', chars: 200},           // 周三达标
        {day: '20260916', chars: 1},             // 同日合并
        {day: '20260910', chars: 200},           // 上周四达标
        {day: '20260909', chars: 200},           // 上周三达标
        {day: '20260908', chars: 200},           // 上周二达标
    ];
    const labels = {weekdays: '一二三四五六日', streak: '天连续', pending: '天连续 · 今日待完成', gap: '已中断 {value} 天', weeklyStreak: '周连续', weeklyPending: '周连续 · 本周待完成'};
    // 每周至少 2 天：本周三四已达标（2/2 满足）+ 上周 3 天达标 → 连击 = 2；arc 显示 2/2
    const weekly = model.buildWritingStreakSnapshot(rows, {metric: '新增字符', dailyGoal: 100, weeklyGoal: 2, weekStart: '周一'}, labels, now);
    assert.equal(weekly.stat.value, '2');
    assert.equal(weekly.stat.label, '周连续');
    assert.deepEqual(weekly.stat.arc, {value: 2, max: 2});
    // 豁免日：周六休息时，周六未达标不断签——今天(周五)未达标 + 今日宽限关闭，
    // 休息日中性跳过后仍延续到周四的达标
    const exempt = model.buildWritingStreakSnapshot([
        {day: '20260919', chars: 0},             // 周六（未来，应被窗口截掉）
    ], {metric: '新增字符', dailyGoal: 100, todayGrace: '否', restDays: '周末'}, labels, now);
    const legacy = model.buildWritingStreakSnapshot(rows, {metric: '新增字符', dailyGoal: 100, todayGrace: '否', weekStart: '周一'}, labels, now);
    assert.equal(legacy.stat.value, '0', 'no weeklyGoal: unmet today breaks the daily streak');
    // 休息日中性：达标日之间夹一个休息日（未达标）不打断连击
    const bridged = model.buildWritingStreakSnapshot([
        {day: '20260917', chars: 200},           // 周四达标（今天）
        {day: '20260916', chars: 5},             // 周三未达标但被豁免（配置单日 周三）
        {day: '20260915', chars: 200},           // 周二达标 → 豁免日桥接后连击 = 2
    ], {metric: '新增字符', dailyGoal: 100, todayGrace: '是', restDays: '周三'}, labels, new Date(2026, 8, 17, 12).getTime());
    assert.equal(bridged.stat.value, '2', 'a rest day between completed days must not break the streak');
    assert.equal(bridged.items[2].done, false, 'rest day itself still shows as not-done in the weekday row');
    // 归一化钳制与缺省
    assert.equal(model.normalizeWritingStreakConfig({weeklyGoal: 12}).weeklyGoal, 7);
    assert.equal(model.normalizeWritingStreakConfig({}).weeklyGoal, 0);
    assert.equal(model.normalizeWritingStreakConfig({restDays: '每天'}).restDays, '无');
});

// ---------- 通用边界 ----------
test('every builder clamps limits into 1..12 and tolerates non-object configs', () => {
    assert.equal(model.normalizePinnedDocsConfig({limit: 99}).limit, 12);
    assert.equal(model.normalizePinnedDocsConfig(null).limit, 8);
    assert.equal(model.normalizeInboxConfig({page: -2}).page, 1);
    assert.equal(model.normalizeRecentUpdatesConfig({limit: 0}).limit, 1);
    assert.equal(model.normalizeDataHealthConfig({}).limit, 8);
    assert.equal(model.normalizeHostRecentDocsConfig({limit: "x"}).limit, 8);
    assert.deepEqual(model.normalizeHostRecentDocsConfig({showPath: "否", showRank: "是"}), {limit: 8, showPath: false, showRank: true});
    assert.equal(model.normalizeDatabaseListConfig({}).limit, 8);
    assert.equal(model.normalizeOutlineWidgetConfig({maxDepth: 99}).maxDepth, 8);
    assert.equal(model.normalizeDocumentRelationsConfig({relation: '坏值'}).relation, '全部');
    assert.equal(model.normalizeTagListConfig({limit: 99}).limit, 12);
    assert.equal(model.normalizeBookmarkListConfig({limit: 0}).limit, 1);
    assert.equal(model.normalizeClippedUnreadConfig({limit: 0}).limit, 1);
    assert.equal(model.normalizeOnThisDayConfig({limit: 99}).limit, 20);
    assert.equal(model.normalizeRecentDailyNotesConfig({days: 99}).days, 60);
    assert.equal(model.normalizeJournalMonthlyConfig({limit: 99}).limit, 20);
    assert.equal(model.normalizeTodayTasksConfig({limit: 99}).limit, 12);
    assert.equal(model.normalizeFlashcardDueConfig({limit: 99}).limit, 12);
    assert.equal(model.normalizeNoteStatsConfig({days: 0}).days, 7);
    assert.equal(model.normalizeRecentWritingActivityConfig({days: 999}).days, 366);
    assert.equal(model.normalizeWritingStreakConfig({dailyGoal: 0}).dailyGoal, 1);
});

test('health status passthrough only accepts the known trio', () => {
    const payload = okResponse([]);
    assert.equal(model.buildPinnedDocsSnapshot(payload, {}, OK, NOW, "stale").sourceHealth, "stale");
    assert.equal(model.buildPinnedDocsSnapshot(payload, {}, OK, NOW, "bogus").sourceHealth, "fresh");
    assert.equal(model.buildInboxSnapshot(inboxPage([]), {}, OK, NOW, "cached").sourceHealth, "cached");
});

test('recent writing activity year-grid view projects 53-week heatmap cells (T-6684)', () => {
    const now = new Date(2026, 8, 18, 12).getTime(); // 2026-09-18
    const rows = [
        {day: '20260918', blocks: 12, chars: 400},
        {day: '20260917', blocks: 3, chars: 90},
        {day: '20260105', blocks: 6, chars: 150},
    ];
    const grid = model.buildRecentWritingActivitySnapshot(rows, {view: '年历', metric: '内容块'}, {title: '近期写作活跃度'}, now);
    // 快照携带 viewType=heatmap（视图组装层白名单校验后切换渲染面）
    assert.equal(grid.viewType, 'heatmap');
    assert.equal(grid.items.length, 371, 'the grid is 53 weeks x 7 days');
    // 2026-01-01 是周四：网格从 2025-12-28（周日）起，首 4 格与尾 5 格在年外
    assert.equal(grid.items[0].outside, true);
    assert.equal(grid.items[4].outside, undefined, '2026-01-01 itself is inside the year');
    assert.equal(grid.items[370].outside, true, 'trailing days of the 371st cell belong to next year');
    // 色阶：当年命中格点 level 在 1..4、零值格 level 0
    const inside = grid.items.filter((cell) => !cell.outside);
    const hit = inside.find((cell) => cell.count === 12);
    assert.equal(hit.level, 4, 'the max-count day quantizes to the top level');
    const zeroCell = inside.find((cell) => cell.count === 0);
    assert.equal(zeroCell.level, 0);
    // 统计：全年合计与活跃天
    assert.equal(grid.stat.value, '21');
    assert.match(grid.stat.label, /3 天/);
    // 年份偏移：-1 → 2025 网格，且跨年行归属正确
    const lastYear = model.buildRecentWritingActivitySnapshot([], {view: '年历', yearOffset: -1}, {}, now);
    assert.equal(lastYear.title.includes('2025'), true);
    assert.equal(lastYear.items.length, 371);
    // 归一化钳制
    assert.equal(model.normalizeRecentWritingActivityConfig({view: '年历'}).view, '年历');
    assert.equal(model.normalizeRecentWritingActivityConfig({yearOffset: 2}).yearOffset, 0);
    assert.equal(model.normalizeRecentWritingActivityConfig({}).view, '列表');
});

test('activitywatch bucket selection drives query, cache key, and buckets projection (T-6689)', () => {
    const life = require('../src/life-widget-model.js');
    // 显式桶 ID：query_bucket 直连该桶，缓存键随桶变化
    const explicit = life.buildActivityWatchRequest({endpoint: 'http://127.0.0.1:5600', bucketId: 'aw-watcher-window_pc'}, Date.now());
    assert.ok(explicit.body.query[0].includes('query_bucket("aw-watcher-window_pc")'), 'explicit bucket query line: ' + JSON.stringify(explicit.body.query[0]));
    assert.equal(explicit.cacheKey.endsWith('aw-watcher-window_pc'), true);
    // 留空：保持 find_bucket 旧行为，缓存键不含桶段
    const legacy = life.buildActivityWatchRequest({endpoint: 'http://127.0.0.1:5600'}, Date.now());
    assert.ok(legacy.body.query[0].includes('find_bucket("aw-watcher-window_")'), 'legacy query line: ' + JSON.stringify(legacy.body.query[0]));
    assert.equal(legacy.cacheKey.includes('::'), false);
    // 注入安全：含引号/分号的桶 ID 被丢弃并回退自动选择
    const injection = life.buildActivityWatchRequest({endpoint: 'http://127.0.0.1:5600', bucketId: 'bad"; query_bucket("evil")'}, Date.now());
    assert.doesNotMatch(injection.body.query[0], /evil/);
    // 列桶清单：仅保留 watcher 类型、按 id 排序、超界截断
    const buckets = life.normalizeActivityWatchBuckets({
        'aw-watcher-window_b': {type: 'aw-watcher-window', hostname: 'pc-b'},
        'aw-watcher-window_a': {type: 'aw-watcher-window', hostname: 'pc-a'},
        'aw-accel': {type: 'other'},
    });
    assert.deepEqual(buckets.map((bucket) => bucket.id), ['aw-watcher-window_a', 'aw-watcher-window_b']);
    assert.deepEqual(life.normalizeActivityWatchBuckets(null), []);
    assert.equal(life.normalizeActivityWatchConfig({bucketId: 'x"y'}).bucketId, '', 'bucket ids with quotes are rejected');
    assert.match(life.buildActivityWatchBucketsUrl({endpoint: 'http://127.0.0.1:5600'}), /\/api\/0\/buckets$/);
});

test("database list config: bound blockId passes ID validation for table projection (T-6850)", () => {
    const model = require("../src/kernel-widget-model.js");
    assert.equal(model.normalizeDatabaseListConfig({blockId: "20260925090000-abcdef"}).blockId, "20260925090000-abcdef");
    assert.equal(model.normalizeDatabaseListConfig({blockId: "not-an-id"}).blockId, "");
    assert.equal(model.normalizeDatabaseListConfig({}).blockId, "");
});

test("home store state: bounded normalization for cross-session view memory (T-6851)", () => {
    const settings = require("../src/settings-model.js");
    const normalized = settings.normalizeSettings({homeStore: {
        density: "compact",
        viewMode: "list",
        sort: "title",
        collapsedGroups: ["生活  ", "生活", "写作", 42, null, "  "],
    }}, {defaults: {}}).homeStore;
    assert.deepEqual(normalized, {
        density: "compact",
        viewMode: "list",
        sort: "title",
        collapsedGroups: ["生活", "写作"],
    });
    // 白名单外值剔除、无值字段缺省
    const strict = settings.normalizeSettings({homeStore: {density: "huge", viewMode: "x", sort: "nope"}}, {defaults: {}}).homeStore;
    assert.deepEqual(strict, {});
    // 非对象输入 → 空状态
    assert.deepEqual(settings.normalizeSettings({homeStore: "bad"}, {defaults: {}}).homeStore, {});
    assert.deepEqual(settings.normalizeSettings({}, {defaults: {}}).homeStore, {});
});
