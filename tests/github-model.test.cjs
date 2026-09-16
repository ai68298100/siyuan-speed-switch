"use strict";

// T-6288：GitHub 贡献热力图纯模型门禁。覆盖配置归一化、有界解析、日期桶、
// 计数口径（Push 加权 / Watch 不计）与周格子生成的确定性。

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/github-model.js");

test("config normalization accepts valid username with defaults", () => {
    const result = model.normalizeGithubContribConfig({username: " torvalds "});
    assert.equal(result.ok, true);
    assert.equal(result.username, "torvalds");
    assert.equal(result.windowDays, model.GITHUB_DEFAULT_WINDOW_DAYS);
    assert.equal(result.token, "");
});

test("config normalization rejects invalid username chars", () => {
    assert.equal(model.normalizeGithubContribConfig({username: "has_underscore"}).reason, "invalid_username");
    assert.equal(model.normalizeGithubContribConfig({username: ""}).reason, "invalid_username");
    assert.equal(model.normalizeGithubContribConfig({username: "-leading"}).reason, "invalid_username");
    assert.equal(model.normalizeGithubContribConfig({username: "trailing-"}).reason, "invalid_username");
});

test("config normalization enforces github username length limit", () => {
    const max = "a".repeat(model.GITHUB_MAX_USERNAME);
    const over = "a".repeat(model.GITHUB_MAX_USERNAME + 1);
    assert.equal(model.normalizeGithubContribConfig({username: max}).ok, true);
    assert.equal(model.normalizeGithubContribConfig({username: over}).reason, "invalid_username");
});

test("config normalization allows internal hyphens only", () => {
    assert.equal(model.normalizeGithubContribConfig({username: "some-user-name"}).ok, true);
});

test("config normalization clamps windowDays into 28..366", () => {
    assert.equal(model.normalizeGithubContribConfig({username: "a", windowDays: 7}).windowDays, 28);
    assert.equal(model.normalizeGithubContribConfig({username: "a", windowDays: 500}).windowDays, 366);
    assert.equal(model.normalizeGithubContribConfig({username: "a", windowDays: "wat"}).windowDays, model.GITHUB_DEFAULT_WINDOW_DAYS);
});

test("config normalization bounds the optional token", () => {
    const result = model.normalizeGithubContribConfig({username: "a", token: "  ghp_token  "});
    assert.equal(result.token, "ghp_token");
    const long = model.normalizeGithubContribConfig({username: "a", token: "x".repeat(model.GITHUB_MAX_TOKEN + 50)});
    assert.equal(long.token.length, model.GITHUB_MAX_TOKEN);
});

test("endpoint builder keeps pagination inside the audited bounds", () => {
    assert.equal(model.githubEventsEndpoint("torvalds", 1, 100), "https://api.github.com/users/torvalds/events/public?per_page=100&page=1");
    assert.equal(model.githubEventsEndpoint("torvalds", 9, 500).includes("page=3"), true);
    assert.equal(model.githubEventsEndpoint("torvalds", 1, 999).includes("per_page=100"), true);
});

test("event parsing aggregates push payloads and skips watch events", () => {
    const payload = JSON.stringify([
        {type: "PushEvent", created_at: "2026-09-10T08:00:00Z", payload: {size: 3}},
        {type: "PushEvent", created_at: "2026-09-10T09:00:00Z", payload: {size: 2}},
        {type: "PullRequestEvent", created_at: "2026-09-11T10:00:00Z"},
        {type: "WatchEvent", created_at: "2026-09-11T11:00:00Z"},
    ]);
    const result = model.parseGithubEvents(payload);
    assert.equal(result.ok, true);
    assert.equal(result.daily["2026-09-10"], 5);
    assert.equal(result.daily["2026-09-11"], 1);
    assert.equal(result.counted, 3);
});

test("event parsing is deterministic on the utc date bucket", () => {
    const result = model.parseGithubEvents(JSON.stringify([
        {type: "CreateEvent", created_at: "2026-09-10T23:59:59Z"},
        {type: "CreateEvent", created_at: "2026-09-10T00:00:00+08:00"},
    ]));
    assert.equal(result.ok, true);
    // 带偏移的时间也归一到 UTC 日期桶。
    assert.equal(result.daily["2026-09-09"], 1);
    assert.equal(result.daily["2026-09-10"], 1);
});

test("event parsing rejects malformed sources as parse_failed", () => {
    assert.equal(model.parseGithubEvents("not json").reason, "parse_failed");
    assert.equal(model.parseGithubEvents("{}").reason, "parse_failed");
    assert.equal(model.parseGithubEvents("[]").reason, "empty");
    assert.equal(model.parseGithubEvents(null).reason, "parse_failed");
    assert.equal(model.parseGithubEvents("x".repeat(model.GITHUB_MAX_SOURCE_BYTES + 1)).reason, "parse_failed");
});

