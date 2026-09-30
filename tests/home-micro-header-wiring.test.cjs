// T-6969 Slice 4：查看态微标头接线契约——标题弱化、状态 chip 悬停/聚焦显现、
// 失败与加载态恒显（重要状态不靠悬停发现）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readStyleSource} = require('./source-scan.cjs');

const homeScss = readStyleSource('src/styles/_05-settings-widgets.scss');

test('micro header: view-state title is de-emphasized to the 11px identification scale', () => {
    assert.match(homeScss, /\.sw-home__grid \.sw-home__cell \.sw__home-module-header \{\s*\n\s*margin-bottom: 6px;\s*\n\s*\.sw__home-module-title \{\s*\n\s*font-size: var\(--sw-font-xs, 11px\);/,
        '查看态标题必须弱化为 11px 识别行（T-7206 刻度 token --sw-font-xs）');
    assert.match(homeScss, /text-overflow: ellipsis;/, '长名称必须省略截断');
});

test('micro header: status chip reveals on hover/focus but never hides failure or loading', () => {
    assert.match(homeScss, /\.sw__home-module-status \{\s*\n\s*opacity: 0;/, '状态 chip 默认隐藏');
    assert.match(homeScss, /\.sw-home__cell:focus-within \.sw__home-module-status,\s*\n?\.sw-home__cell\[data-sw-health="failed"\] \.sw__home-module-status,\s*\n?\.sw-home__cell\[data-sw-health="loading"\] \.sw__home-module-status/,
        '失败/加载态必须恒显（不得只靠悬停发现）');
});
