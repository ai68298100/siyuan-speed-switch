"use strict";

// 电池/设备状态：完全本地，无网络请求、无持久化。
// 数据来自浏览器 Battery Status API（Chromium 系可用；思源桌面为 Electron/Chromium，
// 移动端 WebView 大多不支持）——能力探测在宿主层完成（typeof navigator.getBattery），
// 探测不到时组件显示诚实降级文案，不虚报支持。本模块只做纯数据归一化。

const LEVEL_MIN = 0;
const LEVEL_MAX = 1;
// 充电/剩余时间由实现方以秒或 Infinity 提供；超过该上限视为"无有效估计"。
const TIME_ESTIMATE_MAX_SECONDS = 60 * 60 * 24 * 7;

function normalizeBatteryReading(value) {
    const source = value && typeof value === "object" ? value : {};
    const level = Number(source.level);
    const safeLevel = Number.isFinite(level) && level >= LEVEL_MIN && level <= LEVEL_MAX
        ? Math.round(level * 100) / 100
        : null;
    // Chromium 历史上出现过 level 恒 0 的实现缺陷（如部分 Android WebView）：
    // 0 是合法放电终点，但作为"当前电量"更可能是缺陷而非真实值，标记无效交给上层降级。
    const usable = safeLevel !== null && (safeLevel > 0 || source.allowEmptyLevel === true);
    return {
        level: usable ? safeLevel : null,
        levelPercent: usable ? Math.round(safeLevel * 100) : null,
        charging: source.charging === true,
        chargingTime: normalizeTimeEstimate(source.chargingTime),
        dischargingTime: normalizeTimeEstimate(source.dischargingTime),
    };
}

function normalizeTimeEstimate(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0 || value > TIME_ESTIMATE_MAX_SECONDS) return null;
    return Math.trunc(value);
}

function formatDuration(seconds, labels = {}) {
    const total = Math.trunc(Number(seconds));
    if (!Number.isFinite(total) || total <= 0) return "";
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const hourLabel = boundedLabel(labels.hours, "小时");
    const minuteLabel = boundedLabel(labels.minutes, "分钟");
    if (hours > 0) return `${hours} ${hourLabel}${minutes > 0 ? ` ${minutes} ${minuteLabel}` : ""}`;
    return `${Math.max(minutes, 1)} ${minuteLabel}`;
}

function boundedLabel(value, fallback) {
    if (typeof value !== "string") return fallback;
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
    return cleaned || fallback;
}

// T-6452：显示开关（预计时间/来源行默认开，与旧版一致）
function normalizeBatteryConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        showEstimate: source.showEstimate !== "否" && source.showEstimate !== false,
        showSource: source.showSource !== "否" && source.showSource !== false,
    };
}

function buildBatterySnapshot(reading, labels = {}, config = {}) {
    const normalized = normalizeBatteryReading(reading);
    if (normalized.levelPercent === null) return null;
    const flags = normalizeBatteryConfig(config);
    const state = normalized.charging
        ? boundedLabel(labels.charging, "充电中")
        : boundedLabel(labels.discharging, "使用电池");
    const timeEstimate = normalized.charging ? normalized.chargingTime : normalized.dischargingTime;
    const timeText = flags.showEstimate && timeEstimate !== null ? ` · ${formatDuration(timeEstimate, labels)}` : "";
    const items = [
        {label: state, value: `${normalized.levelPercent}%${timeText}`},
    ];
    const sourceLabel = boundedLabel(labels.source, "数据来源");
    if (flags.showSource && sourceLabel) items.push({label: `${sourceLabel}：Battery Status API`, value: ""});
    return {
        title: boundedLabel(labels.title, "设备电量"),
        stat: {value: `${normalized.levelPercent}%`, label: state},
        items,
        updatedAt: Date.now(),
    };
}

module.exports = {
    TIME_ESTIMATE_MAX_SECONDS,
    normalizeBatteryReading,
    normalizeBatteryConfig,
    normalizeTimeEstimate,
    formatDuration,
    buildBatterySnapshot,
};
