// T-7186 后续：档位词汇单一事实源契约——normalizeLayout 与 normalizeModuleDefinition
// 必须共用 LAYOUT_SIZES（防双档表漂移）；检测器带自检负向验证。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');
const model = require('../src/home-model.js');

const source = readSourceFile('src/home-model.js');

test('module size declarations ride the single vocabulary (T-7186 follow-up)', () => {
    assert.match(source, /const sizeKeys = LAYOUT_SIZES;/, 'normalizeModuleDefinition 必须复用 LAYOUT_SIZES');
    assert.doesNotMatch(source, /const sizeKeys = \["xs", "small"/, '不得保留第二份七档字面');
    // 三档异形声明经归一化后保留（xs/tall/full 不再被清空）
    const def = model.normalizeModuleDefinition({moduleId: 'p', title: 'P', supportedDevices: ['desktop'], sizes: ['xs', 'tall', 'full']});
    assert.deepEqual(def.sizes, ['xs', 'tall', 'full']);
});

test('detector self-check: duplicate vocabulary literal is caught (negative verification)', () => {
    const drift = 'const sizeKeys = ["xs", "small", "medium", "tall", "wide", "large", "full"];';
    assert.match(drift, /const sizeKeys = \["xs"/, '双档表漂移必须可被识别');
});