test("event parsing rejects oversized event lists instead of truncating", () => {
    const events = Array.from({length: model.GITHUB_MAX_EVENTS + 1}, (_, i) => ({type: "CreateEvent", created_at: "2026-09-10T00:00:00Z"}));
    assert.equal(model.parseGithubEvents(JSON.stringify(events)).reason, "parse_failed");
    const okEvents = Array.from({length: model.GITHUB_MAX_EVENTS}, (_, i) => ({type: "CreateEvent", created_at: "2026-09-10T00:00:00Z"}));
    assert.equal(model.parseGithubEvents(JSON.stringify(okEvents)).ok, true);
});

test("event parsing falls back to weight 1 for push with unusable size", () => {
    const result = model.parseGithubEvents(JSON.stringify([
        {type: "PushEvent", created_at: "2026-09-10T00:00:00Z", payload: {size: "wat"}},
        {type: "PushEvent", created_at: "2026-09-11T00:00:00Z", payload: {size: -4}},
        {type: "PushEvent", created_at: "2026-09-12T00:00:00Z", payload: {size: 99999}},
    ]));
    assert.equal(result.daily["2026-09-10"], 1);
    assert.equal(result.daily["2026-09-11"], 1);
    assert.equal(result.daily["2026-09-12"], model.GITHUB_MAX_PUSH_WEIGHT);
});

test("event parsing skips entries without a usable timestamp", () => {
    const result = model.parseGithubEvents(JSON.stringify([
        {type: "CreateEvent"},
        {type: "CreateEvent", created_at: "not-a-date"},
        {type: "CreateEvent", created_at: "2026-09-10T00:00:00Z"},
        null,
    ]));
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.daily), ["2026-09-10"]);
});

test("level quantization follows the audited thresholds", () => {
    assert.equal(model.githubLevel(0), 0);
    assert.equal(model.githubLevel(1), 1);
    assert.equal(model.githubLevel(2), 1);
    assert.equal(model.githubLevel(3), 2);
    assert.equal(model.githubLevel(4), 2);
    assert.equal(model.githubLevel(5), 3);
    assert.equal(model.githubLevel(7), 3);
    assert.equal(model.githubLevel(8), 4);
    assert.equal(model.githubLevel(100), 4);
});

test("grid builds contiguous weeks ending at the reference day", () => {
    const daily = {"2026-09-15": 3};
    const grid = model.buildContributionGrid(daily, {windowDays: 28}, Date.parse("2026-09-16T12:00:00Z"));
    assert.equal(grid.caliber, "events");
    assert.equal(grid.windowDays, 28);
    assert.equal(grid.cells.length % 7, 0);
    // 周对齐的不可见格（level -1）只出现在两端：窗口首日 2026-08-20 之前的周日起始格
    // 与参考日之后的补位格；窗口内的每一格都可见。
    const invisible = grid.cells.filter((cell) => cell.level === -1);
    assert.equal(invisible.length, 7);
    const windowCells = grid.cells.filter((cell) => cell.date >= "2026-08-20" && cell.date <= "2026-09-16");
    assert.equal(windowCells.length, 28);
    assert.equal(windowCells.every((cell) => cell.level !== -1), true);
    const hit = grid.cells.filter((cell) => cell.date === "2026-09-15");
    assert.equal(hit.length, 1);
    assert.deepEqual(hit[0], {date: "2026-09-15", count: 3, level: 2});
    assert.equal(grid.total, 3);
    assert.equal(grid.activeDays, 1);
});

test("grid excludes counts outside the configured window", () => {
    const daily = {"2026-09-15": 3, "2026-06-01": 9};
    const grid = model.buildContributionGrid(daily, {windowDays: 28}, Date.parse("2026-09-16T12:00:00Z"));
    assert.equal(grid.total, 3);
    const outside = grid.cells.find((cell) => cell.date === "2026-06-01");
    assert.equal(outside, undefined);
});

test("grid start aligns to sunday and keeps week rows aligned", () => {
    const grid = model.buildContributionGrid({}, {windowDays: 28}, Date.parse("2026-09-16T12:00:00Z"));
    const firstInWindow = grid.cells.find((cell) => cell.date === "2026-08-20");
    // 2026-08-20 是窗口首日（周四），它之前的周日起始格 level 为 -1。
    assert.equal(firstInWindow.level, 0);
    const padBefore = grid.cells.findIndex((cell) => cell.level === -1);
    if (padBefore >= 0) assert.equal(padBefore, 0);
});

test("grid is deterministic under an injected now", () => {
    const daily = {"2026-01-01": 1};
    const a = model.buildContributionGrid(daily, {windowDays: 28}, Date.parse("2026-01-02T00:00:00Z"));
    const b = model.buildContributionGrid(daily, {windowDays: 28}, Date.parse("2026-01-02T00:00:00Z"));
    assert.deepEqual(a, b);
    assert.equal(a.total, 1);
    const shifted = model.buildContributionGrid(daily, {windowDays: 28}, Date.parse("2026-02-02T00:00:00Z"));
    assert.equal(shifted.total, 0);
});
