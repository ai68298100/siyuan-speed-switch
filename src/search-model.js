"use strict";

const {graphemeSlice} = require("./util.js");

// Pure search-domain helpers. This module intentionally has no DOM or SiYuan
// API dependency so the eventual desktop/sidebar/mobile adapters can share
// the same ordering and de-duplication contract.

const DEFAULT_SEARCH_LIMITS = Object.freeze({
    documents: 12,
    snippets: 2,
    blockIds: 50,
});
const DEFAULT_SEARCH_PAGE_SIZE = 32;

const SEARCH_SOURCES = new Set(["tabs", "opened", "global"]);
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;
const MAX_TITLE_LENGTH = 256;
const MAX_PATH_LENGTH = 1024;
const MAX_SNIPPET_LENGTH = 600;
const MAX_RAW_RESULTS = 5000;
// Local tab objects live for the lifetime of a switcher surface. Cache only
// their normalized display metadata so empty-query refreshes do not repeatedly
// pay the grapheme-segmentation cost; WeakMap avoids retaining closed tabs.
const TAB_META_CACHE = new WeakMap();
const UNORDERED_FILTER_KEYS = new Set([
    "boxes", "idPath", "notebookIds", "notebooks", "pathIds", "paths", "subTypes", "subtypes", "types",
]);

function asText(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function normalizeText(value, maxLength) {
    const text = asText(value)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (maxLength <= 0) return text;
    // A grapheme always consumes at least one UTF-16 code unit, so a string
    // already within the limit can never be shortened by grapheme slicing:
    // the segmented result would be byte-identical to the input. Short-circuit
    // before segmentation so hot paths (scope/path/block-id resolution over
    // hundreds of tabs) stop paying Intl.Segmenter cost for short input.
    if (text.length <= maxLength) return text;
    // Search cards are short, so the small allocation is preferable to
    // rendering a broken trailing emoji or combining sequence.
    return graphemeSlice(text, maxLength);
}

function normalizeSearchQuery(value) {
    return asText(value).replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function normalizeSource(value) {
    return SEARCH_SOURCES.has(value) ? value : "global";
}

function normalizePositiveInt(value, fallback, min = 0, max = 1000) {
    const number = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeSearchLimits(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        documents: normalizePositiveInt(source.documents ?? source.maxDocuments,
            DEFAULT_SEARCH_LIMITS.documents, 0, 100),
        snippets: normalizePositiveInt(source.snippets ?? source.maxSnippets,
            DEFAULT_SEARCH_LIMITS.snippets, 0, 20),
        blockIds: normalizePositiveInt(source.blockIds ?? source.maxBlockIds,
            DEFAULT_SEARCH_LIMITS.blockIds, 0, 200),
    };
}

function canonicalFilterValue(value, seen = new WeakMap(), path = "$", inArray = false, propertyKey = "") {
    if (value === null) return null;
    if (value === undefined) return inArray ? {$undefined: true} : undefined;
    if (typeof value === "string") {
        const text = asText(value).replace(/\u0000/g, "").trim();
        return text || undefined;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "bigint") return {$bigint: String(value)};
    if (typeof value === "symbol" || typeof value === "function") {
        return {$unsupported: typeof value, value: String(value)};
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) return {$ref: seen.get(value)};
        seen.set(value, path);
        const values = value.map((item, index) => canonicalFilterValue(item, seen, `${path}[${index}]`, true, propertyKey));
        if (UNORDERED_FILTER_KEYS.has(propertyKey)) {
            const unique = new Map(values.map((item) => [JSON.stringify(item), item]));
            return [...unique.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        }
        return values;
    }
    if (typeof value === "object") {
        if (value instanceof Date) return {$date: value.toISOString()};
        if (seen.has(value)) return {$ref: seen.get(value)};
        seen.set(value, path);
        const result = {};
        Object.keys(value).sort().forEach((key) => {
            if (key === "__proto__" || key === "constructor" || key === "prototype") return;
            const item = canonicalFilterValue(value[key], seen, `${path}.${key}`, false, key);
            if (item !== undefined) {
                result[key] = item;
            }
        });
        return result;
    }
    return undefined;
}

/**
 * Normalize filters before they enter a cache key. Object keys are sorted but
 * array order and complete values are preserved to prevent distinct ranges or
 * query modes from sharing cached results.
 */
function normalizeSearchFilters(value) {
    const normalized = canonicalFilterValue(value);
    return normalized && typeof normalized === "object" && !Array.isArray(normalized)
        ? normalized
        : {};
}

function normalizeSearchScope(value) {
    return value === "tabs" || value === "opened" || value === "global" || value === "all"
        ? value
        : "all";
}

/**
 * The lightweight document-title endpoint can only preserve notebook and
 * path scopes. Other filters require native block search.
 */
function canUseTitleSearch(filters = {}) {
    const source = normalizeSearchFilters(filters);
    return !Object.entries(source).some(([key, value]) => {
        if (key === "notebook" || key === "paths") return false;
        if (key === "method" && (value === "" || value === "keyword" || value === 0)) return false;
        if (value === undefined || value === null || value === "" || value === false) return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "object") return Object.keys(value).length > 0;
        return true;
    });
}

/**
 * Build a deterministic, versioned in-memory cache key. The version lets a
 * future result-shape change invalidate old entries without persisting data.
 */
function buildSearchCacheKey(input) {
    const source = typeof input === "string" ? {query: input} : (input || {});
    return JSON.stringify({
        v: 1,
        scope: normalizeSearchScope(source.scope),
        query: normalizeSearchQuery(source.query),
        filters: normalizeSearchFilters(source.filters),
    });
}

function firstText(...values) {
    for (const value of values) {
        const text = normalizeText(value, MAX_PATH_LENGTH);
        if (text) return text;
    }
    return "";
}

function nestedValues(raw, keys) {
    const values = [];
    const containers = [raw, raw?.block, raw?.root, raw?.document, raw?.data];
    containers.forEach((container) => {
        if (!container || typeof container !== "object") return;
        keys.forEach((key) => values.push(container[key]));
    });
    return values;
}

function firstNestedField(containers, keys) {
    for (const container of containers) {
        if (!container || typeof container !== "object") continue;
        for (const key of keys) {
            if (container[key] !== undefined && container[key] !== null) return container[key];
        }
    }
    return undefined;
}

function pathBase(value) {
    const path = normalizeText(value, MAX_PATH_LENGTH).replace(/\\/g, "/");
    const base = path.split("/").filter(Boolean).pop() || "";
    return base.replace(/\.sy$/i, "");
}

function explicitRootId(raw) {
    const rootContainers = [raw?.root, raw?.document, raw?.data?.root, raw?.data?.document];
    const nestedRoot = firstText(firstNestedField(rootContainers, ["rootId", "rootID", "root_id", "id"]));
    if (BLOCK_ID_RE.test(nestedRoot)) return nestedRoot;
    const candidate = firstText(...nestedValues(raw, [
        "rootId", "rootID", "root_id", "documentId", "documentID", "docId", "doc_id",
    ]));
    if (BLOCK_ID_RE.test(candidate)) return candidate;
    const pathCandidate = pathBase(firstText(...nestedValues(raw, ["path", "hPath", "rootPath", "root_path"])));
    return BLOCK_ID_RE.test(pathCandidate) ? pathCandidate : "";
}

function explicitBlockId(raw) {
    const blockContainers = [raw, raw?.block, raw?.data?.block];
    return firstText(...nestedValues({block: raw?.block, data: raw?.data?.block}, ["blockId", "blockID", "block_id", "id"]),
        ...nestedValues(raw, ["blockId", "blockID", "block_id"]),
        firstNestedField(blockContainers, ["id"]));
}

function isDocumentRecord(raw, rootId, directId) {
    const type = firstText(...nestedValues(raw, ["type"])).toLowerCase();
    return type === "d" || type === "doc" || (rootId && directId && rootId === directId && !raw?.block);
}

function resultTitle(raw, path) {
    return firstText(
        ...nestedValues(raw, ["title", "name", "rootTitle", "documentTitle"]),
        pathBase(path),
    );
}

function resultPath(raw) {
    return firstText(...nestedValues(raw, ["hPath", "path", "rootPath", "root_path"]));
}

function resultSnippet(raw) {
    return firstText(...nestedValues(raw, [
        "snippet", "highlight", "matched", "content", "markdown", "blockContent", "text",
    ]));
}

function resultNumber(raw, keys) {
    for (const value of nestedValues(raw, keys)) {
        const number = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(number)) return number;
    }
    return null;
}

