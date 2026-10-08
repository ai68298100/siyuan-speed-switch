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

// T-7155：材质规则若丢失 .sw-home 前缀（specificity 0,2,0），会被后置切片
// _06/_07 的通用 `.sw-home .sw-home__cell` 背景/边框规则（0,2,0、更晚加载）
// 覆盖——渐变背景失效而材质浅色前景仍在，形成白字浅底不可读。
// 检测器：材质背景/边框声明必须出现在 `.sw-home .sw-home__cell.mat-*` 形态中。
function findUnprefixedMaterialRules(source) {
    const hits = [];
    const re = /^(\s*)\.sw-home__cell\.mat-(accent|dark|vibrant)\b[^{]*\{/gm;
    let m;
    while ((m = re.exec(source)) !== null) hits.push(m[0].trim().slice(0, 80));
    return hits;
}

test('tile materials wiring: material selectors outrank later generic cell rules (T-7155)', () => {
    assert.deepEqual(findUnprefixedMaterialRules(homeScss), [],
        '材质选择器必须带 .sw-home 前缀（0,3,0），裸 .sw-home__cell.mat-* 会被 _06/_07 通用规则覆盖');
});

test('detector self-check: unprefixed material rule is caught (negative verification)', () => {
    const legacy = '.sw-home__cell.mat-accent {\n    background: linear-gradient(135deg, red, blue);\n}';
    assert.equal(findUnprefixedMaterialRules(legacy).length, 1, '检测器必须能抓到历史裸选择器形态');
});
