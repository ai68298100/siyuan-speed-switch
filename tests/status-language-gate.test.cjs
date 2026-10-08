// T-7205：跨表面状态语言门禁。
// 合同：状态语义色必须引用 --sw-platform-* 刻度（允许 var() 回退链落到
// --studio-*/--b3-theme-*），不得绕开平台语义变量直引裸色；状态徽标必须有
// 色点作为第二通道（平台原语与片段 studio badge 同构）。
// 检测器带注入自检（负向验证）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

// 从规则块文本中提取语义色声明，检查平台变量引用（var(--sw-platform- 前缀）。
// 声明形如 color: var(--sw-platform-error, var(--b3-theme-error)); 视为合规；
// color: var(--b3-theme-error);（无平台变量）违规。
function findNonPlatformSemanticColors(source, selectors) {
    const hits = [];
    for (const selector of selectors) {
        const idx = source.indexOf(selector);
        if (idx === -1) { hits.push(`${selector} -> 规则缺失`); continue; }
        const body = source.slice(idx, source.indexOf('}', idx) + 1);
        const colorDecls = body.match(/(?:color|border-color|background):\s*([^;]+);/g) || [];
        const semantic = colorDecls.filter((d) => /--b3-theme-(error|warning|primary|success)/.test(d) || /--studio-(error|warning|accent|success)/.test(d));
        const nonCompliant = semantic.filter((d) => !d.includes('--sw-platform-'));
        if (nonCompliant.length) hits.push(`${selector} -> ${nonCompliant.join(' | ')}`);
    }
    return hits;
}

test('detector self-check: bare theme color in status rule is caught (negative verification)', () => {
    const violation = '.sw__home-module-status--error {\n    color: var(--b3-theme-error);\n}';
    assert.equal(findNonPlatformSemanticColors(violation, ['.sw__home-module-status--error']).length, 1, '裸主题色必须命中');
    const compliant = '.sw__home-module-status--error {\n    color: var(--sw-platform-error, var(--b3-theme-error));\n}';
    assert.equal(findNonPlatformSemanticColors(compliant, ['.sw__home-module-status--error']).length, 0, '平台变量回退链不报');
});

test('status semantics route through the platform scale in every self-rendering surface', () => {
    const hits = [
        ...findNonPlatformSemanticColors(read('_05-settings-widgets.scss'),
            ['.sw__home-module-status--loading', '.sw__home-module-status--stale', '.sw__home-module-status--error']),
        ...findNonPlatformSemanticColors(read('_03-switcher-mobile.scss'),
            ['[data-status="loading"] .sw__home-module-status', '&--error']),
        ...findNonPlatformSemanticColors(read('_08-home-store-cards.scss'),
            ['.sw-home-store__catalog-fail']),
        ...findNonPlatformSemanticColors(read('_snippet-studio.scss'),
            ['&__state-badge.is-ready', '&__state-badge.is-loading', '&__state-badge.is-error', '&__state-badge.is-draft']),
    ];
    assert.deepEqual(hits, [], `状态语义色必须引用 --sw-platform-* 刻度（发现 ${hits.join(' | ') || '无'}）`);
});

test('status badges carry the dot as a second channel', () => {
    const shell = read('_platform-shell.scss');
    assert.match(shell, /\.sw-platform-status::before \{[\s\S]*?background: currentColor;/, '平台原语必须有 currentColor 色点');
    const studio = read('_snippet-studio.scss');
    assert.match(studio, /&__state-badge[\s\S]{0,400}?&::before \{ content: "";[\s\S]{0,200}?background: currentColor;/, '片段状态徽标必须有同构色点');
});
