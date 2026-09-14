"use strict";

// 外部生活组件目录只描述来源、权限和运行条件，不在这里发起网络请求。
// 商店可以先据此诚实展示“可直接使用 / 需配置 / 需本地桥接 / 仅参考”，
// 等具体 provider 通过独立适配器和真实宿主验收后再进入生产组件列表。

const EXTERNAL_WIDGET_CATEGORIES = Object.freeze(["time", "weather", "trending", "holiday", "media", "activity"]);
const EXTERNAL_WIDGET_AVAILABILITY = Object.freeze(["builtin", "external", "conditional", "bridge", "reference"]);
const EXTERNAL_WIDGET_AUTH = Object.freeze(["none", "api-key", "user-endpoint", "local-service"]);
const EXTERNAL_WIDGET_PLATFORMS = Object.freeze(["desktop", "sidebar", "mobile"]);
const EXTERNAL_WIDGET_INTEGRATIONS = Object.freeze(["direct", "http", "local-bridge", "reference"]);

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
        availability: "conditional",
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
        availability: "conditional",
        auth: "user-endpoint",
        integration: "http",
        providerName: "NewsNow",
        sourceUrl: "https://github.com/newsnext/newsnow",
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
        title: "番剧推荐",
        category: "media",
        availability: "external",
        auth: "none",
        integration: "http",
        providerName: "Bangumi API",
        sourceUrl: "https://github.com/bangumi/api",
        license: "API terms",
        privacy: "none",
        platforms: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        description: "面向中文用户的番剧条目推荐；请求需要遵守 User-Agent 和接口频率约定",
    }),
    catalogEntry({
        moduleId: "external-activitywatch-time",
        title: "使用时长",
        category: "activity",
        availability: "bridge",
        auth: "local-service",
        integration: "local-bridge",
        providerName: "ActivityWatch",
        sourceUrl: "https://github.com/ActivityWatch/activitywatch",
        license: "MPL-2.0",
        privacy: "local-only",
        platforms: ["desktop", "sidebar"],
        sizes: ["small", "medium", "wide"],
        description: "连接用户本机 ActivityWatch 服务显示应用使用时长；移动端不宣称支持",
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

module.exports = {
    EXTERNAL_WIDGET_CATEGORIES,
    EXTERNAL_WIDGET_AVAILABILITY,
    EXTERNAL_WIDGET_AUTH,
    EXTERNAL_WIDGET_PLATFORMS,
    EXTERNAL_WIDGET_INTEGRATIONS,
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
};
