"use strict";

// 小驴打卡（siyuan-checkin）× 小驴速切：只读桥接模型（ADR 0057）。
//
// 为什么是「速切侧桥接」而不是「打卡侧注册」：
//   打卡插件的生态 API v4（window.siyuanCheckin，协议 siyuan-checkin）已经是稳定公开的
//   只读契约；速切以内建 adapter 直接消费它，组件即刻可用，不必等待打卡插件发版适配。
//   这些组件由速切注册，但通过 source 字段把来源标注为 siyuan-checkin，因此商店仍按
//   「来源插件」把它们归到小驴打卡一组——这正是「同一插件多个组件」的第一个真实案例。
//   若将来打卡插件自行注册相同 moduleId，registerAdapter 的 token 覆盖会让原生实现接管。
//
// 边界：只读、纯本地、不发起网络请求、不写入打卡数据；打卡未安装或能力缺失时返回
// 确定空态（emptyHint）而不是抛错——抛错会触发速切的失败退避，把组件显示成故障态。

const CHECKIN_API_GLOBAL = "siyuanCheckin";
const CHECKIN_PROTOCOL = "siyuan-checkin";
const CHECKIN_LIST_MAX_ITEMS = 24;
const CHECKIN_STREAK_MAX_ITEMS = 12;
const CHECKIN_HEATMAP_MAX_ITEMS = 371;
const CHECKIN_MAX_EVENTS = 4000;
const CHECKIN_CALIBER = "checkin-events-v1";

const CHECKIN_MODULE_IDS = Object.freeze([
    "checkin-today",
    "checkin-streak",
    "checkin-year-heatmap",
    "checkin-weekly",
    "checkin-occasions",
    "checkin-monthly",
]);

const CHECKIN_CAPABILITIES = Object.freeze({
    "checkin-today": "items.read",
    "checkin-streak": "items.read",
    "checkin-year-heatmap": "items.read",
    "checkin-weekly": "analytics.read",
    "checkin-occasions": "occasions.read",
    "checkin-monthly": "items.read",
});

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function boundedNumber(value, fallback, min, max) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(raw)));
}

// 协议握手：只认声明了 siyuan-checkin 协议（或未提供协议字段）的宿主，避免误读同名全局。
function resolveCheckinApi(scope) {
    const holder = scope && typeof scope === "object" ? scope : null;
    const api = holder ? holder[CHECKIN_API_GLOBAL] : null;
    if (!api || typeof api !== "object") return null;
    if (typeof api.protocol === "string" && api.protocol !== CHECKIN_PROTOCOL) return null;
    return api;
}

// 能力协商优先走 hasCapability 握手；旧宿主没有握手方法时按 getter 是否存在推断，
// 且只推断到「读」这一层——绝不用插件版本号猜能力。
function hasCheckinCapability(api, name) {
    if (!api) return false;
    if (typeof api.hasCapability === "function") return api.hasCapability(name) === true;
    if (name === "items.read") return typeof api.getItems === "function" && typeof api.getEvents === "function";
    if (name === "analytics.read") return typeof api.getAnalyticsSnapshot === "function";
    if (name === "occasions.read") return typeof api.getTodayOccasions === "function";
    return false;
}

function safeList(reader) {
    if (typeof reader !== "function") return [];
    try {
        const value = reader();
        return Array.isArray(value) ? value.slice(0, CHECKIN_MAX_EVENTS) : [];
    } catch (_) {
        return [];
    }
}

function safeObject(reader) {
    if (typeof reader !== "function") return null;
    try {
        const value = reader();
        return value && typeof value === "object" ? value : null;
    } catch (_) {
        return null;
    }
}

