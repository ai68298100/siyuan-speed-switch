"use strict";

// 每日引言：完全离线的本地语录集，按本地日期稳定轮换（同一天内刷新不变，跨天轮换）。
// 在线引言渠道（ZenQuotes/Quotable 等）的条款与 CORS 尚未复核，路线图将
// "本地语录集"列为零风险替代方案；本模块即该替代——无网络请求、无白名单需求。
// 语录内容全部来自公有领域中国古籍原文（作者卒年远超著作权保护期），逐条标注篇目出处。
// 语录正文属内容而非 UI 文案：界面语言为英文时仍显示中文原文，目录条目与组件描述均注明。

const QUOTE_LIBRARY = Object.freeze([
    {text: "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？", source: "《论语·学而》"},
    {text: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？", source: "《论语·学而》"},
    {text: "知之为知之，不知为不知，是知也。", source: "《论语·为政》"},
    {text: "三人行，必有我师焉。择其善者而从之，其不善者而改之。", source: "《论语·述而》"},
    {text: "岁寒，然后知松柏之后凋也。", source: "《论语·子罕》"},
    {text: "己所不欲，勿施于人。", source: "《论语·颜渊》"},
    {text: "工欲善其事，必先利其器。", source: "《论语·卫灵公》"},
    {text: "人无远虑，必有近忧。", source: "《论语·卫灵公》"},
    {text: "道不同，不相为谋。", source: "《论语·卫灵公》"},
    {text: "逝者如斯夫，不舍昼夜。", source: "《论语·子罕》"},
    {text: "上善若水，水善利万物而不争。", source: "《道德经·第八章》"},
    {text: "千里之行，始于足下。", source: "《道德经·第六十四章》"},
    {text: "知人者智，自知者明。胜人者有力，自胜者强。", source: "《道德经·第三十三章》"},
    {text: "祸兮福之所倚，福兮祸之所伏。", source: "《道德经·第五十八章》"},
    {text: "大直若屈，大巧若拙，大辩若讷。", source: "《道德经·第四十五章》"},
    {text: "知足不辱，知止不殆，可以长久。", source: "《道德经·第四十四章》"},
    {text: "穷则独善其身，达则兼善天下。", source: "《孟子·尽心上》"},
    {text: "富贵不能淫，贫贱不能移，威武不能屈，此之谓大丈夫。", source: "《孟子·滕文公下》"},
    {text: "天时不如地利，地利不如人和。", source: "《孟子·公孙丑下》"},
    {text: "生于忧患而死于安乐。", source: "《孟子·告子下》"},
    {text: "老吾老，以及人之老；幼吾幼，以及人之幼。", source: "《孟子·梁惠王上》"},
    {text: "尽信书，则不如无书。", source: "《孟子·尽心下》"},
    {text: "吾生也有涯，而知也无涯。", source: "《庄子·养生主》"},
    {text: "君子之交淡若水，小人之交甘若醴。", source: "《庄子·山木》"},
    {text: "独与天地精神往来，而不敖倪于万物。", source: "《庄子·天下》"},
    {text: "锲而舍之，朽木不折；锲而不舍，金石可镂。", source: "《荀子·劝学》"},
    {text: "不积跬步，无以至千里；不积小流，无以成江海。", source: "《荀子·劝学》"},
    {text: "青，取之于蓝，而青于蓝。", source: "《荀子·劝学》"},
    {text: "天行健，君子以自强不息；地势坤，君子以厚德载物。", source: "《周易·乾坤》"},
    {text: "穷则变，变则通，通则久。", source: "《周易·系辞下》"},
    {text: "居安思危，思则有备，有备无患。", source: "《左传·襄公十一年》"},
    {text: "皮之不存，毛将焉附？", source: "《左传·僖公十四年》"},
    {text: "前事之不忘，后事之师。", source: "《战国策·赵策》"},
    {text: "亡羊而补牢，未为迟也。", source: "《战国策·楚策》"},
    {text: "路漫漫其修远兮，吾将上下而求索。", source: "屈原《离骚》"},
    {text: "尺有所短，寸有所长；物有所不足，智有所不明。", source: "屈原《卜居》"},
    {text: "兼听则明，偏信则暗。", source: "《资治通鉴·唐纪》（魏征语）"},
    {text: "以铜为镜，可以正衣冠；以古为镜，可以知兴替；以人为镜，可以明得失。", source: "《资治通鉴·唐纪》（唐太宗语）"},
    {text: "业精于勤，荒于嬉；行成于思，毁于随。", source: "韩愈《进学解》"},
    {text: "问渠那得清如许？为有源头活水来。", source: "朱熹《观书有感》"},
    {text: "纸上得来终觉浅，绝知此事要躬行。", source: "陆游《冬夜读书示子聿》"},
    {text: "不识庐山真面目，只缘身在此山中。", source: "苏轼《题西林壁》"},
    {text: "博观而约取，厚积而薄发。", source: "苏轼《稼说送张琥》"},
    {text: "先天下之忧而忧，后天下之乐而乐。", source: "范仲淹《岳阳楼记》"},
    {text: "天将降大任于斯人也，必先苦其心志，劳其筋骨。", source: "《孟子·告子下》"},
    {text: "勿以恶小而为之，勿以善小而不为。", source: "《三国志·蜀书》（刘备敕）"},
    {text: "盛年不重来，一日难再晨。及时当勉励，岁月不待人。", source: "陶渊明《杂诗》"},
    {text: "海纳百川，有容乃大；壁立千仞，无欲则刚。", source: "林则徐自勉联"},
]);

const MAX_CUSTOM_QUOTES = 50;
const CUSTOM_TEXT_MAX = 160;
const CUSTOM_SOURCE_MAX = 64;

function boundedQuoteText(value, max) {
    return typeof value === "string"
        ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
        : "";
}

// 自定义语录：多行文本，每行一条；支持 "语录 —— 出处"、"语录 ——出处"、
// "语录|出处" 三种写法，无分隔符时整行作为语录、出处留空。
// 自定义条目整体替换内置语录集（而非追加），语义是"用户接管内容源"。
function normalizeDailyQuoteConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const raw = typeof source.quotes === "string" ? source.quotes : "";
    const custom = [];
    const seen = new Set();
    for (const line of raw.split(/\r?\n/)) {
        if (custom.length >= MAX_CUSTOM_QUOTES) break;
        const text = boundedQuoteText(line, CUSTOM_TEXT_MAX + CUSTOM_SOURCE_MAX + 4);
        if (!text) continue;
        const match = text.match(/^(.*?)\s*(?:——|—|──|\|)\s*(.+)$/);
        const quoteText = boundedQuoteText(match ? match[1] : text, CUSTOM_TEXT_MAX);
        const quoteSource = match ? boundedQuoteText(match[2], CUSTOM_SOURCE_MAX) : "";
        if (!quoteText) continue;
        const key = quoteText.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        custom.push({text: quoteText, source: quoteSource});
    }
    // T-6453：出处显示可关闭（默认开，与旧版一致）
    // T-6457：强调档位（标准/大/特大）
    return {custom, showSource: source.showSource !== "否" && source.showSource !== false, emphasis: emphasisToken(source.emphasis)};
}