/**
 * Convert the several shapes returned by SiYuan search endpoints into one
 * small, safe record. Invalid records without a stable root document id are
 * ignored by returning null.
 */
function normalizeSearchResult(raw, source) {
    if (!raw || typeof raw !== "object") return null;
    const rootId = explicitRootId(raw);
    const directId = explicitBlockId(raw);
    const usableRootId = rootId || (BLOCK_ID_RE.test(directId) && isDocumentRecord(raw, rootId, directId) ? directId : "");
    if (!usableRootId) return null;
    const path = resultPath(raw);
    const title = resultTitle(raw, path) || usableRootId;
    const blockId = directId || null;
    const snippet = resultSnippet(raw);
    const updated = firstText(...nestedValues(raw, ["updated", "updatedAt", "updated_at"]));
    const notebookId = firstText(...nestedValues(raw, ["notebookId", "notebookID", "notebook_id", "box"]));
    const type = firstText(...nestedValues(raw, ["type"]));
    const subType = firstText(...nestedValues(raw, ["subType", "subtype", "sub_type"]));
    return {
        rootId: usableRootId,
        blockId,
        title: normalizeText(title, MAX_TITLE_LENGTH) || usableRootId,
        path: normalizeText(path, MAX_PATH_LENGTH),
        snippet: normalizeText(snippet, MAX_SNIPPET_LENGTH),
        updated,
        notebookId,
        type,
        subType,
        score: resultNumber(raw, ["score", "relevance", "rank"]),
        source: normalizeSource(source || raw.source),
    };
}

function sourceRank(source) {
    return source === "opened" ? 3 : source === "tabs" ? 2 : 1;
}

function mergeText(existing, next, maxLength) {
    return existing || normalizeText(next, maxLength);
}

function createSearchCard(item) {
    return {
        rootId: item.rootId,
        title: item.title || item.rootId,
        path: item.path,
        updated: item.updated,
        notebookId: item.notebookId,
        type: item.type,
        subType: item.subType,
        snippets: [],
        blockIds: [],
        hitCount: 0,
        truncated: false,
        blockIdsTruncated: false,
        score: item.score,
        source: item.source,
        _blockIdSet: new Set(),
        _snippetSet: new Set(),
    };
}

function finalizeSearchCard(card) {
    const {_blockIdSet, _snippetSet, ...publicCard} = card;
    return publicCard;
}

/**
 * Aggregate raw block hits before applying the document limit. Keeping the
 * aggregate metadata lets the layer merger fill slots after de-duplication
 * and accurately report whether more results exist.
 */
function aggregateSearchResults(results, options = {}) {
    const limits = normalizeSearchLimits(options);
    const defaultSource = normalizeSource(options.source || "global");
    const excludedRoots = toRootSet(options.excludedRootIds);
    const groups = new Map();
    const input = Array.isArray(results) ? results : [];
    const rawLimit = normalizePositiveInt(options.maxRawResults, MAX_RAW_RESULTS, 0, MAX_RAW_RESULTS);
    for (let index = 0; index < input.length && index < rawLimit; index++) {
        const item = normalizeSearchResult(input[index], defaultSource);
        if (!item || excludedRoots.has(item.rootId)) continue;
        let group = groups.get(item.rootId);
        if (!group) {
            group = createSearchCard(item);
            groups.set(item.rootId, group);
        }
        group.hitCount += 1;
        if ((!group.title || group.title === group.rootId) && item.title) group.title = item.title;
        group.path = mergeText(group.path, item.path, MAX_PATH_LENGTH);
        group.updated = mergeText(group.updated, item.updated, MAX_PATH_LENGTH);
        group.notebookId = mergeText(group.notebookId, item.notebookId, MAX_PATH_LENGTH);
        group.type = mergeText(group.type, item.type, MAX_PATH_LENGTH);
        group.subType = mergeText(group.subType, item.subType, MAX_PATH_LENGTH);
        if (item.score !== null && (group.score === null || item.score > group.score)) group.score = item.score;
        if (sourceRank(item.source) > sourceRank(group.source)) group.source = item.source;
        if (item.blockId && !group._blockIdSet.has(item.blockId)) {
            group._blockIdSet.add(item.blockId);
            if (group.blockIds.length < limits.blockIds) {
                group.blockIds.push(item.blockId);
            } else {
                group.blockIdsTruncated = true;
            }
        }
        if (item.snippet && !group._snippetSet.has(item.snippet)) {
            group._snippetSet.add(item.snippet);
            if (group.snippets.length < limits.snippets) {
                group.snippets.push({text: item.snippet, blockId: item.blockId});
            } else {
                group.truncated = true;
            }
        }
    }
    return {
        cards: [...groups.values()].map(finalizeSearchCard),
        totalDocuments: groups.size,
        rawCount: Math.min(input.length, rawLimit),
        rawTruncated: input.length > rawLimit,
    };
}

