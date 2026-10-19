'use strict';

// T-7337 闪卡间隔重复复习模型：纯领域模型，零 DOM/网络依赖。
// 与既有 T-6409~T-6416 buildFlashcardDueSnapshot（"到期数量/列表投影"）互补：
//   - 到期投影只回答"现在有多少张待复习"；本模型回答"复习完会排到哪天"
//     （SM-2 调度推演）、"今天该练多少"（每日队列）与"掌握到什么程度"（进度统计）。
// 只读边界：不发写请求、不改内核复习状态；调度结果只是本地推演，供卡片展示。
// 复用既有只读端点 /api/riff/getNotebookRiffDueCards，不新增内核依赖。

const DAY_MS = 86400000;
const REVIEW_MAX_DAYS = 365;
const REVIEW_MAX_BUCKETS = 14;
const REVIEW_MAX_ITEMS = 24;
const REVIEW_MAX_LABEL_BYTES = 96;
const BLOCK_ID_RE = /^\d{14}-[0-9a-z]+$/i;
// SM-2 初始因子与钳制区间（SuperMemo 2 公开算法常量）。
const SM2_MIN_EASE = 1.3;
const SM2_MAX_EASE = 2.5;
const SM2_INITIAL_EASE = 2.5;

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function clampLimit(value, fallback, max) {
    const num = Math.trunc(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(1, num));
}

function clampEase(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return SM2_INITIAL_EASE;
    return Math.min(SM2_MAX_EASE, Math.max(SM2_MIN_EASE, num));
}

/** 有界归一化复习配置。 */
function normalizeFlashcardReviewConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const dailyLimit = clampLimit(source.dailyLimit, 20, 500);
    const horizonDays = clampLimit(source.horizonDays, 14, REVIEW_MAX_BUCKETS);
    return {
        notebook: boundedText(source.notebook, 64),
        dailyLimit,
        horizonDays,
        showPercent: source.showPercent !== false && source.showPercent !== "否",
        showForecast: source.showForecast === true || source.showForecast === "是",
    };
}

/**
 * SM-2 单次评分推演：给定当前复习状态与本次评分（0~5），返回下一次状态。
 * 评分 <3 判定为"未掌握"：连续计数清零、间隔重置为 1 天（重新学习）。
 * 评分 >=3 且连续次数递进：interval 按 ease 因子放大。
 * @returns {{interval: number, ease: number, repetitions: number, dueInDays: number, mastered: boolean}}
 */
function scheduleSm2Review(state, grade) {
    const safeState = state && typeof state === "object" ? state : {};
    const interval = Math.max(0, Math.trunc(Number(safeState.interval)) || 0);
    const ease = clampEase(safeState.ease);
    const repetitions = Math.max(0, Math.trunc(Number(safeState.repetitions)) || 0);
    const rawGrade = Math.trunc(Number(grade));
    const safeGrade = Number.isFinite(rawGrade) ? Math.min(5, Math.max(0, rawGrade)) : 0;

    if (safeGrade < 3) {
        return {interval: 1, ease, repetitions: 0, dueInDays: 1, mastered: false};
    }
    const nextRepetitions = repetitions + 1;
    // SM-2：首次 1 天、二次 6 天，之后按 ease 放大；上限一年，避免无限外推。
    let nextInterval = nextRepetitions === 1 ? 1 : (nextRepetitions === 2 ? 6 : Math.round(interval * ease));
    nextInterval = Math.min(REVIEW_MAX_DAYS, Math.max(1, nextInterval));
    let nextEase = clampEase(ease + (0.1 - (5 - safeGrade) * (0.08 + (5 - safeGrade) * 0.02)));
    return {
        interval: nextInterval,
        ease: Math.round(nextEase * 100) / 100,
        repetitions: nextRepetitions,
        dueInDays: nextInterval,
        mastered: safeGrade >= 4 && nextInterval >= 21,
    };
}

/**
 * 把到期卡片列表投影为"每日复习队列"：按每日上限切片到未来日期桶。
 * 纯推演：不消耗/修改任何内核状态。
 */
function buildDailyReviewQueue(dueCards, config, now = Date.now()) {
    const normalized = normalizeFlashcardReviewConfig(config);
    const cards = Array.isArray(dueCards) ? dueCards : [];
    const queue = [];
    const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
    let cursor = 0;
    for (let dayOffset = 0; dayOffset < normalized.horizonDays; dayOffset += 1) {
        const slice = cards.slice(cursor, cursor + normalized.dailyLimit);
        if (!slice.length) break;
        cursor += slice.length;
        const dayStart = startOfToday + dayOffset * DAY_MS;
        queue.push({
            date: dayStart,
            dayOffset,
            count: slice.length,
            items: slice.slice(0, REVIEW_MAX_ITEMS).map((card) => {
                const source = card && typeof card === "object" ? card : {};
                const id = boundedText(source.id || source.block_id, 64);
                const rootId = boundedText(source.root_id || source.rootId || id, 64);
                return {
                    label: boundedText(source.content || source.label || source.name, REVIEW_MAX_LABEL_BYTES),
                    value: BLOCK_ID_RE.test(rootId) ? rootId : "",
                };
            }).filter((item) => item.label),
        });
        if (cursor >= cards.length) break;
    }
    return {queue, totalQueued: Math.min(cursor, cards.length), remaining: Math.max(0, cards.length - cursor)};
}

