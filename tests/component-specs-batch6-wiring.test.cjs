// T-6971 批次⑥：列表流家族契约——RSS 订阅 / Miniflux 未读 / 热搜事件 / 实时资讯 /
// Hacker News 五组件共享行规范：M/W/L 档位、plain 材质、档位行数硬上界、
// 同标题跨源去重、评论数不上屏、来源 ≤20 字、失败保留旧值、行解剖样式。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile, readStyleSource} = require('./source-scan.cjs');

const adapters = readSourceFile('src/home-external-adapters.ts');
const lifeModel = readSourceFile('src/life-widget-model.js');
const network = readSourceFile('src/life-widget-network.js');
const panel = readSourceFile('src/second-panel-ui.ts');
const homeScss = readStyleSource('src/styles/_05-settings-widgets.scss');
const homeModel = require('../src/home-model.js');
const model = require('../src/life-widget-model.js');

const LISTFLOW_IDS = ["external-rss-subscription", "external-rss-miniflux", "external-hot-news-dailyhot", "external-news-newsnow", "external-news-hackernews"];

test('declaration: row-stream family declares exactly M/W/L — no hero tier', () => {
    const modules = homeModel.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    for (const id of LISTFLOW_IDS) {
        assert.deepEqual(byId.get(id).sizes, ["medium", "wide", "large"], `${id} 声明档位必须恰为 M/W/L（full 是英雄位，行流不声明）`);
    }
});

test('declaration: family material stays plain and default tier is wide', () => {
    for (const id of LISTFLOW_IDS) {
        assert.equal(homeModel.resolveHomeTileMaterial(id), 'plain', `${id} 行流不做 accent/dark/vibrant`);
        assert.equal(homeModel.resolveHomeTileDefaultSize(id, ["medium", "wide", "large"], 'medium'), 'wide', `${id} 商店默认档 wide`);
    }
    // 回归钉：默认档键必须等于真实 moduleId（此前误写 external-news-dailyhot 致默认档回退失效）
    assert.equal(homeModel.HOME_TILE_DEFAULT_SIZES['external-hot-news-dailyhot'], 'wide');
    assert.equal(homeModel.HOME_TILE_DEFAULT_SIZES['external-news-dailyhot'], undefined);
});

test('tier cap: first screen ≤5 entries, large ≤8, source row always preserved', () => {
    const rows = Array.from({length: 12}, (_, index) => ({label: `t${index}`, value: ""}));
    const sourceRow = {label: "数据来源：X", value: ""};
    const wide = model.capListflowRows([...rows, sourceRow], "wide");
    assert.equal(wide.length, 6, 'M/W 档 5 条 + 来源行');
    assert.equal(wide[5].label, sourceRow.label, '来源行恒保留且居末');
    const large = model.capListflowRows([...rows, sourceRow], "large");
    assert.equal(large.length, 9, 'L 档 8 条 + 来源行');
    assert.equal(model.LISTFLOW_DEFAULT_ITEM_CAP, 5);
    assert.deepEqual(model.LISTFLOW_TIER_ITEM_CAPS, {large: 8});
});

test('dedup: same title across sources collapses to one row (newsnow cross-source)', () => {
    const payload = {items: [
        {title: "同一事件", url: "https://a.example/1"},
        {title: "同一事件", url: "https://b.example/2"},
        {title: "另一事件", url: "https://a.example/3"},
    ]};
    const result = model.normalizeExternalFeedPayload(payload, "newsnow", 8);
    assert.equal(result.items.length, 2, '同标题跨源只保留首条');
    assert.deepEqual(result.items.map((item) => item.rank), [1, 2], '排名过滤后连续不跳号');
});

test('hacker news: comment count never reaches the row meta', () => {
    const envelope = {status: "fresh", payload: {hits: [
        {objectID: "1", title: "Story", url: "https://a.example/1", points: 120, num_comments: 45, created_at_i: 0},
    ]}};
    const snapshot = model.buildHackerNewsSnapshot(envelope, {}, {points: "分", comments: "评"});
    assert.match(snapshot.items[0].secondary, /分 120/, '得分 meta 上屏');
    assert.doesNotMatch(snapshot.items[0].secondary, /评 45/, '评论数不上屏（保持行轻）');
});

