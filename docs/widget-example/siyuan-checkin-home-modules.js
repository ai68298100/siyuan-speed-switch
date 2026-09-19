"use strict";

/**
 * 小驴打卡（siyuan-checkin）→ 小驴速切 组件注册模板
 * =================================================
 *
 * 这是**提供方自行注册**路径的参考实现：把本文件并入 siyuan-checkin 的 onload
 * 流程，即可由打卡插件自己把 5 个只读组件注册进速切的组件商店。
 *
 * 与速切内置桥接的关系（ADR 0057）：
 *   - 速切**已经**以桥接组件的形式提供了同一批 moduleId（src/checkin-bridge-model.js
 *     直接读取打卡公开的生态 API v4），用户装了打卡插件就能用，不依赖本文件；
 *   - 本文件的价值在于把口径收回到数据所有者手里：打卡若自行注册**相同的 moduleId**，
 *     速切 runtime 的 token 覆盖会让原生实现接管桥接实现，用户配置不漂移；
 *   - 因此这里的 moduleId 必须与速切侧保持一致，改 id 等于让用户重新配置。
 *
 * 协议：docs/widget-protocol.md（v2.4，含 source 来源字段）。
 * 数据源：window.siyuanCheckin（只读、同步、纯本地，生态 API v4）。
 */

const CHECKIN_SWITCHER_RETRY_MS = 2000;
const CHECKIN_SWITCHER_MAX_TRIES = 15;
const HEATMAP_MAX_CELLS = 371; // 速切热力图硬顶 400；366 天 + 周对齐占位 ≤371

// 与速切侧 src/checkin-bridge-model.js 的 CHECKIN_MODULE_IDS 逐一致。
const CHECKIN_MODULE_IDS = [
    "checkin-summary",
    "checkin-today",
    "checkin-streak",
    "checkin-year-heatmap",
    "checkin-weekly",
    "checkin-occasions",
    "checkin-monthly",
];

const CHECKIN_SOURCE = {
    pluginId: "siyuan-checkin",
    name: "小驴打卡",
    icon: "iconCheck",
};

/* ── 日期工具（本地时区口径，与打卡 localDate 一致） ── */

function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function todayKey() {
    return dateKey(new Date());
}

/* ── 速切发现：有界重试，处理"速切晚于打卡加载"的顺序问题 ── */

function findSwitcherPlugin(app) {
    const plugins = app && Array.isArray(app.plugins) ? app.plugins : [];
    return plugins.find((plugin) => plugin && typeof plugin.registerHomeModule === "function") || null;
}

function whenSwitcherReady(app, onReady) {
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        const switcher = findSwitcherPlugin(app);
        if (switcher) {
            clearInterval(timer);
            onReady(switcher);
        } else if (tries >= CHECKIN_SWITCHER_MAX_TRIES) {
            clearInterval(timer); // 速切缺席：本次会话安静放弃，重载打卡插件即恢复
        }
    }, CHECKIN_SWITCHER_RETRY_MS);
    return () => clearInterval(timer);
}

/* ── 数据访问（等待打卡 API 就绪；能力缺失返回 null） ── */

async function withCheckinApi(requiredCapability, run) {
    const checkin = typeof window !== "undefined" ? window.siyuanCheckin : null;
    if (!checkin || typeof checkin.whenReady !== "function") return null;
    const ready = await checkin.whenReady();
    if (!ready || (requiredCapability && !checkin.hasCapability(requiredCapability))) return null;
    return run(checkin);
}

/* ── 年度热力图（viewType: "heatmap"，与打卡 YearHeatmap 同构） ── */

function heatLevel(count, max) {
    if (count <= 0) return 0;
    if (count >= Math.max(6, Math.ceil(max * 0.75))) return 4;
    if (count >= Math.max(3, Math.ceil(max * 0.5))) return 3;
    if (count >= 2) return 2;
    return 1;
}

