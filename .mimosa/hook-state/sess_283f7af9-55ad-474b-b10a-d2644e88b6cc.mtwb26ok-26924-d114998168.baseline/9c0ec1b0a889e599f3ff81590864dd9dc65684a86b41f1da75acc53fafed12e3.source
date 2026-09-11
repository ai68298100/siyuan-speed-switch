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

/** Sort tab-like items without mutating the input array. */
function sortItems(items, sortBy, mru = [], options = {}) {
    const ordered = Array.from(items || []);
    const titleOf = typeof options.titleOf === "function" ? options.titleOf : () => "";
    const rootIdOf = typeof options.rootIdOf === "function" ? options.rootIdOf : () => "";
    const pinKeyOf = typeof options.pinKeyOf === "function" ? options.pinKeyOf : rootIdOf;
    const updatedMap = options.updatedMap && typeof options.updatedMap === "object" ? options.updatedMap : {};
    if (sortBy === "titleAsc" || sortBy === "titleDesc") {
        ordered.sort((a, b) => {
            const result = String(titleOf(a) || "").localeCompare(String(titleOf(b) || ""), undefined, {numeric: true});
            return sortBy === "titleAsc" ? result : -result;
        });
    } else if (sortBy === "layoutDesc") {
        ordered.reverse();
    } else if (sortBy === "updatedDesc") {
        ordered.sort((a, b) => {
            const ua = updatedMap[rootIdOf(a) || ""] || "";
            const ub = updatedMap[rootIdOf(b) || ""] || "";
            return ua < ub ? 1 : ua > ub ? -1 : 0;
        });
    } else if (sortBy === "mru") {
        ordered.sort((a, b) => {
            const ra = mru.indexOf(pinKeyOf(a));
            const rb = mru.indexOf(pinKeyOf(b));
            return (ra < 0 ? Number.MAX_SAFE_INTEGER : ra) - (rb < 0 ? Number.MAX_SAFE_INTEGER : rb);
        });
    }
    return ordered;
}

/** Keep pinned items first, then apply the selected ordering to the remainder. */
function sortGroupItems(group, sortBy, mru = [], pinned = new Set(), updatedMap = {}, callbacks = {}) {
    const pinKeyOf = typeof callbacks.pinKeyOf === "function"
        ? callbacks.pinKeyOf
        : (typeof callbacks.rootIdOf === "function" ? callbacks.rootIdOf : () => "");
    const pinnedSet = pinned instanceof Set ? pinned : new Set(pinned || []);
    const pinnedItems = [];
    const restItems = [];
    Array.from(group || []).forEach((item) => {
        (pinnedSet.has(pinKeyOf(item)) ? pinnedItems : restItems).push(item);
    });
    const orderedRest = sortItems(restItems, sortBy, mru, {...callbacks, updatedMap});
    return [...pinnedItems, ...orderedRest];
}

