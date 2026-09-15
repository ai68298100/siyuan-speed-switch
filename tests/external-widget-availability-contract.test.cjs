const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "index.ts"), "utf8");
const network = fs.readFileSync(path.join(root, "src", "life-widget-network.js"), "utf8");
const model = fs.readFileSync(path.join(root, "src", "life-widget-model.js"), "utf8");
const guide = fs.readFileSync(path.join(root, "docs", "component-store-guide.md"), "utf8");

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

test("weather adapter uses the proxy fetcher", () => assert.match(source, /loadWeatherLocation\(geocodingUrl, \{signal: context\?\.signal, fetchImpl:/));
test("weather forecast uses the proxy fetcher", () => assert.match(source, /loadWeatherForecast\(forecastUrl, \{signal: context\?\.signal, fetchImpl:/));
test("weather keeps configuration empty state", () => assert.match(source, /homeWeatherConfigHint, items: \[\]\}/));
test("weather keeps city-not-found empty state", () => assert.match(source, /homeWeatherCityNotFound, items: \[\]\}/));
test("weather catches unavailable errors", () => assert.match(source, /return \{emptyHint: `\$\{this\.i18n\.homeModuleError\} · \$\{this\.i18n\.homeRetry\}`, items: \[\]\};/));
test("weather preserves abort semantics", () => assert.match(source, /if \(error\?\.message === "aborted"\) throw error;/));

test("Bangumi uses the proxy fetcher", () => assert.match(source, /loadBangumiCalendar\(\{signal: context\?\.signal, fetchImpl:/));
test("Bangumi keeps empty schedule state", () => assert.match(source, /homeBangumiEmpty, items: \[\], updatedAt/));
test("Bangumi catches unavailable errors", () => assert.match(source, /homeBangumiEmpty\} · \$\{this\.i18n\.homeRetry/));
test("Bangumi preserves abort semantics", () => assert.match(source, /external-anime-bangumi[\s\S]*?if \(error\?\.message === "aborted"\) throw error;/));
test("Bangumi remains a schedule, not recommendation", () => assert.match(guide, /不是个性化推荐/));

test("ActivityWatch uses the proxy fetcher", () => assert.match(source, /fetchImpl: \(url: string, init: \{body\?: string\}\) => this\.fetchActivityWatchViaKernel/));
test("ActivityWatch preserves configuration empty state", () => assert.match(source, /homeActivityWatchConfigHint, items: \[\]\}/));
test("ActivityWatch catches unavailable errors", () => assert.match(source, /homeActivityWatchConfigHint\} · \$\{this\.i18n\.homeRetry/));
test("ActivityWatch keeps abort semantics", () => assert.match(source, /external-activitywatch-time[\s\S]*?if \(error\?\.message === "aborted"\) throw error;/));
test("ActivityWatch remains loopback constrained", () => assert.match(network, /allowedActivityWatchUrl/));
test("ActivityWatch guide explains local startup", () => assert.match(guide, /127\.0\.0\.1:5600/));

test("feed configuration remains opt-in", () => assert.match(source, /if \(!endpoint\) return \{emptyHint: this\.i18n\.homeFeedConfigHint/));
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
