"use strict";

/**
 * 组件目录（Widget Catalog）：登记「已知存在、但来源插件可能尚未安装」的第三方组件。
 *
 * - 来源插件已安装且完成注册 → 商店「可用组件」分区正常展示；
 * - 来源插件未安装 → 商店「需安装插件后可用」分区展示，标注需安装的插件名；
 * - 新的第三方接入在发布支持后在此登记一行即可（moduleId 须与对方注册值一致）。
 */

const WIDGET_CATALOG = Object.freeze([
    Object.freeze({
        moduleId: "checkin-summary",
        providerPlugin: "siyuan-checkin",
        providerName: "小驴打卡",
        title: "打卡摘要",
        icon: "iconCalendar",
        sizes: ["xs", "small", "medium"],
        description: "来自小驴打卡的今日打卡与连续记录摘要",
    }),
    // T-7072：首个真实第三方接入（gradypark86/siyuan-plugin-calendar#17，
    // 维护者已在 LvSpeed 分支完成适配）——登记后未安装 Calendar 的用户也能
    // 在商店"需安装插件后可用"分区看到该组件。字段与对方实际注册值一致。
    Object.freeze({
        moduleId: "calendar-recent-periodic",
        providerPlugin: "siyuan-plugin-calendar",
        providerName: "Calendar",
        title: "近期周期笔记",
        icon: "iconCalendar",
        sizes: ["small", "medium", "wide", "large", "full"],
        description: "来自 Calendar 的周记/月记/年记，点击直达对应文档",
    }),
]);

const WIDGET_CATALOG_STATES = Object.freeze(["ready", "unavailable", "missing"]);

/**
 * T-7071：目录外已配置的 moduleId（提供方卸载后实例仍持久化，ADR 0103）必须
 * 同样进入"当前不可用+显式清理"分区——否则未在 WIDGET_CATALOG 登记的第三方
 * 组件（如 calendar-recent-periodic）卸载后变成不可见孤儿，文档承诺的清理
 * 入口落空。条目只有 moduleId 可考，标题/描述回退占位，清理按钮照常工作。
 */
function buildOrphanCatalogEntries(orphanModuleIds = []) {
    return (Array.isArray(orphanModuleIds) ? orphanModuleIds : [])
        .filter((moduleId) => typeof moduleId === "string" && moduleId && !WIDGET_CATALOG.some((entry) => entry.moduleId === moduleId))
        .map((moduleId) => Object.freeze({
            moduleId,
            providerPlugin: "",
            providerName: "",
            title: moduleId,
            icon: "iconPlugin",
            sizes: ["medium"],
            description: "",
            orphan: true,
        }));
}

function resolveWidgetCatalogState(activeModuleIds = [], configuredModuleIds = [], orphanModuleIds = []) {
    const active = new Set(activeModuleIds && typeof activeModuleIds[Symbol.iterator] === "function" ? activeModuleIds : []);
    const configured = new Set(configuredModuleIds && typeof configuredModuleIds[Symbol.iterator] === "function" ? configuredModuleIds : []);
    const cataloged = WIDGET_CATALOG.map((entry) => ({
        entry,
        status: active.has(entry.moduleId) ? "ready" : configured.has(entry.moduleId) ? "unavailable" : "missing",
    }));
    const orphans = buildOrphanCatalogEntries(orphanModuleIds)
        .filter((entry) => !active.has(entry.moduleId))
        .map((entry) => ({entry, status: "unavailable", orphan: true}));
    return [...cataloged, ...orphans];
}

module.exports = {WIDGET_CATALOG, WIDGET_CATALOG_STATES, resolveWidgetCatalogState, buildOrphanCatalogEntries};
