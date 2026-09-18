"use strict";

const MAX_RESPONSE_BYTES = 128 * 1024;
const WEATHER_TTL_MS = 15 * 60 * 1000;
const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
const HOLIDAY_TTL_MS = 24 * 60 * 60 * 1000;
const BANGUMI_TTL_MS = 30 * 60 * 1000;
const FEED_TTL_MS = 30 * 60 * 1000;
const ACTIVITYWATCH_TTL_MS = 5 * 60 * 1000;
const HACKER_NEWS_TTL_MS = 30 * 60 * 1000;
// Hacker News 榜单族（T-6307）：沿用"字面量端点"策略——协议、主机、路径、查询全部
// 固定，四个榜单各一条字面量，任何参数变化都视为外部端点拒绝；榜单键经白名单校验。
const HACKER_NEWS_BOARDS = Object.freeze({
    front_page: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=12",
    best: "https://hn.algolia.com/api/v1/search?tags=best&hitsPerPage=12",
    ask_hn: "https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=12",
    show_hn: "https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=12",
});
// 固定端点：一次请求拿首页 12 条，条数上限在渲染层按配置截断，避免动态参数进白名单。
const HACKER_NEWS_FRONT_PAGE_URL = HACKER_NEWS_BOARDS.front_page;
const UPTIME_KUMA_TTL_MS = 5 * 60 * 1000;
const FRANKFURTER_TTL_MS = 12 * 60 * 60 * 1000;
const MINIFLUX_TTL_MS = 15 * 60 * 1000;
// 空气质量（T-6308）：固定主机与路径，current 参数只允许模型层的字面字段集；
// 经纬度钳到 4 位小数（与天气同一口径），timezone 固定 auto。30 分钟缓存。
const AIR_QUALITY_TTL_MS = 30 * 60 * 1000;

function allowedAirQualityUrl(value) {
    if (typeof value !== "string" || value.length > 320) return false;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "air-quality-api.open-meteo.com"
            || url.pathname !== "/v1/air-quality" || url.username || url.password || url.hash) return false;
        const entries = [...url.searchParams.entries()];
        if (entries.length !== 4) return false;
        const params = Object.fromEntries(entries);
        if (params.timezone !== "auto") return false;
        // current 字段集由模型层字面量生成（T-6439 增加臭氧/二氧化氮/二氧化硫），
        // 白名单直接做字面等值判定；模型层 CURRENT_FIELDS 与此处必须同步。
        if (params.current !== "european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide") return false;
        return /^-?\d{1,3}\.\d{1,4}$/.test(params.latitude || "") && /^-?\d{1,3}\.\d{1,4}$/.test(params.longitude || "");
    } catch (_) {
        return false;
    }
}

async function loadAirQuality(url, options = {}) {
    if (!allowedAirQualityUrl(url)) throw new Error("blocked_endpoint");
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const key = `airquality:${url}`;
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < AIR_QUALITY_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(url, {...options, isAllowed: (candidate) => allowedAirQualityUrl(candidate)});
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

// iCal 订阅：用户提供的 .ics 地址（https 或 http+本机、无 URL 凭据）；30 分钟缓存，
// 失效回退 stale 缓存。响应是文本（RFC 5545），不走 JSON 解析。
const ICAL_TTL_MS = 30 * 60 * 1000;

// RSS/Atom 订阅：用户提供的任意 feed 地址。与 .ics 不同，RSS 没有规范路径形态
// （/feed、/rss、/atom.xml、/index.xml 等并存），因此路径不限、查询串不限，但仅放行
// https 公网与 http+本机，拒绝 userinfo 与 fragment，总长 ≤512；响应文本有界，
// 解析层（rss-model.js）再独立设界。30 分钟缓存，失效回退 stale 缓存。
const RSS_TTL_MS = 30 * 60 * 1000;

function allowedRssFeedUrl(value) {
    if (typeof value !== "string" || value.length > 512) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && local))
            || url.username || url.password || url.hash) return false;
        return true;
    } catch (_) {
        return false;
    }
}

