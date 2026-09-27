// T-6971 批次⑤：统计洞察类接线契约——GitHub 未配置引导态/有界缓存、
// ActivityWatch 本机回环/5 分钟缓存/未运行指引、端侧如实声明。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');

const adapters = readSourceFile('src/home-external-adapters.ts');
const model = readSourceFile('src/home-model.js');

test('github wiring: unconfigured username is a config-guided empty state, not an error', () => {
    assert.match(adapters, /const normalized = normalizeGithubContribConfig\(config\);/, '配置必须经归一化');
    assert.match(adapters, /if \(!normalized\.ok\) return \{emptyHint: this\.i18n\.homeGithubConfigHint, items: \[\]\};/,
        '未配置用户名 = 配置引导空态（非 error）');
    assert.match(adapters, /timeoutMs: 8500, cacheTtlMs: 60 \* 60 \* 1000/, 'GitHub 抓取超时与有界缓存口径');
});

test('github wiring: heatmap grid layout is the model default path', () => {
    assert.match(adapters, /layout: "grid"/, '热力图网格布局（P3-1）必须钉住');
    assert.match(adapters, /homeGithubEmpty} · \$\{this\.i18n\.homeRetry\}/, '失败必须给重试出口的空态文案');
});

test('activitywatch wiring: loopback service, 5-minute cache and graceful un-run state', () => {
    assert.match(adapters, /register\("external-activitywatch-time"/, '使用时长组件必须注册');
    assert.match(adapters, /timeoutMs: 5000/, 'AW 探测超时口径');
    assert.match(adapters, /cacheTtlMs: 5 \* 60 \* 1000/, '5 分钟缓存口径');
    assert.match(adapters, /homeActivityWatchConfigHint\} · \$\{this\.i18n\.homeRetry\}/, '失败 = 指引 + 重试（非 error 崩溃）');
});

test('activitywatch wiring: supported devices honestly exclude mobile', () => {
    assert.match(model, /moduleId: "external-activitywatch-time".*supportedDevices: \["desktop", "sidebar"\]/,
        '使用时长必须如实声明仅桌面+侧栏');
});