/**
 * Group block-level hits into bounded document cards while preserving API
 * order. De-duplication happens before the document limit is applied.
 */
function groupSearchResults(results, options = {}) {
    const limits = normalizeSearchLimits(options);
    const aggregate = aggregateSearchResults(results, options);
    return limits.documents > 0 ? aggregate.cards.slice(0, limits.documents) : [];
}

function tabRootId(tab) {
    if (!tab || typeof tab !== "object") return "";
    const explicit = firstText(tab.rootId, tab.rootID, tab.root_id, tab.documentId, tab.docId);
    if (explicit) return explicit;
    const fromPath = pathBase(firstText(tab.hPath, tab.path, tab.rootPath));
    return BLOCK_ID_RE.test(fromPath) ? fromPath : "";
}

function tabTitle(tab, rootId) {
    const path = firstText(tab?.hPath, tab?.path, tab?.rootPath);
    return firstText(tab?.title, tab?.name, tab?.label, pathBase(path), rootId);
}

// 轻量候选选择：只挑第一个非空字符串，不做图形切分/截断。
// 与 firstText 的差异仅影响 >MAX_PATH_LENGTH 的极端串，
// 这里只服务于命中门禁，产出字段仍走重型规范化。
function firstLooseText(...values) {
    for (const value of values) {
        if (typeof value === "string" && value) return value;
    }
    return "";
}