async function loadRssFeed(url, options = {}) {
    if (!allowedRssFeedUrl(url)) throw new Error("blocked_endpoint");
    const key = `rss:${url}`;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < RSS_TTL_MS) {
        return {text: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const text = await fetchBoundedLifeText(url, {...options, isAllowed: (candidate) => allowedRssFeedUrl(candidate)});
        if (typeof text !== "string" || !text) throw new Error("empty_response");
        cacheWrite(key, text, now);
        return {text, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {text: cached.value, status: "stale", fetchedAt: now};
        throw error;
    }
}

function allowedIcalFeedUrl(value) {
    if (typeof value !== "string" || value.length > 512) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password) return false;
        return /\.ics$/i.test(url.pathname);
    } catch (_) {
        return false;
    }
}

async function loadIcalText(url, options = {}) {
    if (!allowedIcalFeedUrl(url)) throw new Error("blocked_endpoint");
    const key = `ical:${url}`;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < ICAL_TTL_MS) {
        return {text: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const text = await fetchBoundedLifeText(url, {...options, isAllowed: (candidate) => allowedIcalFeedUrl(candidate)});
        if (typeof text !== "string" || !text) throw new Error("empty_response");
        cacheWrite(key, text, now);
        return {text, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {text: cached.value, status: "stale", fetchedAt: now};
        throw error;
    }
}
// GitHub 贡献：官方 REST 公开事件流（免 Key，未认证 60 次/时/IP）；可选 Token 走
// Authorization 请求头提升限额，永不进入 URL。60 分钟缓存，失效回退 stale 缓存。
// 分页契约与 github-model.js 一致：per_page=100、至多 3 页，提前停在短页。
const GITHUB_TTL_MS = 60 * 60 * 1000;
const GITHUB_PAGES_MAX = 3;

function allowedGithubEventsUrl(value) {
    if (typeof value !== "string" || value.length > 512) return false;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "api.github.com") return false;
        if (!/^\/users\/[A-Za-z0-9-]+\/events\/public$/.test(url.pathname)) return false;
        for (const key of url.searchParams.keys()) {
            if (key !== "per_page" && key !== "page") return false;
        }
        return true;
    } catch (_) {
        return false;
    }
}

async function loadGithubEvents(config, options = {}) {
    const username = config && typeof config.username === "string" ? config.username : "";
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(username) || username.length > 39) {
        throw new Error("blocked_endpoint");
    }
    const token = config && typeof config.token === "string" && config.token ? config.token : "";
    if (token && (/[\r\n\u0000-\u001f\u007f]/.test(token) || token.length > 200)) {
        throw new Error("invalid_token");
    }
    const pages = Math.min(GITHUB_PAGES_MAX, Math.max(1, Math.trunc(Number(config && config.pages)) || 2));
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const key = `github:${username.toLowerCase()}`;
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < GITHUB_TTL_MS) {
        return {text: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const events = [];
        for (let page = 1; page <= pages; page += 1) {
            const url = `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100&page=${page}`;
            if (!allowedGithubEventsUrl(url)) throw new Error("blocked_endpoint");
            const text = await fetchBoundedLifeText(url, {
                ...options,
                extraHeaders: token ? {Authorization: `Bearer ${token}`} : undefined,
                isAllowed: (candidate) => allowedGithubEventsUrl(candidate),
            });
            const arr = JSON.parse(text);
            if (!Array.isArray(arr)) throw new Error("invalid_github_payload");
            events.push(...arr);
            if (arr.length < 100) break;
        }
        const text = JSON.stringify(events);
        cacheWrite(key, text, now);
        return {text, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {text: cached.value, status: "stale", fetchedAt: now};
        throw error;
    }
}

// Frankfurter：v1 域名（api.frankfurter.app/latest）已 301 迁移，fetch 的 redirect:"error"
// 会直接失败，因此只放行 v2 固定主机与路径；货币代码走 ECB 支持的白名单，不接受任意字符串。
const FRANKFURTER_CURRENCIES = Object.freeze(["AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR"]);
const responseCache = new Map();

function allowedLifeWidgetUrl(url) {
    if (typeof url !== "string" || url.length > 1024) return false;
    if (url.startsWith("https://geocoding-api.open-meteo.com/v1/search?")
        || url.startsWith("https://api.open-meteo.com/v1/forecast?")) return true;
    if (url === "https://api.bgm.tv/calendar") return true;
    // Hacker News 首页采用与 Bangumi 同级的"字面量端点"策略：协议、主机、路径、
    // 查询全部固定，任何参数变化（含 hitsPerPage 注入）都视为外部端点拒绝。
    if (url === HACKER_NEWS_FRONT_PAGE_URL) return true;
    // T-6307：其余榜单走同族字面量集合，集合外任何形态（含参数变化）一律拒绝。
    if (Object.values(HACKER_NEWS_BOARDS).includes(url)) return true;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:"
            && parsed.hostname === "cdn.jsdelivr.net"
            && /^\/gh\/NateScarlet\/holiday-cn@master\/\d{4}\.json$/.test(parsed.pathname)
            && parsed.search === "";
    } catch (_) {
        return false;
    }
}

