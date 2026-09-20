// 验收夹具门禁（T-6732，runbook 5d 节配套）。
// docs/acceptance-fixtures/*.ics 是真机验证 5d.1/5d.2/5d.3 的标准输入：
// 门禁保证每个夹具可被本插件的解析器正确展开、命中规则语义、且任何测试时点
// （now 取当前时间）都有窗口内的发生——防止夹具随实现演进而悄悄失效。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {parseIcsEvents} = require('../src/ical-model.js');

const root = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(root, 'docs', 'acceptance-fixtures');
const FIXTURE_RULES = {
    'bysetpos-last-weekday.ics': 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'bysetpos-alone-invalid.ics': 'FREQ=MONTHLY;BYSETPOS=-1',
    'daily-weekdays.ics': 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR',
    'yearly-quarterly-dates.ics': 'FREQ=YEARLY;BYMONTH=1,3,5,7,9,11;BYMONTHDAY=15',
};

test('acceptance fixture set exists and is non-empty', () => {
    assert.ok(fs.existsSync(FIXTURE_DIR), 'docs/acceptance-fixtures/ must exist');
    const files = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.ics'));
    assert.ok(files.length >= 4, `expected at least 4 fixture calendars, got ${files.length}`);
});

for (const [name, rule] of Object.entries(FIXTURE_RULES)) {
    test(`fixture ${name} keeps its runbook rule and expands inside the window`, () => {
        const text = fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
        assert.match(text, new RegExp('RRULE:' + rule.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&')), 'fixture RRULE drifted');
        // 任意"当前时间"下解析：规则无 COUNT、周期 ≤ 2 个月，60 天窗口内必有发生
        const result = parseIcsEvents(text, {now: Date.now()});
        assert.equal(result.ok, true, `fixture ${name} must parse ok`);
        assert.ok(result.events.length >= 1, `fixture ${name} must produce at least one upcoming occurrence`);
    });
}

test('bysetpos-alone fixture degrades to a single occurrence (5d.1 降级面)', () => {
    const text = fs.readFileSync(path.join(FIXTURE_DIR, 'bysetpos-alone-invalid.ics'), 'utf8');
    const result = parseIcsEvents(text, {now: Date.now()});
    assert.equal(result.ok, true);
    assert.equal(result.events.length, 1, 'isolated BYSETPOS must degrade to the anchor occurrence only');
});

// —— T-6740 端到端集成：真实回环 HTTP 服务 + 生产加载器全链路（网关→有界抓取→解析）——
const http = require('node:http');
const {loadIcalText, loadRssFeed} = require('../src/life-widget-network.js');
const {parseRssFeed} = require('../src/rss-model.js');

test('fixtures serve over real loopback http and load through the production loader', async () => {
    const server = http.createServer((req, res) => {
        const name = decodeURIComponent((req.url || '/').replace(/^\//, ''));
        const file = path.join(FIXTURE_DIR, name);
        if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, {'content-type': 'text/plain; charset=utf-8'});
        res.end(fs.readFileSync(file));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
        for (const name of ['bysetpos-last-weekday.ics', 'daily-weekdays.ics', 'yearly-quarterly-dates.ics', 'bysetpos-alone-invalid.ics']) {
            const loaded = await loadIcalText(`http://127.0.0.1:${port}/${name}`);
            assert.equal(loaded.status, 'fresh', `${name} must fetch fresh over loopback http`);
            const parsed = parseIcsEvents(loaded.text, {now: Date.now()});
            assert.equal(parsed.ok, true, `${name} must parse after the full load chain`);
        }
        const alone = await loadIcalText(`http://127.0.0.1:${port}/bysetpos-alone-invalid.ics`);
        assert.equal(parseIcsEvents(alone.text, {now: Date.now()}).events.length, 1,
            'isolated BYSETPOS degrades to a single occurrence through the real load path');
    } finally {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});

test('rss fixture loads through the production loader with date tolerance intact', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, {'content-type': 'text/xml; charset=utf-8'});
        res.end(fs.readFileSync(path.join(FIXTURE_DIR, 'rss-date-fallback.xml')));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const port2 = server.address().port;
        const loaded = await loadRssFeed(`http://127.0.0.1:${port2}/rss-date-fallback.xml`);
        const parsed = parseRssFeed(loaded.text, {now: Date.now()});
        assert.equal(parsed.ok, true);
        assert.equal(parsed.items.length, 3);
        const rescued = parsed.items.find((item) => item.title.includes('dc:date'));
        assert.ok(rescued && rescued.timestamp > 0, 'the malformed-pubDate entry keeps its timestamp through the real chain');
    } finally {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