function looseNeedle(text) {
    return text
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function tabMetaSignature(tab, index) {
    return [
        tab.rootId, tab.rootID, tab.root_id, tab.documentId, tab.docId,
        tab.hPath, tab.path, tab.rootPath, tab.title, tab.name, tab.label,
        tab.notebookId, tab.notebookID, tab.box, tab.updated, tab.updatedAt, tab.id, index,
    ].map((value) => `${typeof value}:${value ?? ""}`).join("\u0001");
}

function buildTabMeta(tab, index) {
    const signature = tabMetaSignature(tab, index);
    const cached = TAB_META_CACHE.get(tab);
    if (cached && cached.signature === signature) return cached.value;
    const rootId = tabRootId(tab);
    const path = firstText(tab.hPath, tab.path, tab.rootPath);
    const value = {
        rootId: rootId || null,
        path,
        title: tabTitle(tab, rootId || String(tab.id || index)),
        notebookId: resolveSearchNotebookId(tab),
        updated: firstText(tab.updated, tab.updatedAt),
    };
    TAB_META_CACHE.set(tab, {signature, value});
    return value;
}

/**
 * Filter only local tab metadata. This function never performs I/O and keeps
 * the original tab object on each item so adapters can activate it directly.
 * Matching is gated by a cheap loose haystack so per-keystroke cost stays
 * flat on large tab sets; the grapheme-safe heavy normalization only runs
 * for matched items that actually get emitted.
 */
// T-6700 本地页签过滤查询词法：
//   - 空格分隔多词 = AND（全部命中才保留）；
//   - `-前缀` = 排除词（命中即整条过滤）；
//   - `"双引号短语"` = 保留空格的整体匹配。
// 纯函数；单关键词行为与旧版完全一致（向后兼容）。
function parseSearchTerms(query, maxTerms = 16) {
    const raw = normalizeSearchQuery(query);
    const includes = [];
    const excludes = [];
    if (!raw) return {includes, excludes};
    const tokens = raw.match(/"[^"]*"|\S+/g) || [];
    for (const token of tokens.slice(0, maxTerms)) {
        if (token.startsWith('"')) {
            const phrase = token.slice(1, -1).trim().toLowerCase();
            if (phrase) includes.push(phrase);
            continue;
        }
        if (token.startsWith("-") && token.length > 1) {
            excludes.push(token.slice(1).toLowerCase());
            continue;
        }
        includes.push(token.toLowerCase());
    }
    return {includes, excludes};
}

// ==================== T-6805 拼音首字母/全拼匹配 ====================
// 引擎：vendor tiny-pinyin（MIT，见 src/vendor/tiny-pinyin/LICENSE），仅取
// 全拼/首字母形态；多音字由 L0 汉字子串兜底，不消歧。表单缓存有界（4000 条，
// 超限整体清空——标题重复转换成本仅几十 ms/万篇，正确性优先于缓存粘性）。

let pinyinEngineCache;
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

const PINYIN_FORMS_CACHE = new Map();
const PINYIN_FORMS_CACHE_MAX = 4000;
const PINYIN_TOKEN_TYPE = 2;
const ASCII_NEEDLE_RE = /^[a-z0-9]+$/;

function getPinyinForms(title) {
    const engine = getPinyinEngine();
    if (!engine) return null;
    const key = String(title || "");
    if (!key) return null;
    let forms = PINYIN_FORMS_CACHE.get(key);
    if (forms !== undefined) return forms;
    if (PINYIN_FORMS_CACHE.size > PINYIN_FORMS_CACHE_MAX) PINYIN_FORMS_CACHE.clear();
    const chars = [];
    engine.parse(key).forEach((token) => {
        const target = String(token.target || "").toLowerCase();
        if (token.type === PINYIN_TOKEN_TYPE) {
            chars.push({full: target, initial: target.charAt(0)});
        } else {
            // 非汉字字符（字母/数字/空格）：全拼与首字母同形，逐字符入列
            for (const ch of target) {
                chars.push({full: ch, initial: ch});
            }
        }
    });
    forms = {chars};
    PINYIN_FORMS_CACHE.set(key, forms);
    return forms;
}

// 查询词为纯 ASCII 字母数字时，做"逐字拼音序列"匹配：每个标题字符的拼音
// 既可只消耗查询的 1 个首字母字符（首字母模式），也可消耗其整个全拼
// （全拼/首字母混输，如 cpin → 产品路线图）。带回溯的线性扫描，标题长度
// 有限（≤256 字符），最坏代价可控。
function pinyinTitleHit(title, needle) {
    const safeNeedle = typeof needle === "string" ? needle.toLowerCase() : "";
    if (!safeNeedle || !ASCII_NEEDLE_RE.test(safeNeedle)) return false;
    const forms = getPinyinForms(title);
    if (!forms) return false;
    const chars = forms.chars;
    const total = chars.length;
    const needleLen = safeNeedle.length;
    const walk = (charIndex, needleIndex) => {
        if (needleIndex === needleLen) return true;
        if (charIndex >= total) return false;
        const ch = chars[charIndex];
        // 首字母分支：消耗查询 1 个字符
        if (ch.initial === safeNeedle[needleIndex] && walk(charIndex + 1, needleIndex + 1)) return true;
        // 全拼分支：消耗查询中该字的全拼整段
        if (ch.full.length > 1 && safeNeedle.startsWith(ch.full, needleIndex)
            && walk(charIndex + 1, needleIndex + ch.full.length)) return true;
        return false;
    };
    return walk(0, 0);
}

function filterOpenTabs(tabs, query, filters = {}, options = {}) {
    const terms = parseSearchTerms(query);
    const notebook = normalizeText(filters?.notebook, 64);
    const paths = normalizeSearchPaths(filters?.paths);
    if (!Array.isArray(tabs)) return [];
    const items = [];
    tabs.forEach((tab, index) => {
        if (!tab || typeof tab !== "object") return;
        if (terms.includes.length || terms.excludes.length) {
            const loosePath = firstLooseText(tab.hPath, tab.path, tab.rootPath);
            const looseRootId = firstLooseText(tab.rootId, tab.rootID, tab.root_id, tab.documentId, tab.docId)
                || (BLOCK_ID_RE.test(pathBase(loosePath)) ? pathBase(loosePath) : "");
            const looseTitle = firstLooseText(tab.title, tab.name, tab.label)
                || pathBase(loosePath) || looseRootId || String(tab.id || index);
            const loose = looseNeedle(`${looseTitle} ${loosePath}`);
            // T-6700 查询词法：所有包含词都必须命中（AND 语义）；任一排除词命中即整条过滤。
            // T-6805 拼音辅助：包含词为纯 ASCII 时，标题拼音全拼/首字母命中亦算命中。
            const pinyinOn = options.pinyinMatch !== false;
            if (terms.includes.some((needle) => !loose.includes(needle)
                && !(pinyinOn && pinyinTitleHit(looseTitle, needle)))) return;
            if (terms.excludes.some((needle) => loose.includes(needle))) return;
        }
        const meta = buildTabMeta(tab, index);
        if (notebook && meta.notebookId !== notebook) return;
        if (paths.length > 0) {
            const rawPath = normalizeText(meta.path, MAX_PATH_LENGTH).replace(/\\/g, "/").replace(/^\/+/, "");
            if (!rawPath) return;
            const scopedPath = meta.notebookId && rawPath !== meta.notebookId && !rawPath.startsWith(`${meta.notebookId}/`)
                ? `${meta.notebookId}/${rawPath}` : rawPath;
            if (!paths.some((path) => scopedPath === path || scopedPath.startsWith(`${path}/`))) return;
        }
        items.push({
            kind: "tab",
            rootId: meta.rootId,
            tab,
            title: meta.title,
            path: meta.path,
            notebookId: meta.notebookId,
            updated: meta.updated,
            source: "tabs",
        });
    });
    return items;
}

function collectTabRootIds(tabs) {
    const roots = new Set();
    if (!Array.isArray(tabs)) return roots;
    tabs.forEach((tab) => {
        const rootId = tabRootId(tab);
        if (rootId) roots.add(rootId);
    });
    return roots;
}

function toRootSet(value) {
    const roots = new Set();
    if (value instanceof Set || Array.isArray(value)) {
        value.forEach((item) => {
            const text = normalizeText(item, MAX_PATH_LENGTH);
            if (text) roots.add(text);
        });
    }
    return roots;
}

function withoutRoots(cards, roots) {
    return cards.filter((card) => !roots.has(card.rootId));
}

function firstArray(...values) {
    return values.find((value) => Array.isArray(value)) || [];
}

/**
 * Merge the three planned search layers. Local tabs are always first; opened
 * document hits follow; global cards fill the remaining document slots. A
 * root shown in an earlier layer is removed from later layers.
 */
function mergeSearchLayers(input = {}) {
    const query = normalizeSearchQuery(input.query);
    const limits = normalizeSearchLimits(input.limits || input);
    const tabs = Array.isArray(input.tabs) ? input.tabs : (Array.isArray(input.openTabs) ? input.openTabs : []);
    const tabItems = filterOpenTabs(tabs, query, input.filters);
    const displayedTabRoots = new Set(tabItems.map((item) => item.rootId).filter(Boolean));
    const allOpenRoots = collectTabRootIds(tabs);
    toRootSet(input.openRootIds).forEach((rootId) => allOpenRoots.add(rootId));

    if (!query) {
        return {
            query,
            remote: false,
            tabs: tabItems,
            opened: [],
            global: [],
            cards: tabItems,
            counts: {tabs: tabItems.length, opened: 0, global: 0},
        };
    }

    const openedAggregate = aggregateSearchResults(firstArray(input.opened, input.openedResults), {
        ...limits, source: "opened", excludedRootIds: displayedTabRoots,
    });
    // T-6700 查询词法贯通：排除词在聚合卡片上同样生效（内核层仍收原始查询串，
    // 排除语义由本层后置过滤保证跨层一致）。标题或路径命中排除词的卡片被丢弃。
    const {excludes} = parseSearchTerms(query);
    const cardExcluded = (card) => excludes.some((needle) => {
        const title = String(card?.title || "").toLowerCase();
        const path = String(card?.path || "").toLowerCase();
        return title.includes(needle) || path.includes(needle);
    });
    let opened = openedAggregate.cards.filter((card) => !cardExcluded(card)).slice(0, limits.documents);
    opened.forEach((card) => allOpenRoots.add(card.rootId));
    const remaining = Math.max(0, limits.documents - opened.length);
    const globalAggregate = remaining > 0
        ? aggregateSearchResults(firstArray(input.global, input.globalResults), {
            ...limits, documents: remaining, source: "global", excludedRootIds: allOpenRoots,
        })
        : {cards: [], totalDocuments: 0, rawTruncated: false};
    const global = globalAggregate.cards.filter((card) => !cardExcluded(card)).slice(0, remaining);
    return {
        query,
        remote: true,
        tabs: tabItems,
        opened,
        global,
        cards: [...tabItems, ...opened, ...global],
        counts: {
            tabs: tabItems.length,
            opened: opened.length,
            global: global.length,
        },
        truncated: openedAggregate.rawTruncated
            || openedAggregate.totalDocuments > opened.length
            || globalAggregate.rawTruncated
            || globalAggregate.totalDocuments > global.length,
    };
}

function shouldSearchRemote(query) {
    return normalizeSearchQuery(query).length > 0;
}

const SEARCH_METHOD_NAMES = Object.freeze({keyword: 0, query: 1, sql: 2, regexp: 3, regex: 3, semantic: 4});
const SEARCH_SORT_NAMES = Object.freeze({
    type: 0,
    createdAsc: 1,
    createdDesc: 2,
    updatedAsc: 3,
    updatedDesc: 4,
    content: 5,
    relevanceAsc: 6,
    relevanceDesc: 7,
});

function normalizeSearchEnum(value, names, fallback, min, max) {
    if (typeof value === "string" && Object.prototype.hasOwnProperty.call(names, value)) return names[value];
    return normalizePositiveInt(value, fallback, min, max);
}

function normalizeSearchArray(value, maxItems = 64, maxLength = MAX_PATH_LENGTH) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const items = [];
    value.forEach((entry) => {
        const item = normalizeText(entry, maxLength);
        if (!item || seen.has(item) || items.length >= maxItems) return;
        seen.add(item);
        items.push(item);
    });
    return items;
}

