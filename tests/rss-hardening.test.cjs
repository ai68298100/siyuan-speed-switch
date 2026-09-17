// T-6312 RSS 模型加固契约：只补 rss-model.test.cjs 未覆盖的真实行为。
const test = require('node:test');
const assert = require('node:assert/strict');
const {MAX_PARSE_ITEMS, MAX_TITLE_CHARS, parseRssFeed, latestRssItems, extractTagText, extractAtomLink} = require('../src/rss-model.js');

const feedOf = (...items) => ['<?xml version="1.0"?>', '<rss version="2.0"><channel><title>T</title>', ...items, '</channel></rss>'].join("\n");
const itemOf = (title, link) => `<item><title>${title}</title><link>${link}</link></item>`;

test('title clamp is enforced at the parse layer', () => {
    const parsed = parseRssFeed(feedOf(itemOf(`${"长".repeat(500)}`, "https://a/1")));
    assert.equal(parsed.items[0].title.length, MAX_TITLE_CHARS);
    assert.equal(MAX_TITLE_CHARS, 96);
});

test('relative and protocol-relative links are kept in the model but filtered by the snapshot', () => {
    const parsed = parseRssFeed(feedOf(itemOf("相对链接", "/only/a/path")));
    assert.equal(parsed.items[0].link, "/only/a/path", "模型层保留原文，不猜协议");
    const {buildRssSnapshot} = require('../src/life-widget-model.js');
    const snapshot = buildRssSnapshot(feedOf(itemOf("相对链接", "/only/a/path")), {}, {});
    assert.equal(snapshot.items[0].href, undefined, "快照层丢弃非 http(s) 链接");
});

test('channel title inside CDATA is read for the feed title', () => {
    const text = ['<rss><channel>', '<title><![CDATA[CDATA 频道名]]></title>', itemOf("条目", "https://a/1"), '</channel></rss>'].join("\n");
    const parsed = parseRssFeed(text);
    assert.equal(parsed.feedTitle, "CDATA 频道名");
});

test('whitespace-only titles are treated as missing', () => {
    const parsed = parseRssFeed(feedOf(itemOf("   ", "https://a/1"), itemOf("正常", "https://a/2")));
    assert.deepEqual(parsed.items.map((entry) => entry.title), ["正常"]);
});

test('item and entry tags may carry attributes', () => {
    const text = [
        '<rss><channel><title>T</title>',
        '<item rdf:about="https://a/1"><title>带属性</title><link>https://a/1</link></item>',
        '</channel></rss>',
    ].join("\n");
    const parsed = parseRssFeed(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.items[0].title, "带属性");
});

test('atom entries with content but no title are skipped', () => {
    const text = [
        '<feed><title>T</title>',
        '<entry><content>只有正文没有标题</content><link href="https://a/1"/></entry>',
        '<entry><title>正常条目</title></entry>',
        '</feed>',
    ].join("\n");
    const parsed = parseRssFeed(text);
    assert.deepEqual(parsed.items.map((entry) => entry.title), ["正常条目"]);
});

test('guid non-url values survive the model and get filtered at the snapshot layer', () => {
    const parsed = parseRssFeed(feedOf('<item><title>x</title><guid>tag:example.com,2026:post-1</guid></item>'));
    assert.equal(parsed.items[0].link, "tag:example.com,2026:post-1");
    const {buildRssSnapshot} = require('../src/life-widget-model.js');
    const snapshot = buildRssSnapshot(feedOf('<item><title>x</title><guid>tag:example.com,2026:post-1</guid></item>'), {}, {});
    assert.equal(snapshot.items[0].href, undefined);
});

test('malformed attribute quotes yield empty atom links instead of throwing', () => {
    assert.equal(extractAtomLink('<link href=broken/>'), "");
    assert.equal(extractAtomLink("not-a-tag"), "");
    assert.equal(extractTagText(null, "title"), "");
    assert.equal(extractTagText("<title>x</title>", "title<script>"), "", "标签名带危险字符直接拒绝");
});

test('parse bounds and input defenses are exported constants', () => {
    assert.equal(MAX_PARSE_ITEMS, 200);
    const weird = [
        '<rss><channel><title>T</title>',
        itemOf(`A`, "https://a/1"),
        '</channel></rss>',
    ].join("\n");
    const parsed = parseRssFeed(weird);
    assert.equal(latestRssItems(parsed.items, {maxItems: -3}).length, 1, "非法 maxItems 回退默认后仍正常截取");
    assert.equal(latestRssItems("not-an-array", {}).length, 0);
});
