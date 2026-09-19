// T-6303 RSS/Atom 订阅组件契约（纯模型 + URL 门禁 + 加载器 + 快照）
//
// 组件定位：用户填任意 feed 地址的通用 RSS/Atom 订阅，与 Miniflux（自建实例+Token）
// 互补——零凭据、零实例。有界边界沿用 iCal 先例：网络层 128KiB 钳制、模型层
// 200 条解析上限（超限整体拒绝而非静默截断）、实体单轮解码。
const test = require('node:test');
const assert = require('node:assert/strict');
const rss = require('../src/rss-model.js');
const network = require('../src/life-widget-network.js');
const {normalizeRssSubscriptionConfig, parseRssFeed, latestRssItems, decodeXmlEntities, extractAtomLink} = rss;
const {allowedRssFeedUrl, loadRssFeed, RSS_TTL_MS} = network;

const rssFeedOf = (...items) => [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    '<title>示例订阅</title>',
    '<link>https://example.com/</link>',
    ...items,
    '</channel></rss>',
].join("\n");

const rssItem = (title, link, pubDate) => [
    '<item>',
    `<title>${title}</title>`,
    link ? `<link>${link}</link>` : "",
    pubDate ? `<pubDate>${pubDate}</pubDate>` : "",
    '</item>',
].filter(Boolean).join("\n");

// ---------- 配置归一化 ----------
test('rss config trims url, clamps maxItems and bounds title', () => {
    const config = normalizeRssSubscriptionConfig({url: "  https://example.com/feed.xml  ", maxItems: 999, title: "  T ".repeat(100)});
    assert.equal(config.url, "https://example.com/feed.xml");
    assert.equal(config.maxItems, 30);
    assert.equal(config.title.length, 96);
    assert.equal(normalizeRssSubscriptionConfig({}).maxItems, 10);
    assert.equal(normalizeRssSubscriptionConfig({maxItems: 0}).maxItems, 1);
    assert.equal(normalizeRssSubscriptionConfig({maxItems: "abc"}).maxItems, 10);
    assert.equal(normalizeRssSubscriptionConfig({}).url, "");
});

// ---------- URL 门禁 ----------
test('rss url gate allows https arbitrary paths and local http only', () => {
    assert.equal(allowedRssFeedUrl("https://example.com/feed.xml"), true);
    assert.equal(allowedRssFeedUrl("https://example.com/blog/index.php?feed=rss2"), true);
    assert.equal(allowedRssFeedUrl("http://127.0.0.1:8080/rss"), true);
    assert.equal(allowedRssFeedUrl("http://localhost/feed"), true);
    assert.equal(allowedRssFeedUrl("http://example.com/feed"), false, "公网 http 必须拒绝");
    assert.equal(allowedRssFeedUrl("https://user:pass@example.com/feed"), false, "userinfo 必须拒绝");
    assert.equal(allowedRssFeedUrl("https://example.com/feed#frag"), false, "fragment 必须拒绝");
    assert.equal(allowedRssFeedUrl(`https://example.com/${"a".repeat(600)}`), false, "超长必须拒绝");
    assert.equal(allowedRssFeedUrl("not a url"), false);
    assert.equal(allowedRssFeedUrl(undefined), false);
});

// ---------- 加载器：白名单/缓存/陈旧回退 ----------
test('rss loader blocks unlisted endpoints and caches fresh responses', async () => {
    network.clearLifeWidgetCaches();
    await assert.rejects(loadRssFeed("http://example.com/feed"), /blocked_endpoint/);
    let calls = 0;
    const fetchImpl = () => {
        calls += 1;
        return Promise.resolve({ok: true, headers: {get: () => null}, text: () => Promise.resolve(rssFeedOf(rssItem("A", "https://a/1", "Mon, 07 Sep 2026 08:15:00 GMT")))});
    };
    const first = await loadRssFeed("https://example.com/feed", {fetchImpl, now: 1000});
    assert.equal(first.status, "fresh");
    const second = await loadRssFeed("https://example.com/feed", {fetchImpl, now: 1000 + RSS_TTL_MS - 1});
    assert.equal(second.status, "cached");
    assert.equal(calls, 1, "TTL 内不得发起第二次网络请求");
});

test('rss loader falls back to stale cache on failure', async () => {
    network.clearLifeWidgetCaches();
    const good = {ok: true, headers: {get: () => null}, text: () => Promise.resolve("<rss><channel><title>t</title></channel></rss></rss>")};
    await loadRssFeed("https://example.com/stale", {fetchImpl: () => Promise.resolve(good), now: 1000});
    const failing = () => Promise.reject(new Error("timeout"));
    const stale = await loadRssFeed("https://example.com/stale", {fetchImpl: failing, now: 1000 + RSS_TTL_MS * 10});
    assert.equal(stale.status, "stale");
    network.clearLifeWidgetCaches();
    await assert.rejects(loadRssFeed("https://example.com/stale", {fetchImpl: failing}), /timeout/, "无缓存时失败必须上抛");
});

