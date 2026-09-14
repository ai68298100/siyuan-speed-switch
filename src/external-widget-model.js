"use strict";

// 外部生活组件目录只描述来源、权限和运行条件，不在这里发起网络请求。
// 商店可以先据此诚实展示“可直接使用 / 需配置 / 需本地桥接 / 仅参考”，
// 等具体 provider 通过独立适配器和真实宿主验收后再进入生产组件列表。

const EXTERNAL_WIDGET_CATEGORIES = Object.freeze(["time", "weather", "trending", "holiday", "media", "activity"]);
const EXTERNAL_WIDGET_AVAILABILITY = Object.freeze(["builtin", "external", "conditional", "bridge", "reference"]);
const EXTERNAL_WIDGET_AUTH = Object.freeze(["none", "api-key", "user-endpoint", "local-service"]);
const EXTERNAL_WIDGET_PLATFORMS = Object.freeze(["desktop", "sidebar", "mobile"]);
const EXTERNAL_WIDGET_INTEGRATIONS = Object.freeze(["direct", "http", "local-bridge", "reference"]);
const EXTERNAL_WIDGET_HEALTH = Object.freeze(["unknown", "healthy", "cached", "stale", "offline", "error"]);
const EXTERNAL_WIDGET_ACTIONS = Object.freeze(["add", "configure", "start-service", "install-plugin", "learn-more", "retry"]);
const EXTERNAL_WIDGET_STATE_VERSION = 1;
const EXTERNAL_WIDGET_HISTORY_MAX = 16;
const EXTERNAL_WIDGET_FRESHNESS = Object.freeze(["unknown", "fresh", "aging", "expired"]);
const EXTERNAL_WIDGET_ERROR_KINDS = Object.freeze(["none", "network", "timeout", "configuration", "service", "response", "unknown"]);
const EXTERNAL_WIDGET_RETRY_MAX = 8;
const EXTERNAL_WIDGET_REFRESH_STATES = Object.freeze(["idle", "queued", "running", "succeeded", "failed", "cancelled", "skipped"]);
const EXTERNAL_WIDGET_REFRESH_QUEUE_MAX = 16;

function catalogEntry(entry) {
    return Object.freeze({
        ...entry,
        platforms: Object.freeze([...(entry.platforms || [])]),
        sizes: Object.freeze([...(entry.sizes || [])]),
    });
}

const EXTERNAL_WIDGET_CATALOG = Object.freeze([
    catalogEntry({
        moduleId: "external-local-time",
        title: "时间与日期",
        category: "time",
        availability: "builtin",
        auth: "none",
        integration: "direct",
        providerName: "浏览器 Intl / SiYuan runtime",
        sourceUrl: "https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat",
        license: "platform",
        privacy: "local-only",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["xs", "small", "medium"],
        description: "无需联网的本地时间、日期和星期小组件",
    }),
    catalogEntry({
        moduleId: "external-weather-open-meteo",
        title: "近期天气",
        category: "weather",
        availability: "external",
        auth: "none",
        integration: "http",
        providerName: "Open-Meteo",
        sourceUrl: "https://github.com/open-meteo/open-meteo",
        license: "AGPL-3.0",
        privacy: "location-only",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        description: "按用户选择的城市读取当前天气与短期预报；不上传笔记内容",
    }),
    catalogEntry({
        moduleId: "external-hot-news-dailyhot",
        title: "热搜事件",
        category: "trending",
        availability: "external",
        auth: "user-endpoint",
        integration: "http",
        providerName: "DailyHotApi",
        sourceUrl: "https://github.com/imsyy/DailyHotApi",
        license: "MIT",
        privacy: "endpoint-only",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        description: "聚合微博、知乎、B站等热榜；默认公共服务不作为稳定性保证，支持用户自建地址",
    }),
    catalogEntry({
        moduleId: "external-news-newsnow",
        title: "实时新闻",
        category: "trending",
        availability: "external",
        auth: "user-endpoint",
        integration: "http",
        providerName: "NewsNow",
        sourceUrl: "https://github.com/ourongxing/newsnow",
        license: "MIT",
        privacy: "endpoint-only",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["medium", "wide", "large"],
        description: "适合自部署后提供缓存和来源管理的新闻阅读组件",
    }),
    catalogEntry({
        moduleId: "external-holiday-cn",
        title: "中国节假日",
        category: "holiday",
        availability: "external",
        auth: "none",
        integration: "http",
        providerName: "holiday-cn",
        sourceUrl: "https://github.com/NateScarlet/holiday-cn",
        license: "MIT",
        privacy: "none",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium"],
        description: "读取国务院公告整理的节假日和调休数据，可用于日历标记",
    }),
    catalogEntry({
        moduleId: "external-movie-tmdb",
        title: "电影推荐",
        category: "media",
        availability: "conditional",
        auth: "api-key",
        integration: "http",
        providerName: "TMDB API",
        sourceUrl: "https://developer.themoviedb.org/docs",
        license: "TMDB API terms",
        privacy: "preferences-only",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["medium", "wide", "large"],
        description: "需要用户自己的 TMDB API Key；海报和片名展示必须遵守 TMDB attribution 要求",
    }),
    catalogEntry({
        moduleId: "external-anime-bangumi",
        title: "每日放送",
        category: "media",
        availability: "external",
        auth: "none",
        integration: "http",
        providerName: "Bangumi API",
        sourceUrl: "https://github.com/bangumi/api",
        license: "API terms",
        privacy: "none",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["medium", "wide", "large", "full"],
        description: "读取 Bangumi 兼容日历接口并按本地星期展示每日放送；不宣称个性化推荐",
    }),
    catalogEntry({
        moduleId: "external-activitywatch-time",
        title: "使用时长",
        category: "activity",
        availability: "external",
        auth: "local-service",
        integration: "local-bridge",
        providerName: "ActivityWatch",
        sourceUrl: "https://github.com/ActivityWatch/activitywatch",
        license: "MPL-2.0",
        privacy: "local-only",
        platforms: ["desktop", "sidebar"],
        sizes: ["small", "medium", "wide"],
        description: "已接入用户本机 ActivityWatch 聚合查询，仅显示应用名和时长；不读取窗口标题，移动端不宣称支持",
    }),
    catalogEntry({
        moduleId: "external-active-window",
        title: "当前应用状态",
        category: "activity",
        availability: "reference",
        auth: "local-service",
        integration: "reference",
        providerName: "get-windows",
        sourceUrl: "https://github.com/sindresorhus/get-windows",
        license: "MIT",
        privacy: "local-only",
        platforms: ["desktop"],
        sizes: ["small", "medium"],
        description: "原生 Node/Electron 能读取活动窗口，但思源插件沙箱不能直接装载，暂列技术参考",
    }),
]);

