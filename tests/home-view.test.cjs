const test = require("node:test");
const assert = require("node:assert/strict");
const {JSDOM} = require("jsdom");
const {normalizeHomeViewResult, buildHomeModuleView, renderHomeModuleView, renderModuleIcon, formatUpdatedAt} = require("../src/home-view.js");

test("home view normalizes loading, cached, empty, and bounded item states", () => {
    const loading = normalizeHomeViewResult({loading: true});
    assert.deepEqual({status: loading.status, cached: loading.cached}, {status: "loading", cached: false});
    const ready = normalizeHomeViewResult({ok: true, cached: true, snapshot: {items: [{label: " Ready ", value: "1"}, {label: ""}]}});
    assert.equal(ready.status, "ready");
    assert.equal(ready.cached, true);
    assert.deepEqual(ready.items, [{label: "Ready", value: "1", href: "", command: ""}]);
    assert.equal(normalizeHomeViewResult({ok: true, snapshot: {items: []}}).status, "empty");
    assert.equal(normalizeHomeViewResult({ok: false, reason: "timeout"}).status, "error");
});

test("home view preserves a bounded adapter empty hint", () => {
    const view = buildHomeModuleView({moduleId: "commands", title: "Commands"}, {
        ok: true,
        snapshot: {items: [], emptyHint: "  Install a command plugin  ", empty: true},
    });
    assert.equal(view.emptyHint, "Install a command plugin");
    const dom = new JSDOM("<!doctype html><body></body>");
    const rendered = renderHomeModuleView(dom.window.document, view);
    assert.equal(rendered.querySelector(".sw__home-module-status").textContent, "Install a command plugin");
});

test("home view builds a stable accessible module contract", () => {
    const view = buildHomeModuleView({moduleId: "tasks", title: "Tasks", icon: "iconCheck", category: "siyuan"}, {ok: true, snapshot: {items: [{label: "One"}]}}, {collapsed: true});
    assert.deepEqual(view, {
        moduleId: "tasks", title: "Tasks", icon: "iconCheck", category: "siyuan", status: "ready", cached: false,
        reason: "", updatedAt: 0, sourceHealth: "", stat: null, items: [{label: "One", value: "", href: "", command: ""}], viewType: "", configurable: false, collapsed: true,
        role: "region", ariaBusy: false,
    });
    assert.equal(buildHomeModuleView(null, {}), null);
});

test("home view renderer exposes bounded states and activation hooks", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const calls = [];
    const ready = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "tasks", title: "Tasks"}, {ok: true, snapshot: {items: [{label: "One", value: "1", href: "siyuan://one"}]}}), {
        onItem: (item) => calls.push(item.value),
        onToggle: () => calls.push("toggle"),
    });
    assert.equal(ready.dataset.status, "ready");
    assert.equal(ready.getAttribute("role"), "region");
    assert.equal(ready.getAttribute("aria-labelledby"), ready.querySelector(".sw__home-module-title").id);
    assert.equal(ready.getAttribute("aria-expanded"), "true");
    assert.equal(ready.querySelector(".sw__home-module-title").textContent, "Tasks");
    const toggle = ready.querySelector(".sw__home-module-toggle");
    const body = ready.querySelector(".sw__home-module-body");
    assert.equal(body.getAttribute("aria-hidden"), "false");
    assert.equal(toggle.getAttribute("aria-controls"), body.id);
    assert.notEqual(toggle.getAttribute("aria-controls"), "");
    const unsafeId = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "a/b", title: "Unsafe"}, {ok: true, snapshot: {items: []}}));
    assert.match(unsafeId.querySelector(".sw__home-module-title").id, /^sw-home-title-/);
    assert.equal(unsafeId.getAttribute("aria-labelledby"), unsafeId.querySelector(".sw__home-module-title").id);
    assert.notEqual(unsafeId.querySelector(".sw__home-module-title").id, ready.querySelector(".sw__home-module-title").id);
    assert.ok(unsafeId.querySelector(".sw__home-module-title").id.length < 64);
    assert.equal(ready.querySelectorAll(".sw__home-module-item-action").length, 1);
    ready.querySelector(".sw__home-module-item-action").click();
    ready.querySelector(".sw__home-module-toggle").click();
    assert.deepEqual(calls, ["1", "toggle"]);

    const collapsed = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "collapsed", title: "Collapsed"}, {
        ok: true, snapshot: {items: [{label: "Hidden"}]},
    }, {collapsed: true}), {onToggle: () => undefined});
    assert.equal(collapsed.getAttribute("aria-expanded"), "false");
    assert.equal(collapsed.querySelector(".sw__home-module-body").getAttribute("aria-hidden"), "true");
    assert.equal(collapsed.querySelector(".sw__home-module-body").hidden, true);

    const error = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "failed", title: "Failed"}, {ok: false, reason: "timeout"}), {
        onRetry: () => calls.push("retry"),
    });
    assert.equal(error.getAttribute("aria-busy"), "false");
    assert.equal(error.querySelector('[role="alert"]').textContent, "暂时无法加载 · timeout");
    
    assert.equal(error.querySelector('[role="alert"]').getAttribute("aria-live"), "assertive");
    error.querySelector(".sw__home-module-retry").click();
    assert.equal(calls.at(-1), "retry");

    const localized = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "slow", title: "Slow"}, {ok: false, reason: "timeout"}), {
        labels: {timeout: "请求超时"},
    });
    assert.equal(localized.querySelector('[role="alert"]').textContent, "请求超时");
});