// Uptime Kuma：沿用"用户端点 + 已知路由"先例——主机由用户填写，路径必须精确等于
// /api/status-page/{slug} 或 /api/status-page/heartbeat/{slug}；slug 字符集受约束，
// 查询串、userinfo、fragment 一律拒绝。状态页接口本身免认证且只读。
function allowedUptimeKumaUrl(value, slug, heartbeat = false) {
    if (typeof value !== "string" || value.length > 320) return false;
    if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && local))
            || url.username || url.password || url.search || url.hash) return false;
        const expected = `/api/status-page/${heartbeat ? "heartbeat/" : ""}${slug}`;
        return url.pathname === expected;
    } catch (_) {
        return false;
    }
}

// Frankfurter：固定主机与路径，base/quotes 两个参数均来自 ECB 货币白名单；
// quotes 1-6 个且不得包含基准货币；其余任何参数、userinfo、fragment 一律拒绝。
// Miniflux：用户自建实例 + "已知路由"白名单（origin + /v1/entries + 恰四个受控参数：
// status=unread 固定、limit 为 1-50 的纯数字、order=published_at 固定、direction ∈
// {asc,desc}——T-6446 服务端排序）；https 或本机 http，拒绝 userinfo/fragment/额外参数。
// API Token 走 X-Auth-Token 请求头而非 URL——缓存 key 基于 URL，天然不含凭据。
// 模型层 buildMinifluxRequestUrl 与此处必须保持一致（有结构化一致性门禁）。
function allowedMinifluxUrl(value) {
    if (typeof value !== "string" || value.length > 320) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && local))
            || url.username || url.password || url.hash || url.pathname !== "/v1/entries") return false;
        const entries = [...url.searchParams.entries()];
        if (entries.length !== 4) return false;
        const params = Object.fromEntries(entries);
        if (params.status !== "unread") return false;
        if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(params.limit || "")) return false;
        if (params.order !== "published_at") return false;
        if (params.direction !== "asc" && params.direction !== "desc") return false;
        return true;
    } catch (_) {
        return false;
    }
}

function allowedFrankfurterUrl(value) {
    if (typeof value !== "string" || value.length > 320) return false;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "api.frankfurter.dev"
            || url.pathname !== "/v2/rates" || url.username || url.password || url.search === ""
            || url.hash) return false;
        const entries = [...url.searchParams.entries()];
        if (entries.length !== 2) return false;
        const params = Object.fromEntries(entries);
        if (!FRANKFURTER_CURRENCIES.includes(params.base)) return false;
        const quotes = String(params.quotes || "").split(",");
        if (quotes.length < 1 || quotes.length > 6) return false;
        const unique = new Set(quotes);
        if (unique.size !== quotes.length || unique.has(params.base)) return false;
        return quotes.every((code) => FRANKFURTER_CURRENCIES.includes(code));
    } catch (_) {
        return false;
    }
}