function boundedText(value, max = 256) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
        : "";
}

function normalizeExternalWidgetCategory(value) {
    return EXTERNAL_WIDGET_CATEGORIES.includes(value) ? value : "time";
}

function normalizeExternalWidgetAvailability(value) {
    return EXTERNAL_WIDGET_AVAILABILITY.includes(value) ? value : "reference";
}

function normalizeExternalWidgetAuth(value) {
    return EXTERNAL_WIDGET_AUTH.includes(value) ? value : "none";
}

function normalizeExternalWidgetIntegration(value) {
    return EXTERNAL_WIDGET_INTEGRATIONS.includes(value) ? value : "reference";
}

function normalizeExternalWidgetPlatforms(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => EXTERNAL_WIDGET_PLATFORMS.includes(item)))];
}

function normalizeExternalWidget(entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    const platforms = normalizeExternalWidgetPlatforms(source.platforms);
    const sizes = Array.isArray(source.sizes)
        ? [...new Set(source.sizes.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).slice(0, 8))]
        : [];
    return {
        moduleId: boundedText(source.moduleId, 96),
        title: boundedText(source.title, 96),
        category: normalizeExternalWidgetCategory(source.category),
        availability: normalizeExternalWidgetAvailability(source.availability),
        auth: normalizeExternalWidgetAuth(source.auth),
        integration: normalizeExternalWidgetIntegration(source.integration),
        providerName: boundedText(source.providerName, 128),
        sourceUrl: boundedText(source.sourceUrl, 512),
        license: boundedText(source.license, 96),
        privacy: boundedText(source.privacy, 96),
        platforms,
        sizes,
        description: boundedText(source.description, 512),
    };
}

function listExternalWidgetCatalog() {
    return EXTERNAL_WIDGET_CATALOG.map((entry) => normalizeExternalWidget(entry));
}

function findExternalWidget(moduleId) {
    const key = boundedText(moduleId, 96);
    const entry = EXTERNAL_WIDGET_CATALOG.find((item) => item.moduleId === key);
    return entry ? normalizeExternalWidget(entry) : null;
}

function filterExternalWidgets(entries, filter = {}) {
    const source = Array.isArray(entries) ? entries : [];
    const query = boundedText(filter.query, 128).toLowerCase();
    const category = filter.category ? normalizeExternalWidgetCategory(filter.category) : "";
    const availability = filter.availability ? normalizeExternalWidgetAvailability(filter.availability) : "";
    const platform = EXTERNAL_WIDGET_PLATFORMS.includes(filter.platform) ? filter.platform : "";
    return source.map(normalizeExternalWidget).filter((entry) => {
        const search = `${entry.moduleId} ${entry.title} ${entry.providerName} ${entry.description}`.toLowerCase();
        return (!query || search.includes(query))
            && (!category || entry.category === category)
            && (!availability || entry.availability === availability)
            && (!platform || entry.platforms.includes(platform));
    });
}

