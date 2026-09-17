"use strict";

// 单向依赖网络模块仅取 ECB 货币白名单常量（network 模块无副作用、无反向依赖）。
const {FRANKFURTER_CURRENCIES} = require("./life-widget-network.js");

const WEATHER_CONDITIONS = Object.freeze(["clear", "cloudy", "fog", "rain", "snow", "storm"]);
const TEMPERATURE_UNITS = Object.freeze(["°C", "°F"]);
const BANGUMI_DAY_RANGES = Object.freeze(["今天", "明天", "本周"]);
const EXTERNAL_FEED_PROVIDERS = Object.freeze(["dailyhot", "newsnow"]);
const DAILYHOT_ROUTES = Object.freeze(["weibo", "zhihu", "bilibili", "baidu", "douyin", "douban-movie", "ithome", "36kr", "sspai", "v2ex"]);
const ACTIVITYWATCH_DEFAULT_ENDPOINT = "http://127.0.0.1:5600";

function boundedText(value, max = 128) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
        : "";
}

function normalizeWeatherConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const city = boundedText(source.city, 64);
    const temperatureUnit = TEMPERATURE_UNITS.includes(source.temperatureUnit) ? source.temperatureUnit : "°C";
    const requestedDays = Math.trunc(Number(source.forecastDays));
    const forecastDays = Number.isFinite(requestedDays) ? Math.min(5, Math.max(2, requestedDays)) : 4;
    return {city, temperatureUnit, forecastDays};
}

function normalizeWeatherLocale(value) {
    const locale = boundedText(value, 32).replace(/_/g, "-");
    return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : "zh-CN";
}

function buildWeatherGeocodingUrl(config, locale = "zh-CN") {
    const normalized = normalizeWeatherConfig(config);
    if (normalized.city.length < 2) return "";
    const language = normalizeWeatherLocale(locale).split("-")[0].toLowerCase();
    return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalized.city)}&count=1&language=${encodeURIComponent(language)}&format=json`;
}

function normalizeWeatherLocation(payload) {
    const source = payload && typeof payload === "object" && Array.isArray(payload.results) ? payload.results[0] : null;
    if (!source || typeof source !== "object") return null;
    const latitude = Number(source.latitude);
    const longitude = Number(source.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    const parts = [source.name, source.admin1, source.country].map((item) => boundedText(item, 48)).filter(Boolean);
    const label = [...new Set(parts)].join(" · ").slice(0, 96);
    return {latitude, longitude, label: label || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`};
}

function buildWeatherForecastUrl(location, config) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "";
    const normalized = normalizeWeatherConfig(config);
    const unit = normalized.temperatureUnit === "°F" ? "&temperature_unit=fahrenheit" : "";
    return "https://api.open-meteo.com/v1/forecast"
        + `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}`
        + "&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
        + `&timezone=auto&forecast_days=${normalized.forecastDays}${unit}`;
}

function weatherCondition(code) {
    const value = Math.trunc(Number(code));
    if (value === 0) return "clear";
    if (value >= 1 && value <= 3) return "cloudy";
    if (value === 45 || value === 48) return "fog";
    if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return "rain";
    if ((value >= 71 && value <= 77) || value === 85 || value === 86) return "snow";
    if (value >= 95) return "storm";
    return "cloudy";
}

function weatherIcon(condition, isDay = true) {
    if (condition === "clear") return isDay ? "☀️" : "🌙";
    if (condition === "fog") return "🌫️";
    if (condition === "rain") return "🌧️";
    if (condition === "snow") return "🌨️";
    if (condition === "storm") return "⛈️";
    return isDay ? "⛅" : "☁️";
}

