// 外部服务组件的注册定义（R2 重构 D-375：自 index.ts registerBuiltinHomeAdapters 外迁）。
// 13 个 external-* 适配器按字节原样搬移：register 闭包由宿主传入（回写 homeRuntime
// 与 homeBuiltinAdapterIds），宿主通过 this 绑定提供 i18n 与内核代理 fetch——
// 因此块内 `this.i18n` / `this.fetchActivityWatchViaKernel` 的接线形态与外迁前
// 完全一致，契约测试（external-widget-availability-contract）按原样锁定。
// 新增外部组件在本文件登记，index.ts 不再随之增长。
import {buildLocalTimeSnapshot, buildWorldClockSnapshot} from "./local-time-model";
import {buildDailyQuoteSnapshot} from "./quote-model";
import {buildBatterySnapshot} from "./battery-model";
import {normalizeWeatherConfig, buildWeatherGeocodingUrl, normalizeWeatherLocation, buildWeatherForecastUrl, buildWeatherSnapshot, buildBangumiSnapshot, normalizeFeedConfig, normalizeConfiguredFeedUrl, buildExternalFeedSnapshot, buildActivityWatchRequest, buildActivityWatchSnapshot, normalizeHackerNewsConfig, buildHackerNewsSnapshot, normalizeUptimeKumaConfig, buildUptimeKumaSnapshot, buildUptimeKumaPageUrl, normalizeFrankfurterConfig, buildFrankfurterRequestUrl, buildFrankfurterSnapshot, normalizeMinifluxConfig, buildMinifluxRequestUrl, buildMinifluxSnapshot, normalizeIcalSubscriptionConfig, buildIcalSnapshot, buildGithubContribSnapshot} from "./life-widget-model";
import {parseIcsEvents, upcomingIcalEvents} from "./ical-model";
import {normalizeGithubContribConfig} from "./github-model";
import {loadWeatherLocation, loadWeatherForecast, loadBangumiCalendar, loadConfiguredFeed, loadHackerNewsFrontPage, loadUptimeKumaPage, loadFrankfurterRates, loadMinifluxEntries, loadIcalText, loadGithubEvents, loadActivityWatchSummary} from "./life-widget-network";

export type HomeExternalAdapterRegister = (
    moduleId: string,
    title: string,
    icon: string,
    description: string,
    refreshOn: string[],
    read: (config: Record<string, unknown>, device?: string, context?: {size?: string; signal?: AbortSignal | null}) => any | Promise<any>,
    policies?: {timeoutMs?: number; cacheTtlMs?: number},
) => void;

export interface HomeExternalAdapterHost {
    i18n: Record<string, string>;
    fetchActivityWatchViaKernel: (url: string, init: {body?: string; headers?: Record<string, string>}) => Promise<any>;
}