function summarizeExternalWidgets(entries = EXTERNAL_WIDGET_CATALOG) {
    const normalized = Array.isArray(entries) ? entries.map(normalizeExternalWidget) : [];
    return {
        total: normalized.length,
        builtin: normalized.filter((entry) => entry.availability === "builtin").length,
        external: normalized.filter((entry) => entry.availability === "external").length,
        conditional: normalized.filter((entry) => entry.availability === "conditional").length,
        bridge: normalized.filter((entry) => entry.availability === "bridge").length,
        reference: normalized.filter((entry) => entry.availability === "reference").length,
        needsConfiguration: normalized.filter((entry) => entry.auth !== "none").length,
    };
}

function groupExternalWidgets(entries = EXTERNAL_WIDGET_CATALOG) {
    const groups = new Map();
    (Array.isArray(entries) ? entries : []).map(normalizeExternalWidget).forEach((entry) => {
        if (!groups.has(entry.category)) groups.set(entry.category, []);
        groups.get(entry.category).push(entry);
    });
    return groups;
}

function resolveExternalWidgetStoreState(entry, options = {}) {
    const normalized = normalizeExternalWidget(entry);
    const configured = options.configured === true;
    const endpoint = options.endpointAvailable === true;
    let status = normalized.availability;
    if (normalized.availability === "conditional") status = configured ? "ready" : "needs-config";
    if (normalized.availability === "bridge") status = endpoint ? "ready" : "needs-local-service";
    if (normalized.availability === "reference") status = "reference";
    return {
        moduleId: normalized.moduleId,
        status,
        canAdd: ["builtin", "external", "ready"].includes(status),
        requiresSetup: ["needs-config", "needs-local-service"].includes(status),
    };
}

function normalizeExternalWidgetHealth(value) {
    return EXTERNAL_WIDGET_HEALTH.includes(value) ? value : "unknown";
}

function normalizeExternalWidgetReason(value) {
    return boundedText(value, 96).replace(/[^\w\-. :/]/g, "");
}

function resolveExternalWidgetAction(state, options = {}) {
    const current = state && typeof state === "object" ? state : {};
    if (current.status === "needs-config") return "configure";
    if (current.status === "needs-local-service") return "start-service";
    if (current.status === "reference") return "learn-more";
    if (options.error === true || ["error", "stale"].includes(options.health)) return "retry";
    return current.canAdd === true ? "add" : "learn-more";
}

function resolveExternalWidgetStatusLabel(status) {
    const labels = {
        builtin: "可直接使用", external: "需联网", ready: "已就绪", "needs-config": "需要配置",
        "needs-local-service": "需要本机服务", reference: "仅供参考", unavailable: "暂不可用",
    };
    return labels[status] || "状态未知";
}

function describeExternalWidgetStoreState(entry, options = {}) {
    const base = resolveExternalWidgetStoreState(entry, options);
    const health = normalizeExternalWidgetHealth(options.health);
    const reason = normalizeExternalWidgetReason(options.reason);
    const action = resolveExternalWidgetAction(base, {error: options.error === true, health});
    const status = health === "offline" && base.status === "external" ? "unavailable" : base.status;
    return {
        ...base,
        status,
        health,
        action,
        label: resolveExternalWidgetStatusLabel(status),
        reason,
        canRetry: ["error", "stale", "offline"].includes(health),
    };
}

function isExternalWidgetSelectable(state) {
    const current = state && typeof state === "object" ? state : {};
    return current.canAdd === true && !["reference", "unavailable"].includes(current.status);
}

function summarizeExternalWidgetStates(states) {
    const result = {total: 0, selectable: 0, needsSetup: 0, unavailable: 0, reference: 0, healthy: 0, degraded: 0};
    (Array.isArray(states) ? states : []).forEach((state) => {
        if (!state || typeof state !== "object") return;
        result.total += 1;
        if (isExternalWidgetSelectable(state)) result.selectable += 1;
        if (state.requiresSetup === true) result.needsSetup += 1;
        if (state.status === "unavailable") result.unavailable += 1;
        if (state.status === "reference") result.reference += 1;
        if (state.health === "healthy") result.healthy += 1;
        if (["error", "stale", "offline"].includes(state.health)) result.degraded += 1;
    });
    return result;
}

function sortExternalWidgetCatalog(entries, order = "title") {
    const list = Array.isArray(entries) ? entries.map(normalizeExternalWidget) : [];
    const rank = {builtin: 0, external: 1, conditional: 2, bridge: 3, reference: 4};
    return list.map((entry, index) => ({entry, index})).sort((a, b) => {
        const left = order === "availability" ? (rank[a.entry.availability] ?? 9) : a.entry.title;
        const right = order === "availability" ? (rank[b.entry.availability] ?? 9) : b.entry.title;
        return (typeof left === "number" ? left - right : String(left).localeCompare(String(right))) || a.index - b.index;
    }).map(({entry}) => entry);
}