function buildHeatmapItems(events, year) {
    const prefix = `${year}-`;
    const counts = new Map();
    let max = 0;
    let total = 0;
    for (const event of events || []) {
        if (!event || typeof event.localDate !== "string" || !event.localDate.startsWith(prefix)) continue;
        const count = (counts.get(event.localDate) || 0) + 1;
        counts.set(event.localDate, count);
        max = Math.max(max, count);
        total += 1;
    }
    // 速切热力图网格：列=周、行=周日~周六 → 首日按周日对齐补占位格
    const firstDay = new Date(year, 0, 1).getDay();
    const items = [];
    for (let i = 0; i < firstDay; i += 1) {
        items.push({label: "", value: "", count: 0, level: -1, outside: true});
    }
    const cursor = new Date(year, 0, 1);
    while (cursor.getFullYear() === year && items.length < HEATMAP_MAX_CELLS) {
        const key = dateKey(cursor);
        const count = counts.get(key) || 0;
        items.push({label: key.slice(5), value: String(count), count, level: heatLevel(count, max)});
        cursor.setDate(cursor.getDate() + 1);
    }
    // 尾部补齐为 7 的倍数，保证渲染成完整矩形网格（与速切侧桥接实现同口径）。
    while (items.length % 7 !== 0 && items.length < HEATMAP_MAX_CELLS) {
        items.push({label: "", value: "", count: 0, level: -1, outside: true});
    }
    return {items, total, max};
}

function withSource(definition) {
    return {...definition, source: CHECKIN_SOURCE};
}

/* ── 五个组件声明 ── */

function todayModule() {
    return withSource({
        moduleId: "checkin-today",
        title: "今日打卡",
        icon: "iconCheck",
        category: "plugin",
        description: "今天的打卡项目与完成度",
        protocolVersion: 2,
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "tall", "wide", "large"],
        refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
        configSchema: [
            {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 6},
            {key: "group", label: "只看分组", type: "text", defaults: ""},
        ],
        read: (config) => withCheckinApi("items.read", (checkin) => {
            const limit = Math.max(1, Math.min(12, Number(config?.limit) || 6));
            const group = typeof config?.group === "string" ? config.group.trim() : "";
            const today = todayKey();
            const items = checkin.getItems().filter((item) => item && !item.archived && (!group || item.group === group));
            const valueOf = new Map();
            for (const event of checkin.getEvents()) {
                if (!event || event.localDate !== today) continue;
                valueOf.set(event.itemId, (valueOf.get(event.itemId) || 0) + (Number(event.value) || 1));
            }
            const planned = items.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            const doneCount = planned.filter((item) => {
                const target = Number(item.target) > 0 ? Number(item.target) : 1;
                return (valueOf.get(item.id) || 0) >= target;
            }).length;
            return {
                title: "今日打卡",
                items: planned.slice(0, limit).map((item) => {
                    const target = Number(item.target) > 0 ? Number(item.target) : 1;
                    const value = valueOf.get(item.id) || 0;
                    return {
                        label: item.name || "",
                        value: `${value}/${target} ${item.unit || ""}`.trim(),
                        done: value >= target,
                        secondary: (item.group || "").slice(0, 32),
                        command: "siyuan-checkin::open",
                    };
                }),
                stat: {
                    value: `${doneCount}/${planned.length}`,
                    label: "今日完成",
                    progress: planned.length > 0 ? Math.round((doneCount / planned.length) * 100) : 0,
                },
                emptyHint: planned.length === 0 ? "今天没有待打卡项目" : "",
            };
        }),
    });
}