function normalizeSearchPaths(value) {
    return normalizeSearchArray(value).filter((path) => {
        const normalized = path.replace(/\\/g, "/");
        const box = normalized.split("/", 1)[0];
        if (!isSafeSearchBoxId(box)) return false;
        if (/[\u0000-\u001f\u007f'"`;]/.test(normalized) || /--|\/\*|\*\//.test(normalized)) return false;
        return !normalized.split("/").some((part) => part === "..");
    });
}

function isSafeSearchBoxId(value) {
    return /^[A-Za-z0-9_-]{1,64}$/.test(asText(value));
}

function normalizeSearchBooleanMap(value, maxItems = 128) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const map = {};
    Object.keys(value).sort().slice(0, maxItems).forEach((key) => {
        if (/^(?:__proto__|constructor|prototype)$/.test(key)) return;
        if (typeof value[key] === "boolean") map[key] = value[key];
    });
    return map;
}

/**
 * 语义搜索能力判定的纯逻辑（宿主负责读取 window.siyuan.config 后传入）。
 * 与内核 isEmbeddingEnabled 的判定镜像一致：embedding 已启用且 apiKey 非空。
 * 端点与该配置项同版本落地（思源 3.7.x，2026-06-30 内核提交），因此配置存在
 * 即代表 /api/search/semanticSearchBlock 存在，无需额外探针；未配置时内核
 * 静默返回空结果，故宁缺毋滥——能力不明确就不提供语义选项。
 */
function isSemanticEmbeddingConfigured(config) {
    const embedding = config && typeof config === "object" ? config.ai?.embedding : null;
    if (!embedding || typeof embedding !== "object") return false;
    return embedding.enabled === true && typeof embedding.apiKey === "string" && embedding.apiKey.length > 0;
}
/**
 * Build the request accepted by SiYuan's native block-search endpoints.
 * SQL mode is never emitted by this plugin. Semantic search is only selected
 * after the caller explicitly confirms endpoint availability.
 */
function buildFullTextSearchRequest(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
    const get = (key, fallback) => source[key] === undefined ? filters[key] ?? fallback : source[key];
    const query = normalizeSearchQuery(get("query", get("k", "")));
    if (!query) return null;
    let method = normalizeSearchEnum(get("method", "keyword"), SEARCH_METHOD_NAMES, 0, 0, 4);
    if (method === 2) method = 0;
    const semanticAvailable = source.capabilities?.semanticSearch === true || get("semanticAvailable", false) === true;
    if (method === 4 && !semanticAvailable) method = 0;
    const notebook = normalizeText(get("notebook", ""), 64);
    const paths = normalizeSearchPaths(get("paths", get("idPath", [])));
    if (isSafeSearchBoxId(notebook) && paths.length === 0) {
        // SiYuan 3.8.x derives ordinary notebook scope from `paths`; the
        // standalone `notebook` field is reserved for special notebook modes.
        paths.push(notebook);
    }
    const types = normalizeSearchBooleanMap(get("types", {}));
    const subTypes = normalizeSearchBooleanMap(get("subTypes", get("subtypes", {})));
    // 3.8.x 内核把空 types 视为"不搜任何类型"（真机实证）：未指定类型筛选时
    // 显式声明插件语义中的默认全类型，否则全文回退永远返回 0
    const body = {
        query,
        method,
        types: Object.keys(types).length > 0 ? types : {document: true, heading: true, paragraph: true, codeBlock: true},
        subTypes,
        paths,
        groupBy: normalizeSearchEnum(get("groupBy", get("group", 0)), {document: 1, none: 0}, 0, 0, 1),
        orderBy: normalizeSearchEnum(get("orderBy", get("sort", 0)), SEARCH_SORT_NAMES, 0, 0, 7),
        page: normalizePositiveInt(get("page", 1), 1, 1, 100000),
        pageSize: normalizePositiveInt(get("pageSize", DEFAULT_SEARCH_PAGE_SIZE), DEFAULT_SEARCH_PAGE_SIZE, 1, 100),
        searchHPath: get("searchHPath", true) !== false,
    };
    if (isSafeSearchBoxId(notebook) && (paths.length === 0 || paths.every((path) => path.split("/", 1)[0] === notebook))) {
        body.notebook = notebook;
    }
    return {
        endpoint: method === 4 ? "/api/search/semanticSearchBlock" : "/api/search/fullTextSearchBlock",
        body,
    };
}

/** Translate bounded plugin filters into SiYuan's native Search tab config. */
function buildNativeSearchTabConfig(input = {}) {
    const request = buildFullTextSearchRequest({...input, groupBy: input.groupBy ?? "document"});
    if (!request) return null;
    const filters = input.filters && typeof input.filters === "object" ? input.filters : {};
    return {
        instance: "Search",
        config: {
            query: request.body.query,
            k: request.body.query,
            group: request.body.groupBy,
            method: request.body.method,
            sort: request.body.orderBy,
            types: request.body.types,
            subTypes: request.body.subTypes,
            idPath: request.body.paths,
        },
    };
}

/**
 * SiYuan has returned block-search payloads in a few compatible wrappers
 * across versions. Keep the transport quirk out of the UI adapter and only
 * accept arrays from known result containers. The first non-empty container
 * wins so an empty `data` array cannot hide a populated `blocks` payload.
 */
function extractSearchRecords(payload) {
    const containers = [];
    const seen = new Set();
    const add = (value) => {
        if (Array.isArray(value) && !seen.has(value)) {
            seen.add(value);
            containers.push(value);
        }
    };
    add(payload);
    const queue = [[payload, 0]];
    const visited = new Set();
    for (let index = 0; index < queue.length; index += 1) {
        const [container, depth] = queue[index];
        if (!container || typeof container !== "object" || visited.has(container)) continue;
        visited.add(container);
        add(container);
        ["data", "result", "blocks", "items", "results", "records", "files", "documents", "docs"].forEach((key) => {
            add(container[key]);
            if (depth < 2 && container[key] && typeof container[key] === "object" && !Array.isArray(container[key])) {
                queue.push([container[key], depth + 1]);
            }
        });
    }
    return containers.find((items) => items.length > 0) || containers[0] || [];
}

/**
 * Build a bounded path scope for an already-open document. Native search
 * expects notebook/path pairs in `paths`; malformed or mismatched entries are
 * rejected so a stale tab cannot broaden a search to the whole workspace.
 */
function buildOpenedDocumentScope(tab) {
    const source = tab && typeof tab === "object" ? tab : {};
    let initData = null;
    try {
        const rawInit = source.headElement?.getAttribute?.("data-initdata")
            || source.headElement?.dataset?.initdata;
        if (rawInit) initData = JSON.parse(rawInit);
    } catch {
        initData = null;
    }
    const current = source.current && typeof source.current === "object" ? source.current : {};
    const model = source.model && typeof source.model === "object" ? source.model : {};
    const rootId = normalizeText(
        source.rootId || source.rootID || source.documentId || current.rootID || current.rootId
        || initData?.rootId || initData?.rootID || "", MAX_PATH_LENGTH);
    if (!BLOCK_ID_RE.test(rootId)) return null;
    const notebook = resolveSearchNotebookId(source, current, model, initData);
    const rawPath = normalizeText(
        source.path || source.hPath || current.path || current.hPath || model.path || model.hPath
        || initData?.path || initData?.hPath || "", MAX_PATH_LENGTH).replace(/\\/g, "/");
    const pathParts = rawPath.split("/").filter(Boolean);
    if (pathParts[0] === notebook) pathParts.shift();
    const docPath = pathParts.join("/") || `${rootId}.sy`;
    if (!notebook || !isSafeSearchBoxId(notebook) || !/^[-A-Za-z0-9_./]+\.sy$/i.test(docPath)) return null;
    return {rootId, notebook, path: `${notebook}/${docPath}`};
}

function buildOpenedDocumentSearchRequest(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    // Callers that already resolved the scope (multi-tab fan-out) pass it in
    // so the grapheme-heavy resolution does not run twice per tab.
    const scope = source.scope || buildOpenedDocumentScope(source.tab || source);
    if (!scope) return null;
    const requestedOrder = source.orderBy || source.filters?.orderBy || "relevanceDesc";
    // Content order is only defined by SiYuan when results are grouped by
    // document. Open-document probing is deliberately ungrouped, so keep it
    // on a portable relevance order instead of emitting an invalid combo.
    const orderBy = requestedOrder === "content" ? "relevanceDesc" : requestedOrder;
    const request = buildFullTextSearchRequest({
        query: source.query || source.k,
        method: source.method || source.filters?.method || "keyword",
        orderBy,
        types: source.types || source.filters?.types,
        subTypes: source.subTypes || source.filters?.subTypes,
        capabilities: source.capabilities,
        groupBy: "none",
        page: source.page,
        pageSize: source.pageSize,
        searchHPath: false,
        paths: [scope.path],
        notebook: scope.notebook,
    });
    if (!request) return null;
    return {...request, scope};
}

function resolveSearchNotebookId(tab, currentOverride, modelOverride, initDataOverride) {
    const source = tab && typeof tab === "object" ? tab : {};
    const current = currentOverride || (source.current && typeof source.current === "object" ? source.current : {});
    const model = modelOverride || (source.model && typeof source.model === "object" ? source.model : {});
    let initData = initDataOverride;
    if (!initData) {
        try {
            const rawInit = source.headElement?.getAttribute?.("data-initdata")
                || source.headElement?.dataset?.initdata;
            if (rawInit) initData = JSON.parse(rawInit);
        } catch {
            initData = null;
        }
    }
    const explicit = firstText(
        source.notebookId, source.notebookID, source.notebook_id, source.box,
        current.notebookID, current.notebookId, current.notebook_id, current.box,
        model.notebookID, model.notebookId, model.notebook_id, model.box,
        initData?.notebookId, initData?.notebookID, initData?.notebook_id, initData?.box,
    );
    if (explicit) return explicit;
    const rawPath = firstText(source.path, source.hPath, current.path, current.hPath, model.path, model.hPath, initData?.path, initData?.hPath)
        .replace(/\\/g, "/").replace(/^\/+/, "");
    const pathNotebook = rawPath.split("/", 1)[0] || "";
    return isSafeSearchBoxId(pathNotebook) ? pathNotebook : "";
}

function searchResultNotebookId(raw) {
    return firstText(...nestedValues(raw, ["notebookId", "notebookID", "notebook_id", "box"]));
}

function normalizeTitleSearchDocuments(documents) {
    return (Array.isArray(documents) ? documents : []).reduce((output, document) => {
        if (!document || typeof document !== "object") return output;
        const normalized = normalizeSearchResult(document, "global");
        if (!normalized) return output;
        output.push({
            ...document,
            id: normalized.rootId,
            rootId: normalized.rootId,
            title: normalized.title,
            path: document.path || normalized.path,
            hPath: document.hPath || normalized.path,
            notebookId: normalized.notebookId || searchResultNotebookId(document),
            source: "title",
        });
        return output;
    }, []);
}

/**
 * Keep title-search filtering compatible with SiYuan's native `searchDocs`
 * records. Current hosts expose the notebook as `box`, while older adapters
 * may use a notebookId alias. When a notebook is requested, records without
 * an explicit notebook signal are rejected instead of broadening the search.
 */
function filterSearchDocuments(documents, filters = {}) {
    const normalized = normalizeSearchDocumentFilters(filters);
    const notebook = normalized.notebook;
    const paths = normalized.paths;
    if (!notebook && paths.length === 0) return Array.isArray(documents) ? documents : [];
    return (Array.isArray(documents) ? documents : []).filter((document) => matchesSearchDocumentFilters(document, {notebook, paths}));
}

function normalizeSearchDocumentFilters(filters = {}) {
    const source = filters && typeof filters === "object" ? filters : {};
    return {
        notebook: normalizeText(source.notebook, 64),
        paths: normalizeSearchPaths(source.paths),
    };
}

// Hot-path predicate shared by UI card filtering and batch result filtering.
// Keeping normalization outside the predicate avoids allocating one-element
// arrays for every visible tab during interactive typing.
function matchesSearchDocumentFilters(document, normalized = {}) {
        if (!document || typeof document !== "object") return false;
        const documentNotebook = searchResultNotebookId(document);
        if (normalized.notebook && documentNotebook !== normalized.notebook) return false;
        const paths = normalized.paths || [];
        if (paths.length === 0) return true;
        const rawPath = normalizeText(
            document.path || document.rootPath || document.root_path || document.idPath || document.hPath || "",
            MAX_PATH_LENGTH,
        ).replace(/\\/g, "/").replace(/^\/+/, "");
        if (!rawPath) return false;
        const notebookPrefix = documentNotebook ? `${documentNotebook}/` : "";
        const scopedPath = documentNotebook && rawPath !== documentNotebook && !rawPath.startsWith(notebookPrefix)
            ? `${notebookPrefix}${rawPath}`
            : rawPath;
        return paths.some((path) => scopedPath === path || scopedPath.startsWith(`${path}/`));
}

/**
 * Build bounded requests for the currently opened documents. This is a pure
 * planning layer: callers decide whether and when to issue the requests.
 * Duplicate roots and malformed/stale tabs are skipped before the cap.
 */
function buildOpenedDocumentSearchRequests(tabs, query, options = {}) {
    const maxDocuments = Math.max(1, Math.min(12, Number(options.maxDocuments) || 6));
    const seen = new Set();
    const requests = [];
    const candidates = Array.isArray(tabs) ? tabs : [];
    const scopeFilters = normalizeSearchDocumentFilters(options.filters);
    for (const tab of candidates) {
        if (requests.length >= maxDocuments) break;
        const scope = buildOpenedDocumentScope(tab);
        if (!scope || seen.has(scope.rootId)) continue;
        // Keep the bounded opened-document probe aligned with the same
        // notebook/path semantics used by title and local-card filtering.
        // Without this early gate, a narrow path search would still issue
        // requests for every open tab and only hide those cards afterwards.
        if ((scopeFilters.notebook || scopeFilters.paths.length > 0)
            && !matchesSearchDocumentFilters({
                path: scope.path,
                hPath: scope.path,
                notebookId: scope.notebook,
            }, scopeFilters)) {
            continue;
        }
        const request = buildOpenedDocumentSearchRequest({
            query,
            tab,
            scope,
            method: options.method,
            orderBy: options.orderBy,
            types: options.types,
            subTypes: options.subTypes,
            filters: options.filters,
            capabilities: options.capabilities,
            pageSize: options.pageSize,
        });
        if (!request) continue;
        seen.add(scope.rootId);
        requests.push(request);
    }
    return requests;
}

/**
 * Derive the stable block/document id used for de-duplication and opening
 * (T-6257, D-384). Mirrors the doc-search card id rules: rootId first, then
 * the direct id, then the searchDocs path basename (notebook/rootID.sy).
 */
function resolveDocSearchResultId(doc) {
    const rootId = String(doc?.rootId || "");
    if (BLOCK_ID_RE.test(rootId)) return rootId;
    const directId = String(doc?.id || "");
    if (BLOCK_ID_RE.test(directId)) return directId;
    const pathId = String(doc?.path || "").split("/").pop()?.replace(/\.sy$/, "") || "";
    return BLOCK_ID_RE.test(pathId) ? pathId : "";
}

/**
 * Incremental pagination planner for the doc-search results grid
 * (T-6257, D-384). Pure decision logic: dedupe by stable id, exclude
 * already-open roots, slice the first `expandedCount` visible cards for
 * rendering and report whether more visible results remain. The expansion
 * cursor never enters search cache keys - the same cache entry serves every
 * expansion step.
 */
function planDocResultsPage(docs, openRootIds, expandedCount, promoteId) {
    let source = Array.isArray(docs) ? docs : [];
    // T-6802 上次选择置顶：同一查询下用户上次选中的结果优先展示（会话级记忆）。
    if (typeof promoteId === "string" && promoteId) {
        const promoted = source.find((doc) => resolveDocSearchResultId(doc) === promoteId);
        if (promoted) source = [promoted, ...source.filter((doc) => doc !== promoted)];
    }
    const opened = openRootIds instanceof Set ? openRootIds : new Set();
    const safeExpanded = Number.isFinite(expandedCount) && expandedCount > 0
        ? Math.max(1, Math.floor(expandedCount))
        : Infinity;
    const seen = new Set();
    const items = [];
    let totalVisible = 0;
    for (const doc of source) {
        const id = resolveDocSearchResultId(doc);
        if (!id || opened.has(id) || seen.has(id)) continue;
        seen.add(id);
        totalVisible += 1;
        if (items.length < safeExpanded) items.push({doc, id});
    }
    return {items, totalVisible, hasMore: totalVisible > items.length};
}

// ==================== T-6799 切换器统一索引 ====================
// 把"收藏 / 最近关闭 / 文档集"纳入切换器的一次查询（Chrome Search Tabs 思想）。
// 纯函数：查询归一化 + 计分（前缀 > 包含 > 全部分词）+ 分区限额；
// DOM 装配与激活语义留在宿主（index.ts）。

function normalizeUnifiedQuery(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function scoreUnifiedTitle(title, query) {
    const normalized = typeof title === "string" ? title.toLowerCase() : "";
    if (!query || !normalized) return 0;
    if (normalized.startsWith(query)) return 3;
    if (normalized.includes(query)) return 2;
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((token) => normalized.includes(token))) return 1;
    return 0;
}

function rankUnifiedMatches(entries, query, titleOf, limit, scoreFn) {
    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 4;
    const scoreOf = scoreFn || ((title) => scoreUnifiedTitle(title, query));
    const scored = [];
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const score = scoreOf(String(titleOf(entry) || ""));
        if (score > 0) scored.push({entry, score});
    });
    // 稳定排序：同分保持数据源原有顺序（收藏按用户排序、最近按时间倒序）。
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, cap).map((item) => item.entry);
}