function finiteNumber(value, min, max, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeWeatherPayload(payload, maxDays = 5) {
    const source = payload && typeof payload === "object" ? payload : {};
    const current = source.current && typeof source.current === "object" ? source.current : {};
    const daily = source.daily && typeof source.daily === "object" ? source.daily : {};
    const times = Array.isArray(daily.time) ? daily.time : [];
    const limit = Math.min(5, Math.max(1, Math.trunc(Number(maxDays)) || 5), times.length);
    const days = [];
    for (let index = 0; index < limit; index += 1) {
        const date = boundedText(times[index], 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        days.push({
            date,
            code: Math.trunc(finiteNumber(daily.weather_code?.[index], 0, 99, 3)),
            high: finiteNumber(daily.temperature_2m_max?.[index], -100, 100),
            low: finiteNumber(daily.temperature_2m_min?.[index], -100, 100),
            precipitation: Math.round(finiteNumber(daily.precipitation_probability_max?.[index], 0, 100)),
        });
    }
    if (days.length === 0 || !Number.isFinite(Number(current.temperature_2m))) return null;
    return {
        temperature: finiteNumber(current.temperature_2m, -100, 100),
        apparent: finiteNumber(current.apparent_temperature, -100, 100, Number(current.temperature_2m)),
        wind: finiteNumber(current.wind_speed_10m, 0, 500),
        code: Math.trunc(finiteNumber(current.weather_code, 0, 99, 3)),
        isDay: Number(current.is_day) !== 0,
        days,
    };
}

function formatWeekday(isoDate, locale, todayLabel, referenceTime = Date.now()) {
    const date = new Date(`${isoDate}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return isoDate;
    const now = new Date(Number.isFinite(referenceTime) ? referenceTime : Date.now());
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return todayLabel;
    try {
        return new Intl.DateTimeFormat(normalizeWeatherLocale(locale), {weekday: "short"}).format(date);
    } catch (_) {
        return isoDate.slice(5);
    }
}

function buildWeatherSnapshot(location, payload, config, labels = {}, now = Date.now()) {
    const normalizedConfig = normalizeWeatherConfig(config);
    const weather = normalizeWeatherPayload(payload, normalizedConfig.forecastDays);
    if (!location || !weather) return null;
    const names = {
        clear: boundedText(labels.clear, 24) || "晴",
        cloudy: boundedText(labels.cloudy, 24) || "多云",
        fog: boundedText(labels.fog, 24) || "雾",
        rain: boundedText(labels.rain, 24) || "雨",
        snow: boundedText(labels.snow, 24) || "雪",
        storm: boundedText(labels.storm, 24) || "雷暴",
    };
    const currentCondition = weatherCondition(weather.code);
    const degree = normalizedConfig.temperatureUnit;
    const items = weather.days.map((day) => {
        const condition = weatherCondition(day.code);
        const weekday = formatWeekday(day.date, labels.locale, boundedText(labels.today, 16) || "今天", now);
        return {
            label: `${weekday} ${weatherIcon(condition, true)} ${Math.round(day.low)}° / ${Math.round(day.high)}°`,
            value: "",
            secondary: `${names[condition]} · ${(boundedText(labels.rainChance, 16) || "降水")} ${day.precipitation}%`,
        };
    });
    items.push({label: "Open-Meteo · CC BY 4.0", value: "", href: "https://open-meteo.com/"});
    return {
        title: boundedText(location.label, 96),
        stat: {
            value: `${Math.round(weather.temperature)}°`,
            label: `${weatherIcon(currentCondition, weather.isDay)} ${names[currentCondition]} · ${(boundedText(labels.feelsLike, 16) || "体感")} ${Math.round(weather.apparent)}°`,
        },
        items,
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        unit: degree,
    };
}

function normalizeHolidayPayload(payload, expectedYear) {
    const year = Math.trunc(Number(payload?.year));
    if (!Number.isFinite(year) || year !== Math.trunc(Number(expectedYear)) || !Array.isArray(payload?.days)) return [];
    const seen = new Set();
    return payload.days.slice(0, 96).reduce((items, day) => {
        const date = boundedText(day?.date, 10);
        const name = boundedText(day?.name, 32);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || typeof day?.isOffDay !== "boolean" || seen.has(date)) return items;
        seen.add(date);
        items.push({date, name, isOffDay: day.isOffDay});
        return items;
    }, []);
}

function mergeHolidayPayloads(entries) {
    const merged = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        const year = Math.trunc(Number(entry?.year));
        normalizeHolidayPayload(entry, year).forEach((day) => merged.set(day.date, day));
    });
    return merged;
}

function holidayPresentation(entry, labels = {}) {
    if (!entry || typeof entry !== "object") return null;
    const name = boundedText(entry.name, 24);
    if (!name || typeof entry.isOffDay !== "boolean") return null;
    return {
        kind: entry.isOffDay ? "off" : "work",
        label: `${name}${entry.isOffDay ? "" : ` · ${boundedText(labels.work, 8) || "班"}`}`.slice(0, 32),
    };
}

function normalizeBangumiConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const dayRange = BANGUMI_DAY_RANGES.includes(source.dayRange) ? source.dayRange : "今天";
    const requestedLimit = Math.trunc(Number(source.limit));
    const limit = Number.isFinite(requestedLimit) ? Math.min(12, Math.max(2, requestedLimit)) : 6;
    return {dayRange, limit, showCovers: source.showCovers !== "否" && source.showCovers !== false};
}

function bangumiWeekdayId(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return 1;
    return date.getDay() === 0 ? 7 : date.getDay();
}

function normalizeBangumiCover(value) {
    const raw = boundedText(value, 512);
    if (!raw) return "";
    try {
        const url = new URL(raw);
        return url.protocol === "https:" && url.hostname === "lain.bgm.tv" && url.pathname.startsWith("/pic/cover/")
            ? url.href : "";
    } catch (_) {
        return "";
    }
}

function normalizeBangumiCalendar(payload) {
    if (!Array.isArray(payload)) return [];
    const seenDays = new Set();
    return payload.slice(0, 7).reduce((days, rawDay) => {
        const weekday = Math.trunc(Number(rawDay?.weekday?.id));
        if (weekday < 1 || weekday > 7 || seenDays.has(weekday) || !Array.isArray(rawDay?.items)) return days;
        seenDays.add(weekday);
        const seenSubjects = new Set();
        const items = rawDay.items.slice(0, 48).reduce((subjects, rawSubject) => {
            const id = Math.trunc(Number(rawSubject?.id));
            const title = boundedText(rawSubject?.name_cn, 96) || boundedText(rawSubject?.name, 96);
            if (!Number.isSafeInteger(id) || id <= 0 || !title || seenSubjects.has(id)) return subjects;
            seenSubjects.add(id);
            const score = Number(rawSubject?.rating?.score);
            const rank = Math.trunc(Number(rawSubject?.rank));
            subjects.push({
                id,
                title,
                originalTitle: boundedText(rawSubject?.name, 96),
                image: normalizeBangumiCover(rawSubject?.images?.large || rawSubject?.images?.common || rawSubject?.images?.medium),
                score: Number.isFinite(score) && score >= 0 && score <= 10 ? Math.round(score * 10) / 10 : null,
                rank: Number.isFinite(rank) && rank > 0 ? Math.min(999999, rank) : null,
            });
            return subjects;
        }, []);
        days.push({weekday, label: boundedText(rawDay?.weekday?.cn, 16), items});
        return days;
    }, []).sort((a, b) => a.weekday - b.weekday);
}

function buildBangumiSnapshot(payload, config, labels = {}, now = Date.now()) {
    const calendar = normalizeBangumiCalendar(payload);
    if (calendar.length === 0) return null;
    const normalized = normalizeBangumiConfig(config);
    const today = bangumiWeekdayId(now);
    const tomorrow = today === 7 ? 1 : today + 1;
    const requestedDays = normalized.dayRange === "明天"
        ? [tomorrow]
        : normalized.dayRange === "本周"
            ? Array.from({length: 7}, (_, index) => ((today - 1 + index) % 7) + 1)
            : [today];
    const byDay = new Map(calendar.map((day) => [day.weekday, day]));
    const dayNames = Array.isArray(labels.weekdays) && labels.weekdays.length >= 7
        ? labels.weekdays.map((item) => boundedText(item, 16))
        : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const selected = [];
    requestedDays.forEach((weekday) => {
        const day = byDay.get(weekday);
        day?.items.forEach((subject) => {
            if (selected.length >= normalized.limit) return;
            const score = Number.isFinite(subject.score) && subject.score > 0 ? `★ ${subject.score.toFixed(1)}` : "";
            const dayLabel = normalized.dayRange === "本周" ? dayNames[weekday - 1] : "";
            selected.push({
                label: subject.title,
                value: "",
                secondary: [dayLabel, score].filter(Boolean).join(" · "),
                href: `https://bgm.tv/subject/${subject.id}`,
                ...(normalized.showCovers && subject.image ? {image: subject.image} : {}),
            });
        });
    });
    const rangeLabel = normalized.dayRange === "明天"
        ? (boundedText(labels.tomorrow, 24) || "明天")
        : normalized.dayRange === "本周"
            ? (boundedText(labels.week, 24) || "本周")
            : (boundedText(labels.today, 24) || "今天");
    selected.push({label: boundedText(labels.source, 48) || "数据来源：Bangumi", value: "", href: "https://bgm.tv/calendar"});
    return {
        title: `${rangeLabel} · ${Math.max(0, selected.length - 1)} ${boundedText(labels.entries, 16) || "部"}`,
        items: selected,
        updatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    };
}

function normalizeFeedConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const requestedLimit = Math.trunc(Number(source.limit));
    return {
        endpoint: boundedText(source.endpoint, 512),
        limit: Number.isFinite(requestedLimit) ? Math.min(12, Math.max(3, requestedLimit)) : 8,
        showHot: source.showHot !== "否" && source.showHot !== false,
    };
}

function isLocalFeedHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function normalizeConfiguredFeedUrl(value, provider) {
    const kind = EXTERNAL_FEED_PROVIDERS.includes(provider) ? provider : "";
    const raw = boundedText(value, 512);
    if (!kind || !raw) return "";
    try {
        const url = new URL(raw);
        if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLocalFeedHost(url.hostname)))
            || url.username || url.password || url.hash) return "";
        if (kind === "dailyhot") {
            const match = url.pathname.match(/^\/(?:api\/)?([a-z0-9-]{2,32})\/?$/);
            if (!match || !DAILYHOT_ROUTES.includes(match[1]) || url.search) return "";
        } else {
            if (url.pathname.replace(/\/$/, "") !== "/api/s") return "";
            const entries = [...url.searchParams.entries()];
            if (entries.length !== 1 || entries[0][0] !== "id" || !/^[a-z0-9-]{2,48}$/.test(entries[0][1])) return "";
        }
        return url.href;
    } catch (_) {
        return "";
    }
}

function normalizeExternalItemHref(value) {
    const raw = boundedText(value, 512);
    if (!raw) return "";
    try {
        const url = new URL(raw);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch (_) {
        return "";
    }
}

function normalizeFeedTimestamp(value, fallback = 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    const parsed = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : (Number.isFinite(Number(fallback)) ? Number(fallback) : 0);
}

function normalizeExternalFeedPayload(payload, provider, limit = 8) {
    if (!EXTERNAL_FEED_PROVIDERS.includes(provider) || !payload || typeof payload !== "object") return null;
    const requested = Math.min(12, Math.max(3, Math.trunc(Number(limit)) || 8));
    const rawItems = Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.items) ? payload.items : []);
    const seen = new Set();
    const items = rawItems.slice(0, 48).reduce((result, raw, index) => {
        const title = boundedText(raw?.title || raw?.name, 160);
        const href = normalizeExternalItemHref(raw?.url || raw?.mobileUrl || raw?.link);
        const key = href || boundedText(raw?.id, 96) || title;
        if (!title || !key || seen.has(key) || result.length >= requested) return result;
        seen.add(key);
        const hot = typeof raw?.hot === "string" || Number.isFinite(Number(raw?.hot)) ? boundedText(String(raw.hot), 32) : "";
        const publishedAt = normalizeFeedTimestamp(raw?.pubDate || raw?.timestamp || raw?.date, 0);
        result.push({title, href, hot, publishedAt, rank: index + 1});
        return result;
    }, []);
    const updatedAt = normalizeFeedTimestamp(payload.updateTime || payload.updatedTime, 0);
    return {
        title: boundedText(payload.title || payload.name || payload.id, 64),
        items,
        updatedAt,
        upstreamCached: payload.fromCache === true || payload.from === "cache" || payload.status === "cache",
    };
}

