"use strict";

// RSS / Atom 订阅只读组件纯模型（T-6303）。
// 与 Miniflux（自建实例 + API Token）互补：本组件用户填任意 feed 地址，零凭据、零实例。
//
// 有界解析边界（沿用 iCal 先例，T-6284）：
//   - 源文本长度由网络层钳制（MAX_RESPONSE_BYTES = 128 KiB），模型层不再重复读入；
//   - 条目解析上限 MAX_PARSE_ITEMS = 200，超出按 parse_failed 整体拒绝而非静默截断
//     ——避免把超大订阅源误报为"没有文章"；
//   - XML 仅做有界标签提取，不引入 DOM/实体展开炸弹面：实体解码只做一轮、
//     数字码点超出 Unicode 范围或落进代理对空洞时替换为 U+FFFD；
//   - 链接只保留 http(s)（渲染层 home-view 还有协议二次校验）。

const MAX_PARSE_ITEMS = 200;
const MAX_TITLE_CHARS = 96;
const XML_NAMED_ENTITIES = Object.freeze({amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"});

function normalizeRssSubscriptionConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const url = typeof source.url === "string" ? source.url.trim() : "";
    const requested = Math.trunc(Number(source.maxItems));
    const maxItems = Number.isFinite(requested) ? Math.min(30, Math.max(1, requested)) : 10;
    const title = typeof source.title === "string" ? source.title.trim().slice(0, MAX_TITLE_CHARS) : "";
    // T-6444：来源名/日期默认显示（与旧版一致）；序号默认关——按时间排序的订阅里纯序号无含义
    return {
        url,
        maxItems,
        title,
        showFeedTitle: source.showFeedTitle !== "否" && source.showFeedTitle !== false,
        showDate: source.showDate !== "否" && source.showDate !== false,
        showRank: source.showRank === "是" || source.showRank === true,
        // T-6685：只看未读（opt-in）——已读状态经宿主持久化（sw_rss_read）
        hideRead: source.hideRead === "是" || source.hideRead === true,
    };
}

function xmlCodePoint(code) {
    if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "\uFFFD";
    try {
        const ch = String.fromCodePoint(code);
        // 代理区独字（0xD800-0xDFFF）不是合法字符，降级为替换符
        return ch >= "\uD800" && ch <= "\uDFFF" ? "\uFFFD" : ch;
    } catch (_) {
        return "\uFFFD";
    }
}

// 单轮解码：&amp;lt; 解出 "&lt;" 字面文本而非再解一层——不做迭代解码，杜绝实体炸弹。
function decodeXmlEntities(text) {
    return String(text)
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => xmlCodePoint(parseInt(hex, 16)))
        .replace(/&#([0-9]+);/g, (_, dec) => xmlCodePoint(parseInt(dec, 10)))
        .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_NAMED_ENTITIES[name]);
}

function collapseXmlWhitespace(text) {
    return String(text).replace(/\s+/g, " ").trim();
}

// 提取 block 内第一个 <tag> 的内文。CDATA：字面文本——只剥嵌套标签、不解码实体
// （CDATA 内 &amp; 本就是字面量）；普通文本：剥嵌套标签 + 单轮实体解码。
function extractTagText(block, tag) {
    if (typeof block !== "string" || !tag || /[<>\s]/.test(tag)) return "";
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
    if (!match) return "";
    let inner = match[1];
    const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdata) {
        inner = cdata[1].replace(/<[^>]*>/g, " ");
        return collapseXmlWhitespace(inner);
    }
    inner = inner.replace(/<[^>]*>/g, " ");
    return collapseXmlWhitespace(decodeXmlEntities(inner));
}

// Atom 的 <link> 是自闭合属性形态；优先 rel="alternate"，其次第一个带 href 的 link。
function extractAtomLink(block) {
    const links = typeof block === "string" ? block.match(/<link\b[^>]*>/gi) || [] : [];
    let first = "";
    for (const tag of links) {
        const href = (tag.match(/\shref\s*=\s*"([^"]*)"/i) || tag.match(/\shref\s*=\s*'([^']*)'/i) || [])[1];
        if (typeof href !== "string" || !href) continue;
        const decoded = collapseXmlWhitespace(decodeXmlEntities(href));
        if (!decoded) continue;
        if (/rel\s*=\s*"alternate"/i.test(tag) || /rel\s*=\s*'alternate'/i.test(tag)) return decoded;
        if (!first) first = decoded;
    }
    return first;
}

