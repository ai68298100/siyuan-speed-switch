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
]);

const WIDGET_CATALOG_STATES = Object.freeze(["ready", "unavailable", "missing"]);

function resolveWidgetCatalogState(activeModuleIds = [], configuredModuleIds = []) {
    const active = new Set(activeModuleIds && typeof activeModuleIds[Symbol.iterator] === "function" ? activeModuleIds : []);
    const configured = new Set(configuredModuleIds && typeof configuredModuleIds[Symbol.iterator] === "function" ? configuredModuleIds : []);
    return WIDGET_CATALOG.map((entry) => ({
        entry,
        status: active.has(entry.moduleId) ? "ready" : configured.has(entry.moduleId) ? "unavailable" : "missing",
    }));
}

module.exports = {WIDGET_CATALOG, WIDGET_CATALOG_STATES, resolveWidgetCatalogState};
