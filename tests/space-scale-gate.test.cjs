// T-7207：间距密度刻度门禁。
// 合同：--sw-space-xs/sm/md/lg/xl 五档定义于 _00 共享块（三容器）；侧栏 compact
// 覆盖点（快捷动作、工具栏、平台导航项）必须引用密度档。新间距优先消费档位，
// 字面只允许作为回退参数出现（spacing-scale-gate 继续拦奇数碎片）。
// 检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

const CONSUMERS = [
    {file: '_03-switcher-mobile.scss', marker: '.sw__quick-actions {', near: 'var(--sw-space-sm, 6px) var(--sw-space-md, 8px)'},
    {file: '_07-sidebar-panel-store.scss', marker: '.speed-switch.sw--sidebar .sw__toolbar {', near: 'gap: var(--sw-space-sm, 6px)'},
    {file: '_platform-shell.scss', marker: '.sw-platform-chrome .sw-platform-surface-nav__item { flex: 1 1 auto;', near: 'padding-inline: var(--sw-space-md, 8px)'},
];

test('detector self-check: missing space token consumption is caught (negative verification)', () => {
    const violation = {marker: '.sw__quick-actions {', near: 'padding: 6px 8px'};
    const source = read(CONSUMERS[0].file);
    const blockStart = source.indexOf(violation.marker);
    const block = source.slice(blockStart, source.indexOf('}', blockStart) + 1);
    assert.equal(block.includes(violation.near), false, '字面间距必须被抓到（当前源码已迁移，此处验证检测逻辑）');
    assert.equal(block.includes(CONSUMERS[0].near), true, '真实源码已消费密度档');
});

test('space tiers are defined on the shared block', () => {
    const tokens = read('_00-tokens.scss');
    const block = tokens.slice(tokens.indexOf('.speed-switch'), tokens.indexOf('--sw-space-xs'));
    assert.match(block, /\.sw-fab-root/, '共享块必须覆盖 .sw-fab-root（T-7201）');
    assert.match(block, /\.sw-settings/, '共享块必须覆盖 .sw-settings（T-7201）');
    for (const token of ['--sw-space-xs: 4px', '--sw-space-sm: 6px', '--sw-space-md: 8px', '--sw-space-lg: 12px', '--sw-space-xl: 16px']) {
        assert.ok(tokens.includes(token), `密度档 ${token} 必须定义`);
    }
});

test('sidebar compact consumers reference the density tiers', () => {
    for (const {file, marker, near} of CONSUMERS) {
        const source = read(file);
        const blockStart = source.indexOf(marker);
        assert.notEqual(blockStart, -1, `${file}: ${marker.trim()} 必须存在`);
        const block = source.slice(blockStart, source.indexOf('}', blockStart) + 1);
        assert.ok(block.includes(near), `${file}: ${marker.trim()} 必须消费密度档（${near}）`);
    }
});