function buildExternalWidgetGuideLink(moduleId, base = "docs/component-store-guide.md") {
    const id = boundedText(moduleId, 96).replace(/[^a-zA-Z0-9-]/g, "");
    const path = boundedText(base, 256).replace(/[?#].*$/, "");
    return id && path ? `${path}#${id}` : path;
}

function getExternalWidgetSetupSteps(entry) {
    const item = normalizeExternalWidget(entry);
    const steps = [];
    if (item.auth === "api-key") steps.push("填写个人 API Key");
    if (item.auth === "user-endpoint") steps.push("填写可信的自建服务地址");
    if (item.auth === "local-service") steps.push("启动本机服务并确认回环端口");
    if (item.integration === "http") steps.push("确认网络与隐私范围");
    if (item.availability === "reference") steps.push("仅阅读技术参考，不可直接添加");
    return steps;
}

function resolveExternalWidgetPrivacyLevel(value) {
    return ["none", "local-only", "location-only", "endpoint-only", "preferences-only"].includes(value) ? value : "unknown";
}

function normalizeExternalWidgetStateList(entries, options = {}) {
    return (Array.isArray(entries) ? entries : []).map((entry) => describeExternalWidgetStoreState(entry, options));
}

function normalizeExternalWidgetTimestamp(value, fallback = 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.min(8640000000000, Math.trunc(numeric));
    return Number.isFinite(Number(fallback)) ? Math.max(0, Math.trunc(Number(fallback))) : 0;
}

function normalizeExternalWidgetSnapshot(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        version: EXTERNAL_WIDGET_STATE_VERSION,
        moduleId: boundedText(source.moduleId, 96),
        status: boundedText(source.status, 48) || "unknown",
        health: normalizeExternalWidgetHealth(source.health),
        action: EXTERNAL_WIDGET_ACTIONS.includes(source.action) ? source.action : "learn-more",
        reason: normalizeExternalWidgetReason(source.reason),
        timestamp: normalizeExternalWidgetTimestamp(source.timestamp),
    };
}

function buildExternalWidgetSnapshot(entry, options = {}) {
    const state = describeExternalWidgetStoreState(entry, options);
    return normalizeExternalWidgetSnapshot({...state, moduleId: entry?.moduleId, timestamp: options.timestamp});
}

function isExternalWidgetSnapshotCompatible(value) {
    const snapshot = value && typeof value === "object" ? value : null;
    return !!snapshot && snapshot.version === EXTERNAL_WIDGET_STATE_VERSION
        && typeof snapshot.moduleId === "string" && snapshot.moduleId.length <= 96
        && EXTERNAL_WIDGET_HEALTH.includes(snapshot.health)
        && EXTERNAL_WIDGET_ACTIONS.includes(snapshot.action);
}

function serializeExternalWidgetSnapshot(value) {
    return JSON.stringify(normalizeExternalWidgetSnapshot(value));
}

function parseExternalWidgetSnapshot(value) {
    try {
        const parsed = JSON.parse(typeof value === "string" ? value : "");
        return isExternalWidgetSnapshotCompatible(parsed) ? normalizeExternalWidgetSnapshot(parsed) : normalizeExternalWidgetSnapshot(null);
    } catch (_) {
        return normalizeExternalWidgetSnapshot(null);
    }
}

function diffExternalWidgetSnapshots(previous, current) {
    const left = normalizeExternalWidgetSnapshot(previous);
    const right = normalizeExternalWidgetSnapshot(current);
    return {
        moduleId: right.moduleId || left.moduleId,
        changed: left.status !== right.status || left.health !== right.health || left.action !== right.action || left.reason !== right.reason,
        statusChanged: left.status !== right.status,
        healthChanged: left.health !== right.health,
        actionChanged: left.action !== right.action,
        reasonChanged: left.reason !== right.reason,
    };
}

function buildExternalWidgetTransition(previous, current) {
    const diff = diffExternalWidgetSnapshots(previous, current);
    return {...diff, type: diff.changed ? "changed" : "unchanged"};
}

function normalizeExternalWidgetHistory(value) {
    const list = Array.isArray(value) ? value : [];
    return list.map(normalizeExternalWidgetSnapshot).filter((item) => item.moduleId).slice(-EXTERNAL_WIDGET_HISTORY_MAX);
}

function appendExternalWidgetSnapshot(history, snapshot) {
    const next = normalizeExternalWidgetHistory(history);
    const item = normalizeExternalWidgetSnapshot(snapshot);
    if (!item.moduleId) return next;
    next.push(item);
    return next.slice(-EXTERNAL_WIDGET_HISTORY_MAX);
}

function trimExternalWidgetHistory(history, max = EXTERNAL_WIDGET_HISTORY_MAX) {
    const limit = Math.min(EXTERNAL_WIDGET_HISTORY_MAX, Math.max(1, Math.trunc(Number(max)) || EXTERNAL_WIDGET_HISTORY_MAX));
    return normalizeExternalWidgetHistory(history).slice(-limit);
}

function latestExternalWidgetSnapshot(history, moduleId = "") {
    const key = boundedText(moduleId, 96);
    const list = normalizeExternalWidgetHistory(history).filter((item) => !key || item.moduleId === key);
    return list.length ? list[list.length - 1] : null;
}

function selectExternalWidgetHistory(history, health, limit = EXTERNAL_WIDGET_HISTORY_MAX) {
    const key = normalizeExternalWidgetHealth(health);
    const max = Math.min(EXTERNAL_WIDGET_HISTORY_MAX, Math.max(1, Math.trunc(Number(limit)) || EXTERNAL_WIDGET_HISTORY_MAX));
    return normalizeExternalWidgetHistory(history).filter((item) => item.health === key).slice(-max);
}

function summarizeExternalWidgetHistory(history) {
    const list = normalizeExternalWidgetHistory(history);
    const counts = Object.fromEntries(EXTERNAL_WIDGET_HEALTH.map((key) => [key, 0]));
    list.forEach((item) => { counts[item.health] += 1; });
    return {version: EXTERNAL_WIDGET_STATE_VERSION, total: list.length, latest: list.length ? list[list.length - 1] : null, counts};
}

function mergeExternalWidgetSnapshots(...values) {
    const map = new Map();
    values.flatMap((value) => Array.isArray(value) ? value : [value]).map(normalizeExternalWidgetSnapshot).forEach((item) => {
        if (!item.moduleId) return;
        const current = map.get(item.moduleId);
        if (!current || item.timestamp >= current.timestamp) map.set(item.moduleId, item);
    });
    return [...map.values()].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

function serializeExternalWidgetHistory(history) {
    return JSON.stringify({version: EXTERNAL_WIDGET_STATE_VERSION, snapshots: normalizeExternalWidgetHistory(history)});
}

function parseExternalWidgetHistory(value) {
    try {
        const parsed = JSON.parse(typeof value === "string" ? value : "");
        return parsed?.version === EXTERNAL_WIDGET_STATE_VERSION ? normalizeExternalWidgetHistory(parsed.snapshots) : [];
    } catch (_) {
        return [];
    }
}

function externalWidgetHealthRank(value) {
    const ranks = {error: 0, offline: 1, stale: 2, unknown: 3, cached: 4, healthy: 5};
    return ranks[normalizeExternalWidgetHealth(value)] ?? 3;
}

function compareExternalWidgetHealth(left, right) {
    return Math.sign(externalWidgetHealthRank(left) - externalWidgetHealthRank(right));
}

function normalizeExternalWidgetTtl(value, fallback = 15 * 60 * 1000) {
    const numeric = Math.trunc(Number(value));
    if (!Number.isFinite(numeric)) return Math.min(24 * 60 * 60 * 1000, Math.max(60 * 1000, Math.trunc(Number(fallback)) || 15 * 60 * 1000));
    return Math.min(24 * 60 * 60 * 1000, Math.max(60 * 1000, numeric));
}

function externalWidgetSnapshotAge(snapshot, now = Date.now()) {
    const timestamp = normalizeExternalWidgetTimestamp(snapshot?.timestamp);
    const current = normalizeExternalWidgetTimestamp(now, Date.now());
    return timestamp ? Math.max(0, current - timestamp) : -1;
}

function resolveExternalWidgetFreshness(snapshot, ttl, now = Date.now()) {
    const age = externalWidgetSnapshotAge(snapshot, now);
    if (age < 0) return "unknown";
    const limit = normalizeExternalWidgetTtl(ttl);
    if (age <= limit) return "fresh";
    return age <= limit * 2 ? "aging" : "expired";
}

function normalizeExternalWidgetRetryAttempt(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) ? Math.min(EXTERNAL_WIDGET_RETRY_MAX, Math.max(0, numeric)) : 0;
}

function externalWidgetRetryDelay(attempt, base = 1000) {
    const count = normalizeExternalWidgetRetryAttempt(attempt);
    const seed = Math.min(30000, Math.max(250, Math.trunc(Number(base)) || 1000));
    return Math.min(5 * 60 * 1000, seed * (2 ** count));
}

function shouldRetryExternalWidget(health, attempt = 0) {
    return ["error", "offline", "stale"].includes(normalizeExternalWidgetHealth(health))
        && normalizeExternalWidgetRetryAttempt(attempt) < EXTERNAL_WIDGET_RETRY_MAX;
}

function buildExternalWidgetRetryPlan(snapshot, options = {}) {
    const item = normalizeExternalWidgetSnapshot(snapshot);
    const attempt = normalizeExternalWidgetRetryAttempt(options.attempt);
    const retryable = shouldRetryExternalWidget(item.health, attempt);
    const delay = retryable ? externalWidgetRetryDelay(attempt, options.baseDelay) : 0;
    const now = normalizeExternalWidgetTimestamp(options.now, Date.now());
    return {version: 1, moduleId: item.moduleId, attempt, retryable, delay, retryAt: retryable ? now + delay : 0};
}

function normalizeExternalWidgetErrorKind(value) {
    return EXTERNAL_WIDGET_ERROR_KINDS.includes(value) ? value : "unknown";
}

function classifyExternalWidgetError(value) {
    const reason = normalizeExternalWidgetReason(value).toLowerCase();
    if (!reason) return "none";
    if (/timeout|timed out|deadline/.test(reason)) return "timeout";
    if (/config|endpoint|api.?key|city/.test(reason)) return "configuration";
    if (/service|activitywatch|localhost|127\.0\.0\.1/.test(reason)) return "service";
    if (/network|fetch|offline|dns/.test(reason)) return "network";
    if (/response|payload|json|status/.test(reason)) return "response";
    return "unknown";
}

function nextExternalWidgetRefreshAt(snapshot, ttl, now = Date.now()) {
    const item = normalizeExternalWidgetSnapshot(snapshot);
    const current = normalizeExternalWidgetTimestamp(now, Date.now());
    return item.timestamp ? Math.max(current, item.timestamp + normalizeExternalWidgetTtl(ttl)) : current;
}

function isExternalWidgetRefreshDue(snapshot, ttl, now = Date.now()) {
    return nextExternalWidgetRefreshAt(snapshot, ttl, now) <= normalizeExternalWidgetTimestamp(now, Date.now());
}

function selectExternalWidgetDisplaySnapshot(previous, current) {
    const left = normalizeExternalWidgetSnapshot(previous);
    const right = normalizeExternalWidgetSnapshot(current);
    if (!left.moduleId) return right;
    if (!right.moduleId || left.moduleId !== right.moduleId) return left;
    if (right.timestamp < left.timestamp) return left;
    if (right.health === "error" && ["healthy", "cached", "stale"].includes(left.health)) {
        return {...left, health: "stale", reason: right.reason, timestamp: right.timestamp};
    }
    return right;
}

function sortExternalWidgetSnapshotsByHealth(snapshots) {
    return (Array.isArray(snapshots) ? snapshots : []).map(normalizeExternalWidgetSnapshot)
        .filter((item) => item.moduleId)
        .sort((a, b) => externalWidgetHealthRank(b.health) - externalWidgetHealthRank(a.health) || a.moduleId.localeCompare(b.moduleId));
}

function groupExternalWidgetSnapshotsByHealth(snapshots) {
    const groups = new Map(EXTERNAL_WIDGET_HEALTH.map((health) => [health, []]));
    sortExternalWidgetSnapshotsByHealth(snapshots).forEach((item) => groups.get(item.health).push(item));
    return groups;
}

function summarizeExternalWidgetRefresh(snapshots, ttl, now = Date.now()) {
    const list = (Array.isArray(snapshots) ? snapshots : []).map(normalizeExternalWidgetSnapshot).filter((item) => item.moduleId);
    const due = list.filter((item) => isExternalWidgetRefreshDue(item, ttl, now)).length;
    const retryable = list.filter((item) => shouldRetryExternalWidget(item.health)).length;
    return {version: 1, total: list.length, due, retryable, fresh: list.length - due};
}

function normalizeExternalWidgetRefreshState(value) {
    return EXTERNAL_WIDGET_REFRESH_STATES.includes(value) ? value : "idle";
}

function normalizeExternalWidgetPriority(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) ? Math.min(3, Math.max(0, numeric)) : 1;
}

