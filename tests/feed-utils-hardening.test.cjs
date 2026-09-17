// T-6317 生活信息 feed 工具加固契约：时间戳双单位语义、href 协议与凭据门、
// feed 配置钳制、上游载荷归一（provider 白名单/去重/截断/缓存标记）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeFeedConfig, normalizeExternalItemHref, normalizeFeedTimestamp, normalizeExternalFeedPayload} = require('../src/life-widget-model.js');

test('feed timestamps accept seconds, milliseconds and ISO strings', () => {
    assert.equal(normalizeFeedTimestamp(1725696000), 1725696000000, "秒级自动升到毫秒");
    assert.equal(normalizeFeedTimestamp(1725696000000), 1725696000000, "毫秒直传");
    assert.equal(normalizeFeedTimestamp("2026-09-07T08:15:00Z"), Date.parse("2026-09-07T08:15:00Z"));
    assert.equal(normalizeFeedTimestamp("not-a-date", 42), 42, "不可解析回退调用方缺省");
    assert.equal(normalizeFeedTimestamp(-5, 7), 7, "负值回退");
    assert.equal(normalizeFeedTimestamp(undefined, 0), 0);
});

test('external item hrefs require http(s) and no credentials; overlong is truncated then validated', () => {
    assert.equal(normalizeExternalItemHref("https://a.example/x"), "https://a.example/x");
    assert.equal(normalizeExternalItemHref("http://a.example/x"), "http://a.example/x");
    assert.equal(normalizeExternalItemHref("ftp://a.example/x"), "", "非 http(s) 拒绝");
    assert.equal(normalizeExternalItemHref("javascript:alert(1)"), "");
    assert.equal(normalizeExternalItemHref("https://u:p@a.example/x"), "", "内嵌凭据拒绝");
    const truncated = normalizeExternalItemHref(`https://a.example/${"x".repeat(600)}`);
    assert.equal(truncated.length, 512, "超长先截断到 512 再校验（钉住现状）");
    assert.equal(truncated.startsWith("https://a.example/"), true);
    assert.equal(normalizeExternalItemHref(42), "");
});

test('feed config clamps limit into 3..12 and treats 否/false as hidden', () => {
    assert.equal(normalizeFeedConfig({limit: 1}).limit, 3);
    assert.equal(normalizeFeedConfig({limit: 99}).limit, 12);
    assert.equal(normalizeFeedConfig({}).limit, 8);
    assert.equal(normalizeFeedConfig({showHot: "否"}).showHot, false);
    assert.equal(normalizeFeedConfig({showHot: false}).showHot, false);
    assert.equal(normalizeFeedConfig({showHot: "是"}).showHot, true);
    assert.equal(normalizeFeedConfig({}).showHot, true);
});

test('feed payload normalization enforces the provider whitelist', () => {
    assert.equal(normalizeExternalFeedPayload({data: []}, "unknown-provider"), null);
    assert.equal(normalizeExternalFeedPayload(null, "dailyhot"), null);
    assert.equal(normalizeExternalFeedPayload({data: []}, "newsnow").items.length, 0);
});

test('feed payload dedupes by href, falls back across data/items and marks cache state', () => {
    const payload = {
        title: "榜单",
        updateTime: "2026-09-17T00:00:00Z",
        fromCache: true,
        items: [
            {title: "甲", url: "https://a/1"},
            {title: "甲重复", url: "https://a/1"},
            {title: "无链接条目", id: "id-2"},
            {title: "", url: "https://a/3"},
        ],
    };
    const result = normalizeExternalFeedPayload(payload, "dailyhot", 8);
    assert.equal(result.items.length, 2, "重复键与无标题条目剔除");
    assert.equal(result.items[1].href, "", "无链接条目保留标题、href 为空串");
    assert.equal(result.items[1].rank, 3, "rank 沿用上游原始名次而非过滤后位置（钉住现状）");
    assert.equal(result.updatedAt, Date.parse("2026-09-17T00:00:00Z"));
    assert.equal(result.upstreamCached, true);
});

test('feed payload honors the requested limit before the raw 48-item scan cap', () => {
    const items = Array.from({length: 40}, (_, index) => ({title: `t${index}`, url: `https://a/${index}`}));
    const result = normalizeExternalFeedPayload({items}, "newsnow", 5);
    assert.equal(result.items.length, 5);
    const huge = Array.from({length: 100}, (_, index) => ({title: `t${index}`, url: `https://a/${index}`}));
    assert.equal(normalizeExternalFeedPayload({items: huge}, "newsnow", 12).items.length, 12);
});