test('rss loader rejects empty body', async () => {
    network.clearLifeWidgetCaches();
    await assert.rejects(
        loadRssFeed("https://example.com/empty", {fetchImpl: () => Promise.resolve({ok: true, headers: {get: () => null}, text: () => Promise.resolve("")})}),
        /empty_response/,
    );
});

// ---------- RSS 2.0 解析 ----------
test('parses rss channel title and items', () => {
    const text = rssFeedOf(
        rssItem("文章一", "https://example.com/1", "Mon, 07 Sep 2026 08:15:00 GMT"),
        rssItem("文章二", "https://example.com/2", "Tue, 01 Sep 2026 10:00:00 GMT"),
    );
    const parsed = parseRssFeed(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.format, "rss");
    assert.equal(parsed.feedTitle, "示例订阅", "feed 标题必须取 channel 头部而非条目");
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].title, "文章一");
    assert.equal(parsed.items[0].link, "https://example.com/1");
    assert.ok(parsed.items[0].timestamp > 0);
});

test('rss CDATA titles: tags stripped, entities stay literal', () => {
    const text = rssFeedOf(rssItem("<![CDATA[关于 <em>引号</em> &amp; 转义]]>", "https://example.com/x", ""));
    const parsed = parseRssFeed(text);
    assert.equal(parsed.items[0].title, "关于 引号 &amp; 转义", "CDATA 是字面文本：剥标签但不解码实体");
});

test('rss dc:date fallback and guid link fallback work', () => {
    const item = [
        '<item>',
        '<title>DC 日期条目</title>',
        '<guid>https://example.com/guid-1</guid>',
        '<dc:date>2026-09-05T12:00:00Z</dc:date>',
        '</item>',
    ].join("\n");
    const parsed = parseRssFeed(rssFeedOf(item));
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].link, "https://example.com/guid-1");
    assert.ok(parsed.items[0].timestamp > 0);
});

// ---------- Atom 解析 ----------
test('parses atom entries with rel=alternate link priority', () => {
    const text = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        '<title>Atom 示例</title>',
        '<entry>',
        '<title>Atom 条目</title>',
        '<link rel="self" href="https://example.com/self"/>',
        '<link rel="alternate" href="https://example.com/article"/>',
        '<updated>2026-09-06T09:30:00Z</updated>',
        '</entry>',
        '</feed>',
    ].join("\n");
    const parsed = parseRssFeed(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.format, "atom");
    assert.equal(parsed.feedTitle, "Atom 示例");
    assert.equal(parsed.items[0].link, "https://example.com/article", "rel=alternate 优先于 rel=self");
    assert.ok(parsed.items[0].timestamp > 0);
});

test('atom published is used when updated is missing', () => {
    const text = [
        '<feed><title>t</title>',
        '<entry><title>x</title><published>2026-09-01T00:00:00Z</published></entry>',
        '</feed>',
    ].join("\n");
    const parsed = parseRssFeed(text);
    assert.ok(parsed.items[0].timestamp > 0);
});

test('extractAtomLink falls back to first href and tolerates single quotes', () => {
    assert.equal(extractAtomLink('<link href=\'https://a/1\'/>'), 'https://a/1');
    assert.equal(extractAtomLink('<link/>'), '');
});

// ---------- 排序与截取 ----------
test('latestRssItems sorts desc, sinks undated entries, clamps output', () => {
    const items = [
        {title: "old", link: "", timestamp: 1000, dateRaw: ""},
        {title: "new", link: "", timestamp: 3000, dateRaw: ""},
        {title: "no-date-a", link: "", timestamp: 0, dateRaw: ""},
        {title: "mid", link: "", timestamp: 2000, dateRaw: ""},
        {title: "no-date-b", link: "", timestamp: 0, dateRaw: ""},
    ];
    const latest = latestRssItems(items, {maxItems: 4});
    assert.deepEqual(latest.map((i) => i.title), ["new", "mid", "old", "no-date-a"], "无日期沉底且保持原相对顺序");
    assert.equal(latestRssItems(items, {maxItems: 999}).length, 5);
    assert.equal(latestRssItems(items, {}).length, 5, "缺省 maxItems=10 内全保留");
});

// ---------- 有界与拒绝语义 ----------
test('oversized feeds are rejected as parse_failed, not truncated', () => {
    const items = [];
    for (let i = 0; i < 201; i += 1) items.push(rssItem(`t${i}`, `https://a/${i}`, ""));
    const parsed = parseRssFeed(rssFeedOf(...items));
    assert.deepEqual({ok: parsed.ok, reason: parsed.reason}, {ok: false, reason: "parse_failed"});
});