function normalizeExternalWidgetRefreshEntry(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        moduleId: boundedText(source.moduleId, 96),
        state: normalizeExternalWidgetRefreshState(source.state),
        priority: normalizeExternalWidgetPriority(source.priority),
        requestedAt: normalizeExternalWidgetTimestamp(source.requestedAt),
        attempt: normalizeExternalWidgetRetryAttempt(source.attempt),
        reason: normalizeExternalWidgetReason(source.reason),
    };
}

function normalizeExternalWidgetRefreshQueue(value) {
    return (Array.isArray(value) ? value : []).map(normalizeExternalWidgetRefreshEntry)
        .filter((item) => item.moduleId).slice(0, EXTERNAL_WIDGET_REFRESH_QUEUE_MAX);
}

function enqueueExternalWidgetRefresh(queue, entry, now = Date.now()) {
    const current = normalizeExternalWidgetRefreshQueue(queue);
    const item = normalizeExternalWidgetRefreshEntry({...entry, requestedAt: entry?.requestedAt || now, state: "queued"});
    if (!item.moduleId) return current;
    const existing = current.find((candidate) => candidate.moduleId === item.moduleId);
    if (existing) return current.map((candidate) => candidate.moduleId === item.moduleId ? {...candidate, ...item, priority: Math.max(candidate.priority, item.priority)} : candidate);
    return [...current, item].slice(-EXTERNAL_WIDGET_REFRESH_QUEUE_MAX);
}

