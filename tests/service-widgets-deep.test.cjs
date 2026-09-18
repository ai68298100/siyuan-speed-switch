const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../src/home-model.js");
const store = require("../src/home-store-model.js");
const model = require("../src/life-widget-model.js");
const network = require("../src/life-widget-network.js");

// ---------- T-6446 Miniflux ----------
test("miniflux exposes server-side ordering and meta toggles", () => {
    const standard = model.normalizeMinifluxConfig({endpoint: "https://rss.example.com", token: "t"});
    assert.equal(standard.sortBy, "newest");
    assert.equal(standard.showFeed, true);
    assert.equal(standard.showDate, true);
    assert.equal(standard.showRank, false);
    const oldest = model.normalizeMinifluxConfig({endpoint: "https://rss.example.com", token: "t", sortBy: "最旧优先"});
    assert.equal(oldest.sortBy, "oldest");
    const envelope = {status: "fresh", fetchedAt: 1000, payload: {total: 1, entries: [
        {id: 7, title: "文章", url: "https://example.com/a", feed: {title: "订阅源"}, published_at: "2026-09-14T00:00:00Z"},
    ]}};
    const snapshot = model.buildMinifluxSnapshot(envelope, {endpoint: "https://rss.example.com", token: "t"}, {unread: "未读"});
    assert.equal(snapshot.items[0].value, "订阅源 · 2026-09-14");
    assert.equal(snapshot.items[0].rank, undefined, "未读列表序号默认关闭");
    const ranked = model.buildMinifluxSnapshot(envelope, {endpoint: "https://rss.example.com", token: "t", showRank: "是", showFeed: "否"}, {unread: "未读"});
    assert.equal(ranked.items[0].value, "2026-09-14");
    assert.equal(ranked.items[0].rank, 1);
});

test("miniflux request URL always passes the network allowlist", () => {
    // 结构化一致性门禁：模型层 URL 生成与网络层白名单必须同步（T-6439 先例的字面量门禁升级）
    for (const sortBy of ["最新优先", "最旧优先"]) {
        const url = model.buildMinifluxRequestUrl({endpoint: "https://rss.example.com", token: "t", limit: 12, sortBy});
        assert.equal(network.allowedMinifluxUrl(url), true, `${sortBy} must produce an allowlisted URL`);
    }
    const oldest = model.buildMinifluxRequestUrl({endpoint: "http://127.0.0.1:8080", token: "t", limit: 1, sortBy: "最旧优先"});
    assert.equal(network.allowedMinifluxUrl(oldest), true, "本机 http 实例同样放行");
});

// ---------- T-6447 iCal ----------
const icsEventOf = (dtstart, dtend, summary) => [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    dtstart,
    dtend,
    `SUMMARY:${summary}`,
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

test("ical snapshot renders all-day and ongoing events distinctly", () => {
    // now = 2026-09-20T10:00Z；会议进行中（08:00Z 开始、12:00Z 结束）
    const now = Date.parse("2026-09-20T10:00:00Z");
    const text = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260922",
        "DTEND;VALUE=DATE:20260923",
        "SUMMARY:假期",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:20260920T080000Z",
        "DTEND:20260920T120000Z",
        "SUMMARY:周会",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART:20260921T080000Z",
        "DTEND:20260921T090000Z",
        "SUMMARY:评审",
        "END:VEVENT",
        "END:VCALENDAR",
    ].join("\r\n");
    const snapshot = model.buildIcalSnapshot(text, {url: "https://example.com/a.ics", windowDays: 14, maxEvents: 6}, {
        allDay: "全天", ongoing: "进行中",
    }, now);
    assert.ok(snapshot, "有效 ics 必须产出快照");
    const labels = snapshot.items.map((item) => item.label);
    assert.match(labels.find((label) => label.includes("假期")), /^\d+-\d+ 全天 假期$/, "全天事件不显示 00:00");
    assert.match(labels.find((label) => label.includes("周会")), / · 进行中 周会$/, "已开始未结束的日程标注进行中");
    const review = labels.find((label) => label.includes("评审"));
    assert.doesNotMatch(review, /进行中/, "未开始的日程不标注");
    assert.match(review, /^\d+-\d+ \d{2}:\d{2} 评审$/);
});

