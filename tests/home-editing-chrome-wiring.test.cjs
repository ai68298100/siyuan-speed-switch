// T-6969 Slice 3：抖动编辑态 chrome 接线契约——编辑态网格类、摇摆动画与
// reduced-motion 降级、X 英雄约束必须在渲染路径生效。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile, readStyleSource} = require('./source-scan.cjs');

const panelSource = readSourceFile('src/second-panel-ui.ts');
const model = readSourceFile('src/home-model.js');
const homeScss = readStyleSource('src/styles/_05-settings-widgets.scss');

test('editing chrome wiring: edit mode toggles the editing grid class', () => {
    assert.match(panelSource, /grid\.classList\.toggle\("sw-home__grid--editing", editing\);/,
        '编辑态必须在网格上挂作用域类');
});

test('editing chrome wiring: wiggle animation with reduced-motion fallback', () => {
    assert.match(homeScss, /animation: sw-home-wiggle/, '抖动动画必须存在');
    assert.match(homeScss, /@media \(prefers-reduced-motion: reduce\)/, '必须有 reduced-motion 降级');
    assert.match(homeScss, /outline: 2px dashed/, '编辑态虚线描边');
});

test('editing chrome wiring: hero constraint runs in the render path', () => {
    assert.match(panelSource, /enforceHomeHeroConstraint\(layoutList\)/, '渲染必须执行 X 英雄约束');
    assert.match(panelSource, /this\.saveHomeState\(state\)/, '降级结果必须落盘');
    assert.match(model, /function enforceHomeHeroConstraint\(list\)/, '约束必须走纯模型');
});
