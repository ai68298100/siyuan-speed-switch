"use strict";

const WEATHER_CONDITIONS = Object.freeze(["clear", "cloudy", "fog", "rain", "snow", "storm"]);
const TEMPERATURE_UNITS = Object.freeze(["°C", "°F"]);
const BANGUMI_DAY_RANGES = Object.freeze(["今天", "明天", "本周"]);

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

module.exports = {
    WEATHER_CONDITIONS,
    TEMPERATURE_UNITS,
    BANGUMI_DAY_RANGES,
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
};