test("home view renders calendar grid for viewType calendar", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView(
        {moduleId: "journal-calendar", title: "日历月视图", viewType: "calendar"},
        {ok: true, snapshot: {items: [
            {label: "", value: ""},
            {label: "1", value: "20260901000000-aaaaaaa"},
            {label: "2", value: ""},
            {label: "3", value: "", done: true},
            {label: "4", value: "", secondary: "正月初四"},
        ]}},
        {calendarWeekdays: "一二三四五六日"},
    );
    const root = renderHomeModuleView(dom.window.document, view, {onItem: () => {}});
    assert.ok(root, "rendered");
    const grid = root.querySelector(".sw__home-calendar");
    assert.ok(grid, "calendar grid present");
    assert.equal(grid.querySelectorAll(".sw__home-calendar-head").length, 7);
    assert.equal(grid.querySelectorAll(".sw__home-calendar-cell").length, 5);
    assert.equal(grid.querySelectorAll(".has-journal").length, 1);
    assert.equal(grid.querySelectorAll(".is-today").length, 1);
    assert.equal(grid.querySelectorAll(".sw__home-calendar-secondary").length, 1);
});

test("home view retains a complete calendar and renders iPad-style date states", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const items = Array.from({length: 42}, (_, index) => ({
        label: String((index % 31) + 1),
        value: index === 10 ? "20260909000000-aaaaaaa" : "",
        outside: index < 2 || index > 31,
        done: index === 10,
    }));
    const view = buildHomeModuleView(
        {moduleId: "journal-calendar", title: "日历月视图", viewType: "calendar"},
        {ok: true, snapshot: {title: "2026年9月", items}},
    );
    const root = renderHomeModuleView(dom.window.document, view, {onItem: () => {}, onCalendarNavigate: () => {}});
    assert.equal(view.contextTitle, "2026年9月");
    assert.equal(root.querySelector(".sw__home-calendar-period").textContent, "2026年9月");
    assert.equal(root.querySelectorAll(".sw__home-calendar-cell").length, 42);
    assert.equal(root.querySelectorAll(".is-outside").length, 12);
    assert.equal(root.querySelectorAll(".sw__home-calendar-marker").length, 1);
    assert.equal(root.querySelector(".has-journal").type, "button");
});
test("home view renders holiday overlays without losing lunar context", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView(
        {moduleId: "journal-calendar", title: "Calendar", viewType: "calendar"},
        {ok: true, snapshot: {title: "2026-10", items: [
            {label: "1", secondary: "国庆节 · 八月廿一", holiday: "off"},
            {label: "10", secondary: "国庆节 · 班", holiday: "work"},
        ]}},
    );
    const root = renderHomeModuleView(dom.window.document, view, {});
    assert.equal(root.querySelectorAll(".is-holiday").length, 1);
    assert.equal(root.querySelectorAll(".is-workday").length, 1);
    assert.match(root.querySelector(".is-holiday").getAttribute("aria-label"), /国庆节/);
    assert.match(root.querySelector(".is-holiday .sw__home-calendar-secondary").textContent, /八月廿一/);
});