function dequeueExternalWidgetRefresh(queue) {
    const current = normalizeExternalWidgetRefreshQueue(queue);
    const index = current.findIndex((item) => item.state === "queued");
    if (index < 0) return {entry: null, queue: current};
    const candidates = current.filter((item) => item.state === "queued").sort((a, b) => b.priority - a.priority || a.requestedAt - b.requestedAt);
    const selected = candidates[0];
    return {entry: {...selected, state: "running"}, queue: current.filter((item) => item.moduleId !== selected.moduleId)};
}

function updateExternalWidgetRefreshEntry(queue, moduleId, patch) {
    const key = boundedText(moduleId, 96);
    return normalizeExternalWidgetRefreshQueue(queue).map((item) => item.moduleId === key
        ? normalizeExternalWidgetRefreshEntry({...item, ...(patch && typeof patch === "object" ? patch : {})}) : item);
}

function markExternalWidgetRefreshSucceeded(queue, moduleId) {
    return updateExternalWidgetRefreshEntry(queue, moduleId, {state: "succeeded", reason: ""});
}

function markExternalWidgetRefreshFailed(queue, moduleId, reason = "") {
    return updateExternalWidgetRefreshEntry(queue, moduleId, {state: "failed", reason, attempt: normalizeExternalWidgetRetryAttempt((queue || []).find((item) => item?.moduleId === moduleId)?.attempt) + 1});
}