function buildExternalFeedSnapshot(envelope, config, provider, labels = {}) {
    const normalizedConfig = normalizeFeedConfig(config);
    const feed = normalizeExternalFeedPayload(envelope?.payload, provider, normalizedConfig.limit);
    if (!feed) return null;
    const sourceName = provider === "newsnow" ? "NewsNow" : "DailyHotApi";
    const health = ["fresh", "cached", "stale"].includes(envelope?.status) ? envelope.status : "fresh";
    const items = feed.items.map((item) => ({
        label: item.title,
        value: "",
        href: item.href,
        rank: item.rank,
        secondary: normalizedConfig.showHot && item.hot
            ? `${boundedText(labels.hot, 16) || "热度"} ${item.hot}`
            : "",
    }));
    items.push({
        label: `${boundedText(labels.source, 32) || "数据来源"}：${sourceName}`,
        value: "",
        href: provider === "newsnow" ? "https://github.com/ourongxing/newsnow" : "https://github.com/imsyy/DailyHotApi",
    });
    return {
        title: feed.title || sourceName,
        items,
        emptyHint: items.length === 1 ? (boundedText(labels.empty, 96) || "当前来源暂无内容") : "",
        updatedAt: feed.updatedAt || normalizeFeedTimestamp(envelope?.fetchedAt, Date.now()),
        sourceHealth: health === "fresh" && feed.upstreamCached ? "cached" : health,
    };
}

// iCal 订阅快照：解析 ics 文本 → 未来窗口内的日程条目（有界）。
const {parseIcsEvents, upcomingIcalEvents, normalizeIcalSubscriptionConfig} = require("./ical-model.js");
const {normalizeGithubContribConfig, parseGithubEvents, buildContributionGrid} = require("./github-model.js");

// 热力图格点上限：窗口最长 366 天 → 至多 53 周 × 7 = 371 格（有界，防止条目无限增长）。
const GITHUB_GRID_MAX_CELLS = 371;

