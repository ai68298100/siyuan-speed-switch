'use strict';

// ==================== T-7334 路径首字母模糊加速（Path Acronym Scoring） ====================
// 目标：输入 `syk` 直接命中 `思源库/研发/小驴雷切` 这类深层级文档，降低大库键入成本。
// 借鉴 VS Code Quick Open 的首字母缩写打分（不引入其模糊匹配的全部语义）：
//   - 只打分，不决定命中：本模块不新增结果，只在既有结果集内重排；
//   - 只对"几乎不可能误命中"的极短 ASCII 查询生效（默认 2~6 字节）；
//   - 只有路径段的拼音首字母序列"逐段"消费查询时才计分，段边界与顺序均不得跨越。
// 纯模型：无 DOM、无网络、无持久化；可独立 require 并做契约测试。
// 汉字拼音复用 vendor tiny-pinyin（MIT），与 T-6805 一致，不新增依赖。

const ACRONYM_MIN_BYTES = 2;
const ACRONYM_MAX_BYTES = 6;
const MAX_SEGMENTS = 8;
const MAX_SEGMENT_BYTES = 96;
const MAX_CANDIDATES = 400;
const ASCII_ACRONYM_RE = /^[a-z0-9]+$/;
const SEGMENT_CACHE_MAX = 2000;

let pinyinEngineCache;
const SEGMENT_CACHE = new Map();

function getPinyinEngine() {
    if (pinyinEngineCache === undefined) {
        try {
            const engine = require("./vendor/tiny-pinyin/index.js");
            pinyinEngineCache = engine && typeof engine.isSupported === "function" && engine.isSupported() ? engine : false;
        } catch (_) {
            pinyinEngineCache = false;
        }
    }
    return pinyinEngineCache || null;
}

/**
 * 按 `/` 切分文档路径为段，去掉 `.sy` 后缀与首尾空白；空段被丢弃。
 * 段数与单段长度双限，避免超长路径把打分变成线性大扫描。
 */
function splitPathSegments(path) {
    const raw = typeof path === "string" ? path : "";
    if (!raw) return [];
    const segments = [];
    raw.replace(/\\/g, "/").split("/").forEach((part) => {
        const text = String(part || "").trim().replace(/\.sy$/i, "");
        if (text) segments.push(text);
    });
    return segments.slice(0, MAX_SEGMENTS);
}

/**
 * 单个路径段的拼音首字母序列：`研发` → `"yf"`，`raika` → `"raika"`。
 * 非汉字（拉丁字母/数字）逐字符入列，使纯 ASCII 目录名同样参与缩写。
 */
function segmentInitials(segment) {
    const key = String(segment || "");
    if (!key || key.length > MAX_SEGMENT_BYTES) return "";
    const cached = SEGMENT_CACHE.get(key);
    if (cached !== undefined) return cached;
    if (SEGMENT_CACHE.size > SEGMENT_CACHE_MAX) SEGMENT_CACHE.clear();
    const engine = getPinyinEngine();
    let initials = "";
    if (!engine) {
        initials = "";
    } else {
        engine.parse(key).forEach((token) => {
            const target = String(token.target || "").toLowerCase();
            if (!target) return;
            if (token.type === 2) {
                initials += target.charAt(0);
            } else {
                for (const ch of target) {
                    if (/[a-z0-9]/.test(ch)) initials += ch;
                }
            }
        });
    }
    SEGMENT_CACHE.set(key, initials);
    return initials;
}

/**
 * 判定候选是否可用作缩写查询。只有纯 ASCII 且长度落在极短窗口内的查询才启用：
 * 中文查询交给既有子串/拼音链路；较长 ASCII 查询误命中率显著上升，不参与本加速。
 */
function isAcronymQuery(query) {
    const text = typeof query === "string" ? query.trim().toLowerCase() : "";
    if (!text || !ASCII_ACRONYM_RE.test(text)) return false;
    return text.length >= ACRONYM_MIN_BYTES && text.length <= ACRONYM_MAX_BYTES;
}

