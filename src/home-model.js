"use strict";

const HOME_SCHEMA_VERSION = 1;
const DEVICES = Object.freeze(["desktop", "sidebar", "mobile"]);
const DEFAULT_LAYOUT = Object.freeze({x: 0, y: 0, w: 1, h: 1, collapsed: false});
const MOBILE_HOME_SIZE = "medium";
const AVAILABILITY_LEVELS = Object.freeze(["ready", "conditional", "external"]);
const CONDITIONAL_MODULES = new Set([
    "today-tasks", "bookmarks", "journal-monthly", "flashcard-due", "quick-capture",
    "clipped-unread", "on-this-day", "recent-daily-notes", "document-relations-summary",
    "current-document-outline", "today-reservations", "journal-calendar", "writing-streak", "plugin-commands",
]);

const DEFAULT_MODULES = Object.freeze([
    {moduleId: "recent-documents", title: "近期文档", icon: "iconHistory", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide", "large", "full"]},
    {moduleId: "today-journal", title: "今日日记", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small"]},
    {moduleId: "today-tasks", title: "今日待办", icon: "iconCheck", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "tall", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
        {key: "allDocuments", label: "扫描全部文档", type: "select", options: ["否", "是"], defaults: "否"},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
        {key: "showCompleted", label: "显示已完成", type: "select", options: ["否", "是"], defaults: "否"},
        {key: "days", label: "时间范围（天）", type: "number", min: 7, max: 365, defaults: 30},
    ]},
    {moduleId: "fixed-document", title: "指定文档", icon: "iconFile", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"], protocolVersion: 2, configSchema: [
        {key: "docId", label: "文档 ID", type: "document", defaults: ""},
        {key: "title", label: "显示名称", type: "text", defaults: ""},
    ]},
    {moduleId: "favorites", title: "收藏", icon: "iconStar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide", "large", "full"]},
    {moduleId: "document-sets", title: "文档集", icon: "iconLayout", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "tall", "large"]},
    {moduleId: "tags", title: "标签", icon: "iconTags", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"]},
    {moduleId: "bookmarks", title: "书签", icon: "iconBookmark", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium"]},
    {moduleId: "journal-monthly", title: "本月日记", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 20, defaults: 12},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "note-stats", title: "笔记统计", icon: "iconChart", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium"], protocolVersion: 2, configSchema: [
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "year-progress", title: "年度进度", icon: "iconRefresh", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small"]},
    {moduleId: "external-local-time", title: "时间与日期", icon: "iconClock", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"]},
    {moduleId: "external-world-clock", title: "世界时钟", icon: "iconClock", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"], protocolVersion: 2, configSchema: [
        {key: "cities", label: "城市时区（IANA，逗号分隔，如 Asia/Shanghai）", type: "text", defaults: ""},
    ]},
    {moduleId: "external-weather-open-meteo", title: "近期天气", icon: "iconCloud", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "city", label: "城市或邮编", type: "text", defaults: ""},
        {key: "temperatureUnit", label: "温度单位", type: "select", options: ["°C", "°F"], defaults: "°C"},
        {key: "forecastDays", label: "预报天数", type: "number", min: 2, max: 5, defaults: 4},
    ]},
    {moduleId: "external-air-quality", title: "空气质量", icon: "iconCloud", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "city", label: "城市或邮编（与天气相互独立）", type: "text", defaults: ""},
    ]},
    {moduleId: "external-anime-bangumi", title: "每日放送", icon: "iconVideo", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, viewType: "media", configSchema: [
        {key: "dayRange", label: "放送范围", type: "select", options: ["今天", "明天", "本周"], defaults: "今天"},
        {key: "limit", label: "条目上限", type: "number", min: 2, max: 12, defaults: 6},
        {key: "showCovers", label: "显示封面", type: "select", options: ["是", "否"], defaults: "是"},
    ]},
    {moduleId: "external-hot-news-dailyhot", title: "热搜事件", icon: "iconGraph", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "endpoint", label: "DailyHotApi 完整接口", type: "text", defaults: ""},
        {key: "limit", label: "条目上限", type: "number", min: 3, max: 12, defaults: 8},
        {key: "showHot", label: "显示热度", type: "select", options: ["是", "否"], defaults: "是"},
    ]},
    {moduleId: "external-news-hackernews", title: "Hacker News 热门", icon: "iconGraph", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "board", label: "榜单（非首页榜单会在标题追加标注）", type: "select", options: ["首页", "最佳", "问答", "展示"], defaults: "首页"},
        {key: "limit", label: "条目上限", type: "number", min: 3, max: 12, defaults: 8},
        {key: "showMeta", label: "显示得分与评论", type: "select", options: ["是", "否"], defaults: "是"},
    ]},
    {moduleId: "external-status-uptimekuma", title: "服务状态", icon: "iconCloud", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "endpoint", label: "Uptime Kuma 完整地址", type: "text", defaults: ""},
        {key: "slug", label: "状态页 slug", type: "text", defaults: ""},
    ]},
    {moduleId: "external-fx-frankfurter", title: "汇率参考", icon: "iconGraph", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "base", label: "基准货币（3 位代码）", type: "text", defaults: "CNY"},
        {key: "quotes", label: "目标货币（逗号分隔，1-6 个）", type: "text", defaults: "USD,EUR,JPY,GBP,HKD"},
    ]},
    {moduleId: "external-rss-miniflux", title: "未读文章", icon: "iconRss", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "endpoint", label: "Miniflux 实例地址", type: "text", defaults: ""},
        {key: "token", label: "API Token（设置 → API 密钥）", type: "text", defaults: ""},
        {key: "limit", label: "条目上限", type: "number", min: 1, max: 50, defaults: 20},
    ]},
    {moduleId: "external-rss-subscription", title: "RSS 订阅", icon: "iconRss", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "url", label: "RSS / Atom 订阅地址", type: "text", defaults: ""},
        {key: "title", label: "显示标题（可选，留空读 feed 自带标题）", type: "text", defaults: ""},
        {key: "maxItems", label: "条目上限", type: "number", min: 1, max: 30, defaults: 10},
    ]},
    {moduleId: "external-ical-events", title: "iCal 日程", icon: "iconCalendar", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "url", label: "iCal 订阅地址（.ics）", type: "text", defaults: ""},
        {key: "windowDays", label: "日程窗口（天）", type: "number", min: 1, max: 60, defaults: 14},
        {key: "maxEvents", label: "条目上限", type: "number", min: 1, max: 12, defaults: 6},
    ]},
    {moduleId: "external-github-contrib", title: "GitHub 贡献", icon: "iconGraph", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, viewType: "heatmap", configSchema: [
        {key: "username", label: "GitHub 用户名", type: "text", defaults: ""},
        {key: "windowDays", label: "统计窗口（天）", type: "number", min: 28, max: 366, defaults: 84},
        {key: "token", label: "个人访问令牌（可选，仅经请求头传递）", type: "text", defaults: ""},
    ]},
    {moduleId: "external-quote-daily", title: "每日引言", icon: "iconQuote", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"], protocolVersion: 2, configSchema: [
        {key: "quotes", label: "自定义语录（每行一条，可选 —— 分隔出处）", type: "textarea", defaults: ""},
    ]},
    {moduleId: "external-device-battery", title: "设备电量", icon: "iconDashboard", category: "siyuan", supportedDevices: ["desktop", "sidebar"], readOnly: true, sizes: ["xs", "small", "medium"]},
    {moduleId: "external-news-newsnow", title: "实时资讯", icon: "iconList", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, configSchema: [
        {key: "endpoint", label: "NewsNow 完整接口", type: "text", defaults: ""},
        {key: "limit", label: "条目上限", type: "number", min: 3, max: 12, defaults: 8},
        {key: "showHot", label: "显示热度", type: "select", options: ["是", "否"], defaults: "是"},
    ]},
    {moduleId: "external-activitywatch-time", title: "使用时长", icon: "iconClock", category: "siyuan", availability: "external", supportedDevices: ["desktop", "sidebar"], readOnly: true, sizes: ["small", "medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "endpoint", label: "ActivityWatch 本机地址", type: "text", defaults: "http://127.0.0.1:5600"},
        {key: "hours", label: "统计范围（小时）", type: "number", min: 1, max: 168, defaults: 24},
        {key: "limit", label: "应用上限", type: "number", min: 3, max: 10, defaults: 6},
    ]},
    {moduleId: "recent-edits", title: "近期编辑", icon: "iconEdit", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 20, defaults: 10},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "flashcard-due", title: "闪卡待复习", icon: "iconClock", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"], protocolVersion: 2, configSchema: [
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "random-review", title: "随机回顾", icon: "iconRefresh", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"], protocolVersion: 2, configSchema: [
        {key: "days", label: "多久未看（天）", type: "number", min: 7, max: 3650, defaults: 90},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "quick-capture", title: "快速记录", icon: "iconAdd", category: "siyuan", supportedDevices: DEVICES, readOnly: false, sizes: ["xs", "small", "medium"]},
    {moduleId: "clipped-unread", title: "剪藏待读", icon: "iconBookmark", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"], protocolVersion: 2, configSchema: [
        {key: "tag", label: "标签名", type: "text", defaults: "剪藏"},
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "on-this-day", title: "往年今日", icon: "iconClock", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 20, defaults: 8},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "today-writing", title: "今日写作", icon: "iconEdit", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"], protocolVersion: 2, configSchema: [
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "recent-writing-activity", title: "近期写作活跃度", icon: "iconChart", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "days", label: "统计天数", type: "number", min: 7, max: 30, defaults: 7},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "recent-daily-notes", title: "近期日记", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "days", label: "回看天数", type: "number", min: 7, max: 60, defaults: 14},
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 20, defaults: 10},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "document-relations-summary", title: "文档关系摘要", icon: "iconGraph", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 6},
    ]},
    {moduleId: "current-document-outline", title: "当前文档大纲", icon: "iconList", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall", "wide"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "标题上限", type: "number", min: 1, max: 12, defaults: 8},
    ]},
    {moduleId: "today-reservations", title: "近期预约", icon: "iconClock", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "days", label: "未来天数", type: "number", min: 0, max: 14, defaults: 3},
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "journal-calendar", title: "日历月视图", icon: "iconCalendar", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["large", "full"], protocolVersion: 2, viewType: "calendar", configSchema: [
        {key: "monthOffset", label: "月份偏移", type: "number", min: -24, max: 24, defaults: 0},
        {key: "showLunar", label: "显示农历", type: "select", options: ["否", "是"], defaults: "否"},
        {key: "showHolidays", label: "显示中国节假日", type: "select", options: ["否", "是"], defaults: "否"},
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "writing-streak", title: "写作打卡", icon: "iconCheck", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, viewType: "weekdays", configSchema: [
        {key: "notebook", label: "限定笔记本", type: "notebook"},
    ]},
    {moduleId: "countdown", title: "倒数日", icon: "iconClock", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"], protocolVersion: 2, configSchema: [
        {key: "title", label: "名称", type: "text", defaults: ""},
        {key: "targetDate", label: "目标日期", type: "date", defaults: ""},
    ]},
    {moduleId: "plugin-commands", title: "插件命令", icon: "iconPlugin", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "条数上限", type: "number", min: 1, max: 12, defaults: 8},
        {key: "filter", label: "关键词过滤", type: "text", defaults: ""},
    ]},
    {moduleId: "checkin-summary", title: "打卡摘要", icon: "iconCalendar", category: "plugin", supportedDevices: DEVICES, readOnly: true, sizes: ["xs", "small", "medium"]},
    // —— 小驴打卡桥接组件（ADR 0057）：由本插件内建 adapter 消费打卡公开生态 API v4，
    // 但 source 把来源标注为 siyuan-checkin，商店据此把它们归到「小驴打卡」一组。 ——
    {moduleId: "checkin-today", title: "今日打卡", icon: "iconCheck", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall", "wide", "large"], protocolVersion: 2, source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 1}, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 6},
        {key: "group", label: "只看分组（留空为全部）", type: "text", defaults: ""},
    ]},
    {moduleId: "checkin-streak", title: "连续记录", icon: "iconRefresh", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 2}, configSchema: [
        {key: "limit", label: "排行条数", type: "number", min: 1, max: 12, defaults: 6},
    ]},
    {moduleId: "checkin-year-heatmap", title: "打卡热力图", icon: "iconGraph", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large", "full"], protocolVersion: 2, viewType: "heatmap", source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 3}, configSchema: [
        {key: "yearOffset", label: "回溯年数", type: "number", min: 0, max: 5, defaults: 0},
    ]},
    {moduleId: "checkin-weekly", title: "本周打卡", icon: "iconCalendar", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 4}, configSchema: [
        {key: "limit", label: "显示周数", type: "number", min: 1, max: 12, defaults: 6},
    ]},
    {moduleId: "checkin-occasions", title: "近期事项", icon: "iconCheck", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "tall"], protocolVersion: 2, source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 5}, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 6},
    ]},
    {moduleId: "checkin-monthly", title: "本月打卡", icon: "iconCalendar", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, source: {pluginId: "siyuan-checkin", name: "小驴打卡", icon: "iconCheck", order: 6}, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 6},
    ]},
    {moduleId: "pinned-docs", title: "置顶文档", icon: "iconBookmark", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 8},
    ]},
    {moduleId: "inbox-shorthands", title: "收集箱", icon: "iconInbox", category: "siyuan", availability: "external", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 8},
    ]},
    {moduleId: "recent-updates", title: "最近更新", icon: "iconRefresh", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 8},
    ]},
    {moduleId: "data-health", title: "数据健康", icon: "iconCloud", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "清单上限", type: "number", min: 1, max: 12, defaults: 8},
    ]},
    {moduleId: "host-recent-docs", title: "最近文档", icon: "iconHistory", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["small", "medium", "wide"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "显示条数", type: "number", min: 1, max: 12, defaults: 8},
    ]},
    {moduleId: "database-list", title: "数据库", icon: "iconDatabase", category: "siyuan", supportedDevices: DEVICES, readOnly: true, sizes: ["medium", "wide", "large"], protocolVersion: 2, configSchema: [
        {key: "limit", label: "扫描上限", type: "number", min: 1, max: 64, defaults: 24},
    ]},
]);

