// T-6319 GitHub 贡献模型加固契约：只补 github-model.test.cjs 未覆盖的真实行为——
// 端点分页钳制、带偏移时间的 UTC 归一、Push 权重边界与失败 token 冻结。
const test = require('node:test');
const assert = require('node:assert/strict');
const {githubEventsEndpoint, githubUtcDateKey, githubEventWeight, GITHUB_FAILURE_REASONS} = require('../src/github-model.js');

test('endpoint pagination clamps page and per-page into audited bounds', () => {
    assert.match(githubEventsEndpoint("octocat", 0, 0), /per_page=100&page=1/, "非法分页钳回默认");
    assert.match(githubEventsEndpoint("octocat", -5, 999), /page=1/);
    assert.match(githubEventsEndpoint("octocat", 2.9), /page=2/, "小数页码向下取整");
    assert.match(githubEventsEndpoint("octocat", 1), /users\/octocat\/events\/public\?per_page=100&page=1$/);
});

test('offset timestamps normalize to the UTC date bucket', () => {
    assert.equal(githubUtcDateKey("2026-09-17T23:30:00-05:00"), "2026-09-18", "西五区的 17 日晚八点后归入 UTC 次日");
    assert.equal(githubUtcDateKey("2026-09-17T08:00:00+08:00"), "2026-09-17");
    assert.equal(githubUtcDateKey("2026-09-17"), "", "纯日期不是合法事件时间戳");
    assert.equal(githubUtcDateKey("nope"), "");
    assert.equal(githubUtcDateKey(1725696000000), "");
});

test('push weight clamps to 100 and unusable sizes fall back to one', () => {
    assert.equal(githubEventWeight({type: "PushEvent", payload: {size: 500}}), 100, "超大提交数钳到 100");
    assert.equal(githubEventWeight({type: "PushEvent", payload: {size: 0}}), 1, "0 视为不可用大小");
    assert.equal(githubEventWeight({type: "PushEvent", payload: {size: -3}}), 1);
    assert.equal(githubEventWeight({type: "PushEvent"}), 1, "缺 payload 按 1 计");
    assert.equal(githubEventWeight({type: "CreateEvent"}), 1, "普通贡献事件权重 1");
    assert.equal(githubEventWeight({type: "WatchEvent"}), 0, "star 不计入贡献");
    assert.equal(githubEventWeight({}), 1, "缺类型按普通事件计");
});

test('failure reason tokens stay frozen and ordered', () => {
    assert.equal(Object.isFrozen(GITHUB_FAILURE_REASONS), true);
    assert.deepEqual([...GITHUB_FAILURE_REASONS], ["invalid_username", "parse_failed", "empty"]);
});