test('non-feed text, empty input and item-less feeds are rejected', () => {
    assert.equal(parseRssFeed("<html><body>hi</body></html>").reason, "not_a_feed");
    assert.equal(parseRssFeed("").reason, "empty_response");
    assert.equal(parseRssFeed(null).reason, "empty_response");
    assert.equal(parseRssFeed(rssFeedOf()).reason, "empty_feed");
});

test('items without any title are skipped', () => {
    const item = '<item><link>https://a/1</link><pubDate>Mon, 07 Sep 2026 08:15:00 GMT</pubDate></item>';
    const parsed = parseRssFeed(rssFeedOf(item));
    assert.equal(parsed.ok, false, "全部条目无标题等价于空 feed");
    assert.equal(parsed.reason, "empty_feed");
    const mixed = parseRssFeed(rssFeedOf(item, rssItem("正常条目", "https://a/2", "")));
    assert.equal(mixed.ok, true);
    assert.equal(mixed.items.length, 1, "无标题条目跳过、有效条目保留");
});

// ---------- 实体解码 ----------
test('xml entities decode in a single pass with safe code points', () => {
    assert.equal(decodeXmlEntities("&amp;lt;"), "&lt;", "单轮解码不得迭代展开");
    assert.equal(decodeXmlEntities("a &lt; b &gt; c &quot;d&quot; &apos;e&apos; &amp;"), 'a < b > c "d" \'e\' &');
    assert.equal(decodeXmlEntities("&#20013;&#x4E00;"), "中一");
    assert.equal(decodeXmlEntities("&#0;"), "\uFFFD");
    assert.equal(decodeXmlEntities("&#xD800;"), "\uFFFD", "代理区独字必须替换");
    assert.equal(decodeXmlEntities("&#999999999999;"), "\uFFFD");
});

// ---------- 快照构建 ----------
test('buildRssSnapshot builds bounded list with title fallback chain', () => {
    const {buildRssSnapshot} = require('../src/life-widget-model.js');
    const text = rssFeedOf(
        rssItem("新文章", "javascript:alert(1)", "Mon, 07 Sep 2026 08:15:00 GMT"),
        rssItem("好文章", "https://example.com/2", ""),
    );
    const snapshot = buildRssSnapshot(text, {url: "https://example.com/feed", maxItems: 10}, {source: "来源"}, 1725696000000, "stale");
    assert.ok(snapshot, "有效 feed 必须产出快照");
    assert.equal(snapshot.title, "示例订阅", "未配置标题时回退 feed 自带标题");
    assert.equal(snapshot.items.length, 3, "两个条目 + 一条来源行");
    assert.equal(snapshot.items[0].label, "新文章", "有日期条目排前");
    assert.equal(snapshot.items[0].href, undefined, "非 http(s) 链接必须丢弃");
    assert.equal(snapshot.items[1].href, "https://example.com/2");
    assert.match(snapshot.items[1].value, /^示例订阅/);
    assert.equal(snapshot.items[2].label, "来源：RSS/Atom");
    assert.equal(snapshot.sourceHealth, "stale");

    const titled = buildRssSnapshot(text, {url: "https://example.com/feed", title: "我的源"}, {}, 0, "fresh");
    assert.equal(titled.title, "我的源", "用户配置标题优先");
    assert.equal(buildRssSnapshot("<html></html>", {}, {}), null, "无效 feed 必须返回 null");
});

test('rss read state is bounded, corrupt-tolerant, and stable (T-6685)', () => {
    const {normalizeRssReadState, rssItemKey, RSS_READ_STATE_MAX} = rss;
    assert.equal(RSS_READ_STATE_MAX, 200);
    // 损坏键/值剔除 + changed 标记
    const dirty = normalizeRssReadState({version: 1, seen: {ok: 5, bad: 'x', '': 1, long: 'y'}, other: 1});
    assert.deepEqual(Object.keys(dirty.seen), ['ok']);
    assert.equal(dirty.changed, true);
    // 超限按最旧剪除
    const flood = {};
    for (let index = 0; index < 260; index += 1) flood['k' + index] = index + 1;
    const bounded = normalizeRssReadState({version: 1, seen: flood});
    assert.equal(Object.keys(bounded.seen).length, RSS_READ_STATE_MAX);
    assert.equal(bounded.seen['k0'], undefined, 'oldest entries are pruned first');
    assert.equal(bounded.seen['k259'], 260);
    // 条目键：link 优先，title 兜底，128 字符钳制
    assert.equal(rssItemKey({link: 'https://a/1', title: '标题'}), 'https://a/1');
    assert.equal(rssItemKey({title: '标题'}), '标题');
    assert.equal(rssItemKey({link: 'x'.repeat(300)}).length, 128);
});
