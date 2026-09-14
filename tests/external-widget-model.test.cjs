const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/external-widget-model.js");

test("external catalog registers nine researched candidates", () => assert.equal(model.EXTERNAL_WIDGET_CATALOG.length, 9));
test("external catalog module ids are unique", () => {
    const ids = model.EXTERNAL_WIDGET_CATALOG.map((entry) => entry.moduleId);
    assert.equal(new Set(ids).size, ids.length);
});
test("external catalog root is immutable", () => assert.equal(Object.isFrozen(model.EXTERNAL_WIDGET_CATALOG), true));
test("external catalog entries are immutable", () => assert.ok(model.EXTERNAL_WIDGET_CATALOG.every(Object.isFrozen)));
test("external catalog platform arrays are immutable", () => assert.ok(model.EXTERNAL_WIDGET_CATALOG.every((entry) => Object.isFrozen(entry.platforms))));
test("external catalog size arrays are immutable", () => assert.ok(model.EXTERNAL_WIDGET_CATALOG.every((entry) => Object.isFrozen(entry.sizes))));
test("external categories remain fixed", () => assert.deepEqual(model.EXTERNAL_WIDGET_CATEGORIES, ["time", "weather", "trending", "holiday", "media", "activity"]));
test("external availability separates direct, setup, bridge and reference", () => assert.deepEqual(model.EXTERNAL_WIDGET_AVAILABILITY, ["builtin", "external", "conditional", "bridge", "reference"]));
test("external auth modes remain bounded", () => assert.deepEqual(model.EXTERNAL_WIDGET_AUTH, ["none", "api-key", "user-endpoint", "local-service"]));
test("external placements omit unsupported generic tablet", () => assert.equal(model.EXTERNAL_WIDGET_PLATFORMS.includes("tablet"), false));
test("external integrations remain bounded", () => assert.deepEqual(model.EXTERNAL_WIDGET_INTEGRATIONS, ["direct", "http", "local-bridge", "reference"]));

test("local time is available without network", () => {
    const item = model.findExternalWidget("external-local-time");
    assert.equal(item.availability, "builtin");
    assert.equal(item.auth, "none");
    assert.equal(item.privacy, "local-only");
});
test("Open-Meteo weather requires no API key", () => {
    const item = model.findExternalWidget("external-weather-open-meteo");
    assert.equal(item.auth, "none");
    assert.equal(item.integration, "http");
});
test("weather declares location-only privacy", () => assert.equal(model.findExternalWidget("external-weather-open-meteo").privacy, "location-only"));
test("DailyHot recommends a user endpoint", () => assert.equal(model.findExternalWidget("external-hot-news-dailyhot").auth, "user-endpoint"));
test("NewsNow recommends a user endpoint", () => assert.equal(model.findExternalWidget("external-news-newsnow").auth, "user-endpoint"));
test("holiday data requires no credentials", () => assert.equal(model.findExternalWidget("external-holiday-cn").auth, "none"));
test("TMDB is gated by an API key", () => assert.equal(model.findExternalWidget("external-movie-tmdb").auth, "api-key"));
test("Bangumi is available on all three plugin surfaces", () => assert.deepEqual(model.findExternalWidget("external-anime-bangumi").platforms, ["desktop", "sidebar", "mobile"]));
test("Bangumi is honestly labeled as a schedule", () => assert.equal(model.findExternalWidget("external-anime-bangumi").title, "每日放送"));
test("Bangumi catalog does not claim personalization", () => assert.match(model.findExternalWidget("external-anime-bangumi").description, /不宣称个性化推荐/));
test("ActivityWatch is local-service only", () => assert.equal(model.findExternalWidget("external-activitywatch-time").auth, "local-service"));
test("ActivityWatch does not claim mobile support", () => assert.equal(model.findExternalWidget("external-activitywatch-time").platforms.includes("mobile"), false));
test("native active-window probe remains reference only", () => assert.equal(model.findExternalWidget("external-active-window").availability, "reference"));

test("category normalizer keeps weather", () => assert.equal(model.normalizeExternalWidgetCategory("weather"), "weather"));
test("category normalizer safely falls back", () => assert.equal(model.normalizeExternalWidgetCategory("unknown"), "time"));
test("availability normalizer keeps bridge", () => assert.equal(model.normalizeExternalWidgetAvailability("bridge"), "bridge"));
test("availability normalizer never makes unknown sources ready", () => assert.equal(model.normalizeExternalWidgetAvailability("ready"), "reference"));
test("auth normalizer keeps api-key", () => assert.equal(model.normalizeExternalWidgetAuth("api-key"), "api-key"));
test("auth normalizer safely falls back", () => assert.equal(model.normalizeExternalWidgetAuth("oauth"), "none"));
test("integration normalizer keeps local bridge", () => assert.equal(model.normalizeExternalWidgetIntegration("local-bridge"), "local-bridge"));
test("integration normalizer safely falls back to reference", () => assert.equal(model.normalizeExternalWidgetIntegration("native"), "reference"));
test("platform normalizer deduplicates and filters", () => assert.deepEqual(model.normalizeExternalWidgetPlatforms(["desktop", "desktop", "tablet", "mobile"]), ["desktop", "mobile"]));
test("platform normalizer rejects malformed input", () => assert.deepEqual(model.normalizeExternalWidgetPlatforms("desktop"), []));
test("entry normalizer strips control characters", () => assert.equal(model.normalizeExternalWidget({title: " A\nB "}).title, "A B"));
test("entry normalizer bounds module ids", () => assert.equal(model.normalizeExternalWidget({moduleId: "x".repeat(200)}).moduleId.length, 96));
test("entry normalizer deduplicates sizes", () => assert.deepEqual(model.normalizeExternalWidget({sizes: ["small", "small", "medium"]}).sizes, ["small", "medium"]));
test("entry normalizer caps size declarations", () => assert.equal(model.normalizeExternalWidget({sizes: Array.from({length: 20}, (_, index) => `s${index}`)}).sizes.length, 8));