function cancelExternalWidgetRefresh(queue, moduleId, reason = "cancelled") {
    return updateExternalWidgetRefreshEntry(queue, moduleId, {state: "cancelled", reason});
}

function removeExternalWidgetRefresh(queue, moduleId) {
    const key = boundedText(moduleId, 96);
    return normalizeExternalWidgetRefreshQueue(queue).filter((item) => item.moduleId !== key);
}

function countExternalWidgetRefreshStates(queue) {
    const counts = Object.fromEntries(EXTERNAL_WIDGET_REFRESH_STATES.map((state) => [state, 0]));
    normalizeExternalWidgetRefreshQueue(queue).forEach((item) => { counts[item.state] += 1; });
    return counts;
}

function normalizeExternalWidgetConcurrency(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) ? Math.min(4, Math.max(1, numeric)) : 2;
}

function planExternalWidgetRefreshBatch(queue, concurrency = 2) {
    let current = normalizeExternalWidgetRefreshQueue(queue);
    const limit = normalizeExternalWidgetConcurrency(concurrency);
    const entries = [];
    while (entries.length < limit) {
        const next = dequeueExternalWidgetRefresh(current);
        if (!next.entry) break;
        entries.push(next.entry);
        current = next.queue;
    }
    return {entries, queue: current};
}

function summarizeExternalWidgetRefreshBatch(entries, queue = []) {
    const list = Array.isArray(entries) ? entries.map(normalizeExternalWidgetRefreshEntry) : [];
    return {
        total: list.length,
        running: list.filter((item) => item.state === "running").length,
        succeeded: list.filter((item) => item.state === "succeeded").length,
        failed: list.filter((item) => item.state === "failed").length,
        cancelled: list.filter((item) => item.state === "cancelled").length,
        queued: normalizeExternalWidgetRefreshQueue(queue).filter((item) => item.state === "queued").length,
    };
}

function buildExternalWidgetRefreshReceipt(entry, result = {}) {
    const item = normalizeExternalWidgetRefreshEntry(entry);
    const ok = result.ok === true;
    return {moduleId: item.moduleId, state: ok ? "succeeded" : (result.cancelled ? "cancelled" : "failed"), reason: normalizeExternalWidgetReason(result.reason), attempt: item.attempt};
}

