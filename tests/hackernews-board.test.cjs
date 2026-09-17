// T-6307 Hacker News 榜单族契约：四条字面量端点、按榜隔离的缓存、
// 中文标签归一与回退、快照标题标注、目录 schema 与适配器接线。
const test = require('node:test');
const assert = require('node:assert/strict');
const network = require('../src/life-widget-network.js');
const model = require('../src/life-widget-model.js');
const home = require('../src/home-model.js');
const {readSourceText} = require('./source-scan.cjs');
const path = require('path');

const {HACKER_NEWS_BOARDS, HACKER_NEWS_FRONT_PAGE_URL, allowedLifeWidgetUrl, loadHackerNewsBoard, loadHackerNewsFrontPage, HACKER_NEWS_TTL_MS} = network;
const {normalizeHackerNewsConfig, buildHackerNewsSnapshot, HACKER_NEWS_BOARD_TOKENS, HACKER_NEWS_BOARD_LABELS} = model;

const envelopeOf = (board) => ({
    payload: {hits: [{objectID: `id-${board}-1`, title: `${board} 条目`, points: 10, num_comments: 2, created_at_i: 1725696000}]},
    status: "fresh",
    fetchedAt: 1725696000000,
});

// ---------- 端点白名单 ----------
test('four board literals form the fixed endpoint family', () => {
    assert.deepEqual(Object.keys(HACKER_NEWS_BOARDS), ["front_page", "best", "ask_hn", "show_hn"]);
    for (const url of Object.values(HACKER_NEWS_BOARDS)) {
        assert.equal(allowedLifeWidgetUrl(url), true, `${url} 必须在白名单内`);
    }
    assert.equal(HACKER_NEWS_FRONT_PAGE_URL, HACKER_NEWS_BOARDS.front_page, "旧常量保持指向首页");
});

test('any deviation from the literal endpoints is rejected', () => {
    assert.equal(allowedLifeWidgetUrl("https://hn.algolia.com/api/v1/search?tags=best&hitsPerPage=24"), false, "改条数必须拒绝");
    assert.equal(allowedLifeWidgetUrl("https://hn.algolia.com/api/v1/search?tags=best"), false, "缺条数必须拒绝");
    assert.equal(allowedLifeWidgetUrl("https://hn.algolia.com/api/v1/search?tags=front_page%20,best&hitsPerPage=12"), false, "拼标签必须拒绝");
    assert.equal(allowedLifeWidgetUrl("http://hn.algolia.com/api/v1/search?tags=best&hitsPerPage=12"), false, "降级 http 必须拒绝");
});

// ---------- 加载器：榜单隔离 + 健康语义 ----------
test('loader validates the board before building a request', async () => {
    network.clearLifeWidgetCaches();
    await assert.rejects(loadHackerNewsBoard("topstories", {}), /blocked_endpoint/);
    await assert.rejects(loadHackerNewsBoard("", {}), /blocked_endpoint/);
    await assert.rejects(loadHackerNewsBoard(null, {}), /blocked_endpoint/);
});

test('per-board cache keys keep boards isolated', async () => {
    network.clearLifeWidgetCaches();
    const calls = [];
    const fetchImpl = (url) => {
        calls.push(url);
        return Promise.resolve({ok: true, headers: {get: () => null}, text: () => Promise.resolve(JSON.stringify({hits: [{objectID: "x", title: "t", url: "https://a/1"}]}))});
    };
    const best = await loadHackerNewsBoard("best", {fetchImpl, now: 1000});
    const bestAgain = await loadHackerNewsBoard("best", {fetchImpl, now: 1000 + HACKER_NEWS_TTL_MS - 1});
    const ask = await loadHackerNewsBoard("ask_hn", {fetchImpl, now: 1000 + HACKER_NEWS_TTL_MS - 1});
    assert.equal(best.status, "fresh");
    assert.equal(bestAgain.status, "cached");
    assert.equal(ask.status, "fresh", "不同榜单不得命中同一缓存键");
    assert.equal(calls.length, 2);
    network.clearLifeWidgetCaches();
});

test('front page loader delegates to the front_page board', async () => {
    network.clearLifeWidgetCaches();
    const seen = [];
    const fetchImpl = (url) => {
        seen.push(url);
        return Promise.resolve({ok: true, headers: {get: () => null}, text: () => Promise.resolve(JSON.stringify({hits: []}))});
    };
    const result = await loadHackerNewsFrontPage({fetchImpl, now: 5000});
    assert.equal(result.status, "fresh");
    assert.equal(seen[0], HACKER_NEWS_FRONT_PAGE_URL);
    network.clearLifeWidgetCaches();
});

// ---------- 配置归一 ----------
test('board config accepts Chinese labels and known tokens, defaulting to front page', () => {
    assert.deepEqual(Object.keys(HACKER_NEWS_BOARD_LABELS), ["首页", "最佳", "问答", "展示"]);
    assert.equal(normalizeHackerNewsConfig({}).board, "front_page", "缺省 = 既有实例行为不变");
    assert.equal(normalizeHackerNewsConfig({board: "最佳"}).board, "best");
    assert.equal(normalizeHackerNewsConfig({board: " 问答 "}).board, "ask_hn");
    assert.equal(normalizeHackerNewsConfig({board: "best"}).board, "best", "token 直填同样接受");
    assert.equal(normalizeHackerNewsConfig({board: "hot"}).board, "front_page", "未知值回退首页");
    assert.equal(normalizeHackerNewsConfig({board: 42}).board, "front_page");
    assert.deepEqual(Array.from(HACKER_NEWS_BOARD_TOKENS), ["front_page", "best", "ask_hn", "show_hn"]);
});

// ---------- 快照标注 ----------
test('non-default boards annotate the snapshot title', () => {
    const labels = {title: "Hacker News"};
    assert.equal(buildHackerNewsSnapshot(envelopeOf("front_page"), {board: "front_page"}, labels).title, "Hacker News");
    assert.equal(buildHackerNewsSnapshot(envelopeOf("best"), {board: "best"}, labels).title, "Hacker News · best");
    assert.equal(buildHackerNewsSnapshot(envelopeOf("ask_hn"), {board: "ask_hn"}, labels).title, "Hacker News · ask_hn");
    assert.equal(buildHackerNewsSnapshot(envelopeOf("show_hn"), {board: "show_hn"}, labels).title, "Hacker News · show_hn");
});

// ---------- 目录与接线 ----------
test('catalog exposes the board select with the four Chinese labels', () => {
    const def = home.registerModules([]).find((item) => item.moduleId === "external-news-hackernews");
    assert.ok(def, "hackernews 目录条目存在");
    const board = def.configSchema.find((field) => field.key === "board");
    assert.ok(board, "board 配置字段存在");
    assert.equal(board.type, "select");
    assert.deepEqual(board.options, ["首页", "最佳", "问答", "展示"]);
    assert.equal(board.defaults, "首页");
});

test('adapter reads the board from the normalized config', () => {
    const source = readSourceText(path.join(__dirname, '..', 'src', 'home-external-adapters.ts'));
    assert.match(source, /loadHackerNewsBoard\(normalized\.board/);
    assert.doesNotMatch(source, /loadHackerNewsFrontPage\(\{/, "适配器不得再绕过榜单归一直连首页加载器");
});
