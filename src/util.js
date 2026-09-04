// 纯函数工具：与类实例状态解耦，便于单元测试与多模块复用
//（plain JS 而非 TS：测试用 node 直接 require，无需编译步骤；类型由 jsdoc 注解保留）

/**
 * 数字夹紧：NaN / 非数字退回 fallback；否则限制在 [min, max] 区间
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampNum(value, min, max, fallback) {
    const num = typeof value === "number" ? value : parseInt(String(value), 10);
    if (Number.isNaN(num)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, num));
}

/**
 * 插入排序稳定变体：稳定 = 相等 key 的项保持原有顺序（基于 originalIndex）
 * 适合小列表（< 1000）；大列表应改用 stableSort / Map.groupBy
 * @template T
 * @param {T[]} arr
 * @param {(item: T) => string | number} keyFn
 * @returns {T[]}
 */
function stableSortBy(arr, keyFn) {
    return arr
        .map((item, idx) => ({item, idx, key: keyFn(item)}))
        .sort((a, b) => {
            if (a.key < b.key) return -1;
            if (a.key > b.key) return 1;
            return a.idx - b.idx;
        })
        .map((x) => x.item);
}

/**
 * 与思源选项文本的标准化 sortBy 转换：null / 未知值退回默认
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} fallback
 * @returns {string}
 */
function normalizeSortBy(value, allowed, fallback) {
    return allowed.includes(String(value)) ? String(value) : fallback;
}

/**
 * 收藏按 group 分组聚合：
 * - 注册表中的空分组会被保留（"先建组再添加"工作流）
 * - 未命名项（fav.group 为空）收纳到 "" 组
 * - 返回的 Map 保持插入顺序：先注册表分组、后未注册组（来自 fav.group），便于分组 UI 按序渲染
 * @template {{group?: string}} T
 * @param {T[]} favorites
 * @param {string[]} groupNames
 * @returns {Map<string, T[]>}
 */
function groupFavoritesByGroup(favorites, groupNames) {
    const groups = new Map();
    groupNames.forEach((name) => groups.set(name, []));
    favorites.forEach((fav) => {
        const name = fav.group || "";
        if (!groups.has(name)) {
            groups.set(name, []);
        }
        groups.get(name).push(fav);
    });
    return groups;
}

/**
 * 解析思源页签图标字符串：svg 图标名 / emoji 字符 / 十六进制 codepoint / 空值兜底
 * @param {string} raw
 * @returns {{type: "svg", value: string} | {type: "emoji", value: string}}
 */
function resolveIconFallback(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed) {
        return {type: "svg", value: "iconFile"};
    }
    // 思源 svg 图标名统一以 "icon" 开头且后面跟着具体名字（如 iconFile）
    if (trimmed.startsWith("icon") && trimmed.length > 4) {
        return {type: "svg", value: trimmed};
    }
    // 4-6 位十六进制视为 emoji codepoint（思源部分存储格式）
    if (/^[0-9a-fA-F]{4,6}$/.test(trimmed)) {
        try {
            return {type: "emoji", value: String.fromCodePoint(parseInt(trimmed, 16))};
        } catch {
            // 解析失败继续走兜底
        }
    }
    // 单个字符按 emoji 渲染；多位非法字符串回退文件图标
    if ([...trimmed].length === 1) {
        return {type: "emoji", value: trimmed};
    }
    return {type: "svg", value: "iconFile"};
}

/**
 * 按 tab.parent 分组页签，保持 getAllTabs 返回的布局顺序：
 * - 同一 Wnd 的页签聚合到一组（支持分栏布局）
 * - 没有 parent 时退到 scrollElement（手机端伪 Tab）
 * @template {{parent?: {element?: HTMLElement, headersElement?: HTMLElement}}} T
 * @param {T[]} tabs
 * @param {HTMLElement} fallbackKey
 * @returns {Map<HTMLElement, Array<{tab: T}>>}
 */
function buildTabGroupsByParent(tabs, fallbackKey) {
    const groups = new Map();
    tabs.forEach((tab) => {
        const key = (tab.parent && (tab.parent.element || tab.parent.headersElement)) || fallbackKey;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push({tab});
    });
    return groups;
}

module.exports = {clampNum, stableSortBy, normalizeSortBy, groupFavoritesByGroup, resolveIconFallback, buildTabGroupsByParent};