test('source names truncate to 20 chars in row meta (miniflux + rss)', () => {
    assert.match(lifeModel, /feed: boundedText\(raw\.feed\?\.title, 20\)/, 'Miniflux 来源名 ≤20 字');
    assert.match(lifeModel, /boundedText\(parsed\.feedTitle, 20\)/, 'RSS 来源名 ≤20 字');
});

test('wiring: every row-stream adapter applies the tier cap from the size-aware channel', () => {
    assert.match(adapters, /capListflowRows[^}]*\} from "\.\/life-widget-model"/, '裁剪函数必须真实导入');
    const callSites = adapters.match(/capListflowRows\(snapshot\.items, context\?\.size\)/g) || [];
    assert.ok(callSites.length >= 4, `五个行流组件都必须裁剪（registerExternalFeed 一处覆盖 dailyhot+newsnow；当前 ${callSites.length} 处）`);
});

test('wiring: RSS row marks read state in meta and exposes the unread chip', () => {
    const feedText = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"><channel>',
        '<title>示例订阅</title>',
        '<link>https://example.com/</link>',
        '<item><title>A</title><link>https://a.example/1</link></item>',
        '<item><title>B</title><link>https://a.example/2</link></item>',
        '</channel></rss>',
    ].join("\n");
    const seen = {["a.example/1"]: 1};
    const snapshot = model.buildRssSnapshot(feedText, {url: "https://a.example/feed"}, {source: "来源", read: "已读", unread: "未读"}, 0, "fresh", {
        seenLookup: (key) => key.includes("a.example/1"),
    });
    assert.equal(snapshot.stat.value, "1", "未读计数 chip = 窗口内未标记已读条目数");
    assert.match(snapshot.items[0].secondary, /已读/, "已读条目在行 meta 标注");
    assert.doesNotMatch(snapshot.items[1].secondary, /已读/, "未读条目无已读标注");
    assert.match(adapters, /read: this\.i18n\.homeRssRead/, "已读标注走 i18n");
    assert.match(adapters, /unread: this\.i18n\.homeRssUnread/, "未读 chip 文案走 i18n");
});

test('wiring: RSS subscription joins the 15-minute heartbeat family', () => {
    // T-6967 S2：心跳族成员唯一登记处落 home-model（此前漏登记教训固化为共享清单），
    // RSS 订阅必须在共享清单内；放 home-model 避免拉入 46 KB 目录模块（包体自律）。
    const homeModel = readSourceFile('src/home-model.js');
    assert.match(homeModel, /"external-rss-miniflux",\s*\n\s*"external-rss-subscription",\s*\n\]\)/,
        'RSS 订阅必须登记进共享心跳族清单（此前漏登记）');
    const panel = readSourceFile('src/second-panel-ui.ts');
    assert.match(panel, /const lifeModuleIds = new Set\(LIFE_HEARTBEAT_MODULE_IDS\)/,
        '工作台心跳必须消费共享清单');
});

test('state: loaders keep stale values on failure — list is never cleared by a failed refresh', () => {
    const stale = /if \(cached\) return \{payload: cached\.value, status: "stale", fetchedAt: cached\.at\};/g;
    const hits = network.match(stale) || [];
    assert.ok(hits.length >= 2, `feed 与 HN 加载器都必须失败回退陈旧缓存（当前 ${hits.length} 处）`);
});

test('styles: family row anatomy — hairline separators and right-aligned 11px meta (scale token)', () => {
    assert.match(homeScss, /\.sw-home__cell:is\(\[data-module-id="external-rss-subscription"[^\)]*external-news-hackernews"\]\)/,
        '行解剖必须作用域到五个行流组件，不波及其它模块');
    assert.match(homeScss, /\.sw__home-module-item \+ \.sw__home-module-item \{\s*\n\s*border-top: 1px solid color-mix\(in srgb, var\(--b3-theme-on-surface-light\) 18%, transparent\);/,
        '行 hairline 分隔');
    assert.match(homeScss, /\.sw__home-module-item-secondary \{[^}]*?flex: 0 0 auto;[^}]*?margin-left: auto;[^}]*?font-size: var\(--sw-font-xs, 11px\);/s,
        '来源·时间 meta 右侧 11px muted（T-7206 刻度 token）');
    assert.match(homeScss, /\.sw__home-module-item-label \{[^}]*?flex: 1 1 auto;[^}]*?text-overflow: ellipsis;/s,
        '标题单行省略');
});
