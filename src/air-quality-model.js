"use strict";

// Open-Meteo 空气质量只读组件纯模型（T-6308）。
// 与天气组件共用地理编码链路（geocoding-api.open-meteo.com，location-only 隐私边界），
// 本文件只承担：配置钳制、请求 URL 构建（数值钳制防注入）、响应归一、欧洲 AQI 分档。
// 分档阈值取 Open-Meteo 官方 European AQI 定义（0-20 优 … >100 严重），视图不重写阈值。

const AQI_BANDS_COUNT = 6;
// T-6439：字段集在原有 AQI+PM 基础上补臭氧/二氧化氮/二氧化硫三项浓度；
// 仍是固定字面量集合（经 URL 白名单与缓存 key 一致性测试钉住），showPollutants
// 只控制展示，不改变请求形状。
const CURRENT_FIELDS = "european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide";

function normalizeAirQualityConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const city = typeof source.city === "string"
        ? source.city.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64)
        : "";
    return {city, showPollutants: source.showPollutants === "是" || source.showPollutants === true};
}

function buildAirQualityUrl(location, config) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "";
    const normalized = normalizeAirQualityConfig(config);
    if (!normalized.city) return "";
    return "https://air-quality-api.open-meteo.com/v1/air-quality"
        + `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}`
        + `&current=${CURRENT_FIELDS}&timezone=auto`;
}

// current 块归一：数值钳制与有限性校验，缺测（Open-Meteo 以 null/缺字段表达）整条丢弃。
function normalizeAirQualityPayload(payload) {
    const current = payload && typeof payload === "object" && payload.current && typeof payload.current === "object"
        ? payload.current
        : null;
    if (!current) return null;
    const aqi = Math.round(Number(current.european_aqi));
    if (!Number.isFinite(aqi) || aqi < 0 || aqi > 500) return null;
    // 注意 Number(null) === 0：缺测必须显式判空，不能只靠 Number 有限性。
    const toConcentration = (value) => {
        if (value === null || value === undefined || value === "") return null;
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? Math.round(num * 10) / 10 : null;
    };
    return {
        aqi,
        pm25: toConcentration(current.pm2_5),
        pm10: toConcentration(current.pm10),
        ozone: toConcentration(current.ozone),
        no2: toConcentration(current.nitrogen_dioxide),
        so2: toConcentration(current.sulphur_dioxide),
    };
}

// 欧洲 AQI 六档：0-20 / 20-40 / 40-60 / 60-80 / 80-100 / >100 → 0..5；越界值钳到两端。
function europeanAqiBand(aqi) {
    const value = Math.min(500, Math.max(0, Math.round(Number(aqi))));
    if (value <= 20) return 0;
    if (value <= 40) return 1;
    if (value <= 60) return 2;
    if (value <= 80) return 3;
    if (value <= 100) return 4;
    return 5;
}

module.exports = {
    AQI_BANDS_COUNT,
    CURRENT_FIELDS,
    normalizeAirQualityConfig,
    buildAirQualityUrl,
    normalizeAirQualityPayload,
    europeanAqiBand,
};