function localDateKey(input) {
    const date = input instanceof Date ? input : new Date(input);
    if (!Number.isFinite(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function itemName(item, fallback) {
    return boundedText(item && typeof item === "object" ? item.name : "", 64) || fallback;
}

function activeItems(items) {
    return safeList(() => items).filter((item) => item && typeof item === "object" && item.archived !== true);
}

// 今日进度：按 localDate 汇总每个项目当天的记录值。
function sumByItemForDate(events, dateKey) {
    const totals = new Map();
    safeList(() => events).forEach((event) => {
        if (!event || typeof event !== "object") return;
        if (String(event.localDate || "") !== dateKey) return;
        const value = Number(event.value);
        if (!Number.isFinite(value)) return;
        totals.set(String(event.itemId || ""), (totals.get(String(event.itemId || "")) || 0) + value);
    });
    return totals;
}

function isTargetReached(item, value) {
    const target = Number(item && item.target);
    if (Number.isFinite(target) && target > 0) return value >= target;
    return value > 0;
}

// W2 · 今日打卡计划。计划命中口径：未归档项目全部参与（打卡的 schedule/quota 判定是内部
// 权威实现，桥接层不复制它，避免与其规则漂移）；是否达标由 target 决定，once 类 >0 即达标。
function buildCheckinTodaySnapshot(items, events, config, labels, now) {
    const todayKey = localDateKey(Number.isFinite(now) ? now : Date.now());
    const limit = boundedNumber(config?.limit, 6, 1, 12);
    const groupFilter = boundedText(config?.group, 32);
    const totals = sumByItemForDate(events, todayKey);
    const candidates = activeItems(items)
        .filter((item) => !groupFilter || boundedText(item.group, 32) === groupFilter)
        .sort((a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0));
    const rows = candidates.slice(0, limit).map((item) => {
        const value = totals.get(String(item.id || "")) || 0;
        const target = Number(item.target);
        const unit = boundedText(item.unit, 16);
        const done = isTargetReached(item, value);
        const valueText = Number.isFinite(target) && target > 0
            ? `${formatNumber(value)}/${formatNumber(target)}${unit ? ` ${unit}` : ""}`
            : `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
        return {
            label: itemName(item, labels.unnamed || "未命名"),
            value: valueText,
            secondary: boundedText(item.group, 32),
            done,
        };
    });
    const total = candidates.length;
    const done = candidates.filter((item) => isTargetReached(item, totals.get(String(item.id || "")) || 0)).length;
    return {
        items: rows,
        stat: {
            value: `${done}/${total}`,
            label: boundedText(labels.todayStat, 32) || "今日完成",
            progress: total > 0 ? Math.round((done / total) * 100) : 0,
        },
        emptyHint: rows.length ? "" : (boundedText(labels.todayEmpty, 96) || "今天没有待打卡项目"),
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        caliber: CHECKIN_CALIBER,
    };
}

function formatNumber(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return "0";
    return Number.isInteger(raw) ? String(raw) : String(Math.round(raw * 100) / 100);
}

function eventsByItem(events) {
    const days = new Map();
    safeList(() => events).forEach((event) => {
        if (!event || typeof event !== "object") return;
        const key = String(event.localDate || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
        const id = String(event.itemId || "");
        if (!days.has(id)) days.set(id, new Set());
        days.get(id).add(key);
    });
    return days;
}

function shiftDateKey(dateKey, offsetDays) {
    const parsed = Date.parse(`${dateKey}T00:00:00`);
    if (!Number.isFinite(parsed)) return "";
    return localDateKey(new Date(parsed + offsetDays * 24 * 60 * 60 * 1000));
}

// 连续天数：从今天（或昨天，今天还没记录时）往回数，逐日命中即累加。
function streakOf(daySet, todayKey) {
    if (!daySet || daySet.size === 0) return {days: 0, current: false};
    let cursor = todayKey;
    let current = daySet.has(cursor);
    if (!current) {
        cursor = shiftDateKey(todayKey, -1);
        if (!daySet.has(cursor)) return {days: 0, current: false};
    }
    let days = 0;
    while (cursor && daySet.has(cursor)) {
        days += 1;
        cursor = shiftDateKey(cursor, -1);
    }
    return {days, current};
}

// W3 · 连续记录排行。只统计 kind 为 once/count 的项目：amount/duration 的"连续"语义
// 由打卡内部定义，桥接层不自行发明口径。
function buildCheckinStreakSnapshot(items, events, config, labels, now) {
    const todayKey = localDateKey(Number.isFinite(now) ? now : Date.now());
    const limit = boundedNumber(config?.limit, 6, 1, CHECKIN_STREAK_MAX_ITEMS);
    const daysByItem = eventsByItem(events);
    const rows = activeItems(items)
        .filter((item) => ["once", "count"].includes(String(item.kind || "once")))
        .map((item) => {
            const streak = streakOf(daysByItem.get(String(item.id || "")), todayKey);
            return {item, days: streak.days, current: streak.current};
        })
        .filter((row) => row.days > 0)
        .sort((a, b) => b.days - a.days)
        .slice(0, limit)
        .map((row, index) => ({
            label: itemName(row.item, labels.unnamed || "未命名"),
            value: `${row.days} ${boundedText(labels.dayUnit, 8) || "天"}`,
            secondary: row.current ? "" : (boundedText(labels.pendingToday, 32) || "今天待续"),
            rank: index + 1,
            done: row.current,
        }));
    const longest = rows.length ? Number(String(rows[0].value).split(" ")[0]) || 0 : 0;
    return {
        items: rows,
        stat: {
            value: String(longest),
            label: boundedText(labels.streakStat, 32) || "最长连续（天）",
        },
        emptyHint: rows.length ? "" : (boundedText(labels.streakEmpty, 96) || "还没有连续记录"),
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        caliber: CHECKIN_CALIBER,
    };
}

// 打卡内部 buildYearHeatmap 的阈值（≥2 / ≥max(3, 0.5max) / ≥max(6, 0.75max)），
// 桥接层按同一口径复现；若将来打卡公开该函数，改调它即可，moduleId 不变。
function checkinHeatLevel(count, max) {
    if (!Number.isFinite(count) || count <= 0) return 0;
    if (count >= Math.max(6, Math.ceil(max * 0.75))) return 4;
    if (count >= Math.max(3, Math.ceil(max * 0.5))) return 3;
    if (count >= 2) return 2;
    return 1;
}

// W1 · 年度热力图。先按 localDate 聚合成日计数，再按周对齐补占位格（level -1 / outside）。
function buildCheckinHeatmapSnapshot(events, config, labels, now) {
    const current = new Date(Number.isFinite(now) ? now : Date.now());
    const offset = boundedNumber(config?.yearOffset, 0, 0, 5);
    const year = current.getFullYear() - offset;
    const daily = new Map();
    safeList(() => events).forEach((event) => {
        if (!event || typeof event !== "object") return;
        const key = String(event.localDate || "");
        if (!key.startsWith(`${year}-`)) return;
        const value = Number(event.value);
        if (!Number.isFinite(value)) return;
        daily.set(key, (daily.get(key) || 0) + value);
    });
    let max = 0;
    daily.forEach((value) => {
        if (value > max) max = value;
    });
    const pad = (n) => String(n).padStart(2, "0");
    const cells = [];
    const startMs = Date.parse(`${year}-01-01T00:00:00`);
    const endMs = Date.parse(`${year}-12-31T00:00:00`);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return {items: [], total: 0, activeDays: 0, year, max: 0};
    const lead = new Date(startMs).getDay();
    for (let i = 0; i < lead; i += 1) cells.push({label: "", count: 0, level: -1, outside: true});
    let total = 0;
    let activeDays = 0;
    for (let ms = startMs; ms <= endMs; ms += 24 * 60 * 60 * 1000) {
        const date = new Date(ms);
        const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        const count = daily.get(key) || 0;
        total += count;
        if (count > 0) activeDays += 1;
        cells.push({label: key, count, level: checkinHeatLevel(count, max)});
    }
    while (cells.length % 7 !== 0) cells.push({label: "", count: 0, level: -1, outside: true});
    return {items: cells.slice(0, CHECKIN_HEATMAP_MAX_ITEMS), total, activeDays, year, max};
}

// W4 · 本周概览。直接采用打卡自己的 analytics 快照，速切不再另算一遍口径。
function buildCheckinWeeklySnapshot(analytics, config, labels, now) {
    const weekly = analytics && typeof analytics === "object" ? analytics.weekly : null;
    const points = weekly && Array.isArray(weekly.points) ? weekly.points : [];
    const limit = boundedNumber(config?.limit, 6, 1, 12);
    const summary = safeObject(() => analytics) || {};
    const currentValue = Number(summary.weeklyCurrent);
    const rows = points.slice(-limit).reverse().map((point) => {
        const label = boundedText(point && point.label, 32);
        const value = Number(point && point.value);
        return {label, value: Number.isFinite(value) ? formatNumber(value) : "0"};
    });
    return {
        items: rows,
        stat: {
            value: Number.isFinite(currentValue) ? formatNumber(currentValue) : "0",
            label: boundedText(labels.weeklyStat, 32) || "本周记录",
        },
        emptyHint: rows.length ? "" : (boundedText(labels.weeklyEmpty, 96) || "暂无本周数据"),
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        caliber: CHECKIN_CALIBER,
    };
}

// W5 · 近期日期事项。只读投影：不提供完成动作（写入必须经用户确认，与打卡安全边界一致）。
function buildCheckinOccasionsSnapshot(occasions, config, labels, now) {
    const todayKey = localDateKey(Number.isFinite(now) ? now : Date.now());
    const limit = boundedNumber(config?.limit, 6, 1, 12);
    const rows = safeList(() => occasions)
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
            label: boundedText(item.name, 64),
            date: boundedText(item.occurrenceDate, 10),
            kind: boundedText(item.kind, 24),
            daysUntil: Number(item.daysUntil),
            done: item.status === "done" || (Array.isArray(item.completedDates) && item.completedDates.includes(todayKey)),
        }))
        .filter((row) => row.label)
        .sort((a, b) => (Number.isFinite(a.daysUntil) ? a.daysUntil : 0) - (Number.isFinite(b.daysUntil) ? b.daysUntil : 0))
        .slice(0, limit)
        .map((row) => ({
            label: row.label,
            value: row.date === todayKey
                ? (boundedText(labels.today, 16) || "今天")
                : Number.isFinite(row.daysUntil) && row.daysUntil > 0
                    ? `${row.daysUntil} ${boundedText(labels.daysLater, 16) || "天后"}`
                    : row.date,
            secondary: row.kind,
            done: row.done,
        }));
    return {
        items: rows,
        emptyHint: rows.length ? "" : (boundedText(labels.occasionsEmpty, 96) || "近期没有日期事项"),
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        caliber: CHECKIN_CALIBER,
    };
}

// W6 · 本月统计（T-6309）。与周报不同，events 原始数据就够——不发明新的 analytics 依赖。
// 口径：本月去重打卡天数 / 本月总天数；项目排行只统计 kind 为 once/count 的未归档项目
//（amount/duration 的"量"语义由打卡内部定义，桥接层不复制）。
function buildCheckinMonthlySnapshot(items, events, config, labels, now) {
    const nowDate = new Date(Number.isFinite(now) ? now : Date.now());
    const monthPrefix = localDateKey(nowDate).slice(0, 7);
    const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
    const dayTotals = new Map();
    const itemTotals = new Map();
    let totalValue = 0;
    safeList(() => events).forEach((event) => {
        if (!event || typeof event !== "object") return;
        const key = String(event.localDate || "");
        if (!key.startsWith(`${monthPrefix}-`)) return;
        const value = Number(event.value);
        if (!Number.isFinite(value)) return;
        const itemId = String(event.itemId || "");
        dayTotals.set(key, (dayTotals.get(key) || 0) + value);
        itemTotals.set(itemId, (itemTotals.get(itemId) || 0) + value);
        totalValue += value;
    });
    const daysChecked = dayTotals.size;
    let bestDay = "";
    let bestValue = 0;
    dayTotals.forEach((value, key) => {
        if (value > bestValue) {
            bestValue = value;
            bestDay = key;
        }
    });
    const limit = boundedNumber(config?.limit, 6, 1, 12);
    const rows = activeItems(items)
        .filter((item) => ["once", "count"].includes(String(item.kind || "once")))
        .map((item) => ({item, value: itemTotals.get(String(item.id || "")) || 0}))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
        .map((row, index) => {
            const target = Number(row.item.target);
            const unit = boundedText(row.item.unit, 16);
            const done = isTargetReached(row.item, row.value);
            const valueText = Number.isFinite(target) && target > 0
                ? `${formatNumber(row.value)}/${formatNumber(target)}${unit ? ` ${unit}` : ""}`
                : `${formatNumber(row.value)}${unit ? ` ${unit}` : ""}`;
            return {
                label: itemName(row.item, labels.unnamed || "未命名"),
                value: valueText,
                rank: index + 1,
                done,
            };
        });
    return {
        items: rows,
        stat: {
            value: `${daysChecked}/${daysInMonth}`,
            label: boundedText(labels.monthlyStat, 32) || "本月打卡天数",
        },
        secondaryStat: {
            value: formatNumber(totalValue),
            label: boundedText(labels.monthlyTotal, 32) || "本月记录总量",
        },
        bestDay: bestDay,
        emptyHint: daysChecked > 0 ? "" : (boundedText(labels.monthlyEmpty, 96) || "本月还没有打卡记录"),
        updatedAt: Number.isFinite(now) ? now : Date.now(),
        caliber: CHECKIN_CALIBER,
    };
}

// 统一的桥接读取入口：moduleId → 对应快照。打卡缺席/能力缺失时返回确定空态，不抛错。
function readCheckinBridge(moduleId, options = {}) {
    const api = resolveCheckinApi(options.scope);
    const labels = options.labels && typeof options.labels === "object" ? options.labels : {};
    const config = options.config && typeof options.config === "object" ? options.config : {};
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const missing = {
        items: [],
        emptyHint: boundedText(labels.missing, 96) || "未检测到小驴打卡插件",
        updatedAt: now,
        caliber: CHECKIN_CALIBER,
    };
    if (!api) return missing;
    const capability = CHECKIN_CAPABILITIES[moduleId] || "";
    if (capability && !hasCheckinCapability(api, capability)) {
        return {...missing, emptyHint: boundedText(labels.capabilityMissing, 96) || "当前版本的小驴打卡不支持该数据"};
    }
    if (moduleId === "checkin-today") {
        return buildCheckinTodaySnapshot(safeList(() => api.getItems()), safeList(() => api.getEvents()), config, labels, now);
    }
    if (moduleId === "checkin-streak") {
        return buildCheckinStreakSnapshot(safeList(() => api.getItems()), safeList(() => api.getEvents()), config, labels, now);
    }
    if (moduleId === "checkin-year-heatmap") {
        const heatmap = buildCheckinHeatmapSnapshot(safeList(() => api.getEvents()), config, labels, now);
        return {
            title: `${boundedText(labels.heatmapTitle, 64) || "打卡热力图"} · ${heatmap.year}`,
            items: heatmap.items,
            stat: {
                value: String(heatmap.total),
                label: boundedText(labels.heatmapStat, 32) || "年度记录",
            },
            emptyHint: heatmap.total > 0 ? "" : (boundedText(labels.heatmapEmpty, 96) || "今年还没有打卡记录"),
            updatedAt: now,
            caliber: CHECKIN_CALIBER,
        };
    }
    if (moduleId === "checkin-weekly") {
        return buildCheckinWeeklySnapshot(safeObject(() => api.getAnalyticsSnapshot()), config, labels, now);
    }
    if (moduleId === "checkin-occasions") {
        return buildCheckinOccasionsSnapshot(safeList(() => api.getTodayOccasions()), config, labels, now);
    }
    if (moduleId === "checkin-monthly") {
        return buildCheckinMonthlySnapshot(safeList(() => api.getItems()), safeList(() => api.getEvents()), config, labels, now);
    }
    return missing;
}

module.exports = {
    CHECKIN_API_GLOBAL,
    CHECKIN_PROTOCOL,
    CHECKIN_MODULE_IDS,
    CHECKIN_CAPABILITIES,
    CHECKIN_HEATMAP_MAX_ITEMS,
    CHECKIN_LIST_MAX_ITEMS,
    CHECKIN_CALIBER,
    resolveCheckinApi,
    hasCheckinCapability,
    localDateKey,
    shiftDateKey,
    streakOf,
    checkinHeatLevel,
    buildCheckinTodaySnapshot,
    buildCheckinStreakSnapshot,
    buildCheckinHeatmapSnapshot,
    buildCheckinWeeklySnapshot,
    buildCheckinOccasionsSnapshot,
    buildCheckinMonthlySnapshot,
    readCheckinBridge,
};