export function registerExternalHomeAdapters(this: HomeExternalAdapterHost, register: HomeExternalAdapterRegister) {
        // 生活信息组件首批：完全离线的本地时钟。使用浏览器 Intl，避免引入日期库、
        // 网络服务或定位权限；面板存活期间由单一分钟定时器强制刷新。
        register("external-local-time", this.i18n.homeLocalTime, "iconClock", this.i18n.homeDescLocalTime, [], () => {
            const locale = document.documentElement.lang || navigator.language || "zh-CN";
            return buildLocalTimeSnapshot(new Date(), locale, {localTime: this.i18n.homeLocalTimeZone});
        });
        // 世界时钟：完全离线。用户配置 IANA 时区列表后用 Intl 按时区渲染；
        // 空配置回退本地 + UTC，开箱可用；与本地时钟共用分钟边界心跳。
        register("external-world-clock", this.i18n.homeWorldClock, "iconClock", this.i18n.homeDescWorldClock, [], (config) => {
            const locale = document.documentElement.lang || navigator.language || "zh-CN";
            return buildWorldClockSnapshot(new Date(), config, {
                locale,
                worldClock: this.i18n.homeWorldClock,
                local: this.i18n.homeWorldClockLocal,
            });
        });
        // Open-Meteo 天气：用户添加后仍需显式配置城市；不请求浏览器定位，也不发送笔记数据。
        // 地理编码缓存 24 小时、天气缓存 15 分钟，界面保留 CC BY 4.0 归因链接。
        register("external-weather-open-meteo", this.i18n.homeWeather, "iconCloud", this.i18n.homeDescWeather, [], async (config, _device, context) => {
            const normalized = normalizeWeatherConfig(config);
            if (normalized.city.length < 2) return {emptyHint: this.i18n.homeWeatherConfigHint, items: []};
            try {
                const locale = document.documentElement.lang || navigator.language || "zh-CN";
                const geocodingUrl = buildWeatherGeocodingUrl(normalized, locale);
                const locationPayload = await loadWeatherLocation(geocodingUrl, {signal: context?.signal, fetchImpl: (url: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(url, init)});
                const location = normalizeWeatherLocation(locationPayload);
                if (!location) return {emptyHint: this.i18n.homeWeatherCityNotFound, items: []};
                const forecastUrl = buildWeatherForecastUrl(location, normalized);
                const forecast = await loadWeatherForecast(forecastUrl, {signal: context?.signal, fetchImpl: (url: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(url, init)});
                const snapshot = buildWeatherSnapshot(location, forecast, normalized, {
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
                });
                if (!snapshot) throw new Error("invalid_weather");
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeModuleError} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 7500, cacheTtlMs: 15 * 60 * 1000});
        // Bangumi 每日放送：仅在用户添加组件后请求整周兼容日历数据，再按本地星期选择。
        // 浏览器 WebView 使用自身 User-Agent；接口返回、封面地址和跳转地址都经过独立白名单归一化。
        register("external-anime-bangumi", this.i18n.homeBangumi, "iconVideo", this.i18n.homeDescBangumi, [], async (config, _device, context) => {
            try {
                const payload = await loadBangumiCalendar({signal: context?.signal, fetchImpl: (url: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(url, init)});
                const locale = document.documentElement.lang || navigator.language || "zh-CN";
                const english = locale.toLowerCase().startsWith("en");
                const snapshot = buildBangumiSnapshot(payload, config, {
                    today: this.i18n.homeBangumiToday,
                    tomorrow: this.i18n.homeBangumiTomorrow,
                    week: this.i18n.homeBangumiWeek,
                    entries: this.i18n.homeBangumiEntries,
                    source: this.i18n.homeBangumiSource,
                    weekdays: english
                        ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
                        : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
                });
                if (!snapshot) throw new Error("invalid_bangumi_calendar");
                if (snapshot.items.length === 1) return {title: snapshot.title, emptyHint: this.i18n.homeBangumiEmpty, items: [], updatedAt: snapshot.updatedAt};
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeBangumiEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000});
        // 用户端点资讯源：默认配置为空时完全不联网。端点仅允许 HTTPS（本机可用 HTTP），
        // 且必须符合 DailyHotApi/NewsNow 的已知只读路由；网络失败时保留并标记过期缓存。
        const registerExternalFeed = (moduleId: string, provider: "dailyhot" | "newsnow", title: string, icon: string, description: string) => {
            register(moduleId, title, icon, description, [], async (config, _device, context) => {
                const normalized = normalizeFeedConfig(config);
                const endpoint = normalizeConfiguredFeedUrl(normalized.endpoint, provider);
                if (!endpoint) return {emptyHint: this.i18n.homeFeedConfigHint, items: []};
                const envelope = await loadConfiguredFeed(endpoint, {signal: context?.signal});
                const snapshot = buildExternalFeedSnapshot(envelope, normalized, provider, {
                    hot: this.i18n.homeFeedHot,
                    source: this.i18n.homeFeedSource,
                    empty: this.i18n.homeFeedEmpty,
                });
                if (!snapshot) throw new Error("invalid_external_feed");
                if (snapshot.items.length === 1) return {...snapshot, items: []};
                return snapshot;
            }, {timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000});
        };
        registerExternalFeed("external-hot-news-dailyhot", "dailyhot", this.i18n.homeDailyHot, "iconGraph", this.i18n.homeDescDailyHot);
        registerExternalFeed("external-news-newsnow", "newsnow", this.i18n.homeNewsNow, "iconList", this.i18n.homeDescNewsNow);
        // Hacker News 热门：唯一一个免 Key 的固定公开端点（Algolia HN Search），字面量 URL
        // 进 allowedLifeWidgetUrl 白名单并经思源内核代理；30 分钟缓存，失败显示陈旧缓存。
        register("external-news-hackernews", this.i18n.homeHackerNews, "iconGraph", this.i18n.homeDescHackerNews, [], async (config, _device, context) => {
            try {
                const envelope = await loadHackerNewsFrontPage({
                    signal: context?.signal,
                    fetchImpl: (url: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(url, init),
                });
                const snapshot = buildHackerNewsSnapshot(envelope, normalizeHackerNewsConfig(config), {
                    title: this.i18n.homeHackerNews,
                    points: this.i18n.homeHackerNewsPoints,
                    comments: this.i18n.homeHackerNewsComments,
                    source: this.i18n.homeFeedSource,
                    empty: this.i18n.homeFeedEmpty,
                });
                if (!snapshot) throw new Error("invalid_hackernews_front_page");
                if (snapshot.items.length === 1) return {...snapshot, items: []};
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeFeedEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000});
        // Uptime Kuma 服务状态：用户自建服务 + 已发布状态页，两条免认证只读路由
        // （状态页配置 + 心跳）走"已知路由"白名单；5 分钟缓存，失败显示陈旧缓存。
        register("external-status-uptimekuma", this.i18n.homeUptimeKuma, "iconCloud", this.i18n.homeDescUptimeKuma, [], async (config, _device, context) => {
            const normalized = normalizeUptimeKumaConfig(config);
            const statusUrl = buildUptimeKumaPageUrl(normalized, false);
            const heartbeatUrl = buildUptimeKumaPageUrl(normalized, true);
            if (!statusUrl || !heartbeatUrl) return {emptyHint: this.i18n.homeUptimeKumaConfigHint, items: []};
            const fetchImpl = (url: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(url, init);
            try {
                const statusEnvelope = await loadUptimeKumaPage(statusUrl, normalized.slug, false, {signal: context?.signal, fetchImpl});
                const heartbeatEnvelope = await loadUptimeKumaPage(heartbeatUrl, normalized.slug, true, {signal: context?.signal, fetchImpl});
                const snapshot = buildUptimeKumaSnapshot(statusEnvelope, heartbeatEnvelope, normalized, {
                    title: this.i18n.homeUptimeKuma,
                    stat: this.i18n.homeUptimeKumaStat,
                    up: this.i18n.homeUptimeKumaUp,
                    down: this.i18n.homeUptimeKumaDown,
                    incident: this.i18n.homeUptimeKumaIncident,
                    source: this.i18n.homeFeedSource,
                });
                if (!snapshot) throw new Error("invalid_uptimekuma_status_page");
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeFeedEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 5 * 60 * 1000});
        // Frankfurter 汇率参考：免 Key 公开接口，货币代码受 ECB 白名单约束；
        // ECB 每日更新一次，12 小时缓存；卡片明确标注"参考值，不承诺实时"。
        register("external-fx-frankfurter", this.i18n.homeFx, "iconGraph", this.i18n.homeDescFx, [], async (config, _device, context) => {
            const normalized = normalizeFrankfurterConfig(config);
            const url = buildFrankfurterRequestUrl(normalized);
            if (!url) return {emptyHint: this.i18n.homeFxEmpty, items: []};
            try {
                const envelope = await loadFrankfurterRates(url, {
                    signal: context?.signal,
                    fetchImpl: (reqUrl: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(reqUrl, init),
                });
                const snapshot = buildFrankfurterSnapshot(envelope, normalized, {
                    title: this.i18n.homeFxTitle,
                    source: this.i18n.homeFxSource,
                    empty: this.i18n.homeFxEmpty,
                });
                if (!snapshot) throw new Error("invalid_frankfurter_rates");
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeFxEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 12 * 60 * 60 * 1000});
        // Miniflux 未读：用户自建实例 + API Token。Token 仅经 X-Auth-Token 请求头传递
        // （不进 URL/缓存 key/错误消息），URL 走"已知路由"白名单；15 分钟缓存。
        register("external-rss-miniflux", this.i18n.homeMiniflux, "iconRss", this.i18n.homeDescMiniflux, [], async (config, _device, context) => {
            const normalized = normalizeMinifluxConfig(config);
            const url = buildMinifluxRequestUrl(normalized);
            if (!url || !normalized.token) return {emptyHint: this.i18n.homeMinifluxConfigHint, items: []};
            try {
                const envelope = await loadMinifluxEntries(url, normalized.token, {
                    signal: context?.signal,
                    fetchImpl: (reqUrl: string, init: {body?: string; headers?: Record<string, string>}) => this.fetchActivityWatchViaKernel(reqUrl, init),
                });
                const snapshot = buildMinifluxSnapshot(envelope, normalized, {
                    title: this.i18n.homeMiniflux,
                    unread: this.i18n.homeMinifluxStat,
                    source: this.i18n.homeQuoteSource,
                });
                if (!snapshot) throw new Error("invalid_miniflux_entries");
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                if (error?.message === "invalid_token") return {emptyHint: this.i18n.homeMinifluxConfigHint, items: []};
                return {emptyHint: `${this.i18n.homeMinifluxEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 15 * 60 * 1000});
        // iCal 订阅：用户提供的 .ics 订阅地址（https/本机）。文本经内核代理抓取，
        // RFC 5545 有界解析后只渲染未来窗口内的日程；30 分钟缓存，失效回退 stale。
        register("external-ical-events", this.i18n.homeIcal, "iconCalendar", this.i18n.homeDescIcal, [], async (config, _device, context) => {
            const normalized = normalizeIcalSubscriptionConfig(config);
            if (!normalized.url) return {emptyHint: this.i18n.homeIcalConfigHint, items: []};
            try {
                const feed = await loadIcalText(normalized.url, {
                    signal: context?.signal,
                    fetchImpl: (reqUrl: string, init: {body?: string; headers?: Record<string, string>}) => this.fetchActivityWatchViaKernel(reqUrl, init),
                });
                const snapshot = buildIcalSnapshot(feed.text, normalized, {empty: this.i18n.homeIcalEmpty}, undefined, feed.status);
                if (!snapshot) throw new Error("invalid_ical_payload");
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeIcalEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 30 * 60 * 1000});
        // GitHub 贡献：官方公开事件流（免 Key，可选 Token 走请求头）。分页抓取经内核代理，
        // 事件流按周汇总为列表；60 分钟缓存，失效回退 stale。
        register("external-github-contrib", this.i18n.homeGithub, "iconGraph", this.i18n.homeDescGithub, [], async (config, _device, context) => {
            const normalized = normalizeGithubContribConfig(config);
            if (!normalized.ok) return {emptyHint: this.i18n.homeGithubConfigHint, items: []};
            try {
                const envelope = await loadGithubEvents(normalized, {
                    signal: context?.signal,
                    fetchImpl: (reqUrl: string, init: {body?: string; headers?: Record<string, string>}) => this.fetchActivityWatchViaKernel(reqUrl, init),
                });
                const snapshot = buildGithubContribSnapshot(envelope.text, normalized, {empty: this.i18n.homeGithubEmpty}, undefined, envelope.status);
                if (!snapshot) throw new Error("invalid_github_payload");
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: `${this.i18n.homeGithubEmpty} · ${this.i18n.homeRetry}`, items: []};
            }
        }, {timeoutMs: 8500, cacheTtlMs: 60 * 60 * 1000});
        // 每日引言：完全离线的本地语录集，按本地日期稳定轮换；无网络请求。
        // 自定义语录（多行，整体替换内置集）走 textarea 配置；挂到分钟心跳以在跨天时轮换。
        register("external-quote-daily", this.i18n.homeQuote, "iconQuote", this.i18n.homeDescQuote, [], (config) => {
            const snapshot = buildDailyQuoteSnapshot(new Date(), config, {
                title: this.i18n.homeQuote,
                source: this.i18n.homeQuoteSource,
                customSource: this.i18n.homeQuoteCustomSource,
            });
            if (!snapshot) return {emptyHint: this.i18n.homeQuoteEmpty, items: []};
            return snapshot;
        });
        // 设备电量：完全本地。能力探测在宿主层——不支持 Battery Status API 的宿主
        // 显示诚实降级文案而非空白；移动端 WebView 普遍不支持，故不声明移动端。
        register("external-device-battery", this.i18n.homeBattery, "iconDashboard", this.i18n.homeDescBattery, [], async (config, _device, context) => {
            const getBattery = (navigator as unknown as {getBattery?: () => Promise<any>}).getBattery;
            if (typeof getBattery !== "function") return {emptyHint: this.i18n.homeBatteryUnsupported, items: []};
            try {
                const manager = await getBattery.call(navigator);
                const snapshot = buildBatterySnapshot(manager, {
                    title: this.i18n.homeBattery,
                    charging: this.i18n.homeBatteryCharging,
                    discharging: this.i18n.homeBatteryDischarging,
                    hours: this.i18n.homeBatteryHours,
                    minutes: this.i18n.homeBatteryMinutes,
                    source: this.i18n.homeQuoteSource,
                });
                if (!snapshot) return {emptyHint: this.i18n.homeBatteryUnsupported, items: []};
                return snapshot;
            } catch (error) {
                if (error?.message === "aborted") throw error;
                return {emptyHint: this.i18n.homeBatteryUnsupported, items: []};
            }
        }, {timeoutMs: 3000, cacheTtlMs: 30 * 1000});
        register("external-activitywatch-time", this.i18n.homeActivityWatch, "iconClock", this.i18n.homeDescActivityWatch, [], async (config, _device, context) => {
            const request = buildActivityWatchRequest(config, Date.now());
            if (!request) return {emptyHint: this.i18n.homeActivityWatchConfigHint, items: []};
                try {
                    const envelope = await loadActivityWatchSummary(request, {
                        signal: context?.signal,
                        timeoutMs: 5000,
                        fetchImpl: (url: string, init: {body?: string}) => this.fetchActivityWatchViaKernel(url, init),
                    });
                    const snapshot = buildActivityWatchSnapshot(envelope, config, {
                        range: this.i18n.homeActivityWatchRange,
                        total: this.i18n.homeActivityWatchTotal,
                        empty: this.i18n.homeActivityWatchEmpty,
                    });
                    if (!snapshot) throw new Error("invalid_activitywatch_payload");
                    return snapshot;
                } catch (error) {
                    if (error?.message === "aborted") throw error;
                    return {emptyHint: `${this.i18n.homeActivityWatchConfigHint} · ${this.i18n.homeRetry}`, items: []};
                }
        }, {timeoutMs: 7000, cacheTtlMs: 5 * 60 * 1000});
}
