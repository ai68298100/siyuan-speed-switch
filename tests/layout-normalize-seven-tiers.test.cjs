// T-7186：布局档位归一化七档闭环——roundtrip + 负向自检（检测器注入退回四档必须失败）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');
const model = require('../src/home-model.js');

const SEVEN = ['xs', 'small', 'medium', 'tall', 'wide', 'large', 'full'];

test('layout normalize: all seven tiers survive a save/load roundtrip', () => {
    for (const size of SEVEN) {
        const layout = model.normalizeLayout({x: 1, y: 2, w: 4, h: 3, size});
        assert.equal(layout.size, size, `档位 ${size} 必须在归一化后保留`);
    }
});

test('layout normalize: invalid and missing sizes fall back safely', () => {
    assert.equal(model.normalizeLayout({size: 'huge'}).size, '');
    assert.equal(model.normalizeLayout({size: 42}).size, '');
    assert.equal(model.normalizeLayout({}).size, '');
    assert.equal(model.LAYOUT_SIZES.length, 7, '词汇表必须恰为七档');
    assert.deepEqual(model.LAYOUT_SIZES, SEVEN, '词汇表必须与生产七档一致');
});

test('layout normalize: home state roundtrip keeps seven-tier entries', () => {
    const state = {
        schemaVersion: 1,
        instances: [{instanceId: 'i1', moduleId: 'today-journal', enabled: true, config: {}}],
        layouts: {desktop: [{instanceId: 'i1', x: 0, y: 0, w: 2, h: 3, collapsed: false, size: 'full'}]},
    };
    const normalized = model.normalizeHomeState(state);
    const entry = (normalized.layouts.desktop || []).find((l) => l.instanceId === 'i1');
    assert.equal(entry && entry.size, 'full', '落盘回读后 full 档必须保留（历史被清空）');
});

test('detector self-check: legacy four-tier whitelist is caught (negative verification)', () => {
    const legacy = '    const size = ["small", "medium", "wide", "large"].includes(source.size) ? source.size : "";';
    assert.match(legacy, /\["small", "medium", "wide", "large"\]/, '四档白名单样例必须可被识别');
    const current = readSourceFile('src/home-model.js');
    assert.doesNotMatch(current, /\["small", "medium", "wide", "large"\]\.includes\(source\.size\)/,
        '归一化不得退回四档白名单（T-7186）');
});