function text(value, max = 128) {
    return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

function normalizeConfig(value, depth = 0) {
    if (depth > 3 || !value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    Object.keys(value).slice(0, 32).forEach((key) => {
        if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(key)) return;
        const item = value[key];
        if (typeof item === "string") result[key] = item.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 512);
        else if (typeof item === "number" && Number.isFinite(item)) result[key] = item;
        else if (typeof item === "boolean") result[key] = item;
        else if (item && typeof item === "object" && !Array.isArray(item)) result[key] = normalizeConfig(item, depth + 1);
    });
    return result;
}

function normalizeDevice(value) {
    return DEVICES.includes(value) ? value : "desktop";
}

function normalizeLayout(value) {
    const source = value && typeof value === "object" ? value : {};
    const number = (key, fallback, max) => {
        const n = Number(source[key]);
        return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : fallback;
    };
    const size = ["small", "medium", "wide", "large"].includes(source.size) ? source.size : "";
    return {x: number("x", 0, 99), y: number("y", 0, 999), w: Math.max(1, number("w", 1, 12)), h: Math.max(1, number("h", 1, 12)), collapsed: source.collapsed === true, size};
}

function resolveMobileHomeSize(value) {
    const sizes = Array.isArray(value) ? value : [];
    return sizes.includes(MOBILE_HOME_SIZE) ? MOBILE_HOME_SIZE : (sizes[0] || MOBILE_HOME_SIZE);
}