/** Resolve the presentation state shared by quick-action surfaces. */
function resolveQuickActionSurfaceState(surface, settings = {}, selector = ".sw__quick-actions") {
    const normalizedSurface = surface === "sidebar" || surface === "mobile" ? surface : "desktop";
    const display = normalizedSurface === "desktop" ? settings.quickActionsDisplayDesktop
        : normalizedSurface === "sidebar" ? settings.quickActionsDisplaySidebar
            : settings.quickActionsDisplayMobile;
    const isRightRail = normalizedSurface === "desktop" && selector === ".sw__quick-rail";
    const collapsed = normalizedSurface === "desktop"
        ? (isRightRail ? settings.quickActionsCollapsedDesktopRight : settings.quickActionsCollapsedDesktopBottom)
        : normalizedSurface === "sidebar" ? settings.quickActionsCollapsedSidebar : settings.quickActionsCollapsedMobile;
    return {
        surface: normalizedSurface,
        display: display === "icons" || display === "hidden" ? display : "full",
        isRightRail,
        collapsed: collapsed === true,
    };
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

/** Normalize untrusted Dock/plugin metadata for compact controls. */
function normalizeQuickActionText(value, max = 80) {
    const text = typeof value === "string" ? value : "";
    const normalized = text
        .replace(/[\u0000-\u001F\u007F\uFFFD]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return Array.from(normalized).slice(0, Math.max(1, max)).join("");
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
 * Resolve an icon reference against the SVG symbols that are actually
 * available in the current document.  Plugin icons are not required to use
 * SiYuan's `icon*` prefix (for example `siyuan-media-player-icon` or
 * `lucide-book-search`), so the persisted value must remain permissive while
 * rendering must remain strict.  A Set of symbol ids keeps this function
 * pure and prevents arbitrary element ids from being treated as SVG icons.
 *
 * @param {unknown} raw
 * @param {Iterable<string>|null|undefined} availableSymbols
 * @param {string|string[]} fallback
 * @returns {{type: "svg", value: string} | {type: "emoji", value: string}}
 */
function resolveIconReference(raw, availableSymbols, fallback = "iconFile") {
    const value = typeof raw === "string" ? raw.trim() : "";
    const symbols = availableSymbols == null ? null : new Set(availableSymbols);
    const isSafeSymbolId = (candidate) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(candidate);

    if (value && isSafeSymbolId(value) && (!symbols || symbols.has(value))) {
        return {type: "svg", value};
    }

    // Preserve user-selected emoji/codepoint icons when no valid SVG symbol
    // exists for the stored value.
    const parsed = resolveIconFallback(value);
    if (parsed.type === "emoji") {
        return parsed;
    }

    const fallbacks = Array.isArray(fallback) ? fallback : [fallback];
    for (const candidate of fallbacks) {
        if (typeof candidate === "string" && isSafeSymbolId(candidate)
            && (!symbols || symbols.has(candidate))) {
            return {type: "svg", value: candidate};
        }
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

/** Resolve the stable root document ID stored by a favorite entry. */
function resolveFavoriteRootId(favorite) {
    const rootId = typeof favorite?.rootId === "string" ? favorite.rootId : "";
    if (/^\d{14}-[0-9a-z]+$/i.test(rootId)) return rootId;
    const key = typeof favorite?.key === "string" ? favorite.key : "";
    return /^\d{14}-[0-9a-z]+$/i.test(key) ? key : "";
}

/**
 * Open-history storage normalization. Document roots are stable across tab
 * instances, so old tab-id entries are migrated to the root key when one is
 * available; non-document/plugin entries retain their original key.
 * @param {unknown} values
 * @param {number} max
 * @returns {{items: Array<{key: string, rootId: string|null, title: string, ts: number}>, changed: boolean}}
 */
function sanitizeOpenHistory(values, max = 50) {
    if (!Array.isArray(values)) return {items: [], changed: false};
    const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 50;
    const seenKeys = new Set();
    const seenRoots = new Set();
    const items = [];
    let changed = false;
    for (let index = 0; index < values.length; index += 1) {
        if (items.length >= limit) {
            changed = true;
            break;
        }
        const value = values[index];
        if (!value || typeof value !== "object") {
            changed = true;
            continue;
        }
        const raw = value;
        const rawKey = typeof raw.key === "string" ? raw.key.trim() : "";
        if (!rawKey) {
            changed = true;
            continue;
        }
        let rootId = typeof raw.rootId === "string" && /^\d{14}-[0-9a-z]+$/i.test(raw.rootId.trim())
            ? raw.rootId.trim() : null;
        if (!rootId && /^\d{14}-[0-9a-z]+$/i.test(rawKey)) rootId = rawKey;
        const key = rootId || rawKey;
        if (seenKeys.has(key) || (rootId && seenRoots.has(rootId))) {
            changed = true;
            continue;
        }
        const title = typeof raw.title === "string" && raw.title.trim()
            ? raw.title.trim().slice(0, 200) : key;
        const ts = typeof raw.ts === "number" && Number.isFinite(raw.ts) ? raw.ts : 0;
        if (key !== raw.key || rootId !== (raw.rootId || null) || title !== raw.title || ts !== raw.ts) changed = true;
        seenKeys.add(key);
        if (rootId) seenRoots.add(rootId);
        items.push({key, rootId, title, ts});
    }
    if (items.length !== values.length) changed = true;
    return {items: items.slice(0, limit), changed};
}

/**
 * 列表分组纯函数：按模式把打开页签聚成有序组。纯数据进纯数据出，
 * 标签/图标/排序上下文由宿主注入（DOM 与 i18n 留在 index.ts）。
 * ctx: {
 *   pinKeyOf(tab) -> string                     // 页签持久键（与收藏 key 同键域）
 *   isFavorite(pinKey) -> boolean
 *   favoriteGroupOf(pinKey) -> string           // 收藏分组名，""=未分组
 *   favoriteGroupOrder: string[]                // 收藏分组注册表顺序
 *   notebookIdOf(tab) -> string
 *   notebookNameOf(id) -> string
 *   notebookOrder: string[]                     // 思源笔记本列表顺序（id）
 *   createdOf(pinKey) -> string                 // "YYYYMMDDHHmmss"，""=未知
 *   labels: { unknownNotebook, ungroupedFavorite, unfavorited, unknownMonth }
 * }
 * 返回 Array<{key, label, icon, items}>，key 稳定可作折叠状态键。
 */
function groupTabsByMode(tabs, mode, ctx) {
    const labels = ctx.labels || {};
    if (mode === "notebook") {
        const groups = new Map();
        tabs.forEach((tab) => {
            const id = String(ctx.notebookIdOf(tab) || "");
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id).push(tab);
        });
        const order = new Map((ctx.notebookOrder || []).map((id, index) => [id, index]));
        return [...groups.entries()]
            .map(([id, items]) => ({
                key: `nb:${id || "none"}`,
                label: ctx.notebookNameOf(id) || labels.unknownNotebook || id || "—",
                icon: "iconFile",
                items,
            }))
            .sort((a, b) => {
                const ia = order.has(ctx.notebookIdOf(a.items[0])) ? order.get(ctx.notebookIdOf(a.items[0])) : Number.MAX_SAFE_INTEGER;
                const ib = order.has(ctx.notebookIdOf(b.items[0])) ? order.get(ctx.notebookIdOf(b.items[0])) : Number.MAX_SAFE_INTEGER;
                return ia !== ib ? ia - ib : a.label.localeCompare(b.label);
            });
    }
    if (mode === "favorites") {
        const groups = new Map();
        tabs.forEach((tab) => {
            const pinKey = ctx.pinKeyOf(tab);
            const favorited = ctx.isFavorite(pinKey);
            const name = favorited ? String(ctx.favoriteGroupOf(pinKey) ?? "") : "";
            const key = favorited ? `fg:${name}` : "__unfavorited__";
            if (!groups.has(key)) groups.set(key, {name, items: []});
            groups.get(key).items.push(tab);
        });
        const order = new Map((ctx.favoriteGroupOrder || []).map((name, index) => [name, index]));
        return [...groups.entries()]
            .map(([key, bucket]) => ({
                key,
                label: key === "__unfavorited__"
                    ? (labels.unfavorited || "未收藏")
                    : (bucket.name || labels.ungroupedFavorite || "未分组"),
                icon: key === "__unfavorited__" ? "iconFile" : "iconStar",
                items: bucket.items,
            }))
            .sort((a, b) => {
                if (a.key === "__unfavorited__") return 1;
                if (b.key === "__unfavorited__") return -1;
                const oa = order.has(a.label) ? order.get(a.label) : Number.MAX_SAFE_INTEGER;
                const ob = order.has(b.label) ? order.get(b.label) : Number.MAX_SAFE_INTEGER;
                return oa !== ob ? oa - ob : a.label.localeCompare(b.label);
            });
    }
    if (mode === "createdMonth") {
        const groups = new Map();
        tabs.forEach((tab) => {
            const created = String(ctx.createdOf(ctx.pinKeyOf(tab)) || "");
            const match = /^(\d{4})(\d{2})/.exec(created);
            const key = match ? `${match[1]}-${match[2]}` : "__unknown__";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(tab);
        });
        return [...groups.entries()]
            .map(([key, items]) => ({
                key: `cm:${key}`,
                label: key === "__unknown__" ? (labels.unknownMonth || "更早") : key,
                icon: "iconCalendar",
                items,
            }))
            .sort((a, b) => {
                if (a.key === "cm:__unknown__") return 1;
                if (b.key === "cm:__unknown__") return -1;
                return b.key.localeCompare(a.key);
            });
    }
    return [{key: "all", label: "", icon: "", items: [...tabs]}];
}

module.exports = {clampNum, stableSortBy, normalizeSortBy, sortItems, sortGroupItems, resolveQuickActionSurfaceState, groupFavoritesByGroup, groupTabsByMode, resolveIconFallback, resolveIconReference, buildTabGroupsByParent, resolveTabRootId, resolveFavoriteRootId, planGroupOpenFavorites, sanitizeDocIds, capMru, sanitizeStringList, sanitizeFavorites, sanitizeOpenHistory, isSuccessfulMobileTabsResult, normalizeQuickActionText};
