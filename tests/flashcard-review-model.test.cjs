// T-7337 闪卡间隔重复复习模型契约测试
// 门禁自查（docs/gate-audit-checklist.md）：
//   - 全部断言输入来自真实生产实现 src/flashcard-review-model.js；
//   - 负向探针在文件末尾独立执行，且已实测注入验证（见 ADR 0229）。
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    REVIEW_MAX_DAYS,
    SM2_MIN_EASE,
    SM2_MAX_EASE,
    SM2_INITIAL_EASE,
    normalizeFlashcardReviewConfig,
    scheduleSm2Review,
    buildDailyReviewQueue,
    buildMasteryProgress,
    buildFlashcardReviewSnapshot,
} = require("../src/flashcard-review-model.js");

const NOW = new Date("2026-10-19T10:00:00Z").getTime();
const DAY = 86400000;

function cards(n) {
    return Array.from({length: n}, (_, i) => ({id: `20260101120000-card${i}`, content: `卡片${i}`}));
}

test("T-7337: normalizeFlashcardReviewConfig clamps limits and flags", () => {
    const ok = normalizeFlashcardReviewConfig({dailyLimit: 9999, horizonDays: 999, showForecast: true});
    assert.equal(ok.dailyLimit, 500, "每日上限必须钳制");
    assert.equal(ok.horizonDays, 14, "预测天数必须钳制在 14");
    assert.equal(ok.showForecast, true);
    assert.equal(ok.showPercent, true, "showPercent 默认开");

    const bad = normalizeFlashcardReviewConfig({dailyLimit: -3, horizonDays: 0, showPercent: false});
    assert.equal(bad.dailyLimit, 1, "非法每日上限回退为 1");
    assert.equal(bad.horizonDays, 1, "非法预测天数回退为 1");
    assert.equal(bad.showPercent, false);

    const empty = normalizeFlashcardReviewConfig(null);
    assert.equal(empty.dailyLimit, 20, "默认每日 20");
    assert.equal(empty.horizonDays, 14);
});

test("T-7337: scheduleSm2Review resets on failure and grows interval on success", () => {
    // 未掌握（评分 <3）：连续清零、间隔重置 1 天
    const failed = scheduleSm2Review({interval: 30, ease: 2.5, repetitions: 5}, 2);
    assert.equal(failed.repetitions, 0, "未掌握必须清零连续次数");
    assert.equal(failed.interval, 1, "未掌握必须重置间隔为 1 天");
    assert.equal(failed.mastered, false);

    // 首次成功：1 天
    const first = scheduleSm2Review({interval: 0, ease: SM2_INITIAL_EASE, repetitions: 0}, 4);
    assert.equal(first.interval, 1, "首次成功间隔 1 天");
    assert.equal(first.repetitions, 1);

    // 二次成功：6 天
    const second = scheduleSm2Review({interval: 1, ease: SM2_INITIAL_EASE, repetitions: 1}, 4);
    assert.equal(second.interval, 6, "二次成功间隔 6 天");
    assert.equal(second.repetitions, 2);

    // 三次成功：按 ease 放大（1*2.5 → 6；6*2.5 → 15）
    const third = scheduleSm2Review({interval: 6, ease: 2.5, repetitions: 2}, 4);
    assert.equal(third.interval, 15, "三次成功按 ease 放大到 15 天");
    assert.equal(third.mastered, false, "15 天尚未达掌握线（>=21）");

    // 掌握：>=4 分且间隔 >=21
    const mastered = scheduleSm2Review({interval: 21, ease: 2.5, repetitions: 4}, 5);
    assert.equal(mastered.mastered, true, "高分且长间隔应判为掌握");
});

