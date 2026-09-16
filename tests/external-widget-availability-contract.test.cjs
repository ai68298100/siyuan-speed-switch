const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const {readSourceText}=require("./source-scan.cjs");
const source = readSourceText("src/index.ts");
const network = readSourceText("src/life-widget-network.js");
const model = readSourceText("src/life-widget-model.js");
const guide = fs.readFileSync(path.join(root, "docs", "component-store-guide.md"), "utf8");

// 2026-09-16（T-6280 / D-396 第二十批）：8 条「模块标记 → 后方某处」的 TS 窗口改「锚定模块 + 有界窗口」
// （实测各 adapter 标记到 abort/retry 距离 1034~1626 字符，窗长 2200 覆盖且不越界）；
// TS 源码读取改走 readSourceText。
const adapters = readSourceText("src/home-external-adapters.ts");
const ABORT_SNIPPET = "if (error?.message === \"aborted\") throw error;";
const adapterWindow = (marker) => { const i = adapters.indexOf(marker); return adapters.slice(i, i + 2200); };

test("life proxy accepts the shared URL allowlist", () => assert.match(source, /allowedActivityWatchUrl\(url\) && !allowedLifeWidgetUrl\(url\)/));
test("life proxy keeps blocked endpoints rejected", () => assert.match(source, /throw new Error\("blocked_endpoint"\)/));
test("life proxy uses the SiYuan forward endpoint", () => assert.match(source, /fetch\("\/api\/network\/forwardProxy"/));
test("life proxy uses POST for ActivityWatch", () => assert.match(source, /method: isPost \? "POST" : "GET"/));
test("life proxy can use GET for public life APIs", () => assert.match(source, /method: isPost \? "POST" : "GET"/));
test("life proxy bounds timeout", () => assert.match(source, /timeout: 8000/));
test("life proxy requests JSON", () => assert.match(source, /headers: \[\{Accept: "application\/json"\}\]/));
test("life proxy preserves POST payload", () => assert.match(source, /proxyBody\.payload = init\.body/));
test("life proxy marks payload encoding", () => assert.match(source, /proxyBody\.payloadEncoding = "text"/));
test("life proxy parses kernel envelope", () => assert.match(source, /envelope\?\.code === 0/));
test("life proxy validates upstream status", () => assert.match(source, /status >= 200 && status < 300/));
test("life proxy returns bounded body text", () => assert.match(source, /const body = typeof data\?\.body === "string"/));

test("weather adapter uses the proxy fetcher", () => assert.match(adapters, /loadWeatherLocation\(geocodingUrl, \{signal: context\?\.signal, fetchImpl:/));
test("weather forecast uses the proxy fetcher", () => assert.match(adapters, /loadWeatherForecast\(forecastUrl, \{signal: context\?\.signal, fetchImpl:/));
test("weather keeps configuration empty state", () => assert.match(adapters, /homeWeatherConfigHint, items: \[\]\}/));
test("weather keeps city-not-found empty state", () => assert.match(adapters, /homeWeatherCityNotFound, items: \[\]\}/));
test("weather catches unavailable errors", () => assert.match(adapters, /return \{emptyHint: `\$\{this\.i18n\.homeModuleError\} · \$\{this\.i18n\.homeRetry\}`, items: \[\]\};/));
test("weather preserves abort semantics", () => assert.match(adapters, /if \(error\?\.message === "aborted"\) throw error;/));

test("Bangumi uses the proxy fetcher", () => assert.match(adapters, /loadBangumiCalendar\(\{signal: context\?\.signal, fetchImpl:/));
test("Bangumi keeps empty schedule state", () => assert.match(adapters, /homeBangumiEmpty, items: \[\], updatedAt/));
test("Bangumi catches unavailable errors", () => assert.match(adapters, /homeBangumiEmpty\} · \$\{this\.i18n\.homeRetry/));
test("Bangumi preserves abort semantics", () => assert.ok(adapterWindow("external-anime-bangumi").includes(ABORT_SNIPPET), "aborted 语义须保留"));
test("Bangumi remains a schedule, not recommendation", () => assert.match(guide, /不是个性化推荐/));

test("ActivityWatch uses the proxy fetcher", () => assert.match(adapters, /fetchImpl: \(url: string, init: \{body\?: string\}\) => this\.fetchActivityWatchViaKernel/));
test("ActivityWatch preserves configuration empty state", () => assert.match(adapters, /homeActivityWatchConfigHint, items: \[\]\}/));
test("ActivityWatch catches unavailable errors", () => assert.match(adapters, /homeActivityWatchConfigHint\} · \$\{this\.i18n\.homeRetry/));
test("ActivityWatch keeps abort semantics", () => assert.ok(adapterWindow("external-activitywatch-time").includes(ABORT_SNIPPET), "aborted 语义须保留"));
test("ActivityWatch remains loopback constrained", () => assert.match(network, /allowedActivityWatchUrl/));
test("ActivityWatch guide explains local startup", () => assert.match(guide, /127\.0\.0\.1:5600/));

test("feed configuration remains opt-in", () => assert.match(adapters, /if \(!endpoint\) return \{emptyHint: this\.i18n\.homeFeedConfigHint/));
test("feed loader retains stale cache behavior", () => assert.match(network, /if \(cached\) return \{payload: cached\.value, status: "stale"/));
test("feed guide documents endpoint setup", () => assert.match(guide, /需要填写你信任的自建/));
test("network guide documents no notebook egress", () => assert.match(guide, /不发送笔记内容/));
test("network guide documents bounded cache", () => assert.match(guide, /30 分钟缓存/));
test("network guide documents retry action", () => assert.match(guide, /重试入口/));

test("model exposes weather allowlist path", () => assert.match(model, /buildWeatherGeocodingUrl/));
test("model exposes Bangumi normalization", () => assert.match(model, /buildBangumiSnapshot/));
test("model exposes ActivityWatch normalization", () => assert.match(model, /buildActivityWatchSnapshot/));
test("network code keeps response size bound", () => assert.match(network, /MAX_RESPONSE_BYTES = 128 \* 1024/));
test("network code keeps cache capacity bound", () => assert.match(network, /responseCache\.size > 16/));
test("network code disables redirects", () => assert.match(network, /redirect: "error"/));
test("network code keeps cancellation signal", () => assert.match(network, /externalSignal\?\.addEventListener/));
test("network code cleans cancellation listener", () => assert.match(network, /externalSignal\?\.removeEventListener/));
test("network code isolates malformed JSON", () => assert.match(network, /throw new Error\("invalid_json"\)/));

test("Uptime Kuma uses the proxy fetcher", () => assert.match(adapters, /loadUptimeKumaPage\(statusUrl, normalized\.slug, false, \{signal: context\?\.signal, fetchImpl\}\)/));
test("Uptime Kuma loads the heartbeat page through the same gate", () => assert.match(adapters, /loadUptimeKumaPage\(heartbeatUrl, normalized\.slug, true, \{signal: context\?\.signal, fetchImpl\}\)/));
test("Uptime Kuma preserves configuration empty state", () => assert.match(adapters, /homeUptimeKumaConfigHint, items: \[\]\}/));
test("Uptime Kuma catches unavailable errors", () => assert.ok(adapterWindow("external-status-uptimekuma").includes("homeFeedEmpty} · ${this.i18n.homeRetry"), "不可用错误须有重试提示"));
test("Uptime Kuma keeps abort semantics", () => assert.ok(adapterWindow("external-status-uptimekuma").includes(ABORT_SNIPPET), "aborted 语义须保留"));
test("Uptime Kuma stays known-route constrained", () => assert.match(network, /\/api\/status-page\/\$\{heartbeat \? "heartbeat\/" : ""\}\$\{slug\}/));

test("Frankfurter uses the proxy fetcher", () => assert.match(adapters, /loadFrankfurterRates\(url, \{[\s\S]{0,120}fetchImpl: \(reqUrl: string, init: \{body\?: string\}\) => this\.fetchActivityWatchViaKernel/));
test("Frankfurter preserves configuration empty state", () => assert.match(adapters, /if \(!url\) return \{emptyHint: this\.i18n\.homeFxEmpty, items: \[\]\}\;/));
test("Frankfurter catches unavailable errors", () => assert.ok(adapterWindow("external-fx-frankfurter").includes("homeFxEmpty} · ${this.i18n.homeRetry"), "不可用错误须有重试提示"));
test("Frankfurter keeps abort semantics", () => assert.ok(adapterWindow("external-fx-frankfurter").includes(ABORT_SNIPPET), "aborted 语义须保留"));
test("Frankfurter stays host and parameter allowlisted", () => assert.match(network, /api\.frankfurter\.dev/));
test("Frankfurter snapshot labels itself as reference", () => assert.match(model, /参考汇率/));

test("Miniflux uses the proxy fetcher", () => assert.match(adapters, /loadMinifluxEntries\(url, normalized\.token, \{[\s\S]{0,120}fetchImpl: \(reqUrl: string, init: \{body\?: string; headers\?: Record<string, string>\}\) => this\.fetchActivityWatchViaKernel/));
test("Miniflux preserves configuration empty state", () => assert.match(adapters, /if \(!url \|\| !normalized\.token\) return \{emptyHint: this\.i18n\.homeMinifluxConfigHint, items: \[\]\}\;/));
test("Miniflux catches unavailable errors", () => assert.ok(adapterWindow("external-rss-miniflux").includes("homeMinifluxEmpty} · ${this.i18n.homeRetry"), "不可用错误须有重试提示"));
test("Miniflux keeps abort semantics", () => assert.ok(adapterWindow("external-rss-miniflux").includes(ABORT_SNIPPET), "aborted 语义须保留"));
test("Miniflux stays known-route constrained", () => assert.match(network, /\/v1\/entries/));
test("Miniflux token never enters the request URL", () => {
    assert.match(network, /X-Auth-Token/);
    assert.doesNotMatch(network, /token[^;\n]*[`'"]\s*\+/);
});
test("Miniflux token is sanitized before use", () => assert.match(model, /normalizeMinifluxToken/));