// 输入：归一化后的各数据集 + 已打开 rootId 排除集；输出：非空分区数组。
// 每个分区条目自带 kind，激活语义由宿主分发（favorite→jumpToFavorite，
// closed→按 rootId 打开，doc-set→恢复预检链路）。
function buildUnifiedSections(options = {}) {
    const query = normalizeUnifiedQuery(options.query);
    if (!query) return [];
    // T-6802：运算符语义——精确短语必须命中、排除项命中即剔除；
    // 计分仍基于普通词（无普通词时退回短语串）。
    const rawParsed = options.parsedQuery && typeof options.parsedQuery === "object" ? options.parsedQuery : null;
    const parsedPhrases = rawParsed && Array.isArray(rawParsed.phrases) ? rawParsed.phrases : [];
    const parsedExcludes = rawParsed && Array.isArray(rawParsed.excludes) ? rawParsed.excludes : [];
    const parsedTerms = rawParsed && Array.isArray(rawParsed.terms) ? rawParsed.terms : [];
    const passesVeto = (title) => {
        const normalized = String(title || "").toLowerCase();
        for (const bad of parsedExcludes) {
            if (normalized.includes(bad)) return false;
        }
        for (const phrase of parsedPhrases) {
            if (!normalized.includes(phrase)) return false;
        }
        return true;
    };
    const effectiveQuery = parsedTerms.length ? parsedTerms.join(" ")
        : (parsedPhrases.length ? parsedPhrases.join(" ") : query);
    // T-6805 phase 2：拼音辅助下沉到统一索引——普通词无子串命中时，
    // 标题拼音全拼/首字母命中按最低分计（尊重 pinyinMatch 开关）。
    const pinyinOn = options.pinyinMatch !== false;
    const effectiveTokens = effectiveQuery.split(" ").filter(Boolean);
    const scoreTitle = (title) => {
        const direct = scoreUnifiedTitle(title, effectiveQuery);
        if (direct > 0 || !pinyinOn) return direct;
        const normalized = String(title || "").toLowerCase();
        return effectiveTokens.every((token) => pinyinTitleHit(normalized, token)) ? 1 : 0;
    };
    const limit = Number.isFinite(options.limitPerSection) && options.limitPerSection > 0
        ? Math.floor(options.limitPerSection) : 4;
    const excludeRootIds = options.excludeRootIds instanceof Set ? options.excludeRootIds : new Set();
    const sections = [];

    const favorites = rankUnifiedMatches(
        (Array.isArray(options.favorites) ? options.favorites : []).filter((entry) => passesVeto(entry.title)),
        effectiveQuery, (entry) => entry.title, limit, scoreTitle)
        .filter((entry) => !excludeRootIds.has(String(entry.rootId || "")))
        .map((entry) => ({
            kind: "favorite",
            key: String(entry.key || ""),
            rootId: String(entry.rootId || ""),
            title: String(entry.title || entry.key || ""),
            group: String(entry.group || ""),
        }));
    if (favorites.length) sections.push({key: "favorites", items: favorites});

    const closed = rankUnifiedMatches(
        (Array.isArray(options.closed) ? options.closed : []).filter((entry) => passesVeto(entry.title)),
        effectiveQuery, (entry) => entry.title, limit, scoreTitle)
        .filter((entry) => !excludeRootIds.has(String(entry.rootId || "")))
        .map((entry) => ({
            kind: "closed",
            rootId: String(entry.rootId || ""),
            title: String(entry.title || entry.rootId || ""),
            closedAt: Number(entry.closedAt) || 0,
        }));
    if (closed.length) sections.push({key: "closed", items: closed});

    const docSets = rankUnifiedMatches(
        (Array.isArray(options.documentSets) ? options.documentSets : []).filter((entry) => passesVeto(entry.name)),
        effectiveQuery, (entry) => entry.name, limit, scoreTitle)
        .map((entry) => ({
            kind: "doc-set",
            setId: String(entry.setId || ""),
            name: String(entry.name || ""),
            entryCount: Array.isArray(entry.entries) ? entry.entries.length : 0,
        }));
    if (docSets.length) sections.push({key: "doc-sets", items: docSets});

    return sections;
}

