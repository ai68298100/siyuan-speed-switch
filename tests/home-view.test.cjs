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

test("home view builds a stable accessible module contract", () => {
    const view = buildHomeModuleView({moduleId: "tasks", title: "Tasks", icon: "iconCheck", category: "siyuan"}, {ok: true, snapshot: {items: [{label: "One"}]}}, {collapsed: true});
    assert.deepEqual(view, {
        moduleId: "tasks", title: "Tasks", icon: "iconCheck", category: "siyuan", status: "ready", cached: false,
        reason: "", updatedAt: 0, stat: null, items: [{label: "One", value: "", href: "", command: ""}], configurable: false, collapsed: true,
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