function allowedConfiguredFeedUrl(value) {    if (typeof value !== "string" || value.length > 512) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.hash) return false;
        const daily = url.pathname.match(/^\/(?:api\/)?(weibo|zhihu|bilibili|baidu|douyin|douban-movie|ithome|36kr|sspai|v2ex)\/?$/);
        if (daily) return url.search === "";
        if (url.pathname.replace(/\/$/, "") !== "/api/s") return false;
        const entries = [...url.searchParams.entries()];
        return entries.length === 1 && entries[0][0] === "id" && /^[a-z0-9-]{2,48}$/.test(entries[0][1]);
    } catch (_) {
        return false;
    }
}

function allowedActivityWatchUrl(value) {
    if (typeof value !== "string" || value.length > 320) return false;
    try {
        const url = new URL(value);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        return local && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            && !url.search && !url.hash && url.pathname === "/api/0/query/";
    } catch (_) {
        return false;
    }
}

function cacheRead(key, ttl, now = Date.now()) {
    const entry = responseCache.get(key);
    if (!entry || now - entry.at >= ttl) return null;
    return entry.value;
}

function cacheWrite(key, value, now = Date.now()) {
    responseCache.set(key, {at: now, value});
    while (responseCache.size > 16) responseCache.delete(responseCache.keys().next().value);
    return value;
}

async function fetchBoundedLifeJson(url, options = {}) {
    const configuredFeedAllowed = options.allowConfiguredFeed === true && allowedConfiguredFeedUrl(url);
    // 自定义端点门禁：仅当调用方传入确定性谓词（loader 内部先用各自白名单校验过）时放行，
    // 且谓词只针对该 loader 固定的端点形态，不引入任何"任意 URL"通道。
    const customAllowed = typeof options.isAllowed === "function" && options.isAllowed(url) === true;
    if (!allowedLifeWidgetUrl(url) && !configuredFeedAllowed && !customAllowed) throw new Error("blocked_endpoint");
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("unsupported");
    const externalSignal = options.signal && typeof options.signal === "object" ? options.signal : null;
    if (externalSignal?.aborted) throw new Error("aborted");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const abort = () => controller?.abort();
    externalSignal?.addEventListener?.("abort", abort, {once: true});
    const timeoutMs = Math.min(10000, Math.max(500, Math.trunc(Number(options.timeoutMs)) || 6000));
    let rejectTimeout = null;
    const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => {
        timedOut = true;
        controller?.abort();
        rejectTimeout?.(new Error("timeout"));
    }, timeoutMs);
    try {
        const requestOptions = controller
            ? {signal: controller.signal, headers: {Accept: "application/json", ...(options.extraHeaders || {})}, redirect: "error"}
            : {headers: {Accept: "application/json", ...(options.extraHeaders || {})}, redirect: "error"};
        const request = fetchImpl(url, requestOptions);
        const response = await Promise.race([request, timeout]);
        if (!response?.ok) throw new Error("http_error");
        const declared = Number(response.headers?.get?.("content-length"));
        if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
        const text = await response.text();
        if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
        // 文本抓取变体（responseKind:"text"）只做有界读取，不做 JSON 解析——
        // iCal/GitHub 事件流的响应不是 JSON，此前该选项被忽略导致文本抓取恒失败（D-397）。
        if (options.responseKind === "text") return text;
        try { return JSON.parse(text); } catch (_) { throw new Error("invalid_json"); }
    } catch (error) {
        if (timedOut) throw new Error("timeout");
        if (externalSignal?.aborted) throw new Error("aborted");
        throw error instanceof Error ? error : new Error("failed");
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener?.("abort", abort);
    }
}

// 文本抓取变体：与 JSON 抓取共享 bounded/超时/取消流程，但不做 JSON 解析。
async function fetchBoundedLifeText(url, options = {}) {
    return fetchBoundedLifeJson(url, {...options, responseKind: "text"});
}