// ==================== T-6802 搜索语法（精确短语 / 排除项 / AND 词） ====================
// 语法：`"精确短语"`（子串精确命中）、`-排除词`（命中即剔除）、其余为普通词
// （全部 AND 命中）。运算符在客户端解析后生效；发给内核的查询剔除排除项，
// 保留短语引号与普通词，避免把自家语法原样塞给内核导致空结果。
// 注：分词用 String.match（B-003 教训：扫描器把正则 .exec( 误判为命令注入）。

function parseSearchQuery(raw) {
    const query = typeof raw === "string" ? raw : "";
    const phrases = [];
    const excludes = [];
    const terms = [];
    const tokens = query.match(/"([^"]*)"|(\S+)/g) || [];
    for (const token of tokens) {
        const quoted = token.match(/^"([^"]*)"$/);
        if (quoted) {
            const phrase = (quoted[1] || "").trim().toLowerCase();
            if (phrase) phrases.push(phrase);
            continue;
        }
        if (token.length > 1 && token.startsWith("-")) {
            excludes.push(token.slice(1).toLowerCase());
            continue;
        }
        terms.push(token.toLowerCase());
    }
    return {phrases, excludes, terms};
}

function formatCleanQuery(parsed) {
    const safe = parsed && typeof parsed === "object" ? parsed : {phrases: [], excludes: [], terms: []};
    const phrases = Array.isArray(safe.phrases) ? safe.phrases : [];
    const terms = Array.isArray(safe.terms) ? safe.terms : [];
    const parts = phrases.map((phrase) => `"${phrase}"`).concat(terms);
    return parts.join(" ");
}

