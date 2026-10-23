"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExternalHomeAdapters = registerExternalHomeAdapters;
// 外部服务组件的注册定义（R2 重构 D-375：自 index.ts registerBuiltinHomeAdapters 外迁）。
// 13 个 external-* 适配器按字节原样搬移：register 闭包由宿主传入（回写 homeRuntime
// 与 homeBuiltinAdapterIds），宿主通过 this 绑定提供 i18n 与内核代理 fetch——
// 因此块内 `this.i18n` / `this.fetchActivityWatchViaKernel` 的接线形态与外迁前
// 完全一致，契约测试（external-widget-availability-contract）按原样锁定。
// 新增外部组件在本文件登记，index.ts 不再随之增长。
const local_time_model_1 = require("./local-time-model");
const quote_model_1 = require("./quote-model");
const battery_model_1 = require("./battery-model");
const life_widget_model_1 = require("./life-widget-model");
const checkin_bridge_model_1 = require("./checkin-bridge-model");
const github_model_1 = require("./github-model");
const rss_model_1 = require("./rss-model");
const life_widget_network_1 = require("./life-widget-network");
const ecosystem_bridge_kit_1 = require("./api/ecosystem-bridge-kit");
const external_bridge_1 = require("./api/external-bridge");
function registerExternalHomeAdapters(register) {
    // 生活信息组件首批：完全离线的本地时钟。使用浏览器 Intl，避免引入日期库、
    // 网络服务或定位权限；面板存活期间由分钟心跳强制刷新，开启秒显示的实例
    // 走面板内的秒级心跳（仅刷新这些实例，见 second-panel-ui 的 clockSeconds）。
    register("external-local-time", this.i18n.homeLocalTime, "iconClock", this.i18n.homeDescLocalTime, [], (config) => {
        const locale = document.documentElement.lang || navigator.language || "zh-CN";
        return (0, local_time_model_1.buildLocalTimeSnapshot)(new Date(), locale, { localTime: this.i18n.homeLocalTimeZone }, config);
    });
    // 世界时钟：完全离线。用户配置 IANA 时区列表后用 Intl 按时区渲染；
    // 空配置回退本地 + UTC，开箱可用；与本地时钟共用分钟边界心跳。
    // T-6437：跨日城市在标签上标注相对日本地日（前天~后天，±2 只在时区极值出现）。
    register("external-world-clock", this.i18n.homeWorldClock, "iconClock", this.i18n.homeDescWorldClock, [], (config) => {
        const locale = document.documentElement.lang || navigator.language || "zh-CN";
        return (0, local_time_model_1.buildWorldClockSnapshot)(new Date(), config, {
            locale,
            worldClock: this.i18n.homeWorldClock,
            local: this.i18n.homeWorldClockLocal,
            dayOffsets: [
                this.i18n.homeWorldClockTwoDaysAgo,
                this.i18n.homeWorldClockYesterday,
                this.i18n.homeWorldClockToday,
                this.i18n.homeWorldClockTomorrow,
                this.i18n.homeWorldClockInTwoDays,
            ],
        });
    });
    // Open-Meteo 天气：用户添加后仍需显式配置城市；不请求浏览器定位，也不发送笔记数据。
    // 地理编码缓存 24 小时、天气缓存 15 分钟，界面保留 CC BY 4.0 归因链接。
    register("external-weather-open-meteo", this.i18n.homeWeather, "iconCloud", this.i18n.homeDescWeather, [], async (config, _device, context) => {
        const normalized = (0, life_widget_model_1.normalizeWeatherConfig)(config);
        if (normalized.city.length < 2)
            return { emptyHint: this.i18n.homeWeatherConfigHint, items: [] };
        try {
            const locale = document.documentElement.lang || navigator.language || "zh-CN";
            const geocodingUrl = (0, life_widget_model_1.buildWeatherGeocodingUrl)(normalized, locale);
            const locationPayload = await (0, life_widget_network_1.loadWeatherLocation)(geocodingUrl, { signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl: (url, init) => this.fetchActivityWatchViaKernel(url, init) });
            const location = (0, life_widget_model_1.normalizeWeatherLocation)(locationPayload);
            if (!location)
                return { emptyHint: this.i18n.homeWeatherCityNotFound, items: [] };
            const forecastUrl = (0, life_widget_model_1.buildWeatherForecastUrl)(location, normalized);
            const forecast = await (0, life_widget_network_1.loadWeatherForecast)(forecastUrl, { signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl: (url, init) => this.fetchActivityWatchViaKernel(url, init) });
            const snapshot = (0, life_widget_model_1.buildWeatherSnapshot)(location, forecast, normalized, {
                locale,
                today: this.i18n.homeWeatherToday,
                clear: this.i18n.homeWeatherClear,
                cloudy: this.i18n.homeWeatherCloudy,
                fog: this.i18n.homeWeatherFog,
                rain: this.i18n.homeWeatherRain,
                snow: this.i18n.homeWeatherSnow,
                storm: this.i18n.homeWeatherStorm,
                feelsLike: this.i18n.homeWeatherFeelsLike,
                rainChance: this.i18n.homeWeatherRainChance,
                wind: this.i18n.homeWeatherWind,
            });
            if (!snapshot)
                throw new Error("invalid_weather");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeModuleError} · ${this.i18n.homeRetry}`, retryable: true, items: [] };
        }
    }, { timeoutMs: 7500, cacheTtlMs: 15 * 60 * 1000 });
    // 空气质量（T-6308）：与天气共用地理编码链路（location-only），固定字段集的
    // Open-Meteo Air Quality 端点；欧洲 AQI 六档词经 i18n 传入，30 分钟缓存。
    register("external-air-quality", this.i18n.homeAir, "iconCloud", this.i18n.homeDescAir, [], async (config, _device, context) => {
        const normalized = (0, life_widget_model_1.normalizeAirQualityConfig)(config);
        if (normalized.city.length < 2)
            return { emptyHint: this.i18n.homeAirConfigHint, items: [] };
        try {
            const locale = document.documentElement.lang || navigator.language || "zh-CN";
            const geocodingUrl = (0, life_widget_model_1.buildWeatherGeocodingUrl)(normalized, locale);
            const locationPayload = await (0, life_widget_network_1.loadWeatherLocation)(geocodingUrl, { signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl: (url, init) => this.fetchActivityWatchViaKernel(url, init) });
            const location = (0, life_widget_model_1.normalizeWeatherLocation)(locationPayload);
            if (!location)
                return { emptyHint: this.i18n.homeWeatherCityNotFound, items: [] };
            const airUrl = (0, life_widget_model_1.buildAirQualityUrl)(location, normalized);
            if (!airUrl)
                throw new Error("invalid_air_quality_request");
            const envelope = await (0, life_widget_network_1.loadAirQuality)(airUrl, { signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl: (url, init) => this.fetchActivityWatchViaKernel(url, init) });
            const snapshot = (0, life_widget_model_1.buildAirQualitySnapshot)(location, envelope.payload, normalized, {
                aqi: this.i18n.homeAirAqi,
                bands: [this.i18n.homeAirBandGood, this.i18n.homeAirBandFair, this.i18n.homeAirBandModerate, this.i18n.homeAirBandPoor, this.i18n.homeAirBandVeryPoor, this.i18n.homeAirBandExtreme],
                source: this.i18n.homeFeedSource,
            }, undefined, envelope.status);
            if (!snapshot)
                throw new Error("invalid_air_quality");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeAirEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 7500, cacheTtlMs: 30 * 60 * 1000 });
    // Bangumi 每日放送：仅在用户添加组件后请求整周兼容日历数据，再按本地星期选择。
    // 浏览器 WebView 使用自身 User-Agent；接口返回、封面地址和跳转地址都经过独立白名单归一化。
    register("external-anime-bangumi", this.i18n.homeBangumi, "iconVideo", this.i18n.homeDescBangumi, [], async (config, _device, context) => {
        try {
            const payload = await (0, life_widget_network_1.loadBangumiCalendar)({ signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl: (url, init) => this.fetchBangumiCalendar(url, init) });
            const locale = document.documentElement.lang || navigator.language || "zh-CN";
            const english = locale.toLowerCase().startsWith("en");
            const snapshot = (0, life_widget_model_1.buildBangumiSnapshot)(payload, config, {
                today: this.i18n.homeBangumiToday,
                tomorrow: this.i18n.homeBangumiTomorrow,
                week: this.i18n.homeBangumiWeek,
                entries: this.i18n.homeBangumiEntries,
                source: this.i18n.homeBangumiSource,
                weekdays: english
                    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                    : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
            });
            if (!snapshot)
                throw new Error("invalid_bangumi_calendar");
            if (snapshot.items.length === 1)
                return { title: snapshot.title, emptyHint: this.i18n.homeBangumiEmpty, items: [], updatedAt: snapshot.updatedAt };
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeBangumiEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000 });
    // 用户端点资讯源：默认配置为空时完全不联网。端点仅允许 HTTPS（本机可用 HTTP），
    // 且必须符合 DailyHotApi/NewsNow 的已知只读路由；网络失败时保留并标记过期缓存。
    const registerExternalFeed = (moduleId, provider, title, icon, description) => {
        register(moduleId, title, icon, description, [], async (config, _device, context) => {
            const normalized = (0, life_widget_model_1.normalizeFeedConfig)(config);
            // T-6686 基址+路由选择器：apiBase 非空且 route 命中白名单时按
            // `基址/路由` 组合并经同一 URL 白名单校验；校验失败或未配置则回退
            // 完整接口字段（endpoint），旧配置行为不变。
            let configured = normalized.endpoint;
            if (normalized.apiBase && normalized.route) {
                const composed = (0, life_widget_model_1.normalizeConfiguredFeedUrl)(`${normalized.apiBase.replace(/\/+$/, "")}/${normalized.route}`, provider);
                if (composed)
                    configured = composed;
            }
            const endpoint = (0, life_widget_model_1.normalizeConfiguredFeedUrl)(configured, provider);
            if (!endpoint)
                return { emptyHint: this.i18n.homeFeedConfigHint, items: [] };
            const envelope = await (0, life_widget_network_1.loadConfiguredFeed)(endpoint, { signal: context === null || context === void 0 ? void 0 : context.signal });
            const snapshot = (0, life_widget_model_1.buildExternalFeedSnapshot)(envelope, normalized, provider, {
                hot: this.i18n.homeFeedHot,
                source: this.i18n.homeFeedSource,
                empty: this.i18n.homeFeedEmpty,
            });
            if (!snapshot)
                throw new Error("invalid_external_feed");
            if (snapshot.items.length === 1)
                return Object.assign(Object.assign({}, snapshot), { items: [] });
            // T-6971 批次⑥：档位硬上界（首屏 ≤5，L 档 ≤8），来源行恒保留
            return Object.assign(Object.assign({}, snapshot), { items: (0, life_widget_model_1.capListflowRows)(snapshot.items, context === null || context === void 0 ? void 0 : context.size) });
        }, { timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000 });
    };
    registerExternalFeed("external-hot-news-dailyhot", "dailyhot", this.i18n.homeDailyHot, "iconGraph", this.i18n.homeDescDailyHot);
    registerExternalFeed("external-news-newsnow", "newsnow", this.i18n.homeNewsNow, "iconList", this.i18n.homeDescNewsNow);
    // Hacker News 热门：唯一一个免 Key 的固定公开端点（Algolia HN Search），字面量 URL
    // 进 allowedLifeWidgetUrl 白名单并经思源内核代理；30 分钟缓存，失败显示陈旧缓存。
    register("external-news-hackernews", this.i18n.homeHackerNews, "iconGraph", this.i18n.homeDescHackerNews, [], async (config, _device, context) => {
        try {
            const normalized = (0, life_widget_model_1.normalizeHackerNewsConfig)(config);
            const envelope = await (0, life_widget_network_1.loadHackerNewsBoard)(normalized.board, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                fetchImpl: (url, init) => this.fetchActivityWatchViaKernel(url, init),
            });
            const snapshot = (0, life_widget_model_1.buildHackerNewsSnapshot)(envelope, normalized, {
                title: this.i18n.homeHackerNews,
                points: this.i18n.homeHackerNewsPoints,
                source: this.i18n.homeFeedSource,
                empty: this.i18n.homeFeedEmpty,
            });
            if (!snapshot)
                throw new Error("invalid_hackernews_front_page");
            if (snapshot.items.length === 1)
                return Object.assign(Object.assign({}, snapshot), { items: [] });
            // T-6971 批次⑥：档位硬上界（首屏 ≤5，L 档 ≤8），来源行恒保留
            return Object.assign(Object.assign({}, snapshot), { items: (0, life_widget_model_1.capListflowRows)(snapshot.items, context === null || context === void 0 ? void 0 : context.size) });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeFeedEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000 });
    // Uptime Kuma 服务状态：用户自建服务 + 已发布状态页，两条免认证只读路由
    // （状态页配置 + 心跳）走"已知路由"白名单；5 分钟缓存，失败显示陈旧缓存。
    register("external-status-uptimekuma", this.i18n.homeUptimeKuma, "iconCloud", this.i18n.homeDescUptimeKuma, [], async (config, _device, context) => {
        const normalized = (0, life_widget_model_1.normalizeUptimeKumaConfig)(config);
        const statusUrl = (0, life_widget_model_1.buildUptimeKumaPageUrl)(normalized, false);
        const heartbeatUrl = (0, life_widget_model_1.buildUptimeKumaPageUrl)(normalized, true);
        if (!statusUrl || !heartbeatUrl)
            return { emptyHint: this.i18n.homeUptimeKumaConfigHint, items: [] };
        const fetchImpl = (url, init) => this.fetchActivityWatchViaKernel(url, init);
        try {
            const statusEnvelope = await (0, life_widget_network_1.loadUptimeKumaPage)(statusUrl, normalized.slug, false, { signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl });
            const heartbeatEnvelope = await (0, life_widget_network_1.loadUptimeKumaPage)(heartbeatUrl, normalized.slug, true, { signal: context === null || context === void 0 ? void 0 : context.signal, fetchImpl });
            const snapshot = (0, life_widget_model_1.buildUptimeKumaSnapshot)(statusEnvelope, heartbeatEnvelope, normalized, {
                title: this.i18n.homeUptimeKuma,
                stat: this.i18n.homeUptimeKumaStat,
                up: this.i18n.homeUptimeKumaUp,
                down: this.i18n.homeUptimeKumaDown,
                incident: this.i18n.homeUptimeKumaIncident,
                maintenance: this.i18n.homeUptimeKumaMaintenance,
                source: this.i18n.homeFeedSource,
            });
            if (!snapshot)
                throw new Error("invalid_uptimekuma_status_page");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeFeedEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 5 * 60 * 1000 });
    // Frankfurter 汇率参考：免 Key 公开接口，货币代码受 ECB 白名单约束；
    // ECB 每日更新一次，12 小时缓存；卡片明确标注"参考值，不承诺实时"。
    register("external-fx-frankfurter", this.i18n.homeFx, "iconGraph", this.i18n.homeDescFx, [], async (config, _device, context) => {
        const normalized = (0, life_widget_model_1.normalizeFrankfurterConfig)(config);
        const url = (0, life_widget_model_1.buildFrankfurterRequestUrl)(normalized);
        if (!url)
            return { emptyHint: this.i18n.homeFxEmpty, items: [] };
        try {
            const envelope = await (0, life_widget_network_1.loadFrankfurterRates)(url, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                fetchImpl: (reqUrl, init) => this.fetchActivityWatchViaKernel(reqUrl, init),
            });
            const snapshot = (0, life_widget_model_1.buildFrankfurterSnapshot)(envelope, normalized, {
                title: this.i18n.homeFxTitle,
                source: this.i18n.homeFxSource,
                empty: this.i18n.homeFxEmpty,
            });
            if (!snapshot)
                throw new Error("invalid_frankfurter_rates");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeFxEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 12 * 60 * 60 * 1000 });
    // Miniflux 未读：用户自建实例 + API Token。Token 仅经 X-Auth-Token 请求头传递
    // （不进 URL/缓存 key/错误消息），URL 走"已知路由"白名单；15 分钟缓存。
    register("external-rss-miniflux", this.i18n.homeMiniflux, "iconRss", this.i18n.homeDescMiniflux, [], async (config, _device, context) => {
        const normalized = (0, life_widget_model_1.normalizeMinifluxConfig)(config);
        const url = (0, life_widget_model_1.buildMinifluxRequestUrl)(normalized);
        if (!url || !normalized.token)
            return { emptyHint: this.i18n.homeMinifluxConfigHint, items: [] };
        try {
            const envelope = await (0, life_widget_network_1.loadMinifluxEntries)(url, normalized.token, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                fetchImpl: (reqUrl, init) => this.fetchActivityWatchViaKernel(reqUrl, init),
            });
            const snapshot = (0, life_widget_model_1.buildMinifluxSnapshot)(envelope, normalized, {
                title: this.i18n.homeMiniflux,
                unread: this.i18n.homeMinifluxStat,
                source: this.i18n.homeQuoteSource,
            });
            if (!snapshot)
                throw new Error("invalid_miniflux_entries");
            // T-6971 批次⑥：档位硬上界（首屏 ≤5，L 档 ≤8），来源行恒保留
            return Object.assign(Object.assign({}, snapshot), { items: (0, life_widget_model_1.capListflowRows)(snapshot.items, context === null || context === void 0 ? void 0 : context.size) });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            if ((error === null || error === void 0 ? void 0 : error.message) === "invalid_token")
                return { emptyHint: this.i18n.homeMinifluxConfigHint, items: [] };
            return { emptyHint: `${this.i18n.homeMinifluxEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 15 * 60 * 1000 });
    // iCal 订阅：用户提供的 .ics 订阅地址（https/本机）。文本经内核代理抓取，
    // RFC 5545 有界解析后只渲染未来窗口内的日程；30 分钟缓存，失效回退 stale。
    register("external-ical-events", this.i18n.homeIcal, "iconCalendar", this.i18n.homeDescIcal, [], async (config, _device, context) => {
        const normalized = (0, life_widget_model_1.normalizeIcalSubscriptionConfig)(config);
        if (!normalized.url)
            return { emptyHint: this.i18n.homeIcalConfigHint, items: [] };
        try {
            const feed = await (0, life_widget_network_1.loadIcalText)(normalized.url, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                fetchImpl: (reqUrl, init) => this.fetchActivityWatchViaKernel(reqUrl, init),
            });
            const snapshot = (0, life_widget_model_1.buildIcalSnapshot)(feed.text, normalized, {
                empty: this.i18n.homeIcalEmpty,
                allDay: this.i18n.homeIcalAllDay,
                ongoing: this.i18n.homeIcalOngoing,
            }, undefined, feed.status);
            if (!snapshot)
                throw new Error("invalid_ical_payload");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeIcalEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000 });
    // RSS/Atom 订阅：用户提供的任意 feed 地址（https/本机，零凭据零实例），与
    // Miniflux（自建实例+Token）互补。文本经内核代理抓取，XML 有界解析（rss-model）；
    // 30 分钟缓存，失效回退 stale。
    register("external-rss-subscription", this.i18n.homeRss, "iconRss", this.i18n.homeDescRss, [], async (config, _device, context) => {
        const normalized = (0, rss_model_1.normalizeRssSubscriptionConfig)(config);
        if (!normalized.url)
            return { emptyHint: this.i18n.homeRssConfigHint, items: [] };
        try {
            const feed = await (0, life_widget_network_1.loadRssFeed)(normalized.url, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                fetchImpl: (reqUrl, init) => this.fetchActivityWatchViaKernel(reqUrl, init),
            });
            // T-6685 已读状态（有界，宿主持久化）：只看未读时先过滤，
            // 展示键回传宿主标记（下次刷新视为已读）
            const seen = typeof this.rssReadState === "function" ? this.rssReadState() : {};
            const snapshot = (0, life_widget_model_1.buildRssSnapshot)(feed.text, normalized, {
                source: this.i18n.homeQuoteSource,
                read: this.i18n.homeRssRead,
                unread: this.i18n.homeRssUnread,
            }, undefined, feed.status, {
                seenLookup: (key) => Object.prototype.hasOwnProperty.call(seen, key),
                onSeen: (keys) => { var _a; return (_a = this.markRssItemsSeen) === null || _a === void 0 ? void 0 : _a.call(this, keys); },
            });
            if (!snapshot)
                throw new Error("invalid_rss_payload");
            // T-6971 批次⑥：档位硬上界（首屏 ≤5，L 档 ≤8），来源行恒保留
            return Object.assign(Object.assign({}, snapshot), { items: (0, life_widget_model_1.capListflowRows)(snapshot.items, context === null || context === void 0 ? void 0 : context.size) });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeRssEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000 });
    // GitHub 贡献：官方公开事件流（免 Key，可选 Token 走请求头）。分页抓取经内核代理，
    // 事件流按 UTC 日期桶聚合为格点热力图；60 分钟缓存，失效回退 stale。
    register("external-github-contrib", this.i18n.homeGithub, "iconGraph", this.i18n.homeDescGithub, [], async (config, _device, context) => {
        const normalized = (0, github_model_1.normalizeGithubContribConfig)(config);
        if (!normalized.ok)
            return { emptyHint: this.i18n.homeGithubConfigHint, items: [] };
        try {
            const envelope = await (0, life_widget_network_1.loadGithubEvents)(normalized, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                fetchImpl: (reqUrl, init) => this.fetchActivityWatchViaKernel(reqUrl, init),
            });
            // P3-1：格点热力图布局（viewType=heatmap 渲染）；周汇总保留为模型层默认路径。
            const snapshot = (0, life_widget_model_1.buildGithubContribSnapshot)(envelope.text, Object.assign(Object.assign({}, normalized), { layout: "grid" }), { title: this.i18n.homeGithub, empty: this.i18n.homeGithubEmpty, stat: this.i18n.homeGithubStat, today: this.i18n.homeGithubToday }, undefined, envelope.status);
            if (!snapshot)
                throw new Error("invalid_github_payload");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeGithubEmpty} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 8500, cacheTtlMs: 60 * 60 * 1000 });
    // 每日引言：完全离线的本地语录集，按本地日期稳定轮换；无网络请求。
    // 自定义语录（多行，整体替换内置集）走 textarea 配置；挂到分钟心跳以在跨天时轮换。
    register("external-quote-daily", this.i18n.homeQuote, "iconQuote", this.i18n.homeDescQuote, [], (config) => {
        const snapshot = (0, quote_model_1.buildDailyQuoteSnapshot)(new Date(), config, {
            title: this.i18n.homeQuote,
            source: this.i18n.homeQuoteSource,
            customSource: this.i18n.homeQuoteCustomSource,
        });
        if (!snapshot)
            return { emptyHint: this.i18n.homeQuoteEmpty, items: [] };
        return snapshot;
    });
    // 设备电量：完全本地。能力探测在宿主层——不支持 Battery Status API 的宿主
    // 显示诚实降级文案而非空白；移动端 WebView 普遍不支持，故不声明移动端。
    register("external-device-battery", this.i18n.homeBattery, "iconDashboard", this.i18n.homeDescBattery, [], async (config, _device, context) => {
        const getBattery = navigator.getBattery;
        if (typeof getBattery !== "function")
            return { emptyHint: this.i18n.homeBatteryUnsupported, items: [] };
        try {
            const manager = await getBattery.call(navigator);
            const snapshot = (0, battery_model_1.buildBatterySnapshot)(manager, {
                title: this.i18n.homeBattery,
                charging: this.i18n.homeBatteryCharging,
                discharging: this.i18n.homeBatteryDischarging,
                hours: this.i18n.homeBatteryHours,
                minutes: this.i18n.homeBatteryMinutes,
                source: this.i18n.homeQuoteSource,
            }, config);
            if (!snapshot)
                return { emptyHint: this.i18n.homeBatteryUnsupported, items: [] };
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: this.i18n.homeBatteryUnsupported, items: [] };
        }
    }, { timeoutMs: 3000, cacheTtlMs: 30 * 1000 });
    register("external-activitywatch-time", this.i18n.homeActivityWatch, "iconClock", this.i18n.homeDescActivityWatch, [], async (config, _device, context) => {
        const request = (0, life_widget_model_1.buildActivityWatchRequest)(config, Date.now());
        if (!request)
            return { emptyHint: this.i18n.homeActivityWatchConfigHint, items: [] };
        try {
            const envelope = await (0, life_widget_network_1.loadActivityWatchSummary)(request, {
                signal: context === null || context === void 0 ? void 0 : context.signal,
                timeoutMs: 5000,
                fetchImpl: (url, init) => this.fetchActivityWatchViaKernel(url, init),
            });
            const snapshot = (0, life_widget_model_1.buildActivityWatchSnapshot)(envelope, config, {
                range: this.i18n.homeActivityWatchRange,
                total: this.i18n.homeActivityWatchTotal,
                empty: this.i18n.homeActivityWatchEmpty,
            });
            if (!snapshot)
                throw new Error("invalid_activitywatch_payload");
            return snapshot;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.message) === "aborted")
                throw error;
            return { emptyHint: `${this.i18n.homeActivityWatchConfigHint} · ${this.i18n.homeRetry}`, items: [] };
        }
    }, { timeoutMs: 7000, cacheTtlMs: 5 * 60 * 1000 });
    // —— 小驴打卡桥接组件（ADR 0057）——
    // 由本插件内建 adapter 读取打卡插件公开的生态 API v4（window.siyuanCheckin）：
    // 只读、纯本地、无网络请求。组件由速切注册，但 source 把来源标注为
    // siyuan-checkin，商店因此按「来源插件」把它们归到小驴打卡一组。
    // 打卡缺席或能力缺失时 read 返回确定空态而不是抛错——抛错会触发失败退避，
    // 把组件显示成故障态。若将来打卡插件自行注册同 moduleId，token 覆盖会让它接管。
    const checkinLabels = () => ({
        unnamed: this.i18n.homeCheckinUnnamed,
        todayStat: this.i18n.homeCheckinTodayStat,
        todayEmpty: this.i18n.homeCheckinTodayEmpty,
        dayUnit: this.i18n.homeCheckinDayUnit,
        pendingToday: this.i18n.homeCheckinPendingToday,
        streakStat: this.i18n.homeCheckinStreakStat,
        streakEmpty: this.i18n.homeCheckinStreakEmpty,
        heatmapTitle: this.i18n.homeCheckinHeatmapTitle,
        heatmapStat: this.i18n.homeCheckinHeatmapStat,
        heatmapEmpty: this.i18n.homeCheckinHeatmapEmpty,
        weeklyStat: this.i18n.homeCheckinWeeklyStat,
        weeklyEmpty: this.i18n.homeCheckinWeeklyEmpty,
        today: this.i18n.homeCheckinOccasionToday,
        daysLater: this.i18n.homeCheckinOccasionLater,
        occasionsEmpty: this.i18n.homeCheckinOccasionsEmpty,
        missing: this.i18n.homeCheckinMissing,
        capabilityMissing: this.i18n.homeCheckinCapabilityMissing,
        monthlyStat: this.i18n.homeCheckinMonthlyStat,
        monthlyTotal: this.i18n.homeCheckinMonthlyTotal,
        monthlyEmpty: this.i18n.homeCheckinMonthlyEmpty,
        summaryTodayStat: this.i18n.homeCheckinSummaryTodayStat,
        summaryStreakStat: this.i18n.homeCheckinSummaryStreakStat,
        summaryMonthStat: this.i18n.homeCheckinSummaryMonthStat,
        pendingLabel: this.i18n.homeCheckinSummaryPendingLabel,
        empty: this.i18n.homeCheckinSummaryEmpty,
    });
    const checkinSource = { pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck" };
    const registerCheckinBridge = (moduleId, title, icon, description) => {
        register(moduleId, title, icon, description, [], (config) => (0, checkin_bridge_model_1.readCheckinBridge)(moduleId, { scope: window, config, labels: checkinLabels() }), {}, checkinSource);
    };
    registerCheckinBridge("checkin-summary", this.i18n.homeCheckinSummary, "iconCalendar", this.i18n.homeDescCheckinSummary);
    registerCheckinBridge("checkin-today", this.i18n.homeCheckinToday, "iconCheck", this.i18n.homeDescCheckinToday);
    registerCheckinBridge("checkin-streak", this.i18n.homeCheckinStreak, "iconRefresh", this.i18n.homeDescCheckinStreak);
    registerCheckinBridge("checkin-year-heatmap", this.i18n.homeCheckinHeatmap, "iconGraph", this.i18n.homeDescCheckinHeatmap);
    registerCheckinBridge("checkin-weekly", this.i18n.homeCheckinWeekly, "iconCalendar", this.i18n.homeDescCheckinWeekly);
    registerCheckinBridge("checkin-occasions", this.i18n.homeCheckinOccasions, "iconCheck", this.i18n.homeDescCheckinOccasions);
    registerCheckinBridge("checkin-monthly", this.i18n.homeCheckinMonthly, "iconCalendar", this.i18n.homeDescCheckinMonthly);

    // ==================== Epoch 6 联邦规范 · 7大生态小组件 ====================
    // ① 小驴打卡 · 每日习惯连击 (checkin-daily-streaks)
    const checkinStreaksSource = { pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 7 };
    register("checkin-daily-streaks", this.i18n.homeCheckinDailyStreaks || "每日习惯连击", "iconCheck", this.i18n.homeDescCheckinDailyStreaks || "今日习惯完成与连续天数总览", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("checkin");
        if (!bridge) return { items: [], emptyHint: "未检测到小驴打卡插件", status: "ready" };
        try {
            const items = typeof bridge.queryItems === "function" ? bridge.queryItems({ limit: 5 }) : [];
            const streaks = typeof bridge.getStreaks === "function" ? bridge.getStreaks() : {};
            const rows = (items || []).slice(0, 5).map((it) => {
                const st = streaks[it.id]?.current ?? 0;
                return { label: it.name || "未命名", value: `🔥 ${st}天` };
            });
            return { items: rows, emptyHint: rows.length ? "" : "暂无打卡习惯", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, checkinStreaksSource);

    // ② 小驴考试 · 今日备考概览 (exam-daily-summary)
    const examSource = { pluginId: "siyuan-exam", name: "小驴考试", icon: "iconSparkles", order: 8 };
    register("exam-daily-summary", this.i18n.homeExamDailySummary || "备考今日概览", "iconSparkles", this.i18n.homeDescExamDailySummary || "今日答题量、正确率与连击天数", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("exam");
        if (!bridge || typeof bridge.statsRead !== "function") return { items: [], emptyHint: "未检测到小驴考试插件", status: "ready" };
        try {
            const stats = await bridge.statsRead();
            const rows = [
                { label: "今日刷题", value: `${stats.todayAnswered || 0} 题` },
                { label: "正确率", value: `${stats.accuracyPercent || 0}%` },
                { label: "错题待消", value: `${stats.wrongbookCount || 0} 道` },
            ];
            return { items: rows, stat: { value: `${stats.streakDays || 0}`, label: "连胜天数" }, emptyHint: "", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, examSource);

    // ③ 小驴闪卡 · 今日待复习数 (cards-due-summary)
    const cardsSource = { pluginId: "siyuan-lv-cards", name: "小驴闪卡", icon: "iconRiffCard", order: 9 };
    register("cards-due-summary", this.i18n.homeCardsDueSummary || "闪卡待复习数", "iconRiffCard", this.i18n.homeDescCardsDueSummary || "今日到期卡片与记忆复习队列", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("cards");
        if (!bridge) return { items: [], emptyHint: "未检测到小驴闪卡插件", status: "ready" };
        try {
            const res = typeof bridge.getDueSummary === "function" ? await bridge.getDueSummary() : null;
            const due = res?.data?.unreviewedCount ?? 0;
            const rows = [
                { label: "待复习", value: `${due} 张` },
                { label: "新卡片", value: `${res?.data?.unreviewedNewCardCount || 0} 张` },
            ];
            return { items: rows, stat: { value: `${due}`, label: "今日待复习" }, emptyHint: "", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, cardsSource);

    // ④ 小驴拾遗 · 稍后读推荐流 (glean-later-list)
    const gleanSource = { pluginId: "siyuan-glean", name: "小驴拾遗", icon: "iconBook", order: 10 };
    register("glean-later-list", this.i18n.homeGleanLaterList || "稍后读推荐流", "iconBook", this.i18n.homeDescGleanLaterList || "收藏文章精读队列与剪藏推荐", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("glean");
        if (!bridge || typeof bridge.listClips !== "function") return { items: [], emptyHint: "未检测到小驴拾遗插件", status: "ready" };
        try {
            const clips = await bridge.listClips({ status: "later", limit: 5 });
            const rows = (clips || []).slice(0, 5).map((clip) => ({
                label: clip.title || "无标题网页",
                value: clip.site || "剪藏",
            }));
            return { items: rows, emptyHint: rows.length ? "" : "稍后读队列已读完", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, gleanSource);

    // ⑤ 小驴管家 · 家庭效期提醒 (home-expiry-reminders)
    const homeSource = { pluginId: "siyuan-home", name: "小驴管家", icon: "iconCalendar", order: 11 };
    register("home-expiry-reminders", this.i18n.homeExpiryReminders || "家庭效期提醒", "iconCalendar", this.i18n.homeDescExpiryReminders || "食品、药品与证件到期预警", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("home");
        if (!bridge || typeof bridge.summary !== "function") return { items: [], emptyHint: "未检测到小驴管家插件", status: "ready" };
        try {
            const sum = bridge.summary();
            const rows = [
                { label: "今日过期", value: `${sum?.today || 0} 件` },
                { label: "即将到期", value: `${sum?.soon || 0} 件` },
                { label: "已过期", value: `${sum?.overdue || 0} 件` },
            ];
            return { items: rows, stat: { value: `${sum?.soon || 0}`, label: "即将到期" }, emptyHint: "", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, homeSource);

    // ⑥ 小驴人脉 · 近期待跟进 (contacts-upcoming)
    const contactsSource = { pluginId: "siyuan-contacts", name: "小驴人脉", icon: "iconUser", order: 12 };
    register("contacts-upcoming", this.i18n.homeContactsUpcoming || "人脉待跟进", "iconUser", this.i18n.homeDescContactsUpcoming || "近期好友生日与互动跟进备忘", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("contacts");
        if (!bridge || typeof bridge.searchPeople !== "function") return { items: [], emptyHint: "未检测到小驴人脉插件", status: "ready" };
        try {
            const people = await bridge.searchPeople();
            const rows = (people || []).slice(0, 5).map((p) => ({
                label: p.name || "未命名好友",
                value: p.group || "人脉",
            }));
            return { items: rows, emptyHint: rows.length ? "" : "近期无需跟进联系人", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, contactsSource);

    // ⑦ 小驴常用 · 高频常用语 (common-quick-palette)
    const commonSource = { pluginId: "xiaolv-common", name: "小驴常用", icon: "iconFile", order: 13 };
    register("common-quick-palette", this.i18n.homeCommonQuickPalette || "高频常用语", "iconFile", this.i18n.homeDescCommonQuickPalette || "高频文本片段与常用语快捷", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
        const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("common");
        if (!bridge) return { items: [], emptyHint: "未检测到小驴常用插件", status: "ready" };
        try {
            const res = typeof bridge.recent === "function" ? await bridge.recent() : null;
            const list = res?.data || [];
            const rows = (list || []).slice(0, 5).map((it) => ({
                label: it.title || it.content || "常用语",
                value: "点击复制",
            }));
            return { items: rows, emptyHint: rows.length ? "" : "暂无最近常用语", status: "ready" };
        } catch {
            return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
        }
    }, 800, 3000), {}, commonSource);

        // ==================== 思阅与思播生态联动组件 ====================
        // ⑧ 思阅 · 最近阅读 (sireader-recent)
        const sireaderSource = { pluginId: "siyuan-sireader", name: "思阅", icon: "iconBook", order: 14 };
        register("sireader-recent", this.i18n.homeSireaderRecent || "最近阅读", "iconBook", this.i18n.homeDescSireaderRecent || "思阅书架与最近在读书目进度", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
            const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("sireader");
            if (!bridge) return { items: [], emptyHint: "未检测到思阅插件", status: "ready" };
            try {
                const books = typeof bridge.getRecentBooks === "function" ? bridge.getRecentBooks() : [];
                const rows = (books || []).slice(0, 5).map((book) => ({
                    label: book.title || "书籍",
                    value: Number.isFinite(book.progress) ? `${book.progress}%` : "阅读中",
                }));
                return { items: rows, emptyHint: rows.length ? "" : "暂无最近阅读书目", status: "ready" };
            } catch {
                return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
            }
        }, 800, 3000), {}, sireaderSource);

        // ⑨ 思播 · 正在播放 (simedia-active)
        const simediaSource = { pluginId: "siyuan-media-player", name: "思播", icon: "iconPlay", order: 15 };
        register("simedia-active", this.i18n.homeSimediaActive || "正在播放", "iconPlay", this.i18n.homeDescSimediaActive || "思播当前音视频播放状态与进度", [], (0, external_bridge_1.wrapEcosystemModuleRead)(async () => {
            const bridge = (0, ecosystem_bridge_kit_1.getBridgeSafely)("simedia");
            if (!bridge || !bridge.controller) return { items: [], emptyHint: "未检测到思播插件", status: "ready" };
            try {
                const isPlaying = typeof bridge.controller.isPlaying === "function" ? bridge.controller.isPlaying() : false;
                const current = typeof bridge.controller.getCurrentMedia === "function" ? bridge.controller.getCurrentMedia() : null;
                const title = (current === null || current === void 0 ? void 0 : current.title) || (current === null || current === void 0 ? void 0 : current.name) || "当前媒体";
                const rows = [
                    { label: isPlaying ? "▶ 正在播放" : "⏸ 暂停中", value: title },
                ];
                return { items: rows, stat: { value: isPlaying ? "在播" : "暂停", label: "播放状态" }, emptyHint: "", status: "ready" };
            } catch {
                return { items: [], emptyHint: "📦 数据暂未返回，点击重试", status: "ready", retryable: true };
            }
        }, 800, 3000), {}, simediaSource);
    }