async function loadWeatherLocation(url, options = {}) {
    const cached = cacheRead(`location:${url}`, LOCATION_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite(`location:${url}`, await fetchBoundedLifeJson(url, options), options.now);
}

async function loadWeatherForecast(url, options = {}) {
    const cached = cacheRead(`weather:${url}`, WEATHER_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite(`weather:${url}`, await fetchBoundedLifeJson(url, options), options.now);
}

async function loadHolidayYear(year, options = {}) {
    const normalizedYear = Math.min(2100, Math.max(2000, Math.trunc(Number(year)) || 2000));
    const url = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${normalizedYear}.json`;
    const cached = cacheRead(`holiday:${normalizedYear}`, HOLIDAY_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite(`holiday:${normalizedYear}`, await fetchBoundedLifeJson(url, options), options.now);
}

async function loadBangumiCalendar(options = {}) {
    const url = "https://api.bgm.tv/calendar";
    const cached = cacheRead("bangumi:calendar", BANGUMI_TTL_MS, options.now);
    if (cached) return cached;
    return cacheWrite("bangumi:calendar", await fetchBoundedLifeJson(url, options), options.now);
}

// Hacker News 榜单：固定端点 + 30 分钟缓存 + 失败回退陈旧缓存（与用户端点 feed 同一健康
// 语义）；缓存键按榜单隔离，非白名单榜单在构 URL 前即拒绝。
async function loadHackerNewsBoard(board, options = {}) {
    const endpoint = HACKER_NEWS_BOARDS[board];
    if (typeof board !== "string" || !endpoint) throw new Error("blocked_endpoint");
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const key = `hackernews:${board}`;
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < HACKER_NEWS_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(endpoint, options);
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

// 兼容保留：front_page 榜单即此前的"首页"加载器。
async function loadHackerNewsFrontPage(options = {}) {
    return loadHackerNewsBoard("front_page", options);
}

async function loadConfiguredFeed(url, options = {}) {    if (!allowedConfiguredFeedUrl(url)) throw new Error("blocked_endpoint");
    const key = `feed:${url}`;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < FEED_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(url, {...options, allowConfiguredFeed: true});
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

async function fetchActivityWatchQuery(url, body, options = {}) {
    if (!allowedActivityWatchUrl(url) || !body || typeof body !== "object") throw new Error("blocked_endpoint");
    const serialized = JSON.stringify(body);
    if (serialized.length > 8192) throw new Error("request_too_large");
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("unsupported");
    const externalSignal = options.signal && typeof options.signal === "object" ? options.signal : null;
    if (externalSignal?.aborted) throw new Error("aborted");
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const abort = () => controller?.abort();
    externalSignal?.addEventListener?.("abort", abort, {once: true});
    const timeoutMs = Math.min(10000, Math.max(500, Math.trunc(Number(options.timeoutMs)) || 5000));
    let rejectTimeout = null;
    const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => { timedOut = true; controller?.abort(); rejectTimeout?.(new Error("timeout")); }, timeoutMs);
    try {
        const request = fetchImpl(url, {
            method: "POST", body: serialized, redirect: "error",
            headers: {Accept: "application/json", "Content-Type": "application/json"},
            ...(controller ? {signal: controller.signal} : {}),
        });
        const response = await Promise.race([request, timeout]);
        if (!response?.ok) throw new Error("http_error");
        const declared = Number(response.headers?.get?.("content-length"));
        if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
        const text = await response.text();
        if (typeof text !== "string" || text.length > MAX_RESPONSE_BYTES) throw new Error("response_too_large");
        try { return JSON.parse(text); } catch (_) { throw new Error("invalid_json"); }
    } catch (error) {
        if (timedOut) throw new Error("timeout");
        if (externalSignal?.aborted) throw new Error("aborted");
        throw error instanceof Error ? error : new Error("failed");
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener?.("abort", abort);
    }
}

async function loadActivityWatchSummary(request, options = {}) {
    if (!request || !allowedActivityWatchUrl(request.url)) throw new Error("blocked_endpoint");
    const key = `activitywatch:${String(request.cacheKey || request.url).slice(0, 512)}`;
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < ACTIVITYWATCH_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchActivityWatchQuery(request.url, request.body, options);
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

// Uptime Kuma 状态页与心跳页共享同一"新鲜/缓存/陈旧"加载语义；5 分钟缓存
// 匹配其检查间隔量级，失败时回退陈旧缓存，与用户端点 feed 行为一致。
async function loadUptimeKumaPage(url, slug, heartbeat, options = {}) {
    if (!allowedUptimeKumaUrl(url, slug, heartbeat)) throw new Error("blocked_endpoint");
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const key = `uptimekuma:${heartbeat ? "hb" : "status"}:${url}`;
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < UPTIME_KUMA_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(url, {...options, isAllowed: (candidate) => allowedUptimeKumaUrl(candidate, slug, heartbeat)});
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

async function loadFrankfurterRates(url, options = {}) {
    if (!allowedFrankfurterUrl(url)) throw new Error("blocked_endpoint");
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const key = `frankfurter:${url}`;
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < FRANKFURTER_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(url, {...options, isAllowed: (candidate) => allowedFrankfurterUrl(candidate)});
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

// Miniflux：15 分钟缓存（阅读节奏量级），失败回退陈旧缓存。Token 经 extraHeaders
// 传入请求头；凭据只出现在发往本机内核的代理请求体中，不进 URL/缓存 key/错误消息。
async function loadMinifluxEntries(url, token, options = {}) {
    if (!allowedMinifluxUrl(url)) throw new Error("blocked_endpoint");
    if (typeof token !== "string" || !token || /[\r\n\u0000-\u001f\u007f]/.test(token) || token.length > 128) {
        throw new Error("invalid_token");
    }
    const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
    const key = `miniflux:${url}`;
    const cached = responseCache.get(key);
    if (options.force !== true && cached && now - cached.at < MINIFLUX_TTL_MS) {
        return {payload: cached.value, status: "cached", fetchedAt: cached.at};
    }
    try {
        const payload = await fetchBoundedLifeJson(url, {
            ...options,
            extraHeaders: {"X-Auth-Token": token},
            isAllowed: (candidate) => allowedMinifluxUrl(candidate),
        });
        cacheWrite(key, payload, now);
        return {payload, status: "fresh", fetchedAt: now};
    } catch (error) {
        if (cached) return {payload: cached.value, status: "stale", fetchedAt: cached.at};
        throw error;
    }
}

function clearLifeWidgetCaches() {
    responseCache.clear();
}

function lifeWidgetCacheSize() {
    return responseCache.size;
}

module.exports = {
    MAX_RESPONSE_BYTES,
    WEATHER_TTL_MS,
    LOCATION_TTL_MS,
    HOLIDAY_TTL_MS,
    BANGUMI_TTL_MS,
    FEED_TTL_MS,
    ACTIVITYWATCH_TTL_MS,
    HACKER_NEWS_TTL_MS,
    HACKER_NEWS_BOARDS,
    HACKER_NEWS_FRONT_PAGE_URL,
    UPTIME_KUMA_TTL_MS,
    FRANKFURTER_TTL_MS,
    MINIFLUX_TTL_MS,
    FRANKFURTER_CURRENCIES,
    allowedLifeWidgetUrl,
    allowedConfiguredFeedUrl,
    allowedActivityWatchUrl,
    allowedUptimeKumaUrl,
    allowedFrankfurterUrl,
    allowedMinifluxUrl,
    fetchBoundedLifeJson,
    loadWeatherLocation,
    loadWeatherForecast,
    loadHolidayYear,
    loadHackerNewsFrontPage,
    loadHackerNewsBoard,
    loadUptimeKumaPage,
    loadFrankfurterRates,
    loadMinifluxEntries,
    loadAirQuality,
    allowedAirQualityUrl,
    AIR_QUALITY_TTL_MS,
    loadIcalText,
    allowedIcalFeedUrl,
    ICAL_TTL_MS,
    loadRssFeed,
    allowedRssFeedUrl,
    RSS_TTL_MS,
    loadGithubEvents,
    allowedGithubEventsUrl,
    GITHUB_TTL_MS,
    loadBangumiCalendar,
    loadConfiguredFeed,
    fetchActivityWatchQuery,
    loadActivityWatchSummary,
    clearLifeWidgetCaches,
    lifeWidgetCacheSize,
};