test("T-7337: scheduleSm2Review clamps ease and interval bounds", () => {
    // ease 必须始终被钳制在区间内（含评分很低导致的衰减）
    let state = {interval: 1, ease: SM2_MAX_EASE, repetitions: 1};
    for (let i = 0; i < 50; i += 1) {
        state = scheduleSm2Review(state, 3); // 最低及格分，ease 衰减最快
        assert.ok(state.ease >= SM2_MIN_EASE, `ease ${state.ease} 跌破下限`);
        assert.ok(state.ease <= SM2_MAX_EASE, `ease ${state.ease} 超过上限`);
    }
    // 间隔上限一年
    const huge = scheduleSm2Review({interval: REVIEW_MAX_DAYS, ease: SM2_MAX_EASE, repetitions: 100}, 5);
    assert.ok(huge.interval <= REVIEW_MAX_DAYS, `间隔 ${huge.interval} 超过一年上限`);
    // 非法/缺失输入
    const nullish = scheduleSm2Review(null, null);
    assert.equal(nullish.repetitions, 0);
    assert.equal(nullish.mastered, false);
    // 越界评分被钳制到 0~5
    const over = scheduleSm2Review({interval: 6, ease: 2.5, repetitions: 2}, 99);
    assert.equal(over.repetitions, 3, "越界高分应按 5 处理继续递进");
    const under = scheduleSm2Review({interval: 6, ease: 2.5, repetitions: 2}, -5);
    assert.equal(under.repetitions, 0, "越界低分应按 0 处理重置");
});

test("T-7337: buildDailyReviewQueue slices due cards by daily limit across days", () => {
    const queue = buildDailyReviewQueue(cards(45), {dailyLimit: 20}, NOW);
    assert.equal(queue.queue.length, 3, "45 张 / 每日 20 → 3 天");
    assert.equal(queue.queue[0].count, 20);
    assert.equal(queue.queue[1].count, 20);
    assert.equal(queue.queue[2].count, 5);
    assert.equal(queue.totalQueued, 45);
    assert.equal(queue.remaining, 0);
    // 日期必须逐日递增
    assert.equal(queue.queue[1].date - queue.queue[0].date, DAY);
    assert.equal(queue.queue[0].dayOffset, 0, "首桶为今天");

    // 超出预测窗口的部分必须计入 remaining，不得静默丢弃
    const overflow = buildDailyReviewQueue(cards(500), {dailyLimit: 20, horizonDays: 14}, NOW);
    assert.ok(overflow.remaining > 0, "超窗卡片必须计入 remaining");
    assert.equal(overflow.queue.length, 14, "队列天数不得超过预测窗口");

    // 空输入
    assert.deepEqual(buildDailyReviewQueue(null, {}, NOW), {queue: [], totalQueued: 0, remaining: 0});
    assert.deepEqual(buildDailyReviewQueue([], {}, NOW), {queue: [], totalQueued: 0, remaining: 0});
});

test("T-7337: buildMasteryProgress stratifies cards and computes percentages", () => {
    const list = [
        {state: {interval: 0, repetitions: 0}},   // learning
        {state: {interval: 0, repetitions: 0}},   // learning
        {state: {interval: 6, repetitions: 2}},   // young
        {state: {interval: 30, repetitions: 5}},  // mature
    ];
    const p = buildMasteryProgress(list);
    assert.equal(p.total, 4);
    assert.equal(p.learning, 2);
    assert.equal(p.young, 1);
    assert.equal(p.mature, 1);
    assert.equal(p.percent.learning, 50);
    assert.equal(p.percent.young, 25);
    assert.equal(p.percent.mature, 25);

    // 空/非法
    const empty = buildMasteryProgress(null);
    assert.equal(empty.total, 0);
    assert.equal(empty.percent.mature, 0, "空集合百分比必须为 0，不得 NaN");
});

