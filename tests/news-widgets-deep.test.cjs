const {readSourceText} = require("./source-scan.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const home = require("../src/home-model.js");
const store = require("../src/home-store-model.js");
const model = require("../src/life-widget-model.js");
const rss = require("../src/rss-model.js");

const datedDailyHotPayload = {
    title: "微博热搜", updateTime: "2026-09-14T12:00:00Z",
    data: [
        {id: "a", title: "事件 A", url: "https://example.com/a", hot: 12345, pubDate: "2026-09-14T11:05:00+08:00"},
        {id: "b", title: "事件 B", url: "https://example.com/b"},
    ],
};
const hackerNewsEnvelope = {status: "fresh", fetchedAt: 1000, payload: {hits: [
    {objectID: "1", title: "First story", url: "https://example.com/a", points: 120, num_comments: 45, created_at_i: 1757800000},
    {objectID: "2", title: "Second story", url: "", points: 10, num_comments: 2},
]}};
const rssFeedOf = (...items) => [
    "<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>示例订阅</title>",
    ...items,
    "</channel></rss>",
].join("");
const rssItem = (title, link, pubDate) => `<item><title>${title}</title>${link ? `<link>${link}</link>` : ""}${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}</item>`;

test("feed config exposes independent time and rank toggles", () => {
    const standard = model.normalizeFeedConfig({});
    assert.equal(standard.showTime, true);
    assert.equal(standard.showRank, true);
    assert.equal(model.normalizeFeedConfig({showTime: "否"}).showTime, false);
    assert.equal(model.normalizeFeedConfig({showRank: "否"}).showRank, false);
    assert.equal(model.formatFeedStamp(Date.parse("2026-09-14T12:34:56")), "09-14 12:34");
    assert.equal(model.formatFeedStamp(0), "");
    assert.equal(model.formatFeedStamp("not-a-date"), "");
});

test("feed snapshot stamps reliable times and gates rank", () => {
    const snapshot = model.buildExternalFeedSnapshot(
        {payload: datedDailyHotPayload, status: "fresh", fetchedAt: 1000},
        {},
        "dailyhot",
        {hot: "热度"},
    );
    assert.match(snapshot.items[0].secondary, /^\d{2}-\d{2} \d{2}:\d{2} · 热度 12345$/, "有发布时间的条目先显示短戳再显示热度");
    assert.equal(snapshot.items[1].secondary, "", "无发布时间的条目不伪造时间");
    const noTime = model.buildExternalFeedSnapshot(
        {payload: datedDailyHotPayload, status: "fresh", fetchedAt: 1000},
        {showTime: "否"},
        "dailyhot",
        {hot: "热度"},
    );
    assert.equal(noTime.items[0].secondary, "热度 12345");
    const noRank = model.buildExternalFeedSnapshot(
        {payload: datedDailyHotPayload, status: "fresh", fetchedAt: 1000},
        {showRank: "否"},
        "dailyhot",
    );
    assert.equal(noRank.items[0].rank, undefined);
    assert.equal(snapshot.items[0].rank, 1);
});

test("hacker news adds time stamps only on request", () => {
    const standard = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {}, {points: "分", comments: "评"});
    assert.equal(standard.items[0].secondary, "分 120 · 评 45");
    const timed = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {showTime: "是"}, {points: "分", comments: "评"});
    assert.match(timed.items[0].secondary, /^分 120 · 评 45 · \d{2}-\d{2} \d{2}:\d{2}$/);
    const stampOnly = model.buildHackerNewsSnapshot(hackerNewsEnvelope, {showTime: "是", showMeta: "否"}, {});
    assert.match(stampOnly.items[0].secondary, /^\d{2}-\d{2} \d{2}:\d{2}$/);
    assert.equal(model.normalizeHackerNewsConfig({}).showTime, false);
    assert.equal(model.normalizeHackerNewsConfig({showTime: "是"}).showTime, true);
});

test("rss snapshot gates feed title, date and rank independently", () => {
    const text = rssFeedOf(rssItem("新文章", "https://example.com/1", "Mon, 07 Sep 2026 08:15:00 GMT"));
    const standard = model.buildRssSnapshot(text, {url: "https://example.com/feed"}, {source: "来源"}, 1725696000000);
    assert.equal(standard.items[0].value, "示例订阅 · 2026-09-07");
    assert.equal(standard.items[0].rank, undefined, "订阅序号默认关闭");
    const noTitle = model.buildRssSnapshot(text, {url: "https://example.com/feed", showFeedTitle: "否"}, {}, 1725696000000);
    assert.equal(noTitle.items[0].value, "2026-09-07");
    const noDate = model.buildRssSnapshot(text, {url: "https://example.com/feed", showDate: "否"}, {}, 1725696000000);
    assert.equal(noDate.items[0].value, "示例订阅", "关日期后来源名仍按配置显示");
    const ranked = model.buildRssSnapshot(
        rssFeedOf(rssItem("A", "https://example.com/1", "Mon, 07 Sep 2026 08:15:00 GMT"), rssItem("B", "https://example.com/2", "")),
        {url: "https://example.com/feed", showRank: "是"},
        {},
        1725696000000,
    );
    assert.deepEqual(ranked.items.map((item) => item.rank), [1, 2, undefined], "来源行不参与排名");
    const flags = rss.normalizeRssSubscriptionConfig({});
    assert.deepEqual({showFeedTitle: flags.showFeedTitle, showDate: flags.showDate, showRank: flags.showRank}, {showFeedTitle: true, showDate: true, showRank: false});
});

test("news widget schemas stay semantic and bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("external-hot-news-dailyhot").configSchema.map((f) => f.key), ["endpoint", "apiBase", "route", "limit", "showHot", "showTime", "showRank"]);
    assert.deepEqual(byId.get("external-news-newsnow").configSchema.map((f) => f.key), ["endpoint", "limit", "showHot", "showTime", "showRank"]);
    assert.deepEqual(byId.get("external-news-hackernews").configSchema.map((f) => f.key), ["board", "limit", "showMeta", "showTime"]);
    assert.deepEqual(byId.get("external-rss-subscription").configSchema.map((f) => f.key), ["url", "title", "maxItems", "showDate", "showFeedTitle", "showRank", "hideRead"]);
    for (const id of ["external-hot-news-dailyhot", "external-news-newsnow", "external-news-hackernews", "external-rss-subscription"]) {
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
    assert.equal(store.resolveHomeConfigSection("external-hot-news-dailyhot", "showRank"), "display");
    assert.equal(store.resolveHomeConfigSection("external-news-hackernews", "showTime"), "display");
    assert.equal(store.resolveHomeConfigSection("external-rss-subscription", "showFeedTitle"), "display");
    assert.equal(store.resolveHomeConfigSection("external-rss-subscription", "maxItems"), "display");
});

test("dailyhot composes base+route through the same URL whitelist with endpoint fallback (T-6686)", () => {
    const path = require("node:path");
    const adapters = readSourceText(path.join(__dirname, "..", "src", "home-external-adapters.ts"));
    const model = readSourceText(path.join(__dirname, "..", "src", "life-widget-model.js"));
    assert.match(adapters, /normalized\.apiBase && normalized\.route/, "composition must require both fields");
    assert.match(adapters, /normalizeConfiguredFeedUrl/, "composed URL must pass the same whitelist validator");
    assert.match(adapters, /if \(composed\) configured = composed;/, "composition wins only when validated; otherwise endpoint fallback stays");
    assert.match(model, /route: DAILYHOT_ROUTES\.includes\(source\.route\) \? source\.route : ""/, "route normalization must use the single whitelist source");
});
