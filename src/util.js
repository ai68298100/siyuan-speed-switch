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

// 字素计数器：ZWJ 组合 emoji（👨‍👩‍👧）与肤色修饰（👍🏽）算 1 个图素；
// Node 18+/现代 WebView 均支持 Intl.Segmenter，缺失环境退回码点展开
const GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter()
    : null;
function graphemeLength(str) {
    if (GRAPHEME_SEGMENTER) {
        return [...GRAPHEME_SEGMENTER.segment(str)].length;
    }
    return [...str].length;
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
    // 单个字素按 emoji 渲染（ZWJ 组合/肤色修饰算 1 个）；多位非法字符串回退文件图标
    if (graphemeLength(trimmed) === 1) {
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

/**
 * 解析页签当前文档 rootID：已加载模型优先于懒加载初始化数据。
 * 每次调用都读取当前对象，确保同一 tab 导航到另一文档后不会沿用旧值。
 * @param {{model?: object, headElement?: {getAttribute?: (name: string) => string|null}}} tab
 * @returns {string|null}
 */
function resolveTabRootId(tab) {
    const model = tab && tab.model;
    const loadedRootId = model?.editor?.protyle?.block?.rootID || model?.editor?.block?.rootID;
    if (typeof loadedRootId === "string" && loadedRootId) {
        return loadedRootId;
    }
    try {
        const initData = tab?.headElement?.getAttribute?.("data-initdata");
        if (!initData) {
            return null;
        }
        const data = JSON.parse(initData);
        if (data?.instance !== "Editor") {
            return null;
        }
        const rootId = data.rootId || data.blockId;
        return typeof rootId === "string" && rootId ? rootId : null;
    } catch {
        return null;
    }
}

/**
 * 生成收藏分组的待打开项：按 rootID 去重，并排除已打开、无法解析的条目。
 * @template {{key: string}} T
 * @param {T[]} favorites
 * @param {Set<string>} openedKeys
 * @param {(favorite: T) => string} resolveRootId
 * @returns {{targets: Array<{favorite: T, rootId: string}>, invalid: number}}
 */
function planGroupOpenFavorites(favorites, openedKeys, resolveRootId) {
    const seen = new Set();
    const targets = [];
    let invalid = 0;
    favorites.forEach((favorite) => {
        const rootId = resolveRootId(favorite);
        if (!rootId) {
            invalid++;
            return;
        }
        if (seen.has(rootId)) {
            return;
        }
        seen.add(rootId);
        if (openedKeys.has(favorite.key) || openedKeys.has(rootId)) {
            return;
        }
        targets.push({favorite, rootId});
    });
    return {targets, invalid};
}

/**
 * SQL IN 白名单净化：仅保留思源文档 ID 格式（14 位时间戳-7 位小写串）的条目并去重（保序）。
 * 用于拼接 SQL 前过滤输入，杜绝引号等特殊字符破坏查询结构；全非法时返回空数组（调用方跳过查询）
 * @param {unknown[]} values
 * @returns {string[]}
 */
function sanitizeDocIds(values) {
    const seen = new Set();
    const out = [];
    (values || []).forEach((value) => {
        const id = typeof value === "string" ? value : "";
        if (id && !seen.has(id) && /^[0-9]{14}-[0-9a-z]{7}$/.test(id)) {
            seen.add(id);
            out.push(id);
        }
    });
    return out;
}

/**
 * MRU 列表收敛：过滤非字符串/空值并去重（保序），超出上限时从尾部丢弃最旧条目。
 * 用于 activateTab 写入侧与 getMru 读取侧（兼容历史已膨胀的存量数据），防止插件数据无限增长
 * @param {unknown[]} values
 * @param {number} max
 * @returns {string[]}
 */
function capMru(values, max) {
    const limit = typeof max === "number" && max > 0 ? Math.floor(max) : 0;
    const seen = new Set();
    const out = [];
    (values || []).forEach((value) => {
        if (typeof value !== "string" || !value || seen.has(value)) {
            return;
        }
        seen.add(value);
        out.push(value);
    });
    return limit > 0 && out.length > limit ? out.slice(0, limit) : out;
}

/**
 * 字符串列表净化：过滤非字符串/空值并去重（保序）。
 * 用于置顶列表、收藏分组注册表等纯字符串持久化数据的加载期清理；
 * 入参不是数组时返回空列表且不标记 changed（首次运行无数据，避免无谓回写）
 * @param {unknown} values
 * @returns {{items: string[], changed: boolean}}
 */
function sanitizeStringList(values) {
    if (!Array.isArray(values)) {
        return {items: [], changed: false};
    }
    const seen = new Set();
    const items = [];
    values.forEach((value) => {
        if (typeof value !== "string" || !value || seen.has(value)) {
            return;
        }
        seen.add(value);
        items.push(value);
    });
    return {items, changed: items.length !== values.length};
}

/**
 * 收藏列表结构校验与净化（加载期，与 0.16.4 的运行时迁移互补清理历史脏数据）：
 * - 丢弃非对象条目与 key 为空的条目（无法定位/跳转的废数据）
 * - title 非 string 归一为 ""（渲染侧已有兜底）
 * - rootId 非 string 或空串归一为 null（规范"无 rootId"表示；空串等价于没有）
 * - group 非 string 归一为 ""（未分组）
 * - 按 key 去重保序（历史数据可能因页签 id 退化对同一文档重复收藏）
 * 入参不是数组时返回空列表且不标记 changed（首次运行无数据，避免无谓回写）
 * @param {unknown} values
 * @returns {{items: Array<{key: string, title: string, rootId: string|null, group: string}>, changed: boolean}}
 */
function sanitizeFavorites(values) {
    if (!Array.isArray(values)) {
        return {items: [], changed: false};
    }
    const seen = new Set();
    const items = [];
    let changed = false;
    values.forEach((value) => {
        if (!value || typeof value !== "object") {
            changed = true;
            return;
        }
        const key = typeof value.key === "string" ? value.key : "";
        if (!key) {
            changed = true;
            return;
        }
        if (seen.has(key)) {
            changed = true;
            return;
        }
        seen.add(key);
        const title = typeof value.title === "string" ? value.title : "";
        const rootId = typeof value.rootId === "string" && value.rootId ? value.rootId : null;
        const group = typeof value.group === "string" ? value.group : "";
        if (title !== value.title || rootId !== value.rootId || group !== value.group) {
            changed = true;
        }
        items.push({key, title, rootId, group});
    });
    return {items, changed};
}

/**
 * MobileTabs.open/close compatibility result: older SiYuan versions return
 * undefined, while newer versions return an explicit success/failure value.
 * @param {unknown} result
 * @returns {boolean}
 */
function isSuccessfulMobileTabsResult(result) {
    return result === undefined || result === "success";
}

module.exports = {clampNum, stableSortBy, normalizeSortBy, groupFavoritesByGroup, resolveIconFallback, buildTabGroupsByParent, resolveTabRootId, planGroupOpenFavorites, sanitizeDocIds, capMru, sanitizeStringList, sanitizeFavorites, isSuccessfulMobileTabsResult};