test("T-7337: buildFlashcardReviewSnapshot composes queue, mastery and stat", () => {
    const payload = {data: cards(45), total: 45};
    const snap = buildFlashcardReviewSnapshot(payload, {dailyLimit: 20, showForecast: true}, {}, NOW);
    assert.ok(snap, "必须产出复习进度快照");
    assert.equal(snap.totalDue, 45);
    assert.equal(snap.queued, 45);
    assert.equal(snap.mastery.total, 45);
    assert.ok(snap.items.length > 0);
    assert.equal(snap.items[0].value, "action:riffCard", "首项必须是进入复习动作");
    assert.ok(snap.stat.value.includes("/"), "统计摘要需呈现 今日/待复习");
    // 预测桶：今日 + 后续 2 天 + 掌握提示
    assert.ok(snap.items.length >= 4, "开启预测时必须产出未来到期桶");
});

test("T-7337: buildFlashcardReviewSnapshot rejects empty and invalid payloads", () => {
    assert.equal(buildFlashcardReviewSnapshot(null, {}), null, "空载荷必须返回 null");
    assert.equal(buildFlashcardReviewSnapshot({}, {}), null);
    assert.equal(buildFlashcardReviewSnapshot({data: []}, {}), null, "空卡片列表必须返回 null");
    // 只有无法识别的条目
    assert.equal(buildFlashcardReviewSnapshot({data: [{foo: 1}]}, {}), null);
});

test("T-7337: buildFlashcardReviewSnapshot respects showPercent and showForecast flags", () => {
    const payload = {data: cards(10), total: 10};
    const minimal = buildFlashcardReviewSnapshot(payload, {showForecast: false, showPercent: false}, {}, NOW);
    assert.equal(minimal.items.length, 1, "关闭预测与百分比后只保留今日队列");

    const full = buildFlashcardReviewSnapshot(payload, {showForecast: true, showPercent: true}, {}, NOW);
    assert.ok(full.items.length >= 2, "全开时必须含预测/掌握提示");
});

// ==================== 负向探针 ====================
test("T-7337 negative probes: scheduling integrity and bounded projection", () => {
    // 探针 1：未掌握必须重置（若被旁路，间隔会继续膨胀）
    const failed = scheduleSm2Review({interval: 60, ease: 2.5, repetitions: 9}, 1);
    assert.equal(failed.interval, 1, "探针 1 失败：未掌握未重置间隔");
    assert.equal(failed.repetitions, 0, "探针 1 失败：未掌握未清零连续次数");

    // 探针 2：ease 永不越界
    let state = {interval: 1, ease: SM2_MAX_EASE, repetitions: 1};
    for (let i = 0; i < 30; i += 1) {
        state = scheduleSm2Review(state, 3);
        assert.ok(state.ease >= SM2_MIN_EASE && state.ease <= SM2_MAX_EASE,
            `探针 2 失败：ease ${state.ease} 越界`);
    }

    // 探针 3：间隔上限一年
    const huge = scheduleSm2Review({interval: REVIEW_MAX_DAYS, ease: SM2_MAX_EASE, repetitions: 500}, 5);
    assert.ok(huge.interval <= REVIEW_MAX_DAYS, `探针 3 失败：间隔 ${huge.interval} 越界`);

    // 探针 4：超窗卡片不得静默丢弃（必须计入 remaining）
    const overflow = buildDailyReviewQueue(cards(500), {dailyLimit: 20}, NOW);
    assert.ok(overflow.remaining > 0, "探针 4 失败：超窗卡片被静默丢弃");

    // 探针 5：空集合百分比不得为 NaN
    const empty = buildMasteryProgress([]);
    assert.equal(Number.isNaN(empty.percent.mature), false, "探针 5 失败：空集合百分比为 NaN");
    assert.equal(empty.percent.mature, 0);

    // 探针 6：空载荷必须拒绝出快照
    assert.equal(buildFlashcardReviewSnapshot({data: []}, {}), null, "探针 6 失败：空列表未拒绝");

    // 探针 7：每日队列天数不得超过窗口
    const bounded = buildDailyReviewQueue(cards(10000), {dailyLimit: 1}, NOW);
    assert.ok(bounded.queue.length <= 14, "探针 7 失败：队列天数超出窗口");
});
