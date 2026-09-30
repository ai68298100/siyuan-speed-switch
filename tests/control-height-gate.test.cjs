// T-7202：控件高度刻度门禁。
// 合同：三档控件高度（--sw-control-h/-md/-sm：主输入 34 / 次级输入与折叠钮 26 /
// 徽标开关 20）定义于 _00 共享块（三容器）；核心消费点（主搜索框、预览查找输入、
// 预览头开关、折叠钮、快速选择器行、键盘映射行）必须引用 token，字面 px 零出现。
// 盒类豁免：同块 width 成对同值（图标盒/arc 圆环/图标按钮盒）与 p-media-grid
// 装饰 mock。检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

// 消费点合同：选择器签名 -> 必须引用的高度 token。
const CONSUMERS = [
    {file: '_03-switcher-mobile.scss', selector: '.sw__search {', token: '--sw-control-h)'},
    {file: '_03-switcher-mobile.scss', selector: '.sw__doc-preview-find-input {', token: '--sw-control-h-md)'},
    {file: '_03-switcher-mobile.scss', selector: '.sw__quick-action--collapse {', token: '--sw-control-h-md)'},
    {file: '_01-base-controls.scss', selector: 'min-height: var(--sw-control-h);', token: '--sw-control-h)'},
    {file: '_01-base-controls.scss', selector: 'min-height: var(--sw-control-h-md);', token: '--sw-control-h-md)'},
];

function findLiteralHeights(source, heights) {
    const hits = [];
    for (const h of heights) {
        // 左边界：排除 line-height 等复合属性
        const re = new RegExp(`(?<![\\w-])(?:min-height|height):\\s*${h}px`, 'g');
        let m;
        while ((m = re.exec(source)) !== null) hits.push({h, index: m.index});
    }
    return hits;
}

function blockAround(source, at) {
    return source.slice(source.lastIndexOf('{', at), source.indexOf('}', at) + 1);
}

test('detector self-check: literal control height is caught (negative verification)', () => {
    assert.equal(findLiteralHeights('.x { height: 34px; }', ['34']).length, 1);
    assert.equal(findLiteralHeights('.x { height: var(--sw-control-h); }', ['34']).length, 0);
});

test('control height tokens are defined on the shared block', () => {
    const tokens = read('_00-tokens.scss');
    const block = tokens.slice(tokens.indexOf('.speed-switch'), tokens.indexOf('--sw-control-h-sm'));
    assert.match(block, /\.sw-fab-root/, '共享块必须覆盖 .sw-fab-root（T-7201）');
    for (const token of ['--sw-control-h-sm: 20px', '--sw-control-h-md: 26px', '--sw-control-h: 34px']) {
        assert.ok(tokens.includes(token), `控件高度档 ${token} 必须定义`);
    }
});

test('core control consumers reference the height tokens', () => {
    for (const {file, selector, token} of CONSUMERS) {
        const source = read(file);
        assert.ok(source.includes(selector), `${file}: 消费点 ${selector.trim()} 必须存在`);
        assert.ok(source.includes(`var(${token}`), `${file}: ${selector.trim()} 必须引用 var(${token})`);
    }
});

test('retired literal control heights stay retired in the migrated slices', () => {
    // 格网/布局单元豁免：日历格等是布局约束，非控件高度
    const EXEMPT_SELECTORS = ['.sw__home-calendar-cell'];
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const source = read(f);
        const unexpected = findLiteralHeights(source, ['34', '26', '20']).filter(({h, index}) => {
            const block = blockAround(source, index);
            // 盒类豁免：同块 width 成对同值（图标盒/圆环/图标按钮盒）
            if (new RegExp(`width:\\s*${h}px`).test(block)) return false;
            // 装饰 mock 豁免：p-media-grid 等预览假象内容
            const lineStart = source.lastIndexOf('\n', index) + 1;
            const line = source.slice(lineStart, source.indexOf('\n', index));
            if (/p-media-grid/.test(line)) return false;
            // 选择器级豁免：布局约束单元
            const selContext = source.slice(source.lastIndexOf('}', index) + 1, index);
            if (EXEMPT_SELECTORS.some((sel) => selContext.includes(sel))) return false;
            return true;
        }).map(({h, index}) => `${h}px @${index}`);
        assert.deepEqual(unexpected, [], `${f}: 控件高度字面已退役为 token，禁止回归（${unexpected[0] || ''}）`);
    }
});