/**
 * 候选路径文档路径（含笔记本/目录/文档名）与查询的缩写匹配打分。
 *
 * 语义：查询被路径段的拼音首字母序列**逐段、按顺序**消费。每段可取
 * 该段首字母序列的任意前缀（可为 0，即跳过该段），但一旦某段贡献字符，
 * 后续字符必须来自更靠后的段——段顺序与段内顺序都不可跨越。
 *
 * @returns {number} 0 表示不是缩写命中；>0 为命中强度（消费到的查询字符数加权）。
 */
function scorePathAcronym(path, query) {
    if (!isAcronymQuery(query)) return 0;
    const needle = query.trim().toLowerCase();
    const segments = splitPathSegments(path);
    if (!segments.length) return 0;
    const initials = segments.map(segmentInitials);
    const consumed = matchAcronym(initials, needle);
    if (!consumed) return 0;
    // 命中强度：优先消费更多查询字符（如 `syk` 全消费 > 只消费 `sy`）。
    return consumed;
}

// 逐段消费查询。段内取前缀、段间保持顺序，跳过段不计分。
// 段数 ≤8、查询 ≤6，状态空间有界，朴素 DP 即可，无需回溯剪枝。
function matchAcronym(initials, needle) {
    const total = needle.length;
    // best[segmentIndex][used] = 到达该段、已消费 used 个字符时是否可达
    let reachable = new Set([0]);
    let best = 0;
    for (let index = 0; index < initials.length; index += 1) {
        const chars = initials[index];
        const next = new Set(reachable);
        reachable.forEach((used) => {
            if (used >= total) return;
            const remaining = needle.slice(used);
            const max = Math.min(chars.length, remaining.length);
            for (let take = 1; take <= max; take += 1) {
                if (chars.slice(0, take) !== remaining.slice(0, take)) break;
                next.add(used + take);
            }
        });
        reachable = next;
        reachable.forEach((used) => {
            if (used > best) best = used;
        });
        if (best === total) return total;
    }
    return best === total ? total : 0;
}

/**
 * 在既有结果集内按路径缩写命中重排。只调整顺序，不改变集合内容与长度：
 * 未命中项按原顺序稳定后置，命中项按消费字符数降序、同分保持原顺序。
 *
 * @param {Array<object>} docs  已有文档结果（只读）
 * @param {string} query        当前查询
 * @param {object} [options]    pathOf：自定义取路径；limit：参与重排的最大条数
 * @returns {Array<object>} 新数组
 */
function rankByPathAcronym(docs, query, options = {}) {
    const safeOptions = options && typeof options === "object" ? options : {};
    if (!Array.isArray(docs) || !isAcronymQuery(query)) return Array.isArray(docs) ? docs.slice() : [];
    const pathOf = typeof safeOptions.pathOf === "function"
        ? safeOptions.pathOf
        : (doc) => (doc && typeof doc === "object" ? (doc.hPath || doc.path || "") : "");
    const cap = Number.isFinite(safeOptions.limit) && safeOptions.limit > 0
        ? Math.min(Math.floor(safeOptions.limit), MAX_CANDIDATES)
        : MAX_CANDIDATES;
    const head = docs.slice(0, cap);
    const tail = docs.slice(cap);
    const scored = [];
    head.forEach((doc, index) => {
        const score = scorePathAcronym(pathOf(doc), query);
        if (score > 0) scored.push({doc, score, index});
    });
    if (!scored.length) return docs.slice();
    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    const promoted = new Set(scored.map((item) => item.index));
    const rest = head.filter((_, index) => !promoted.has(index));
    return [...scored.map((item) => item.doc), ...rest, ...tail];
}

module.exports = {
    splitPathSegments,
    segmentInitials,
    isAcronymQuery,
    scorePathAcronym,
    rankByPathAcronym,
    ACRONYM_MIN_BYTES,
    ACRONYM_MAX_BYTES,
    MAX_SEGMENTS,
};
