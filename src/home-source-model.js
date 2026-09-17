"use strict";

// 组件来源模型（ADR 0057）：把「这个组件是谁提供的」提升为与「这个组件解决什么问题」
// 并列的一等维度。
//
// 背景：商店原先把插件组件按 def.author 自由文本分组——作者名写法不一致会分组漂移，
// 而且同一个插件的多个组件在「需安装插件后可用」分区里是平铺的，看不出它们同源。
// 协议 v2.4 引入结构化 source（pluginId/name/icon/...）后，分组键改为稳定的 pluginId，
// 同一插件的组件收敛到一个可折叠的来源组里，组头还能显示「已添加 x/y」与整组批量选择。
//
// 本模块只做纯函数决策，DOM 渲染仍归 home-store-ui.ts。

const SOURCE_KINDS = Object.freeze(["builtin", "plugin", "unknown"]);
const BUILTIN_SOURCE_KEY = "builtin";

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

// 单个组件的来源解析。无 source 且非插件类的组件返回 kind "builtin"，
// 由调用方回退到既有的功能分组（日记/任务/文档…）。
function resolveHomeModuleSource(def) {
    if (!def || typeof def !== "object") {
        return {key: BUILTIN_SOURCE_KEY, label: "", pluginId: "", icon: "", homepage: "", version: "", collection: "", kind: "builtin"};
    }
    const source = def.source && typeof def.source === "object" ? def.source : null;
    if (source && boundedText(source.pluginId, 64)) {
        const pluginId = boundedText(source.pluginId, 64);
        return {
            key: `plugin:${pluginId}`,
            label: boundedText(source.name, 64) || pluginId,
            pluginId,
            icon: boundedText(source.icon, 64),
            homepage: boundedText(source.homepage, 256),
            version: boundedText(source.version, 32),
            collection: boundedText(source.collection, 48),
            order: Number.isFinite(source.order) ? Math.min(999, Math.max(0, Math.trunc(source.order))) : 0,
            kind: "plugin",
        };
    }
    // 旧注册没有 source：插件类按作者兜底，保证老组件不会掉进内置功能组。
    if (def.category === "plugin") {
        const author = boundedText(def.author, 64);
        return {
            key: `plugin:${author || boundedText(def.moduleId, 64)}`,
            label: author || boundedText(def.moduleId, 64),
            pluginId: "",
            icon: "",
            homepage: "",
            version: "",
            collection: "",
            order: 0,
            kind: "plugin",
        };
    }
    return {key: BUILTIN_SOURCE_KEY, label: "", pluginId: "", icon: "", homepage: "", version: "", collection: "", order: 0, kind: "builtin"};
}

// 按来源聚合组件。entries: [{moduleId, def, added}]；返回数组（非 Map），顺序确定。
function buildHomeStoreSourceGroups(entries) {
    const groups = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const source = resolveHomeModuleSource(entry.def);
        if (source.kind !== "plugin") return;
        if (!groups.has(source.key)) {
            groups.set(source.key, {
                key: source.key,
                label: source.label,
                icon: source.icon,
                pluginId: source.pluginId,
                homepage: source.homepage,
                version: source.version,
                collection: source.collection,
                kind: source.kind,
                order: source.order,
                moduleIds: [],
                count: 0,
                addedCount: 0,
            });
        }
        const group = groups.get(source.key);
        group.moduleIds.push(String(entry.moduleId || ""));
        group.count += 1;
        if (entry.added) group.addedCount += 1;
        if (source.order > 0 && (group.order === 0 || source.order < group.order)) group.order = source.order;
    });
    return orderHomeStoreSourceGroups([...groups.values()]);
}

// 稳定排序：来源组之间不依赖插入顺序——组件多的来源在前，其次按来源名字典序。
function orderHomeStoreSourceGroups(groups) {
    const list = Array.isArray(groups) ? [...groups] : [];
    return list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "builtin" ? -1 : 1;
        if (a.count !== b.count) return b.count - a.count;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
}

// 来源名纳入搜索文本：搜「小驴打卡」能命中该来源下的全部组件。
function buildHomeStoreSourceSearchText(def) {
    const source = resolveHomeModuleSource(def);
    return `${source.label} ${source.pluginId}`.trim().toLowerCase();
}

// 「需安装插件后可用」分区按来源插件聚合，避免同一插件的多个组件平铺成一堆孤立方卡。
// states: resolveWidgetCatalogState 的输出 [{entry, status}]。
function buildHomeStoreProviderGroups(states) {
    const groups = new Map();
    (Array.isArray(states) ? states : []).forEach((state) => {
        const entry = state && typeof state === "object" ? state.entry : null;
        if (!entry || typeof entry !== "object") return;
        const pluginId = boundedText(entry.providerPlugin, 64) || boundedText(entry.providerName, 64);
        if (!pluginId) return;
        if (!groups.has(pluginId)) {
            groups.set(pluginId, {
                providerPlugin: pluginId,
                providerName: boundedText(entry.providerName, 64) || pluginId,
                icon: boundedText(entry.icon, 64),
                count: 0,
                states: [],
            });
        }
        const group = groups.get(pluginId);
        group.count += 1;
        group.states.push(state);
    });
    return [...groups.values()].sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        return a.providerPlugin < b.providerPlugin ? -1 : a.providerPlugin > b.providerPlugin ? 1 : 0;
    });
}

module.exports = {
    SOURCE_KINDS,
    BUILTIN_SOURCE_KEY,
    resolveHomeModuleSource,
    buildHomeStoreSourceGroups,
    orderHomeStoreSourceGroups,
    buildHomeStoreSourceSearchText,
    buildHomeStoreProviderGroups,
};
