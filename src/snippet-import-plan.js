// 纯函数式代码片段导入规划引擎 (Snippet Import Plan Engine)
// 借鉴自 TCOTC/snippets 的成熟导入决策模型（docs/gist-sync.md 5.4 与 import-plan.ts），
// 为小驴雷切第三面板（片段实验室）与片段商店提供工业级三模式导入策略：
// 1. merge（合并更新，默认）：本地同 ID 更新代码与名称，严格保留本地 enabled 状态与原排序位置；新条目作为新增导入；
// 2. fork（分叉克隆）：忽略外来 ID 重新派生全局唯一 ID，完全作为全新独立副本导入，绝不覆盖已有版本；
// 3. overwrite（镜像覆盖）：以导入集合整体替换本地集合。

/**
 * 默认轻量 ID 生成器
 * @returns {string} 14位时间戳+随机哈希
 */
function defaultIdGenerator() {
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 9);
    return `${ts}-${rand}`;
}

/**
 * 深度克隆对象
 */
function clone(obj) {
    if (!obj || typeof obj !== "object") return obj;
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 校验外来代码片段结构合法性
 * @param {any} item 
 * @returns {boolean}
 */
function isValidSnippetEntry(item) {
    return Boolean(
        item &&
        typeof item === "object" &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        typeof item.content === "string" &&
        (item.type === "css" || item.type === "js")
    );
}

/**
 * 规划代码片段导入列表
 * @param {Array<Object>} localSnippets 本地现有片段列表
 * @param {Array<Object>} incomingSnippets 准备导入的外来片段列表
 * @param {Object} [options]
 * @param {"merge" | "fork" | "overwrite"} [options.mode="merge"] 导入模式
 * @param {Function} [options.idGenerator] 自定义 ID 生成器
 * @returns {{ list: Array<Object>, addedCount: number, updatedCount: number, skippedCount: number }}
 */
function planSnippetImport(localSnippets = [], incomingSnippets = [], {
    mode = "merge",
    idGenerator = defaultIdGenerator
} = {}) {
    const safeLocal = Array.isArray(localSnippets) ? clone(localSnippets) : [];
    const validIncoming = (Array.isArray(incomingSnippets) ? incomingSnippets : []).filter(isValidSnippetEntry);
    const skippedCount = (Array.isArray(incomingSnippets) ? incomingSnippets.length : 0) - validIncoming.length;

    // 模式 1: 镜像覆盖 (overwrite)
    if (mode === "overwrite") {
        const list = clone(validIncoming).map(item => ({
            id: item.id || idGenerator(),
            name: item.name.trim(),
            content: item.content,
            type: item.type,
            enabled: Boolean(item.enabled),
            ...(item.group ? { group: String(item.group) } : {})
        }));
        return {
            list,
            addedCount: list.length,
            updatedCount: 0,
            skippedCount
        };
    }

    // 模式 2: 分叉克隆 (fork)
    if (mode === "fork") {
        const existingIds = new Set(safeLocal.map(s => s.id));
        const forkedList = [];

        for (const incoming of validIncoming) {
            let newId = idGenerator();
            while (existingIds.has(newId)) {
                newId = idGenerator();
            }
            existingIds.add(newId);

            forkedList.push({
                ...clone(incoming),
                id: newId,
                name: incoming.name.trim(),
                enabled: false // 分叉克隆出的新片段默认安全未启用
            });
        }

        return {
            list: [...forkedList, ...safeLocal],
            addedCount: forkedList.length,
            updatedCount: 0,
            skippedCount
        };
    }

    // 模式 3: 默认增量合并 (merge)
    const merged = clone(safeLocal);
    const localById = new Map(merged.map(s => [s.id, s]));
    const existingIds = new Set(merged.map(s => s.id));
    const additions = [];
    let updatedCount = 0;
    let addedCount = 0;

    for (const incoming of validIncoming) {
        const localMatch = incoming.id ? localById.get(incoming.id) : null;
        if (localMatch) {
            // 本地已有匹配项：更新代码与名称，严格保留本地 enabled 状态与原排序位置
            localMatch.name = incoming.name.trim();
            localMatch.content = incoming.content;
            localMatch.type = incoming.type;
            if (incoming.group) localMatch.group = String(incoming.group);
            updatedCount++;
        } else {
            // 本地无匹配项：作为新项加入
            let newId = incoming.id;
            if (!newId || existingIds.has(newId)) {
                newId = idGenerator();
                while (existingIds.has(newId)) {
                    newId = idGenerator();
                }
            }
            existingIds.add(newId);

            const addition = {
                ...clone(incoming),
                id: newId,
                name: incoming.name.trim(),
                enabled: Boolean(incoming.enabled)
            };
            additions.push(addition);
            addedCount++;
        }
    }

    return {
        // Keep the native order stable and append new entries after it. The
        // planner is consumed by a whole-list replacement API, so prepending
        // here would silently reshuffle the user's existing snippets.
        list: [...merged, ...additions],
        addedCount,
        updatedCount,
        skippedCount
    };
}

module.exports = {
    planSnippetImport,
    isValidSnippetEntry,
    defaultIdGenerator
};
