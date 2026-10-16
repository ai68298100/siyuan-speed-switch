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

const BUILTIN_SOURCE_KEY = "builtin";

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

// 单个组件的来源解析。无 source 且非插件类的组件返回 kind "builtin"，
// 由调用方回退到既有的功能分组（日记/任务/文档…）。
function resolveHomeModuleSource(def) {
    const network = def && ["local", "loopback", "remote"].includes(def.network)
        ? def.network
        : (def && def.endpoint ? "remote" : "local");
    const auth = def && ["none", "token", "host"].includes(def.auth)
        ? def.auth
        : "none";
    if (!def || typeof def !== "object") {
        return {key: BUILTIN_SOURCE_KEY, label: "", pluginId: "", icon: "", homepage: "", version: "", collection: "", kind: "builtin", network, auth};
    }
    const source = def.source && typeof def.source === "object" ? def.source : null;
    if (source && boundedText(source.pluginId, 64)) {
        const pluginId = boundedText(source.pluginId, 64);
        const kind = source.kind && ["builtin", "family", "plugin", "external"].includes(source.kind)
            ? source.kind
            : "plugin";
        return {
            key: `plugin:${pluginId}`,
            label: boundedText(source.name, 64) || pluginId,
            pluginId,
            icon: boundedText(source.icon, 64),
            homepage: boundedText(source.homepage, 256),
            version: boundedText(source.version, 32),
            collection: boundedText(source.collection, 48),
            order: Number.isFinite(source.order) ? Math.min(999, Math.max(0, Math.trunc(source.order))) : 0,
            kind,
            network,
            auth,
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
            network,
            auth,
        };
    }
    return {key: BUILTIN_SOURCE_KEY, label: "", pluginId: "", icon: "", homepage: "", version: "", collection: "", order: 0, kind: "builtin", network, auth};
}

// 组内顺序（ADR 0057）：同一来源的多个组件按提供方建议的 source.order 升序排列，
// order 相同时按 moduleId 字典序兜底——组内顺序因此与枚举顺序无关、可复现。
// 旧注册没有 order（恒为 0）时退化为按 moduleId 字典序，行为依旧确定。
function orderHomeStoreSourceEntries(entries) {
    return (Array.isArray(entries) ? [...entries] : []).sort((left, right) => {
        const leftSource = resolveHomeModuleSource(left && left.def);
        const rightSource = resolveHomeModuleSource(right && right.def);
        if (leftSource.order !== rightSource.order) return leftSource.order - rightSource.order;
        const leftId = String((left && left.moduleId) || "");
        const rightId = String((right && right.moduleId) || "");
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
}

// 按来源聚合组件。entries: [{moduleId, def, added}]；返回数组（非 Map），顺序确定。
// 组内成员顺序由 orderHomeStoreSourceEntries 决定（source.order 升序）。
// 组对象只保留渲染层真正读取的字段——未消费的聚合字段一律不挂，避免名不副实的死字段。
function buildHomeStoreSourceGroups(entries) {
    const buckets = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const source = resolveHomeModuleSource(entry.def);
        if (source.kind !== "plugin") return;
        if (!buckets.has(source.key)) buckets.set(source.key, {source, members: []});
        buckets.get(source.key).members.push(entry);
    });
    const groups = [...buckets.values()].map(({source, members}) => {
        const group = {
            key: source.key,
            label: source.label,
            icon: source.icon,
            pluginId: source.pluginId,
            kind: source.kind,
            moduleIds: [],
            count: 0,
            addedCount: 0,
        };
        orderHomeStoreSourceEntries(members).forEach((entry) => {
            group.moduleIds.push(String(entry.moduleId || ""));
            group.count += 1;
            if (entry.added) group.addedCount += 1;
        });
        return group;
    });
    return orderHomeStoreSourceGroups(groups);
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

// 来源名与子系列名纳入搜索文本：搜「小驴打卡」或某个 collection 名都能命中该来源下的组件。
function buildHomeStoreSourceSearchText(def) {
    const source = resolveHomeModuleSource(def);
    return [source.label, source.pluginId, source.collection].filter(Boolean).join(" ").toLowerCase();
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

// T-7293（ADR 0219）：透明度多维聚合统计（来源、网络、鉴权要求与不可用原因）
function buildHomeStoreTransparencySummary(entries) {
    const summary = {
        total: 0,
        added: 0,
        sources: {builtin: 0, family: 0, plugin: 0, external: 0},
        networks: {local: 0, loopback: 0, remote: 0},
        auths: {none: 0, token: 0, host: 0},
    };
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        summary.total += 1;
        if (entry.added) summary.added += 1;
        const source = resolveHomeModuleSource(entry.def);
        if (summary.sources[source.kind] !== undefined) summary.sources[source.kind] += 1;
        if (summary.networks[source.network] !== undefined) summary.networks[source.network] += 1;
        if (summary.auths[source.auth] !== undefined) summary.auths[source.auth] += 1;
    });
    return Object.freeze(summary);
}

// T-7293（ADR 0219）：按来源类型、网络属性与鉴权要求纯函数过滤
function filterHomeStoreEntriesByTransparency(entries, filter = {}) {
    const list = Array.isArray(entries) ? entries : [];
    if (!filter || typeof filter !== "object") return list;
    return list.filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const source = resolveHomeModuleSource(entry.def);
        if (filter.sourceKind && source.kind !== filter.sourceKind) return false;
        if (filter.network && source.network !== filter.network) return false;
        if (filter.auth && source.auth !== filter.auth) return false;
        return true;
    });
}

module.exports = {
    BUILTIN_SOURCE_KEY,
    resolveHomeModuleSource,
    buildHomeStoreSourceGroups,
    orderHomeStoreSourceEntries,
    orderHomeStoreSourceGroups,
    buildHomeStoreSourceSearchText,
    buildHomeStoreProviderGroups,
    buildHomeStoreTransparencySummary,
    filterHomeStoreEntriesByTransparency,
};
