const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "index.scss"), "utf8");
const source = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");
const store = require(path.join(root, "src", "home-store-model.js"));
const life = require(path.join(root, "src", "life-widget-model.js"));
const network = require(path.join(root, "src", "life-widget-network.js"));

const card = (overrides = {}) => ({
    moduleId: "demo-widget",
    search: "demo widget",
    category: "builtin",
    availability: "ready",
    integration: "offline",
    added: false,
    ...overrides,
});

test("mobile store uses a dedicated breakpoint", () => assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.sw-home-store/));
test("mobile store grid is single column", () => assert.match(css, /\.sw-home-store__grid \{ grid-template-columns: minmax\(0, 1fr\)/));
test("mobile store grid has a bounded gap", () => assert.match(css, /\.sw-home-store__grid \{[^}]*gap: 10px/));
test("mobile cards fill the available row", () => assert.match(css, /\.sw-home-store__card \{ width: 100%; max-width: 100%/));
test("mobile cards keep compact padding", () => assert.match(css, /\.sw-home-store__card \{[^}]*padding: 11px 12px/));
test("mobile previews cannot overflow the card", () => assert.match(css, /\.sw-home-store__preview \{ max-width: 100%; overflow: hidden/));
test("mobile tabs scroll horizontally", () => assert.match(css, /\.sw-home-store__tabs \{ overflow-x: auto/));
test("mobile tabs preserve touch scrolling", () => assert.match(css, /\.sw-home-store__tabs \{[^}]*-webkit-overflow-scrolling: touch/));
test("mobile tabs do not shrink labels", () => assert.match(css, /\.sw-home-store__tab \{ flex: 0 0 auto/));
test("mobile search row wraps controls", () => assert.match(css, /\.sw-home-store__search \{ flex-wrap: wrap/));
test("mobile search input can shrink", () => assert.match(css, /\.sw-home-store__search input \{ flex: 1 1 calc\(100% - 40px\); min-width: 0/));
test("mobile sort control shares a full-width row", () => assert.match(css, /\.sw-home-store__search \.sw-home-store__sort,[\s\S]*?flex: 1 1 calc\(50% - 4px\)/));
test("mobile guide control shares a full-width row", () => assert.match(css, /\.sw-home-store__guide \{ flex: 1 1 calc\(50% - 4px\)/));
test("mobile filter empty text wraps anywhere", () => assert.match(css, /\.sw-home-store__filter-empty \{ overflow-wrap: anywhere/));
test("reduced motion keeps mobile cards contained", () => assert.match(css, /@media \(max-width: 560px\) and \(prefers-reduced-motion: reduce\)[\s\S]*?contain: layout/));
test("mobile reduced motion keeps cards visible", () => assert.match(css, /@media \(max-width: 560px\) and \(prefers-reduced-motion: reduce\)[\s\S]*?content-visibility: visible/));

test("external cards are recognized by the model", () => assert.equal(store.isHomeStoreExternal(card({availability: "external"})), true));
test("external cards use an informational status tone", () => assert.equal(store.resolveHomeStoreStatusTone(card({availability: "external"})), "info"));
test("external cards use network integration tone", () => assert.equal(store.resolveHomeStoreIntegrationTone(card({availability: "external", integration: "network"})), "network"));
test("external cards cannot use the add action", () => assert.equal(store.isHomeStoreActionEnabled("add", card({availability: "external"})), false));
test("external cards still expose preview action", () => assert.equal(store.isHomeStoreActionEnabled("preview", card({availability: "external"})), true));
test("added cards expose configure action", () => assert.equal(store.isHomeStoreActionEnabled("configure", card({added: true})), true));
test("unadded cards do not expose configure action", () => assert.equal(store.isHomeStoreActionEnabled("configure", card()), false));
test("added cards expose remove action", () => assert.equal(store.isHomeStoreActionEnabled("remove", card({added: true})), true));
test("unadded cards do not expose remove action", () => assert.equal(store.isHomeStoreActionEnabled("remove", card()), false));
test("action order keeps add before preview", () => assert.deepEqual(store.listHomeStoreActionOrder(card()), ["add", "preview"]));
test("action order keeps configure before preview", () => assert.deepEqual(store.listHomeStoreActionOrder(card({added: true})), ["configure", "preview", "remove"]));
test("external status priority remains discoverable", () => assert.equal(store.resolveHomeStoreActionPriority(card({availability: "external"})), 0));
test("conditional unadded cards receive setup priority", () => assert.equal(store.resolveHomeStoreActionPriority(card({availability: "conditional"})), 2));
test("added conditional cards receive configure priority", () => assert.equal(store.resolveHomeStoreActionPriority(card({availability: "conditional", added: true})), 1));
test("source summary labels network integration", () => assert.equal(store.buildHomeStoreSourceSummary(card({integration: "network"}), {source: "天气", network: "联网"}), "天气 · 联网"));
test("source summary labels local integration", () => assert.equal(store.buildHomeStoreSourceSummary(card({integration: "local"}), {source: "ActivityWatch", local: "本机"}), "ActivityWatch · 本机"));
test("source summary labels offline integration", () => assert.equal(store.buildHomeStoreSourceSummary(card(), {source: "思源", offline: "离线"}), "思源 · 离线"));
test("source summary never leaks an unknown integration", () => assert.equal(store.buildHomeStoreSourceSummary(card({integration: "unknown"}), {source: "来源", unknown: "未知"}), "来源 · 未知"));
test("source labels are bounded", () => assert.equal(store.normalizeHomeStoreSourceLabel("x".repeat(200)).length, 64));
test("status labels are bounded", () => assert.equal(store.normalizeHomeStoreStatusLabel("x".repeat(200)).length, 64));
test("action labels include a normalized title", () => assert.match(store.resolveHomeStoreButtonLabel("preview", card({search: "天气"}), {preview: "查看"}), /^查看 · 天气$/));
test("unknown action labels have a safe fallback", () => assert.match(store.resolveHomeStoreButtonLabel("unknown", card({search: "天气"}), {}), /^操作 · 天气$/));
test("action set reports disabled external add", () => assert.equal(store.buildHomeStoreActionSet(card({availability: "external"}), {add: "添加", preview: "预览"}).find((item) => item.action === "add").enabled, false));

test("preview marks integration metadata in the DOM contract", () => assert.match(source, /container\.dataset\.integration = sourceInfo\?\.integration \|\| "direct"/));
test("preview marks privacy metadata in the DOM contract", () => assert.match(source, /container\.dataset\.privacy = sourceInfo\?\.privacy \|\| "none"/));
test("preview exposes a source chip", () => assert.match(source, /addMeta\(this\.i18n\.homeStoreSource\.replace\("\{source\}"/));
test("preview exposes a network chip tone", () => assert.match(source, /sourceInfo\?\.integration === "http" \? "network"/));
test("preview exposes a local bridge chip tone", () => assert.match(source, /sourceInfo\?\.integration === "local-bridge" \? "local"/));
test("preview exposes privacy chip metadata", () => assert.match(source, /addMeta\(privacy, "privacy"\)/));
test("preview body is keyboard focusable", () => assert.match(source, /body\.tabIndex = 0/));
test("preview body points to metadata", () => assert.match(source, /body\.setAttribute\("aria-describedby", meta\.id\)/));
test("guide link opens safely in a new tab", () => assert.match(source, /link\.target = "_blank";[\s\S]*?link\.rel = "noopener noreferrer"/));
test("mobile preview width stays viewport bounded", () => assert.match(source, /width: this\.isMobile \? "min\(420px, 92vw\)"/));

test("weather provider is location-only", () => assert.equal(store.resolveHomeStoreSourceInfo("external-weather-open-meteo").privacy, "location-only"));
test("Bangumi provider is endpoint-only in the model", () => assert.equal(store.resolveHomeStoreSourceInfo("external-anime-bangumi").integration, "http"));
test("ActivityWatch provider is local-only", () => assert.equal(store.resolveHomeStoreSourceInfo("external-activitywatch-time").privacy, "local-only"));
test("weather URL allowlist rejects plain HTTP", () => assert.equal(network.allowedLifeWidgetUrl("http://api.open-meteo.com/v1/forecast?x=1"), false));
test("weather URL allowlist accepts canonical HTTPS endpoint", () => assert.equal(network.allowedLifeWidgetUrl("https://api.open-meteo.com/v1/forecast?x=1"), true));
test("holiday URL allowlist requires a four-digit year", () => assert.equal(network.allowedLifeWidgetUrl("https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/2026.json"), true));
test("holiday URL allowlist rejects query strings", () => assert.equal(network.allowedLifeWidgetUrl("https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/2026.json?x=1"), false));
test("ActivityWatch allowlist is loopback-only", () => assert.equal(network.allowedActivityWatchUrl("http://localhost:5600/api/0/query/"), true));
test("ActivityWatch allowlist rejects public hosts", () => assert.equal(network.allowedActivityWatchUrl("https://example.com/api/0/query/"), false));
test("configured feed allowlist rejects credentials", () => assert.equal(network.allowedConfiguredFeedUrl("https://user:pass@example.com/api/s?id=weibo"), false));
test("configured feed allowlist accepts local daily route", () => assert.equal(network.allowedConfiguredFeedUrl("http://127.0.0.1:8080/api/weibo"), true));
test("weather config does not infer device location", () => assert.equal(life.normalizeWeatherConfig({}).city, ""));
test("weather config bounds forecast days", () => assert.equal(life.normalizeWeatherConfig({forecastDays: 99}).forecastDays, 5));
test("Bangumi config bounds result count", () => assert.equal(life.normalizeBangumiConfig({limit: 99}).limit, 12));
test("ActivityWatch config rejects a public endpoint", () => assert.equal(life.normalizeActivityWatchConfig({endpoint: "https://example.com"}).endpoint, ""));