// ---------- T-6448 GitHub ----------
test("github heatmap stat surfaces today contribution from the same utc buckets", () => {
    const events = JSON.stringify([
        {type: "PushEvent", created_at: "2026-09-15T09:00:00Z"},
        {type: "WatchEvent", created_at: "2026-09-15T10:00:00Z"},
    ]);
    const snapshot = model.buildGithubContribSnapshot(events, {username: "torvalds", layout: "grid"}, {
        title: "GitHub 贡献", stat: "窗口内贡献", today: "今日",
    }, Date.parse("2026-09-15T12:00:00Z"), "fresh");
    const todayCell = snapshot.items.find((cell) => cell.label === "2026-09-15");
    assert.equal(snapshot.stat.label, `窗口内贡献 · 今日 ${todayCell ? todayCell.count : 0}`, "今日计数必须与格点单元格同源");
});

// ---------- T-6449 Uptime Kuma ----------
test("uptime kuma distinguishes maintenance from downtime and gates metrics", () => {
    const statusEnvelope = {status: "fresh", fetchedAt: 1000, payload: {
        config: {title: "服务面板"},
        publicGroupList: [{monitorList: [{id: 1, name: "官网"}, {id: 2, name: "API"}, {id: 3, name: "数据库"}]}],
    }};
    const heartbeatEnvelope = {status: "cached", fetchedAt: 2000, payload: {
        heartbeatList: {
            "1": [{status: 1, ping: 42}],
            "2": [{status: 3, ping: 5}],
            "3": [{status: 0, ping: null}],
        },
        uptimeList: {"1_24": 0.995, "2_24": 1, "3_24": 0.5},
    }};
    const labels = {title: "服务状态", stat: "在线服务", up: "正常", down: "异常", maintenance: "维护中", source: "数据来源"};
    const snapshot = model.buildUptimeKumaSnapshot(statusEnvelope, heartbeatEnvelope, {}, labels);
    assert.equal(snapshot.items[1].value, "维护中 · 5ms · 100.00%", "计划维护不再显示为异常");
    assert.equal(snapshot.items[2].value, "异常 · 50.00%", "缺 ping 不伪造数值");
    assert.equal(snapshot.stat.value, "1/3", "维护中的监控不计入在线");
    const minimal = model.buildUptimeKumaSnapshot(statusEnvelope, heartbeatEnvelope, {showPing: "否", showUptime: "否"}, labels);
    assert.equal(minimal.items[1].value, "维护中");
    assert.equal(minimal.items[2].value, "异常");
});

// ---------- schema/section contracts ----------
test("service widget schemas stay semantic and bounded", () => {
    const modules = home.registerModules([]);
    const byId = new Map(modules.map((m) => [m.moduleId, m]));
    assert.deepEqual(byId.get("external-rss-miniflux").configSchema.map((f) => f.key), ["endpoint", "token", "limit", "sortBy", "showDate", "showFeed", "showRank"]);
    assert.deepEqual(byId.get("external-status-uptimekuma").configSchema.map((f) => f.key), ["endpoint", "slug", "showPing", "showUptime"]);
    assert.deepEqual(byId.get("external-ical-events").configSchema.map((f) => f.key), ["url", "windowDays", "maxEvents"]);
    assert.deepEqual(byId.get("external-github-contrib").configSchema.map((f) => f.key), ["username", "windowDays", "token"]);
    for (const id of ["external-rss-miniflux", "external-status-uptimekuma", "external-ical-events", "external-github-contrib"]) {
        assert.ok(byId.get(id).configSchema.length <= 12, `${id} stays within the protocol v2 field budget`);
    }
    assert.equal(store.resolveHomeConfigSection("external-rss-miniflux", "sortBy"), "display");
    assert.equal(store.resolveHomeConfigSection("external-rss-miniflux", "showFeed"), "display");
    assert.equal(store.resolveHomeConfigSection("external-status-uptimekuma", "showPing"), "display");
});
