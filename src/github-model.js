"use strict";

// v0.21 生活信息支线（ROADMAP「再评估 iCal 与 GitHub 贡献热力图」第 ④ 位候选）：
// GitHub 贡献热力图只读组件的契约/纯模型层。按 T-123/T-124/T-6284 先例先行交付可测
// 纯模型，宿主接入（adapter/catalog/i18n）另行接线——本模块不发起网络请求、不读取宿主数据。
//
// 数据源契约（与 source-audit 的准入门槛对齐）：
//   - 官方 REST `GET /users/{username}/events/public`：免 Key 公开只读（未认证 60 次/时/IP，
//     可选 PAT 走请求头提升限额——token 只允许经请求头传递，永不进入 URL/缓存/错误消息）；
//   - 分页契约：per_page ≤ 100、至多 3 页，即单次抓取至多 300 条事件；
//   - 统计口径（诚实声明，与 GitHub 官方热力图不同）：PushEvent 按 payload.size 计数
//     （单事件钳到 100），其余事件各计 1，WatchEvent（star）不计——官方口径含 PR review
//     等加权，这里只做事件流的确定性近似，报告字段注明口径；
//   - 事件 JSON 是有界输入（默认 256 KiB 上限、至多 600 条），超限按 parse_failed 拒绝
//     而非静默截断（防止大账号被误报为"无贡献"）；
//   - 日期桶按 created_at 的 UTC 日期部分确定性切分（与 GitHub 网页的本地时区口径
//     存在已知差异，宿主接入时在 UI 文案注明）；
//   - 输出格子数有界（windowDays ≤ 366 → 至多 53 周 × 7 格），失败归一为稳定 token，
//     不携带原始异常。

const GITHUB_MAX_SOURCE_BYTES = 256 * 1024;
const GITHUB_MAX_EVENTS = 600;
const GITHUB_MAX_PAGES = 3;
const GITHUB_MAX_PER_PAGE = 100;
const GITHUB_MAX_USERNAME = 39;
const GITHUB_MAX_TOKEN = 200;
const GITHUB_MAX_PUSH_WEIGHT = 100;
const GITHUB_DEFAULT_WINDOW_DAYS = 84;
const GITHUB_MIN_WINDOW_DAYS = 28;
const GITHUB_MAX_WINDOW_DAYS = 366;
const GITHUB_MAX_DAYS = 400;

const GITHUB_FAILURE_REASONS = Object.freeze([
    "invalid_username",
    "parse_failed",
    "empty",
]);

// 非贡献事件：GitHub 官方热力图不计 star（WatchEvent）。
const GITHUB_NON_CONTRIB_EVENTS = Object.freeze(["WatchEvent"]);

function boundedText(value, max) {
    if (typeof value !== "string") return "";
    return value.length <= max ? value : value.slice(0, max);
}

// T-6288-1：配置归一化。username 遵循 GitHub 规则（字母/数字/内部连字符，≤39）；
// windowDays 钳制 28~366；token 可选、有界，只允许走请求头。
function normalizeGithubContribConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const username = boundedText(source.username, GITHUB_MAX_USERNAME + 1).trim();
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(username)
        || username.length > GITHUB_MAX_USERNAME) {
        return {ok: false, reason: "invalid_username"};
    }
    const rawWindow = Number(source.windowDays);
    const windowDays = Number.isFinite(rawWindow)
        ? Math.min(GITHUB_MAX_WINDOW_DAYS, Math.max(GITHUB_MIN_WINDOW_DAYS, Math.floor(rawWindow)))
        : GITHUB_DEFAULT_WINDOW_DAYS;
    const token = boundedText(typeof source.token === "string" ? source.token.trim() : "", GITHUB_MAX_TOKEN);
    return {ok: true, username, windowDays, token};
}

// 官方 REST 端点与分页的权威形状（网络层接线时直接复用，避免第二套 URL 拼接逻辑）。
function githubEventsEndpoint(username, page, perPage) {
    const safePage = Math.min(GITHUB_MAX_PAGES, Math.max(1, Math.floor(Number(page) || 1)));
    const safePerPage = Math.min(GITHUB_MAX_PER_PAGE, Math.max(1, Math.floor(Number(perPage) || GITHUB_MAX_PER_PAGE)));
    return `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=${safePerPage}&page=${safePage}`;
}

// UTC 日期桶（YYYY-MM-DD）。带偏移的时间一律先归一到 UTC 再取日期；
// 非 ISO 或缺省 → 空串（由调用方按无效跳过）。
function githubUtcDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return "";
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toISOString().slice(0, 10);
}