test("home view renders weather context, secondary forecasts, and safe attribution", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView(
        {moduleId: "external-weather-open-meteo", title: "近期天气"},
        {ok: true, snapshot: {title: "北京 · 中国", stat: {value: "21°", label: "⛅ 多云"}, items: [
            {label: "今天 ☀️ 18° / 27°", secondary: "晴 · 降水 10%"},
            {label: "Open-Meteo", href: "https://open-meteo.com/"},
        ]}},
    );
    const root = renderHomeModuleView(dom.window.document, view, {});
    assert.equal(root.querySelector(".sw__home-module-context").textContent, "北京 · 中国");
    assert.equal(root.querySelector(".sw__home-module-item-secondary").textContent, "晴 · 降水 10%");
    assert.equal(view.items[1].href, "https://open-meteo.com/");
});

test("home view renders ranked feeds and stale source health", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView({moduleId: "external-hot-news-dailyhot", title: "热搜事件"}, {ok: true, snapshot: {
        sourceHealth: "stale", items: [{label: "事件 A", rank: 1, secondary: "热度 123"}],
    }});
    const root = renderHomeModuleView(dom.window.document, view, {labels: {sourceStale: "过期缓存"}});
    assert.equal(root.querySelector(".sw__home-source-health").textContent, "过期缓存");
    assert.equal(root.querySelector(".sw__home-source-health").dataset.health, "stale");
    assert.equal(root.querySelector(".sw__home-module-item-rank").textContent, "1");
    assert.equal(root.querySelector(".sw__home-module-item-secondary").textContent, "热度 123");
});

test("home view drops malformed feed source health and rank", () => {
    const view = normalizeHomeViewResult({snapshot: {sourceHealth: "bad", items: [{label: "A", rank: -3}]}});
    assert.equal(view.sourceHealth, "");
    assert.equal(view.items[0].rank, undefined);
});

test("home view renders a semantic media cover grid", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const calls = [];
    const view = buildHomeModuleView(
        {moduleId: "external-anime-bangumi", title: "每日放送", viewType: "media"},
        {ok: true, snapshot: {items: [
            {label: "阿尔法", secondary: "★ 8.3", image: "https://lain.bgm.tv/pic/cover/l/a.jpg", href: "https://bgm.tv/subject/101"},
            {label: "数据来源：Bangumi", href: "https://bgm.tv/calendar"},
        ]}},
    );
    const root = renderHomeModuleView(dom.window.document, view, {onItem: (item) => calls.push(item.href)});
    assert.equal(view.viewType, "media");
    assert.equal(root.querySelectorAll(".sw__home-media-item").length, 2);
    assert.equal(root.querySelectorAll(".sw__home-media-cover").length, 1);
    assert.equal(root.querySelectorAll(".sw__home-media-item.is-source").length, 1);
    root.querySelector(".sw__home-media-action").click();
    assert.deepEqual(calls, ["https://bgm.tv/subject/101"]);
});

test("media covers are lazy, async, and referrer-free", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView({moduleId: "media", title: "Media", viewType: "media"}, {snapshot: {items: [
        {label: "A", image: "https://lain.bgm.tv/pic/cover/l/a.jpg"},
    ]}});
    const image = renderHomeModuleView(dom.window.document, view, {}).querySelector("img");
    assert.equal(image.loading, "lazy");
    assert.equal(image.decoding, "async");
    assert.equal(image.referrerPolicy, "no-referrer");
    assert.equal(image.alt, "");
});

test("home view strips untrusted media covers", () => {
    const view = buildHomeModuleView({moduleId: "media", title: "Media", viewType: "media"}, {snapshot: {items: [
        {label: "A", image: "https://example.com/a.jpg"},
        {label: "B", image: "http://lain.bgm.tv/pic/cover/l/b.jpg"},
    ]}});
    assert.equal(view.items.every((item) => !item.image), true);
});