function mergeExternalWidgetRefreshReceipts(receipts) {
    const map = new Map();
    (Array.isArray(receipts) ? receipts : []).map((item) => ({...normalizeExternalWidgetRefreshEntry(item), ...buildExternalWidgetRefreshReceipt(item, item)})).forEach((item) => {
        if (item.moduleId) map.set(item.moduleId, item);
    });
    return [...map.values()].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

function shouldScheduleExternalWidgetRefresh(snapshot, ttl, now = Date.now()) {
    const item = normalizeExternalWidgetSnapshot(snapshot);
    return !!item.moduleId && (isExternalWidgetRefreshDue(item, ttl, now) || shouldRetryExternalWidget(item.health, item.attempt));
}

function clearExternalWidgetRefreshQueue(queue) {
    return normalizeExternalWidgetRefreshQueue(queue).filter((item) => item.state === "running");
}

module.exports = {
    EXTERNAL_WIDGET_CATEGORIES,
    EXTERNAL_WIDGET_AVAILABILITY,
    EXTERNAL_WIDGET_AUTH,
    EXTERNAL_WIDGET_PLATFORMS,
    EXTERNAL_WIDGET_INTEGRATIONS,
    EXTERNAL_WIDGET_HEALTH,
    EXTERNAL_WIDGET_ACTIONS,
    EXTERNAL_WIDGET_STATE_VERSION,
    EXTERNAL_WIDGET_HISTORY_MAX,
    EXTERNAL_WIDGET_FRESHNESS,
    EXTERNAL_WIDGET_ERROR_KINDS,
    EXTERNAL_WIDGET_RETRY_MAX,
    EXTERNAL_WIDGET_REFRESH_STATES,
    EXTERNAL_WIDGET_REFRESH_QUEUE_MAX,
    EXTERNAL_WIDGET_CATALOG,
    normalizeExternalWidget,
    normalizeExternalWidgetCategory,
    normalizeExternalWidgetAvailability,
    normalizeExternalWidgetAuth,
    normalizeExternalWidgetIntegration,
    normalizeExternalWidgetPlatforms,
    listExternalWidgetCatalog,
    findExternalWidget,
    filterExternalWidgets,
    summarizeExternalWidgets,
    groupExternalWidgets,
    resolveExternalWidgetStoreState,
    normalizeExternalWidgetHealth,
    normalizeExternalWidgetReason,
    resolveExternalWidgetAction,
    resolveExternalWidgetStatusLabel,
    describeExternalWidgetStoreState,
    isExternalWidgetSelectable,
    summarizeExternalWidgetStates,
    sortExternalWidgetCatalog,
    buildExternalWidgetGuideLink,
    getExternalWidgetSetupSteps,
    resolveExternalWidgetPrivacyLevel,
    normalizeExternalWidgetStateList,
    normalizeExternalWidgetTimestamp,
    normalizeExternalWidgetSnapshot,
    buildExternalWidgetSnapshot,
    isExternalWidgetSnapshotCompatible,
    serializeExternalWidgetSnapshot,
    parseExternalWidgetSnapshot,
    diffExternalWidgetSnapshots,
    buildExternalWidgetTransition,
    normalizeExternalWidgetHistory,
    appendExternalWidgetSnapshot,
    trimExternalWidgetHistory,
    latestExternalWidgetSnapshot,
    selectExternalWidgetHistory,
    summarizeExternalWidgetHistory,
    mergeExternalWidgetSnapshots,
    serializeExternalWidgetHistory,
    parseExternalWidgetHistory,
    externalWidgetHealthRank,
    compareExternalWidgetHealth,
    normalizeExternalWidgetTtl,
    externalWidgetSnapshotAge,
    resolveExternalWidgetFreshness,
    normalizeExternalWidgetRetryAttempt,
    externalWidgetRetryDelay,
    shouldRetryExternalWidget,
    buildExternalWidgetRetryPlan,
    normalizeExternalWidgetErrorKind,
    classifyExternalWidgetError,
    nextExternalWidgetRefreshAt,
    isExternalWidgetRefreshDue,
    selectExternalWidgetDisplaySnapshot,
    sortExternalWidgetSnapshotsByHealth,
    groupExternalWidgetSnapshotsByHealth,
    summarizeExternalWidgetRefresh,
    normalizeExternalWidgetRefreshState,
    normalizeExternalWidgetPriority,
    normalizeExternalWidgetRefreshEntry,
    normalizeExternalWidgetRefreshQueue,
    enqueueExternalWidgetRefresh,
    dequeueExternalWidgetRefresh,
    updateExternalWidgetRefreshEntry,
    markExternalWidgetRefreshSucceeded,
    markExternalWidgetRefreshFailed,
    cancelExternalWidgetRefresh,
    removeExternalWidgetRefresh,
    countExternalWidgetRefreshStates,
    normalizeExternalWidgetConcurrency,
    planExternalWidgetRefreshBatch,
    summarizeExternalWidgetRefreshBatch,
    buildExternalWidgetRefreshReceipt,
    mergeExternalWidgetRefreshReceipts,
    shouldScheduleExternalWidgetRefresh,
    clearExternalWidgetRefreshQueue,
};