function streakModule() {
    return withSource({
        moduleId: "checkin-streak",
        title: "连续记录",
        icon: "iconRefresh",
        category: "plugin",
        description: "各项目连续打卡天数排行",
        protocolVersion: 2,
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
        configSchema: [{key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 6}],
        read: (config) => withCheckinApi("items.read", (checkin) => {
            const limit = Math.max(1, Math.min(12, Number(config?.limit) || 6));
            const names = new Map(checkin.getItems().filter((item) => item && !item.archived).map((item) => [item.id, item.name]));
            const byItem = new Map();
            for (const event of checkin.getEvents()) {
                if (!names.has(event?.itemId)) continue;
                if (!byItem.has(event.itemId)) byItem.set(event.itemId, new Set());
                byItem.get(event.itemId).add(event.localDate);
            }
            const today = todayKey();
            const streakOf = (dates) => {
                let streak = 0;
                const cursor = dates.has(today) ? new Date() : new Date(Date.now() - 24 * 60 * 60 * 1000);
                // 今天还没打就从昨天起算，昨天也没有则连续为 0。
                if (!dates.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
                while (dates.has(dateKey(cursor))) {
                    streak += 1;
                    cursor.setDate(cursor.getDate() - 1);
                }
                return streak;
            };
            const rows = [...byItem.entries()]
                .map(([itemId, dates]) => ({name: names.get(itemId), streak: streakOf(dates), kept: dates.has(today)}))
                .sort((a, b) => b.streak - a.streak);
            return {
                title: "连续记录",
                items: rows.slice(0, limit).map((row, index) => ({
                    label: row.name || "",
                    value: `${row.streak} 天`,
                    rank: index + 1,
                    done: row.kept,
                    command: "siyuan-checkin::open",
                })),
                stat: {value: rows.length > 0 ? String(rows[0].streak) : "0", label: "最长连续（天）"},
                emptyHint: rows.length === 0 ? "还没有打卡记录，先完成一次吧" : "",
            };
        }),
    });
}

function heatmapModule() {
    return withSource({
        moduleId: "checkin-year-heatmap",
        title: "打卡热力图",
        icon: "iconGraph",
        category: "plugin",
        description: "按天记录数分档的年度热力图",
        protocolVersion: 2,
        viewType: "heatmap",
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["medium", "wide", "large", "full"],
        refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
        configSchema: [{key: "yearOffset", label: "回溯年数", type: "number", min: 0, max: 5, defaults: 0}],
        read: (config) => withCheckinApi("items.read", (checkin) => {
            const offset = Math.max(0, Math.min(5, Number(config?.yearOffset) || 0));
            const year = new Date().getFullYear() - offset;
            const {items, total} = buildHeatmapItems(checkin.getEvents(), year);
            return {
                title: `打卡热力图 ${year}`,
                items,
                stat: {value: String(total), label: "年度记录"},
                emptyHint: total === 0 ? `${year} 年还没有打卡记录` : "",
            };
        }),
    });
}

function weeklyModule() {
    return withSource({
        moduleId: "checkin-weekly",
        title: "本周打卡",
        icon: "iconCalendar",
        category: "plugin",
        description: "近几周记录数趋势与本周完成量",
        protocolVersion: 2,
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
        configSchema: [{key: "limit", label: "显示周数", type: "number", min: 1, max: 12, defaults: 6}],
        read: (config) => withCheckinApi("analytics.read", (checkin) => {
            const limit = Math.max(1, Math.min(12, Number(config?.limit) || 6));
            const snapshot = checkin.getAnalyticsSnapshot();
            const points = (snapshot?.weekly?.points || []).slice(-limit);
            return {
                title: "本周打卡",
                items: points.map((point) => ({
                    label: point.label,
                    value: String(point.value),
                    command: "siyuan-checkin::open",
                })),
                stat: {value: String(snapshot?.weeklyCurrent ?? 0), label: "本周记录"},
                emptyHint: points.length === 0 ? "暂无本周数据" : "",
            };
        }),
    });
}

function occasionsModule() {
    return withSource({
        moduleId: "checkin-occasions",
        title: "近期事项",
        icon: "iconCheck",
        category: "plugin",
        description: "生日、账单、续费等日期事项的近期投影（只读）",
        protocolVersion: 2,
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "tall"],
        refreshOn: ["switch-protyle", "loaded-protyle", "destroy-protyle"],
        configSchema: [{key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 6}],
        read: (config) => withCheckinApi("occasions.read", (checkin) => {
            const limit = Math.max(1, Math.min(12, Number(config?.limit) || 6));
            const today = todayKey();
            const visible = (checkin.getTodayOccasions() || [])
                .slice()
                .sort((a, b) => (a.daysUntil || 0) - (b.daysUntil || 0));
            return {
                title: "近期事项",
                items: visible.slice(0, limit).map((occasion) => {
                    const completed = Array.isArray(occasion.completedDates) && occasion.completedDates.includes(occasion.occurrenceDate);
                    return {
                        label: (occasion.name || "").slice(0, 256),
                        value: completed ? "已完成" : occasion.occurrenceDate === today ? "今天" : `${occasion.daysUntil} 天后`,
                        done: completed,
                        secondary: (occasion.kind || "").slice(0, 32),
                    };
                }),
                emptyHint: visible.length === 0 ? "近期没有日期事项" : "",
            };
        }),
    });
}