function normalizeMobileLayout(value) {
    const normalized = normalizeLayout(value);
    return {...normalized, x: 0, w: 12};
}


// 协议 v2 字段归一化
const PROTOCOL_VERSIONS = [1, 2];
const REFRESH_EVENTS = ["switch-protyle", "loaded-protyle", "destroy-protyle"];
const CONFIG_FIELD_TYPES = ["text", "number", "select", "notebook", "date", "document"];

function normalizeIsoDate(value) {
    const raw = text(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
    const time = Date.parse(`${raw}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === raw ? raw : "";
}

function normalizeProtocolVersion(value) {
    return PROTOCOL_VERSIONS.includes(value) ? value : 1;
}

function normalizeClickCommand(value) {
    const raw = text(value, 128);
    return /^[A-Za-z0-9_-]{1,64}::[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : "";
}

function normalizeHomepage(value) {
    const raw = text(value, 256);
    if (!raw) return "";
    try {
        const url = new URL(raw);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
        return "";
    }
}

function normalizeRefreshOn(value) {
    return Array.isArray(value)
        ? REFRESH_EVENTS.filter((event) => value.includes(event)).slice(0, 3)
        : [];
}

// 协议 v2.4：来源（source）是结构化插件身份，取代过去用 author 自由文本
// 猜来源的做法。pluginId 是稳定分组键，name 是展示名，collection 用于同
// 一个插件内再分系列（如「打卡」「番茄」），order 是组件在套件内的建议顺序。
function normalizeSourceOrder(value) {
    const raw = Number(value);
    return Number.isFinite(raw) ? Math.min(999, Math.max(0, Math.trunc(raw))) : 0;
}

function normalizeSource(value) {
    if (!value || typeof value !== "object") return null;
    const pluginId = text(value.pluginId, 64).replace(/[^A-Za-z0-9._:-]/g, "");
    const name = text(value.name, 64);
    if (!pluginId && !name) return null;
    return {
        pluginId: pluginId || name,
        name: name || pluginId,
        icon: text(value.icon, 64),
        version: text(value.version, 32),
        homepage: normalizeHomepage(value.homepage),
        collection: text(value.collection, 48),
        order: normalizeSourceOrder(value.order),
    };
}

function normalizeConfigSchema(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 8).reduce((fields, raw) => {
        if (!raw || typeof raw !== "object") return fields;
        const key = typeof raw.key === "string" ? raw.key.replace(/[^A-Za-z0-9_-]/g, "") : "";
        const label = text(raw.label, 32);
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(key) || !label) return fields;
        const type = CONFIG_FIELD_TYPES.includes(raw.type) ? raw.type : "text";
        const field = {key, label, type};
        if (type === "number") {
            const rawMin = Number.isFinite(raw.min) ? Math.trunc(raw.min) : 0;
            const rawMax = Number.isFinite(raw.max) ? Math.trunc(raw.max) : 100;
            field.min = Math.min(rawMin, rawMax);
            field.max = Math.max(rawMin, rawMax);
            if (Number.isFinite(raw.defaults)) field.defaults = Math.max(field.min, Math.min(field.max, Math.trunc(raw.defaults)));
        } else if (type === "select") {
            const options = (Array.isArray(raw.options) ? raw.options : []).slice(0, 12)
                .map((option) => text(typeof option === "object" ? option?.label : option, 32)).filter(Boolean);
            field.options = [...new Set(options)].slice(0, 12);
            if (field.options.length === 0) return fields;
            const selected = text(raw.defaults, 32);
            field.defaults = field.options.includes(selected) ? selected : field.options[0];
        } else if (type === "notebook") {
            // 选项由宿主渲染时用思源笔记本列表动态填充
        } else if (type === "date") {
            field.defaults = normalizeIsoDate(raw.defaults);
        } else if (type === "document") {
            const defaults = text(raw.defaults, 64);
            field.defaults = /^\d{14}-[0-9a-z]+$/i.test(defaults) ? defaults : "";
        } else {
            field.defaults = text(raw.defaults, 128);
        }
        fields.push(field);
        return fields;
    }, []);
}

function normalizeModuleDefinition(value) {
    if (!value || typeof value !== "object") return null;
    const moduleId = text(value.moduleId, 64).replace(/[^A-Za-z0-9._:-]/g, "");
    const title = text(value.title, 64);
    if (!moduleId || !title) return null;
    const supportedDevices = Array.isArray(value.supportedDevices)
        ? DEVICES.filter((device) => value.supportedDevices.includes(device))
        : ["desktop"];
    if (supportedDevices.length === 0) return null;
    const sizeKeys = ["xs", "small", "medium", "tall", "wide", "large", "full"];
    const sizes = Array.isArray(value.sizes) ? sizeKeys.filter((key) => value.sizes.includes(key)) : [];
    const availability = AVAILABILITY_LEVELS.includes(value.availability)
        ? value.availability
        : value.category !== "siyuan" ? "external" : CONDITIONAL_MODULES.has(moduleId) ? "conditional" : "ready";
    return {
        moduleId, title,
        icon: text(value.icon, 64) || "iconFile",
        category: text(value.category, 32) || "custom",
        supportedDevices,
        readOnly: value.readOnly !== false,
        sizes: sizes.length > 0 ? sizes : ["medium"],
        description: text(value.description, 96),
        availability,
        protocolVersion: normalizeProtocolVersion(value.protocolVersion),
        viewType: ["calendar", "weekdays", "media", "heatmap"].includes(value.viewType) ? value.viewType : "",
        author: text(value.author, 64),
        homepage: normalizeHomepage(value.homepage),
        source: normalizeSource(value.source),
        clickCommand: normalizeClickCommand(value.clickCommand),
        configSchema: normalizeConfigSchema(value.configSchema),
        refreshOn: normalizeRefreshOn(value.refreshOn),
    };
}

function registerModules(definitions = []) {
    const map = new Map();
    [...DEFAULT_MODULES, ...(Array.isArray(definitions) ? definitions : [])].forEach((item) => {
        const normalized = normalizeModuleDefinition(item);
        if (normalized) map.set(normalized.moduleId, normalized);
    });
    return [...map.values()];
}

function modulesForDevice(definitions, device) {
    const target = normalizeDevice(device);
    return registerModules(definitions).filter((module) => module.supportedDevices.includes(target));
}

function normalizeInstances(value, definitions = DEFAULT_MODULES) {
    const known = new Map(registerModules(definitions).map((item) => [item.moduleId, item]));
    const seen = new Set();
    const seenInstanceIds = new Set();
    return (Array.isArray(value) ? value : []).reduce((items, item) => {
        if (!item || typeof item !== "object") return items;
        const moduleId = text(item.moduleId, 64);
        if (!known.has(moduleId) || seen.has(moduleId)) return items;
        const instanceId = text(item.instanceId, 64) || moduleId;
        if (seenInstanceIds.has(instanceId)) return items;
        seen.add(moduleId);
        seenInstanceIds.add(instanceId);
        items.push({instanceId, moduleId, enabled: item.enabled !== false, config: normalizeConfig(item.config)});
        return items;
    }, []);
}

function normalizeHomeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const instances = normalizeInstances(source.instances);
    const layouts = {};
    DEVICES.forEach((device) => {
        const entries = source.layouts?.[device];
        const normalizeEntry = device === "mobile" ? normalizeMobileLayout : normalizeLayout;
        layouts[device] = Array.isArray(entries) ? entries.slice(0, 64).map((entry) => ({instanceId: text(entry?.instanceId, 64), ...normalizeEntry(entry)})).filter((entry) => entry.instanceId) : [];
    });
    const activeIds = new Set(instances.map((item) => item.instanceId));
    DEVICES.forEach((device) => {
        const occupied = new Set();
        layouts[device] = layouts[device].filter((entry) => {
            if (!activeIds.has(entry.instanceId) || occupied.has(entry.instanceId)) return false;
            occupied.add(entry.instanceId);
            return true;
        });
    });
    return {schemaVersion: HOME_SCHEMA_VERSION, instances, layouts};
}

function migrateHomeState(value) {
    const source = value && typeof value === "object" ? value : {};
    const migrated = normalizeHomeState({
        instances: source.instances || source.widgets || [],
        layouts: source.layouts || {desktop: source.layout || []},
    });
    return migrated;
}

function resolveLayoutConflicts(layouts, instances = []) {
    const allowed = new Set((Array.isArray(instances) ? instances : []).map((item) => text(item?.instanceId, 64)).filter(Boolean));
    const result = {};
    DEVICES.forEach((device) => {
        const occupied = new Set();
        result[device] = (Array.isArray(layouts?.[device]) ? layouts[device] : []).map((entry) => ({
            instanceId: text(entry?.instanceId, 64), ...normalizeLayout(entry),
        })).filter((entry) => {
            if (!allowed.has(entry.instanceId) || occupied.has(entry.instanceId)) return false;
            occupied.add(entry.instanceId);
            return true;
        });
    });
    return result;
}

function getModuleDefinition(definitions, moduleId) {
    return registerModules(definitions).find((item) => item.moduleId === text(moduleId, 64)) || null;
}

module.exports = {HOME_SCHEMA_VERSION, DEVICES, DEFAULT_LAYOUT, DEFAULT_MODULES, AVAILABILITY_LEVELS, MOBILE_HOME_SIZE, resolveMobileHomeSize, normalizeMobileLayout, normalizeProtocolVersion, normalizeClickCommand, normalizeHomepage, normalizeRefreshOn, normalizeIsoDate, normalizeConfigSchema, normalizeModuleDefinition, registerModules, modulesForDevice, getModuleDefinition, normalizeInstances, normalizeLayout, normalizeHomeState, migrateHomeState, resolveLayoutConflicts};