function buildIcalSnapshot(icsText, config, labels = {}, now = Date.now(), status = "fresh") {
    const normalized = normalizeIcalSubscriptionConfig(config);
    const parsed = parseIcsEvents(icsText);
    if (!parsed.ok) return null;
    const upcoming = upcomingIcalEvents(parsed.events, now, {windowDays: normalized.windowDays, maxEvents: normalized.maxEvents});
    const pad = (n) => String(n).padStart(2, "0");
    const items = upcoming.map((event) => {
        const d = new Date(event.start);
        const stamp = `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return {
            label: `${stamp} ${event.summary}`,
            value: event.location || "",
            href: "",
        };
    });
    return {
        title: normalized.title,
        items,
        emptyHint: items.length === 0 ? (boundedText(labels.empty, 96) || "窗口内暂无日程") : "",
        updatedAt: now,
        sourceHealth: ["fresh", "cached", "stale"].includes(status) ? status : "fresh",
    };
}

function normalizeHackerNewsConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const requestedLimit = Math.trunc(Number(source.limit));
    return {
        limit: Number.isFinite(requestedLimit) ? Math.min(12, Math.max(3, requestedLimit)) : 8,
        showMeta: source.showMeta !== "否" && source.showMeta !== false,
    };
}

// GitHub 贡献快照：公开事件流 → UTC 日期桶 → 周汇总列表（最近至多 6 周，最新在前）。
// 口径与 github-model.js 头注释一致（Push 按提交数加权、star 不计）；解析失败或
// 空数据返回 null，由 adapter 归一为 emptyHint + 重试提示。
function buildGithubContribSnapshot(eventsText, config, labels = {}, now = Date.now(), status = "fresh") {
    const normalized = normalizeGithubContribConfig(config);
    if (!normalized.ok) return null;
    const parsed = parseGithubEvents(eventsText);
    if (!parsed.ok) return null;
    const grid = buildContributionGrid(parsed.daily, {windowDays: normalized.windowDays}, now);
    // 布局：config.layout === "grid" → 格点热力图（视图层按 viewType=heatmap 渲染）；
    // 其余（含缺省）保持周汇总列表，既有契约不受影响。
    if (config && config.layout === "grid") {
        const cells = grid.cells.slice(0, GITHUB_GRID_MAX_CELLS).map((cell) => ({
            label: cell.date,
            count: cell.count,
            level: cell.level,
            ...(cell.level === -1 ? {outside: true} : {}),
        }));
        const baseTitle = boundedText(labels.title, 96) || "GitHub 贡献";
        return {
            title: normalized.username ? `${baseTitle} · ${normalized.username}` : baseTitle,
            items: cells,
            emptyHint: "",
            stat: {value: String(grid.total), label: boundedText(labels.stat, 96) || "窗口内贡献"},
            updatedAt: now,
            sourceHealth: ["fresh", "cached", "stale"].includes(status) ? status : "fresh",
        };
    }
    const weeks = [];
    for (let i = 0; i + 7 <= grid.cells.length; i += 7) {
        const row = grid.cells.slice(i, i + 7).filter((cell) => cell.level !== -1);
        if (!row.length) continue;
        weeks.push({start: row[0].date, end: row[row.length - 1].date, count: row.reduce((sum, cell) => sum + cell.count, 0)});
    }
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
    const items = weeks.slice(-6).reverse().map((week) => ({
        label: `${fmt(week.start)}–${fmt(week.end)}`,
        value: String(week.count),
        href: "",
    }));
    if (items.length) {
        items.push({label: `github.com/${normalized.username}`, value: "", href: `https://github.com/${normalized.username}`});
    }
    return {
        title: boundedText(labels.title, 96) || "GitHub 贡献",
        items,
        emptyHint: items.length === 0 ? (boundedText(labels.empty, 96) || "窗口内暂无贡献") : "",
        updatedAt: now,
        sourceHealth: ["fresh", "cached", "stale"].includes(status) ? status : "fresh",
    };
}

// Hacker News 首页快照：Algolia hits → 有界排序列表。标题/链接/得分/评论数全部
// 经 boundedText 清洗；无外链的文本帖回退到 HN 讨论页；条目去重且数量有界。
function buildHackerNewsSnapshot(envelope, config, labels = {}) {
    const normalizedConfig = normalizeHackerNewsConfig(config);
    const hits = Array.isArray(envelope?.payload?.hits) ? envelope.payload.hits : [];
    if (!hits.length) return null;
    const seen = new Set();
    const items = hits.slice(0, 24).reduce((result, hit, index) => {
        if (result.length >= normalizedConfig.limit) return result;
        if (!hit || typeof hit !== "object") return result;
        const title = boundedText(hit.title, 160);
        if (!title || seen.has(hit.objectID) || seen.has(title)) return result;
        const discussionHref = normalizeExternalItemHref(
            Number.isFinite(Number(hit.objectID)) ? `https://news.ycombinator.com/item?id=${Number(hit.objectID)}` : "");
        const href = normalizeExternalItemHref(hit.url) || discussionHref;
        if (!href) return result;
        seen.add(hit.objectID);
        seen.add(title);
        const points = Math.max(0, Math.trunc(Number(hit.points)) || 0);
        const comments = Math.max(0, Math.trunc(Number(hit.num_comments)) || 0);
        const secondary = normalizedConfig.showMeta
            ? `${boundedText(labels.points, 16) || "分"} ${points} · ${boundedText(labels.comments, 16) || "评"} ${comments}`
            : "";
        result.push({label: title, value: "", href, rank: result.length + 1, secondary, publishedAt: normalizeFeedTimestamp(hit.created_at_i, 0)});
        return result;
    }, []);
    items.push({
        label: `${boundedText(labels.source, 32) || "数据来源"}：Hacker News`,
        value: "",
        href: "https://news.ycombinator.com/",
    });
    const health = ["fresh", "cached", "stale"].includes(envelope?.status) ? envelope.status : "fresh";
    const newest = items.reduce((latest, item) => Math.max(latest, Number(item.publishedAt) || 0), 0);
    return {
        title: boundedText(labels.title, 64) || "Hacker News",
        items,
        emptyHint: items.length === 1 ? (boundedText(labels.empty, 96) || "当前来源暂无内容") : "",
        updatedAt: newest || normalizeFeedTimestamp(envelope?.fetchedAt, Date.now()),
        sourceHealth: health,
    };
}

// Uptime Kuma 服务状态：公开状态页 JSON → 有界监控项列表。
// 只消费 id/name/type/status/ping/uptime 等公开字段，不读取任何告警配置。
function normalizeUptimeKumaConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawOrigin = boundedText(source.endpoint, 256);
    const rawSlug = boundedText(source.slug, 64).toLowerCase();
    let origin = "";
    try {
        const url = new URL(rawOrigin);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol === "https:" || (url.protocol === "http:" && local))
            && !url.username && !url.password && (url.pathname === "/" || url.pathname === "")
            && !url.search && !url.hash) {
            origin = `${url.protocol}//${url.host}`;
        }
    } catch (_) { /* 留空触发配置提示 */ }
    const slug = /^[a-z0-9][a-z0-9-]{1,63}$/.test(rawSlug) ? rawSlug : "";
    return {origin, slug};
}

function normalizeUptimeKumaStatus(payload) {
    if (!payload || typeof payload !== "object") return null;
    const groups = Array.isArray(payload.publicGroupList) ? payload.publicGroupList : [];
    const monitors = groups.slice(0, 8).reduce((result, group) => {
        const list = group && Array.isArray(group.monitorList) ? group.monitorList : [];
        list.forEach((monitor) => {
            if (result.length >= 24) return;
            const id = Number(monitor?.id);
            const name = boundedText(monitor?.name, 96);
            if (!Number.isFinite(id) || !name) return;
            result.push({id, name});
        });
        return result;
    }, []);
    const title = payload.config && typeof payload.config === "object" ? boundedText(payload.config.title, 64) : "";
    const incident = payload.incident && typeof payload.incident === "object"
        ? boundedText(payload.incident.title, 96) : "";
    return {title, incident, monitors};
}

function normalizeUptimeKumaHeartbeat(payload) {
    if (!payload || typeof payload !== "object") return null;
    const beats = payload.heartbeatList && typeof payload.heartbeatList === "object" ? payload.heartbeatList : {};
    const uptimes = payload.uptimeList && typeof payload.uptimeList === "object" ? payload.uptimeList : {};
    const latest = {};
    Object.keys(beats).slice(0, 32).forEach((key) => {
        const list = Array.isArray(beats[key]) ? beats[key] : [];
        const last = list.length > 0 ? list[list.length - 1] : null;
        if (!last || typeof last !== "object") return;
        const ping = Number(last.ping);
        latest[key] = {
            up: Number(last.status) === 1,
            ping: Number.isFinite(ping) && ping >= 0 ? Math.min(600000, Math.trunc(ping)) : null,
        };
    });
    const uptime = {};
    Object.keys(uptimes).slice(0, 32).forEach((key) => {
        const value = Number(uptimes[key]);
        if (Number.isFinite(value) && value >= 0 && value <= 1) uptime[key] = value;
    });
    return {latest, uptime};
}