test("catalog listing returns defensive objects", () => {
    const listed = model.listExternalWidgetCatalog();
    listed[0].title = "changed";
    assert.notEqual(model.EXTERNAL_WIDGET_CATALOG[0].title, "changed");
});
test("catalog lookup returns null for unknown ids", () => assert.equal(model.findExternalWidget("missing"), null));
test("catalog lookup rejects malformed ids", () => assert.equal(model.findExternalWidget({}), null));
test("query filter matches provider names", () => assert.equal(model.filterExternalWidgets(model.EXTERNAL_WIDGET_CATALOG, {query: "Open-Meteo"}).length, 1));
test("query filter is case insensitive", () => assert.equal(model.filterExternalWidgets(model.EXTERNAL_WIDGET_CATALOG, {query: "TMDB"}).length, 1));
test("category filter selects media candidates", () => assert.equal(model.filterExternalWidgets(model.EXTERNAL_WIDGET_CATALOG, {category: "media"}).length, 2));
test("availability filter selects conditional candidates", () => assert.equal(model.filterExternalWidgets(model.EXTERNAL_WIDGET_CATALOG, {availability: "conditional"}).length, 1));
test("platform filter excludes desktop-only candidates on mobile", () => assert.equal(model.filterExternalWidgets(model.EXTERNAL_WIDGET_CATALOG, {platform: "mobile"}).some((entry) => entry.moduleId === "external-active-window"), false));
test("malformed filter input returns empty", () => assert.deepEqual(model.filterExternalWidgets(null, {query: "time"}), []));

test("catalog summary reports all availability classes", () => assert.deepEqual(model.summarizeExternalWidgets(), {
    total: 9, builtin: 1, external: 5, conditional: 1, bridge: 1, reference: 1, needsConfiguration: 5,
}));
test("catalog summary handles malformed input", () => assert.deepEqual(model.summarizeExternalWidgets(null), {
    total: 0, builtin: 0, external: 0, conditional: 0, bridge: 0, reference: 0, needsConfiguration: 0,
}));
test("catalog grouping exposes six semantic groups", () => assert.equal(model.groupExternalWidgets().size, 6));
test("catalog grouping keeps two media providers", () => assert.equal(model.groupExternalWidgets().get("media").length, 2));

test("builtin widgets can be added immediately", () => assert.deepEqual(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-local-time")), {
    moduleId: "external-local-time", status: "builtin", canAdd: true, requiresSetup: false,
}));
test("credential widgets require setup by default", () => assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-movie-tmdb")).status, "needs-config"));
test("configured credential widgets become ready", () => assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-movie-tmdb"), {configured: true}).status, "ready"));
test("local bridges require their service by default", () => assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-activitywatch-time")).status, "needs-local-service"));
test("available local bridges become ready", () => assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-activitywatch-time"), {endpointAvailable: true}).status, "ready"));
test("reference candidates can never be added", () => assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-active-window")).canAdd, false));
test("production feed widgets can be added before endpoint setup", () => {
    assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-hot-news-dailyhot")).canAdd, true);
    assert.equal(model.resolveExternalWidgetStoreState(model.findExternalWidget("external-news-newsnow")).canAdd, true);
});
test("NewsNow catalog points to the maintained source repository", () => assert.equal(model.findExternalWidget("external-news-newsnow").sourceUrl, "https://github.com/ourongxing/newsnow"));

test("production registers the offline local clock adapter", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    assert.match(source, /register\("external-local-time"/);
    assert.match(source, /buildLocalTimeSnapshot/);
});
test("production clock refreshes on a single minute heartbeat", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    assert.match(source, /moduleId === "external-local-time"/);
    assert.match(source, /millisecondsToNextMinute/);
    assert.match(source, /document\.visibilityState !== "hidden"/);
});
test("production clock heartbeat is disposed with the panel", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    assert.match(source, /window\.clearTimeout\(homeClockTimer\)/);
    assert.match(source, /removeEventListener\("visibilitychange"/);
});
test("production registers and caches the Bangumi schedule adapter", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    assert.match(source, /register\("external-anime-bangumi"/);
    assert.match(source, /loadBangumiCalendar/);
    assert.match(source, /cacheTtlMs: 30 \* 60 \* 1000/);
});
test("production registers user-endpoint feed adapters without default URLs", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    assert.match(source, /registerExternalFeed\("external-hot-news-dailyhot"/);
    assert.match(source, /registerExternalFeed\("external-news-newsnow"/);
    assert.match(source, /normalizeConfiguredFeedUrl/);
    assert.match(source, /loadConfiguredFeed/);
});
