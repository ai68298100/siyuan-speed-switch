// T-6971 批次①（时钟家族）施工验收：数字排版 tabular-nums 契约。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readStyleSource} = require('./source-scan.cjs');

const homeScss = readStyleSource('src/styles/_05-settings-widgets.scss');

test('clock family: home numerals use tabular-nums (spec card acceptance)', () => {
    assert.match(homeScss, /font-variant-numeric:\s*tabular-nums;/, '数字必须 tabular-nums');
    assert.match(homeScss, /\.sw__home-stat-value[\s\S]*?\.sw__home-module-item-value/, '统计值与行值都在覆盖内');
});
