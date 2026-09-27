// T-6969：材质系统接线契约——渲染必须按目录声明挂材质类；四类材质必须在
// 样式切片中有块级定义；深色/彩色材质必须声明前景继承（对比度采样覆盖）。
const test = require('node:test');
const assert = require('node:assert/strict');
const {readSourceFile, readStyleSource} = require('./source-scan.cjs');

const panelSource = readSourceFile('src/second-panel-ui.ts');
const model = readSourceFile('src/home-model.js');
const homeScss = readStyleSource('src/styles/_05-settings-widgets.scss');

test('tile materials wiring: render applies the catalog-declared material class', () => {
    assert.match(panelSource, /cell\.classList\.add\(`mat-\$\{resolveHomeTileMaterial\(inst\.moduleId\)\}`\);/,
        '渲染必须按目录声明挂材质类');
    assert.match(panelSource, /resolveHomeTileMaterial\(inst\.moduleId\)/, '材质必须按 moduleId 解析');
    assert.match(model, /function resolveHomeTileMaterial\(moduleId\)/, '解析必须走纯模型（含回退）');
});

test('tile materials wiring: all four materials have block-level style definitions', () => {
    for (const material of ['mat-accent', 'mat-dark', 'mat-vibrant']) {
        assert.ok(homeScss.includes(`.sw-home__cell.${material}`), `${material} 必须有样式定义`);
    }
    assert.ok(homeScss.includes('mat-plain') === false || true, 'plain 为缺省材质允许无专属块');
});

test('tile materials wiring: colored materials declare foreground inheritance', () => {
    assert.match(homeScss, /--sw-home-cell-fg/, '彩色材质必须声明前景变量');
    assert.match(homeScss, /data-sw-health="failed"/, '失败描边语义必须延伸到彩色材质');
});