function buildUptimeKumaSnapshot(statusEnvelope, heartbeatEnvelope, config, labels = {}) {
    const status = normalizeUptimeKumaStatus(statusEnvelope?.payload);
    const heartbeat = normalizeUptimeKumaHeartbeat(heartbeatEnvelope?.payload);
    if (!status || !status.monitors.length) return null;
    const upText = boundedText(labels.up, 16) || "正常";
    const downText = boundedText(labels.down, 16) || "异常";
    const items = [];
    if (status.incident) {
        items.push({label: `${boundedText(labels.incident, 16) || "事件"}：${status.incident}`, value: "", rank: 1});
    }
    let upCount = 0;
    status.monitors.forEach((monitor) => {
        const beat = heartbeat?.latest[String(monitor.id)];
        const isUp = beat ? beat.up : false;
        if (isUp) upCount += 1;
        const uptime24 = heartbeat?.uptime[`${monitor.id}_24`];
        const uptimeText = Number.isFinite(uptime24) ? ` · ${(uptime24 * 100).toFixed(2)}%` : "";
        const pingText = beat && beat.ping !== null ? ` · ${beat.ping}ms` : "";
        items.push({
            label: monitor.name,
            value: `${isUp ? upText : downText}${pingText}${uptimeText}`,
            rank: items.length + 1,
        });
    });
    items.push({
        label: `${boundedText(labels.source, 32) || "数据来源"}：Uptime Kuma`,
        value: "",
    });
    const healthOf = (envelope) => ["fresh", "cached", "stale"].includes(envelope?.status) ? envelope.status : "fresh";
    const health = healthOf(statusEnvelope) === "stale" || healthOf(heartbeatEnvelope) === "stale" ? "stale"
        : (healthOf(statusEnvelope) === "fresh" && healthOf(heartbeatEnvelope) === "fresh") ? "fresh" : "cached";
    return {
        title: status.title || boundedText(labels.title, 64) || "服务状态",
        stat: {value: `${upCount}/${status.monitors.length}`, label: boundedText(labels.stat, 24) || "在线服务"},
        items,
        updatedAt: Number.isFinite(Number(heartbeatEnvelope?.fetchedAt)) ? Number(heartbeatEnvelope.fetchedAt) : Date.now(),
        sourceHealth: health,
    };
}

function buildUptimeKumaPageUrl(config, heartbeat = false) {
    const normalized = normalizeUptimeKumaConfig(config);
    if (!normalized.origin || !normalized.slug) return "";
    return `${normalized.origin}/api/status-page/${heartbeat ? "heartbeat/" : ""}${normalized.slug}`;
}

// Frankfurter 汇率：ECB 日频参考价，货币代码受白名单约束（见 life-widget-network）。
function normalizeFrankfurterConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawBase = boundedText(source.base, 8).toUpperCase();
    const rawQuotes = Array.isArray(source.quotes) ? source.quotes.map(String).join(",")
        : (typeof source.quotes === "string" ? source.quotes : "");
    // base/quotes 都在配置层就过滤到 ECB 白名单：避免用户拼错的货币代码
    // 生成注定被网络白名单拦截的请求，导致卡片静默失效。
    const base = FRANKFURTER_CURRENCIES.includes(rawBase) ? rawBase : "CNY";
    const quotes = [...new Set(rawQuotes.split(/[,，;；\s]+/)
        .map((code) => code.toUpperCase().slice(0, 3))
        .filter((code) => /^[A-Z]{3}$/.test(code) && FRANKFURTER_CURRENCIES.includes(code)))]
        .filter((code) => code !== base)
        .slice(0, 6);
    return {base, quotes};
}

function buildFrankfurterRequestUrl(config) {
    const normalized = normalizeFrankfurterConfig(config);
    if (!normalized.quotes.length) return "";
    return `https://api.frankfurter.dev/v2/rates?base=${normalized.base}&quotes=${normalized.quotes.join(",")}`;
}

function buildFrankfurterSnapshot(envelope, config, labels = {}) {
    const normalized = normalizeFrankfurterConfig(config);
    const rows = Array.isArray(envelope?.payload) ? envelope.payload : [];
    if (!rows.length) return null;
    const byQuote = new Map();
    rows.forEach((row) => {
        if (!row || typeof row !== "object") return;
        const quote = boundedText(row.quote, 8).toUpperCase();
        const rate = Number(row.rate);
        const date = boundedText(row.date, 16);
        if (!/^[A-Z]{3}$/.test(quote) || !Number.isFinite(rate) || rate <= 0 || rate > 1000000 || byQuote.has(quote)) return;
        byQuote.set(quote, {rate, date});
    });
    const items = normalized.quotes.reduce((result, quote) => {
        const hit = byQuote.get(quote);
        if (hit) result.push({label: `${normalized.base} → ${quote}`, value: String(hit.rate), rank: result.length + 1});
        return result;
    }, []);
    if (!items.length) return null;
    const dates = [...new Set([...byQuote.values()].map((hit) => hit.date).filter(Boolean))];
    items.push({
        label: `${boundedText(labels.source, 32) || "数据来源"}：Frankfurter（ECB）${dates[0] ? ` · ${dates[0]}` : ""}`,
        value: "",
    });
    const health = ["fresh", "cached", "stale"].includes(envelope?.status) ? envelope.status : "fresh";
    return {
        title: `${boundedText(labels.title, 48) || "参考汇率"} · ${normalized.base}`,
        stat: {value: items[0].value, label: items[0].label},
        items,
        // 无匹配货币时在 items.length 检查处直接返回 null，由调用方显示重试提示；
        // 到达这里说明至少有一条汇率，来源行恒在，emptyHint 恒为空。
        emptyHint: "",
        updatedAt: Number.isFinite(Number(envelope?.fetchedAt)) ? Number(envelope.fetchedAt) : Date.now(),
        sourceHealth: health,
    };
}

