// 小驴雷切 —— 设置全局搜索（T-6951，2026-09-27 计划阶段 A）。
// 索引只收「面板归属 + 设置标题 + 描述」三类文案：不收 token、用户输入值、
// 笔记内容或任何敏感值；条目来自对生产设置 DOM 的一次扫描（面板全量预构建），
// 因此索引与真实控件零漂移。查询为空白时返回空结果 = 回到正常分组浏览。
"use strict";

const DEFAULT_SEARCH_LIMIT = 12;

// 扫描设置面板容器，产出搜索条目。panelsRoot 内每个 .sw-settings__panel 是一个
// 标签面板（dataset.panel = key），每个 .sw-settings__item 是一条设置（三元组：
// 标题 / 描述 / 控件）。element 引用留在条目上供「定位到真实控件」使用。
function collectSettingsSearchEntries(panelsRoot, panelLabels) {
    if (!panelsRoot) return [];
    const labels = panelLabels || {};
    const entries = [];
    const panels = panelsRoot.querySelectorAll(".sw-settings__panel");
    panels.forEach((panel) => {
        const key = panel.dataset.panel || "";
        const label = labels[key] || key;
        panel.querySelectorAll(".sw-settings__item").forEach((item) => {
            const title = (item.querySelector(".sw-settings__item-title")?.textContent || "").trim();
            if (!title) return;
            const description = (item.querySelector(".sw-settings__item-desc")?.textContent || "").trim();
            entries.push({key, label, title, description, element: item});
        });
    });
    return entries;
}

// 多词 AND 的不区分大小写子串匹配；CJK 天然逐词命中。
function entryMatchesQuery(entry, tokens) {
    const haystack = `${entry.title}\n${entry.description}\n${entry.label}`.toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
}

// 查询设置索引：空白查询返回 {results: [], total: 0}（回到分组浏览）。
// 排序：标题命中优先于描述/面板命中，同权按索引稳定序；结果按 limit 截断，
// total 保留截断前总数（供「仅显示前 N 项」提示）。
function searchSettingsIndex(entries, rawQuery, limit) {
    const max = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (!query) return {results: [], total: 0};
    const tokens = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return {results: [], total: 0};
    const hits = [];
    entries.forEach((entry, index) => {
        if (!entryMatchesQuery(entry, tokens)) return;
        const titleLower = entry.title.toLocaleLowerCase();
        const titleHits = tokens.filter((token) => titleLower.includes(token)).length;
        hits.push({entry, index, titleHits, allInTitle: titleHits === tokens.length ? 1 : 0});
    });
    hits.sort((left, right) => right.allInTitle - left.allInTitle
        || right.titleHits - left.titleHits
        || left.index - right.index);
    return {results: hits.slice(0, max).map((hit) => hit.entry), total: hits.length};
}

module.exports = {DEFAULT_SEARCH_LIMIT, collectSettingsSearchEntries, entryMatchesQuery, searchSettingsIndex};
