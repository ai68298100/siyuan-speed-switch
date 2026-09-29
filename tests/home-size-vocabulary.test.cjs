// T-7029 阶段二（ADR 0101）：档位词汇唯一性契约——七档词是唯一产品语义；
// 58 张规格卡必须带生产档位对照注记；展示层不得输出字母简写档位。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {readSourceFile} = require('./source-scan.cjs');

const SEVEN_TIERS = ['xs', 'small', 'medium', 'tall', 'wide', 'large', 'full'];
const SPEC_DIR = path.join(__dirname, '..', 'docs', 'design');

test('size vocabulary: constants type is exactly the seven tiers', () => {
    const constants = readSourceFile('src/constants.ts');
    assert.match(constants, /export type HomeWidgetSize = "xs" \| "small" \| "medium" \| "tall" \| "wide" \| "large" \| "full";/,
        '持久化词汇必须恒为七档（ADR 0101 D1，不做字母迁移）');
});

test('size vocabulary: display layer never emits letter-tier labels (ADR 0101 D3)', () => {
    for (const file of ['src/second-panel-ui.ts', 'src/home-store-ui.ts']) {
        const src = readSourceFile(file);
        assert.doesNotMatch(src, /(data-size|dataset\.size)\s*=\s*["'](S|M|L|X)["']/,
            `${file} 不得输出字母简写档位`);
        assert.doesNotMatch(src, /(data-size|dataset\.size)\s*=\s*["'](?!xs|small|medium|tall|wide|large|full)["']?/,
            `${file} 的尺寸标记只能来自七档词汇`);
        // 透传唯一形式：dataset.size 只能整体取归一化目录值（sizeKey），
        // 表达式改写（如按值映射字母）会被此处精确拦下。
        const sizeAssignments = src.match(/dataset\.size\s*=\s*[^;\n]+/g) || [];
        assert.ok(sizeAssignments.length >= 1, `${file} 必须存在尺寸标记赋值（检查面非空自检）`);
        const rewritten = sizeAssignments.filter((a) => !a.endsWith('= sizeKey'));
        assert.deepEqual(rewritten, [], `${file} 的 dataset.size 赋值必须透传 sizeKey，不得表达式改写：${rewritten.join(' | ')}`);
    }
});

test('size vocabulary: all nine spec cards carry the production-tier mapping note (ADR 0101 D2)', () => {
    const files = fs.readdirSync(SPEC_DIR).filter((f) => /^component-specs-0[1-9]-.*\.html$/.test(f));
    assert.equal(files.length, 9, '九个批次规格卡必须齐全');
    for (const file of files) {
        const html = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
        assert.ok(html.includes('生产档位对照（ADR 0101）'), `${file} 必须带生产档位对照注记`);
        assert.ok(html.includes('S→<code>small</code>'), `${file} 注记必须含映射表`);
    }
});

test('size vocabulary: widget protocol declares the seven-tier-only boundary (ADR 0101 D3)', () => {
    const protocol = fs.readFileSync(path.join(__dirname, '..', 'docs', 'widget-protocol.md'), 'utf8');
    assert.match(protocol, /词汇边界（ADR 0101）/, '协议必须声明词汇边界');
    assert.match(protocol, /仅接受上表七档词/, '协议必须显式拒绝字母简写');
    for (const tier of SEVEN_TIERS) {
        assert.ok(protocol.includes('`' + tier + '`'), `协议七档表必须含 ${tier}`);
    }
});