function emphasisToken(value) {
    if (value === "大") return "large";
    if (value === "特大") return "xl";
    return "standard";
}

function dailyQuoteDateKey(date) {
    const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date(0);
    // 用本地日期分量（而非 UTC 时间戳取整）决定轮换：跨时区旅行或 DST 不跳引言。
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
}

// 确定性哈希（FNV-1a 变体）：同一 dateKey 恒选同一条；不追求密码学强度，只求均匀。
function quoteDateHash(dateKey) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < dateKey.length; index += 1) {
        hash ^= dateKey.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function pickDailyQuote(entries, dateKey) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return entries[quoteDateHash(dateKey) % entries.length];
}

function buildDailyQuoteSnapshot(now = new Date(), config = {}, labels = {}) {
    const dateKey = dailyQuoteDateKey(now);
    const normalized = normalizeDailyQuoteConfig(config);
    const library = normalized.custom.length > 0 ? normalized.custom : QUOTE_LIBRARY;
    const quote = pickDailyQuote(library, dateKey);
    if (!quote) return null;
    const items = [
        {label: quote.text, value: normalized.showSource ? quote.source : ""},
    ];
    if (normalized.custom.length > 0) {
        items.push({label: `${boundedQuoteText(labels.source, 32) || "来源"}：${boundedQuoteText(labels.customSource, 24) || "自定义语录"}`, value: ""});
    }
    const stat = {value: "", label: boundedQuoteText(labels.title, 48) || "每日引言"};
    if (normalized.emphasis !== "standard") stat.emphasis = normalized.emphasis;
    return {
        title: boundedQuoteText(labels.title, 48) || "每日引言",
        stat,
        items,
        dateKey,
        updatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    };
}

module.exports = {
    QUOTE_LIBRARY,
    MAX_CUSTOM_QUOTES,
    normalizeDailyQuoteConfig,
    dailyQuoteDateKey,
    quoteDateHash,
    pickDailyQuote,
    buildDailyQuoteSnapshot,
};
