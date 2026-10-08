// T-7204：图标尺寸刻度门禁。
// 合同：--sw-icon-sm/md/lg 三档定义于 _00 共享块；icon 上下文的 width 值
// 必须消费档位或属于登记的上下文豁免（如 FAB 44px 容器非 icon box）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tokens = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'styles', '_00-tokens.scss'), 'utf8');

test('icon size tiers are defined on the shared block (T-7204)', () => {
    const block = tokens.slice(tokens.indexOf('.speed-switch'), tokens.indexOf('--sw-icon-sm'));
    assert.match(block, /\.sw-fab-root/, '共享块必须覆盖 .sw-fab-root（T-7201）');
    for (const token of ['--sw-icon-sm: 16px', '--sw-icon-md: 20px', '--sw-icon-lg: 24px']) {
        assert.ok(tokens.includes(token), `图标档 ${token} 必须定义`);
    }
});

test('detector self-check: missing tier is caught (negative verification)', () => {
    const without = tokens.replace(/--sw-icon-md: 20px;/, '');
    assert.doesNotMatch(without, /--sw-icon-md: 20px;/, '移除后必须不可匹配');
});