function githubEventWeight(event) {
    const type = typeof event.type === "string" ? event.type : "";
    if (GITHUB_NON_CONTRIB_EVENTS.includes(type)) return 0;
    if (type === "PushEvent") {
        const size = event.payload && Number.isFinite(event.payload.size) ? Number(event.payload.size) : 1;
        if (size <= 0) return 1;
        return Math.min(GITHUB_MAX_PUSH_WEIGHT, Math.floor(size));
    }
    return 1;
}

// T-6288-2：有界事件解析。输入是 REST 响应的 JSON 文本，输出按 UTC 日期聚合计数。
function parseGithubEvents(text) {
    if (typeof text !== "string" || text.length === 0) return {ok: false, reason: "parse_failed"};
    if (text.length > GITHUB_MAX_SOURCE_BYTES) return {ok: false, reason: "parse_failed"};
    let events;
    try {
        events = JSON.parse(text);
    } catch (error) {
        return {ok: false, reason: "parse_failed"};
    }
    if (!Array.isArray(events)) return {ok: false, reason: "parse_failed"};
    if (events.length > GITHUB_MAX_EVENTS) return {ok: false, reason: "parse_failed"};
    const daily = {};
    let counted = 0;
    for (const event of events) {
        if (!event || typeof event !== "object") continue;
        const dateKey = githubUtcDateKey(event.created_at);
        if (!dateKey) continue;
        const weight = githubEventWeight(event);
        if (weight <= 0) continue;
        daily[dateKey] = (daily[dateKey] || 0) + weight;
        counted += 1;
    }
    if (Object.keys(daily).length > GITHUB_MAX_DAYS) return {ok: false, reason: "parse_failed"};
    if (counted === 0) return {ok: false, reason: "empty"};
    return {ok: true, daily, counted};
}

// 水平量化：0 无贡献；1~2 / 3~4 / 5~7 / 8+ 四档渐进（与常见热力图语义一致）。
function githubLevel(count) {
    if (!Number.isFinite(count) || count <= 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 7) return 3;
    return 4;
}

function githubUtcDateKeyFromMs(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

// T-6288-3：按 windowDays 生成周×7 渲染格子（周日开头，与 GitHub 网页一致），
// 结束于 now 的 UTC 日期；窗口外的计数不进格子也不进 total。now 可注入以便测试确定化。
function buildContributionGrid(daily, config, now) {
    const source = daily && typeof daily === "object" ? daily : {};
    const windowDays = config && Number.isFinite(config.windowDays)
        ? Math.min(GITHUB_MAX_WINDOW_DAYS, Math.max(GITHUB_MIN_WINDOW_DAYS, Math.floor(config.windowDays)))
        : GITHUB_DEFAULT_WINDOW_DAYS;
    const current = Number.isFinite(now) ? now : Date.now();
    const endMs = Date.parse(`${githubUtcDateKeyFromMs(current)}T00:00:00.000Z`);
    const startMs = endMs - (windowDays - 1) * 24 * 60 * 60 * 1000;
    const cells = [];
    let total = 0;
    let activeDays = 0;
    // 第一格对齐到 startMs 所在周的周日（UTC）。
    const startDay = new Date(startMs).getUTCDay();
    const gridStartMs = startMs - startDay * 24 * 60 * 60 * 1000;
    for (let ms = gridStartMs; ms <= endMs; ms += 24 * 60 * 60 * 1000) {
        const dateKey = githubUtcDateKeyFromMs(ms);
        const inWindow = ms >= startMs;
        const count = inWindow && Number.isFinite(source[dateKey]) ? Math.min(GITHUB_MAX_PUSH_WEIGHT * GITHUB_MAX_EVENTS, Math.max(0, Math.floor(source[dateKey]))) : 0;
        if (inWindow) {
            total += count;
            if (count > 0) activeDays += 1;
        }
        cells.push({date: dateKey, count, level: inWindow ? githubLevel(count) : -1});
    }
    // cells 补齐为 7 的倍数（周对齐），尾部以 level -1 填充。
    while (cells.length % 7 !== 0) {
        cells.push({date: "", count: 0, level: -1});
    }
    const weeks = cells.length / 7;
    return {cells, weeks, total, activeDays, windowDays, caliber: "events"};
}

module.exports = {
    GITHUB_FAILURE_REASONS,
    GITHUB_MAX_SOURCE_BYTES,
    GITHUB_MAX_EVENTS,
    GITHUB_MAX_PAGES,
    GITHUB_MAX_PER_PAGE,
    GITHUB_MAX_USERNAME,
    GITHUB_MAX_TOKEN,
    GITHUB_MAX_PUSH_WEIGHT,
    GITHUB_DEFAULT_WINDOW_DAYS,
    GITHUB_MIN_WINDOW_DAYS,
    GITHUB_MAX_WINDOW_DAYS,
    normalizeGithubContribConfig,
    githubEventsEndpoint,
    githubUtcDateKey,
    githubEventWeight,
    parseGithubEvents,
    githubLevel,
    buildContributionGrid,
};