/**
 * 掌握度进度统计：按到期卡片与累计复习状态给出分层计数与百分比。
 * 输入 cards 支持 {state: {interval, ease, repetitions}} 或裸到期条目。
 */
function buildMasteryProgress(cards) {
    const list = Array.isArray(cards) ? cards : [];
    let learning = 0;
    let young = 0;
    let mature = 0;
    for (const card of list) {
        const state = card && typeof card === "object" && card.state && typeof card.state === "object"
            ? card.state
            : (card && typeof card === "object" ? card : {});
        const interval = Math.max(0, Math.trunc(Number(state.interval)) || 0);
        const repetitions = Math.max(0, Math.trunc(Number(state.repetitions)) || 0);
        if (interval >= 21 || repetitions >= 4) mature += 1;
        else if (interval >= 1 || repetitions >= 1) young += 1;
        else learning += 1;
    }
    const total = learning + young + mature;
    const percentOf = (part) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
    return {
        total,
        learning,
        young,
        mature,
        percent: {
            learning: percentOf(learning),
            young: percentOf(young),
            mature: percentOf(mature),
        },
    };
}

/**
 * 构建复习进度看板快照：今日队列 + 掌握度分层 + 可选未来到期预测。
 * 与到期投影互补：这里回答"练多少 / 掌握到哪 / 后面几天还压着多少"。
 */
function buildFlashcardReviewSnapshot(payload, config, labels = {}, now = Date.now(), status = "fresh") {
    if (!payload || typeof payload !== "object") return null;
    const normalized = normalizeFlashcardReviewConfig(config);
    // 兼容两种载荷：{data:[cards]}（cards 模式）或 {data:[{label,count}]}（笔记本模式）。
    const raw = Array.isArray(payload.data) ? payload.data : [];
    const cards = raw.filter((row) => row && typeof row === "object"
        && (row.content || row.label || row.name || row.id || row.block_id));
    if (!cards.length) return null;

    const totalDue = Math.max(0, Math.trunc(Number(payload.total)) || cards.length);
    const {queue, totalQueued, remaining} = buildDailyReviewQueue(cards, normalized, now);
    const mastery = buildMasteryProgress(cards);
    const today = queue[0] || null;

    // 首项固定为"进入复习"动作（UI 契约），其后直接复用队列已算好的卡片 items，
    // 不重复映射一遍卡片。
    const items = [];
    if (today) {
        items.push({
            label: boundedText(labels.todayQueue, 64) || `今日复习 ${today.count} 张`,
            value: "action:riffCard",
            count: today.count,
        });
    }
    if (normalized.showForecast) {
        for (const bucket of queue.slice(1, REVIEW_MAX_BUCKETS)) {
            items.push({label: `${bucket.dayOffset} 天后 · ${bucket.count} 张`, value: "", count: bucket.count});
        }
    }
    if (today && normalized.showPercent && mastery.total > 0) {
        items.push({
            label: boundedText(labels.masteredHint, 64) || `已掌握 ${mastery.percent.mature}%`,
            value: "",
            count: mastery.mature,
        });
    }

    return {
        title: boundedText(labels.title, 64) || "闪卡复习进度",
        status,
        updatedAt: now,
        items: items.slice(0, REVIEW_MAX_ITEMS),
        totalDue,
        queued: totalQueued,
        remaining,
        mastery,
        emptyHint: boundedText(labels.empty, 96) || "当前范围没有待复习闪卡",
        stat: {
            value: today ? `${today.count}/${totalDue}` : String(totalDue),
            label: boundedText(labels.stat, 32) || "今日/待复习",
        },
    };
}

module.exports = {
    DAY_MS,
    REVIEW_MAX_DAYS,
    REVIEW_MAX_BUCKETS,
    REVIEW_MAX_ITEMS,
    SM2_MIN_EASE,
    SM2_MAX_EASE,
    SM2_INITIAL_EASE,
    normalizeFlashcardReviewConfig,
    scheduleSm2Review,
    buildDailyReviewQueue,
    buildMasteryProgress,
    buildFlashcardReviewSnapshot,
};