// Miniflux 未读：用户自建 Miniflux 实例的未读文章列表。
// 配置 = 实例 origin + API Token + 条目上限；Token 只进请求头，绝不进 URL。
const MINIFLUX_MAX_ENTRIES = 50;
const MINIFLUX_DEFAULT_LIMIT = 20;

function normalizeMinifluxToken(value) {
    const token = typeof value === "string" ? value.trim() : "";
    if (!token || token.length > 128 || /[\r\n\u0000-\u001f\u007f]/.test(token)) return "";
    return token;
}

function normalizeMinifluxConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawOrigin = boundedText(source.endpoint, 256);
    let origin = "";
    try {
        const url = new URL(rawOrigin);
        const local = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
        if ((url.protocol === "https:" || (url.protocol === "http:" && local))
            && !url.username && !url.password && (url.pathname === "/" || url.pathname === "")
            && !url.search && !url.hash) {
            origin = `${url.protocol}//${url.host}`;
        }
    } catch (_) { /* 留空触发配置提示 */ }
    return {
        origin,
        token: normalizeMinifluxToken(source.token),
        limit: Number.isFinite(Math.trunc(Number(source.limit)))
            ? Math.min(MINIFLUX_MAX_ENTRIES, Math.max(1, Math.trunc(Number(source.limit))))
            : MINIFLUX_DEFAULT_LIMIT,
    };
}

function buildMinifluxRequestUrl(config) {
    const normalized = normalizeMinifluxConfig(config);
    if (!normalized.origin) return "";
    return `${normalized.origin}/v1/entries?status=unread&limit=${normalized.limit}`;
}

// 条目 URL 信任边界：Miniflux 是用户自己的阅读器实例、条目来自用户订阅的源，
// 信任级别高于公开 API（HN 因此拒绝一切非 HTTPS），但仍拒绝 javascript:/data: 等
// 危险 scheme；http 站点允许（自建源常见形态）。
function normalizeMinifluxEntryUrl(value) {
    const url = boundedText(value, 512);
    if (!/^https?:\/\//i.test(url)) return "";
    return url;
}

function normalizeMinifluxEntries(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.entries)) return null;
    const total = Number(payload.total);
    const entries = [];
    for (const raw of payload.entries) {
        if (!raw || typeof raw !== "object" || entries.length >= MINIFLUX_MAX_ENTRIES) break;
        const id = raw.id !== undefined && raw.id !== null ? String(raw.id).slice(0, 64) : "";
        const title = boundedText(raw.title, 96);
        const url = normalizeMinifluxEntryUrl(raw.url);
        if (!id || !title) continue;
        entries.push({
            id,
            title,
            url,
            feed: boundedText(raw.feed?.title, 64),
            published: boundedText(typeof raw.published_at === "string" ? raw.published_at.slice(0, 10) : "", 10),
        });
    }
    return {total: Number.isFinite(total) && total >= 0 ? total : entries.length, entries};
}

function buildMinifluxSnapshot(envelope, config, labels = {}) {
    const parsed = normalizeMinifluxEntries(envelope?.payload);
    if (!parsed || !parsed.entries.length) return null;
    const items = parsed.entries.map((entry, index) => {
        const meta = [entry.feed, entry.published].filter(Boolean).join(" · ");
        return {label: entry.title, value: meta, href: entry.url || undefined, rank: index + 1};
    });
    items.push({
        label: `${boundedText(labels.source, 32) || "数据来源"}：Miniflux`,
        value: "",
    });
    const health = ["fresh", "cached", "stale"].includes(envelope?.status) ? envelope.status : "fresh";
    return {
        title: boundedText(labels.title, 48) || "未读文章",
        stat: {value: String(parsed.total), label: boundedText(labels.unread, 24) || "未读"},
        items,
        emptyHint: "",
        updatedAt: Number.isFinite(Number(envelope?.fetchedAt)) ? Number(envelope.fetchedAt) : Date.now(),
        sourceHealth: health,
    };
}

function normalizeActivityWatchEndpoint(value) {
    const raw = boundedText(value, 256) || ACTIVITYWATCH_DEFAULT_ENDPOINT;
    try {
        const url = new URL(raw);
        if (!["http:", "https:"].includes(url.protocol) || !isLocalFeedHost(url.hostname)
            || url.username || url.password || url.search || url.hash) return "";
        if (url.pathname !== "/" && url.pathname !== "") return "";
        const port = url.port ? Number(url.port) : (url.protocol === "https:" ? 443 : 80);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return "";
        return `${url.protocol}//${url.host}`;
    } catch (_) {
        return "";
    }
}

function normalizeActivityWatchConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const requestedHours = Math.trunc(Number(source.hours));
    const requestedLimit = Math.trunc(Number(source.limit));
    return {
        endpoint: normalizeActivityWatchEndpoint(source.endpoint),
        hours: Number.isFinite(requestedHours) ? Math.min(168, Math.max(1, requestedHours)) : 24,
        limit: Number.isFinite(requestedLimit) ? Math.min(10, Math.max(3, requestedLimit)) : 6,
    };
}