test("home view strips executable item links", () => {
    const view = buildHomeModuleView({moduleId: "unsafe", title: "Unsafe"}, {ok: true, snapshot: {items: [
        {label: "unsafe", href: "javascript:alert(1)"},
        {label: "safe", href: "https://example.com"},
    ]}});
    assert.equal(view.items[0].href, "");
    assert.equal(view.items[1].href, "https://example.com");
});
test("home view loading state includes a bounded static-safe skeleton", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView({moduleId: "loading", title: "Loading"}, {loading: true});
    const root = renderHomeModuleView(dom.window.document, view, {});
    const skeleton = root.querySelector(".sw__home-loading-skeleton");
    assert.ok(skeleton);
    assert.equal(skeleton.getAttribute("aria-hidden"), "true");
    assert.equal(skeleton.querySelectorAll(".sw__home-loading-skeleton-line").length, 3);
});
test("home view empty and error states expose stable status hooks", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const empty = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "empty", title: "Empty"}, {ok: true, snapshot: {items: []}}));
    const failure = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "error", title: "Error"}, {ok: false, reason: "failed"}));
    assert.ok(empty.querySelector(".sw__home-module-status--empty"));
    assert.ok(failure.querySelector(".sw__home-module-status--error"));
    assert.equal(empty.querySelector(".sw__home-module-status").getAttribute("aria-live"), "polite");
    assert.equal(failure.querySelector(".sw__home-module-status").getAttribute("aria-live"), "assertive");
});
test("home view exposes bounded calendar navigation controls", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const calls = [];
    const view = buildHomeModuleView({moduleId: "journal-calendar", title: "Calendar", viewType: "calendar"}, {
        ok: true, snapshot: {items: [{label: "1", value: ""}]},
    });
    const root = renderHomeModuleView(dom.window.document, view, {
        labels: {previousMonth: "上月", today: "今天", nextMonth: "下月"},
        onCalendarNavigate: (direction) => calls.push(direction),
    });
    const controls = root.querySelectorAll(".sw__home-module-body button");
    assert.equal(controls.length, 3);
    assert.equal([...controls].every((control) => control.type === "button"), true);
    assert.equal(controls[0].getAttribute("aria-label"), "上月");
    controls[0].click();
    controls[1].click();
    controls[2].click();
    assert.deepEqual(calls, [-1, 0, 1]);
});
test("home view renders week row for viewType weekdays", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView(
        {moduleId: "writing-streak", title: "写作打卡", viewType: "weekdays"},
        {ok: true, snapshot: {items: [
            {label: "一", value: "", done: true},
            {label: "二", value: "", done: true},
            {label: "三", value: "", done: false},
        ]}},
    );
    const root = renderHomeModuleView(dom.window.document, view, {});
    assert.ok(root, "rendered");
    const row = root.querySelector(".sw__home-weekdays");
    assert.ok(row, "week row present");
    assert.equal(row.querySelectorAll(".sw__home-weekday").length, 3);
    assert.equal(row.querySelectorAll(".sw__home-weekday.is-done").length, 2);
});