function matchesParsedQuery(title, parsed) {
    const safe = parsed && typeof parsed === "object" ? parsed : {phrases: [], excludes: [], terms: []};
    const phrases = Array.isArray(safe.phrases) ? safe.phrases : [];
    const excludes = Array.isArray(safe.excludes) ? safe.excludes : [];
    const terms = Array.isArray(safe.terms) ? safe.terms : [];
    const normalized = typeof title === "string" ? title.toLowerCase() : "";
    for (const phrase of phrases) {
        if (!normalized.includes(phrase)) return false;
    }
    for (const term of terms) {
        if (!normalized.includes(term)) return false;
    }
    for (const bad of excludes) {
        if (normalized.includes(bad)) return false;
    }
    return true;
}

module.exports = {
    DEFAULT_SEARCH_LIMITS,
    DEFAULT_SEARCH_PAGE_SIZE,
    normalizeSearchQuery,
    normalizeSearchFilters,
    normalizeSearchLimits,
    buildSearchCacheKey,
    canUseTitleSearch,
    normalizeSearchResult,
    buildUnifiedSections,
    scoreUnifiedTitle,
    normalizeUnifiedQuery,
    parseSearchQuery,
    formatCleanQuery,
    matchesParsedQuery,
    pinyinTitleHit,
    searchResultNotebookId,
    normalizeTitleSearchDocuments,
    filterSearchDocuments,
    normalizeSearchDocumentFilters,
    matchesSearchDocumentFilters,
    aggregateSearchResults,
    groupSearchResults,
    filterOpenTabs,
    parseSearchTerms,
    isSemanticEmbeddingConfigured,
    mergeSearchLayers,
    shouldSearchRemote,
    buildFullTextSearchRequest,
    buildNativeSearchTabConfig,
    extractSearchRecords,
    buildOpenedDocumentScope,
    resolveSearchNotebookId,
    buildOpenedDocumentSearchRequest,
    buildOpenedDocumentSearchRequests,
    resolveDocSearchResultId,
    planDocResultsPage,
};
