// T-6971 批次④：打卡桥接系列契约——只读红线（能力全部 .read）、七模块清单冻结、
// 材质/默认档声明与规格卡一致、提供方未安装语义沿用。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile} = require('./source-scan.cjs');
const bridge = require('../src/checkin-bridge-model.js');
const homeModel = require('../src/home-model.js');

test('checkin bridge: every capability is read-only (write red line, ADR 0057)', () => {
    const capabilities = bridge.CHECKIN_CAPABILITIES || {};
    const ids = Object.keys(capabilities);
    assert.ok(ids.length >= 7, `桥接组件数 ${ids.length}`);
    for (const id of ids) {
        assert.match(String(capabilities[id]), /\.read$/, `${id} 能力必须是只读（得到 ${capabilities[id]}）`);
        assert.doesNotMatch(String(capabilities[id]), /write|update|delete|create|toggle/i, `${id} 不得出现写语义`);
    }
});

test('checkin bridge: the seven-module id list is frozen and complete', () => {
    assert.deepEqual([...bridge.CHECKIN_MODULE_IDS].sort(), [
        'checkin-monthly', 'checkin-occasions', 'checkin-streak', 'checkin-summary',
        'checkin-today', 'checkin-weekly', 'checkin-year-heatmap',
    ]);
    assert.equal(Object.isFrozen(bridge.CHECKIN_MODULE_IDS), true, '模块清单必须冻结');
});

test('checkin bridge: material and default-size declarations match the spec cards', () => {
    assert.equal(homeModel.resolveHomeTileMaterial('checkin-today'), 'accent');
    assert.equal(resolveHomeTileMaterialHome('checkin-streak'), 'accent');
    assert.equal(resolveHomeTileMaterialHome('checkin-weekly'), 'accent');
    assert.equal(resolveHomeTileMaterialHome('checkin-year-heatmap'), 'plain');
    function resolveHomeTileMaterialHome(id) { return homeModel.resolveHomeTileMaterial(id); }
    assert.equal(homeModel.resolveHomeTileDefaultSize('checkin-today', ['small', 'medium'], 'medium'), 'small');
    assert.equal(homeModel.resolveHomeTileDefaultSize('checkin-streak', ['small', 'medium', 'wide'], 'medium'), 'wide');
    assert.equal(homeModel.resolveHomeTileDefaultSize('checkin-year-heatmap', ['medium', 'wide', 'large', 'full'], 'medium'), 'large');
});

test('checkin bridge: store dependency copy states the read-only local bridge', () => {
    const storeModelSource = readSourceFile('src/home-store-model.js');
    assert.match(storeModelSource, /"checkin-today": Object\.freeze\(\{providerName: "小驴打卡", integration: "local-bridge", privacy: "local-only"\}\)/,
        '打卡组件依赖必须声明只读本机桥接');
    assert.match(storeModelSource, /安装并启用小驴打卡插件后本组件自动读取其公开生态 API/, '依赖说明必须表达只读桥接与安装指引');
});