test("home view renders bounded stat arc with progress semantics", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView({moduleId: "year-progress", title: "Year"}, {
        ok: true,
        snapshot: {stat: {value: "50%", label: "2026", arc: {value: 183, max: 366}}},
    });
    assert.deepEqual(view.stat.arc, {value: 183, max: 366});
    const root = renderHomeModuleView(dom.window.document, view, {});
    const arc = root.querySelector(".sw__home-stat-arc");
    assert.ok(arc, "arc should render");
    assert.equal(arc.getAttribute("role"), "progressbar");
    assert.equal(arc.getAttribute("aria-valuenow"), "50");
    assert.equal(arc.querySelector(".sw__home-stat-arc-fill").getAttribute("stroke-dasharray"), "50 50");

    const clamped = buildHomeModuleView({moduleId: "bad-arc", title: "Bad"}, {
        snapshot: {stat: {value: "x", label: "Bad", arc: {value: 99, max: 0}}},
    });
    assert.equal(clamped.stat.arc, undefined);
});
test("home view renders safe symbol and text icon fallbacks", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const symbol = renderModuleIcon(dom.window.document, "iconCalendar");
    assert.equal(symbol.tagName.toLowerCase(), "svg");
    assert.equal(symbol.querySelector("use").getAttribute("href"), "#iconCalendar");
    const emoji = renderModuleIcon(dom.window.document, "✓");
    assert.equal(emoji.textContent, "✓");
    assert.equal(emoji.classList.contains("sw__home-module-icon--text"), true);
    assert.equal(renderModuleIcon(dom.window.document, "javascript:alert(1)"), null);
    const view = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "icon", title: "Icon", icon: "iconCheck"}, {snapshot: {items: []}}));
    assert.equal(view.querySelector(".sw__home-module-icon use").getAttribute("xlink:href"), "#iconCheck");
});

test("home view exposes bounded cache and update metadata", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    assert.notEqual(formatUpdatedAt(Date.now()), "");
    assert.equal(formatUpdatedAt(0), "");
    assert.equal(formatUpdatedAt("invalid"), "");
    const view = renderHomeModuleView(dom.window.document, buildHomeModuleView({moduleId: "meta", title: "Meta"}, {
        ok: true,
        cached: true,
        snapshot: {updatedAt: Date.now(), items: []},
    }));
    const meta = view.querySelector(".sw__home-module-meta");
    assert.ok(meta);
    assert.match(meta.textContent, /缓存/);
    assert.match(meta.textContent, /更新/);
    assert.equal(meta.getAttribute("aria-label"), meta.textContent);
});


test("home view renders task checkboxes and forwards toggles", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const doc = dom.window.document;
    const calls = [];
    const view = buildHomeModuleView({moduleId: "tasks", title: "Tasks"}, {ok: true, snapshot: {items: [
        {label: "Open task", value: "1", done: false},
        {label: "Plain item", value: "2"},
    ]}});
    const root = renderHomeModuleView(doc, view, {
        onItem: (item) => calls.push("item:" + item.value),
        onToggleItem: (item) => calls.push("toggle:" + item.value),
    });
    const checks = root.querySelectorAll(".sw__home-module-item-check");
    assert.equal(checks.length, 1); // 仅带 done 的条目有勾选框
    assert.equal(checks[0].getAttribute("aria-pressed"), "false");
    checks[0].click();
    const plain = root.querySelectorAll(".sw__home-module-item-action")[1];
    plain.click();
    assert.deepEqual(calls, ["toggle:1", "item:2"]);
});

test("home view done items render strikethrough style hooks", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const view = buildHomeModuleView({moduleId: "tasks", title: "T"}, {ok: true, snapshot: {items: [{label: "Done task", done: true}]}});
    const root = renderHomeModuleView(dom.window.document, view, {});
    assert.equal(root.querySelectorAll(".sw__home-module-item-action.is-done").length, 1);
});


test("home view renders config button only for configurable widgets", () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    const doc = dom.window.document;
    const calls = [];
    const configurable = buildHomeModuleView({
        moduleId: "fixed-document", title: "Pinned",
        configSchema: [{key: "docId", label: "Doc", type: "text"}],
    }, {ok: true, snapshot: {items: []}});
    assert.equal(configurable.configurable, true);
    const root = renderHomeModuleView(doc, configurable, {
        onConfig: () => calls.push("config"),
    });
    const button = root.querySelector(".sw__home-module-toggle");
    assert.ok(button, "config button should render");
    button.click();
    assert.deepEqual(calls, ["config"]);

    // 无 configSchema 的组件不渲染配置按钮
    const plainView = buildHomeModuleView({moduleId: "plain", title: "Plain"}, {ok: true, snapshot: {items: []}});
    assert.equal(plainView.configurable, false);
    const plainRoot = renderHomeModuleView(doc, plainView, {onConfig: () => calls.push("bad")});
    assert.equal(plainRoot.querySelectorAll(".sw__home-module-toggle").length, 0);
});
