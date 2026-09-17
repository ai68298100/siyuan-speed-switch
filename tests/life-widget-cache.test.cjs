// T-6320 生活信息网络缓存行为契约：容量上限淘汰、按组件的键命名空间隔离、
// force 直取新鲜数据，以及 RSS/空气加载器陈旧回退的时间语义。
const test = require('node:test');
const assert = require('node:assert/strict');
const network = require('../src/life-widget-network.js');

const textResponse = (body) => ({ok: true, headers: {get: () => null}, text: () => Promise.resolve(body)});

test('response cache evicts oldest entries beyond the 16-key cap', async () => {
    network.clearLifeWidgetCaches();
    const fetchImpl = () => Promise.resolve(textResponse("<rss><channel><title>t</title><item><title>x</title></item></channel></rss>"));
    for (let index = 0; index < 20; index += 1) {
        await network.loadRssFeed(`https://example.com/feed-${index}`, {fetchImpl, now: index * 1000});
    }
    assert.equal(network.lifeWidgetCacheSize() <= 16, true, `缓存不得无限增长（当前 ${network.lifeWidgetCacheSize()}）`);
    network.clearLifeWidgetCaches();
    assert.equal(network.lifeWidgetCacheSize(), 0);
});

test('rss and ical loaders use separate key namespaces', async () => {
    network.clearLifeWidgetCaches();
    const rssBody = "<rss><channel><title>t</title><item><title>x</title></item></channel></rss>";
    const icsBody = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
    const fetchByUrl = (url) => Promise.resolve(textResponse(url.startsWith("https://rss") ? rssBody : icsBody));
    await network.loadRssFeed("https://rss.example.com/feed", {fetchImpl: fetchByUrl, now: 1000});
    await network.loadIcalText("https://rss.example.com/feed.ics", {fetchImpl: fetchByUrl, now: 1000});
    assert.equal(network.lifeWidgetCacheSize(), 2, "两个组件即使主机相近也各占一个缓存键");
    network.clearLifeWidgetCaches();
});

test('force fetch bypasses a warm cache and refreshes it', async () => {
    network.clearLifeWidgetCaches();
    let calls = 0;
    const fetchImpl = () => {
        calls += 1;
        return Promise.resolve(textResponse("<rss><channel><title>t</title><item><title>x</title></item></channel></rss>"));
    };
    await network.loadRssFeed("https://example.com/force", {fetchImpl, now: 1000});
    const forced = await network.loadRssFeed("https://example.com/force", {fetchImpl, now: 2000, force: true});
    assert.equal(forced.status, "fresh");
    assert.equal(calls, 2, "force 必须真实发起第二次请求");
    network.clearLifeWidgetCaches();
});

test('air quality stale fallback keeps the stale payload readable', async () => {
    network.clearLifeWidgetCaches();
    const url = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.0000&longitude=2.0000&current=european_aqi,pm2_5,pm10&timezone=auto";
    const good = () => Promise.resolve(textResponse(JSON.stringify({current: {european_aqi: 30}})));
    await network.loadAirQuality(url, {fetchImpl: good, now: 1000});
    const stale = await network.loadAirQuality(url, {fetchImpl: () => Promise.reject(new Error("http_error")), now: 99999999});
    assert.equal(stale.status, "stale");
    assert.equal(stale.payload.current.european_aqi, 30);
    network.clearLifeWidgetCaches();
});
