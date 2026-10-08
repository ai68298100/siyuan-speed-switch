// T-7209：动效语言门禁（blur 刻度 + duration 收口）。
// 合同：--sw-blur-sm/md/lg 三档定义于 _00 共享块；面板玻璃消费点必须引用档位；
// 皮肤 saturate 组合与 @supports 探测串豁免；transition 时长统一 $sw-dur-*，
// 唯一字面豁免是 reduced-motion 的 0.01ms 强制重置。检测器带注入自检。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styleDir = path.resolve(__dirname, '..', 'src', 'styles');
const read = (f) => fs.readFileSync(path.join(styleDir, f), 'utf8');

const CONSUMERS = [
    {file: '_03-switcher-mobile.scss', marker: 'backdrop-filter: var(--sw-blur-sm)'},
    {file: '_09-store-preview-polish.scss', marker: 'backdrop-filter: var(--sw-blur-md)'},
    {file: '_05-settings-widgets.scss', marker: 'backdrop-filter: var(--sw-blur-lg)'},
];

test('detector self-check: literal panel blur is caught (negative verification)', () => {
    const violation = '.x { backdrop-filter: blur(6px); }';
    assert.match(violation, /backdrop-filter:\s*blur\(\d+px\)/, '面板玻璃字面必须可被检测');
    const compliant = '.x { backdrop-filter: var(--sw-blur-md); }';
    assert.doesNotMatch(compliant, /backdrop-filter:\s*blur\(\d+px\)/, '档位形式不报');
});

test('blur tiers are defined on the shared block', () => {
    const tokens = read('_00-tokens.scss');
    const block = tokens.slice(tokens.indexOf('.speed-switch'), tokens.indexOf('--sw-blur-sm'));
    assert.match(block, /\.sw-fab-root/, '共享块必须覆盖 .sw-fab-root（T-7201）');
    for (const token of ['--sw-blur-sm: blur(4px)', '--sw-blur-md: blur(8px)', '--sw-blur-lg: blur(20px)']) {
        assert.ok(tokens.includes(token), `blur 档 ${token} 必须定义`);
    }
});

test('panel glass consumers reference the blur tiers', () => {
    for (const {file, marker} of CONSUMERS) {
        assert.ok(read(file).includes(marker), `${file}: ${marker} 必须存在（消费 blur 档位）`);
    }
});

test('non-skin literal panel blurs stay retired', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        if (f === '_10-skins.scss') continue; // 皮肤 saturate 组合是皮肤专属材质
        const source = read(f);
        const unexpected = [...source.matchAll(/backdrop-filter:\s*blur\(\d+px\)/g)]
            .filter((m) => {
                const lineStart = source.lastIndexOf('\n', m.index) + 1;
                const line = source.slice(lineStart, source.indexOf('\n', m.index));
                return !/@supports/.test(line); // 特性探测条件，非样式值
            })
            .map((m) => m[0]);
        assert.deepEqual(unexpected, [], `${f}: 面板玻璃 blur 字面已退役为档位，禁止回归（${unexpected[0] || ''}）`);
    }
});

test('transition durations stay on the $sw-dur ladder', () => {
    const files = fs.readdirSync(styleDir).filter((f) => f.endsWith('.scss'));
    for (const f of files) {
        const source = read(f);
        const literal = [...source.matchAll(/transition[^;:]*:\s*[^;]*?\b(\d+(?:\.\d+)?m?s)\b[^;]*;/g)]
            .map((m) => m[1])
            .filter((d) => d !== '0.01ms' && d !== '0.01s'); // reduced-motion 强制重置豁免
        assert.deepEqual(literal, [], `${f}: transition 时长必须走 $sw-dur-* 刻度（发现 ${literal.join(', ') || '无'}）`);
    }
});