function monthlyModule() {
    return withSource({
        moduleId: "checkin-monthly",
        title: "本月打卡",
        icon: "iconCalendar",
        category: "plugin",
        description: "本月打卡天数、记录总量与项目排行的只读汇总",
        protocolVersion: 2,
        supportedDevices: ["desktop", "sidebar", "mobile"],
        sizes: ["small", "medium", "wide"],
        configSchema: [{key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 6}],
        read: (config) => withCheckinApi("items.read", (checkin) => {
            const limit = Math.max(1, Math.min(12, Number(config?.limit) || 6));
            const now = new Date();
            const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const dayTotals = new Map();
            const itemTotals = new Map();
            (checkin.getEvents() || []).forEach((event) => {
                if (!event || typeof event.localDate !== "string" || !event.localDate.startsWith(`${monthPrefix}-`)) return;
                const value = Number(event.value);
                if (!Number.isFinite(value)) return;
                dayTotals.set(event.localDate, (dayTotals.get(event.localDate) || 0) + value);
                itemTotals.set(String(event.itemId || ""), (itemTotals.get(String(event.itemId || "")) || 0) + value);
            });
            const items = (checkin.getItems() || [])
                .filter((item) => item && item.archived !== true && ["once", "count"].includes(String(item.kind || "once")))
                .map((item) => ({label: (item.name || "").slice(0, 64), value: itemTotals.get(String(item.id || "")) || 0}))
                .filter((row) => row.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, limit)
                .map((row, index) => ({...row, rank: index + 1}));
            return {
                title: "本月打卡",
                stat: {value: `${dayTotals.size}/${daysInMonth}`, label: "本月打卡天数"},
                items,
                emptyHint: dayTotals.size > 0 ? "" : "本月还没有打卡记录",
            };
        }),
    });
}

/**
 * 注册入口：onload 调用，返回停止等待的函数（onunload 调用）。
 * options.onRegistered(unregisterFns) 拿到每个组件的注销函数。
 */
function registerCheckinHomeModules(app, options = {}) {
    return whenSwitcherReady(app, (switcher) => {
        const unregisterFns = [];
        const candidates = [todayModule, streakModule, heatmapModule, weeklyModule, occasionsModule, monthlyModule];
        for (const factory of candidates) {
            const definition = factory();
            const unregister = switcher.registerHomeModule(definition);
            if (typeof unregister === "function") unregisterFns.push(unregister);
        }
        if (typeof options.onRegistered === "function") options.onRegistered(unregisterFns);
    });
}

module.exports = {
    CHECKIN_MODULE_IDS,
    CHECKIN_SOURCE,
    HEATMAP_MAX_CELLS,
    registerCheckinHomeModules,
    buildHeatmapItems,
    heatLevel,
    dateKey,
    todayModule,
    streakModule,
    heatmapModule,
    weeklyModule,
    occasionsModule,
    monthlyModule,
};

/**
 * 接入步骤（siyuan-checkin 仓库）：
 * 1. onload：this.stopCheckinWidgets = registerCheckinHomeModules(this.app, {
 *      onRegistered: (fns) => { this.checkinWidgetUnregisterFns = fns; },
 *    });
 * 2. onunload：先 (this.stopCheckinWidgets || (() => {}))()；
 *    再 (this.checkinWidgetUnregisterFns || []).forEach((fn) => fn())。
 * 3. 自测：moduleId 与速切侧一致（改 id 会让用户重新配置）；
 *    热力图在速切桌面/移动双端各看一次宽窄卡片。
 */
