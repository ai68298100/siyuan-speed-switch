"use strict";

// Pure widget-store semantics shared by desktop, sidebar and mobile adapters.
// DOM rendering stays in index.ts; this module owns bounded filtering,
// grouping, status and preview decisions so future store surfaces remain
// behaviorally aligned.

const STORE_TABS = Object.freeze(["all", "recommended", "configurable", "builtin", "offline", "local", "network", "plugin", "conditional", "requires", "optional", "added"]);
const STORE_DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const STORE_AVAILABILITY = Object.freeze(["ready", "conditional", "external"]);
const STORE_CATEGORIES = Object.freeze(["builtin", "plugin"]);
const STORE_INTEGRATIONS = Object.freeze(["offline", "local", "network"]);
const STORE_SORTS = Object.freeze(["relevance", "title", "status", "category"]);
const PREVIEW_KINDS = Object.freeze({
    "today-journal": "documents", "journal-monthly": "calendar", "recent-daily-notes": "documents", "today-reservations": "tasks",
    "on-this-day": "documents", "journal-calendar": "calendar", "writing-streak": "progress", "today-tasks": "tasks",
    "note-stats": "stat", "year-progress": "progress", "today-writing": "progress", "recent-writing-activity": "chart", "countdown": "countdown",
    "flashcard-due": "tasks", "random-review": "tasks", "quick-capture": "tasks", "clipped-unread": "feed",
    "recent-documents": "documents", "favorites": "documents", "document-sets": "documents", "fixed-document": "documents", "recent-edits": "documents",
    "current-document-outline": "outline", "document-relations-summary": "outline",
    "external-local-time": "stat", "external-weather-open-meteo": "weather", "external-anime-bangumi": "media",
    "external-air-quality": "stat",
    "external-hot-news-dailyhot": "feed", "external-news-newsnow": "feed",
    "external-world-clock": "stat", "external-news-hackernews": "feed",
    "external-status-uptimekuma": "stat", "external-fx-frankfurter": "stat",
    "external-quote-daily": "stat", "external-device-battery": "stat",
    "external-rss-miniflux": "feed",
    "external-rss-subscription": "feed",
    "external-ical-events": "feed",
    "external-github-contrib": "feed",
    "external-activitywatch-time": "activity",
});
const SOURCE_INFO = Object.freeze({
    "external-local-time": Object.freeze({providerName: "SiYuan runtime", integration: "direct", privacy: "local-only"}),
    "external-world-clock": Object.freeze({providerName: "SiYuan runtime", integration: "direct", privacy: "local-only"}),
    "external-weather-open-meteo": Object.freeze({providerName: "Open-Meteo", integration: "http", privacy: "location-only"}),
    "external-air-quality": Object.freeze({providerName: "Open-Meteo Air Quality", integration: "http", privacy: "location-only"}),
    "external-anime-bangumi": Object.freeze({providerName: "Bangumi", integration: "http", privacy: "none"}),
    "external-hot-news-dailyhot": Object.freeze({providerName: "DailyHotApi", integration: "http", privacy: "endpoint-only"}),
    "external-news-newsnow": Object.freeze({providerName: "NewsNow", integration: "http", privacy: "endpoint-only"}),
    "external-news-hackernews": Object.freeze({providerName: "Hacker News (Algolia)", integration: "http", privacy: "none"}),
    "external-activitywatch-time": Object.freeze({providerName: "ActivityWatch", integration: "local-bridge", privacy: "local-only"}),
    "external-status-uptimekuma": Object.freeze({providerName: "Uptime Kuma", integration: "http", privacy: "endpoint-only"}),
    "external-fx-frankfurter": Object.freeze({providerName: "Frankfurter (ECB)", integration: "http", privacy: "none"}),
    "external-quote-daily": Object.freeze({providerName: "内置语录集", integration: "direct", privacy: "local-only"}),
    "external-device-battery": Object.freeze({providerName: "Battery Status API", integration: "direct", privacy: "local-only"}),
    "external-rss-miniflux": Object.freeze({providerName: "Miniflux", integration: "http", privacy: "endpoint-only"}),
    "external-ical-events": Object.freeze({providerName: "iCal 订阅", integration: "http", privacy: "endpoint-only"}),
    "external-rss-subscription": Object.freeze({providerName: "RSS / Atom 订阅", integration: "http", privacy: "endpoint-only"}),
    "external-github-contrib": Object.freeze({providerName: "GitHub", integration: "http", privacy: "endpoint-only"}),
    "checkin-today": Object.freeze({providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"}),
    "checkin-streak": Object.freeze({providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"}),
    "checkin-year-heatmap": Object.freeze({providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"}),
    "checkin-weekly": Object.freeze({providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"}),
    "checkin-occasions": Object.freeze({providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"}),
    "checkin-monthly": Object.freeze({providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"}),
});
const DEPENDENCY_INFO = Object.freeze({
    "external-weather-open-meteo": Object.freeze({kind: "external-api", required: true, name: "Open-Meteo", installUrl: "https://open-meteo.com/", projectUrl: "https://github.com/open-meteo/open-meteo", setup: "配置城市后联网；无需安装桌面软件或 API Key", network: "公网 HTTPS；仅发送城市/坐标", platforms: "desktop/sidebar/mobile"}),
    "external-air-quality": Object.freeze({kind: "external-api", required: true, name: "Open-Meteo Air Quality", installUrl: "https://open-meteo.com/", projectUrl: "https://github.com/open-meteo/open-meteo", setup: "配置城市后联网；无需安装桌面软件或 API Key", network: "公网 HTTPS；仅发送城市/坐标", platforms: "desktop/sidebar/mobile"}),
    "external-anime-bangumi": Object.freeze({kind: "external-api", required: true, name: "Bangumi API", installUrl: "https://github.com/bangumi/api", projectUrl: "https://github.com/bangumi/api", setup: "添加组件后读取公开节目表；无需 API Key", network: "公网 HTTPS；读取节目表与官方封面", platforms: "desktop/sidebar/mobile"}),
    "external-hot-news-dailyhot": Object.freeze({kind: "self-hosted-api", required: true, name: "DailyHotApi", installUrl: "https://github.com/imsyy/DailyHotApi", projectUrl: "https://github.com/imsyy/DailyHotApi", setup: "先部署服务，再填写完整 HTTPS 端点；不提供内置公共演示地址", network: "公网或自建 HTTPS；仅读取公开榜单", platforms: "desktop/sidebar/mobile"}),
    "external-news-newsnow": Object.freeze({kind: "self-hosted-api", required: true, name: "NewsNow", installUrl: "https://github.com/ourongxing/newsnow", projectUrl: "https://github.com/ourongxing/newsnow", setup: "先部署服务，再填写 /api/s?id=... 完整端点；不提供内置公共演示地址", network: "公网或自建 HTTPS；仅读取标题、来源和时间", platforms: "desktop/sidebar/mobile"}),
    "external-news-hackernews": Object.freeze({kind: "external-api", required: false, name: "Hacker News（Algolia）", installUrl: "https://hn.algolia.com/api/v1", projectUrl: "https://github.com/HackerNews/API", setup: "添加后即读取免 Key 公开接口；固定端点白名单，无需配置或凭据", network: "公网 HTTPS（经思源内核代理）；仅读取首页标题、得分与评论数", platforms: "desktop/sidebar/mobile"}),
    "external-activitywatch-time": Object.freeze({kind: "local-service", required: true, name: "ActivityWatch", installUrl: "https://activitywatch.net/downloads/", projectUrl: "https://github.com/ActivityWatch/activitywatch", setup: "安装并启动本机服务，默认 127.0.0.1:5600；仅桌面/侧栏支持", network: "仅 loopback 本机 Query API；不读取窗口标题", platforms: "desktop/sidebar"}),
    "external-status-uptimekuma": Object.freeze({kind: "self-hosted-api", required: true, name: "Uptime Kuma", installUrl: "https://github.com/louislam/uptime-kuma", projectUrl: "https://github.com/louislam/uptime-kuma", setup: "自行部署 Uptime Kuma 并发布状态页，再填写实例地址与状态页 slug；仅访问免认证只读路由", network: "公网或自建 HTTPS；仅读取监控在线率与公告", platforms: "desktop/sidebar/mobile"}),
    "external-fx-frankfurter": Object.freeze({kind: "external-api", required: false, name: "Frankfurter（ECB 参考汇率）", installUrl: "https://frankfurter.dev", projectUrl: "https://github.com/frankfurter-dev/frankfurter", setup: "添加后即读取免 Key 公开接口；端点白名单锁定 api.frankfurter.dev，展示为参考值而非实时行情", network: "公网 HTTPS（经思源内核代理）；仅发送货币代码", platforms: "desktop/sidebar/mobile"}),
    "external-rss-miniflux": Object.freeze({kind: "self-hosted-api", required: true, name: "Miniflux", installUrl: "https://miniflux.app", projectUrl: "https://github.com/miniflux/v2", setup: "自行部署 Miniflux 并在设置 → API 密钥中生成 Token 后填入；Token 经请求头传递，不进入 URL、缓存或错误消息", network: "公网或自建 HTTPS；仅读取未读文章标题、来源与链接", platforms: "desktop/sidebar/mobile"}),
    "external-ical-events": Object.freeze({kind: "user-feed", required: false, name: "iCal 订阅", installUrl: "", projectUrl: "", setup: "在组件配置中填写 .ics 订阅地址后联网读取日程；地址仅用于拉取订阅内容", network: "用户提供的 HTTPS/本机 .ics 地址；仅读取日程文本", platforms: "desktop/sidebar/mobile"}),
    "external-rss-subscription": Object.freeze({kind: "user-feed", required: false, name: "RSS / Atom 订阅", installUrl: "", projectUrl: "", setup: "在组件配置中填写 RSS/Atom 订阅地址后联网读取文章；零凭据零实例，地址仅用于拉取订阅内容", network: "用户提供的 HTTPS/本机 feed 地址；仅读取文章标题与链接", platforms: "desktop/sidebar/mobile"}),
    "external-github-contrib": Object.freeze({kind: "external-api", required: false, name: "GitHub", installUrl: "https://github.com", projectUrl: "https://docs.github.com/rest/activity/events", setup: "在组件配置中填写 GitHub 用户名后联网读取公开事件流；可选 Token 提升限额", network: "GitHub 官方 API；仅发送用户名", platforms: "desktop/sidebar/mobile"}),
    "journal-calendar": Object.freeze({kind: "optional-data", required: false, name: "holiday-cn", installUrl: "https://github.com/NateScarlet/holiday-cn", projectUrl: "https://github.com/NateScarlet/holiday-cn", setup: "开启中国节假日/调休覆盖层后按年度读取静态 JSON；不开启仍可使用日历", network: "公网 HTTPS CDN；仅节假日数据", platforms: "desktop/sidebar/mobile"}),
    "checkin-summary": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用提供方插件后重新打开商店；本插件不内置打卡数据，协议说明见组件协议文档", network: "由提供方插件决定；本组件不自行请求", platforms: "desktop/sidebar/mobile"}),
    "checkin-today": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用小驴打卡插件后本组件自动读取其公开生态 API；速切不自行请求网络，协议说明见组件协议文档", network: "无网络；只读本机插件数据", platforms: "desktop/sidebar/mobile"}),
    "checkin-streak": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用小驴打卡插件后本组件自动读取其公开生态 API；速切不自行请求网络，协议说明见组件协议文档", network: "无网络；只读本机插件数据", platforms: "desktop/sidebar/mobile"}),
    "checkin-year-heatmap": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用小驴打卡插件后本组件自动读取其公开生态 API；速切不自行请求网络，协议说明见组件协议文档", network: "无网络；只读本机插件数据", platforms: "desktop/sidebar/mobile"}),
    "checkin-weekly": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用小驴打卡插件后本组件自动读取其公开生态 API；需插件支持 analytics.read 能力，协议说明见组件协议文档", network: "无网络；只读本机插件数据", platforms: "desktop/sidebar/mobile"}),
    "checkin-monthly": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用小驴打卡插件后本组件自动读取其公开生态 API；速切不自行请求网络，协议说明见组件协议文档", network: "无网络；只读本机插件数据", platforms: "desktop/sidebar/mobile"}),
    "checkin-occasions": Object.freeze({kind: "plugin", required: true, name: "小驴打卡（siyuan-checkin）", installUrl: "", projectUrl: "", setup: "安装并启用小驴打卡插件后本组件自动读取其公开生态 API；需插件支持 occasions.read 能力，协议说明见组件协议文档", network: "无网络；只读本机插件数据", platforms: "desktop/sidebar/mobile"}),
    "plugin-commands": Object.freeze({kind: "plugin", required: false, name: "其他插件命令提供方", installUrl: "https://github.com/siyuan-note/bazaar", projectUrl: "https://github.com/siyuan-note/bazaar", setup: "仅在其他插件公开兼容 commands 且已启用时显示；无提供方时为空", network: "由提供方插件决定", platforms: "desktop/sidebar/mobile"}),
});

function boundedText(value, max = 256) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeHomeStoreQuery(value) {
    return boundedText(value, 128).toLowerCase();
}

function normalizeHomeStoreSort(value) {
    return STORE_SORTS.includes(value) ? value : "relevance";
}

function normalizeHomeStoreCardId(value) {
    return boundedText(value, 96).replace(/[^a-zA-Z0-9._:-]/g, "");
}

function tokenizeHomeStoreQuery(value) {
    const query = normalizeHomeStoreQuery(value);
    return [...new Set(query.split(/\s+/).filter(Boolean).slice(0, 12))];
}

function matchesHomeStoreTokens(card, query, filter) {
    const item = normalizeHomeStoreCard(card);
    const tokens = tokenizeHomeStoreQuery(query);
    return tokens.every((token) => item.search.includes(token)) && matchesHomeStoreCard(item, "", filter);
}

function resolveHomeStoreStatusRank(card) {
    const item = normalizeHomeStoreCard(card);
    if (item.added) return 0;
    if (item.availability === "ready") return 1;
    if (item.availability === "conditional") return 2;
    return 3;
}

function compareHomeStoreCards(a, b, sort = "relevance") {
    const key = normalizeHomeStoreSort(sort);
    const left = normalizeHomeStoreCard(a);
    const right = normalizeHomeStoreCard(b);
    if (key === "status") return resolveHomeStoreStatusRank(left) - resolveHomeStoreStatusRank(right) || left.search.localeCompare(right.search);
    if (key === "category") return left.category.localeCompare(right.category) || left.search.localeCompare(right.search);
    if (key === "title") return left.search.localeCompare(right.search);
    return (right.added ? 1 : 0) - (left.added ? 1 : 0) || left.search.localeCompare(right.search);
}

function sortHomeStoreCards(cards, sort = "relevance") {
    return (Array.isArray(cards) ? cards : []).map((card, index) => ({card, index}))
        .sort((a, b) => compareHomeStoreCards(a.card, b.card, sort) || a.index - b.index)
        .map((entry) => entry.card);
}

function countHomeStoreByAvailability(cards) {
    const counts = {ready: 0, conditional: 0, external: 0};
    (Array.isArray(cards) ? cards : []).forEach((card) => {
        const key = normalizeHomeStoreCard(card).availability;
        if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    });
    return counts;
}

function countHomeStoreByIntegration(cards) {
    const counts = {offline: 0, local: 0, network: 0, unknown: 0};
    (Array.isArray(cards) ? cards : []).forEach((card) => {
        const key = normalizeHomeStoreCard(card).integration;
        if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
    });
    return counts;
}

function buildHomeStoreTabCounts(cards) {
    const all = Array.isArray(cards) ? cards : [];
    const counts = {
        all: all.length,
        recommended: all.filter((card) => isHomeStoreRecommended(card)).length,
        configurable: all.filter((card) => normalizeHomeStoreCard(card).configurable).length,
        builtin: all.filter((card) => normalizeHomeStoreCard(card).category === "builtin").length,
        plugin: all.filter((card) => normalizeHomeStoreCard(card).category === "plugin").length,
        offline: all.filter((card) => normalizeHomeStoreCard(card).integration === "offline").length,
        local: all.filter((card) => normalizeHomeStoreCard(card).integration === "local").length,
        network: all.filter((card) => normalizeHomeStoreCard(card).integration === "network").length,
        conditional: all.filter((card) => normalizeHomeStoreCard(card).availability === "conditional").length,
        added: all.filter(isHomeStoreAdded).length,
    };
    const normalized = all.map(normalizeHomeStoreCard);
    if (normalized.some((card) => card.dependency === "required" || card.dependency === "optional")) {
        counts.requires = normalized.filter((card) => card.dependency === "required").length;
        counts.optional = normalized.filter((card) => card.dependency === "optional").length;
    }
    return counts;
}

function resolveHomeStoreCardA11y(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    const title = boundedText(labels.title || item.search, 128);
    const state = item.added ? boundedText(labels.added || "已添加", 32) : boundedText(labels.notAdded || "未添加", 32);
    return [title, state].filter(Boolean).join(" · ");
}

function normalizeHomeStorePage(value, total = 0, pageSize = 24) {
    const size = Number.isFinite(Number(pageSize)) ? Math.min(100, Math.max(1, Math.trunc(Number(pageSize)))) : 24;
    const pages = Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / size));
    const page = Number.isFinite(Number(value)) ? Math.min(pages, Math.max(1, Math.trunc(Number(value)))) : 1;
    return {page, pageSize: size, pages};
}

function sliceHomeStorePage(cards, page = 1, pageSize = 24) {
    const list = Array.isArray(cards) ? cards : [];
    const meta = normalizeHomeStorePage(page, list.length, pageSize);
    return {items: list.slice((meta.page - 1) * meta.pageSize, meta.page * meta.pageSize), ...meta};
}

function normalizeHomeStoreFocusIndex(value, count) {
    const total = Math.max(0, Math.trunc(Number(count) || 0));
    if (!total) return -1;
    const index = Math.trunc(Number(value));
    return Number.isFinite(index) ? Math.min(total - 1, Math.max(0, index)) : 0;
}

function moveHomeStoreFocus(index, count, delta) {
    const total = Math.max(0, Math.trunc(Number(count) || 0));
    if (!total) return -1;
    const current = normalizeHomeStoreFocusIndex(index, total);
    return (current + Math.trunc(Number(delta) || 0) + total) % total;
}

function serializeHomeStoreCollapsedGroups(values) {
    return [...normalizeHomeStoreCollapsedGroups(values)].sort().join("|");
}

function parseHomeStoreCollapsedGroups(value) {
    return normalizeHomeStoreCollapsedGroups(typeof value === "string" ? value.split("|") : []);
}

function resolveHomeStoreGroupCount(cards, query, filter) {
    return filterHomeStoreCards(cards, query, filter).length;
}

function isHomeStoreCardVisible(card, query, filter) {
    return matchesHomeStoreCard(card, query, filter);
}

function normalizeHomeStoreCardTitle(value, fallback = "组件") {
    return boundedText(value, 96) || boundedText(fallback, 96) || "组件";
}

function resolveHomeStoreSortLabel(sort, labels = {}) {
    const key = normalizeHomeStoreSort(sort);
    return boundedText(labels[key], 48) || key;
}

function buildHomeStoreCardMetadata(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    return {title: normalizeHomeStoreCardTitle(labels.title || item.search), status: item.added ? "added" : item.availability, integration: item.integration, selectable: !item.added || item.added};
}

function buildHomeStoreSectionSummary(cards, query, filter, labels = {}) {
    const summary = summarizeHomeStoreCards(cards, query, filter);
    return {text: boundedText(labels.text, 128).replace("{visible}", String(summary.visible)).replace("{total}", String(summary.total)).replace("{added}", String(summary.added)), ...summary};
}

function isHomeStoreActionEnabled(action, card) {
    const key = boundedText(action, 32);
    const item = normalizeHomeStoreCard(card);
    if (["preview", "configure", "remove"].includes(key)) return item.added || key === "preview";
    if (key === "add") return !item.added && item.availability !== "external";
    return false;
}

function resolveHomeStoreButtonLabel(action, card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    const title = normalizeHomeStoreCardTitle(labels.title || item.search);
    const text = boundedText(labels[action], 48) || keyFallback(action);
    return `${text} · ${title}`;
}

function keyFallback(action) {
    return ({add: "添加", configure: "配置", remove: "移除", preview: "预览"})[action] || "操作";
}

function normalizeHomeStoreCardOrder(cards) {
    return (Array.isArray(cards) ? cards : []).map((card, index) => ({card, index})).filter(({card}) => !!normalizeHomeStoreCard(card).search).sort((a, b) => a.index - b.index).map(({card}) => card);
}

function findHomeStoreCardIndex(cards, moduleId) {
    const key = boundedText(moduleId, 96);
    return normalizeHomeStoreCardOrder(cards).findIndex((card) => boundedText(card?.moduleId || card?.id, 96) === key);
}

function moveHomeStoreCard(cards, from, to) {
    const list = normalizeHomeStoreCardOrder(cards);
    if (!list.length) return [];
    const source = normalizeHomeStoreFocusIndex(from, list.length);
    const target = normalizeHomeStoreFocusIndex(to, list.length);
    const [item] = list.splice(source, 1);
    list.splice(target, 0, item);
    return list;
}

function buildHomeStoreEmptyState(query, filter, labels = {}) {
    const hasQuery = !!normalizeHomeStoreQuery(query);
    const tab = normalizeHomeStoreTab(filter?.tab);
    return {kind: hasQuery ? "search" : tab !== "all" ? "filter" : "empty", text: boundedText(labels[hasQuery ? "search" : tab !== "all" ? "filter" : "empty"], 128) || "暂无组件"};
}

function resolveHomeStoreFilterDescription(filter, labels = {}) {
    const normalized = filter && typeof filter === "object" ? filter : resolveHomeStoreFilter("all");
    return boundedText(labels[normalized.tab] || labels.all, 96);
}

function serializeHomeStoreFilter(filter) {
    const normalized = resolveHomeStoreFilter(filter?.tab);
    return JSON.stringify(normalized);
}

function parseHomeStoreFilter(value) {
    try { return resolveHomeStoreFilter(JSON.parse(typeof value === "string" ? value : "").tab); } catch (_) { return resolveHomeStoreFilter("all"); }
}

function sameHomeStoreFilter(left, right) {
    return serializeHomeStoreFilter(left) === serializeHomeStoreFilter(right);
}

function mergeHomeStoreFilters(base, override) {
    return resolveHomeStoreFilter(override?.tab || base?.tab || "all");
}

function resetHomeStoreFilter() {
    return resolveHomeStoreFilter("all");
}

function resolveHomeStoreStatusTone(card) {
    const item = normalizeHomeStoreCard(card);
    if (item.added) return "success";
    if (item.availability === "conditional") return "warning";
    if (item.availability === "external") return "info";
    return "neutral";
}

function resolveHomeStoreIntegrationTone(card) {
    const key = normalizeHomeStoreCard(card).integration;
    return ({offline: "offline", local: "local", network: "network"})[key] || "unknown";
}

function resolveHomeStoreActionPriority(card) {
    const item = normalizeHomeStoreCard(card);
    if (!item.added) return item.availability === "conditional" ? 2 : 0;
    return item.availability === "conditional" ? 1 : 3;
}

function listHomeStoreActionOrder(card) {
    const item = normalizeHomeStoreCard(card);
    return item.added ? ["configure", "preview", "remove"] : ["add", "preview"];
}

function normalizeHomeStoreHighlightText(value) {
    return boundedText(value, 160);
}

function buildHomeStoreHighlightRanges(text, query) {
    const value = normalizeHomeStoreHighlightText(text);
    const tokens = tokenizeHomeStoreQuery(query).sort((a, b) => b.length - a.length);
    const ranges = [];
    tokens.forEach((token) => {
        let start = 0;
        const lower = value.toLowerCase();
        while (token && (start = lower.indexOf(token, start)) >= 0) {
            const end = start + token.length;
            if (!ranges.some((range) => start < range.end && end > range.start)) ranges.push({start, end});
            start = end;
        }
    });
    return ranges.sort((a, b) => a.start - b.start);
}

function buildHomeStoreHighlightSegments(text, query) {
    const value = normalizeHomeStoreHighlightText(text);
    const ranges = buildHomeStoreHighlightRanges(value, query);
    if (!ranges.length) return [{text: value, highlighted: false}];
    const segments = [];
    let cursor = 0;
    ranges.forEach((range) => {
        if (range.start > cursor) segments.push({text: value.slice(cursor, range.start), highlighted: false});
        segments.push({text: value.slice(range.start, range.end), highlighted: true});
        cursor = range.end;
    });
    if (cursor < value.length) segments.push({text: value.slice(cursor), highlighted: false});
    return segments;
}

function resolveHomeStoreEmptyAction(kind) {
    return ({search: "clear-search", filter: "clear-filters", empty: "open-store"})[kind] || "open-store";
}

function buildHomeStoreEmptyActionLabel(kind, labels = {}) {
    const action = resolveHomeStoreEmptyAction(kind);
    return boundedText(labels[action], 64) || action;
}

function normalizeHomeStoreGroupKey(value) {
    return boundedText(value, 96).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "other";
}

function buildHomeStoreGroupId(value, index = 0) {
    const position = Math.max(0, Math.trunc(Number(index) || 0));
    return `sw-store-group-${normalizeHomeStoreGroupKey(value)}-${position}`;
}

function resolveHomeStoreCardDensity(size) {
    return ({xs: "compact", small: "compact", medium: "comfortable", wide: "comfortable", large: "spacious", full: "spacious"})[size] || "comfortable";
}

function normalizeHomeStoreCardSize(size, supported = []) {
    const options = Array.isArray(supported) && supported.length ? supported.filter((item) => typeof item === "string") : ["medium"];
    return options.includes(size) ? size : options[0];
}

function resolveHomeStoreCardLayout(size, supported = []) {
    const normalized = normalizeHomeStoreCardSize(size, supported);
    return {size: normalized, density: resolveHomeStoreCardDensity(normalized), mobile: "medium"};
}

function buildHomeStoreSourceSummary(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    const network = ({offline: labels.offline, local: labels.local, network: labels.network})[item.integration] || labels.unknown || "";
    return [boundedText(labels.source, 32), network].filter(Boolean).join(" · ");
}

function compareHomeStoreCardIdentity(left, right) {
    const a = boundedText(left?.moduleId || left?.id, 96);
    const b = boundedText(right?.moduleId || right?.id, 96);
    return a === b;
}

function dedupeHomeStoreByIdentity(cards) {
    const seen = new Set();
    return (Array.isArray(cards) ? cards : []).filter((card) => {
        const key = boundedText(card?.moduleId || card?.id, 96);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function scoreHomeStoreCard(card, query) {
    const item = normalizeHomeStoreCard(card);
    const tokens = tokenizeHomeStoreQuery(query);
    if (!tokens.length) return 0;
    return tokens.reduce((score, token) => score + (item.search === token ? 4 : item.search.startsWith(token) ? 2 : item.search.includes(token) ? 1 : 0), 0);
}

function rankHomeStoreCards(cards, query) {
    return (Array.isArray(cards) ? cards : []).map((card, index) => ({card, index, score: scoreHomeStoreCard(card, query)})).sort((a, b) => b.score - a.score || a.index - b.index).map(({card}) => card);
}

function buildHomeStoreSearchSummary(cards, query, labels = {}) {
    const list = Array.isArray(cards) ? cards : [];
    const visible = list.filter((card) => scoreHomeStoreCard(card, query) > 0 || !normalizeHomeStoreQuery(query)).length;
    return boundedText(labels.text, 128).replace("{visible}", String(visible)).replace("{total}", String(list.length));
}

function resolveHomeStoreFilterBadge(tab, labels = {}) {
    const key = normalizeHomeStoreTab(tab);
    return boundedText(labels[key], 48) || key;
}

function resolveHomeStoreKeyboardHint(surface, labels = {}) {
    const key = normalizeHomeStoreDevice(surface);
    return boundedText(labels[key], 96) || "↑↓ 选择，Enter 确认";
}

function buildHomeStoreActionSet(card, labels = {}) {
    return listHomeStoreActionOrder(card).map((action) => ({action, label: resolveHomeStoreButtonLabel(action, card, labels), enabled: isHomeStoreActionEnabled(action, card)}));
}

function normalizeHomeStoreSourceLabel(value, fallback = "来源未知") {
    return boundedText(value, 64) || fallback;
}

function normalizeHomeStoreStatusLabel(value, fallback = "状态未知") {
    return boundedText(value, 64) || fallback;
}

function buildHomeStoreTooltip(card, labels = {}) {
    const item = normalizeHomeStoreCard(card);
    return [normalizeHomeStoreCardTitle(labels.title || item.search), normalizeHomeStoreStatusLabel(labels.status || item.availability), normalizeHomeStoreSourceLabel(labels.source)].join(" · ");
}

function normalizeHomeStoreSearchState(value) {
    const source = value && typeof value === "object" ? value : {};
    return {query: normalizeHomeStoreQuery(source.query), tab: normalizeHomeStoreTab(source.tab), sort: normalizeHomeStoreSort(source.sort)};
}

function sameHomeStoreSearchState(left, right) {
    return JSON.stringify(normalizeHomeStoreSearchState(left)) === JSON.stringify(normalizeHomeStoreSearchState(right));
}

function resetHomeStoreSearchState() {
    return {query: "", tab: "all", sort: "relevance"};
}

const STORE_DENSITIES = Object.freeze(["comfortable", "compact"]);
const STORE_ACTIONS = Object.freeze(["add", "configure", "remove", "preview", "apply-size"]);
function normalizeHomeStoreDensity(value) { return STORE_DENSITIES.includes(value) ? value : "comfortable"; }
function normalizeHomeStoreAction(value) { return STORE_ACTIONS.includes(value) ? value : "preview"; }
function resolveHomeStoreDensityLabel(value, labels = {}) {
    const key = normalizeHomeStoreDensity(value);
    return boundedText(labels[key], 48) || key;
}
function buildHomeStoreFilterChip(filter, labels = {}) {
    const normalized = resolveHomeStoreFilter(filter?.tab);
    return {key: normalized.tab, label: boundedText(labels[normalized.tab], 48) || normalized.tab, active: normalized.tab !== "all"};
}
function normalizeHomeStoreResultCounts(value) {
    const source = value && typeof value === "object" ? value : {};
    const toCount = (item) => Number.isFinite(Number(item)) ? Math.max(0, Math.trunc(Number(item))) : 0;
    const total = toCount(source.total); const visible = Math.min(total, toCount(source.visible)); const added = Math.min(total, toCount(source.added));
    return {visible, total, added};
}
function buildHomeStoreResultSummary(value, template = "显示 {visible} / {total} · 已添加 {added}") {
    const counts = normalizeHomeStoreResultCounts(value);
    return boundedText(template, 160).replace("{visible}", String(counts.visible)).replace("{total}", String(counts.total)).replace("{added}", String(counts.added));
}
function resolveHomeStoreCardTone(card) {
    const item = normalizeHomeStoreCard(card);
    if (item.added) return "success";
    if (item.availability === "conditional") return "warning";
    if (item.integration === "network") return "network";
    if (item.integration === "local") return "local";
    return "neutral";
}
function buildHomeStoreCardBadges(card, labels = {}) {
    const item = normalizeHomeStoreCard(card); const badges = [];
    if (item.recommended) badges.push(boundedText(labels.recommended || "推荐", 32));
    if (item.configurable) badges.push(boundedText(labels.configurable || "可配置", 32));
    if (item.added) badges.push(boundedText(labels.added || "已添加", 32));
    return badges.filter(Boolean).slice(0, 4);
}
function isHomeStoreCardConfigurable(card) { return normalizeHomeStoreCard(card).configurable; }
function countHomeStoreByStatus(cards) {
    const counts = {added: 0, ready: 0, conditional: 0, external: 0};
    (Array.isArray(cards) ? cards : []).forEach((card) => { const item = normalizeHomeStoreCard(card); const key = item.added ? "added" : item.availability; if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1; });
    return counts;
}
function normalizeHomeStoreViewState(value) {
    const source = value && typeof value === "object" ? value : {};
    const collapsed = normalizeHomeStoreCollapsedGroups(source.collapsedGroups);
    return {query: normalizeHomeStoreQuery(source.query), tab: normalizeHomeStoreTab(source.tab), sort: normalizeHomeStoreSort(source.sort), density: normalizeHomeStoreDensity(source.density), collapsedGroups: [...collapsed].sort()};
}
function serializeHomeStoreViewState(value) { return JSON.stringify(normalizeHomeStoreViewState(value)); }
function parseHomeStoreViewState(value) { try { return normalizeHomeStoreViewState(JSON.parse(typeof value === "string" ? value : "")); } catch (_error) { return normalizeHomeStoreViewState({}); } }
function sameHomeStoreViewState(left, right) { return serializeHomeStoreViewState(left) === serializeHomeStoreViewState(right); }
function resetHomeStoreViewState() { return {query: "", tab: "all", sort: "relevance", density: "comfortable", collapsedGroups: []}; }
function toggleHomeStoreDensity(value) { return normalizeHomeStoreDensity(value) === "compact" ? "comfortable" : "compact"; }
function buildHomeStoreViewSummary(value, labels = {}) {
    const state = normalizeHomeStoreViewState(value);
    return [boundedText(labels.tab, 32), resolveHomeStoreSortLabel(state.sort, labels), state.density, state.collapsedGroups.length ? `${state.collapsedGroups.length}` : ""].filter(Boolean).join(" · ");
}

function normalizeHomeStoreTab(value) {
    return STORE_TABS.includes(value) ? value : "all";
}

function normalizeHomeStoreDevice(value) {
    return STORE_DEVICES.includes(value) ? value : "desktop";
}

function normalizeHomeStoreCategory(value) {
    return STORE_CATEGORIES.includes(value) ? value : "builtin";
}

function normalizeHomeStoreAvailability(value) {
    return STORE_AVAILABILITY.includes(value) ? value : "ready";
}

function resolveHomeStoreFilter(tab) {
    const key = normalizeHomeStoreTab(tab);
    const normalized = {
        tab: key,
        category: key === "builtin" || key === "plugin" ? key : "all",
        availability: key === "conditional" ? "conditional" : "",
        integration: STORE_INTEGRATIONS.includes(key) ? key : "",
        addedOnly: key === "added",
        recommendedOnly: key === "recommended",
        configurableOnly: key === "configurable",
    };
    if (key === "requires" || key === "optional") normalized.dependency = key === "requires" ? "required" : "optional";
    return normalized;
}

function normalizeHomeStoreCard(card) {
    const source = card && typeof card === "object" ? card : {};
    const normalized = {
        search: boundedText(source.search, 512).toLowerCase(),
        category: normalizeHomeStoreCategory(source.category),
        availability: normalizeHomeStoreAvailability(source.availability),
        integration: STORE_INTEGRATIONS.includes(source.integration) ? source.integration : "unknown",
        added: source.added === true || source.added === "true",
        configurable: source.configurable === true || source.configurable === "true",
        recommended: source.recommended === true || source.recommended === "true",
    };
    if (source.dependency === "required" || source.dependency === "optional") normalized.dependency = source.dependency;
    return normalized;
}

function matchesHomeStoreCard(card, query, filter) {
    const item = normalizeHomeStoreCard(card);
    const text = normalizeHomeStoreQuery(query);
    const active = filter && typeof filter === "object" ? filter : resolveHomeStoreFilter("all");
    return (!text || item.search.includes(text))
        && (!active.category || active.category === "all" || item.category === active.category)
        && (!active.availability || item.availability === active.availability)
        && (!active.integration || item.integration === active.integration)
        && (!active.addedOnly || item.added)
        && (!active.recommendedOnly || isHomeStoreRecommended(item))
        && (!active.configurableOnly || item.configurable)
        && (!active.dependency || item.dependency === active.dependency);
}

function isHomeStoreRecommended(card) {
    const item = normalizeHomeStoreCard(card);
    return item.recommended || (item.category === "builtin" && item.availability === "ready" && item.integration === "offline");
}

function filterHomeStoreCards(cards, query, filter) {
    if (!Array.isArray(cards)) return [];
    return cards.filter((card) => matchesHomeStoreCard(card, query, filter));
}

function isHomeStoreAdded(card) {
    return normalizeHomeStoreCard(card).added;
}

function countHomeStoreCards(cards) {
    return Array.isArray(cards) ? cards.length : 0;
}

function summarizeHomeStoreCards(cards, query, filter) {
    const all = Array.isArray(cards) ? cards : [];
    const visible = filterHomeStoreCards(all, query, filter);
    return {total: all.length, visible: visible.length, added: all.filter(isHomeStoreAdded).length};
}

function buildHomeStoreSearchText(definition, moduleId) {
    const def = definition && typeof definition === "object" ? definition : {};
    return boundedText(`${def.title || ""} ${def.description || ""} ${moduleId || ""}`, 512).toLowerCase();
}

function resolveHomeStorePreviewKind(moduleId, category) {
    if (typeof moduleId === "string" && PREVIEW_KINDS[moduleId]) return PREVIEW_KINDS[moduleId];
    return normalizeHomeStoreCategory(category) === "plugin" ? "plugin" : "list";
}

function resolveHomeStoreSourceInfo(moduleId) {
    const entry = typeof moduleId === "string" ? SOURCE_INFO[moduleId] : null;
    return entry ? {...entry} : null;
}

function normalizeHomeStorePreviewKind(value) {
    return ["calendar", "tasks", "stat", "progress", "chart", "countdown", "outline", "documents", "weather", "media", "feed", "activity", "plugin", "list"].includes(value)
        ? value : "list";
}

function resolveHomeStoreCardStatus(added, size, supportedSizes) {
    const options = Array.isArray(supportedSizes) && supportedSizes.length ? supportedSizes : ["medium"];
    const sizeKey = typeof size === "string" && options.includes(size) ? size : options[0];
    return {added: !!added, sizeKey, status: added ? "added" : "not-added"};
}

function resolveHomeStoreSizeSelection(current, supportedSizes) {
    const options = Array.isArray(supportedSizes) && supportedSizes.length ? supportedSizes.filter((item) => typeof item === "string") : ["medium"];
    const selected = typeof current === "string" && options.includes(current) ? current : options[0];
    return {options, selected};
}

function isHomeStoreSizeSupported(size, supportedSizes) {
    return Array.isArray(supportedSizes) && typeof size === "string" && supportedSizes.includes(size);
}

function normalizeHomeStoreSupportedSurfaces(value, fallback) {
    const values = Array.isArray(value) ? value : [fallback];
    return [...new Set(values.filter((item) => STORE_DEVICES.includes(item)))];
}

function isHomeStoreConditional(card) {
    return normalizeHomeStoreCard(card).availability === "conditional";
}

function isHomeStoreExternal(card) {
    return normalizeHomeStoreCard(card).availability === "external";
}

function shouldShowHomeStoreSection(visibleCount) {
    return Number.isFinite(visibleCount) && visibleCount > 0;
}

function shouldShowHomeStoreGroup(cards, query, filter) {
    return shouldShowHomeStoreSection(filterHomeStoreCards(cards, query, filter).length);
}

function normalizeHomeStoreGroupLabel(value, fallback = "Other") {
    return boundedText(value, 96) || boundedText(fallback, 96) || "Other";
}

function groupHomeStoreCards(cards, groupOf) {
    const groups = new Map();
    if (!Array.isArray(cards)) return groups;
    cards.forEach((card) => {
        const label = normalizeHomeStoreGroupLabel(typeof groupOf === "function" ? groupOf(card) : "Other");
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(card);
    });
    return groups;
}

function orderHomeStoreGroups(groups, preferred) {
    const keys = groups instanceof Map ? [...groups.keys()] : [];
    const order = Array.isArray(preferred) ? preferred : [];
    return [...order.filter((label) => keys.includes(label)), ...keys.filter((label) => !order.includes(label))];
}

function dedupeHomeStoreCards(cards) {
    if (!Array.isArray(cards)) return [];
    const seen = new Set();
    return cards.filter((card) => {
        const key = boundedText(card?.moduleId || card?.id, 128);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function normalizeHomeStoreCollapsedGroups(values) {
    if (!(values instanceof Set) && !Array.isArray(values)) return new Set();
    return new Set([...values].filter((value) => typeof value === "string" && boundedText(value, 96)));
}

function toggleHomeStoreGroup(values, label) {
    const next = normalizeHomeStoreCollapsedGroups(values);
    const key = normalizeHomeStoreGroupLabel(label);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
}

function resolveHomeStoreAction(added, configured) {
    if (added) return configured ? "configure" : "apply-size";
    return "add";
}

function getHomeStoreTabKeys() {
    return [...STORE_TABS];
}

// Configuration presentation semantics live beside the store model so the
// production graph does not gain a second runtime module for a UI-only helper.
const HOME_CONFIG_SECTIONS = Object.freeze(["content", "source", "range", "display", "options"]);
const HOME_CONFIG_KINDS = Object.freeze({
    "today-tasks": "tasks", "today-reservations": "tasks", "flashcard-due": "study",
    "fixed-document": "document", "journal-monthly": "journal", "recent-daily-notes": "journal",
    "journal-calendar": "calendar", "writing-streak": "progress", "countdown": "countdown",
    "note-stats": "insight", "today-writing": "insight", "recent-writing-activity": "insight",
    "recent-edits": "document", "document-relations-summary": "document", "current-document-outline": "document",
    "random-review": "review", "on-this-day": "review", "clipped-unread": "reading",
    "plugin-commands": "plugin", "external-weather-open-meteo": "weather",
    "external-air-quality": "stat",
    "external-anime-bangumi": "media", "external-hot-news-dailyhot": "feed",
    "external-news-newsnow": "feed", "external-news-hackernews": "feed", "external-world-clock": "clock",
    "external-status-uptimekuma": "status", "external-fx-frankfurter": "finance",
    "external-quote-daily": "insight", "external-device-battery": "device",
    "external-rss-miniflux": "feed",
    "external-rss-subscription": "feed",
    "external-ical-events": "feed",
    "external-github-contrib": "feed",
    "external-activitywatch-time": "activity",
});
const HOME_CONFIG_PLACEHOLDERS = Object.freeze({
    "external-weather-open-meteo:city": "city", "external-hot-news-dailyhot:endpoint": "dailyhot-endpoint",
    "external-news-newsnow:endpoint": "newsnow-endpoint",     "external-activitywatch-time:endpoint": "activitywatch-endpoint",
    "external-world-clock:cities": "world-clock-cities",
    "external-quote-daily:quotes": "daily-quotes",
    "external-rss-miniflux:endpoint": "miniflux-endpoint",
    "fixed-document:docId": "document", "fixed-document:title": "document-title", "countdown:title": "countdown-title",
    "plugin-commands:filter": "command-filter", "plugin-commands:query": "command-filter", "clipped-unread:tag": "tag",
});
function homeConfigText(value, max = 96) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
function resolveHomeConfigKind(moduleId, category) {
    const id = homeConfigText(moduleId, 64);
    return HOME_CONFIG_KINDS[id] || (homeConfigText(category, 32) && category !== "siyuan" ? "plugin" : "general");
}
function resolveHomeConfigSection(moduleId, fieldKey) {
    const id = homeConfigText(moduleId, 64); const key = homeConfigText(fieldKey, 64);
    if (key === "title" || key === "initialText" || (id === "countdown" && key === "targetDate") || (id === "fixed-document" && key === "docId")) return "content";
    if (["notebook", "endpoint", "city", "tag", "query", "method", "relation", "plugin"].includes(key)) return "source";
    if (["days", "overdueDays", "hours", "dayRange", "monthOffset", "maxDepth", "yearRange", "page", "windowDays", "goal", "dailyGoal", "repeat", "forecastDays"].includes(key)) return "range";
    if (key === "filter") return id === "plugin-commands" ? "source" : "options";
    if (key === "limit" || key === "maxItems" || key === "temperatureUnit" || key === "sortBy" || key === "groupByDocument" || key === "primaryMetric" || key === "metric" || key === "density" || key === "weekStart" || key === "hourFormat" || key.startsWith("show")) return "display";
    return "options";
}
function buildHomeConfigSections(schema, moduleId) {
    const groups = new Map(HOME_CONFIG_SECTIONS.map((key) => [key, []]));
    (Array.isArray(schema) ? schema : []).forEach((field) => {
        if (!field || typeof field !== "object" || !homeConfigText(field.key, 64)) return;
        groups.get(resolveHomeConfigSection(moduleId, field.key)).push(field);
    });
    return HOME_CONFIG_SECTIONS.map((key) => ({key, fields: groups.get(key)})).filter((entry) => entry.fields.length > 0);
}
function resolveHomeConfigPlaceholder(moduleId, fieldKey) {
    return HOME_CONFIG_PLACEHOLDERS[`${homeConfigText(moduleId, 64)}:${homeConfigText(fieldKey, 64)}`] || "";
}
function resolveHomeConfigHint(moduleId, field) {
    const key = homeConfigText(field?.key, 64);
    if (key === "notebook") return "notebook"; if (key === "endpoint") return moduleId === "external-activitywatch-time" ? "local-endpoint" : "network-endpoint";
    if (key === "city") return "city"; if (key === "monthOffset") return "month-offset"; if (key === "filter") return "filter";
    if (field?.type === "date") return "date"; if (field?.type === "number") return "number"; return "";
}
function homeConfigComparable(value, field) {
    if (field?.type === "number") { const number = Number(value); return Number.isFinite(number) ? Math.trunc(number) : null; }
    return value == null ? "" : String(value);
}
function summarizeHomeConfigDraft(schema, initial, draft) {
    const fields = Array.isArray(schema) ? schema.filter((field) => field && typeof field === "object" && homeConfigText(field.key, 64)) : [];
    let configured = 0; let changed = 0;
    fields.forEach((field) => { const current = homeConfigComparable(draft?.[field.key], field); const before = homeConfigComparable(initial?.[field.key], field); if (current !== "" && current !== null) configured += 1; if (current !== before) changed += 1; });
    return {total: fields.length, configured, changed};
}
function resolveHomeConfigIntegration(sourceInfo, category) {
    if (sourceInfo?.integration === "http") return "network"; if (sourceInfo?.integration === "local-bridge") return "local";
    if (sourceInfo?.integration === "direct") return "offline"; return homeConfigText(category, 32) && category !== "siyuan" ? "plugin" : "offline";
}

// Interaction resilience semantics shared by all store surfaces.
const STORE_ACTION_STATES = Object.freeze(["idle", "pending", "success", "error"]);
const STORE_ERROR_KINDS = Object.freeze(["aborted", "timeout", "offline", "unauthorized", "not-found", "invalid", "unknown"]);
const STORE_CACHE_STATES = Object.freeze(["none", "fresh", "stale", "expired"]);
const STORE_HEALTH_STATES = Object.freeze(["unknown", "healthy", "degraded", "unavailable"]);
function normalizeHomeStoreActionState(value) { return STORE_ACTION_STATES.includes(value) ? value : "idle"; }
function resolveHomeStoreActionState(action, context = {}) {
    const key = normalizeHomeStoreAction(action); const state = normalizeHomeStoreActionState(context?.state);
    if (!isHomeStoreActionEnabled(key, context?.card || context)) return "idle";
    if (state === "pending") return "pending"; if (context?.error) return "error"; if (context?.completed === true) return "success"; return state;
}
function buildHomeStoreActionFeedback(action, context = {}, labels = {}) {
    const state = resolveHomeStoreActionState(action, context); const key = normalizeHomeStoreAction(action);
    const fallback = ({add: "添加", configure: "配置", remove: "移除", preview: "预览", "apply-size": "应用尺寸"})[key] || key;
    const text = boundedText(labels[state] || labels[key] || fallback, 96) || fallback;
    return {action: key, state, text, busy: state === "pending", dismissible: state === "success" || state === "error"};
}
function normalizeHomeStoreRetryPolicy(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const maxAttempts = Number.isFinite(Number(source.maxAttempts)) ? Math.min(5, Math.max(0, Math.trunc(Number(source.maxAttempts)))) : 2;
    const baseDelayMs = Number.isFinite(Number(source.baseDelayMs)) ? Math.min(30000, Math.max(100, Math.trunc(Number(source.baseDelayMs)))) : 500;
    const factor = Number.isFinite(Number(source.factor)) ? Math.min(4, Math.max(1, Number(source.factor))) : 2;
    return {maxAttempts, baseDelayMs, factor};
}
function computeHomeStoreRetryDelay(attempt, policy = {}) { const config = normalizeHomeStoreRetryPolicy(policy); const n = Number.isFinite(Number(attempt)) ? Math.max(0, Math.trunc(Number(attempt))) : 0; return Math.min(30000, Math.round(config.baseDelayMs * Math.pow(config.factor, n))); }
function normalizeHomeStoreErrorKind(value) { return STORE_ERROR_KINDS.includes(value) ? value : "unknown"; }
function shouldRetryHomeStoreError(kind, attempt, policy = {}) { const key = normalizeHomeStoreErrorKind(kind); const config = normalizeHomeStoreRetryPolicy(policy); return ["timeout", "offline", "unknown"].includes(key) && Number(attempt) < config.maxAttempts; }
function classifyHomeStoreError(error) { const text = boundedText(error?.message || error, 160).toLowerCase(); if (/abort|cancel/.test(text)) return "aborted"; if (/timeout|timed out/.test(text)) return "timeout"; if (/offline|network|fetch|connection/.test(text)) return "offline"; if (/401|403|unauthor/.test(text)) return "unauthorized"; if (/404|not found/.test(text)) return "not-found"; if (/invalid|schema|parse/.test(text)) return "invalid"; return "unknown"; }
function resolveHomeStoreErrorMessage(kind, labels = {}) { const key = normalizeHomeStoreErrorKind(kind); return boundedText(labels[key], 128) || ({aborted: "操作已取消", timeout: "请求超时", offline: "网络不可用", unauthorized: "需要授权", "not-found": "内容不存在", invalid: "数据格式无效", unknown: "暂时无法完成"})[key]; }
function normalizeHomeStoreSourceHealth(value) { return STORE_HEALTH_STATES.includes(value) ? value : "unknown"; }
function resolveHomeStoreSourceHealthTone(value) { return ({unknown: "neutral", healthy: "success", degraded: "warning", unavailable: "error"})[normalizeHomeStoreSourceHealth(value)]; }
function buildHomeStoreSourceHealthSummary(source, health, labels = {}) { const name = boundedText(source, 64) || "来源"; const key = normalizeHomeStoreSourceHealth(health); return {source: name, health: key, tone: resolveHomeStoreSourceHealthTone(key), text: boundedText(labels[key], 96) || key}; }
function normalizeHomeStoreCacheState(value) { return STORE_CACHE_STATES.includes(value) ? value : "none"; }
function resolveHomeStoreCacheTone(value) { return ({none: "neutral", fresh: "success", stale: "warning", expired: "error"})[normalizeHomeStoreCacheState(value)]; }
function buildHomeStoreCacheLabel(value, labels = {}) { const key = normalizeHomeStoreCacheState(value); return boundedText(labels[key], 64) || key; }
function normalizeHomeStoreInstallability(value, card) { if (value === true || value === "ready") return "ready"; if (value === false || value === "blocked") return "blocked"; if (["added", "conditional", "external"].includes(value)) return value; const item = normalizeHomeStoreCard(card); return item.added ? "added" : item.availability === "external" ? "external" : item.availability === "conditional" ? "conditional" : "ready"; }
function resolveHomeStoreInstallabilityReason(value, labels = {}) { const key = normalizeHomeStoreInstallability(value); return boundedText(labels[key], 96) || ({ready: "可直接添加", added: "已添加", conditional: "完成配置后可用", external: "需外部服务", blocked: "暂不可添加"})[key]; }
function canHomeStoreInstall(card, context = {}) { const state = normalizeHomeStoreInstallability(context.installability, card); return state === "ready" || state === "conditional"; }
function buildHomeStoreInstallHint(card, context = {}, labels = {}) { const state = normalizeHomeStoreInstallability(context.installability, card); return {state, canInstall: canHomeStoreInstall(card, context), text: resolveHomeStoreInstallabilityReason(state, labels)}; }
function normalizeHomeStoreTouchTarget(value) { const n = Number(value); return Number.isFinite(n) ? Math.min(64, Math.max(32, Math.trunc(n))) : 44; }
function resolveHomeStoreTouchTargetSize(surface) { return normalizeHomeStoreDevice(surface) === "mobile" ? 48 : 40; }
function shouldUseHomeStoreSingleColumn(surface, width) { if (normalizeHomeStoreDevice(surface) === "mobile") return true; const n = Number(width); return Number.isFinite(n) && n < 560; }
function resolveHomeStorePageWindow(page, pages, radius = 2) { const total = Math.max(1, Math.trunc(Number(pages) || 1)); const current = Math.min(total, Math.max(1, Math.trunc(Number(page) || 1))); const span = Math.min(5, Math.max(1, Math.trunc(Number(radius) || 2) * 2 + 1)); const half = Math.floor(span / 2); let start = Math.max(1, current - half); let end = Math.min(total, start + span - 1); start = Math.max(1, end - span + 1); return {page: current, pages: total, start, end}; }
function buildHomeStorePaginationLabel(page, pages, labels = {}) { const window = resolveHomeStorePageWindow(page, pages); return (boundedText(labels.text, 96) || "第 {page} / {pages} 页").replace("{page}", String(window.page)).replace("{pages}", String(window.pages)); }
function normalizeHomeStoreFocusTarget(value) { return ["card", "tab", "search", "sort", "group", "empty"].includes(value) ? value : "card"; }
function resolveHomeStoreFocusTarget(status, preferred) { if (status === "empty") return "empty"; return normalizeHomeStoreFocusTarget(preferred); }
function buildHomeStoreAnnouncement(action, state, title, labels = {}) { const feedback = buildHomeStoreActionFeedback(action, {state, completed: state === "success"}, labels); return boundedText(`${boundedText(title, 96)}：${feedback.text}`, 160); }
function normalizeHomeStoreOperationLog(value, max = 20) { const list = Array.isArray(value) ? value : []; const limit = Math.min(50, Math.max(1, Math.trunc(Number(max) || 20))); return list.filter((entry) => entry && typeof entry === "object").slice(-limit).map((entry) => ({action: normalizeHomeStoreAction(entry.action), state: normalizeHomeStoreActionState(entry.state), at: Number.isFinite(Number(entry.at)) ? Number(entry.at) : 0})); }
function appendHomeStoreOperationLog(log, entry, max = 20) { return normalizeHomeStoreOperationLog([...normalizeHomeStoreOperationLog(log, max), entry], max); }
function summarizeHomeStoreOperations(log) { const list = normalizeHomeStoreOperationLog(log); return {total: list.length, success: list.filter((x) => x.state === "success").length, error: list.filter((x) => x.state === "error").length, pending: list.filter((x) => x.state === "pending").length}; }
function resolveHomeStoreRecoveryAction(errorKind) { return ({aborted: "none", timeout: "retry", offline: "retry", unauthorized: "configure", "not-found": "refresh", invalid: "refresh", unknown: "retry"})[normalizeHomeStoreErrorKind(errorKind)] || "retry"; }
function buildHomeStoreRecoveryPlan(errorKind, attempt, policy = {}) { const kind = normalizeHomeStoreErrorKind(errorKind); return {kind, action: resolveHomeStoreRecoveryAction(kind), retryable: shouldRetryHomeStoreError(kind, attempt, policy), delayMs: computeHomeStoreRetryDelay(attempt, policy)}; }

// Discovery and batch-management semantics. The UI can opt into these helpers
// without coupling selection state to persisted widget instances.
const STORE_VIEW_MODES = Object.freeze(["grid", "list", "compact"]);
const STORE_SELECTION_MODES = Object.freeze(["none", "some", "all"]);
function normalizeHomeStoreViewMode(value) { return STORE_VIEW_MODES.includes(value) ? value : "grid"; }
function resolveHomeStoreViewModeLabel(value, labels = {}) { const key = normalizeHomeStoreViewMode(value); return boundedText(labels[key], 48) || key; }
function resolveHomeStoreViewClass(value) { return `is-${normalizeHomeStoreViewMode(value)}`; }
function normalizeHomeStoreSelectionIds(values, max = 64) {
    const limit = Math.min(128, Math.max(1, Math.trunc(Number(max) || 64))); const list = Array.isArray(values) ? values : [];
    return [...new Set(list.map((value) => normalizeHomeStoreCardId(value)).filter(Boolean))].slice(0, limit);
}
function normalizeHomeStoreSelectionMode(value) { return STORE_SELECTION_MODES.includes(value) ? value : "none"; }
function toggleHomeStoreSelection(values, id, max = 64) { const next = normalizeHomeStoreSelectionIds(values, max); const key = normalizeHomeStoreCardId(id); if (!key) return next; const index = next.indexOf(key); if (index >= 0) next.splice(index, 1); else if (next.length < Math.min(128, Math.max(1, Math.trunc(Number(max) || 64)))) next.push(key); return next; }
function clearHomeStoreSelection() { return []; }
function selectHomeStoreVisible(values, visibleIds, max = 64) { const existing = normalizeHomeStoreSelectionIds(values, max); const visible = normalizeHomeStoreSelectionIds(visibleIds, max); return normalizeHomeStoreSelectionIds([...existing, ...visible], max); }
function resolveHomeStoreSelectionMode(selected, visibleIds) { const chosen = normalizeHomeStoreSelectionIds(selected); const visible = normalizeHomeStoreSelectionIds(visibleIds); if (!visible.length || !chosen.length) return "none"; const count = visible.filter((id) => chosen.includes(id)).length; return count === visible.length ? "all" : count > 0 ? "some" : "none"; }
function buildHomeStoreSelectionSummary(selected, visibleIds, labels = {}) { const chosen = normalizeHomeStoreSelectionIds(selected); const visible = normalizeHomeStoreSelectionIds(visibleIds); const mode = resolveHomeStoreSelectionMode(chosen, visible); const text = boundedText(labels[mode], 96) || ({none: "未选择组件", some: "已选择部分组件", all: "已选择当前结果"})[mode]; return {selected: chosen.length, visible: visible.length, mode, text}; }
function resolveHomeStoreSelectAllState(selected, visibleIds) { const mode = resolveHomeStoreSelectionMode(selected, visibleIds); return {checked: mode === "all", indeterminate: mode === "some", mode}; }
function normalizeHomeStoreBatchLimit(value, fallback = 8) { const n = Number(value); return Number.isFinite(n) ? Math.min(32, Math.max(1, Math.trunc(n))) : fallback; }
function canHomeStoreBatchOperate(selected, limit = 8) { return normalizeHomeStoreSelectionIds(selected, normalizeHomeStoreBatchLimit(limit)).length > 0; }
function buildHomeStoreBatchPlan(selected, action, limit = 8) { const ids = normalizeHomeStoreSelectionIds(selected, normalizeHomeStoreBatchLimit(limit)); return {action: normalizeHomeStoreAction(action), ids, accepted: ids.length > 0 && ids.length <= normalizeHomeStoreBatchLimit(limit), truncated: ids.length >= normalizeHomeStoreBatchLimit(limit)}; }
function buildHomeStoreFilterSuggestion(query, tab, labels = {}) { const text = normalizeHomeStoreQuery(query); const key = normalizeHomeStoreTab(tab); if (text) return {kind: "search", action: "clear-search", text: boundedText(labels.search, 96) || "清除搜索词"}; if (key !== "all") return {kind: "filter", action: "clear-filters", text: boundedText(labels[key], 96) || "清除当前筛选"}; return {kind: "browse", action: "open-guide", text: boundedText(labels.browse, 96) || "查看组件说明"}; }
function buildHomeStoreCardStateSummary(card, labels = {}) { const item = normalizeHomeStoreCard(card); const availability = item.availability; const integration = item.integration; return {availability, integration, configurable: item.configurable, added: item.added, text: [boundedText(labels[availability], 48) || availability, boundedText(labels[integration], 48) || integration].filter(Boolean).join(" · ")}; }
function resolveHomeStorePrimaryAction(card) { const item = normalizeHomeStoreCard(card); if (item.added) return item.configurable ? "configure" : "apply-size"; if (item.availability === "external") return "guide"; if (item.availability === "conditional") return "configure"; return "add"; }
function resolveHomeStorePrimaryActionLabel(card, labels = {}) { const action = resolveHomeStorePrimaryAction(card); return boundedText(labels[action], 64) || ({add: "添加", configure: "配置", "apply-size": "应用尺寸", guide: "查看说明"})[action]; }
function normalizeHomeStoreSetupUrl(value) { const text = boundedText(value, 512); if (!text) return ""; try { const url = new URL(text); if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))) return url.toString(); } catch (_) {} return ""; }
function buildHomeStoreSetupLink(value, labels = {}) { const href = normalizeHomeStoreSetupUrl(value); return {href, enabled: !!href, text: boundedText(labels.text, 64) || (href ? "打开设置说明" : "暂无设置链接")}; }
function summarizeHomeStoreConfigCompletion(schema, draft) { const fields = Array.isArray(schema) ? schema.filter((field) => field && typeof field === "object" && homeConfigText(field.key, 64)) : []; const missing = fields.filter((field) => { const value = draft?.[field.key]; return value == null || String(value).trim() === ""; }).map((field) => homeConfigText(field.label || field.key, 64)); return {total: fields.length, configured: fields.length - missing.length, missing: missing.slice(0, 12), complete: fields.length === 0 || missing.length === 0}; }
function buildHomeStoreConfigMissingText(schema, draft, labels = {}) { const summary = summarizeHomeStoreConfigCompletion(schema, draft); if (summary.complete) return boundedText(labels.complete, 96) || "配置已完成"; return (boundedText(labels.missing, 96) || "还需配置：{fields}").replace("{fields}", summary.missing.join("、")); }
function normalizeHomeStoreDependencyKind(value) { return ["external-api", "self-hosted-api", "local-service", "optional-data", "plugin"].includes(value) ? value : "unknown"; }
function resolveHomeStoreDependencyInfo(moduleId) { const entry = DEPENDENCY_INFO[homeConfigText(moduleId, 96)]; return entry ? {...entry, kind: normalizeHomeStoreDependencyKind(entry.kind)} : null; }
function buildHomeStoreDependencyNotice(moduleId, labels = {}) { const info = resolveHomeStoreDependencyInfo(moduleId); if (!info) return null; const prefix = info.required ? (boundedText(labels.required, 48) || "需要前置依赖") : (boundedText(labels.optional, 48) || "可选数据源"); return {...info, notice: `${prefix}：${info.name} · ${info.setup}`}; }
function listHomeStoreDependencies(moduleIds) { const list = Array.isArray(moduleIds) ? moduleIds : Object.keys(DEPENDENCY_INFO); return list.map((id) => ({moduleId: id, info: resolveHomeStoreDependencyInfo(id)})).filter((entry) => !!entry.info); }
function summarizeHomeStoreDependencies(moduleIds) {
    const entries = listHomeStoreDependencies(moduleIds);
    const kinds = {};
    let required = 0;
    let optional = 0;
    entries.forEach(({info}) => {
        if (info.required) required += 1; else optional += 1;
        kinds[info.kind] = (kinds[info.kind] || 0) + 1;
    });
    return {total: entries.length, required, optional, kinds, entries};
}
function resolveHomeStoreDependencyState(moduleId) {
    const info = resolveHomeStoreDependencyInfo(moduleId);
    return info ? (info.required ? "required" : "optional") : "none";
}
function resolveHomeStoreDependencyLabel(moduleId, labels = {}) {
    const state = resolveHomeStoreDependencyState(moduleId);
    return boundedText(labels[state] || state, 48);
}
function buildHomeStoreDependencySummary(moduleId, labels = {}) {
    const info = resolveHomeStoreDependencyInfo(moduleId);
    const state = info ? (info.required ? "required" : "optional") : "none";
    return {
        state,
        label: boundedText(labels[state] || state, 48),
        name: info ? boundedText(info.name, 96) : "",
        setup: info ? boundedText(info.setup, 256) : "",
        network: info ? boundedText(info.network, 256) : "",
        platforms: info ? boundedText(info.platforms, 96) : "",
        installUrl: info && typeof info.installUrl === "string" ? info.installUrl : "",
        projectUrl: info && typeof info.projectUrl === "string" ? info.projectUrl : "",
    };
}
function normalizeHomeStoreBatchAction(value) { return ["add", "remove", "configure"].includes(value) ? value : "add"; }
function isHomeStoreBatchEligible(card, action = "add") { const item = normalizeHomeStoreCard(card); const key = normalizeHomeStoreBatchAction(action); if (key === "add") return !item.added && item.availability === "ready"; if (key === "remove") return item.added; return item.added && item.configurable; }
function partitionHomeStoreBatchCards(cards, selectedIds, action = "add") { const selected = new Set(normalizeHomeStoreSelectionIds(selectedIds, 128)); const list = Array.isArray(cards) ? cards : []; const eligible = []; const skipped = []; list.forEach((card) => { const id = normalizeHomeStoreCardId(card?.moduleId || card?.id); if (!id || !selected.has(id)) return; (isHomeStoreBatchEligible(card, action) ? eligible : skipped).push(id); }); return {eligible: [...new Set(eligible)], skipped: [...new Set(skipped)]}; }
function buildHomeStoreBatchResult(eligible, skipped, action = "add") { const accepted = normalizeHomeStoreSelectionIds(eligible, 128); const ignored = normalizeHomeStoreSelectionIds(skipped, 128); return {action: normalizeHomeStoreBatchAction(action), accepted: accepted.length, skipped: ignored.length, ids: accepted, skippedIds: ignored, ok: accepted.length > 0}; }
function buildHomeStoreBatchResultText(result, labels = {}) { const value = result && typeof result === "object" ? result : {}; const action = normalizeHomeStoreBatchAction(value.action); const accepted = Math.max(0, Math.trunc(Number(value.accepted) || 0)); const skipped = Math.max(0, Math.trunc(Number(value.skipped) || 0)); const template = boundedText(labels[action], 128) || "已处理 {accepted} 项，跳过 {skipped} 项"; return template.replace("{accepted}", String(accepted)).replace("{skipped}", String(skipped)); }
function resolveHomeStoreBatchActionLabel(action, labels = {}) { const key = normalizeHomeStoreBatchAction(action); return boundedText(labels[key], 64) || ({add: "批量添加", remove: "批量移除", configure: "批量配置"})[key]; }
function buildHomeStoreBatchSelectionHint(selected, cards, action = "add", labels = {}) { const partition = partitionHomeStoreBatchCards(cards, selected, action); const result = buildHomeStoreBatchResult(partition.eligible, partition.skipped, action); return {...result, text: buildHomeStoreBatchResultText(result, labels)}; }
function resolveHomeStoreBatchFocusAfterResult(result) { return result?.skipped > 0 ? "selection" : result?.accepted > 0 ? "summary" : "selection"; }
function shouldKeepHomeStoreSelectionAfterBatch(result) { return Number(result?.skipped) > 0; }
function normalizeHomeStoreBatchError(value) { return ["none", "partial", "failed"].includes(value) ? value : "none"; }
function resolveHomeStoreBatchError(accepted, skipped) { const ok = Number(accepted) > 0; const ignored = Number(skipped) > 0; return !ok && ignored ? "failed" : ok && ignored ? "partial" : "none"; }
function buildHomeStoreBatchReceipt(result, error = "none") { const value = result && typeof result === "object" ? result : {}; return {action: normalizeHomeStoreBatchAction(value.action), accepted: Math.max(0, Math.trunc(Number(value.accepted) || 0)), skipped: Math.max(0, Math.trunc(Number(value.skipped) || 0)), error: normalizeHomeStoreBatchError(error)}; }

module.exports = {
    STORE_TABS, STORE_DEVICES, STORE_AVAILABILITY, STORE_CATEGORIES, STORE_INTEGRATIONS, STORE_SORTS, DEPENDENCY_INFO,
    normalizeHomeStoreQuery, normalizeHomeStoreTab, normalizeHomeStoreDevice, normalizeHomeStoreCategory,
    normalizeHomeStoreSort, normalizeHomeStoreCardId, tokenizeHomeStoreQuery, matchesHomeStoreTokens,
    resolveHomeStoreStatusRank, compareHomeStoreCards, sortHomeStoreCards, countHomeStoreByAvailability,
    countHomeStoreByIntegration, buildHomeStoreTabCounts, resolveHomeStoreCardA11y, normalizeHomeStorePage,
    sliceHomeStorePage, normalizeHomeStoreFocusIndex, moveHomeStoreFocus, serializeHomeStoreCollapsedGroups,
    parseHomeStoreCollapsedGroups, resolveHomeStoreGroupCount, isHomeStoreCardVisible,
    normalizeHomeStoreCardTitle, resolveHomeStoreSortLabel, buildHomeStoreCardMetadata, buildHomeStoreSectionSummary,
    isHomeStoreActionEnabled, resolveHomeStoreButtonLabel, normalizeHomeStoreCardOrder, findHomeStoreCardIndex,
    moveHomeStoreCard, buildHomeStoreEmptyState, resolveHomeStoreFilterDescription, serializeHomeStoreFilter,
    parseHomeStoreFilter, sameHomeStoreFilter, mergeHomeStoreFilters, resetHomeStoreFilter,
    resolveHomeStoreStatusTone, resolveHomeStoreIntegrationTone, resolveHomeStoreActionPriority, listHomeStoreActionOrder,
    normalizeHomeStoreHighlightText, buildHomeStoreHighlightRanges, buildHomeStoreHighlightSegments,
    resolveHomeStoreEmptyAction, buildHomeStoreEmptyActionLabel, normalizeHomeStoreGroupKey, buildHomeStoreGroupId,
    resolveHomeStoreCardDensity, normalizeHomeStoreCardSize, resolveHomeStoreCardLayout, buildHomeStoreSourceSummary,
    compareHomeStoreCardIdentity, dedupeHomeStoreByIdentity,
    scoreHomeStoreCard, rankHomeStoreCards, buildHomeStoreSearchSummary, resolveHomeStoreFilterBadge,
    resolveHomeStoreKeyboardHint, buildHomeStoreActionSet, normalizeHomeStoreSourceLabel,
    normalizeHomeStoreStatusLabel, buildHomeStoreTooltip, normalizeHomeStoreSearchState,
    sameHomeStoreSearchState, resetHomeStoreSearchState,
    normalizeHomeStoreAvailability, resolveHomeStoreFilter, normalizeHomeStoreCard, matchesHomeStoreCard,
    filterHomeStoreCards, isHomeStoreAdded, isHomeStoreRecommended, countHomeStoreCards, summarizeHomeStoreCards, buildHomeStoreSearchText,
    resolveHomeStorePreviewKind, resolveHomeStoreSourceInfo, normalizeHomeStorePreviewKind, resolveHomeStoreCardStatus,
    resolveHomeStoreSizeSelection, isHomeStoreSizeSupported, normalizeHomeStoreSupportedSurfaces,
    isHomeStoreConditional, isHomeStoreExternal, shouldShowHomeStoreSection, shouldShowHomeStoreGroup,
    normalizeHomeStoreGroupLabel, groupHomeStoreCards, orderHomeStoreGroups, dedupeHomeStoreCards,
    normalizeHomeStoreCollapsedGroups, toggleHomeStoreGroup, resolveHomeStoreAction, getHomeStoreTabKeys,
    resolveHomeConfigKind, resolveHomeConfigSection, buildHomeConfigSections, resolveHomeConfigPlaceholder,
    resolveHomeConfigHint, summarizeHomeConfigDraft, resolveHomeConfigIntegration,
    STORE_DENSITIES, STORE_ACTIONS, normalizeHomeStoreDensity, normalizeHomeStoreAction, resolveHomeStoreDensityLabel,
    buildHomeStoreFilterChip, normalizeHomeStoreResultCounts, buildHomeStoreResultSummary, resolveHomeStoreCardTone,
    buildHomeStoreCardBadges, isHomeStoreCardConfigurable, countHomeStoreByStatus, normalizeHomeStoreViewState, serializeHomeStoreViewState,
    parseHomeStoreViewState, sameHomeStoreViewState, resetHomeStoreViewState, toggleHomeStoreDensity, buildHomeStoreViewSummary,
    STORE_ACTION_STATES, STORE_ERROR_KINDS, STORE_CACHE_STATES, STORE_HEALTH_STATES,
    normalizeHomeStoreActionState, resolveHomeStoreActionState, buildHomeStoreActionFeedback,
    normalizeHomeStoreRetryPolicy, computeHomeStoreRetryDelay, normalizeHomeStoreErrorKind,
    shouldRetryHomeStoreError, classifyHomeStoreError, resolveHomeStoreErrorMessage,
    normalizeHomeStoreSourceHealth, resolveHomeStoreSourceHealthTone, buildHomeStoreSourceHealthSummary,
    normalizeHomeStoreCacheState, resolveHomeStoreCacheTone, buildHomeStoreCacheLabel,
    normalizeHomeStoreInstallability, resolveHomeStoreInstallabilityReason, canHomeStoreInstall, buildHomeStoreInstallHint,
    normalizeHomeStoreTouchTarget, resolveHomeStoreTouchTargetSize, shouldUseHomeStoreSingleColumn,
    resolveHomeStorePageWindow, buildHomeStorePaginationLabel, normalizeHomeStoreFocusTarget, resolveHomeStoreFocusTarget,
    buildHomeStoreAnnouncement, normalizeHomeStoreOperationLog, appendHomeStoreOperationLog, summarizeHomeStoreOperations,
    resolveHomeStoreRecoveryAction, buildHomeStoreRecoveryPlan,
    STORE_VIEW_MODES, STORE_SELECTION_MODES, normalizeHomeStoreViewMode, resolveHomeStoreViewModeLabel,
    resolveHomeStoreViewClass, normalizeHomeStoreSelectionIds, normalizeHomeStoreSelectionMode,
    toggleHomeStoreSelection, clearHomeStoreSelection, selectHomeStoreVisible, resolveHomeStoreSelectionMode,
    buildHomeStoreSelectionSummary, resolveHomeStoreSelectAllState, normalizeHomeStoreBatchLimit,
    canHomeStoreBatchOperate, buildHomeStoreBatchPlan, buildHomeStoreFilterSuggestion,
    buildHomeStoreCardStateSummary, resolveHomeStorePrimaryAction, resolveHomeStorePrimaryActionLabel,
    normalizeHomeStoreSetupUrl, buildHomeStoreSetupLink, summarizeHomeStoreConfigCompletion,
    buildHomeStoreConfigMissingText,
    normalizeHomeStoreDependencyKind, resolveHomeStoreDependencyInfo, buildHomeStoreDependencyNotice, listHomeStoreDependencies, summarizeHomeStoreDependencies, resolveHomeStoreDependencyState, resolveHomeStoreDependencyLabel, buildHomeStoreDependencySummary,
    normalizeHomeStoreBatchAction, isHomeStoreBatchEligible, partitionHomeStoreBatchCards,
    buildHomeStoreBatchResult, buildHomeStoreBatchResultText, resolveHomeStoreBatchActionLabel,
    buildHomeStoreBatchSelectionHint, resolveHomeStoreBatchFocusAfterResult, shouldKeepHomeStoreSelectionAfterBatch,
    normalizeHomeStoreBatchError, resolveHomeStoreBatchError, buildHomeStoreBatchReceipt,
};