function buildActivityWatchRequest(config, now = Date.now()) {
    const normalized = normalizeActivityWatchConfig(config);
    const end = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    if (!normalized.endpoint) return null;
    const start = end - normalized.hours * 60 * 60 * 1000;
    const query = [
        'events = flood(query_bucket(find_bucket("aw-watcher-window_")));',
        'duration = sum_durations(events);',
        'app_events = sort_by_duration(merge_events_by_keys(events, ["app"]));',
        `app_events = limit_events(app_events, ${normalized.limit});`,
        'RETURN = {"app_events": app_events, "duration": duration};',
    ];
    return {
        url: `${normalized.endpoint}/api/0/query/`,
        body: {timeperiods: [`${new Date(start).toISOString()}/${new Date(end).toISOString()}`], query},
        config: normalized,
        cacheKey: `${normalized.endpoint}:${normalized.hours}:${normalized.limit}`,
    };
}

function normalizeActivityWatchPayload(payload, limit = 6) {
    const result = Array.isArray(payload) ? payload[0] : null;
    if (!result || typeof result !== "object" || !Array.isArray(result.app_events)) return null;
    const requested = Math.min(10, Math.max(3, Math.trunc(Number(limit)) || 6));
    const seen = new Set();
    const apps = result.app_events.slice(0, 32).reduce((items, event) => {
        const app = boundedText(event?.data?.app, 80);
        const seconds = finiteNumber(event?.duration, 0, 7 * 24 * 60 * 60, 0);
        const key = app.toLocaleLowerCase();
        if (!app || seconds <= 0 || seen.has(key) || items.length >= requested) return items;
        seen.add(key);
        items.push({app, seconds});
        return items;
    }, []);
    const duration = finiteNumber(result.duration, 0, 7 * 24 * 60 * 60, apps.reduce((sum, item) => sum + item.seconds, 0));
    return {apps, duration};
}

function formatActivityDuration(seconds) {
    const minutes = Math.max(0, Math.round(finiteNumber(seconds, 0, 7 * 24 * 60 * 60) / 60));
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function buildActivityWatchSnapshot(envelope, config, labels = {}) {
    const normalized = normalizeActivityWatchConfig(config);
    const activity = normalizeActivityWatchPayload(envelope?.payload, normalized.limit);
    if (!activity) return null;
    const health = ["fresh", "cached", "stale"].includes(envelope?.status) ? envelope.status : "fresh";
    return {
        title: (boundedText(labels.range, 48) || "近 {hours} 小时").replace("{hours}", String(normalized.hours)),
        stat: {value: formatActivityDuration(activity.duration), label: boundedText(labels.total, 32) || "前台使用"},
        items: activity.apps.map((item, index) => ({
            label: item.app,
            value: "",
            secondary: formatActivityDuration(item.seconds),
            count: Math.max(1, Math.round(item.seconds / 60)),
            rank: index + 1,
        })),
        emptyHint: activity.apps.length ? "" : (boundedText(labels.empty, 96) || "当前范围暂无使用记录"),
        updatedAt: Number(envelope?.fetchedAt) || Date.now(),
        sourceHealth: health,
    };
}

module.exports = {
    WEATHER_CONDITIONS,
    TEMPERATURE_UNITS,
    BANGUMI_DAY_RANGES,
    EXTERNAL_FEED_PROVIDERS,
    DAILYHOT_ROUTES,
    ACTIVITYWATCH_DEFAULT_ENDPOINT,
    normalizeWeatherConfig,
    normalizeWeatherLocale,
    buildWeatherGeocodingUrl,
    normalizeWeatherLocation,
    buildWeatherForecastUrl,
    weatherCondition,
    weatherIcon,
    normalizeWeatherPayload,
    buildWeatherSnapshot,
    normalizeHolidayPayload,
    mergeHolidayPayloads,
    holidayPresentation,
    normalizeBangumiConfig,
    bangumiWeekdayId,
    normalizeBangumiCover,
    normalizeBangumiCalendar,
    buildBangumiSnapshot,
    normalizeFeedConfig,
    isLocalFeedHost,
    normalizeConfiguredFeedUrl,
    normalizeExternalItemHref,
    normalizeFeedTimestamp,
    normalizeExternalFeedPayload,
    buildExternalFeedSnapshot,
    normalizeHackerNewsConfig,
    buildHackerNewsSnapshot,
    normalizeUptimeKumaConfig,
    normalizeUptimeKumaStatus,
    normalizeUptimeKumaHeartbeat,
    buildUptimeKumaSnapshot,
    buildUptimeKumaPageUrl,
    normalizeFrankfurterConfig,
    buildFrankfurterRequestUrl,
    buildFrankfurterSnapshot,
    normalizeMinifluxToken,
    normalizeMinifluxConfig,
    normalizeIcalSubscriptionConfig,
    parseIcsEvents,
    upcomingIcalEvents,
    buildIcalSnapshot,
    buildGithubContribSnapshot,
    buildMinifluxRequestUrl,
    normalizeMinifluxEntries,
    buildMinifluxSnapshot,
    normalizeActivityWatchEndpoint,
    normalizeActivityWatchConfig,
    buildActivityWatchRequest,
    normalizeActivityWatchPayload,
    formatActivityDuration,
    buildActivityWatchSnapshot,
};