function parseFeedDate(block, candidates) {
    // T-6725：按序尝试全部候选标签——首个存在但格式异常（Date.parse 失败）时
    // 继续尝试下一个（如 pubDate 损坏回退 dc:date、updated 异常回退 published），
    // 全部耗尽才放弃返回 0（UI 对 <=0 时间戳省略显示，不伪造时间）。
    for (const tag of candidates) {
        const raw = extractTagText(block, tag);
        if (!raw) continue;
        const value = Date.parse(raw);
        if (Number.isFinite(value)) return {timestamp: value, dateRaw: raw};
    }
    return {timestamp: 0, dateRaw: ""};
}

// 识别 feed 形态并解析条目。返回：
//   {ok: true, format: "rss"|"atom", feedTitle, items: [{title, link, timestamp, dateRaw}]}
//   {ok: false, reason: "empty_response"|"not_a_feed"|"parse_failed"|"empty_feed"}
function parseRssFeed(text) {
    if (typeof text !== "string" || !text) return {ok: false, reason: "empty_response"};
    const head = text.slice(0, 2048).toLowerCase();
    if (!head.includes("<rss") && !head.includes("<feed") && !head.includes("<?xml")) {
        return {ok: false, reason: "not_a_feed"};
    }
    const isAtom = /<feed[\s>]/i.test(head);
    const pattern = isAtom
        ? /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi
        : /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
    const dateTags = isAtom ? ["updated", "published"] : ["pubDate", "dc:date"];
    const items = [];
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const block = match[1];
        const title = extractTagText(block, "title");
        if (!title) continue;
        const link = isAtom ? extractAtomLink(block) : (extractTagText(block, "link") || extractTagText(block, "guid"));
        const date = parseFeedDate(block, dateTags);
        items.push({title: title.slice(0, MAX_TITLE_CHARS), link, timestamp: date.timestamp, dateRaw: date.dateRaw});
        if (items.length >= MAX_PARSE_ITEMS) return {ok: false, reason: "parse_failed"};
    }
    if (!items.length) return {ok: false, reason: "empty_feed"};
    // feed 自带标题：取第一个条目出现之前的根块（channel/feed 头部），避免误配到条目标题。
    const entryStart = text.search(isAtom ? /<entry[\s>]/i : /<item[\s>]/i);
    const headBlock = entryStart > 0 ? text.slice(0, entryStart) : text.slice(0, 4096);
    const feedTitle = extractTagText(headBlock, "title");
    return {ok: true, format: isAtom ? "atom" : "rss", feedTitle, items};
}

// 最新条目选择：时间戳降序，缺失日期（0）沉底并保持原相对顺序；按 maxItems 截取。
function latestRssItems(parsedItems, options = {}) {
    const max = Math.min(30, Math.max(1, Math.trunc(Number(options.maxItems)) || 10));
    const withIndex = (Array.isArray(parsedItems) ? parsedItems : []).map((item, index) => ({item, index}));
    withIndex.sort((a, b) => (b.item.timestamp - a.item.timestamp) || (a.index - b.index));
    return withIndex.slice(0, max).map((entry) => entry.item);
}

// T-6685 已读状态（有界）：键=条目稳定标识（link 优先，title 兜底，≤128 字符），
// 值=标记时间 ms；超限按时间最旧剪除。纯函数，宿主负责读写持久化 key。
const RSS_READ_STATE_MAX = 200;

function normalizeRssReadState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const seen = source.seen && typeof source.seen === 'object' && !Array.isArray(source.seen) ? source.seen : {};
    const entries = Object.entries(seen).filter(([key, at]) =>
        typeof key === 'string' && key.length >= 1 && key.length <= 128 && Number.isFinite(at) && Number(at) > 0);
    entries.sort((left, right) => left[1] - right[1]);
    const bounded = entries.slice(-RSS_READ_STATE_MAX);
    const changed = source.version !== 1 || bounded.length !== entries.length
        || Object.keys(seen).length !== entries.length
        || bounded.some(([key, at]) => seen[key] !== at);
    return {version: 1, seen: Object.fromEntries(bounded), changed};
}

function rssItemKey(item) {
    const link = typeof item?.link === 'string' ? item.link.trim() : '';
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    return (link || title).slice(0, 128);
}

module.exports = {
    RSS_READ_STATE_MAX,
    normalizeRssReadState,
    rssItemKey,
    MAX_PARSE_ITEMS,
    MAX_TITLE_CHARS,
    normalizeRssSubscriptionConfig,
    decodeXmlEntities,
    extractTagText,
    extractAtomLink,
    parseRssFeed,
    latestRssItems,
};
